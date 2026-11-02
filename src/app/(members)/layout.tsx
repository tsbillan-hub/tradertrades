import { SiteHeader } from "@/components/layout/site-header";
import { AccountBanners } from "@/components/layout/account-banners";

/** Members areas: the site header without the big footer, so they feel like an app. */
export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <AccountBanners />
      <main className="flex-1">{children}</main>
    </div>
  );
}
