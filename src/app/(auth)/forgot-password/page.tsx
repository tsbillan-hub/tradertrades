import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { requestPasswordReset } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-[420px]">
      <div className="card p-6 sm:p-8">
        <h1 className="text-[26px]">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted">Enter the email on your account and we&apos;ll send you a link to pick a new password.</p>
        <ActionForm action={requestPasswordReset} className="mt-6 space-y-4">
          <Field label="Email" name="email">
            <Input name="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" />
          </Field>
          <FormMessage />
          <SubmitButton className="w-full" size="lg">
            Send reset link
          </SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="link font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}
