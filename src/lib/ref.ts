// Referral cookie: remembers which creators' own links this browser came through.
// Format: "username:unixSeconds,username:unixSeconds" (max 10, 30 days each).

export const REF_COOKIE = "tt_ref";
export const REF_DAYS = 30;

export function parseRefs(raw: string | undefined | null): { u: string; t: number }[] {
  if (!raw) return [];
  const now = Math.floor(Date.now() / 1000);
  return raw
    .split(",")
    .map((p) => {
      const [u, t] = p.split(":");
      return { u: (u ?? "").toLowerCase(), t: Number(t) };
    })
    .filter((r) => /^[a-z0-9_]{3,24}$/.test(r.u) && Number.isFinite(r.t) && now - r.t < REF_DAYS * 86400);
}

export function addRef(raw: string | undefined | null, username: string) {
  const u = username.toLowerCase();
  const list = parseRefs(raw).filter((r) => r.u !== u);
  list.unshift({ u, t: Math.floor(Date.now() / 1000) });
  return list
    .slice(0, 10)
    .map((r) => `${r.u}:${r.t}`)
    .join(",");
}

export function hasRef(raw: string | undefined | null, username: string) {
  const u = username.toLowerCase();
  return parseRefs(raw).some((r) => r.u === u);
}
