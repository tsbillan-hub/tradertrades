/**
 * Adds the example creator page, @tris: a profile, three sample listings and the A+ setup video.
 *
 *   npm run db:seed-example
 *
 * Safe to run again and again. Once @tris exists it is never touched, and if staff removed the example
 * (Admin > Accounts > @tris > Remove sample account) it is not added back.
 * Runs on Vercel builds after migrations (see scripts/migrate-on-deploy.mjs). Set SEED_EXAMPLE=0 to skip it.
 *
 * The listings are marked as samples: they show a "Sample" label and can't be bought.
 * The account can't be signed in to (it has no email or password anyone knows).
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { mediaUrl, saveMedia, UploadError } from "@/server/storage";
import { productSettings } from "@/lib/product-settings";

const USERNAME = "tris";
const DIR = path.join(process.cwd(), "scripts", "example");

const community = {
  type: "COMMUNITY" as const,
  slug: "a-plus-setup-community",
  title: "A+ Setup Community",
  subtitle: "Learn my A+ setup and watch me mark up the market every weekday.",
  description: [
    "This is where I share how I trade the A+ setup: a fair value gap, liquidity resting above or below it, and a clear break of structure before I take an entry.",
    "Every weekday before the New York open I post the levels I'm watching. When a setup forms I break it down here, and every weekend I review the week's trades, the losers as well as the winners.",
    "You also get a members chat to ask questions, post your own markups and learn alongside other traders using the same model.",
    "This is education, not signals or financial advice. Trading is risky and most traders lose money, so learn the process before you put real money on it.",
  ].join("\n\n"),
  includes: ["Levels I'm watching before the New York open", "A+ setup breakdowns as they form", "A weekly review of my trades, losers included", "Members chat for questions and markups"],
  prices: [
    { label: "Monthly", amountCents: 2900, interval: "MONTH" as const, position: 0 },
    { label: "Yearly", amountCents: 29000, interval: "YEAR" as const, position: 1 },
  ],
  settings: { welcome: "Welcome in. Start with the pinned post in Announcements, then say hi in General and share a chart you're working on." },
};

const course = {
  type: "COURSE" as const,
  slug: "a-plus-setup-course",
  title: "The A+ Setup Course",
  subtitle: "Fair value gaps, liquidity and break of structure, step by step.",
  description: [
    "The whole A+ setup in one place: what each piece means, how they line up, and the rules I use for entries, stops and targets.",
    "Short lessons, each with a chart example, plus a checklist you can keep next to your charts.",
    "This is education, not financial advice. Trading is risky, so practise on a demo account first.",
  ].join("\n\n"),
  includes: ["8 short lessons with chart examples", "The A+ setup checklist", "Lifetime access, including updates"],
  prices: [{ label: "Full course", amountCents: 7900, interval: "ONE_TIME" as const, position: 0 }],
  modules: [
    { title: "The pieces", lessons: ["What makes a setup A+", "Fair value gaps", "Liquidity"] },
    { title: "The entry", lessons: ["Break of structure", "Where I get in", "Stops, targets and risk"] },
    { title: "Putting it together", lessons: ["Marking up a chart with me", "Your A+ checklist"] },
  ],
};

const mentoring = {
  type: "MENTORING" as const,
  slug: "chart-review-call",
  title: "1-on-1 Chart Review",
  subtitle: "45 minutes on a call going through your charts and your trades.",
  description: [
    "Bring your charts and a few recent trades. We go through them together: whether the setup was really A+, where the entry, stop and target should have been, and one thing to work on next.",
    "Education only, not financial advice.",
  ].join("\n\n"),
  includes: ["45-minute video call", "A look at your charts and recent trades", "A short note on what to work on next"],
  prices: [
    { label: "One call", amountCents: 6000, interval: "ONE_TIME" as const, sessions: 1, position: 0 },
    { label: "Three calls", amountCents: 16000, interval: "ONE_TIME" as const, sessions: 3, position: 1 },
  ],
  settings: { durationMin: 45 },
};

/** The A+ setup video, pinned on the profile and shown on the community listing. Null when there's no file storage yet. */
async function addVideo(userId: string, productId: string | null) {
  try {
    const file = await saveMedia({
      ownerId: userId,
      purpose: "video",
      mimeType: "video/mp4",
      originalName: "aplus-setup.mp4",
      body: fs.readFileSync(path.join(DIR, "aplus-setup.mp4")),
      meta: { width: 720, height: 1280, durationSec: 37 },
    });
    const poster = await saveMedia({
      ownerId: userId,
      purpose: "poster",
      mimeType: "image/jpeg",
      originalName: "aplus-setup.jpg",
      body: fs.readFileSync(path.join(DIR, "aplus-setup.jpg")),
      meta: { width: 720, height: 1280 },
    });
    const video = await db.videoPost.create({
      data: {
        authorId: userId,
        productId,
        title: "My A+ setup, step by step",
        description:
          "The setup I trade in under 40 seconds: the fair value gap, the liquidity, the break of structure, and where I get in with my stop and target.",
        mediaId: file.id,
        posterUrl: mediaUrl(poster),
        durationSec: 37,
        aspect: "9:16",
        status: "PUBLISHED",
      },
    });
    await db.creatorProfile.update({ where: { userId }, data: { pinnedVideoId: video.id } });
    return video;
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    console.log(`[example] Video skipped for now: ${err.message}`);
    return null;
  }
}

async function main() {
  if (process.env.SEED_EXAMPLE === "0") return console.log("[example] Skipped (SEED_EXAMPLE=0).");
  if (!process.env.DATABASE_URL) {
    console.error("[example] No DATABASE_URL set.");
    process.exit(1);
  }
  const existing = await db.user.findUnique({
    where: { username: USERNAME },
    select: { id: true, isSample: true, _count: { select: { videos: true } } },
  });
  if (existing) {
    // An earlier deploy ran before file storage was connected, so the page has no video yet: add it now.
    if (existing.isSample && existing._count.videos === 0) {
      const comm = await db.product.findFirst({ where: { creatorId: existing.id, slug: community.slug }, select: { id: true } });
      const video = await addVideo(existing.id, comm?.id ?? null);
      if (video) return console.log(`[example] Added the A+ setup video to @${USERNAME}.`);
    }
    return console.log(`[example] @${USERNAME} already exists. Left as it is.`);
  }
  const removed = await db.auditLog.findFirst({ where: { action: "sample.removed", data: { path: ["username"], equals: USERNAME } }, select: { id: true } });
  if (removed) return console.log(`[example] Staff removed the example page, so it isn't added back.`);

  const now = new Date();
  const user = await db.user.create({
    data: {
      email: `${USERNAME}@example.invalid`,
      passwordHash: "sample-account:no-sign-in",
      username: USERNAME,
      displayName: "Tris",
      bio: "Trader. I share the A+ setup I use: fair value gaps, liquidity and break of structure.",
      about: [
        "I make videos about trading and the setup I use. Here you'll find my community, my course and 1-on-1 chart reviews.",
        "Nothing here is financial advice. Trading is risky.",
      ].join("\n\n"),
      isSample: true,
      creator: {
        create: {
          status: "APPROVED",
          headline: "The A+ setup: fair value gaps, liquidity and break of structure",
          markets: ["FUTURES", "FOREX"],
          tradingStyle: "Intraday, around the New York open",
          appliedAt: now,
          approvedAt: now,
          acceptsCampaigns: false,
        },
      },
    },
  });

  try {
    const make = async (p: typeof community | typeof course | typeof mentoring, extra: Record<string, unknown> = {}) =>
      db.product.create({
        data: {
          creatorId: user.id,
          type: p.type,
          slug: p.slug,
          title: p.title,
          subtitle: p.subtitle,
          description: p.description,
          includes: p.includes,
          markets: ["FUTURES", "FOREX"],
          level: "ALL",
          tags: ["fair value gap", "liquidity", "break of structure", "price action"],
          platforms: ["TradingView"],
          settings: { ...productSettings(null), ...("settings" in p ? p.settings : {}) },
          refundDays: 7,
          status: "PUBLISHED",
          publishedAt: now,
          checkedAt: now,
          isSample: true,
          priceFromCents: Math.min(...p.prices.map((x) => x.amountCents)),
          prices: { create: p.prices.map((x) => ({ ...x, sessions: "sessions" in x ? x.sessions : null })) },
          ...extra,
        },
      });

    const comm = await make(community, {
      channels: {
        create: [
          { name: "Announcements", slug: "announcements", kind: "ANNOUNCEMENTS", postingPolicy: "OWNER", position: 0, description: "News and updates from the host" },
          { name: "General", slug: "general", kind: "CHAT", postingPolicy: "MEMBERS", position: 1, description: "Talk with other members" },
          { name: "Resources", slug: "resources", kind: "RESOURCES", postingPolicy: "OWNER", position: 2, description: "Guides, files and recordings" },
        ],
      },
    });
    const crs = await make(course);
    for (const [i, m] of course.modules.entries()) {
      const mod = await db.courseModule.create({ data: { productId: crs.id, title: m.title, position: i } });
      for (const [j, title] of m.lessons.entries()) {
        await db.lesson.create({
          data: {
            moduleId: mod.id,
            productId: crs.id,
            title,
            position: j,
            kind: "TEXT",
            body: "This is an example lesson. The real lesson goes here.",
            isPreview: i === 0 && j === 0,
          },
        });
      }
    }
    await make(mentoring);

    const video = await addVideo(user.id, comm.id);
    console.log(`[example] Added @${USERNAME} with 3 sample listings${video ? " and the A+ setup video" : ""}.`);
  } catch (err) {
    // Leave nothing half made: the next run starts clean.
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("[example] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
