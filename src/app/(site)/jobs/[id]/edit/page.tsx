import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/server/dal";
import { managesJob } from "@/server/jobs";
import { PageHeader } from "@/components/ui/misc";
import { JobForm } from "@/components/jobs/forms";

export const metadata: Metadata = { title: "Edit job", robots: { index: false } };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser();
  const job = await db.jobPost.findUnique({ where: { id }, include: { company: { select: { name: true } }, poster: { select: { displayName: true } } } });
  if (!job || !(await managesJob(job, user.id))) notFound();
  if (job.status === "REMOVED") redirect(`/jobs/${job.id}`);
  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <PageHeader back={{ href: `/jobs/${job.id}`, label: "Back to the job" }} title="Edit job" />
      <div className="mt-6">
        <JobForm
          postAs={[]}
          job={{
            id: job.id,
            title: job.title,
            role: job.role,
            kind: job.kind,
            description: job.description,
            pay: job.pay,
            remote: job.remote,
            location: job.location,
            applyUrl: job.applyUrl,
            postedAs: job.company?.name ?? job.poster.displayName,
          }}
        />
      </div>
    </div>
  );
}
