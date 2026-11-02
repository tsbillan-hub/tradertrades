import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusiness } from "@/server/dal";
import { saveCompanyVideo } from "@/server/actions/business";
import { VideoForm } from "@/components/creator/video-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Edit video" };

export default async function EditCompanyVideoPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { company } = await requireBusiness(slug);
  const video = await db.videoPost.findFirst({ where: { id, companyId: company.id } });
  if (!video || video.status === "REMOVED") notFound();
  const media = video.mediaId ? await db.media.findUnique({ where: { id: video.mediaId }, select: { originalName: true, durationSec: true, url: true } }) : null;
  return (
    <div className="space-y-6">
      <Link href={`/business/${company.slug}/videos`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
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
          productId: null,
          aspect: video.aspect,
          posterUrl: video.posterUrl,
          upload: media ? { name: media.originalName, durationSec: media.durationSec, url: media.url } : null,
        }}
        products={[]}
        action={saveCompanyVideo}
        companyId={company.id}
      />
    </div>
  );
}
