import "server-only";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { hmac } from "@/server/crypto";
import type { ViewTarget } from "@/generated/prisma/enums";

/** Set for a minute by a creator's share link, so a visit that arrives with no referrer still counts as "your link". */
export const VIA_COOKIE = "tt_via";

const BOT = /bot|crawl|spider|slurp|preview|fetch|curl|wget|python|axios|http-client|httpclient|monitor|lighthouse|headlesschrome|facebookexternalhit|embedly|whatsapp|telegrambot|discordbot|slackbot/i;

/** Known places a visitor can come from, by the referring site's host. */
const HOSTS: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "x"],
  [/(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/, "discord"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, "telegram"],
  [/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/, "facebook"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)tradingview\.com$/, "tradingview"],
  [/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com)$/, "search"],
];

/** Where on TraderTrades a visitor clicked through from, by the path they were on. */
function internalSource(path: string) {
  if (path === "/" || path === "") return "tt:home";
  if (path.startsWith("/marketplace")) return "tt:marketplace";
  if (path.startsWith("/search")) return "tt:search";
  if (path.startsWith("/creators")) return "tt:creators";
  if (path.startsWith("/directory")) return "tt:directory";
  if (path.startsWith("/campaigns") || path.startsWith("/business")) return "tt:business";
  if (path.startsWith("/@") || path.startsWith("/u/")) return "tt:profiles";
  return "tt:other";
}

/** Turns a Referer header into a short source key: "youtube", "tt:marketplace", "direct", or "site:example.com". */
export function sourceFromReferer(referer: string | null, ownHost: string | null, viaLink: boolean): string {
  if (!referer) return viaLink ? "link" : "direct";
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return viaLink ? "link" : "direct";
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  if (ownHost && host === ownHost.toLowerCase().replace(/^www\./, "").split(":")[0]) return internalSource(url.pathname);
  for (const [re, key] of HOSTS) if (re.test(host)) return key;
  return `site:${host.slice(0, 60)}`;
}

type ViewInput = {
  target: ViewTarget;
  targetId: string;
  /** Whose stats it counts toward: the creator's user id, or the company id. */
  ownerId: string;
  /** People don't count as visitors on their own pages. */
  skip?: boolean;
  viewerId?: string | null;
};

/**
 * Counts one visit to a creator page, product page, company listing or share link.
 * Each person counts once per page per day. Nobody is tracked across days: the visitor key is a
 * keyed hash of the day and the account (or the network address and browser), and only the hash is kept.
 * Bots and link previews are skipped, and the write happens after the page is sent.
 */
export async function trackView(input: ViewInput) {
  if (input.skip) return;
  const h = await headers();
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return;
  const ua = h.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return;
  const jar = await cookies();
  const viaLink = jar.get(VIA_COOKIE)?.value === "1";
  const source = input.target === "LINK" ? sourceFromReferer(h.get("referer"), h.get("host"), false) : sourceFromReferer(h.get("referer"), h.get("host"), viaLink);
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const visitor = hmac(`view|${day}|${input.viewerId ? `u:${input.viewerId}` : `a:${ip}|${ua}`}`).slice(0, 32);
  const data = { target: input.target, targetId: input.targetId, ownerId: input.ownerId, day: new Date(`${day}T00:00:00Z`), visitor, source };
  after(async () => {
    try {
      await db.pageView.createMany({ data: [data], skipDuplicates: true });
    } catch (err) {
      console.error("[views] could not record", err);
    }
  });
}

/** Words for a source key. */
export function sourceLabel(key: string) {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    instagram: "Instagram",
    tiktok: "TikTok",
    x: "X (Twitter)",
    discord: "Discord",
    telegram: "Telegram",
    facebook: "Facebook",
    reddit: "Reddit",
    linkedin: "LinkedIn",
    tradingview: "TradingView",
    search: "Google and other search",
    direct: "Typed in or no referrer",
    link: "Your link",
    "tt:home": "TraderTrades home page",
    "tt:marketplace": "TraderTrades marketplace",
    "tt:search": "TraderTrades search",
    "tt:creators": "TraderTrades creators list",
    "tt:directory": "TraderTrades directory",
    "tt:business": "TraderTrades business pages",
    "tt:profiles": "Other creators' pages",
    "tt:other": "Other pages on TraderTrades",
  };
  if (labels[key]) return labels[key];
  if (key.startsWith("site:")) return key.slice(5);
  return key;
}
