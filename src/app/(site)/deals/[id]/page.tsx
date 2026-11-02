import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleAlert, ExternalLink, Scale } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, hostname, money, orderNumber } from "@/lib/utils";
import { requireVerifiedUser } from "@/server/dal";
import { DEAL_APPROVE_DAYS, DEAL_STATUS, businessPaymentPath, dealTotals } from "@/server/business";
import { approveDealWork, cancelDealAsCompany } from "@/server/actions/business";
import { cancelDealAsCreator, withdrawApplication } from "@/server/actions/deals";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { KeyValue, Notice } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { MessageButton } from "@/components/message-button";
import { cn } from "@/lib/utils";
import {
  ApplicationButtons,
  DisputeButton,
  InviteAnswerForm,
  PayDealButton,
  RequestChangesButton,
  SubmitWorkForm,
} from "@/components/business/forms";

export const metadata: Metadata = { title: "Campaign deal", robots: { index: false } };

const DAY = 86_400_000;
const STEPS = ["Agreed", "Paid in", "Work sent", "Approved"];
const STEP_OF: Record<string, number> = { APPLIED: 0, INVITED: 0, ACCEPTED: 1, FUNDED: 2, SUBMITTED: 3, APPROVED: 4, PAID: 4 };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser();
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      campaign: { include: { createdBy: { select: { id: true, displayName: true } } } },
      company: true,
      creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      orders: { where: { status: { not: "PENDING" } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) notFound();
  const isCreator = deal.creatorId === user.id;
  const member = isCreator ? null : await db.businessMember.findUnique({ where: { companyId_userId: { companyId: deal.companyId, userId: user.id } } });
  const isTeam = Boolean(member);
  const isStaff = user.isAdmin && !isCreator && !isTeam;
  if (!isCreator && !isTeam && !isStaff) notFound();

  const t = dealTotals(deal.priceCents);
  const paid = deal.orders.find((o) => ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"].includes(o.status)) ?? null;
  const step = STEP_OF[deal.status] ?? 0;
  const ended = deal.status === "DECLINED" || deal.status === "CANCELED";
  const disputeOpen = Boolean(deal.disputedAt && !deal.resolvedAt);
  const links = deal.submissionUrl?.split("\n").filter(Boolean) ?? [];
  const autoOn = deal.submittedAt ? new Date(deal.submittedAt.getTime() + DEAL_APPROVE_DAYS * DAY) : null;
  const back = isCreator
    ? { href: "/creator/campaigns", label: "Brand deals" }
    : isTeam
      ? { href: `/business/${deal.company.slug}/campaigns/${deal.campaignId}`, label: deal.campaign.title }
      : { href: "/admin/deals?tab=all", label: "Deals" };
  const status = DEAL_STATUS[deal.status];

  return (
    <div className="container-tt max-w-5xl py-8 sm:py-10">
      <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        ← {back.label}
      </Link>
      <div className="kicker">Campaign deal</div>
      <h1 className="mt-2 text-[28px] sm:text-[32px]">{deal.campaign.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href={`/directory/c/${deal.company.slug}`} className="flex items-center gap-2.5">
          <Avatar src={deal.company.logoUrl} name={deal.company.name} size={36} square />
          <span>
            <span className="block text-xs text-muted">Company</span>
            <span className="block font-semibold">{deal.company.name}</span>
          </span>
        </Link>
        <Link href={`/@${deal.creator.username}`} className="flex items-center gap-2.5">
          <Avatar src={deal.creator.avatarUrl} name={deal.creator.displayName} size={36} />
          <span>
            <span className="block text-xs text-muted">Creator</span>
            <span className="block font-semibold">{deal.creator.displayName}</span>
          </span>
        </Link>
        <span className={`badge ${status?.tone ?? "badge-outline"}`}>{status?.label ?? deal.status}</span>
      </div>

      {!ended ? (
        <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Progress">
          {STEPS.map((s, i) => {
            const done = step > i;
            const now = step === i;
            return (
              <li key={s} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", done ? "border-up/30 bg-up-soft text-up" : now ? "border-line-strong bg-card font-semibold" : "border-line text-muted")}>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold", done ? "bg-up text-white" : "bg-sunk text-muted")}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {disputeOpen ? (
            <Notice tone="warn" title="Our team is looking at this deal">
              {deal.disputedById === deal.creatorId ? deal.creator.displayName : deal.company.name} asked us to step in: &ldquo;{deal.disputeNote}&rdquo;. The money stays held and
              nothing is approved automatically until we decide.
            </Notice>
          ) : deal.resolvedAt && deal.resolutionNote ? (
            <Notice tone="plain" title={`Decided ${formatDate(deal.resolvedAt)}`}>
              {deal.resolutionNote}
            </Notice>
          ) : null}

          {/* What happens next, for whoever is looking. */}
          <Panel title={ended ? "This deal is over" : "Next step"}>
            <NextStep
              deal={deal}
              role={isCreator ? "creator" : isTeam ? "team" : "staff"}
              totals={{ total: money(t.totalCents, { exact: true }), net: money(t.creatorNetCents, { exact: true }) }}
              links={links}
              autoOn={autoOn}
              disputeOpen={disputeOpen}
              refunded={paid?.status === "REFUNDED"}
              testMode={businessPaymentPath() === "test"}
            />
          </Panel>

          {links.length && deal.status !== "SUBMITTED" ? (
            <Panel title="The work">
              <WorkLinks links={links} note={deal.submissionNote} />
            </Panel>
          ) : null}

          <Panel title="The brief">
            <p className="text-[15px] whitespace-pre-line text-ink-2">{deal.campaign.brief}</p>
            <div className="mt-4 text-sm font-semibold">What the creator delivers</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-2">
              {deal.campaign.deliverables.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {deal.pitch ? (
              <div className="mt-5 rounded-lg bg-sunk px-4 py-3">
                <div className="text-xs font-semibold text-muted">{deal.invitedAt ? `${deal.company.name}'s invite` : `${deal.creator.displayName}'s pitch`}</div>
                <p className="mt-1 text-sm whitespace-pre-line">{deal.pitch}</p>
              </div>
            ) : null}
            <p className="mt-4 text-xs text-muted">Content made for a deal has to be labelled as an ad (#ad or the platform&apos;s paid partnership label), with no profit promises.</p>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Money">
            <KeyValue
              className="-my-2.5"
              items={
                isCreator
                  ? [
                      { label: "Agreed price", value: money(deal.priceCents, { exact: true }) },
                      { label: "Card processing", value: `−${money(t.processingCents, { exact: true })}` },
                      { label: "You get", value: money(t.creatorNetCents, { exact: true }) },
                    ]
                  : [
                      { label: "Creator's price", value: money(deal.priceCents, { exact: true }) },
                      { label: "TraderTrades fee (10%)", value: money(t.feeCents, { exact: true }) },
                      { label: isTeam ? "You pay" : "Company pays", value: money(t.totalCents, { exact: true }) },
                      ...(isStaff ? [{ label: "Creator gets", value: money(t.creatorNetCents, { exact: true }) }] : []),
                    ]
              }
            />
            <p className="mt-3 text-xs text-muted">
              {isCreator
                ? "The company pays in first, so you know the money is there. It reaches your balance when they approve the work."
                : "Held in the deal until you approve the work. If the creator doesn't deliver, you get it back, our fee included."}
            </p>
            {paid ? (
              <p className="mt-2 text-xs text-muted">
                Order {orderNumber(paid.number)}
                {paid.provider === "TEST" ? " · test payment" : ""}
                {paid.status === "REFUNDED" ? " · refunded" : ""}
              </p>
            ) : null}
          </Panel>
          <Panel title="Dates">
            <KeyValue
              className="-my-2.5"
              items={[
                { label: deal.invitedAt ? "Invited" : "Applied", value: formatDate(deal.invitedAt ?? deal.createdAt) },
                ...(deal.acceptedAt ? [{ label: "Agreed", value: formatDate(deal.acceptedAt) }] : []),
                ...(deal.fundedAt ? [{ label: "Paid in", value: formatDate(deal.fundedAt) }] : []),
                ...(deal.submittedAt ? [{ label: "Work sent", value: formatDate(deal.submittedAt) }] : []),
                ...(deal.approvedAt ? [{ label: "Approved", value: formatDate(deal.approvedAt) }] : []),
                ...(deal.canceledAt ? [{ label: "Canceled", value: formatDate(deal.canceledAt) }] : []),
                ...(deal.campaign.deadline ? [{ label: "Live by", value: formatDate(deal.campaign.deadline) }] : []),
              ]}
            />
          </Panel>
          {isCreator ? (
            <MessageButton toId={deal.campaign.createdBy.id} toName={deal.company.name} subject={deal.campaign.title} label={`Message ${deal.company.name}`} className="w-full" />
          ) : isTeam ? (
            <MessageButton toId={deal.creator.id} toName={deal.creator.displayName} subject={deal.campaign.title} label={`Message ${deal.creator.displayName}`} className="w-full" />
          ) : (
            <Link href="/admin/deals" className="btn btn-secondary w-full">
              <Scale /> Deal disputes
            </Link>
          )}
          {(isCreator || isTeam) && (deal.status === "FUNDED" || deal.status === "SUBMITTED") && !disputeOpen ? (
            <div className="text-center">
              <DisputeButton dealId={deal.id} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function WorkLinks({ links, note }: { links: string[]; note: string | null }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l}>
            <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 font-semibold hover:underline">
              <span className="truncate">{hostname(l)}</span>
              <span className="truncate font-normal text-muted">{l.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
      {note ? <p className="rounded-lg bg-sunk px-4 py-3 text-sm whitespace-pre-line">{note}</p> : null}
    </div>
  );
}

type DealForStep = {
  id: string;
  status: string;
  priceCents: number;
  changesNote: string | null;
  approvedAt: Date | null;
  canceledAt: Date | null;
  submissionNote: string | null;
  company: { name: string };
  creator: { displayName: string };
};

function NextStep({
  deal,
  role,
  totals,
  links,
  autoOn,
  disputeOpen,
  refunded,
  testMode,
}: {
  deal: DealForStep;
  role: "creator" | "team" | "staff";
  totals: { total: string; net: string };
  links: string[];
  autoOn: Date | null;
  disputeOpen: boolean;
  refunded: boolean;
  testMode: boolean;
}) {
  const co = deal.company.name;
  const cr = deal.creator.displayName;
  const p = (text: React.ReactNode) => <p className="text-sm text-ink-2">{text}</p>;
  switch (deal.status) {
    case "APPLIED":
      if (role === "team") return <div className="space-y-3">{p(`${cr} applied at ${money(deal.priceCents, { exact: true })}. Accept to agree the price, then pay into the deal.`)}<ApplicationButtons dealId={deal.id} name={cr} /></div>;
      if (role === "creator")
        return (
          <div className="space-y-3">
            {p(`You applied. ${co} will accept or decline, and you'll get a notice either way.`)}
            <ActionButton action={withdrawApplication} fields={{ dealId: deal.id }} variant="ghost" confirm="Withdraw your application?">
              Withdraw application
            </ActionButton>
          </div>
        );
      return p("Waiting for the company to answer the application.");
    case "INVITED":
      if (role === "creator") return <div className="space-y-3">{p(`${co} invited you at ${money(deal.priceCents, { exact: true })}. Say yes and they pay into the deal before you start.`)}<InviteAnswerForm dealId={deal.id} company={co} /></div>;
      if (role === "team")
        return (
          <div className="space-y-3">
            {p(`Waiting for ${cr} to answer your invite.`)}
            <ActionButton action={cancelDealAsCompany} fields={{ dealId: deal.id }} variant="ghost" confirm="Withdraw the invite?">
              Withdraw invite
            </ActionButton>
          </div>
        );
      return p("Waiting for the creator to answer the invite.");
    case "ACCEPTED":
      if (role === "team")
        return (
          <div className="space-y-3">
            {p(`You and ${cr} agreed ${money(deal.priceCents, { exact: true })}. Pay it into the deal (plus our 10%) so they can start. They're only paid when you approve the work.`)}
            {testMode ? <p className="text-xs text-warn">Test mode: the payment page uses a test card and no real money moves.</p> : null}
            <PayDealButton dealId={deal.id} total={totals.total} />
            <ActionButton action={cancelDealAsCompany} fields={{ dealId: deal.id }} variant="ghost" confirm="Call off this deal? No money has moved yet.">
              Call it off
            </ActionButton>
          </div>
        );
      if (role === "creator")
        return (
          <div className="space-y-3">
            {p(`Agreed. Waiting for ${co} to pay in. Don't start until it says paid in: you'll get a notice.`)}
            <ActionButton action={cancelDealAsCreator} fields={{ dealId: deal.id }} variant="ghost" confirm="Pull out of this deal?">
              Pull out
            </ActionButton>
          </div>
        );
      return p("Agreed, waiting for the company to pay in.");
    case "FUNDED":
      if (role === "creator")
        return (
          <div className="space-y-4">
            {deal.changesNote ? (
              <Notice tone="warn" title={`${co} asked for changes`}>
                {deal.changesNote}
              </Notice>
            ) : (
              p(`${co} paid in. Make the content, post it, then send the links here. You get ${totals.net} when they approve it.`)
            )}
            <SubmitWorkForm dealId={deal.id} links={deal.changesNote ? links : []} />
            <div className="border-t border-line pt-3">
              <ActionButton action={cancelDealAsCreator} fields={{ dealId: deal.id }} variant="ghost" confirm={`Pull out? ${co} gets all its money back.`}>
                Pull out and refund {co}
              </ActionButton>
            </div>
          </div>
        );
      if (role === "team")
        return (
          <div className="space-y-3">
            {deal.changesNote ? (
              <Notice tone="plain" title="You asked for changes">
                {deal.changesNote}
              </Notice>
            ) : null}
            {p(`${cr} is making it. You'll get a notice when the work arrives.`)}
          </div>
        );
      return p("Paid in. The creator is making the content.");
    case "SUBMITTED":
      if (role === "team")
        return (
          <div className="space-y-4">
            <WorkLinks links={links} note={deal.submissionNote} />
            {p(
              disputeOpen
                ? "Our team is deciding, so this won't be approved automatically."
                : `Check it, then approve or ask for changes. ${autoOn ? `If nobody answers by ${formatDate(autoOn)}, it's approved automatically.` : ""}`,
            )}
            <div className="flex flex-wrap gap-2">
              <ActionButton action={approveDealWork} fields={{ dealId: deal.id }} variant="primary" size="md" confirm={`Approve the work? ${cr} gets paid, and this can't be undone.`}>
                <Check /> Approve and pay
              </ActionButton>
              <RequestChangesButton dealId={deal.id} />
            </div>
          </div>
        );
      if (role === "creator")
        return (
          <div className="space-y-3">
            <WorkLinks links={links} note={deal.submissionNote} />
            {p(disputeOpen ? "Our team is deciding." : `Sent. ${co} can approve it or ask for changes${autoOn ? `. If they don't answer by ${formatDate(autoOn)}, it's approved automatically` : ""}.`)}
          </div>
        );
      return <WorkLinks links={links} note={deal.submissionNote} />;
    case "APPROVED":
    case "PAID":
      return (
        <div className="flex items-start gap-2 text-sm text-ink-2">
          <Check className="mt-0.5 size-4 shrink-0 text-up" />
          <span>
            Approved {deal.approvedAt ? formatDate(deal.approvedAt) : ""}.{" "}
            {role === "creator" ? (
              <>
                {totals.net} is in your balance. See it in{" "}
                <Link href="/creator/payouts" className="link">
                  payouts
                </Link>
                .
              </>
            ) : (
              `${cr} has been paid.`
            )}
          </span>
        </div>
      );
    case "DECLINED":
      return p("Declined. Nothing was agreed and no money moved.");
    case "CANCELED":
      return (
        <div className="flex items-start gap-2 text-sm text-ink-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            Canceled {deal.canceledAt ? formatDate(deal.canceledAt) : ""}. {refunded ? `${co} got its money back, our fee included.` : "No money had moved."}
          </span>
        </div>
      );
    default:
      return null;
  }
}
