import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CircleCheck, Clock, Mail } from "lucide-react";
import { ActionButton, ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { FilesField } from "@/components/ui/uploader";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/misc";
import { SocialIcon } from "@/components/icons/social";
import { SocialsCheck } from "@/components/settings/socials-check";
import { cancelVerification, requestIdentityCheck } from "@/server/actions/verification";
import { requireUser } from "@/server/dal";
import { db } from "@/lib/db";
import { formatDate, socialLabelSafe } from "@/lib/verification-labels";

export const metadata: Metadata = { title: "Verification" };

function Status({ done, pending, label }: { done?: Date | null; pending?: boolean; label: string }) {
  if (done)
    return (
      <span className="badge badge-ok">
        <CircleCheck /> {label} · {formatDate(done)}
      </span>
    );
  if (pending)
    return (
      <span className="badge badge-warn">
        <Clock /> Waiting for review
      </span>
    );
  return <span className="badge">Not started</span>;
}

export default async function VerificationPage() {
  const user = await requireUser();
  const [requests, socials] = await Promise.all([
    db.verificationRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.socialLink.findMany({ where: { userId: user.id } }),
  ]);
  const open = (k: string) => requests.find((r) => r.kind === k && (r.status === "PENDING" || r.status === "NEEDS_MORE"));
  const lastDecided = (k: string) => requests.find((r) => r.kind === k && (r.status === "REJECTED" || r.status === "APPROVED"));
  const idOpen = open("IDENTITY");
  const socialsOpen = open("SOCIALS");
  const idRejected = lastDecided("IDENTITY")?.status === "REJECTED" && !user.idVerifiedAt ? lastDecided("IDENTITY") : null;

  return (
    <>
      <Notice tone="plain" title="Badges are optional">
        They show people the profile really belongs to you. You can buy and sell without them.
      </Notice>

      <Panel title="Email" description="Needed to buy, post, review and message." action={<Status done={user.emailVerifiedAt} label="Confirmed" />}>
        {!user.emailVerifiedAt ? (
          <Link href="/verify-email" className="btn btn-secondary btn-sm">
            <Mail /> Confirm my email
          </Link>
        ) : (
          <p className="text-sm text-muted">{user.email}</p>
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <BadgeCheck className="size-4" /> ID check
          </span>
        }
        description="A person checks a photo of your government ID matches your name, and you get the ID verified badge. Your ID photo is deleted after the check."
        action={<Status done={user.idVerifiedAt} pending={Boolean(idOpen)} label="Verified" />}
      >
        {user.idVerifiedAt ? (
          <p className="text-sm text-muted">Your profile shows an &ldquo;ID verified&rdquo; badge.</p>
        ) : idOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Sent {formatDate(idOpen.createdAt)}. We usually reply within 2 working days.</p>
            <ActionButton action={cancelVerification} fields={{ id: idOpen.id }} variant="ghost" confirm="Cancel this ID check?">
              Cancel
            </ActionButton>
          </div>
        ) : (
          <ActionForm action={requestIdentityCheck} refreshOnSuccess className="space-y-4">
            {idRejected ? (
              <Notice tone="bad" title="Your last ID check didn't go through">
                {idRejected.reviewNote ?? "Try again with a clearer photo."}
              </Notice>
            ) : null}
            <Field label="Full legal name" name="legalName" hint="As it appears on your ID. Not shown publicly.">
              <Input name="legalName" className="max-w-sm" />
            </Field>
            <div>
              <div className="label">Photo of your ID</div>
              <p className="hint -mt-1 mb-2">Passport, driving licence or national ID. Make sure every corner is in the photo. Images or PDF, up to 10 MB.</p>
              <FilesField name="mediaIds" purpose="document" label="Add ID photo" max={3} />
            </div>
            <Field label="Anything we should know?" name="note" optional>
              <Textarea name="note" rows={2} maxLength={500} />
            </Field>
            <FormMessage />
            <SubmitButton>Send for review</SubmitButton>
          </ActionForm>
        )}
      </Panel>

      <Panel
        title="Social accounts"
        description="Prove the accounts linked on your profile are really yours."
        action={<Status done={user.socialsVerifiedAt} pending={socialsOpen?.status === "PENDING"} label="Verified" />}
      >
        {socials.length ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {socials.map((s) => (
              <li key={s.id} className={s.verifiedAt ? "badge badge-ok" : "badge"}>
                <SocialIcon platform={s.platform} />
                {socialLabelSafe(s.platform)}
                {s.verifiedAt ? " ✓" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">
            You haven&apos;t linked any accounts yet.{" "}
            <Link href="/settings" className="link">
              Add them on your profile
            </Link>
            .
          </p>
        )}
        {socials.length && !user.socialsVerifiedAt ? (
          <SocialsCheck code={(socialsOpen?.data as { code?: string } | null)?.code ?? null} pending={socialsOpen?.status === "PENDING"} />
        ) : null}
      </Panel>

      <Panel title="Business verification" description="For companies in the directory.">
        <p className="text-sm text-muted">
          Businesses get verified when they claim their listing with a work email and documents.{" "}
          <Link href="/business/claim" className="link">
            Claim a company
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}
