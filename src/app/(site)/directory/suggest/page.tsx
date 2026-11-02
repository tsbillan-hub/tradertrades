import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { suggestCompany } from "@/server/actions/directory";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { CATEGORIES, categoryBySlug, categoryInfo } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Suggest a company",
  description: "Tell us about a prop firm, broker or trading tool that's missing from the TraderTrades directory.",
};

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Waiting for our team", className: "badge badge-outline" },
  ADDED: { label: "Added", className: "badge badge-ok" },
  REJECTED: { label: "Not added", className: "badge badge-outline" },
};

export default async function SuggestPage({ searchParams }: { searchParams: Promise<{ name?: string; category?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const preset = sp.category ? categoryBySlug(sp.category) : undefined;
  const mine = viewer
    ? await db.companySuggestion.findMany({
        where: { userId: viewer.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { company: { select: { slug: true } } },
      })
    : [];
  const here = `/directory/suggest${sp.category ? `?category=${encodeURIComponent(sp.category)}` : ""}`;

  return (
    <div className="container-tt max-w-2xl py-6 sm:py-8">
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/directory" className="hover:text-ink">
          Directory
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">Suggest a company</span>
      </nav>
      <h1 className="mt-4 text-[28px] sm:text-[34px]">Suggest a company</h1>
      <p className="mt-1 text-[15px] text-muted">
        Know a prop firm, broker or trading tool that&apos;s missing? Tell us and our team will look it up and add it, usually within a few days.
      </p>

      {!viewer ? (
        <Notice tone="info" className="mt-6" title="Sign in to suggest a company">
          It keeps the list free of spam.{" "}
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="link">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href={`/signup?next=${encodeURIComponent(here)}`} className="link">
            create a free account
          </Link>
          .
        </Notice>
      ) : !viewer.emailVerifiedAt ? (
        <Notice tone="info" className="mt-6" title="Confirm your email first">
          <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="link">
            Confirm your email
          </Link>{" "}
          and you can send suggestions straight away.
        </Notice>
      ) : (
        <div className="card mt-6 p-5 sm:p-6">
          <ActionForm action={suggestCompany} className="space-y-4" resetOnSuccess>
            <Field label="Company name" name="name">
              <Input name="name" defaultValue={sp.name?.slice(0, 80) ?? ""} maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Website" name="website">
              <Input name="website" maxLength={300} placeholder="https://" inputMode="url" autoComplete="off" />
            </Field>
            <Field label="What is it?" name="category">
              <Select name="category" defaultValue={preset?.value ?? ""}>
                <option value="" disabled>
                  Pick a category
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.singular}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Anything we should know?" name="note" optional hint="For example, which markets it covers or why traders use it.">
              <Textarea name="note" rows={3} maxLength={1000} />
            </Field>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="worksThere" className="checkbox mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">I work at this company</span>
                <span className="block text-xs text-muted">Once it&apos;s listed you can claim it for free to add your logo and reply to reviews.</span>
              </span>
            </label>
            <FormMessage />
            <SubmitButton>Send suggestion</SubmitButton>
          </ActionForm>
        </div>
      )}

      {mine.length ? (
        <section className="mt-10">
          <h2 className="text-lg">Your suggestions</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{s.company ? <Link href={`/directory/c/${s.company.slug}`} className="hover:underline">{s.name}</Link> : s.name}</div>
                  <div className="text-xs text-muted">
                    {categoryInfo(s.category).singular} · {timeAgo(s.createdAt)}
                  </div>
                </div>
                <span className={STATUS[s.status].className}>{STATUS[s.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
