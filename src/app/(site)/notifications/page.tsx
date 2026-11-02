import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Banknote, Bell, CalendarClock, MessageSquare, Receipt, Settings, Star, Users, Video, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

const PAGE = 40;

function iconFor(type: string) {
  if (type.startsWith("message")) return <MessageSquare />;
  if (type.startsWith("live") || type.includes("recording")) return <Video />;
  if (type.startsWith("alert")) return <Zap />;
  if (type.startsWith("community") || type.startsWith("post") || type.startsWith("comment") || type.startsWith("member")) return <Users />;
  if (type.startsWith("booking") || type.startsWith("event")) return <CalendarClock />;
  if (type.startsWith("payout")) return <Banknote />;
  if (type.startsWith("order") || type.startsWith("sale") || type.startsWith("refund") || type.startsWith("product")) return <Receipt />;
  if (type.startsWith("review")) return <Star />;
  return <Bell />;
}

type Props = { searchParams: Promise<{ before?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const user = await requireUser();
  const { before } = await searchParams;
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
  const rows = await db.notification.findMany({
    where: { userId: user.id, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
  });
  const items = rows.slice(0, PAGE);
  const older = rows.length > PAGE ? items[items.length - 1].createdAt.toISOString() : null;

  // Seen now. Unread ones keep their highlight on this visit.
  const unseen = items.filter((n) => !n.readAt).map((n) => n.id);
  if (unseen.length) {
    after(async () => {
      await db.notification.updateMany({ where: { id: { in: unseen }, userId: user.id }, data: { readAt: new Date() } });
    });
  }

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <PageHeader
        title="Notifications"
        description="New posts in your communities, live sessions, sales, messages and replies."
        actions={
          <Link href="/settings/notifications" className="btn btn-secondary btn-sm">
            <Settings /> Email settings
          </Link>
        }
      />
      {items.length ? (
        <ul className="card mt-6 divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const inner = (
              <>
                <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-4", n.readAt ? "bg-sunk text-muted" : "bg-accent-soft text-accent-text")}>
                  {iconFor(n.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.readAt ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</span>
                  {n.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span> : null}
                  <span className="mt-1 block text-xs text-faint">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="New" /> : null}
              </>
            );
            return (
              <li key={n.id}>
                {n.url && n.url.startsWith("/") ? (
                  <Link href={n.url} className="flex gap-3 px-4 py-3.5 hover:bg-hover">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-4 py-3.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState className="mt-6" icon={<Bell />} title={beforeDate ? "Nothing older" : "No notifications yet"} description={beforeDate ? undefined : "When something happens in a community you're in, or someone buys from you, it shows up here."} />
      )}
      {older ? (
        <div className="mt-6 flex justify-center">
          <Link href={`/notifications?before=${encodeURIComponent(older)}`} className="btn btn-secondary">
            Older notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
