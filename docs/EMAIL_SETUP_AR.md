# إعداد البريد الإلكتروني في VibraCam

## سبب الرسالة

تظهر رسالة **«عنوان البريد المُرسِل غير مُعد.»** عندما يحاول الخادم إرسال رسالة تأكيد البريد أو إعادة تعيين كلمة المرور، بينما لا يجد المتغير `RESEND_FROM_EMAIL` في بيئة التشغيل. مصدر الرسالة هو الدالة `getFromAddress()` في `server/resend.ts`، وهي تقرأ المتغير ثم توقف الإرسال إذا كان فارغًا.

وجود `RESEND_API_KEY` وحده لا يكفي؛ يجب ضبط عنوان المُرسِل أيضًا. لا ينبغي وضع مفتاح API أو بيانات اعتماد حقيقية في المستودع.

## الإعداد المطلوب

أنشئ ملف `.env` محليًا أو أضف المتغيرات نفسها إلى إعدادات بيئة النشر:

```dotenv
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL="VibraCam <noreply@your-verified-domain.example>"
```

استبدل `your_resend_api_key_here` بمفتاح Resend الحقيقي، واستبدل `your-verified-domain.example` بنطاق تملكه وتحققت منه داخل حساب Resend. صيغة الاسم الظاهر `Name <address@domain>` مدعومة في حقل `from` وفق توثيق Resend الرسمي [1] [2].

## ترتيب التحقق

أولًا، أضف النطاق في لوحة Resend وأكمل سجلات DNS المطلوبة حتى تظهر حالته **Verified**. توضح وثائق Resend أن الإرسال يتطلب إضافة نطاق تملكه والتحقق منه، وبعد التحقق يمكن استخدام أي عنوان على ذلك النطاق دون إنشاء صندوق بريد منفصل [1] [2].

ثانيًا، أنشئ مفتاح API مناسبًا، ثم أضف `RESEND_API_KEY` و`RESEND_FROM_EMAIL` إلى بيئة الخادم التي يعمل فيها التطبيق. لا تضع هذه القيم في ملفات الواجهة الأمامية أو في متغيرات تبدأ بـ `VITE_`، ولا ترفع ملف `.env` إلى Git.

ثالثًا، أعد تشغيل الخادم بعد حفظ المتغيرات؛ قراءة `process.env` تتم من عملية الخادم، لذلك لن يظهر التغيير في عملية قائمة ما لم تُعد تشغيلها أو تعيد نشرها.

رابعًا، جرّب تسجيل حساب جديد أو مسار **نسيت كلمة المرور**. إذا انتقلت الرسالة من «عنوان المُرسِل غير مُعد» إلى خطأ من Resend، فهذا يعني أن متغير العنوان صار مقروءًا وأن الخطوة التالية هي معالجة استجابة Resend، مثل عدم تطابق النطاق أو المفتاح.

## فحص سريع دون إرسال رسالة

يمكن التحقق من وجود المتغيرين محليًا دون طباعة قيمتهما:

```bash
node -e "for (const k of ['RESEND_API_KEY','RESEND_FROM_EMAIL']) console.log(k, process.env[k] ? 'configured' : 'missing')"
```

يجب تشغيل الأمر في نفس بيئة الخادم أو مع تحميل ملف البيئة. لا تستخدم `echo $RESEND_API_KEY` ولا تسجل القيمة في السجلات.

## ما تم تحديثه في هذه النسخة

أُضيف ملف `.env.example` يحتوي على أسماء المتغيرات وقيمًا وهمية فقط، وأُضيف هذا الدليل إلى `docs/EMAIL_SETUP_AR.md`. لم أضع عنوانًا حقيقيًا أو مفتاح API في الأرشيف، لأن عنوان المُرسِل يجب أن يكون نطاقًا يملكه صاحب حساب Resend ويكون موثّقًا لديه.

## References

[1]: https://resend.com/docs/dashboard/domains/introduction "Resend: Verified Domains"
[2]: https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend "Resend: Sender email addresses"
[3]: https://resend.com/docs/api-reference/emails/send-email "Resend API: Send Email"
