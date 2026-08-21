#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const envFileArg = process.argv.find(arg => arg.startsWith("--env-file="));
const envFile = resolve(envFileArg?.slice("--env-file=".length) || ".env.production");
const errors = [];
const warnings = [];

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
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
if (required(values, "NODE_ENV") !== "production") errors.push("NODE_ENV يجب أن يساوي production.");
required(values, "DATABASE_URL");
const jwt = required(values, "JWT_SECRET");
if (jwt && jwt.length < 32) errors.push("JWT_SECRET يجب أن يكون بطول 32 حرفًا على الأقل.");
const publicUrl = required(values, "PUBLIC_URL");
const clientUrl = required(values, "CLIENT_URL");
for (const [key, value] of [["PUBLIC_URL", publicUrl], ["CLIENT_URL", clientUrl]]) {
  if (!value) continue;
  try {
    if (new URL(value).protocol !== "https:") errors.push(`${key} يجب أن يستخدم HTTPS في الإنتاج.`);
  } catch {
    errors.push(`${key} ليس رابطًا صالحًا.`);
  }
}
if (publicUrl && clientUrl && publicUrl.replace(/\/$/, "") !== clientUrl.replace(/\/$/, "")) {
  warnings.push("PUBLIC_URL وCLIENT_URL مختلفان؛ تحقق من أنهما مقصودان.");
}
required(values, "OWNER_EMAIL");
for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) required(values, key);
if (!values.S3_ENDPOINT) warnings.push("S3_ENDPOINT فارغ؛ هذا مناسب لـ AWS S3، أما R2/B2/MinIO فتحتاج نقطة النهاية الخاصة بها.");
if (!values.RESEND_API_KEY || !values.RESEND_FROM_EMAIL) warnings.push("البريد الصادر غير مضبوط؛ بعض ميزات التحقق واستعادة كلمة المرور قد لا تعمل.");
if (!values.OPENAI_API_KEY) warnings.push("OPENAI_API_KEY غير مضبوط؛ ميزات الذكاء الاصطناعي ستبقى غير متاحة.");
if (!values.GOOGLE_MAPS_API_KEY) warnings.push("GOOGLE_MAPS_API_KEY غير مضبوط؛ الخرائط ستبقى غير متاحة.");

try {
  const permissions = (await stat(envFile)).mode & 0o777;
  if ((permissions & 0o077) !== 0) warnings.push(`صلاحيات ${envFile} واسعة؛ يفضل جعلها 600.`);
} catch {}

mark("ملف البيئة", "ok", envFile);
mark("النطاق وHTTPS", errors.some(item => item.includes("PUBLIC_URL") || item.includes("CLIENT_URL")) ? "fail" : "ok");
mark("JWT_SECRET", errors.some(item => item.includes("JWT_SECRET")) ? "fail" : "ok", "القيمة لا تُطبع");
mark("قاعدة البيانات", errors.some(item => item.includes("DATABASE_URL")) ? "fail" : "ok");
mark("التخزين", errors.some(item => item.includes("S3_")) ? "fail" : "ok");
for (const warning of warnings) mark("تنبيه", "warn", warning);
for (const error of errors) mark("فشل", "fail", error);

if (errors.length) process.exit(1);
console.log("\nنجح فحص ما قبل النشر.");
