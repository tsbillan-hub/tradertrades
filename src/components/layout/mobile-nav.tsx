"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu as MenuIcon, X } from "lucide-react";

export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-icon lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 right-0 flex w-[min(340px,88vw)] flex-col overflow-y-auto border-l border-line bg-card p-4">
            <div className="mb-2 flex justify-end">
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <div onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MobileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-ink hover:bg-hover [&>svg]:size-4 [&>svg]:text-muted">
      {children}
    </Link>
  );
}
