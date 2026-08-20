import { PlatformShell } from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

export default function ParentalConsent() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const status = trpc.parental.status.useQuery(undefined, { refetchInterval: 5_000 });
  const request = trpc.parental.requestConsent.useMutation({
    onSuccess: data => {
      toast.success("أُرسل طلب موافقة ولي الأمر بنجاح.");
      utils.parental.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const me = trpc.auth.me.useQuery(undefined, { refetchInterval: 5_000 });
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const approved = status.data?.hasRestriction && status.data.status === "parental_approved";

  return (
    <PlatformShell>
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-pink-200">{t('الإشرافالأبوي')}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{t('تفعيلحسابالقاصرتحتالإشراف')}</h1>

        {approved ? (
          <section className="mt-8 overflow-hidden rounded-[2rem] glass p-10 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300" size={48} />
            <h2 className="mt-5 text-2xl font-bold">{t('تمتالموافقةالأبوية')}</h2>
            <p className="mt-3 leading-7 text-violet-100/65">{t('وافقوليالأمرعلىتشغيلحسابك')}</p>
            <button onClick={() => setLocation("/feed")} className="mt-7 rounded-xl px-6 py-3 gradient-button">{t('الدخولإلىالمنصة')}</button>
          </section>
        ) : (
          <section className="mt-8 overflow-hidden rounded-[2rem] glass p-8">
            <div className="flex items-start gap-4 rounded-2xl bg-amber-400/10 p-4">
              <AlertTriangle className="shrink-0 text-amber-300" size={24} />
              <div className="text-sm leading-7 text-amber-100/90">
                <p className="font-bold">{t('حسابكلميفعلبعد')}</p>
                <p>حسب سياسات المنصة، يجب أن يكون العمر 18 عامًا على الأقل للاستخدام الكامل. نظرًا لأن عمرك أقل من 18 عامًا، لا يمكن تفعيل حسابك إلا بعد <b>{t('موافقةوليالأمر')}</b> على تشغيله تحت الإشراف الأبوي.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{t('البريدالإلكترونيلوليالأمر')}</span><input value={guardianEmail} onChange={event => setGuardianEmail(event.target.value)} type="email" placeholder="guardian@example.com" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-pink-300/60" /></label>
              <label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{t('اسموليالأمراختياري')}</span><input value={guardianName} onChange={event => setGuardianName(event.target.value)} placeholder={t("مثالأحمدعلي")} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-pink-300/60" /></label>
              <button disabled={request.isPending || !guardianEmail} onClick={() => request.mutate({ guardianEmail, guardianName: guardianName || undefined, origin: window.location.origin })} className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold gradient-button disabled:opacity-60">
                {request.isPending && <LoaderCircle className="animate-spin" size={18} />}
                {request.isPending ? "جارٍ إرسال الطلب..." : "إرسال طلب موافقة ولي الأمر"}
              </button>
              {status.data?.consent?.status === "requested" && (
                <p className="text-center text-xs leading-5 text-emerald-200/80">
                  يوجد طلب موافقة مُعلّق على بريد <b>{status.data.consent.guardianEmail}</b>. سيحصل ولي الأمر على رابط للموافقة أو الرفض.
                </p>
              )}
              <p className="text-center text-xs leading-5 text-violet-100/45">
                سيصل رابط الموافقة إلى بريد ولي الأمر مباشرة، ولا يظهر رمز الموافقة داخل حسابك.
              </p>
            </div>
          </section>
        )}

        <section className="mt-6 overflow-hidden rounded-[2rem] glass p-8">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="text-pink-300" size={22} />{t('كيفيعملالإشرافالأبوي')}</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-violet-100/70">
            <li className="flex gap-3"><UserCheck className="shrink-0 text-pink-300" size={18} />يوافق ولي الأمر عبر رابط آمن خاص به (تجريبي/رفض) ويصله بريده الإلكتروني.</li>
            <li className="flex gap-3"><UserCheck className="shrink-0 text-pink-300" size={18} />{t('بعدالموافقةيفعلالحسابفيوضع')}</li>
            <li className="flex gap-3"><UserCheck className="shrink-0 text-pink-300" size={18} />{t('تظلمنظومةالذكاءالاصطناعيتراقبالمحتوى')}</li>
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
