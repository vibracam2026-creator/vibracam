import { describe, expect, it } from "vitest";
import { hashSessionToken, readCookie } from "./sessionSecurity";

describe("أمان الجلسات", () => {
  it("ينتج تجزئة ثابتة ولا يعيد رمز الجلسة الخام", () => {
    const token = "local-session-token-for-test";
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("يستخرج كوكي الجلسة المطلوب من رأس الكوكي", () => {
    expect(readCookie("theme=dark; session_id=secure-value; lang=ar", "session_id")).toBe("secure-value");
    expect(readCookie("theme=dark", "session_id")).toBeUndefined();
  });
});
