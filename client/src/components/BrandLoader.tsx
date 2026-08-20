import { BrandLockup } from "./BrandLogo";

export function BrandLoader({ label = "جارٍ تجهيز VibraCam" }: { label?: string }) {
  return <main dir="rtl" className="vibra-bg grid min-h-screen place-items-center p-6"><div className="text-center"><div className="relative mx-auto grid h-24 w-24 place-items-center"><div className="absolute inset-0 rounded-[2rem] border-2 border-pink-300/25 border-t-pink-300 motion-safe:animate-spin"/><BrandLockup compact className="scale-90"/></div><p className="mt-6 text-sm text-violet-100/60">{label}</p></div></main>;
}
