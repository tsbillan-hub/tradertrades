import { MailWarning, ShieldAlert } from "lucide-react";
import { getViewer } from "@/server/dal";
import { ResendVerifyButton } from "@/components/layout/resend-verify";

export async function AccountBanners() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (
    <>
      {viewer.status === "SUSPENDED" ? (
        <div className="border-b border-line bg-down-soft text-down">
          <div className="container-tt flex items-center gap-2 py-2 text-sm">
            <ShieldAlert className="size-4 shrink-0" />
            <span>
              Your account is suspended{viewer.statusReason ? `: ${viewer.statusReason}` : "."} You can still use what you bought, but you can&apos;t sell, post or message.
            </span>
          </div>
        </div>
      ) : null}
      {!viewer.emailVerifiedAt ? (
        <div className="border-b border-line bg-warn-soft text-warn">
          <div className="container-tt flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <MailWarning className="size-4 shrink-0" />
            <span>
              Confirm your email ({viewer.email}) to buy, post, review and message.
            </span>
            <ResendVerifyButton />
          </div>
        </div>
      ) : null}
    </>
  );
}
