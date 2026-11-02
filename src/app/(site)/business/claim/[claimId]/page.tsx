import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, MailCheck, RotateCcw, X } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, timeAgo } from "@/lib/utils";
import { requireVerifiedUser } from "@/server/dal";
import { cancelClaim, resendClaimCode } from "@/server/actions/business";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ClaimCodeForm } from "@/components/business/forms";

export const metadata: Metadata = { title: "Your claim" };

export default async function ClaimStatusPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const user = await requireVerifiedUser();
  const claim = await db.companyClaim.findUnique({ where: { id: claimId }, include: { company: true } });
  if (!claim || claim.userId !== user.id) notFound();
  if (claim.status === "APPROVED") redirect(`/business/${claim.company.slug}`);
  const byDocs = claim.documentIds.length > 0;
  const restart = `/business/claim?company=${claim.company.slug}`;

  return (
    <div className="container-tt max-w-2xl py-8 sm:py-12">
      <PageHeader back={{ href: "/business", label: "Business" }} kicker="Claim a listing" title={claim.company.name} />
      <div className="mt-6 card flex items-center gap-4 p-4">
        <Avatar src={claim.company.logoUrl} name={claim.company.name} size={44} square />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">{claim.jobTitle}</div>
          <div className="truncate text-muted">
            {claim.workEmail} · started {timeAgo(claim.createdAt)}
          </div>
        </div>
      </div>

      {claim.status === "REJECTED" ? (
        <div className="mt-6 space-y-4">
          <Notice tone="bad" title="We couldn't confirm this claim">
            {claim.reviewNote ?? "The documents didn't show that you work at the company."}
          </Notice>
          <Link href={restart} className="btn btn-primary">
            <RotateCcw /> Try again
          </Link>
        </div>
      ) : byDocs ? (
        <div className="mt-6 space-y-4">
          <Notice tone="info" title="Our team is checking your documents">
            We usually answer within 2 working days and let you know by email. Sent {formatDate(claim.createdAt)}.
          </Notice>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Clock className="size-4" /> Nothing else to do for now.
          </div>
          <ActionButton action={cancelClaim} fields={{ claimId: claim.id }} variant="ghost" confirm="Cancel this claim? The documents are deleted.">
            <X /> Cancel the claim
          </ActionButton>
        </div>
      ) : (
        <div className="mt-6 card space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <h2 className="text-lg">Check your work email</h2>
              <p className="mt-1 text-sm text-muted">
                We sent a 6 digit code to <span className="font-semibold text-ink">{claim.workEmail}</span>. It works for one hour.
              </p>
            </div>
          </div>
          <ClaimCodeForm claimId={claim.id} />
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <ActionButton action={resendClaimCode} fields={{ claimId: claim.id }} variant="ghost">
              Send a new code
            </ActionButton>
            <Link href={restart} className="btn btn-ghost btn-sm">
              Use a different email
            </Link>
            <ActionButton action={cancelClaim} fields={{ claimId: claim.id }} variant="ghost" confirm="Cancel this claim?">
              Cancel
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
