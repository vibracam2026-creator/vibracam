import { useAuth } from "@/_core/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { trpc } from "@/lib/trpc";
import { useLanguage, COUNTRIES, WORLD_REGIONS, detectRegion } from "@/lib/i18n";
import { ArrowLeft, CalendarDays, Eye, EyeOff, KeyRound, LoaderCircle, Mail, MapPin, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { startAuthentication } from "@simplewebauthn/browser";

type Mode = "login" | "register";
type Form = { firstName: string; lastName: string; username: string; email: string; password: string; otp: string; dateOfBirth: string; country: string; state: string; city: string };

function countryInfo(country: string) {
  const entry = WORLD_REGIONS[country];
  if (!entry) return { currency: "SAR", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC", states: [] as string[], cities: [] as string[] };
  const states = Object.keys(entry.states);
  return { currency: "SAR", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC", states, cities: entry.states[states[0]] ?? [] };
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<Form>(() => {
    const detected = detectRegion();
    return { firstName: "", lastName: "", username: "", email: "", password: "", otp: "", dateOfBirth: "", country: detected.country ?? "", state: detected.state ?? "", city: detected.city ?? "" };
  });
  const info = countryInfo(form.country);
  useEffect(() => { if (!loading && isAuthenticated) setLocation("/feed"); }, [isAuthenticated, loading, setLocation]);
  const login = trpc.auth.login.useMutation({ onSuccess: async data => { await utils.auth.me.invalidate(); if (data?.ageStatus === "minor_pending_consent") { toast.warning(t("loginFailedParental")); setLocation("/parental-consent"); } else { toast.success(t("welcomeBackToast")); setLocation("/feed"); } }, onError: error => toast.error(error.message) });
  const register = trpc.auth.register.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success("تم إنشاء الحساب وإرسال رابط تأكيد البريد الإلكتروني."); setLocation("/feed"); }, onError: error => toast.error(error.message) });
  const passkeyOptions = trpc.passkeys.authenticationOptions.useMutation();
  const passkeyLogin = trpc.passkeys.authenticate.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success(t("تم تسجيل الدخول بمفتاح المرور.")); setLocation("/feed"); }, onError: error => toast.error(error.message) });
  const pending = login.isPending || register.isPending || passkeyOptions.isPending || passkeyLogin.isPending;
  const loginWithPasskey = async () => {
    try {
      const options = await passkeyOptions.mutateAsync({ origin: window.location.origin });
      const response = await startAuthentication({ optionsJSON: options });
      await passkeyLogin.mutateAsync({ response: response as unknown as Record<string, unknown> });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر تسجيل الدخول بمفتاح المرور."));
    }
  };
  const selectCountry = (country: string) => {
    const states = Object.keys(WORLD_REGIONS[country]?.states ?? {});
    setForm(value => ({ ...value, country, state: states[0] ?? "", city: WORLD_REGIONS[country]?.states[states[0]]?.[0] ?? "" }));
  };
  const selectState = (state: string) => setForm(value => ({ ...value, state, city: WORLD_REGIONS[value.country]?.states[state]?.[0] ?? "" }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "login") {
      login.mutate({ email: form.email, password: form.password, otp: form.otp || undefined });
      return;
    }
    const birth = new Date(`${form.dateOfBirth}T00:00:00.000Z`);
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
    if (!form.dateOfBirth || Number.isNaN(birth.getTime()) || age < 18) {
      toast.error(t("age18Required"));
      return;
    }
    register.mutate({ ...form, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC" });
  };
  const title = mode === "login" ? t("welcomeBack") : t("startYourSpace");
  const subtitle = mode === "login" ? t("loginSubtitle") : t("registerSubtitle");
  return <main dir={t("dir") === "rtl" ? "rtl" : "ltr"} className="vibra-bg grid min-h-screen place-items-center p-5"><section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] glass lg:grid-cols-[.9fr_1.1fr]"><aside className="relative hidden min-h-[44rem] overflow-hidden bg-gradient-to-bl from-violet-600/75 to-pink-500/70 p-10 lg:block"><div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl"/><Link href="/" className="relative inline-flex items-center gap-3 font-extrabold"><BrandLogo className="h-14 w-14 drop-shadow-lg"/><span>VibraCam</span></Link><div className="relative mt-24"><span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm"><Sparkles size={16}/> {t("heroCommunity")}</span><h1 className="mt-6 text-4xl font-extrabold leading-tight">{t("heroTitle")}</h1><p className="mt-5 max-w-sm leading-8 text-white/80">{t("heroSubtitle")}</p></div></aside><div className="p-6 sm:p-10"><Link href="/" className="inline-flex items-center gap-2 text-sm text-violet-100/65 hover:text-white"><ArrowLeft size={16}/>{t("backHome")}</Link><div className="mt-8 flex items-start gap-3"><BrandLogo className="h-16 w-16 sm:hidden"/><div><p className="text-sm text-pink-200">VibraCam</p><h2 className="mt-2 text-3xl font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-violet-100/65">{subtitle}</p></div></div><form onSubmit={submit} className="mt-7 space-y-4">    {mode === "register" && <><div className="grid gap-4 sm:grid-cols-2"><Field label={t("firstName")} icon={<UserRound size={17}/>} value={form.firstName} onChange={value => setForm(state => ({ ...state, firstName: value }))} placeholder={t("firstNamePlaceholder")} autoComplete="given-name"/><Field label={t("lastName")} icon={<UserRound size={17}/>} value={form.lastName} onChange={value => setForm(state => ({ ...state, lastName: value }))} placeholder={t("lastNamePlaceholder")} autoComplete="family-name"/></div><Field label={t("username")} icon={<UserRound size={17}/>} value={form.username} onChange={value => setForm(state => ({ ...state, username: value.replace(/\s/g, "") }))} placeholder={t("usernamePlaceholder")} autoComplete="username" hint={t("usernameHint")}/><div className="grid gap-4 sm:grid-cols-2"><Field label={t("تاريخالميلاد")} icon={<CalendarDays size={17}/>} type="date" value={form.dateOfBirth} onChange={value => setForm(state => ({ ...state, dateOfBirth: value }))} placeholder="" autoComplete="bday"/>      <LocationSelect label={t("country")} value={form.country} onChange={selectCountry} options={COUNTRIES} placeholder={t("chooseCountry")} /></div>{form.country && <LocationSelect label={t("region")} value={form.state} onChange={selectState} options={info.states} placeholder={t("chooseRegion")}/>}<LocationSelect label={t("city")} value={form.city} onChange={city => setForm(value => ({ ...value, city }))} options={info.cities} placeholder={form.country ? t("chooseCity") : t("chooseCountryFirst")} disabled={!form.country}/></>}<Field label={t("email")} icon={<Mail size={17}/>} type="email" value={form.email} onChange={value => setForm(state => ({ ...state, email: value }))} placeholder={t("emailPlaceholder")} autoComplete={mode === "login" ? "username webauthn" : "email"}/><label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{t("password")}</span><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-pink-300/65"><KeyRound className="text-pink-200" size={17}/><input required minLength={mode === "register" ? 8 : 1} type={showPassword ? "text" : "password"} value={form.password} onChange={event => setForm(state => ({ ...state, password: event.target.value }))} placeholder={mode === "register" ? t("passwordPlaceholder") : t("passwordPlaceholderLogin")} autoComplete={mode === "register" ? "new-password" : "current-password"} className="min-w-0 flex-1 bg-transparent py-3 outline-none"/><button type="button" aria-label={showPassword ? t("hidePassword") : t("showPassword")} onClick={() => setShowPassword(value => !value)} className="text-violet-100/55 hover:text-white">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>{mode === "login" && <Field label={t("رمز المصادقة الثنائية (اختياري)")} icon={<ShieldCheck size={17}/>} value={form.otp} onChange={value => setForm(state => ({ ...state, otp: value.replace(/\D/g, "").slice(0, 6) }))} placeholder={t("أدخل رمزًا من 6 أرقام")} autoComplete="one-time-code" required={false}/>}    {mode === "login" && <Link href="/forgot-password" className="block text-left text-xs font-semibold text-pink-200 hover:text-pink-100">{t("forgotPassword")}</Link>}{mode === "register" && <p className="text-xs leading-5 text-violet-100/45">{t("privacyHint")}</p>}<button disabled={pending} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold gradient-button disabled:opacity-60">{pending && <LoaderCircle className="animate-spin" size={18}/>} {mode === "login" ? t("signIn") : t("signUp")}</button></form>{mode === "login" && <button type="button" disabled={pending} onClick={loginWithPasskey} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold soft-button disabled:opacity-50"><ShieldCheck size={17}/>{passkeyOptions.isPending || passkeyLogin.isPending ? t("جارٍ التحقق...") : t("الدخول بمفتاح المرور")}</button>}<p className="mt-6 text-center text-sm text-violet-100/65">{mode === "login" ? <>{t("noAccount")} <Link href="/register" className="font-bold text-pink-200">{t("signUp")}</Link></> : <>{t("haveAccount")} <Link href="/login" className="font-bold text-pink-200">{t("signIn")}</Link></>}</p></div></section></main>;
}

function Field({ label, icon, value, onChange, placeholder, type = "text", autoComplete, hint, required = true }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder: string; type?: string; autoComplete?: string; hint?: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between text-sm text-violet-100/75">{label}{hint && <small className="text-[10px] text-violet-100/40">{hint}</small>}</span><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-pink-300/65">{icon}<input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="min-w-0 flex-1 bg-transparent py-3 outline-none"/></span></label>;
}

function LocationSelect({ label, value, onChange, options, placeholder, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string; disabled?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-sm text-violet-100/75">{label}</span><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-pink-300/65"><MapPin className="text-pink-200" size={17}/><select required disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-white outline-none disabled:opacity-50"><option value="" disabled className="bg-[#1a0c2b]">{placeholder}</option>{options.map(option => <option key={option} value={option} className="bg-[#1a0c2b]">{option}</option>)}</select></span></label>;
}
