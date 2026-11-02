import { toEmbedUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Plays an uploaded file or a YouTube/Vimeo link. Vertical videos get a phone-shaped frame. */
export function VideoPlayer({
  src,
  embedUrl,
  poster,
  title,
  aspect = "16:9",
  className,
  autoPlay,
}: {
  src?: string | null;
  embedUrl?: string | null;
  poster?: string | null;
  title: string;
  aspect?: string;
  className?: string;
  autoPlay?: boolean;
}) {
  const vertical = aspect === "9:16";
  const frame = cn(
    "relative overflow-hidden rounded-xl bg-black ring-1 ring-line",
    vertical ? "mx-auto aspect-[9/16] max-h-[78vh] w-auto" : "aspect-video w-full",
    className,
  );
  const embed = toEmbedUrl(embedUrl);
  if (embed) {
    return (
      <div className={frame}>
        <iframe
          src={embed}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (!src) {
    return <div className={cn(frame, "grid place-items-center text-sm text-white/60")}>Video unavailable</div>;
  }
  return (
    <div className={frame}>
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        controlsList="nodownload"
        className="absolute inset-0 h-full w-full object-contain"
        aria-label={title}
      />
    </div>
  );
}
