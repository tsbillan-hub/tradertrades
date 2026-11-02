import type { Metadata } from "next";
import { ActionForm, Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { saveOnboarding } from "@/server/actions/profile";
import { requireUser } from "@/server/dal";
import { EXPERIENCE, MARKETS } from "@/lib/constants";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const { next } = await searchParams;
  const nextLabel =
    user.accountType === "CREATOR" ? "Continue to set up selling" : user.accountType === "BUSINESS" ? "Continue to claim your company" : "Start exploring";

  return (
    <div className="container-tt max-w-2xl py-10 sm:py-14">
      <div className="kicker">Step 2 of 2</div>
      <h1 className="mt-2 text-[30px]">Nice to meet you, {user.displayName.split(" ")[0]}.</h1>
      <p className="mt-2 text-muted">Tell us what you trade so we can show you the right creators and tools. You can change this any time.</p>

      <ActionForm action={saveOnboarding} className="card mt-8 space-y-8 p-6 sm:p-8">
        {next ? <input type="hidden" name="next" value={safeNext(next, "")} /> : null}
        <fieldset>
          <legend className="label">What do you trade?</legend>
          <p className="hint -mt-1 mb-3">Pick all that apply.</p>
          <div className="flex flex-wrap gap-2">
            {MARKETS.map((m) => (
              <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                <input type="checkbox" name="markets" value={m.value} defaultChecked={user.markets.includes(m.value)} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Where are you at?</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {EXPERIENCE.map((e) => (
              <label key={e.value} className="tile">
                <input type="radio" name="experience" value={e.value} defaultChecked={user.experience === e.value} className="checkbox radio mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">{e.label}</span>
                  <span className="block text-xs text-muted">{e.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="A line about you" name="bio" optional hint="Shown on your profile. 160 characters max.">
          <Textarea name="bio" defaultValue={user.bio ?? ""} maxLength={160} rows={2} placeholder="NQ scalper, 2 years in, working on patience." />
        </Field>

        <FormMessage />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a href={safeNext(next, user.accountType === "CREATOR" ? "/creator/start" : user.accountType === "BUSINESS" ? "/business/claim" : "/marketplace")} className="text-center text-sm font-medium text-muted hover:text-ink">
            Skip for now
          </a>
          <SubmitButton size="lg">{nextLabel}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
