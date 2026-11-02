import type { Metadata } from "next";
import Link from "next/link";
import { Eye, EyeOff, Film, PencilLine, Play, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { cn, durationLabel, formatDate, plural, youtubeThumb } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { deleteCompanyVideo, toggleCompanyVideo } from "@/server/actions/business";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Videos" };

export default async function BusinessVideosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  const base = `/business/${company.slug}`;
  const videos = await db.videoPost.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Videos"
        description="Walkthroughs and explainers that play on your listing. The same rules as everywhere: no profit promises or guaranteed results."
        actions={
          <Link href={`${base}/videos/new`} className="btn btn-primary">
            <Plus /> Post a video
          </Link>
        }
      />
      {videos.length ? (
        <ul className="card divide-y divide-line">
          {videos.map((v) => {
            const thumb = v.posterUrl ?? youtubeThumb(v.embedUrl);
            const removed = v.status === "REMOVED";
            const hidden = v.status === "HIDDEN" || removed;
            return (
              <li key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link href={`/v/${v.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className={cn("relative w-28 shrink-0 overflow-hidden rounded-lg bg-[#16130F] ring-1 ring-line", hidden && "opacity-50")}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center text-white/60">
                        <Play className="size-5" />
                      </div>
                    )}
                    {v.durationSec ? (
                      <span className="num absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">{durationLabel(v.durationSec)}</span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{v.title}</span>
                      {removed ? <span className="badge badge-bad">Taken down by our team</span> : hidden ? <span className="badge badge-outline">Hidden</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {plural(v.views, "view")} · {formatDate(v.createdAt)}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {removed ? null : (
                    <>
                      <Link href={`${base}/videos/${v.id}`} className="btn btn-secondary btn-sm">
                        <PencilLine /> Edit
                      </Link>
                      <ActionButton action={toggleCompanyVideo} fields={{ videoId: v.id }} variant="ghost">
                        {hidden ? <Eye /> : <EyeOff />} {hidden ? "Show" : "Hide"}
                      </ActionButton>
                    </>
                  )}
                  <ActionButton action={deleteCompanyVideo} fields={{ videoId: v.id }} variant="ghost" confirm="Delete this video for good?">
                    <Trash2 /> Delete
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Film />}
          title="No videos yet"
          description="A short walkthrough of how your product works helps traders decide. Upload a file or paste a YouTube, Vimeo or Loom link."
          action={
            <Link href={`${base}/videos/new`} className="btn btn-primary">
              <Plus /> Post a video
            </Link>
          }
        />
      )}
    </div>
  );
}
