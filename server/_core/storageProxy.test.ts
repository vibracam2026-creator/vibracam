import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveAuthSession: vi.fn(),
  getUserById: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock("../db", () => ({
  getActiveAuthSession: mocks.getActiveAuthSession,
  getUserById: mocks.getUserById,
}));
vi.mock("../sessionSecurity", () => ({
  hashSessionToken: (token: string) => `hash:${token}`,
  readCookie: () => "local-session-token",
}));
vi.mock("./sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./env", () => ({ ENV: {} }));

import { authenticateStorageRequest, normalizeStorageKey } from "./storageProxy";

describe("authenticateStorageRequest", () => {
  it("يقبل جلسة الدخول المحلية لعرض وسائط مالك الحساب", async () => {
    mocks.getActiveAuthSession.mockResolvedValue({ userId: 150003 });
    mocks.getUserById.mockResolvedValue({ id: 150003, role: "admin", openId: "local-150003" });
    mocks.authenticateRequest.mockRejectedValue(new Error("لا توجد جلسة محلية"));

    const viewer = await authenticateStorageRequest({ headers: { cookie: "app_session_id=local-session-token" } } as any);

    expect(mocks.getActiveAuthSession).toHaveBeenCalledWith("hash:local-session-token");
    expect(viewer).toMatchObject({ id: 150003, role: "admin" });
  });

  it("يرفض طلب الوسائط عندما لا توجد جلسة محلية أو مُدارة", async () => {
    mocks.getActiveAuthSession.mockResolvedValue(undefined);
    mocks.authenticateRequest.mockRejectedValue(new Error("غير مصادق"));

    await expect(authenticateStorageRequest({ headers: {} } as any)).resolves.toBeNull();
  });
});

describe("normalizeStorageKey", () => {
  it("يزيل الشرطة المائلة البادئة التي قد تضيفها بوابة الإنتاج", () => {
    expect(normalizeStorageKey("/vibracam-official-logo_458871da.webp")).toBe("vibracam-official-logo_458871da.webp");
    expect(normalizeStorageKey(["/vibracam", "150003", "avatar", "photo.webp"])).toBe("vibracam/150003/avatar/photo.webp");
  });
});
