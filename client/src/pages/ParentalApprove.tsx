import { BrandLogo } from "@/components/BrandLogo";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ShieldX, ShieldCheck, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "wouter";
import { useLanguage } from "@/lib/i18n";

export function ParentalApprovePage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const utils = trpc.useUtils();
  const resolve = trpc.parental.resolve.useMutation({
    onSuccess: data => {
      toast.success(data.message);
      utils.parental.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const [decided, setDecided] = useState(false);
  useEffect(() => { if (!token) toast.error("رابط الموافقة غير مكتمل."); }, [token]);

  if (!decided) {
    return (
      <main dir="rtl" className="vibra-bg grid min-h-screen place-items-center p-5">
        <section className="w-full max-w-lg overflow-hidden rounded-[2rem] glass p-10 text-center">
          <BrandLogo className="mx-auto h-16 w-16" />
          <h1 className="mt-5 text-2xl font-extrabold">{t('موافقةوليالأمر')}</h1>
          <p className="mt-3 text-sm leading-7 text-violet-100/65">{t('هذاالرابطموجهإلىوليأمر')}</p>
          <div className="mt-7 flex justify-center gap-3">
            <button disabled={resolve.isPending} onClick={() => { resolve.mutate({ token, decision: "granted" }); setDecided(true); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white shadow-lg shadow-emerald-500/30">
              {resolve.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ShieldCheck size={17} />} أوافق على التشغيل تحت الإشراف
            </button>
            <button disabled={resolve.isPending} onClick={() => { resolve.mutate({ token, decision: "denied" }); setDecided(true); }} className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-bold text-white shadow-lg shadow-rose-500/30">
              {resolve.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <ShieldX size={17} />} أرفض الموافقة
            </button>
          </div>
        </section>
      </main>
    );
  }

  const granted = resolve.data?.ok && !resolve.data.message.includes("رفض");
  return (
    <main dir="rtl" className="vibra-bg grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-lg overflow-hidden rounded-[2rem] glass p-10 text-center">
        {granted ? <CheckCircle2 className="mx-auto text-emerald-300" size={52} /> : <ShieldX className="mx-auto text-rose-300" size={52} />}
        <h1 className="mt-5 text-2xl font-extrabold">{granted ? "تمت الموافقة" : "تم الرفض"}</h1>
        <p className="mt-3 text-sm leading-7 text-violet-100/65">{resolve.data?.message}</p>
        <p className="mt-6 text-center text-xs text-violet-100/40">{t('Vibracamحمايةالمستخدمينأولويةقصوى')}</p>
      </section>
    </main>
  );
}
