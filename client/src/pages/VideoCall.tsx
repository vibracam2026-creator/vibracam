import { PlatformShell } from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { PhoneOff, Video, VideoOff, Mic, MicOff, PhoneCall, PhoneIncoming, X, Phone, History, AudioLines } from "lucide-react";
import SimplePeer from "simple-peer";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/lib/i18n";

type IncomingCall = { callId: number; from: number; kind: "video" | "audio" };

const CALL_RING_TIMEOUT_MS = 45_000;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function CallHistoryPanel() {
  const { t } = useLanguage();
  const history = trpc.calls.history.useQuery(undefined, { refetchInterval: 8000 });
  return (
    <section className="mt-6 rounded-[2rem] glass p-5">
      <div className="flex items-center gap-2">
        <History size={18} className="text-pink-300" />
        <h2 className="font-bold">{t('سجلالمكالمات')}</h2>
      </div>
      <div className="mt-3 space-y-2">
        {history.data?.map(({ call, peer }) => (
          <div key={call.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5">
            <div className="min-w-0">
              <b className="block truncate">{peer?.name || "مستخدم VibraCam"}</b>
              <small className="text-violet-100/55">
                {call.kind === "audio" ? <AudioLines size={12} className="mr-1 inline" /> : <Video size={12} className="mr-1 inline" />}
                {call.isRandom ? "مكالمة عشوائية" : call.initiatorId === call.receiverId ? "" : ""}
                {call.status === "ended" && call.durationSeconds > 0 && `· ${formatDuration(call.durationSeconds)}`}
                {call.status === "missed" && "· مكالمة فائتة"}
                {call.status === "rejected" && "· مرفوضة"}
                {call.status === "incoming" && "· واردة"}
              </small>
            </div>
            <small className="text-violet-100/55">{new Date(call.createdAt).toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</small>
          </div>
        ))}
        {!history.data?.length && <p className="py-6 text-center text-sm text-violet-100/55">{t('لاتوجدمكالماتسابقة')}</p>}
      </div>
    </section>
  );
}

export default function VideoCall() {
  const { t } = useLanguage();
  const [, params] = useRoute("/video/:peerId");
  const peerId = Number(params?.peerId);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const socket = useRef<Socket | null>(null);
  const peer = useRef<any>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const callIdRef = useRef<number>(0);
  const [status, setStatus] = useState("جاهز لبدء المكالمة");
  const [connected, setConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [, setLocation] = useLocation();

  const clearTimer = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const setLocalStream = async () => {
    if (stream.current) return stream.current;
    const value = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: true });
    stream.current = value;
    if (localVideo.current) localVideo.current.srcObject = value;
    return value;
  };

  const startCallTimer = () => {
    clearTimer();
    const start = Date.now();
    timer.current = window.setInterval(() => {
      setCallDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  };

  const stopCallTimer = () => {
    clearTimer();
    setCallDuration(0);
  };

  const createPeer = async (initiator: boolean) => {
    const media = await setLocalStream();
    const value = new SimplePeer({ initiator, trickle: false, stream: media });
    value.on("signal", signal => socket.current?.emit("call:signal", { peerId, callId: callIdRef.current, signal }));
    value.on("stream", remote => {
      if (remoteVideo.current) remoteVideo.current.srcObject = remote;
      setStatus("المكالمة متصلة");
      setConnected(true);
      startCallTimer();
    });
    value.on("error", () => setStatus("تعذر إنشاء الاتصال. تأكد من وجود المستخدم على الإنترنت."));
    peer.current = value;
    return value;
  };

  const end = () => {
  const { t } = useLanguage();
    stopCallTimer();
    socket.current?.emit("call:hangup", { peerId, callId: callIdRef.current, durationSeconds: callDuration });
    peer.current?.destroy();
    peer.current = null;
    callIdRef.current = 0;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setConnected(false);
    setStatus("انتهت المكالمة");
  };

  useEffect(() => {
    const value = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.current = value;

    value.on("call:incoming", (payload: IncomingCall) => {
      setIncoming(payload);
      setStatus("مكالمة واردة...");
      clearTimer();
      timer.current = window.setTimeout(() => {
        setIncoming(null);
        setStatus("لم يُجب الطرف الآخر على المكالمة.");
      }, CALL_RING_TIMEOUT_MS);
    });
    value.on("call:accepted", async () => {
      clearTimer();
      setIncoming(null);
      setStatus("يتم توصيل المكالمة...");
      try { await createPeer(false); } catch { setStatus("تعذر إنشاء الاتصال."); }
    });
    value.on("call:rejected", () => {
      clearTimer();
      setIncoming(null);
      end();
    });
    value.on("call:missed", () => {
      clearTimer();
      setStatus("لم يُجب الطرف الآخر على المكالمة.");
    });
    value.on("call:signal", async ({ from, callId, signal }: { from: number; callId: number; signal: unknown }) => {
      if (from !== peerId || !Number.isFinite(callId)) return;
      const active = peer.current ?? await createPeer(false);
      active.signal(signal);
    });
    value.on("call:hangup", ({ from }: { from: number }) => {
      if (from === peerId) {
        clearTimer();
        end();
      }
    });
    return () => {
      clearTimer();
      value.close();
      peer.current?.destroy();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, [peerId]);

  const begin = async () => {
    if (!Number.isFinite(peerId) || peerId <= 0) return;
    try {
      callIdRef.current = 0;
      await createPeer(true);
      setStatus("جارٍ استدعاء الطرف الآخر...");
    } catch {
      setStatus("تعذر الوصول إلى الكاميرا أو الميكروفون.");
    }
  };

  const accept = async () => {
    if (!incoming) return;
    clearTimer();
    callIdRef.current = incoming.callId;
    peerId; // peerId هنا هو الطرف المستقبل، والطرف الآخر هو incoming.from
    socket.current?.emit("call:accept", { peerId: incoming.from, callId: incoming.callId });
    setIncoming(null);
    setStatus("يتم توصيل المكالمة...");
    const savedFrom = incoming.from;
    try {
      const media = await setLocalStream();
      const value = new SimplePeer({ initiator: false, trickle: false, stream: media });
      value.on("signal", signal => socket.current?.emit("call:signal", { peerId: savedFrom, callId: incoming.callId, signal }));
      value.on("stream", remote => {
        if (remoteVideo.current) remoteVideo.current.srcObject = remote;
        setStatus("المكالمة متصلة");
        setConnected(true);
        startCallTimer();
      });
      value.on("error", () => setStatus("تعذر إنشاء الاتصال."));
      peer.current = value;
    } catch {
      setStatus("تعذر الوصول إلى الكاميرا أو الميكروفون.");
    }
  };

  const reject = () => {
  const { t } = useLanguage();
    if (!incoming) return;
    clearTimer();
    socket.current?.emit("call:reject", { peerId: incoming.from, callId: incoming.callId });
    setIncoming(null);
    setStatus("تم رفض المكالمة.");
  };

  const toggleCamera = () => {
    const track = stream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  };
  const toggleMic = () => {
    const track = stream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  return (
    <PlatformShell>
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-pink-200">{t('اتصالمباشر')}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{t('مكالمةفيديو')}</h1>

        {incoming && (
          <div className="mt-4 overflow-hidden rounded-3xl border border-pink-400/30 bg-pink-500/15 p-5 text-center">
            <PhoneIncoming size={28} className="mx-auto mb-2 text-pink-300" />
            <p className="font-bold">{t('مكالمةواردة')}</p>
            <p className="mt-1 text-sm text-violet-100/70">يطالبك مستخدم بالمنصة بمكالمة {incoming.kind === "audio" ? "صوتية" : "فيديو"}</p>
            <div className="mt-3 flex justify-center gap-3">
              <Button onClick={accept} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-6 hover:bg-emerald-500"><Phone size={18} />{t('قبول')}</Button>
              <Button onClick={reject} variant="destructive" className="inline-flex h-12 items-center gap-2 rounded-2xl px-6"><X size={18} />{t('رفض')}</Button>
            </div>
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-[2rem] glass">
          <div className="grid min-h-[26rem] grid-cols-1 gap-3 bg-black/35 p-3 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl bg-violet-950/40">
              <video ref={remoteVideo} autoPlay playsInline className="h-full min-h-56 w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center text-violet-100/45"><Video size={32} /></div>
              {connected && <span className="absolute right-3 top-3 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">{formatDuration(callDuration)}</span>}
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-violet-950/40">
              <video ref={localVideo} autoPlay muted playsInline className="relative z-10 h-full min-h-56 w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center text-violet-100/45"><Video size={32} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-5">
            <span className="w-full text-center text-sm text-violet-100/65">{status}</span>
            <button onClick={toggleMic} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالميكروفون")}>{micOn ? <Mic size={19} /> : <MicOff size={19} />}</button>
            <button onClick={toggleCamera} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالكاميرا")}>{cameraOn ? <Video size={19} /> : <VideoOff size={19} />}</button>
            <button onClick={begin} className="inline-flex h-12 items-center gap-2 rounded-2xl px-5 gradient-button"><PhoneCall size={18} />{t('بدء')}</button>
            <button onClick={end} className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-500 shadow-lg shadow-pink-500/30" aria-label={t("إنهاءالمكالمة")}><PhoneOff size={20} /></button>
          </div>
        </section>
        <p className="mt-4 text-center text-sm text-violet-100/50">{t('يجبأنيكونالطرفالآخرمتصلا')}</p>

        <CallHistoryPanel />

        <div className="mt-4 flex justify-center">
          <Link href="/random-call" className="inline-flex items-center gap-2 rounded-2xl border border-pink-400/30 bg-pink-500/15 px-5 py-3 font-bold text-pink-200 hover:bg-pink-500/25">
            <PhoneCall size={18} />ابدأ مكالمة عشوائية جديدة
          </Link>
        </div>
      </div>
    </PlatformShell>
  );
}
