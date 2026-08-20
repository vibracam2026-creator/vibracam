import { Building2, Crown, IdCard, Sparkles, Store, type LucideIcon } from "lucide-react";

export type VerificationType = "identity" | "creator" | "business" | "seller" | "official";

type VerificationMeta = {
  type: VerificationType;
  label: string;
  purpose: string;
  ring: string;
  accent: string;
  shape: string;
  Icon: LucideIcon;
};

export const verificationTypes: VerificationMeta[] = [
  { type: "identity", label: "هوية موثقة", purpose: "تثبت أن بيانات الشخص الأساسية تم التحقق منها عبر وثائق رسمية.", ring: "conic-gradient(from 180deg, #8b5cf6, #00ffd5, #8b5cf6)", accent: "#b9a7ff", shape: "rounded-lg", Icon: IdCard },
  { type: "creator", label: "صانع محتوى موثق", purpose: "لصناع المحتوى الذين تم التحقق من حضورهم وأصالتهم وتأثيرهم داخل المنصة.", ring: "conic-gradient(from 180deg, #ff4fd8, #ff9f43, #ff4fd8)", accent: "#ff8edc", shape: "rounded-full", Icon: Sparkles },
  { type: "business", label: "شركة أو علامة موثقة", purpose: "للشركات والعلامات التجارية التي ثبتت هويتها ونشاطها التجاري.", ring: "conic-gradient(from 180deg, #38bdf8, #6366f1, #38bdf8)", accent: "#7dd3fc", shape: "rounded-xl", Icon: Building2 },
  { type: "seller", label: "بائع موثق", purpose: "للبائعين الذين تم التحقق من بياناتهم والتزامهم بقواعد السوق.", ring: "conic-gradient(from 180deg, #d7ff3f, #00d9a5, #d7ff3f)", accent: "#d7ff3f", shape: "rounded-2xl", Icon: Store },
  { type: "official", label: "حساب رسمي", purpose: "للحسابات الرسمية للمنصة أو الجهات العامة والشخصيات المعتمدة.", ring: "conic-gradient(from 180deg, #ffd166, #ff4fd8, #ffd166)", accent: "#ffd166", shape: "rounded-[38%]", Icon: Crown },
];

const sizes = {
  sm: { shell: "h-5 w-5", icon: 11, tag: "text-[7px]" },
  md: { shell: "h-6 w-6", icon: 13, tag: "text-[8px]" },
  lg: { shell: "h-8 w-8", icon: 17, tag: "text-[10px]" },
};

export function getVerificationMeta(type?: string | null) {
  return verificationTypes.find(item => item.type === type) ?? {
    type: "identity" as const,
    label: "حساب موثق في VibraCam",
    purpose: "حساب اجتاز مراجعة التوثيق في VibraCam.",
    ring: "conic-gradient(from 180deg, #ff4fd8, #8b5cf6, #00ffd5, #ff4fd8)",
    accent: "#d7ff3f",
    shape: "rounded-full",
    Icon: IdCard,
  };
}

type VerificationMarkProps = {
  type?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** علامة توثيق رمزية؛ شكلها وأيقونتها يوضحان نوع التوثيق مباشرة. */
export function VerificationMark({ type, size = "md", className = "" }: VerificationMarkProps) {
  const meta = getVerificationMeta(type);
  const preset = sizes[size];
  const Icon = meta.Icon;
  return (
    <span role="img" aria-label={meta.label} title={`${meta.label}: ${meta.purpose}`} className={`relative inline-grid shrink-0 place-items-center align-middle ${preset.shell} ${className}`}>
      <span aria-hidden="true" className={`absolute inset-0 ${meta.shape} shadow-[0_0_11px_rgba(255,79,216,0.75)]`} style={{ background: meta.ring }} />
      <span aria-hidden="true" className={`relative z-10 grid h-[calc(100%-3px)] w-[calc(100%-3px)] place-items-center ${meta.shape} border bg-[#171026] shadow-[inset_0_0_7px_rgba(215,255,63,0.35)]`} style={{ borderColor: meta.accent }}>
        <Icon aria-hidden="true" size={preset.icon} strokeWidth={2.5} style={{ color: meta.accent }} />
      </span>
      <span aria-hidden="true" className={`absolute -bottom-1 -left-1 z-20 rounded-full border border-[#171026] px-0.5 font-black leading-none text-[#171026] ${preset.tag}`} style={{ backgroundColor: meta.accent }}>{meta.type === "identity" ? "هـ" : meta.type === "creator" ? "م" : meta.type === "business" ? "ش" : meta.type === "seller" ? "ب" : "ر"}</span>
    </span>
  );
}

export function VerificationLegend() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {verificationTypes.map(item => (
        <div key={item.type} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
          <VerificationMark type={item.type} size="md" />
          <div className="min-w-0">
            <b className="block text-sm text-white">{item.label}</b>
            <p className="mt-1 text-xs leading-5 text-violet-100/60">{item.purpose}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
