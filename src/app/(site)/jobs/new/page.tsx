import type { Metadata } from "next";
import { companiesFor, requireVerifiedUser } from "@/server/dal";
import { PageHeader } from "@/components/ui/misc";
import { JobForm } from "@/components/jobs/forms";

export const metadata: Metadata = { title: "Post a job", robots: { index: false } };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await requireVerifiedUser();
  const { as } = await searchParams;
  const companies = await companiesFor(user.id);
  const postAs = [{ value: "me", label: `Me (${user.displayName})` }, ...companies.map((m) => ({ value: m.companyId, label: m.company.name }))];
  const preset = postAs.some((o) => o.value === as) ? as : companies.length === 1 ? companies[0].companyId : "me";

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Post a job"
        description="Free to post. It stays up for 60 days, and you can close it any time. Jobs can't ask people to pay anything to apply or start."
      />
      <div className="mt-6">
        <JobForm postAs={postAs} defaultPostAs={preset} />
      </div>
    </div>
  );
}
