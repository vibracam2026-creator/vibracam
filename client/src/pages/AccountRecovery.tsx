import { BrandLogo } from "@/components/BrandLogo";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

function AccountFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { lang } = useLanguage();
  return <main dir={["ar", "fa", "ur"].includes(lang) ? "rtl" : "ltr"} className="vibra-bg grid min-h-screen place-items-center p-5"><section className="w-full max-w-md rounded-[2rem] glass p-7 sm:p-10"><Link href="/" className="inline-flex items-center gap-3 font-extrabold"><BrandLogo className="h-12 w-12"/><span>VibraCam</span></Link><h1 className="mt-9 text-3xl font-extrabold">{title}</h1><p className="mt-3 leading-7 text-violet-100/65">{subtitle}</p>{children}</section></main>;
}

export function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const request = trpc.auth.requestPasswordReset.useMutation({ onSuccess: () => toast.success(t("إذا كان البريد مسجلًا، أرسلنا رابط الاستعادة إليه.")), onError: error => toast.error(error.message) });
  return <AccountFrame title={t("استعادةكلمةالمرور")} subtitle={t("أدخلبريدكالإلكترونيوسنرسلرابطاآمنا")}><form onSubmit={event => { event.preventDefault(); request.mutate({ email, origin: window.location.origin }); }} className="mt-7 space-y-4"><label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{t('البريدالإلكتروني')}</span><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-pink-300/65"><Mail className="text-pink-200" size={17}/><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={t("name@example.com")} autoComplete="email" className="min-w-0 flex-1 bg-transparent py-3 outline-none"/></span></label><button disabled={request.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold gradient-button disabled:opacity-60">{request.isPending && <LoaderCircle className="animate-spin" size={18}/>} {t("إرسال رابط الاستعادة") }</button></form><p className="mt-6 text-center text-sm text-violet-100/65"><Link href="/login" className="font-bold text-pink-200">{t('العودةلتسجيلالدخول')}</Link></p></AccountFrame>;
}

export function ResetPasswordPage() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const reset = trpc.auth.resetPassword.useMutation({ onSuccess: () => { toast.success(t("تم تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.")); setLocation("/login"); }, onError: error => toast.error(error.message) });
  return <AccountFrame title={t("كلمةمرورجديدة")} subtitle={t("اختركلمةمرورقويةمن8")}><form onSubmit={event => { event.preventDefault(); if (password !== confirmPassword) return toast.error(t("كلمتا المرور غير متطابقتين.")); reset.mutate({ token, password }); }} className="mt-7 space-y-4"><PasswordField value={password} onChange={setPassword} label={t("كلمةالمرورالجديدة")} autoComplete="new-password"/><PasswordField value={confirmPassword} onChange={setConfirmPassword} label={t("تأكيدكلمةالمرور")} autoComplete="new-password"/><button disabled={!token || reset.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold gradient-button disabled:opacity-60">{reset.isPending && <LoaderCircle className="animate-spin" size={18}/>} {t("حفظ كلمة المرور") }</button></form>{!token && <p className="mt-4 text-sm text-rose-200">{t('رابطالاستعادةغيرمكتملاطلبرابطا')}</p>}</AccountFrame>;
}

export function VerifyEmailPage() {
  const { t } = useLanguage();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const verify = trpc.auth.verifyEmail.useMutation();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  useEffect(() => {
    if (!token) { setState("error"); return; }
    verify.mutate(token ? { token } : { token: "" }, { onSuccess: () => setState("success"), onError: () => setState("error") });
  // يُنفذ مرة واحدة لكل رابط تأكيد.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return <AccountFrame title={t("تأكيدالبريدالإلكتروني")} subtitle={state === "success" ? t("أصبح بريدك الإلكتروني مؤكدًا ويمكنك متابعة استخدام حسابك.") : state === "error" ? t("رابط التأكيد غير صالح أو انتهت صلاحيته.") : t("جارٍ التحقق من رابط التأكيد بأمان...")}><div className="mt-8 text-center">{state === "loading" ? <LoaderCircle className="mx-auto animate-spin text-pink-300" size={38}/> : state === "success" ? <CheckCircle2 className="mx-auto text-emerald-300" size={42}/> : <ShieldCheck className="mx-auto text-rose-300" size={42}/>}<Link href="/login" className="mt-7 inline-flex rounded-xl px-5 py-3 font-bold gradient-button">{t('الانتقاللتسجيلالدخول')}</Link></div></AccountFrame>;
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{label}</span><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-pink-300/65"><KeyRound className="text-pink-200" size={17}/><input required minLength={8} type="password" value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="min-w-0 flex-1 bg-transparent py-3 outline-none"/></span></label>;
}
