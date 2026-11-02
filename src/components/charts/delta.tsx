import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** How a number moved against the period before, with an arrow so it never relies on colour alone. */
export function Delta({ now, before, days, upIsGood = true }: { now: number; before: number; days: number; upIsGood?: boolean }) {
  if (!before) return <span>{now ? `None in the ${days} days before` : `Last ${days} days`}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span>Same as the {days} days before</span>;
  const up = pct > 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-flex items-center font-semibold", good ? "text-up" : "text-down")}>
        <Icon className="size-3.5" aria-hidden />
        <span className="num">
          {up ? "+" : ""}
          {pct}%
        </span>
      </span>
      <span>vs the {days} days before</span>
    </span>
  );
}
