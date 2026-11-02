import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { requestMeta } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { mediaUrlById } from "@/server/queries/media";
import { productCardInclude, publicProductWhere } from "@/server/queries/products";
import { VideoPlayer } from "@/components/video/player";
import { VideoCard } from "@/components/video/video-card";
import { ProductCard } from "@/components/market/product-card";
import { Avatar } from "@/components/ui/avatar";
import { SampleBadge } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { VerifiedTick } from "@/components/market/badges";
import { ReportButton } from "@/components/report-button";
import { CopyButton } from "@/components/ui/client";
import { absoluteUrl } from "@/lib/env";
import { formatDate } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const video = await db.videoPost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true, idVerifiedAt: true, creator: { select: { status: true, headline: true, resultsCheckedAt: true } } } },
      company: { select: { id: true, slug: true, name: true, logoUrl: true, status: true, verifiedAt: true } },
    },
  });
  if (!video) return null;
  if (video.author && (video.author.status === "BANNED" || video.author.status === "DELETED")) return null;
  if (video.company && video.company.status !== "PUBLISHED") return null;
  return video;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = await load(id);
  if (!v || v.status !== "PUBLISHED") return { title: "Video not found" };
  return { title: v.title, description: v.description?.slice(0, 160) ?? undefined, openGraph: { images: v.posterUrl ? [v.posterUrl] : undefined } };
}

export default async function VideoPage({ params }: Props) {
  const { id } = await params;
  const video = await load(id);
  const viewer = await getViewer();
  const isOwner = Boolean(viewer && video?.author?.id === viewer.id);
  if (!video || (video.status !== "PUBLISHED" && !isOwner && !viewer?.isAdmin)) notFound();

  // One view per person per half hour.
  const { ip } = await requestMeta();
  const counted = await rateLimit(`view:${video.id}:${viewer?.id ?? ip}`, 1, 1800);
  if (counted.ok && !isOwner) await db.videoPost.update({ where: { id: video.id }, data: { views: { increment: 1 } } });

  const [src, product, more] = await Promise.all([
    mediaUrlById(video.mediaId),
    video.productId ? db.product.findFirst({ where: { ...publicProductWhere, id: video.productId }, include: productCardInclude }) : null,
    db.videoPost.findMany({
      where: {
        status: "PUBLISHED",
        id: { not: video.id },
        ...(video.authorId ? { authorId: video.authorId } : { companyId: video.companyId }),
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const vertical = video.aspect === "9:16";
  const byHref = video.author ? `/@${video.author.username}` : video.company ? `/directory/c/${video.company.slug}` : "#";
  const byName = video.author?.displayName ?? video.company?.name ?? "TraderTrades";

  return (
    <div className="container-tt py-8 sm:py-10">
      <div className={vertical ? "grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]" : "grid gap-8 lg:grid-cols-[1fr_340px]"}>
        <div className="min-w-0">
          <VideoPlayer src={src} embedUrl={video.embedUrl} poster={video.posterUrl} title={video.title} aspect={video.aspect} />
          {vertical ? null : <VideoMeta v={video} isOwner={isOwner} byHref={byHref} byName={byName} />}
        </div>
        <div className="min-w-0">
          {vertical ? <VideoMeta v={video} isOwner={isOwner} byHref={byHref} byName={byName} /> : null}
          {product ? (
            <div className={vertical ? "mt-6" : ""}>
              <div className="kicker mb-3">From the video</div>
              <ProductCard product={product} />
            </div>
          ) : null}
          {more.length ? (
            <div className="mt-6">
              <div className="kicker mb-3">More from {byName}</div>
              <div className="grid grid-cols-2 gap-4">
                {more.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VideoMeta({ v, isOwner, byHref, byName }: { v: NonNullable<Awaited<ReturnType<typeof load>>>; isOwner: boolean; byHref: string; byName: string }) {
  return (
    <div className="mt-5">
      {v.status !== "PUBLISHED" ? <div className="badge badge-warn mb-3">Hidden. Only you can see this.</div> : null}
      <div className="flex flex-wrap items-start gap-2">
        <h1 className="min-w-0 flex-1 text-[24px] sm:text-[28px]">{v.title}</h1>
        {v.isSample ? <SampleBadge /> : null}
      </div>
      <div className="mt-1 text-sm text-muted">
        {v.views.toLocaleString()} views · {formatDate(v.createdAt)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <Link href={byHref} className="flex min-w-0 items-center gap-3">
          <Avatar src={v.author?.avatarUrl ?? v.company?.logoUrl} name={byName} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold">
              <span className="truncate">{byName}</span>
              {v.author ? <VerifiedTick who={v.author} /> : null}
            </span>
            {v.author?.creator?.headline ? <span className="block truncate text-xs text-muted">{v.author.creator.headline}</span> : null}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <CopyButton value={absoluteUrl(`/v/${v.id}`)} label="Copy link" small className="btn-ghost" />
          {!isOwner ? <ReportButton targetType="VIDEO" targetId={v.id} /> : null}
          {byHref !== "#" ? (
            <Link href={byHref} className="btn btn-secondary btn-sm">
              {v.author ? "Profile" : "Listing"} <ArrowRight />
            </Link>
          ) : null}
        </div>
      </div>
      {v.description ? <Markdown className="mt-4 text-[15px]">{v.description}</Markdown> : null}
    </div>
  );
}
