import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/constants";
import { productPath } from "@/lib/paths";
import { PRODUCT_STATUS_BADGE } from "@/lib/product-status";
import { formatDate, money, orderNumber, timeAgo, plural } from "@/lib/utils";
import { revokeBadge } from "@/server/actions/admin";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { KeyValue, Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { MessageButton } from "@/components/message-button";
import { AccountStatusForm } from "@/components/admin/forms";
import { AuditRow } from "@/components/admin/audit-row";
import { OrderStatusBadge, StatusBadge } from "@/components/admin/status-badge";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, select: { username: true } });
  return { title: u ? `@${u.username}` : "Account" };
}

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: { creator: true, socialLinks: true, _count: { select: { ordersBought: true, ordersSold: true, products: true, reports: true, companyReviews: true } } },
  });
  if (!user) notFound();

  const productIds = (await db.product.findMany({ where: { creatorId: id }, select: { id: true } })).map((p) => p.id);
  const [products, bought, sold, reportsAbout, activity] = await Promise.all([
    db.product.findMany({ where: { creatorId: id }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.order.findMany({ where: { buyerId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.order.aggregate({ where: { sellerId: id, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { amountCents: true, refundedCents: true, platformFeeCents: true }, _count: true }),
    db.report.findMany({
      where: { OR: [{ targetType: "USER", targetId: id }, { targetType: "PRODUCT", targetId: { in: productIds } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.auditLog.findMany({ where: { OR: [{ actorId: id }, { targetType: "user", targetId: id }] }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const actorIds = [...new Set(activity.map((a) => a.actorId).filter((x): x is string => Boolean(x)))];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/users", label: "Accounts" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar src={user.avatarUrl} name={user.displayName} size={44} />
            <span className="min-w-0">
              {user.displayName}
              <span className="block text-sm font-normal text-muted">@{user.username}</span>
            </span>
          </span>
        }
        actions={
          <>
            {user.status !== "DELETED" ? (
              <Link href={`/@${user.username}`} target="_blank" className="btn btn-secondary">
                Public page <ExternalLink />
              </Link>
            ) : null}
            {user.status === "ACTIVE" || user.status === "SUSPENDED" ? <MessageButton toId={user.id} toName={user.displayName} subject="From the TraderTrades team" /> : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={user.status} />
        {user.isAdmin ? <span className="badge badge-ink">Staff</span> : null}
        {user.isSample ? <span className="badge badge-warn">Sample account</span> : null}
        <span className="badge badge-outline">{user.accountType.charAt(0) + user.accountType.slice(1).toLowerCase()}</span>
      </div>

      {user.status !== "ACTIVE" && user.statusReason ? <Notice tone={user.status === "BANNED" ? "bad" : "warn"} title="Reason they see">{user.statusReason}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Account">
          <KeyValue
            className="-my-2"
            items={[
              { label: "Email", value: <span className="break-all">{user.email}</span> },
              { label: "Email confirmed", value: user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not yet" },
              { label: "Joined", value: formatDate(user.createdAt) },
              { label: "Last sign in", value: user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never" },
              { label: "Two-step sign in", value: user.twoFactorEnabledAt ? "On" : "Off" },
              { label: "Time zone", value: user.timezone },
              { label: "Bought", value: plural(user._count.ordersBought, "order") },
              { label: "Reports they made", value: user._count.reports },
            ]}
          />
        </Panel>

        <Panel title="Badges" description="Optional. Anyone can buy and sell without them.">
          <ul className="-my-2 divide-y divide-line text-sm">
            <li className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="font-medium">ID verified</span>
                <span className="block text-muted">{user.idVerifiedAt ? `Since ${formatDate(user.idVerifiedAt)}` : "No"}</span>
              </span>
              {user.idVerifiedAt ? (
                <ActionButton action={revokeBadge} fields={{ userId: user.id, badge: "id" }} confirm="Remove the ID verified badge?" variant="ghost">
                  <X /> Remove
                </ActionButton>
              ) : null}
            </li>
            <li className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="font-medium">Socials verified</span>
                <span className="block text-muted">{user.socialsVerifiedAt ? `Since ${formatDate(user.socialsVerifiedAt)}` : "No"}</span>
              </span>
              {user.socialsVerifiedAt ? (
                <ActionButton action={revokeBadge} fields={{ userId: user.id, badge: "socials" }} confirm="Remove the socials verified badge?" variant="ghost">
                  <X /> Remove
                </ActionButton>
              ) : null}
            </li>
            {user.socialLinks.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-ink-2 hover:text-ink">
                  {l.platform.charAt(0) + l.platform.slice(1).toLowerCase()}: {l.handle ?? l.url}
                </a>
                {l.verifiedAt ? <span className="badge badge-info">Checked</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Account status" description="On hold: they can sign in and open what they bought, but can't post, message, review or sell, and their listings are hidden. Banned: signed out everywhere and can't sign in.">
        {user.isAdmin ? <p className="text-sm text-muted">Staff accounts can&apos;t be changed here.</p> : user.status === "DELETED" ? <p className="text-sm text-muted">They deleted this account.</p> : <AccountStatusForm userId={user.id} status={user.status} reason={user.statusReason} />}
      </Panel>

      {user.creator || products.length ? (
        <Panel
          title="Selling"
          description={`${plural(sold._count, "paid order")} · ${money(sold._sum.amountCents ?? 0)} in sales · ${money(sold._sum.refundedCents ?? 0)} refunded · ${money(sold._sum.platformFeeCents ?? 0)} in our fees`}
        >
          {products.length ? (
            <ul className="-my-2 divide-y divide-line text-sm">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={productPath(user.username, p.slug)} target="_blank" className="min-w-0 truncate font-medium hover:underline">
                    {p.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted">{p.salesCount} sold</span>
                    <span className={`badge ${PRODUCT_STATUS_BADGE[p.status].tone}`}>{PRODUCT_STATUS_BADGE[p.status].label}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No listings yet.</p>
          )}
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent purchases">
          {bought.length ? (
            <ul className="-my-2 divide-y divide-line text-sm">
              {bought.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/orders?q=${orderNumber(o.number)}`} className="min-w-0 truncate hover:underline">
                    <span className="num text-muted">{orderNumber(o.number)}</span> {o.description}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num">{money(o.amountCents)}</span>
                    <OrderStatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing bought yet.</p>
          )}
        </Panel>

        <Panel title="Reports about them" description="About the account or their listings.">
          {reportsAbout.length ? (
            <ul className="-my-2 divide-y divide-line text-sm">
              {reportsAbout.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{reasonLabel(r.reason)}</span>
                    <span className="block truncate text-muted">
                      {r.targetType === "USER" ? "The account" : "A listing"} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <span className={r.status === "OPEN" ? "badge badge-warn" : r.status === "ACTIONED" ? "badge badge-bad" : "badge badge-outline"}>
                    {r.status === "OPEN" ? "Open" : r.status === "ACTIONED" ? "Taken down" : "Dismissed"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No reports.</p>
          )}
        </Panel>
      </div>

      <Panel title="Activity">
        {activity.length ? (
          <ul className="-my-2 divide-y divide-line">
            {activity.map((a) => (
              <AuditRow key={a.id} row={a} actor={actors.find((x) => x.id === a.actorId)?.username ?? null} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </Panel>
    </div>
  );
}
