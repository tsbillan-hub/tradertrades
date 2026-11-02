import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { VideoForm } from "@/components/creator/video-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Post a video" };

type Props = { searchParams: Promise<{ product?: string }> };

export default async function NewVideoPage({ searchParams }: Props) {
  const user = await requireCreator();
  const { product } = await searchParams;
  const products = await db.product.findMany({
    where: { creatorId: user.id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  return (
    <div className="space-y-6">
      <Link href="/creator/videos" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Videos
      </Link>
      <PageHeader title="Post a video" description="It goes on your page straight away. Link it to a product and it shows there too." />
      <VideoForm video={null} products={products} defaultProductId={products.some((p) => p.id === product) ? product : undefined} />
    </div>
  );
}
