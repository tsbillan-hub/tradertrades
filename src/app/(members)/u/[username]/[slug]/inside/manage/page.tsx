import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Copy, Eye, FileText, Film, Paperclip, PencilLine, Settings2, Trash2 } from "lucide-react";
import type { ProductType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireManage, type InsideCtx } from "@/server/inside";
import {
  addLesson,
  addModule,
  deleteChannel,
  deleteFile,
  deleteLiveSession,
  deleteModule,
  giftAccess,
  moveChannel,
  moveFile,
  moveLesson,
  moveModule,
  removeMember,
  renameFile,
  renameModule,
  saveChannel,
  saveEventLinks,
  saveIndicatorSetup,
  saveLiveSession,
  saveRecording,
  saveWelcome,
  setIndicatorAccess,
} from "@/server/actions/content";
import { InsideHeader, InsideShell } from "@/components/inside/shell";
import { FileAdder } from "@/components/inside/manage-client";
import { MoveButtons } from "@/components/inside/manage-bits";
import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { CopyButton, ModalButton } from "@/components/ui/client";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LinkTabs, Notice } from "@/components/ui/misc";
import { CHANNEL_KIND_LABEL } from "@/lib/community";
import { formatWhen, utcToZoned } from "@/lib/time";
import { insidePath } from "@/lib/paths";
import { daysFromNow, durationLabel, formatDate, minutesLabel, plural } from "@/lib/utils";

type Props = { params: Promise<{ username: string; slug: string }>; searchParams: Promise<{ tab?: string; q?: string }> };
type Ctx = InsideCtx & { viewer: NonNullable<InsideCtx["viewer"]> };

export const metadata: Metadata = { title: "Manage", robots: { index: false } };

const TABS: Record<ProductType, { key: string; label: string }[]> = {
  COMMUNITY: [
    { key: "channels", label: "Channels" },
    { key: "live", label: "Live sessions" },
    { key: "welcome", label: "Welcome message" },
    { key: "members", label: "Members" },
  ],
  ALERTS: [
    { key: "channels", label: "Channels" },
    { key: "live", label: "Live sessions" },
    { key: "welcome", label: "Welcome message" },
    { key: "members", label: "Members" },
  ],
  COURSE: [
    { key: "lessons", label: "Lessons" },
    { key: "live", label: "Live sessions" },
    { key: "members", label: "Students" },
  ],
  DOWNLOAD: [
    { key: "files", label: "Files" },
    { key: "members", label: "Buyers" },
  ],
  INDICATOR: [
    { key: "access", label: "Access requests" },
    { key: "setup", label: "Setup guide" },
    { key: "files", label: "Files" },
    { key: "members", label: "Buyers" },
  ],
  EVENT: [
    { key: "event", label: "Event links" },
    { key: "members", label: "Ticket holders" },
  ],
  MENTORING: [{ key: "members", label: "Clients" }],
};

const smallBtn = "btn-icon";

// ───────────────────────────── Channels ─────────────────────────────

function ChannelFields({ c }: { c?: { name: string; description: string | null; kind: string; postingPolicy: string } }) {
  const isAlerts = c?.kind === "ALERTS";
  return (
    <>
      <Field label="Name" name="name">
        <Input name="name" defaultValue={c?.name ?? ""} maxLength={40} placeholder="Trade reviews" />
      </Field>
      <Field label="What it's for" name="description" optional>
        <Input name="description" defaultValue={c?.description ?? ""} maxLength={140} placeholder="Post your trades and get feedback" />
      </Field>
      {isAlerts ? (
        <>
          <input type="hidden" name="kind" value="CHAT" />
          <input type="hidden" name="postingPolicy" value="OWNER" />
          <p className="text-sm text-muted">This is your alerts channel. Only you post, and alerts are locked once posted.</p>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" name="kind">
            <Select name="kind" defaultValue={c?.kind ?? "CHAT"}>
              <option value="CHAT">Chat</option>
              <option value="ANNOUNCEMENTS">Announcements (emails members)</option>
              <option value="RESOURCES">Resources</option>
            </Select>
          </Field>
          <Field label="Who can post" name="postingPolicy" hint="Announcements are always just you.">
            <Select name="postingPolicy" defaultValue={c?.postingPolicy ?? "MEMBERS"}>
              <option value="MEMBERS">Everyone</option>
              <option value="OWNER">Only me</option>
            </Select>
          </Field>
        </div>
      )}
    </>
  );
}

async function ChannelsTab({ ctx }: { ctx: Ctx }) {
  const { product } = ctx;
  const counts = await db.post.groupBy({ by: ["channelId"], where: { productId: product.id, deletedAt: null }, _count: { _all: true } });
  const countOf = new Map(counts.map((c) => [c.channelId, c._count._all]));
  const base = insidePath(product.creator.username, product.slug);
  return (
    <div className="space-y-6">
      <ul className="card divide-y divide-line">
        {product.channels.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`${base}/c/${c.slug}`} className="font-semibold hover:underline">
                {c.name}
              </Link>
              <div className="mt-0.5 text-xs text-muted">
                {CHANNEL_KIND_LABEL[c.kind]} · {c.kind === "ALERTS" || c.postingPolicy === "OWNER" ? "only you post" : "everyone posts"} · {plural(countOf.get(c.id) ?? 0, "post")}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <MoveButtons action={moveChannel} field="channelId" id={c.id} first={i === 0} last={i === product.channels.length - 1} />
              <ModalButton iconOnly label={<PencilLine />} title={`Edit ${c.name}`} variant="ghost" className="btn-sm btn-icon">
                <ActionForm action={saveChannel} refreshOnSuccess className="space-y-4">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <ChannelFields c={c} />
                  <FormMessage />
                  <div className="flex justify-end">
                    <SubmitButton>Save</SubmitButton>
                  </div>
                </ActionForm>
              </ModalButton>
              {c.kind !== "ALERTS" && product.channels.length > 1 ? (
                <ActionButton action={deleteChannel} fields={{ channelId: c.id }} variant="ghost" className={smallBtn} title="Delete" confirm={`Delete ${c.name} and every post in it? This can't be undone.`}>
                  <Trash2 />
                </ActionButton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <section className="card p-5">
        <h2 className="text-lg">Add a channel</h2>
        <p className="mt-1 text-sm text-muted">Ideas: trade reviews, wins and lessons, questions, resources, off topic.</p>
        <ActionForm action={saveChannel} resetOnSuccess refreshOnSuccess toastOnSuccess className="mt-4 space-y-4">
          <input type="hidden" name="productId" value={product.id} />
          <ChannelFields />
          <FormMessage hideSuccess />
          <SubmitButton>Add channel</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}

// ───────────────────────────── Live sessions ─────────────────────────────

function LiveFields({ tz, s }: { tz: string; s?: { title: string; description: string | null; startsAt: Date; durationMin: number; joinUrl: string | null } }) {
  const at = s ? utcToZoned(s.startsAt, tz) : utcToZoned(daysFromNow(1), tz);
  return (
    <>
      <Field label="Title" name="title">
        <Input name="title" defaultValue={s?.title ?? ""} maxLength={100} placeholder="NY open: live trading" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date">
          <Input name="date" type="date" defaultValue={at.date} />
        </Field>
        <Field label="Time" name="time" hint={tz.replace(/_/g, " ")}>
          <Input name="time" type="time" defaultValue={s ? at.time : "09:15"} />
        </Field>
        <Field label="Length" name="durationMin">
          <Select name="durationMin" defaultValue={String(s?.durationMin ?? 60)}>
            {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
              <option key={m} value={m}>
                {minutesLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What you'll cover" name="description" optional>
        <Textarea name="description" rows={3} defaultValue={s?.description ?? ""} maxLength={1000} />
      </Field>
      <Field label="Your own call link" name="joinUrl" optional hint="Zoom, Google Meet, a YouTube live link... Leave it empty and we make a free video room.">
        <Input name="joinUrl" defaultValue={s?.joinUrl ?? ""} placeholder="https://" inputMode="url" />
      </Field>
    </>
  );
}

async function LiveTab({ ctx }: { ctx: Ctx }) {
  const { product } = ctx;
  const tz = product.creator.timezone;
  const sessions = await db.liveSession.findMany({ where: { productId: product.id }, orderBy: { startsAt: "asc" } });
  const cutoff = daysFromNow(0).getTime();
  const upcoming = sessions.filter((s) => s.startsAt.getTime() + s.durationMin * 60_000 >= cutoff);
  const past = sessions.filter((s) => s.startsAt.getTime() + s.durationMin * 60_000 < cutoff).reverse();
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-lg">Schedule a session</h2>
        <p className="mt-1 text-sm text-muted">Members get a notification and an email, plus a button to add it to their calendar.</p>
        <ActionForm action={saveLiveSession} resetOnSuccess refreshOnSuccess toastOnSuccess className="mt-4 space-y-4">
          <input type="hidden" name="productId" value={product.id} />
          <LiveFields tz={tz} />
          <FormMessage hideSuccess />
          <SubmitButton>Schedule</SubmitButton>
        </ActionForm>
      </section>

      <section>
        <h2 className="mb-3 text-lg">Coming up</h2>
        {upcoming.length ? (
          <ul className="card divide-y divide-line">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-xs text-muted">
                    {formatWhen(s.startsAt, tz)} · {minutesLabel(s.durationMin)}
                  </div>
                  {s.joinUrl ? <div className="mt-1 truncate text-xs text-faint">{s.joinUrl}</div> : null}
                </div>
                <div className="flex items-center gap-1">
                  {s.joinUrl ? (
                    <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      Open room
                    </a>
                  ) : null}
                  <ModalButton iconOnly label={<PencilLine />} title="Edit session" variant="ghost" className="btn-sm btn-icon">
                    <ActionForm action={saveLiveSession} refreshOnSuccess className="space-y-4">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="sessionId" value={s.id} />
                      <LiveFields tz={tz} s={s} />
                      <FormMessage />
                      <div className="flex justify-end">
                        <SubmitButton>Save</SubmitButton>
                      </div>
                    </ActionForm>
                  </ModalButton>
                  <ActionButton action={deleteLiveSession} fields={{ sessionId: s.id }} variant="ghost" className={smallBtn} title="Delete" confirm={`Cancel "${s.title}"? Members will be told.`}>
                    <Trash2 />
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing scheduled.</p>
        )}
      </section>

      {past.length ? (
        <section>
          <h2 className="mb-3 text-lg">Past sessions</h2>
          <ul className="card divide-y divide-line">
            {past.map((s) => (
              <li key={s.id} className="p-4">
                <div className="font-semibold">{s.title}</div>
                <div className="text-xs text-muted">{formatWhen(s.startsAt, tz)}</div>
                <ActionForm action={saveRecording} refreshOnSuccess toastOnSuccess className="mt-3 flex flex-wrap items-start gap-2">
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Input name="recordingUrl" defaultValue={s.recordingUrl ?? ""} placeholder="Recording link (YouTube, Vimeo, Loom...)" aria-label="Recording link" className="min-w-0 flex-1" />
                  <SubmitButton variant="secondary" size="md">
                    Save
                  </SubmitButton>
                  <FormMessage hideSuccess className="w-full" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ───────────────────────────── Welcome ─────────────────────────────

function WelcomeTab({ ctx }: { ctx: Ctx }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg">Welcome message</h2>
      <p className="mt-1 text-sm text-muted">Shown at the top of the first channel until a member hides it. Say hello, where to start and the house rules.</p>
      <ActionForm action={saveWelcome} refreshOnSuccess toastOnSuccess className="mt-4 space-y-4">
        <input type="hidden" name="productId" value={ctx.product.id} />
        <Textarea
          name="welcome"
          rows={8}
          maxLength={2000}
          defaultValue={ctx.settings.welcome}
          aria-label="Welcome message"
          placeholder={"Welcome in! Start by introducing yourself in General.\n\n**House rules**\n- Be kind\n- No signals selling\n- Post your trades with your reasoning"}
        />
        <p className="hint">You can use **bold**, lists and links.</p>
        <FormMessage hideSuccess />
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
    </section>
  );
}

// ───────────────────────────── Course lessons ─────────────────────────────

async function LessonsTab({ ctx }: { ctx: Ctx }) {
  const { product } = ctx;
  const modules = await db.courseModule.findMany({
    where: { productId: product.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { lessons: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, kind: true, isPreview: true, durationSec: true, videoMediaId: true, embedUrl: true } } },
  });
  const base = insidePath(product.creator.username, product.slug);
  return (
    <div className="space-y-5">
      {modules.length ? null : (
        <Notice tone="info" title="Start with a module">
          Modules are the chapters of your course, like &ldquo;The basics&rdquo; or &ldquo;Entries and exits&rdquo;. Add one, then add lessons to it.
        </Notice>
      )}
      {modules.map((m, mi) => (
        <section key={m.id} className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunk/60 px-4 py-3">
            <h2 className="min-w-0 flex-1 truncate text-base">
              <span className="mr-2 text-muted">{mi + 1}.</span>
              {m.title}
            </h2>
            <MoveButtons action={moveModule} field="moduleId" id={m.id} first={mi === 0} last={mi === modules.length - 1} />
            <ModalButton iconOnly label={<PencilLine />} title="Rename module" variant="ghost" className="btn-sm btn-icon">
              <ActionForm action={renameModule} refreshOnSuccess className="space-y-4">
                <input type="hidden" name="moduleId" value={m.id} />
                <Field label="Module name" name="title">
                  <Input name="title" defaultValue={m.title} maxLength={100} />
                </Field>
                <FormMessage />
                <div className="flex justify-end">
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
            </ModalButton>
            <ActionButton
              action={deleteModule}
              fields={{ moduleId: m.id }}
              variant="ghost"
              className={smallBtn}
              title="Delete module"
              confirm={`Delete "${m.title}" and its ${plural(m.lessons.length, "lesson")}? Videos are deleted too.`}
            >
              <Trash2 />
            </ActionButton>
          </div>
          {m.lessons.length ? (
            <ul className="divide-y divide-line">
              {m.lessons.map((l, li) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  {l.videoMediaId || l.embedUrl ? <Film className="size-4 shrink-0 text-muted" /> : l.kind === "FILE" ? <Paperclip className="size-4 shrink-0 text-muted" /> : <FileText className="size-4 shrink-0 text-muted" />}
                  <Link href={`${base}/manage/lesson/${l.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {l.title}
                  </Link>
                  {l.isPreview ? (
                    <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                      <Eye className="size-3.5" /> Free preview
                    </span>
                  ) : null}
                  {l.durationSec ? <span className="num text-xs text-faint">{durationLabel(l.durationSec)}</span> : null}
                  {!l.videoMediaId && !l.embedUrl && l.kind === "VIDEO" ? <span className="badge badge-warn">No video yet</span> : null}
                  <div className="flex items-center">
                    <MoveButtons action={moveLesson} field="lessonId" id={l.id} first={li === 0} last={li === m.lessons.length - 1} />
                    <Link href={`${base}/manage/lesson/${l.id}`} className="btn btn-ghost btn-sm btn-icon" title="Edit lesson">
                      <PencilLine />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={addLesson} className="flex flex-wrap items-start gap-2 border-t border-line px-4 py-3">
            <input type="hidden" name="moduleId" value={m.id} />
            <Input name="title" placeholder="New lesson title" maxLength={120} aria-label="New lesson title" className="min-w-0 flex-1" />
            <SubmitButton variant="secondary" size="md">
              Add lesson
            </SubmitButton>
            <FormMessage hideSuccess className="w-full" />
          </ActionForm>
        </section>
      ))}
      <section className="card p-5">
        <h2 className="text-lg">Add a module</h2>
        <ActionForm action={addModule} resetOnSuccess refreshOnSuccess toastOnSuccess className="mt-3 flex flex-wrap items-start gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <Input name="title" placeholder="Module name, like 'The basics'" maxLength={100} aria-label="Module name" className="min-w-0 flex-1" />
          <SubmitButton>Add module</SubmitButton>
          <FormMessage hideSuccess className="w-full" />
        </ActionForm>
      </section>
    </div>
  );
}

// ───────────────────────────── Files ─────────────────────────────

async function FilesTab({ ctx }: { ctx: Ctx }) {
  const { product } = ctx;
  const files = await db.productFile.findMany({
    where: { productId: product.id, lessonId: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { media: { select: { sizeBytes: true, originalName: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">PDFs, spreadsheets, zips, images. Up to 500 MB each. Only buyers can download them.</p>
        <FileAdder productId={product.id} />
      </div>
      {files.length ? (
        <ul className="card divide-y divide-line">
          {files.map((f, i) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4">
              <Paperclip className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.label}</div>
                <div className="truncate text-xs text-faint">
                  {f.media.originalName} · {(f.media.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
              <div className="flex items-center gap-1">
                <MoveButtons action={moveFile} field="fileId" id={f.id} first={i === 0} last={i === files.length - 1} />
                <ModalButton iconOnly label={<PencilLine />} title="Rename file" variant="ghost" className="btn-sm btn-icon">
                  <ActionForm action={renameFile} refreshOnSuccess className="space-y-4">
                    <input type="hidden" name="fileId" value={f.id} />
                    <Field label="Name buyers see" name="label">
                      <Input name="label" defaultValue={f.label} maxLength={120} />
                    </Field>
                    <FormMessage />
                    <div className="flex justify-end">
                      <SubmitButton>Save</SubmitButton>
                    </div>
                  </ActionForm>
                </ModalButton>
                <ActionButton action={deleteFile} fields={{ fileId: f.id }} variant="ghost" className={smallBtn} title="Delete" confirm={`Delete ${f.label}? Buyers won't be able to download it any more.`}>
                  <Trash2 />
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Paperclip />} title="No files yet" description="Upload what buyers get. They can download it right after paying." />
      )}
    </div>
  );
}

// ───────────────────────────── Indicator ─────────────────────────────

async function AccessTab({ ctx }: { ctx: Ctx }) {
  const { product, settings } = ctx;
  const rows = await db.indicatorAccess.findMany({
    where: { productId: product.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    take: 300,
  });
  const ents = await db.entitlement.findMany({ where: { productId: product.id, userId: { in: rows.map((r) => r.userId) } }, select: { userId: true, status: true, endsAt: true } });
  const now = daysFromNow(0);
  const activeIds = new Set(ents.filter((e) => e.status === "ACTIVE" && (!e.endsAt || e.endsAt > now)).map((e) => e.userId));
  const waiting = rows.filter((r) => r.status === "REQUESTED" && activeIds.has(r.userId)).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Buyers send their {settings.indicatorPlatform} username. Add them on {settings.indicatorPlatform}, then press <strong>Mark as added</strong> so they know.
        {waiting ? ` ${plural(waiting, "person is", "people are")} waiting.` : ""}
      </p>
      {rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.map((r) => {
            const active = activeIds.has(r.userId);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.user.displayName}</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="num">{r.platformUsername}</span>
                    <CopyButton value={r.platformUsername} small label="Copy" />
                  </div>
                  {!active && r.status === "GRANTED" ? (
                    <div className="mt-1 text-xs font-semibold text-down">Their access ended (refund or canceled). Remove them on {settings.indicatorPlatform}.</div>
                  ) : null}
                </div>
                <span className={r.status === "GRANTED" ? "badge badge-ok" : r.status === "REVOKED" ? "badge badge-outline" : "badge badge-warn"}>
                  {r.status === "GRANTED" ? `Added ${formatDate(r.grantedAt)}` : r.status === "REVOKED" ? "Removed" : "Waiting"}
                </span>
                <div className="flex gap-1">
                  {r.status !== "GRANTED" && active ? (
                    <ActionButton action={setIndicatorAccess} fields={{ accessId: r.id, grant: "1" }} variant="primary">
                      Mark as added
                    </ActionButton>
                  ) : null}
                  {r.status === "GRANTED" ? (
                    <ActionButton action={setIndicatorAccess} fields={{ accessId: r.id, grant: "0" }} variant="ghost">
                      Mark as removed
                    </ActionButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Copy />} title="No requests yet" description="When someone buys, they send their username here." />
      )}
    </div>
  );
}

function SetupTab({ ctx }: { ctx: Ctx }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg">Setup guide</h2>
      <p className="mt-1 text-sm text-muted">Shown to buyers inside. Explain how to add it to their chart and the settings you use.</p>
      <ActionForm action={saveIndicatorSetup} refreshOnSuccess toastOnSuccess className="mt-4 space-y-4">
        <input type="hidden" name="productId" value={ctx.product.id} />
        <Field label="Platform" name="indicatorPlatform">
          <Input name="indicatorPlatform" defaultValue={ctx.settings.indicatorPlatform} maxLength={40} />
        </Field>
        <Field label="Steps" name="instructions" optional>
          <Textarea name="instructions" rows={8} maxLength={4000} defaultValue={ctx.settings.instructions} placeholder={"1. Open TradingView and go to Indicators\n2. Choose Invite-only scripts\n3. ..."} />
        </Field>
        <FormMessage hideSuccess />
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
    </section>
  );
}

// ───────────────────────────── Event ─────────────────────────────

function EventTab({ ctx }: { ctx: Ctx }) {
  const { product, settings } = ctx;
  return (
    <section className="card p-5">
      <h2 className="text-lg">Event links</h2>
      <p className="mt-1 text-sm text-muted">
        {product.startsAt ? `Starts ${formatWhen(product.startsAt, product.creator.timezone)}. ` : "No date set yet. "}
        <Link href={`/creator/products/${product.id}`} className="link">
          Change the date in the listing
        </Link>
        .
      </p>
      <ActionForm action={saveEventLinks} refreshOnSuccess toastOnSuccess className="mt-4 space-y-4">
        <input type="hidden" name="productId" value={product.id} />
        <Field label="Join link" name="callLink" optional hint="Zoom, Google Meet, YouTube live... Ticket holders see it 15 minutes before the start.">
          <Input name="callLink" defaultValue={settings.callProvider === "link" ? settings.callLink : ""} placeholder="https://" inputMode="url" />
        </Field>
        <Field label="Recording link" name="recordingUrl" optional hint="Add it after the event. Ticket holders get told.">
          <Input name="recordingUrl" defaultValue={settings.recordingUrl} placeholder="https://" inputMode="url" />
        </Field>
        <FormMessage hideSuccess />
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
    </section>
  );
}

// ───────────────────────────── Members ─────────────────────────────

async function MembersTab({ ctx, q }: { ctx: Ctx; q: string }) {
  const { product } = ctx;
  const now = daysFromNow(0);
  const where = {
    productId: product.id,
    status: "ACTIVE" as const,
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    ...(q ? { user: { OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { username: { contains: q.replace(/^@/, ""), mode: "insensitive" as const } }] } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.entitlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } }, price: { select: { label: true } } },
    }),
    db.entitlement.count({ where: { productId: product.id, status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }),
  ]);
  const base = insidePath(product.creator.username, product.slug);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {plural(total, "person has", "people have")} access{product.memberLimit ? ` (limit ${product.memberLimit})` : ""}.
        </p>
        <form action={`${base}/manage`} method="get" className="flex gap-2">
          <input type="hidden" name="tab" value="members" />
          <input name="q" defaultValue={q} placeholder="Search by name" className="input h-9" aria-label="Search members" />
        </form>
      </div>
      {rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar src={e.user.avatarUrl} name={e.user.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <Link href={`/@${e.user.username}`} className="font-semibold hover:underline">
                  {e.user.displayName}
                </Link>
                <div className="text-xs text-muted">
                  @{e.user.username} · since {formatDate(e.startsAt)} · {e.source === "GIFT" ? "free access from you" : (e.price?.label ?? "bought")}
                  {product.type === "MENTORING" && e.sessionsTotal ? ` · ${Math.max(0, e.sessionsTotal - e.sessionsUsed)} calls left` : ""}
                </div>
              </div>
              <ActionButton
                action={removeMember}
                fields={{ productId: product.id, userId: e.user.id }}
                variant="ghost"
                confirm={`Remove ${e.user.displayName}? Their access ends now, they won't be charged again, and they can't buy from you again. Refunds are separate (from Sales).`}
              >
                Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={q ? "No one matches" : "No one yet"} description={q ? undefined : "Share your link to get your first members."} />
      )}
      <section className="card p-5">
        <h2 className="text-lg">Give someone free access</h2>
        <p className="mt-1 text-sm text-muted">For a friend, a tester or a giveaway. They need a TraderTrades account.</p>
        <ActionForm action={giftAccess} resetOnSuccess refreshOnSuccess toastOnSuccess className="mt-3 flex flex-wrap items-start gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <Input name="username" placeholder="@username" maxLength={25} aria-label="Username" className="min-w-0 flex-1" autoComplete="off" />
          <SubmitButton variant="secondary" size="md">
            Give access
          </SubmitButton>
          <FormMessage hideSuccess className="w-full" />
        </ActionForm>
      </section>
    </div>
  );
}

export default async function ManagePage({ params, searchParams }: Props) {
  const { username, slug } = await params;
  const { tab: tabParam, q } = await searchParams;
  const ctx = await requireManage(username, slug);
  const tabs = TABS[ctx.product.type];
  const tab = tabs.find((t) => t.key === tabParam)?.key ?? tabs[0].key;
  const base = insidePath(ctx.product.creator.username, ctx.product.slug);

  return (
    <InsideShell ctx={ctx}>
      <InsideHeader
        icon={<Settings2 />}
        title="Manage"
        description="Everything members see inside. Changes show up for them straight away."
        actions={
          ctx.product.type === "COURSE" ? (
            <Link href={base} className="btn btn-secondary btn-sm">
              <BookOpen /> View as a student
            </Link>
          ) : null
        }
      />
      <LinkTabs className="mb-6" active={tab} tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `${base}/manage?tab=${t.key}` }))} />
      {tab === "channels" ? (
        <ChannelsTab ctx={ctx} />
      ) : tab === "live" ? (
        <LiveTab ctx={ctx} />
      ) : tab === "welcome" ? (
        <WelcomeTab ctx={ctx} />
      ) : tab === "lessons" ? (
        <LessonsTab ctx={ctx} />
      ) : tab === "files" ? (
        <FilesTab ctx={ctx} />
      ) : tab === "access" ? (
        <AccessTab ctx={ctx} />
      ) : tab === "setup" ? (
        <SetupTab ctx={ctx} />
      ) : tab === "event" ? (
        <EventTab ctx={ctx} />
      ) : (
        <MembersTab ctx={ctx} q={(q ?? "").trim().slice(0, 60)} />
      )}
    </InsideShell>
  );
}
