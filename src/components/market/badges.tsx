import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Who = {
  idVerifiedAt?: Date | null;
  socialsVerifiedAt?: Date | null;
};

/** Small tick next to a name when the person's ID has been checked. */
export function VerifiedTick({ who, className }: { who: Who; className?: string }) {
  if (!who.idVerifiedAt) return null;
  return (
    <span title="ID verified" className={cn("inline-flex text-ink", className)}>
      <BadgeCheck className="size-4" aria-label="ID verified" />
    </span>
  );
}

export function TrustBadges({ who, className, size = "md" }: { who: Who; className?: string; size?: "sm" | "md" }) {
  const items: { label: string; icon: React.ReactNode; title: string }[] = [];
  if (who.idVerifiedAt) items.push({ label: "ID verified", icon: <BadgeCheck />, title: "We checked a government ID matches this person." });
  if (who.socialsVerifiedAt) items.push({ label: "Socials verified", icon: <BadgeCheck />, title: "We confirmed they own the social accounts linked here." });
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((i) => (
        <span key={i.label} className={cn("badge badge-outline", size === "sm" && "h-5 px-1.5 text-[11px]")} title={i.title}>
          {i.icon}
          {i.label}
        </span>
      ))}
    </div>
  );
}
