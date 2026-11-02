import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AccountBanners } from "@/components/layout/account-banners";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <AccountBanners />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
