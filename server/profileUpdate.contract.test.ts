import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  setUserInterests: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getUserById: mocks.getUserById,
  setUserInterests: mocks.setUserInterests,
  updateProfile: mocks.updateProfile,
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const adultUser = {
  id: 71,
  openId: "profile-update-test",
  name: "الاسم السابق",
  firstName: "الاسم",
  lastName: "السابق",
  username: "profile_tester",
  email: "profile@vibracam.test",
  phoneNumber: null,
  dateOfBirth: "2000-01-01",
  loginMethod: "email",
  avatarUrl: null,
  avatarKey: null,
  coverUrl: null,
  coverKey: null,
  bio: null,
  country: "السعودية",
  city: "الرياض",
  gender: null,
  websiteUrl: null,
  socialLinks: null,
  timeZone: "Asia/Riyadh",
  defaultCurrency: "SAR",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function callerFor(user = adultUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
  } as unknown as TrpcContext);
}

describe("تحديث الملف الشخصي وقيود السوق", () => {
  it("يحفظ الحقول الإضافية ويعيد تكوين الاسم العام من الاسمين المنفصلين", async () => {
    mocks.getUserById.mockResolvedValue(adultUser);
    mocks.updateProfile.mockResolvedValue({ id: adultUser.id });

    await expect(callerFor().profile.update({
      firstName: "أحمد",
      lastName: "الهاشمي",
      city: "جدة",
      phoneNumber: "+966500000000",
      gender: "male",
      websiteUrl: "https://example.test",
      socialLinks: "https://social.example.test/ahmad",
      timeZone: "Asia/Riyadh",
      defaultCurrency: "SAR",
      interestIds: [1, 2],
    })).resolves.toEqual({ id: adultUser.id });

    expect(mocks.updateProfile).toHaveBeenCalledWith(adultUser.id, expect.objectContaining({
      firstName: "أحمد",
      lastName: "الهاشمي",
      name: "أحمد الهاشمي",
      city: "جدة",
      phoneNumber: "+966500000000",
      gender: "male",
      websiteUrl: "https://example.test",
      defaultCurrency: "SAR",
    }));
    expect(mocks.setUserInterests).toHaveBeenCalledWith(adultUser.id, [1, 2]);
  });

  it("يرفض إنشاء منتج لحساب أصغر من 18 عامًا", async () => {
    const minor = { ...adultUser, id: 72, dateOfBirth: "2010-08-15" };

    await expect(callerFor(minor).marketplace.create({
      title: "منتج تجريبي",
      description: null,
      price: 1000,
      category: "إلكترونيات",
      condition: "good",
      location: "الرياض",
      images: [],
    })).rejects.toMatchObject({ message: "يجب أن يكون عمرك 18 عامًا على الأقل للبيع في السوق." });
  });
});
