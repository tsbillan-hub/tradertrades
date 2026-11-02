import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Archive, ChevronLeft, ShieldAlert, UserX } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { archiveConversation, blockUser, unblockUser } from "@/server/actions/messages";
import { MessageComposer, ThreadWatcher } from "@/components/messages/thread";
import { ReportButton } from "@/components/report-button";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

function timeOf(d: Date, tz: string) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}
function dayOf(d: Date, tz: string) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: tz });
}

export default async function ConversationPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const convo = await db.conversation.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true, status: true } } } } },
  });
  const me = convo?.members.find((m) => m.userId === user.id);
  if (!convo || !me) notFound();
  const other = convo.members.find((m) => m.userId !== user.id)?.user ?? null;
  const [messages, blocks] = await Promise.all([
    db.message.findMany({ where: { conversationId: convo.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 200 }),
    other ? db.block.findMany({ where: { OR: [{ blockerId: user.id, blockedId: other.id }, { blockerId: other.id, blockedId: user.id }] } }) : [],
  ]);
  messages.reverse();
  const iBlocked = blocks.some((b) => b.blockerId === user.id);
  const theyBlocked = blocks.some((b) => b.blockerId !== user.id);
  const gone = !other || other.status === "DELETED" || other.status === "BANNED";
  const tz = user.timezone;

  if (!me.lastReadAt || convo.lastMessageAt > me.lastReadAt) {
    after(async () => {
      await db.conversationMember.update({ where: { id: me.id }, data: { lastReadAt: new Date() } });
    });
  }

  const rows = messages.map((m, i) => {
    const day = dayOf(m.createdAt, tz);
    return { m, day, showDay: i === 0 || dayOf(messages[i - 1].createdAt, tz) !== day };
  });
  return (
    <div className="container-tt max-w-3xl py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/messages" className="btn btn-ghost btn-icon" aria-label="All messages">
          <ChevronLeft />
        </Link>
        {other && !gone ? (
          <Link href={`/@${other.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar src={other.avatarUrl} name={other.displayName} size={40} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{other.displayName}</span>
              <span className="block truncate text-xs text-muted">{convo.subject ?? `@${other.username}`}</span>
            </span>
          </Link>
        ) : (
          <span className="flex-1 font-semibold text-muted">Account removed</span>
        )}
        <div className="flex items-center gap-1">
          <ActionButton action={archiveConversation} fields={{ conversationId: convo.id }} variant="ghost" title="Archive">
            <Archive /> <span className="max-sm:hidden">Archive</span>
          </ActionButton>
          {other && !gone ? (
            iBlocked ? (
              <ActionButton action={unblockUser} fields={{ userId: other.id }} variant="ghost">
                Unblock
              </ActionButton>
            ) : (
              <ActionButton action={blockUser} fields={{ userId: other.id }} variant="ghost" title="Block" confirm={`Block ${other.displayName}? They won't be able to message you.`}>
                <UserX /> <span className="max-sm:hidden">Block</span>
              </ActionButton>
            )
          ) : null}
          {other && !gone ? <ReportButton targetType="USER" targetId={other.id} /> : null}
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">No messages yet.</p> : null}
        {rows.map(({ m, day, showDay }) => {
          const mine = m.senderId === user.id;
          return (
            <div key={m.id}>
              {showDay ? (
                <div className="my-4 text-center text-xs font-semibold text-faint">{day}</div>
              ) : null}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]",
                    mine ? "rounded-br-md bg-primary text-primary-ink" : "rounded-bl-md bg-card text-ink ring-1 ring-line",
                  )}
                >
                  {m.body}
                  <div className={cn("mt-1 text-right text-[11px]", mine ? "text-primary-ink/70" : "text-faint")}>{timeOf(m.createdAt, tz)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <ThreadWatcher count={messages.length} />
      </div>

      <div className="sticky bottom-0 mt-6 bg-bg pt-2 pb-4">
        {gone ? (
          <Notice tone="info">This account is no longer on TraderTrades, so you can&apos;t reply.</Notice>
        ) : iBlocked ? (
          <Notice tone="info">You blocked {other?.displayName}. Unblock them to reply.</Notice>
        ) : theyBlocked ? (
          <Notice tone="info">You can&apos;t reply to this conversation.</Notice>
        ) : user.emailVerifiedAt ? (
          <>
            <MessageComposer conversationId={convo.id} />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <ShieldAlert className="size-3.5" /> Never pay outside TraderTrades. Anyone asking you to isn&apos;t covered by refunds.
            </p>
          </>
        ) : (
          <Notice tone="info">
            <Link href="/verify-email" className="link">
              Confirm your email
            </Link>{" "}
            to reply.
          </Notice>
        )}
      </div>
    </div>
  );
}
