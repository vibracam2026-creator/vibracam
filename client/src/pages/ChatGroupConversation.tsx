import { PlatformShell } from "@/components/PlatformShell";
import { MediaUploader, type UploadedMedia } from "@/components/MediaUploader";
import { trpc } from "@/lib/trpc";
import { io, type Socket } from "socket.io-client";
import { AudioLines, Bot, Check, ImagePlus, Pencil, Reply, Send, Shield, Trash2, UserMinus, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { useLanguage } from "@/lib/i18n";
import { useSound } from "@/contexts/SoundContext";

export default function ChatGroupConversation() {
  const { t } = useLanguage();
  const { play } = useSound();
  const [, params] = useRoute("/messages/groups/:id");
  const chatGroupId = Number(params?.id);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const details = trpc.chatGroups.details.useQuery({ chatGroupId });
  const accountSnapshot = trpc.accountCenter.snapshot.useQuery();
  const rows = trpc.chatGroups.messages.useQuery({ chatGroupId }, { refetchInterval: 15_000 });
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const [memberId, setMemberId] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const send = trpc.chatGroups.send.useMutation({ onSuccess: () => { setContent(""); setMedia(null); setReplyTo(null); utils.chatGroups.messages.invalidate({ chatGroupId }); }, onError: error => toast.error(error.message) });
  const editMessage = trpc.chatGroups.editMessage.useMutation({ onSuccess: () => { setEditingMessageId(null); setContent(""); void utils.chatGroups.messages.invalidate({ chatGroupId }); }, onError: error => toast.error(error.message) });
  const deleteMessage = trpc.chatGroups.deleteMessage.useMutation({ onSuccess: () => void utils.chatGroups.messages.invalidate({ chatGroupId }), onError: error => toast.error(error.message) });
  const refresh = () => { utils.chatGroups.details.invalidate({ chatGroupId }); utils.chatGroups.messages.invalidate({ chatGroupId }); utils.chatGroups.list.invalidate(); };
  const update = trpc.chatGroups.update.useMutation({ onSuccess: () => { setEditing(false); refresh(); toast.success("تم حفظ اسم المحادثة."); }, onError: error => toast.error(error.message) });
  const addMember = trpc.chatGroups.addMember.useMutation({ onSuccess: () => { setMemberId(""); refresh(); toast.success("تمت إضافة العضو."); }, onError: error => toast.error(error.message) });
  const removeMember = trpc.chatGroups.removeMember.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const setRole = trpc.chatGroups.setMemberRole.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const transfer = trpc.chatGroups.transferOwnership.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const leave = trpc.chatGroups.leave.useMutation({ onSuccess: () => setLocation("/messages/groups"), onError: error => toast.error(error.message) });
  const removeGroup = trpc.chatGroups.delete.useMutation({ onSuccess: () => { toast.success("تم حذف المحادثة."); setLocation("/messages/groups"); }, onError: error => toast.error(error.message) });
  const [botName, setBotName] = useState("");
  const [botTrigger, setBotTrigger] = useState("");
  const [botResponse, setBotResponse] = useState("");
  const chatFontClass = accountSnapshot.data?.preferences?.chatFontSize === "small" ? "text-xs" : accountSnapshot.data?.preferences?.chatFontSize === "large" ? "text-base" : "text-sm";
  const chatWallpaperClass = accountSnapshot.data?.preferences?.chatWallpaper === "plain-dark" ? "bg-black/20" : accountSnapshot.data?.preferences?.chatWallpaper === "soft-gradient" ? "bg-gradient-to-br from-violet-950/60 via-black/15 to-pink-950/35" : "bg-[#1b0d2d]/35";
  const bots = trpc.bots.list.useQuery({ scope: "chatGroup", scopeId: chatGroupId }, { enabled: Boolean(chatGroupId) });
  const bot = bots.data?.[0];
  const botRules = trpc.bots.rules.useQuery({ botId: bot?.id ?? 0 }, { enabled: Boolean(bot?.id) });
  const botCreate = trpc.bots.create.useMutation({ onSuccess: () => { setBotName(""); void utils.bots.list.invalidate({ scope: "chatGroup", scopeId: chatGroupId }); }, onError: error => toast.error(error.message) });
  const botAddRule = trpc.bots.addRule.useMutation({ onSuccess: () => { setBotTrigger(""); setBotResponse(""); if (bot) void utils.bots.rules.invalidate({ botId: bot.id }); }, onError: error => toast.error(error.message) });
  const botDelete = trpc.bots.delete.useMutation({ onSuccess: () => void utils.bots.list.invalidate({ scope: "chatGroup", scopeId: chatGroupId }), onError: error => toast.error(error.message) });
  const botDeleteRule = trpc.bots.deleteRule.useMutation({ onSuccess: (_, variables) => void utils.bots.rules.invalidate({ botId: variables.botId }), onError: error => toast.error(error.message) });
  useEffect(() => {
    const socket = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("chatGroup:join", { chatGroupId }));
    socket.on("chatGroup:message", (message: { chatGroupId: number }) => { if (message.chatGroupId === chatGroupId) { play("message"); void utils.chatGroups.messages.invalidate({ chatGroupId }); void utils.chatGroups.list.invalidate(); } });
    socket.on("chatGroup:messageUpdated", (message: { chatGroupId: number }) => { if (message.chatGroupId === chatGroupId) void utils.chatGroups.messages.invalidate({ chatGroupId }); });
    socket.on("chatGroup:messageDeleted", (message: { chatGroupId: number }) => { if (message.chatGroupId === chatGroupId) void utils.chatGroups.messages.invalidate({ chatGroupId }); });
    socket.on("chatGroup:typing", (event: { chatGroupId: number; typing: boolean }) => { if (event.chatGroupId === chatGroupId) setTyping(event.typing); });
    socket.on("message:blocked", (event: { reason?: string }) => toast.error(`تعذر إرسال الرسالة: ${event.reason || "مخالفة لمعايير المجتمع"}`));
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); socket.emit("chatGroup:typing:stop", { chatGroupId }); socket.close(); socketRef.current = null; };
  }, [chatGroupId, utils, play]);
  const emitTyping = (value: string) => {
    setContent(value);
    if (value.trim()) socketRef.current?.emit("chatGroup:typing:start", { chatGroupId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit("chatGroup:typing:stop", { chatGroupId }), 900);
  };
  const submit = () => {
    if (!(content.trim() || media)) return;
    if (editingMessageId) { editMessage.mutate({ messageId: editingMessageId, content: content.trim() }); return; }
    const payload = { chatGroupId, content: content.trim(), mediaUrl: media?.url, mediaKey: media?.key, kind: media?.type === "audio" ? "audio" as const : media?.type === "image" ? "sticker" as const : "text" as const, replyToId: replyTo?.id ?? null };
    const resetAfterSend = () => { setContent(""); setMedia(null); setReplyTo(null); socketRef.current?.emit("chatGroup:typing:stop", { chatGroupId }); };
    if (socketRef.current?.connected) {
      socketRef.current.timeout(7000).emit("chatGroup:send", payload, (error: Error | null, result?: { ok: boolean; message?: string }) => {
        if (error) { toast.error("تعذر الإرسال اللحظي؛ ستتم المحاولة بالطريقة البديلة."); send.mutate(payload); return; }
        if (!result?.ok) { toast.error(result?.message ?? "تعذر إرسال الرسالة."); return; }
        resetAfterSend();
      });
    } else send.mutate(payload);
  };
  if (details.isLoading) return <PlatformShell><p className="p-10 text-center">{t('جارتحميلالمحادثة')}</p></PlatformShell>;
  if (!details.data) return <PlatformShell><p className="p-10 text-center">{t('المحادثةغيرموجودةأولاتملك')}</p></PlatformShell>;
  const isOwner = details.data.membership.role === "owner";
  const isModerator = isOwner || details.data.membership.role === "admin";
  return <PlatformShell><div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]"><div className="flex min-h-[68vh] flex-col overflow-hidden rounded-3xl glass"><header className="flex items-center justify-between gap-3 border-b border-white/10 p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-pink-500/20 text-pink-200">{details.data.avatarUrl ? <img src={details.data.avatarUrl} alt="" className="h-full w-full object-cover"/> : <UsersRound/>}</span><span className="min-w-0"><h1 className="truncate font-bold">{details.data.name}</h1><small className="text-violet-100/55">{details.data.members.length} أعضاء</small></span></div><div className="flex gap-2">{isOwner && <button onClick={() => { setDraftName(details.data.name); setEditing(true); }} className="soft-button rounded-lg p-2" aria-label={t("تعديلالاسم")}><Pencil size={16}/></button>}{isOwner ? <button onClick={() => window.confirm("حذف المحادثة نهائيًا؟") && removeGroup.mutate({ chatGroupId })} className="rounded-lg border border-rose-300/25 p-2 text-rose-100" aria-label={t("حذفالمحادثة")}><Trash2 size={16}/></button> : <button onClick={() => leave.mutate({ chatGroupId })} className="soft-button rounded-lg px-3 py-2 text-sm">{t('مغادرة')}</button>}</div></header>{editing && <div className="border-b border-white/10 p-4"><div className="flex gap-2"><input value={draftName} onChange={e => setDraftName(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 outline-none" placeholder={t("اسمالمحادثة")}/><button onClick={() => update.mutate({ chatGroupId, name: draftName.trim() })} disabled={!draftName.trim()} className="rounded-xl px-3 py-2 gradient-button"><Check size={16}/></button><button onClick={() => setEditing(false)} className="soft-button rounded-xl p-2"><X size={16}/></button></div><div className="mt-3"><MediaUploader kind="group" accept="image/*" label={<span className="inline-flex items-center gap-1"><ImagePlus size={15}/>{t('تغييرالصورة')}</span>} onUploaded={image => update.mutate({ chatGroupId, avatarUrl: image.url, avatarKey: image.key })}/></div></div>}<main className={`thin-scrollbar flex-1 space-y-3 overflow-y-auto p-5 ${chatWallpaperClass}`}>{rows.data?.map((row: any) => <article key={row.message.id} className="group max-w-[82%] rounded-2xl bg-black/20 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm text-pink-200">{row.sender.name || row.sender.username || "عضو"}</b><div className="flex gap-1 opacity-0 transition group-hover:opacity-100"><button onClick={() => setReplyTo(row.message)} className="rounded-lg p-1 text-violet-100/60 hover:bg-white/10" title="رد"><Reply size={14}/></button>{row.message.senderId === details.data.membership.userId && !row.message.deletedAt && <><button onClick={() => { setEditingMessageId(row.message.id); setContent(row.message.content); }} className="rounded-lg p-1 text-violet-100/60 hover:bg-white/10" title="تعديل"><Pencil size={14}/></button><button onClick={() => window.confirm("هل تريد حذف هذه الرسالة؟") && deleteMessage.mutate({ messageId: row.message.id, confirmation: true })} className="rounded-lg p-1 text-rose-200/75 hover:bg-rose-400/10" title="حذف"><Trash2 size={14}/></button></>}</div></div>{row.message.replyToId && <div className="mt-1 rounded-lg border-s-2 border-pink-300/50 bg-black/15 px-2 py-1 text-xs text-violet-100/55">رد على رسالة #{row.message.replyToId}</div>}{row.message.deletedAt ? <p className="mt-1 italic text-violet-100/45">تم حذف هذه الرسالة</p> : row.message.content && <p className={`mt-1 whitespace-pre-wrap text-violet-100/85 ${chatFontClass}`}>{row.message.content}{row.message.editedAt && <small className="ms-2 text-[10px] opacity-60">(معدلة)</small>}</p>}{row.message.mediaUrl && <div className="mt-2 overflow-hidden rounded-xl">{row.message.kind === "audio" ? <audio controls src={row.message.mediaUrl} className="max-w-full"/> : <img src={row.message.mediaUrl} alt={t("وسائطالرسالة")} className="max-h-64 w-full object-cover"/>}</div>}</article>)}{!rows.data?.length && <p className="py-12 text-center text-violet-100/55">{t('ابدأأولرسالةفيالمجموعة')}</p>}</main>{typing && <p className="px-5 pb-2 text-xs text-pink-200">{t('أحدالأعضاءيكتبالآن')}</p>}<footer className="border-t border-white/10 p-4">{(replyTo || editingMessageId) && <div className="mb-3 flex items-center justify-between rounded-xl border border-pink-300/20 bg-pink-400/10 px-3 py-2 text-xs text-pink-100"><span>{editingMessageId ? "تعديل رسالة المجموعة" : `الرد على رسالة #${replyTo?.id}`}</span><button onClick={() => { setReplyTo(null); setEditingMessageId(null); setContent(""); }}>إلغاء</button></div>}<div className="flex gap-2"><MediaUploader kind="message" accept="image/*" label={<ImagePlus size={18}/>} onUploaded={setMedia}/><MediaUploader kind="message" accept="audio/*" label={<AudioLines size={18}/>} onUploaded={setMedia}/><input value={content} onChange={e => emitTyping(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={t("اكتبرسالةللمجموعة")} className={`min-w-0 flex-1 rounded-xl bg-black/20 px-4 py-3 outline-none ${chatFontClass}`}/><button onClick={submit} disabled={send.isPending || (!content.trim() && !media)} className="grid w-12 place-items-center rounded-xl gradient-button disabled:opacity-50"><Send size={18}/></button></div>{media && <p className="mt-2 text-xs text-pink-200">{t('تماختياروسائطللإرسال')}</p>}</footer></div><aside className="rounded-3xl glass p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{t('الأعضاء')}</h2><span className="text-sm text-violet-100/55">{details.data.members.length}</span></div>{isModerator && <div className="mt-4"><div className="flex gap-2"><input value={memberId} onChange={e => setMemberId(e.target.value)} placeholder={t("معرفالمستخدم")} className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><button onClick={() => memberId && addMember.mutate({ chatGroupId, userId: Number(memberId) })} className="rounded-xl px-3 py-2 gradient-button">{t('إضافة')}</button></div><p className="mt-2 text-xs text-violet-100/50">{t('يمكنللمشرفإضافةعضوبواسطةمعرفه')}</p></div>}{isModerator && <section className="mt-5 border-t border-white/10 pt-5"><h3 className="flex items-center gap-2 font-bold"><Bot size={16} className="text-pink-200"/>{t('bot')}</h3>{!bot ? <div className="mt-3 flex gap-2"><input value={botName} onChange={e => setBotName(e.target.value)} placeholder={t('botName')} className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><button disabled={!botName.trim()} onClick={() => botCreate.mutate({ scope: 'chatGroup', scopeId: chatGroupId, name: botName.trim() })} className="rounded-xl px-3 py-2 text-sm gradient-button">{t('create')}</button></div> : <><div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 p-3 text-sm"><b>{bot.name}</b><button onClick={() => botDelete.mutate({ botId: bot.id })} className="text-rose-200"><Trash2 size={14}/></button></div><div className="mt-2 grid gap-2"><input value={botTrigger} onChange={e => setBotTrigger(e.target.value)} placeholder={t('triggerWord')} className="rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><input value={botResponse} onChange={e => setBotResponse(e.target.value)} placeholder={t('botResponse')} className="rounded-xl bg-black/20 px-3 py-2 text-sm outline-none"/><button disabled={!botTrigger.trim() || !botResponse.trim()} onClick={() => botAddRule.mutate({ botId: bot.id, trigger: botTrigger.trim(), response: botResponse.trim() })} className="rounded-xl px-3 py-2 text-sm gradient-button">{t('addRule')}</button></div><div className="mt-2 space-y-1">{botRules.data?.map(rule => <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/15 px-2 py-1 text-xs"><span><b>{rule.trigger}</b> ← {rule.response}</span><button onClick={() => botDeleteRule.mutate({ botId: bot.id, ruleId: rule.id })} className="text-rose-200"><Trash2 size={12}/></button></div>)}</div></>}</section>}
        <div className="mt-4 space-y-2">{details.data.members.map((row: any) => <div key={row.member.id} className="rounded-xl bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{row.user.name || row.user.username || "عضو"}</span><small className="rounded-full bg-white/8 px-2 py-1 text-xs">{row.member.role === "owner" ? "مالك" : row.member.role === "admin" ? "مشرف" : "عضو"}</small></div>{isModerator && row.member.role !== "owner" && <div className="mt-2 flex flex-wrap gap-2"><button onClick={() => removeMember.mutate({ chatGroupId, memberId: row.member.id })} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/25 px-2 py-1 text-xs text-rose-100"><UserMinus size={13}/>{t('إزالة')}</button>{isOwner && <><button onClick={() => setRole.mutate({ chatGroupId, memberId: row.member.id, role: row.member.role === "admin" ? "member" : "admin" })} className="rounded-lg px-2 py-1 text-xs soft-button">{row.member.role === "admin" ? "خفض" : "ترقية"}</button><button onClick={() => window.confirm("نقل الملكية لهذا العضو؟") && transfer.mutate({ chatGroupId, newOwnerId: row.member.userId })} className="rounded-lg px-2 py-1 text-xs soft-button"><Shield size={13} className="inline ml-1"/>{t('نقلالملكية')}</button></>}</div>}</div>)}</div></aside></div></PlatformShell>;
}
