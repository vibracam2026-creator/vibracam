import { PlatformShell } from "@/components/PlatformShell";
import { trpc } from "@/lib/trpc";
import { LoaderCircle, Search, UserPlus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

export default function Discover() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const input = useMemo(() => ({ query, interestIds: selected }), [query, selected]);
  const people = trpc.discover.users.useQuery(input);
  const interests = trpc.discover.interests.useQuery();
  const utils = trpc.useUtils();
  const follow = trpc.follows.follow.useMutation({ onSuccess: () => utils.discover.users.invalidate() });
  const toggle = (id: number) => setSelected(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  return <PlatformShell><div className="mx-auto max-w-5xl"><p className="text-sm text-pink-200">{t('اكتشفالمجتمع')}</p><h1 className="mt-1 text-3xl font-extrabold">{t('أشخاصيشبهوناهتماماتك')}</h1><div className="mt-6 rounded-2xl glass p-3"><div className="flex items-center gap-2"><Search className="mr-2 text-pink-300" size={20}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("ابحثبالاسمأواسمالمستخدمأو")} className="min-w-0 flex-1 bg-transparent py-3 outline-none"/></div><div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">{interests.data?.map(interest => <button key={interest.id} onClick={() => toggle(interest.id)} className={`rounded-full px-3 py-1.5 text-sm ${selected.includes(interest.id) ? "bg-pink-500/80" : "soft-button"}`}>{interest.name}</button>)}{!interests.data?.length && <span className="text-sm text-violet-100/50">{t('أضفاهتماماتمنملفكالشخصيعند')}</span>}</div></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{people.isLoading && <LoaderCircle className="animate-spin text-pink-300"/>}{people.data?.map(person => <article key={person.id} className="rounded-3xl glass p-5"><button onClick={() => setLocation(`/profile/${person.id}`)} className="flex items-center gap-3 text-right"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 font-bold text-white">{person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerText = person.name?.[0]?.toUpperCase() || "V"; }}/> : (person.name?.[0]?.toUpperCase() || "V")}</div><span><b className="block">{person.name || "مستخدم VibraCam"}</b><small className="text-violet-100/55">@{person.username || "vibracam"}</small></span></button><p className="mt-4 h-12 overflow-hidden text-sm text-violet-100/65">{person.bio || "عضو جديد في مجتمع VibraCam."}</p><button onClick={() => follow.mutate({ userId: person.id })} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 gradient-button"><UserPlus size={17}/> متابعة</button></article>)}{!people.isLoading && !people.data?.length && <div className="col-span-full rounded-3xl border border-dashed border-white/15 p-10 text-center text-violet-100/60"><UsersRound className="mx-auto mb-3"/>{t('لمنجدمستخدمينمطابقينبعد')}</div>}</div></div></PlatformShell>;
}
