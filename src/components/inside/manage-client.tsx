"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Film, X } from "lucide-react";
import { UploadButton } from "@/components/ui/uploader";
import { toast } from "@/components/ui/toaster";
import { addFile } from "@/server/actions/content";
import { initialState } from "@/lib/forms";
import { durationLabel } from "@/lib/utils";

/** Uploads a file and attaches it to a product (or one lesson) straight away. */
export function FileAdder({ productId, lessonId, label = "Upload a file" }: { productId: string; lessonId?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <UploadButton
      purpose="file"
      productId={productId}
      label={pending ? "Adding..." : label}
      variant="primary"
      onUploaded={(u) =>
        start(async () => {
          const fd = new FormData();
          fd.set("productId", productId);
          fd.set("mediaId", u.id);
          fd.set("label", u.name.replace(/\.[a-z0-9]{1,5}$/i, ""));
          if (lessonId) fd.set("lessonId", lessonId);
          const res = await addFile(initialState, fd);
          if (res.ok) {
            toast(res.message ?? "File added.", "success");
            router.refresh();
          } else toast(res.error ?? "Couldn't add the file.", "error");
        })
      }
    />
  );
}

/** The video part of the lesson form: upload a file, keep or remove the current one. */
export function LessonVideoField({ productId, current }: { productId: string; current: { id: string; name: string; durationSec: number | null } | null }) {
  const [video, setVideo] = useState(current);
  return (
    <div>
      <input type="hidden" name="videoMediaId" value={video?.id ?? ""} />
      <input type="hidden" name="durationSec" value={video?.durationSec ?? ""} />
      {video ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-sm">
          <Film className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-medium">{video.name}</span>
          {video.durationSec ? <span className="num text-xs text-faint">{durationLabel(video.durationSec)}</span> : null}
          <button type="button" className="text-muted hover:text-down" aria-label="Remove video" onClick={() => setVideo(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <UploadButton
          purpose="lesson"
          productId={productId}
          accept="video/mp4,video/webm,video/quicktime"
          label="Upload a video"
          video
          onUploaded={(u) => setVideo({ id: u.id, name: u.name, durationSec: u.durationSec ?? null })}
        />
      )}
      <p className="hint">MP4 works everywhere. Up to 4 GB. Only buyers can watch it (and anyone, if you make this lesson a free preview).</p>
    </div>
  );
}
