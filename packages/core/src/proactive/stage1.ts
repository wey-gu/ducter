// Stage 1 (D165 §10): rules in code, no model. Mailing lists, no-reply senders and bulk
// categories are left out (they make the 没说的 / Left out line); what the person sent is kept for
// the ledger only (who they asked, what they promised); senders they muted never go further.
// Calendar events skip triage: they are facts already.
//
// D243: a service's own notice is how a maintenance window, a billing change, a booking, a
// security alert or a job that keeps failing reaches anyone. Leaving every bulk mail out (hel,
// 2026-11-13: 114 of 129 mails) left out exactly what dots said that day. A no-reply or list mail
// whose subject or sender says it may be one of those goes to triage, up to `noticeRoom` a day;
// marketing (Gmail's Promotions) and the rest stay left out.
import type { Item } from "./items.ts";

export interface Left {
  notices: number; // notices and receipts the subject says all of
  promo: number; // looks like marketing
  muted: number; // senders the person said not to tell them about
}

export interface Stage1 {
  /** For triage: mail, GitHub and chat that might need the person (D243: service notices too). */
  pass: Item[];
  /** The person's own sends (for commitments and "you're waiting on someone"). */
  sent: Item[];
  /** Calendar events (facts already). */
  events: Item[];
  left: Left;
  /** D243: service notices passed to triage (counted against the day's room). */
  notices: number;
}

/** D243: service notices read closely in a day, at most (the rest are counted in Left out). */
export const NOTICE_DAY_MAX = 60;

/** GitHub reasons that are a person asking for the person; the rest GitHub already tells them. */
const GITHUB_PEOPLE = new Set(["review_requested", "mention", "team_mention", "assign", "author", "comment", "manual"]);

export function stage1(items: Item[], ctx: { mutedSenders?: string[]; noticeRoom?: number } = {}): Stage1 {
  const out: Stage1 = { pass: [], sent: [], events: [], left: { notices: 0, promo: 0, muted: 0 }, notices: 0 };
  const muted = new Set((ctx.mutedSenders ?? []).map((s) => s.toLowerCase()));
  let room = ctx.noticeRoom ?? NOTICE_DAY_MAX;
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
      if (!it.promo && room > 0 && noticeWorthy(it)) {
        room--;
        out.notices++;
        out.pass.push(it);
        continue;
      }
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

/**
 * D243: the words a service's notice that may need the person is mailed under, besides
 * FACTY_TERMS: maintenance and outages, failing jobs, security alerts, billing changes,
 * shutdowns, deliveries and boarding. Matched on the subject and the sender's name.
 */
export const NOTICE_TERMS = [
  "maintenance", "scheduled", "downtime", "outage", "incident", "degraded", "disruption", "restart", "维护", "停机", "故障", "中断",
  "security", "sign-in", "new login", "password", "suspicious", "安全", "登录", "密码", "异常",
  "billing", "charge", "charging", "usage", "quota", "limit", "exceed", "free tier", "overage", "pricing", "计费", "收费", "用量", "额度", "超出", "欠费",
  "shutdown", "shutting down", "sunset", "discontinu", "deprecat", "end of life", "action required", "停止服务", "停服", "下线", "关停", "弃用",
  "failed", "failing", "failure", "alert", "is down", "失败", "报警", "告警",
  "delivery", "arriving", "派送", "送达", "签收", "gate", "terminal", "登机", "值机",
];
/** A receipt says it all in its subject (D165): its words alone never pass a notice. */
const RECEIPT_ONLY = new Set(["receipt", "收据", "payment", "付款", "支付", "charged", "扣款"]);
const NOTICE = new RegExp(`(${["check-?in", "expir", ...[...FACTY_TERMS, ...NOTICE_TERMS].filter((w) => w !== "check-in" && !w.startsWith("expir") && !RECEIPT_ONLY.has(w))].join("|")})`, "i");

/** D243: a bulk or no-reply mail that may be a notice the person needs (it goes to triage). */
export function noticeWorthy(it: Item): boolean {
  return it.kind === "mail" && NOTICE.test(`${it.subject ?? ""} ${it.fromName ?? ""}`);
}
