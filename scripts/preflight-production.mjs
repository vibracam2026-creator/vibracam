#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const envFile = resolve(envFileArg?.slice("--env-file=".length) || ".env.production");
const errors = [];
const warnings = [];

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function required(values, key) {
  const value = values[key]?.trim();
  if (!value || /replace_with|your_|example\.com|placeholder/i.test(value)) {
    errors.push(`${key} غير مضبوط بقيمة إنتاج حقيقية.`);
    return "";
  }
  return value;
}

function mark(label, status, detail = "") {
  console.log(`${status === "ok" ? "[OK]" : status === "warn" ? "[WARN]" : "[FAIL]"} ${label}${detail ? ` — ${detail}` : ""}`);
}

let text;
try {
  text = await readFile(envFile, "utf8");
} catch {
  console.error(`[FAIL] ملف البيئة غير موجود: ${envFile}`);
  process.exit(1);
}

const values = parseEnv(text);
const nodeEnv = required(values, "NODE_ENV");
if (nodeEnv !== "production") errors.push("NODE_ENV يجب أن يساوي production.");
required(values, "MYSQL_DATABASE");
required(values, "MYSQL_USER");
required(values, "MYSQL_PASSWORD");
required(values, "MYSQL_ROOT_PASSWORD");
const jwt = required(values, "JWT_SECRET");
if (jwt && jwt.length < 32) errors.push("JWT_SECRET يجب أن يكون بطول 32 حرفًا على الأقل.");
const publicUrl = required(values, "PUBLIC_URL");
const clientUrl = required(values, "CLIENT_URL");
for (const [key, value] of [["PUBLIC_URL", publicUrl], ["CLIENT_URL", clientUrl]]) {
  if (!value) continue;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") errors.push(`${key} يجب أن يستخدم HTTPS في الإنتاج.`);
  } catch {
    errors.push(`${key} ليس رابطًا صالحًا.`);
  }
}
if (publicUrl && clientUrl && publicUrl.replace(/\/$/, "") !== clientUrl.replace(/\/$/, "")) warnings.push("PUBLIC_URL وCLIENT_URL مختلفان؛ تحقق من أن ذلك مقصود وأن CSRF وOAuth مضبوطتان للنطاقين.");
if (values.TRUST_PROXY !== "1" && values.TRUST_PROXY !== "true") warnings.push("TRUST_PROXY ليس 1/true؛ إذا كان التطبيق خلف Nginx أو Proxy يجب ضبطه حتى تُكتشف HTTPS والـ IP بصورة صحيحة.");
required(values, "RESEND_API_KEY");
required(values, "RESEND_FROM_EMAIL");
if (!values.LOCAL_STORAGE_DIR && !(values.BUILT_IN_FORGE_API_URL && values.BUILT_IN_FORGE_API_KEY)) errors.push("اضبط LOCAL_STORAGE_DIR أو BUILT_IN_FORGE_API_URL مع BUILT_IN_FORGE_API_KEY للتخزين.");
if (values.BUILT_IN_FORGE_API_URL && !values.BUILT_IN_FORGE_API_KEY) errors.push("BUILT_IN_FORGE_API_URL موجود لكن BUILT_IN_FORGE_API_KEY مفقود.");
if (values.BUILT_IN_FORGE_API_KEY && !values.BUILT_IN_FORGE_API_URL) errors.push("BUILT_IN_FORGE_API_KEY موجود لكن BUILT_IN_FORGE_API_URL مفقود.");
if (!values.OAUTH_SERVER_URL || !values.VITE_APP_ID) warnings.push("OAuth غير مضبوط؛ تسجيل الدخول المحلي سيعمل، لكن تسجيل الدخول عبر OAuth لن يعمل.");
if (!values.TURN_SERVER_URL && !values.TURN_URL) warnings.push("TURN غير مضبوط؛ WebRTC قد يفشل بين بعض شبكات الهاتف والإنتاج.");

try {
  const permissions = (await stat(envFile)).mode & 0o777;
  if ((permissions & 0o077) !== 0) errors.push(`صلاحيات ${envFile} واسعة؛ اجعلها 600 أو أقل.`);
} catch {
  errors.push("تعذر قراءة صلاحيات ملف البيئة.");
}

mark("ملف البيئة", "ok", envFile);
mark("متغيرات النطاق وHTTPS", errors.some((item) => item.includes("PUBLIC_URL") || item.includes("CLIENT_URL")) ? "fail" : "ok");
mark("JWT_SECRET", errors.some((item) => item.includes("JWT_SECRET")) ? "fail" : "ok", "القيمة لا تُطبع");
mark("البريد", errors.some((item) => item.startsWith("RESEND")) ? "fail" : "ok");
mark("التخزين", errors.some((item) => item.includes("التخزين") || item.includes("BUILT_IN_FORGE")) ? "fail" : "ok");
for (const warning of warnings) mark("تنبيه", "warn", warning);
for (const error of errors) mark("فشل", "fail", error);

if (errors.length) {
  console.error(`\nفشل فحص ما قبل النشر: ${errors.length} مشكلة.`);
  process.exit(1);
}
console.log("\nنجح فحص ما قبل النشر. ما زال يجب اختبار الخدمات الخارجية ونسخة الاستعادة قبل فتح الموقع للعامة.");
