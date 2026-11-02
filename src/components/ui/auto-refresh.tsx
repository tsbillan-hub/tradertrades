"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page every few seconds while we wait for something (like a payment) to finish. */
export function AutoRefresh({ seconds = 3, maxTries = 20 }: { seconds?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (tries > maxTries) clearInterval(t);
      else router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, maxTries]);
  return null;
}
