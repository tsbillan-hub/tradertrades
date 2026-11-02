"use server";

import { z } from "zod";
import { emailRule, fail, invalid, success, type ActionState } from "@/lib/forms";
import { env } from "@/lib/env";
import { SUPPORT_TOPICS } from "@/lib/constants";
import { getViewer } from "@/server/dal";
import { requestMeta } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";

export async function contactSupport(_: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Add your name").max(80),
      email: emailRule,
      topic: z.enum(SUPPORT_TOPICS, { error: "Pick a topic" }),
      message: z.string().trim().min(20, "Tell us a bit more (at least 20 characters)").max(5000),
      website: z.string().max(0).optional(), // hidden trap field for bots
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { ip } = await requestMeta();
  const rl = await rateLimit(`support:${viewer?.id ?? ip}`, 5, 3600);
  if (!rl.ok) return fail("You've sent a few messages already. We'll reply to those first.", formData);
  const d = parsed.data;
  await sendEmail(
    env.supportEmail,
    emails.generic({
      subject: `[Help] ${d.topic}: ${d.name}`,
      heading: d.topic,
      body: d.message.split(/\n{2,}/),
      rows: [
        ["From", `${d.name} <${d.email}>`],
        ["Account", viewer ? `@${viewer.username}` : "Not signed in"],
      ],
    }),
    { template: "support-message", userId: null, replyTo: d.email },
  );
  return success("Thanks. We read every message and usually reply within 2 working days.");
}
