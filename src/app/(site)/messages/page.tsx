import type { Metadata } from "next";
import Link from "next/link";
import { Archive, MessageSquare } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/misc";
import { cn, timeAgo, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

type Props = { searchParams: Promise<{ view?: string }> };

export default async function MessagesPage({ searchParams }: Props) {
  const user = await requireUser();
  const { view } = await searchParams;
  const archived = view === "archived";
  const rows = await db.conversationMember.findMany({
    where: { userId: user.id, archivedAt: archived ? { not: null } : null },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true, status: true } } } },
          messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true } },
        },
      },
    },
  });

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <PageHeader title="Messages" description="Chats with creators, buyers and businesses. Keep payments on TraderTrades so you're covered." />
      <LinkTabs
        className="mt-6"
        active={archived ? "archived" : "inbox"}
        tabs={[
          { key: "inbox", label: "Inbox", href: "/messages" },
          { key: "archived", label: "Archived", href: "/messages?view=archived" },
        ]}
      />
      {rows.length ? (
        <ul className="card mt-4 divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const c = r.conversation;
            const other = c.members.find((m) => m.userId !== user.id)?.user;
            const last = c.messages[0];
            const unread = !r.lastReadAt || c.lastMessageAt > r.lastReadAt;
            const gone = other && (other.status === "DELETED" || other.status === "BANNED");
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                  <Avatar src={gone ? null : (other?.avatarUrl ?? null)} name={gone ? "?" : (other?.displayName ?? "?")} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-sm", unread ? "font-bold text-ink" : "font-semibold text-ink-2")}>
                        {gone ? "Account removed" : (other?.displayName ?? "Just you")}
                      </span>
                      <span className="shrink-0 text-xs text-faint">{timeAgo(c.lastMessageAt)}</span>
                    </span>
                    {c.subject ? <span className="block truncate text-xs font-medium text-muted">{c.subject}</span> : null}
                    <span className={cn("block truncate text-sm", unread ? "text-ink" : "text-muted")}>
                      {last ? `${last.senderId === user.id ? "You: " : ""}${truncate(last.body.replace(/\s+/g, " "), 120)}` : "No messages yet"}
                    </span>
                  </span>
                  {unread ? <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          className="mt-4"
          icon={archived ? <Archive /> : <MessageSquare />}
          title={archived ? "Nothing archived" : "No messages yet"}
          description={archived ? undefined : "Message a creator from their page or a product, or reply to a buyer from your Sales."}
          action={
            archived ? undefined : (
              <Link href="/creators" className="btn btn-secondary">
                Find creators
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
