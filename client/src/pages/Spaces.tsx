import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { Mic, Plus, LogOut, LoaderCircle, Users, Crown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const glass = "rounded-3xl glass p-5";

export default function Spaces() {
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const peerMap = useRef<Map<number, any>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const [joinedId, setJoinedId] = useState<number | null>(null);
  const [speakerMode, setSpeakerMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const me = trpc.auth.me.useQuery();
  const spacesQuery = trpc.voiceSpaces.list.useQuery(undefined, { refetchInterval: 5000 });
  const participantsQuery = trpc.voiceSpaces.participants.useQuery(
    { spaceId: joinedId ?? 0 },
    { enabled: Boolean(joinedId), refetchInterval: 4000 }
  );
  const spaces = spacesQuery.data ?? [];
  const joined = spaces.find(space => space.id === joinedId);

  const createSpace = trpc.voiceSpaces.create.useMutation({
    onSuccess: async data => {
      setShowCreate(false);
      setNewTitle("");
      setNewTopic("");
      await utils.voiceSpaces.list.invalidate();
      setJoinedId(data.id);
      toast.success("تم إنشاء المساحة الصوتية 🎙️");
    },
    onError: error => toast.error(error.message),
  });
  const endSpace = trpc.voiceSpaces.end.useMutation({
    onSuccess: async () => {
      await utils.voiceSpaces.list.invalidate();
      setJoinedId(null);
      toast.success("تم إنهاء المساحة");
    },
    onError: error => toast.error(error.message),
  });
  const makeSpeaker = trpc.voiceSpaces.makeSpeaker.useMutation({
    onSuccess: async () => {
      await utils.voiceSpaces.participants.invalidate({ spaceId: joinedId ?? 0 });
      toast.success("تمت إضافة المتحدث");
    },
    onError: error => toast.error(error.message),
  });
  const leaveSpace = trpc.voiceSpaces.leave.useMutation({
    onSuccess: async () => {
      setJoinedId(null);
      await utils.voiceSpaces.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const join = (spaceId: number) => {
    const target = spaces.find(space => space.id === spaceId);
    setSpeakerMode(Boolean(target?.hostId === me.data?.id));
    setJoinedId(spaceId);
  };

  const getLocalStream = async () => {
    if (localStream.current) return localStream.current;
    localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return localStream.current;
  };

  const closePeers = () => {
    peerMap.current.forEach(peer => peer.destroy());
    peerMap.current.clear();
  };

  const createVoicePeer = async (peerUserId: number, initiator: boolean, spaceId: number) => {
    if (peerMap.current.has(peerUserId)) return peerMap.current.get(peerUserId);
    const media = speakerMode ? await getLocalStream().catch(() => new MediaStream()) : new MediaStream();
    const peer = new SimplePeer({ initiator, trickle: false, stream: media });
    peer.on("signal", (signal: unknown) => socketRef.current?.emit("voiceSpace:signal", { spaceId, peerId: peerUserId, signal }));
    peer.on("stream", (remote: MediaStream) => {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.srcObject = remote;
      audio.dataset.peerUserId = String(peerUserId);
      audioHost.current?.appendChild(audio);
    });
    peer.on("close", () => peerMap.current.delete(peerUserId));
    peer.on("error", () => undefined);
    peerMap.current.set(peerUserId, peer);
    return peer;
  };

  useEffect(() => {
    if (!joinedId) return;
    const socket = io(window.location.origin, { path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("voiceSpace:join", { spaceId: joinedId, isSpeaker: speakerMode }));
    socket.on("voiceSpace:participants", ({ participants }: { participants: Array<{ userId: number; isSpeaker: string }> }) => {
      const current = participants.find(participant => participant.userId === me.data?.id);
      if (current) setSpeakerMode(current.isSpeaker === "yes" || joined?.hostId === me.data?.id);
      void utils.voiceSpaces.participants.invalidate({ spaceId: joinedId });
    });
    socket.on("voiceSpace:userJoined", ({ userId: peerUserId, isSpeaker }: { userId: number; isSpeaker: boolean }) => {
      if (speakerMode && isSpeaker) void createVoicePeer(peerUserId, true, joinedId);
    });
    socket.on("voiceSpace:signal", async ({ from, signal }: { from: number; signal: unknown }) => {
      const peer = await createVoicePeer(from, false, joinedId);
      peer.signal(signal);
    });
    socket.on("voiceSpace:userLeft", ({ userId: peerUserId }: { userId: number }) => {
      peerMap.current.get(peerUserId)?.destroy();
      peerMap.current.delete(peerUserId);
      audioHost.current?.querySelector(`[data-peer-user-id="${peerUserId}"]`)?.remove();
    });
    socket.on("voiceSpace:blocked", ({ reason }: { reason: string }) => {
      toast.error(reason);
      setJoinedId(null);
    });
    socket.on("connect_error", () => { toast.error(t("spaceConnectionError")); });
    return () => {
      socket.emit("voiceSpace:leave", { spaceId: joinedId });
      closePeers();
      localStream.current?.getTracks().forEach(track => track.stop());
      localStream.current = null;
      socket.close();
      socketRef.current = null;
    };
  }, [joinedId, joined?.hostId, me.data?.id, utils, t]);

  return (
    <PlatformShell>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl"><Mic className="text-pink-300" size={28} />{t("spacesTitle")}</h1>
            <p className="mt-1 text-sm text-violet-100/60">{t("spacesSubtitle")}</p>
          </div>
          <button onClick={() => setShowCreate(value => !value)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold gradient-button"><Plus size={17} />{t("createSpace")}</button>
        </header>

        {showCreate && (
          <section className={glass}>
            <h2 className="text-lg font-bold">{t("createSpace")}</h2>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("spaceName")} maxLength={200} className="mt-3 w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2.5 text-white outline-none focus:border-pink-300/65" />
            <textarea value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder={t("channelDesc")} maxLength={300} rows={2} className="mt-3 w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-2.5 text-white outline-none focus:border-pink-300/65" />
            <button disabled={createSpace.isPending || !newTitle.trim()} onClick={() => createSpace.mutate({ title: newTitle.trim(), topic: newTopic.trim() || undefined })} className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold gradient-button disabled:opacity-50">{createSpace.isPending && <LoaderCircle className="animate-spin" size={16} />}{t("createSpace")}</button>
          </section>
        )}

        <section className={glass}>
          {spacesQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-violet-100/50"><LoaderCircle className="animate-spin" size={22} /></div>
          ) : spaces.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center text-violet-100/55">
              <Mic size={36} className="text-pink-300/40" />
              <p className="text-sm">{t("noSpaces")}</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {spaces.map(space => (
                <li key={space.id} className={`rounded-2xl border p-4 transition ${space.id === joinedId ? "border-pink-300/50 bg-white/10" : "border-white/10 bg-black/15 hover:bg-white/5"}`}>
                  <h3 className="flex items-center gap-2 font-bold"><Mic size={16} className="text-pink-300" />{space.title}</h3>
                  {space.topic && <p className="mt-1 text-sm text-violet-100/55">{space.topic}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-violet-100/50">
                    <span className="inline-flex items-center gap-1"><Users size={12} />{space.listenerCount ?? 0} {t("listeners")}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 font-bold text-pink-200">{t("activeSpace")}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {space.id === joinedId ? (
                      <button onClick={() => { void leaveSpace.mutate({ spaceId: space.id }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/20 px-3.5 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/30"><LogOut size={14} />{t("leaveSpace")}</button>
                    ) : (
                      <button onClick={() => join(space.id)} className="inline-flex items-center gap-1.5 rounded-xl gradient-button px-3.5 py-2 text-sm font-bold">{t("joinAsListener")}</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {joined && (
          <section className={glass}>
            <div ref={audioHost} className="hidden" aria-live="polite" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Mic className="text-pink-300" size={20} />{joined.title}</h2>
              <button onClick={() => endSpace.mutate({ spaceId: joined.id })} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/20 px-3 py-1.5 text-sm font-bold text-red-200"><LogOut size={14} />{t("leaveSpace")}</button>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-bold text-violet-100/70">{t("listeners")}</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {(participantsQuery.data ?? []).map(row => (
                  <li key={row.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/15 p-3">
                    <span className="flex items-center gap-2">
                      {row.avatarUrl ? <img src={row.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[10px] font-bold text-violet-200">{row.userName?.[0]?.toUpperCase() ?? "?"}</span>}
                      <span className="text-sm">{row.userName || row.userUsername || "عضو"}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      {row.isSpeaker === "yes" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-200"><Mic size={10} />{t("speaking")}</span>}
                      {row.isHost && <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 font-bold text-pink-200"><Crown size={10} />{t("host")}</span>}
                      {joined.hostId === me.data?.id && !row.isHost && <button onClick={() => makeSpeaker.mutate({ spaceId: joined.id, userId: row.userId, isSpeaker: row.isSpeaker !== "yes" })} className="rounded-lg px-2 py-1 text-[11px] soft-button">{row.isSpeaker === "yes" ? t("removeSpeaker") : t("makeSpeaker")}</button>}
                    </span>
                  </li>
                ))}
                {(participantsQuery.data ?? []).length === 0 && (
                  <li className="py-6 text-center text-xs text-violet-100/50">{t('جاريالتحميل')}</li>
                )}
              </ul>
            </div>
          </section>
        )}
      </div>
    </PlatformShell>
  );
}
