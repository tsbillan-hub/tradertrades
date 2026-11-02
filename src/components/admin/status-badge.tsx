import type { OrderStatus, UserStatus } from "@/generated/prisma/enums";

const USER: Record<UserStatus, { label: string; tone: string }> = {
  ACTIVE: { label: "Active", tone: "badge-ok" },
  SUSPENDED: { label: "On hold", tone: "badge-warn" },
  BANNED: { label: "Banned", tone: "badge-bad" },
  DELETED: { label: "Deleted", tone: "badge-outline" },
};

export function StatusBadge({ status }: { status: UserStatus }) {
  const s = USER[status];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

const ORDER: Record<OrderStatus, { label: string; tone: string }> = {
  PENDING: { label: "Not paid", tone: "badge-outline" },
  PAID: { label: "Paid", tone: "badge-ok" },
  REFUNDED: { label: "Refunded", tone: "badge-bad" },
  PARTIALLY_REFUNDED: { label: "Part refunded", tone: "badge-warn" },
  FAILED: { label: "Failed", tone: "badge-bad" },
  CANCELED: { label: "Canceled", tone: "badge-outline" },
  DISPUTED: { label: "Card dispute", tone: "badge-bad" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER[status];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}
