"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
type Toast = { id: number; text: string; kind: Kind };

const EVENT = "tt:toast";

export function toast(text: string, kind: Kind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, kind } }));
}

function readFlash(): { text: string; kind: Kind } | null {
  const m = document.cookie.match(/(?:^|; )tt_flash=([^;]*)/);
  if (!m) return null;
  document.cookie = "tt_flash=; Max-Age=0; path=/";
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    if (typeof parsed?.text === "string") return { text: parsed.text, kind: parsed.kind ?? "info" };
  } catch {
    return null;
  }
  return null;
}

/** `flash` is the raw flash cookie from the server, so a refresh in place (same address) still shows the toast. */
export function Toaster({ flash: flashCookie }: { flash?: string | null }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent<{ text: string; kind: Kind }>).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, text, kind }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  useEffect(() => {
    const flash = readFlash();
    if (flash) toast(flash.text, flash.kind);
  }, [pathname, flashCookie]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-rise pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[var(--shadow-lg)]",
            "border-line bg-card text-ink",
          )}
        >
          {t.kind === "success" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-up" />
          ) : t.kind === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          )}
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="-mr-1 text-faint hover:text-ink"
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
