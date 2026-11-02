import { BadgeCheck, Bell, KeyRound, Receipt, Shield, User, UserCog } from "lucide-react";
import { SideLink } from "@/components/layout/nav-link";
import { requireUser } from "@/server/dal";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="container-tt py-8 sm:py-10">
      <h1 className="text-[28px]">Settings</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Settings">
          <SideLink href="/settings" exact icon={<User />}>Profile</SideLink>
          <SideLink href="/settings/account" icon={<UserCog />}>Account</SideLink>
          <SideLink href="/settings/security" icon={<KeyRound />}>Security</SideLink>
          <SideLink href="/settings/notifications" icon={<Bell />}>Notifications</SideLink>
          <SideLink href="/settings/verification" icon={<BadgeCheck />}>Verification</SideLink>
          <SideLink href="/settings/billing" icon={<Receipt />}>Purchases</SideLink>
          <SideLink href="/settings/privacy" icon={<Shield />}>Privacy and data</SideLink>
        </nav>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
