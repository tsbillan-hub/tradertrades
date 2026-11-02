import "server-only";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { emailPrefs } from "@/server/notify";
import { memberIds } from "@/server/inside";

type Fanout = { type: string; title: string; body?: string; url: string; ctaLabel?: string };

/**
 * Tells every member of a product (and optionally its creator) about something new.
 * In-app for everyone; email only when `email` is set and the member allows community emails.
 */
export async function notifyMembers(productId: string, n: Fanout, opts: { exceptUserId?: string; includeCreator?: boolean; email?: boolean } = {}) {
  const ids = new Set(await memberIds(productId));
  if (opts.includeCreator) {
    const p = await db.product.findUnique({ where: { id: productId }, select: { creatorId: true } });
    if (p) ids.add(p.creatorId);
  }
  if (opts.exceptUserId) ids.delete(opts.exceptUserId);
  const list = [...ids];
  if (!list.length) return 0;

  for (let i = 0; i < list.length; i += 500) {
    await db.notification.createMany({
      data: list.slice(i, i + 500).map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, url: n.url })),
    });
  }

  if (opts.email) {
    const users = await db.user.findMany({
      where: { id: { in: list }, emailVerifiedAt: { not: null }, status: "ACTIVE" },
      select: { id: true, email: true, emailPrefs: true },
    });
    for (const u of users) {
      if (!emailPrefs(u.emailPrefs).community) continue;
      try {
        await sendEmail(
          u.email,
          emails.generic({
            subject: n.title,
            heading: n.title,
            body: n.body ? [n.body] : [],
            cta: { label: n.ctaLabel ?? "Open it", url: absoluteUrl(n.url) },
          }),
          { template: `notify:${n.type}`, userId: u.id },
        );
      } catch (err) {
        console.error("[community] email failed", err);
      }
    }
  }
  return list.length;
}

/** Marks a channel as read for someone, so the sidebar stops showing it as new. */
export async function markChannelRead(userId: string, channelId: string) {
  await db.channelRead.upsert({
    where: { userId_channelId: { userId, channelId } },
    create: { userId, channelId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}

/** Channels with posts newer than the person's last visit. */
export async function unreadChannels(userId: string, productId: string) {
  const [latest, reads] = await Promise.all([
    db.post.groupBy({ by: ["channelId"], where: { productId, deletedAt: null, NOT: { authorId: userId } }, _max: { createdAt: true } }),
    db.channelRead.findMany({ where: { userId, channel: { productId } }, select: { channelId: true, lastReadAt: true } }),
  ]);
  const seen = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  return new Set(
    latest
      .filter((l) => {
        const last = l._max.createdAt;
        const read = seen.get(l.channelId);
        return last && (!read || last > read);
      })
      .map((l) => l.channelId),
  );
}

/** Media rows for a set of posts, keyed by id, so a feed can render images, files and videos. */
export async function mediaFor(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; kind: string; purpose: string | null; originalName: string; sizeBytes: number; width: number | null; height: number | null; durationSec: number | null; mimeType: string }>();
  const rows = await db.media.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, kind: true, purpose: true, originalName: true, sizeBytes: true, width: true, height: true, durationSec: true, mimeType: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}
