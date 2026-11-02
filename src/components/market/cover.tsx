import type { ProductType } from "@/generated/prisma/enums";
import { productTypeInfo } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ProductTypeIcon } from "@/components/market/product-type-icon";

const THEMES = [
  { bg: "#16130F", fg: "#F2EADB", line: "rgba(242,234,219,0.10)", accent: "#FF5A2E" },
  { bg: "#F2EADB", fg: "#16130F", line: "rgba(22,19,15,0.09)", accent: "#FF4B1F" },
  { bg: "#22301F", fg: "#EAF2E3", line: "rgba(234,242,227,0.10)", accent: "#FF7A4D" },
  { bg: "#2A2117", fg: "#F5E9D6", line: "rgba(245,233,214,0.10)", accent: "#FF6A3D" },
  { bg: "#1D2633", fg: "#E6EDF5", line: "rgba(230,237,245,0.10)", accent: "#FF6A3D" },
];

function seedOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** A designed cover for listings without an uploaded image: type label, title and a faint price chart. */
export function GeneratedCover({ title, type, seed, className, large }: { title: string; type: ProductType; seed: string; className?: string; large?: boolean }) {
  const h = seedOf(seed);
  const t = THEMES[h % THEMES.length];
  // A deterministic little price path for texture.
  const pts: string[] = [];
  let y = 60 + (h % 20);
  for (let i = 0; i <= 24; i++) {
    const r = ((h >>> (i % 24)) ^ (i * 2654435761)) & 0xff;
    y = Math.max(18, Math.min(92, y + ((r % 21) - 10) * 0.9 - 0.6));
    pts.push(`${(i / 24) * 200},${y.toFixed(1)}`);
  }
  return (
    <div className={cn("relative isolate overflow-hidden", className)} style={{ background: t.bg, color: t.fg }}>
      <svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 200 112" preserveAspectRatio="none" aria-hidden>
        {[22, 44, 66, 88].map((gy) => (
          <line key={gy} x1="0" x2="200" y1={gy} y2={gy} stroke={t.line} strokeWidth="0.4" />
        ))}
        <polyline points={pts.join(" ")} fill="none" stroke={t.accent} strokeWidth="1.1" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={cn("flex h-full flex-col justify-between", large ? "p-7" : "p-4")}>
        <div className={cn("flex items-center gap-1.5 font-semibold tracking-[0.08em] uppercase opacity-75", large ? "text-xs" : "text-[10px]")}>
          <ProductTypeIcon type={type} className={large ? "size-3.5" : "size-3"} />
          {productTypeInfo(type).label}
        </div>
        <div className={cn("font-display leading-[1.05] font-extrabold tracking-[-0.03em]", large ? "text-4xl" : "line-clamp-3 text-[19px]")}>{title}</div>
      </div>
    </div>
  );
}
