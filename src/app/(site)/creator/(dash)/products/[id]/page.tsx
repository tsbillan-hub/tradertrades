import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CheckCircle2, Circle, ExternalLink, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { requireCreator } from "@/server/dal";
import { publishBlockers } from "@/server/commerce/publish";
import {
  archiveProduct,
  deletePrice,
  publishProduct,
  restoreProduct,
  saveProductDetails,
  savePrice,
  togglePrice,
  unpublishProduct,
} from "@/server/actions/products";
import { ActionButton, ActionForm, Field, FieldError, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ImageField } from "@/components/ui/uploader";
import { ModalButton } from "@/components/ui/client";
import { LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { BANNED_PRODUCTS, INTERVAL_LABEL, MARKETS, PLATFORMS, SKILL_LEVELS, productTypeInfo } from "@/lib/constants";
import { feeExample } from "@/lib/fees";
import { productSettings } from "@/lib/product-settings";
import { PRODUCT_STATUS_BADGE } from "@/lib/product-status";
import { insidePath, productPath } from "@/lib/paths";
import { cn, money, plural } from "@/lib/utils";
import type { BillingInterval } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Edit product" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export default async function EditProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "details" } = await searchParams;
  const user = await requireCreator();
  const product = await db.product.findUnique({
    where: { id },
    include: {
      prices: { orderBy: [{ active: "desc" }, { position: "asc" }], include: { _count: { select: { orders: true } } } },
      channels: { orderBy: { position: "asc" } },
      modules: { orderBy: { position: "asc" }, include: { _count: { select: { lessons: true } } } },
      files: { where: { lessonId: null } },
      _count: { select: { waitlist: true, entitlements: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!product || (product.creatorId !== user.id && !user.isAdmin)) notFound();

  const info = productTypeInfo(product.type);
  const settings = productSettings(product.settings);
  const st = PRODUCT_STATUS_BADGE[product.status];
  const base = `/creator/products/${product.id}`;
  const blockers = publishBlockers(product, user.creator);
  const videos = await db.videoPost.findMany({ where: { authorId: product.creatorId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });
  const page = productPath(user.username, product.slug);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/creator/products", label: "Products" }}
        kicker={
          <span className="inline-flex items-center gap-2">
            {info.label} <span className={cn("badge", st.tone)}>{st.label}</span>
          </span>
        }
        title={product.title}
        actions={
          <>
            <Link href={page} className="btn btn-secondary" target="_blank">
              <Eye /> Preview
            </Link>
            <Link href={insidePath(user.username, product.slug)} className="btn btn-ghost">
              Members area <ExternalLink />
            </Link>
          </>
        }
      />

      {product.status === "SUSPENDED" ? (
        <Notice tone="bad" title="Taken down by our team">
          {product.reviewNote ?? "This listing broke the marketplace rules."} Contact support if you think that&apos;s a mistake.
        </Notice>
      ) : null}

      <LinkTabs
        active={tab}
        tabs={[
          { key: "details", href: base, label: "Details" },
          { key: "pricing", href: `${base}?tab=pricing`, label: "Pricing", count: product.prices.filter((p) => p.active).length },
          { key: "content", href: `${base}?tab=content`, label: "Content" },
          { key: "publish", href: `${base}?tab=publish`, label: product.status === "PUBLISHED" ? "Live" : "Publish" },
        ]}
      />

      {tab === "pricing" ? <PricingTab /> : tab === "content" ? <ContentTab /> : tab === "publish" ? <PublishTab /> : <DetailsTab />}
    </div>
  );

  function DetailsTab() {
    const p = product!;
    return (
      <ActionForm action={saveProductDetails} toastOnSuccess className="space-y-6">
        <input type="hidden" name="productId" value={p.id} />
        <Panel title="The basics">
          <div className="space-y-5">
            <Field label="Name" name="title">
              <Input name="title" defaultValue={p.title} maxLength={90} />
            </Field>
            <Field label="Link" name="slug" hint="Lowercase letters, numbers and dashes.">
              <div className="flex items-center">
                <span className="hidden h-10 items-center rounded-l-lg border border-r-0 border-line bg-sunk px-3 text-sm text-muted sm:flex">/@{user.username}/</span>
                <Input name="slug" defaultValue={p.slug} maxLength={60} className="sm:rounded-l-none" />
              </div>
            </Field>
            <Field label="Short description" name="subtitle" optional hint="One line under the name. 140 characters max.">
              <Input name="subtitle" defaultValue={p.subtitle ?? ""} maxLength={140} />
            </Field>
            <div>
              <div className="label">Cover image</div>
              <ImageField name="coverUrl" defaultUrl={p.coverUrl} purpose="cover" shape="wide" label="Upload cover" hint="16:9 works best, like 1600 × 900. Leave it empty and we design one from your title." />
            </div>
            <Field label="Trailer video" name="trailerId" optional hint={videos.length ? "Plays at the top of your listing." : "Post a video on your profile first, then pick it here."}>
              <Select name="trailerId" defaultValue={p.trailerId ?? ""}>
                <option value="">No trailer</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Panel>

        <Panel title="Description" description="What buyers get, who it's for and how it works. Markdown works: **bold**, lists and links.">
          <div className="space-y-5">
            <Field label="Full description" name="description" hint="At least 80 characters to publish. No profit promises, win rates or income claims.">
              <Textarea name="description" defaultValue={p.description ?? ""} rows={12} maxLength={20000} />
            </Field>
            <Field label="What you get" name="includes" hint="One per line. Shown as a checklist, up to 12.">
              <Textarea name="includes" defaultValue={p.includes.join("\n")} rows={5} maxLength={2000} />
            </Field>
          </div>
        </Panel>

        <Panel title="Who it's for">
          <div className="space-y-5">
            <fieldset>
              <legend className="label">Markets</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {MARKETS.map((m) => (
                  <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                    <input type="checkbox" name="markets" value={m.value} defaultChecked={p.markets.includes(m.value)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
              <FieldError name="markets" />
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Level" name="level">
                <Select name="level" defaultValue={p.level}>
                  {SKILL_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags" name="tags" optional hint="Comma separated, up to 8. Helps people find it.">
                <Input name="tags" defaultValue={p.tags.join(", ")} maxLength={300} placeholder="nq, order flow, scalping" />
              </Field>
            </div>
            <fieldset>
              <legend className="label">
                Platforms <span className="ml-1.5 font-normal text-faint">optional</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLATFORMS.map((pl) => (
                  <label key={pl} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                    <input type="checkbox" name="platforms" value={pl} defaultChecked={p.platforms.includes(pl)} className="sr-only" />
                    {pl}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Panel>

        <TypeSettings />

        <Panel title="Rules for buyers">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Refund window (days)" name="refundDays" hint="7 is standard. 0 means no refunds, shown clearly before buying.">
              <Input name="refundDays" type="number" min={0} max={30} defaultValue={p.refundDays} />
            </Field>
            <Field label={p.type === "EVENT" ? "Tickets available" : "Member limit"} name="memberLimit" optional hint="Leave empty for no limit.">
              <Input name="memberLimit" type="number" min={1} defaultValue={p.memberLimit ?? ""} />
            </Field>
          </div>
          <fieldset className="mt-5">
            <legend className="label">When people can buy</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="tile">
                <input type="radio" name="launchState" value="OPEN" defaultChecked={p.launchState === "OPEN"} className="checkbox radio mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">Open now</span>
                  <span className="block text-xs text-muted">People can buy as soon as it&apos;s published.</span>
                </span>
              </label>
              <label className="tile">
                <input type="radio" name="launchState" value="WAITLIST" defaultChecked={p.launchState === "WAITLIST"} className="checkbox radio mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">Waitlist first</span>
                  <span className="block text-xs text-muted">
                    Shows as &ldquo;Opening soon&rdquo;. Everyone on the list is emailed when you open it.
                    {p._count.waitlist ? ` ${plural(p._count.waitlist, "person")} waiting.` : ""}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <FormMessage className="mr-auto" hideSuccess />
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </ActionForm>
    );
  }

  function TypeSettings() {
    const p = product!;
    if (p.type === "MENTORING") {
      return (
        <Panel title="Calls" description="How booking works for buyers. Set your weekly hours in the calendar.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Call length" name="durationMin">
              <Select name="durationMin" defaultValue={String(settings.durationMin)}>
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Break between calls" name="bufferMin">
              <Select name="bufferMin" defaultValue={String(settings.bufferMin)}>
                {[0, 5, 10, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minimum notice (hours)" name="minNoticeHours">
              <Input name="minNoticeHours" type="number" min={0} max={168} defaultValue={settings.minNoticeHours} />
            </Field>
            <Field label="Book up to (days ahead)" name="maxDaysAhead">
              <Input name="maxDaysAhead" type="number" min={1} max={120} defaultValue={settings.maxDaysAhead} />
            </Field>
            <Field label="Where calls happen" name="callProvider">
              <Select name="callProvider" defaultValue={settings.callProvider}>
                {features.daily ? <option value="daily">TraderTrades video room</option> : null}
                <option value="jitsi">Free video room (Jitsi)</option>
                <option value="link">My own link (Zoom, Meet...)</option>
              </Select>
            </Field>
            <Field label="Your call link" name="callLink" optional hint="Only used when you pick your own link.">
              <Input name="callLink" defaultValue={settings.callLink} placeholder="https://zoom.us/j/..." />
            </Field>
          </div>
        </Panel>
      );
    }
    if (p.type === "INDICATOR") {
      return (
        <Panel title="Delivery" description="How buyers get the indicator after paying.">
          <div className="space-y-5">
            <Field label="Platform" name="indicatorPlatform">
              <Select name="indicatorPlatform" defaultValue={settings.indicatorPlatform}>
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset>
              <legend className="label">Access</legend>
              <div className="mt-2 grid gap-2">
                {[
                  { v: "username", t: "Invite only, by username", d: "Buyers send their platform username and you add them (TradingView invite-only scripts)." },
                  { v: "download", t: "Download", d: "Buyers download the files you upload in the Content tab." },
                  { v: "license", t: "License key", d: "You give each buyer a key from their customer page." },
                ].map((o) => (
                  <label key={o.v} className="tile">
                    <input type="radio" name="accessType" value={o.v} defaultChecked={settings.accessType === o.v} className="checkbox radio mt-0.5" />
                    <span>
                      <span className="block text-sm font-semibold">{o.t}</span>
                      <span className="block text-xs text-muted">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Panel>
      );
    }
    if (p.type === "COMMUNITY") {
      return (
        <Panel title="Welcome message" description="Shown to new members the first time they open the community.">
          <Field label="Message" name="welcome" optional>
            <Textarea name="welcome" defaultValue={settings.welcome} rows={4} maxLength={2000} placeholder="Welcome in! Start with the pinned post in #announcements..." />
          </Field>
        </Panel>
      );
    }
    if (p.type === "EVENT") {
      const local = p.startsAt ? new Date(p.startsAt.getTime() - p.startsAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
      return (
        <Panel title="Event time">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts" name="startsAt" hint={`Your time zone: ${user.timezone}`}>
              <Input name="startsAt" type="datetime-local" defaultValue={local} />
            </Field>
            <Field label="Length (minutes)" name="eventMinutes">
              <Input name="eventMinutes" type="number" min={15} max={600} defaultValue={settings.eventMinutes} />
            </Field>
          </div>
        </Panel>
      );
    }
    return null;
  }

  function PricingTab() {
    const p = product!;
    const allowed = info.allowedIntervals;
    return (
      <div className="space-y-6">
        <Panel
          title="Price options"
          description={`Up to 5 options${allowed.length > 1 ? ", like monthly and yearly" : ""}. Options people have bought can't change price, but you can turn them off and add new ones.`}
        >
          {p.prices.length ? (
            <ul className="-my-2 divide-y divide-line">
              {p.prices.map((pr) => {
                const ex = feeExample(pr.amountCents, "OWN_AUDIENCE");
                const exFirst = feeExample(pr.amountCents, "MARKETPLACE_FIRST");
                return (
                  <li key={pr.id} className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center", !pr.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{pr.label}</span>
                        {!pr.active ? <span className="badge badge-outline">Off</span> : null}
                        {pr.trialDays ? <span className="badge badge-ok">{pr.trialDays} day trial</span> : null}
                      </div>
                      <div className="mt-0.5 text-sm text-muted">
                        <span className="num font-medium text-ink">{pr.amountCents ? money(pr.amountCents, { exact: true }) : "Free"}</span>{" "}
                        {INTERVAL_LABEL[pr.interval]}
                        {pr.sessions ? ` · ${plural(pr.sessions, "call")}` : ""}
                        {pr._count.orders ? ` · ${plural(pr._count.orders, "order")}` : ""}
                      </div>
                      {pr.amountCents ? (
                        <div className="mt-1 text-xs text-muted">
                          You keep about {money(ex.sellerNetCents, { exact: true })} from your own buyers, {money(exFirst.sellerNetCents, { exact: true })} from a
                          first sale we bring you.
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ModalButton label="Edit" title="Edit price option" className="btn-sm">
                        <PriceForm price={pr} allowed={allowed} />
                      </ModalButton>
                      <ActionButton action={togglePrice} fields={{ priceId: pr.id }} variant="ghost">
                        {pr.active ? "Turn off" : "Turn on"}
                      </ActionButton>
                      {!pr._count.orders ? (
                        <ActionButton action={deletePrice} fields={{ priceId: pr.id }} variant="ghost" confirm="Delete this price option?">
                          Delete
                        </ActionButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">No price options yet.</p>
          )}
        </Panel>
        <Panel title="Add a price option">
          <PriceForm allowed={allowed} />
        </Panel>
        <p className="text-sm text-muted">
          Fees: 0% on buyers who come through your own link, 30% on the first purchase of a buyer we find for you, then 5% on their repeat purchases. Card
          processing (about 2.9% + 30¢) applies to every sale.{" "}
          <Link href="/fees" className="link">
            See how fees work
          </Link>
        </p>
      </div>
    );
  }

  function PriceForm({
    price,
    allowed,
  }: {
    price?: { id: string; label: string; amountCents: number; interval: BillingInterval; sessions: number | null; trialDays: number };
    allowed: BillingInterval[];
  }) {
    const p = product!;
    return (
      <ActionForm action={savePrice} toastOnSuccess refreshOnSuccess resetOnSuccess={!price} className="space-y-4">
        <input type="hidden" name="productId" value={p.id} />
        {price ? <input type="hidden" name="priceId" value={price.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Option name" name="label">
            <Input name="label" defaultValue={price?.label ?? ""} maxLength={40} placeholder={allowed.includes("MONTH") ? "Monthly" : "Full access"} />
          </Field>
          <Field label="Price (USD)" name="amount" hint="0 for free.">
            <Input name="amount" inputMode="decimal" defaultValue={price ? (price.amountCents / 100).toFixed(2).replace(/\.00$/, "") : ""} placeholder="49" />
          </Field>
          <Field label="Billing" name="interval">
            <Select name="interval" defaultValue={price?.interval ?? allowed[0]}>
              {allowed.map((i) => (
                <option key={i} value={i}>
                  {i === "ONE_TIME" ? "One payment" : i === "MONTH" ? "Every month" : "Every year"}
                </option>
              ))}
            </Select>
          </Field>
          {p.type === "MENTORING" ? (
            <Field label="Calls included" name="sessions">
              <Input name="sessions" type="number" min={1} max={50} defaultValue={price?.sessions ?? 1} />
            </Field>
          ) : allowed.some((i) => i !== "ONE_TIME") ? (
            <Field label="Free trial (days)" name="trialDays" optional hint="Memberships only. 0 for none.">
              <Input name="trialDays" type="number" min={0} max={30} defaultValue={price?.trialDays ?? 0} />
            </Field>
          ) : null}
        </div>
        <FormMessage hideSuccess />
        <SubmitButton>{price ? "Save option" : "Add option"}</SubmitButton>
      </ActionForm>
    );
  }

  function ContentTab() {
    const p = product!;
    const inside = insidePath(user.username, p.slug);
    return (
      <Panel
        title="Content"
        description={`What members get inside: ${info.blurb.toLowerCase()}`}
        action={
          <Link href={inside} className="btn btn-secondary btn-sm">
            Open members area
          </Link>
        }
      >
        <div className="space-y-3 text-sm">
          {p.type === "COMMUNITY" || p.type === "ALERTS" ? (
            <div>
              <div className="font-semibold">Channels</div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.channels.map((c) => (
                  <li key={c.id} className="chip">
                    # {c.slug}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.type === "COURSE" ? (
            <p className="text-muted">
              {plural(p.modules.length, "module")}, {plural(p.modules.reduce((n, m) => n + m._count.lessons, 0), "lesson")}.
            </p>
          ) : null}
          {p.type === "DOWNLOAD" || (p.type === "INDICATOR" && settings.accessType === "download") ? <p className="text-muted">{plural(p.files.length, "file")} attached.</p> : null}
          <p className="text-muted">You manage everything members see from the members area. Posts, lessons and files you add there show up for buyers straight away.</p>
        </div>
      </Panel>
    );
  }

  function PublishTab() {
    const p = product!;
    const live = p.status === "PUBLISHED";
    return (
      <div className="space-y-6">
        {live ? (
          <Panel title="It's live" description={`Anyone can find it in the marketplace and on your page.${p._count.entitlements ? ` ${plural(p._count.entitlements, "person has", "people have")} access.` : ""}`}>
            <div className="flex flex-wrap gap-2">
              <Link href={page} className="btn btn-primary">
                View listing
              </Link>
              <ActionButton action={unpublishProduct} fields={{ productId: p.id }} variant="secondary" size="md" confirm="Hide this from the marketplace? People who bought it keep their access.">
                Unpublish
              </ActionButton>
            </div>
          </Panel>
        ) : p.status === "ARCHIVED" ? (
          <Panel title="Archived" description="It can't be bought. Restore it as a draft to sell it again.">
            <ActionButton action={restoreProduct} fields={{ productId: p.id }} variant="primary" size="md">
              Restore as draft
            </ActionButton>
          </Panel>
        ) : (
          <Panel title="Publish" description="Every listing is checked against the marketplace rules automatically when it's published.">
            <ul className="space-y-2.5">
              {[
                { ok: p.description != null && p.description.trim().length >= 80, label: "Description of at least 80 characters" },
                { ok: p.prices.some((x) => x.active), label: "At least one price option" },
                {
                  ok: !p.prices.some((x) => x.active && x.amountCents > 0) || (features.stripe ? user.creator.stripeChargesEnabled : user.creator.testPayoutsReady),
                  label: "Payouts set up (for paid options)",
                  href: "/creator/payouts",
                },
                ...(p.type === "EVENT" ? [{ ok: Boolean(p.startsAt), label: "Event date and time" }] : []),
              ].map((c) => (
                <li key={c.label} className="flex items-center gap-2.5 text-sm">
                  {c.ok ? <CheckCircle2 className="size-5 text-up" /> : <Circle className="size-5 text-line-strong" />}
                  {c.href && !c.ok ? (
                    <Link href={c.href} className="font-medium underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span className={c.ok ? "text-muted" : "font-medium"}>{c.label}</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl bg-sunk p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Ban className="size-4" /> Never allowed
              </div>
              <ul className="mt-2 grid gap-1 text-sm text-ink-2 sm:grid-cols-2">
                {BANNED_PRODUCTS.map((b) => (
                  <li key={b.title}>· {b.title}</li>
                ))}
              </ul>
            </div>
            <ActionForm action={publishProduct} className="mt-5 space-y-4">
              <input type="hidden" name="productId" value={p.id} />
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="rules" className="checkbox mt-0.5" />
                <span>
                  This listing follows the{" "}
                  <Link href="/rules" className="link" target="_blank">
                    marketplace rules
                  </Link>
                  : no profit promises, and nothing from the list above.
                </span>
              </label>
              <FieldError name="rules" />
              <FormMessage />
              <SubmitButton size="lg" disabled={blockers.length > 0}>
                {p.launchState === "WAITLIST" ? "Publish with a waitlist" : "Publish"}
              </SubmitButton>
            </ActionForm>
          </Panel>
        )}

        {p.status !== "ARCHIVED" ? (
          <Panel title="Archive" description="Stops all sales for good. Members keep access until their paid time ends. Drafts nobody bought are deleted instead." danger>
            <ActionButton action={archiveProduct} fields={{ productId: p.id }} variant="danger" size="md" confirm="Archive this product? It can't be bought after this.">
              {p.status === "DRAFT" && !p._count.entitlements ? "Delete draft" : "Archive product"}
            </ActionButton>
          </Panel>
        ) : null}
      </div>
    );
  }
}
