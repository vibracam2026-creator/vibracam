import { PlatformShell } from "@/components/PlatformShell";
import { useAuth } from "@/_core/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { ArrowLeft, Heart, MessageCircleMore, ShieldCheck, Sparkles, UsersRound, Video } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

const features = [
  { icon: Video, title: "فيديو حيّ", text: "مكالمات آمنة ومساحات تواصل حقيقية مع من يشاركونك الاهتمامات." },
  { icon: MessageCircleMore, title: "رسائل بلا تأخير", text: "رسائل فورية، مؤشرات كتابة، وحضور متصل دائمًا بما يهمك." },
  { icon: UsersRound, title: "مجتمعك بيدك", text: "خلاصة شخصية، متابعة صادقة، ومحتوى يعبّر عنك." },
];

export default function Home() {
  const { t } = useLanguage();
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (!loading && isAuthenticated) setLocation("/feed"); }, [isAuthenticated, loading, setLocation]);
  const enter = () => setLocation("/register");
  return <PlatformShell>
    <section className="relative overflow-hidden rounded-[2rem] glass px-6 py-16 sm:px-12 sm:py-24">
      <div className="absolute -left-24 top-4 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl"/><div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl"/>
      <div className="relative max-w-3xl">
        <BrandLogo className="mb-5 h-28 w-28 drop-shadow-[0_0_28px_rgba(236,72,153,.38)] sm:h-36 sm:w-36" />
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-pink-300/10 px-4 py-2 text-sm text-pink-100"><Sparkles size={16}/> مجتمع عربي نابض بالحياة</div>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">مساحتك <span className="gradient-text">{t('لتعيشتشاركوتتواصل')}</span> بطريقتك.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-violet-100/75">{t('Vibracamشبكةاجتماعيةعربيةحديثةتجمع')}</p>
        <div className="mt-9 flex flex-wrap gap-3"><button onClick={enter} className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-bold gradient-button">انضم إلى المجتمع <ArrowLeft size={18}/></button><button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="rounded-xl px-6 py-3 font-semibold soft-button">{t('استكشفالميزات')}</button></div>
      </div>
      <div className="relative mt-14 grid gap-4 sm:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-white/10 bg-[#140923]/70 p-5"><span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500/80 to-pink-500/80"><Icon size={20}/></span><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-violet-100/65">{text}</p></article>)}</div>
    </section>
    <section id="features" className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-[2rem] glass p-7"><h2 className="text-2xl font-extrabold">{t('كلماتحتاجهفيمكانواحد')}</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{[[Heart,"تفاعل حقيقي","إعجاب، تعليق، مشاركة، وإشعارات تحترم وقتك."],[ShieldCheck,"خصوصية وأمان","جلسات مؤمنة، مسارات محمية، وتحكم واضح بالمحتوى."],[MessageCircleMore,"قريب من دائرتك","ابحث، تابع، تواصل، واكتشف منشئي محتوى جدد."],[Sparkles,"واجهة عربية أولًا","لغة عربية كاملة واتجاه RTL متسق على كل الشاشات."]].map(([Icon,title,text]: any) => <div key={title} className="rounded-2xl bg-white/5 p-4"><Icon className="text-pink-300" size={20}/><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm text-violet-100/65">{text}</p></div>)}</div></div><aside className="rounded-[2rem] bg-gradient-to-br from-violet-600/70 to-pink-500/55 p-7 shadow-2xl"><p className="text-sm text-pink-100">{t('ابدأالآن')}</p><h2 className="mt-2 text-3xl font-extrabold">{t('صمميومكالرقميكماتحب')}</h2><p className="mt-4 leading-7 text-white/80">{t('ابنملفكشاركلحظاتكوابدأمحادثة')}</p><button onClick={enter} className="mt-7 rounded-xl bg-white px-5 py-3 font-bold text-violet-800">{t('أنشئتجربتك')}</button></aside></section>
  </PlatformShell>;
}
