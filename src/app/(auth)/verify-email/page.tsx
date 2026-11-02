import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Mail, TriangleAlert } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { resendVerificationForm } from "@/server/actions/auth";
import { getViewer } from "@/server/dal";
import { env, features } from "@/lib/env";
import { db } from "@/lib/db";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ status?: string; next?: string }> }) {
  const { status, next } = await searchParams;
  const viewer = await getViewer();
  const testEmail =
    viewer && !viewer.emailVerifiedAt && !features.email && env.demoMode
      ? await db.emailLog.findFirst({ where: { userId: viewer.id, template: "verify-email" }, orderBy: { createdAt: "desc" }, select: { id: true } })
      : null;

  if (status === "ok" || viewer?.emailVerifiedAt) {
    return (
      <div className="w-full max-w-[440px]">
        <div className="card p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-up-soft text-up">
            <CircleCheck className="size-6" />
          </div>
          <h1 className="text-[26px]">Email confirmed</h1>
          <p className="mt-1.5 text-sm text-muted">You&apos;re all set. You can now buy, post, review and message.</p>
          <Link href={safeNext(next, viewer ? "/" : "/login")} className="btn btn-primary btn-lg mt-6 w-full">
            {viewer ? "Continue" : "Sign in"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[440px]">
      <div className="card p-6 sm:p-8">
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-sunk">
          {status === "expired" ? <TriangleAlert className="size-5 text-warn" /> : <Mail className="size-5" />}
        </div>
        <h1 className="text-[26px]">{status === "expired" ? "That link has expired" : "Check your email"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {viewer
            ? `We sent a link to ${viewer.email}. Tap it to confirm your email. It can take a minute, and sometimes lands in spam.`
            : "Sign in and we'll send you a fresh link."}
        </p>
        {viewer ? (
          <ActionForm action={resendVerificationForm} className="mt-6 space-y-3">
            <FormMessage />
            <SubmitButton className="w-full" variant="secondary" size="lg">
              Send a new link
            </SubmitButton>
          </ActionForm>
        ) : (
          <Link href="/login" className="btn btn-primary btn-lg mt-6 w-full">
            Sign in
          </Link>
        )}
        {testEmail ? (
          <div className="mt-6 rounded-xl border border-dashed border-line-strong p-4 text-sm">
            <div className="font-semibold">Email is in test mode</div>
            <p className="mt-1 text-muted">No email service is connected yet, so the email was saved instead of sent.</p>
            <a href={`/api/emails/${testEmail.id}`} target="_blank" className="link mt-2 inline-block font-semibold">
              Open the confirmation email
            </a>
          </div>
        ) : null}
        {viewer ? (
          <p className="mt-6 text-center text-sm text-muted">
            Wrong email?{" "}
            <Link href="/settings/account" className="link">
              Change it in settings
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
