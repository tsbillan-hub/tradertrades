import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { MediaKind, MediaVisibility } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { randomToken } from "@/server/crypto";

export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const DOC_TYPES = ["application/pdf", ...IMAGE_TYPES];
const FILE_TYPES = [
  ...DOC_TYPES,
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
];

export type Purpose = "avatar" | "banner" | "cover" | "poster" | "video" | "lesson" | "file" | "document" | "proof" | "post";

export const PURPOSES: Record<
  Purpose,
  { types: string[]; maxMB: number; visibility: MediaVisibility; needsProduct?: boolean; label: string }
> = {
  avatar: { types: IMAGE_TYPES, maxMB: 5, visibility: "PUBLIC", label: "profile photo" },
  banner: { types: IMAGE_TYPES, maxMB: 8, visibility: "PUBLIC", label: "banner" },
  cover: { types: IMAGE_TYPES, maxMB: 8, visibility: "PUBLIC", label: "cover image" },
  poster: { types: IMAGE_TYPES, maxMB: 8, visibility: "PUBLIC", label: "video thumbnail" },
  video: { types: VIDEO_TYPES, maxMB: 2048, visibility: "PUBLIC", label: "video" },
  lesson: { types: VIDEO_TYPES, maxMB: 4096, visibility: "PRIVATE", needsProduct: true, label: "lesson video" },
  file: { types: FILE_TYPES, maxMB: 500, visibility: "PRIVATE", needsProduct: true, label: "file" },
  document: { types: DOC_TYPES, maxMB: 10, visibility: "PRIVATE", label: "document" },
  proof: { types: DOC_TYPES, maxMB: 10, visibility: "PRIVATE", label: "proof" },
  post: { types: IMAGE_TYPES, maxMB: 8, visibility: "PRIVATE", needsProduct: true, label: "image" },
};

export function kindFor(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export function safeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
}

export function mediaUrl(media: { id: string; storage: string; url: string | null; visibility: string }) {
  if (media.storage === "BLOB" && media.visibility === "PUBLIC" && media.url) return media.url;
  return `/api/media/${media.id}`;
}

function localPath(key: string) {
  const p = path.join(UPLOAD_DIR, key);
  if (!p.startsWith(UPLOAD_DIR)) throw new Error("Bad path");
  return p;
}

class TooLarge extends Error {}

/** Writes a stream to local disk, stopping if it grows past maxBytes. */
async function writeLocal(key: string, body: ReadableStream<Uint8Array> | Buffer, maxBytes: number) {
  const target = localPath(key);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new TooLarge("File too large"));
      else cb(null, chunk);
    },
  });
  const source = Buffer.isBuffer(body) ? Readable.from(body) : Readable.fromWeb(body as import("node:stream/web").ReadableStream);
  try {
    await pipeline(source, counter, fs.createWriteStream(target));
  } catch (err) {
    await fs.promises.rm(target, { force: true });
    throw err;
  }
  return size;
}

export type SaveInput = {
  ownerId: string;
  purpose: Purpose;
  mimeType: string;
  originalName: string;
  body: ReadableStream<Uint8Array> | Buffer;
  productId?: string | null;
  meta?: { width?: number; height?: number; durationSec?: number };
};

/** Server-side save (used by local uploads and seeding). Validates type and size by purpose. */
export async function saveMedia(input: SaveInput) {
  if (!features.blob && process.env.VERCEL === "1") {
    throw new UploadError("Uploads need file storage. In your Vercel project, open Storage, add a Blob store, connect it, then redeploy.");
  }
  const rule = PURPOSES[input.purpose];
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (!rule.types.includes(mime)) throw new UploadError(`That file type isn't allowed for a ${rule.label}.`);
  const maxBytes = rule.maxMB * 1024 * 1024;
  const id = randomToken(12);
  const name = safeName(input.originalName);
  const key = `${new Date().toISOString().slice(0, 7)}/${input.ownerId}/${id}-${name}`;

  let storage: "LOCAL" | "BLOB" = "LOCAL";
  let url: string | null = null;
  let size = 0;
  if (features.blob) {
    const buf = Buffer.isBuffer(input.body) ? input.body : Buffer.from(await new Response(input.body).arrayBuffer());
    if (buf.length > maxBytes) throw new UploadError(`Files for a ${rule.label} can be up to ${rule.maxMB} MB.`);
    const res = await put(`u/${key}`, buf, { access: rule.visibility === "PUBLIC" ? "public" : "private", contentType: mime, token: env.blobToken });
    storage = "BLOB";
    url = res.url;
    size = buf.length;
  } else {
    try {
      size = await writeLocal(key, input.body, maxBytes);
    } catch (e) {
      if (e instanceof TooLarge) throw new UploadError(`Files for a ${rule.label} can be up to ${rule.maxMB} MB.`);
      throw e;
    }
  }
  return db.media.create({
    data: {
      ownerId: input.ownerId,
      kind: kindFor(mime),
      storage,
      key: storage === "BLOB" ? `u/${key}` : key,
      url,
      mimeType: mime,
      sizeBytes: size,
      originalName: name,
      visibility: rule.visibility,
      productId: input.productId ?? null,
      purpose: input.purpose,
      width: input.meta?.width,
      height: input.meta?.height,
      durationSec: input.meta?.durationSec,
    },
  });
}

export class UploadError extends Error {}

/** Opens a locally stored file, optionally a byte range of it. */
export async function openLocal(key: string, range?: { start: number; end: number }) {
  const p = localPath(key);
  const stat = await fs.promises.stat(p);
  const stream = fs.createReadStream(p, range ? { start: range.start, end: range.end } : undefined);
  return { size: stat.size, stream: Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array> };
}

/** A short-lived link to a private blob. */
export async function privateBlobUrl(pathname: string) {
  const validUntil = Date.now() + 15 * 60 * 1000;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil, token: env.blobToken });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
  return presignedUrl;
}

export async function removeMedia(mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m) return;
  try {
    if (m.storage === "LOCAL") await fs.promises.rm(localPath(m.key), { force: true });
    else if (m.url) await del(m.url, { token: env.blobToken });
  } catch {
    // The row goes either way; a stray file is harmless.
  }
  await db.media.delete({ where: { id: m.id } }).catch(() => {});
}
