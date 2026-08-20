import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  return <div dir="rtl" className="vibra-bg grid min-h-screen place-items-center p-5 text-white"><section className="w-full max-w-lg rounded-[2rem] glass p-9 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-pink-500/15 text-pink-300"><AlertCircle size={32}/></span><p className="mt-6 text-sm text-pink-200">{t('الرمز404')}</p><h1 className="mt-2 text-3xl font-extrabold">{t('هذهالصفحةغيرموجودة')}</h1><p className="mt-4 leading-7 text-violet-100/65">{t('قديكونالرابطغيرصحيحأو')}</p><button onClick={() => setLocation("/")} className="mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 gradient-button"><Home size={17}/>{t('العودةإلىالرئيسية')}</button></section></div>;
}
