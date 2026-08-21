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


## إعداد Render النهائي

اضبط هذه المتغيرات في Render من صفحة Environment:
- `NODE_ENV=production`
- `PORT=10000`
- `PUBLIC_URL=https://vibracam.com`
- `CLIENT_URL=https://vibracam.com`
- `DATABASE_URL` من Aiven (استخدم رابط الاتصال الحالي، ولا تستخدم كلمة مرور قديمة).
- `JWT_SECRET` عشوائي بطول 64 حرفًا أو أكثر.
- `OWNER_EMAIL=vibracam.2026@gmail.com`
- متغيرات S3 الحقيقية.

لا تضع `DATABASE_URL` أو `JWT_SECRET` أو مفاتيح S3 في GitHub.

### قاعدة Aiven الموجودة

لا تنشئ قاعدة جديدة إذا كانت بيانات VibraCam الحالية موجودة في Aiven. استخدم رابط الاتصال الحالي من Aiven في `DATABASE_URL`. الـ schema والمigrations الموجودة في `drizzle/` هي التي تُطبّق على القاعدة الحالية.

### إذا ظهر `Access denied for user 'avnadmin'`

هذا يعني أن بيانات `DATABASE_URL` في Render غير صحيحة أو قديمة. انسخ Connection String الحالي من Aiven وأعد حفظ `DATABASE_URL` في Render، ثم أعد النشر.

### إذا ظهر `"" is not a function` بعد نجاح migrations

أعد النشر باستخدام **Clear build cache & deploy** في Render، لأن هذا الخطأ ظهر في سياق build cached سابق. النسخة الحالية تربط الخادم مباشرة بالمنفذ `PORT` بدل البحث عن منفذ بديل، وتستخدم `exec node dist/index.js` بعد نجاح migration.
