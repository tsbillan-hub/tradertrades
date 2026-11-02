import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarClock, Settings2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { JOIN_LATE_MIN } from "@/server/bookings";
import { CallList, CallRow } from "@/components/bookings/call-row";
import { EmptyState, LinkTabs, PageHeader, Pagination } from "@/components/ui/misc";
import { zoneName } from "@/lib/time";

export const metadata: Metadata = { title: "Calls", robots: { index: false } };

const PER_PAGE = 20;

type Props = { searchParams: Promise<{ tab?: string; page?: string }> };

export default async function BookingsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "past" ? "past" : "upcoming";
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();
  // A call stays "upcoming" until its join window closes.
  const cutoff = new Date(now.getTime() - JOIN_LATE_MIN * 60_000);
  const mine: Prisma.BookingWhereInput = { OR: [{ mentorId: user.id }, { buyerId: user.id }] };
  const upcomingWhere: Prisma.BookingWhereInput = { AND: [mine, { status: "CONFIRMED", endsAt: { gt: cutoff } }] };
  const pastWhere: Prisma.BookingWhereInput = { AND: [mine, { OR: [{ status: { not: "CONFIRMED" } }, { endsAt: { lte: cutoff } }] }] };
  const where = tab === "past" ? pastWhere : upcomingWhere;

  const include = {
    product: { select: { title: true } },
    mentor: { select: { displayName: true, avatarUrl: true } },
    buyer: { select: { displayName: true, avatarUrl: true } },
  } as const;
  const [rows, upcomingCount, pastCount, sellsMentoring] = await Promise.all([
    db.booking.findMany({ where, include, orderBy: { startsAt: tab === "past" ? "desc" : "asc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.booking.count({ where: upcomingWhere }),
    db.booking.count({ where: pastWhere }),
    user.creator?.status === "APPROVED" ? db.product.count({ where: { creatorId: user.id, type: "MENTORING", status: { not: "ARCHIVED" } } }) : 0,
  ]);
  const total = tab === "past" ? pastCount : upcomingCount;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <PageHeader
        title="Calls"
        description={`Mentoring calls you've booked, and calls booked with you. Times in ${zoneName(user.timezone)}.`}
        actions={
          sellsMentoring ? (
            <Link href="/creator/calendar" className="btn btn-secondary btn-sm">
              <Settings2 /> Your calendar
            </Link>
          ) : null
        }
      />
      <LinkTabs
        className="mt-6"
        active={tab}
        tabs={[
          { key: "upcoming", href: "/bookings", label: "Upcoming", count: upcomingCount },
          { key: "past", href: "/bookings?tab=past", label: "Past and canceled", count: pastCount },
        ]}
      />
      <div className="mt-5">
        {rows.length ? (
          <CallList label={tab === "past" ? "Past and canceled calls" : "Upcoming calls"}>
            {rows.map((b) => (
              <CallRow key={b.id} call={{ ...b, other: b.mentorId === user.id ? b.buyer : b.mentor }} timeZone={user.timezone} now={now} />
            ))}
          </CallList>
        ) : tab === "upcoming" ? (
          <EmptyState
            icon={<CalendarClock />}
            title="No calls coming up"
            description="When you buy mentoring, you book your calls from its members area. They show up here."
            action={
              <Link href="/marketplace?type=mentoring" className="btn btn-secondary">
                <CalendarDays /> Find a mentor
              </Link>
            }
          />
        ) : (
          <EmptyState icon={<CalendarClock />} title="No past calls yet" />
        )}
      </div>
      <Pagination page={page} pages={pages} hrefFor={(p) => `/bookings?${new URLSearchParams({ ...(tab === "past" ? { tab } : {}), page: String(p) })}`} />
    </div>
  );
}
