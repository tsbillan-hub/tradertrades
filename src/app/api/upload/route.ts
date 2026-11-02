import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { PURPOSES, UploadError, mediaUrl, saveMedia, type Purpose } from "@/server/storage";
import { rateLimit } from "@/server/rate-limit";
import { sameOrigin } from "@/server/http";

/**
 * Local uploads (no Blob token): the browser sends the raw file as the request body.
 * Query: purpose, name, productId?, width?, height?, duration?
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (features.blob) return NextResponse.json({ error: "Use direct upload" }, { status: 400 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (viewer.status !== "ACTIVE") return NextResponse.json({ error: "Your account can't upload right now" }, { status: 403 });

  const rl = await rateLimit(`upload:${viewer.id}`, 60, 3600);
  if (!rl.ok) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });

  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose") as Purpose | null;
  if (!purpose || !(purpose in PURPOSES)) return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });
  const productId = url.searchParams.get("productId");
  const rule = PURPOSES[purpose];
  if (rule.needsProduct) {
    if (!productId) return NextResponse.json({ error: "Missing product" }, { status: 400 });
    const product = await db.product.findUnique({ where: { id: productId }, select: { creatorId: true } });
    if (!product || (product.creatorId !== viewer.id && !viewer.isAdmin)) return NextResponse.json({ error: "Not your product" }, { status: 403 });
  }
  if (!request.body) return NextResponse.json({ error: "No file" }, { status: 400 });

  const num = (k: string) => {
    const v = Number(url.searchParams.get(k));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
  };
  try {
    const media = await saveMedia({
      ownerId: viewer.id,
      purpose,
      mimeType: request.headers.get("content-type") ?? "application/octet-stream",
      originalName: url.searchParams.get("name") ?? "upload",
      body: request.body,
      productId: rule.needsProduct ? productId : null,
      meta: { width: num("width"), height: num("height"), durationSec: num("duration") },
    });
    return NextResponse.json({ id: media.id, url: mediaUrl(media), kind: media.kind, name: media.originalName, size: media.sizeBytes });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
