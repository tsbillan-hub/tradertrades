"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, X } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

/**
 * Checks every 20 seconds (while the tab is open) whether someone posted, and offers to show it.
 * Keeps whatever the person is typing, instead of refreshing under them.
 */
export function NewPostsNotice({ channelId, since }: { channelId: string; since: string }) {
  const router = useRouter();
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || stop) return;
      try {
        const res = await fetch(`/api/inside/latest?channel=${encodeURIComponent(channelId)}&since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { newer: boolean };
        if (!stop && data.newer) setFresh(true);
      } catch {
        // Offline for a moment: try again next round.
      }
    };
    const t = window.setInterval(check, 20_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [channelId, since]);
  if (!fresh) return null;
  return (
    <div className="sticky top-20 z-20 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setFresh(false);
          router.refresh();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className="animate-rise inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-ink shadow-[var(--shadow-lg)]"
      >
        <ArrowUp className="size-4" /> New posts
      </button>
    </div>
  );
}

const subscribe = () => () => {};

function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** The creator's welcome note. Members can hide it; it stays hidden on this device. */
export function WelcomeCard({ productId, title, text }: { productId: string; title: string; text: string }) {
  const key = `tt_welcome_${productId}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => readDismissed(key),
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  if (stored || hidden) return null;
  return (
    <div className="card relative mb-5 border-accent/30 bg-accent-soft p-5">
      <button
        type="button"
        aria-label="Hide welcome message"
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
        onClick={() => {
          try {
            window.localStorage.setItem(key, "1");
          } catch {
            // Private mode: just hide it for now.
          }
          setHidden(true);
        }}
      >
        <X className="size-4" />
      </button>
      <div className="kicker">Welcome</div>
      <h2 className="mt-1 pr-8 text-lg">{title}</h2>
      <Markdown className="mt-2 text-[15px]">{text}</Markdown>
    </div>
  );
}
