import { PlatformShell } from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye, Heart, MessageCircle, Users, Video as VideoIcon } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

type ChatMessage = { id: number; streamId: number; userId: number; content: string; kind: "text" | "gif" | "sticker"; createdAt: Date; user: { id: number; name: string | null; username: string | null; avatarUrl: string | null } };

const QUICK_EMOJIS = ["❤️", "🔥", "👏", "😂", "😮", "🎉"];
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export default function LiveWatch() {
  const { t } = useLanguage();
  const [, params] = useRoute("/live/:id");
  const streamId = Number(params?.id);
  const socket = useRef<Socket | null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const chatBox = useRef<HTMLDivElement>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [streamTitle, setStreamTitle] = useState<string | null>(null);
  const [broadcasterName, setBroadcasterName] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string }[]>([]);
  const reactionId = useRef(0);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const iceServers = trpc.system.iceServers.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const chatQuery = trpc.live.chat.useQuery({ streamId }, { enabled: Number.isFinite(streamId) && streamId > 0, refetchInterval: 12_000 });
  const stream = trpc.live.byId.useQuery({ streamId }, { enabled: Number.isFinite(streamId) && streamId > 0, refetchInterval: 10000 });
  const viewers = trpc.live.viewers.useQuery({ streamId }, { enabled: Number.isFinite(streamId) && streamId > 0, refetchInterval: 15_000 });
  const sendChatFallback = trpc.live.sendChat.useMutation({
    onSuccess: saved => setChat(current => current.some(item => item.id === saved.id) ? current : [...current.slice(-60), saved]),
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (iceServers.data?.iceServers?.length) iceServersRef.current = iceServers.data.iceServers as RTCIceServer[];
  }, [iceServers.data]);

  useEffect(() => {
    if (chatQuery.data) setChat(chatQuery.data as ChatMessage[]);
  }, [chatQuery.data]);

  useEffect(() => {
    const value = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.current = value;
    const closePeer = () => { peerConnection.current?.close(); peerConnection.current = null; if (remoteVideo.current) remoteVideo.current.srcObject = null; };
    const onSignal = async ({ from, signal }: { streamId: number; from: number; signal: { type: "offer" | "candidate"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (!peerConnection.current) {
        const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
        peer.ontrack = event => { if (remoteVideo.current && event.streams[0]) { remoteVideo.current.srcObject = event.streams[0]; void remoteVideo.current.play().catch(() => undefined); } };
        peer.onicecandidate = event => { if (event.candidate) value.emit("live:signal", { streamId, targetId: from, signal: { type: "candidate", candidate: event.candidate.toJSON() } }); };
        peerConnection.current = peer;
      }
      const peer = peerConnection.current;
      if (!peer) return;
      if (signal.type === "offer" && signal.sdp) {
        await peer.setRemoteDescription(signal.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        value.emit("live:signal", { streamId, targetId: from, signal: { type: "answer", sdp: peer.localDescription } });
      } else if (signal.type === "candidate" && signal.candidate) {
        await peer.addIceCandidate(signal.candidate);
      }
    };
    const joinLive = () => {
      value.timeout(7000).emit("live:join", { streamId }, (error: Error | null, result?: { joined: boolean; viewerCount?: number; streamTitle?: string; broadcasterName?: string; message?: string }) => {
        if (error || !result?.joined) return;
        setViewerCount(result.viewerCount ?? 0);
        setStreamTitle(result.streamTitle ?? null);
        setBroadcasterName(result.broadcasterName ?? null);
      });
    };
    value.on("connect", joinLive);
    value.on("live:signal", onSignal);
    if (value.connected) joinLive();
    value.on("live:viewerCount", (payload: { streamId: number; viewerCount: number }) => {
      if (payload.streamId === streamId) setViewerCount(payload.viewerCount);
    });
    value.on("live:chatMessage", (message: ChatMessage) => {
      setChat(prev => [...prev.slice(-60), message]);
    });
    value.on("live:reaction", ({ emoji }: { from: number; emoji: string }) => {
      const id = ++reactionId.current;
      setFloatingReactions(prev => [...prev.slice(-15), { id, emoji }]);
      window.setTimeout(() => setFloatingReactions(prev => prev.filter(item => item.id !== id)), 2200);
    });
    value.on("live:ended", () => {
      toast.info("انتهى البث المباشر.");
      void utils.live.byId.invalidate();
    });
    return () => { value.emit("live:leave", { streamId }); value.off("connect", joinLive); value.off("live:signal", onSignal); closePeer(); value.close(); };
  }, [streamId]);

  useEffect(() => {
    chatBox.current?.scrollTo({ top: chatBox.current.scrollHeight });
  }, [chat]);

  const send = () => {
    const content = message.trim();
    if (!content) return;
    if (socket.current?.connected) {
      socket.current.timeout(7000).emit("live:chat", { streamId, content }, (error: Error | null, result?: { ok: boolean; message?: string }) => {
        if (error) { sendChatFallback.mutate({ streamId, content }); return; }
        if (!result?.ok) toast.error(result?.message ?? "تعذر إرسال رسالة الدردشة.");
      });
    } else sendChatFallback.mutate({ streamId, content });
    setMessage("");
  };

  const sendReaction = (emoji: string) => {
    if (!socket.current) return;
    socket.current.emit("live:reaction", { streamId, emoji });
    const id = ++reactionId.current;
    setFloatingReactions(prev => [...prev.slice(-15), { id, emoji }]);
    window.setTimeout(() => setFloatingReactions(prev => prev.filter(item => item.id !== id)), 2200);
  };

  const liveStream = stream.data?.stream;
  const broadcaster = stream.data?.broadcaster;

  return (
    <PlatformShell>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-pink-200">{t('بثمباشر')}</p>
          <Link href="/live" className="inline-flex items-center gap-1 text-sm text-violet-100/60 hover:text-violet-100"><VideoIcon size={14} />{t('البثوثالنشطة')}</Link>
        </div>
        <h1 className="mt-1 text-3xl font-extrabold">{streamTitle ?? "بث مباشر"}</h1>

        {stream.isLoading && <p className="mt-6 text-center text-violet-100/60">{t('جارتحميلالبث')}</p>}
        {!stream.data && !stream.isLoading && (
          <div className="mt-6 rounded-[2rem] glass p-10 text-center text-violet-100/60">
            <VideoIcon size={32} className="mx-auto mb-3 text-pink-300" />
            <p>{t('البثغيرموجودأوانتهى')}</p>
            <Link href="/live" className="mt-4 inline-block rounded-xl gradient-button px-5 py-2.5">{t('تصفحالبثوثالنشطة')}</Link>
          </div>
        )}

        {liveStream && broadcaster && (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]">
            <section className="overflow-hidden rounded-[2rem] glass">
              <div className="relative aspect-video bg-black">
                <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-contain" />
                {!remoteVideo.current?.srcObject && <div className="absolute inset-0 grid place-items-center text-violet-100/40"><VideoIcon size={48} /></div>}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-pink-400/60">
                        <AvatarImage src={broadcaster.avatarUrl ?? undefined} />
                        <AvatarFallback>{(broadcaster.name ?? "م").slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <b className="block">{broadcaster.name || broadcaster.username || "مستخدم VibraCam"}</b>
                        <span className="inline-flex items-center gap-2 text-xs text-violet-100/65"><span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 font-bold text-white"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />{t('مباشر')}</span><span className="inline-flex items-center gap-1"><Eye size={12} />{viewerCount}</span></span>
                      </div>
                    </div>
                    <div className="relative h-24 w-24 overflow-hidden">
                      {floatingReactions.map(item => (
                        <span key={item.id} className="absolute bottom-0 right-4 text-2xl animate-bounce">{item.emoji}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-4">
                {QUICK_EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => sendReaction(emoji)} className="text-2xl transition-transform hover:scale-125" aria-label={`تفاعل ${emoji}`}>{emoji}</button>
                ))}
                <span className="ms-auto text-xs text-violet-100/50">{t('اضغطقلباأوإيموجيالتفاعلسريع')}</span>
              </div>
            </section>

            <aside className="flex h-[32rem] flex-col overflow-hidden rounded-[2rem] glass">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold"><MessageCircle size={15} className="text-pink-300" />{t('دردشةالبث')}</span>
                <span className="inline-flex items-center gap-1 text-xs text-violet-100/60"><Users size={13} />{viewerCount} مشاهد</span>
              </div>
              <div ref={chatBox} className="flex-1 space-y-2 overflow-y-auto p-3">
                {chat.map(item => (
                  <div key={item.id} className="flex items-start gap-2 rounded-xl bg-black/20 px-3 py-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={item.user.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px]">{(item.user.name ?? "م").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <small className="block font-bold">{item.user.name || item.user.username || "مستخدم VibraCam"}</small>
                      <p className="break-words text-sm">{item.content}</p>
                    </div>
                  </div>
                ))}
                {!chat.length && <p className="py-8 text-center text-sm text-violet-100/55">{t('ابدأالدردشةوكنأولمنيرسل')}</p>}
              </div>
              <div className="border-t border-white/10 p-3">
                <div className="flex gap-2">
                  <input value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter") send(); }} placeholder={t("اكتبرسالة")} maxLength={500} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-pink-300/60" />
                  <button onClick={send} className="rounded-xl gradient-button px-4 text-sm">{t('إرسال')}</button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {viewers.data && viewers.data.length > 0 && (
          <section className="mt-5 rounded-[2rem] glass p-5">
            <h2 className="flex items-center gap-2 font-bold"><Users size={16} className="text-pink-300" />{t('المشاهدونالآن')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {viewers.data.map(viewer => (
                <button key={viewer.id} onClick={() => setLocation(`/profile/${viewer.id}`)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-sm hover:border-pink-400/40">
                  <Avatar className="h-5 w-5"><AvatarImage src={viewer.avatarUrl ?? undefined} /><AvatarFallback className="text-[10px]">{(viewer.name ?? "م").slice(0, 1)}</AvatarFallback></Avatar>
                  {viewer.name || viewer.username || "مستخدم VibraCam"}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </PlatformShell>
  );
}
