import Link from "next/link";
import type { AuditLog } from "@/generated/prisma/client";
import { formatDateTime, timeAgo, truncate } from "@/lib/utils";

/** Plain words for the actions people look for most. Anything else falls back to its code name. */
const LABELS: Record<string, string> = {
  "user.signup": "Signed up",
  "user.login": "Signed in",
  "user.delete": "Deleted their account",
  "user.email.change": "Changed their email",
  "user.email.verified": "Confirmed their email",
  "user.password.change": "Changed their password",
  "user.password.reset": "Reset their password",
  "user.username.change": "Changed their username",
  "user.active": "Made an account active",
  "user.suspended": "Put an account on hold",
  "user.banned": "Banned an account",
  "creator.start": "Started selling",
  "product.create": "Made a listing",
  "product.publish": "Put a listing live",
  "product.unpublish": "Took their listing off sale",
  "product.update": "Edited a listing",
  "product.archive": "Archived a listing",
  "product.delete": "Deleted a listing",
  "product.checked": "Checked a new listing",
  "product.takedown": "Took a listing down",
  "product.restore": "Put a listing back up",
  "order.paid": "Order paid",
  "order.test_payment": "Test order paid",
  "refund.request": "Asked for a refund",
  "refund.process": "Refunded an order",
  "refund.deny": "Said no to a refund",
  "refund.escalate": "Refund sent to our team",
  "refund.admin_deny": "Decided no refund",
  "refund.outside": "Refund made outside the site",
  "report.dismiss": "Dismissed a report",
  "report.takedown": "Took down something reported",
  "flag.clear": "Cleared a flag",
  "flag.takedown": "Took down something flagged",
  "verification.request": "Asked for a badge",
  "verification.approve": "Approved a badge",
  "verification.reject": "Turned down a badge",
  "verification.revoke_id": "Removed an ID badge",
  "verification.revoke_socials": "Removed a socials badge",
  "suggestion.add": "Added a suggested company",
  "suggestion.exists": "Linked a suggestion to a listed company",
  "suggestion.reject": "Said no to a suggestion",
  "company.create": "Added a company",
  "company.update": "Edited a company",
  "offer.create": "Added an offer",
  "offer.update": "Edited an offer",
  "offer.on": "Turned an offer on",
  "offer.off": "Turned an offer off",
  "offer.delete": "Deleted an offer",
  "review.proof_verify": "Confirmed review proof",
  "review.proof_reject": "Turned down review proof",
  "booking.create": "Booked a call",
  "booking.move": "Moved a call",
  "booking.cancel": "Canceled a call",
  "booking.done": "Marked a call done",
  "booking.no_show": "Marked a no-show",
  "claim.start": "Started claiming a listing",
  "claim.documents": "Sent documents to claim a listing",
  "claim.verified": "Claimed a listing with a work email",
  "claim.approved": "Approved a listing claim",
  "claim.rejected": "Turned down a listing claim",
  "company.edit_by_team": "Company team edited its listing",
  "team.leave": "Left a company's team",
  "team.remove": "Removed someone from a company's team",
  "team.role": "Changed a team member's role",
  "featured.start": "Started booking a Sponsored spot",
  "featured.booked": "Booked a Sponsored spot",
  "featured.canceled": "Ended a Sponsored spot",
  "featured.refunded": "Refunded a Sponsored spot",
  "campaign.create": "Made a campaign",
  "campaign.update": "Edited a campaign",
  "campaign.publish": "Put a campaign live",
  "campaign.open": "Opened a campaign",
  "campaign.close": "Closed a campaign",
  "deal.apply": "Applied to a campaign",
  "deal.invite": "Invited a creator to a campaign",
  "deal.accept": "Accepted a creator's application",
  "deal.decline": "Declined a creator's application",
  "deal.invite_accept": "Said yes to a campaign invite",
  "deal.invite_decline": "Said no to a campaign invite",
  "deal.pay_start": "Started paying into a deal",
  "deal.funded": "Paid into a deal",
  "deal.submit": "Sent the work for a deal",
  "deal.changes": "Asked for changes on a deal",
  "deal.approved": "Approved a deal's work",
  "deal.auto_approved": "Deal approved automatically",
  "deal.cancel": "Canceled a deal",
  "deal.withdraw": "Withdrew a campaign application",
  "deal.canceled_refunded": "Canceled a paid deal (refunded)",
  "deal.dispute": "Asked our team to step in on a deal",
  "deal.dispute_paid": "Decided a deal dispute: creator paid",
  "deal.dispute_refunded": "Decided a deal dispute: company refunded",
  "deal.dispute_closed": "Closed a deal dispute: deal carries on",
  "job.create": "Posted a job",
  "job.update": "Edited a job post",
  "job.close": "Closed a job post",
  "job.reopen": "Reopened a job post",
  "job.apply": "Applied to a job",
  "job.withdraw": "Withdrew a job application",
  "job.application_status": "Answered a job application",
};

export function auditLabel(action: string) {
  const known = LABELS[action];
  if (known) return known;
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function targetHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  switch (type) {
    case "user":
      return `/admin/users/${id}`;
    case "company":
      return `/admin/directory/${id}`;
    case "product":
      return `/admin/listings?tab=all&q=${encodeURIComponent(id)}`;
    case "order":
      return `/admin/orders?q=${encodeURIComponent(id)}`;
    case "deal":
      return `/deals/${id}`;
    case "job":
      return `/jobs/${id}`;
    case "campaign":
      return `/campaigns/${id}`;
    default:
      return null;
  }
}

function dataSummary(data: AuditLog["data"]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const parts = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.length ? truncate(parts.join(" · "), 160) : null;
}

export function AuditRow({ row, actor, compact }: { row: AuditLog; actor: string | null; compact?: boolean }) {
  const href = targetHref(row.targetType, row.targetId);
  const summary = compact ? null : dataSummary(row.data);
  const who = row.actorId ? (actor ? `@${actor}` : "Deleted account") : "System";
  return (
    <li className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium">
          {auditLabel(row.action)}
          {row.targetType ? (
            <span className="ml-1.5 font-normal text-muted">
              {href ? (
                <Link href={href} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                  {row.targetType.replace(/_/g, " ")}
                </Link>
              ) : (
                row.targetType.replace(/_/g, " ")
              )}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted">
          {row.actorId ? <Link href={`/admin/users/${row.actorId}`} className="hover:text-ink">{who}</Link> : who}
          {!compact && row.ip ? <span> · {row.ip}</span> : null}
          {summary ? <span> · {summary}</span> : null}
        </div>
      </div>
      <time dateTime={row.createdAt.toISOString()} title={formatDateTime(row.createdAt)} className="num shrink-0 text-xs text-muted">
        {timeAgo(row.createdAt)}
      </time>
    </li>
  );
}
