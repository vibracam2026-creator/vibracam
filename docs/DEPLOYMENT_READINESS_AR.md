# جاهزية نشر VibraCam المستقلة

هذه النسخة مستقلة بالكامل. المصادقة محلية، الجلسات عبر JWT، وقاعدة البيانات MySQL، والوسائط عبر S3-compatible object storage.

## المتغيرات المطلوبة

- `NODE_ENV=production`
- `PORT`
- `PUBLIC_URL`
- `CLIENT_URL`
- `DATABASE_URL`
- `JWT_SECRET`
- `OWNER_EMAIL`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

المتغيرات الاختيارية:
- `S3_PUBLIC_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `GOOGLE_MAPS_API_KEY`

لا تضع الأسرار داخل المستودع.
