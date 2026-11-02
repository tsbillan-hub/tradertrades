"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { CopyButton } from "@/components/ui/client";
import { toast } from "@/components/ui/toaster";
import { confirmTwoFactor, disableTwoFactor, regenerateBackupCodes, startTwoFactor } from "@/server/actions/account";

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-sunk p-4">
      <div className="text-sm font-semibold">Save these backup codes</div>
      <p className="mt-1 text-sm text-muted">Each one works once if you lose your phone. We won&apos;t show them again.</p>
      <div className="num mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <span key={c} className="rounded-md bg-card px-2 py-1.5 text-center ring-1 ring-line">
            {c}
          </span>
        ))}
      </div>
      <CopyButton value={codes.join("\n")} label="Copy codes" small className="mt-3" />
    </div>
  );
}

export function TwoFactorSetup({ enabled, backupCount }: { enabled: boolean; backupCount: number }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  if (codes) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-up">
          <ShieldCheck className="size-4" /> Two-step sign in is on
        </div>
        <BackupCodes codes={codes} />
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-up">
          <ShieldCheck className="size-4" /> On. You have {backupCount} backup code{backupCount === 1 ? "" : "s"} left.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await regenerateBackupCodes();
                if (res.ok && res.data?.backupCodes) setCodes(res.data.backupCodes as string[]);
                else toast(res.error ?? "Couldn't make new codes", "error");
              })
            }
          >
            <KeyRound /> New backup codes
          </button>
        </div>
        <ActionForm action={disableTwoFactor} refreshOnSuccess className="max-w-sm space-y-3 border-t border-line pt-5">
          <div className="text-sm font-semibold">Turn it off</div>
          <Field label="Current password" name="currentPassword">
            <PasswordInput name="currentPassword" autoComplete="current-password" />
          </Field>
          <FormMessage />
          <SubmitButton variant="danger" size="sm">
            Turn off two-step sign in
          </SubmitButton>
        </ActionForm>
      </div>
    );
  }

  if (!setup) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await startTwoFactor();
            if (res.ok && res.data) setSetup(res.data as { qr: string; secret: string });
            else toast(res.error ?? "Couldn't start setup", "error");
          })
        }
      >
        <ShieldCheck /> Set up two-step sign in
      </button>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-xl ring-1 ring-line" />
      </div>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Open an authenticator app (Google Authenticator, 1Password, Authy).</li>
          <li>Scan the QR code, or type this key in by hand:</li>
        </ol>
        <div className="num rounded-lg bg-sunk px-3 py-2 text-sm break-all">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
        <ActionForm action={confirmTwoFactor} onSuccess={(s) => setCodes((s.data?.backupCodes as string[]) ?? [])} className="max-w-xs space-y-3">
          <Field label="Code from the app" name="code">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="num tracking-widest" />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton>Turn on</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
