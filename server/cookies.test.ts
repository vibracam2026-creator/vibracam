import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

describe("إعدادات كوكي الجلسة", () => {
  it("لا يضع secure على HTTP المحلي حتى تحفظ المتصفحات الجلسة", () => {
    const options = getSessionCookieOptions({ protocol: "http", headers: {} } as any);
    expect(options).toMatchObject({ httpOnly: true, path: "/", sameSite: "lax", secure: false });
  });

  it("يحافظ على secure في HTTPS المباشر أو خلف البروكسي", () => {
    expect(getSessionCookieOptions({ protocol: "https", headers: {} } as any).secure).toBe(true);
    expect(getSessionCookieOptions({ protocol: "http", headers: { "x-forwarded-proto": "https" } } as any).secure).toBe(true);
  });
});
