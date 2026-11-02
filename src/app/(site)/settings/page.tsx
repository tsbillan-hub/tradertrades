import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ImageField } from "@/components/ui/uploader";
import { Panel } from "@/components/ui/panel";
import { SocialIcon } from "@/components/icons/social";
import { updateProfile, updateSocials } from "@/server/actions/profile";
import { requireUser } from "@/server/dal";
import { db } from "@/lib/db";
import { EXPERIENCE, MARKETS, SOCIALS } from "@/lib/constants";

export const metadata: Metadata = { title: "Profile settings" };

const TIMEZONES = Intl.supportedValuesOf("timeZone");

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const socials = await db.socialLink.findMany({ where: { userId: user.id } });

  return (
    <>
      <ActionForm action={updateProfile} toastOnSuccess>
        <Panel
          title="Profile"
          description="This is what people see on your public page."
          action={
            <Link href={`/@${user.username}`} className="btn btn-ghost btn-sm">
              View profile <ExternalLink />
            </Link>
          }
          footer={<SubmitButton>Save profile</SubmitButton>}
        >
          <div className="space-y-6">
            <div>
              <div className="label">Photo</div>
              <ImageField name="avatarUrl" defaultUrl={user.avatarUrl} purpose="avatar" shape="circle" label="Upload photo" hint="Square works best. JPG, PNG or WebP, up to 5 MB." />
            </div>
            <div>
              <div className="label">Banner</div>
              <ImageField name="bannerUrl" defaultUrl={user.bannerUrl} purpose="banner" shape="wide" label="Upload banner" hint="Shown across the top of your profile. 1600 × 400 or wider." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" name="displayName">
                <Input name="displayName" defaultValue={user.displayName} maxLength={50} />
              </Field>
              <Field label="Location" name="location" optional>
                <Input name="location" defaultValue={user.location ?? ""} placeholder="Toronto, Canada" maxLength={60} />
              </Field>
            </div>
            <Field label="Short bio" name="bio" optional hint="One line, 160 characters max.">
              <Textarea name="bio" rows={2} maxLength={160} defaultValue={user.bio ?? ""} />
            </Field>
            <Field label="About" name="about" optional hint="Your story, how you trade, what you teach. Markdown works (**bold**, lists, links).">
              <Textarea name="about" rows={7} maxLength={5000} defaultValue={user.about ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website" name="website" optional>
                <Input name="website" type="url" defaultValue={user.website ?? ""} placeholder="https://" />
              </Field>
              <Field label="Time zone" name="timezone" hint="Used for calls and live sessions.">
                <Select name="timezone" defaultValue={user.timezone}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <fieldset>
              <legend className="label">Markets you trade</legend>
              <div className="flex flex-wrap gap-2">
                {MARKETS.map((m) => (
                  <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                    <input type="checkbox" name="markets" value={m.value} defaultChecked={user.markets.includes(m.value)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Experience" name="experience" optional>
                <Select name="experience" defaultValue={user.experience ?? ""}>
                  <option value="">Prefer not to say</option>
                  {EXPERIENCE.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="showPurchases" defaultChecked={user.showPurchases} className="checkbox mt-0.5" />
              <span>
                <span className="font-semibold">Show communities I&apos;m in on my profile</span>
                <span className="block text-muted">Off by default. Creators always see their own members.</span>
              </span>
            </label>
            <FormMessage hideSuccess />
          </div>
        </Panel>
      </ActionForm>

      <ActionForm action={updateSocials} toastOnSuccess>
        <Panel title="Social links" description="Add the accounts you post on. You can get them verified under Verification." footer={<SubmitButton>Save links</SubmitButton>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIALS.map((s) => {
              const existing = socials.find((x) => x.platform === s.value);
              return (
                <Field
                  key={s.value}
                  name={`social_${s.value}`}
                  label={
                    <span className="flex items-center gap-2">
                      <SocialIcon platform={s.value} className="size-4" />
                      {s.label}
                      {existing?.verifiedAt ? <span className="badge badge-ok h-5 text-[11px]">Verified</span> : null}
                    </span>
                  }
                >
                  <Input name={`social_${s.value}`} type="url" defaultValue={existing?.url ?? ""} placeholder={s.placeholder} />
                </Field>
              );
            })}
          </div>
          <FormMessage hideSuccess className="mt-4" />
        </Panel>
      </ActionForm>
    </>
  );
}
