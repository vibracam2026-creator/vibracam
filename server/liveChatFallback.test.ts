import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLiveStreamById: vi.fn(),
  isAccountActive: vi.fn(),
  getUserById: vi.fn(),
  updateProfile: vi.fn(),
  isUserBlockedBetween: vi.fn(),
  saveMessage: vi.fn(),
  createNotification: vi.fn().mockResolvedValue(undefined),
  sendChatGroupMessage: vi.fn(),
  sendStreamChatMessage: vi.fn(),
  createModerationCheck: vi.fn().mockResolvedValue(undefined),
  listOpenReports: vi.fn().mockResolvedValue([]),
  cleanupExpiredQueueEntries: vi.fn().mockResolvedValue(undefined),
  pruneOldStreamChat: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => mocks);
vi.mock("./aiModeration", () => ({
  checkContent: vi.fn().mockResolvedValue({ shouldBlock: false, verdict: "allowed", categories: [], confidence: 0.99 }),
  judgeReport: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = { id: 150003, openId: "admin-local", name: "مدير", username: "vibracam2026", email: "vibracam.2026@gmail.com", loginMethod: "email", avatarUrl: null, avatarKey: null, bio: null, country: null, role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const ctx = { user, req: { protocol: "https", headers: {} }, res: { clearCookie: vi.fn() } } as unknown as TrpcContext;

describe("live.sendChat", () => {
  it("يحفظ رسالة دردشة البث من خلال مسار احتياطي مستقل عن Socket.IO", async () => {
    const saved = { id: 91, streamId: 12, userId: user.id, content: "رسالة اختبار", kind: "text" as const, createdAt: new Date(), user: user };
    mocks.getLiveStreamById.mockResolvedValue({ stream: { id: 12, status: "live" } });
    mocks.isAccountActive.mockResolvedValue({ active: true, status: "active" });
    mocks.sendStreamChatMessage.mockResolvedValue(saved);

    await expect(appRouter.createCaller(ctx).live.sendChat({ streamId: 12, content: "رسالة اختبار" })).resolves.toEqual(saved);
    expect(mocks.sendStreamChatMessage).toHaveBeenCalledWith(12, user.id, "رسالة اختبار", "text");
  });

  it("يحفظ الرسالة الفردية والإشعار عبر tRPC عندما لا يتاح Socket.IO", async () => {
    const saved = { id: 92, senderId: user.id, receiverId: 150004, content: "رسالة احتياطية", kind: "text", mediaUrl: null, mediaKey: null, replyToId: null, createdAt: new Date() };
    mocks.isAccountActive.mockResolvedValue({ active: true, status: "active" });
    mocks.getUserById.mockResolvedValue({ id: 150004 });
    mocks.isUserBlockedBetween.mockResolvedValue(false);
    mocks.saveMessage.mockResolvedValue(saved);

    await expect(appRouter.createCaller(ctx).messages.send({ receiverId: 150004, content: "رسالة احتياطية" })).resolves.toEqual(saved);
    expect(mocks.saveMessage).toHaveBeenCalledWith(user.id, 150004, "رسالة احتياطية", { kind: "text", mediaUrl: undefined, mediaKey: undefined }, undefined);
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 150004, actorId: user.id, type: "message", entityId: saved.id }));
  });

  it("يحفظ رسالة المجموعة عبر tRPC عندما لا تتوفر غرفة Socket.IO", async () => {
    mocks.sendChatGroupMessage.mockResolvedValue(93);

    await expect(appRouter.createCaller(ctx).chatGroups.send({ chatGroupId: 7, content: "رسالة مجموعة احتياطية" })).resolves.toEqual({ id: 93 });
    expect(mocks.sendChatGroupMessage).toHaveBeenCalledWith(expect.objectContaining({ chatGroupId: 7, senderId: user.id, content: "رسالة مجموعة احتياطية", kind: "text" }));
  });

  it("يحفظ رابط الصورة والغلاف الجديدين فور اكتمال الرفع", async () => {
    const media = { avatarUrl: "/storage/vibracam/150003/avatar/new-image.webp", avatarKey: "vibracam/150003/avatar/new-image.webp", coverUrl: "/storage/vibracam/150003/cover/new-cover.webp", coverKey: "vibracam/150003/cover/new-cover.webp" };
    mocks.updateProfile.mockResolvedValue({ id: user.id, ...media });

    await expect(appRouter.createCaller(ctx).profile.update(media)).resolves.toEqual({ id: user.id, ...media });
    expect(mocks.updateProfile).toHaveBeenCalledWith(user.id, media);
  });
});
