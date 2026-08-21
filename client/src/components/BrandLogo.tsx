import { useState } from "react";

type BrandLogoProps = {
  className?: string;
  alt?: string;
};

/** شعار VibraCam محلي بالكامل، مع SVG مضمّن لضمان ظهوره حتى عند تعطل مسار ملفات public. */
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
      {!failed ? (
        <img
          src="/brand-logo.svg"
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 block h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 256 256"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="vibracam-logo-fallback" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <rect width="256" height="256" rx="64" fill="url(#vibracam-logo-fallback)" />
          <path d="M55 68h38l35 83 35-83h38l-54 120h-38L55 68Z" fill="white" />
        </svg>
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
      className={`inline-flex min-w-0 items-center gap-2.5 whitespace-nowrap font-extrabold tracking-tight ${className}`}
    >
      <BrandLogo className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className={compact ? "text-lg" : "text-2xl"}>
        Vibra<span className="text-pink-300">Cam</span>
      </span>
    </span>
  );
}
