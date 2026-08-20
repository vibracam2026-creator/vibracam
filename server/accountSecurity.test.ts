import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeAccountToken: vi.fn(),
  getActiveAccountToken: vi.fn(),
  getLocalAccountByEmail: vi.fn(),
  hashPassword: vi.fn(),
  markEmailVerified: vi.fn(),
  sendAccountEmail: vi.fn(),
  updateLocalPassword: vi.fn(),
  revokeAllAuthSessions: vi.fn(),
}));

vi.mock("./db", () => ({
  consumeAccountToken: mocks.consumeAccountToken,
  getActiveAccountToken: mocks.getActiveAccountToken,
  getLocalAccountByEmail: mocks.getLocalAccountByEmail,
  markEmailVerified: mocks.markEmailVerified,
  updateLocalPassword: mocks.updateLocalPassword,
  revokeAllAuthSessions: mocks.revokeAllAuthSessions,
  createAccountToken: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("./localAuth", () => ({ hashPassword: mocks.hashPassword, normalizeEmail: (value: string) => value.trim().toLowerCase() }));
vi.mock("./resend", () => ({ sendAccountEmail: mocks.sendAccountEmail }));

import { requestPasswordReset, resetPasswordWithToken, verifyEmailToken } from "./accountSecurity";

describe("أمان الحساب", () => {
  it("لا يكشف وجود حساب من عدمه عند طلب استعادة كلمة المرور", async () => {
    mocks.getLocalAccountByEmail.mockResolvedValue(undefined);
    await expect(requestPasswordReset("absent@vibracam.test", "https://vibracam.test")).resolves.toBeUndefined();
    expect(mocks.sendAccountEmail).not.toHaveBeenCalled();
  });

  it("يستهلك رمز تأكيد البريد مرة واحدة ويحدّث حالة التحقق", async () => {
    mocks.getActiveAccountToken.mockResolvedValue({ id: 12, userId: 7 });
    await expect(verifyEmailToken("a-very-long-secure-token-value")).resolves.toBeUndefined();
    expect(mocks.consumeAccountToken).toHaveBeenCalledWith(12);
    expect(mocks.markEmailVerified).toHaveBeenCalledWith(7);
  });

  it("يحدّث تجزئة كلمة المرور فقط بعد قبول رمز استعادة نشط", async () => {
    mocks.getActiveAccountToken.mockResolvedValue({ id: 18, userId: 9 });
    mocks.hashPassword.mockResolvedValue("hashed-new-password");
    await resetPasswordWithToken("another-long-secure-token-value", "StrongPassword_2026");
    expect(mocks.updateLocalPassword).toHaveBeenCalledWith(9, "hashed-new-password");
    expect(mocks.revokeAllAuthSessions).toHaveBeenCalledWith(9);
    expect(mocks.consumeAccountToken).toHaveBeenCalledWith(18);
  });
});
