"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, LineChart, Sparkles } from "lucide-react";
import { ActionForm, Field, FieldError, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { signUp } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "TRADER", label: "Trader", hint: "Learn, find tools and get mentored", icon: LineChart },
  { value: "CREATOR", label: "Creator", hint: "Sell courses, a community or calls", icon: Sparkles },
  { value: "BUSINESS", label: "Business", hint: "List your company and work with creators", icon: Building2 },
] as const;

export function SignupForm({ initialRole, next }: { initialRole: "TRADER" | "CREATOR" | "BUSINESS"; next?: string }) {
  const [role, setRole] = useState<string>(initialRole);
  const [username, setUsername] = useState("");
  return (
    <ActionForm action={signUp} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <fieldset>
        <legend className="label">I&apos;m joining as</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <label key={r.value} className={cn("tile flex-col gap-2 p-3")}>
              <input
                type="radio"
                name="accountType"
                value={r.value}
                defaultChecked={r.value === initialRole}
                onChange={() => setRole(r.value)}
                className="sr-only"
              />
              <r.icon className="size-5 text-ink" />
              <span>
                <span className="block text-sm font-bold">{r.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError name="accountType" />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={role === "BUSINESS" ? "Your name" : "Name"} name="displayName">
          <Input name="displayName" autoComplete="name" placeholder={role === "BUSINESS" ? "Alex Morgan" : "Your name"} />
        </Field>
        <Field label="Username" name="username" hint={username ? `tradertrades.com/@${username.toLowerCase()}` : "Letters, numbers and _"}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">@</span>
            <Input name="username" autoComplete="username" className="pl-7" placeholder="username" onChange={(e) => setUsername(e.target.value)} />
          </div>
        </Field>
      </div>
      <Field label={role === "BUSINESS" ? "Email" : "Email"} name="email" hint={role === "BUSINESS" ? "You can add your work email when you claim your company." : undefined}>
        <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" />
      </Field>
      <Field label="Password" name="password" hint="At least 10 characters">
        <PasswordInput name="password" autoComplete="new-password" />
      </Field>

      <div className="space-y-2.5">
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" name="age" className="checkbox mt-0.5" />
          <span>I&apos;m 13 or older.</span>
        </label>
        <FieldError name="age" />
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" name="terms" className="checkbox mt-0.5" />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="link">
              terms
            </Link>
            ,{" "}
            <Link href="/rules" target="_blank" className="link">
              marketplace rules
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="link">
              privacy policy
            </Link>
            .
          </span>
        </label>
        <FieldError name="terms" />
      </div>

      <FormMessage />
      <SubmitButton className="w-full" size="lg" pendingText="Creating your account…">
        {role === "CREATOR" ? "Create account and start selling" : role === "BUSINESS" ? "Create business account" : "Create free account"}
      </SubmitButton>
    </ActionForm>
  );
}
