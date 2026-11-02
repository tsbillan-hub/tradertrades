import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword } from "@/server/actions/auth";
import { peekToken } from "@/server/auth/tokens";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekToken(token, "RESET_PASSWORD") : null;

  return (
    <div className="w-full max-w-[420px]">
      <div className="card p-6 sm:p-8">
        {valid && token ? (
          <>
            <h1 className="text-[26px]">Choose a new password</h1>
            <p className="mt-1.5 text-sm text-muted">This signs you out everywhere else.</p>
            <ActionForm action={resetPassword} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="New password" name="password" hint="At least 10 characters">
                <PasswordInput name="password" autoComplete="new-password" autoFocus />
              </Field>
              <FormMessage />
              <SubmitButton className="w-full" size="lg">
                Save new password
              </SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="text-[26px]">This link has expired</h1>
            <p className="mt-1.5 text-sm text-muted">Reset links work for 1 hour and only once. Ask for a new one below.</p>
            <Link href="/forgot-password" className="btn btn-primary btn-lg mt-6 w-full">
              Send a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
