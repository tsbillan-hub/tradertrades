"use client";

import { useState } from "react";
import { FileCheck2, X } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { UploadButton } from "@/components/ui/uploader";
import { RatingInput } from "@/components/market/rating-input";
import { REVIEW_USED_FOR } from "@/lib/constants";
import { saveCompanyReview } from "@/server/actions/directory";

export type MyCompanyReview = {
  rating: number;
  title: string;
  body: string;
  pros: string | null;
  cons: string | null;
  usedFor: string | null;
  proofStatus: string;
  hasProof: boolean;
};

/** Write or edit your review of a company, with optional private proof that you used it. */
export function CompanyReviewForm({ companyId, companyName, mine }: { companyId: string; companyName: string; mine: MyCompanyReview | null }) {
  const [proof, setProof] = useState<{ id: string; name: string } | null>(null);
  return (
    <ActionForm action={saveCompanyReview} className="mt-3 space-y-4" toastOnSuccess onSuccess={() => setProof(null)}>
      <input type="hidden" name="companyId" value={companyId} />
      <RatingInput defaultValue={mine?.rating ?? 0} />
      <Field label="Headline" name="title">
        <Input name="title" defaultValue={mine?.title ?? ""} maxLength={80} placeholder="Sum it up in a few words" />
      </Field>
      <Field label="Your review" name="body" hint={`What it's like to use ${companyName}: support, payouts or fills, the software, anything a new trader should know.`}>
        <Textarea name="body" rows={5} defaultValue={mine?.body ?? ""} maxLength={3000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What's good" name="pros" optional>
          <Textarea name="pros" rows={2} defaultValue={mine?.pros ?? ""} maxLength={500} />
        </Field>
        <Field label="What could be better" name="cons" optional>
          <Textarea name="cons" rows={2} defaultValue={mine?.cons ?? ""} maxLength={500} />
        </Field>
      </div>
      <Field label="How long have you used it?" name="usedFor" optional>
        <Select name="usedFor" defaultValue={mine?.usedFor ?? ""}>
          <option value="">Rather not say</option>
          {REVIEW_USED_FOR.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-xl border border-line bg-sunk/60 p-4">
        <div className="text-sm font-semibold">Proof you used it (optional)</div>
        <p className="mt-0.5 text-[13px] text-muted">
          A screenshot of your account, an invoice or a payout email. Only our team sees it, never the company or other traders. Hide account numbers first. Reviews with proof get
          a &ldquo;Proof of use&rdquo; tag once we&apos;ve looked, and we delete the file as soon as we&apos;ve checked it.
        </p>
        <input type="hidden" name="proofMediaId" value={proof?.id ?? ""} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {proof ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm ring-1 ring-line">
              <FileCheck2 className="size-4 text-up" />
              <span className="max-w-[220px] truncate">{proof.name}</span>
              <button type="button" className="text-muted hover:text-ink" onClick={() => setProof(null)} aria-label="Remove this file">
                <X className="size-4" />
              </button>
            </span>
          ) : (
            <UploadButton
              purpose="proof"
              accept="image/*,application/pdf"
              label={mine?.hasProof ? "Replace your proof" : "Add proof"}
              onUploaded={(u) => setProof({ id: u.id, name: u.name })}
            />
          )}
          {!proof && mine?.hasProof ? (
            <span className="text-xs text-muted">
              {mine.proofStatus === "VERIFIED" ? "Your proof was accepted." : mine.proofStatus === "REJECTED" ? "We couldn't accept your last proof." : "We have your proof and will look soon."}
            </span>
          ) : null}
        </div>
      </div>

      <FormMessage hideSuccess />
      <SubmitButton>{mine ? "Update review" : "Post review"}</SubmitButton>
    </ActionForm>
  );
}
