export const PRODUCT_STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "badge-outline" },
  IN_REVIEW: { label: "In review", tone: "badge-info" },
  CHANGES_REQUESTED: { label: "Changes needed", tone: "badge-warn" },
  PUBLISHED: { label: "Live", tone: "badge-ok" },
  ARCHIVED: { label: "Archived", tone: "badge-outline" },
  SUSPENDED: { label: "Taken down", tone: "badge-bad" },
};
