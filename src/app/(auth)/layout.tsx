import Link from "next/link";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-tt flex h-16 items-center justify-between">
        <Link href="/" aria-label="TraderTrades home">
          <Logo />
        </Link>
        <Link href="/marketplace" className="text-sm font-semibold text-muted hover:text-ink">
          Browse the marketplace
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">{children}</main>
      <footer className="container-tt flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-6 text-xs text-muted">
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <Link href="/rules" className="hover:text-ink">Marketplace rules</Link>
        <Link href="/help" className="hover:text-ink">Help</Link>
      </footer>
    </div>
  );
}
