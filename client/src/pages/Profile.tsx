import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { PlatformShell } from "@/components/PlatformShell";
import { PostCard } from "@/components/PostCard";
import { ReportDialog } from "@/components/ReportDialog";
import { VerificationMark } from "@/components/VerificationMark";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Ban, Camera, Check, Clapperboard, ExternalLink, Flag, Heart, MapPin, MessageCircle, Package, Pencil, Search, UserPlus, UsersRound, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { useLanguage } from "@/lib/i18n";

type ProfileTab = "posts" | "reels" | "products" | "followers" | "following";

export default function Profile() {
  const { t } = useLanguage();
  const [, params] = useRoute("/profile/:id");
  const userId = Number(params?.id);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const profile = trpc.profile.byId.useQuery({ userId });
  const posts = trpc.posts.feed.useInfiniteQuery({ userId, limit: 10 }, { getNextPageParam: (lastPage) => lastPage.nextCursor });
  const followers = trpc.profile.followers.useQuery({ userId });
  const following = trpc.profile.following.useQuery({ userId });
  const reels = trpc.reels.list.useQuery({ userId });
  const products = trpc.marketplace.list.useQuery({ sellerId: userId });
  const friendStatus = trpc.friendRequests.status.useQuery({ userId });
  const interests = trpc.discover.interests.useQuery();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", name: "", username: "", bio: "", country: "", city: "", gender: "", phoneNumber: "", websiteUrl: "", socialLinks: "", timeZone: "", defaultCurrency: "SAR", interestIds: [] as number[] });
  const [avatar, setAvatar] = useState<UploadedMedia | null>(null);
  const [cover, setCover] = useState<UploadedMedia | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const follow = trpc.follows.follow.useMutation({ onSuccess: () => { profile.refetch(); utils.discover.users.invalidate(); } });
  const unfollow = trpc.follows.unfollow.useMutation({ onSuccess: () => { profile.refetch(); utils.discover.users.invalidate(); } });
  const sendFriendRequest = trpc.friendRequests.send.useMutation({ onSuccess: () => { void friendStatus.refetch(); toast.success(t("تم إرسال طلب الصداقة.")); }, onError: error => toast.error(error.message) });
  const cancelFriendRequest = trpc.friendRequests.cancel.useMutation({ onSuccess: () => { void friendStatus.refetch(); toast.success(t("تم إلغاء طلب الصداقة.")); }, onError: error => toast.error(error.message) });
  const removeFriend = trpc.friendRequests.remove.useMutation({ onSuccess: () => { void friendStatus.refetch(); toast.success(t("تمت إزالة الصداقة.")); }, onError: error => toast.error(error.message) });
  const update = trpc.profile.update.useMutation({
    onSuccess: () => { profile.refetch(); setEditing(false); toast.success("تم تحديث ملفك الشخصي."); },
    onError: error => toast.error(error.message || "تعذر حفظ التغييرات."),
  });
  const block = trpc.safety.block.useMutation({ onSuccess: () => { toast.success("تم حظر الحساب."); setLocation("/feed"); }, onError: error => toast.error(error.message) });

  useEffect(() => {
    if (!profile.data) return;
    setAvatarLoadFailed(false);
    setCoverLoadFailed(false);
    setForm({
      firstName: profile.data.firstName || "",
      lastName: profile.data.lastName || "",
      name: profile.data.name || "",
      username: profile.data.username || "",
      bio: profile.data.bio || "",
      country: profile.data.country || "",
      city: profile.data.city || "",
      gender: profile.data.gender || "",
      phoneNumber: (profile.data as typeof profile.data & { phoneNumber?: string | null }).phoneNumber || "",
      websiteUrl: profile.data.websiteUrl || "",
      socialLinks: profile.data.socialLinks || "",
      timeZone: profile.data.timeZone || "",
      defaultCurrency: profile.data.defaultCurrency || "SAR",
      interestIds: profile.data.interests.map(interest => interest.id),
    });
  }, [profile.data]);

  if (!profile.data) return <PlatformShell><div className="rounded-3xl glass p-10 text-center">{t('جارتحميلالملفالشخصي')}</div></PlatformShell>;
  const mine = user?.id === userId;
  const isFollowing = profile.data.isFollowing;
  const friendState = friendStatus.data;
  const friendButtonLabel = friendState?.status === "accepted" ? t("إزالة الصداقة") : friendState?.status === "pending" && friendState.direction === "outgoing" ? t("إلغاء طلب الصداقة") : friendState?.status === "pending" && friendState.direction === "incoming" ? t("مراجعة طلب الصداقة") : t("إضافة صديق");
  const friendButtonAction = () => { if (friendState?.status === "accepted") return removeFriend.mutate({ userId }); if (friendState?.status === "pending" && friendState.direction === "outgoing" && friendState.id) return cancelFriendRequest.mutate({ requestId: friendState.id }); if (friendState?.status === "pending" && friendState.direction === "incoming") return setLocation("/friend-requests"); return sendFriendRequest.mutate({ userId }); };
  const save = () => update.mutate({ ...form, gender: (form.gender || null) as "male" | "female" | "non_binary" | "prefer_not_to_say" | null, phoneNumber: form.phoneNumber || null, websiteUrl: form.websiteUrl || null, socialLinks: form.socialLinks || null, avatarUrl: avatar?.url, avatarKey: avatar?.key, coverUrl: cover?.url, coverKey: cover?.key });
  const saveUploadedMedia = (kind: "avatar" | "cover", media: UploadedMedia) => {
    if (kind === "avatar") {
      setAvatarLoadFailed(false);
      setAvatar(media);
      update.mutate({ avatarUrl: media.url, avatarKey: media.key });
    } else {
      setCoverLoadFailed(false);
      setCover(media);
      update.mutate({ coverUrl: media.url, coverKey: media.key });
    }
  };
  const toggleInterest = (interestId: number) => setForm(value => ({ ...value, interestIds: value.interestIds.includes(interestId) ? value.interestIds.filter(id => id !== interestId) : [...value.interestIds, interestId].slice(0, 12) }));
  const tabs: { id: ProfileTab; label: string; count?: number; icon: typeof Heart }[] = [
    { id: "posts", label: "المنشورات", count: profile.data.postsCount, icon: Heart },
    { id: "reels", label: "الريلز", count: reels.data?.length, icon: Clapperboard },
    { id: "products", label: "المنتجات", count: products.data?.length, icon: Package },
    { id: "followers", label: "المتابعون", count: profile.data.followersCount, icon: UsersRound },
    { id: "following", label: "يتابع", count: profile.data.followingCount, icon: UserPlus },
  ];
  const visibleAvatarUrl = avatar?.url || profile.data.avatarUrl;
  const visibleCoverUrl = cover?.url || profile.data.coverUrl;

  return <PlatformShell><div className="mx-auto max-w-4xl"><section className="overflow-hidden rounded-[2rem] glass"><div className="h-32 bg-gradient-to-l from-pink-500/75 via-violet-600/75 to-indigo-950 sm:h-36">{visibleCoverUrl && !coverLoadFailed && <img src={visibleCoverUrl} alt={t("صورةغلافالملفالشخصي")} onError={() => setCoverLoadFailed(true)} className="h-full w-full object-cover"/>}</div><div className="relative px-4 pb-5 sm:px-7 sm:pb-6"><div className="-mt-10 flex flex-col gap-3 lg:-mt-12 lg:flex-row lg:items-end lg:justify-between lg:gap-4"><div className="flex min-w-0 items-end gap-3 sm:gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-[#201033] bg-gradient-to-br from-violet-500 to-pink-500 text-2xl font-bold text-white sm:h-24 sm:w-24 sm:rounded-3xl sm:text-3xl">{visibleAvatarUrl && !avatarLoadFailed ? <img src={visibleAvatarUrl} alt={`صورة ${profile.data.name || "المستخدم"}`} onError={() => setAvatarLoadFailed(true)} className="h-full w-full object-cover"/> : (profile.data.name?.[0]?.toUpperCase() || "V")}</div><div className="min-w-0 pb-1"><h1 className="flex min-w-0 items-center gap-2 truncate text-lg font-extrabold leading-tight sm:text-2xl">{profile.data.name || "مستخدم VibraCam"}{profile.data.verificationType && profile.data.verificationType !== "none" && <VerificationMark type={profile.data.verificationType} size="lg"/>}</h1><p className="truncate text-sm text-pink-200">@{profile.data.username || "vibracam"}</p></div></div>{mine ? <button onClick={() => setEditing(value => !value)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 soft-button lg:w-auto"><Pencil size={16}/>{editing ? "إغلاق التعديل" : "تعديل الملف"}</button> : <div className="flex w-full flex-wrap gap-2 lg:w-auto"><button onClick={() => isFollowing ? unfollow.mutate({ userId }) : follow.mutate({ userId })} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 lg:flex-none ${isFollowing ? "soft-button" : "gradient-button"}`}><UserPlus size={16}/>{isFollowing ? "إلغاء المتابعة" : "متابعة"}</button><button onClick={friendButtonAction} disabled={sendFriendRequest.isPending || cancelFriendRequest.isPending || removeFriend.isPending} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 lg:flex-none ${friendState?.status === "accepted" || friendState?.status === "pending" ? "soft-button" : "gradient-button"}`}><UserPlus size={16}/>{friendButtonLabel}</button><button aria-label={t("إرسالرسالة")} onClick={() => setLocation(`/messages/${userId}`)} className="grid h-11 w-11 place-items-center rounded-xl soft-button"><MessageCircle size={17}/></button><button aria-label={t("بدءمكالمةفيديو")} onClick={() => setLocation(`/video/${userId}`)} className="grid h-11 w-11 place-items-center rounded-xl soft-button"><Video size={17}/></button><button aria-label={t("الإبلاغعنالحساب")} onClick={() => setReportOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl soft-button"><Flag size={16}/></button><button aria-label={t("حظرالحساب")} onClick={() => { if (window.confirm("هل تريد حظر هذا الحساب؟")) block.mutate({ userId }); }} className="grid h-11 w-11 place-items-center rounded-xl border border-rose-300/25 bg-rose-400/10 text-rose-100"><Ban size={16}/></button></div>}</div><p className="mt-4 max-w-2xl leading-7 text-violet-100/75 sm:mt-5">{profile.data.bio || "لم يضف هذا المستخدم نبذة بعد."}</p><div className="mt-3 flex flex-wrap gap-3 text-sm text-violet-100/70">{profile.data.websiteUrl && <a href={profile.data.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-pink-200 hover:text-pink-100"><ExternalLink size={15}/>{t('الموقعالإلكتروني')}</a>}</div><div className="mt-4 flex flex-wrap gap-2">{profile.data.interests.map(interest => <span key={interest.id} className="rounded-full border border-pink-300/20 bg-pink-300/10 px-3 py-1 text-xs text-pink-100">{interest.name}</span>)}{!profile.data.interests.length && <span className="text-sm text-violet-100/50">{t('لاتوجداهتماماتمضافةبعد')}</span>}</div>{profile.data.verificationType && profile.data.verificationType !== "none" && <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#d7ff3f]/30 bg-[#d7ff3f]/10 px-3 py-2 text-sm text-[#e7ff93]"><VerificationMark type={profile.data.verificationType} size="md"/> حساب موثّق{profile.data.verificationBadge ? ` · ${profile.data.verificationBadge}` : ""}</div>}<div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm text-violet-100/70"><button onClick={() => setActiveTab("posts")}><b className="text-white">{profile.data.postsCount}</b> منشور</button><button onClick={() => setActiveTab("followers")}><b className="text-white">{profile.data.followersCount}</b> متابع</button><button onClick={() => setActiveTab("following")}><b className="text-white">{profile.data.followingCount}</b> يتابع</button>{profile.data.country && <span className="inline-flex items-center gap-1"><MapPin size={15}/>{profile.data.city ? `${profile.data.city}، ${profile.data.country}` : profile.data.country}</span>}</div></div></section>

  {mine && editing && <section className="mt-5 rounded-3xl glass p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{t('تعديلهويتك')}</h2><span className="text-xs text-violet-100/45">{t('البياناتالخاصةلاتظهرللزوار')}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{[["firstName", "الاسم الشخصي"], ["lastName", "الاسم العائلي"], ["username", "اسم المستخدم"], ["country", "البلد"], ["city", "المدينة"], ["websiteUrl", "الموقع الإلكتروني"], ["phoneNumber", "رقم الهاتف (خاص)"], ["timeZone", "المنطقة الزمنية"], ["defaultCurrency", "العملة الافتراضية"]].map(([key, label]) => <label key={key} className="text-sm text-violet-100/70">{label}<input value={(form as Record<string, string | number[]>)[key] as string} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-pink-300/60"/></label>)}</div><label className="mt-3 block text-sm text-violet-100/70">{t('الجنساختياري')}<select value={form.gender} onChange={event => setForm(value => ({ ...value, gender: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-pink-300/60"><option value="">{t('أفضلعدمالتحديد')}</option><option value="male">{t('ذكر')}</option><option value="female">{t('أنثى')}</option><option value="non_binary">{t('غيرثنائي')}</option><option value="prefer_not_to_say">{t('أفضلعدمالإفصاح')}</option></select></label><label className="mt-3 block text-sm text-violet-100/70">{t('روابطأخرىكلرابطفيسطر')}<textarea value={form.socialLinks} onChange={event => setForm(value => ({ ...value, socialLinks: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-white outline-none focus:border-pink-300/60" rows={2}/></label><label className="mt-3 block text-sm text-violet-100/70">{t('النبذة')}<textarea value={form.bio} onChange={event => setForm(value => ({ ...value, bio: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-white outline-none focus:border-pink-300/60" rows={3}/></label><div className="mt-4"><p className="text-sm text-violet-100/70">{t('الاهتمامات')}</p><div className="mt-2 flex flex-wrap gap-2">{interests.data?.map(interest => <button key={interest.id} type="button" onClick={() => toggleInterest(interest.id)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${form.interestIds.includes(interest.id) ? "bg-pink-500 text-white" : "soft-button"}`}>{form.interestIds.includes(interest.id) && <Check size={14}/>} {interest.name}</button>)}</div></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><MediaUploader kind="avatar" onUploaded={media => saveUploadedMedia("avatar", media)} label={t("تحديثالصورة")}/><MediaUploader kind="cover" onUploaded={media => saveUploadedMedia("cover", media)} label={t("تحديثالغلاف")}/></div>{(avatar || cover) && <span className="inline-flex items-center gap-1 text-sm text-pink-200"><Camera size={15}/>{update.isPending ? "جارٍ حفظ الوسائط..." : "تم حفظ الوسائط تلقائيًا"}</span>}<button disabled={update.isPending} onClick={save} className="rounded-xl px-4 py-2 gradient-button disabled:opacity-50">{update.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button></div></section>}

  <section className="mt-6"><div className="thin-scrollbar flex gap-2 overflow-x-auto border-b border-white/10 pb-3">{tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm ${activeTab === tab.id ? "bg-gradient-to-l from-violet-600 to-pink-500 text-white" : "soft-button text-violet-100/75"}`}><Icon size={16}/>{tab.label}{typeof tab.count === "number" && <span className="text-xs opacity-75">{tab.count}</span>}</button>; })}</div>{activeTab === "posts" && <div className="mt-5 space-y-5">{posts.data?.pages.flatMap(page => page.items).map(post => <PostCard key={post.id} post={post}/>)}{!posts.data?.pages.flatMap(page => page.items).length && <EmptyState icon={<Heart size={26}/>} text={t("لاتوجدمنشوراتظاهرةبعد")}/>}
  {posts.hasNextPage && (
    <div className="pt-4 pb-8 text-center">
      <button 
        onClick={() => posts.fetchNextPage()} 
        disabled={posts.isFetchingNextPage}
        className="rounded-xl px-6 py-2.5 text-sm font-bold soft-button disabled:opacity-50"
      >
        {posts.isFetchingNextPage ? "جارٍ التحميل..." : "تحميل المزيد"}
      </button>
    </div>
  )}
</div>}{activeTab === "reels" && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{reels.data?.map(({ reel }) => <article key={reel.id} className="overflow-hidden rounded-3xl glass"><video controls src={reel.videoUrl} className="aspect-[9/14] w-full bg-black object-cover"/><div className="p-4"><p className="text-sm text-violet-100/75">{reel.caption || "ريل جديد"}</p><span className="mt-2 inline-flex items-center gap-1 text-xs text-pink-200"><Heart size={14}/>{reel.likesCount}</span></div></article>)}{!reels.data?.length && <div className="col-span-full"><EmptyState icon={<Clapperboard size={26}/>} text={t("لاتوجدريلزمنشورةبعد")}/></div>}</div>}{activeTab === "products" && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.data?.map(product => <article key={product.id} className="overflow-hidden rounded-3xl glass"><div className="aspect-[4/3] bg-black/20">{product.images[0] ? <img src={product.images[0].imageUrl} alt={product.title} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-violet-100/40"><Package size={30}/></div>}</div><div className="p-4"><p className="text-xs text-pink-200">{product.category}</p><h3 className="mt-1 font-bold">{product.title}</h3><p className="mt-2 text-lg font-extrabold">{(product.price / 100).toLocaleString("ar-SA", { style: "currency", currency: product.currency })}</p></div></article>)}{!products.data?.length && <div className="col-span-full"><EmptyState icon={<Package size={26}/>} text={t("لاتوجدمنتجاتمعروضةبعد")}/></div>}</div>}{activeTab === "followers" && <RelationshipList rows={followers.data} empty={t("لايوجدمتابعونبعد")} onProfile={id => setLocation(`/profile/${id}`)}/>} {activeTab === "following" && <RelationshipList rows={following.data} empty={t("لايتابعهذاالمستخدمحساباتبعد")} onProfile={id => setLocation(`/profile/${id}`)}/>}</section>{reportOpen && <ReportDialog targetType="user" targetId={userId} onClose={() => setReportOpen(false)}/>}</div></PlatformShell>;
}

function RelationshipList({ rows, empty, onProfile }: { rows?: { user: { id: number; name: string | null; username: string | null; avatarUrl: string | null; bio: string | null } }[]; empty: string; onProfile: (id: number) => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"default" | "name">("default");
  if (!rows?.length) return <div className="mt-5"><EmptyState icon={<UsersRound size={26}/>} text={empty}/></div>;
  const visible = rows.filter(({ user }) => `${user.name || ""} ${user.username || ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((first, second) => sort === "name" ? (first.user.name || first.user.username || "").localeCompare(second.user.name || second.user.username || "", "ar") : 0);
  return <div className="mt-5"><div className="mb-3 flex flex-wrap gap-2"><label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-violet-100/55"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("ابحثبالاسمأواسمالمستخدم")} className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label><select value={sort} onChange={event => setSort(event.target.value as "default" | "name")} className="rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none"><option value="default">{t('الترتيبالافتراضي')}</option><option value="name">{t('حسبالاسم')}</option></select></div><div className="grid gap-3 sm:grid-cols-2">{visible.map(({ user }) => <button key={user.id} onClick={() => onProfile(user.id)} className="flex items-center gap-3 rounded-2xl glass p-4 text-right transition hover:bg-white/10"><div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 font-bold text-white">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerText = user.name?.[0]?.toUpperCase() || "V"; }}/> : (user.name?.[0]?.toUpperCase() || "V")}</div><span className="min-w-0"><b className="block truncate">{user.name || "مستخدم VibraCam"}</b><small className="block truncate text-violet-100/55">@{user.username || "vibracam"}</small><small className="mt-1 block truncate text-violet-100/45">{user.bio || "عضو في مجتمع VibraCam"}</small></span></button>)}{!visible.length && <div className="col-span-full"><EmptyState icon={<Search size={26}/>} text={t("لاتوجدنتائجمطابقة")}/></div>}</div></div>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-violet-100/60"><span className="mx-auto mb-3 grid w-fit place-items-center text-pink-300">{icon}</span>{text}</div>;
}
