import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { z } from "zod";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { PURPOSES, kindFor, mediaUrl, safeName, type Purpose } from "@/server/storage";
import { sameOrigin } from "@/server/http";

const schema = z.object({
  url: z.url(),
  pathname: z.string().min(3),
  purpose: z.string(),
  name: z.string().max(300),
  productId: z.string().nullish(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
});

/** Records a finished direct upload after checking it really exists in our store. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!features.blob) return NextResponse.json({ error: "Direct upload is off" }, { status: 400 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const d = parsed.data;
  const purpose = d.purpose as Purpose;
  if (!(purpose in PURPOSES)) return NextResponse.json({ error: "Unknown upload type" }, { status: 400 });
  if (!d.pathname.includes(`/${viewer.id}/`)) return NextResponse.json({ error: "Not your file" }, { status: 403 });
  const rule = PURPOSES[purpose];
  const info = await head(d.url, { token: env.blobToken }).catch(() => null);
  if (!info) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  if (!rule.types.includes(info.contentType)) return NextResponse.json({ error: "Type not allowed" }, { status: 400 });

  const media = await db.media.create({
    data: {
      ownerId: viewer.id,
      kind: kindFor(info.contentType),
      storage: "BLOB",
      key: info.pathname,
      url: info.url,
      mimeType: info.contentType,
      sizeBytes: info.size,
      originalName: safeName(d.name),
      visibility: rule.visibility,
      productId: rule.needsProduct ? (d.productId ?? null) : null,
      purpose,
      width: d.width,
      height: d.height,
      durationSec: d.duration ? Math.round(d.duration) : undefined,
    },
  });
  return NextResponse.json({ id: media.id, url: mediaUrl(media), kind: media.kind, name: media.originalName, size: media.sizeBytes });
}
