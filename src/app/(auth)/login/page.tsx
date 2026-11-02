import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn } from "@/server/actions/auth";
import { getViewer } from "@/server/dal";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const dest = safeNext(next, "/");
  if (await getViewer()) redirect(dest);

  return (
    <div className="w-full max-w-[420px]">
      <div className="card p-6 sm:p-8">
        <h1 className="text-[26px]">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to your TraderTrades account.</p>
        <ActionForm action={signIn} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={dest} />
          <Field label="Email or username" name="login">
            <Input name="login" autoComplete="username" autoFocus placeholder="you@example.com" />
          </Field>
          <Field label="Password" name="password">
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <div className="-mt-1 flex justify-end">
            <Link href="/forgot-password" className="text-sm font-medium text-muted hover:text-ink">
              Forgot password?
            </Link>
          </div>
          <FormMessage />
          <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        New to TraderTrades?{" "}
        <Link href={dest !== "/" ? `/signup?next=${encodeURIComponent(dest)}` : "/signup"} className="link font-semibold">
          Create a free account
        </Link>
      </p>
    </div>
  );
}
