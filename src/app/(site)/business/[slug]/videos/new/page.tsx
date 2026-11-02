import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireBusiness } from "@/server/dal";
import { saveCompanyVideo } from "@/server/actions/business";
import { VideoForm } from "@/components/creator/video-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Post a video" };

export default async function NewCompanyVideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  return (
    <div className="space-y-6">
      <Link href={`/business/${company.slug}/videos`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Videos
      </Link>
      <PageHeader title="Post a video" description={`It plays on ${company.name}'s listing straight away.`} />
      <VideoForm video={null} products={[]} action={saveCompanyVideo} companyId={company.id} />
    </div>
  );
}
