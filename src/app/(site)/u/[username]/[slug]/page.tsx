import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Hash,
  Lock,
  Megaphone,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import { db } from "@/lib/db";
import { absoluteUrl, env, features } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { isPublicProduct } from "@/server/commerce/checkout";
import { mediaUrlById } from "@/server/queries/media";
import { productCardInclude, publicProductWhere } from "@/server/queries/products";
import { toggleSaved } from "@/server/actions/profile";
import { joinWaitlist } from "@/server/actions/checkout";
import { deleteMyReview, replyToReview, submitProductReview } from "@/server/actions/reviews";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton, ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { CopyButton, ModalButton } from "@/components/ui/client";
import { EmptyState, Notice, RatingSummary, SampleBadge, Stars } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { GeneratedCover } from "@/components/market/cover";
import { ProductCard } from "@/components/market/product-card";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { RatingInput } from "@/components/market/rating-input";
import { TrustBadges, VerifiedTick } from "@/components/market/badges";
import { VideoPlayer } from "@/components/video/player";
import { VideoCard } from "@/components/video/video-card";
import { MessageButton } from "@/components/message-button";
import { ReportButton } from "@/components/report-button";
import { INTERVAL_LABEL, marketLabel, productTypeInfo, skillLabel } from "@/lib/constants";
import { productSettings } from "@/lib/product-settings";
import { insidePath, productPath, shareLink } from "@/lib/paths";
import { cn, durationLabel, formatDate, formatDateTime, minutesLabel, money, plural, stripMarkdown, timeAgo, truncate } from "@/lib/utils";
import type { ProductType } from "@/generated/prisma/enums";

type Props = { params: Promise<{ username: string; slug: string }> };

async function load(username: string, slug: string) {
  const now = new Date();
  return db.product.findFirst({
    where: { slug: slug.toLowerCase(), creator: { username: username.toLowerCase() } },
    include: {
      creator: { include: { creator: true, _count: { select: { followers: true } } } },
      prices: { where: { active: true }, orderBy: [{ position: "asc" }, { amountCents: "asc" }] },
      modules: {
        orderBy: { position: "asc" },
        include: { lessons: { orderBy: { position: "asc" }, select: { id: true, title: true, kind: true, durationSec: true, isPreview: true } } },
      },
      channels: { orderBy: { position: "asc" } },
      files: { where: { lessonId: null }, orderBy: { position: "asc" }, include: { media: { select: { sizeBytes: true, mimeType: true } } } },
      liveSessions: { where: { startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 3 },
      _count: { select: { entitlements: { where: { status: "ACTIVE" } }, posts: { where: { isAlert: true, deletedAt: null } } } },
    },
  });
}

const BUY_LABEL: Record<ProductType, string> = {
  COMMUNITY: "Join the community",
  COURSE: "Get the course",
  MENTORING: "Book mentoring",
  ALERTS: "Join the alert room",
  INDICATOR: "Get the indicator",
  DOWNLOAD: "Get the download",
  EVENT: "Get a ticket",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params;
  const p = await load(username, slug);
  if (!p || !isPublicProduct(p)) return { title: "Not found" };
  const description = p.subtitle ?? truncate(stripMarkdown(p.description ?? ""), 160);
  return {
    title: `${p.title} by ${p.creator.displayName}`,
    description,
    openGraph: { title: p.title, description, images: p.coverUrl ? [p.coverUrl] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { username, slug } = await params;
  const found = await load(username, slug);
  if (!found) notFound();
  const product = found;
  const viewer = await getViewer();
  const isOwner = viewer?.id === product.creatorId;
  const isPublic = isPublicProduct(product);
  if (!isPublic && !isOwner && !viewer?.isAdmin) notFound();

  const creator = product.creator;
  const info = productTypeInfo(product.type);
  const settings = productSettings(product.settings);
  const here = productPath(creator.username, product.slug);

  const [entitlement, saved, myReview, paidOrders, reviews, breakdown, trailer, videos, more, onWaitlist] = await Promise.all([
    viewer ? db.entitlement.findUnique({ where: { userId_productId: { userId: viewer.id, productId: product.id } } }) : null,
    viewer ? db.savedItem.findUnique({ where: { userId_productId: { userId: viewer.id, productId: product.id } } }) : null,
    viewer ? db.productReview.findUnique({ where: { productId_userId: { productId: product.id, userId: viewer.id } } }) : null,
    viewer ? db.order.count({ where: { buyerId: viewer.id, productId: product.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } }) : 0,
    db.productReview.findMany({
      where: { productId: product.id, status: "PUBLISHED" },
      include: { user: { select: { displayName: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.productReview.groupBy({ by: ["rating"], where: { productId: product.id, status: "PUBLISHED" }, _count: true }),
    product.trailerId ? db.videoPost.findFirst({ where: { id: product.trailerId, status: "PUBLISHED" } }) : null,
    db.videoPost.findMany({
      where: { productId: product.id, status: "PUBLISHED", ...(product.trailerId ? { id: { not: product.trailerId } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.product.findMany({
      where: { ...publicProductWhere, creatorId: product.creatorId, id: { not: product.id } },
      include: productCardInclude,
      orderBy: { salesCount: "desc" },
      take: 3,
    }),
    viewer && product.launchState === "WAITLIST" ? db.waitlistEntry.findUnique({ where: { productId_email: { productId: product.id, email: viewer.email } } }) : null,
  ]);

  const owns = entitlement?.status === "ACTIVE";
  const canReview = Boolean(viewer && !isOwner && (paidOrders > 0 || entitlement?.source === "PURCHASE" || entitlement?.source === "SUBSCRIPTION"));
  const trailerSrc = trailer?.mediaId ? await mediaUrlById(trailer.mediaId) : null;
  const allFree = product.prices.length > 0 && product.prices.every((p) => p.amountCents === 0);
  const anyTrial = product.prices.some((p) => p.trialDays > 0 && p.interval !== "ONE_TIME");
  const members = product._count.entitlements;
  const ratingRows = [5, 4, 3, 2, 1].map((r) => ({ r, n: breakdown.find((b) => b.rating === r)?._count ?? 0 }));
  const lessonCount = product.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalSec = product.modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + (l.durationSec ?? 0), 0), 0);
  const shareUrl = absoluteUrl(isOwner ? shareLink(creator.username, here) : here);

  return (
    <div className="container-tt py-6 sm:py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-ink">
          Marketplace
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/marketplace?type=${info.slug}`} className="hover:text-ink">
          {info.plural}
        </Link>
      </nav>

      {!isPublic ? (
        <Notice tone="warn" className="mt-4" title={product.status === "PUBLISHED" ? "Only you can see this" : `This listing is ${product.status.toLowerCase().replace("_", " ")}`}>
          {isOwner ? "Buyers can't see this page until it's published." : "You're seeing this as an admin."}{" "}
          {isOwner ? (
            <Link href={`/creator/products/${product.id}`} className="link">
              Open the editor
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
        {/* Main column */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ProductTypeIcon type={product.type} className="size-3.5" />
              {info.label}
            </span>
            {product.markets.map((m) => (
              <span key={m} className="badge badge-outline">
                {marketLabel(m)}
              </span>
            ))}
            <span className="badge badge-outline">{skillLabel(product.level)}</span>
            {product.isSample ? <SampleBadge /> : null}
          </div>
          <h1 className="mt-3 text-[30px] leading-[1.1] sm:text-[40px]">{product.title}</h1>
          {product.subtitle ? <p className="mt-3 max-w-2xl text-[17px] text-ink-2">{product.subtitle}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href={`/@${creator.username}`} className="flex items-center gap-2 font-semibold text-ink hover:underline">
              <Avatar src={creator.avatarUrl} name={creator.displayName} size={28} />
              {creator.displayName}
              <VerifiedTick who={creator} />
            </Link>
            <RatingSummary avg={product.ratingAvg} count={product.ratingCount} />
            {product.salesCount > 0 ? (
              <span className="text-muted">
                {product.type === "COMMUNITY" || product.type === "ALERTS" ? plural(members, "member") : plural(product.salesCount, "buyer")}
              </span>
            ) : null}
          </div>

          <div className="mt-6">
            {trailer && (trailerSrc || trailer.embedUrl) ? (
              <VideoPlayer src={trailerSrc} embedUrl={trailer.embedUrl} poster={trailer.posterUrl} title={trailer.title} aspect={trailer.aspect} />
            ) : product.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.coverUrl} alt="" className="aspect-video w-full rounded-xl object-cover ring-1 ring-line" />
            ) : (
              <GeneratedCover title={product.title} type={product.type} seed={product.id} large className="aspect-video w-full rounded-xl ring-1 ring-line" />
            )}
          </div>

          {/* Buy box on small screens sits right under the media */}
          <div className="mt-6 lg:hidden">
            <BuyBox />
          </div>

          {product.includes.length ? (
            <section className="mt-10">
              <h2 className="text-xl">What you get</h2>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {product.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[15px]">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-up-soft text-up">
                      <Check className="size-3.5" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {product.description ? (
            <section className="mt-10">
              <h2 className="text-xl">About this {info.label.toLowerCase()}</h2>
              <Markdown className="mt-4">{product.description}</Markdown>
            </section>
          ) : null}

          <TypeDetails />

          {videos.length ? (
            <section className="mt-12">
              <h2 className="text-xl">Videos</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Reviews */}
          <section id="reviews" className="mt-12 scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xl">Reviews</h2>
              <p className="text-sm text-muted">Only people who bought this can leave a review.</p>
            </div>
            {product.ratingCount ? (
              <div className="card mt-4 grid gap-6 p-5 sm:grid-cols-[180px_1fr]">
                <div>
                  <div className="num text-4xl font-semibold">{product.ratingAvg.toFixed(1)}</div>
                  <Stars value={product.ratingAvg} size={16} className="mt-1" />
                  <div className="mt-1 text-sm text-muted">{plural(product.ratingCount, "review")}</div>
                </div>
                <div className="space-y-1.5">
                  {ratingRows.map(({ r, n }) => (
                    <div key={r} className="flex items-center gap-3 text-sm">
                      <span className="num w-3 text-muted">{r}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${product.ratingCount ? (n / product.ratingCount) * 100 : 0}%` }} />
                      </div>
                      <span className="num w-8 text-right text-muted">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {canReview ? (
              <div className="card mt-4 p-5">
                <h3 className="text-base">{myReview ? "Your review" : "Leave a review"}</h3>
                <ActionForm action={submitProductReview} className="mt-3 space-y-4" toastOnSuccess>
                  <input type="hidden" name="productId" value={product.id} />
                  <RatingInput defaultValue={myReview?.rating ?? 0} />
                  <Field label="Headline" name="title" optional>
                    <Input name="title" defaultValue={myReview?.title ?? ""} maxLength={80} placeholder="Sum it up in a few words" />
                  </Field>
                  <Field label="Your review" name="body" hint="What helped, what didn't, and who it's right for. Honest reviews help everyone.">
                    <Textarea name="body" rows={4} defaultValue={myReview?.body ?? ""} maxLength={2000} />
                  </Field>
                  <FormMessage hideSuccess />
                  <div className="flex items-center gap-2">
                    <SubmitButton>{myReview ? "Update review" : "Post review"}</SubmitButton>
                  </div>
                </ActionForm>
                {myReview ? (
                  <div className="mt-2">
                    <ActionButton action={deleteMyReview} fields={{ reviewId: myReview.id }} variant="ghost" confirm="Delete your review?">
                      Delete review
                    </ActionButton>
                  </div>
                ) : null}
              </div>
            ) : null}

            {reviews.length ? (
              <ul className="mt-4 space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/@${r.user.username}`} className="flex items-center gap-2.5">
                        <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={32} />
                        <div>
                          <div className="text-sm font-semibold">{r.user.displayName}</div>
                          <div className="text-xs text-muted">{timeAgo(r.createdAt)}</div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2">
                        {r.isSample ? <SampleBadge /> : null}
                        <Stars value={r.rating} />
                      </div>
                    </div>
                    {r.title ? <div className="mt-3 font-semibold">{r.title}</div> : null}
                    <p className="mt-1.5 text-[15px] whitespace-pre-line text-ink-2">{r.body}</p>
                    {r.reply ? (
                      <div className="mt-4 rounded-lg border-l-2 border-ink bg-sunk px-4 py-3">
                        <div className="text-xs font-semibold text-muted">Reply from {creator.displayName}</div>
                        <p className="mt-1 text-sm whitespace-pre-line">{r.reply}</p>
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center gap-1">
                      {isOwner ? (
                        <ModalButton label={r.reply ? "Edit reply" : "Reply"} title="Reply to this review" variant="ghost" className="btn-sm">
                          <ActionForm action={replyToReview} className="space-y-3" toastOnSuccess refreshOnSuccess>
                            <input type="hidden" name="reviewId" value={r.id} />
                            <Field label="Your reply" name="reply" hint="Shown publicly under the review. Leave it empty to remove your reply.">
                              <Textarea name="reply" rows={4} defaultValue={r.reply ?? ""} maxLength={1000} />
                            </Field>
                            <FormMessage hideSuccess />
                            <SubmitButton>Save reply</SubmitButton>
                          </ActionForm>
                        </ModalButton>
                      ) : null}
                      {viewer && viewer.id !== r.userId ? <ReportButton targetType="PRODUCT_REVIEW" targetId={r.id} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : !canReview ? (
              <EmptyState className="mt-4" title="No reviews yet" description="Reviews show up here once buyers share how it went." />
            ) : null}
          </section>

          <p className="mt-10 border-t border-line pt-5 text-xs text-muted">
            Trading is risky and most traders lose money. Everything sold on TraderTrades is education, not financial advice, and past results don&apos;t
            promise future ones. Read our{" "}
            <Link href="/risk" className="link">
              risk note
            </Link>{" "}
            and{" "}
            <Link href="/rules" className="link">
              marketplace rules
            </Link>
            .
          </p>
        </div>

        {/* Side column */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <BuyBox />
          </div>
        </aside>
      </div>

      {more.length ? (
        <section className="mt-16">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl">More from {creator.displayName}</h2>
            <Link href={`/@${creator.username}?tab=products`} className="text-sm font-semibold hover:underline">
              See all
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  function BuyBox() {
    return (
      <div className="space-y-4">
        <div className="card p-5">
          {isOwner ? (
            <div>
              <div className="text-sm font-semibold">This is your {info.label.toLowerCase()}</div>
              <p className="mt-1 text-sm text-muted">You always have full access to what you sell.</p>
              <div className="mt-4 grid gap-2">
                <Link href={insidePath(creator.username, product.slug)} className="btn btn-primary">
                  Open members area
                </Link>
                <Link href={`/creator/products/${product.id}`} className="btn btn-secondary">
                  Edit listing
                </Link>
              </div>
            </div>
          ) : owns ? (
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-up">
                <ShieldCheck className="size-4" />
                {product.type === "COMMUNITY" || product.type === "ALERTS" ? "You're a member" : "You have this"}
              </div>
              {product.type === "MENTORING" && entitlement?.sessionsTotal != null ? (
                <p className="mt-1 text-sm text-muted">
                  {plural(Math.max(0, entitlement.sessionsTotal - entitlement.sessionsUsed), "call")} left to book.
                </p>
              ) : null}
              <div className="mt-4 grid gap-2">
                <Link href={insidePath(creator.username, product.slug)} className="btn btn-primary btn-lg">
                  {product.type === "MENTORING" ? "Book a call" : "Open"}
                </Link>
                {product.type === "MENTORING" ? <PriceForm compact label="Buy more calls" /> : null}
              </div>
            </div>
          ) : product.launchState === "WAITLIST" ? (
            <div>
              <div className="badge badge-ink">Opening soon</div>
              <p className="mt-3 text-sm text-ink-2">
                {creator.displayName} hasn&apos;t opened this yet. Join the waitlist and you&apos;ll get an email the moment it opens.
              </p>
              {onWaitlist ? (
                <Notice tone="ok" className="mt-4" title="You're on the waitlist" />
              ) : (
                <ActionForm action={joinWaitlist} className="mt-4 space-y-3" refreshOnSuccess>
                  <input type="hidden" name="productId" value={product.id} />
                  {viewer ? null : (
                    <Field label="Email" name="email">
                      <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                    </Field>
                  )}
                  <FormMessage />
                  <SubmitButton size="lg" className="w-full">
                    Join the waitlist
                  </SubmitButton>
                </ActionForm>
              )}
              {product.prices.length ? (
                <p className="mt-3 text-xs text-muted">Price when it opens: {money(Math.min(...product.prices.map((p) => p.amountCents)))}{INTERVAL_LABEL[product.prices[0].interval] !== "one time" ? ` ${INTERVAL_LABEL[product.prices[0].interval]}` : ""}</p>
              ) : null}
            </div>
          ) : product.prices.length === 0 ? (
            <div className="text-sm text-muted">This isn&apos;t on sale right now.</div>
          ) : (
            <PriceForm />
          )}
        </div>

        {/* Seller */}
        <div className="card p-5">
          <Link href={`/@${creator.username}`} className="flex items-center gap-3">
            <Avatar src={creator.avatarUrl} name={creator.displayName} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-semibold">
                <span className="truncate">{creator.displayName}</span>
                <VerifiedTick who={creator} />
              </div>
              <div className="truncate text-sm text-muted">@{creator.username}</div>
            </div>
          </Link>
          {creator.creator?.headline ? <p className="mt-3 text-sm text-ink-2">{creator.creator.headline}</p> : null}
          <TrustBadges who={creator} size="sm" className="mt-3" />
          <div className="mt-3 text-xs text-muted">{plural(creator._count.followers, "follower")}</div>
          {!isOwner ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {viewer ? (
                <MessageButton toId={creator.id} toName={creator.displayName} subject={`Question about ${product.title}`} />
              ) : (
                <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-secondary btn-sm">
                  <MessageSquare /> Ask a question
                </Link>
              )}
            </div>
          ) : null}
        </div>

        {/* Share, save, report */}
        <div className="card space-y-3 p-5">
          <div className="text-sm font-semibold">{isOwner ? "Your share link" : "Share"}</div>
          {isOwner ? <p className="-mt-2 text-xs text-muted">People who buy through your own link are your audience: 0% fee, for good.</p> : null}
          <div className="flex items-center gap-2">
            <input readOnly value={shareUrl} className="input h-9 min-w-0 flex-1 text-xs" aria-label="Link" />
            <CopyButton value={shareUrl} small />
          </div>
          {!isOwner ? (
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
              {viewer ? (
                <ActionButton action={toggleSaved} fields={{ productId: product.id }} variant="ghost">
                  {saved ? <BookmarkCheck /> : <Bookmark />}
                  {saved ? "Saved" : "Save"}
                </ActionButton>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-ghost btn-sm">
                  <Bookmark /> Save
                </Link>
              )}
              {viewer ? <ReportButton targetType="PRODUCT" targetId={product.id} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function PriceForm({ compact, label }: { compact?: boolean; label?: string }) {
    const prices = product.prices;
    const single = prices.length === 1;
    return (
      <form action="/checkout" method="get" className="space-y-3">
        <input type="hidden" name="p" value={product.id} />
        {single && !compact ? (
          <div>
            <div className="num text-3xl font-semibold">{prices[0].amountCents === 0 ? "Free" : money(prices[0].amountCents)}</div>
            <div className="mt-0.5 text-sm text-muted">
              {prices[0].label}
              {prices[0].interval !== "ONE_TIME" ? `, ${INTERVAL_LABEL[prices[0].interval]}` : ""}
              {prices[0].sessions ? `, ${plural(prices[0].sessions, "call")}` : ""}
            </div>
            {prices[0].trialDays > 0 && prices[0].interval !== "ONE_TIME" ? (
              <div className="mt-2 badge badge-ok">{prices[0].trialDays} day free trial</div>
            ) : null}
            <input type="hidden" name="price" value={prices[0].id} />
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="sr-only">Pick an option</legend>
            {prices.map((p, i) => (
              <label key={p.id} className="tile items-center">
                <input type="radio" name="price" value={p.id} defaultChecked={i === 0} className="checkbox radio" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block text-xs text-muted">
                    {p.interval !== "ONE_TIME" ? INTERVAL_LABEL[p.interval] : "One payment"}
                    {p.sessions ? ` · ${plural(p.sessions, "call")}` : ""}
                    {p.trialDays > 0 && p.interval !== "ONE_TIME" ? ` · ${p.trialDays} day free trial` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-[15px] font-semibold">{p.amountCents === 0 ? "Free" : money(p.amountCents)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" className={cn("btn w-full", compact ? "btn-secondary" : "btn-primary btn-lg")}>
          {label ?? (allFree ? (product.type === "COMMUNITY" ? "Join free" : "Get it free") : anyTrial && single ? "Start free trial" : BUY_LABEL[product.type])}
        </button>
        {!compact ? (
          <ul className="space-y-1.5 pt-1 text-xs text-muted">
            <li className="flex items-center gap-2">
              <RotateCcw className="size-3.5" />
              {product.refundDays > 0 ? `${product.refundDays} day refund window` : "No refunds on this product"}
            </li>
            {prices.some((p) => p.interval !== "ONE_TIME") ? (
              <li className="flex items-center gap-2">
                <Clock className="size-3.5" />
                Cancel any time from your purchases
              </li>
            ) : null}
            <li className="flex items-center gap-2">
              <Lock className="size-3.5" />
              {features.stripe ? "Secure card payment with Stripe" : env.demoMode ? "Preview mode: checkout is a test, no real money" : "Secure checkout"}
            </li>
          </ul>
        ) : null}
      </form>
    );
  }

  function TypeDetails() {
    const p = product;
    if (p.type === "COURSE") {
      return (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl">Course content</h2>
            <span className="text-sm text-muted">
              {plural(p.modules.length, "module")} · {plural(lessonCount, "lesson")}
              {totalSec ? ` · ${minutesLabel(Math.round(totalSec / 60))}` : ""}
            </span>
          </div>
          {p.modules.length ? (
            <div className="card mt-4 divide-y divide-line">
              {p.modules.map((m, mi) => (
                <details key={m.id} open={mi === 0} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5">
                    <span className="font-semibold">
                      <span className="num mr-2 text-muted">{String(mi + 1).padStart(2, "0")}</span>
                      {m.title}
                    </span>
                    <span className="text-xs text-muted">{plural(m.lessons.length, "lesson")}</span>
                  </summary>
                  <ul className="pb-2">
                    {m.lessons.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                        {l.kind === "VIDEO" ? <PlayCircle className="size-4 text-muted" /> : <FileText className="size-4 text-muted" />}
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        {l.isPreview ? (
                          <Link href={insidePath(creator.username, p.slug, `/lesson/${l.id}`)} className="badge badge-ok">
                            Free preview
                          </Link>
                        ) : null}
                        {l.durationSec ? <span className="num text-xs text-muted">{durationLabel(l.durationSec)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Lessons are being added.</p>
          )}
        </section>
      );
    }
    if (p.type === "COMMUNITY") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">Inside the community</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Hash className="size-4 text-muted" /> Channels
              </div>
              {p.channels.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {p.channels.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      {c.kind === "ANNOUNCEMENTS" ? <Megaphone className="size-3.5 text-muted" /> : <Hash className="size-3.5 text-muted" />}
                      <span className="font-medium">{c.name}</span>
                      {c.description ? <span className="truncate text-muted">· {c.description}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">Chat, announcements and resources.</p>
              )}
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Video className="size-4 text-muted" /> Upcoming live sessions
              </div>
              {p.liveSessions.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {p.liveSessions.map((s) => (
                    <li key={s.id}>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted">{formatDateTime(s.startsAt)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">Members see the schedule inside.</p>
              )}
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
                <Users className="size-4" /> {plural(members, "member")}
                {p.memberLimit ? ` of ${p.memberLimit}` : ""}
              </div>
            </div>
          </div>
        </section>
      );
    }
    if (p.type === "ALERTS") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">How this alert room works</h2>
          <div className="card mt-4 grid gap-5 p-5 sm:grid-cols-3">
            <Fact icon={<Clock />} title="Time stamped" body="Every alert shows the exact time it was posted." />
            <Fact icon={<Lock />} title="Locked once posted" body="Entries, stops and targets can't be edited. Only updates are added." />
            <Fact icon={<Megaphone />} title={plural(p._count.posts, "alert")} body="Wins and losses stay in the history for members to see." />
          </div>
        </section>
      );
    }
    if (p.type === "MENTORING") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">How mentoring works</h2>
          <div className="card mt-4 grid gap-5 p-5 sm:grid-cols-3">
            <Fact icon={<Clock />} title={`${minutesLabel(settings.durationMin)} calls`} body="One to one on video, with your screen and charts." />
            <Fact icon={<CalendarClock />} title="Pick your time" body={`Book from ${creator.displayName.split(" ")[0]}'s calendar after you buy. At least ${settings.minNoticeHours} hours ahead.`} />
            <Fact icon={<RotateCcw />} title="Plans change" body="Cancel or move a call up to 24 hours before it starts." />
          </div>
        </section>
      );
    }
    if (p.type === "INDICATOR") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">How you get it</h2>
          <div className="card mt-4 grid gap-5 p-5 sm:grid-cols-3">
            <Fact icon={<ChartIcon />} title={settings.indicatorPlatform} body={p.platforms.length ? `Works on ${p.platforms.join(", ")}.` : "See the description for setup."} />
            <Fact
              icon={<Check />}
              title={settings.accessType === "username" ? "Access on your account" : settings.accessType === "license" ? "License key" : "Instant download"}
              body={
                settings.accessType === "username"
                  ? `After you buy, send your ${settings.indicatorPlatform} username and access is added to your account.`
                  : settings.accessType === "license"
                    ? "You get a license key in your library after you buy."
                    : "Download the files from your library straight after you buy."
              }
            />
            <Fact icon={<FileText />} title="Setup guide" body="Steps to install it are in your library." />
          </div>
        </section>
      );
    }
    if (p.type === "DOWNLOAD") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">Files</h2>
          {p.files.length ? (
            <ul className="card mt-4 divide-y divide-line">
              {p.files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <FileText className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
                  <span className="num text-xs text-muted">{(f.media.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Files are added after you buy.</p>
          )}
        </section>
      );
    }
    if (p.type === "EVENT") {
      return (
        <section className="mt-10">
          <h2 className="text-xl">When</h2>
          <div className="card mt-4 grid gap-5 p-5 sm:grid-cols-3">
            <Fact icon={<CalendarClock />} title={p.startsAt ? formatDate(p.startsAt, { weekday: "long", month: "long", day: "numeric" }) : "Date coming soon"} body={p.startsAt ? formatDateTime(p.startsAt) : "Ticket holders get an email when it's set."} />
            <Fact icon={<Clock />} title={minutesLabel(settings.eventMinutes)} body="Live, with time for questions." />
            <Fact icon={<Video />} title="Recording" body="Ticket holders can watch it back afterwards." />
          </div>
        </section>
      );
    }
    return null;
  }
}

function Fact({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="grid size-9 place-items-center rounded-lg bg-sunk text-ink [&>svg]:size-4">{icon}</div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function ChartIcon() {
  return <ProductTypeIcon type="INDICATOR" />;
}
