import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { claimDomain } from "@/server/business";
import { removeTeamMember, setTeamRole } from "@/server/actions/business";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/client";
import { ActionButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Team" };

const ROLE = {
  OWNER: { label: "Owner", hint: "Everything, including who's on the team" },
  ADMIN: { label: "Admin", hint: "Everything except changing roles" },
  MEMBER: { label: "Team member", hint: "Listing, reviews, offers, campaigns" },
} as const;

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, company, role } = await requireBusiness(slug);
  const members = await db.businessMember.findMany({
    where: { companyId: company.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  const isOwner = role === "OWNER";
  const canRemove = role === "OWNER" || role === "ADMIN";
  const invite = absoluteUrl(`/business/claim?company=${company.slug}`);
  const domain = claimDomain(company.website);

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description={`Everyone who can act for ${company.name} on TraderTrades.`} />
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Team members">
        {members.map((m) => {
          const self = m.userId === user.id;
          return (
            <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <Link href={`/@${m.user.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={m.user.avatarUrl} name={m.user.displayName} size={40} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {m.user.displayName} {self ? <span className="font-normal text-muted">(you)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {ROLE[m.role].label} · joined {formatDate(m.createdAt)}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {isOwner && !self
                  ? (["OWNER", "ADMIN", "MEMBER"] as const)
                      .filter((r) => r !== m.role)
                      .map((r) => (
                        <ActionButton
                          key={r}
                          action={setTeamRole}
                          fields={{ memberId: m.id, role: r }}
                          variant="ghost"
                          confirm={r === "OWNER" ? `Make ${m.user.displayName} an owner? Owners can remove anyone, you included.` : undefined}
                        >
                          Make {ROLE[r].label.toLowerCase()}
                        </ActionButton>
                      ))
                  : null}
                {self ? (
                  <ActionButton action={removeTeamMember} fields={{ memberId: m.id }} variant="ghost" confirm={`Leave ${company.name}'s team?`}>
                    Leave
                  </ActionButton>
                ) : canRemove && !(m.role === "OWNER" && !isOwner) ? (
                  <ActionButton action={removeTeamMember} fields={{ memberId: m.id }} variant="ghost" confirm={`Remove ${m.user.displayName} from the team?`}>
                    Remove
                  </ActionButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Panel title="Add a teammate" description="Teammates join the same way you did, so nobody can add someone who doesn't work there.">
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 text-ink-2">
            <UserPlus className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              Send them this link. They make a free account and confirm a code sent to their {domain ? <span className="font-semibold">@{domain}</span> : "work"} email, then
              they&apos;re on the team as a team member. You&apos;ll get a notice when someone joins.
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-sunk px-3 py-2 text-xs">{invite}</code>
            <CopyButton value={invite} label="Copy link" />
          </div>
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {(Object.keys(ROLE) as (keyof typeof ROLE)[]).map((r) => (
          <div key={r} className="rounded-xl border border-line p-4">
            <div className="font-semibold">{ROLE[r].label}</div>
            <div className="mt-0.5 text-muted">{ROLE[r].hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
