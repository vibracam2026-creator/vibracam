import brandLogo from "@/assets/brand-logo.png";

type BrandLogoProps = {
  className?: string;
  alt?: string;
};

export function BrandLogo({
  className = "h-10 w-10",
  alt = "شعار VibraCam",
}: BrandLogoProps) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`}
    >
      <img
        src={brandLogo}
        alt={alt}
        className="block h-full w-full object-contain"
        draggable={false}
      />
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
