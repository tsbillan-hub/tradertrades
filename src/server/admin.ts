import "server-only";
import type { ReportTarget } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { insidePath, productPath } from "@/lib/paths";
import { truncate } from "@/lib/utils";
import { notify } from "@/server/notify";
import { refreshRating } from "@/server/commerce/ratings";
import { refreshCompanyRating } from "@/server/queries/directory";
import { removeMedia } from "@/server/storage";

/** Everyone who can use the admin area: the isAdmin flag, or an address in ADMIN_EMAILS. */
export async function adminIds() {
  const admins = await db.user.findMany({
    where: { OR: [{ isAdmin: true }, ...(env.adminEmails.length ? [{ email: { in: env.adminEmails } }] : [])], status: "ACTIVE" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** An in-app notice for every admin (no email, so a busy day doesn't flood the inbox). */
export async function notifyAdmins(n: { type: string; title: string; body?: string; url: string }) {
  for (const id of await adminIds()) await notify(id, n);
}

export const TARGET_LABEL: Record<ReportTarget, string> = {
  USER: "Account",
  PRODUCT: "Listing",
  PRODUCT_REVIEW: "Product review",
  COMPANY: "Directory company",
  COMPANY_REVIEW: "Company review",
  POST: "Community post",
  COMMENT: "Comment",
  MESSAGE: "Private message",
  VIDEO: "Video",
  JOB: "Job post",
  CAMPAIGN: "Campaign",
};

/** What a takedown does, in plain words, for the button and the confirm box. */
export const TAKEDOWN_LABEL: Record<ReportTarget, string> = {
  USER: "Suspend the account",
  PRODUCT: "Take the listing down",
  PRODUCT_REVIEW: "Remove the review",
  COMPANY: "Hide the company",
  COMPANY_REVIEW: "Remove the review",
  POST: "Delete the post",
  COMMENT: "Delete the comment",
  MESSAGE: "Delete the message",
  VIDEO: "Take the video down",
  JOB: "Close the job post",
  CAMPAIGN: "Close the campaign",
};

export type TargetPreview = {
  exists: boolean;
  /** Already taken down or deleted. */
  gone: boolean;
  title: string;
  excerpt?: string;
  href?: string;
  owner?: { id: string; displayName: string; username: string } | null;
};

const ownerSelect = { id: true, displayName: true, username: true } as const;
const missing: TargetPreview = { exists: false, gone: true, title: "This no longer exists" };

/** A short look at what was reported or flagged, with a link to see it in place. */
export async function targetPreview(type: ReportTarget, id: string): Promise<TargetPreview> {
  switch (type) {
    case "USER": {
      const u = await db.user.findUnique({ where: { id }, select: { ...ownerSelect, bio: true, status: true } });
      if (!u) return missing;
      return { exists: true, gone: u.status !== "ACTIVE", title: `${u.displayName} (@${u.username})`, excerpt: u.bio ?? undefined, href: `/@${u.username}`, owner: u };
    }
    case "PRODUCT": {
      const p = await db.product.findUnique({ where: { id }, include: { creator: { select: ownerSelect } } });
      if (!p) return missing;
      return {
        exists: true,
        gone: p.status === "SUSPENDED" || p.status === "ARCHIVED",
        title: p.title,
        excerpt: p.subtitle ?? undefined,
        href: productPath(p.creator.username, p.slug),
        owner: p.creator,
      };
    }
    case "PRODUCT_REVIEW": {
      const r = await db.productReview.findUnique({ where: { id }, include: { user: { select: ownerSelect }, product: { select: { title: true, slug: true, creator: { select: { username: true } } } } } });
      if (!r) return missing;
      return {
        exists: true,
        gone: r.status === "REMOVED",
        title: `${r.rating}★ review of ${r.product.title}`,
        excerpt: truncate([r.title, r.body].filter(Boolean).join(". "), 280),
        href: `${productPath(r.product.creator.username, r.product.slug)}#reviews`,
        owner: r.user,
      };
    }
    case "COMPANY": {
      const c = await db.company.findUnique({ where: { id } });
      if (!c) return missing;
      return { exists: true, gone: c.status !== "PUBLISHED", title: c.name, excerpt: c.tagline ?? undefined, href: `/directory/c/${c.slug}` };
    }
    case "COMPANY_REVIEW": {
      const r = await db.companyReview.findUnique({ where: { id }, include: { user: { select: ownerSelect }, company: { select: { name: true, slug: true } } } });
      if (!r) return missing;
      return {
        exists: true,
        gone: r.status === "REMOVED",
        title: `${r.rating}★ review of ${r.company.name}`,
        excerpt: truncate(`${r.title}. ${r.body}`, 280),
        href: `/directory/c/${r.company.slug}#r-${r.id}`,
        owner: r.user,
      };
    }
    case "POST": {
      const p = await db.post.findUnique({ where: { id }, include: { author: { select: ownerSelect }, product: { select: { title: true, slug: true, creator: { select: { username: true } } } } } });
      if (!p) return missing;
      return {
        exists: true,
        gone: Boolean(p.deletedAt),
        title: `Post in ${p.product.title}`,
        excerpt: truncate(p.body, 280),
        href: insidePath(p.product.creator.username, p.product.slug, `/post/${p.id}`),
        owner: p.author,
      };
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({
        where: { id },
        include: { author: { select: ownerSelect }, post: { select: { id: true, product: { select: { title: true, slug: true, creator: { select: { username: true } } } } } } },
      });
      if (!c) return missing;
      return {
        exists: true,
        gone: Boolean(c.deletedAt),
        title: `Comment in ${c.post.product.title}`,
        excerpt: truncate(c.body, 280),
        href: insidePath(c.post.product.creator.username, c.post.product.slug, `/post/${c.post.id}`),
        owner: c.author,
      };
    }
    case "MESSAGE": {
      const m = await db.message.findUnique({ where: { id }, include: { sender: { select: ownerSelect } } });
      if (!m) return missing;
      return { exists: true, gone: Boolean(m.deletedAt), title: "Private message", excerpt: truncate(m.body, 280), owner: m.sender };
    }
    case "VIDEO": {
      const v = await db.videoPost.findUnique({ where: { id }, include: { author: { select: ownerSelect } } });
      if (!v) return missing;
      return { exists: true, gone: v.status === "REMOVED", title: v.title, excerpt: v.description ? truncate(v.description, 280) : undefined, href: `/v/${v.id}`, owner: v.author };
    }
    case "JOB": {
      const j = await db.jobPost.findUnique({ where: { id } });
      if (!j) return missing;
      return { exists: true, gone: j.status !== "OPEN", title: j.title, href: `/jobs/${j.id}` };
    }
    case "CAMPAIGN": {
      const c = await db.campaign.findUnique({ where: { id } });
      if (!c) return missing;
      return { exists: true, gone: c.status === "CLOSED", title: c.title };
    }
  }
}

/**
 * Takes down a reported or flagged thing and tells its owner why. Returns false if there was nothing to take down.
 * Accounts are suspended (they can still sign in to reach what they bought, but can't post, message or sell).
 */
export async function takeDown(type: ReportTarget, id: string, reason: string) {
  const now = new Date();
  const why = reason.trim() || "It broke the marketplace rules.";
  switch (type) {
    case "USER": {
      const u = await db.user.findUnique({ where: { id } });
      if (!u || u.isAdmin || u.status !== "ACTIVE") return false;
      await db.user.update({ where: { id }, data: { status: "SUSPENDED", statusReason: why } });
      await notify(id, { type: "account.suspended", title: "Your account is on hold", body: why, url: "/suspended", email: "orders" });
      return true;
    }
    case "PRODUCT": {
      const p = await db.product.findUnique({ where: { id } });
      if (!p || p.status === "SUSPENDED") return false;
      await db.product.update({ where: { id }, data: { status: "SUSPENDED", reviewNote: why } });
      await notify(p.creatorId, { type: "product.suspended", title: `Our team took down "${p.title}"`, body: why, url: `/creator/products/${p.id}`, email: "orders" });
      return true;
    }
    case "PRODUCT_REVIEW": {
      const r = await db.productReview.findUnique({ where: { id }, include: { product: { select: { title: true } } } });
      if (!r || r.status === "REMOVED") return false;
      await db.productReview.update({ where: { id }, data: { status: "REMOVED" } });
      await refreshRating(r.productId);
      await notify(r.userId, { type: "review.removed", title: `We removed your review of ${r.product.title}`, body: why, url: "/rules" });
      return true;
    }
    case "COMPANY": {
      const c = await db.company.findUnique({ where: { id } });
      if (!c || c.status === "HIDDEN") return false;
      await db.company.update({ where: { id }, data: { status: "HIDDEN" } });
      return true;
    }
    case "COMPANY_REVIEW": {
      const r = await db.companyReview.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
      if (!r || r.status === "REMOVED") return false;
      await db.companyReview.update({ where: { id }, data: { status: "REMOVED", proofMediaId: null } });
      if (r.proofMediaId) await removeMedia(r.proofMediaId);
      await refreshCompanyRating(r.companyId);
      await notify(r.userId, { type: "review.removed", title: `We removed your review of ${r.company.name}`, body: why, url: "/rules" });
      return true;
    }
    case "POST": {
      const p = await db.post.findUnique({ where: { id } });
      if (!p || p.deletedAt) return false;
      await db.post.update({ where: { id }, data: { deletedAt: now } });
      await notify(p.authorId, { type: "post.removed", title: "We removed one of your posts", body: why, url: "/rules" });
      return true;
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id } });
      if (!c || c.deletedAt) return false;
      await db.comment.update({ where: { id }, data: { deletedAt: now } });
      await notify(c.authorId, { type: "comment.removed", title: "We removed one of your comments", body: why, url: "/rules" });
      return true;
    }
    case "MESSAGE": {
      const m = await db.message.findUnique({ where: { id } });
      if (!m || m.deletedAt) return false;
      await db.message.update({ where: { id }, data: { deletedAt: now } });
      return true;
    }
    case "VIDEO": {
      const v = await db.videoPost.findUnique({ where: { id } });
      if (!v || v.status === "REMOVED") return false;
      await db.$transaction([
        db.videoPost.update({ where: { id }, data: { status: "REMOVED" } }),
        db.product.updateMany({ where: { trailerId: id }, data: { trailerId: null } }),
        db.creatorProfile.updateMany({ where: { pinnedVideoId: id }, data: { pinnedVideoId: null } }),
      ]);
      if (v.authorId) await notify(v.authorId, { type: "video.removed", title: `Our team took down your video "${v.title}"`, body: why, url: "/creator/videos" });
      return true;
    }
    case "JOB": {
      const j = await db.jobPost.findUnique({ where: { id } });
      if (!j || j.status !== "OPEN") return false;
      await db.jobPost.update({ where: { id }, data: { status: "CLOSED" } });
      return true;
    }
    case "CAMPAIGN": {
      const c = await db.campaign.findUnique({ where: { id } });
      if (!c || c.status === "CLOSED") return false;
      await db.campaign.update({ where: { id }, data: { status: "CLOSED" } });
      return true;
    }
  }
}
