import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerLocalAccount: vi.fn(),
  loginLocalAccount: vi.fn(),
  createSessionToken: vi.fn(),
  createAuthSession: vi.fn().mockResolvedValue(undefined),
  requestEmailVerification: vi.fn().mockResolvedValue({ alreadyVerified: false }),
}));

vi.mock("./localAuth", () => ({
  LocalAuthError: class LocalAuthError extends Error {},
  registerLocalAccount: mocks.registerLocalAccount,
  loginLocalAccount: mocks.loginLocalAccount,
}));

vi.mock("./_core/sdk", () => ({
  sdk: { createSessionToken: mocks.createSessionToken },
}));

vi.mock("./db", () => ({
  getMinorRestriction: vi.fn().mockResolvedValue(null),
  getTwoFactorAuthSecret: vi.fn().mockResolvedValue(null),
  createAuthSession: mocks.createAuthSession,
  listOpenReports: vi.fn().mockResolvedValue([]),
}));

vi.mock("./accountSecurity", () => ({
  requestEmailVerification: mocks.requestEmailVerification,
  requestParentalConsent: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  verifyEmailToken: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const localUser = {
  id: 24,
  openId: "local_test-session",
  name: "مستخدم اختبار",
  username: "test_member",
  email: "member@vibracam.test",
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

function context() {
  const cookie = vi.fn();
  const ctx = {
    user: null,
    req: { protocol: "https", headers: {} },
    res: { cookie, clearCookie: vi.fn() },
  } as unknown as TrpcContext;
  return { ctx, cookie };
}

describe("جلسة المصادقة المحلية", () => {
  it("ينشئ الحساب ويصدر كوكي جلسة محميًا", async () => {
    mocks.registerLocalAccount.mockResolvedValue(localUser);
    mocks.createSessionToken.mockResolvedValue("local-signed-session");
    const { ctx, cookie } = context();

    const result = await appRouter.createCaller(ctx).auth.register({
      firstName: "مستخدم",
      lastName: "اختبار",
      username: "test_member",
      email: "member@vibracam.test",
      password: "StrongPassword_2026",
      dateOfBirth: "2000-01-01",
      country: "السعودية",
      city: "الرياض",
    });

    expect(result).toEqual({ ...localUser, ageStatus: "adult", restriction: null });
    expect(cookie).toHaveBeenCalledWith(expect.any(String), "local-signed-session", expect.objectContaining({ httpOnly: true, path: "/", maxAge: expect.any(Number) }));
    expect(mocks.requestEmailVerification).toHaveBeenCalledWith(localUser.id, "https://localhost");
  });

  it("يسجل الدخول ويصدر جلسة للمستخدم نفسه", async () => {
    mocks.loginLocalAccount.mockResolvedValue(localUser);
    mocks.createSessionToken.mockResolvedValue("local-login-session");
    const { ctx, cookie } = context();

    await expect(appRouter.createCaller(ctx).auth.login({ email: "member@vibracam.test", password: "StrongPassword_2026" })).resolves.toEqual({ ...localUser, ageStatus: "adult", restriction: null });
    expect(cookie).toHaveBeenCalledWith(expect.any(String), "local-login-session", expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true }));
  });
});
