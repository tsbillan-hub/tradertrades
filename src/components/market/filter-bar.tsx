"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterDef = { name: string; label: string; value: string; options: { value: string; label: string }[] };

/** Dropdown filters that update the address (so results can be shared and the back button works). */
export function FilterBar({ path, params, filters, className }: { path: string; params: Record<string, string>; filters: FilterDef[]; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function change(name: string, value: string) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") qs.set(k, v);
    if (value) qs.set(name, value);
    else qs.delete(name);
    const s = qs.toString();
    start(() => router.push(s ? `${path}?${s}` : path, { scroll: false }));
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((f) => (
        <label key={f.name} className="relative">
          <span className="sr-only">{f.label}</span>
          <select
            value={f.value}
            onChange={(e) => change(f.name, e.target.value)}
            className={cn("input h-9 w-auto cursor-pointer py-0 pr-8 text-sm", f.value && "border-ink font-semibold")}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {pending ? <LoaderCircle className="size-4 animate-spin text-muted" aria-label="Loading" /> : null}
    </div>
  );
}
