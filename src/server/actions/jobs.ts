"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { JOB_KINDS, JOB_ROLES } from "@/lib/constants";
import { checkbox, fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { companyRole, requireVerifiedUser } from "@/server/dal";
import { JOB_DAYS, jobIsOpen, managesJob } from "@/server/jobs";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { checkText } from "@/server/moderation";
import { rateLimit } from "@/server/rate-limit";

const DAY = 86_400_000;
const id = z.string().min(1).max(60);
const ROLE_VALUES = JOB_ROLES.map((r) => r.value) as [string, ...string[]];
const KIND_VALUES = JOB_KINDS.map((k) => k.value) as [string, ...string[]];

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.url({ protocol: /^https$/, error: "Links have to start with https://" }));

/** Jobs that ask applicants for money are the oldest scam on job boards. */
const PAY_TO_APPLY =
  /\b(?:application|registration|joining|sign[\s-]?up|onboarding|training|starter|admin)\s+(?:fee|deposit|cost|kit)s?\b|\b(?:pay|deposit|send|buy|purchase)\b[^.!?\n]{0,40}\b(?:to\s+(?:apply|join|start|get\s+started|be\s+considered)|before\s+(?:you\s+)?(?:start|join|apply)|our\s+(?:course|program|programme|mentorship|kit)|your\s+(?:training|onboarding|kit))\b/i;

const canManageJob = (job: { posterId: string; companyId: string | null }, user: { id: string }) => managesJob(job, user.id);

const jobSchema = z.object({
  jobId: optionalText(60),
  postAs: z.string().trim().max(60).default("me"),
  title: z.string().trim().min(5, "At least 5 characters").max(100, "100 characters at most"),
  role: z.enum(ROLE_VALUES, { error: "Pick a role" }),
  kind: z.enum(KIND_VALUES, { error: "Pick a type" }),
  description: z.string().trim().min(50, "Describe the job in at least 50 characters").max(5000, "5,000 characters at most"),
  pay: optionalText(80),
  remote: checkbox,
  location: optionalText(80),
  applyUrl: z.union([z.literal(""), httpsUrl]).optional(),
});

export async function saveJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = jobSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  if (!d.remote && !d.location) return fail("Say where the job is, or tick remote.", formData, { location: ["Add a city or country"] });

  const existing = d.jobId ? await db.jobPost.findUnique({ where: { id: d.jobId } }) : null;
  if (d.jobId && (!existing || !(await canManageJob(existing, user)))) return fail("Job post not found.");
  if (existing?.status === "REMOVED") return fail("Our team took this job post down, so it can't be changed.");

  // Posting for a company needs a seat on its team. Editing keeps whoever it was posted as.
  let companyId: string | null = existing ? existing.companyId : null;
  if (!existing && d.postAs !== "me") {
    const role = await companyRole(d.postAs, { id: user.id, isAdmin: false });
    if (!role) return fail("You can only post for a company you're on the team of.", formData, { postAs: ["Pick yourself or your company"] });
    companyId = d.postAs;
  }

  const text = `${d.title}\n${d.description}\n${d.pay ?? ""}`;
  if (PAY_TO_APPLY.test(text)) {
    return fail("Job posts can't ask people to pay anything to apply or start. That includes fees, deposits, courses and kits.", formData, { description: ["Take out the payment"] });
  }
  const check = await checkText(text, existing ? { type: "JOB", id: existing.id } : null);
  if (check.blocked) return fail(check.message, formData);

  const data = {
    title: d.title,
    role: d.role as (typeof JOB_ROLES)[number]["value"],
    kind: d.kind as (typeof JOB_KINDS)[number]["value"],
    description: d.description,
    pay: d.pay ?? null,
    remote: d.remote,
    location: d.location ?? null,
    applyUrl: d.applyUrl || null,
  };
  if (existing) {
    await db.jobPost.update({ where: { id: existing.id }, data });
    await audit(user.id, "job.update", { type: "job", id: existing.id });
    await flash("Job post saved.");
    redirect(`/jobs/${existing.id}`);
  }
  const rl = await rateLimit(`job:${user.id}`, 10, 86400);
  if (!rl.ok) return fail("That's a lot of job posts today. Try again tomorrow.", formData);
  const job = await db.jobPost.create({ data: { ...data, posterId: user.id, companyId, status: "OPEN", expiresAt: new Date(Date.now() + JOB_DAYS * DAY) } });
  if (check.hits.length) await checkText(text, { type: "JOB", id: job.id });
  await audit(user.id, "job.create", { type: "job", id: job.id }, { companyId });
  await flash(`Job posted. It stays up for ${JOB_DAYS} days, and you can close it any time.`);
  redirect(`/jobs/${job.id}`);
}

export async function setJobStatus(formData: FormData) {
  const user = await requireVerifiedUser();
  const job = await db.jobPost.findUnique({ where: { id: String(formData.get("jobId") ?? "") } });
  if (!job || !(await canManageJob(job, user)) || job.status === "REMOVED") return;
  const open = formData.get("status") === "OPEN";
  await db.jobPost.update({ where: { id: job.id }, data: open ? { status: "OPEN", expiresAt: new Date(Date.now() + JOB_DAYS * DAY) } : { status: "CLOSED" } });
  await audit(user.id, open ? "job.reopen" : "job.close", { type: "job", id: job.id });
  await flash(open ? `Job reopened for another ${JOB_DAYS} days.` : "Job closed. Nobody new can apply.");
  refresh();
}

// ───────────────────────────── Applying ─────────────────────────────

const applySchema = z.object({
  jobId: id,
  message: z.string().trim().min(30, "Say why you'd be good at it (at least 30 characters)").max(2000, "2,000 characters at most"),
  links: z.array(httpsUrl).max(3, "3 links at most"),
});

export async function applyToJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const raw = formObject(formData, ["links"]);
  const links = (raw.links as string[]).map((l) => l.trim()).filter(Boolean);
  const parsed = applySchema.safeParse({ ...raw, links });
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const job = await db.jobPost.findUnique({ where: { id: d.jobId }, include: { company: { select: { name: true } } } });
  if (!job || !jobIsOpen(job)) return fail("This job isn't taking applications any more.");
  if (job.applyUrl) return fail("This job takes applications on the poster's own site. Use the apply link.");
  if (await canManageJob(job, user)) return fail("You can't apply to your own job post.");
  const already = await db.jobApplication.findUnique({ where: { jobId_userId: { jobId: job.id, userId: user.id } } });
  if (already) return fail("You already applied to this job.");
  const check = await checkText(d.message, null);
  if (check.blocked) return fail(check.message, formData);
  const rl = await rateLimit(`job-apply:${user.id}`, 20, 86400);
  if (!rl.ok) return fail("That's a lot of applications today. Try again tomorrow.", formData);

  const app = await db.jobApplication.create({ data: { jobId: job.id, userId: user.id, message: d.message, links: d.links } });
  await audit(user.id, "job.apply", { type: "job", id: job.id }, { applicationId: app.id });
  await notify(job.posterId, {
    type: "job.applied",
    title: `${user.displayName} applied to "${job.title}"`,
    body: d.message.slice(0, 200),
    url: `/jobs/${job.id}/applicants`,
    email: "business",
    ctaLabel: "See applicants",
  });
  const sent = `Applied. ${job.company?.name ?? "The poster"} will see your message${d.links.length ? " and links" : ""}.`;
  await flash(sent);
  refresh();
  return success(sent);
}

export async function withdrawJobApplication(formData: FormData) {
  const user = await requireVerifiedUser();
  const app = await db.jobApplication.findUnique({ where: { id: String(formData.get("applicationId") ?? "") } });
  if (!app || app.userId !== user.id) return;
  if (app.status === "HIRED") {
    await flash("You were hired for this one. Message the poster if plans changed.", "error");
    return refresh();
  }
  await db.jobApplication.delete({ where: { id: app.id } });
  await audit(user.id, "job.withdraw", { type: "job", id: app.jobId });
  await flash("Application withdrawn.");
  refresh();
}

const STATUS_NOTE: Partial<Record<ApplicationStatus, (title: string) => { title: string; body: string }>> = {
  SHORTLISTED: (t) => ({ title: `You're on the shortlist for "${t}"`, body: "The poster liked your application. Keep an eye on your messages." }),
  HIRED: (t) => ({ title: `You got the job: "${t}"`, body: "Congratulations. The poster will be in touch about next steps." }),
  REJECTED: (t) => ({ title: `Update on "${t}"`, body: "The poster went with someone else this time. Thanks for applying." }),
};

export async function setApplicationStatus(formData: FormData) {
  const user = await requireVerifiedUser();
  const status = String(formData.get("status") ?? "") as ApplicationStatus;
  if (!["NEW", "SHORTLISTED", "REJECTED", "HIRED"].includes(status)) return;
  const app = await db.jobApplication.findUnique({ where: { id: String(formData.get("applicationId") ?? "") }, include: { job: true, user: { select: { displayName: true } } } });
  if (!app || !(await canManageJob(app.job, user)) || app.status === status) return;
  await db.jobApplication.update({ where: { id: app.id }, data: { status } });
  await audit(user.id, "job.application_status", { type: "job", id: app.jobId }, { applicationId: app.id, status });
  // Undoing a hire is a correction, not news, so nobody gets a second "you're on the shortlist" note.
  const undo = app.status === "HIRED";
  const note = undo ? undefined : STATUS_NOTE[status]?.(app.job.title);
  if (note) await notify(app.userId, { type: "job.status", ...note, url: `/jobs/${app.jobId}`, email: status === "REJECTED" ? undefined : "business" });
  await flash(
    undo
      ? `Undid the hire. ${app.user.displayName} is back on your shortlist.`
      : { NEW: "Moved back to new.", SHORTLISTED: `${app.user.displayName} is on your shortlist. They've been told.`, HIRED: `Marked ${app.user.displayName} as hired. They've been told.`, REJECTED: `Passed on ${app.user.displayName}. They've been told kindly.` }[status],
  );
  refresh();
}
