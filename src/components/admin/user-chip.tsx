import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

export type ChipUser = { id: string; username: string; displayName: string; avatarUrl?: string | null };

/** A person, linking to their admin page. */
export function UserChip({ user, sub }: { user: ChipUser; sub?: React.ReactNode }) {
  return (
    <Link href={`/admin/users/${user.id}`} className="group inline-flex min-w-0 items-center gap-2.5">
      <Avatar src={user.avatarUrl ?? null} name={user.displayName} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold group-hover:underline">{user.displayName}</span>
        <span className="block truncate text-xs text-muted">
          @{user.username}
          {sub ? <> · {sub}</> : null}
        </span>
      </span>
    </Link>
  );
}
