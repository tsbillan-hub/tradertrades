import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { canAccessMedia } from "@/server/media-access";
import { openLocal, privateBlobUrl } from "@/server/storage";

const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|application\/pdf)$/;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const media = await db.media.findUnique({ where: { id } });
  if (!media) return new NextResponse("Not found", { status: 404 });

  const viewer = media.visibility === "PUBLIC" ? null : await getViewer();
  if (!(await canAccessMedia(media, viewer))) {
    return new NextResponse(viewer ? "You don't have access to this file" : "Sign in to open this file", { status: viewer ? 403 : 401 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  if (media.storage === "BLOB") {
    if (media.visibility === "PUBLIC" && media.url) return NextResponse.redirect(media.url, 302);
    const signed = await privateBlobUrl(media.key);
    return NextResponse.redirect(signed, 302);
  }

  const inline = !download && INLINE_TYPES.test(media.mimeType);
  const headers: Record<string, string> = {
    "content-type": inline ? media.mimeType : "application/octet-stream",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "cache-control": media.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${media.originalName.replace(/"/g, "")}"`,
  };

  try {
    const range = request.headers.get("range");
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      const size = media.sizeBytes;
      if (m) {
        let start = m[1] ? Number(m[1]) : NaN;
        let end = m[2] ? Number(m[2]) : NaN;
        if (Number.isNaN(start)) {
          start = Math.max(0, size - (Number.isNaN(end) ? 0 : end));
          end = size - 1;
        } else if (Number.isNaN(end) || end >= size) {
          end = Math.min(size - 1, start + 8 * 1024 * 1024 - 1);
        }
        if (start >= size || start > end) {
          return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
        }
        const { stream } = await openLocal(media.key, { start, end });
        return new NextResponse(stream, {
          status: 206,
          headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
        });
      }
    }
    const { stream, size } = await openLocal(media.key);
    return new NextResponse(stream, { status: 200, headers: { ...headers, "content-length": String(size) } });
  } catch {
    return new NextResponse("File is missing", { status: 404 });
  }
}
