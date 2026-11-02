import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { saveCreatorSettings } from "@/server/actions/products";
import { ActionForm, Field, FieldError, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { MARKETS } from "@/lib/constants";

export const metadata: Metadata = { title: "Creator settings" };

export default async function CreatorSettingsPage() {
  const user = await requireCreator();
  const c = user.creator;
  const videos = await db.videoPost.findMany({ where: { authorId: user.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });

  return (
    <div className="space-y-6">
      <PageHeader title="Creator settings" description="How your creator page looks to buyers. Your photo, banner, bio and links are in your profile settings." />
      <ActionForm action={saveCreatorSettings} toastOnSuccess className="space-y-6">
        <Panel title="Your page">
          <div className="space-y-5">
            <Field label="What you teach, in one line" name="headline">
              <Input name="headline" defaultValue={c.headline ?? ""} maxLength={100} />
            </Field>
            <fieldset>
              <legend className="label">Markets you teach</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {MARKETS.map((m) => (
                  <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                    <input type="checkbox" name="markets" value={m.value} defaultChecked={c.markets.includes(m.value)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
              <FieldError name="markets" />
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
              <Field label="Your style" name="tradingStyle" optional>
                <Input name="tradingStyle" defaultValue={c.tradingStyle ?? ""} maxLength={60} />
              </Field>
              <Field label="Years trading" name="yearsTrading" optional>
                <Input name="yearsTrading" type="number" min={0} max={60} defaultValue={c.yearsTrading ?? ""} />
              </Field>
            </div>
            <Field label="Pinned video" name="pinnedVideoId" optional hint="Shown at the top of your page. Defaults to your newest video.">
              <Select name="pinnedVideoId" defaultValue={c.pinnedVideoId ?? ""}>
                <option value="">Newest video</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Panel>
        <Panel title="Brand deals">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptsCampaigns" defaultChecked={c.acceptsCampaigns} className="checkbox mt-0.5" />
            <span>
              <span className="font-semibold">Open to campaigns from companies</span>
              <span className="block text-muted">Prop firms, brokers and tools can invite you to paid campaigns. You always choose what to accept.</span>
            </span>
          </label>
        </Panel>
        <div className="flex items-center justify-between gap-3">
          <Link href="/settings" className="text-sm font-semibold text-muted hover:text-ink">
            Edit photo, bio and links
          </Link>
          <div className="flex items-center gap-3">
            <FormMessage hideSuccess />
            <SubmitButton>Save</SubmitButton>
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
