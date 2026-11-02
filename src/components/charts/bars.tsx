import { cn } from "@/lib/utils";

/**
 * Parts of one total compared side by side: one bar per part, largest first, all on one baseline and in one
 * colour. The number and share are printed at each bar, so nothing needs a hover to read.
 */
export function RankedBars({
  items,
  unit,
  className,
  emptyText = "Nothing in this period yet.",
}: {
  items: { label: string; n: number }[];
  /** Singular and plural, like ["visit", "visits"]. */
  unit: [string, string];
  className?: string;
  emptyText?: string;
}) {
  const total = items.reduce((s, it) => s + it.n, 0);
  if (!total) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((it) => it.n));
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((it) => {
        const share = Math.round((it.n / total) * 100);
        return (
          <li key={it.label} aria-label={`${it.label}: ${it.n.toLocaleString("en-US")} ${it.n === 1 ? unit[0] : unit[1]}, ${share}%`}>
            <div className="flex items-baseline justify-between gap-3 text-sm" aria-hidden>
              <span className="min-w-0 truncate text-ink-2">{it.label}</span>
              <span className="shrink-0">
                <span className="num font-semibold text-ink">{it.n.toLocaleString("en-US")}</span>
                <span className="num ml-1.5 text-xs text-muted">{share}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2" aria-hidden>
              <div className="h-2 rounded-r-[4px]" style={{ width: `${(it.n / max) * 100}%`, minWidth: it.n ? 2 : 0, background: "var(--chart-1)" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type SplitPart = { key: string; label: string; value: number; display: string; color: string };

/** One total split into a few parts: a thin bar with a 2px gap between parts. The list beside it carries the figures. */
export function SplitBar({ parts, label }: { parts: SplitPart[]; label: string }) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="h-2 rounded-full bg-sunk" role="img" aria-label={`${label}: nothing yet`} />;
  return (
    <div className="flex h-2 w-full gap-[2px]" role="img" aria-label={`${label}: ${shown.map((p) => `${p.label} ${p.display}`).join(", ")}`}>
      {shown.map((p, i) => (
        <div
          key={p.key}
          title={`${p.label}: ${p.display} (${Math.round((p.value / total) * 100)}%)`}
          className={cn("h-2 min-w-[3px]", i === 0 && "rounded-l-full", i === shown.length - 1 && "rounded-r-full")}
          style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
        />
      ))}
    </div>
  );
}

/** The small square key that ties a list row to its part of a split bar. */
export function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}
