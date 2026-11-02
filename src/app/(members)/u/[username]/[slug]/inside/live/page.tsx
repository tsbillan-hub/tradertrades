import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus, PlayCircle, Video } from "lucide-react";
import { db } from "@/lib/db";
import { requireInside } from "@/server/inside";
import { InsideHeader, InsideShell } from "@/components/inside/shell";
import { EmptyState } from "@/components/ui/misc";
import { VideoPlayer } from "@/components/video/player";
import { formatWhen } from "@/lib/time";
import { insidePath } from "@/lib/paths";
import { cn, minutesLabel, msSince, toEmbedUrl } from "@/lib/utils";

type Props = { params: Promise<{ username: string; slug: string }> };

export const metadata: Metadata = { title: "Live sessions", robots: { index: false } };

/** Join opens 15 minutes before the start and closes when the session ends. */
function joinState(startsAt: Date, durationMin: number) {
  const since = msSince(startsAt);
  if (since < -15 * 60_000) return "soon" as const;
  if (since <= durationMin * 60_000) return since < 0 ? ("open" as const) : ("live" as const);
  return "over" as const;
}

export default async function LivePage({ params }: Props) {
  const { username, slug } = await params;
  const ctx = await requireInside(username, slug);
  const { product } = ctx;
  const sessions = await db.liveSession.findMany({ where: { productId: product.id }, orderBy: { startsAt: "asc" } });
  const withState = sessions.map((s) => ({ ...s, state: joinState(s.startsAt, s.durationMin) }));
  const upcoming = withState.filter((s) => s.state !== "over");
  const past = withState.filter((s) => s.state === "over").reverse();
  const manage = insidePath(product.creator.username, product.slug, "/manage?tab=live");

  return (
    <InsideShell ctx={ctx}>
      <InsideHeader
        icon={<CalendarDays />}
        title="Live sessions"
        description={`Times are shown in your time zone (${ctx.timeZone.replace(/_/g, " ")}).`}
        actions={
          ctx.canManage ? (
            <Link href={manage} className="btn btn-primary btn-sm">
              Schedule a session
            </Link>
          ) : null
        }
      />

      {upcoming.length ? (
        <ul className="space-y-3">
          {upcoming.map((s) => (
            <li key={s.id} className={cn("card p-4 sm:p-5", s.state === "live" && "ring-2 ring-accent")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.state === "live" ? <span className="badge badge-bad">Live now</span> : null}
                    <span className="text-sm font-semibold text-accent-text">{formatWhen(s.startsAt, ctx.timeZone)}</span>
                    <span className="text-sm text-muted">· {minutesLabel(s.durationMin)}</span>
                  </div>
                  <h2 className="mt-1 text-lg">{s.title}</h2>
                  {s.description ? <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{s.description}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {s.state === "soon" ? (
                    <span className="btn btn-secondary btn-sm pointer-events-none opacity-70" aria-disabled>
                      <Video /> Join opens 15 min before
                    </span>
                  ) : s.joinUrl ? (
                    <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                      <Video /> Join now
                    </a>
                  ) : null}
                  <a href={`/api/calendar?session=${s.id}`} className="btn btn-ghost btn-sm">
                    <CalendarPlus /> Add to calendar
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarDays />}
          title="No sessions scheduled"
          description={ctx.canManage ? "Schedule one and every member gets told." : `${product.creator.displayName} hasn't scheduled the next one yet. You'll get a notification when they do.`}
          action={
            ctx.canManage ? (
              <Link href={manage} className="btn btn-primary">
                Schedule a session
              </Link>
            ) : null
          }
        />
      )}

      {past.length ? (
        <section className="mt-10">
          <h2 className="text-lg">Past sessions</h2>
          <ul className="mt-3 space-y-3">
            {past.map((s) => {
              const embed = toEmbedUrl(s.recordingUrl);
              return (
                <li key={s.id} className="card p-4 sm:p-5">
                  <div className="text-xs text-muted">{formatWhen(s.startsAt, ctx.timeZone)}</div>
                  <h3 className="mt-0.5 text-base">{s.title}</h3>
                  {embed ? (
                    <VideoPlayer embedUrl={s.recordingUrl} title={s.title} className="mt-3" />
                  ) : s.recordingUrl ? (
                    <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm mt-3">
                      <PlayCircle /> Watch the recording
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-muted">No recording yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </InsideShell>
  );
}
