import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyResendConnection } from "./resend";

describe("ربط Resend", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid payload", { status: 422 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("يتحقق من مفتاح API عبر نقطة فحص لا ترسل رسالة بريدية", async () => {
    expect(process.env.RESEND_API_KEY).toBeTruthy();
    await expect(verifyResendConnection()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST", body: "{}" })
    );
  });
});

