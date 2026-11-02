import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { PURPOSES, type Purpose } from "@/server/storage";
import { rateLimit } from "@/server/rate-limit";

/** Hands the browser a short-lived token so it can upload straight to Vercel Blob. */
export async function POST(request: Request) {
  if (!features.blob) return NextResponse.json({ error: "Direct upload is off" }, { status: 400 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      token: env.blobToken,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const viewer = await getViewer();
        if (!viewer || viewer.status !== "ACTIVE") throw new Error("Sign in first");
        const rl = await rateLimit(`upload:${viewer.id}`, 60, 3600);
        if (!rl.ok) throw new Error("Too many uploads");
        const payload = JSON.parse(clientPayload ?? "{}") as { purpose?: Purpose; productId?: string };
        const purpose = payload.purpose;
        if (!purpose || !(purpose in PURPOSES)) throw new Error("Unknown upload type");
        const rule = PURPOSES[purpose];
        if (!pathname.startsWith(`u/`) || !pathname.includes(`/${viewer.id}/`)) throw new Error("Bad path");
        if (rule.needsProduct) {
          const product = payload.productId ? await db.product.findUnique({ where: { id: payload.productId }, select: { creatorId: true } }) : null;
          if (!product || (product.creatorId !== viewer.id && !viewer.isAdmin)) throw new Error("Not your product");
        }
        return {
          allowedContentTypes: rule.types,
          maximumSizeInBytes: rule.maxMB * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: viewer.id, purpose, productId: payload.productId ?? null }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
