"use client";

import { useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea, useFormState } from "@/components/ui/form";
import { sendBroadcast } from "@/server/actions/broadcasts";

type Option = { value: string; label: string; count: number };

const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

/** In preview mode the test email isn't really sent, so offer to open it here. */
function TestPreviewLink() {
  const { state } = useFormState();
  const url = state.ok ? state.data?.previewUrl : undefined;
  if (typeof url !== "string") return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="link text-sm font-semibold">
      Open the test email
    </a>
  );
}

export function BroadcastForm({ options, waitUntil }: { options: Option[]; waitUntil: string | null }) {
  const [audience, setAudience] = useState(options[0]?.value ?? "all");
  const [length, setLength] = useState(0);
  const count = options.find((o) => o.value === audience)?.count ?? 0;

  return (
    <ActionForm
      action={sendBroadcast}
      className="space-y-5"
      onSubmit={(e) => {
        const by = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (by?.value !== "send") return;
        const subject = String(new FormData(e.currentTarget).get("subject") ?? "").trim();
        if (!window.confirm(`Send "${subject || "this email"}" to ${people(count)}? You can send one email a day.`)) e.preventDefault();
      }}
    >
      <Field name="audience" label="Who gets it">
        <Select defaultValue={options[0]?.value} onChange={(e) => setAudience(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({people(o.count)})
            </option>
          ))}
        </Select>
      </Field>
      <Field name="subject" label="Subject">
        <Input maxLength={120} placeholder="New lesson: how I plan the London open" autoComplete="off" />
      </Field>
      <Field
        name="body"
        label="Message"
        hint={
          <span className="flex flex-wrap justify-between gap-x-4">
            <span>Plain text. Leave an empty line between paragraphs. Your name and a button to your page go at the end.</span>
            <span className="num ml-auto">{length.toLocaleString("en-US")} / 5,000</span>
          </span>
        }
      >
        <Textarea rows={10} maxLength={5000} onInput={(e) => setLength(e.currentTarget.value.length)} placeholder={"Hi everyone,\n\nThe new lesson is up in the course. It covers..."} />
      </Field>
      <FormMessage />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="intent" value="send" pendingText="Sending" disabled={Boolean(waitUntil) || count === 0}>
          <Send /> Send to {people(count)}
        </SubmitButton>
        <SubmitButton name="intent" value="test" variant="secondary" pendingText="Sending">
          <FlaskConical /> Send me a test
        </SubmitButton>
        <TestPreviewLink />
      </div>
      {waitUntil ? <p className="text-sm text-muted">You can send your next email after {waitUntil}. Test emails still work.</p> : null}
    </ActionForm>
  );
}
