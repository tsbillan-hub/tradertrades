import type { Metadata } from "next";
import { Laptop, Smartphone } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { ActionButton } from "@/components/ui/form";
import { TwoFactorSetup } from "@/components/settings/two-factor";
import { revokeOtherSessions, revokeSession } from "@/server/actions/account";
import { requireUser } from "@/server/dal";
import { currentSessionId } from "@/server/auth/session";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Security" };

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage() {
  const user = await requireUser();
  const [sessions, current] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    currentSessionId(),
  ]);

  return (
    <>
      <Panel title="Two-step sign in" description="Ask for a code from your phone when you sign in. Strongly recommended for creators and businesses.">
        <TwoFactorSetup enabled={Boolean(user.twoFactorEnabledAt)} backupCount={user.backupCodes.length} />
      </Panel>

      <Panel
        title="Where you're signed in"
        description="Sign out of anything you don't recognise, then change your password."
        action={
          sessions.length > 1 ? (
            <ActionButton action={revokeOtherSessions} confirm="Sign out of every other device?">
              Sign out everywhere else
            </ActionButton>
          ) : null
        }
      >
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-9 place-items-center rounded-lg bg-sunk text-muted">
                {/Mobile|iPhone|Android/.test(s.userAgent ?? "") ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {device(s.userAgent)} {s.id === current ? <span className="badge badge-ok ml-1.5 h-5 text-[11px]">This device</span> : null}
                </div>
                <div className="text-xs text-muted">
                  {s.ip ?? "Unknown IP"} · active {timeAgo(s.lastSeenAt)}
                </div>
              </div>
              {s.id !== current ? (
                <ActionButton action={revokeSession} fields={{ sessionId: s.id }} variant="ghost">
                  Sign out
                </ActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
