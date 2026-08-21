import { useState } from "react";

type BrandLogoProps = {
  className?: string;
  alt?: string;
};

/** شعار VibraCam محلي بالكامل؛ لا يعتمد على Manus أو أي تخزين خارجي. */
export function BrandLogo({
  className = "h-10 w-10",
  alt = "شعار VibraCam",
}: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      role="img"
      aria-label={alt}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 font-black text-white shadow-lg shadow-pink-500/25 ${className}`}
    >
      <span aria-hidden="true">V</span>
      {!failed && (
        <img
          src="/brand-logo.svg"
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </span>
  );
}

export function BrandLockup({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 whitespace-nowrap font-extrabold tracking-tight ${className}`}
    >
      <BrandLogo className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className={compact ? "text-lg" : "text-2xl"}>
        Vibra<span className="text-pink-300">Cam</span>
      </span>
    </span>
  );
}
