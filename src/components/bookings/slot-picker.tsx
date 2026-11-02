import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarX2, Globe } from "lucide-react";
import { dateParts, formatClock, utcToZoned, zoneName } from "@/lib/time";
import { cn, plural } from "@/lib/utils";

type Slot = { start: Date; end: Date };

/**
 * Pick a day, then a time. Plain links (no scripts needed): ?day= picks the day, ?slot= picks the time,
 * and the page shows `confirm` (the form) once a time is picked. Times show in the viewer's own time zone.
 */
export function SlotPicker({
  slots,
  timeZone,
  path,
  day,
  slot,
  confirm,
  empty,
  anchor = "pick",
}: {
  slots: Slot[];
  timeZone: string;
  path: string;
  day?: string;
  slot?: string;
  confirm?: (picked: Slot) => ReactNode;
  empty?: ReactNode;
  anchor?: string;
}) {
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = utcToZoned(s.start, timeZone).date;
    const list = byDay.get(key);
    if (list) list.push(s);
    else byDay.set(key, [s]);
  }
  const days = [...byDay.keys()];
  const activeDay = day && byDay.has(day) ? day : days[0];
  const times = activeDay ? byDay.get(activeDay)! : [];
  const picked = slot ? times.find((s) => s.start.toISOString() === slot) : undefined;
  const href = (q: Record<string, string>) => `${path}?${new URLSearchParams(q)}#${anchor}`;

  return (
    <div id={anchor} className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Pick a time</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Globe className="size-3.5" /> Times in {zoneName(timeZone)}.{" "}
          <Link href="/settings" className="link">
            Change
          </Link>
        </span>
      </div>
      {!days.length ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed border-line-strong p-5 text-sm">
          <CalendarX2 className="mt-0.5 size-5 shrink-0 text-muted" />
          <div>{empty ?? "No open times right now. Check back soon."}</div>
        </div>
      ) : (
        <>
          <ul className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Days with open times">
            {days.map((d) => {
              const p = dateParts(d);
              const active = d === activeDay;
              return (
                <li key={d} className="shrink-0">
                  <Link
                    href={href({ day: d })}
                    scroll={false}
                    aria-current={active ? "date" : undefined}
                    aria-label={`${p.long}, ${plural(byDay.get(d)!.length, "open time")}`}
                    className={cn(
                      "flex w-[76px] flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors",
                      active ? "border-ink bg-ink text-bg" : "border-line bg-card hover:border-line-strong",
                    )}
                  >
                    <span className={cn("text-[11px] font-semibold uppercase", active ? "opacity-80" : "text-muted")}>{p.weekday}</span>
                    <span className="mt-0.5 text-sm font-bold">{p.monthDay}</span>
                    <span className={cn("mt-0.5 text-[11px]", active ? "opacity-70" : "text-faint")}>{plural(byDay.get(d)!.length, "time")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <div className="text-sm font-semibold">{activeDay ? dateParts(activeDay).long : null}</div>
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" aria-label="Open times">
              {times.map((s) => {
                const iso = s.start.toISOString();
                const active = picked?.start.toISOString() === iso;
                return (
                  <li key={iso}>
                    <Link
                      href={href({ day: activeDay!, slot: iso })}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "block rounded-lg border px-2 py-2 text-center text-sm font-semibold transition-colors",
                        active ? "border-ink bg-ink text-bg" : "border-line bg-card hover:border-ink",
                      )}
                    >
                      {formatClock(s.start, timeZone)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          {picked && confirm ? <div className="mt-5 rounded-xl border border-ink/20 bg-sunk/60 p-4 sm:p-5">{confirm(picked)}</div> : null}
        </>
      )}
    </div>
  );
}
