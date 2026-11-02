import "server-only";
import { db } from "@/lib/db";
import { mediaUrl } from "@/server/storage";

export async function mediaUrlById(id: string | null | undefined) {
  if (!id) return null;
  const m = await db.media.findUnique({ where: { id } });
  return m ? mediaUrl(m) : null;
}
