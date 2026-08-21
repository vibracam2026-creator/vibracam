import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("عقود منصة VibraCam", () => {
  it("يعيد المستخدم الحالي عبر الإجراء العام auth.me", async () => {
    const user = {
      id: 7,
      openId: "test-open-id",
      name: "مستخدم اختبار",
      username: "tester",
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
    const caller = appRouter.createCaller(createContext(user));

    await expect(caller.auth.me()).resolves.toEqual(user);
  });

  it("يرفض إنشاء منشور دون جلسة مصادق عليها", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.posts.create({ content: "منشور تجريبي" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("يمسح كوكي الجلسة عند تسجيل الخروج", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledTimes(1);
  });

  it("يمنع المستخدم العادي من إجراءات الإدارة", async () => {
    const user = { id: 8, openId: "regular-user", name: "مستخدم عادي", username: "regular", email: null, loginMethod: "email", avatarUrl: null, avatarKey: null, bio: null, country: null, role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const caller = appRouter.createCaller(createContext(user));

    await expect(caller.admin.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
