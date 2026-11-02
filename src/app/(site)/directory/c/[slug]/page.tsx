import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Building2,
  ChevronRight,
  CircleMinus,
  CirclePlus,
  ClipboardCheck,
  PenLine,
  Share2,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { trackView } from "@/server/views";
import { companyCardSelect, goHref, publicCompanyWhere } from "@/server/queries/directory";
import { toggleSaved } from "@/server/actions/profile";
import { deleteCompanyReview, toggleHelpful } from "@/server/actions/directory";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { CopyButton, ModalButton } from "@/components/ui/client";
import { EmptyState, KeyValue, Notice, RatingSummary, SampleBadge, Stars } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { CategoryIcon } from "@/components/category-icon";
import { ReportButton } from "@/components/report-button";
import { VideoCard } from "@/components/video/video-card";
import { CompanyRow, outboundRel } from "@/components/directory/company-row";
import { OfferItem } from "@/components/directory/offer-item";
import { CompanyReviewForm } from "@/components/directory/review-form";
import { CompanyReplyButton } from "@/components/directory/reply-button";
import { categoryInfo, marketLabel } from "@/lib/constants";
import { cn, formatDate, hostname, plural, timeAgo, truncate } from "@/lib/utils";

type SP = { sort?: string; page?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

const REVIEWS_PER_PAGE = 10;
const REVIEW_SORTS: Record<string, { label: string; orderBy: Prisma.CompanyReviewOrderByWithRelationInput[] }> = {
  helpful: { label: "Most helpful", orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }] },
  new: { label: "Newest", orderBy: [{ createdAt: "desc" }] },
  high: { label: "Highest rated", orderBy: [{ rating: "desc" }, { createdAt: "desc" }] },
  low: { label: "Lowest rated", orderBy: [{ rating: "asc" }, { createdAt: "desc" }] },
};

const load = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const now = new Date();
  return db.company.findUnique({
    where: { slug },
    include: {
      offers: { where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: "desc" } },
      members: { select: { userId: true } },
    },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c || c.status !== "PUBLISHED") return { title: "Not found" };
  const cat = categoryInfo(c.primaryCategory);
  const description = c.tagline ?? truncate(c.description ?? `${c.name} on the TraderTrades directory.`, 160);
  return {
    title: `${c.name} reviews and details`,
    description: c.ratingCount ? `${description} Rated ${c.ratingAvg.toFixed(1)} from ${plural(c.ratingCount, "review")}.` : description,
    openGraph: { title: `${c.name}: ${cat.singular.toLowerCase()} reviews on TraderTrades`, description },
  };
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const company = await load(slug);
  if (!company) notFound();
  const viewer = await getViewer();
  const isMember = Boolean(viewer && company.members.some((m) => m.userId === viewer.id));
  if (company.status !== "PUBLISHED" && !isMember && !viewer?.isAdmin) notFound();
  await trackView({ target: "COMPANY", targetId: company.id, ownerId: company.id, viewerId: viewer?.id, skip: company.status !== "PUBLISHED" || isMember || viewer?.isAdmin });

  const sort = sp.sort && REVIEW_SORTS[sp.sort] ? sp.sort : "helpful";
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const reviewWhere = { companyId: company.id, status: "PUBLISHED" } satisfies Prisma.CompanyReviewWhereInput;

  const [reviews, breakdown, myReview, saved, videos, similar] = await Promise.all([
    db.companyReview.findMany({
      where: reviewWhere,
      orderBy: REVIEW_SORTS[sort].orderBy,
      skip: (page - 1) * REVIEWS_PER_PAGE,
      take: REVIEWS_PER_PAGE,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        votes: viewer ? { where: { userId: viewer.id }, select: { id: true } } : false,
      },
    }),
    db.companyReview.groupBy({ by: ["rating"], where: reviewWhere, _count: true }),
    viewer ? db.companyReview.findUnique({ where: { companyId_userId: { companyId: company.id, userId: viewer.id } } }) : null,
    viewer ? db.savedItem.findUnique({ where: { userId_companyId: { userId: viewer.id, companyId: company.id } } }) : null,
    db.videoPost.findMany({ where: { companyId: company.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.company.findMany({
      where: { ...publicCompanyWhere, id: { not: company.id }, categories: { has: company.primaryCategory } },
      select: companyCardSelect,
      orderBy: [{ ratingCount: "desc" }, { clickCount: "desc" }, { name: "asc" }],
      take: 4,
    }),
  ]);

  const cat = categoryInfo(company.primaryCategory);
  const otherCats = company.categories.filter((c) => c !== company.primaryCategory);
  const here = `/directory/c/${company.slug}`;
  const visit = goHref(company.slug, "company");
  const rel = outboundRel(Boolean(company.affiliateUrl));
  const reviewPages = Math.max(1, Math.ceil(company.ratingCount / REVIEWS_PER_PAGE));
  const ratingRows = [5, 4, 3, 2, 1].map((r) => ({ r, n: breakdown.find((b) => b.rating === r)?._count ?? 0 }));
  const canWrite = Boolean(viewer && !isMember && viewer.status === "ACTIVE");
  const reviewHref = (over: Partial<SP>) => {
    const qs = new URLSearchParams();
    const next = { sort: sort === "helpful" ? undefined : sort, page: undefined, ...over };
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `${here}${s ? `?${s}` : ""}#reviews`;
  };
  const facts = [
    { label: "Type", value: cat.singular },
    ...(otherCats.length ? [{ label: "Also", value: otherCats.map((c) => categoryInfo(c).singular).join(", ") }] : []),
    ...(company.markets.length ? [{ label: "Markets", value: company.markets.map(marketLabel).join(", ") }] : []),
    ...(company.platforms.length ? [{ label: "Works with", value: company.platforms.join(", ") }] : []),
    ...(company.foundedYear ? [{ label: "Founded", value: String(company.foundedYear) }] : []),
    ...(company.headquarters ? [{ label: "Based in", value: company.headquarters }] : []),
    {
      label: "Website",
      value: (
        <a href={visit} target="_blank" rel={rel} className="link">
          {hostname(company.website)}
        </a>
      ),
    },
  ];

  const glance = (
    <div className="card p-5">
      <h2 className="text-base">At a glance</h2>
      <KeyValue className="mt-2" items={facts} />
      <a href={visit} target="_blank" rel={rel} className="btn btn-primary mt-4 w-full">
        Visit {hostname(company.website)} <ArrowUpRight />
      </a>
      {company.affiliateUrl ? <p className="mt-2 text-center text-xs text-muted">We may earn a commission if you sign up through this link.</p> : null}
    </div>
  );

  return (
    <div className="container-tt py-6 sm:py-8">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/directory" className="hover:text-ink">
          Directory
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/directory/${cat.slug}`} className="hover:text-ink">
          {cat.label}
        </Link>
      </nav>

      {company.status !== "PUBLISHED" ? (
        <Notice tone="warn" className="mt-4" title="This listing is hidden">
          Only the company&apos;s team and our staff can see it right now.
        </Notice>
      ) : null}

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-12">
        <div className="min-w-0">
          {/* Header */}
          <div className="flex items-start gap-4 sm:gap-5">
            <Avatar src={company.logoUrl} name={company.name} size={64} square />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <CategoryIcon category={company.primaryCategory} className="size-3.5" />
                  {cat.singular}
                </span>
                {company.claimedAt ? (
                  <span className="badge badge-ok" title="The company's own team runs this listing">
                    <BadgeCheck /> Claimed by the company
                  </span>
                ) : company.lastCheckedAt ? (
                  <span className="badge badge-outline">
                    <ClipboardCheck /> Details checked {formatDate(company.lastCheckedAt)}
                  </span>
                ) : (
                  <span className="badge badge-outline">Not checked yet</span>
                )}
              </div>
              <h1 className="mt-2 text-[28px] leading-[1.1] sm:text-[38px]">{company.name}</h1>
              {company.tagline ? <p className="mt-2 max-w-2xl text-[16px] text-ink-2 sm:text-[17px]">{company.tagline}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <a href="#reviews" className="hover:underline">
                  <RatingSummary avg={company.ratingAvg} count={company.ratingCount} />
                </a>
                {company.markets.length ? <span className="text-muted">{company.markets.map(marketLabel).join(" · ")}</span> : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a href={visit} target="_blank" rel={rel} className="btn btn-primary">
              Visit website <ArrowUpRight />
            </a>
            {canWrite ? (
              <a href="#write" className="btn btn-secondary">
                <PenLine /> {myReview ? "Edit your review" : "Write a review"}
              </a>
            ) : !viewer ? (
              <Link href={`/login?next=${encodeURIComponent(`${here}#write`)}`} className="btn btn-secondary">
                <PenLine /> Write a review
              </Link>
            ) : null}
            {viewer ? (
              <ActionButton action={toggleSaved} fields={{ companyId: company.id }} variant="ghost" size="md" title={saved ? "Remove from saved" : "Save for later"}>
                {saved ? <BookmarkCheck /> : <Bookmark />}
                {saved ? "Saved" : "Save"}
              </ActionButton>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-ghost">
                <Bookmark /> Save
              </Link>
            )}
            <ModalButton label={<><Share2 /> Share</>} title={`Share ${company.name}`} variant="ghost">
              <p className="text-sm text-muted">Copy the link to this listing.</p>
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={absoluteUrl(here)} className="input flex-1 text-sm" aria-label="Link to this listing" />
                <CopyButton value={absoluteUrl(here)} />
              </div>
            </ModalButton>
            {viewer && !isMember ? <ReportButton targetType="COMPANY" targetId={company.id} /> : null}
          </div>

          {!company.claimedAt && !company.lastCheckedAt ? (
            <Notice tone="plain" className="mt-6" title="Not checked yet">
              TraderTrades put this listing together from {company.name}&apos;s public website. We don&apos;t list prices or rules because they change often, so check the
              company&apos;s own site before you sign up. Work at {company.name}?{" "}
              <Link href={`/business/claim?company=${company.slug}`} className="link">
                Claim this listing for free
              </Link>
              .
            </Notice>
          ) : null}

          <div className="mt-6 lg:hidden">{glance}</div>

          {/* Offers */}
          {company.offers.length ? (
            <section className="mt-10">
              <h2 className="text-xl">Offers</h2>
              <p className="mt-1 text-sm text-muted">From {company.name}. Check the terms on their site before you use one.</p>
              <div className="mt-4 space-y-3">
                {company.offers.map((o) => (
                  <OfferItem key={o.id} offer={o} company={company} from="company-offer" />
                ))}
              </div>
            </section>
          ) : null}

          {/* About */}
          {company.description ? (
            <section className="mt-10">
              <h2 className="text-xl">About {company.name}</h2>
              <Markdown className="mt-3">{company.description}</Markdown>
            </section>
          ) : null}

          <section className="mt-8 rounded-xl border border-line bg-card p-5">
            <h2 className="text-base">Before you sign up</h2>
            <p className="mt-1.5 text-sm text-ink-2">{cat.checkNote}</p>
            <p className="mt-2 text-xs text-muted">
              Trading is risky and most traders lose money. Nothing here is financial advice.{" "}
              <Link href="/risk" className="link">
                Read the risk note
              </Link>
              .
            </p>
          </section>

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
              <p className="text-sm text-muted">From traders with a TraderTrades account. Companies can reply but can&apos;t edit or remove reviews.</p>
            </div>

            {company.ratingCount ? (
              <div className="card mt-4 grid gap-6 p-5 sm:grid-cols-[180px_1fr]">
                <div>
                  <div className="num text-4xl font-semibold">{company.ratingAvg.toFixed(1)}</div>
                  <Stars value={company.ratingAvg} size={16} className="mt-1" />
                  <div className="mt-1 text-sm text-muted">{plural(company.ratingCount, "review")}</div>
                </div>
                <div className="space-y-1.5">
                  {ratingRows.map(({ r, n }) => (
                    <div key={r} className="flex items-center gap-3 text-sm">
                      <span className="num w-3 text-muted">{r}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${(n / company.ratingCount) * 100}%` }} />
                      </div>
                      <span className="num w-8 text-right text-muted">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Write or edit */}
            <div id="write" className="scroll-mt-24">
              {myReview?.status === "REMOVED" ? (
                <Notice tone="bad" className="mt-4" title="Your review was removed">
                  Our team removed it because it broke the{" "}
                  <Link href="/guidelines" className="link">
                    review rules
                  </Link>
                  .
                </Notice>
              ) : canWrite && viewer ? (
                viewer.emailVerifiedAt ? (
                  <div className="card mt-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base">{myReview ? "Your review" : `Review ${company.name}`}</h3>
                      {myReview?.status === "HIDDEN" || myReview?.status === "PENDING" ? (
                        <span className="badge badge-warn">Hidden while our team looks at it</span>
                      ) : null}
                    </div>
                    <CompanyReviewForm
                      companyId={company.id}
                      companyName={company.name}
                      mine={
                        myReview
                          ? {
                              rating: myReview.rating,
                              title: myReview.title,
                              body: myReview.body,
                              pros: myReview.pros,
                              cons: myReview.cons,
                              usedFor: myReview.usedFor,
                              proofStatus: myReview.proofStatus,
                              hasProof: Boolean(myReview.proofMediaId),
                            }
                          : null
                      }
                    />
                    {myReview ? (
                      <div className="mt-2">
                        <ActionButton action={deleteCompanyReview} fields={{ reviewId: myReview.id }} variant="ghost" confirm="Delete your review? This can't be undone.">
                          <Trash2 /> Delete review
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Notice tone="info" className="mt-4" title="Confirm your email to write a review">
                    <Link href={`/verify-email?next=${encodeURIComponent(`${here}#write`)}`} className="link">
                      Confirm your email
                    </Link>{" "}
                    and you can review {company.name} straight away.
                  </Notice>
                )
              ) : !viewer ? (
                <div className="card mt-4 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">Used {company.name}?</div>
                    <p className="text-sm text-muted">Share how it went so other traders can choose well. It takes two minutes.</p>
                  </div>
                  <Link href={`/login?next=${encodeURIComponent(`${here}#write`)}`} className="btn btn-primary btn-sm">
                    Sign in to review
                  </Link>
                </div>
              ) : null}
            </div>

            {company.ratingCount > 1 ? (
              <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Sort reviews">
                {Object.entries(REVIEW_SORTS).map(([key, s]) => (
                  <Link key={key} href={reviewHref({ sort: key === "helpful" ? undefined : key })} scroll={false} className="chip" data-active={key === sort}>
                    {s.label}
                  </Link>
                ))}
              </div>
            ) : null}

            {reviews.length ? (
              <ul className="mt-4 space-y-3">
                {reviews.map((r) => {
                  const mine = viewer?.id === r.userId;
                  const voted = Boolean(r.votes?.length);
                  return (
                    <li key={r.id} id={`r-${r.id}`} className="card scroll-mt-24 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/@${r.user.username}`} className="flex min-w-0 items-center gap-2.5">
                          <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={34} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{r.user.displayName}</div>
                            <div className="text-xs text-muted">
                              {timeAgo(r.createdAt)}
                              {r.usedFor ? ` · Used it ${r.usedFor.toLowerCase()}` : ""}
                            </div>
                          </div>
                        </Link>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {r.isSample ? <SampleBadge /> : null}
                          {mine ? <span className="badge badge-ink">Your review</span> : null}
                          {r.proofStatus === "VERIFIED" ? (
                            <span className="badge badge-ok" title="This reviewer showed our team proof that they used this company.">
                              <ClipboardCheck /> Proof of use
                            </span>
                          ) : null}
                          <Stars value={r.rating} />
                        </div>
                      </div>
                      <div className="mt-3 font-semibold">{r.title}</div>
                      <p className="mt-1.5 text-[15px] whitespace-pre-line text-ink-2">{r.body}</p>
                      {r.pros || r.cons ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {r.pros ? (
                            <div className="flex items-start gap-2 rounded-lg bg-up-soft/60 px-3 py-2 text-sm">
                              <CirclePlus className="mt-0.5 size-4 shrink-0 text-up" aria-label="Good" />
                              <span className="whitespace-pre-line">{r.pros}</span>
                            </div>
                          ) : null}
                          {r.cons ? (
                            <div className="flex items-start gap-2 rounded-lg bg-down-soft/60 px-3 py-2 text-sm">
                              <CircleMinus className="mt-0.5 size-4 shrink-0 text-down" aria-label="Could be better" />
                              <span className="whitespace-pre-line">{r.cons}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {r.reply ? (
                        <div className="mt-4 rounded-lg border-l-2 border-ink bg-sunk px-4 py-3">
                          <div className="text-xs font-semibold text-muted">
                            Reply from {company.name}
                            {r.repliedAt ? ` · ${timeAgo(r.repliedAt)}` : ""}
                          </div>
                          <p className="mt-1 text-sm whitespace-pre-line">{r.reply}</p>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        {viewer && !mine ? (
                          <ActionButton
                            action={toggleHelpful}
                            fields={{ reviewId: r.id }}
                            variant="ghost"
                            className={cn(voted && "bg-sunk text-ink")}
                            title={voted ? "Take back your vote" : "Mark as helpful"}
                          >
                            <ThumbsUp className={cn(voted && "fill-current")} />
                            Helpful{r.helpfulCount ? ` · ${r.helpfulCount}` : ""}
                          </ActionButton>
                        ) : r.helpfulCount ? (
                          <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted">
                            <ThumbsUp className="size-3.5" /> {plural(r.helpfulCount, "person", "people")} found this helpful
                          </span>
                        ) : null}
                        {isMember ? <CompanyReplyButton reviewId={r.id} companyName={company.name} reply={r.reply} /> : null}
                        {viewer && !mine ? <ReportButton targetType="COMPANY_REVIEW" targetId={r.id} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : company.ratingCount === 0 ? (
              canWrite || !viewer ? (
                <p className="mt-4 text-sm text-muted">No reviews yet. Yours could be the first.</p>
              ) : (
                <EmptyState
                  className="mt-4"
                  icon={<PenLine />}
                  title="No reviews yet"
                  description={`Reviews of ${company.name} show up here once traders share how it went.`}
                />
              )
            ) : null}

            {reviewPages > 1 ? (
              <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Review pages">
                {page > 1 ? (
                  <Link href={reviewHref({ page: page > 2 ? String(page - 1) : undefined })} className="btn btn-secondary btn-sm">
                    Newer page
                  </Link>
                ) : null}
                <span className="num px-2 text-sm text-muted">
                  {page} / {reviewPages}
                </span>
                {page < reviewPages ? (
                  <Link href={reviewHref({ page: String(page + 1) })} className="btn btn-secondary btn-sm">
                    More reviews
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden lg:block">{glance}</div>

          {company.claimedAt ? (
            <div className="card p-5 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <BadgeCheck className="size-4 text-up" /> Run by {company.name}
              </div>
              <p className="mt-1 text-muted">The company&apos;s team keeps this listing up to date and can reply to reviews. They can&apos;t edit or remove them.</p>
            </div>
          ) : (
            <div className="card p-5 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Building2 className="size-4" /> Work at {company.name}?
              </div>
              <p className="mt-1 text-muted">Claim this listing for free to add your logo, keep the details right, post offers and reply to reviews.</p>
              <Link href={`/business/claim?company=${company.slug}`} className="btn btn-secondary btn-sm mt-3">
                Claim this listing
              </Link>
            </div>
          )}
        </aside>
      </div>

      {similar.length ? (
        <section className="mt-14 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl">More {cat.label.toLowerCase()}</h2>
            <Link href={`/directory/${cat.slug}`} className="text-sm font-semibold hover:underline">
              See all {cat.label.toLowerCase()}
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {similar.map((c) => (
              <CompanyRow key={c.id} company={c} from={`similar:${company.slug}`} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
