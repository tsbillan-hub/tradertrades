import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/client";
import { changePassword, changeUsername, requestEmailChange } from "@/server/actions/account";
import { requireUser } from "@/server/dal";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const user = await requireUser();
  const { email } = await searchParams;
  const themeCookie = (await cookies()).get("tt_theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

  return (
    <>
      {email === "changed" ? <Notice tone="ok" title="Email changed">Your account email is now {user.email}.</Notice> : null}
      {email === "expired" ? <Notice tone="warn" title="That link has expired">Ask for a new one below.</Notice> : null}
      {email === "taken" ? <Notice tone="bad" title="That email is taken">Another account started using it. Try a different email.</Notice> : null}

      <ActionForm action={changeUsername} toastOnSuccess>
        <Panel title="Username" description="Your profile link is tradertrades.com/@username." footer={<SubmitButton>Change username</SubmitButton>}>
          <Field label="Username" name="username" hint="Letters, numbers and _. Your old link stops working if you change it.">
            <div className="relative max-w-sm">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">@</span>
              <Input name="username" defaultValue={user.username} className="pl-7" />
            </div>
          </Field>
          <FormMessage hideSuccess className="mt-4" />
        </Panel>
      </ActionForm>

      <ActionForm action={requestEmailChange} resetOnSuccess>
        <Panel
          title="Email"
          description={
            <>
              Currently <b className="text-ink">{user.email}</b>
              {user.emailVerifiedAt ? ` · confirmed ${formatDate(user.emailVerifiedAt)}` : " · not confirmed yet"}
            </>
          }
          footer={<SubmitButton>Send confirmation link</SubmitButton>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New email" name="email">
              <Input name="email" type="email" autoComplete="email" />
            </Field>
            <Field label="Current password" name="currentPassword">
              <PasswordInput name="currentPassword" autoComplete="current-password" />
            </Field>
          </div>
          <FormMessage className="mt-4" />
        </Panel>
      </ActionForm>

      <ActionForm action={changePassword} resetOnSuccess>
        <Panel title="Password" description="Changing it signs you out on other devices." footer={<SubmitButton>Change password</SubmitButton>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" name="currentPassword">
              <PasswordInput name="currentPassword" autoComplete="current-password" />
            </Field>
            <Field label="New password" name="newPassword" hint="At least 10 characters">
              <PasswordInput name="newPassword" autoComplete="new-password" />
            </Field>
          </div>
          <FormMessage className="mt-4" />
        </Panel>
      </ActionForm>

      <Panel title="Appearance" description="Light, dark, or match your device.">
        <ThemeToggle initial={theme} />
      </Panel>
    </>
  );
}
