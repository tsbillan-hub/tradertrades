import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function secret() {
  if (!env.appSecret) throw new Error("APP_SECRET is not set. Add it to your hosting settings and redeploy.");
  return env.appSecret;
}

export function hmac(input: string) {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function key() {
  return createHash("sha256").update(`enc:${secret()}`).digest();
}

/** AES-256-GCM. Used for secrets we must read back later, like 2FA seeds. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(payload: string) {
  const [v, ivS, tagS, encS] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown cipher version");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivS, "base64url"));
  decipher.setAuthTag(Buffer.from(tagS, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encS, "base64url")), decipher.final()]).toString("utf8");
}

/** Short human code like "K7Q2-M9XD". No 0/O/1/I to avoid mix ups. */
export function humanCode(groups = 2, size = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(groups * size);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  const out: string[] = [];
  for (let g = 0; g < groups; g++) out.push(chars.slice(g * size, g * size + size).join(""));
  return out.join("-");
}
