import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, resolveRequestOrigin, router } from "./_core/trpc";
import { isStorageConfigured, storageGetSignedUrl, storagePut } from "./storage";
import * as db from "./db";
import { requestEmailVerification, requestParentalConsent, requestPasswordReset, resetPasswordWithToken, verifyEmailToken } from "./accountSecurity";
import { LocalAuthError, hashPassword, loginLocalAccount, registerLocalAccount, verifyPassword } from "./localAuth";
import { sdk } from "./_core/sdk";
import { assertMinimumAge, MARKETPLACE_MIN_AGE, PLATFORM_MIN_AGE } from "./profileRules";
import { checkContent, checkMedia, computeAge, judgeReport } from "./aiModeration";
import { consumeRateLimit, getRateLimitKey } from "./rateLimit";
import { hashSessionToken, readCookie } from "./sessionSecurity";
import { verifyTotp } from "./twoFactor";
import { deleteTargetContent } from "./socket";

const mediaSchema = z.object({ url: z.string(), key: z.string().nullable().optional() });
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_DIRECT_MEDIA_BYTES = 40 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const chunkUploadId = z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/);

async function assembleChunkedUpload(userId: number, uploadId: string, chunkKeys: string[], totalChunks: number) {
  if (chunkKeys.length !== totalChunks) throw new TRPCError({ code: "BAD_REQUEST", message: "عدد قطع الرفع غير مكتمل." });
  const prefix = `vibracam/${userId}/chunks/${uploadId}/`;
  const parts: Buffer[] = [];
  let totalBytes = 0;
  for (const key of chunkKeys) {
    if (!key.startsWith(prefix)) throw new TRPCError({ code: "FORBIDDEN", message: "قطعة رفع غير صالحة." });
    const signedUrl = await storageGetSignedUrl(key);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "تعذر استرجاع إحدى قطع الرفع." });
    const part = Buffer.from(await response.arrayBuffer());
    totalBytes += part.length;
    if (totalBytes > MAX_MEDIA_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم الفيديو يتجاوز 200 ميغابايت." });
    parts.push(part);
  }
  return Buffer.concat(parts, totalBytes);
}

function hasValidFileSignature(bytes: Buffer, mimeType: string) {
  const ascii = bytes.subarray(0, 16).toString("ascii");
  const hex = bytes.subarray(0, 12).toString("hex").toLowerCase();
  if (mimeType === "image/png") return hex.startsWith("89504e470d0a1a0a");
  if (mimeType === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mimeType === "image/gif") return ascii.startsWith("GIF8");
  if (mimeType === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") return ascii.slice(4, 8) === "ftyp";
  if (mimeType === "video/webm" || mimeType === "audio/webm") return hex.startsWith("1a45dfa3");
  if (mimeType === "audio/mpeg") return ascii.startsWith("ID3") || hex.startsWith("fffb") || hex.startsWith("fff3");
  if (mimeType === "audio/ogg") return ascii.startsWith("OggS");
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE";
  return false;
}

function base32Encode(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function asTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "تعذر إتمام العملية." });
}

async function issueLocalSession(ctx: { req: { protocol?: string; headers: Record<string, string | string[] | undefined> }; res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void } }, user: { id: number; openId: string; name: string | null; username: string | null }) {
  const token = await sdk.createSessionToken(user.openId, { name: user.name || user.username || "VibraCam" });
  try {
    await db.createAuthSession({ userId: user.id, sessionHash: hashSessionToken(token), userAgent: typeof ctx.req.headers["user-agent"] === "string" ? ctx.req.headers["user-agent"].slice(0, 512) : null, expiresAt: new Date(Date.now() + ONE_YEAR_MS) });
  } catch (error) {
    console.error("[Auth] تعذر حفظ سجل جلسة الدخول؛ تم إيقاف إصدار الجلسة.", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء جلسة آمنة حاليًا." });
  }
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req as any), maxAge: ONE_YEAR_MS });
}

function currentSessionHash(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) {
  const cookie = typeof ctx.req.headers.cookie === "string" ? ctx.req.headers.cookie : undefined;
  const token = readCookie(cookie, COOKIE_NAME);
  return token ? hashSessionToken(token) : undefined;
}

function requestOrigin(origin: string) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "يجب استخدام HTTPS لمفاتيح المرور." });
  return parsed.origin;
}

function webAuthnRpId(origin: string) {
  return new URL(origin).hostname;
}

function parseTransports(value: string | null) {
  return value ? value.split(",").filter(Boolean) as any : undefined;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure.input(z.object({ firstName: z.string().trim().min(2, "أدخل الاسم الشخصي.").max(80), lastName: z.string().trim().min(2, "أدخل الاسم العائلي.").max(80), username: z.string().trim().min(3, "اسم المستخدم يجب أن يحتوي ثلاثة أحرف على الأقل.").max(64).regex(/^[a-zA-Z0-9_]+$/, "استخدم أحرفًا إنجليزية أو أرقامًا أو الشرطة السفلية فقط."), email: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا."), password: z.string().min(8, "كلمة المرور يجب أن تحتوي 8 أحرف على الأقل.").max(128), dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "أدخل تاريخ ميلاد صحيحًا."), country: z.string().trim().min(2, "اختر بلدك.").max(96), city: z.string().trim().min(2, "أدخل مدينتك.").max(120), timeZone: z.string().max(64).nullable().optional(), defaultCurrency: z.string().max(8).nullable().optional() })).mutation(async ({ ctx, input }) => {
      if (!consumeRateLimit(getRateLimitKey(ctx.req, `register:${input.email}`), 5, 15 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "محاولات التسجيل كثيرة. حاول لاحقًا." });
      try {
        const age = computeAge(input.dateOfBirth);
        if (age === null) throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ الميلاد غير صالح." });
        if (age < PLATFORM_MIN_AGE) {
          throw new TRPCError({ code: "FORBIDDEN", message: "يجب أن يكون عمرك 18 عامًا على الأقل لإنشاء حساب." });
        }
        const user = await registerLocalAccount(input);
        await requestEmailVerification(user.id, resolveRequestOrigin(ctx.req));
        await issueLocalSession(ctx, user);
        return { ...user, ageStatus: "adult", restriction: null };
      } catch (error) {
        if (error instanceof LocalAuthError) throw new TRPCError({ code: error.code === "INVALID_CREDENTIALS" ? "UNAUTHORIZED" : "CONFLICT", message: error.message });
        asTrpcError(error);
      }
    }),
    login: publicProcedure.input(z.object({ email: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا."), password: z.string().min(1, "أدخل كلمة المرور.").max(128), otp: z.string().length(6).optional() })).mutation(async ({ ctx, input }) => {
      if (!consumeRateLimit(getRateLimitKey(ctx.req, `login:${input.email}`), 8, 15 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "محاولات الدخول كثيرة. حاول بعد دقائق." });
      try {
        const user = await loginLocalAccount(input.email, input.password);
        const restriction = await db.getMinorRestriction(user.id);
        const twoFactor = await db.getTwoFactorAuthSecret(user.id);
        if (twoFactor?.enabled) {
          if (!twoFactor.secret || !input.otp || !verifyTotp(twoFactor.secret, input.otp)) throw new TRPCError({ code: "UNAUTHORIZED", message: "أدخل رمز المصادقة الثنائية الصحيح." });
        }
        await issueLocalSession(ctx, user);
        return { ...user, ageStatus: restriction ? "minor_pending_consent" : "adult", restriction };
      } catch (error) {
        if (error instanceof LocalAuthError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        asTrpcError(error);
      }
    }),
    requestEmailVerification: protectedProcedure.input(z.object({ origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      try { return await requestEmailVerification(ctx.user.id, input.origin); } catch (error) { asTrpcError(error); }
    }),
    verifyEmail: publicProcedure.input(z.object({ token: z.string().min(20).max(256) })).mutation(async ({ input }) => {
      try { await verifyEmailToken(input.token); return { success: true }; } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "رابط التأكيد غير صالح." }); }
    }),
    requestPasswordReset: publicProcedure.input(z.object({ email: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا."), origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      if (!consumeRateLimit(getRateLimitKey(ctx.req, `reset:${input.email}`), 5, 15 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "طلبات الاستعادة كثيرة. حاول لاحقًا." });
      try {
        await requestPasswordReset(input.email, input.origin);
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    resetPassword: publicProcedure.input(z.object({ token: z.string().min(20).max(256), password: z.string().min(8, "كلمة المرور يجب أن تحتوي 8 أحرف على الأقل.").max(128) })).mutation(async ({ input }) => {
      try { await resetPasswordWithToken(input.token, input.password); return { success: true }; } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "رابط إعادة التعيين غير صالح." }); }
    }),
    sessions: protectedProcedure.query(async ({ ctx }) => {
      const hash = currentSessionHash(ctx);
      const sessions = await db.listAuthSessions(ctx.user.id);
      return sessions.map(session => ({ ...session, current: session.sessionHash === hash }));
    }),
    revokeSession: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const sessions = await db.listAuthSessions(ctx.user.id);
      const target = sessions.find(session => session.id === input.sessionId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الجلسة غير موجودة." });
      await db.revokeAuthSession(ctx.user.id, input.sessionId);
      if (target.sessionHash === currentSessionHash(ctx)) ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true };
    }),
    revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
      const hash = currentSessionHash(ctx);
      if (!hash) throw new TRPCError({ code: "UNAUTHORIZED" });
      await db.revokeOtherAuthSessions(ctx.user.id, hash);
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const hash = currentSessionHash(ctx);
      if (hash) void db.revokeAuthSessionByHash(hash);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  passkeys: router({
    list: protectedProcedure.query(({ ctx }) => db.listPasskeys(ctx.user.id)),
    registerOptions: protectedProcedure.input(z.object({ origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      const origin = requestOrigin(input.origin);
      const rpID = webAuthnRpId(origin);
      const existing = await db.listPasskeys(ctx.user.id);
      const options = await generateRegistrationOptions({
        rpName: "VibraCam",
        rpID,
        userID: new Uint8Array(Buffer.from(String(ctx.user.id))),
        userName: ctx.user.email || ctx.user.username || ctx.user.openId,
        userDisplayName: ctx.user.name || ctx.user.username || "VibraCam user",
        attestationType: "none",
        excludeCredentials: existing.map(item => ({ id: item.credentialId, transports: parseTransports(item.transports) })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      await db.createPasskeyChallenge({ userId: ctx.user.id, flow: "registration", origin, challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60_000) });
      return options;
    }),
    registerVerify: protectedProcedure.input(z.object({ response: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
      const challenge = await db.getActivePasskeyChallenge(ctx.user.id, "registration");
      if (!challenge) throw new TRPCError({ code: "BAD_REQUEST", message: "انتهت جلسة تسجيل مفتاح المرور. ابدأ من جديد." });
      try {
        const verification = await verifyRegistrationResponse({ response: input.response as any, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin, expectedRPID: webAuthnRpId(challenge.origin), requireUserVerification: true });
        if (!verification.verified || !verification.registrationInfo) throw new TRPCError({ code: "BAD_REQUEST", message: "تعذر التحقق من مفتاح المرور." });
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        await db.createPasskey({ userId: ctx.user.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString("base64url"), counter: credential.counter, transports: credential.transports?.join(",") || null, deviceType: credentialDeviceType, backedUp: credentialBackedUp });
        await db.logAccountActivity(ctx.user.id, "registered_passkey", "passkey");
        return { verified: true };
      } finally {
        await db.consumePasskeyChallenge(challenge.id);
      }
    }),
    delete: protectedProcedure.input(z.object({ passkeyId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.deletePasskey(ctx.user.id, input.passkeyId); await db.logAccountActivity(ctx.user.id, "deleted_passkey", "passkey", input.passkeyId); return { success: true }; }),
    authenticationOptions: publicProcedure.input(z.object({ origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      if (!consumeRateLimit(getRateLimitKey(ctx.req, "passkey-options"), 10, 10 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "محاولات مفاتيح المرور كثيرة. حاول لاحقًا." });
      const origin = requestOrigin(input.origin);
      const options = await generateAuthenticationOptions({ rpID: webAuthnRpId(origin), userVerification: "required", allowCredentials: [] });
      await db.createPasskeyChallenge({ userId: 0, flow: "authentication", origin, challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60_000) });
      return options;
    }),
    authenticate: publicProcedure.input(z.object({ response: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
      const rawResponse = input.response.response as Record<string, unknown> | undefined;
      const clientDataJSON = typeof rawResponse?.clientDataJSON === "string" ? rawResponse.clientDataJSON : "";
      let clientChallenge = "";
      try { clientChallenge = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")).challenge || ""; } catch { /* يعالج كطلب غير صالح */ }
      const challenge = clientChallenge ? await db.getActivePasskeyChallengeByValue(clientChallenge, "authentication") : undefined;
      if (!challenge) throw new TRPCError({ code: "BAD_REQUEST", message: "انتهت جلسة الدخول بمفتاح المرور. ابدأ من جديد." });
      const passkey = await db.getPasskeyByCredentialId(String(input.response.id ?? ""));
      if (!passkey) { await db.consumePasskeyChallenge(challenge.id); throw new TRPCError({ code: "UNAUTHORIZED", message: "مفتاح المرور غير معروف." }); }
      try {
        const verification = await verifyAuthenticationResponse({ response: input.response as any, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin, expectedRPID: webAuthnRpId(challenge.origin), credential: { id: passkey.credentialId, publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")), counter: passkey.counter, transports: parseTransports(passkey.transports) }, requireUserVerification: true });
        if (!verification.verified) throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر التحقق من مفتاح المرور." });
        await db.updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);
        const user = await db.getUserById(passkey.userId);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "المستخدم غير موجود." });
        await issueLocalSession(ctx, user);
        return { ...user, passkey: true };
      } finally {
        await db.consumePasskeyChallenge(challenge.id);
      }
    }),
  }),
  accountCenter: router({
    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const [user, preferences, profileDetails, verification, latestVerificationRequest, twoFactor, apps, activity] = await Promise.all([
        db.getUserById(ctx.user.id), db.getAccountPreferences(ctx.user.id), db.getAccountProfileDetails(ctx.user.id), db.getAccountVerification(ctx.user.id), db.getLatestVerificationRequest(ctx.user.id), db.getTwoFactorStatus(ctx.user.id), db.listLinkedApps(ctx.user.id), db.listAccountActivity(ctx.user.id),
      ]);
      return { user, preferences, profileDetails, verification, latestVerificationRequest, twoFactor, apps, activity };
    }),
    updateProfileDetails: protectedProcedure.input(z.object({ workplace: z.string().max(160).nullable().optional(), education: z.string().max(200).nullable().optional(), residences: z.string().max(2000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const result = await db.updateAccountProfileDetails(ctx.user.id, input);
      await db.logAccountActivity(ctx.user.id, "updated_profile_details", "account");
      return result;
    }),
    updateEmail: protectedProcedure.input(z.object({ email: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا.") })).mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const current = await db.getUserById(ctx.user.id);
      if (current?.email?.toLowerCase() === email) return current;
      const existing = await db.getLocalAccountByEmail(email);
      if (existing && existing.user.id !== ctx.user.id) throw new TRPCError({ code: "CONFLICT", message: "هذا البريد مستخدم بالفعل." });
      const result = await db.updateAccountEmail(ctx.user.id, email);
      await db.logAccountActivity(ctx.user.id, "updated_email", "account");
      return result;
    }),
    deleteAccount: protectedProcedure.input(z.object({ currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية."), confirmation: z.literal("حذف حسابي", { error: "اكتب عبارة حذف حسابي للتأكيد." }) })).mutation(async ({ ctx, input }) => {
      const current = await db.getUserById(ctx.user.id);
      if (!current?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إعادة المصادقة بحساب محلي قبل حذف الحساب." });
      const account = await db.getLocalAccountByEmail(current.email);
      if (!account || !(await verifyPassword(input.currentPassword, account.credential.passwordHash))) throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة." });
      try {
        await db.deleteAccount(ctx.user.id);
        ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, "كلمة المرور يجب أن تحتوي 8 أحرف على الأقل.").max(128) })).mutation(async ({ ctx, input }) => {
      const current = await db.getUserById(ctx.user.id);
      if (!current?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد بريد محلي مرتبط بهذا الحساب." });
      const account = await db.getLocalAccountByEmail(current.email);
      if (!account || !(await verifyPassword(input.currentPassword, account.credential.passwordHash))) throw new TRPCError({ code: "BAD_REQUEST", message: "كلمة المرور الحالية غير صحيحة." });
      await db.updateLocalPassword(ctx.user.id, await hashPassword(input.newPassword));
      await db.revokeAllAuthSessions(ctx.user.id, currentSessionHash(ctx));
      await db.logAccountActivity(ctx.user.id, "changed_password", "security");
      return { success: true };
    }),
    preferences: router({
      get: protectedProcedure.query(({ ctx }) => db.getAccountPreferences(ctx.user.id)),
      update: protectedProcedure.input(z.object({ notifyEmail: z.boolean().optional(), notifyPhone: z.boolean().optional(), showReactionCounts: z.boolean().optional(), darkMode: z.boolean().optional(), translatePosts: z.boolean().optional(), friendRequestsScope: z.enum(["everyone", "followers", "no_one"]).optional(), searchByEmail: z.boolean().optional(), searchByPhone: z.boolean().optional(), defaultPostAudience: z.enum(["public", "followers", "private"]).optional(), defaultStoryAudience: z.enum(["public", "followers", "private"]).optional(), publicComments: z.boolean().optional(), publicFollowers: z.boolean().optional(), soundEnabled: z.boolean().optional(), lastSeenVisibility: z.enum(["everyone", "contacts", "no_one"]).optional(), onlineVisibility: z.enum(["everyone", "contacts", "no_one"]).optional(), readReceipts: z.boolean().optional(), groupAddPolicy: z.enum(["everyone", "contacts", "no_one"]).optional(), liveLocationSharing: z.boolean().optional(), securityNotifications: z.boolean().optional(), chatFontSize: z.enum(["small", "medium", "large"]).optional(), chatWallpaper: z.string().max(120).optional(), individualMessageTone: z.string().max(80).optional(), groupMessageTone: z.string().max(80).optional(), vibrationEnabled: z.boolean().optional(), notificationPreview: z.boolean().optional(), autoDownloadMedia: z.enum(["always", "wifi", "never"]).optional() })).mutation(async ({ ctx, input }) => { const result = await db.updateAccountPreferences(ctx.user.id, input); await db.logAccountActivity(ctx.user.id, "updated_preferences", "preferences"); return result; }),
    }),
    requestVerification: protectedProcedure.input(z.object({ requestType: z.enum(["identity", "creator", "business", "seller", "official"]).default("identity"), note: z.string().max(500).nullable().optional(), legalName: z.string().trim().max(180).nullable().optional(), country: z.string().trim().max(96).nullable().optional(), businessUrl: z.string().url().max(500).nullable().optional(), documentUrl: z.string().url().max(2000).nullable().optional(), selfieUrl: z.string().url().max(2000).nullable().optional() })).mutation(async ({ ctx, input }) => { const result = await db.requestAccountVerification(ctx.user.id, input.note, { requestType: input.requestType, legalName: input.legalName, country: input.country, businessUrl: input.businessUrl, documentUrl: input.documentUrl, selfieUrl: input.selfieUrl }); await db.logAccountActivity(ctx.user.id, "requested_identity_verification", "verification", undefined, { requestType: input.requestType }); return result; }),
    appealVerification: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), appealNote: z.string().trim().min(10, "اكتب تفاصيل الاستئناف بوضوح.").max(2000) })).mutation(async ({ ctx, input }) => { try { const result = await db.appealVerificationRequest(ctx.user.id, input.requestId, input.appealNote); if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "طلب التوثيق غير موجود." }); await db.logAccountActivity(ctx.user.id, "appealed_identity_verification", "verification", input.requestId, { reason: input.appealNote }); return result; } catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر إرسال الاستئناف." }); } }),
    politicalAds: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => { const result = await db.updatePoliticalAdsPreference(ctx.user.id, input.enabled); await db.logAccountActivity(ctx.user.id, "updated_political_ads_preference", "verification"); return result; }),
    twoFactor: router({
      status: protectedProcedure.query(({ ctx }) => db.getTwoFactorStatus(ctx.user.id)),
      setup: protectedProcedure.mutation(async ({ ctx }) => { const secret = base32Encode(randomBytes(20)); const result = await db.saveTwoFactorSetup(ctx.user.id, secret); const issuer = "VibraCam"; const email = encodeURIComponent(ctx.user.email || "account"); return { ...result, secret, otpauthUrl: `otpauth://totp/${issuer}:${email}?secret=${secret}&issuer=${issuer}` }; }),
      confirm: protectedProcedure.input(z.object({ otp: z.string().regex(/^\\d{6}$/, "أدخل رمزًا من 6 أرقام.") })).mutation(async ({ ctx, input }) => { const setup = await db.getTwoFactorAuthSecret(ctx.user.id); if (!setup?.secret || !verifyTotp(setup.secret, input.otp)) throw new TRPCError({ code: "BAD_REQUEST", message: "رمز المصادقة غير صحيح." }); const result = await db.enableTwoFactor(ctx.user.id); await db.logAccountActivity(ctx.user.id, "enabled_two_factor", "security"); return result; }),
      disable: protectedProcedure.mutation(async ({ ctx }) => { const result = await db.disableTwoFactor(ctx.user.id); await db.logAccountActivity(ctx.user.id, "disabled_two_factor", "security"); return result; }),
    }),
    apps: router({
      list: protectedProcedure.query(({ ctx }) => db.listLinkedApps(ctx.user.id)),
      revoke: protectedProcedure.input(z.object({ appId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.revokeLinkedApp(ctx.user.id, input.appId); await db.logAccountActivity(ctx.user.id, "revoked_linked_app", "app", input.appId); return { success: true }; }),
    }),
    activity: protectedProcedure.query(({ ctx }) => db.listAccountActivity(ctx.user.id)),
    downloadInfo: protectedProcedure.query(async ({ ctx }) => db.exportAccountData(ctx.user.id)),
  }),
  media: router({
    upload: protectedProcedure
      .input(z.object({ base64: z.string().min(1), mimeType: z.string().regex(/^(image|video|audio)\/[a-z0-9.+-]+$/i), fileName: z.string().min(1).max(120), kind: z.enum(["avatar", "cover", "post", "story", "reel", "product", "message", "group"]) }))
      .mutation(async ({ ctx, input }) => {
        if (!consumeRateLimit(getRateLimitKey(ctx.req, "media-upload"), 30, 15 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "طلبات الرفع كثيرة. حاول لاحقًا." });
        try {
          const bytes = Buffer.from(input.base64, "base64");
          if (!bytes.length || bytes.length > MAX_DIRECT_MEDIA_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "الرفع المباشر يقبل ملفات حتى 40 ميغابايت؛ استخدم الرفع المجزأ للفيديو الأكبر." });
          if (!hasValidFileSignature(bytes, input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الملف لا يطابق محتواه الفعلي." });
          if (input.mimeType.startsWith("image/")) {
            const moderation = await checkMedia(input.base64, input.mimeType);
            await db.createModerationCheck({ userId: ctx.user.id, contentType: input.kind === "product" ? "product" : input.kind === "message" ? "message" : input.kind === "group" ? "groupPost" : input.kind === "story" ? "story" : input.kind === "reel" ? "reel" : "post", contentId: -1, contentPreview: input.fileName.slice(0, 180), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: moderation.shouldBlock ? "blocked" : "allowed" }).catch(() => undefined);
            if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر رفع الصورة: ${moderation.reason}` });
          }
          const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `vibracam/${ctx.user.id}/${input.kind}/${Date.now()}-${safeName}`;
          return await storagePut(key, bytes, input.mimeType);
        } catch (error) {
          asTrpcError(error);
        }
      }),
    uploadChunk: protectedProcedure
      .input(z.object({ uploadId: chunkUploadId, chunkIndex: z.number().int().min(0), totalChunks: z.number().int().min(1).max(64), chunkBase64: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (input.chunkIndex >= input.totalChunks) throw new TRPCError({ code: "BAD_REQUEST", message: "ترتيب قطعة الرفع غير صالح." });
        const bytes = Buffer.from(input.chunkBase64, "base64");
        if (!bytes.length || bytes.length > UPLOAD_CHUNK_BYTES + 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "قطعة الرفع كبيرة جدًا." });
        const stored = await storagePut(`vibracam/${ctx.user.id}/chunks/${input.uploadId}/${input.chunkIndex}.part`, bytes, "application/octet-stream");
        return { received: input.chunkIndex + 1, totalChunks: input.totalChunks, key: stored.key };
      }),
    completeChunked: protectedProcedure
      .input(z.object({ uploadId: chunkUploadId, totalChunks: z.number().int().min(1).max(64), chunkKeys: z.array(z.string().min(1)).min(1).max(64), mimeType: z.string().regex(/^(video)\/[a-z0-9.+-]+$/i), fileName: z.string().min(1).max(120), kind: z.enum(["post", "story", "reel", "product", "message", "group"]) }))
      .mutation(async ({ ctx, input }) => {
        if (!consumeRateLimit(getRateLimitKey(ctx.req, "media-upload-complete"), 10, 15 * 60_000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "طلبات رفع الفيديو كثيرة. حاول لاحقًا." });
        const bytes = await assembleChunkedUpload(ctx.user.id, input.uploadId, input.chunkKeys, input.totalChunks);
        if (!hasValidFileSignature(bytes, input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الفيديو لا يطابق محتواه الفعلي." });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        return await storagePut(`vibracam/${ctx.user.id}/${input.kind}/${Date.now()}-${safeName}`, bytes, input.mimeType);
      }),
  }),
  profile: router({
    mine: protectedProcedure.query(({ ctx }) => db.getProfileWithCounts(ctx.user.id, ctx.user.id)),
    byId: publicProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => db.getProfileWithCounts(input.userId, ctx.user?.id)),
    update: protectedProcedure.input(z.object({ firstName: z.string().trim().min(2).max(80).optional(), lastName: z.string().trim().min(2).max(80).optional(), name: z.string().trim().min(2).max(160).optional(), username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/).optional(), bio: z.string().max(500).optional(), country: z.string().max(96).optional(), city: z.string().max(120).optional(), dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).nullable().optional(), phoneNumber: z.string().max(32).nullable().optional(), websiteUrl: z.string().url("أدخل رابط موقع صحيحًا.").max(500).nullable().optional(), socialLinks: z.string().max(2000).nullable().optional(), timeZone: z.string().max(64).nullable().optional(), defaultCurrency: z.string().max(8).nullable().optional(), avatarUrl: z.string().nullable().optional(), avatarKey: z.string().nullable().optional(), coverUrl: z.string().nullable().optional(), coverKey: z.string().nullable().optional(), interestIds: z.array(z.number().int().positive()).max(12).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const { interestIds, ...profile } = input;
        if (profile.dateOfBirth) assertMinimumAge(profile.dateOfBirth, PLATFORM_MIN_AGE, "يجب أن يكون عمرك 18 عامًا على الأقل.");
        if (profile.firstName || profile.lastName) {
          const current = await db.getUserById(ctx.user.id);
          profile.name = `${profile.firstName ?? current?.firstName ?? ""} ${profile.lastName ?? current?.lastName ?? ""}`.trim();
        }
        const result = await db.updateProfile(ctx.user.id, profile);
        if (interestIds) await db.setUserInterests(ctx.user.id, interestIds);
        return result;
      } catch (error) { asTrpcError(error); }
    }),
    followers: publicProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => db.listFollowers(input.userId, ctx.user?.id)),
    following: publicProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => db.listFollowing(input.userId, ctx.user?.id)),
  }),
  privacy: router({
    mine: protectedProcedure.query(({ ctx }) => db.getPrivacySettings(ctx.user.id)),
    update: protectedProcedure.input(z.object({ profileVisibility: z.enum(["public", "followers", "private"]).optional(), showCity: z.boolean().optional(), showWebsite: z.boolean().optional(), showSocialLinks: z.boolean().optional(), showFollowers: z.boolean().optional(), showFollowing: z.boolean().optional(), showPosts: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      try { return await db.updatePrivacySettings(ctx.user.id, input); } catch (error) { asTrpcError(error); }
    }),
  }),
  safety: router({
    blockedUsers: protectedProcedure.query(({ ctx }) => db.listBlockedUsers(ctx.user.id)),
    block: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.blockUser(ctx.user.id, input.userId); return { blocked: true }; } catch (error) { asTrpcError(error); }
    }),
    unblock: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.unblockUser(ctx.user.id, input.userId); return { blocked: false }; } catch (error) { asTrpcError(error); }
    }),
    report: protectedProcedure.input(z.object({ targetType: z.enum(["user", "post", "product", "message"]), targetId: z.number().int().positive(), reason: z.enum(["spam", "harassment", "blackmail", "inappropriate_content", "fraud", "phishing", "counterfeit", "hate_speech", "violence", "impersonation", "fake_account", "misinformation", "copyright", "trademark", "technical_issue", "malicious_reporting", "other"]), details: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const reportId = await db.createReport({ reporterId: ctx.user.id, ...input });
        // فحص فوري بالذكاء الاصطناعي: المحتوى الإباحي/الصريح يُحذف تلقائيًا دون انتظار المعالجة الدورية
        try {
          let targetContent: string | null = null;
          if (input.targetType === "post") { const post = await db.getPostById(input.targetId); targetContent = post?.content ?? null; }
          else if (input.targetType === "message") { const message = await db.getMessageById(input.targetId); targetContent = message?.content ?? null; }
          else if (input.targetType === "product") { const product = await db.getProductById(input.targetId); targetContent = product ? [product.title, product.description ?? ""].filter(Boolean).join(" | ") : null; }
          const judgment = await judgeReport({ reason: input.reason, details: input.details ?? null, targetContent, authorName: null, authorBio: null });
          if (judgment.verdict === "substantiated" && judgment.action === "delete") {
            if (input.targetType === "post") await db.forceDeletePost(input.targetId);
            else if (input.targetType === "product") await db.forceDeleteProduct(input.targetId);
            else if (input.targetType === "message") await db.deleteMessage(input.targetId);
            await db.resolveReport(reportId, { status: "reviewed", moderatedBy: "ai", aiVerdict: judgment.verdict, aiConfidence: Math.round(judgment.confidence * 100), actionTaken: "delete", resolutionDetails: judgment.summary }).catch(() => undefined);
            return { success: true, autoAction: "deleted" as const };
          }
        } catch (error) {
          console.warn("[Safety] تعذر الفحص الفوري للبلاغ؛ سيُعالج دوريًا.", error);
        }
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  discover: router({
    users: publicProcedure.input(z.object({ query: z.string().max(80).default(""), interestIds: z.array(z.number().int().positive()).default([]) })).query(({ input }) => db.searchUsers(input.query, input.interestIds)),
    interests: publicProcedure.query(() => db.listInterests()),
  }),
  follows: router({
    follow: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        if (await db.isUserBlockedBetween(ctx.user.id, input.userId)) throw new Error("لا يمكنك متابعة هذا الحساب.");
        const created = await db.followUser(ctx.user.id, input.userId);
        if (created) await db.createNotification({ userId: input.userId, actorId: ctx.user.id, type: "follow", message: "بدأ بمتابعتك" });
        return { following: true };
      } catch (error) { asTrpcError(error); }
    }),
    unfollow: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await db.unfollowUser(ctx.user.id, input.userId);
      return { following: false };
    }),
  }),
  friendRequests: router({
    status: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => db.getFriendRequestStatus(ctx.user.id, input.userId)),
    incoming: protectedProcedure.query(({ ctx }) => db.listIncomingFriendRequests(ctx.user.id)),
    outgoing: protectedProcedure.query(({ ctx }) => db.listOutgoingFriendRequests(ctx.user.id)),
    send: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { const preferences = await db.getAccountPreferences(input.userId); if (preferences.friendRequestsScope === "no_one") throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب لا يستقبل طلبات صداقة حاليًا." }); if (preferences.friendRequestsScope === "followers" && !(await db.isFollowingUser(ctx.user.id, input.userId))) throw new TRPCError({ code: "FORBIDDEN", message: "يقبل هذا الحساب طلبات الصداقة من المتابعين فقط." }); const request = await db.createFriendRequest(ctx.user.id, input.userId); await db.createNotification({ userId: input.userId, actorId: ctx.user.id, type: "follow", message: "أرسل لك طلب صداقة" }); return { success: true, request }; } catch (error) { asTrpcError(error); } }),
    accept: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { const result = await db.respondToFriendRequest(ctx.user.id, input.requestId, "accepted"); if (result.senderId) await db.createNotification({ userId: result.senderId, actorId: ctx.user.id, type: "follow", entityId: input.requestId, message: "قبل طلب صداقتك" }); return { success: true, ...result }; } catch (error) { asTrpcError(error); } }),
    reject: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { const result = await db.respondToFriendRequest(ctx.user.id, input.requestId, "rejected"); return { success: true, ...result }; } catch (error) { asTrpcError(error); } }),
    cancel: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.cancelFriendRequest(ctx.user.id, input.requestId); return { success: true }; }),
    remove: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.removeFriend(ctx.user.id, input.userId); return { success: true }; }),
  }),
  posts: router({
    feed: publicProcedure.input(z.object({ userId: z.number().int().positive().optional(), cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(20), feedType: z.enum(["all", "following"]).default("all") })).query(({ ctx, input }) => db.listFeed(ctx.user?.id, input.userId, input.cursor, input.limit, input.feedType)),
    create: protectedProcedure.input(z.object({ content: z.string().min(1).max(2000), mediaUrl: z.string().nullable().optional(), mediaKey: z.string().nullable().optional(), mediaType: z.enum(["image", "video"]).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try {
        if (input.content.trim()) {
          const moderation = await checkContent(input.content.trim());
          if (moderation.shouldBlock) {
            await db.createModerationCheck({ userId: ctx.user.id, contentType: "post", contentId: -1, contentPreview: input.content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "blocked" }).catch(() => undefined);
            throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر المنشور: ${moderation.reason}` });
          }
        }
        const post = await db.createPost({ userId: ctx.user.id, ...input });
        if (input.content.trim() && post?.id) await db.createModerationCheck({ userId: ctx.user.id, contentType: "post", contentId: post.id, contentPreview: input.content.trim().slice(0, 500), verdict: "safe", actionTaken: "allowed" }).catch(() => undefined);
        return post;
      } catch (error) { asTrpcError(error); }
    }),
    update: protectedProcedure.input(z.object({ postId: z.number().int().positive(), content: z.string().min(1).max(2000), mediaUrl: z.string().url().nullable().optional(), mediaKey: z.string().nullable().optional(), mediaType: z.enum(["image", "video"]).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try { const { postId, ...post } = input; return await db.updatePost(postId, ctx.user.id, post); } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.deletePost(input.postId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    toggleLike: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const result = await db.toggleLike(input.postId, ctx.user.id);
        const post = await db.getPostById(input.postId);
        if (result.liked && post) await db.createNotification({ userId: post.userId, actorId: ctx.user.id, type: "like", entityId: input.postId, message: "أعجب بمنشورك" });
        return result;
      } catch (error) { asTrpcError(error); }
    }),
    share: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { const created = await db.sharePost(input.postId, ctx.user.id); const post = await db.getPostById(input.postId); if (created && post) await db.createNotification({ userId: post.userId, actorId: ctx.user.id, type: "share", entityId: input.postId, message: "شارك منشورك" }); return { success: true, created }; } catch (error) { asTrpcError(error); }
    }),
    comments: publicProcedure.input(z.object({ postId: z.number().int().positive() })).query(({ input }) => db.listComments(input.postId)),
    addComment: protectedProcedure.input(z.object({ postId: z.number().int().positive(), content: z.string().min(1).max(600) })).mutation(async ({ ctx, input }) => {
      try {
        const moderation = await checkContent(input.content.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر التعليق: ${moderation.reason}` });
        const id = await db.addComment(input.postId, ctx.user.id, input.content);
        await db.createModerationCheck({ userId: ctx.user.id, contentType: "comment", contentId: id, contentPreview: input.content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" }).catch(() => undefined);
        const post = await db.getPostById(input.postId);
        if (post?.userId) await db.createNotification({ userId: post.userId, actorId: ctx.user.id, type: "comment", entityId: input.postId, message: "علّق على منشورك" });
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  messages: router({
    inbox: protectedProcedure.query(({ ctx }) => db.listUnifiedMessageInbox(ctx.user.id)),
    conversations: protectedProcedure.query(({ ctx }) => db.listConversations(ctx.user.id)),
    list: protectedProcedure.input(z.object({ peerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await db.markConversationRead(ctx.user.id, input.peerId);
      return db.listMessages(ctx.user.id, input.peerId);
    }),
    send: protectedProcedure.input(z.object({ receiverId: z.number().int().positive(), content: z.string().max(2000).default(""), kind: z.enum(["text", "gif", "sticker", "audio"]).default("text"), mediaUrl: z.string().url().nullable().optional(), mediaKey: z.string().nullable().optional(), replyToId: z.number().int().positive().nullable().optional() }).refine(input => Boolean(input.content.trim() || input.mediaUrl), { message: "أدخل رسالة أو اختر وسائط." })).mutation(async ({ ctx, input }) => {
      try {
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل إرسال الرسائل." : "هذا الحساب معلّق ولا يمكنه إرسال الرسائل." });
        if (ctx.user.id === input.receiverId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك إرسال رسالة إلى حسابك الشخصي." });
        if (!(await db.getUserById(input.receiverId))) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
        if (await db.isUserBlockedBetween(ctx.user.id, input.receiverId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك مراسلة هذا الحساب." });
        const moderation = input.content.trim() ? await checkContent(input.content.trim()) : null;
        if (moderation?.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر إرسال الرسالة: ${moderation.reason}` });
        const message = await db.saveMessage(ctx.user.id, input.receiverId, input.content.trim(), { kind: input.kind, mediaUrl: input.mediaUrl, mediaKey: input.mediaKey }, input.replyToId);
        if (moderation) await db.createModerationCheck({ userId: ctx.user.id, contentType: "message", contentId: message.id, contentPreview: input.content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" }).catch(() => undefined);
        await db.createNotification({ userId: input.receiverId, actorId: ctx.user.id, type: "message", entityId: message.id, message: "أرسل لك رسالة جديدة" });
        return message;
      } catch (error) { asTrpcError(error); }
    }),
    edit: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), content: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => { try { return await db.updateDirectMessage(input.messageId, ctx.user.id, input.content); } catch (error) { asTrpcError(error); } }),
    delete: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), confirmation: z.literal(true) })).mutation(async ({ ctx, input }) => { try { return await db.deleteDirectMessage(input.messageId, ctx.user.id); } catch (error) { asTrpcError(error); } }),
    toggleReaction: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), emoji: z.string().min(1).max(24) })).mutation(async ({ ctx, input }) => {
      try { return await db.toggleMessageReaction(input.messageId, ctx.user.id, input.emoji); } catch (error) { asTrpcError(error); }
    }),
  }),
  chatGroups: router({
    list: protectedProcedure.query(({ ctx }) => db.listChatGroups(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), memberIds: z.array(z.number().int().positive()).max(100) })).mutation(async ({ ctx, input }) => {
      try { return { id: await db.createChatGroup(ctx.user.id, input.name, input.memberIds) }; } catch (error) { asTrpcError(error); }
    }),
    details: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try { return await db.getChatGroupById(input.chatGroupId, ctx.user.id); } catch (error) { asTrpcError(error); }
    }),
    messages: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try { return await db.listChatGroupMessages(input.chatGroupId, ctx.user.id); } catch (error) { asTrpcError(error); }
    }),
    update: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), avatarUrl: z.string().url().nullable().optional(), avatarKey: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => {
      try { const { chatGroupId, ...changes } = input; await db.updateChatGroup(chatGroupId, ctx.user.id, changes); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    addMember: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.addChatGroupMember(input.chatGroupId, ctx.user.id, input.userId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    removeMember: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.removeChatGroupMember(input.chatGroupId, ctx.user.id, input.memberId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    setMemberRole: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), memberId: z.number().int().positive(), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
      try { await db.setChatGroupMemberRole(input.chatGroupId, ctx.user.id, input.memberId, input.role); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    transferOwnership: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), newOwnerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.transferChatGroupOwnership(input.chatGroupId, ctx.user.id, input.newOwnerId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    leave: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.leaveChatGroup(input.chatGroupId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.deleteChatGroup(input.chatGroupId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    send: protectedProcedure.input(z.object({ chatGroupId: z.number().int().positive(), content: z.string().max(2000).default(""), kind: z.enum(["text", "gif", "sticker", "audio"]).default("text"), mediaUrl: z.string().url().nullable().optional(), mediaKey: z.string().nullable().optional(), replyToId: z.number().int().positive().nullable().optional() }).refine(input => Boolean(input.content.trim() || input.mediaUrl), { message: "أدخل رسالة أو اختر وسائط." })).mutation(async ({ ctx, input }) => {
      try {
        if (input.content.trim()) {
          const moderation = await checkContent(input.content.trim());
          if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر إرسال الرسالة: ${moderation.reason}` });
        }
        const id = await db.sendChatGroupMessage({ senderId: ctx.user.id, ...input });
        if (input.content.trim()) await db.createModerationCheck({ userId: ctx.user.id, contentType: "chatGroupMessage", contentId: id, contentPreview: input.content.trim().slice(0, 500), verdict: "safe", actionTaken: "allowed" }).catch(() => undefined);
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
    editMessage: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), content: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => { try { return await db.updateChatGroupMessage(input.messageId, ctx.user.id, input.content); } catch (error) { asTrpcError(error); } }),
    deleteMessage: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), confirmation: z.literal(true) })).mutation(async ({ ctx, input }) => { try { return await db.deleteChatGroupMessage(input.messageId, ctx.user.id); } catch (error) { asTrpcError(error); } }),
  }),
  notifications: router({
    list: protectedProcedure.query(({ ctx }) => db.listNotifications(ctx.user.id)),
    read: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.markNotificationRead(ctx.user.id, input.notificationId); return { success: true }; }),
    readAll: protectedProcedure.mutation(async ({ ctx }) => { await db.markAllNotificationsRead(ctx.user.id); return { success: true }; }),
  }),
  stories: router({
    list: publicProcedure.query(() => db.listStories()),
    create: protectedProcedure.input(z.object({ mediaUrl: z.string(), mediaKey: z.string().nullable().optional(), mediaType: z.enum(["image", "video"]), caption: z.string().max(320).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try {
        if (input.caption?.trim()) {
          const moderation = await checkContent(input.caption.trim());
          if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر القصة: ${moderation.reason}` });
          await db.createModerationCheck({ userId: ctx.user.id, contentType: "story", contentId: -1, contentPreview: input.caption.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: moderation.shouldBlock ? "blocked" : "allowed" }).catch(() => undefined);
        }
        await db.createStory({ userId: ctx.user.id, ...input });
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  reels: router({
    list: publicProcedure.input(z.object({ userId: z.number().int().positive().optional() }).default({})).query(({ ctx, input }) => db.listReels(ctx.user?.id, input.userId)),
    create: protectedProcedure.input(z.object({ videoUrl: z.string(), videoKey: z.string().nullable().optional(), caption: z.string().max(500).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try {
        if (input.caption?.trim()) {
          const moderation = await checkContent(input.caption.trim());
          if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر الريل: ${moderation.reason}` });
          await db.createModerationCheck({ userId: ctx.user.id, contentType: "reel", contentId: -1, contentPreview: input.caption.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: moderation.shouldBlock ? "blocked" : "allowed" }).catch(() => undefined);
        }
        await db.createReel({ userId: ctx.user.id, ...input });
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    toggleLike: protectedProcedure.input(z.object({ reelId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const result = await db.toggleReelLike(input.reelId, ctx.user.id);
        const reel = await db.getReelById(input.reelId);
        if (result.liked && reel) await db.createNotification({ userId: reel.userId, actorId: ctx.user.id, type: "like", entityId: input.reelId, message: "أعجب بالريل الخاص بك" });
        return result;
      } catch (error) { asTrpcError(error); }
    }),
    view: protectedProcedure.input(z.object({ reelId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { return await db.recordReelView(input.reelId, ctx.user.id); } catch (error) { asTrpcError(error); }
    }),
  }),
  groups: router({
    list: publicProcedure.query(({ ctx }) => db.listGroups(ctx.user?.id)),
    byId: publicProcedure.input(z.object({ groupId: z.number().int().positive() })).query(({ ctx, input }) => db.getGroupById(input.groupId, ctx.user?.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(120), slug: z.string().trim().min(3).max(140).regex(/^[a-zA-Z0-9-]+$/), description: z.string().max(1000).nullable().optional(), privacy: z.enum(["public", "private"]), avatarUrl: z.string().url().nullable().optional(), avatarKey: z.string().nullable().optional(), coverUrl: z.string().url().nullable().optional(), coverKey: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => {
      try { return { id: await db.createGroup({ ownerId: ctx.user.id, ...input }) }; } catch (error) { asTrpcError(error); }
    }),
    update: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), name: z.string().trim().min(3).max(120).optional(), slug: z.string().trim().min(3).max(140).regex(/^[a-zA-Z0-9-]+$/).optional(), description: z.string().max(1000).nullable().optional(), privacy: z.enum(["public", "private"]).optional(), avatarUrl: z.string().url().nullable().optional(), avatarKey: z.string().nullable().optional(), coverUrl: z.string().url().nullable().optional(), coverKey: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => {
      try { const { groupId, ...changes } = input; return db.updateGroup(groupId, ctx.user.id, changes); } catch (error) { asTrpcError(error); }
    }),
    join: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { return { status: await db.joinGroup(input.groupId, ctx.user.id) }; } catch (error) { asTrpcError(error); }
    }),
    cancelJoin: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.cancelGroupJoin(input.groupId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    leave: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.leaveGroup(input.groupId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    members: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const group = await db.getGroupById(input.groupId, ctx.user.id); if (!group || group.restricted || group.membership?.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "انضم إلى المجموعة لعرض أعضائها." }); return db.listGroupMembers(input.groupId);
    }),
    approveMember: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.approveGroupMember(input.groupId, ctx.user.id, input.memberId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    rejectMember: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.rejectGroupMember(input.groupId, ctx.user.id, input.memberId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    removeMember: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.removeGroupMember(input.groupId, ctx.user.id, input.memberId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    setMemberRole: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), memberId: z.number().int().positive(), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
      try { await db.setGroupMemberRole(input.groupId, ctx.user.id, input.memberId, input.role); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    transferOwnership: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), newOwnerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.transferGroupOwnership(input.groupId, ctx.user.id, input.newOwnerId); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.deleteGroup(input.groupId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    posts: publicProcedure.input(z.object({ groupId: z.number().int().positive() })).query(({ ctx, input }) => db.listGroupPosts(input.groupId, ctx.user?.id)),
    createPost: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), content: z.string().trim().min(1).max(2000), mediaUrl: z.string().url().nullable().optional(), mediaKey: z.string().nullable().optional(), mediaType: z.enum(["image", "video"]).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try {
        const moderation = await checkContent(input.content.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر المنشور: ${moderation.reason}` });
        const id = await db.createGroupPost({ userId: ctx.user.id, ...input });
        await db.createModerationCheck({ userId: ctx.user.id, contentType: "groupPost", contentId: id, contentPreview: input.content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" }).catch(() => undefined);
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  calls: router({
    history: protectedProcedure.query(({ ctx }) => db.listUserCalls(ctx.user.id)),
  }),
  randomCall: router({
    myQueue: protectedProcedure.query(({ ctx }) => db.getQueueEntry(ctx.user.id)),
    leave: protectedProcedure.mutation(async ({ ctx }) => {
      await db.leaveRandomCallQueue(ctx.user.id);
      return { success: true };
    }),
  }),
  live: router({
    list: publicProcedure.query(({ ctx }) => db.listLiveStreams(ctx.user?.id)),
    byId: publicProcedure.input(z.object({ streamId: z.number().int().positive() })).query(({ ctx, input }) => db.getLiveStreamById(input.streamId, ctx.user?.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(2).max(200) })).mutation(async ({ ctx, input }) => {
      try {
        const existing = await db.getUserLiveStream(ctx.user.id);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "لديك بث مباشر نشط حاليًا." });
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل استخدام البث المباشر." : "هذا الحساب معلّق." });
        const moderation = await checkContent(input.title.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر إنشاء البث: ${moderation.reason}` });
        const streamId = await db.createLiveStream(ctx.user.id, input.title);
        await db.createModerationCheck({ userId: ctx.user.id, contentType: "liveTitle", contentId: streamId, contentPreview: input.title.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" }).catch(() => undefined);
        return { id: streamId };
      } catch (error) { asTrpcError(error); }
    }),
    end: protectedProcedure.input(z.object({ streamId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.endLiveStream(input.streamId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    cancel: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), reason: z.string().trim().min(3).max(500).optional() })).mutation(async ({ ctx, input }) => {
      try { return await db.cancelLiveStream(input.streamId, ctx.user.id); } catch (error) { asTrpcError(error); }
    }),
    history: protectedProcedure.query(({ ctx }) => db.listLiveStreamHistory(ctx.user.id)),
    saveRecording: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), recordingUrl: z.string().min(1).max(2000), recordingKey: z.string().max(512).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try { return await db.saveLiveRecording(input.streamId, ctx.user.id, input.recordingUrl, input.recordingKey ?? null); } catch (error) { asTrpcError(error); }
    }),
    publishAsPost: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), content: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
      try {
        const stream = await db.getOwnedLiveStream(input.streamId, ctx.user.id);
        if (!stream?.recordingUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "احفظ تسجيل البث أولًا." });
        const moderation = await checkContent(input.content);
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر التسجيل: ${moderation.reason}` });
        return await db.createPost({ userId: ctx.user.id, content: input.content, mediaUrl: stream.recordingUrl, mediaKey: stream.recordingKey, mediaType: "video" });
      } catch (error) { asTrpcError(error); }
    }),
    publishAsReel: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), caption: z.string().trim().max(500).nullable().optional() })).mutation(async ({ ctx, input }) => {
      try {
        const stream = await db.getOwnedLiveStream(input.streamId, ctx.user.id);
        if (!stream?.recordingUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "احفظ تسجيل البث أولًا." });
        if (input.caption?.trim()) {
          const moderation = await checkContent(input.caption);
          if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر نشر الريلز: ${moderation.reason}` });
        }
        await db.createReel({ userId: ctx.user.id, videoUrl: stream.recordingUrl, videoKey: stream.recordingKey, caption: input.caption ?? null });
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), confirmation: z.literal(true) })).mutation(async ({ ctx, input }) => {
      try { return await db.deleteLiveStream(input.streamId, ctx.user.id); } catch (error) { asTrpcError(error); }
    }),
    chat: publicProcedure.input(z.object({ streamId: z.number().int().positive() })).query(({ ctx, input }) => db.listStreamChatMessages(input.streamId)),
    sendChat: protectedProcedure.input(z.object({ streamId: z.number().int().positive(), content: z.string().trim().min(1).max(500), kind: z.enum(["text", "gif", "sticker"]).default("text") })).mutation(async ({ ctx, input }) => {
      try {
        const stream = await db.getLiveStreamById(input.streamId, ctx.user.id);
        if (!stream) throw new TRPCError({ code: "NOT_FOUND", message: "البث غير موجود أو انتهى." });
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل المشاركة في الدردشة." : "هذا الحساب معلّق." });
        const moderation = await checkContent(input.content);
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: moderation.reason });
        const message = await db.sendStreamChatMessage(input.streamId, ctx.user.id, input.content, input.kind);
        if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ رسالة الدردشة." });
        await db.createModerationCheck({ userId: ctx.user.id, contentType: "liveChat", contentId: message.id, contentPreview: input.content.slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" }).catch(() => undefined);
        return message;
      } catch (error) { asTrpcError(error); }
    }),
    viewers: publicProcedure.input(z.object({ streamId: z.number().int().positive() })).query(({ ctx, input }) => db.listStreamViewers(input.streamId)),
  }),
  marketplace: router({
    list: publicProcedure.input(z.object({ category: z.string().max(64).optional(), sellerId: z.number().int().positive().optional() })).query(({ ctx, input }) => db.listProducts(input.category, input.sellerId, ctx.user?.id)),
    create: protectedProcedure.input(z.object({ title: z.string().min(3).max(180), description: z.string().max(2000).nullable().optional(), price: z.number().int().positive(), category: z.string().min(2).max(64), condition: z.enum(["new", "like_new", "good", "fair"]), location: z.string().max(120).nullable().optional(), images: z.array(mediaSchema).max(8) })).mutation(async ({ ctx, input }) => {
      try {
        assertMinimumAge(ctx.user.dateOfBirth, MARKETPLACE_MIN_AGE, "يجب أن يكون عمرك 18 عامًا على الأقل للبيع في السوق.");
        return { id: await db.createProduct({ sellerId: ctx.user.id, ...input }) };
      } catch (error) { asTrpcError(error); }
    }),
    update: protectedProcedure.input(z.object({ productId: z.number().int().positive(), title: z.string().min(3).max(180).optional(), description: z.string().max(2000).nullable().optional(), price: z.number().int().positive().optional(), category: z.string().min(2).max(64).optional(), condition: z.enum(["new", "like_new", "good", "fair"]).optional(), location: z.string().max(120).nullable().optional(), status: z.enum(["active", "sold", "archived"]).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const { productId, ...product } = input;
        return await db.updateProduct(productId, ctx.user.id, product);
      } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ productId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.deleteProduct(input.productId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
  }),
  parental: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const restriction = await db.getMinorRestriction(ctx.user.id);
      const consent = await db.getParentalConsent(ctx.user.id);
      return { hasRestriction: !!restriction, status: restriction?.accountStatus ?? null, consent: consent ? { guardianEmail: consent.guardianEmail, status: consent.consentStatus } : null };
    }),
    resolve: publicProcedure.input(z.object({ token: z.string().trim().min(1), decision: z.enum(["granted", "denied"]) })).mutation(async ({ input }) => {
      try { return await db.resolveParentalConsent(input.token, input.decision); } catch (error) { asTrpcError(error); }
    }),
    requestConsent: protectedProcedure.input(z.object({ guardianEmail: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا لولي الأمر."), guardianName: z.string().trim().max(120).optional(), relationship: z.string().trim().max(60).optional(), origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      try {
        const restriction = await db.getMinorRestriction(ctx.user.id);
        if (!restriction || restriction.accountStatus === "parental_approved") throw new TRPCError({ code: "BAD_REQUEST", message: "حسابك غير خاضع لقيود أبوية." });
        const result = await requestParentalConsent(ctx.user.id, input.guardianEmail, input.guardianName || null, input.relationship || null, input.origin);
        return { ...result, message: "أُرسل طلب موافقة إلى بريد ولي الأمر؛ لن يُفعّل الحساب إلا بعد موافقته." };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  channels: router({
    list: publicProcedure.query(({ ctx }) => db.listChannels(ctx.user?.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(140), description: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر." : "هذا الحساب معلّق." });
        const moderation = await checkContent(input.name.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر إنشاء القناة: ${moderation.reason}` });
        const id = await db.createChannel(ctx.user.id, input.name.trim(), input.description ?? null);
        await db.subscribeChannel(id, ctx.user.id);
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
    posts: publicProcedure.input(z.object({ channelId: z.number().int().positive() })).query(({ ctx, input }) => db.listChannelPosts(input.channelId)),
    createPost: protectedProcedure.input(z.object({ channelId: z.number().int().positive(), content: z.string().trim().min(1).max(5000), mediaUrl: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const channel = await db.getChannelById(input.channelId);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "القناة غير موجودة." });
        if (channel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لك صلاحية النشر في هذه القناة." });
        const moderation = await checkContent(input.content.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: moderation.reason });
        const mediaType = input.mediaUrl ? (input.mediaUrl.match(/\.(mp4|webm|mov)$/i) ? "video" : "image") : null;
        const id = await db.createChannelPost(input.channelId, ctx.user.id, input.content.trim(), input.mediaUrl ?? null, mediaType);
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
    deletePost: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const deleted = await db.deleteChannelPost(input.postId, ctx.user.id);
        if (!deleted) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية حذف هذا المنشور." });
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    deleteChannel: protectedProcedure.input(z.object({ channelId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.deleteChannel(input.channelId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    bots: protectedProcedure.input(z.object({ channelId: z.number().int().positive() })).query(({ ctx, input }) => db.listBots("channel", input.channelId)),
  }),
  bots: router({
    list: protectedProcedure.input(z.object({ scope: z.enum(["chatGroup", "channel"]), scopeId: z.number().int().positive() })).query(({ input }) => db.listBots(input.scope, input.scopeId)),
    rules: protectedProcedure.input(z.object({ botId: z.number().int().positive() })).query(({ input }) => db.listBotRules(input.botId)),
    create: protectedProcedure.input(z.object({ scope: z.enum(["chatGroup", "channel"]), scopeId: z.number().int().positive(), name: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
      try {
        if (input.scope === "channel") {
          const channel = await db.getChannelById(input.scopeId);
          if (!channel || channel.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "فقط مالك القناة يستطيع إضافة بوت." });
        } else {
          const group = await db.getChatGroupById(input.scopeId, ctx.user.id);
          if (!group || !["owner", "admin"].includes(group.membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "فقط مالك أو مشرف المجموعة يستطيع إضافة بوت." });
        }
        const moderation = await checkContent(input.name);
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: "اسم البوت غير مسموح." });
        return { id: await db.createBot(ctx.user.id, input.scope, input.scopeId, input.name) };
      } catch (error) { asTrpcError(error); }
    }),
    addRule: protectedProcedure.input(z.object({ botId: z.number().int().positive(), trigger: z.string().trim().min(1).max(120), response: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
      try {
        const bot = await db.getBotById(input.botId);
        if (!bot || bot.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذا البوت." });
        const moderation = await checkContent(input.response);
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: "رد البوت غير مسموح." });
        await db.addBotRule(input.botId, input.trigger, input.response);
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    deleteRule: protectedProcedure.input(z.object({ botId: z.number().int().positive(), ruleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const bot = await db.getBotById(input.botId);
        if (!bot || bot.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذا البوت." });
        await db.deleteBotRule(input.ruleId, input.botId);
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    delete: protectedProcedure.input(z.object({ botId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const bot = await db.getBotById(input.botId);
        if (!bot || bot.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية حذف هذا البوت." });
        await db.deleteBot(input.botId, ctx.user.id);
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  channelSubscriptions: router({
    toggle: protectedProcedure.input(z.object({ channelId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        const subscribed = await db.isChannelSubscriber(input.channelId, ctx.user.id);
        if (subscribed) {
          await db.unsubscribeChannel(input.channelId, ctx.user.id);
          return { subscribed: false };
        }
        const { channel, owner } = await db.subscribeChannel(input.channelId, ctx.user.id);
        if (owner && owner.id !== ctx.user.id) {
          await db.notifyUser(owner.id, `اشتراك جديد في قناتك «${(channel?.name ?? "").slice(0, 60)}»`).catch(() => undefined);
        }
        return { subscribed: true };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  voiceSpaces: router({
    list: publicProcedure.query(() => db.listVoiceSpaces()),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(2).max(200), topic: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر." : "هذا الحساب معلّق." });
        const moderation = await checkContent(input.title.trim());
        if (moderation.shouldBlock) throw new TRPCError({ code: "BAD_REQUEST", message: `تعذر إنشاء المساحة: ${moderation.reason}` });
        const id = await db.createVoiceSpace(ctx.user.id, input.title.trim(), input.topic ?? null);
        return { id };
      } catch (error) { asTrpcError(error); }
    }),
    end: protectedProcedure.input(z.object({ spaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.endVoiceSpace(input.spaceId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    makeSpeaker: protectedProcedure.input(z.object({ spaceId: z.number().int().positive(), userId: z.number().int().positive(), isSpeaker: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
      try {
        const space = await db.getVoiceSpaceById(input.spaceId);
        if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "المساحة غير نشطة." });
        if (space.hostId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "فقط المضيف يستطيع إدارة المتحدثين." });
        await db.setParticipantSpeaker(input.spaceId, input.userId, input.isSpeaker);
        return { success: true };
      } catch (error) { asTrpcError(error); }
    }),
    leave: protectedProcedure.input(z.object({ spaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { await db.leaveVoiceSpaceByUser(input.spaceId, ctx.user.id); return { success: true }; } catch (error) { asTrpcError(error); }
    }),
    participants: protectedProcedure.input(z.object({ spaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const space = await db.getVoiceSpaceById(input.spaceId);
      if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "المساحة غير نشطة." });
      const rows = await db.listSpaceParticipants(input.spaceId);
      return rows.map(row => ({ ...row, isHost: row.userId === space.hostId }));
    }),
  }),
  creator: router({
    toggle: protectedProcedure.input(z.object({ enable: z.boolean() })).mutation(async ({ ctx, input }) => {
      try {
        const account = await db.isAccountActive(ctx.user.id);
        if (!account.active) throw new TRPCError({ code: "FORBIDDEN", message: "الحساب المعلّق لا يستطيع تفعيل الوضع الاحترافي." });
        const status = await db.toggleCreatorStatus(ctx.user.id, input.enable);
        return { isCreator: status };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  location: router({
    update: protectedProcedure.input(z.object({ country: z.string().trim().max(96).optional(), state: z.string().trim().max(120).optional(), city: z.string().trim().max(120).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const user = await db.updateLocation(ctx.user.id, { country: input.country ?? undefined, state: input.state ?? undefined, city: input.city ?? undefined });
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
        return { country: user.country, state: user.state, city: user.city };
      } catch (error) { asTrpcError(error); }
    }),
  }),
  admin: router({
    reports: adminProcedure.query(() => db.listOpenReports()),
    users: adminProcedure.input(z.object({ query: z.string().trim().max(120).default(""), limit: z.number().int().min(1).max(100).default(50) })).query(({ input }) => db.listAdminUsers(input.query, input.limit)),
    stats: adminProcedure.query(() => db.getAdminStats()),
    analytics: adminProcedure.input(z.object({ days: z.number().int().min(7).max(90).default(30) }).optional()).query(({ input }) => db.getAdminAnalytics(input?.days ?? 30)),
    health: adminProcedure.query(() => ({ checkedAt: new Date(), databaseConfigured: Boolean(process.env.DATABASE_URL), publicUrlConfigured: Boolean(process.env.PUBLIC_URL || process.env.CLIENT_URL), storageConfigured: isStorageConfigured(), backupScript: "scripts/backup-database.sh", migrationCheck: "pnpm verify:migrations" })),
    verificationRequests: adminProcedure.input(z.object({ status: z.enum(["all", "pending", "needs_more_info", "approved", "rejected", "revoked", "appealed"]).default("pending"), limit: z.number().int().min(1).max(200).default(100) })).query(({ input }) => db.listAdminVerificationRequests(input.status, input.limit)),
    auditLogs: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(({ input }) => db.listAdminAuditLogs(input?.limit ?? 100)),
    reviewVerification: adminProcedure.input(z.object({ requestId: z.number().int().positive(), status: z.enum(["needs_more_info", "approved", "rejected", "revoked"]), verificationType: z.enum(["none", "identity", "creator", "business", "seller", "official"]).optional(), badgeLabel: z.string().trim().max(120).nullable().optional(), decisionNote: z.string().trim().max(2000).nullable().optional(), expiresAt: z.string().datetime().nullable().optional() })).mutation(async ({ ctx, input }) => {
      const result = await db.reviewVerificationRequest({ requestId: input.requestId, reviewerId: ctx.user.id, status: input.status, verificationType: input.verificationType, badgeLabel: input.badgeLabel, decisionNote: input.decisionNote, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "طلب التوثيق غير موجود." });
      await db.writeAdminAuditLog({ adminId: ctx.user.id, action: `verification_${input.status}`, targetType: "verification_request", targetId: input.requestId, reason: input.decisionNote, metadata: { verificationType: input.verificationType, badgeLabel: input.badgeLabel } });
      await db.notifyUser(result.userId, input.status === "approved" ? "تم قبول توثيق حسابك وإضافة الشارة." : input.status === "rejected" ? "تم رفض طلب توثيق حسابك. يمكنك مراجعة السبب وتقديم استئناف." : `تم تحديث طلب توثيق حسابك إلى: ${input.status}.`);
      return result;
    }),
    setRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "moderator", "admin"]) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId && input.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك خفض صلاحية حسابك بنفسك." });
      const user = await db.updateAdminUserRole(input.userId, input.role);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
      await db.logAccountActivity(ctx.user.id, "admin_updated_user_role", "user", input.userId, { role: input.role });
      await db.writeAdminAuditLog({ adminId: ctx.user.id, action: "updated_user_role", targetType: "user", targetId: input.userId, reason: "تغيير دور المستخدم", metadata: { role: input.role } });
      return db.toPublicUser(user);
    }),
    setBan: adminProcedure.input(z.object({ userId: z.number().int().positive(), banned: z.boolean() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك حظر حسابك بنفسك." });
      const user = await db.setAdminUserBan(input.userId, input.banned);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
      await db.logAccountActivity(ctx.user.id, input.banned ? "admin_banned_user" : "admin_unbanned_user", "user", input.userId);
      await db.writeAdminAuditLog({ adminId: ctx.user.id, action: input.banned ? "banned_user" : "unbanned_user", targetType: "user", targetId: input.userId, reason: input.banned ? "تعليق الحساب" : "رفع التعليق" });
      await db.notifyUser(input.userId, input.banned ? "تم تعليق حسابك من قبل فريق الإدارة." : "تم رفع تعليق حسابك من قبل فريق الإدارة.");
      return db.toPublicUser(user);
    }),
    warnUser: adminProcedure.input(z.object({ userId: z.number().int().positive(), reason: z.string().trim().min(10, "اكتب سبب التحذير بوضوح.").max(1000), confirmation: z.literal("تحذير المستخدم") })).mutation(async ({ ctx, input }) => { if (ctx.user.id === input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تحذير حسابك." }); const target = await db.getUserById(input.userId); if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." }); await db.warnUser(input.userId, ctx.user.id, input.reason); await db.writeAdminAuditLog({ adminId: ctx.user.id, action: "warned_user", targetType: "user", targetId: input.userId, reason: input.reason }); return { success: true }; }),
    broadcastNotification: adminProcedure.input(z.object({ audience: z.enum(["all", "verified", "active"]), message: z.string().trim().min(3).max(255), reason: z.string().trim().min(10, "اكتب سبب الإرسال.").max(500), confirmation: z.literal("إرسال الإشعار") })).mutation(async ({ ctx, input }) => { const result = await db.broadcastAdminNotification({ actorId: ctx.user.id, message: input.message, audience: input.audience }); await db.writeAdminAuditLog({ adminId: ctx.user.id, action: "broadcast_notification", targetType: "audience", reason: input.reason, metadata: { audience: input.audience, recipients: result.recipients, message: input.message } }); return result; }),
    resolve: adminProcedure.input(z.object({ reportId: z.number().int().positive(), verdict: z.enum(["substantiated", "partially_substantiated", "unsubstantiated"]), action: z.enum(["no_action", "warn", "hide", "delete", "suspend"]), punishmentLevel: z.enum(["1", "2", "3", "4"]), deleteTarget: z.boolean().optional(), banTarget: z.boolean().optional(), details: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const report = (await db.listOpenReports()).find(row => row.id === input.reportId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "البلاغ غير موجود." });
        if (input.banTarget || input.punishmentLevel === "4") await db.applyPunishment(report.targetId, 4);
        else if (input.punishmentLevel !== "1") await db.applyPunishment(report.targetId, Number(input.punishmentLevel) as 2 | 3);
        let targetDeleted = false;
        if (input.deleteTarget || input.action === "delete") targetDeleted = await deleteTargetContent(report.targetType, report.targetId);
        await db.resolveReport(input.reportId, { status: "reviewed", moderatedBy: "manual", aiVerdict: input.verdict, actionTaken: input.action, resolutionDetails: input.details ?? undefined });
        await db.writeAdminAuditLog({ adminId: ctx.user.id, action: "resolved_report", targetType: report.targetType, targetId: report.targetId, reason: input.details, metadata: { reportId: input.reportId, verdict: input.verdict, action: input.action, targetDeleted } });
        if (report.reporterId) await db.notifyUser(report.reporterId, `تم حسم بلاغك رقم ${input.reportId} بقرار المراجعة البشرية: ${actionLabel(input.action)}.${targetDeleted ? " وحُذف المحتوى المبلغ عنه." : ""}`);
        return { success: true, targetDeleted };
      } catch (error) { asTrpcError(error); }
    }),
  }),
});

function actionLabel(action: string) {
  const labels: Record<string, string> = { no_action: "لا إجراء", warn: "تحذير", hide: "إخفاء", delete: "حذف المحتوى", suspend: "تعليق" };
  return labels[action] ?? action;
}

export type AppRouter = typeof appRouter;
