import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, Library, MessageCircleQuestion } from "lucide-react";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Account on hold", robots: { index: false } };

export default async function SuspendedPage() {
  const user = await requireUser();
  if (user.status !== "SUSPENDED") redirect("/");
  return (
    <div className="container-tt max-w-2xl py-12 sm:py-16">
      <div className="grid size-12 place-items-center rounded-full bg-down-soft text-down">
        <CircleAlert className="size-6" />
      </div>
      <h1 className="mt-5 text-3xl">Your account is on hold</h1>
      <p className="mt-3 text-ink-2">
        Our team put your account on hold, so you can&apos;t post, message, review or sell right now. Anything you sell is hidden from the marketplace while it&apos;s on hold.
      </p>
      {user.statusReason ? (
        <div className="card mt-5 p-5">
          <div className="text-sm font-semibold">Why</div>
          <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{user.statusReason}</p>
        </div>
      ) : null}
      <p className="mt-5 text-ink-2">You can still open what you bought. If you think this is a mistake, tell us and a person will look at it again.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/library" className="btn btn-secondary">
          <Library /> Your library
        </Link>
        <Link href="/help#contact" className="btn btn-primary">
          <MessageCircleQuestion /> Contact us
        </Link>
      </div>
    </div>
  );
}
