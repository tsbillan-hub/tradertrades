import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { mediaFor } from "@/server/community";
import { POSTS_PER_PAGE } from "@/lib/community";

const authorSelect = { id: true, username: true, displayName: true, avatarUrl: true } as const;

export const postInclude = (commentTake: number | undefined) =>
  ({
    author: { select: authorSelect },
    comments: {
      where: { deletedAt: null },
      orderBy: { createdAt: commentTake ? "desc" : "asc" },
      take: commentTake,
      include: { author: { select: authorSelect } },
    },
    alertUpdates: { orderBy: { createdAt: "asc" } },
  }) satisfies Prisma.PostInclude;

export type FeedPost = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;
export type FeedMedia = Awaited<ReturnType<typeof mediaFor>>;
export type ReactionInfo = { counts: Record<string, number>; mine: string[] };

async function reactionsFor(postIds: string[], viewerId: string) {
  const out = new Map<string, ReactionInfo>();
  if (!postIds.length) return out;
  const [groups, mine] = await Promise.all([
    db.reaction.groupBy({ by: ["postId", "emoji"], where: { postId: { in: postIds } }, _count: { _all: true } }),
    db.reaction.findMany({ where: { postId: { in: postIds }, userId: viewerId }, select: { postId: true, emoji: true } }),
  ]);
  for (const id of postIds) out.set(id, { counts: {}, mine: [] });
  for (const g of groups) out.get(g.postId)!.counts[g.emoji] = g._count._all;
  for (const m of mine) out.get(m.postId)!.mine.push(m.emoji);
  return out;
}

async function decorate(posts: FeedPost[], viewerId: string) {
  const [media, reactions] = await Promise.all([mediaFor(posts.flatMap((p) => p.mediaIds)), reactionsFor(posts.map((p) => p.id), viewerId)]);
  // Previews come newest first from the query; show them oldest first under the post.
  for (const p of posts) p.comments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { posts, media, reactions };
}

/** One page of a channel: pinned posts on the first page, then newest first. */
export async function channelFeed(channelId: string, viewerId: string, before?: Date | null) {
  const include = postInclude(2);
  const [pinned, rest] = await Promise.all([
    before ? Promise.resolve([] as FeedPost[]) : db.post.findMany({ where: { channelId, deletedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "desc" }, include }),
    db.post.findMany({
      where: { channelId, deletedAt: null, pinnedAt: null, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: POSTS_PER_PAGE + 1,
      include,
    }),
  ]);
  const more = rest.length > POSTS_PER_PAGE;
  const page = rest.slice(0, POSTS_PER_PAGE);
  const out = await decorate([...pinned, ...page], viewerId);
  return { ...out, pinnedCount: pinned.length, nextBefore: more ? page[page.length - 1].createdAt : null };
}

/** One post with every reply, for the post page. */
export async function singlePost(postId: string, viewerId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: postInclude(undefined) });
  if (!post) return null;
  const out = await decorate([post], viewerId);
  return { post, media: out.media, reactions: out.reactions };
}
