import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { SignupForm } from "@/components/auth/signup-form";
import { getViewer } from "@/server/dal";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const { next, as } = await searchParams;
  if (await getViewer()) redirect(safeNext(next, "/"));
  const role = as === "creator" ? "CREATOR" : as === "business" ? "BUSINESS" : "TRADER";

  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_380px]">
      <div className="card p-6 sm:p-8">
        <h1 className="text-[28px]">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted">Free to join. Takes about a minute.</p>
        <div className="mt-6">
          <SignupForm initialRole={role} next={next ? safeNext(next, "") || undefined : undefined} />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="link font-semibold">
            Sign in
          </Link>
        </p>
      </div>
      <aside className="relative hidden overflow-hidden rounded-xl bg-[#16130F] p-8 text-[#F2EADB] lg:block">
        <LogoMark className="absolute -right-16 -bottom-16 size-72 opacity-[0.08] [&_circle[stroke]]:stroke-[#F2EADB]" />
        <div className="relative">
          <div className="text-xs font-bold tracking-[0.08em] text-[#F2EADB]/60 uppercase">Why TraderTrades</div>
          <h2 className="mt-3 text-2xl text-[#F2EADB]">Everything traders need, in one place.</h2>
          <ul className="mt-8 space-y-6 text-sm">
            <li className="flex gap-3">
              <LayoutGrid className="mt-0.5 size-5 shrink-0 text-[#FF5A2E]" />
              <span>
                <b className="block text-[#F2EADB]">One account for everything</b>
                <span className="text-[#F2EADB]/70">Communities, courses, calls, alerts and indicators, all in your library.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#FF5A2E]" />
              <span>
                <b className="block text-[#F2EADB]">No profit promises, ever</b>
                <span className="text-[#F2EADB]/70">Copy trading, account management and challenge passing are banned.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <MessageSquareQuote className="mt-0.5 size-5 shrink-0 text-[#FF5A2E]" />
              <span>
                <b className="block text-[#F2EADB]">Only buyers can review</b>
                <span className="text-[#F2EADB]/70">Every product review comes from someone who paid for it.</span>
              </span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
