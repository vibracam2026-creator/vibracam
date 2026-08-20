import { checkContent, judgeReport, computeAge, isAdult } from "../server/aiModeration";

async function main() {
  console.log("--- عمر 2000-01-01:", computeAge("2000-01-01"), "isAdult:", isAdult("2000-01-01"));
  console.log("--- عمر 2015-01-01:", computeAge("2015-01-01"), "isAdult:", isAdult("2015-01-01"));

  const safe = await checkContent("مرحبًا، كيف حالك اليوم؟ أتمنى لك يومًا سعيدًا");
  console.log("--- محتوى آمن:", JSON.stringify({ verdict: safe.verdict, block: safe.shouldBlock, reason: safe.reason.slice(0, 60) }));

  const explicit = await checkContent("أريد إرسال صور إباحية صريحة وعري");
  console.log("--- محتوى إباحي:", JSON.stringify({ verdict: explicit.verdict, block: explicit.shouldBlock, reason: explicit.reason.slice(0, 60) }));

  const harass = await checkContent("أنت شخص تافه وغبي أتمنى لك الموت");
  console.log("--- محتوى تنمر:", JSON.stringify({ verdict: harass.verdict, block: harass.shouldBlock, reason: harass.reason.slice(0, 60) }));

  const judgment = await judgeReport({
    reason: "inappropriate_content",
    details: "محتوى جنسي صريح في منشور",
    targetContent: "أريد إرسال صور إباحية صريحة وعري",
    authorName: null,
    authorBio: null,
  });
  console.log("--- حكم بلاغ:", JSON.stringify(judgment));
}

main().then(() => process.exit(0)).catch(err => { console.error("AI test failed:", err?.message); process.exit(1); });
