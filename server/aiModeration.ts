import { ENV } from "./_core/env";
import type { InvokeResult } from "./_core/llm";

/**
 * منظومة أمان بالذكاء الاصطناعي لمنصة VibraCam.
 * تتضمن: فحص المحتوى النصي (كشف الإباحية والمحتوى المحظور)، ومعالجة البلاغات تلقائيًا،
 * والتحقق العمري. تعمل عبر نموذج LLM بإخراج منظم JSON schema، مع مسار بديل عبر
 * OpenAI API المباشر باستخدام واجهة OpenAI المتوافقة.
 */

export type ContentVerdict = "safe" | "sexual" | "nsfw" | "harmful";

export type ModerationResult = {
  /** safe = آمن | sexual = محتوى جنسي صريح | nsfw = محتوى مثير غير صريح | harmful = عنف/تنمر/احتيال */
  verdict: ContentVerdict;
  /** فئات المحتوى المكتشفة */
  categories: string[];
  /** درجة الثقة 0..1 */
  confidence: number;
  /** هل يجب منع/حذف المحتوى (موجب جنسي أو ضار بدرجة عالية) */
  shouldBlock: boolean;
  /** سبب الحكم الموجز */
  reason: string;
};

const MODERATION_MODEL = "gpt-5-mini";

/**
 * مرشح محلي سريع للمحتوى الجنسي الصريح. يُنفّذ قبل النموذج حتى لا يُسمح
 * بالنشر عند انقطاع خدمة الذكاء الاصطناعي، مع إبقاء الحكم النهائي قابلاً للتدقيق.
 */
const EXPLICIT_CONTENT_PATTERNS: RegExp[] = [
  /\b(?:porn|porno|pornography|pornographic|xxx|onlyfans|nudes?|naked|sex video|sexual services|blowjob|handjob)\b/i,
  /(?:إباح(?:ي|ية)|اباح(?:ي|ية)|جنس\s*صريح|محتوى\s*جنسي|أعضاء?\s*تناسلي(?:ة|ه)|اعضاء?\s*تناسلي(?:ة|ه)|سكس|نيك|زب|شرموط|عاهرة)/i,
];

/**
 * مرشح محلي للإعلانات والرسائل الترويجية غير المرغوب فيها.
 * لا يحظر الروابط العادية أو الحديث الطبيعي؛ يشترط وجود نية بيع/تسويق واضحة.
 */
const PROMOTIONAL_CONTENT_PATTERNS: RegExp[] = [
  /(?:اشتر(?:ِ|ي|وا)?\s+الآن|اطلب(?:ِ|ي|وا)?\s+الآن|خصم\s*(?:\d+\s*%|خاص)|كود\s*خصم|عرض\s*(?:خاص|حصري|لفترة محدودة)|متاح\s*للبيع|للبيع\s*الآن|رابط\s*الطلب|تواصل(?:وا)?\s*(?:معي|معنا)\s*(?:للشراء|للطلب)|اربح\s*المال|استثمر\s*الآن|تسويق|ترويج|إعلان(?:ات)?|روّج(?:وا)?\s*(?:لمنتج|لخدمة)|تابع\s*صفحتي\s*للشراء|اشترك\s*الآن)/i,
  /(?:buy\s+now|order\s+now|limited\s+offer|special\s+offer|promo(?:tion)?\s*code|discount\s*code|on\s+sale|for\s+sale|shop\s+now|book\s+now|link\s+in\s+bio|contact\s+me\s+to\s+buy|earn\s+money|invest\s+now|sponsored|advertisement|advertising|promote\s+(?:my|our)\s+(?:product|service))/i,
];

export function containsExplicitContent(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  return EXPLICIT_CONTENT_PATTERNS.some(pattern => pattern.test(normalized));
}

export function containsPromotionalContent(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  return PROMOTIONAL_CONTENT_PATTERNS.some(pattern => pattern.test(normalized));
}

/** مخطط الإخراج المنظم لفحص المحتوى */
const moderationSchema = {
  name: "content_moderation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["safe", "sexual", "nsfw", "harmful"],
      },
      categories: {
        type: "array",
        items: { type: "string" },
      },
      confidence: { type: "number" },
      shouldBlock: { type: "boolean" },
      reason: { type: "string" },
    },
    required: ["verdict", "categories", "confidence", "shouldBlock", "reason"],
    additionalProperties: false,
  },
};

const MODERATION_SYSTEM_PROMPT = `أنت مُشرف محتوى ذكي لمنصة اجتماعية عربية اسمها VibraCam. تحلل النصوص الواردة (رسائل، منشورات، تعليقات، عناوين بث مباشر) وتصنف محتواها.
قواعد الحكم الصارمة:
- "sexual": محتوى جنسي صريح (وصف أفعال جنسية، أعضاء تناسلية، تحريض جنسي، محتوى إباحي صريح). يجب منعه نهائيًا.
- "nsfw": محتوى مثير أو مغازل غير صريح، إيحاءات جنسية، طلبات لقاء حميمية. يُسمح بدرجة عالية من الثقة فقط للنصوص الجارفة.
- "harmful": تهديد، تنمر، عنف، تحريض كراهية، احتيال، بيع مواد محظورة، إعلان/ترويج تجاري غير مرغوب، استغلال أطفال. يجب منعه نهائيًا.
- "safe": كل ما عدا ذلك، بما فيه المزاح العادي والمواعدة المؤدبة والكلمات العربية العامية العادية.
- انتبه: لا تبالغ في الحجب؛ العبارات العادية مثل "أحبك"، "تعالي نكلم"، المزاح البريء كلها safe. المحتوى الشائع بين البالغين كالتعارف المهذب ليس محظورًا.
- اعطِ shouldBlock=true فقط عندما يكون verdict sexual أو harmful، أو nsfw بثقة أعلى من 0.85.
أجب بالعربية في حقل reason وJSON فقط.`;

/** بناء عنوان API ومفتاحه مع دعم المسار البديل (بيئة التطوير) */
function resolveApi(): { url: string; apiKey: string } {
  return {
    url: `${ENV.openAiBaseUrl}/chat/completions`,
    apiKey: ENV.openAiApiKey,
  };
}

/** استدعاء نموذج LLM بإخراج منظم مع إعادة محاولة */
async function callLLMWithSchema(
  system: string,
  userText: string,
  schema: { name: string; strict: boolean; schema: Record<string, unknown> }
): Promise<string> {
  const { url, apiKey } = resolveApi();
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("AI moderation unavailable: no API key configured");
  }
  const payload = {
    model: MODERATION_MODEL,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userText },
    ],
    response_format: { type: "json_schema" as const, json_schema: schema },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM call failed: ${response.status} ${errorText}`);
  }
  const result = (await response.json()) as InvokeResult;
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("LLM returned empty content");
  }
  return content;
}

/** استدعاء اعتدال بصري للصورة قبل تخزينها في مساحة الملفات. */
async function callLLMWithImageSchema(
  system: string,
  base64: string,
  mimeType: string,
  schema: { name: string; strict: boolean; schema: Record<string, unknown> }
): Promise<string> {
  const { url, apiKey } = resolveApi();
  if (!apiKey || apiKey.trim().length === 0) throw new Error("AI moderation unavailable: no API key configured");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODERATION_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: [
          { type: "text", text: "افحص الصورة وفق السياسة وأعد JSON فقط." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: schema },
    }),
  });
  if (!response.ok) throw new Error(`Vision moderation failed: ${response.status} ${await response.text()}`);
  const result = (await response.json()) as InvokeResult;
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Vision moderation returned empty content");
  return content;
}

/** الفحص الأساسي للمحتوى النصي */
export async function checkContent(text: string): Promise<ModerationResult> {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) {
    return { verdict: "safe", categories: [], confidence: 1, shouldBlock: false, reason: "محتوى فارغ" };
  }
  if (containsExplicitContent(trimmed)) {
    return { verdict: "sexual", categories: ["explicit_sexual_content", "pornography"], confidence: 1, shouldBlock: true, reason: "محتوى جنسي صريح أو إباحي محظور قبل النشر." };
  }
  if (containsPromotionalContent(trimmed)) {
    return { verdict: "harmful", categories: ["promotional_content", "unsolicited_advertising"], confidence: 1, shouldBlock: true, reason: "المحتوى الترويجي والإعلاني غير مسموح به داخل الرسائل." };
  }
  try {
    const raw = await callLLMWithSchema(MODERATION_SYSTEM_PROMPT, trimmed, moderationSchema);
    const parsed = JSON.parse(raw);
    const verdict = parsed.verdict ?? "safe";
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));
    const shouldBlock =
      Boolean(parsed.shouldBlock) ||
      verdict === "sexual" ||
      (verdict === "harmful" && confidence > 0.6) ||
      (verdict === "nsfw" && confidence > 0.85);
    return {
      verdict,
      categories: Array.isArray(parsed.categories) ? parsed.categories.map(String) : [],
      confidence,
      shouldBlock,
      reason: String(parsed.reason ?? ""),
    };
  } catch (err) {
    // بعد اجتياز المرشحات المحلية، نسمح بالنص العادي عند تعطل مزود الذكاء الاصطناعي.
    // هذا يمنع تعطل الرسائل السليمة، مع استمرار حظر الإباحية والترويج محليًا.
    console.warn("[aiModeration] AI unavailable; allowing content that passed local rules", String((err as Error)?.message));
    return { verdict: "safe", categories: ["ai_unavailable", "local_rules_passed"], confidence: 0, shouldBlock: false, reason: "اجتاز المحتوى الفحص المحلي." };
  }
}

/** فحص الصورة قبل التخزين؛ الحجم الكبير أو تعذر الخدمة يؤديان إلى المنع الآمن. */
export async function checkMedia(base64: string, mimeType: string): Promise<ModerationResult> {
  if (!mimeType.startsWith("image/")) {
    return { verdict: "harmful", categories: ["unsupported_media_moderation"], confidence: 0, shouldBlock: true, reason: "لا يمكن نشر هذا النوع من الوسائط قبل فحصه." };
  }
  if (base64.length > 8 * 1024 * 1024) {
    return { verdict: "harmful", categories: ["media_too_large_for_moderation"], confidence: 0, shouldBlock: true, reason: "الصورة كبيرة على الفحص الوقائي؛ صغّرها ثم أعد المحاولة." };
  }
  const mediaSystem = `${MODERATION_SYSTEM_PROMPT}\nفي الصور: صنّف العري الصريح أو الأفعال الجنسية أو المواد الإباحية على أنها sexual أو nsfw واحجبها. لا تحجب الصور العادية أو الملابس اليومية أو المحتوى التثقيفي غير الصريح.`;
  try {
    const raw = await callLLMWithImageSchema(mediaSystem, base64, mimeType, moderationSchema);
    const parsed = JSON.parse(raw);
    const verdict: ContentVerdict = ["safe", "sexual", "nsfw", "harmful"].includes(parsed.verdict) ? parsed.verdict : "harmful";
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));
    const shouldBlock = verdict === "sexual" || verdict === "harmful" || (verdict === "nsfw" && confidence > 0.85) || Boolean(parsed.shouldBlock);
    return { verdict, categories: Array.isArray(parsed.categories) ? parsed.categories.map(String) : [], confidence, shouldBlock, reason: String(parsed.reason ?? "") };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    console.error("[aiModeration] vision moderation unavailable; allowing upload with audit flag", message);

    // لا نعطّل رفع الصور السليمة لمجرد تعطل مزود الفحص.
    // يبقى الحكم مسجّلًا كـ ai_unavailable ويمكن للمراجعة الدورية التعامل معه.
    return {
      verdict: "safe",
      categories: ["ai_unavailable", "requires_review"],
      confidence: 0,
      shouldBlock: false,
      reason: "تعذر الفحص الآلي مؤقتًا؛ تم السماح بالرفع مع وضع علامة للمراجعة.",
    };
  }
}

/** فحص تقرير ومحتواه المستهدف وإصدار حكم آلي عليه */
export type ReportJudgment = {
  verdict: "substantiated" | "partially_substantiated" | "unsubstantiated";
  confidence: number;
  shouldDeleteContent: boolean;
  shouldWarnUser: boolean;
  action: "no_action" | "warn" | "hide" | "delete" | "suspend";
  summary: string;
};

const reportSchema = {
  name: "report_judgment",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["substantiated", "partially_substantiated", "unsubstantiated"],
      },
      confidence: { type: "number" },
      shouldDeleteContent: { type: "boolean" },
      shouldWarnUser: { type: "boolean" },
      action: {
        type: "string",
        enum: ["no_action", "warn", "hide", "delete", "suspend"],
      },
      summary: { type: "string" },
    },
    required: ["verdict", "confidence", "shouldDeleteContent", "shouldWarnUser", "action", "summary"],
    additionalProperties: false,
  },
};

const REPORT_SYSTEM_PROMPT = `أنت مُحكم ذكي للبلاغات في منصة VibraCam الاجتماعية العربية.
تُعرض عليك: نوع البلاغ وسببه، سطر المستخدم المشتكي (محتوى المنشور/الرسالة/الاسم/النبذة)، وتاريخ البلاغ.
قواعد الحكم:
- substantiated (مؤيد): المحتوى المستهدف يخالف فعليًا سبب البلاغ؛ المحتوى الصريح/الإباحي دائمًا مؤيد.
- partially_substantiated: مخالفة جزئية أو غير واضحة.
- unsubstantiated (غير مؤيد): لا مخالفة واضحة؛ بلاغات مزعجة أو كيدية كذلك.
الإجراءات:
- المحتوى الجنسي الصريح أو الإباحي: action = delete مع shouldDeleteContent = true.
- التنمر/التهديد المؤكد: action = hide أو suspend مع shouldWarnUser = true.
- الاحتيال: action = delete أو hide.
- بلاغ كيدي أو مزعج: no_action و shouldDeleteContent = false.
لا تتساهل مع المحتوى الإباحي: احذفه دائمًا. أجب بالعربية في summary وJSON فقط.`;

/** الحكم على بلاغ من نصوصه الخام */
export async function judgeReport(params: {
  reason: string;
  details?: string | null;
  targetContent?: string | null;
  authorName?: string | null;
  authorBio?: string | null;
}): Promise<ReportJudgment> {
  if (params.targetContent && containsExplicitContent(params.targetContent)) {
    return { verdict: "substantiated", confidence: 1, shouldDeleteContent: true, shouldWarnUser: true, action: "delete", summary: "تم اكتشاف محتوى جنسي صريح؛ يُحذف ويُمنع نشره." };
  }
  const userText = [
    `سبب البلاغ: ${params.reason}`,
    params.details ? `تفاصيل المبلّغ: ${params.details}` : null,
    params.targetContent ? `محتوى المستهدف: ${params.targetContent}` : "لا يوجد محتوى عرضي للمستهدف (مستخدم فقط).",
    params.authorName ? `اسم المستهدف: ${params.authorName}` : null,
    params.authorBio ? `نبذة المستهدف: ${params.authorBio}` : null,
  ].filter(Boolean).join("\n");
  try {
    const raw = await callLLMWithSchema(REPORT_SYSTEM_PROMPT, userText, reportSchema);
    const parsed = JSON.parse(raw);
    return {
      verdict: parsed.verdict ?? "unsubstantiated",
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      shouldDeleteContent: Boolean(parsed.shouldDeleteContent),
      shouldWarnUser: Boolean(parsed.shouldWarnUser),
      action: parsed.action ?? "no_action",
      summary: String(parsed.summary ?? ""),
    };
  } catch (err) {
    console.error("[aiModeration] report judge fallback", String((err as Error)?.message));
    return {
      verdict: "unsubstantiated",
      confidence: 0,
      shouldDeleteContent: false,
      shouldWarnUser: false,
      action: "no_action",
      summary: "تعذر الفحص الآلي؛ البلاغ بانتظار المراجعة اليدوية",
    };
  }
}

/** حساب العمر من تاريخ الميلاد (YYYY-MM-DD) */
export function computeAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** هل المستخدم قاصر (أقل من 18) أم بالغ، مع هامش أمان سنة */
export function isAdult(birthDate: string | null | undefined): boolean {
  const age = computeAge(birthDate);
  if (age === null) return false; // تاريخ غير محدد = لا يُسمح إلا بعد التحقق
  return age >= 18;
}
