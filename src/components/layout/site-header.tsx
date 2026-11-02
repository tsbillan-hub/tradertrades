import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  Shield,
  Sparkles,
  Store,
  User,
  Users,
  BookOpen,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, ThemeToggle } from "@/components/ui/client";
import { HeaderSearch } from "@/components/layout/header-search";
import { MobileLink, MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { getViewer } from "@/server/dal";
import { unreadCounts } from "@/server/queries/inbox";
import { signOut } from "@/server/actions/auth";
import { db } from "@/lib/db";

const NAV = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/directory", label: "Directory" },
  { href: "/creators", label: "Creators" },
  { href: "/jobs", label: "Jobs" },
];

export async function SiteHeader() {
  const viewer = await getViewer();
  const themeCookie = (await cookies()).get("tt_theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  const counts = viewer ? await unreadCounts(viewer.id) : null;
  const isBusiness = viewer ? (await db.businessMember.count({ where: { userId: viewer.id } })) > 0 : false;
  const creatorApproved = viewer?.creator?.status === "APPROVED";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
      <div className="container-tt flex h-16 items-center gap-3">
        <Link href="/" className="mr-1 flex shrink-0 items-center" aria-label="TraderTrades home">
          <Logo markClassName="size-8" wordClassName="hidden h-[18px] sm:block" />
        </Link>

        <nav className="hidden items-center lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-1 justify-end md:justify-center">
          <Suspense fallback={<div className="hidden h-10 w-full max-w-sm md:block" />}>
            <HeaderSearch className="hidden w-full max-w-sm md:block" />
          </Suspense>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link href="/search" className="btn btn-ghost btn-icon md:hidden" aria-label="Search">
            <Search />
          </Link>

          {viewer ? (
            <>
              <Link href="/messages" className="btn btn-ghost btn-icon relative" aria-label={`Messages${counts?.messages ? `, ${counts.messages} unread` : ""}`}>
                <MessageSquare />
                {counts?.messages ? <span className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-bg" /> : null}
              </Link>
              <Link
                href="/notifications"
                className="btn btn-ghost btn-icon relative"
                aria-label={`Notifications${counts?.notifications ? `, ${counts.notifications} unread` : ""}`}
              >
                <Bell />
                {counts?.notifications ? (
                  <span className="num absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white ring-2 ring-bg">
                    {counts.notifications > 9 ? "9+" : counts.notifications}
                  </span>
                ) : null}
              </Link>
              <Menu
                label="Account menu"
                trigger={
                  <span className="ml-1 flex cursor-pointer items-center rounded-full ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-line-strong">
                    <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={34} />
                  </span>
                }
                panelClassName="w-64"
              >
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{viewer.displayName}</div>
                    <div className="truncate text-xs text-muted">@{viewer.username}</div>
                  </div>
                </div>
                <div className="my-1 h-px bg-line" />
                <MenuItem href={`/@${viewer.username}`} icon={<User />}>
                  Your profile
                </MenuItem>
                <MenuItem href="/library" icon={<Library />}>
                  Library
                </MenuItem>
                <MenuItem href="/bookings" icon={<CalendarDays />}>
                  Calls
                </MenuItem>
                <MenuItem href="/saved" icon={<Bookmark />}>
                  Saved
                </MenuItem>
                <MenuItem href="/settings/billing" icon={<Receipt />}>
                  Purchases
                </MenuItem>
                <div className="my-1 h-px bg-line" />
                {creatorApproved ? (
                  <MenuItem href="/creator" icon={<LayoutDashboard />}>
                    Creator dashboard
                  </MenuItem>
                ) : (
                  <MenuItem href="/creator/start" icon={<Sparkles />}>
                    Start selling
                  </MenuItem>
                )}
                {isBusiness ? (
                  <MenuItem href="/business" icon={<Building2 />}>
                    Business dashboard
                  </MenuItem>
                ) : viewer.accountType === "BUSINESS" ? (
                  <MenuItem href="/business/claim" icon={<Building2 />}>
                    Claim your company
                  </MenuItem>
                ) : null}
                {viewer.isAdmin ? (
                  <MenuItem href="/admin" icon={<Shield />}>
                    Admin
                  </MenuItem>
                ) : null}
                <MenuItem href="/settings" icon={<Settings />}>
                  Settings
                </MenuItem>
                <div className="my-1 h-px bg-line" />
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-sm font-medium text-ink-2">Theme</span>
                  <ThemeToggle initial={theme} />
                </div>
                <form action={signOut}>
                  <button type="submit" data-close className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink">
                    <LogOut className="size-4 text-muted" />
                    Sign out
                  </button>
                </form>
              </Menu>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Join free
              </Link>
            </>
          )}

          <MobileNav>
            <div className="space-y-1">
              <MobileLink href="/marketplace">
                <Store /> Marketplace
              </MobileLink>
              <MobileLink href="/directory">
                <BookOpen /> Directory
              </MobileLink>
              <MobileLink href="/creators">
                <Users /> Creators
              </MobileLink>
              <MobileLink href="/jobs">
                <Briefcase /> Jobs
              </MobileLink>
            </div>
            <div className="my-3 h-px bg-line" />
            {viewer ? (
              <div className="space-y-1">
                <MobileLink href="/library">
                  <Library /> Library
                </MobileLink>
                <MobileLink href="/messages">
                  <MessageSquare /> Messages
                </MobileLink>
                <MobileLink href="/settings">
                  <Settings /> Settings
                </MobileLink>
              </div>
            ) : (
              <div className="grid gap-2">
                <Link href="/signup" className="btn btn-primary">
                  Join free
                </Link>
                <Link href="/login" className="btn btn-secondary">
                  Sign in
                </Link>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between px-3">
              <span className="text-sm font-medium text-muted">Theme</span>
              <ThemeToggle initial={theme} />
            </div>
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
