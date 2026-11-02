import type { ReactNode } from "react";
import Link from "next/link";
import { getViewer } from "@/server/dal";
import { Notice } from "@/components/ui/misc";

const PAGES = [
  { href: "/rules", label: "Marketplace rules" },
  { href: "/fees", label: "Fees" },
  { href: "/terms", label: "Terms of service" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/risk", label: "Risk disclaimer" },
  { href: "/refunds", label: "Refund policy" },
  { href: "/guidelines", label: "Community guidelines" },
];

export async function LegalPage({
  title,
  intro,
  updated,
  current,
  children,
  draft,
}: {
  title: string;
  intro?: ReactNode;
  updated: string;
  current: string;
  children: ReactNode;
  draft?: boolean;
}) {
  const viewer = await getViewer();
  return (
    <div className="container-tt py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="Policies">
          <div className="sticky top-24 space-y-1">
            {PAGES.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                aria-current={p.href === current ? "page" : undefined}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-hover aria-[current=page]:bg-card aria-[current=page]:text-ink aria-[current=page]:ring-1 aria-[current=page]:ring-line"
              >
                {p.label}
              </Link>
            ))}
          </div>
        </nav>
        <article className="min-w-0 max-w-3xl">
          {draft && viewer?.isAdmin ? (
            <Notice tone="warn" title="Draft wording (only admins see this note)" className="mb-6">
              This page was written as a starting point. Have a lawyer check it before you launch to the public.
            </Notice>
          ) : null}
          <h1 className="text-[34px] sm:text-[40px]">{title}</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
          {intro ? <div className="mt-6 text-[17px] leading-relaxed text-ink-2">{intro}</div> : null}
          <div className="legal mt-8 space-y-8">{children}</div>
        </article>
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[22px]">{title}</h2>
      <div className="prose-tt mt-3">{children}</div>
    </section>
  );
}
