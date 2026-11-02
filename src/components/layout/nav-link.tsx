"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NavLink({ href, children, exact, className }: { href: string; children: ReactNode; exact?: boolean; className?: string }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink aria-[current=page]:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SideLink({ href, children, exact, icon, count }: { href: string; children: ReactNode; exact?: boolean; icon?: ReactNode; count?: number }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink [&>svg]:size-4 [&>svg]:text-muted",
        "aria-[current=page]:bg-card aria-[current=page]:text-ink aria-[current=page]:shadow-[var(--shadow-sm)] aria-[current=page]:ring-1 aria-[current=page]:ring-line",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {count ? <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{count}</span> : null}
    </Link>
  );
}
