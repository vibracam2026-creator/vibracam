import { PlatformShell } from "@/components/PlatformShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Clock3, Eye, Radio, Trash2, Users, Video } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/lib/i18n";

export default function LiveList() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const lives = trpc.live.list.useQuery(undefined, { refetchInterval: 15000 });
  const me = trpc.auth.me.useQuery();
  const history = trpc.live.history.useQuery(undefined, { enabled: !!me.data });
  const utils = trpc.useUtils();
  const deleteStream = trpc.live.delete.useMutation({ onSuccess: () => { void history.refetch(); } });

  const deleteFinished = (streamId: number) => {
    if (!window.confirm("هل تريد حذف هذا البث نهائيًا؟ سيُحذف سجل البث والتسجيل المحفوظ ولا يمكن استعادته.")) return;
    deleteStream.mutate({ streamId, confirmation: true });
  };

  return (
    <PlatformShell>
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-pink-200">{t("شاهدوشارك")}</p>
          {me.data && <button onClick={() => setLocation("/live/broadcast")} className="inline-flex items-center gap-2 rounded-2xl gradient-button px-4 py-2.5 text-sm font-bold"><Radio size={16} />{t("ابدأبثكالآن")}</button>}
        </div>
        <h1 className="mt-1 text-3xl font-extrabold">{t("البثوثالمباشرة")}</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {lives.data?.map(({ stream, broadcaster }) => <button key={stream.id} onClick={() => setLocation(`/live/${stream.id}`)} className="group relative overflow-hidden rounded-[1.5rem] glass p-5 text-start transition-transform hover:-translate-y-0.5"><div className="flex items-start gap-3"><Avatar className="h-12 w-12 border-2 border-pink-400/60"><AvatarImage src={broadcaster.avatarUrl ?? undefined} /><AvatarFallback>{(broadcaster.name ?? "م").slice(0, 1)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><b className="block truncate">{broadcaster.name || broadcaster.username || "مستخدم VibraCam"}</b><p className="mt-0.5 truncate text-sm text-violet-100/70">{stream.title}</p><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-violet-100/60"><span className="inline-flex items-center gap-1"><Eye size={12} />{stream.viewerCount} مشاهد</span><span className="inline-flex items-center gap-1"><Users size={12} />{stream.totalViews} مشاهدة إجمالية</span></div></div><span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{t("مباشر")}</span></div></button>)}
        </div>
        {!lives.data?.length && !lives.isLoading && <div className="mt-6 rounded-[2rem] glass p-10 text-center"><Radio size={32} className="mx-auto mb-3 text-pink-300" /><p className="text-violet-100/70">{t("لاتوجدبثوثنشطةحاليا")}</p><p className="mt-1 text-sm text-violet-100/50">{t("كنأولمنيبدأبثامباشرا")}</p><button onClick={() => setLocation("/live/broadcast")} className="mt-4 inline-flex items-center gap-2 rounded-2xl gradient-button px-5 py-2.5 text-sm font-bold"><Radio size={16} />{t("ابدأبثكالآن")}</button></div>}
        {lives.isLoading && <p className="mt-6 text-center text-violet-100/60">{t("جارتحميلالبثوث")}</p>}

        {me.data && <section className="mt-10 rounded-[2rem] glass p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-pink-200">إدارة سجلك</p><h2 className="mt-1 text-2xl font-extrabold">بثوثي السابقة</h2></div><Clock3 className="text-pink-300" size={24} /></div><p className="mt-2 text-sm text-violet-100/60">البثوث المنتهية أو الملغاة لا تظهر للجمهور، ويمكنك حذفها نهائيًا من هنا.</p><div className="mt-4 grid gap-3">{history.data?.map(stream => <div key={stream.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="min-w-0 flex-1"><b className="block truncate">{stream.title}</b><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-violet-100/60"><span>{stream.status === "ended" ? "منتهٍ" : "ملغى"}</span><span>{stream.totalViews} مشاهدة</span>{stream.recordingUrl && <span className="inline-flex items-center gap-1 text-emerald-200"><Video size={12} />تسجيل محفوظ</span>}</div></div><button onClick={() => deleteFinished(stream.id)} disabled={deleteStream.isPending} className="inline-flex items-center gap-2 rounded-xl border border-red-300/30 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-50"><Trash2 size={15} />حذف</button></div>)}{!history.isLoading && !history.data?.length && <p className="rounded-2xl border border-white/10 p-5 text-center text-sm text-violet-100/60">لا توجد بثوث سابقة.</p>}{history.isLoading && <p className="text-center text-sm text-violet-100/60">جارٍ تحميل بثوثك السابقة...</p>}</div></section>}
      </div>
    </PlatformShell>
  );
}
