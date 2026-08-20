import { useAuth } from "@/_core/hooks/useAuth";
import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/lib/i18n";
import { WORLD_LANGUAGES } from "@/lib/regions";
import { BadgeDollarSign, Bell, Blocks, Camera, Check, CheckCircle2, Clock3, Eye, EyeOff, Globe, HardDrive, KeyRound, LoaderCircle, MailCheck, Mic, Rocket, Search, ShieldBan, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type PrivacyForm = { profileVisibility: "public" | "followers" | "private"; showCity: boolean; showWebsite: boolean; showSocialLinks: boolean; showFollowers: boolean; showFollowing: boolean; showPosts: boolean };

const initialPrivacy: PrivacyForm = { profileVisibility: "public", showCity: true, showWebsite: true, showSocialLinks: true, showFollowers: true, showFollowing: true, showPosts: true };


export default function Settings() {
function LanguageSection({ user }: { user: any }) {
  const { t, lang, setLang } = useLanguage();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "supported" | "soon">("all");
  const languageOptions = Object.entries(WORLD_LANGUAGES);
  const supported: Record<string, boolean> = { ar: true, en: true, fr: true, es: true, tr: true, ur: true, hi: true, id: true, ru: true, de: true, pt: true, fa: true, bn: true, sw: true, vi: true, zh: true, ja: true, ko: true };
  const query = search.trim().toLowerCase();
  const supportedCount = languageOptions.filter(([code]) => supported[code]).length;
  const currentLanguage = WORLD_LANGUAGES[lang] ?? WORLD_LANGUAGES.ar;
  const isRtl = ["ar", "fa", "ur"].includes(lang);
  const filtered = languageOptions
    .filter(([code, language]) => {
      const matchesSearch = !query || language.nameAr.toLowerCase().includes(query) || language.nameEn.toLowerCase().includes(query) || code.toLowerCase().includes(query);
      const matchesFilter = filter === "all" || (filter === "supported" ? Boolean(supported[code]) : !supported[code]);
      return matchesSearch && matchesFilter;
    })
    .sort(([firstCode, firstLanguage], [secondCode, secondLanguage]) => {
      if (firstCode === lang) return -1;
      if (secondCode === lang) return 1;
      if (Boolean(supported[firstCode]) !== Boolean(supported[secondCode])) return supported[firstCode] ? -1 : 1;
      return firstLanguage.nameAr.localeCompare(secondLanguage.nameAr, "ar");
    });
  const filters = [["all", t("allLanguages")], ["supported", t("availableNow")], ["soon", t("comingSoon")]] as const;

  return <section className="overflow-hidden rounded-3xl glass" dir={isRtl ? "rtl" : "ltr"}>
    <div className="border-b border-white/10 bg-gradient-to-l from-pink-500/10 via-violet-500/5 to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-pink-400/15 text-pink-200"><Globe size={20}/></span><div><h2 className="text-xl font-bold">{t("languageAndRegion")}</h2><p className="mt-1 text-sm text-violet-100/60">{t("languageDescription")}</p></div></div></div>
        <div className="rounded-2xl border border-pink-300/20 bg-pink-400/10 px-4 py-3 text-start"><small className="block text-xs text-pink-100/60">{t("currentLanguage")}</small><b className="mt-1 block text-pink-100">{currentLanguage.nameAr}</b><span className="text-[11px] text-pink-100/50">{currentLanguage.nameEn}</span></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/15 p-3"><small className="block text-xs text-violet-100/50">{t("totalLanguages")}</small><b className="mt-1 block text-lg">{languageOptions.length}</b></div><div className="rounded-2xl border border-white/10 bg-black/15 p-3"><small className="block text-xs text-violet-100/50">{t("availableNow")}</small><b className="mt-1 block text-lg text-emerald-200">{supportedCount}</b></div><div className="rounded-2xl border border-white/10 bg-black/15 p-3"><small className="block text-xs text-violet-100/50">{t("comingSoon")}</small><b className="mt-1 block text-lg text-violet-100/70">{languageOptions.length - supportedCount}</b></div></div>
    </div>
    <div className="p-5 sm:p-6">
      <div className="relative"><Search className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-violet-100/45" size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("searchLanguage") || "ابحث باسم اللغة أو رمزها"} className="w-full rounded-2xl border border-white/10 bg-black/20 py-3.5 pe-11 ps-11 text-sm outline-none transition placeholder:text-violet-100/35 focus:border-pink-400/60 focus:ring-2 focus:ring-pink-400/10" dir="auto" aria-label={t("searchLanguageAria")}/>{search && <button type="button" onClick={() => setSearch("")} className="absolute end-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-violet-100/50 hover:bg-white/10 hover:text-white" aria-label={t("clearSearch")}><X size={15}/></button>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${filter === value ? "gradient-button text-white" : "soft-button text-violet-100/65"}`}>{label}</button>)}</div><span className="text-xs text-violet-100/45">{filtered.length} {t("languagesCount")}</span></div>
      <div className="mt-4 max-h-[30rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/10 p-2 [scrollbar-color:rgba(236,72,153,.5)_transparent]">
        <div className="grid gap-1.5">{filtered.map(([code, language]) => { const isCurrent = lang === code; const isSupported = Boolean(supported[code]); return <button key={code} type="button" onClick={() => setLang(code as import("@/lib/i18n").Lang)} className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-start transition ${isCurrent ? "border-pink-300/40 bg-gradient-to-l from-pink-500/15 to-violet-500/10 shadow-[0_0_24px_rgba(236,72,153,.08)]" : "border-transparent hover:border-white/10 hover:bg-white/5"}`} aria-pressed={isCurrent}><span className="flex min-w-0 items-center gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-black tracking-wide ${isCurrent ? "bg-pink-400/20 text-pink-100" : "bg-white/8 text-violet-100/45"}`}>{code.toUpperCase()}</span><span className="min-w-0"><b className={`block truncate text-sm ${isCurrent ? "text-pink-100" : "text-violet-50"}`}>{language.nameAr}</b>{lang !== "ar" && <small className="mt-0.5 block truncate text-xs text-violet-100/40">{language.nameEn}</small>}</span></span><span className="flex shrink-0 items-center gap-2">{isSupported ? <CheckCircle2 className="text-emerald-300/80" size={16}/> : <Clock3 className="text-violet-100/35" size={15}/>}<small className={`hidden text-xs sm:block ${isSupported ? "text-emerald-200/75" : "text-violet-100/40"}`}>{isSupported ? t("availableNow") : t("comingSoon")}</small>{isCurrent && <span className="grid h-6 w-6 place-items-center rounded-full bg-pink-500 text-white"><Check size={14}/></span>}</span></button>; })}</div>
        {!filtered.length && <div className="p-10 text-center"><Search className="mx-auto mb-3 text-violet-100/30" size={24}/><p className="text-sm text-violet-100/55">{t("noLanguagesFound") || "لا توجد لغة مطابقة"}</p><button type="button" onClick={() => { setSearch(""); setFilter("all"); }} className="mt-3 text-xs font-semibold text-pink-200 hover:text-pink-100">{t("showAllLanguages")}</button></div>}
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-2xl border border-white/8 bg-black/10 p-3 text-xs leading-6 text-violet-100/45"><Globe className="mt-1 shrink-0" size={14}/><span>{t("regionDetected")}: {user?.country ? <b className="text-pink-200">{user.country}{user.state ? ` · ${user.state}` : ""}{user.city ? ` · ${user.city}` : ""}</b> : t("regionNotSet")}</span></p>
    </div>
  </section>;
}


  function DeviceSection({ user: currentUser }: { user: any }) {
    const [permissions, setPermissions] = useState({ camera: "prompt", microphone: "prompt", notifications: typeof Notification === "undefined" ? "unsupported" : Notification.permission });
    const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
    const [standalone, setStandalone] = useState(false);
    const [busy, setBusy] = useState<"camera" | "microphone" | "notifications" | null>(null);
    useEffect(() => {
      let active = true;
      const read = async () => {
        const next = { camera: "prompt", microphone: "prompt", notifications: typeof Notification === "undefined" ? "unsupported" : Notification.permission };
        if (navigator.permissions?.query) {
          for (const name of ["camera", "microphone"] as const) {
            try { next[name] = (await navigator.permissions.query({ name } as PermissionDescriptor)).state; } catch { /* بعض المتصفحات لا تسمح بالاستعلام */ }
          }
        }
        if (navigator.storage?.estimate) { const estimate = await navigator.storage.estimate(); if (estimate.usage !== undefined && estimate.quota !== undefined) setStorage({ used: estimate.usage, quota: estimate.quota }); }
        if (active) { setPermissions(next); setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)); }
      };
      void read();
      return () => { active = false; };
    }, []);
    const permissionLabel = (value: string) => value === "granted" ? "مسموح" : value === "denied" ? "مرفوض" : value === "unsupported" ? "غير مدعوم" : "يحتاج موافقة";
    const requestPermission = async (kind: "camera" | "microphone" | "notifications") => {
      setBusy(kind);
      try {
        if (kind === "notifications") {
          if (typeof Notification === "undefined") throw new Error("الإشعارات غير مدعومة في هذا المتصفح.");
          const result = await Notification.requestPermission();
          setPermissions(value => ({ ...value, notifications: result }));
          if (result !== "granted") throw new Error("لم يتم السماح بإشعارات الهاتف.");
        } else {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم الوصول إلى الجهاز.");
          const stream = await navigator.mediaDevices.getUserMedia(kind === "camera" ? { video: true } : { audio: true });
          stream.getTracks().forEach(track => track.stop());
          setPermissions(value => ({ ...value, [kind]: "granted" }));
        }
        toast.success("تم تحديث إذن الهاتف.");
      } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحديث الإذن."); }
      finally { setBusy(null); }
    };
    const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return <div className="space-y-5"><section className="rounded-3xl glass p-5"><div className="flex items-start gap-3"><Smartphone className="mt-1 text-pink-300"/><div><h2 className="text-xl font-bold">الهاتف والجهاز</h2><p className="mt-1 text-sm leading-6 text-violet-100/65">هذه الأذونات مطلوبة للبث والمكالمات والرسائل الصوتية والإشعارات. لا يطلب الموقع الإذن إلا عند ضغطك على الزر.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><DevicePermission icon={Camera} label="الكاميرا" statusLabel={permissionLabel(permissions.camera)} onRequest={() => requestPermission("camera")} busy={busy === "camera"}/><DevicePermission icon={Mic} label="الميكروفون" statusLabel={permissionLabel(permissions.microphone)} onRequest={() => requestPermission("microphone")} busy={busy === "microphone"}/><DevicePermission icon={Bell} label="إشعارات الهاتف" statusLabel={permissionLabel(permissions.notifications)} onRequest={() => requestPermission("notifications")} busy={busy === "notifications"}/></div></section><section className="rounded-3xl glass p-5"><div className="flex items-start gap-3"><HardDrive className="mt-1 text-cyan-300"/><div><h2 className="text-xl font-bold">التخزين والتثبيت</h2><p className="mt-1 text-sm leading-6 text-violet-100/65">تقدير مساحة المتصفح فقط، ولا يحذف منشوراتك أو رسائلك من الخادم.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><small className="text-violet-100/50">مساحة المتصفح المستخدمة</small><b className="mt-1 block text-lg">{storage ? `${formatBytes(storage.used)} / ${formatBytes(storage.quota)}` : "جارٍ الحساب..."}</b></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><small className="text-violet-100/50">حالة تثبيت الموقع</small><b className="mt-1 block text-lg text-pink-200">{standalone ? "مثبت كتطبيق" : "يفتح من المتصفح"}</b></div></div></section><section className="rounded-3xl glass p-5"><div className="flex items-start gap-3"><Smartphone className="mt-1 text-violet-300"/><div><h2 className="text-xl font-bold">رقم الهاتف وبيانات الجهاز</h2><p className="mt-1 text-sm leading-6 text-violet-100/65">يمكنك إضافة أو تعديل رقم الهاتف من مركز الحسابات. لا يظهر للزوار.</p><p className="mt-2 text-sm text-pink-200">{currentUser?.phoneNumber ? "رقم الهاتف محفوظ" : "لم تتم إضافة رقم هاتف"}</p></div></div><Link href="/account-center" className="mt-4 inline-flex rounded-xl px-4 py-2 gradient-button">فتح مركز الحسابات</Link></section></div>;
  }

  function DevicePermission({ icon: Icon, label, statusLabel, onRequest, busy: pending }: { icon: typeof Camera; label: string; statusLabel: string; onRequest: () => void; busy: boolean }) {
    const granted = statusLabel === "مسموح";
    return <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-center gap-2"><Icon size={19} className="text-pink-200"/><b>{label}</b></div><p className="mt-2 text-xs text-violet-100/55">{statusLabel}</p><button type="button" onClick={onRequest} disabled={pending || granted} className="mt-3 rounded-xl px-3 py-2 text-sm soft-button disabled:opacity-50">{pending ? "جارٍ التحقق..." : granted ? "مسموح" : "مراجعة الإذن"}</button></div>;
  }

  const { user } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const privacy = trpc.privacy.mine.useQuery();
  const blocked = trpc.safety.blockedUsers.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<PrivacyForm>(initialPrivacy);
  const [activeSection, setActiveSection] = useState<"language" | "device" | "account" | "privacy" | "pro" | "blocked">("language");
  useEffect(() => { if (privacy.data) setForm(privacy.data); }, [privacy.data]);
  const update = trpc.privacy.update.useMutation({ onSuccess: async () => { await privacy.refetch(); toast.success(t("privacySaved")); }, onError: error => toast.error(error.message) });
  const unblock = trpc.safety.unblock.useMutation({ onSuccess: async () => { await utils.safety.blockedUsers.invalidate(); toast.success(t("unblocked")); }, onError: error => toast.error(error.message) });
  const requestVerification = trpc.auth.requestEmailVerification.useMutation({ onSuccess: result => toast.success(result.alreadyVerified ? t("alreadyVerified") : t("verificationSent")), onError: error => toast.error(error.message) });
  const toggleCreator = trpc.creator.toggle.useMutation({ onSuccess: data => toast.success(data.isCreator ? t("proEnabled") : t("proDisabled")), onError: error => toast.error(error.message) });
  const updateLocation = trpc.location.update.useMutation({ onSuccess: () => toast.success(t("locationSaved")), onError: error => toast.error(error.message) });

  const field = (key: string, label: string, description: string) => <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:bg-white/5"><span><b className="block">{label}</b><small className="mt-1 block leading-5 text-violet-100/55">{description}</small></span><input type="checkbox" checked={Boolean((form as Record<string, unknown>)[key])} onChange={event => setForm(value => ({ ...value, [key as keyof PrivacyForm]: event.target.checked }))} className="mt-1 h-4 w-4 accent-pink-500"/></label>;

  const sections: { key: typeof activeSection; label: string; icon: typeof Globe }[] = [
    { key: "language", label: t("language"), icon: Globe },
    { key: "device", label: "الهاتف والجهاز", icon: Smartphone },
    { key: "account", label: t("accountSecurity"), icon: ShieldCheck },
    { key: "privacy", label: t("visibility"), icon: Eye },
    { key: "pro", label: t("proMode"), icon: Rocket },
    { key: "blocked", label: t("blockedAccounts"), icon: ShieldBan },
  ];

  return <PlatformShell><div className="mx-auto max-w-4xl space-y-6"><header className="sm:flex sm:items-start sm:justify-between"><div><p className="text-sm text-pink-200">{t("account")}</p><h1 className="mt-1 text-3xl font-extrabold">{t("settingsTitle")}</h1><p className="mt-2 text-violet-100/65">{t("settingsSubtitle")}</p></div></header>
  <nav className="flex flex-wrap gap-2">
    {sections.map(({ key, label, icon: Icon }) => (
      <button key={key} onClick={() => setActiveSection(key)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeSection === key ? "gradient-button text-white" : "soft-button"}`}>
        <Icon size={16}/> {label}
      </button>
    ))}
    {user?.role === "admin" && <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl bg-pink-500/20 px-4 py-2.5 text-sm font-semibold text-pink-200 hover:bg-pink-500/30"><Blocks size={16}/>{t("adminPanel")}</Link>}
  </nav>

  {activeSection === "language" && <LanguageSection user={user}/>}

  {activeSection === "device" && <DeviceSection user={user}/>}

  {activeSection === "account" && <section className="rounded-3xl glass p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="text-pink-300" size={20}/>{t("accountSecurity")}</h2><p className="mt-2 text-sm leading-6 text-violet-100/65">{t("securityDescription")}</p></div>{user?.emailVerifiedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200"><MailCheck size={14}/>{t("emailVerified")}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-100">{t("awaitingVerification")}</span>}</div><div className="mt-5 flex flex-wrap gap-3"><button disabled={requestVerification.isPending || Boolean(user?.emailVerifiedAt)} onClick={() => requestVerification.mutate({ origin: window.location.origin })} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 soft-button disabled:opacity-50">{requestVerification.isPending ? <LoaderCircle className="animate-spin" size={16}/> : <MailCheck size={16}/>}{t("sendVerificationLink")}</button><Link href="/forgot-password" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 soft-button"><KeyRound size={16}/>{t("resetPassword")}</Link></div><p className="mt-5 flex items-center gap-2 text-xs text-violet-100/45"><EyeOff size={14}/>{t("privateDataHint")}</p></section>}

  {activeSection === "privacy" && <section className="rounded-3xl glass p-5"><h2 className="flex items-center gap-2 text-xl font-bold"><Eye className="text-pink-300" size={20}/>{t("visibility")}</h2><div className="mt-4 grid gap-3"><label className="rounded-2xl border border-white/10 bg-black/15 p-4"><b className="block">{t("whoSeesProfile")}</b><select value={form.profileVisibility} onChange={event => setForm(value => ({ ...value, profileVisibility: event.target.value as PrivacyForm["profileVisibility"] }))} className="mt-3 w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2 text-white outline-none"><option value="public">{t("everyone")}</option><option value="followers">{t("followersOnly")}</option><option value="private">{t("onlyMe")}</option></select></label>{field(t("showCity"), t("showCityDesc1"), t("showCityDesc2"))}{field(t("showWebsite"), t("showWebsiteDesc1"), t("showWebsiteDesc2"))}{field(t("showSocialLinks"), t("showLinksDesc1"), t("showLinksDesc2"))}{field(t("showFollowers"), t("showFollowersDesc1"), t("showFollowersDesc2"))}{field(t("showFollowing"), t("showFollowingDesc1"), t("showFollowingDesc2"))}{field(t("showPosts"), t("showPostsDesc1"), t("showPostsDesc2"))}</div><button disabled={update.isPending} onClick={() => update.mutate(form)} className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold gradient-button disabled:opacity-50">{update.isPending && <LoaderCircle className="animate-spin" size={16}/>}{t("savePrivacy")}</button></section>}

  {activeSection === "pro" && <section className="rounded-3xl glass p-5"><h2 className="flex items-center gap-2 text-xl font-bold"><Rocket className="text-pink-300" size={20}/>{t("proMode")}</h2><p className="mt-2 text-sm leading-6 text-violet-100/65">{t("proDescription")}</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><small className="text-violet-100/55">{t("followers")}</small><div className="mt-1 text-2xl font-extrabold">{user?.followersCount ?? 0}</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><small className="text-violet-100/55">{t("earnings")}</small><div className="mt-1 text-2xl font-extrabold text-emerald-300">{user?.earnings ?? "0.00"}</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><small className="text-violet-100/55">{t("creatorStatus")}</small><div className="mt-1 text-2xl font-extrabold text-pink-300">{user?.isCreator === "yes" ? t("enabled") : t("disabled")}</div></div></div><button disabled={toggleCreator.isPending} onClick={() => toggleCreator.mutate({ enable: user?.isCreator !== "yes" })} className={`mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold disabled:opacity-50 ${user?.isCreator === "yes" ? "soft-button" : "gradient-button"}`}>{toggleCreator.isPending ? <LoaderCircle className="animate-spin" size={16}/> : <BadgeDollarSign size={16}/>}{user?.isCreator === "yes" ? t("disableProMode") : t("enableProMode")}</button></section>}

  {activeSection === "blocked" && <section className="rounded-3xl glass p-5"><h2 className="flex items-center gap-2 text-xl font-bold"><ShieldBan className="text-pink-300" size={20}/>{t("blockedAccounts")}</h2><p className="mt-2 text-sm text-violet-100/65">{t("blockedDescription")}</p><div className="mt-4 space-y-3">{blocked.data?.map(({ user: blockedUser }) => <div key={blockedUser.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-3"><span className="min-w-0"><b className="block truncate">{blockedUser.name || "مستخدم VibraCam"}</b><small className="text-violet-100/55">@{blockedUser.username || "vibracam"}</small></span><button disabled={unblock.isPending} onClick={() => unblock.mutate({ userId: blockedUser.id })} className="rounded-xl px-3 py-2 text-sm soft-button">{t("unblock")}</button></div>)}{!blocked.data?.length && <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-violet-100/55"><Users className="mx-auto mb-2 text-pink-300" size={22}/>{t("noBlockedAccounts")}</div>}</div></section>}
  </div></PlatformShell>;
}
