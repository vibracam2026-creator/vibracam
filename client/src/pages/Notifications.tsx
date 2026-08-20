import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

const icons: Record<string, any> = { like: Heart, comment: MessageCircle, follow: UserPlus, message: MessageCircle, share: CheckCheck };
export default function Notifications() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const query = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30_000 });
  const utils = trpc.useUtils();
  const read = trpc.notifications.read.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const readAll = trpc.notifications.readAll.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const unread = query.data?.filter(item => !item.notification.isRead).length ?? 0;
  return <PlatformShell><div className="mx-auto max-w-3xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-pink-200">{t('مركزالنشاط')}</p><h1 className="mt-1 text-3xl font-extrabold">{t('الإشعارات')}</h1></div>{unread > 0 && <button disabled={readAll.isPending} onClick={() => readAll.mutate()} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm soft-button"><CheckCheck size={17}/>{t('قراءةالكل')}</button>}</div><section className="mt-6 overflow-hidden rounded-3xl glass">{query.data?.map(({ notification, actor }) => { const Icon = icons[notification.type] || Bell; return <button key={notification.id} onClick={() => { if (!notification.isRead) read.mutate({ notificationId: notification.id }); if (notification.type === "message" && actor) setLocation(`/messages/${actor.id}`); else if (actor) setLocation(`/profile/${actor.id}`); }} className={`flex w-full items-center gap-4 border-b border-white/7 p-5 text-right transition hover:bg-white/5 ${notification.isRead ? "opacity-65" : "bg-pink-500/7"}`}><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/20 text-pink-200"><Icon size={19}/></span><span className="flex-1"><b>{actor?.name || "VibraCam"}</b> <span className="text-violet-100/70">{notification.message}</span><small className="mt-1 block text-xs text-violet-100/45">{new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.createdAt))}</small></span>{!notification.isRead && <span className="h-2.5 w-2.5 rounded-full bg-pink-400"/>}</button>; })}{!query.data?.length && <div className="p-12 text-center text-violet-100/60"><Bell className="mx-auto mb-3 text-pink-300"/>{t('لاتوجدإشعاراتجديدةحتىالآن')}</div>}</section></div></PlatformShell>;
}
