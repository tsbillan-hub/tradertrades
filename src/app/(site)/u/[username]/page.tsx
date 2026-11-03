import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Globe, MapPin, Share2, Sparkles, UserCheck, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { trackView } from "@/server/views";
import { publicProductWhere, productCardInclude } from "@/server/queries/products";
import { followUser } from "@/server/actions/profile";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/client";
import { EmptyState, LinkTabs, Notice, RatingSummary, SampleBadge, Stars } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { TrustBadges, VerifiedTick } from "@/components/market/badges";
import { ProductCard } from "@/components/market/product-card";
import { VideoCard } from "@/components/video/video-card";
import { VideoPlayer } from "@/components/video/player";
import { SocialIcon } from "@/components/icons/social";
import { MessageButton } from "@/components/message-button";
import { ReportButton } from "@/components/report-button";
import { absoluteUrl } from "@/lib/env";
import { compact, formatDate, hostname, timeAgo } from "@/lib/utils";
import { EXPERIENCE, marketLabel, socialLabel } from "@/lib/constants";
import { mediaUrlById } from "@/server/queries/media";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> };

async function load(username: string) {
  const user = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      creator: true,
      socialLinks: { orderBy: { createdAt: "asc" } },
      _count: { select: { followers: true, following: true } },
    },
  });
  if (!user || user.status === "BANNED" || user.status === "DELETED") return null;
  return user;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await load(username);
  if (!user) return { title: "Not found" };
  return {
    title: `${user.displayName} (@${user.username})`,
    description: user.creator?.headline ?? user.bio ?? `${user.displayName} on TraderTrades`,
    openGraph: { images: user.avatarUrl ? [user.avatarUrl] : undefined },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const { tab = "overview" } = await searchParams;
  const user = await load(username);
  if (!user) notFound();
  const viewer = await getViewer();
  const isMe = viewer?.id === user.id;
  const isCreator = user.creator?.status === "APPROVED";
  if (isCreator) await trackView({ target: "PROFILE", targetId: user.id, ownerId: user.id, viewerId: viewer?.id, skip: isMe || viewer?.isAdmin });

  const [products, videos, reviews, reviewAgg, following, memberOf] = await Promise.all([
    isCreator ? db.product.findMany({ where: { ...publicProductWhere, creatorId: user.id }, include: productCardInclude, orderBy: [{ type: "asc" }, { salesCount: "desc" }] }) : [],
    db.videoPost.findMany({ where: { authorId: user.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 24 }),
    isCreator
      ? db.productReview.findMany({
          where: { sellerId: user.id, status: "PUBLISHED" },
          include: { user: { select: { displayName: true, username: true, avatarUrl: true } }, product: { select: { title: true, slug: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [],
    isCreator ? db.productReview.aggregate({ where: { sellerId: user.id, status: "PUBLISHED" }, _avg: { rating: true }, _count: true }) : null,
    viewer && !isMe ? db.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: user.id } } }) : null,
    user.showPurchases
      ? db.entitlement.findMany({
          where: { userId: user.id, status: "ACTIVE", product: { type: "COMMUNITY", status: "PUBLISHED" } },
          include: { product: { select: { title: true, slug: true, creator: { select: { username: true } } } } },
          take: 12,
        })
      : [],
  ]);

  const pinned = user.creator?.pinnedVideoId ? videos.find((v) => v.id === user.creator!.pinnedVideoId) ?? null : (isCreator ? videos[0] ?? null : null);
  const pinnedSrc = pinned?.mediaId ? await mediaUrlById(pinned.mediaId) : null;
  const community = products.find((p) => p.type === "COMMUNITY");
  const shareUrl = absoluteUrl(`/r/${user.username}`);
  const exp = EXPERIENCE.find((e) => e.value === user.experience);

  const tabs = [
    { key: "overview", href: `/@${user.username}`, label: "Overview" },
    ...(isCreator ? [{ key: "products", href: `/@${user.username}?tab=products`, label: "Products", count: products.length }] : []),
    { key: "videos", href: `/@${user.username}?tab=videos`, label: "Videos", count: videos.length },
    ...(isCreator ? [{ key: "reviews", href: `/@${user.username}?tab=reviews`, label: "Reviews", count: reviewAgg?._count ?? 0 }] : []),
    { key: "about", href: `/@${user.username}?tab=about`, label: "About" },
  ];

  return (
    <div>
      {/* Banner */}
      <div className="relative h-36 overflow-hidden border-b border-line sm:h-52">
        {user.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[#16130F] [background-image:linear-gradient(rgba(242,234,219,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(242,234,219,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        )}
      </div>

      <div className="container-tt">
        <div className="relative z-10 -mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="rounded-full bg-bg p-1">
              <Avatar src={user.avatarUrl} name={user.displayName} size={112} className="max-sm:size-24!" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:pb-2">
            {isMe ? (
              <>
                <Link href="/settings" className="btn btn-secondary">
                  Edit profile
                </Link>
                {isCreator ? (
                  <Link href="/creator" className="btn btn-primary">
                    Creator dashboard
                  </Link>
                ) : null}
              </>
            ) : viewer ? (
              <>
                <ActionButton action={followUser} fields={{ userId: user.id }} variant={following ? "secondary" : "primary"} size="md">
                  {following ? <UserCheck /> : <UserPlus />}
                  {following ? "Following" : "Follow"}
                </ActionButton>
                {user.isSample ? null : <MessageButton toId={user.id} toName={user.displayName} />}
              </>
            ) : (
              <Link href={`/login?next=/@${user.username}`} className="btn btn-primary">
                <UserPlus /> Follow
              </Link>
            )}
            {isCreator ? <CopyButton value={shareUrl} label="Share" /> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] sm:text-[34px]">{user.displayName}</h1>
              <VerifiedTick who={user} className="[&>svg]:size-6" />
              {user.isSample ? <SampleBadge /> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>@{user.username}</span>
              {isCreator ? (
                <span className="badge badge-ink">
                  <Sparkles /> Creator
                </span>
              ) : null}
              <span>
                <b className="num text-ink">{compact(user._count.followers)}</b> followers
              </span>
              <span>
                <b className="num text-ink">{compact(user._count.following)}</b> following
              </span>
            </div>
            {user.creator?.headline || user.bio ? <p className="mt-4 max-w-2xl text-[16px] text-ink-2">{user.creator?.headline ?? user.bio}</p> : null}
            <TrustBadges who={user} className="mt-4" />
            {user.isSample ? (
              <Notice tone="plain" className="mt-4 max-w-2xl" title="Example page">
                This shows what a creator page looks like on TraderTrades. Its listings are examples and can&apos;t be bought.
              </Notice>
            ) : null}
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            {user.socialLinks.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn btn-secondary btn-sm"
                title={`${socialLabel(s.platform)}${s.verifiedAt ? " (verified)" : ""}`}
              >
                <SocialIcon platform={s.platform} />
                {s.followers ? compact(s.followers) : socialLabel(s.platform)}
                {s.verifiedAt ? <span className="text-up">✓</span> : null}
              </a>
            ))}
          </div>
        </div>

        <LinkTabs tabs={tabs} active={tab} className="mt-8" />

        <div className="py-8">
          {tab === "overview" ? (
            <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
              <div className="min-w-0 space-y-10">
                {community ? (
                  <section>
                    <h2 className="mb-4 text-xl">Community</h2>
                    <Link href={`/@${user.username}/${community.slug}`} className="card card-hover group grid overflow-hidden sm:grid-cols-[1.1fr_1fr]">
                      <div className="aspect-[16/9] overflow-hidden border-b border-line sm:aspect-auto sm:border-r sm:border-b-0">
                        {community.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={community.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <CommunityCoverFallback title={community.title} />
                        )}
                      </div>
                      <div className="flex flex-col p-5">
                        <div className="flex items-center gap-2">
                          {community.launchState === "WAITLIST" ? <span className="badge badge-accent">Opening soon</span> : <span className="badge">Membership</span>}
                          {community.isSample ? <SampleBadge /> : null}
                        </div>
                        <div className="mt-3 font-display text-2xl leading-tight font-extrabold tracking-tight">{community.title}</div>
                        {community.subtitle ? <p className="mt-2 text-sm text-muted">{community.subtitle}</p> : null}
                        <div className="mt-auto flex items-center justify-between pt-5">
                          <RatingSummary avg={community.ratingAvg} count={community.ratingCount} className="text-xs" />
                          <span className="btn btn-primary btn-sm">{community.launchState === "WAITLIST" ? "Join the waitlist" : "See inside"}</span>
                        </div>
                      </div>
                    </Link>
                  </section>
                ) : null}

                {pinned ? (
                  <section>
                    <h2 className="mb-4 text-xl">Featured video</h2>
                    <div className={pinned.aspect === "9:16" ? "max-w-sm" : ""}>
                      <VideoPlayer src={pinnedSrc} embedUrl={pinned.embedUrl} poster={pinned.posterUrl} title={pinned.title} aspect={pinned.aspect} />
                    </div>
                    <div className="mt-3">
                      <Link href={`/v/${pinned.id}`} className="font-semibold hover:underline">
                        {pinned.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {pinned.views.toLocaleString()} views · {timeAgo(pinned.createdAt)}
                      </div>
                    </div>
                  </section>
                ) : null}

                {isCreator ? (
                  <section>
                    <div className="mb-4 flex items-end justify-between">
                      <h2 className="text-xl">Products</h2>
                      {products.length > 3 ? (
                        <Link href={`/@${user.username}?tab=products`} className="text-sm font-semibold text-muted hover:text-ink">
                          See all {products.length}
                        </Link>
                      ) : null}
                    </div>
                    {products.length ? (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {products.filter((p) => p.id !== community?.id).slice(0, 6).map((p) => (
                          <ProductCard key={p.id} product={p} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="Nothing on sale yet" description={isMe ? "Create your first product from your creator dashboard." : "Follow to hear when something launches."} />
                    )}
                  </section>
                ) : null}

                {!isCreator && videos.length ? (
                  <section>
                    <h2 className="mb-4 text-xl">Videos</h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {videos.slice(0, 6).map((v) => (
                        <VideoCard key={v.id} video={v} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {!isCreator && !community && !pinned && !videos.length && !memberOf.length ? (
                  <EmptyState
                    title={isMe ? "Your profile is ready" : `${user.displayName} hasn't posted anything yet`}
                    description={
                      isMe
                        ? "Add a photo, a banner and your socials in settings. Want to sell something? You can start right away."
                        : "Follow to see their videos here when they post."
                    }
                    action={
                      isMe ? (
                        <>
                          <Link href="/settings" className="btn btn-secondary">
                            Edit profile
                          </Link>
                          <Link href="/sell" className="btn btn-primary">
                            <Sparkles /> Sell on TraderTrades
                          </Link>
                        </>
                      ) : undefined
                    }
                  />
                ) : null}

                {!isCreator && memberOf.length ? (
                  <section>
                    <h2 className="mb-4 text-xl">Communities</h2>
                    <div className="flex flex-wrap gap-2">
                      {memberOf.map((m) => (
                        <Link key={m.id} href={`/@${m.product.creator.username}/${m.product.slug}`} className="chip">
                          {m.product.title}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4">
                <div className="card p-5">
                  <div className="kicker mb-3">About</div>
                  {user.about ? <Markdown className="line-clamp-[12] text-sm">{user.about}</Markdown> : <p className="text-sm text-muted">{user.bio ?? "No bio yet."}</p>}
                  <ul className="mt-4 space-y-2 text-sm text-ink-2">
                    {user.markets.length ? <li>Trades {user.markets.map(marketLabel).join(", ")}</li> : null}
                    {user.creator?.tradingStyle ? <li>{user.creator.tradingStyle}</li> : null}
                    {exp ? <li>{exp.label}</li> : null}
                    {user.location ? (
                      <li className="flex items-center gap-2">
                        <MapPin className="size-4 text-muted" /> {user.location}
                      </li>
                    ) : null}
                    {user.website ? (
                      <li className="flex items-center gap-2">
                        <Globe className="size-4 text-muted" />
                        <a href={user.website} target="_blank" rel="noopener noreferrer nofollow" className="link">
                          {hostname(user.website)}
                        </a>
                      </li>
                    ) : null}
                    <li className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-muted" /> Joined {formatDate(user.createdAt, { month: "long", year: "numeric" })}
                    </li>
                  </ul>
                </div>
                {isCreator && reviewAgg?._count ? (
                  <div className="card p-5">
                    <div className="kicker mb-2">Buyer reviews</div>
                    <div className="flex items-baseline gap-2">
                      <span className="num text-3xl font-semibold">{(reviewAgg._avg.rating ?? 0).toFixed(1)}</span>
                      <Stars value={reviewAgg._avg.rating ?? 0} />
                    </div>
                    <p className="mt-1 text-xs text-muted">From {reviewAgg._count} verified buyers</p>
                  </div>
                ) : null}
                {isCreator ? (
                  <div className="card p-5 text-sm">
                    <div className="kicker mb-2">Share</div>
                    <p className="text-muted">Buyers who come through this link count as {user.displayName.split(" ")[0]}&apos;s own audience.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <code className="num min-w-0 flex-1 truncate rounded-md bg-sunk px-2 py-1.5 text-xs">{shareUrl.replace(/^https?:\/\//, "")}</code>
                      <CopyButton value={shareUrl} label="" small className="btn-icon" />
                    </div>
                  </div>
                ) : null}
                {!isMe ? <ReportButton targetType="USER" targetId={user.id} label="Report profile" /> : null}
              </aside>
            </div>
          ) : null}

          {tab === "products" ? (
            products.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <EmptyState title="Nothing on sale yet" />
            )
          ) : null}

          {tab === "videos" ? (
            videos.length ? (
              <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No videos yet"
                description={isMe ? "Share a setup walkthrough, a trade review or a tour of what you offer." : undefined}
                action={
                  isMe ? (
                    <Link href="/creator/videos/new" className="btn btn-primary">
                      Post a video
                    </Link>
                  ) : undefined
                }
              />
            )
          ) : null}

          {tab === "reviews" ? (
            reviews.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {reviews.map((r) => (
                  <article key={r.id} className="card p-5">
                    <div className="flex items-center gap-3">
                      <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{r.user.displayName}</div>
                        <div className="text-xs text-muted">
                          Bought <Link href={`/@${user.username}/${r.product.slug}`} className="link">{r.product.title}</Link> · {timeAgo(r.createdAt)}
                        </div>
                      </div>
                      <Stars value={r.rating} />
                    </div>
                    {r.title ? <div className="mt-3 font-semibold">{r.title}</div> : null}
                    <p className="mt-1.5 text-sm whitespace-pre-line text-ink-2">{r.body}</p>
                    {r.reply ? (
                      <div className="mt-3 rounded-lg bg-sunk p-3 text-sm">
                        <div className="text-xs font-semibold text-muted">Reply from {user.displayName}</div>
                        <p className="mt-1 whitespace-pre-line">{r.reply}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No reviews yet" description="Only people who bought something can leave a review." />
            )
          ) : null}

          {tab === "about" ? (
            <div className="max-w-3xl">
              {user.about ? <Markdown>{user.about}</Markdown> : <p className="text-muted">{user.bio ?? "No bio yet."}</p>}
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {user.creator?.yearsTrading ? (
                  <div className="card p-4">
                    <div className="text-xs text-muted">Trading for</div>
                    <div className="mt-1 font-semibold">{user.creator.yearsTrading} years</div>
                  </div>
                ) : null}
                {user.markets.length ? (
                  <div className="card p-4">
                    <div className="text-xs text-muted">Markets</div>
                    <div className="mt-1 font-semibold">{user.markets.map(marketLabel).join(", ")}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommunityCoverFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col justify-end bg-[#16130F] p-6 text-[#F2EADB] [background-image:radial-gradient(circle_at_80%_20%,rgba(255,90,46,0.35),transparent_45%)]">
      <Share2 className="mb-auto size-5 opacity-50" />
      <div className="font-display text-3xl leading-none font-extrabold tracking-tight">{title}</div>
    </div>
  );
}
