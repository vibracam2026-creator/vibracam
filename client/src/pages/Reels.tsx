import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { Clapperboard, Eye, Heart, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

export default function Reels() {
  const { t } = useLanguage();
  const reels = trpc.reels.list.useQuery({});
  const utils = trpc.useUtils();
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [viewed, setViewed] = useState<number[]>([]);
  const create = trpc.reels.create.useMutation({ onSuccess: () => { setMedia(null); setCaption(""); utils.reels.list.invalidate(); toast.success("تم نشر الريل."); } });
  const like = trpc.reels.toggleLike.useMutation({ onSuccess: () => utils.reels.list.invalidate() });
  const view = trpc.reels.view.useMutation({ onSuccess: () => utils.reels.list.invalidate() });
  const recordView = (reelId: number) => { if (!viewed.includes(reelId)) { setViewed(ids => [...ids, reelId]); view.mutate({ reelId }); } };
  return <PlatformShell><div className="mx-auto max-w-5xl"><p className="text-sm text-pink-200">{t('فيديوهاتقصيرة')}</p><h1 className="mt-1 text-3xl font-extrabold">{t('الريلز')}</h1><section className="mt-6 rounded-3xl glass p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{t('شاركفيديوجديدا')}</h2><p className="mt-1 text-sm text-violet-100/60">{t('ارفعملففيديوقصيروعرفالمجتمع')}</p></div><MediaUploader kind="reel" accept="video/*" onUploaded={setMedia} label={t("رفعفيديو")}/></div>{media && <div className="mt-4"><video src={media.url} controls className="max-h-80 w-full rounded-2xl bg-black"/><div className="mt-3 flex gap-3"><input value={caption} onChange={event => setCaption(event.target.value)} placeholder={t("عنوانأووصفالريل")} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 outline-none"/><button onClick={() => create.mutate({ videoUrl: media.url, videoKey: media.key, caption: caption || null })} className="rounded-xl px-4 py-2 gradient-button"><Upload size={17}/></button></div></div>}</section><section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{reels.data?.map(({ reel, author, liked }) => <article key={reel.id} className="overflow-hidden rounded-3xl glass"><video src={reel.videoUrl} controls onPlay={() => recordView(reel.id)} className="aspect-[9/14] w-full bg-black object-cover"/><div className="p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 overflow-hidden"><div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-pink-500 font-bold text-white text-xs">{author.avatarUrl ? <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerText = author.name?.[0]?.toUpperCase() || "V"; }}/> : (author.name?.[0]?.toUpperCase() || "V")}</div><b className="truncate">{author.name || "مستخدم VibraCam"}</b></div><button onClick={() => like.mutate({ reelId: reel.id })} aria-label={liked ? "إلغاء الإعجاب" : "إعجاب"} className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm ${liked ? "bg-pink-500/20 text-pink-200" : "soft-button text-violet-100/70"}`}><Heart size={15} fill={liked ? "currentColor" : "none"}/>{reel.likesCount}</button></div><p className="mt-2 text-sm text-violet-100/70">{reel.caption || "ريل جديد من مجتمع VibraCam."}</p><span className="mt-3 inline-flex items-center gap-1 text-xs text-violet-100/45"><Eye size={14}/>{reel.viewsCount} مشاهدة</span></div></article>)}{!reels.data?.length && <div className="col-span-full rounded-3xl border border-dashed border-white/15 p-10 text-center text-violet-100/60"><Clapperboard className="mx-auto mb-3 text-pink-300"/>{t('لاتوجدريلزبعدكنأول')}</div>}</section></div></PlatformShell>;
}
