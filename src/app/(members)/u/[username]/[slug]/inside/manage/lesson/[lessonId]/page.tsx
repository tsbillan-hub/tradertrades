import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye, Paperclip, PencilLine, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireManage } from "@/server/inside";
import { deleteFile, deleteLesson, moveFile, renameFile, saveLesson } from "@/server/actions/content";
import { InsideShell } from "@/components/inside/shell";
import { FileAdder, LessonVideoField } from "@/components/inside/manage-client";
import { MoveButtons } from "@/components/inside/manage-bits";
import { ActionButton, ActionForm, Field, FieldError, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { insidePath } from "@/lib/paths";

type Props = { params: Promise<{ username: string; slug: string; lessonId: string }> };

export const metadata: Metadata = { title: "Edit lesson", robots: { index: false } };

const KINDS = [
  { v: "VIDEO", label: "Video", text: "A video with optional notes and files." },
  { v: "TEXT", label: "Reading", text: "Written notes, a checklist or a write-up." },
  { v: "FILE", label: "Download", text: "Mainly files to download, like a PDF or template." },
] as const;

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function EditLessonPage({ params }: Props) {
  const { username, slug, lessonId } = await params;
  const ctx = await requireManage(username, slug);
  const { product } = ctx;
  if (product.type !== "COURSE") notFound();
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, productId: product.id },
    include: {
      module: { select: { title: true } },
      files: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { media: { select: { sizeBytes: true, originalName: true } } } },
    },
  });
  if (!lesson) notFound();
  const video = lesson.videoMediaId
    ? await db.media.findUnique({ where: { id: lesson.videoMediaId }, select: { id: true, originalName: true, durationSec: true } })
    : null;
  const base = insidePath(product.creator.username, product.slug);

  return (
    <InsideShell ctx={ctx}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/manage?tab=lessons`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> All lessons
        </Link>
        <Link href={`${base}/lesson/${lesson.id}`} className="btn btn-secondary btn-sm">
          <Eye /> View as a student
        </Link>
      </div>
      <div className="text-xs font-semibold text-muted">{lesson.module.title}</div>
      <h1 className="mt-1 text-[24px] leading-tight sm:text-[28px]">{lesson.title}</h1>

      <section className="card mt-5 p-5">
        <ActionForm action={saveLesson} refreshOnSuccess toastOnSuccess className="space-y-5">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <Field label="Title" name="title">
            <Input name="title" defaultValue={lesson.title} maxLength={120} />
          </Field>

          <fieldset>
            <legend className="label">What it is</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => (
                <label key={k.v} className="tile">
                  <input type="radio" name="kind" value={k.v} defaultChecked={lesson.kind === k.v} className="checkbox radio mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold">{k.label}</span>
                    <span className="block text-xs text-muted">{k.text}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError name="kind" />
          </fieldset>

          <div>
            <div className="label">Video</div>
            <LessonVideoField productId={product.id} current={video ? { id: video.id, name: video.originalName, durationSec: video.durationSec } : null} />
          </div>
          <Field label="Or a video link" name="embedUrl" optional hint="YouTube (unlisted works), Vimeo or Loom. Ignored if you upload a video.">
            <Input name="embedUrl" defaultValue={lesson.embedUrl ?? ""} placeholder="https://" inputMode="url" />
          </Field>

          <Field label="Notes" name="body" optional hint="Shown under the video. You can use **bold**, lists and links.">
            <Textarea name="body" rows={10} maxLength={20000} defaultValue={lesson.body ?? ""} placeholder={"What this lesson covers\n\n- Key point one\n- Key point two"} />
          </Field>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="isPreview" defaultChecked={lesson.isPreview} className="checkbox mt-0.5" />
            <span>
              <span className="block text-sm font-semibold">Free preview</span>
              <span className="block text-xs text-muted">Anyone can watch this lesson from your listing before buying. Good for your first lesson.</span>
            </span>
          </label>

          <FormMessage hideSuccess />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <SubmitButton>Save lesson</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg">Files for this lesson</h2>
            <p className="mt-0.5 text-sm text-muted">Worksheets, chart templates, slides. Only students can download them.</p>
          </div>
          <FileAdder productId={product.id} lessonId={lesson.id} />
        </div>
        {lesson.files.length ? (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {lesson.files.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Paperclip className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.label}</div>
                  <div className="truncate text-xs text-faint">
                    {f.media.originalName} · {size(f.media.sizeBytes)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <MoveButtons action={moveFile} field="fileId" id={f.id} first={i === 0} last={i === lesson.files.length - 1} />
                  <ModalButton iconOnly label={<PencilLine />} title="Rename file" variant="ghost" className="btn-sm btn-icon">
                    <ActionForm action={renameFile} refreshOnSuccess className="space-y-4">
                      <input type="hidden" name="fileId" value={f.id} />
                      <Field label="Name students see" name="label">
                        <Input name="label" defaultValue={f.label} maxLength={120} />
                      </Field>
                      <FormMessage />
                      <div className="flex justify-end">
                        <SubmitButton>Save</SubmitButton>
                      </div>
                    </ActionForm>
                  </ModalButton>
                  <ActionButton action={deleteFile} fields={{ fileId: f.id }} variant="ghost" className="btn-icon" title="Delete" confirm={`Delete ${f.label}?`}>
                    <Trash2 />
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No files on this lesson.</p>
        )}
      </section>

      <div className="mt-6 flex justify-end">
        <ActionButton
          action={deleteLesson}
          fields={{ lessonId: lesson.id }}
          variant="danger"
          size="md"
          confirm={`Delete "${lesson.title}"? Its video, files and everyone's progress on it are deleted too. This can't be undone.`}
        >
          <Trash2 /> Delete lesson
        </ActionButton>
      </div>
    </InsideShell>
  );
}
