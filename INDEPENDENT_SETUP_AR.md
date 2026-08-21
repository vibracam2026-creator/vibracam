# VibraCam — النسخة المستقلة

## المصادقة
- تسجيل محلي بالبريد وكلمة المرور.
- جلسات JWT عبر `JWT_SECRET`.
- Passkeys و2FA يبقيان ضمن النظام المحلي.
- حساب `OWNER_EMAIL` يُمنح دور الإدارة عند التسجيل أو تسجيل الدخول.

## التخزين
يستخدم المشروع S3-compatible object storage. يدعم AWS S3 وCloudflare R2 وBackblaze B2 وMinIO.

المتغيرات:
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` (اختياري)

لا تعتمد الملفات على قرص Render المحلي.

## الذكاء الاصطناعي الاختياري
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`

## الخرائط الاختيارية
- `GOOGLE_MAPS_API_KEY`

## البريد
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## قاعدة البيانات
`DATABASE_URL` هو رابط MySQL. إعداد الاتصال يزيل خيار `ssl-mode` من query string ويحوّله إلى إعداد SSL في mysql2 لتجنب تحذير الاتصال السابق.

## Render
Build:
`corepack pnpm install --frozen-lockfile && corepack pnpm run build`

Start:
`corepack pnpm run db:migrate && corepack pnpm run start`

يجب ضبط المتغيرات في Render، ولا تُرفع الأسرار إلى GitHub.
