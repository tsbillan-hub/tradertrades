import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Download, Eye, Lock, PencilLine, PlayCircle } from "lucide-react";
import { db } from "@/lib/db";
import { currentPath } from "@/server/dal";
import { loadInside } from "@/server/inside";
import { setLessonDone } from "@/server/actions/content";
import { InsideShell } from "@/components/inside/shell";
import { LessonVideo } from "@/components/inside/lesson-video";
import { Markdown } from "@/components/ui/markdown";
import { VideoPlayer } from "@/components/video/player";
import { SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { insidePath, productPath } from "@/lib/paths";
import { cn, durationLabel } from "@/lib/utils";

type Props = { params: Promise<{ username: string; slug: string; lessonId: string }> };

async function load(productId: string, lessonId: string) {
  const [lesson, modules] = await Promise.all([
    db.lesson.findFirst({
      where: { id: lessonId, productId },
      include: { files: { orderBy: { position: "asc" }, include: { media: { select: { id: true, sizeBytes: true, originalName: true } } } } },
    }),
    db.courseModule.findMany({
      where: { productId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { lessons: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, durationSec: true, isPreview: true, kind: true } } },
    }),
  ]);
  return { lesson, modules };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug, lessonId } = await params;
  const ctx = await loadInside(username, slug);
  if (!ctx) return { title: "Lesson" };
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, productId: ctx.product.id }, select: { title: true, isPreview: true } });
  return { title: lesson ? `${lesson.title} · ${ctx.product.title}` : "Lesson", robots: { index: Boolean(lesson?.isPreview) } };
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function LessonPage({ params }: Props) {
  const { username, slug, lessonId } = await params;
  const ctx = await loadInside(username, slug);
  if (!ctx || ctx.product.type !== "COURSE") notFound();
  const { product, viewer } = ctx;
  const { lesson, modules } = await load(product.id, lessonId);
  if (!lesson) notFound();

  const preview = !ctx.hasAccess;
  if (preview) {
    // Free preview lessons are open to everyone while the course is on sale.
    if (!lesson.isPreview || product.status !== "PUBLISHED") {
      if (!viewer) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
      redirect(`${productPath(product.creator.username, product.slug)}?locked=1`);
    }
  }

  const flat = modules.flatMap((m) => m.lessons);
  const i = flat.findIndex((l) => l.id === lesson.id);
  const prev = i > 0 ? flat[i - 1] : null;
  const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  const base = insidePath(product.creator.username, product.slug);
  const lessonHref = (id: string) => `${base}/lesson/${id}`;

  const progress =
    viewer && !preview
      ? await db.lessonProgress.findMany({ where: { userId: viewer.id, productId: product.id }, select: { lessonId: true, completedAt: true, positionSec: true } })
      : [];
  const doneIds = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const mine = progress.find((p) => p.lessonId === lesson.id);
  const done = doneIds.has(lesson.id);
  const moduleOf = modules.find((m) => m.lessons.some((l) => l.id === lesson.id));
  const videoSrc = lesson.videoMediaId ? `/api/media/${lesson.videoMediaId}` : null;
  const media = lesson.videoMediaId ? await db.media.findUnique({ where: { id: lesson.videoMediaId }, select: { width: true, height: true } }) : null;
  const vertical = Boolean(media?.width && media?.height && media.height > media.width * 1.2);

  const body = (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
      <article className="min-w-0">
        {preview ? (
          <Notice tone="info" className="mb-4" title="Free preview" action={<Link href={productPath(product.creator.username, product.slug)} className="btn btn-primary btn-sm">Get the course</Link>}>
            This lesson is free to watch. The rest of {product.title} unlocks when you buy it.
          </Notice>
        ) : null}
        <div className="text-xs font-semibold text-muted">{moduleOf?.title}</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[24px] leading-tight sm:text-[28px]">{lesson.title}</h1>
          {ctx.canManage ? (
            <Link href={`${base}/manage/lesson/${lesson.id}`} className="btn btn-secondary btn-sm">
              <PencilLine /> Edit lesson
            </Link>
          ) : null}
        </div>

        <div className="mt-4">
          {videoSrc ? (
            <LessonVideo src={videoSrc} lessonId={lesson.id} startAt={mine?.positionSec ?? 0} vertical={vertical} title={lesson.title} track={Boolean(viewer) && !preview} />
          ) : lesson.embedUrl ? (
            <VideoPlayer embedUrl={lesson.embedUrl} title={lesson.title} />
          ) : null}
        </div>

        {lesson.body ? <Markdown className="mt-5 text-[15px] leading-relaxed">{lesson.body}</Markdown> : null}

        {lesson.files.length ? (
          <section className="mt-6">
            <h2 className="text-base">Files for this lesson</h2>
            <ul className="mt-2 space-y-1.5">
              {lesson.files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/media/${f.media.id}?download=1`} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-sm hover:bg-hover">
                    <Download className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
                    <span className="num shrink-0 text-xs text-faint">{size(f.media.sizeBytes)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!lesson.videoMediaId && !lesson.embedUrl && !lesson.body && !lesson.files.length ? (
          <p className="mt-6 text-sm text-muted">{ctx.canManage ? "This lesson is empty. Add a video, notes or files." : "This lesson is being put together."}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {prev ? (
            <Link href={lessonHref(prev.id)} className="btn btn-ghost">
              <ChevronLeft /> Previous
            </Link>
          ) : (
            <span />
          )}
          {!preview && viewer ? (
            <div className="flex flex-wrap items-center gap-2">
              {done ? (
                <form action={setLessonDone}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="done" value="0" />
                  <SubmitButton variant="ghost" size="md" className="text-up">
                    <CheckCircle2 /> Completed
                  </SubmitButton>
                </form>
              ) : (
                <form action={setLessonDone}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="done" value="1" />
                  {next ? <input type="hidden" name="next" value={lessonHref(next.id)} /> : null}
                  <SubmitButton size="md">
                    <CheckCircle2 /> {next ? "Complete and continue" : "Mark as complete"}
                  </SubmitButton>
                </form>
              )}
              {done && next ? (
                <Link href={lessonHref(next.id)} className="btn btn-primary">
                  Next lesson <ChevronRight />
                </Link>
              ) : null}
            </div>
          ) : next && (next.isPreview || !preview) ? (
            <Link href={lessonHref(next.id)} className="btn btn-primary">
              Next <ChevronRight />
            </Link>
          ) : null}
        </div>
      </article>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <div className="card max-h-[calc(100dvh-8rem)] overflow-y-auto p-3">
          {modules.map((m) => (
            <div key={m.id} className="mb-2 last:mb-0">
              <div className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted">{m.title}</div>
              <ul>
                {m.lessons.map((l) => {
                  const current = l.id === lesson.id;
                  const open = !preview || l.isPreview;
                  const icon = doneIds.has(l.id) ? (
                    <CheckCircle2 className="size-4 shrink-0 text-up" />
                  ) : !open ? (
                    <Lock className="size-4 shrink-0 text-faint" />
                  ) : current ? (
                    <PlayCircle className="size-4 shrink-0 text-accent-text" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-faint" />
                  );
                  const row = (
                    <>
                      {icon}
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {preview && l.isPreview ? <Eye className="size-3.5 shrink-0 text-muted" aria-label="Free preview" /> : null}
                      {l.durationSec ? <span className="num shrink-0 text-[11px] text-faint">{durationLabel(l.durationSec)}</span> : null}
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {open ? (
                        <Link
                          href={lessonHref(l.id)}
                          aria-current={current ? "page" : undefined}
                          className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-hover", current && "bg-hover font-semibold")}
                        >
                          {row}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted">{row}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );

  if (preview) {
    return (
      <div className="container-tt py-6 sm:py-8">
        <Link href={productPath(product.creator.username, product.slug)} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> {product.title}
        </Link>
        {body}
      </div>
    );
  }
  return <InsideShell ctx={ctx as typeof ctx & { viewer: NonNullable<typeof viewer> }}>{body}</InsideShell>;
}
