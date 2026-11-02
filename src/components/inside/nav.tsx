"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A members area sidebar link. `dot` marks something new since the last visit. */
export function InsideLink({ href, children, icon, exact, dot, count }: { href: string; children: ReactNode; icon?: ReactNode; exact?: boolean; dot?: boolean; count?: number }) {
  const pathname = usePathname();
  const path = decodeURIComponent(pathname);
  const target = href.split("?")[0];
  const active = exact ? path === target : path === target || path.startsWith(`${target}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-hover hover:text-ink [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted",
        "aria-[current=page]:bg-card aria-[current=page]:text-ink aria-[current=page]:shadow-[var(--shadow-sm)] aria-[current=page]:ring-1 aria-[current=page]:ring-line",
        dot && "font-semibold text-ink",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {dot ? <span className="size-2 rounded-full bg-accent" aria-label="New posts" /> : null}
      {count ? <span className="num rounded-full bg-hover px-1.5 text-[11px] font-semibold text-ink-2">{count}</span> : null}
    </Link>
  );
}
