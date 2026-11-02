"use client";

import { useTransition } from "react";
import Link from "next/link";
import { resendVerification } from "@/server/actions/auth";
import { toast } from "@/components/ui/toaster";

export function ResendVerifyButton() {
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className="font-semibold underline underline-offset-2"
        onClick={() =>
          start(async () => {
            const res = await resendVerification();
            toast(res.error ?? res.message ?? "Sent", res.error ? "error" : "success");
          })
        }
      >
        {pending ? "Sending…" : "Send the link again"}
      </button>
      <Link href="/verify-email" className="underline underline-offset-2">
        Help
      </Link>
    </span>
  );
}
