import { PlatformShell } from "@/components/PlatformShell";
import { Eye, Loader2, Mic, MicOff, PhoneOff, Radio, Video, VideoOff } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/lib/i18n";

type LiveSignal = { type: "offer" | "answer" | "candidate"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type SavedRecording = { url: string; key: string };
type PostActions = { streamId: number; blob: Blob | null; saved: SavedRecording | null };

function explainMediaError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (!window.isSecureContext) return "يجب فتح الموقع عبر HTTPS حتى تعمل الكاميرا والميكروفون.";
  if (name === "NotAllowedError" || name === "SecurityError") return "تم رفض إذن الكاميرا أو الميكروفون. اضغط رمز القفل بجانب عنوان الموقع، ثم اسمح بالكاميرا والميكروفون وأعد المحاولة.";
  if (name === "NotFoundError") return "لم يتم العثور على كاميرا أو ميكروفون متصل بالجهاز.";
  if (name === "NotReadableError" || name === "TrackStartError") return "الكاميرا أو الميكروفون مستخدم من تطبيق آخر. أغلق التطبيق الآخر ثم أعد المحاولة.";
  if (name === "OverconstrainedError") return "إعدادات الكاميرا غير مدعومة على هذا الجهاز. جرّب كاميرا أخرى أو متصفحًا مختلفًا.";
  return error instanceof Error ? `تعذر تشغيل الكاميرا والميكروفون: ${error.message}` : "تعذر تشغيل الكاميرا والميكروفون. تحقق من الأذونات والجهاز ثم أعد المحاولة.";
}

function fileToBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_RECORDING_SIZE = 200 * 1024 * 1024;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export default function LiveBroadcast() {
  const { t } = useLanguage();
  const localVideo = useRef<HTMLVideoElement>(null);
  const socket = useRef<Socket | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderChunks = useRef<Blob[]>([]);
  const peerConnections = useRef(new Map<number, RTCPeerConnection>());
  const streamIdRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"setup" | "live">("setup");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [status, setStatus] = useState("جهّز عنوان بثك وشغّل الكاميرا");
  const [elapsed, setElapsed] = useState(0);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [postActions, setPostActions] = useState<PostActions | null>(null);
  const [postText, setPostText] = useState("");
  const [reelCaption, setReelCaption] = useState("");
  const [busyAction, setBusyAction] = useState<"upload" | "post" | "reel" | "delete" | null>(null);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const iceServers = trpc.system.iceServers.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  useEffect(() => {
    if (iceServers.data?.iceServers?.length) iceServersRef.current = iceServers.data.iceServers as RTCIceServer[];
  }, [iceServers.data]);
  const createStream = trpc.live.create.useMutation({ onError: error => setStatus(error.message), onSuccess: () => setStatus("البث المباشر نشط الآن") });
  const endStreamMutation = trpc.live.end.useMutation({ onError: error => setStatus(error.message) });
  const cancelStreamMutation = trpc.live.cancel.useMutation({ onError: error => setStatus(error.message) });
  const saveRecordingMutation = trpc.live.saveRecording.useMutation();
  const publishPostMutation = trpc.live.publishAsPost.useMutation();
  const publishReelMutation = trpc.live.publishAsReel.useMutation();
  const deleteStreamMutation = trpc.live.delete.useMutation();
  const uploadChunk = trpc.media.uploadChunk.useMutation();
  const completeChunked = trpc.media.completeChunked.useMutation();

  const createPeerConnection = (viewerId: number) => {
    const existing = peerConnections.current.get(viewerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
    stream.current?.getTracks().forEach(track => peer.addTrack(track, stream.current!));
    peer.onicecandidate = event => {
      if (event.candidate && streamIdRef.current) socket.current?.emit("live:signal", { streamId: streamIdRef.current, targetId: viewerId, signal: { type: "candidate", candidate: event.candidate.toJSON() } });
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peer.close();
        peerConnections.current.delete(viewerId);
      }
    };
    peerConnections.current.set(viewerId, peer);
    return peer;
  };

  const sendOfferToViewer = async (viewerId: number) => {
    const currentStreamId = streamIdRef.current;
    if (!currentStreamId || !stream.current) return;
    const peer = createPeerConnection(viewerId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.current?.emit("live:signal", { streamId: currentStreamId, targetId: viewerId, signal: { type: "offer", sdp: peer.localDescription } });
  };

  const handleLiveSignal = async (from: number, signal: LiveSignal) => {
    const peer = createPeerConnection(from);
    if (signal.type === "answer" && signal.sdp) await peer.setRemoteDescription(signal.sdp);
    if (signal.type === "candidate" && signal.candidate) await peer.addIceCandidate(signal.candidate);
  };

  useEffect(() => {
    const value = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.current = value;
    const onViewerJoined = ({ viewerId }: { streamId: number; viewerId: number }) => { void sendOfferToViewer(viewerId).catch(() => undefined); };
    const onSignal = ({ from, signal }: { from: number; signal: LiveSignal }) => { void handleLiveSignal(from, signal).catch(() => undefined); };
    const onViewerLeft = ({ viewerId }: { viewerId: number }) => { const peer = peerConnections.current.get(viewerId); peer?.close(); peerConnections.current.delete(viewerId); };
    value.on("live:viewerJoined", onViewerJoined);
    value.on("live:signal", onSignal);
    value.on("live:viewerLeft", onViewerLeft);
    return () => {
      value.off("live:viewerJoined", onViewerJoined);
      value.off("live:signal", onSignal);
      value.off("live:viewerLeft", onViewerLeft);
      peerConnections.current.forEach(peer => peer.close());
      peerConnections.current.clear();
      value.close();
    };
  }, []);

  useEffect(() => {
    const currentSocket = socket.current;
    if (!currentSocket || phase !== "live") return;
    const rejoin = () => {
      const activeStreamId = streamIdRef.current;
      if (!activeStreamId) return;
      currentSocket.timeout(7000).emit("live:join", { streamId: activeStreamId }, (error: Error | null, result?: { joined: boolean; viewerCount?: number; message?: string }) => {
        if (error || !result?.joined) {
          setStatus(result?.message ?? "تعذر استعادة اتصال التحكم بالبث؛ يمكنك محاولة الإنهاء من الزر الظاهر.");
          return;
        }
        setViewerCount(result.viewerCount ?? 0);
        setStatus("تمت استعادة اتصال التحكم بالبث.");
      });
    };
    currentSocket.on("connect", rejoin);
    return () => { currentSocket.off("connect", rejoin); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const interval = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const startRecorder = (media: MediaStream) => {
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) ?? "";
    try {
      const nextRecorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorderChunks.current = [];
      nextRecorder.ondataavailable = event => { if (event.data.size) recorderChunks.current.push(event.data); };
      nextRecorder.start(1000);
      recorder.current = nextRecorder;
    } catch {
      setStatus("تعذر بدء تسجيل البث، لكن يمكنك مواصلة البث المباشر.");
    }
  };

  const stopRecorder = () => {
    const activeRecorder = recorder.current;
    if (!activeRecorder) return Promise.resolve<Blob | null>(null);
    if (activeRecorder.state === "inactive") {
      const blob = recorderChunks.current.length ? new Blob(recorderChunks.current, { type: activeRecorder.mimeType || "video/webm" }) : null;
      recorder.current = null;
      recorderChunks.current = [];
      return Promise.resolve(blob);
    }
    return new Promise<Blob | null>(resolve => {
      activeRecorder.onstop = () => {
        const blob = recorderChunks.current.length ? new Blob(recorderChunks.current, { type: activeRecorder.mimeType || "video/webm" }) : null;
        recorder.current = null;
        recorderChunks.current = [];
        resolve(blob);
      };
      activeRecorder.stop();
    });
  };

  const stopLiveMedia = (currentStreamId: number | null) => {
    if (currentStreamId) socket.current?.emit("live:leave", { streamId: currentStreamId });
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    peerConnections.current.forEach(peer => peer.close());
    peerConnections.current.clear();
    if (localVideo.current) localVideo.current.srcObject = null;
    streamIdRef.current = null;
    setPhase("setup");
    setStreamId(null);
    setElapsed(0);
    setViewerCount(0);
  };

  const startStream = async () => {
    if (!title.trim()) { setStatus("أدخل عنوانًا للبث المباشر."); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setStatus("يجب فتح الموقع عبر HTTPS ومن متصفح يسمح بالكاميرا والميكروفون."); return; }
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: true }); }
    catch (error) { setStatus(explainMediaError(error)); return; }
    stream.current = media;
    if (localVideo.current) localVideo.current.srcObject = media;
    try {
      const created = await new Promise<{ id: number }>((resolve, reject) => {
        createStream.mutate({ title: title.trim().slice(0, 200) }, { onSuccess: data => resolve(data), onError: error => reject(error) });
      });
      streamIdRef.current = created.id;
      setStreamId(created.id);
      const joined = await new Promise<{ viewerCount?: number }>((resolve, reject) => {
        const currentSocket = socket.current;
        if (!currentSocket) { reject(new Error("تعذر إنشاء اتصال البث.")); return; }
        currentSocket.timeout(7000).emit("live:join", { streamId: created.id }, (error: Error | null, result?: { joined: boolean; viewerCount?: number; message?: string }) => {
          if (error || !result?.joined) { reject(new Error(result?.message ?? "تعذر الاتصال بخدمة البث.")); return; }
          resolve(result);
        });
      });
      setViewerCount(joined.viewerCount ?? 0);
      setPhase("live");
      endingRef.current = false;
      setStatus("البث المباشر نشط الآن");
      startRecorder(media);
    } catch (error) {
      const failedStreamId = streamIdRef.current;
      if (failedStreamId) void cancelStreamMutation.mutateAsync({ streamId: failedStreamId }).catch(() => undefined);
      streamIdRef.current = null;
      setStreamId(null);
      media.getTracks().forEach(track => track.stop());
      stream.current = null;
      if (localVideo.current) localVideo.current.srcObject = null;
      setStatus(error instanceof Error ? error.message : "تعذر إنشاء البث. أعد المحاولة.");
    }
  };

  const endStream = async () => {
    const currentStreamId = streamId;
    if (!currentStreamId || !window.confirm("هل تريد إنهاء البث؟ سيصبح التسجيل متاحًا للحفظ أو النشر بعد الإنهاء.")) return;
    setStatus("جارٍ إنهاء البث وتجهيز التسجيل...");
    endingRef.current = true;
    try {
      await endStreamMutation.mutateAsync({ streamId: currentStreamId });
      socket.current?.emit("live:end", { streamId: currentStreamId });
      const blob = await stopRecorder();
      stopLiveMedia(currentStreamId);
      setPostActions({ streamId: currentStreamId, blob, saved: null });
      setStatus(blob ? "انتهى البث. اختر إجراءً للتسجيل." : "انتهى البث بلا تسجيل متاح.");
      void utils.live.list.invalidate();
      void utils.live.history.invalidate();
    } catch (error) { setStatus(error instanceof Error ? error.message : "تعذر إنهاء البث."); }
  };

  const cancelStream = async () => {
    const currentStreamId = streamId;
    if (!currentStreamId || !window.confirm("هل تريد إلغاء البث؟ سيتم حذف هذا البث ولن يتم حفظ تسجيله.")) return;
    try {
      await cancelStreamMutation.mutateAsync({ streamId: currentStreamId });
      await stopRecorder();
      stopLiveMedia(currentStreamId);
      setStatus("تم إلغاء البث دون حفظ تسجيل.");
      void utils.live.list.invalidate();
      void utils.live.history.invalidate();
    } catch (error) { setStatus(error instanceof Error ? error.message : "تعذر إلغاء البث."); }
  };

  const ensureRecordingSaved = async () => {
    if (!postActions) throw new Error("لا يوجد بث منتهٍ للتعامل معه.");
    if (postActions.saved) return postActions.saved;
    if (!postActions.blob) throw new Error("لا يوجد تسجيل متاح لهذا البث.");
    if (postActions.blob.size > MAX_RECORDING_SIZE) throw new Error("حجم التسجيل يتجاوز 200 ميغابايت.");
    setBusyAction("upload");
    const uploadId = crypto.randomUUID().replace(/-/g, "");
    const totalChunks = Math.max(1, Math.ceil(postActions.blob.size / CHUNK_SIZE));
    const chunkKeys: string[] = [];
    for (let index = 0; index < totalChunks; index += 1) {
      const chunk = postActions.blob.slice(index * CHUNK_SIZE, Math.min(postActions.blob.size, (index + 1) * CHUNK_SIZE));
      const uploadedChunk = await uploadChunk.mutateAsync({ uploadId, chunkIndex: index, totalChunks, chunkBase64: await fileToBase64(chunk) });
      chunkKeys.push(uploadedChunk.key);
      setStatus(`جارٍ رفع التسجيل: ${Math.round(((index + 1) / totalChunks) * 100)}٪`);
    }
    const result = await completeChunked.mutateAsync({ uploadId, totalChunks, chunkKeys, mimeType: postActions.blob.type || "video/webm", fileName: `live-${postActions.streamId}.webm`, kind: "post" });
    const saved = await saveRecordingMutation.mutateAsync({ streamId: postActions.streamId, recordingUrl: result.url, recordingKey: result.key });
    const recording = { url: saved.recordingUrl ?? result.url, key: saved.recordingKey ?? result.key };
    setPostActions(current => current ? { ...current, blob: null, saved: recording } : current);
    setBusyAction(null);
    return recording;
  };

  const publishAsPost = async () => {
    if (!postActions) return;
    try {
      setBusyAction("post");
      await ensureRecordingSaved();
      await publishPostMutation.mutateAsync({ streamId: postActions.streamId, content: postText.trim() || title.trim() || "تسجيل بث مباشر" });
      setBusyAction(null);
      setStatus("تم نشر التسجيل كفيديو في منشوراتك.");
    } catch (error) { setBusyAction(null); setStatus(error instanceof Error ? error.message : "تعذر نشر التسجيل كفيديو."); }
  };

  const publishAsReel = async () => {
    if (!postActions) return;
    try {
      setBusyAction("reel");
      await ensureRecordingSaved();
      await publishReelMutation.mutateAsync({ streamId: postActions.streamId, caption: reelCaption.trim() || title.trim() || null });
      setBusyAction(null);
      setStatus("تم نشر التسجيل كريلز.");
    } catch (error) { setBusyAction(null); setStatus(error instanceof Error ? error.message : "تعذر نشر التسجيل كريلز."); }
  };

  const deleteFinishedStream = async () => {
    if (!postActions || !window.confirm("هل تريد حذف هذا البث نهائيًا؟ لن يمكن استعادة التسجيل أو بيانات البث بعد ذلك.")) return;
    try {
      setBusyAction("delete");
      await deleteStreamMutation.mutateAsync({ streamId: postActions.streamId, confirmation: true });
      setPostActions(null);
      setBusyAction(null);
      setStatus("تم حذف البث نهائيًا.");
      void utils.live.history.invalidate();
    } catch (error) { setBusyAction(null); setStatus(error instanceof Error ? error.message : "تعذر حذف البث."); }
  };

  useEffect(() => {
    const socketCurrent = socket.current;
    if (!socketCurrent || !streamId) return;
    const onViewerCount = (payload: { streamId: number; viewerCount: number }) => { if (payload.streamId === streamId) setViewerCount(payload.viewerCount); };
    const onEnded = ({ streamId: endedId }: { streamId: number }) => { if (endedId === streamId && phase === "live" && !endingRef.current) { void stopRecorder(); stopLiveMedia(endedId); setStatus("انتهى البث من الخادم."); } };
    socketCurrent.on("live:viewerCount", onViewerCount);
    socketCurrent.on("live:ended", onEnded);
    return () => { socketCurrent.off("live:viewerCount", onViewerCount); socketCurrent.off("live:ended", onEnded); };
  }, [streamId, phase]);

  const toggleCamera = () => { const track = stream.current?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled); } };
  const toggleMic = () => { const track = stream.current?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); } };
  const formatElapsed = (seconds: number) => { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
  const isBusy = busyAction !== null;

  return (
    <PlatformShell>
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-pink-200">{t("جمهوركبانتظارك")}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{t("البثالمباشر")}</h1>
        <section className="mt-6 overflow-hidden rounded-[2rem] glass">
          <div className="relative min-h-[26rem] bg-black/35 p-3">
            <video ref={localVideo} autoPlay muted playsInline className="h-full min-h-[24rem] w-full rounded-2xl bg-black object-cover" />
            {phase === "live" && streamId && <><span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{t("مباشر")}</span><span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm"><Eye size={14} />{viewerCount}</span><span className="absolute left-4 top-12 inline-flex items-center rounded-full bg-black/60 px-3 py-1.5 text-sm">{formatElapsed(elapsed)}</span></>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-5">
            <span className="w-full text-center text-sm text-violet-100/65">{status}</span>
            {postActions && phase === "setup" && <div className="w-full rounded-2xl border border-pink-300/20 bg-pink-500/10 p-4 text-start"><h2 className="font-bold text-pink-100">إجراءات التسجيل بعد انتهاء البث</h2><p className="mt-1 text-sm text-violet-100/65">يمكنك حفظ التسجيل أولًا، ثم نشره كفيديو أو كريلز. كل إجراء نشر قابل للمراجعة قبل الإرسال.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={postText} onChange={event => setPostText(event.target.value)} maxLength={2000} placeholder="نص المنشور (اختياري)" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" /><input value={reelCaption} onChange={event => setReelCaption(event.target.value)} maxLength={500} placeholder="وصف الريلز (اختياري)" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" /></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void ensureRecordingSaved().catch(error => setStatus(error instanceof Error ? error.message : "تعذر حفظ التسجيل."))} disabled={isBusy || !!postActions.saved} className="inline-flex items-center gap-2 rounded-xl soft-button px-4 py-2.5 font-bold disabled:opacity-50">{busyAction === "upload" && <Loader2 size={16} className="animate-spin" />} {postActions.saved ? "تم حفظ التسجيل" : "حفظ التسجيل"}</button><button onClick={() => void publishAsPost()} disabled={isBusy || !postActions.blob && !postActions.saved} className="rounded-xl bg-pink-500 px-4 py-2.5 font-bold disabled:opacity-50">{busyAction === "post" && <Loader2 size={16} className="inline animate-spin" />} نشر كفيديو</button><button onClick={() => void publishAsReel()} disabled={isBusy || !postActions.blob && !postActions.saved} className="rounded-xl bg-violet-500 px-4 py-2.5 font-bold disabled:opacity-50">{busyAction === "reel" && <Loader2 size={16} className="inline animate-spin" />} نشر كريلز</button><button onClick={() => void deleteFinishedStream()} disabled={isBusy} className="rounded-xl border border-red-300/30 px-4 py-2.5 font-bold text-red-200 disabled:opacity-50">{busyAction === "delete" && <Loader2 size={16} className="inline animate-spin" />} حذف نهائي</button></div></div>}
            {phase === "setup" && !postActions ? <><input value={title} onChange={event => setTitle(event.target.value)} placeholder={t("عنوانالبثالمباشر")} maxLength={200} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 outline-none focus:border-pink-300/60" /><button onClick={() => void startStream()} disabled={createStream.isPending} className="inline-flex h-12 items-center gap-2 rounded-2xl px-6 gradient-button"><Radio size={18} />{t("ابدأالبث")}</button></> : phase === "live" ? <><button onClick={toggleMic} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالميكروفون")}>{micOn ? <Mic size={19} /> : <MicOff size={19} />}</button><button onClick={toggleCamera} className="grid h-12 w-12 place-items-center rounded-2xl soft-button" aria-label={t("تبديلالكاميرا")}>{cameraOn ? <Video size={19} /> : <VideoOff size={19} />}</button><button onClick={() => void cancelStream()} disabled={cancelStreamMutation.isPending || endStreamMutation.isPending} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-red-300/30 px-5 font-bold text-red-200 disabled:opacity-50">إلغاء البث</button><button onClick={() => void endStream()} disabled={endStreamMutation.isPending} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-pink-500 px-6 font-bold shadow-lg shadow-pink-500/30 disabled:opacity-50"><PhoneOff size={18} />{t("إنهاءالبث")}</button></> : null}
          </div>
        </section>
        <p className="mt-4 text-center text-sm text-violet-100/50">{t("يعرضبثكللجمهورمباشرةبعدبدء")}</p>
        <div className="mt-4 flex justify-center gap-3"><button onClick={() => setLocation("/live")} className="inline-flex items-center gap-2 rounded-2xl border border-pink-400/30 bg-pink-500/15 px-5 py-3 font-bold text-pink-200 hover:bg-pink-500/25"><Radio size={18} />{t("تصفحالبثوثالنشطة")}</button></div>
      </div>
    </PlatformShell>
  );
}
