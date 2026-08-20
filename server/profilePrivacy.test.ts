import { describe, expect, it } from "vitest";
import { toPublicUser } from "./db";

describe("خصوصية بيانات الملف الشخصي", () => {
  it("يحذف كل الحقول الحساسة من استجابة الملف العام", () => {
    const visitorProfile = toPublicUser({
      id: 17,
      openId: "private-open-id",
      name: "مستخدم خاص",
      firstName: "مستخدم",
      lastName: "خاص",
      username: "private_member",
      email: "private@vibracam.test",
      phoneNumber: "+966500000000",
      dateOfBirth: "2000-01-01",
      loginMethod: "email",
      role: "user",
      lastSignedIn: new Date(),
      avatarUrl: null,
      avatarKey: null,
      coverUrl: null,
      coverKey: null,
      bio: "نبذة عامة",
      country: "السعودية",
      city: "الرياض",
      gender: "prefer_not_to_say",
      websiteUrl: "https://vibracam.test",
      socialLinks: null,
      timeZone: "Asia/Riyadh",
      defaultCurrency: "SAR",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Parameters<typeof toPublicUser>[0]);

    expect(visitorProfile).toMatchObject({ id: 17, username: "private_member", city: "الرياض" });
    expect(visitorProfile).not.toHaveProperty("openId");
    expect(visitorProfile).not.toHaveProperty("email");
    expect(visitorProfile).not.toHaveProperty("phoneNumber");
    expect(visitorProfile).not.toHaveProperty("dateOfBirth");
    expect(visitorProfile).not.toHaveProperty("loginMethod");
    expect(visitorProfile).not.toHaveProperty("role");
    expect(visitorProfile).not.toHaveProperty("lastSignedIn");
  });
});
