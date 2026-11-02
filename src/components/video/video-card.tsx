import Link from "next/link";
import { Play } from "lucide-react";
import { cn, durationLabel, timeAgo, youtubeThumb } from "@/lib/utils";

export type VideoCardData = {
  id: string;
  title: string;
  posterUrl: string | null;
  embedUrl: string | null;
  durationSec: number | null;
  aspect: string;
  views: number;
  createdAt: Date;
  isSample?: boolean;
};

export function VideoCard({ video, className }: { video: VideoCardData; className?: string }) {
  const thumb = video.posterUrl ?? youtubeThumb(video.embedUrl);
  const vertical = video.aspect === "9:16";
  return (
    <Link href={`/v/${video.id}`} className={cn("group block", className)}>
      <div className={cn("relative overflow-hidden rounded-xl bg-[#16130F] ring-1 ring-line", vertical ? "aspect-[4/5]" : "aspect-video")}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,#2c271f,#16130f)]" />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play className="ml-0.5 size-5" fill="currentColor" />
          </span>
        </span>
        {video.durationSec ? (
          <span className="num absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{durationLabel(video.durationSec)}</span>
        ) : null}
        {vertical ? <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Vertical</span> : null}
      </div>
      <div className="mt-2.5 line-clamp-2 text-sm leading-snug font-semibold text-ink group-hover:underline">{video.title}</div>
      <div className="mt-0.5 text-xs text-muted">
        {video.views.toLocaleString()} views · {timeAgo(video.createdAt)}
      </div>
    </Link>
  );
}
