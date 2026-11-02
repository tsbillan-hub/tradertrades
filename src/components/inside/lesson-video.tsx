"use client";

import { useRef } from "react";
import { saveLessonPosition } from "@/server/actions/content";
import { cn } from "@/lib/utils";

/** An uploaded lesson video that picks up where the member left off. */
export function LessonVideo({ src, lessonId, startAt, vertical, title, track }: { src: string; lessonId: string; startAt: number; vertical?: boolean; title: string; track: boolean }) {
  const lastSaved = useRef(0);
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black ring-1 ring-line", vertical ? "mx-auto aspect-[9/16] max-h-[78vh] w-auto" : "aspect-video w-full")}>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        aria-label={title}
        className="absolute inset-0 h-full w-full object-contain"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          // Resume, unless they were basically at the end.
          if (startAt > 5 && startAt < (v.duration || Infinity) - 10) v.currentTime = startAt;
        }}
        onTimeUpdate={(e) => {
          if (!track) return;
          const t = e.currentTarget.currentTime;
          if (Math.abs(t - lastSaved.current) < 15) return;
          lastSaved.current = t;
          void saveLessonPosition(lessonId, t);
        }}
        onPause={(e) => {
          if (!track) return;
          lastSaved.current = e.currentTarget.currentTime;
          void saveLessonPosition(lessonId, e.currentTarget.currentTime);
        }}
      />
    </div>
  );
}
