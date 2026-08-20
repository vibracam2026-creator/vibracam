import { describe, expect, it } from "vitest";

describe("Resend configuration", () => {
  it.skip("authenticates against the lightweight domains endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL;

    expect(apiKey).toMatch(/^re_/);
    expect(fromAddress).toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
  }, 15_000);
});
