import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, CalendarDays, ExternalLink, Hash, Home, LineChart, Megaphone, PencilLine, Settings2, FolderOpen } from "lucide-react";
import { db } from "@/lib/db";
import type { InsideCtx } from "@/server/inside";
import { unreadChannels } from "@/server/community";
import { InsideLink } from "@/components/inside/nav";
import { Avatar } from "@/components/ui/avatar";
import { GeneratedCover } from "@/components/market/cover";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { productTypeInfo } from "@/lib/constants";
import { insidePath, productPath } from "@/lib/paths";

const CHANNEL_ICON: Record<string, ReactNode> = {
  CHAT: <Hash />,
  ANNOUNCEMENTS: <Megaphone />,
  RESOURCES: <FolderOpen />,
  ALERTS: <LineChart />,
};

/** The frame around every members area page: product, navigation and the creator's tools. */
export async function InsideShell({ ctx, children }: { ctx: InsideCtx & { viewer: NonNullable<InsideCtx["viewer"]> }; children: ReactNode }) {
  const { product, viewer } = ctx;
  const u = product.creator.username;
  const base = insidePath(u, product.slug);
  const hasChannels = product.type === "COMMUNITY" || product.type === "ALERTS";
  const now = new Date();

  const [unread, upcoming, lessons, done] = await Promise.all([
    hasChannels ? unreadChannels(viewer.id, product.id) : Promise.resolve(new Set<string>()),
    hasChannels || product.type === "COURSE" ? db.liveSession.count({ where: { productId: product.id, startsAt: { gte: new Date(now.getTime() - 3 * 3600_000) } } }) : Promise.resolve(0),
    product.type === "COURSE" ? db.lesson.count({ where: { productId: product.id } }) : Promise.resolve(0),
    product.type === "COURSE" ? db.lessonProgress.count({ where: { userId: viewer.id, productId: product.id, completedAt: { not: null } } }) : Promise.resolve(0),
  ]);
  const pct = lessons ? Math.round((done / lessons) * 100) : 0;
  const info = productTypeInfo(product.type);

  return (
    <div className="container-tt py-5 sm:py-7">
      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-9">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Link href={productPath(u, product.slug)} className="group flex items-center gap-3 rounded-xl p-1 hover:bg-hover">
            <div className="w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
              {product.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.coverUrl} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <GeneratedCover title="" type={product.type} seed={product.id} mini className="aspect-video w-full" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm leading-tight font-semibold">{product.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <Avatar src={product.creator.avatarUrl} name={product.creator.displayName} size={14} />
                <span className="truncate">{product.creator.displayName}</span>
              </div>
            </div>
          </Link>

          {product.type === "COURSE" && lessons ? (
            <div className="mt-4 hidden px-1 lg:block">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Your progress</span>
                <span className="num font-semibold text-ink">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
                <div className="h-full rounded-full bg-up" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}

          <nav aria-label={`${info.label} navigation`} className="no-scrollbar -mx-4 mt-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
            {hasChannels ? (
              <>
                <div className="kicker hidden px-3 pt-1 pb-1.5 lg:block">Channels</div>
                {product.channels.map((c) => (
                  <InsideLink key={c.id} href={`${base}/c/${c.slug}`} icon={CHANNEL_ICON[c.kind] ?? <Hash />} dot={unread.has(c.id)}>
                    {c.name}
                  </InsideLink>
                ))}
                <InsideLink href={`${base}/live`} icon={<CalendarDays />} count={upcoming || undefined}>
                  Live sessions
                </InsideLink>
              </>
            ) : product.type === "COURSE" ? (
              <>
                <InsideLink href={base} exact icon={<BookOpen />}>
                  Course home
                </InsideLink>
                {upcoming ? (
                  <InsideLink href={`${base}/live`} icon={<CalendarDays />} count={upcoming}>
                    Live sessions
                  </InsideLink>
                ) : null}
              </>
            ) : (
              <InsideLink href={base} exact icon={<Home />}>
                {product.type === "EVENT" ? "Event" : product.type === "MENTORING" ? "Your calls" : product.type === "INDICATOR" ? "Your access" : "Your files"}
              </InsideLink>
            )}

            {ctx.canManage ? (
              <>
                <div className="kicker hidden px-3 pt-4 pb-1.5 lg:block">{ctx.isOwner ? "Your tools" : "Team tools"}</div>
                <InsideLink href={`${base}/manage`} icon={<Settings2 />}>
                  Manage
                </InsideLink>
                <InsideLink href={`/creator/products/${product.id}`} icon={<PencilLine />}>
                  Edit listing
                </InsideLink>
              </>
            ) : null}
          </nav>

          <div className="mt-5 hidden space-y-2 border-t border-line px-1 pt-4 text-xs text-muted lg:block">
            <div className="flex items-center gap-1.5">
              <ProductTypeIcon type={product.type} className="size-3.5" />
              {info.label}
              {ctx.isOwner ? " · you're the creator" : ctx.member ? " · you're a member" : ctx.isAdmin ? " · team view" : ""}
            </div>
            <Link href={productPath(u, product.slug)} className="inline-flex items-center gap-1 font-semibold text-ink-2 hover:text-ink">
              Listing page <ExternalLink className="size-3" />
            </Link>
            {ctx.member && ctx.entitlement?.subscriptionId ? (
              <div>
                <Link href="/settings/billing" className="hover:text-ink hover:underline">
                  Manage membership
                </Link>
              </div>
            ) : null}
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** Page title row inside the members area. */
export function InsideHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[24px] leading-tight sm:text-[28px] [&>svg]:size-6 [&>svg]:text-muted">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description ? <p className="mt-1.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
