import type { SVGProps } from "react";

type BrandLogoProps = { className?: string; alt?: string };

export function BrandLogo({ className = "h-10 w-10", alt = "شعار VibraCam" }: BrandLogoProps) {
  return (
    <span role="img" aria-label={alt} className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 font-black text-white shadow-lg shadow-pink-500/25 ${className}`}>
      <img src="/brand-logo.svg" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

export function BrandLockup({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return <span className={`inline-flex items-center gap-2.5 whitespace-nowrap font-extrabold tracking-tight ${className}`}><BrandLogo className={compact ? "h-8 w-8" : "h-10 w-10"}/><span className={compact ? "text-lg" : "text-2xl"}>Vibra<span className="text-pink-300">Cam</span></span></span>;
}
