import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { ActionButton, ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/ui/panel";
import { updateEmailPrefs } from "@/server/actions/account";
import { resubscribeToCreator } from "@/server/actions/broadcasts";
import { requireUser } from "@/server/dal";
import { EMAIL_PREFS, emailPrefs } from "@/server/notify";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const prefs = emailPrefs(user.emailPrefs);
  const turnedOff = await db.creatorEmailOptOut.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  return (
    <div className="space-y-6">
      <ActionForm action={updateEmailPrefs} toastOnSuccess>
        <Panel title="Email" description="You always see everything in your notifications. These control what also comes by email." footer={<SubmitButton>Save</SubmitButton>}>
          <div className="divide-y divide-line">
            {EMAIL_PREFS.map((p) => (
              <label key={p.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <span>
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block text-sm text-muted">{p.hint}</span>
                </span>
                <input type="checkbox" name={p.key} defaultChecked={prefs[p.key]} className="checkbox mt-1" />
              </label>
            ))}
            <div className="py-3 text-sm text-muted">Security emails (password changes, sign-in codes) always send.</div>
          </div>
          <div className="mt-2 border-t border-line pt-5">
            <div className="label">Who can message you</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                { v: "EVERYONE", l: "Anyone", h: "Any signed in member" },
                { v: "CUSTOMERS", l: "People I've dealt with", h: "Buyers, sellers and people I've messaged" },
                { v: "NOBODY", l: "Nobody", h: "Only replies to messages I start" },
              ].map((o) => (
                <label key={o.v} className="tile">
                  <input type="radio" name="dmPolicy" value={o.v} defaultChecked={user.dmPolicy === o.v} className="checkbox radio mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold">{o.l}</span>
                    <span className="block text-xs text-muted">{o.h}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <FormMessage hideSuccess className="mt-4" />
        </Panel>
      </ActionForm>
      {turnedOff.length ? (
        <Panel title="Creators you turned off" description="You don't get these creators' emails. Receipts and messages from them still come.">
          <ul className="-my-3 divide-y divide-line">
            {turnedOff.map((o) => (
              <li key={o.creatorId} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/u/${o.creator.username}`} className="flex min-w-0 items-center gap-3 hover:underline">
                  <Avatar src={o.creator.avatarUrl} name={o.creator.displayName} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{o.creator.displayName}</span>
                    <span className="block truncate text-xs text-muted">@{o.creator.username}</span>
                  </span>
                </Link>
                <ActionButton action={resubscribeToCreator} fields={{ creatorId: o.creatorId }}>
                  Turn back on
                </ActionButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
