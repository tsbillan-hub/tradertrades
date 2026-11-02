"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "@/components/ui/client";
import { toast } from "@/components/ui/toaster";
import { startSocialsCheck, submitSocialsCheck } from "@/server/actions/verification";

export function SocialsCheck({ code: initialCode, pending: initiallyPending }: { code: string | null; pending: boolean }) {
  const [code, setCode] = useState(initialCode);
  const [submitted, setSubmitted] = useState(initiallyPending);
  const [busy, start] = useTransition();
  if (!code) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await startSocialsCheck();
            if (r.ok && r.data?.code) setCode(String(r.data.code));
            else toast(r.error ?? "Couldn't start", "error");
          })
        }
      >
        Get my code
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Put this code anywhere in the bio of each account you linked. We&apos;ll check it, then you can remove it.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="num rounded-lg bg-sunk px-3 py-2 text-base font-semibold tracking-wider ring-1 ring-line">{code}</span>
        <CopyButton value={code} small />
      </div>
      {submitted ? (
        <p className="text-sm font-semibold text-warn">Waiting for a check. Keep the code in your bios until it&apos;s done.</p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await submitSocialsCheck();
              if (r.ok) {
                setSubmitted(true);
                toast(r.message ?? "Sent", "success");
              } else toast(r.error ?? "Couldn't send", "error");
            })
          }
        >
          I&apos;ve added the code
        </button>
      )}
    </div>
  );
}
