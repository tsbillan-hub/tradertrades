import type { Metadata } from "next";
import Link from "next/link";
import { Eye, EyeOff, Film, PencilLine, Pin, Play, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { deleteVideo, setVideoHidden } from "@/server/actions/videos";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn, durationLabel, formatDate, plural, youtubeThumb } from "@/lib/utils";

export const metadata: Metadata = { title: "Your videos" };

export default async function CreatorVideosPage() {
  const user = await requireCreator();
  const videos = await db.videoPost.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { title: true } } },
  });
  const pinnedId = user.creator.pinnedVideoId ?? videos.find((v) => v.status === "PUBLISHED")?.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Videos"
        description="Videos sit on your page and on the products you link them to. There's no endless feed: people find them when they look at you."
        actions={
          <Link href="/creator/videos/new" className="btn btn-primary">
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
                      {removed ? (
                        <span className="badge badge-bad">Taken down by our team</span>
                      ) : hidden ? (
                        <span className="badge badge-outline">Hidden</span>
                      ) : null}
                      {!hidden && v.id === pinnedId ? (
                        <span className="badge badge-outline">
                          <Pin className="size-3" /> Pinned
                        </span>
                      ) : null}
                      {v.aspect === "9:16" ? <span className="badge badge-outline">Vertical</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {plural(v.views, "view")} · {formatDate(v.createdAt)}
                      {v.product ? ` · on ${v.product.title}` : ""}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={`/creator/videos/${v.id}`} className="btn btn-secondary btn-sm">
                    <PencilLine /> Edit
                  </Link>
                  {removed ? null : (
                    <ActionButton action={setVideoHidden} fields={{ videoId: v.id }} variant="ghost" title={hidden ? "Show on my page" : "Hide from my page"}>
                      {hidden ? <Eye /> : <EyeOff />}
                      {hidden ? "Show" : "Hide"}
                    </ActionButton>
                  )}
                  <ActionButton action={deleteVideo} fields={{ videoId: v.id }} variant="ghost" className="btn-icon" title="Delete video" confirm={`Delete "${v.title}"? This can't be undone.`}>
                    <Trash2 />
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
          description="A walkthrough of your setup, a trade review or a tour of your community. Phone videos work great."
          action={
            <Link href="/creator/videos/new" className="btn btn-primary">
              Post your first video
            </Link>
          }
        />
      )}
      {videos.length ? (
        <p className="text-sm text-muted">
          {plural(videos.filter((v) => v.status === "PUBLISHED").length, "video")} on your page. Change which one is pinned at the top in{" "}
          <Link href="/creator/settings" className="link">
            Settings
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
