import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { dateParts, formatClock, formatTime, utcToZoned } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CallRowData = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  product: { title: string };
  /** The other person on the call. */
  other: { displayName: string; avatarUrl: string | null };
};

const JOIN_EARLY_MS = 10 * 60_000;

/** One call in a list: the day, the time in the viewer's time zone, who it's with and where it stands. */
export function CallRow({ call, timeZone, now = new Date() }: { call: CallRowData; timeZone: string; now?: Date }) {
  const day = utcToZoned(call.startsAt, timeZone).date;
  const today = utcToZoned(now, timeZone).date;
  const parts = dateParts(day);
  const daysAway = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const live = call.status === "CONFIRMED" && now.getTime() >= call.startsAt.getTime() - JOIN_EARLY_MS && now.getTime() <= call.endsAt.getTime() + 30 * 60_000;
  const ended = call.status === "CONFIRMED" && now > call.endsAt && !live;

  const badge = live ? (
    <span className="badge badge-accent">Join now</span>
  ) : call.status === "CANCELED" ? (
    <span className="badge badge-bad">Canceled</span>
  ) : call.status === "COMPLETED" ? (
    <span className="badge badge-outline">Done</span>
  ) : call.status === "NO_SHOW" ? (
    <span className="badge badge-warn">No-show</span>
  ) : ended ? (
    <span className="badge badge-outline">Ended</span>
  ) : daysAway === 0 ? (
    <span className="badge badge-ink">Today</span>
  ) : daysAway === 1 ? (
    <span className="badge badge-info">Tomorrow</span>
  ) : null;

  return (
    <li>
      <Link href={`/calls/${call.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-sunk/60 sm:px-5">
        <div
          className={cn(
            "flex w-14 shrink-0 flex-col items-center rounded-lg border py-1.5 text-center",
            call.status === "CANCELED" ? "border-line text-faint" : "border-line-strong bg-card",
          )}
        >
          <span className="text-[11px] font-semibold text-muted uppercase">{parts.weekday}</span>
          <span className="text-sm font-bold">{parts.monthDay}</span>
        </div>
        <span className="hidden shrink-0 sm:block">
          <Avatar src={call.other.avatarUrl} name={call.other.displayName} size={36} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold", call.status === "CANCELED" && "text-muted line-through decoration-1")}>
            {formatClock(call.startsAt, timeZone)} to {formatTime(call.endsAt, timeZone)}
          </div>
          <div className="truncate text-sm text-muted">
            With {call.other.displayName} · {call.product.title}
          </div>
        </div>
        {badge}
        <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** A bordered list of calls. */
export function CallList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label={label}>
      {children}
    </ul>
  );
}
