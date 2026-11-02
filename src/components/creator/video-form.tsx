"use client";

import { useState } from "react";
import { Film, ImagePlus, Link2, Upload, X } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { UploadButton } from "@/components/ui/uploader";
import { saveVideo } from "@/server/actions/videos";
import { cn, durationLabel } from "@/lib/utils";
import type { ActionState } from "@/lib/forms";

export type VideoFormData = {
  id: string;
  title: string;
  description: string | null;
  embedUrl: string | null;
  productId: string | null;
  aspect: string;
  posterUrl: string | null;
  upload: { name: string; durationSec: number | null; url: string | null } | null;
};

type Picked = { id: string; name: string; url: string; durationSec?: number; width?: number; height?: number };

function shapeOf(width?: number, height?: number) {
  if (!width || !height) return null;
  const r = width / height;
  return r < 0.8 ? "Vertical (9:16)" : r < 1.2 ? "Square" : "Wide (16:9)";
}

/**
 * Post or edit a video: upload a file (any shape, vertical is fine) or paste a YouTube, Vimeo or Loom link.
 * Creators post to their page (and optionally a product); a company's team posts to its directory listing.
 */
export function VideoForm({
  video,
  products,
  defaultProductId,
  action = saveVideo,
  companyId,
}: {
  video: VideoFormData | null;
  products: { id: string; title: string }[];
  defaultProductId?: string;
  action?: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  companyId?: string;
}) {
  const [source, setSource] = useState<"upload" | "link">(video?.embedUrl ? "link" : "upload");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [poster, setPoster] = useState<{ id: string | null; url: string | null }>({ id: null, url: video?.posterUrl ?? null });
  const current = video?.upload ?? null;
  const shownName = picked?.name ?? current?.name ?? null;
  const shownDuration = picked?.durationSec ?? current?.durationSec ?? null;

  return (
    <ActionForm action={action} toastOnSuccess refreshOnSuccess className="space-y-6">
      {companyId ? <input type="hidden" name="companyId" value={companyId} /> : null}
      {video ? <input type="hidden" name="videoId" value={video.id} /> : null}
      <input type="hidden" name="mediaId" value={source === "upload" ? (picked?.id ?? "") : ""} />
      <input type="hidden" name="posterMediaId" value={poster.id ?? ""} />

      <section className="card p-5">
        <h2 className="text-lg">The video</h2>
        <div className="mt-3 inline-flex rounded-lg border border-line bg-sunk p-0.5" role="tablist" aria-label="Video source">
          {(
            [
              { k: "upload", label: "Upload a file", icon: <Upload className="size-4" /> },
              { k: "link", label: "Paste a link", icon: <Link2 className="size-4" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={source === t.k}
              onClick={() => setSource(t.k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold",
                source === t.k ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {source === "upload" ? (
          <div className="mt-4 space-y-3">
            {shownName ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-sm">
                <Film className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{shownName}</span>
                {picked ? <span className="text-xs text-muted">{shapeOf(picked.width, picked.height)}</span> : null}
                {shownDuration ? <span className="num text-xs text-faint">{durationLabel(shownDuration)}</span> : null}
                {picked ? (
                  <button type="button" className="text-muted hover:text-down" aria-label="Remove this upload" onClick={() => setPicked(null)}>
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {picked ? (
              // A quick look before posting. Vertical videos keep their shape.
              <video
                src={picked.url}
                controls
                playsInline
                preload="metadata"
                className={cn("rounded-xl bg-black ring-1 ring-line", picked.height && picked.width && picked.height > picked.width ? "max-h-[420px]" : "w-full max-w-xl")}
              />
            ) : null}
            <UploadButton
              purpose="video"
              accept="video/mp4,video/webm,video/quicktime"
              label={shownName ? "Upload a different video" : "Choose a video"}
              variant={shownName ? "secondary" : "primary"}
              video
              onUploaded={(u) => {
                setPicked({ id: u.id, name: u.name, url: u.url, durationSec: u.durationSec, width: u.width, height: u.height });
                if (u.poster && !poster.id) setPoster({ id: u.poster.id, url: u.poster.url });
              }}
            />
            <p className="hint">MP4, MOV or WebM, up to 2 GB. Phone videos (9:16) play in a phone-shaped frame, no cropping.</p>
          </div>
        ) : (
          <div className="mt-4">
            <Field label="Video link" name="embedUrl" hint="YouTube (including Shorts), Vimeo or Loom.">
              <Input name="embedUrl" defaultValue={video?.embedUrl ?? ""} placeholder="https://www.youtube.com/watch?v=..." inputMode="url" />
            </Field>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg">Details</h2>
        <Field label="Title" name="title">
          <Input name="title" defaultValue={video?.title ?? ""} maxLength={120} placeholder={companyId ? "How our evaluation works, step by step" : "How I mark my levels before the open"} />
        </Field>
        <Field label="Description" name="description" optional hint="Same rules as listings: no profit promises or guaranteed results.">
          <Textarea name="description" rows={4} maxLength={3000} defaultValue={video?.description ?? ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {companyId ? null : (
            <Field label="Show it on a product too" name="productId" optional hint="It also appears on that product's page.">
              <Select name="productId" defaultValue={video?.productId ?? defaultProductId ?? ""}>
                <option value="">Only on my page</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Shape" name="aspect" hint="Auto reads it from the file.">
            <Select name="aspect" defaultValue={video ? video.aspect : "auto"}>
              <option value="auto">Auto</option>
              <option value="9:16">Vertical (9:16)</option>
              <option value="16:9">Wide (16:9)</option>
              <option value="1:1">Square</option>
            </Select>
          </Field>
        </div>

        <div>
          <div className="label">Thumbnail</div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-24 w-40 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunk ring-1 ring-line">
              {poster.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster.url} alt="Video thumbnail" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="size-5 text-faint" />
              )}
            </div>
            <div className="space-y-1.5">
              <UploadButton
                purpose="poster"
                accept="image/jpeg,image/png,image/webp"
                label={poster.url ? "Change thumbnail" : "Upload thumbnail"}
                onUploaded={(u) => setPoster({ id: u.id, url: u.url })}
              />
              <p className="hint">We grab a frame from your upload, or use the YouTube one. Upload your own to change it.</p>
            </div>
          </div>
        </div>
      </section>

      <FormMessage hideSuccess />
      <div className="flex justify-end">
        <SubmitButton size="lg">{video ? "Save changes" : "Post video"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
