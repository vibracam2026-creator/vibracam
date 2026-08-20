import { describe, expect, it } from "vitest";
import { appendEmojiToDraft, quickEmojis } from "../client/src/lib/emojis";

describe("لوحة الإيموجيات", () => {
  it("تحتوي على مجموعة من الإيموجيات السريعة", () => {
    expect(quickEmojis.length).toBeGreaterThanOrEqual(24);
    expect(quickEmojis).toContain("💜");
  });

  it("تدرج الإيموجي في نهاية مسودة الرسالة دون حذف محتواها", () => {
    expect(appendEmojiToDraft("أهلًا ", "✨")).toBe("أهلًا ✨");
  });
});
