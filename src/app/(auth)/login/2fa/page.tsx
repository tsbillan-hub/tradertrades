import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { verifyTwoFactor } from "@/server/actions/auth";
import { readSession } from "@/server/auth/session";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Two-step check" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await readSession();
  if (!session) redirect("/login");
  if (!session.twoFactorPending) redirect(safeNext(next, "/"));

  return (
    <div className="w-full max-w-[420px]">
      <div className="card p-6 sm:p-8">
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-sunk">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="text-[26px]">Enter your code</h1>
        <p className="mt-1.5 text-sm text-muted">Open your authenticator app and type the 6 digit code for TraderTrades. Lost your phone? Use one of your backup codes.</p>
        <ActionForm action={verifyTwoFactor} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={safeNext(next, "/")} />
          <Field label="Code" name="code">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123 456" className="num text-lg tracking-widest" />
          </Field>
          <FormMessage />
          <SubmitButton className="w-full" size="lg">
            Continue
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
