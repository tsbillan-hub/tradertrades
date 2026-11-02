"use client";

import { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { ActionForm, Field, FieldError, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { JOB_KINDS, JOB_ROLES } from "@/lib/constants";
import { applyToJob, saveJob } from "@/server/actions/jobs";

export type JobValues = {
  id: string;
  title: string;
  role: string;
  kind: string;
  description: string;
  pay: string | null;
  remote: boolean;
  location: string | null;
  applyUrl: string | null;
  postedAs: string;
};

/** Post or edit a job. People post as themselves, or as a company they're on the team of. */
export function JobForm({ job, postAs, defaultPostAs }: { job?: JobValues; postAs: { value: string; label: string }[]; defaultPostAs?: string }) {
  const [remote, setRemote] = useState(job ? job.remote : true);
  const [ownSite, setOwnSite] = useState(Boolean(job?.applyUrl));
  return (
    <ActionForm action={saveJob} className="space-y-6">
      {job ? <input type="hidden" name="jobId" value={job.id} /> : null}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-lg">The job</h2>
        {job ? (
          <p className="text-sm text-muted">
            Posted as <span className="font-semibold text-ink">{job.postedAs}</span>
          </p>
        ) : postAs.length > 1 ? (
          <Field name="postAs" label="Post as" hint="Posting as a company shows its logo, and its whole team can manage the applicants.">
            <Select defaultValue={defaultPostAs ?? "me"} className="max-w-sm">
              {postAs.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="postAs" value="me" />
        )}
        <Field name="title" label="Job title">
          <Input defaultValue={job?.title} maxLength={100} placeholder="Short-form video editor for a futures trading channel" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="role" label="Role">
            <Select defaultValue={job?.role ?? ""}>
              <option value="" disabled>
                Pick a role
              </option>
              {JOB_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field name="kind" label="Type">
            <Select defaultValue={job?.kind ?? ""}>
              <option value="" disabled>
                Pick a type
              </option>
              {JOB_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          name="description"
          label="What the job is"
          hint="What they'd do, the hours, the tools, and what you need from them. Jobs can't ask people to pay anything to apply or start."
        >
          <Textarea rows={9} maxLength={5000} defaultValue={job?.description} />
        </Field>
        <Field name="pay" label="Pay" optional hint="Be specific. If it's commission only, say so.">
          <Input defaultValue={job?.pay ?? ""} maxLength={80} placeholder="$25 an hour, $1,500 a month, or 10% commission" className="max-w-md" />
        </Field>
      </section>

      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-lg">Where and how to apply</h2>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="remote" defaultChecked={remote} onChange={(e) => setRemote(e.target.checked)} className="checkbox mt-0.5" />
          <span>
            <span className="font-semibold">Remote</span>
            <span className="block text-muted">They can work from anywhere.</span>
          </span>
        </label>
        <Field name="location" label={remote ? "Time zone or country" : "City or country"} optional={remote}>
          <Input defaultValue={job?.location ?? ""} maxLength={80} placeholder={remote ? "US hours, or Europe" : "London, UK"} className="max-w-md" />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={ownSite} onChange={(e) => setOwnSite(e.target.checked)} className="checkbox mt-0.5" />
          <span>
            <span className="font-semibold">Take applications on my own site</span>
            <span className="block text-muted">Leave this off to get applications here, with a message and links from each person.</span>
          </span>
        </label>
        {ownSite ? (
          <Field name="applyUrl" label="Application link">
            <Input defaultValue={job?.applyUrl ?? ""} inputMode="url" maxLength={500} placeholder="https://yoursite.com/careers/editor" />
          </Field>
        ) : (
          <input type="hidden" name="applyUrl" value="" />
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <FormMessage />
        <SubmitButton size="lg" pendingText="Saving">
          {job ? "Save changes" : "Post the job"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Apply to a job that takes applications here: a message and up to 3 links. */
export function JobApplyForm({ jobId }: { jobId: string }) {
  const [links, setLinks] = useState<string[]>([""]);
  return (
    <ActionForm action={applyToJob} refreshOnSuccess className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <Field name="message" label="Why you" hint="What you've done before and why you'd be good at this.">
        <Textarea rows={6} maxLength={2000} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="label">
          Links to your work <span className="ml-1.5 font-normal text-faint">optional</span>
        </legend>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input name="links" defaultValue={l} className="input flex-1" inputMode="url" placeholder="https://" aria-label={`Link ${i + 1}`} />
            {links.length > 1 ? (
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}>
                <Trash2 />
              </button>
            ) : null}
          </div>
        ))}
        <FieldError name="links" />
        {links.length < 3 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinks((all) => [...all, ""])}>
            <Plus /> Add another link
          </button>
        ) : null}
      </fieldset>
      <FormMessage hideSuccess />
      <SubmitButton pendingText="Sending" className="w-full">
        <Send /> Send application
      </SubmitButton>
    </ActionForm>
  );
}
