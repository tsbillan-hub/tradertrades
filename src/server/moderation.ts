import "server-only";
import type { ReportTarget } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

type Rule = { id: string; label: string; severity: "block" | "warn"; pattern: RegExp };

/**
 * The claims checker. "block" rules stop a save with an explanation.
 * "warn" rules let it through but flag it for a person to look at.
 */
export const RULES: Rule[] = [
  { id: "guarantee", label: "Guaranteed profits or results", severity: "block", pattern: /\bguarantee(?:d|s)?\b.{0,40}\b(?:profits?|returns?|income|wins?|results?|money|payouts?|pass(?:ing)?|success)\b/i },
  { id: "risk_free", label: "\"Risk free\" trading", severity: "block", pattern: /\brisk[\s-]?free\b/i },
  { id: "cant_lose", label: "Claims you can't lose", severity: "block", pattern: /\b(?:can'?t|cannot|never|won'?t)\s+lose\b/i },
  { id: "perfect_record", label: "100% win rate claims", severity: "block", pattern: /\b100\s?%\s*(?:win|accura|success|profitable)/i },
  { id: "challenge_passing", label: "Passing prop firm challenges for someone else", severity: "block", pattern: /\b(?:(?:we|i)(?:'ll| will)?\s+pass\s+(?:your|the|any)\s+(?:challenge|evaluation|eval|combine)s?|(?:challenge|evaluation|eval|combine)\s+pass(?:ing)?\s+service|pass(?:ing)?\s+service)\b/i },
  { id: "account_management", label: "Account management", severity: "block", pattern: /\b(?:account\s+management|managed\s+accounts?|(?:we|i)\s+(?:will\s+)?trade\s+(?:your\s+account|for\s+you))\b/i },
  { id: "copy_trading", label: "Selling copy trading", severity: "block", pattern: /\b(?:copy\s+(?:my|our)\s+trades|copy[\s-]?trading\s+(?:service|subscription|signals?|access)|auto[\s-]?(?:copy|execut\w*)\b.{0,40}\b(?:your|into\s+your)\s+(?:account|broker))\b/i },
  { id: "profit_sharing", label: "Profit sharing", severity: "block", pattern: /\b(?:profit[\s-]?shar(?:e|ing)|(?:split|share)\s+(?:the\s+|your\s+|my\s+)?profits)\b/i },
  { id: "income_claim", label: "Income claims", severity: "warn", pattern: /(?:\b(?:make|made|earn|earned|making|earning)\s+\$?\d[\d,.]*\s*k?\s*(?:\/|per|a|an|every)\s*(?:day|week|month|hour)\b|\$\d[\d,.]*k?\s*(?:\/|per|a)\s*(?:day|week|month)\b)/i },
  { id: "win_rate", label: "Win rate numbers", severity: "warn", pattern: /\b\d{2,3}(?:\.\d)?\s?%\s*(?:win\s*rate|accuracy|winning|strike\s*rate)\b/i },
  { id: "get_rich", label: "Get rich promises", severity: "warn", pattern: /\b(?:get\s+rich|financial\s+freedom\s+in|quit\s+your\s+(?:9\s*-?\s*5|job)|life[\s-]changing\s+money|passive\s+income)\b/i },
  { id: "double_account", label: "Account multiplying claims", severity: "warn", pattern: /\b(?:double|triple|10x|100x)\s+(?:your\s+)?(?:account|money|capital)\b/i },
  { id: "no_losses", label: "\"No losses\" claims", severity: "warn", pattern: /\bno\s+los(?:s|ses|ing\s+(?:days|weeks|trades))\b/i },
];

const NEGATION = /\b(?:no|not|never|don'?t|doesn'?t|isn'?t|aren'?t|won'?t|without|zero|banned|ban|nothing|avoid)\b[^.!?\n]{0,30}$/i;

export type Hit = { rule: Rule; excerpt: string; negated: boolean };

export function scanText(text: string): Hit[] {
  const hits: Hit[] = [];
  if (!text) return hits;
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      const negated = NEGATION.test(before);
      const start = Math.max(0, m.index - 40);
      const excerpt = `${start > 0 ? "…" : ""}${text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim()}…`;
      hits.push({ rule, excerpt, negated });
      if (m[0].length === 0) re.lastIndex++;
      break;
    }
  }
  return hits;
}

/**
 * Checks text before it is saved. Blocking rules stop the save (unless the sentence is clearly saying the
 * opposite, like "we never offer account management"). Warning rules create a flag for admins.
 */
export async function checkText(text: string, target?: { type: ReportTarget; id: string } | null, opts: { block?: boolean } = {}) {
  const hits = scanText(text);
  // Buyers' reviews may quote a seller's claims, so for them every hit is only flagged for a person to look at.
  const canBlock = opts.block !== false;
  const blocking = canBlock ? hits.filter((h) => h.rule.severity === "block" && !h.negated) : [];
  if (blocking.length) {
    const labels = [...new Set(blocking.map((b) => b.rule.label.toLowerCase()))].join(", ");
    return {
      blocked: true as const,
      hits,
      message: `This can't be posted because it looks like ${labels}. TraderTrades doesn't allow that. Reword it and try again, or contact support if we got it wrong.`,
    };
  }
  const flags = canBlock ? hits.filter((h) => h.rule.severity === "warn" || h.negated) : hits;
  if (target && flags.length) {
    await db.moderationFlag.createMany({
      data: flags.map((f) => ({
        targetType: target.type,
        targetId: target.id,
        rule: f.rule.id,
        severity: f.rule.severity === "block" ? "high" : "medium",
        excerpt: f.excerpt.slice(0, 500),
      })),
    });
  }
  return { blocked: false as const, hits, message: "" };
}
