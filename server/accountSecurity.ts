import { createHash, randomBytes } from "crypto";
import * as db from "./db";
import { hashPassword, normalizeEmail } from "./localAuth";
import { sendAccountEmail } from "./resend";

type AccountTokenPurpose = "email_verification" | "password_reset";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createRawToken() {
  return randomBytes(32).toString("base64url");
}

function resolveOrigin(origin: string) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("رابط التطبيق غير آمن.");
  return parsed.origin;
}

async function issueAccountEmail(input: { userId: number; email: string; purpose: AccountTokenPurpose; origin: string }) {
  const rawToken = createRawToken();
  const expiresAt = new Date(Date.now() + (input.purpose === "password_reset" ? 60 : 24 * 60) * 60 * 1000);
  await db.createAccountToken({ userId: input.userId, tokenHash: hashToken(rawToken), purpose: input.purpose, expiresAt });
  const origin = resolveOrigin(input.origin);
  const isReset = input.purpose === "password_reset";
  const link = `${origin}${isReset ? "/reset-password" : "/verify-email"}?token=${encodeURIComponent(rawToken)}`;
  await sendAccountEmail({
    to: input.email,
    subject: isReset ? "إعادة تعيين كلمة مرور VibraCam" : "أكّد بريدك الإلكتروني في VibraCam",
    html: `<main dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h1 style="color:#7c3aed">VibraCam</h1><p>${isReset ? "وصلنا طلبًا لإعادة تعيين كلمة المرور." : "شكرًا لانضمامك إلى VibraCam. أكّد بريدك الإلكتروني لتفعيل مزايا الحساب."}</p><p><a href="${link}" style="display:inline-block;background:#db2777;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">${isReset ? "إعادة تعيين كلمة المرور" : "تأكيد البريد الإلكتروني"}</a></p><p style="color:#666;font-size:13px">${isReset ? "تنتهي صلاحية الرابط خلال ساعة واحدة." : "تنتهي صلاحية الرابط خلال 24 ساعة."} إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p></main>`,
  });
}

export async function requestEmailVerification(userId: number, origin: string) {
  const user = await db.getUserById(userId);
  if (!user?.email || user.loginMethod !== "email") throw new Error("تأكيد البريد متاح للحسابات المسجلة بالبريد فقط.");
  if (user.emailVerifiedAt) return { alreadyVerified: true };
  await issueAccountEmail({ userId, email: user.email, purpose: "email_verification", origin });
  return { alreadyVerified: false };
}

export async function verifyEmailToken(token: string) {
  const record = await db.getActiveAccountToken(hashToken(token), "email_verification");
  if (!record) throw new Error("رابط تأكيد البريد غير صالح أو انتهت صلاحيته.");
  await db.consumeAccountToken(record.id);
  await db.markEmailVerified(record.userId);
}

export async function requestPasswordReset(email: string, origin: string) {
  const account = await db.getLocalAccountByEmail(normalizeEmail(email));
  if (!account) return;
  await issueAccountEmail({ userId: account.user.id, email: account.user.email!, purpose: "password_reset", origin });
}

export async function resetPasswordWithToken(token: string, password: string) {
  const record = await db.getActiveAccountToken(hashToken(token), "password_reset");
  if (!record) throw new Error("رابط إعادة التعيين غير صالح أو انتهت صلاحيته.");
  await db.updateLocalPassword(record.userId, await hashPassword(password));
  await db.revokeAllAuthSessions(record.userId);
  await db.consumeAccountToken(record.id);
}

export async function requestParentalConsent(userId: number, guardianEmail: string, guardianName: string | null | undefined, relationship: string | null | undefined, origin: string) {
  const { token } = await db.createParentalConsent(userId, guardianEmail, guardianName, relationship);
  const link = `${resolveOrigin(origin)}/parental-approve?token=${encodeURIComponent(token)}`;
  await sendAccountEmail({
    to: guardianEmail,
    subject: "طلب موافقة ولي الأمر على VibraCam",
    html: `<main dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h1 style="color:#7c3aed">VibraCam</h1><p>طُلبت موافقتك بصفتك ولي أمر على حساب في VibraCam.</p><p><a href="${link}" style="display:inline-block;background:#db2777;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">مراجعة الطلب</a></p><p style="color:#666;font-size:13px">ينتهي الرابط خلال 7 أيام. إذا لم تتوقع هذا الطلب، يمكنك تجاهل الرسالة.</p></main>`,
  });
  return { success: true, guardianEmail };
}
