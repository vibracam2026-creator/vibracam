import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { appendEmojiToDraft, emojiCategories, searchEmojis, type EmojiCategory } from "@/lib/emojis";
import { io, type Socket } from "socket.io-client";
import { AudioLines, Circle, Hash, Image, LoaderCircle, MessageCircleMore, Mic, Pencil, Reply, Search, Send, Smile, Square, Sticker, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { useLanguage } from "@/lib/i18n";
import { useSound } from "@/contexts/SoundContext";

const reactionChoices = ["❤️", "😂", "👍", "🔥", "😮"];

async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function Messages() {
  const { t } = useLanguage();
  const { play } = useSound();
  const [, params] = useRoute("/messages/:peerId");
  const peerId = Number(params?.peerId);
  const [, setLocation] = useLocation();
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [inboxMode, setInboxMode] = useState<"all" | "direct" | "group" | "channel">("all");
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategory | "all">("all");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingMessage, setEditingMessage] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const inbox = trpc.messages.inbox.useQuery(undefined, { refetchInterval: 15_000 });
  const accountSnapshot = trpc.accountCenter.snapshot.useQuery();
  const conversations = trpc.messages.conversations.useQuery(undefined, { refetchInterval: 20_000 });
  const messages = trpc.messages.list.useQuery({ peerId }, { enabled: Number.isFinite(peerId) && peerId > 0, refetchInterval: 15_000 });
  const peer = trpc.profile.byId.useQuery({ userId: peerId }, { enabled: Number.isFinite(peerId) && peerId > 0 });
  const upload = trpc.media.upload.useMutation();
  const fallback = trpc.messages.send.useMutation({ onSuccess: () => { void utils.messages.list.invalidate({ peerId }); void utils.messages.inbox.invalidate(); void utils.messages.conversations.invalidate(); }, onError: error => toast.error(error.message) });
  const edit = trpc.messages.edit.useMutation({ onSuccess: () => { setEditingMessage(null); setContent(""); void utils.messages.list.invalidate({ peerId }); }, onError: error => toast.error(error.message) });
  const remove = trpc.messages.delete.useMutation({ onSuccess: () => { void utils.messages.list.invalidate({ peerId }); void utils.messages.inbox.invalidate(); }, onError: error => toast.error(error.message) });
  const react = trpc.messages.toggleReaction.useMutation({ onSuccess: () => void utils.messages.list.invalidate({ peerId }), onError: error => toast.error(error.message) });
  const filteredInbox = useMemo(() => (inbox.data ?? []).filter(item => inboxMode === "all" || item.kind === inboxMode).filter(item => `${item.title} ${item.preview}`.toLowerCase().includes(query.trim().toLowerCase())), [inbox.data, inboxMode, query]);
  const visibleEmojis = useMemo(() => searchEmojis(emojiQuery, emojiCategory), [emojiQuery, emojiCategory]);
  const chatFontClass = accountSnapshot.data?.preferences?.chatFontSize === "small" ? "text-xs" : accountSnapshot.data?.preferences?.chatFontSize === "large" ? "text-base" : "text-sm";
  const chatWallpaperClass = accountSnapshot.data?.preferences?.chatWallpaper === "plain-dark" ? "bg-black/20" : accountSnapshot.data?.preferences?.chatWallpaper === "soft-gradient" ? "bg-gradient-to-br from-violet-950/60 via-black/15 to-pink-950/35" : "bg-[#1b0d2d]/35";

  useEffect(() => {
    const socket = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { setConnected(true); if (peerId) socket.emit("presence:check", { userId: peerId }, (status: { online: boolean }) => setPeerOnline(status.online)); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", error => { setConnected(false); console.warn("[Messages] socket connection failed", error.message); });
    socket.on("message:new", () => { play("message"); void utils.messages.inbox.invalidate(); void utils.messages.conversations.invalidate(); if (peerId) void utils.messages.list.invalidate({ peerId }); });
    socket.on("message:updated", (message: { senderId: number; receiverId: number }) => { if (!peerId || message.senderId === peerId || message.receiverId === peerId) void utils.messages.list.invalidate({ peerId }); void utils.messages.inbox.invalidate(); void utils.messages.conversations.invalidate(); });
    socket.on("message:deleted", (message: { senderId: number; receiverId: number }) => { if (!peerId || message.senderId === peerId || message.receiverId === peerId) void utils.messages.list.invalidate({ peerId }); void utils.messages.inbox.invalidate(); void utils.messages.conversations.invalidate(); });
    socket.on("message:reaction", (event: { messageId: number }) => { if (peerId && event.messageId) void utils.messages.list.invalidate({ peerId }); });
    socket.on("typing:update", (event: { userId: number; typing: boolean }) => { if (event.userId === peerId) setTyping(event.typing); });
    socket.on("presence:update", (event: { userId: number; online: boolean }) => { if (event.userId === peerId) setPeerOnline(event.online); });
    socket.on("message:blocked", (event: { reason?: string }) => toast.error(`تعذر إرسال الرسالة: ${event.reason || "مخالفة لمعايير المجتمع"}`));
    return () => { socket.close(); };
  }, [peerId, utils, play]);

  useEffect(() => { if (peerId && messages.data) { void utils.messages.inbox.invalidate(); void utils.messages.conversations.invalidate(); } }, [peerId, messages.data?.length, utils]);

  const resetComposer = () => { setContent(""); setReplyTo(null); setEditingMessage(null); };
  const send = () => {
    const value = content.trim();
    if (!value || !peerId) return;
    if (editingMessage) edit.mutate({ messageId: editingMessage, content: value });
    else if (replyTo) fallback.mutate({ receiverId: peerId, content: value, replyToId: replyTo.id });
    else if (socketRef.current?.connected) {
      socketRef.current.timeout(7000).emit("message:send", { receiverId: peerId, content: value }, (error: Error | null, result?: { ok: boolean; message?: string }) => {
        if (error || !result?.ok) {
          toast.error(result?.message ?? "تعذر إرسال الرسالة اللحظية؛ ستتم المحاولة بالطريقة البديلة.");
          fallback.mutate({ receiverId: peerId, content: value, replyToId: replyTo?.id ?? null });
        }
      });
    } else fallback.mutate({ receiverId: peerId, content: value });
    resetComposer();
    socketRef.current?.emit("typing:stop", { peerId });
  };
  const sendMedia = (media: UploadedMedia, kind: "gif" | "sticker") => { if (!peerId) return; fallback.mutate({ receiverId: peerId, content: kind === "gif" ? "GIF" : "ملصق", kind, mediaUrl: media.url, mediaKey: media.key, replyToId: replyTo?.id }); setReplyTo(null); };
  const sendVoice = (url: string, key: string) => { if (!peerId) return; fallback.mutate({ receiverId: peerId, content: "رسالة صوتية", kind: "audio", mediaUrl: url, mediaKey: key, replyToId: replyTo?.id }); setReplyTo(null); };
  const toggleRecording = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("تسجيل الصوت غير مدعوم في هذا المتصفح."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const result = await upload.mutateAsync({ base64: await blobToBase64(blob), mimeType: blob.type, fileName: `voice-${Date.now()}.webm`, kind: "message" });
          sendVoice(result.url, result.key);
        } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع الرسالة الصوتية."); }
      };
      recorderRef.current = recorder;
      setRecording(true);
      recorder.start();
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تشغيل الميكروفون."); }
  };
  const insertEmoji = (emoji: string) => { setContent(value => appendEmojiToDraft(value, emoji)); setEmojiOpen(false); requestAnimationFrame(() => messageInputRef.current?.focus()); };
  const inboxTabs = [
    { id: "all" as const, label: t("الكل"), icon: MessageCircleMore },
    { id: "direct" as const, label: t("مباشر"), icon: MessageCircleMore },
    { id: "group" as const, label: t("groups"), icon: Users },
    { id: "channel" as const, label: t("channels"), icon: Hash },
  ];
  const sidebar = <aside className={`rounded-3xl glass p-4 ${peerId ? "hidden lg:block" : ""}`}>
    <div className="flex items-center justify-between gap-2"><h1 className="text-xl font-bold">{t("رسائلك")}</h1><span className="text-xs text-violet-100/45">{inbox.data?.length || 0} {t("محادثة")}</span></div>
    <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-black/20 p-1">{inboxTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setInboxMode(id)} className={`grid min-h-10 place-items-center rounded-xl px-1 text-[11px] transition ${inboxMode === id ? "bg-pink-500/25 text-pink-100" : "text-violet-100/55 hover:bg-white/7 hover:text-white"}`} title={label}><Icon size={15}/><span className="mt-0.5 truncate">{label}</span></button>)}</div>
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm text-violet-100/50"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("ابحثعنمحادثة")} className="min-w-0 flex-1 bg-transparent outline-none"/></div>
    <div className="thin-scrollbar mt-4 max-h-[58vh] space-y-2 overflow-y-auto">{inbox.isLoading && <LoaderCircle className="mx-auto my-8 animate-spin text-pink-300"/>}{filteredInbox.map(item => { const Icon = item.kind === "group" ? Users : item.kind === "channel" ? Hash : MessageCircleMore; return <button key={`${item.kind}-${item.id}`} onClick={() => setLocation(item.href)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-start transition hover:bg-white/7"><div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500">{item.avatarUrl ? <img src={item.avatarUrl} alt="" className="h-full w-full object-cover"/> : <Icon size={18}/>}</div><span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.title}</b><small className="mt-1 block truncate text-violet-100/60">{item.preview}</small><em className="mt-0.5 block truncate text-[10px] not-italic text-violet-100/35">{item.kind === "direct" ? t("مباشر") : item.kind === "group" ? t("groups") : t("channels")}</em></span>{item.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[10px]">{item.unreadCount}</span>}</button>; })}{!inbox.isLoading && !filteredInbox.length && <div className="py-10 text-center text-sm text-violet-100/55"><MessageCircleMore className="mx-auto mb-3 text-pink-300"/><p>{t("لاتوجدمحادثاتبعدابدأمن")}</p></div>}</div>
  </aside>;
  if (!peerId) return <PlatformShell><div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[.78fr_1.4fr]">{sidebar}<section className="grid min-h-[55vh] place-items-center rounded-3xl glass p-10 text-center"><div><MessageCircleMore className="mx-auto mb-4 text-pink-300" size={38}/><h2 className="text-2xl font-bold">{t("اخترمحادثةأوابدأواحدةجديدة")}</h2><p className="mt-3 text-violet-100/60">{t("تظهرهناأحدثمحادثاتكفوروصول")}</p><button onClick={() => setLocation("/discover")} className="mt-6 rounded-xl px-5 py-3 gradient-button">{t("اكتشفالمستخدمين")}</button></div></section></div></PlatformShell>;
  return <PlatformShell><div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[.78fr_1.4fr]">{sidebar}<section className="flex min-h-[68vh] flex-col overflow-hidden rounded-3xl glass">
    <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500">{peer.data?.avatarUrl ? <img src={peer.data.avatarUrl} alt="" className="h-full w-full object-cover"/> : (peer.data?.name?.[0] || "V")}</div><span><b>{peer.data?.name || "مستخدم VibraCam"}</b><small className="mt-0.5 flex items-center gap-1 text-xs text-violet-100/55"><Circle className={peerOnline ? "fill-emerald-400 text-emerald-400" : "text-violet-100/35"} size={8}/>{connected ? (peerOnline ? "متصل الآن" : "غير متصل الآن") : "جاري الاتصال"}</small></span></div></header>
    <div className={`thin-scrollbar flex-1 space-y-3 overflow-y-auto p-5 ${chatWallpaperClass}`}>{messages.isLoading && <LoaderCircle className="mx-auto mt-10 animate-spin text-pink-300"/>}{messages.data?.map(message => { const grouped = message.reactions.reduce((map: Map<string, number>, reaction: any) => map.set(reaction.emoji, (map.get(reaction.emoji) || 0) + 1), new Map<string, number>()); const mine = message.senderId !== peerId; return <div key={message.id} className={`group max-w-[86%] ${mine ? "ml-auto" : "mr-auto"}`}><div className="mb-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"><button onClick={() => setReplyTo(message)} className="rounded-lg p-1 text-violet-100/60 hover:bg-white/10" title="رد"><Reply size={14}/></button>{mine && !message.deletedAt && <><button onClick={() => { setEditingMessage(message.id); setContent(message.content); requestAnimationFrame(() => messageInputRef.current?.focus()); }} className="rounded-lg p-1 text-violet-100/60 hover:bg-white/10" title="تعديل"><Pencil size={14}/></button><button onClick={() => window.confirm("هل تريد حذف هذه الرسالة؟") && remove.mutate({ messageId: message.id, confirmation: true })} className="rounded-lg p-1 text-rose-200/75 hover:bg-rose-400/10" title="حذف"><Trash2 size={14}/></button></>}</div>{message.replyToId && <div className="mb-1 rounded-xl border-s-2 border-pink-300/50 bg-black/15 px-3 py-1 text-xs text-violet-100/55">رد على رسالة #{message.replyToId}</div>}{message.kind === "audio" && message.mediaUrl ? <audio controls src={message.mediaUrl} className="mb-1 max-w-full"/> : message.kind !== "text" && message.mediaUrl ? <img src={message.mediaUrl} alt={message.kind === "gif" ? "صورة GIF" : "ملصق"} className="mb-1 max-h-56 rounded-2xl object-contain"/> : null}<div className={`rounded-2xl px-4 py-3 ${chatFontClass} leading-7 ${message.deletedAt ? "italic text-violet-100/45" : ""} ${mine ? "rounded-tl-sm bg-gradient-to-l from-violet-600 to-pink-500 text-white" : "rounded-tr-sm bg-white/8 text-violet-50"}`}>{message.deletedAt ? "تم حذف هذه الرسالة" : message.content}{message.editedAt && !message.deletedAt ? <small className="ms-2 text-[10px] opacity-60">(معدلة)</small> : null}</div><div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>{Array.from(grouped.entries()).map(([emoji, count]) => <button key={emoji} onClick={() => react.mutate({ messageId: message.id, emoji })} className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{emoji} {count}</button>)}<span className="hidden gap-1 rounded-full bg-black/20 p-1 group-hover:flex">{reactionChoices.map(emoji => <button key={emoji} onClick={() => react.mutate({ messageId: message.id, emoji })} className="text-sm">{emoji}</button>)}</span></div></div>; })}{typing && <p className="text-xs text-pink-200">{t("يكتبالآن")}</p>}</div>
    <footer className="border-t border-white/10 p-4">{(replyTo || editingMessage) && <div className="mb-3 flex items-center justify-between rounded-xl border border-pink-300/20 bg-pink-400/10 px-3 py-2 text-xs text-pink-100"><span>{editingMessage ? "تعديل الرسالة" : `الرد على رسالة #${replyTo?.id}`}</span><button onClick={resetComposer}>إلغاء</button></div>}<div className="flex gap-2"><div className="relative"><button type="button" onClick={() => setEmojiOpen(value => !value)} aria-label={t("فتحلوحةالإيموجيات")} aria-expanded={emojiOpen} className={`grid h-12 w-12 place-items-center rounded-xl transition ${emojiOpen ? "bg-pink-500/25 text-pink-200" : "soft-button text-violet-100/75"}`}><Smile size={20}/></button>{emojiOpen && <div className="absolute bottom-full right-0 z-20 mb-3 w-80 rounded-2xl border border-white/10 bg-[#221038]/95 p-3 shadow-2xl backdrop-blur-xl"><div className="flex items-center gap-2 rounded-xl bg-black/20 px-2"><Search size={15} className="text-pink-200"/><input value={emojiQuery} onChange={event => setEmojiQuery(event.target.value)} placeholder={t("ابحثحبضحككاميرا")} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></div><div className="mt-2 flex gap-1 overflow-x-auto">{[{ id: "all", label: "الكل" }, ...emojiCategories.map(category => ({ id: category.id, label: category.label }))].map(category => <button key={category.id} onClick={() => setEmojiCategory(category.id as EmojiCategory | "all")} className={`shrink-0 rounded-lg px-2 py-1 text-xs ${emojiCategory === category.id ? "bg-pink-500/30 text-pink-100" : "text-violet-100/60"}`}>{category.label}</button>)}</div><div className="thin-scrollbar mt-3 grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">{visibleEmojis.map(item => <button key={item.emoji} type="button" onClick={() => insertEmoji(item.emoji)} className="grid aspect-square place-items-center rounded-lg text-xl transition hover:bg-white/10 hover:scale-110" aria-label={`إضافة ${item.emoji}`}>{item.emoji}</button>)}</div></div>}</div><MediaUploader kind="message" accept="image/gif" label={<Image size={18}/>} onUploaded={media => sendMedia(media, "gif")}/><MediaUploader kind="message" accept="image/*" label={<Sticker size={18}/>} onUploaded={media => sendMedia(media, "sticker")}/><MediaUploader kind="message" accept="audio/*" label={<AudioLines size={18}/>} onUploaded={media => sendVoice(media.url, media.key)}/><button type="button" onClick={toggleRecording} className={`grid h-12 w-12 place-items-center rounded-xl ${recording ? "bg-rose-500/25 text-rose-100" : "soft-button"}`} title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}>{recording ? <Square size={18}/> : <Mic size={18}/>}</button><input ref={messageInputRef} value={content} onChange={event => { setContent(event.target.value); socketRef.current?.emit("typing:start", { peerId }); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={editingMessage ? "عدّل الرسالة" : t("اكتبرسالة")} className={`min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-pink-300/60 ${chatFontClass}`}/><button onClick={send} disabled={edit.isPending || fallback.isPending} className="grid w-12 place-items-center rounded-xl gradient-button disabled:opacity-50"><Send size={18}/></button></div></footer>
  </section></div></PlatformShell>;
}
