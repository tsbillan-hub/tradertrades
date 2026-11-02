import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accessById } from "@/server/inside";

/** Whether a channel has posts newer than `since`, for the "New posts" button. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel") ?? "";
  const since = new Date(url.searchParams.get("since") ?? "");
  if (!channelId || Number.isNaN(since.getTime())) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const channel = await db.channel.findUnique({ where: { id: channelId }, select: { productId: true } });
  if (!channel) return NextResponse.json({ newer: false });
  const ctx = await accessById(channel.productId);
  if (!ctx) return NextResponse.json({ error: "No access" }, { status: 403 });
  const newer = await db.post.findFirst({
    where: { channelId, deletedAt: null, createdAt: { gt: since }, NOT: { authorId: ctx.viewer.id } },
    select: { id: true },
  });
  return NextResponse.json({ newer: Boolean(newer) }, { headers: { "cache-control": "no-store" } });
}
