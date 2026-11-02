import type { Metadata } from "next";
import { ChevronDown, Mail, MailX } from "lucide-react";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { formatDateTime, plural } from "@/lib/utils";
import { requireCreator } from "@/server/dal";
import { BROADCAST_EVERY_HOURS, audienceOptions } from "@/server/broadcasts";
import { BroadcastForm } from "@/components/creator/broadcast-form";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Email your customers" };

export default async function EmailCustomersPage() {
  const user = await requireCreator();
  const [options, sent, customers] = await Promise.all([
    audienceOptions(user.id),
    db.broadcast.findMany({ where: { creatorId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.buyerRelation.count({ where: { sellerId: user.id } }),
  ]);
  const last = sent[0];
  const nextAt = last ? new Date(last.createdAt.getTime() + BROADCAST_EVERY_HOURS * 3_600_000) : null;
  const waitUntil = nextAt && nextAt > new Date() ? formatDateTime(nextAt, user.timezone) : null;
  const everyone = options.find((o) => o.value === "all")?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/creator/customers", label: "Customers" }}
        title="Email your customers"
        description={`Send an update to people who bought from you or joined. It comes from "${user.displayName} via TraderTrades", and they can reply by messaging you here.`}
      />

      {!features.email ? (
        <Notice tone="warn" title="Preview mode">
          Email isn&apos;t connected yet, so emails are saved in the outbox instead of sent. Everything else works the same.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card p-5 sm:p-6">
          {customers === 0 ? (
            <EmptyState
              icon={<Mail />}
              title="Nobody to email yet"
              description="Once people buy from you or join, you can send them updates from here."
              className="border-0 p-0"
            />
          ) : everyone === 0 ? (
            <EmptyState
              icon={<MailX />}
              title="Nobody can get your emails right now"
              description={`${customers === 1 ? "Your customer has" : `All ${plural(customers, "customer")} have`} turned off your emails or emails from creators, or haven't confirmed their email yet.`}
              className="border-0 p-0"
            />
          ) : (
            <BroadcastForm key={last?.id ?? "first"} options={options} waitUntil={waitUntil} />
          )}
        </section>
        <aside className="card h-fit p-5 text-sm">
          <h2 className="text-[15px]">How it works</h2>
          <ul className="mt-3 space-y-2.5 text-ink-2">
            <li>You can send one email a day, to up to 5,000 people.</li>
            <li>Only people who bought from you or joined get it. People who turned off your emails, or emails from creators, are left out.</li>
            <li>Every email has a one-click link to stop your emails.</li>
            <li>The marketplace rules apply: no profit promises, and no copy trading, account management, profit sharing or challenge passing.</li>
          </ul>
        </aside>
      </div>

      <Panel title="Sent" description={sent.length ? "Your last 20 emails." : undefined}>
        {sent.length ? (
          <ul className="-my-3 divide-y divide-line">
            {sent.map((b) => (
              <li key={b.id} className="py-3">
                <div className="font-semibold break-words">{b.subject}</div>
                <div className="mt-0.5 text-sm text-muted">
                  {formatDateTime(b.createdAt, user.timezone)} · {b.audienceLabel} · {plural(b.recipientCount, "person", "people")}
                </div>
                <details className="group mt-1.5 text-sm">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show the message</span>
                    <span className="hidden group-open:inline">Hide the message</span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-ink-2 break-words">{b.body}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing sent yet. Your emails show up here.</p>
        )}
      </Panel>
    </div>
  );
}
