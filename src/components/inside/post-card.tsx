import Link from "next/link";
import { Download, Lock, MessageCircle, Pin, TrendingDown, TrendingUp } from "lucide-react";
import type { FeedMedia, FeedPost, ReactionInfo } from "@/server/queries/feed";
import { Avatar } from "@/components/ui/avatar";
import { Markdown } from "@/components/ui/markdown";
import { VideoPlayer } from "@/components/video/player";
import { CommentForm, CommentMenu, PostMenu, ReactionBar } from "@/components/inside/post-controls";
import { AlertUpdateForm } from "@/components/inside/alert-forms";
import { ALERT_STATE_LABEL } from "@/lib/community";
import { formatStamp } from "@/lib/time";
import { cn, plural, timeAgo } from "@/lib/utils";

export type PostViewer = { id: string; canManage: boolean; isAdmin: boolean; canComment: boolean };

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CreatorTag() {
  return <span className="rounded-md bg-primary px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary-ink uppercase">Creator</span>;
}

function Media({ ids, media, title }: { ids: string[]; media: FeedMedia; title: string }) {
  const items = ids.map((id) => media.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const images = items.filter((m) => m.kind === "IMAGE");
  const videos = items.filter((m) => m.kind === "VIDEO");
  const files = items.filter((m) => m.kind === "FILE" || (m.kind === "IMAGE" && m.purpose === "file"));
  const pics = images.filter((m) => m.purpose !== "file");
  return (
    <>
      {videos.map((v) => (
        <VideoPlayer
          key={v.id}
          src={`/api/media/${v.id}`}
          title={title}
          aspect={v.width && v.height && v.height > v.width * 1.2 ? "9:16" : "16:9"}
          className="mt-3"
        />
      ))}
      {pics.length ? (
        <div className={cn("mt-3 grid gap-1.5 overflow-hidden rounded-xl", pics.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {pics.map((m) => (
            <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="block bg-sunk">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${m.id}`} alt="" loading="lazy" className={cn("w-full object-cover", pics.length === 1 ? "max-h-[520px]" : "aspect-square")} />
            </a>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/api/media/${f.id}?download=1`} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-sm hover:bg-hover">
                <Download className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.originalName}</span>
                <span className="num shrink-0 text-xs text-faint">{size(f.sizeBytes)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function AlertBlock({ post, timeZone, canUpdate }: { post: FeedPost; timeZone: string; canUpdate: boolean }) {
  const state = ALERT_STATE_LABEL[post.alertState ?? "OPEN"] ?? ALERT_STATE_LABEL.OPEN;
  const long = post.direction === "LONG";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold text-white", long ? "bg-up" : "bg-down")}>
          {long ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          {long ? "Long" : "Short"}
        </span>
        <span className="num text-xl font-semibold">{post.symbol}</span>
        <span className={cn("badge", state.tone)}>{state.label}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border border-line text-center">
        {[
          ["Entry", post.entry],
          ["Stop", post.stop],
          ["Target", post.target],
        ].map(([k, v], i) => (
          <div key={k} className={cn("px-2 py-2.5", i > 0 && "border-l border-line")}>
            <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{k}</dt>
            <dd className="num mt-0.5 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <div className="text-xs font-semibold text-muted">Reasoning</div>
        <Markdown className="mt-1 text-[15px]">{post.reasoning ?? post.body}</Markdown>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
        <Lock className="size-3.5" /> Posted {formatStamp(post.createdAt, timeZone)}. Locked: can&apos;t be edited or deleted.
      </p>
      {post.alertUpdates.length ? (
        <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
          {post.alertUpdates.map((u) => {
            const s = ALERT_STATE_LABEL[u.state] ?? ALERT_STATE_LABEL.OPEN;
            return (
              <li key={u.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("badge", s.tone)}>{u.state === "OPEN" ? "Update" : s.label}</span>
                  <span className="text-xs text-muted">{formatStamp(u.createdAt, timeZone)}</span>
                </div>
                <p className="mt-1 text-ink-2">{u.note}</p>
              </li>
            );
          })}
        </ol>
      ) : null}
      {canUpdate && !state.final ? (
        <div className="mt-4 rounded-xl bg-sunk p-3">
          <AlertUpdateForm postId={post.id} />
        </div>
      ) : null}
    </div>
  );
}

export function PostCard({
  post,
  media,
  reactions,
  viewer,
  creatorId,
  timeZone,
  base,
  full,
}: {
  post: FeedPost;
  media: FeedMedia;
  reactions: ReactionInfo | undefined;
  viewer: PostViewer;
  creatorId: string;
  timeZone: string;
  base: string;
  full?: boolean;
}) {
  const mine = post.authorId === viewer.id;
  const hidden = post.commentCount - post.comments.length;
  const postHref = `${base}/post/${post.id}`;
  return (
    <article id={`p-${post.id}`} className={cn("card scroll-mt-24 p-4 sm:p-5", post.pinnedAt && !full && "ring-1 ring-accent/30")}>
      <header className="flex items-start gap-3">
        <Link href={`/@${post.author.username}`} className="shrink-0">
          <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/@${post.author.username}`} className="font-semibold hover:underline">
              {post.author.displayName}
            </Link>
            {post.authorId === creatorId ? <CreatorTag /> : null}
            {post.pinnedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text">
                <Pin className="size-3" /> Pinned
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted">
            <Link href={postHref} className="hover:underline" title={formatStamp(post.createdAt, timeZone)}>
              <time dateTime={post.createdAt.toISOString()}>{timeAgo(post.createdAt)}</time>
            </Link>
            {post.editedAt ? " · edited" : ""}
          </div>
        </div>
        <PostMenu
          postId={post.id}
          body={post.body}
          canEdit={mine}
          canDelete={(mine || viewer.canManage) && (!post.isAlert || viewer.isAdmin)}
          canPin={viewer.canManage}
          pinned={Boolean(post.pinnedAt)}
          canReport={!mine}
          isAlert={post.isAlert}
        />
      </header>

      {post.isAlert ? (
        <AlertBlock post={post} timeZone={timeZone} canUpdate={viewer.canManage} />
      ) : (
        <>
          {post.body ? <Markdown className="mt-3 text-[15px] leading-relaxed break-words">{post.body}</Markdown> : null}
          {post.embedUrl ? <VideoPlayer embedUrl={post.embedUrl} title="Video" className="mt-3" /> : null}
          <Media ids={post.mediaIds} media={media} title={post.body.slice(0, 60) || "Video"} />
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <ReactionBar postId={post.id} counts={reactions?.counts ?? {}} mine={reactions?.mine ?? []} canReact={viewer.canComment} />
        {!full ? (
          <Link href={`${postHref}#replies`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <MessageCircle className="size-4" />
            {post.commentCount ? plural(post.commentCount, "reply", "replies") : "Reply"}
          </Link>
        ) : null}
      </div>

      {post.comments.length || full ? (
        <div id={full ? "replies" : undefined} className="mt-4 space-y-3 border-t border-line pt-4">
          {!full && hidden > 0 ? (
            <Link href={`${postHref}#replies`} className="block text-sm font-semibold text-ink-2 hover:text-ink">
              See all {plural(post.commentCount, "reply", "replies")}
            </Link>
          ) : null}
          {post.comments.map((c) => (
            <div key={c.id} id={`c-${c.id}`} className="flex scroll-mt-24 gap-2.5">
              <Link href={`/@${c.author.username}`} className="shrink-0">
                <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={30} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="rounded-xl bg-sunk px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Link href={`/@${c.author.username}`} className="font-semibold hover:underline">
                      {c.author.displayName}
                    </Link>
                    {c.authorId === creatorId ? <CreatorTag /> : null}
                    <span className="text-xs text-faint" title={formatStamp(c.createdAt, timeZone)}>
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <Markdown className="mt-0.5 text-sm break-words">{c.body}</Markdown>
                </div>
              </div>
              <CommentMenu commentId={c.id} canDelete={c.authorId === viewer.id || viewer.canManage} canReport={c.authorId !== viewer.id} />
            </div>
          ))}
          {viewer.canComment ? <CommentForm postId={post.id} /> : null}
        </div>
      ) : viewer.canComment ? (
        <div className="mt-4 border-t border-line pt-4">
          <CommentForm postId={post.id} />
        </div>
      ) : null}
    </article>
  );
}
