import { parse as parseCookie } from "cookie";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { checkContent, judgeReport } from "./aiModeration";
import { registerRealtimeEmitter } from "./realtime";
import { ENV } from "./_core/env";

const userSockets = new Map<number, Set<string>>();
const socketToUser = new Map<string, number>();
const broadcasterDisconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** تنظيف دوري لطالبي المكالمات العشوائية منتهية الصلاحية. */
if (ENV.databaseUrl) setInterval(() => {
  void db.cleanupExpiredQueueEntries().catch(error => console.warn("[RandomCall] تعذر تنظيف قائمة الانتظار.", error));
}, 60_000);

// ============================== منظومة الأمان بالذكاء الاصطناعي ==============================

async function moderateWithRecord(params: { userId: number; contentType: "message" | "chatGroupMessage" | "liveChat" | "post" | "comment" | "story" | "reel" | "product" | "groupPost" | "liveTitle" | "username"; contentId: number; preview: string }) {
  const moderation = await checkContent(params.preview);
  if (moderation.shouldBlock) {
    try { await db.createModerationCheck({ userId: params.userId, contentType: params.contentType, contentId: params.contentId || -1, contentPreview: params.preview.slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "blocked" }); } catch { /* تسجيل اختياري */ }
  }
  return moderation;
}

/** معالجة آلية للبلاغات المفتوحة كل دقيقتين: فحص بالذكاء الاصطناعي وتنفيذ الحكم. */
async function processOpenReportsWithAi() {
  try {
    const open = await db.listOpenReports();
    for (const report of open) {
      try {
        const context = await gatherReportContext(report);
        const judgment = await judgeReport({ reason: report.reason, details: report.details, targetContent: context.content, authorName: context.authorName, authorBio: context.authorBio });
        let actionTaken: "no_action" | "warn" | "hide" | "delete" | "suspend" = judgment.action;
        // حذف تلقائي إلزامي للمحتوى المؤيد كإباحي
        if (judgment.verdict === "substantiated" && (report.reason === "inappropriate_content" || context.categories?.includes("sexual") === true)) {
          actionTaken = "delete";
        }
        await db.resolveReport(report.id, { status: actionTaken === "no_action" ? "closed" : "reviewed", moderatedBy: "ai", aiVerdict: judgment.verdict, aiConfidence: Math.round(judgment.confidence * 100), actionTaken, resolutionDetails: judgment.summary });
        if (actionTaken === "delete") await deleteTargetContent(report.targetType, report.targetId);
        if (judgment.shouldWarnUser) {
          const targetUserId = report.targetType === "user" ? report.targetId : (report.targetType === "message" ? await ownerOfMessage(report.targetId) : report.targetType === "post" ? await ownerOfPost(report.targetId) : null);
          if (targetUserId) await db.createNotification({ userId: targetUserId, actorId: 0, type: "message", entityId: report.id, message: `حسابك تلقى بلاغًا تمت مراجعته آليًا: ${judgment.summary}` }).catch(() => undefined);
        }
      } catch (error) {
        console.warn("[AiModeration] تعذر معالجة البلاغ", report.id, error);
      }
    }
  } catch (error) {
    console.warn("[AiModeration] تعذرت المعالجة الدورية للبلاغات", error);
  }
}

async function gatherReportContext(report: { targetType: string; targetId: number }) {
  const result: { content: string | null; authorName: string | null; authorBio: string | null; categories: string[] } = { content: null, authorName: null, authorBio: null, categories: [] };
  try {
    if (report.targetType === "user") {
      const user = await db.getUserById(report.targetId);
      result.authorName = user?.name ?? null;
      result.authorBio = user?.bio ?? null;
      result.content = [user?.name, user?.bio].filter(Boolean).join(" | ") || null;
    } else if (report.targetType === "post") {
      const post = await db.getPostById(report.targetId);
      result.content = post?.content ?? null;
      if (post?.author) result.authorName = (post.author as { name?: string })?.name ?? null;
    } else if (report.targetType === "message") {
      const message = await db.getMessageById(report.targetId);
      result.content = message?.content ?? null;
      if (message?.senderId) {
        const sender = await db.getUserById(message.senderId);
        result.authorName = sender?.name ?? null;
      }
    } else if (report.targetType === "product") {
      const product = await db.getProductById(report.targetId);
      result.content = [product?.title, product?.description ?? null].filter(Boolean).join(" | ") || null;
      if (product?.seller) result.authorName = product.seller.name;
    }
  } catch { /* السياق اختياري */ }
  return result;
}

export async function deleteTargetContent(targetType: string, targetId: number): Promise<boolean> {
  try {
    if (targetType === "post") await db.forceDeletePost(targetId);
    else if (targetType === "product") await db.forceDeleteProduct(targetId);
    else if (targetType === "message") await db.deleteMessage(targetId);
    else return false;
    return true;
  } catch (error) {
    console.warn("[AiModeration] تعذر حذف المحتوى المستهدف", targetType, targetId, error);
    return false;
  }
}

async function ownerOfMessage(messageId: number): Promise<number | null> {
  try {
    const message = await db.getMessageById(messageId);
    return message?.senderId ?? null;
  } catch { return null; }
}

async function ownerOfPost(postId: number): Promise<number | null> {
  try {
    const post = await db.getPostById(postId);
    const author = post?.author as { id?: number } | undefined;
    return author?.id ?? null;
  } catch { return null; }
}

// معالجة دورية للبلاغات المفتوحة بالذكاء الاصطناعي كل دقيقتين
if (ENV.databaseUrl) {
  setInterval(() => { void processOpenReportsWithAi(); }, 1000 * 60 * 2);
  void processOpenReportsWithAi();
}

// ============================== منظومة الأمان بالذكاء الاصطناعي - نهاية ==============================

/** تحديث دوري لعرض بث مباشر منتهي عبر انقطاع اتصال. */
if (ENV.databaseUrl) setInterval(() => {
  void db.pruneOldStreamChat(0).catch(() => undefined);
}, 1000 * 60 * 10);

function emitToUser(io: Server, targetId: number, event: string, payload: unknown) {
  io.to(`user:${targetId}`).emit(event, payload);
}

export function initializeSocket(server: HttpServer) {
  const configuredOrigins = [process.env.PUBLIC_URL, process.env.CLIENT_URL].filter((value): value is string => Boolean(value)).map(value => { try { return new URL(value).origin; } catch { return ""; } }).filter(Boolean);
  const allowedOrigins = new Set([...configuredOrigins, "http://localhost:3000", "http://127.0.0.1:3000"]);
  const isTrustedWebDevOrigin = (origin: string) => {
    try {
      const parsed = new URL(origin);
      const isLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
      const isManaged = parsed.protocol === "https:" && (parsed.hostname.endsWith(".manus.space") || parsed.hostname.endsWith(".manus.computer"));
      return isLocal || isManaged;
    } catch {
      return false;
    }
  };
  const io = new Server(server, { path: "/api/socket.io", cors: { origin: (origin, callback) => { if (!origin || allowedOrigins.has(origin) || isTrustedWebDevOrigin(origin)) callback(null, true); else callback(new Error("Origin غير مسموح.")); }, credentials: true }, maxHttpBufferSize: 5 * 1024 * 1024 });
  registerRealtimeEmitter((targetId, event, payload) => emitToUser(io, targetId, event, payload));
  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie ?? "")[COOKIE_NAME];
      const session = await sdk.verifySession(token);
      if (!session) return next(new Error("غير مصرح"));
      const user = await db.getUserByOpenId(session.openId);
      if (!user) return next(new Error("المستخدم غير موجود"));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("تعذر التحقق من الجلسة"));
    }
  });
  io.on("connection", socket => {
    const userId = socket.data.userId as number;
    const pendingBroadcasterTimer = broadcasterDisconnectTimers.get(userId);
    if (pendingBroadcasterTimer) {
      clearTimeout(pendingBroadcasterTimer);
      broadcasterDisconnectTimers.delete(userId);
    }
    const sockets = userSockets.get(userId) ?? new Set<string>();
    sockets.add(socket.id);
    userSockets.set(userId, sockets);
    socketToUser.set(socket.id, userId);
    io.emit("presence:update", { userId, online: true });

    socket.on("presence:check", ({ userId: targetId }: { userId: number }, reply?: (status: { online: boolean }) => void) => {
      reply?.({ online: Boolean(userSockets.get(targetId)?.size) });
    });

    socket.on("typing:start", ({ peerId }: { peerId: number }) => io.to(`user:${peerId}`).emit("typing:update", { userId, typing: true }));
    socket.on("typing:stop", ({ peerId }: { peerId: number }) => io.to(`user:${peerId}`).emit("typing:update", { userId, typing: false }));

    socket.on("message:send", async ({ receiverId, content, kind = "text", mediaUrl, mediaKey, replyToId }: { receiverId: number; content: string; kind?: "text" | "gif" | "sticker" | "audio"; mediaUrl?: string | null; mediaKey?: string | null; replyToId?: number | null }, reply?: (result: { ok: boolean; message?: string }) => void) => {
      try {
        const account = await db.isAccountActive(userId);
        if (!account.active) { reply?.({ ok: false, message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل إرسال الرسائل." : "هذا الحساب معلّق ولا يمكنه إرسال الرسائل." }); return; }
        if (userId === receiverId || !(await db.getUserById(receiverId)) || (!content?.trim() && !mediaUrl) || await db.isUserBlockedBetween(userId, receiverId)) {
          reply?.({ ok: false, message: "لا يمكن إرسال الرسالة إلى هذا الحساب." });
          return;
        }
        const moderation = content.trim() ? await moderateWithRecord({ userId, contentType: "message", contentId: 0, preview: content.trim() }) : null;
        if (moderation?.shouldBlock) {
          socket.emit("message:blocked", { reason: moderation.reason });
          reply?.({ ok: false, message: moderation.reason });
          return;
        }
        const message = await db.saveMessage(userId, receiverId, content.trim(), { kind, mediaUrl, mediaKey }, replyToId);
        if (moderation) await db.createModerationCheck({ userId, contentType: "message", contentId: message.id, contentPreview: content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" });
        await db.createNotification({ userId: receiverId, actorId: userId, type: "message", entityId: message.id, message: "أرسل لك رسالة جديدة" });
        io.to(`user:${receiverId}`).emit("message:new", message);
        socket.emit("message:new", message);
        reply?.({ ok: true });
      } catch (error) {
        console.error("[Socket] message:send failed", error);
        reply?.({ ok: false, message: "تعذر إرسال الرسالة حاليًا؛ أعد المحاولة." });
      }
    });

    socket.on("chatGroup:join", async ({ chatGroupId }: { chatGroupId: number }) => {
      try { await db.listChatGroupMessages(chatGroupId, userId); socket.join(`chat-group:${chatGroupId}`); } catch { /* لا ينضم غير العضو إلى الغرفة */ }
    });
    socket.on("chatGroup:typing:start", ({ chatGroupId }: { chatGroupId: number }) => socket.to(`chat-group:${chatGroupId}`).emit("chatGroup:typing", { chatGroupId, userId, typing: true }));
    socket.on("chatGroup:typing:stop", ({ chatGroupId }: { chatGroupId: number }) => socket.to(`chat-group:${chatGroupId}`).emit("chatGroup:typing", { chatGroupId, userId, typing: false }));
    socket.on("chatGroup:send", async ({ chatGroupId, content, kind = "text", mediaUrl, mediaKey, replyToId }: { chatGroupId: number; content: string; kind?: "text" | "gif" | "sticker" | "audio"; mediaUrl?: string | null; mediaKey?: string | null; replyToId?: number | null }, reply?: (result: { ok: boolean; id?: number; message?: string }) => void) => {
      if (!content?.trim() && !mediaUrl) { reply?.({ ok: false, message: "أدخل رسالة أو اختر وسائط." }); return; }
      void (async () => {
        try {
          const account = await db.isAccountActive(userId);
          if (!account.active) { reply?.({ ok: false, message: account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل الإرسال." : "هذا الحساب معلّق." }); return; }
          const cleanContent = content.trim();
          const moderation = cleanContent ? await moderateWithRecord({ userId, contentType: "chatGroupMessage", contentId: 0, preview: cleanContent }) : null;
          if (moderation?.shouldBlock) { socket.emit("message:blocked", { reason: moderation.reason }); reply?.({ ok: false, message: moderation.reason }); return; }
          const id = await db.sendChatGroupMessage({ chatGroupId, senderId: userId, content: cleanContent, kind, mediaUrl, mediaKey, replyToId });
          if (moderation) await db.createModerationCheck({ userId, contentType: "chatGroupMessage", contentId: id, contentPreview: cleanContent.slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" });
          io.to(`chat-group:${chatGroupId}`).emit("chatGroup:message", { id, chatGroupId, senderId: userId, content: cleanContent, kind, mediaUrl, mediaKey, replyToId: replyToId ?? null, createdAt: new Date() });
          reply?.({ ok: true, id });
          if (cleanContent) void replyWithBot("chatGroup", chatGroupId, userId, cleanContent);
        } catch (error) { console.warn("[Socket] chatGroup:send failed", error); reply?.({ ok: false, message: "تعذر إرسال الرسالة إلى المجموعة." }); }
      })();
    });

    // ==============================
    // المساحات الصوتية (Voice Spaces)
    socket.on("voiceSpace:join", async ({ spaceId, isSpeaker = false }: { spaceId: number; isSpeaker?: boolean }) => {
      try {
        const account = await db.isAccountActive(userId);
        if (!account.active) {
          socket.emit("voiceSpace:blocked", { spaceId, reason: account.status === "parental_pending" ? "حسابك قيد المراجعة الأبوية ولا يمكنك دخول المساحات الصوتية حتى موافقة الولي." : "هذا الحساب معلّق." });
          return;
        }
        const space = await db.getVoiceSpaceById(spaceId);
        if (!space || space.status !== "live") return;
        await db.joinVoiceSpace(spaceId, userId, socket.id, isSpeaker);
        socket.join(`voice-space:${spaceId}`);
        const participants = await db.listSpaceParticipants(spaceId);
        io.to(`voice-space:${spaceId}`).emit("voiceSpace:participants", { spaceId, participants });
        socket.to(`voice-space:${spaceId}`).emit("voiceSpace:userJoined", { spaceId, userId, isSpeaker });
      } catch { /* المشاركة محكومة بطبقة البيانات */ }
    });
    socket.on("voiceSpace:leave", async ({ spaceId }: { spaceId: number }) => {
      try {
        await db.leaveVoiceSpace(spaceId, socket.id);
        socket.leave(`voice-space:${spaceId}`);
        const participants = await db.listSpaceParticipants(spaceId);
        io.to(`voice-space:${spaceId}`).emit("voiceSpace:participants", { spaceId, participants });
        socket.to(`voice-space:${spaceId}`).emit("voiceSpace:userLeft", { spaceId, userId });
      } catch { /* */ }
    });
    socket.on("voiceSpace:speakerToggle", async ({ spaceId, isSpeaker }: { spaceId: number; isSpeaker: boolean }) => {
      try {
        const space = await db.getVoiceSpaceById(spaceId);
        if (!space || space.hostId !== userId) return;
        await db.setParticipantSpeaker(spaceId, userId, isSpeaker);
        const participants = await db.listSpaceParticipants(spaceId);
        io.to(`voice-space:${spaceId}`).emit("voiceSpace:participants", { spaceId, participants });
      } catch { /* */ }
    });
    socket.on("voiceSpace:signal", async ({ spaceId, peerId, signal }: { spaceId: number; peerId: number; signal: unknown }) => {
      try {
        const participants = await db.listSpaceParticipants(spaceId);
        const current = participants.some(participant => participant.userId === userId);
        const peer = participants.some(participant => participant.userId === peerId);
        if (!current || !peer || !userSockets.get(peerId)?.size) return;
        io.to(`user:${peerId}`).emit("voiceSpace:signal", { spaceId, from: userId, signal });
      } catch { /* إشارة غير صالحة لا تعطل الغرفة */ }
    });
    // ==============================
    // البوتات: رد تلقائي من بوتات القناة/المجموعة
    async function replyWithBot(scope: "chatGroup" | "channel", scopeId: number, fromUserId: number, text: string) {
      try {
        const reply = await db.matchBotResponse(scope, scopeId, text);
        if (!reply) return;
        const targetRoom = scope === "chatGroup" ? `chat-group:${scopeId}` : `channel:${scopeId}`;
        io.to(targetRoom).emit(scope === "chatGroup" ? "chatGroup:message" : "channel:message", {
          id: -1, chatGroupId: scope === "chatGroup" ? scopeId : undefined, channelId: scope === "channel" ? scopeId : undefined,
          senderId: reply.botOwnerId, botId: reply.botId, content: reply.response, kind: "text", createdAt: new Date(),
        });
      } catch { /* فشل الرد التلقائي لا يؤثر على المستخدم */ }
    }
    // ==============================
    // المكالمات المباشرة الفردية
    // ==============================
    socket.on("call:offer", async ({ peerId, kind = "video", signal, callId }: { peerId: number; kind?: "video" | "audio"; signal?: unknown; callId?: number }) => {
      if (await db.isUserBlockedBetween(userId, peerId)) return;
      const resolvedCallId: number = Number(callId) > 0 ? Number(callId) : await db.createCallRecord(userId, peerId, kind, false);
      const targetSockets = userSockets.get(peerId);
      if (!targetSockets?.size) {
        await db.updateCallStatus(resolvedCallId, "missed");
        socket.emit("call:missed", { callId: resolvedCallId, peerId });
        return;
      }
      emitToUser(io, peerId, "call:incoming", { callId: resolvedCallId, from: userId, kind });
      if (signal) emitToUser(io, peerId, "call:signal", { from: userId, callId: resolvedCallId, signal });
      void db.createNotification({ userId: peerId, actorId: userId, type: "call", entityId: resolvedCallId, message: "مكالمة واردة جديدة" }).catch(() => undefined);
    });
    socket.on("call:accept", ({ peerId, callId }: { peerId: number; callId: number }) => {
      if (userSockets.get(peerId)?.size) {
        emitToUser(io, peerId, "call:accepted", { callId, from: userId });
        void db.updateCallStatus(callId, "ongoing").catch(() => undefined);
      }
    });
    socket.on("call:reject", ({ peerId, callId }: { peerId: number; callId: number }) => {
      if (userSockets.get(peerId)?.size) emitToUser(io, peerId, "call:rejected", { callId, from: userId });
      void db.updateCallStatus(callId, "rejected").catch(() => undefined);
    });
    socket.on("call:signal", ({ peerId, callId, signal }: { peerId: number; callId: number; signal: unknown }) => {
      if (!userSockets.get(peerId)?.size || Number.isNaN(callId) || callId <= 0) return;
      io.to(`user:${peerId}`).emit("call:signal", { from: userId, callId, signal });
    });
    socket.on("call:hangup", async ({ peerId, callId, durationSeconds }: { peerId?: number; callId?: number; durationSeconds?: number }) => {
      if (typeof callId === "number" && callId > 0) void db.updateCallStatus(callId, "ended", durationSeconds).catch(() => undefined);
      if (typeof peerId === "number" && peerId > 0 && userSockets.get(peerId)?.size) {
        io.to(`user:${peerId}`).emit("call:hangup", { from: userId, callId, durationSeconds });
      }
    });

    // ==============================
    // المكالمات العشوائية (المطابقة)
    // ==============================
    socket.on("randomCall:join", async ({ kind = "video", preferredGender = "any" }: { kind?: "video" | "audio"; preferredGender?: "any" | "male" | "female" }, reply?: (result: { joined: boolean; partnerId?: number; callId?: number; message?: string }) => void) => {
      try {
        if (await db.getUserLiveStream(userId)) {
          reply?.({ joined: false, message: "لا يمكنك البحث عن مكالمة عشوائية أثناء البث المباشر." });
          return;
        }
        const account = await db.isAccountActive(userId);
        if (!account.active) {
          reply?.({ joined: false, message: account.status === "parental_pending" ? "حسابك قيد المراجعة الأبوية ولا يمكنك استخدام المكالمات العشوائية حتى موافقة الولي." : "هذا الحساب معلّق." });
          return;
        }
        const partner = await db.findRandomCallPartner(userId, preferredGender);
        if (partner) {
          const partnerId = partner.userId;
          if (!userSockets.get(partnerId)?.size) {
            reply?.({ joined: false, message: "غادر الطرف الآخر قبل اكتمال المطابقة." });
            await db.leaveRandomCallQueue(partnerId);
            return;
          }
          // فحص حساب الشريك أيضًا (قاصر دون موافقة لا يدخل مكالمة)
          const partnerAccount = await db.isAccountActive(partnerId);
          if (!partnerAccount.active) {
            reply?.({ joined: false, message: "غادر الطرف الآخر أو حسابه غير مفعّل." });
            await db.leaveRandomCallQueue(partnerId);
            return;
          }
          const callId = await db.createCallRecord(userId, partnerId, kind, true);
          const partnerProfile = await db.getUserById(partnerId);
          await db.markQueueMatched(userId);
          emitToUser(io, partnerId, "randomCall:matched", { from: userId, callId, user: partnerProfile ? db.toPublicUser(partnerProfile) : undefined });
          emitToUser(io, userId, "randomCall:matched", { from: partnerId, callId, user: partnerProfile ? db.toPublicUser(partnerProfile) : undefined });
          reply?.({ joined: true, partnerId, callId });
          return;
        }
        await db.joinRandomCallQueue(userId, kind, preferredGender);
        reply?.({ joined: true, message: preferredGender !== "any" ? `جارٍ البحث عن طرف آخر (${preferredGender === "male" ? "ذكر" : "أنثى"})...` : "جارٍ البحث عن طرف آخر..." });
        void db.createNotification({ userId, type: "call", entityId: 0, message: "دخلت قائمة انتظار المكالمات العشوائية" }).catch(() => undefined);
      } catch {
        reply?.({ joined: false, message: "تعذر الانضمام إلى قائمة البحث." });
      }
    });
    socket.on("randomCall:leave", async (_payload: unknown, reply?: (result: { left: boolean }) => void) => {
      await db.leaveRandomCallQueue(userId);
      reply?.({ left: true });
    });
    socket.on("randomCall:signal", ({ peerId, signal }: { peerId: number; signal: unknown }) => {
      if (!userSockets.get(peerId)?.size) return;
      io.to(`user:${peerId}`).emit("randomCall:signal", { from: userId, signal });
    });
    socket.on("randomCall:hangup", ({ peerId }: { peerId: number }) => {
      void db.leaveRandomCallQueue(userId).catch(() => undefined);
      void db.leaveRandomCallQueue(peerId).catch(() => undefined);
      if (userSockets.get(peerId)?.size) io.to(`user:${peerId}`).emit("randomCall:hangup", { from: userId });
      socket.emit("randomCall:ended");
    });

    // ==============================
    // البث المباشر
    // ==============================
    socket.on("live:join", async ({ streamId }: { streamId: number }, reply?: (result: { joined: boolean; viewerCount?: number; streamTitle?: string; broadcasterName?: string; message?: string }) => void) => {
      try {
        const stream = await db.getLiveStreamById(streamId, userId);
        if (!stream) {
          reply?.({ joined: false, message: "البث غير موجود أو انتهى." });
          return;
        }
        socket.join(`live:${streamId}`);
      if (userId !== stream.stream.broadcasterId) {
        const count = await db.joinStreamRoom(streamId, userId, socket.id);
        const broadcaster = await db.getUserById(stream.stream.broadcasterId);
        io.to(`live:${streamId}`).emit("live:viewerCount", { streamId, viewerCount: count });
        io.to(`live:${streamId}`).emit("live:viewerJoined", { streamId, viewerId: userId });
        reply?.({ joined: true, viewerCount: count, streamTitle: stream.stream.title, broadcasterName: broadcaster?.name ?? undefined });
      } else {
        reply?.({ joined: true, viewerCount: stream.stream.viewerCount, streamTitle: stream.stream.title, broadcasterName: stream.broadcaster.name ?? undefined });
      }
      } catch {
        reply?.({ joined: false, message: "تعذر الانضمام إلى البث." });
      }
    });
    socket.on("live:signal", async ({ streamId, targetId, signal }: { streamId: number; targetId: number; signal: unknown }) => {
      try {
        if (!socket.rooms.has(`live:${streamId}`) || !userSockets.get(targetId)?.size) return;
        const stream = await db.getLiveStreamById(streamId, userId);
        if (!stream) return;
        io.to(`user:${targetId}`).emit("live:signal", { streamId, from: userId, signal });
      } catch { /* إشارة WebRTC غير الصالحة لا تعطل الغرفة */ }
    });
    socket.on("live:leave", async ({ streamId }: { streamId: number }) => {
      try {
        const stream = await db.getLiveStreamById(streamId, userId);
        socket.leave(`live:${streamId}`);
        if (stream && userId !== stream.stream.broadcasterId) {
          const count = await db.leaveStreamRoom(streamId, socket.id);
          io.to(`live:${streamId}`).emit("live:viewerCount", { streamId, viewerCount: count });
          io.to(`live:${streamId}`).emit("live:viewerLeft", { streamId, viewerId: userId });
        }
      } catch { /* */ }
    });
    socket.on("live:chat", async ({ streamId, content, kind = "text" }: { streamId: number; content: string; kind?: "text" | "gif" | "sticker" }, reply?: (result: { ok: boolean; message?: string }) => void) => {
      if (!content?.trim()) { reply?.({ ok: false, message: "أدخل رسالة للدردشة." }); return; }
      try {
        const stream = await db.getLiveStreamById(streamId, userId);
        if (!stream) { reply?.({ ok: false, message: "البث غير موجود أو انتهى." }); return; }
        const account = await db.isAccountActive(userId);
        if (!account.active) { const message = account.status === "parental_pending" ? "حسابك يتطلب موافقة ولي الأمر قبل المشاركة في الدردشة." : "هذا الحساب معلّق."; socket.emit("message:blocked", { reason: message }); reply?.({ ok: false, message }); return; }
        const moderation = await moderateWithRecord({ userId, contentType: "liveChat", contentId: 0, preview: content.trim() });
        if (moderation.shouldBlock) { socket.emit("message:blocked", { reason: moderation.reason }); reply?.({ ok: false, message: moderation.reason }); return; }
        const message = await db.sendStreamChatMessage(streamId, userId, content.trim().slice(0, 500), kind);
        if (message) await db.createModerationCheck({ userId, contentType: "liveChat", contentId: message.id, contentPreview: content.trim().slice(0, 500), verdict: moderation.verdict, categories: moderation.categories.join(" | "), confidence: Math.round(moderation.confidence * 100), actionTaken: "allowed" });
        if (message) io.to(`live:${streamId}`).emit("live:chatMessage", { streamId, id: message.id, userId: message.userId, content: message.content, kind: message.kind, createdAt: message.createdAt, user: message.user });
        reply?.({ ok: Boolean(message), message: message ? undefined : "تعذر حفظ رسالة الدردشة." });
      } catch { reply?.({ ok: false, message: "تعذر إرسال رسالة الدردشة حاليًا." }); }
    });
    socket.on("live:reaction", async ({ streamId, emoji }: { streamId: number; emoji: string }) => {
      if (!emoji?.trim() || emoji.length > 24) return;
      try {
        const stream = await db.getLiveStreamById(streamId, userId);
        if (!stream) return;
        await db.addStreamReaction(streamId, userId, emoji.trim());
        io.to(`live:${streamId}`).emit("live:reaction", { streamId, from: userId, emoji: emoji.trim() });
      } catch { /* يُتجاهل الفشل */ }
    });
    socket.on("live:end", async ({ streamId }: { streamId: number }, reply?: (result: { ended: boolean; message?: string }) => void) => {
      try {
        await db.endLiveStream(streamId, userId);
        io.to(`live:${streamId}`).emit("live:ended", { streamId });
        socket.leave(`live:${streamId}`);
        reply?.({ ended: true });
      } catch {
        reply?.({ ended: false, message: "فقط المذيع يمكنه إنهاء البث." });
      }
    });

    socket.on("disconnect", async () => {
      sockets.delete(socket.id);
      socketToUser.delete(socket.id);
      if (!sockets.size) {
        userSockets.delete(userId);
        io.emit("presence:update", { userId, online: false });
        const timer = setTimeout(() => {
          broadcasterDisconnectTimers.delete(userId);
          if (userSockets.get(userId)?.size) return;
          void (async () => {
            const stream = await db.getUserLiveStream(userId);
            if (!stream) return;
            await db.endLiveStream(stream.id, userId);
            io.to(`live:${stream.id}`).emit("live:ended", { streamId: stream.id, reason: "broadcaster_disconnected" });
          })().catch(error => console.warn("[Live] تعذر إنهاء بث المذيع المنقطع.", error));
        }, 15_000);
        broadcasterDisconnectTimers.set(userId, timer);
        void db.leaveRandomCallQueue(userId).catch(() => undefined);
        // الخروج من غرف البث المباشر التي كان يشاهدها
        for (const room of Array.from(socket.rooms)) {
          if (room.startsWith("live:")) {
            const roomStreamId = Number(room.slice(5));
            if (roomStreamId > 0) {
              const count = await db.leaveStreamRoom(roomStreamId, socket.id).catch(() => -1);
              if (count >= 0) {
                io.to(`live:${roomStreamId}`).emit("live:viewerCount", { streamId: roomStreamId, viewerCount: count });
                io.to(`live:${roomStreamId}`).emit("live:viewerLeft", { streamId: roomStreamId, viewerId: userId });
              }
            }
          }
        }
      } else {
        for (const room of Array.from(socket.rooms)) {
          if (room.startsWith("live:")) {
            const roomStreamId = Number(room.slice(5));
            if (roomStreamId > 0) {
              const count = await db.leaveStreamRoom(roomStreamId, socket.id).catch(() => -1);
              if (count >= 0) {
                io.to(`live:${roomStreamId}`).emit("live:viewerCount", { streamId: roomStreamId, viewerCount: count });
                io.to(`live:${roomStreamId}`).emit("live:viewerLeft", { streamId: roomStreamId, viewerId: userId });
              }
            }
          }
        }
      }
    });
    socket.join(`user:${userId}`);
  });
  return io;
}
