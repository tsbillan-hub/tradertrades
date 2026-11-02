import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CalendarPlus, CheckCircle2, Circle, Download, Eye, FileDown, LineChart, PlayCircle, Settings2, Ticket, Video } from "lucide-react";
import { db } from "@/lib/db";
import { loadInside, requireInside, type InsideCtx } from "@/server/inside";
import { requestIndicatorAccess } from "@/server/actions/content";
import { InsideHeader, InsideShell } from "@/components/inside/shell";
import { MessageButton } from "@/components/message-button";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { EmptyState, Notice } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { VideoPlayer } from "@/components/video/player";
import { formatWhen } from "@/lib/time";
import { insidePath } from "@/lib/paths";
import { cn, durationLabel, formatDate, minutesLabel, msSince, plural, toEmbedUrl } from "@/lib/utils";

type Props = { params: Promise<{ username: string; slug: string }> };
type Ctx = InsideCtx & { viewer: NonNullable<InsideCtx["viewer"]> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params;
  const ctx = await loadInside(username, slug);
  return { title: ctx ? ctx.product.title : "Members area", robots: { index: false } };
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ManageLink({ ctx, tab, label }: { ctx: Ctx; tab: string; label: string }) {
  if (!ctx.canManage) return null;
  return (
    <Link href={insidePath(ctx.product.creator.username, ctx.product.slug, `/manage?tab=${tab}`)} className="btn btn-secondary btn-sm">
      <Settings2 /> {label}
    </Link>
  );
}

async function FilesList({ ctx }: { ctx: Ctx }) {
  const files = await db.productFile.findMany({
    where: { productId: ctx.product.id, lessonId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { media: { select: { id: true, sizeBytes: true, mimeType: true } } },
  });
  if (!files.length) {
    return (
      <EmptyState
        icon={<FileDown />}
        title="No files yet"
        description={ctx.canManage ? "Upload the files buyers get." : `${ctx.product.creator.displayName} is adding the files. You'll be able to download them here.`}
        action={<ManageLink ctx={ctx} tab="files" label="Add files" />}
      />
    );
  }
  return (
    <ul className="card divide-y divide-line">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sunk text-muted">
            <FileDown className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{f.label}</div>
            <div className="num text-xs text-faint">{size(f.media.sizeBytes)}</div>
          </div>
          <a href={`/api/media/${f.media.id}?download=1`} className="btn btn-secondary btn-sm shrink-0">
            <Download /> Download
          </a>
        </li>
      ))}
    </ul>
  );
}

async function CourseHome({ ctx }: { ctx: Ctx }) {
  const { product, viewer } = ctx;
  const [modules, progress] = await Promise.all([
    db.courseModule.findMany({
      where: { productId: product.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { lessons: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, durationSec: true, isPreview: true } } },
    }),
    db.lessonProgress.findMany({ where: { userId: viewer.id, productId: product.id, completedAt: { not: null } }, select: { lessonId: true } }),
  ]);
  const done = new Set(progress.map((p) => p.lessonId));
  const flat = modules.flatMap((m) => m.lessons);
  const total = flat.length;
  const pct = total ? Math.round((done.size / total) * 100) : 0;
  const nextLesson = flat.find((l) => !done.has(l.id)) ?? flat[0];
  const base = insidePath(product.creator.username, product.slug);
  const minutes = Math.round(flat.reduce((n, l) => n + (l.durationSec ?? 0), 0) / 60);

  return (
    <>
      <InsideHeader
        icon={<BookOpen />}
        title={product.title}
        description={`${plural(modules.length, "module")} · ${plural(total, "lesson")}${minutes ? ` · ${minutesLabel(minutes)}` : ""}`}
        actions={<ManageLink ctx={ctx} tab="lessons" label="Edit lessons" />}
      />
      {total ? (
        <div className="card mb-6 flex flex-wrap items-center gap-5 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{pct === 100 ? "You finished the course" : pct ? "Keep going" : "Start the course"}</span>
              <span className="num text-muted">
                {done.size} of {total} done
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
              <div className="h-full rounded-full bg-up transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {nextLesson ? (
            <Link href={`${base}/lesson/${nextLesson.id}`} className="btn btn-primary">
              <PlayCircle /> {pct ? (pct === 100 ? "Watch again" : "Continue") : "Start"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {modules.length ? (
        <div className="space-y-4">
          {modules.map((m, mi) => (
            <section key={m.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-sunk/60 px-4 py-3">
                <h2 className="text-base">
                  <span className="mr-2 text-muted">{mi + 1}.</span>
                  {m.title}
                </h2>
                <span className="text-xs text-muted">
                  {m.lessons.filter((l) => done.has(l.id)).length}/{m.lessons.length}
                </span>
              </div>
              {m.lessons.length ? (
                <ul className="divide-y divide-line">
                  {m.lessons.map((l) => (
                    <li key={l.id}>
                      <Link href={`${base}/lesson/${l.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-hover">
                        {done.has(l.id) ? <CheckCircle2 className="size-5 shrink-0 text-up" /> : <Circle className="size-5 shrink-0 text-faint" />}
                        <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                        {l.isPreview ? (
                          <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                            <Eye className="size-3.5" /> Free preview
                          </span>
                        ) : null}
                        {l.durationSec ? <span className="num shrink-0 text-xs text-faint">{durationLabel(l.durationSec)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-muted">No lessons in this module yet.</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen />}
          title="No lessons yet"
          description={ctx.canManage ? "Add a module, then your first lesson." : `${product.creator.displayName} is still adding lessons. You'll see them here.`}
          action={<ManageLink ctx={ctx} tab="lessons" label="Add lessons" />}
        />
      )}
    </>
  );
}

async function IndicatorHome({ ctx }: { ctx: Ctx }) {
  const { product, viewer, settings } = ctx;
  const access = ctx.isOwner ? null : await db.indicatorAccess.findUnique({ where: { userId_productId: { userId: viewer.id, productId: product.id } } });
  const hasFiles = (await db.productFile.count({ where: { productId: product.id, lessonId: null } })) > 0;
  return (
    <>
      <InsideHeader icon={<LineChart />} title={product.title} description={`For ${settings.indicatorPlatform}`} actions={<ManageLink ctx={ctx} tab="access" label="Access requests" />} />
      <div className="space-y-5">
        {settings.accessType === "username" ? (
          <section className="card p-5">
            <h2 className="text-lg">Get access on {settings.indicatorPlatform}</h2>
            {ctx.isOwner ? (
              <p className="mt-1 text-sm text-muted">Buyers send their {settings.indicatorPlatform} username here. You add them, then mark it done under Access requests.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">
                  {settings.indicatorPlatform} indicators are shared by username. Send yours and {product.creator.displayName} adds you, usually within a day.
                </p>
                {access ? (
                  <Notice tone={access.status === "GRANTED" ? "ok" : access.status === "REVOKED" ? "bad" : "info"} className="mt-4">
                    {access.status === "GRANTED"
                      ? `Added to ${access.platformUsername} on ${formatDate(access.grantedAt)}. Open ${settings.indicatorPlatform} and look under invite-only scripts.`
                      : access.status === "REVOKED"
                        ? `Access for ${access.platformUsername} was removed. Message ${product.creator.displayName} if that's a mistake.`
                        : `Waiting for ${product.creator.displayName} to add ${access.platformUsername}.`}
                  </Notice>
                ) : null}
                {access?.licenseKey ? (
                  <div className="mt-4">
                    <div className="label">Your license key</div>
                    <code className="num block rounded-lg bg-sunk px-3 py-2 text-sm break-all">{access.licenseKey}</code>
                  </div>
                ) : null}
                <ActionForm action={requestIndicatorAccess} refreshOnSuccess toastOnSuccess className="mt-4 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <Field label={`Your ${settings.indicatorPlatform} username`} name="platformUsername" className="min-w-0 flex-1">
                    <Input name="platformUsername" defaultValue={access?.platformUsername ?? ""} maxLength={60} autoComplete="off" />
                  </Field>
                  <SubmitButton>{access ? "Update username" : "Send username"}</SubmitButton>
                  <FormMessage hideSuccess className="w-full" />
                </ActionForm>
              </>
            )}
          </section>
        ) : null}
        {settings.instructions ? (
          <section className="card p-5">
            <h2 className="text-lg">How to set it up</h2>
            <Markdown className="mt-2 text-[15px]">{settings.instructions}</Markdown>
          </section>
        ) : null}
        {hasFiles || settings.accessType !== "username" ? (
          <section>
            <h2 className="mb-3 text-lg">Files</h2>
            <FilesList ctx={ctx} />
          </section>
        ) : null}
        {!ctx.isOwner ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            Questions about setup?
            <MessageButton toId={product.creatorId} toName={product.creator.displayName} subject={`Question about ${product.title}`} variant="ghost" className="btn-sm" />
          </div>
        ) : null}
      </div>
    </>
  );
}

async function MentoringHome({ ctx }: { ctx: Ctx }) {
  const { product, entitlement } = ctx;
  const left = entitlement ? Math.max(0, (entitlement.sessionsTotal ?? 0) - entitlement.sessionsUsed) : 0;
  return (
    <>
      <InsideHeader icon={<Video />} title={product.title} description={`1 to 1 with ${product.creator.displayName}`} />
      {ctx.isOwner ? (
        <Notice tone="plain">Your buyers see how many calls they have left here, and message you to set up a time.</Notice>
      ) : (
        <div className="card p-5">
          <div className="text-sm text-muted">Calls left</div>
          <div className="num mt-1 text-3xl font-semibold">{left}</div>
          <p className="mt-3 text-sm text-ink-2">Send {product.creator.displayName} a message with a few times that suit you, and they&apos;ll send the call link.</p>
          <div className="mt-4">
            <MessageButton toId={product.creatorId} toName={product.creator.displayName} subject={`Booking a call: ${product.title}`} label="Message to book" variant="primary" />
          </div>
        </div>
      )}
    </>
  );
}

function EventHome({ ctx }: { ctx: Ctx }) {
  const { product, settings } = ctx;
  const start = product.startsAt;
  const since = start ? msSince(start) : null;
  const state = since === null ? "unset" : since < -15 * 60_000 ? "soon" : since <= settings.eventMinutes * 60_000 ? "open" : "over";
  const joinUrl = settings.callLink || null;
  const recording = settings.recordingUrl || null;
  return (
    <>
      <InsideHeader icon={<Ticket />} title={product.title} description={`Live event with ${product.creator.displayName}`} actions={<ManageLink ctx={ctx} tab="event" label="Event links" />} />
      <div className="card p-5">
        {start ? (
          <>
            <div className="text-sm font-semibold text-accent-text">{formatWhen(start, ctx.timeZone)}</div>
            <div className="mt-0.5 text-sm text-muted">{minutesLabel(settings.eventMinutes)}</div>
          </>
        ) : (
          <div className="text-sm text-muted">The date is being set. You&apos;ll get an email when it is.</div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {state === "open" && joinUrl ? (
            <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <Video /> Join now
            </a>
          ) : state === "soon" ? (
            <span className="btn btn-secondary pointer-events-none opacity-70" aria-disabled>
              <Video /> Join opens 15 min before
            </span>
          ) : null}
          {start && state !== "over" ? (
            <a href={`/api/calendar?event=${product.id}`} className="btn btn-ghost">
              <CalendarPlus /> Add to calendar
            </a>
          ) : null}
        </div>
        {state === "open" && !joinUrl ? <p className="mt-3 text-sm text-muted">The join link will appear here. Refresh in a minute.</p> : null}
      </div>
      {state === "over" ? (
        <section className="mt-6">
          <h2 className="text-lg">Recording</h2>
          {recording ? (
            toEmbedUrl(recording) ? (
              <VideoPlayer embedUrl={recording} title={product.title} className="mt-3" />
            ) : (
              <a href={recording} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-3">
                <PlayCircle /> Watch the recording
              </a>
            )
          ) : (
            <p className="mt-1 text-sm text-muted">The recording isn&apos;t up yet. You&apos;ll get a notification when it is.</p>
          )}
        </section>
      ) : null}
      {product.description ? (
        <section className="mt-6">
          <h2 className="text-lg">About this event</h2>
          <Markdown className="mt-2 text-[15px]">{product.description}</Markdown>
        </section>
      ) : null}
    </>
  );
}

export default async function InsideHome({ params }: Props) {
  const { username, slug } = await params;
  const ctx = await requireInside(username, slug);
  const { product } = ctx;
  const base = insidePath(product.creator.username, product.slug);

  if (product.type === "COMMUNITY" || product.type === "ALERTS") {
    const first = product.channels[0];
    if (first) redirect(`${base}/c/${first.slug}`);
  }

  return (
    <InsideShell ctx={ctx}>
      {product.type === "COURSE" ? (
        <CourseHome ctx={ctx} />
      ) : product.type === "DOWNLOAD" ? (
        <>
          <InsideHeader icon={<FileDown />} title={product.title} description={`From ${product.creator.displayName}`} actions={<ManageLink ctx={ctx} tab="files" label="Manage files" />} />
          <FilesList ctx={ctx} />
        </>
      ) : product.type === "INDICATOR" ? (
        <IndicatorHome ctx={ctx} />
      ) : product.type === "MENTORING" ? (
        <MentoringHome ctx={ctx} />
      ) : product.type === "EVENT" ? (
        <EventHome ctx={ctx} />
      ) : (
        <EmptyState title="No channels yet" description="Add a channel to get started." action={<ManageLink ctx={ctx} tab="channels" label="Add a channel" />} className={cn("mt-2")} />
      )}
    </InsideShell>
  );
}
