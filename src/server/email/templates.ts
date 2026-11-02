import "server-only";
import { absoluteUrl } from "@/lib/env";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type EmailContent = { subject: string; html: string; text: string };

type LayoutInput = {
  subject: string;
  preheader?: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  rows?: [string, string][];
  footnote?: string;
};

/** Plain, readable email in the TraderTrades colours. Paragraphs are plain text and get escaped. */
export function layout(input: LayoutInput): EmailContent {
  const { subject, preheader, heading, paragraphs, cta, rows, footnote } = input;
  const rowsHtml = rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #E3D9C6">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid #E3D9C6;color:#6B6357;font-size:14px">${esc(k)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #E3D9C6;color:#16130F;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F6F1E7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#16130F">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader ?? heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px 4px;font-weight:900;font-size:18px;letter-spacing:-0.02em">TraderTrades</td></tr>
<tr><td style="background:#FFFDF8;border:1px solid #E3D9C6;border-radius:12px;padding:28px">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.25;letter-spacing:-0.02em">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;color:#3B352D">${esc(p)}</p>`).join("")}
${rowsHtml}
${cta ? `<p style="margin:20px 0 4px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#16130F;color:#F6F1E7;text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:8px">${esc(cta.label)}</a></p><p style="margin:12px 0 0 0;font-size:12px;color:#968C7A;word-break:break-all">Or open this link: ${esc(cta.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:#968C7A">${esc(footnote ?? "You're getting this email because of your TraderTrades account.")} <a href="${esc(absoluteUrl("/settings/notifications"))}" style="color:#6B6357">Email settings</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    heading,
    "",
    ...paragraphs,
    ...(rows?.map(([k, v]) => `${k}: ${v}`) ?? []),
    cta ? `\n${cta.label}: ${cta.url}` : "",
    "",
    footnote ?? "",
  ].join("\n");
  return { subject, html, text };
}

export const emails = {
  verifyEmail(name: string, url: string) {
    return layout({
      subject: "Confirm your email",
      heading: `Confirm your email, ${name}`,
      paragraphs: ["Tap the button to confirm this is your email. The link works for 48 hours."],
      cta: { label: "Confirm email", url },
      footnote: "If you didn't make a TraderTrades account, you can ignore this email.",
    });
  },
  resetPassword(name: string, url: string) {
    return layout({
      subject: "Reset your password",
      heading: "Reset your password",
      paragraphs: [`Hi ${name}, someone asked to reset the password on your account. The link works for 1 hour.`],
      cta: { label: "Choose a new password", url },
      footnote: "If this wasn't you, ignore this email. Your password stays the same.",
    });
  },
  changeEmail(name: string, url: string, newEmail: string) {
    return layout({
      subject: "Confirm your new email",
      heading: "Confirm your new email",
      paragraphs: [`Hi ${name}, confirm that ${newEmail} should be the email on your TraderTrades account.`],
      cta: { label: "Confirm new email", url },
    });
  },
  emailChanged(name: string, newEmail: string) {
    return layout({
      subject: "Your email was changed",
      heading: "Your account email changed",
      paragraphs: [
        `Hi ${name}, the email on your TraderTrades account is now ${newEmail}.`,
        "If you didn't do this, reset your password straight away and reply to this email.",
      ],
    });
  },
  passwordChanged(name: string) {
    return layout({
      subject: "Your password was changed",
      heading: "Your password was changed",
      paragraphs: [`Hi ${name}, your password was just changed and other devices were signed out.`, "If this wasn't you, reset your password now."],
      cta: { label: "Reset password", url: absoluteUrl("/forgot-password") },
    });
  },
  workEmailCode(name: string, company: string, code: string) {
    return layout({
      subject: `${code} is your TraderTrades code`,
      heading: "Confirm your work email",
      paragraphs: [`Hi ${name}, enter this code to confirm you work at ${company}:`, code, "The code works for 24 hours."],
    });
  },
  generic(input: { subject: string; heading: string; body: string[]; cta?: { label: string; url: string }; rows?: [string, string][] }) {
    return layout({ subject: input.subject, heading: input.heading, paragraphs: input.body, cta: input.cta, rows: input.rows });
  },
};
