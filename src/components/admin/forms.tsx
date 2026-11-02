"use client";

import type { MouseEvent } from "react";
import { Ban, Check, CircleCheck, Handshake, Link2, Plus, RotateCcw, Square, X } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import {
  cancelFeatured,
  decideClaim,
  decideDispute,
  decideProof,
  decideSuggestion,
  decideVerification,
  refundOrderAsAdmin,
  resolveDealDispute,
  resolveFlag,
  resolveReport,
  saveCompany,
  saveOffer,
  setAccountStatus,
  takeDownListing,
} from "@/server/actions/admin";

/** Asks before a button that changes something for someone else. */
function confirmFirst(message: string) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

// ───────────────────────────── Reports and flags ─────────────────────────────

export function ResolveReportForm({ reportId, takedownLabel, gone, count }: { reportId: string; takedownLabel: string; gone: boolean; count: number }) {
  return (
    <ActionForm action={resolveReport} className="space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <Field name="note" label="Note to the owner" optional hint="Used as the reason if you take it down. Leave it empty to use the report reason.">
        <Textarea rows={2} maxLength={1000} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        {gone ? (
          <SubmitButton name="outcome" value="takedown" variant="secondary" size="sm">
            <CircleCheck /> Close as handled
          </SubmitButton>
        ) : (
          <SubmitButton name="outcome" value="takedown" variant="danger" size="sm" onClick={confirmFirst(`${takedownLabel}? The owner is told why.`)}>
            <Ban /> {takedownLabel}
          </SubmitButton>
        )}
        <SubmitButton name="outcome" value="dismiss" variant="secondary" size="sm">
          <X /> {count > 1 ? `Dismiss all ${count}` : "Dismiss"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResolveFlagForm({ flagId, takedownLabel, gone }: { flagId: string; takedownLabel: string; gone: boolean }) {
  return (
    <ActionForm action={resolveFlag} className="space-y-3">
      <input type="hidden" name="flagId" value={flagId} />
      <Field name="note" label="Note to the owner" optional hint="Used as the reason if you take it down.">
        <Textarea rows={2} maxLength={1000} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="outcome" value="clear" variant="secondary" size="sm">
          <Check /> It&apos;s fine
        </SubmitButton>
        {gone ? (
          <SubmitButton name="outcome" value="takedown" variant="secondary" size="sm">
            <CircleCheck /> Close as handled
          </SubmitButton>
        ) : (
          <SubmitButton name="outcome" value="takedown" variant="danger" size="sm" onClick={confirmFirst(`${takedownLabel}? The owner is told why.`)}>
            <Ban /> {takedownLabel}
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}

// ───────────────────────────── Verification, suggestions, proof ─────────────────────────────

export function VerificationDecisionForm({ requestId, kind }: { requestId: string; kind: "IDENTITY" | "SOCIALS" }) {
  return (
    <ActionForm action={decideVerification} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <Field
        name="note"
        label="Reason, if you turn it down"
        hint={kind === "IDENTITY" ? "For example: the photo is blurry, or the name doesn't match the ID." : "For example: the code isn't in the Instagram bio."}
      >
        <Textarea rows={2} maxLength={500} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" variant="primary" size="sm">
          <Check /> Approve
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary" size="sm">
          <X /> Turn down
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SuggestionDecisionForm({ suggestionId, likelySlug }: { suggestionId: string; likelySlug?: string }) {
  return (
    <ActionForm action={decideSuggestion} className="space-y-3">
      <input type="hidden" name="suggestionId" value={suggestionId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="existing" label="Already listed as" optional hint="Its page address or slug, if we have it.">
          <Input defaultValue={likelySlug ?? ""} placeholder="for example topstep" />
        </Field>
        <Field name="note" label="Reason, if you say no" optional hint="They see this.">
          <Input maxLength={500} />
        </Field>
      </div>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="add" variant="primary" size="sm">
          <Plus /> Add it
        </SubmitButton>
        <SubmitButton name="decision" value="exists" variant="secondary" size="sm">
          <Link2 /> Already listed
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary" size="sm">
          <X /> Say no
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProofDecisionForm({ reviewId }: { reviewId: string }) {
  return (
    <ActionForm action={decideProof} className="space-y-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Field name="note" label="Reason, if it doesn't show they used it" optional>
        <Input maxLength={300} placeholder="For example: the screenshot doesn't show the company's name" />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="verify" variant="primary" size="sm">
          <Check /> Confirm proof
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary" size="sm">
          <X /> Not enough
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

// ───────────────────────────── Money ─────────────────────────────

export function DisputeDecisionForm({ refundId, amount }: { refundId: string; amount: string }) {
  return (
    <ActionForm action={decideDispute} className="space-y-3">
      <input type="hidden" name="refundId" value={refundId} />
      <Field name="note" label="Your decision, in a sentence or two" hint="The buyer and the creator both see this.">
        <Textarea rows={3} maxLength={800} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="refund" variant="primary" size="sm" onClick={confirmFirst(`Refund ${amount} to the buyer?`)}>
          <RotateCcw /> Refund {amount}
        </SubmitButton>
        <SubmitButton name="decision" value="deny" variant="secondary" size="sm">
          <X /> No refund
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

const REFUND_EXPLAINER: Record<string, (left: string) => string> = {
  CAMPAIGN: (left) => `This gives the company the ${left} it paid into the deal, our fee included, and cancels the deal. The creator isn't paid.`,
  FEATURED: (left) => `This gives the company the ${left} that's left and ends the Sponsored spot now.`,
};

export function AdminRefundButton({ orderId, left, label, kind = "PURCHASE" }: { orderId: string; left: string; label: string; kind?: string }) {
  const explain = REFUND_EXPLAINER[kind]?.(left) ?? `This refunds the ${left} that's left on the order to the buyer's card and takes away their access. The creator's share comes out of their balance.`;
  return (
    <ModalButton label={<><RotateCcw /> Refund</>} title={`Refund ${label}`} className="btn-sm">
      <ActionForm action={refundOrderAsAdmin} className="space-y-4">
        <input type="hidden" name="orderId" value={orderId} />
        <p className="text-sm text-ink-2">{explain}</p>
        <Field name="note" label="Why" hint={kind === "FEATURED" ? "The company sees this." : "Both sides see this."}>
          <Textarea rows={3} maxLength={500} />
        </Field>
        <FormMessage hideSuccess />
        <SubmitButton variant="danger" pendingText="Refunding">
          <RotateCcw /> Refund {left}
        </SubmitButton>
      </ActionForm>
    </ModalButton>
  );
}

// ───────────────────────────── Business ─────────────────────────────

export function ClaimDecisionForm({ claimId, company }: { claimId: string; company: string }) {
  return (
    <ActionForm action={decideClaim} className="space-y-3">
      <input type="hidden" name="claimId" value={claimId} />
      <Field name="note" label="Reason, if you turn it down" hint="They see this, so say what would prove it.">
        <Textarea rows={3} maxLength={800} placeholder="For example: the letter doesn't show your name, or it's for a different company" />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" variant="primary" size="sm" onClick={confirmFirst(`Let them run ${company}'s listing?`)}>
          <Check /> Approve
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary" size="sm">
          <X /> Turn down
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DealDisputeForm({ dealId, price, total }: { dealId: string; price: string; total: string }) {
  return (
    <ActionForm action={resolveDealDispute} className="space-y-3">
      <input type="hidden" name="dealId" value={dealId} />
      <Field name="note" label="Your decision, in a sentence or two" hint="The company and the creator both see this.">
        <Textarea rows={3} maxLength={1000} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="pay" variant="primary" size="sm" onClick={confirmFirst(`Pay the creator ${price}? This can't be undone.`)}>
          <Handshake /> Pay the creator
        </SubmitButton>
        <SubmitButton name="decision" value="refund" variant="secondary" size="sm" onClick={confirmFirst(`Give the company back ${total}? The deal ends.`)}>
          <RotateCcw /> Refund the company
        </SubmitButton>
        <SubmitButton name="decision" value="continue" variant="ghost" size="sm">
          Let it carry on
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CancelFeaturedButton({ slotId, company }: { slotId: string; company: string }) {
  return (
    <ModalButton label={<><Square /> End early</>} title={`End ${company}'s Sponsored spot`} className="btn-sm" variant="ghost">
      <ActionForm action={cancelFeatured} className="space-y-4">
        <input type="hidden" name="slotId" value={slotId} />
        <p className="text-sm text-ink-2">The spot stops showing straight away. With a refund, the company gets back the days it hasn&apos;t had yet.</p>
        <Field name="reason" label="Why" hint="The company sees this.">
          <Textarea rows={3} maxLength={800} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="refund" defaultChecked className="checkbox" /> Refund the unused days
        </label>
        <FormMessage hideSuccess />
        <SubmitButton variant="danger" pendingText="Ending it">
          <Square /> End the spot
        </SubmitButton>
      </ActionForm>
    </ModalButton>
  );
}

// ───────────────────────────── Listings and accounts ─────────────────────────────

export function TakeDownListingButton({ productId, title }: { productId: string; title: string }) {
  return (
    <ModalButton label={<><Ban /> Take down</>} title={`Take down "${title}"`} className="btn-sm" variant="ghost">
      <ActionForm action={takeDownListing} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <p className="text-sm text-ink-2">The listing comes off the marketplace and nobody new can buy it. People who already bought keep their access.</p>
        <Field name="reason" label="Why" hint="The creator sees this, so say which rule it breaks and what they can change.">
          <Textarea rows={3} maxLength={800} />
        </Field>
        <FormMessage hideSuccess />
        <SubmitButton variant="danger" pendingText="Taking it down">
          <Ban /> Take it down
        </SubmitButton>
      </ActionForm>
    </ModalButton>
  );
}

export function AccountStatusForm({ userId, status, reason }: { userId: string; status: "ACTIVE" | "SUSPENDED" | "BANNED"; reason: string | null }) {
  return (
    <ActionForm action={setAccountStatus} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field name="status" label="Account">
        <Select defaultValue={status}>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">On hold (can sign in and open what they bought, can&apos;t post or sell)</option>
          <option value="BANNED">Banned (signed out and can&apos;t sign in)</option>
        </Select>
      </Field>
      <Field name="reason" label="Reason" hint="Needed to put an account on hold or ban it. They see it.">
        <Textarea rows={2} maxLength={800} defaultValue={reason ?? ""} />
      </Field>
      <FormMessage hideSuccess />
      <SubmitButton size="sm">Save</SubmitButton>
    </ActionForm>
  );
}

// ───────────────────────────── Directory ─────────────────────────────

export type CompanyFormValues = {
  id?: string;
  name: string;
  slug: string;
  primaryCategory: string;
  categories: string[];
  tagline: string;
  description: string;
  website: string;
  affiliateUrl: string;
  markets: string[];
  platforms: string;
  foundedYear: string;
  headquarters: string;
  status: "PUBLISHED" | "HIDDEN";
  lastChecked: string | null;
};

export function CompanyForm({
  company,
  categories,
  markets,
}: {
  company?: CompanyFormValues;
  categories: { value: string; label: string }[];
  markets: { value: string; label: string }[];
}) {
  const c = company;
  return (
    <ActionForm action={saveCompany} className="space-y-5">
      {c?.id ? <input type="hidden" name="companyId" value={c.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Name">
          <Input defaultValue={c?.name} maxLength={80} />
        </Field>
        <Field name="slug" label="Page address" optional hint="tradertrades.com/directory/c/…  Made from the name if empty.">
          <Input defaultValue={c?.slug} maxLength={80} />
        </Field>
        <Field name="website" label="Website">
          <Input defaultValue={c?.website} placeholder="https://" inputMode="url" />
        </Field>
        <Field name="affiliateUrl" label="Affiliate link" optional hint="Visit buttons use this when it's set. Pages say we may earn from links.">
          <Input defaultValue={c?.affiliateUrl} placeholder="https://" inputMode="url" />
        </Field>
        <Field name="primaryCategory" label="Main category">
          <Select defaultValue={c?.primaryCategory ?? ""}>
            <option value="" disabled>
              Pick one
            </option>
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="status" label="Shown in the directory">
          <Select defaultValue={c?.status ?? "PUBLISHED"}>
            <option value="PUBLISHED">Yes, published</option>
            <option value="HIDDEN">No, hidden</option>
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="label">Also listed under</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <label key={cat.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
              <input type="checkbox" name="categories" value={cat.value} defaultChecked={c?.categories.includes(cat.value)} className="sr-only" />
              {cat.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field name="tagline" label="One line about it" optional>
        <Input defaultValue={c?.tagline} maxLength={140} />
      </Field>
      <Field name="description" label="About" optional hint="Plain facts only. No ratings or opinions; those come from reviews.">
        <Textarea rows={6} defaultValue={c?.description} maxLength={4000} />
      </Field>

      <fieldset>
        <legend className="label">Markets</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {markets.map((m) => (
            <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
              <input type="checkbox" name="markets" value={m.value} defaultChecked={c?.markets.includes(m.value)} className="sr-only" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="platforms" label="Platforms" optional hint="Comma separated" className="sm:col-span-3">
          <Input defaultValue={c?.platforms} placeholder="NinjaTrader, Tradovate, Rithmic" />
        </Field>
        <Field name="foundedYear" label="Founded" optional>
          <Input defaultValue={c?.foundedYear} inputMode="numeric" maxLength={4} />
        </Field>
        <Field name="headquarters" label="Based in" optional className="sm:col-span-2">
          <Input defaultValue={c?.headquarters} maxLength={80} />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-sunk/50 p-4 text-sm">
        <input type="checkbox" name="checked" className="checkbox mt-0.5" />
        <span>
          <span className="font-semibold">I checked these details on their website today</span>
          <span className="mt-0.5 block text-muted">
            {c?.lastChecked ? `Last checked ${c.lastChecked}.` : "Not checked yet."} The page shows the date instead of &quot;Not checked yet&quot;.
          </span>
        </span>
      </label>

      <FormMessage hideSuccess />
      <SubmitButton>{c?.id ? "Save" : "Add company"}</SubmitButton>
    </ActionForm>
  );
}

export function OfferForm({
  companyId,
  offer,
}: {
  companyId: string;
  offer?: { id: string; title: string; description: string; code: string; url: string; expiresAt: string };
}) {
  return (
    <ActionForm action={saveOffer} className="space-y-4" resetOnSuccess={!offer}>
      <input type="hidden" name="companyId" value={companyId} />
      {offer ? <input type="hidden" name="offerId" value={offer.id} /> : null}
      <Field name="title" label="Offer">
        <Input defaultValue={offer?.title} maxLength={80} placeholder="For example: 20% off your first evaluation" />
      </Field>
      <Field name="description" label="Details" optional>
        <Input defaultValue={offer?.description} maxLength={300} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="code" label="Code" optional>
          <Input defaultValue={offer?.code} maxLength={40} />
        </Field>
        <Field name="url" label="Link" optional className="sm:col-span-2">
          <Input defaultValue={offer?.url} placeholder="https://" inputMode="url" />
        </Field>
        <Field name="expiresAt" label="Ends" optional>
          <Input type="date" defaultValue={offer?.expiresAt} />
        </Field>
      </div>
      <FormMessage hideSuccess />
      <SubmitButton size="sm">{offer ? "Save offer" : <><Plus /> Add offer</>}</SubmitButton>
    </ActionForm>
  );
}
