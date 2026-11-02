import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats cents as dollars. Whole dollar amounts drop the ".00". */
export function money(cents: number, opts: { exact?: boolean } = {}) {
  if (!opts.exact && cents % 100 === 0) return usdWhole.format(cents / 100);
  return usd.format(cents / 100);
}

export function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function formatDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: Date | string, timeZone?: string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: timeZone ? "short" : undefined,
  });
}

export function timeAgo(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 365) return formatDate(date, { month: "short", day: "numeric" });
  return formatDate(date);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable palette pick for monogram avatars, so the same name always gets the same colour. */
export function monogramColor(seed: string) {
  const palette = [
    ["#16130F", "#F2EADB"],
    ["#F2EADB", "#16130F"],
    ["#2B4A3E", "#EAF2EC"],
    ["#4A2B2B", "#F6E7E3"],
    ["#2B3A4A", "#E6EDF5"],
    ["#4A3F2B", "#F5EEDD"],
    ["#3D2B4A", "#EFE6F5"],
    ["#FF4B1F", "#FFFFFF"],
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [bg, fg] = palette[h % palette.length];
  return { bg, fg };
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function orderNumber(n: number) {
  return `TT-${(10000 + n).toString()}`;
}

/** Converts a YouTube, Vimeo or Loom link into an embeddable player URL. */
export function toEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
      if (u.pathname.startsWith("/shorts/"))
        return `https://www.youtube-nocookie.com/embed/${u.pathname.split("/")[2]}`;
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "player.vimeo.com") return url;
    if (host === "loom.com" && (u.pathname.startsWith("/share/") || u.pathname.startsWith("/embed/"))) {
      const id = u.pathname.split("/")[2];
      if (id && /^[a-zA-Z0-9]+$/.test(id)) return `https://www.loom.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeThumb(url: string | null | undefined) {
  const embed = toEmbedUrl(url);
  if (!embed || !embed.includes("youtube")) return null;
  const id = embed.split("/embed/")[1]?.split(/[?&]/)[0];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function durationLabel(sec: number | null | undefined) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function minutesLabel(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** A date `days` from now (negative for the past). Keeps Date.now() out of render code. */
export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400_000);
}

/** Milliseconds since a date. */
export function msSince(d: Date) {
  return Date.now() - d.getTime();
}
