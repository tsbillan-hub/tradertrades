import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Hash, LineChart, Megaphone, MessagesSquare } from "lucide-react";
import { canPostIn, loadInside, requireInside } from "@/server/inside";
import { channelFeed } from "@/server/queries/feed";
import { markChannelRead } from "@/server/community";
import { InsideHeader, InsideShell } from "@/components/inside/shell";
import { PostCard } from "@/components/inside/post-card";
import { Composer } from "@/components/inside/composer";
import { AlertComposer } from "@/components/inside/alert-forms";
import { NewPostsNotice, WelcomeCard } from "@/components/inside/live-bits";
import { EmptyState, Notice } from "@/components/ui/misc";
import { insidePath } from "@/lib/paths";
import { daysFromNow } from "@/lib/utils";

type Props = { params: Promise<{ username: string; slug: string; channel: string }>; searchParams: Promise<{ before?: string }> };

const ICON = { CHAT: <Hash />, ANNOUNCEMENTS: <Megaphone />, RESOURCES: <FolderOpen />, ALERTS: <LineChart /> } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug, channel } = await params;
  const ctx = await loadInside(username, slug);
  const ch = ctx?.product.channels.find((c) => c.slug === decodeURIComponent(channel));
  return { title: ch && ctx ? `${ch.name} · ${ctx.product.title}` : "Members area", robots: { index: false } };
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const { username, slug, channel: channelSlug } = await params;
  const { before } = await searchParams;
  const ctx = await requireInside(username, slug);
  const { product, viewer } = ctx;
  const channel = product.channels.find((c) => c.slug === decodeURIComponent(channelSlug));
  if (!channel) notFound();

  const beforeDate = before && !Number.isNaN(new Date(before).getTime()) ? new Date(before) : null;
  const [feed] = await Promise.all([channelFeed(channel.id, viewer.id, beforeDate), markChannelRead(viewer.id, channel.id)]);
  const base = insidePath(product.creator.username, product.slug);
  const creatorName = product.creator.displayName;
  const canPost = canPostIn(channel, ctx);
  const isAlerts = channel.kind === "ALERTS";
  const isFirst = product.channels[0]?.id === channel.id;
  const postViewer = { id: viewer.id, canManage: ctx.canManage, isAdmin: ctx.isAdmin, canComment: Boolean(viewer.emailVerifiedAt) && viewer.status === "ACTIVE" };

  const description =
    channel.description ??
    {
      ANNOUNCEMENTS: `News and updates from ${creatorName}.`,
      CHAT: "Talk with other members.",
      RESOURCES: `Files, recordings and links from ${creatorName}.`,
      ALERTS: "Time stamped trade ideas with the reasoning. Locked once posted.",
    }[channel.kind];

  return (
    <InsideShell ctx={ctx}>
      {isFirst && !beforeDate && ctx.settings.welcome ? <WelcomeCard productId={product.id} title={`Welcome to ${product.title}`} text={ctx.settings.welcome} /> : null}
      <InsideHeader icon={ICON[channel.kind]} title={channel.name} description={description} />

      {isAlerts ? (
        <Notice tone="plain" className="mb-4">
          Alerts are one trader&apos;s ideas, shared for learning. They aren&apos;t advice and nothing here places trades for you. Past alerts don&apos;t promise future
          results, so size your own risk.
        </Notice>
      ) : null}

      {!beforeDate ? (
        canPost && !viewer.emailVerifiedAt ? (
          <Notice tone="warn" title="Confirm your email to post">
            We sent you a link when you signed up.{" "}
            <Link href="/verify-email" className="font-semibold underline">
              Send it again
            </Link>
          </Notice>
        ) : canPost ? (
          isAlerts ? (
            <AlertComposer channelId={channel.id} />
          ) : (
            <Composer
              channelId={channel.id}
              productId={product.id}
              me={{ displayName: viewer.displayName, avatarUrl: viewer.avatarUrl }}
              isCreator={ctx.canManage}
              placeholder={channel.kind === "ANNOUNCEMENTS" ? "Share an update with your members..." : ctx.canManage ? "Start a conversation..." : "Ask a question or share a trade idea..."}
            />
          )
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <MessagesSquare className="size-4" /> Only {creatorName} posts here. You can react and reply.
          </p>
        )
      ) : null}

      <NewPostsNotice channelId={channel.id} since={(feed.posts.find((p) => !p.pinnedAt)?.createdAt ?? daysFromNow(0)).toISOString()} />

      {feed.posts.length ? (
        <div className="mt-5 space-y-4">
          {feed.posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              media={feed.media}
              reactions={feed.reactions.get(p.id)}
              viewer={postViewer}
              creatorId={product.creatorId}
              timeZone={ctx.timeZone}
              base={base}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-5"
          icon={ICON[channel.kind]}
          title={beforeDate ? "No older posts" : isAlerts ? "No alerts yet" : "Nothing here yet"}
          description={
            beforeDate
              ? undefined
              : canPost
                ? isAlerts
                  ? "Your first alert shows up here, time stamped and locked."
                  : "Be the first to post."
                : `${creatorName} hasn't posted here yet.`
          }
        />
      )}

      <div className="mt-6 flex justify-center gap-2">
        {beforeDate ? (
          <Link href={`${base}/c/${channel.slug}`} className="btn btn-ghost">
            Back to newest
          </Link>
        ) : null}
        {feed.nextBefore ? (
          <Link href={`${base}/c/${channel.slug}?before=${encodeURIComponent(feed.nextBefore.toISOString())}`} className="btn btn-secondary">
            Older posts
          </Link>
        ) : null}
      </div>
    </InsideShell>
  );
}
