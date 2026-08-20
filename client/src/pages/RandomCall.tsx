import { PlatformShell } from "@/components/PlatformShell";
import { Button } from "@/components/ui/button";
import { PhoneOff, Video, VideoOff, Mic, MicOff, Shuffle, Users, Loader2, Video as VideoIcon, Music } from "lucide-react";
import SimplePeer from "simple-peer";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

type MatchedPayload = { callId: number; from: number; user?: { id: number; name: string | null; username: string | null; avatarUrl: string | null } };

export default function RandomCall() {
  const { t } = useLanguage();
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const socket = useRef<Socket | null>(null);
  const peer = useRef<any>(null);
  const stream = useRef<MediaStream | null>(null);
  const callIdRef = useRef<number>(0);
  const peerIdRef = useRef<number | null>(null);
  const searchTimer = useRef<number | null>(null);
  const durationTimer = useRef<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "searching" | "ringing" | "connected" | "ended">("idle");
  const [kind, setKind] = useState<"video" | "audio">("video");
  const [preferredGender, setPreferredGender] = useState<"any" | "male" | "female">("any");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [status, setStatus] = useState("اضغط للبحث عن طرف عشوائي");
  const [callDuration, setCallDuration] = useState(0);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const clearSearchTimer = () => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };
  const clearDurationTimer = () => {
    if (durationTimer.current) {
      window.clearInterval(durationTimer.current);
      durationTimer.current = null;
    }
  };

  useEffect(() => {
    const value = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.current = value;

    value.on("randomCall:matched", (payload: MatchedPayload) => {
      clearSearchTimer();
      callIdRef.current = payload.callId;
      peerIdRef.current = payload.from;
      setPartnerName(payload.user?.name ?? "مستخدم VibraCam");
      setPhase("ringing");
      setStatus("تم العثور على طرف! جارٍ التوصيل...");
    });
    value.on("randomCall:signal", async ({ from, signal }: { from: number; signal: unknown }) => {
      if (from !== peerIdRef.current) return;
      const active = peer.current ?? await createPeer(false);
      active.signal(signal);
    });
    value.on("randomCall:hangup", ({ from }: { from: number }) => {
      if (from === peerIdRef.current) endCall("غادر الطرف الآخر المكالمة.");
    });
    value.on("randomCall:ended", () => endCall("انتهت المكالمة العشوائية."));
    return () => {
      clearSearchTimer();
      clearDurationTimer();
      value.emit("randomCall:leave", {});
      value.close();
      peer.current?.destroy();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const getLocalStream = async () => {
    if (stream.current) return stream.current;
    try {
      const value = await navigator.mediaDevices.getUserMedia({ video: kind === "video", audio: true });
      stream.current = value;
      if (localVideo.current) localVideo.current.srcObject = value;
      return value;
    } catch (mediaError) {
      // Insecure origins (plain HTTP) or missing devices block camera access; retry audio-only if possible.
      if (kind === "video") {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          stream.current = audioOnly;
          setStatus("تعذر الوصول إلى الكاميرا؛ تم التعديل إلى وضع صوتي.");
          return audioOnly;
        } catch {
          // no audio device either: join with no local media
        }
      }
      const empty = new MediaStream();
      stream.current = empty;
      if (localVideo.current) localVideo.current.srcObject = empty;
      setStatus(kind === "video" ? "تعذر الوصول إلى الكاميرا أو الميكروفون؛ يمكنك المتابعة دون وسائط محلية." : "تعذر الوصول إلى الميكروفون؛ يمكنك المتابعة دون وسائط محلية.");
      return empty;
    }
  };

  const createPeer = async (initiator: boolean) => {
    const media = await getLocalStream();
    const value = new SimplePeer({ initiator, trickle: false, stream: media });
    value.on("signal", signal => socket.current?.emit("randomCall:signal", { peerId: peerIdRef.current, signal }));
    value.on("stream", remote => {
      if (remoteVideo.current) remoteVideo.current.srcObject = remote;
      setPhase("connected");
      setStatus("المكالمة متصلة");
      startDurationTimer();
    });
    value.on("error", () => setStatus("تعذر إنشاء الاتصال المباشر."));
    peer.current = value;
    return value;
  };

  const startDurationTimer = () => {
    clearDurationTimer();
    const start = Date.now();
    durationTimer.current = window.setInterval(() => setCallDuration(Math.floor((Date.now() - start) / 1000)), 1000);
  };

  const startSearch = async () => {
    try {
      await getLocalStream();
      setPartnerName(null);
      callIdRef.current = 0;
      peerIdRef.current = null;
      setPhase("searching");
      setStatus("جارٍ البحث عن طرف عشوائي...");
      socket.current?.emit("randomCall:join", { kind, preferredGender }, (result: { joined: boolean; partnerId?: number; callId?: number; message?: string }) => {
        if (!result.joined) {
          setPhase("idle");
          setStatus(result.message ?? "تعذر بدء البحث.");
          return;
        }
        if (result.partnerId) {
          peerIdRef.current = result.partnerId;
          callIdRef.current = result.callId!;
          setPartnerName("مستخدم VibraCam");
          setPhase("ringing");
          setStatus("تم العثور على طرف! جارٍ التوصيل...");
          void createPeer(true);
        }
      });
      clearSearchTimer();
      searchTimer.current = window.setTimeout(() => {
        if (phase === "searching") {
          setPhase("idle");
          setStatus("لم يُعثَر على طرف. جرّب مرة أخرى.");
          socket.current?.emit("randomCall:leave", {});
        }
      }, 90_000);
    } catch {
      setPhase("idle");
      setStatus("تعذر الوصول إلى الكاميرا أو الميكروفون.");
    }
  };

  const endCall = (finalStatus = t("callEnded")) => {
    clearSearchTimer();
    clearDurationTimer();
    socket.current?.emit("randomCall:hangup", { peerId: peerIdRef.current ?? 0 });
    peer.current?.destroy();
    peer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setCallDuration(0);
    setPhase("idle");
    setStatus(finalStatus);
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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <PlatformShell>
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-pink-200">{t('تعارفمباشر')}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{t('مكالمةعشوائية')}</h1>

        <section className="mt-6 overflow-hidden rounded-[2rem] glass">
          <div className="grid min-h-[26rem] grid-cols-1 gap-3 bg-black/35 p-3 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl bg-violet-950/40">
              <video ref={remoteVideo} autoPlay playsInline className="h-full min-h-56 w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center text-violet-100/45">
                {phase === "ringing" || phase === "connected" ? (
                  <div className="text-center">
                    <Users size={32} className="mx-auto mb-2 text-pink-300" />
                    <p className="text-sm font-bold">{partnerName ?? "مستخدم VibraCam"}</p>
                  </div>
                ) : <VideoIcon size={32} />}
              </div>
              {phase === "connected" && <span className="absolute right-3 top-3 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">{formatDuration(callDuration)}</span>}
              {phase === "searching" && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <Loader2 size={40} className="mx-auto animate-spin text-pink-300" />
                    <p className="mt-3 text-sm font-bold">{t('matching')}</p>
                    <p className="mt-1 text-xs text-violet-100/55">{t('leaveSearchHint')}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-violet-950/40">
              <video ref={localVideo} autoPlay muted playsInline className="relative z-10 h-full min-h-56 w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center text-violet-100/45"><VideoIcon size={32} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-5">
            <span className="w-full text-center text-sm text-violet-100/65">{status}</span>
            {phase === "searching" ? (
              <button onClick={() => { socket.current?.emit("randomCall:leave", {}); setPhase("idle"); setStatus("خرجت من قائمة الانتظار."); }} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-pink-500 px-6 font-bold shadow-lg shadow-pink-500/30">{t('endSearch')}</button>
            ) : phase === "idle" ? (
              <>
                <button onClick={() => { setKind("video"); }} className={`inline-flex h-12 items-center gap-2 rounded-2xl px-5 ${kind === "video" ? "gradient-button" : "soft-button"}`}><Video size={18} />{t('video')}</button>
                <button onClick={() => { setKind("audio"); }} className={`inline-flex h-12 items-center gap-2 rounded-2xl px-5 ${kind === "audio" ? "gradient-button" : "soft-button"}`}><Music size={18} />{t('audio')}</button>
                <div className="inline-flex items-center gap-1 rounded-2xl bg-white/8 p-1">
                  <button onClick={() => { setPreferredGender("any"); }} className={`h-10 rounded-xl px-4 text-sm font-bold ${preferredGender === "any" ? "gradient-button" : "text-violet-100/70"}`}>{t('any')}</button>
                  <button onClick={() => { setPreferredGender("female"); }} className={`h-10 rounded-xl px-4 text-sm font-bold ${preferredGender === "female" ? "gradient-button" : "text-violet-100/70"}`}>{t('female')}</button>
                  <button onClick={() => { setPreferredGender("male"); }} className={`h-10 rounded-xl px-4 text-sm font-bold ${preferredGender === "male" ? "gradient-button" : "text-violet-100/70"}`}>{t('male')}</button>
                </div>
                <button onClick={startSearch} className="inline-flex h-12 items-center gap-2 rounded-2xl px-6 gradient-button"><Shuffle size={18} />{t('searchForPartner')}</button>
              </>
            ) : (
              <>
                <button onClick={toggleMic} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالميكروفون")}>{micOn ? <Mic size={19} /> : <MicOff size={19} />}</button>
                <button onClick={toggleCamera} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالكاميرا")}>{cameraOn ? <Video size={19} /> : <VideoOff size={19} />}</button>
                <button onClick={() => endCall()} className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-500 shadow-lg shadow-pink-500/30" aria-label={t("endCall")}><PhoneOff size={20} /></button>
              </>
            )}
          </div>
        </section>
        <p className="mt-4 text-center text-sm text-violet-100/50">تصلك مكالمة مباشرة مع مستخدم عشوائي متصل حاليًا بالمنصة. يمكنك اختيار الجنس المفضل (الكل / أنثى / ذكر) أو إبقاؤه عشوائيًا. انتهِ من المكالمة في أي وقت.</p>
      </div>
    </PlatformShell>
  );
}
