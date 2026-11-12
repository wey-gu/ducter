// Stage 1 (D165 §10): rules in code, no model. Mailing lists, no-reply senders and bulk
// categories are left out (they make the 没说的 / Left out line); what the person sent is kept for
// the ledger only (who they asked, what they promised); senders they muted never go further.
// Calendar events skip triage: they are facts already.
import type { Item } from "./items.ts";

export interface Left {
  notices: number; // notices and receipts the subject says all of
  promo: number; // looks like marketing
  muted: number; // senders the person said not to tell them about
}

export interface Stage1 {
  /** For triage: mail, GitHub and chat that might need the person. */
  pass: Item[];
  /** The person's own sends (for commitments and "you're waiting on someone"). */
  sent: Item[];
  /** Calendar events (facts already). */
  events: Item[];
  left: Left;
}

/** GitHub reasons that are a person asking for the person; the rest GitHub already tells them. */
const GITHUB_PEOPLE = new Set(["review_requested", "mention", "team_mention", "assign", "author", "comment", "manual"]);

export function stage1(items: Item[], ctx: { mutedSenders?: string[] } = {}): Stage1 {
  const out: Stage1 = { pass: [], sent: [], events: [], left: { notices: 0, promo: 0, muted: 0 } };
  const muted = new Set((ctx.mutedSenders ?? []).map((s) => s.toLowerCase()));
  for (const it of items) {
    if (it.kind === "event") {
      out.events.push(it);
      continue;
    }
    if (it.out) {
      out.sent.push(it);
      continue;
    }
    if (it.from && (muted.has(it.from) || muted.has(it.from.split("@")[1] ?? "") || (it.fromName && muted.has(it.fromName.toLowerCase())))) {
      out.left.muted++;
      continue;
    }
    if (it.kind === "mail" && (it.promo || it.bulk)) {
      if (it.promo) out.left.promo++;
      else out.left.notices++;
      continue;
    }
    if (it.kind === "github" && !GITHUB_PEOPLE.has(it.reason ?? "")) {
      out.left.notices++;
      continue;
    }
    if (it.kind === "chat" && !it.mention && !it.dm) continue;
    out.pass.push(it);
  }
  return out;
}

/**
 * The quiet 60-day look back (D165 call 5) reads only what may hold a booking, a renewal, a
 * payment or a promise: subjects that say so, and the person's own sends from the last 14 days.
 * Everything else costs a model call for nothing.
 */
/** The words a booking, a renewal, a payment or a promise is mailed under (the long look back's filter). */
export const FACTY_TERMS = [
  "flight", "航班", "机票", "boarding", "itinerary", "行程", "hotel", "酒店", "住宿", "booking", "reservation", "预订", "预定", "check-in", "入住", "train", "火车", "高铁",
  "renew", "renewal", "续费", "续订", "expire", "expiring", "到期", "过期", "invoice", "发票", "账单", "bill", "receipt", "收据", "payment", "付款", "支付", "charged", "扣款",
  "subscription", "订阅", "trial", "试用", "price", "涨价", "due", "截止", "deadline", "cancel", "cancelled", "取消", "changed", "变更", "改签", "confirmation", "confirmed", "确认", "appointment", "预约",
];
const FACTY = new RegExp(`(${["check-?in", "expir", ...FACTY_TERMS.filter((w) => w !== "check-in" && !w.startsWith("expir"))].join("|")})`, "i");

export function backfillWorthy(it: Item, now: number): boolean {
  if (it.kind !== "mail") return false;
  if (it.out) return now - it.at <= 14 * 86_400_000;
  return FACTY.test(`${it.subject ?? ""} ${it.fromName ?? ""}`);
}
