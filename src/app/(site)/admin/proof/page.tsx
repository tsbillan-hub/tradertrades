import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { timeAgo, truncate } from "@/lib/utils";
import { EmptyState, Notice, PageHeader, Stars } from "@/components/ui/misc";
import { ProofDecisionForm } from "@/components/admin/forms";
import { PrivateFile } from "@/components/admin/private-file";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Review proof" };

export default async function ProofPage() {
  const rows = await db.companyReview.findMany({
    where: { proofStatus: "PENDING", status: { not: "REMOVED" } },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      company: { select: { name: true, slug: true } },
    },
  });
  const files = await db.media.findMany({
    where: { id: { in: rows.map((r) => r.proofMediaId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, mimeType: true, originalName: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review proof"
        description="Reviewers can add private proof that they used a company, like a receipt or an account screenshot. Confirmed reviews show “Proof of use”. Files are deleted once you decide."
      />
      {rows.length ? (
        <>
          <Notice tone="plain">
            Confirm only if the file shows this person used this company (the company&apos;s name and their account or payment). A missing badge doesn&apos;t hide the review.
          </Notice>
          {rows.map((r) => (
            <article key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/directory/c/${r.company.slug}#r-${r.id}`} target="_blank" className="inline-flex items-center gap-1 font-semibold hover:underline">
                    {r.company.name} <ExternalLink className="size-3.5" />
                  </Link>
                  <Stars value={r.rating} />
                  {r.usedFor ? <span className="text-muted">Used for {r.usedFor.toLowerCase()}</span> : null}
                </div>
                <div>
                  <h2 className="text-base font-semibold">{r.title}</h2>
                  <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{truncate(r.body, 400)}</p>
                </div>
                <UserChip user={r.user} sub={`reviewed ${timeAgo(r.createdAt)}`} />
                <PrivateFile file={files.find((f) => f.id === r.proofMediaId)} />
              </div>
              <div className="lg:border-l lg:border-line lg:pl-5">
                <ProofDecisionForm reviewId={r.id} />
              </div>
            </article>
          ))}
        </>
      ) : (
        <EmptyState icon={<FileCheck2 />} title="No proof to check" />
      )}
    </div>
  );
}
