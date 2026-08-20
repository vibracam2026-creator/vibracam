import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { LoaderCircle, MessageCircleMore, Plus, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

export default function ChatGroups() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const groups = trpc.chatGroups.list.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const create = trpc.chatGroups.create.useMutation({ onSuccess: ({ id }) => { utils.chatGroups.list.invalidate(); setOpen(false); setName(""); setMembers(""); setLocation(`/messages/groups/${id}`); toast.success(t("تم إنشاء المحادثة الجماعية.")); }, onError: error => toast.error(error.message) });
  const submit = () => {
    const memberIds = members.split(",").map(value => Number(value.trim())).filter(Boolean);
    create.mutate({ name: name.trim(), memberIds });
  };
  return <PlatformShell><div className="mx-auto max-w-5xl"><div className="flex items-end justify-between gap-4"><div><p className="text-sm text-pink-200">{t('مراسلةجماعية')}</p><h1 className="mt-1 text-3xl font-extrabold">{t('مجموعاتماسنجر')}</h1><p className="mt-2 text-violet-100/60">{t('أنشئمحادثةخاصةأدرأعضاءهاوتابع')}</p></div><button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 gradient-button"><Plus size={18}/>{t('مجموعةجديدة')}</button></div>{open && <div className="mt-6 rounded-3xl glass p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{t('محادثةجديدة')}</h2><button onClick={() => setOpen(false)} className="soft-button rounded-lg p-2" aria-label={t("إغلاق")}><X size={16}/></button></div><input value={name} onChange={e => setName(e.target.value)} placeholder={t("اسمالمجموعة")} className="mt-4 w-full rounded-xl bg-black/20 p-3 outline-none"/><input value={members} onChange={e => setMembers(e.target.value)} placeholder={t("معرفاتالأعضاءمفصولةبفواصلاختياري")} className="mt-3 w-full rounded-xl bg-black/20 p-3 outline-none"/><button disabled={!name.trim() || create.isPending} onClick={submit} className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 gradient-button disabled:opacity-50">{create.isPending && <LoaderCircle size={16} className="animate-spin"/>}{t("إنشاء المحادثة")}</button></div>}<div className="mt-6 grid gap-4 sm:grid-cols-2">{groups.isLoading && <div className="col-span-full grid place-items-center py-10"><LoaderCircle className="animate-spin text-pink-300"/></div>}{groups.data?.map(({ group, membership, unreadCount }: any) => <button key={group.id} onClick={() => setLocation(`/messages/groups/${group.id}`)} className="flex items-center gap-4 rounded-3xl glass p-5 text-start transition hover:-translate-y-1"><span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-pink-500/20 text-pink-200">{group.avatarUrl ? <img src={group.avatarUrl} alt="" className="h-full w-full object-cover"/> : <UsersRound/>}</span><span className="min-w-0 flex-1"><b className="block truncate">{group.name}</b><small className="mt-1 block text-violet-100/55">{membership.role === "owner" ? t("مالك المحادثة") : membership.role === "admin" ? t("مشرف") : t("عضو")}</small></span>{unreadCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-pink-500 px-1 text-xs font-bold">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>)}{!groups.isLoading && !groups.data?.length && <p className="col-span-full rounded-3xl border border-dashed border-white/15 p-10 text-center text-violet-100/60"><MessageCircleMore className="mx-auto mb-3 text-pink-300"/>{t('لاتوجدمجموعاتماسنجربعد')}</p>}</div></div></PlatformShell>;
}
