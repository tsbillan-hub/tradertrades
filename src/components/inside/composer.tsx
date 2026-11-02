"use client";

import { useState } from "react";
import { Film, Link2, Paperclip, X } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton, Textarea, useFormState } from "@/components/ui/form";
import { UploadButton, type Uploaded } from "@/components/ui/uploader";
import { createPost } from "@/server/actions/community";
import { Avatar } from "@/components/ui/avatar";

function FieldErr({ name }: { name: string }) {
  const { state } = useFormState();
  const err = state.fieldErrors?.[name]?.[0];
  return err ? <p className="field-error">{err}</p> : null;
}

/** Writing a post: text, up to 4 images, and for the creator, files and a members-only video. */
export function Composer({
  channelId,
  productId,
  me,
  isCreator,
  placeholder,
}: {
  channelId: string;
  productId: string;
  me: { displayName: string; avatarUrl: string | null };
  isCreator: boolean;
  placeholder: string;
}) {
  const [images, setImages] = useState<Uploaded[]>([]);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [video, setVideo] = useState<Uploaded | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [open, setOpen] = useState(false);

  const clear = () => {
    setImages([]);
    setFiles([]);
    setVideo(null);
    setShowLink(false);
    setOpen(false);
  };

  return (
    <ActionForm action={createPost} resetOnSuccess refreshOnSuccess onSuccess={clear} className="card p-4">
      <input type="hidden" name="channelId" value={channelId} />
      {images.map((m) => (
        <input key={m.id} type="hidden" name="imageIds" value={m.id} />
      ))}
      {files.map((m) => (
        <input key={m.id} type="hidden" name="fileIds" value={m.id} />
      ))}
      {video ? <input type="hidden" name="videoId" value={video.id} /> : null}

      <div className="flex gap-3">
        <Avatar src={me.avatarUrl} name={me.displayName} size={36} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <Textarea
            name="body"
            rows={open ? 4 : 2}
            maxLength={5000}
            placeholder={placeholder}
            aria-label="Write a post"
            onFocus={() => setOpen(true)}
            className="resize-y"
          />
          <FieldErr name="body" />

          {images.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((m) => (
                <div key={m.id} className="relative size-20 overflow-hidden rounded-lg ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImages((all) => all.filter((x) => x.id !== m.id))}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {files.length || video ? (
            <ul className="mt-3 space-y-1.5">
              {video ? (
                <li className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                  <Film className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{video.name}</span>
                  <button type="button" aria-label="Remove video" className="text-muted hover:text-down" onClick={() => setVideo(null)}>
                    <X className="size-4" />
                  </button>
                </li>
              ) : null}
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                  <Paperclip className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button type="button" aria-label="Remove file" className="text-muted hover:text-down" onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {showLink ? (
            <div className="mt-3">
              <input name="embedUrl" className="input" placeholder="YouTube, Vimeo or Loom link" aria-label="Video link" inputMode="url" />
              <FieldErr name="embedUrl" />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {images.length < 4 ? (
                <UploadButton
                  purpose="post"
                  productId={productId}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  label="Photo"
                  variant="ghost"
                  onUploaded={(u) => {
                    setOpen(true);
                    setImages((all) => [...all, u].slice(0, 4));
                  }}
                />
              ) : null}
              {!showLink ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLink(true)}>
                  <Link2 /> Video link
                </button>
              ) : null}
              {isCreator && files.length < 5 ? (
                <UploadButton
                  purpose="file"
                  productId={productId}
                  label="File"
                  variant="ghost"
                  onUploaded={(u) => {
                    setOpen(true);
                    setFiles((all) => [...all, u]);
                  }}
                />
              ) : null}
              {isCreator && !video ? (
                <UploadButton
                  purpose="lesson"
                  productId={productId}
                  accept="video/mp4,video/webm,video/quicktime"
                  label="Video"
                  variant="ghost"
                  video
                  onUploaded={(u) => {
                    setOpen(true);
                    setVideo(u);
                  }}
                />
              ) : null}
            </div>
            <SubmitButton pendingText="Posting...">Post</SubmitButton>
          </div>
          <FormMessage hideSuccess className="mt-3" />
        </div>
      </div>
    </ActionForm>
  );
}
