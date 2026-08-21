# VibraCam production checklist

- [x] فصل المصادقة عن أي مزود خارجي.
- [x] استخدام JWT محلي وسجل جلسات في قاعدة البيانات.
- [x] فصل التخزين عن أي بوابة خارجية واستخدام S3-compatible storage.
- [x] استخدام الشعار المحلي.
- [ ] ضبط متغيرات S3 في بيئة الإنتاج.
- [ ] اختبار رفع الصور والفيديو والملفات.
- [ ] اختبار حساب الإدارة.
- [ ] اختبار جميع مسارات الإنتاج على Render.
- [x] Convert MySQL `ssl-mode=REQUIRED` into Drizzle/mysql2 native SSL config for Aiven.
- [ ] Verify Render DATABASE_URL credentials against the current Aiven password.
