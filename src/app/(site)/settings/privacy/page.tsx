import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ActionButton, ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { Panel } from "@/components/ui/panel";
import { Avatar } from "@/components/ui/avatar";
import { deleteAccount } from "@/server/actions/account";
import { unblockUser } from "@/server/actions/messages";
import { requireUser } from "@/server/dal";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Privacy and data" };

export default async function PrivacyPage() {
  const user = await requireUser();
  const blocks = await db.block.findMany({ where: { blockerId: user.id }, include: { blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } });
  return (
    <>
      <Panel title="Download your data" description="A file with your profile, purchases, reviews, posts and messages.">
        <a href="/api/account/export" className="btn btn-secondary btn-sm">
          <Download /> Download my data
        </a>
      </Panel>

      <Panel title="Blocked people" description="They can't message you or comment on your posts.">
        {blocks.length ? (
          <ul className="divide-y divide-line">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={b.blocked.avatarUrl} name={b.blocked.displayName} size={32} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">{b.blocked.displayName}</div>
                  <div className="text-muted">@{b.blocked.username}</div>
                </div>
                <ActionButton action={unblockUser} fields={{ userId: b.blocked.id }} variant="ghost">
                  Unblock
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You haven&apos;t blocked anyone.</p>
        )}
      </Panel>

      <ActionForm action={deleteAccount}>
        <Panel
          danger
          title="Delete account"
          description="Your profile and listings are removed and you're signed out. Receipts are kept for tax law, without your name. This can't be undone."
          footer={<SubmitButton variant="danger">Delete my account</SubmitButton>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" name="currentPassword">
              <PasswordInput name="currentPassword" autoComplete="current-password" />
            </Field>
            <Field label='Type "DELETE" to confirm' name="confirm">
              <Input name="confirm" autoComplete="off" />
            </Field>
          </div>
          <FormMessage className="mt-4" />
        </Panel>
      </ActionForm>
    </>
  );
}
