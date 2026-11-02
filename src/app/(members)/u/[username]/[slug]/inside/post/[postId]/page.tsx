import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireInside } from "@/server/inside";
import { singlePost } from "@/server/queries/feed";
import { InsideShell } from "@/components/inside/shell";
import { PostCard } from "@/components/inside/post-card";
import { EmptyState } from "@/components/ui/misc";
import { insidePath } from "@/lib/paths";

type Props = { params: Promise<{ username: string; slug: string; postId: string }> };

export const metadata: Metadata = { title: "Post", robots: { index: false } };

export default async function PostPage({ params }: Props) {
  const { username, slug, postId } = await params;
  const ctx = await requireInside(username, slug);
  const { product, viewer } = ctx;
  const found = await singlePost(postId, viewer.id);
  if (!found || found.post.productId !== product.id) notFound();
  const { post, media, reactions } = found;
  const channel = product.channels.find((c) => c.id === post.channelId);
  const base = insidePath(product.creator.username, product.slug);
  const back = channel ? `${base}/c/${channel.slug}` : base;

  return (
    <InsideShell ctx={ctx}>
      <Link href={back} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> {channel ? channel.name : "Back"}
      </Link>
      {post.deletedAt ? (
        <EmptyState title="This post was removed" description="It was deleted by its author or the creator." />
      ) : (
        <PostCard
          post={post}
          media={media}
          reactions={reactions.get(post.id)}
          viewer={{ id: viewer.id, canManage: ctx.canManage, isAdmin: ctx.isAdmin, canComment: Boolean(viewer.emailVerifiedAt) && viewer.status === "ACTIVE" }}
          creatorId={product.creatorId}
          timeZone={ctx.timeZone}
          base={base}
          full
        />
      )}
    </InsideShell>
  );
}
