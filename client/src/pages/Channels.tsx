import { PlatformShell } from "@/components/PlatformShell";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { useLanguage } from "../lib/i18n";
import { Bot, Hash, Plus, ArrowRight, Trash2, LoaderCircle, Rss, Settings2, X } from "lucide-react";

const glass = "rounded-3xl glass p-5";

export default function Channels() {
  const { t, lang } = useLanguage();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [postText, setPostText] = useState("");
  const [showBotManager, setShowBotManager] = useState(false);
  const [botName, setBotName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");

  const channelsQuery = trpc.channels.list.useQuery(undefined, { refetchInterval: 8000 });
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("channel");
    const requestedId = Number(raw);
    if (Number.isInteger(requestedId) && requestedId > 0) setSelectedId(requestedId);
  }, []);
  const postsQuery = trpc.channels.posts.useQuery({ channelId: selectedId ?? 0 }, { enabled: Boolean(selectedId), refetchInterval: 5000 });
  const botsQuery = trpc.bots.list.useQuery({ scope: "channel", scopeId: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const selected = channelsQuery.data?.find(ch => ch.id === selectedId);
  const isOwner = Boolean(selected && me.data?.id === selected.ownerId);

  const refreshChannel = async () => {
    await Promise.all([utils.channels.list.invalidate(), selectedId ? utils.channels.posts.invalidate({ channelId: selectedId }) : Promise.resolve(), selectedId ? utils.bots.list.invalidate({ scope: "channel", scopeId: selectedId }) : Promise.resolve()]);
  };
  const createChannel = trpc.channels.create.useMutation({ onSuccess: async data => { setShowCreate(false); setNewName(""); setNewDesc(""); await utils.channels.list.invalidate(); setSelectedId(data.id); toast.success(lang === "ar" ? "تم إنشاء القناة." : "Channel created."); }, onError: error => toast.error(error.message) });
  const createPost = trpc.channels.createPost.useMutation({ onSuccess: async () => { setPostText(""); await utils.channels.posts.invalidate({ channelId: selectedId! }); toast.success(lang === "ar" ? "تم نشر المنشور." : "Post published."); }, onError: error => toast.error(error.message) });
  const deleteChannel = trpc.channels.deleteChannel.useMutation({ onSuccess: async () => { await utils.channels.list.invalidate(); setSelectedId(null); toast.success(lang === "ar" ? "تم حذف القناة." : "Channel deleted."); }, onError: error => toast.error(error.message) });
  const deletePost = trpc.channels.deletePost.useMutation({ onSuccess: async () => { await utils.channels.posts.invalidate({ channelId: selectedId! }); toast.success(lang === "ar" ? "تم حذف المنشور." : "Post deleted."); }, onError: error => toast.error(error.message) });
  const toggle = trpc.channelSubscriptions.toggle.useMutation({ onSuccess: async data => { await utils.channels.list.invalidate(); toast.success(data.subscribed ? (lang === "ar" ? "تم الاشتراك." : "Subscribed.") : (lang === "ar" ? "تم إلغاء الاشتراك." : "Unsubscribed.")); }, onError: error => toast.error(error.message) });
  const createBot = trpc.bots.create.useMutation({ onSuccess: async () => { setBotName(""); await refreshChannel(); toast.success(lang === "ar" ? "تم إنشاء البوت." : "Bot created."); }, onError: error => toast.error(error.message) });
  const addRule = trpc.bots.addRule.useMutation({ onSuccess: async () => { setTrigger(""); setResponse(""); if (botsQuery.data?.[0]) await utils.bots.rules.invalidate({ botId: botsQuery.data[0].id }); toast.success(lang === "ar" ? "تمت إضافة قاعدة الرد." : "Reply rule added."); }, onError: error => toast.error(error.message) });
  const deleteBot = trpc.bots.delete.useMutation({ onSuccess: refreshChannel, onError: error => toast.error(error.message) });
  const deleteRule = trpc.bots.deleteRule.useMutation({ onSuccess: async (_, variables) => { await utils.bots.rules.invalidate({ botId: variables.botId }); }, onError: error => toast.error(error.message) });
  const bot = botsQuery.data?.[0];
  const rulesQuery = trpc.bots.rules.useQuery({ botId: bot?.id ?? 0 }, { enabled: Boolean(bot?.id) });
  const channels = channelsQuery.data ?? [];
  const posts = postsQuery.data ?? [];

  return <PlatformShell>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-4 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl"><Hash className="text-pink-300" size={28}/>{t("channelsTitle")}</h1><p className="mt-1 text-sm text-violet-100/60">{t("channelsSubtitle")}</p></div><button onClick={() => setShowCreate(v => !v)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold gradient-button"><Plus size={17}/>{t("createChannel")}</button></header>
      {showCreate && <section className={glass}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t("createChannel")}</h2><button onClick={() => setShowCreate(false)} className="soft-button rounded-lg p-2"><X size={16}/></button></div><input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("channelName")} maxLength={140} className="mt-3 w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2.5 text-white outline-none"/><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={t("channelDesc")} maxLength={1000} rows={2} className="mt-3 w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2.5 text-white outline-none"/><button disabled={createChannel.isPending || !newName.trim()} onClick={() => createChannel.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })} className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold gradient-button disabled:opacity-50">{createChannel.isPending && <LoaderCircle className="animate-spin" size={16}/>} {t("createChannel")}</button></section>}
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <section className={glass}><h2 className="mb-3 text-lg font-bold">{t("channels")}</h2>{channelsQuery.isLoading ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin" size={22}/></div> : channels.length === 0 ? <p className="py-10 text-center text-sm text-violet-100/50">{t("noChannels")}</p> : <ul className="space-y-2">{channels.map(ch => <li key={ch.id} className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition ${ch.id === selectedId ? "border-pink-300/50 bg-white/10" : "border-white/10 bg-black/15 hover:bg-white/5"}`}><button onClick={() => setSelectedId(ch.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/25 to-violet-500/25"><Hash size={16} className="text-pink-200"/></span><span className="min-w-0"><b className="block truncate">{ch.name}</b><small className="mt-0.5 block text-xs text-violet-100/50">{ch.subscriberCount ?? 0} {t("subscribers")}</small></span></button><button onClick={() => toggle.mutate({ channelId: ch.id })} disabled={toggle.isPending} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${ch.subscribed ? "bg-pink-500/15 text-pink-200" : "gradient-button"}`}>{ch.subscribed ? t("unsubscribeChannel") : t("subscribeChannel")}</button></li>)}</ul>}</section>
        <section className={glass}>{selected ? <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Hash className="text-pink-300" size={22}/>{selected.name}</h2>{selected.description && <p className="mt-1 text-sm text-violet-100/55">{selected.description}</p>}</div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-pink-200"><Rss size={12}/>{selected.subscriberCount ?? 0} {t("subscribers")}</span>{isOwner && <><button onClick={() => setShowBotManager(v => !v)} className="soft-button inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs"><Settings2 size={14}/>{lang === "ar" ? "إدارة البوت" : "Bot settings"}</button><button onClick={() => window.confirm(lang === "ar" ? "حذف القناة نهائيًا؟" : "Delete this channel permanently?") && deleteChannel.mutate({ channelId: selected.id })} className="rounded-xl border border-rose-300/25 p-2 text-rose-100"><Trash2 size={15}/></button></>}</div></div>
          {isOwner && <div className="mt-4 flex gap-2"><textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t("writePost")} maxLength={5000} rows={2} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2.5 text-white outline-none"/><button disabled={createPost.isPending || !postText.trim()} onClick={() => createPost.mutate({ channelId: selected.id, content: postText.trim() })} className="self-end rounded-xl px-4 py-2.5 font-bold gradient-button disabled:opacity-50">{t("newPost")}</button></div>}
          {showBotManager && isOwner && <section className="mt-4 rounded-2xl border border-pink-300/15 bg-pink-500/5 p-4"><h3 className="flex items-center gap-2 font-bold"><Bot size={17} className="text-pink-200"/>{lang === "ar" ? "البوت والردود التلقائية" : "Bot and automatic replies"}</h3>{!bot ? <div className="mt-3 flex gap-2"><input value={botName} onChange={e => setBotName(e.target.value)} placeholder={lang === "ar" ? "اسم البوت" : "Bot name"} className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><button disabled={!botName.trim()} onClick={() => createBot.mutate({ scope: "channel", scopeId: selected.id, name: botName.trim() })} className="rounded-xl px-3 py-2 text-sm gradient-button">{lang === "ar" ? "إنشاء" : "Create"}</button></div> : <><div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 p-3 text-sm"><span><b>{bot.name}</b><small className="ms-2 text-violet-100/50">{lang === "ar" ? "يرد حسب الكلمات المحفزة" : "Replies by trigger words"}</small></span><button onClick={() => deleteBot.mutate({ botId: bot.id })} className="text-rose-200"><Trash2 size={15}/></button></div><div className="mt-3 grid gap-2 sm:grid-cols-[.7fr_1.4fr_auto]"><input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder={lang === "ar" ? "الكلمة المحفزة" : "Trigger"} className="rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><input value={response} onChange={e => setResponse(e.target.value)} placeholder={lang === "ar" ? "رد البوت" : "Bot response"} className="rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><button disabled={!trigger.trim() || !response.trim()} onClick={() => addRule.mutate({ botId: bot.id, trigger: trigger.trim(), response: response.trim() })} className="rounded-xl px-3 py-2 text-sm gradient-button">{lang === "ar" ? "إضافة قاعدة" : "Add rule"}</button></div><div className="mt-3 space-y-2">{rulesQuery.data?.map(rule => <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/15 px-3 py-2 text-xs"><span><b>“{rule.trigger}”</b> ← {rule.response}</span><button onClick={() => deleteRule.mutate({ botId: bot.id, ruleId: rule.id })} className="text-rose-200"><Trash2 size={13}/></button></div>)}</div></>}</section>}
          <ul className="mt-4 space-y-3">{postsQuery.isLoading ? <li className="flex justify-center py-10"><LoaderCircle className="animate-spin" size={22}/></li> : posts.length === 0 ? <li className="py-10 text-center text-sm text-violet-100/50">{t("noPosts")}</li> : posts.map(post => <li key={post.id} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{t("channel")}</b>{(isOwner || post.authorId === me.data?.id) && <button aria-label={t("delete")} onClick={() => deletePost.mutate({ postId: post.id })} className="rounded-lg p-1.5 text-red-300/70 hover:bg-red-500/15"><Trash2 size={14}/></button>}</div><p className="mt-2 whitespace-pre-wrap leading-7">{post.content}</p>{post.mediaUrl && <img src={post.mediaUrl} alt="" className="mt-3 max-h-80 w-full rounded-xl object-cover"/>}<small className="mt-2 block text-xs text-violet-100/40">{new Date(post.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}</small></li>)}</ul>
        </div> : <div className="flex flex-col items-center gap-3 py-16 text-center text-violet-100/55"><Hash size={40} className="text-pink-300/40"/><p className="text-sm">{t("joinChannel")}</p><Link href="/discover" className="inline-flex items-center gap-1 text-xs text-pink-200 hover:text-pink-100">{t("discover")} <ArrowRight size={12}/></Link></div>}</section>
      </div><div className="text-center"><Link href="/discover" className="inline-flex items-center gap-1 text-xs text-pink-200 hover:text-pink-100">{t("discover")} <ArrowRight size={12}/></Link></div>
    </div>
  </PlatformShell>;
}
