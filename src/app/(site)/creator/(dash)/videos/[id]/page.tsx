import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { VideoForm } from "@/components/creator/video-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Edit video" };

type Props = { params: Promise<{ id: string }> };

export default async function EditVideoPage({ params }: Props) {
  const user = await requireCreator();
  const { id } = await params;
  const video = await db.videoPost.findFirst({ where: { id, authorId: user.id } });
  if (!video) notFound();
  const [products, media] = await Promise.all([
    db.product.findMany({ where: { creatorId: user.id, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true } }),
    video.mediaId ? db.media.findUnique({ where: { id: video.mediaId }, select: { originalName: true, durationSec: true, url: true } }) : null,
  ]);
  return (
    <div className="space-y-6">
      <Link href="/creator/videos" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Videos
      </Link>
      <PageHeader
        title="Edit video"
        actions={
          <Link href={`/v/${video.id}`} className="btn btn-secondary btn-sm">
            View <ExternalLink />
          </Link>
        }
      />
      <VideoForm
        video={{
          id: video.id,
          title: video.title,
          description: video.description,
          embedUrl: video.embedUrl,
          productId: video.productId,
          aspect: video.aspect,
          posterUrl: video.posterUrl,
          upload: media ? { name: media.originalName, durationSec: media.durationSec, url: media.url } : null,
        }}
        products={products}
      />
    </div>
  );
}
