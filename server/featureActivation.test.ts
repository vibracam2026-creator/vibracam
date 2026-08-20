import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  toggleReelLike: vi.fn(),
  getReelById: vi.fn(),
  createNotification: vi.fn(),
  recordReelView: vi.fn(),
}));

vi.mock("./db", () => ({
  listConversations: mocks.listConversations,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
  toggleReelLike: mocks.toggleReelLike,
  getReelById: mocks.getReelById,
  createNotification: mocks.createNotification,
  recordReelView: mocks.recordReelView,
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = {
  id: 12,
  openId: "feature-test-user",
  name: "مستخدم اختبار",
  username: "feature_test",
  email: null,
  loginMethod: "email",
  avatarUrl: null,
  avatarKey: null,
  bio: null,
  country: null,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("الميزات المفعّلة", () => {
  it("يعيد قائمة المحادثات للمستخدم المصادق عليه", async () => {
    const rows = [{ user, lastMessage: { id: 5, senderId: 8, receiverId: user.id, content: "مرحبًا", isRead: false, createdAt: new Date() }, unreadCount: 1 }];
    mocks.listConversations.mockResolvedValue(rows);
    await expect(appRouter.createCaller(context()).messages.conversations()).resolves.toEqual(rows);
    expect(mocks.listConversations).toHaveBeenCalledWith(user.id);
  });

  it("يعلّم كل الإشعارات كمقروءة للمستخدم الحالي", async () => {
    await expect(appRouter.createCaller(context()).notifications.readAll()).resolves.toEqual({ success: true });
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith(user.id);
  });

  it("يسجل تفاعل الإعجاب والمشاهدة للريل", async () => {
    mocks.toggleReelLike.mockResolvedValue({ liked: true });
    mocks.getReelById.mockResolvedValue({ id: 31, userId: 44 });
    mocks.recordReelView.mockResolvedValue({ counted: true });
    const caller = appRouter.createCaller(context());

    await expect(caller.reels.toggleLike({ reelId: 31 })).resolves.toEqual({ liked: true });
    await expect(caller.reels.view({ reelId: 31 })).resolves.toEqual({ counted: true });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 44, actorId: user.id, type: "like", entityId: 31 }));
    expect(mocks.recordReelView).toHaveBeenCalledWith(31, user.id);
  });
});
