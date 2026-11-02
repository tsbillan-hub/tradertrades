import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Star, FlaskConical, CircleAlert, Info, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  kicker,
  className,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  kicker?: ReactNode;
  className?: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        ) : null}
        {kicker ? <div className="kicker mb-2">{kicker}</div> : null}
        <h1 className="text-[28px] sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-4 grid size-12 place-items-center rounded-full bg-sunk text-muted [&>svg]:size-5">{icon}</div> : null}
      <h3 className="text-lg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("card p-4", className)}>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-semibold text-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-[1px]", className)} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = full >= i ? 1 : full >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-line-strong" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            {fill > 0 ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: size * fill }}>
                <Star className="text-ink" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

export function RatingSummary({ avg, count, className }: { avg: number; count: number; className?: string }) {
  if (!count) return <span className={cn("text-sm text-faint", className)}>No reviews yet</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Stars value={avg} />
      <span className="num font-semibold text-ink">{avg.toFixed(1)}</span>
      <span className="text-muted">({count.toLocaleString()})</span>
    </span>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span className={cn("badge badge-warn", className)} title="Example content made for the preview. Not a real listing.">
      <FlaskConical />
      Sample
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: "info" | "warn" | "bad" | "ok" | "plain";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const styles = {
    info: "bg-info-soft text-info",
    warn: "bg-warn-soft text-warn",
    bad: "bg-down-soft text-down",
    ok: "bg-up-soft text-up",
    plain: "bg-sunk text-ink-2",
  }[tone];
  const Icon = { info: Info, warn: TriangleAlert, bad: CircleAlert, ok: CircleCheck, plain: Info }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl px-4 py-3 text-sm", styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-[13.5px] leading-relaxed opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pages">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn btn-secondary btn-sm">
          <ChevronLeft /> Previous
        </Link>
      ) : null}
      <span className="num px-2 text-sm text-muted">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="btn btn-secondary btn-sm">
          Next <ChevronRight />
        </Link>
      ) : null}
    </nav>
  );
}

export function LinkTabs({ tabs, active, className }: { tabs: { href: string; label: ReactNode; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("tabs", className)}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className="tab" aria-current={t.key === active ? "page" : undefined} scroll={false}>
          {t.label}
          {typeof t.count === "number" ? <span className="num ml-1.5 text-xs text-faint">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function KeyValue({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{it.label}</dt>
          <dd className="text-right font-medium text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
