"use client";

import { useState, type MouseEvent } from "react";
import { Check, CircleDollarSign, FileText, LifeBuoy, Mail, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { ActionForm, Field, FieldError, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { FilesField, ImageField } from "@/components/ui/uploader";
import { MARKETS, SOCIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  bookFeatured,
  decideApplication,
  inviteCreator,
  payDeal,
  requestChanges,
  saveBusinessOffer,
  saveCampaign,
  saveListing,
  startClaim,
  submitClaimDocuments,
  verifyClaimCode,
} from "@/server/actions/business";
import { answerInvite, applyToCampaign, disputeDeal, submitDealWork } from "@/server/actions/deals";

function confirmFirst(message: string) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}

function Chips({ name, options, picked }: { name: string; options: { value: string; label: string }[]; picked: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
          <input type="checkbox" name={name} value={o.value} defaultChecked={picked.includes(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ───────────────────────────── Claiming ─────────────────────────────

/** Proving you work at the company: a code to a work email (instant), or documents our team checks. */
export function ClaimStartForm({ companyId, companyName, domain }: { companyId: string; companyName: string; domain: string }) {
  const [how, setHow] = useState<"email" | "docs">(domain ? "email" : "docs");
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-line bg-sunk p-0.5" role="tablist" aria-label="How to prove it">
        {(
          [
            { k: "email", label: "Work email", icon: <Mail className="size-4" />, off: !domain },
            { k: "docs", label: "Send documents", icon: <FileText className="size-4" />, off: false },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            disabled={t.off}
            aria-selected={how === t.k}
            onClick={() => setHow(t.k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40",
              how === t.k ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {how === "email" ? (
        <ActionForm action={startClaim} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          <p className="text-sm text-muted">
            We send a 6 digit code to an email address at <span className="font-semibold text-ink">{domain}</span>. Enter it and you run the listing straight away.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="workEmail" label="Your work email">
              <Input type="email" autoComplete="email" placeholder={`you@${domain}`} />
            </Field>
            <Field name="jobTitle" label="Your job title">
              <Input maxLength={80} placeholder="Head of marketing" />
            </Field>
          </div>
          <FormMessage />
          <SubmitButton pendingText="Sending the code">
            <Send /> Send me a code
          </SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={submitClaimDocuments} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          <p className="text-sm text-muted">
            {domain ? "No email at the company's domain? " : `${companyName}'s website can't be checked by email. `}
            Send something that shows you work at {companyName}, like a letter on company paper or a business registration with your name. Only our team sees it, and we
            delete it once we&apos;ve decided.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="jobTitle" label="Your job title">
              <Input maxLength={80} placeholder="Founder" />
            </Field>
            <Field name="workEmail" label="Email we can reach you at" optional hint="Your account email if you leave it empty.">
              <Input type="email" autoComplete="email" />
            </Field>
          </div>
          <Field name="message" label="How you're connected to the company" hint="At least 20 characters.">
            <Textarea rows={3} maxLength={1500} />
          </Field>
          <div>
            <div className="label">Documents</div>
            <FilesField name="documentIds" purpose="document" label="Add a document" max={5} />
            <FieldError name="documentIds" />
            <p className="hint">PDF, JPG or PNG, up to 10 MB each.</p>
          </div>
          <FormMessage />
          <SubmitButton pendingText="Sending">
            <Send /> Send to our team
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function ClaimCodeForm({ claimId }: { claimId: string }) {
  return (
    <ActionForm action={verifyClaimCode} className="space-y-4">
      <input type="hidden" name="claimId" value={claimId} />
      <Field name="code" label="6 digit code">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="num max-w-[200px] text-lg tracking-[0.3em]" placeholder="000000" />
      </Field>
      <FormMessage />
      <SubmitButton pendingText="Checking">
        <Check /> Confirm
      </SubmitButton>
    </ActionForm>
  );
}

// ───────────────────────────── The listing ─────────────────────────────

export type ListingValues = {
  companyId: string;
  tagline: string;
  description: string;
  markets: string[];
  platforms: string;
  foundedYear: string;
  headquarters: string;
  logoUrl: string | null;
};

export function ListingForm({ c }: { c: ListingValues }) {
  return (
    <ActionForm action={saveListing} toastOnSuccess className="space-y-6">
      <input type="hidden" name="companyId" value={c.companyId} />
      <section className="card space-y-5 p-5 sm:p-6">
        <div>
          <div className="label">Logo</div>
          <ImageField name="logoUrl" defaultUrl={c.logoUrl} purpose="avatar" label="Upload logo" hint="Square works best. PNG or JPG, up to 5 MB." />
        </div>
        <Field name="tagline" label="Tagline" optional hint="One line under your name, like what you offer and who it's for.">
          <Input defaultValue={c.tagline} maxLength={120} />
        </Field>
        <Field name="description" label="About" optional hint="Plain facts traders care about: what you offer, how it works, what it costs. No profit promises.">
          <Textarea defaultValue={c.description} rows={8} maxLength={4000} />
        </Field>
        <fieldset>
          <legend className="label">Markets</legend>
          <Chips name="markets" options={MARKETS} picked={c.markets} />
          <FieldError name="markets" />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="platforms" label="Platforms" optional hint="Comma separated" className="sm:col-span-3">
            <Input defaultValue={c.platforms} placeholder="NinjaTrader, Tradovate, Rithmic" />
          </Field>
          <Field name="foundedYear" label="Founded" optional>
            <Input defaultValue={c.foundedYear} inputMode="numeric" maxLength={4} />
          </Field>
          <Field name="headquarters" label="Based in" optional className="sm:col-span-2">
            <Input defaultValue={c.headquarters} maxLength={80} />
          </Field>
        </div>
      </section>
      <div className="flex items-center justify-end gap-3">
        <FormMessage hideSuccess />
        <SubmitButton>Save listing</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BusinessOfferForm({
  companyId,
  offer,
  onDone,
}: {
  companyId: string;
  offer?: { id: string; title: string; description: string; code: string; url: string; expiresAt: string };
  onDone?: () => void;
}) {
  return (
    <ActionForm action={saveBusinessOffer} className="space-y-4" resetOnSuccess={!offer} onSuccess={onDone}>
      <input type="hidden" name="companyId" value={companyId} />
      {offer ? <input type="hidden" name="offerId" value={offer.id} /> : null}
      <Field name="title" label="Offer">
        <Input defaultValue={offer?.title} maxLength={80} placeholder="For example: 20% off your first evaluation" />
      </Field>
      <Field name="description" label="Details" optional hint="Any conditions, in plain words.">
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
      <SubmitButton size="sm">
        {offer ? (
          "Save offer"
        ) : (
          <>
            <Plus /> Add offer
          </>
        )}
      </SubmitButton>
    </ActionForm>
  );
}

// ───────────────────────────── Sponsored spots ─────────────────────────────

export type WeekOption = { index: number; label: string; price: string; left: number; mine: boolean; partial: boolean };

export function FeaturedPicker({ companyId, placement, category, weeks }: { companyId: string; placement: "HOME" | "CATEGORY"; category?: string; weeks: WeekOption[] }) {
  const firstFree = weeks.find((w) => w.left > 0 && !w.mine)?.index;
  return (
    <ActionForm action={bookFeatured} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="placement" value={placement} />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <fieldset>
        <legend className="sr-only">Pick a week</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {weeks.map((w) => {
            const off = w.left <= 0 || w.mine;
            return (
              <label
                key={w.index}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary",
                  off && "cursor-not-allowed opacity-50",
                )}
              >
                <input type="radio" name="week" value={w.index} disabled={off} defaultChecked={w.index === firstFree} className="mt-1" />
                <span className="min-w-0">
                  <span className="block font-semibold">{w.label}</span>
                  <span className="num block">{w.price}</span>
                  <span className="block text-xs text-muted">{w.mine ? "You have this week" : w.left <= 0 ? "Full" : `${w.left} left${w.partial ? ", starts now" : ""}`}</span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldError name="week" />
      </fieldset>
      <FormMessage />
      <SubmitButton disabled={firstFree === undefined}>
        <CircleDollarSign /> Book and pay
      </SubmitButton>
    </ActionForm>
  );
}

// ───────────────────────────── Campaigns ─────────────────────────────

export type CampaignValues = {
  id?: string;
  status?: string;
  title: string;
  brief: string;
  deliverables: string;
  markets: string[];
  platforms: string[];
  budget: string;
  creatorsWanted: string;
  minAudience: string;
  deadline: string;
};

export function CampaignForm({ companyId, c }: { companyId: string; c?: CampaignValues }) {
  const draft = !c?.id || c.status === "DRAFT";
  return (
    <ActionForm action={saveCampaign} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {c?.id ? <input type="hidden" name="campaignId" value={c.id} /> : null}
      <section className="card space-y-5 p-5 sm:p-6">
        <Field name="title" label="Campaign name" hint="Creators see this first.">
          <Input defaultValue={c?.title} maxLength={100} placeholder="Review our new 50K evaluation on YouTube" />
        </Field>
        <Field name="brief" label="The brief" hint="What you want made, who it's for, and anything creators must include. At least 50 characters.">
          <Textarea defaultValue={c?.brief} rows={7} maxLength={4000} />
        </Field>
        <Field name="deliverables" label="What the creator delivers" hint="One per line, like '1 YouTube video, 8+ minutes' or '3 Instagram stories'.">
          <Textarea defaultValue={c?.deliverables} rows={4} maxLength={1500} placeholder={"1 YouTube video, at least 8 minutes\nLink in the description for 30 days"} />
        </Field>
      </section>
      <section className="card space-y-5 p-5 sm:p-6">
        <h2 className="text-lg">Who you&apos;re looking for</h2>
        <fieldset>
          <legend className="label">Markets</legend>
          <Chips name="markets" options={MARKETS} picked={c?.markets ?? []} />
        </fieldset>
        <fieldset>
          <legend className="label">Where they post</legend>
          <Chips name="platforms" options={SOCIALS} picked={c?.platforms ?? []} />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="minAudience" label="Smallest audience" optional hint="Followers. Creators below it can still apply.">
            <Input defaultValue={c?.minAudience} inputMode="numeric" placeholder="10000" />
          </Field>
          <Field name="creatorsWanted" label="How many creators">
            <Input defaultValue={c?.creatorsWanted ?? "1"} inputMode="numeric" />
          </Field>
        </div>
      </section>
      <section className="card space-y-5 p-5 sm:p-6">
        <h2 className="text-lg">Budget and dates</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="budget" label="Budget per creator (USD)" hint="A guide for creators. You agree the exact price with each one.">
            <Input defaultValue={c?.budget} inputMode="decimal" placeholder="500" />
          </Field>
          <Field name="deadline" label="Content live by" optional>
            <Input type="date" defaultValue={c?.deadline} />
          </Field>
        </div>
        <p className="text-sm text-muted">
          You pay each creator&apos;s price into the deal plus our 10% fee. The creator gets paid when you approve the work. Content has to be labelled as an ad, with no profit
          promises.
        </p>
      </section>
      <FormMessage />
      <div className="flex flex-wrap justify-end gap-2">
        {draft ? (
          <SubmitButton name="intent" value="draft" variant="secondary">
            Save draft
          </SubmitButton>
        ) : null}
        <SubmitButton name="intent" value="publish">
          {draft ? "Put it live" : "Save changes"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function InviteButton({
  creator,
  campaigns,
  defaultCampaignId,
}: {
  creator: { id: string; name: string };
  campaigns: { id: string; title: string; budget: string }[];
  defaultCampaignId?: string;
}) {
  return (
    <ModalButton label={<><Send /> Invite</>} title={`Invite ${creator.name}`} className="btn-sm" variant="primary">
      {(close) => (
        <ActionForm action={inviteCreator} toastOnSuccess onSuccess={close} className="space-y-4">
          <input type="hidden" name="creatorId" value={creator.id} />
          <Field name="campaignId" label="Campaign">
            <Select defaultValue={defaultCampaignId ?? campaigns[0]?.id}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.budget} budget)
                </option>
              ))}
            </Select>
          </Field>
          <Field name="price" label="Your offer (USD)" hint="What they get for the work. You pay this plus our 10%.">
            <Input inputMode="decimal" placeholder={campaigns.find((c) => c.id === defaultCampaignId)?.budget.replace(/[^\d.]/g, "") ?? "500"} />
          </Field>
          <Field name="message" label="Message" hint="Why them, and anything they should know.">
            <Textarea rows={4} maxLength={1500} />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton pendingText="Sending">
            <Send /> Send invite
          </SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function ApplicationButtons({ dealId, name }: { dealId: string; name: string }) {
  return (
    <ActionForm action={decideApplication} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <SubmitButton name="decision" value="accept" size="sm" onClick={confirmFirst(`Work with ${name} at their price? You pay into the deal next.`)}>
        <Check /> Accept
      </SubmitButton>
      <SubmitButton name="decision" value="decline" size="sm" variant="secondary">
        <X /> Decline
      </SubmitButton>
      <FormMessage hideSuccess className="w-full" />
    </ActionForm>
  );
}

// ───────────────────────────── The deal page ─────────────────────────────

export function PayDealButton({ dealId, total }: { dealId: string; total: string }) {
  return (
    <ActionForm action={payDeal} className="space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      <SubmitButton size="lg" pendingText="Opening the payment">
        <CircleDollarSign /> Pay {total} into the deal
      </SubmitButton>
      <FormMessage hideSuccess />
    </ActionForm>
  );
}

export function RequestChangesButton({ dealId }: { dealId: string }) {
  return (
    <ModalButton label={<><RotateCcw /> Ask for changes</>} title="Ask for changes">
      {(close) => (
        <ActionForm action={requestChanges} onSuccess={close} className="space-y-4">
          <input type="hidden" name="dealId" value={dealId} />
          <p className="text-sm text-ink-2">The creator sees your note and can send the work again. The money stays held in the deal.</p>
          <Field name="note" label="What needs to change">
            <Textarea rows={4} maxLength={1500} />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton pendingText="Sending">Send</SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function InviteAnswerForm({ dealId, company }: { dealId: string; company: string }) {
  return (
    <ActionForm action={answerInvite} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <SubmitButton name="decision" value="accept" onClick={confirmFirst(`Agree to do this for ${company} at the price offered?`)}>
        <Check /> Accept the invite
      </SubmitButton>
      <SubmitButton name="decision" value="decline" variant="secondary">
        <X /> No thanks
      </SubmitButton>
      <FormMessage hideSuccess className="w-full" />
    </ActionForm>
  );
}

export function ApplyForm({ campaignId, budget }: { campaignId: string; budget: string }) {
  return (
    <ActionForm action={applyToCampaign} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <Field name="price" label="Your price (USD)" hint={`Their budget is ${budget} per creator. You get your price, less card processing.`}>
        <Input inputMode="decimal" placeholder={budget.replace(/[^\d.]/g, "")} className="max-w-[200px]" />
      </Field>
      <Field name="pitch" label="Why you" hint="Your audience, what you'd make, and links to similar work.">
        <Textarea rows={5} maxLength={1500} />
      </Field>
      <FormMessage />
      <SubmitButton pendingText="Sending">
        <Send /> Apply
      </SubmitButton>
    </ActionForm>
  );
}

export function SubmitWorkForm({ dealId, links: initial }: { dealId: string; links: string[] }) {
  const [links, setLinks] = useState<string[]>(initial.length ? initial : [""]);
  return (
    <ActionForm action={submitDealWork} refreshOnSuccess className="space-y-4">
      <input type="hidden" name="dealId" value={dealId} />
      <fieldset className="space-y-2">
        <legend className="label">Links to what you made</legend>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              name="links"
              defaultValue={l}
              className="input flex-1"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              aria-label={`Link ${i + 1}`}
            />
            {links.length > 1 ? (
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}>
                <Trash2 />
              </button>
            ) : null}
          </div>
        ))}
        <FieldError name="links" />
        {links.length < 5 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinks((all) => [...all, ""])}>
            <Plus /> Add another link
          </button>
        ) : null}
      </fieldset>
      <Field name="note" label="Note for the company" optional>
        <Textarea rows={3} maxLength={1500} />
      </Field>
      <FormMessage hideSuccess />
      <SubmitButton pendingText="Sending">
        <Send /> Send the work
      </SubmitButton>
    </ActionForm>
  );
}

export function DisputeButton({ dealId }: { dealId: string }) {
  return (
    <ModalButton label={<><LifeBuoy /> Ask our team to step in</>} title="Ask our team to step in" variant="ghost" className="btn-sm">
      {(close) => (
        <ActionForm action={disputeDeal} onSuccess={close} className="space-y-4">
          <input type="hidden" name="dealId" value={dealId} />
          <p className="text-sm text-ink-2">
            Try sorting it out in messages first. If that doesn&apos;t work, tell us what happened. We look at both sides, then pay the creator, refund the company, or let the deal
            carry on. The money stays held until then.
          </p>
          <Field name="note" label="What went wrong">
            <Textarea rows={5} maxLength={2000} />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton pendingText="Sending">Send to our team</SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function EditOfferButton({ companyId, offer }: { companyId: string; offer: { id: string; title: string; description: string; code: string; url: string; expiresAt: string } }) {
  return (
    <ModalButton label="Edit" title="Edit offer" variant="ghost" className="btn-sm">
      {(close) => <BusinessOfferForm companyId={companyId} offer={offer} onDone={close} />}
    </ModalButton>
  );
}
