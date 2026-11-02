import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, CircleCheck, Link2Off, Settings } from "lucide-react";
import { db } from "@/lib/db";
import { readUnsubscribeToken } from "@/server/broadcasts";
import { resubscribeWithToken, unsubscribeFromCreator } from "@/server/actions/broadcasts";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Email settings", robots: { index: false } };

function Shell({ icon, tone = "neutral", children }: { icon: React.ReactNode; tone?: "neutral" | "ok"; children: React.ReactNode }) {
  return (
    <div className="container-tt max-w-xl py-12 sm:py-16">
      <div className={tone === "ok" ? "grid size-12 place-items-center rounded-full bg-up-soft text-up" : "grid size-12 place-items-center rounded-full bg-sunk text-ink-2"}>{icon}</div>
      {children}
    </div>
  );
}

/**
 * Where "Stop emails from X" in a creator's email lands. The page only shows a button: opening the link
 * changes nothing, because inbox link scanners open every link in an email.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; back?: string }> }) {
  const sp = await searchParams;
  const t = readUnsubscribeToken(sp.t);
  const creator = t ? await db.user.findUnique({ where: { id: t.creatorId }, select: { displayName: true, username: true } }) : null;

  if (!t || !creator) {
    return (
      <Shell icon={<Link2Off className="size-6" />}>
        <h1 className="mt-5 text-3xl">This link doesn&apos;t work</h1>
        <p className="mt-3 text-ink-2">It may have been cut off when it was copied. You can turn off emails from creators in your email settings instead.</p>
        <Link href="/settings/notifications" className="btn btn-primary mt-6">
          <Settings /> Email settings
        </Link>
      </Shell>
    );
  }

  if (t.userId === t.creatorId) {
    return (
      <Shell icon={<BellOff className="size-6" />}>
        <h1 className="mt-5 text-3xl">This is the link your customers get</h1>
        <p className="mt-3 text-ink-2">
          In a real email, this page lets the person stop your emails with one click. It does nothing here, because this was your test email.
        </p>
        <Link href="/creator/customers/email" className="btn btn-secondary mt-6">
          Back to your email
        </Link>
      </Shell>
    );
  }

  const off = await db.creatorEmailOptOut.findUnique({ where: { userId_creatorId: { userId: t.userId, creatorId: t.creatorId } }, select: { createdAt: true } });

  if (off) {
    return (
      <Shell icon={<CircleCheck className="size-6" />} tone="ok">
        <h1 className="mt-5 text-3xl">Done. No more emails from {creator.displayName}</h1>
        <p className="mt-3 text-ink-2">
          You still have everything you bought from them, and you still get receipts and messages. Other creators&apos; emails aren&apos;t affected.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={resubscribeWithToken} className="contents">
            <input type="hidden" name="t" value={sp.t} />
            <SubmitButton variant="secondary">Turn their emails back on</SubmitButton>
          </form>
          <Link href="/settings/notifications" className="btn btn-ghost">
            <Settings /> All email settings
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={<BellOff className="size-6" />}>
      <h1 className="mt-5 text-3xl">{sp.back ? `${creator.displayName}'s emails are back on` : `Stop emails from ${creator.displayName}?`}</h1>
      <p className="mt-3 text-ink-2">
        {sp.back
          ? "You'll get their updates again. You can stop them any time from the link at the bottom of their emails."
          : "You'll stop getting their updates. You keep everything you bought from them, and receipts and messages still come as normal."}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {sp.back ? null : (
          <form action={unsubscribeFromCreator} className="contents">
            <input type="hidden" name="t" value={sp.t} />
            <SubmitButton variant="primary">
              <BellOff /> Stop their emails
            </SubmitButton>
          </form>
        )}
        <Link href={`/u/${creator.username}`} className="btn btn-ghost">
          Open {creator.displayName}&apos;s page
        </Link>
      </div>
    </Shell>
  );
}
