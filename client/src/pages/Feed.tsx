import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { PlatformShell } from "@/components/PlatformShell";
import { PostCard } from "@/components/PostCard";
import { trpc } from "@/lib/trpc";
import { Image, LoaderCircle, Plus, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { useSound } from "@/contexts/SoundContext";

export default function Feed() {
  const { t } = useLanguage();
  const { play } = useSound();
  const utils = trpc.useUtils();
  const [feedType, setFeedType] = useState<"all" | "following">("all");
  const feed = trpc.posts.feed.useInfiniteQuery({ limit: 10, feedType }, { getNextPageParam: (lastPage) => lastPage.nextCursor });
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const create = trpc.posts.create.useMutation({ onSuccess: () => { setContent(""); setMedia(null); utils.posts.feed.invalidate(); toast.success(t("تم نشر لحظتك.")); play("success"); }, onError: error => toast.error(error.message) });
  
  const posts = feed.data?.pages.flatMap((page) => page.items) || [];
  
  return <PlatformShell><div className="mx-auto max-w-3xl"><div className="mb-6 flex items-end justify-between"><div><p className="text-sm text-pink-200">VibraCam / {t("الخلاصة")}</p><h1 className="mt-1 text-3xl font-extrabold">{t('نبضمجتمعك')}</h1></div><button className="hidden rounded-xl px-4 py-2 text-sm gradient-button sm:inline-flex"><Plus size={17} className="me-2"/>{t('منشورجديد')}</button></div>
  
  <div className="mb-6 flex gap-2 rounded-2xl glass p-1">
    <button onClick={() => setFeedType("all")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${feedType === "all" ? "bg-white/10 text-pink-200" : "text-violet-100/60 hover:bg-white/5 hover:text-white"}`}>للجميع</button>
    <button onClick={() => setFeedType("following")} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${feedType === "following" ? "bg-white/10 text-pink-200" : "text-violet-100/60 hover:bg-white/5 hover:text-white"}`}>المتابَعون</button>
  </div>
  
  <section className="rounded-3xl glass p-5"><textarea value={content} onChange={event => setContent(event.target.value)} rows={4} placeholder={t("بمتفكراليوم")} className="w-full resize-none bg-transparent text-base outline-none placeholder:text-violet-100/40"/>{media && <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/10">{media.type === "video" ? <video controls src={media.url} className="max-h-64 w-full"/> : <img src={media.url} alt={t("معاينة")} className="max-h-64 w-full object-cover"/>}<button onClick={() => setMedia(null)} className="absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs">{t('إزالة')}</button></div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div className="flex gap-2"><MediaUploader kind="post" onUploaded={setMedia} label={t("uploadImageOrVideo")} accept="image/*,video/*"/><span className="hidden items-center gap-1 text-xs text-violet-100/45 sm:inline-flex"><Image size={14}/> {t("حتى 40 م.ب")} <Video size={14}/></span></div><button disabled={!content.trim() || create.isPending} onClick={() => create.mutate({ content: content.trim(), mediaUrl: media?.url, mediaKey: media?.key, mediaType: media?.type === "video" ? "video" : media?.type === "image" ? "image" : undefined })} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold gradient-button disabled:cursor-not-allowed disabled:opacity-50">{create.isPending && <LoaderCircle className="animate-spin" size={17}/>} {t("نشر")}</button></div></section><div className="mt-6 space-y-5">{feed.isLoading && <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-pink-300"/></div>}{posts.map((post: any) => <PostCard key={post.id} post={post}/>)}{!feed.isLoading && !posts.length && <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-violet-100/65">{t('هذهبدايةالخلاصةكنأولمن')}</div>}
  {feed.hasNextPage && (
    <div className="pt-4 pb-8 text-center">
      <button 
        onClick={() => feed.fetchNextPage()} 
        disabled={feed.isFetchingNextPage}
        className="rounded-xl px-6 py-2.5 text-sm font-bold soft-button disabled:opacity-50"
      >
        {feed.isFetchingNextPage ? <LoaderCircle className="inline animate-spin me-2" size={16}/> : null}
        {feed.isFetchingNextPage ? "جارٍ التحميل..." : "تحميل المزيد"}
      </button>
    </div>
  )}
  </div></div></PlatformShell>;
}
