"use client";

import { useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { saveWeeklyHours } from "@/server/actions/bookings";
import { cn } from "@/lib/utils";

type Range = { start: number; end: number };
type Week = Record<number, Range[]>;

// Monday first, the way most people think about their week. 0 is Sunday.
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

const STEPS = Array.from({ length: 97 }, (_, i) => i * 15);

function label(min: number) {
  if (min === 1440) return "Midnight";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function problem(ranges: Range[]) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (const r of sorted) if (r.end <= r.start) return "End after the start";
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return "These overlap";
  return null;
}

/** Weekly hours for mentoring calls, in the creator's own time zone. */
export function WeeklyHoursEditor({ initial, zoneLabel }: { initial: { weekday: number; startMinute: number; endMinute: number }[]; zoneLabel: string }) {
  const [week, setWeek] = useState<Week>(() => {
    const w: Week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const r of initial) w[r.weekday].push({ start: r.startMinute, end: r.endMinute });
    return w;
  });
  const set = (weekday: number, ranges: Range[]) => setWeek((w) => ({ ...w, [weekday]: ranges }));
  const payload = JSON.stringify(Object.entries(week).flatMap(([wd, ranges]) => ranges.map((r) => ({ weekday: Number(wd), start: r.start, end: r.end }))));
  const anyProblem = DAYS.some((d) => problem(week[d.weekday]));

  return (
    <ActionForm action={saveWeeklyHours} toastOnSuccess className="space-y-4">
      <input type="hidden" name="hours" value={payload} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Times are in {zoneLabel}. Buyers see them in their own time zone.</p>
        {week[1].length ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setWeek((w) => ({ ...w, 2: [...w[1]], 3: [...w[1]], 4: [...w[1]], 5: [...w[1]] }))}
          >
            <Copy /> Copy Monday to weekdays
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {DAYS.map((d) => {
          const ranges = week[d.weekday];
          const on = ranges.length > 0;
          const err = problem(ranges);
          return (
            <li key={d.weekday} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <label className="flex w-40 shrink-0 items-center gap-3 pt-1.5">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={on}
                  onChange={(e) => set(d.weekday, e.target.checked ? [{ start: 9 * 60, end: 17 * 60 }] : [])}
                  aria-label={`Available on ${d.label}`}
                />
                <span className="text-sm font-semibold">{d.label}</span>
              </label>
              <div className="min-w-0 flex-1">
                {!on ? (
                  <p className="pt-1.5 text-sm text-faint">Not available</p>
                ) : (
                  <div className="space-y-2">
                    {ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select
                          className={cn("input h-9 w-auto py-0 pr-8 text-sm", err && "border-down")}
                          value={r.start}
                          aria-label={`${d.label} start time ${i + 1}`}
                          onChange={(e) =>
                            set(
                              d.weekday,
                              ranges.map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)),
                            )
                          }
                        >
                          {STEPS.slice(0, -1).map((m) => (
                            <option key={m} value={m}>
                              {label(m)}
                            </option>
                          ))}
                        </select>
                        <span className="text-sm text-muted">to</span>
                        <select
                          className={cn("input h-9 w-auto py-0 pr-8 text-sm", err && "border-down")}
                          value={r.end}
                          aria-label={`${d.label} end time ${i + 1}`}
                          onChange={(e) =>
                            set(
                              d.weekday,
                              ranges.map((x, j) => (j === i ? { ...x, end: Number(e.target.value) } : x)),
                            )
                          }
                        >
                          {STEPS.slice(1).map((m) => (
                            <option key={m} value={m}>
                              {label(m)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() =>
                            set(
                              d.weekday,
                              ranges.filter((_, j) => j !== i),
                            )
                          }
                          aria-label={`Remove these ${d.label} hours`}
                          title="Remove"
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                    {err ? <p className="field-error">{err}</p> : null}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm -ml-2"
                      onClick={() => {
                        const last = ranges[ranges.length - 1];
                        const start = Math.min(1380, last ? last.end + 60 : 9 * 60);
                        set(d.weekday, [...ranges, { start, end: Math.min(1440, start + 120) }]);
                      }}
                    >
                      <Plus /> Add hours
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <FormMessage hideSuccess />
      <SubmitButton disabled={anyProblem}>Save weekly hours</SubmitButton>
    </ActionForm>
  );
}
