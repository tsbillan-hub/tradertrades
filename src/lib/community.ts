/** Shared by the members area UI and its server actions. */

export const REACTIONS = ["👍", "🔥", "🎯", "💡", "🙏"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export const REACTION_LABEL: Record<ReactionEmoji, string> = {
  "👍": "Like",
  "🔥": "Fire",
  "🎯": "On target",
  "💡": "Learned something",
  "🙏": "Thanks",
};

export const CHANNEL_KIND_LABEL: Record<string, string> = {
  CHAT: "Chat",
  ANNOUNCEMENTS: "Announcements",
  RESOURCES: "Resources",
  ALERTS: "Alerts",
};

export const ALERT_STATE_LABEL: Record<string, { label: string; tone: string; final: boolean }> = {
  OPEN: { label: "Open", tone: "badge-warn", final: false },
  TARGET_HIT: { label: "Target hit", tone: "badge-ok", final: true },
  STOPPED: { label: "Stopped out", tone: "badge-bad", final: true },
  CLOSED: { label: "Closed", tone: "badge-outline", final: true },
  CANCELED: { label: "Canceled", tone: "badge-outline", final: true },
};

export const POSTS_PER_PAGE = 20;
