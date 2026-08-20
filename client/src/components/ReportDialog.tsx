import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { Flag, Send, X } from "lucide-react";

export type ReportTargetType = "user" | "post" | "product" | "message";
type ReportReason = "spam" | "harassment" | "blackmail" | "inappropriate_content" | "fraud" | "phishing" | "counterfeit" | "hate_speech" | "violence" | "impersonation" | "fake_account" | "misinformation" | "copyright" | "trademark" | "technical_issue" | "malicious_reporting" | "other";

const reasons: readonly [ReportReason, string][] = [
  ["harassment", "تحرش أو ابتزاز"],
  ["inappropriate_content", "محتوى غير لائق أو إباحي"],
  ["hate_speech", "خطاب كراهية أو عنف"],
  ["impersonation", "انتحال شخصية أو تزوير"],
  ["phishing", "تصيد أو رابط احتيالي"],
  ["fraud", "احتيال أو سرقة مالية"],
  ["counterfeit", "منتج وهمي أو مقلد"],
  ["misinformation", "معلومات مضللة"],
  ["spam", "رسائل عشوائية أو ترويج مزعج"],
  ["copyright", "انتهاك حقوق النشر"],
  ["trademark", "انتهاك علامة تجارية"],
  ["technical_issue", "مشكلة تقنية أو زر لا يعمل"],
  ["malicious_reporting", "بلاغ كيدي أو إساءة استخدام البلاغات"],
  ["blackmail", "تهديد أو ابتزاز مباشر"],
  ["violence", "تحريض على العنف"],
  ["fake_account", "حساب وهمي"],
  ["other", "سبب آخر"],
];

export function ReportDialog({ targetType, targetId, onClose }: { targetType: ReportTargetType; targetId: number; onClose: () => void }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState<ReportReason>("other");
  const [details, setDetails] = useState("");
  const report = trpc.safety.report.useMutation({
    onSuccess: () => { toast.success(t("تم إرسال البلاغ للمراجعة.")); onClose(); },
    onError: error => toast.error(error.message),
  });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title"><div className="w-full max-w-lg rounded-3xl glass p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Flag className="text-pink-300" size={19}/><h2 id="report-dialog-title" className="text-lg font-bold">{t("الإبلاغ عن محتوى أو حساب")}</h2></div><button type="button" onClick={onClose} className="rounded-xl p-2 soft-button" aria-label={t("إغلاق")}><X size={17}/></button></div><p className="mt-3 text-sm leading-6 text-violet-100/65">{t("اختر السبب الأقرب وأضف تفاصيل تساعد المراجعة. لا يؤدي البلاغ وحده إلى إغلاق الحساب تلقائيًا.")}</p><label className="mt-4 block text-sm"><span className="mb-1.5 block text-violet-100/75">{t("سبب البلاغ")}</span><select value={reason} onChange={event => setReason(event.target.value as ReportReason)} className="w-full rounded-xl border border-white/10 bg-[#1a0c2b] px-3 py-3 outline-none">{reasons.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label className="mt-4 block text-sm"><span className="mb-1.5 block text-violet-100/75">{t("تفاصيل إضافية")}</span><textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} rows={4} placeholder={t("اكتب ما حدث أو أضف رابطًا أو وصفًا مختصرًا")} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 outline-none focus:border-pink-300/60"/></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 soft-button">{t("إلغاء")}</button><button type="button" disabled={report.isPending} onClick={() => report.mutate({ targetType, targetId, reason, details: details.trim() || undefined })} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 gradient-button disabled:opacity-50"><Send size={16}/>{report.isPending ? t("جارٍ الإرسال...") : t("إرسال البلاغ")}</button></div></div></div>;
}
