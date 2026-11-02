"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type ColumnPoint = {
  /** YYYY-MM-DD */
  key: string;
  /** Long label for the tooltip and table, like "Tue 4 Nov". */
  label: string;
  /** Short label for the axis, like "4 Nov" or "Tue". */
  short: string;
  value: number;
};

type Props = {
  points: ColumnPoint[];
  /** "money" values are in cents. */
  format: "count" | "money";
  /** What one unit is, singular and plural: ["visit", "visits"]. Not used for money. */
  unit?: [string, string];
  /** The chart's name for screen readers, like "Visits by day". */
  label: string;
  /** Column heading for the table view. */
  valueHeading: string;
  height?: number;
  emptyText?: string;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function niceStep(max: number, count: number) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Clean axis ticks from 0 to just above the max. Counts and dollars never step by less than 1. */
function ticksFor(max: number) {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const step = Math.max(1, Math.round(niceStep(max, 4)));
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Which days get an axis label: every one for a week, otherwise evenly spaced back from today. */
function labelledIndexes(n: number) {
  if (n <= 8) return new Set(Array.from({ length: n }, (_, i) => i));
  const every = n <= 31 ? 7 : 15;
  const out = new Set<number>();
  for (let i = n - 1; i >= 0; i -= every) out.add(i);
  return out;
}

/**
 * One measure by day, as thin columns on one axis. Hover or tap a day (or focus the chart and use the
 * arrow keys) to read it; every value is also in the table under the chart.
 */
export function ColumnChart({ points, format, unit = ["", ""], label, valueHeading, height = 176, emptyText = "Nothing in this period yet." }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const liveId = useId();
  const n = points.length;
  const values = points.map((p) => (format === "money" ? p.value / 100 : p.value));
  const max = Math.max(0, ...values);
  const ticks = ticksFor(max);
  const top = ticks[ticks.length - 1];
  const big = top >= 10_000;
  const tickText = (v: number) => (format === "money" ? (big ? `$${compactFmt.format(v)}` : usdWhole.format(v)) : big ? compactFmt.format(v) : v.toLocaleString("en-US"));
  const valueText = (i: number) => {
    const v = points[i].value;
    if (format === "money") return usd.format(v / 100);
    return `${v.toLocaleString("en-US")} ${v === 1 ? unit[0] : unit[1]}`.trim();
  };
  const labelled = labelledIndexes(n);
  const empty = max === 0;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const cur = active ?? n - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  const tipAlign = active === null ? "center" : active < n * 0.18 ? "start" : active > n * 0.82 ? "end" : "center";

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Y axis */}
        <div className="relative w-10 text-right" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 translate-y-1/2 text-[11px] leading-none text-muted" style={{ bottom: `${(t / top) * 100}%` }}>
              {tickText(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn("pointer-events-none absolute inset-x-0 h-px", t === 0 ? "bg-line-strong" : "bg-line")}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          {empty ? (
            <div className="absolute inset-0 grid place-items-center">
              <span className="rounded-md bg-card px-2 text-sm text-muted">{emptyText}</span>
            </div>
          ) : null}
          <div
            role="group"
            tabIndex={0}
            aria-label={`${label}. Use the left and right arrow keys to read each day.`}
            aria-describedby={liveId}
            className="absolute inset-0 flex items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            onKeyDown={onKey}
            onFocus={() => setActive((a) => a ?? n - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {points.map((p, i) => {
              const v = values[i];
              const pct = top ? (v / top) * 100 : 0;
              return (
                <div
                  key={p.key}
                  className={cn("relative flex h-full min-w-0 flex-1 items-end justify-center", active === i && "bg-hover")}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                >
                  {v > 0 ? (
                    <div
                      className={cn("rounded-t-[4px] transition-[filter]", active === i && "brightness-110")}
                      style={{ height: `${pct}%`, minHeight: 2, width: "calc(100% - 2px)", maxWidth: 24, background: "var(--chart-1)" }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {active !== null && points[active] ? (
            <div
              className={cn(
                "pointer-events-none absolute z-10 rounded-lg border border-line bg-card px-2.5 py-1.5 shadow",
                tipAlign === "center" && "-translate-x-1/2",
                tipAlign === "end" && "-translate-x-full",
              )}
              style={{
                left: `${((active + (tipAlign === "start" ? 0 : tipAlign === "end" ? 1 : 0.5)) / n) * 100}%`,
                bottom: `calc(${Math.min(100, top ? (values[active] / top) * 100 : 0)}% + 8px)`,
              }}
            >
              <div className="num text-sm font-semibold whitespace-nowrap text-ink">{valueText(active)}</div>
              <div className="text-xs whitespace-nowrap text-muted">{points[active].label}</div>
            </div>
          ) : null}
        </div>

        {/* X axis */}
        <div aria-hidden />
        <div className="relative mt-1.5 h-4" aria-hidden>
          {points.map((p, i) =>
            labelled.has(i) ? (
              <span
                key={p.key}
                className={cn(
                  "absolute top-0 text-[11px] leading-none whitespace-nowrap text-muted",
                  i === n - 1 && n > 8 ? "-translate-x-full" : i === 0 && n > 8 ? "" : "-translate-x-1/2",
                )}
                style={{ left: `${((i + (i === n - 1 && n > 8 ? 1 : i === 0 && n > 8 ? 0 : 0.5)) / n) * 100}%` }}
              >
                {p.short}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <p id={liveId} className="sr-only" aria-live="polite">
        {active !== null && points[active] ? `${points[active].label}: ${valueText(active)}` : ""}
      </p>

      <details className="group mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted select-none hover:text-ink">See the numbers</summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunk text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Day</th>
                <th className="px-3 py-2 text-right font-semibold">{valueHeading}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points
                .map((p, i) => ({ p, i }))
                .reverse()
                .map(({ p, i }) => (
                  <tr key={p.key}>
                    <td className="px-3 py-1.5 text-ink-2">{p.label}</td>
                    <td className="num px-3 py-1.5 text-right text-ink">{format === "money" ? usd.format(p.value / 100) : values[i].toLocaleString("en-US")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
