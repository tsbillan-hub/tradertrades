import type { ProductType } from "@/generated/prisma/enums";

/** Extra settings stored on Product.settings, by product type. Always read through productSettings(). */
export type ProductSettings = {
  /** Mentoring: length of each call and booking rules. */
  durationMin: number;
  bufferMin: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  /** Mentoring and events: "daily" | "jitsi" | "link" (creator's own link). */
  callProvider: "daily" | "jitsi" | "link";
  callLink: string;
  /** Indicators. */
  indicatorPlatform: string;
  accessType: "username" | "download" | "license";
  /** Community: message shown to new members. */
  welcome: string;
  /** Events: length in minutes. */
  eventMinutes: number;
};

const DEFAULTS: ProductSettings = {
  durationMin: 60,
  bufferMin: 15,
  minNoticeHours: 12,
  maxDaysAhead: 30,
  callProvider: "jitsi",
  callLink: "",
  indicatorPlatform: "TradingView",
  accessType: "username",
  welcome: "",
  eventMinutes: 60,
};

export function productSettings(raw: unknown): ProductSettings {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof ProductSettings, min: number, max: number) => {
    const v = Number(r[k]);
    if (Number.isFinite(v)) (out[k] as number) = Math.min(max, Math.max(min, Math.round(v)));
  };
  num("durationMin", 15, 240);
  num("bufferMin", 0, 120);
  num("minNoticeHours", 0, 168);
  num("maxDaysAhead", 1, 120);
  num("eventMinutes", 15, 600);
  if (r.callProvider === "daily" || r.callProvider === "jitsi" || r.callProvider === "link") out.callProvider = r.callProvider;
  if (typeof r.callLink === "string") out.callLink = r.callLink.slice(0, 300);
  if (typeof r.indicatorPlatform === "string") out.indicatorPlatform = r.indicatorPlatform.slice(0, 40);
  if (r.accessType === "username" || r.accessType === "download" || r.accessType === "license") out.accessType = r.accessType;
  if (typeof r.welcome === "string") out.welcome = r.welcome.slice(0, 2000);
  return out;
}

/** Sensible starting includes for a new product, so the editor isn't blank. */
export const STARTER_INCLUDES: Record<ProductType, string[]> = {
  COMMUNITY: ["Members chat and announcements", "Live sessions", "Resources and recordings"],
  COURSE: ["Video lessons", "Downloadable resources", "Lifetime access"],
  MENTORING: ["1 to 1 video call", "Call notes afterwards"],
  ALERTS: ["Time stamped trade ideas with reasoning", "Full history, wins and losses"],
  INDICATOR: ["Indicator access on TradingView", "Setup guide"],
  DOWNLOAD: ["Instant download"],
  EVENT: ["Live session", "Recording afterwards"],
};
