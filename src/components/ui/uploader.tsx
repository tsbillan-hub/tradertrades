"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { ImagePlus, LoaderCircle, Paperclip, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

export type Uploaded = { id: string; url: string; kind: "IMAGE" | "VIDEO" | "FILE"; name: string; size: number; durationSec?: number; width?: number; height?: number };
export type UploadPurpose = "avatar" | "banner" | "cover" | "poster" | "video" | "lesson" | "file" | "document" | "proof" | "post";

const UploadCtx = createContext<{ blob: boolean; userId: string | null }>({ blob: false, userId: null });

export function UploadConfig({ blob, userId, children }: { blob: boolean; userId: string | null; children: ReactNode }) {
  return <UploadCtx.Provider value={{ blob, userId }}>{children}</UploadCtx.Provider>;
}

const RESIZE: Partial<Record<UploadPurpose, number>> = { avatar: 512, banner: 2000, cover: 1600, poster: 1600, post: 1800 };

async function maybeResize(file: File, purpose: UploadPurpose): Promise<File> {
  const max = RESIZE[purpose];
  if (!max || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
}

/** Reads duration, size and a thumbnail frame from a video file in the browser. */
export async function inspectVideo(file: File): Promise<{ durationSec?: number; width?: number; height?: number; poster?: File }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const done = (out: Awaited<ReturnType<typeof inspectVideo>>) => {
      URL.revokeObjectURL(url);
      resolve(out);
    };
    v.onerror = () => done({});
    v.onloadedmetadata = () => {
      const durationSec = Number.isFinite(v.duration) ? Math.round(v.duration) : undefined;
      const width = v.videoWidth || undefined;
      const height = v.videoHeight || undefined;
      v.currentTime = Math.min(2, (v.duration || 4) / 4);
      v.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (b) => done({ durationSec, width, height, poster: b ? new File([b], "poster.jpg", { type: "image/jpeg" }) : undefined }),
            "image/jpeg",
            0.82,
          );
        } catch {
          done({ durationSec, width, height });
        }
      };
    };
  });
}

function xhrUpload(url: string, file: File, onProgress: (pct: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error ?? "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

export function useUploader(purpose: UploadPurpose, productId?: string) {
  const { blob, userId } = useContext(UploadCtx);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(input: File, meta?: { width?: number; height?: number; durationSec?: number }): Promise<Uploaded> {
    const file = await maybeResize(input, purpose);
    setProgress(0);
    try {
      if (!blob) {
        const qs = new URLSearchParams({ purpose, name: file.name });
        if (productId) qs.set("productId", productId);
        if (meta?.width) qs.set("width", String(meta.width));
        if (meta?.height) qs.set("height", String(meta.height));
        if (meta?.durationSec) qs.set("duration", String(meta.durationSec));
        return await xhrUpload(`/api/upload?${qs}`, file, setProgress);
      }
      const { upload: blobUpload } = await import("@vercel/blob/client");
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const pathname = `u/${new Date().toISOString().slice(0, 7)}/${userId}/${safe}`;
      const access = purpose === "lesson" || purpose === "file" || purpose === "document" || purpose === "proof" || purpose === "post" ? "private" : "public";
      const res = await blobUpload(pathname, file, {
        access,
        handleUploadUrl: "/api/upload/blob",
        clientPayload: JSON.stringify({ purpose, productId }),
        multipart: file.size > 50 * 1024 * 1024,
        contentType: file.type,
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      const done = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: res.url, pathname: res.pathname, purpose, name: file.name, productId, width: meta?.width, height: meta?.height, duration: meta?.durationSec }),
      });
      const data = await done.json();
      if (!done.ok) throw new Error(data.error ?? "Upload failed");
      return data;
    } finally {
      setProgress(null);
    }
  }
  return { upload, progress, busy: progress !== null };
}

/** Image picker that stores the uploaded URL in a hidden input, for use inside normal forms. */
export function ImageField({
  name,
  defaultUrl,
  purpose,
  shape = "square",
  label = "Upload image",
  hint,
}: {
  name: string;
  defaultUrl?: string | null;
  purpose: "avatar" | "banner" | "cover" | "poster";
  shape?: "circle" | "square" | "wide";
  label?: string;
  hint?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress, busy } = useUploader(purpose);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name={name} value={url} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "group relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-line-strong bg-sunk text-faint hover:border-muted",
          shape === "circle" && "size-20 rounded-full",
          shape === "square" && "size-20 rounded-xl",
          shape === "wide" && "aspect-[16/9] w-56 rounded-xl",
        )}
        aria-label={label}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <ImagePlus className="size-5" />
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-semibold text-white">{progress}%</span>
        ) : null}
      </button>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
            {url ? "Replace" : label}
          </button>
          {url ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUrl("")}>
              <Trash2 /> Remove
            </button>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const res = await upload(f);
            setUrl(res.url);
          } catch (err) {
            toast(err instanceof Error ? err.message : "Upload failed", "error");
          }
        }}
      />
    </div>
  );
}

/** A button that uploads any file and hands back the result. */
export function UploadButton({
  purpose,
  productId,
  accept,
  label = "Upload file",
  onUploaded,
  className,
  variant = "secondary",
  video,
}: {
  purpose: UploadPurpose;
  productId?: string;
  accept?: string;
  label?: string;
  onUploaded: (u: Uploaded & { poster?: Uploaded }) => void;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  video?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress, busy } = useUploader(purpose, productId);
  const posterUploader = useUploader("poster");
  return (
    <>
      <button type="button" className={cn("btn btn-sm", `btn-${variant}`, className)} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderCircle className="animate-spin" /> : video ? <Upload /> : <Paperclip />}
        {busy ? `Uploading ${progress ?? 0}%` : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            if (video || f.type.startsWith("video/")) {
              const info = await inspectVideo(f);
              const res = await upload(f, { durationSec: info.durationSec, width: info.width, height: info.height });
              let poster: Uploaded | undefined;
              if (info.poster) poster = await posterUploader.upload(info.poster).catch(() => undefined);
              onUploaded({ ...res, durationSec: info.durationSec, width: info.width, height: info.height, poster });
            } else {
              onUploaded(await upload(f));
            }
          } catch (err) {
            toast(err instanceof Error ? err.message : "Upload failed", "error");
          }
        }}
      />
    </>
  );
}

/** Uploads one or more files and keeps their ids in hidden inputs named `name`. */
export function FilesField({
  name,
  purpose,
  productId,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  label = "Add file",
  max = 5,
}: {
  name: string;
  purpose: UploadPurpose;
  productId?: string;
  accept?: string;
  label?: string;
  max?: number;
}) {
  const [files, setFiles] = useState<Uploaded[]>([]);
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
          <input type="hidden" name={name} value={f.id} />
          <Paperclip className="size-4 text-muted" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="num text-xs text-faint">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" className="text-muted hover:text-down" aria-label="Remove" onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {files.length < max ? <UploadButton purpose={purpose} productId={productId} accept={accept} label={label} onUploaded={(u) => setFiles((all) => [...all, u])} /> : null}
    </div>
  );
}
