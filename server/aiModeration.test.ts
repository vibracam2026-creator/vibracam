import { afterEach, describe, expect, it, vi } from "vitest";
import { checkContent, containsExplicitContent, containsPromotionalContent } from "./aiModeration";

describe("فحص محتوى الرسائل", () => {
  afterEach(() => vi.restoreAllMocks());
  it("يحظر المحتوى الإباحي قبل استدعاء مزود الذكاء الاصطناعي", async () => {
    expect(containsExplicitContent("شاهد porn video الآن")).toBe(true);
    const result = await checkContent("هذا محتوى إباحي صريح");
    expect(result.shouldBlock).toBe(true);
    expect(result.verdict).toBe("sexual");
  });

  it("يحظر الإعلان والترويج التجاري الواضح", async () => {
    expect(containsPromotionalContent("اشترِ الآن واحصل على خصم 50%")).toBe(true);
    const result = await checkContent("اشترِ الآن واحصل على خصم 50%");
    expect(result.shouldBlock).toBe(true);
    expect(result.categories).toContain("promotional_content");
  });

  it("لا يعتبر الرسائل اليومية العادية ترويجًا أو محتوى إباحيًا", () => {
    const text = "أهلًا، كيف حالك اليوم؟ هل تريد أن نتحدث قليلًا؟";
    expect(containsExplicitContent(text)).toBe(false);
    expect(containsPromotionalContent(text)).toBe(false);
  });

  it("يسمح بالرسالة العادية إذا تعذر مزود الذكاء الاصطناعي", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider unavailable")));
    const result = await checkContent("أهلًا، هل وصلت إلى المنزل بخير؟");
    expect(result.shouldBlock).toBe(false);
    expect(result.verdict).toBe("safe");
    expect(result.categories).toContain("local_rules_passed");
  });
});
