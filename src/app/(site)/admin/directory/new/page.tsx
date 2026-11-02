import type { Metadata } from "next";
import { CATEGORIES, MARKETS } from "@/lib/constants";
import { Notice, PageHeader } from "@/components/ui/misc";
import { CompanyForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Add company" };

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/admin/directory", label: "Directory" }} title="Add a company" />
      <Notice tone="plain">
        Only add real companies, with facts from their own website. No logos, prices or ratings: logos and prices change and belong to them, and ratings only come from reviews.
      </Notice>
      <div className="card p-5 sm:p-6">
        <CompanyForm categories={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} markets={MARKETS} />
      </div>
    </div>
  );
}
