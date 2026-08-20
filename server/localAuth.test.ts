import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  getLocalCredentialByEmail: vi.fn(),
  getUserById: vi.fn(),
  deleteLocalCredentialById: vi.fn(),
  getUserByUsername: vi.fn(),
  createLocalAccount: vi.fn(),
}));

vi.mock("./db", () => mocks);

import { hashPassword, LocalAuthError, normalizeEmail, registerLocalAccount, verifyPassword } from "./localAuth";

describe("المصادقة المحلية", () => {
  it("تطبع البريد الإلكتروني قبل استخدامه كهوية تسجيل", () => {
    expect(normalizeEmail("  MEMBER@VIBRACAM.TEST ")).toBe("member@vibracam.test");
  });

  it("تنشئ تجزئة مملحة وتتحقق من كلمة المرور الصحيحة فقط", async () => {
    const hash = await hashPassword("StrongPassword_2026");

    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword("StrongPassword_2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword", hash)).resolves.toBe(false);
  });

  it("يرفض صيغة التجزئة غير الصالحة", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });

  it("يوضح أن البريد مسجّل بالفعل بدل رسالة فشل عامة", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: 9 });
    mocks.getLocalCredentialByEmail.mockResolvedValue(undefined);
    mocks.getUserByUsername.mockResolvedValue(undefined);

    await expect(registerLocalAccount({ firstName: "Ahmad", lastName: "Test", username: "ahmad_test", email: "member@vibracam.test", password: "StrongPassword_2026", dateOfBirth: "1990-01-01", country: "Algeria", city: "Algiers" })).rejects.toMatchObject<Partial<LocalAuthError>>({ code: "EMAIL_EXISTS", message: expect.stringContaining("مسجّل بالفعل") });
  });

  it("يوضح أن اسم المستخدم مستخدم بالفعل بدل رسالة فشل عامة", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.getLocalCredentialByEmail.mockResolvedValue(undefined);
    mocks.getUserByUsername.mockResolvedValue({ id: 10 });

    await expect(registerLocalAccount({ firstName: "Ahmad", lastName: "Test", username: "ahmad_test", email: "another@vibracam.test", password: "StrongPassword_2026", dateOfBirth: "1990-01-01", country: "Algeria", city: "Algiers" })).rejects.toMatchObject<Partial<LocalAuthError>>({ code: "USERNAME_EXISTS", message: expect.stringContaining("اسم المستخدم") });
  });

  it("يمنع إنشاء بيانات اعتماد مكررة عندما يوجد المستخدم بالبريد دون سجل محلي سليم", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: 12, email: "member@vibracam.test" });
    mocks.getLocalCredentialByEmail.mockResolvedValue(undefined);
    mocks.getUserByUsername.mockResolvedValue(undefined);

    await expect(registerLocalAccount({ firstName: "Ahmad", lastName: "Test", username: "new_username", email: "member@vibracam.test", password: "StrongPassword_2026", dateOfBirth: "1990-01-01", country: "Algeria", city: "Algiers" })).rejects.toMatchObject<Partial<LocalAuthError>>({ code: "EMAIL_EXISTS" });
    expect(mocks.createLocalAccount).not.toHaveBeenCalled();
  });

  it("يزيل بيانات اعتماد يتيمة ثم يكمل إنشاء الحساب بدل إرجاع خطأ 500", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.getLocalCredentialByEmail.mockResolvedValue({ id: 90, userId: 660045, email: "orphan@vibracam.test" });
    mocks.getUserById.mockResolvedValue(undefined);
    mocks.getUserByUsername.mockResolvedValue(undefined);
    mocks.createLocalAccount.mockResolvedValue({ id: 15, username: "new_username" });

    await expect(registerLocalAccount({ firstName: "Ahmad", lastName: "Test", username: "new_username", email: "orphan@vibracam.test", password: "StrongPassword_2026", dateOfBirth: "1990-01-01", country: "Algeria", city: "Algiers" })).resolves.toMatchObject({ id: 15 });
    expect(mocks.deleteLocalCredentialById).toHaveBeenCalledWith(90);
  });
});
