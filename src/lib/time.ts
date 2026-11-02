/** Time zone helpers that work with the built-in Intl API (no extra libraries). */

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "2026-11-05" + "09:30" in "America/New_York" → the matching UTC instant. Returns null for bad input. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hh, mm] = [Number(t[1]), Number(t[2])];
  if (m < 1 || m > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const first = zoneOffsetMs(new Date(guess), tz);
  let ts = guess - first;
  // Around daylight saving changes the offset at the real instant can differ from the guess.
  const second = zoneOffsetMs(new Date(ts), tz);
  if (second !== first) ts = guess - second;
  return new Date(ts);
}

/** The local date ("2026-11-05") and time ("09:30") of an instant in a time zone, for form fields. */
export function utcToZoned(at: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "Thu, Nov 5 · 9:30 AM EST" in the given time zone. */
export function formatWhen(at: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const day = at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
  return `${day} · ${time}`;
}

/** "Thursday, November 5" in the given time zone. */
export function formatDay(at: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return at.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
}

/** "9:30 AM EST" in the given time zone. */
export function formatTime(at: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
}

/** Exact time stamp for alerts: "Nov 5, 2026, 9:31:07 AM EST". */
export function formatStamp(at: Date, timeZone: string) {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });
}

/** Builds a calendar (.ics) file for one event. */
export function icsEvent(e: { uid: string; title: string; description?: string; start: Date; minutes: number; url?: string }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TraderTrades//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@tradertrades`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : "",
    e.url ? `URL:${e.url}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}
