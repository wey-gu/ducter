// The ten kinds (D165 §4; coming_up, service and update, and money changing: D243), found by code over the facts ledger. A detector proposes; the bar
// (judge.ts) decides what is said. Each candidate carries its evidence (怎么知道的 / How I know:
// the facts' labels and dates), its one next step, and plain words in both languages, two
// sentences at most (zh ≤ ~60 characters).
import type { FindHow, FindKind } from "@ducter/protocol";
import type { Candidate } from "./candidate.ts";
import type { Fact, Ledger } from "./ledger.ts";
import { FLIGHT_NO, type BillingWhat } from "./triage.ts";

export type { Candidate, StepKind } from "./candidate.ts";

const DAY = 86_400_000;

export interface DetectCtx {
  now: number;
  zone: string;
  /** Which kinds to look for (all, unless the first look asks for one). */
  kinds?: FindKind[];
  /** D243: finds already said (an update to one of them is a find of its own). */
  said?: SaidFind[];
}

/** D243: a find already said, as the update detector needs it. */
export interface SaidFind {
  findId: string;
  kind: FindKind;
  topic?: string;
  text: string;
  at: number;
  facts: string[];
  passed?: boolean;
}

// ---------- dates in the person's zone ----------

const FMT = new Map<string, Intl.DateTimeFormat>();

const parts = (ms: number, zone: string) => {
  let f = FMT.get(zone);
  if (!f) FMT.set(zone, (f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })));
  const p = f.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), min: g("minute"), wd: g("weekday") };
};
export const dayKey = (ms: number, zone: string) => {
  const p = parts(ms, zone);
  return `${p.y}-${p.m}-${p.d}`;
};
const dayIndex = (ms: number, zone: string) => Math.round(Date.parse(`${dayKey(ms, zone)}T00:00:00Z`) / DAY);
/**
 * A date's own day and time: as written when it says where it happens ("2026-11-16", or
 * "…T21:40:00+09:00", Tokyo's evening), else in the person's zone. A flight lands at 21:40 local.
 */
function local(iso: string, zone: string): { y: string; m: string; d: string; h: string; min: string } {
  const lit = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::\d\d(?:\.\d+)?)?([+-]\d\d:\d\d))?$/.exec(iso.trim());
  if (lit) return { y: lit[1]!, m: lit[2]!, d: lit[3]!, h: lit[4] ?? "00", min: lit[5] ?? "00" };
  return parts(Date.parse(iso), zone);
}
const dayIndexOf = (iso: string, zone: string) => {
  const p = local(iso, zone);
  return Math.round(Date.parse(`${p.y}-${p.m}-${p.d}T00:00:00Z`) / DAY);
};
/** Whole days from today to that day (0 = today, 1 = tomorrow, -1 = yesterday). */
export const daysUntil = (iso: string, now: number, zone: string) => dayIndexOf(iso, zone) - dayIndex(now, zone);
/** "11/21" */
export const md = (iso: string, zone: string) => {
  const p = local(iso, zone);
  return `${Number(p.m)}/${Number(p.d)}`;
};
/** "21:40" */
export const hm = (iso: string, zone: string) => {
  const p = local(iso, zone);
  return `${p.h}:${p.min}`;
};
const hasTime = (iso: string) => /T\d\d:\d\d/.test(iso);

/** Working days (Mon–Fri) passed since `from`, in the zone. */
export function workingDaysSince(from: number, now: number, zone: string): number {
  let n = 0;
  for (let i = dayIndex(from, zone) + 1; i <= dayIndex(now, zone); i++) {
    const wd = new Date(i * DAY).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

const nameOf = (addr: string, name?: string) => name?.split(/\s+/)[0] || addr.split("@")[0] || addr;
const howOf = (f: Fact): FindHow => ({ what: f.label || f.type, at: f.at });
const sameName = (a: string, b: string) => {
  const words = (x: string) => new Set(x.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length >= 4));
  const A = words(a);
  return [...words(b)].some((w) => A.has(w));
};

// ---------- the detectors ----------

function mismatches(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  const bookings = facts.filter((f): f is Extract<Fact, { type: "booking" }> => f.type === "booking");
  const flights = bookings.filter((b) => b.what === "flight" && b.end);
  const hotels = bookings.filter((b) => b.what === "hotel");
  for (const fl of flights) {
    const arrive = fl.end!;
    const aIdx = daysUntil(arrive, c.now, c.zone);
    if (aIdx < 0) continue;
    // Late arrival (after 18:00) whose night no hotel covers, and a hotel that starts the next day.
    const covered = hotels.some((h) => daysUntil(h.start, c.now, c.zone) <= aIdx && (h.end ? daysUntil(h.end, c.now, c.zone) > aIdx : false));
    const next = hotels.find((h) => daysUntil(h.start, c.now, c.zone) === aIdx + 1);
    if (!covered && next) {
      const zh = `${md(arrive, c.zone)} 的 ${fl.name} 晚上 ${hm(arrive, c.zone)} 到${fl.place ?? ""}，${next.name || "酒店"}却是 ${md(next.start, c.zone)} 才入住，那晚还没地方住。`;
      const en = `${fl.name} lands${fl.place ? ` at ${fl.place}` : ""} at ${hm(arrive, c.zone)} on ${md(arrive, c.zone)}, but ${next.name || "the hotel"} starts ${md(next.start, c.zone)}: nowhere to stay that night.`;
      out.push({
        key: `mismatch:${fl.id}:${next.id}`,
        kind: "mismatch",
        cost: 85,
        urgent: aIdx <= 1,
        dueAt: arrive,
        ...(next.label ? { sender: next.label.split(" · ")[0] } : {}),
        people: [],
        how: [howOf(fl), howOf(next)],
        words: { zh, en },
        step: {
          kind: "lookup",
          goLabel: { zh: "看看能不能提前", en: "See if it can start earlier" },
          brief: `Look up whether the hotel can start on ${dayKey(Date.parse(arrive), c.zone)} (the night the flight lands, ${hm(arrive, c.zone)}), and two nearby places for that one night, with prices. Read only: book nothing, pay nothing, sign up for nothing; the person decides. Report in two or three lines.`,
          data: { hotel: next.name || "", flight: fl.name, ...(fl.place ? { lands_at: fl.place } : {}), hotel_mail: next.label, flight_mail: fl.label },
          needs: { browse: true },
        },
        facts: [fl.id, next.id],
      });
    }
  }
  // A meeting while they are in the air.
  const meetings = facts.filter((f): f is Extract<Fact, { type: "meeting" }> => f.type === "meeting");
  for (const fl of flights) {
    const s = Date.parse(fl.start);
    const e = Date.parse(fl.end!);
    for (const m of meetings) {
      const t = Date.parse(m.start);
      if (t >= s && t < e && t > c.now) {
        out.push({
          key: `mismatch:${fl.id}:${m.id}`,
          kind: "mismatch",
          cost: 70,
          urgent: daysUntil(m.start, c.now, c.zone) <= 1,
          dueAt: m.start,
          people: m.with,
          how: [howOf(fl), howOf(m)],
          words: { zh: `${md(m.start, c.zone)} ${hm(m.start, c.zone)} 的「${m.title}」那会儿你在 ${fl.name} 上。`, en: `"${m.title}" at ${hm(m.start, c.zone)} on ${md(m.start, c.zone)} is while you're on ${fl.name}.` },
          facts: [fl.id, m.id],
        });
      }
    }
  }
  // D226: the calendar and a confirmation disagree on the day (a talk on the 18th in the calendar,
  // the organizer's mail says the 19th): what dots caught for its first users. A booking that names
  // the same thing as a coming meeting, on another day, within two weeks.
  for (const b of bookings) {
    if (b.what === "flight") continue;
    const bIdx = daysUntil(b.start, c.now, c.zone);
    if (bIdx < 0 || bIdx > 14 || !b.name) continue;
    for (const m of meetings) {
      const mIdx = daysUntil(m.start, c.now, c.zone);
      if (mIdx < 0 || mIdx > 14 || mIdx === bIdx || !sameName(m.title, b.name)) continue;
      const first = Math.min(bIdx, mIdx);
      const sender = b.label.split(" · ")[0] || "";
      out.push({
        key: `mismatch:${b.id}:${m.id}`,
        kind: "mismatch",
        cost: first <= 1 ? 85 : 72,
        urgent: first <= 1,
        dueAt: mIdx < bIdx ? m.start : b.start,
        ...(sender ? { sender } : {}),
        people: m.with,
        how: [howOf(m), howOf(b)],
        words: {
          zh: `日历上「${m.title}」是 ${md(m.start, c.zone)}，${sender ? `${sender} 的` : ""}确认信写的是 ${md(b.start, c.zone)}。`,
          en: `Your calendar has "${m.title}" on ${md(m.start, c.zone)}, but the confirmation${sender ? ` from ${sender}` : ""} says ${md(b.start, c.zone)}.`,
        },
        step: {
          kind: "read",
          goLabel: { zh: "核对哪个对", en: "Check which is right" },
          brief: `The person's calendar and a confirmation mail disagree on the day of the same thing (below): the calendar says ${dayKey(Date.parse(m.start), c.zone)}, the mail ${dayKey(Date.parse(b.start), c.zone)}. Read the mail and the event and say in two lines which date is right and why. Read only: move nothing, reply to nothing.`,
          data: { event: m.title, mail: b.label },
        },
        facts: [b.id, m.id],
      });
    }
  }
  // D222: two meetings at the same time, today or tomorrow, often in two accounts that can't see
  // each other (a work calendar and a personal one). One event in both calendars is not a clash.
  const soon = meetings.filter((m) => m.end && Date.parse(m.start) > c.now && daysUntil(m.start, c.now, c.zone) <= 1).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 0; i < soon.length; i++)
    for (let j = i + 1; j < soon.length; j++) {
      const a = soon[i]!;
      const b = soon[j]!;
      if (Date.parse(b.start) >= Date.parse(a.end!)) break;
      if (a.title === b.title && a.start === b.start && a.end === b.end) continue;
      const d = daysUntil(b.start, c.now, c.zone);
      const dayZh = d === 0 ? "今天" : "明天";
      const dayEn = d === 0 ? "today" : "tomorrow";
      out.push({
        key: `clash:${[a.id, b.id].sort().join(":")}`,
        kind: "mismatch",
        cost: d === 0 ? 75 : 65,
        urgent: d === 0,
        dueAt: b.start,
        people: [...new Set([...a.with, ...b.with])].slice(0, 6),
        how: [howOf(a), howOf(b)],
        words: { zh: `${dayZh} ${hm(b.start, c.zone)}「${a.title}」和「${b.title}」撞了。`, en: `"${a.title}" and "${b.title}" overlap ${dayEn} at ${hm(b.start, c.zone)}.` },
        facts: [a.id, b.id],
      });
    }
  return out;
}

function deadlines(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  const payments = facts.filter((f): f is Extract<Fact, { type: "payment" }> => f.type === "payment");
  for (const r of facts.filter((f): f is Extract<Fact, { type: "renewal" }> => f.type === "renewal")) {
    const d = daysUntil(r.due, c.now, c.zone);
    if (d < 0 || d > 7) continue;
    const paid = payments.some((p) => Date.parse(p.at) >= Date.parse(r.at) && (sameName(p.name, r.name) || p.label.split(" · ")[0] === r.label.split(" · ")[0]));
    if (paid) continue;
    const amt = r.amount ? `（${r.amount}）` : "";
    const extraZh = r.cardExpired ? "自动续费那张卡已经过期了。" : r.autopay ? "" : "之后没有付款收据。";
    const extraEn = r.cardExpired ? " The card on file has expired." : r.autopay ? "" : " No receipt since.";
    out.push({
      key: `deadline:${r.id}`,
      kind: "deadline",
      cost: Math.min(95, 55 + (7 - d) * 4 + (r.cardExpired ? 20 : 0) + (r.autopay && !r.cardExpired ? -20 : 0)),
      urgent: d <= 1 && !(r.autopay && !r.cardExpired),
      dueAt: r.due,
      sender: r.label.split(" · ")[0],
      people: [],
      how: [howOf(r)],
      words: { zh: `${r.name} ${md(r.due, c.zone)} 到期${amt}。${extraZh}`, en: `${r.name} is due ${md(r.due, c.zone)}${r.amount ? ` (${r.amount})` : ""}.${extraEn}` },
      step: {
        kind: "lookup",
        goLabel: { zh: "打开续费页", en: "Open the renewal page" },
        brief: `Open the renewal or billing page for the service below in Ducter's browser and stop there: tell the person the price, the due date (${dayKey(Date.parse(r.due), c.zone)}) and what card is on file if it shows. Never pay, never change a setting; paying is the person's.`,
        data: { service: r.name, mail: r.label, ...(r.amount ? { amount: r.amount } : {}) },
        needs: { browse: true, signedIn: true },
      },
      facts: [r.id],
    });
  }
  return out;
}

function changes(facts: Fact[], c: DetectCtx): Candidate[] {
  return facts
    .filter((f): f is Extract<Fact, { type: "change" }> => f.type === "change" && daysUntil(f.on, c.now, c.zone) >= 0)
    .map((f) => {
      const d = daysUntil(f.on, c.now, c.zone);
      const cancelled = f.what === "flight_cancelled";
      const when = hasTime(f.on) ? `${md(f.on, c.zone)} ${hm(f.on, c.zone)}` : md(f.on, c.zone);
      return {
        key: `plan:${f.id}`,
        kind: "plan_changed" as const,
        cost: d <= 1 ? 90 : 70,
        urgent: d <= 1,
        dueAt: f.on,
        sender: f.label.split(" · ")[0],
        people: [],
        how: [howOf(f)],
        words: cancelled ? { zh: `${f.name}（${md(f.on, c.zone)}）取消了。`, en: `${f.name} on ${md(f.on, c.zone)} was cancelled.` } : { zh: `${f.name} 改了：现在是 ${when}。`, en: `${f.name} changed: now ${when}.` },
        step: { kind: "lookup" as const, goLabel: { zh: "看看有什么选择", en: "Look up options" }, brief: `The plan below ${cancelled ? "was cancelled" : "changed"}. Look up the options (rebooking, the next one, refunds) and what each costs. Read only: change nothing, book nothing; the person decides.`, data: { plan: f.name, mail: f.label }, needs: { browse: true } },
        facts: [f.id],
      };
    });
}

function waitingOnYou(facts: Fact[], c: DetectCtx): Candidate[] {
  const replies = facts.filter((f): f is Extract<Fact, { type: "reply" }> => f.type === "reply" && f.out);
  const asks = facts.filter((f): f is Extract<Fact, { type: "ask_in" }> => f.type === "ask_in" && f.person);
  const byThread = new Map<string, Extract<Fact, { type: "ask_in" }>[]>();
  for (const a of asks) byThread.set(`${a.ref.connectionId}|${a.ref.thread ?? a.ref.id}`, [...(byThread.get(`${a.ref.connectionId}|${a.ref.thread ?? a.ref.id}`) ?? []), a]);
  const out: Candidate[] = [];
  for (const [k, list] of byThread) {
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const first = list[0]!;
    const last = list.at(-1)!;
    const answered = replies.some((r) => Date.parse(r.at) > Date.parse(last.at) && ((r.ref.thread && r.ref.thread === last.ref.thread) || r.with.toLowerCase() === last.from.toLowerCase()));
    if (answered) continue;
    const again = list.length > 1 || list.some((a) => a.again);
    const days = workingDaysSince(Date.parse(first.at), c.now, c.zone);
    if (days < 2 && !again) continue;
    const who = nameOf(first.from, first.name);
    const gh = first.ref.service === "github";
    const ago = daysUntil(first.at, c.now, c.zone);
    const whenZh = ago >= 0 ? "今天" : ago === -1 ? "昨天" : `${-ago} 天前`;
    const zh = `${who} ${whenZh}问你${first.what ? `「${first.what}」` : "一件事"}${again ? `，${daysUntil(last.at, c.now, c.zone) === 0 ? "今天" : ""}又问了一次。` : `，还没回。`}`;
    const en = `${who} asked you${first.what ? ` "${first.what}"` : " something"} ${ago >= 0 ? "today" : ago === -1 ? "yesterday" : `${-ago} days ago`}${again ? ", and asked again." : ", not answered yet."}`;
    out.push({
      key: `wait_you:${k}:${list.length}`,
      kind: "waiting_on_you",
      cost: Math.min(90, 50 + (again ? 15 : 0) + days * 5),
      // D232: urgent by what waiting costs, not by kind: a person who asked again, or has waited
      // three working days, is said in 只说急的 too.
      urgent: again || days >= 3,
      sender: who,
      people: [first.from.toLowerCase()],
      how: list.map(howOf).slice(-3),
      words: { zh, en },
      step: gh
        ? { kind: "read", goLabel: { zh: "先帮我读一遍", en: "Read it for me first" }, brief: "Someone is waiting on the person on GitHub (below). Read it (the PR or issue, its diff and discussion) and write up in a few lines what matters for the person's answer. Read only: comment nothing, approve nothing.", data: { from: who, item: first.label } }
        : { kind: "draft", goLabel: { zh: "拟个回复", en: "Draft a reply" }, brief: "Someone asked the person something (below). Read the thread and write a short reply draft in the thread's language. Show the draft whole in your report; send nothing, save nothing to the mailbox.", data: { from: who, asked: first.what, thread: first.label } },
      facts: list.map((a) => a.id),
    });
  }
  // The same person asking in two places (a mail and a GitHub review request) is one find: the
  // costlier words, the PR's read-first step, both pieces of evidence.
  const merged = new Map<string, Candidate>();
  for (const c of out.sort((a, b) => b.cost - a.cost)) {
    const k = (c.sender ?? "").toLowerCase();
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, c);
      continue;
    }
    merged.set(k, { ...prev, key: [prev.key, c.key].sort().join("+"), how: [...prev.how, ...c.how].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-3), facts: [...prev.facts, ...c.facts], people: [...new Set([...prev.people, ...c.people])], step: prev.step?.kind === "read" ? prev.step : c.step?.kind === "read" ? c.step : prev.step });
  }
  return [...merged.values()];
}

function waitingOnThem(facts: Fact[], c: DetectCtx): Candidate[] {
  const inbound = facts.filter((f): f is Extract<Fact, { type: "reply" }> => f.type === "reply" && !f.out);
  const out: Candidate[] = [];
  for (const a of facts.filter((f): f is Extract<Fact, { type: "ask_out" }> => f.type === "ask_out" && f.mattered)) {
    const answered = inbound.some((r) => Date.parse(r.at) > Date.parse(a.at) && ((r.ref.thread && r.ref.thread === a.ref.thread) || r.with.toLowerCase() === a.to.toLowerCase()));
    if (answered || workingDaysSince(Date.parse(a.at), c.now, c.zone) < 3) continue;
    const who = nameOf(a.to, a.name);
    out.push({
      key: `wait_them:${a.id}`,
      kind: "waiting_on_them",
      cost: 50,
      urgent: false,
      sender: who,
      people: [a.to.toLowerCase()],
      how: [howOf(a)],
      words: { zh: `你 ${md(a.at, c.zone)} 问 ${who}「${a.what}」，到现在没回。`, en: `You asked ${who} "${a.what}" on ${md(a.at, c.zone)}; no answer yet.` },
      step: { kind: "draft", goLabel: { zh: "拟个跟进", en: "Draft a follow-up" }, brief: `The person asked someone something on ${dayKey(Date.parse(a.at), c.zone)} (below) and has no answer. Write a short, friendly follow-up draft in the thread's language. Show it whole in your report; send nothing.`, data: { to: who, asked: a.what, thread: a.label } },
      facts: [a.id],
    });
  }
  return out;
}

function promised(facts: Fact[], c: DetectCtx): Candidate[] {
  const sent = facts.filter((f): f is Extract<Fact, { type: "reply" }> => f.type === "reply" && f.out);
  const out: Candidate[] = [];
  for (const p of facts.filter((f): f is Extract<Fact, { type: "commitment" }> => f.type === "commitment")) {
    if (daysUntil(p.by, c.now, c.zone) !== 0) continue;
    const kept = sent.some((r) => Date.parse(r.at) > Date.parse(p.at) && r.with.toLowerCase() === p.to.toLowerCase());
    if (kept) continue;
    const who = nameOf(p.to);
    out.push({
      key: `promised:${p.id}`,
      kind: "promised",
      cost: 65,
      // Due today. Said now only in 只说急的 (D232); otherwise it joins today's note.
      urgent: false,
      dueAt: p.by,
      sender: who,
      people: [p.to.toLowerCase()],
      how: [howOf(p)],
      words: { zh: `你答应 ${who} 今天${p.what ? `「${p.what}」` : "给个东西"}。`, en: `You told ${who} you'd ${p.what || "send something"} by today.` },
      step: { kind: "read", goLabel: { zh: "找找相关的东西", en: "Find what's related" }, brief: "The person promised someone something by today (below). Find the related draft, files or thread, and say in a few lines where things stand. Read only; send nothing.", data: { to: who, promised: p.what, thread: p.label } },
      facts: [p.id],
    });
  }
  return out;
}

/** Open things with each person (for meeting prep): asks both ways and promises. */
export function openWith(facts: Fact[], c: DetectCtx): Map<string, Candidate[]> {
  const map = new Map<string, Candidate[]>();
  for (const cand of [...waitingOnYou(facts, { ...c }), ...waitingOnThem(facts, c), ...promisedAny(facts, c)]) for (const p of cand.people) map.set(p, [...(map.get(p) ?? []), cand]);
  return map;
}

function promisedAny(facts: Fact[], c: DetectCtx): Candidate[] {
  // Any promise not yet due counts as open with that person (the due-morning rule is promised()).
  return facts
    .filter((f): f is Extract<Fact, { type: "commitment" }> => f.type === "commitment" && daysUntil(f.by, c.now, c.zone) >= 0)
    .map((p) => ({ key: `promise_open:${p.id}`, kind: "promised" as const, cost: 40, urgent: false, people: [p.to.toLowerCase()], how: [howOf(p)], words: { zh: `你答应过${p.what ? `「${p.what}」` : ""}（${md(p.by, c.zone)}前）`, en: `you promised "${p.what}" by ${md(p.by, c.zone)}` }, facts: [p.id] }));
}

/** 开会前 / Before a meeting: meetings starting in the next `withinMs` with someone something is open with. */
export function meetingPrep(ledger: Ledger, c: DetectCtx, withinMs = 12 * 60_000): Candidate[] {
  const facts = ledger.all();
  const open = openWith(facts, c);
  const out: Candidate[] = [];
  for (const m of ledger.of("meeting")) {
    const t = Date.parse(m.start);
    if (t <= c.now || t > c.now + withinMs) continue;
    const items = [...new Map(m.with.flatMap((p) => open.get(p.toLowerCase()) ?? []).map((x) => [x.key, x])).values()];
    if (!items.length) continue; // never for a meeting with nothing open
    const first = items[0]!;
    const names = [...new Set(items.map((x) => x.sender).filter(Boolean))].slice(0, 2).join("、");
    out.push({
      key: `meeting:${m.id}`,
      kind: "meeting",
      cost: 60,
      urgent: false,
      dueAt: m.start,
      ...(first.sender ? { sender: first.sender } : {}),
      people: m.with,
      how: [howOf(m), ...items.flatMap((x) => x.how)].slice(0, 4),
      words: {
        zh: `${hm(m.start, c.zone)}「${m.title}」${names ? `和 ${names}` : ""}：${first.words.zh.replace(/。$/, "")}${items.length > 1 ? `，还有 ${items.length - 1} 件` : ""}。`,
        en: `"${m.title}" at ${hm(m.start, c.zone)}${names ? ` with ${names}` : ""}: ${first.words.en.replace(/\.$/, "")}${items.length > 1 ? `; ${items.length - 1} more` : ""}.`,
      },
      facts: [m.id, ...items.flatMap((x) => x.facts)],
    });
  }
  return out;
}

export function detect(ledger: Ledger, c: DetectCtx): Candidate[] {
  const facts = ledger.all();
  const want = (k: FindKind) => !c.kinds || c.kinds.includes(k);
  const ups = want("update") ? updates(facts, c) : [];
  // A change that updates something already said is said as that update, not as a new plan.
  const usedByUpdate = new Set(ups.flatMap((u) => u.facts));
  return [
    ...ups,
    ...(want("mismatch") ? mismatches(facts, c) : []),
    ...(want("deadline") ? [...deadlines(facts, c), ...billing(facts, c)] : []),
    ...(want("plan_changed") ? changes(facts, c).filter((x) => !x.facts.some((id) => usedByUpdate.has(id))) : []),
    ...(want("coming_up") ? comingUp(facts, c) : []),
    ...(want("service") ? services(facts, c) : []),
    ...(want("waiting_on_you") ? waitingOnYou(facts, c) : []),
    ...(want("waiting_on_them") ? waitingOnThem(facts, c) : []),
    ...(want("promised") ? promised(facts, c) : []),
  ];
}

// ---------- D243: coming up, services, money changing, updates ----------

const HOUR = 3_600_000;
/** A trip is said once, inside this window before it leaves (the evening before an evening flight, or that morning). */
export const COMING_MS = 36 * HOUR;
/** Within this, a trip or a maintenance window is urgent (只说急的 says it). */
export const URGENT_AHEAD_MS = 30 * HOUR;
const senderOf = (f: Fact) => f.label.split(" · ")[0] || "";
/** D78: a space between Chinese and Latin words or numbers. */
export const zhSpace = (t: string) => t.replace(/([㐀-鿿])([A-Za-z0-9$€¥£])/g, "$1 $2").replace(/([A-Za-z0-9%)])([㐀-鿿])/g, "$1 $2");
const hmAt = (ms: number, zone: string) => hm(new Date(ms).toISOString(), zone);
const dayZh = (iso: string, c: DetectCtx) => {
  const d = daysUntil(iso, c.now, c.zone);
  return d === 0 ? "今天" : d === 1 ? "明天" : d === 2 ? "后天" : d === -1 ? "昨天" : md(iso, c.zone);
};
const dayEn = (iso: string, c: DetectCtx) => {
  const d = daysUntil(iso, c.now, c.zone);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : `on ${md(iso, c.zone)}`;
};
const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** The same thing by name, or by its flight number ("NH 920" and "NH920"). */
const flightNo = (x: string) => FLIGHT_NO.exec(x)?.[0]?.replace(/\s+/g, "").toUpperCase();
const sameThing = (a: string, b: string) => sameName(a, b) || (Boolean(flightNo(a)) && flightNo(a) === flightNo(b));

type Booking = Extract<Fact, { type: "booking" }>;
type Service = Extract<Fact, { type: "service" }>;

/** 快到了 / Coming up: a flight or a train in the next day and a half, or a booked thing at a time today. */
function comingUp(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  const trips = facts
    .filter((f): f is Booking => f.type === "booking" && hasTime(f.start) && (f.what === "flight" || f.what === "train" || f.what === "other"))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const idOf = (b: Booking) => `${b.what === "other" ? norm(b.name).replace(/\s+/g, "") : (FLIGHT_NO.exec(b.name)?.[0] ?? b.name).replace(/\s+/g, "").toLowerCase()}|${Math.round(Date.parse(b.start) / 60_000)}`;
  const done = new Set<string>();
  for (const b of trips) {
    const t = Date.parse(b.start);
    const id = idOf(b);
    if (t <= c.now || t - c.now > COMING_MS || done.has(id)) continue;
    done.add(id);
    const d = daysUntil(b.start, c.now, c.zone);
    // "other" (a reservation, an appointment confirmed by mail) only on its day: the calendar has the rest.
    if (b.what === "other" && d !== 0) continue;
    // A later change to it: 计划变了 says that one.
    if (facts.some((f) => f.type === "change" && Date.parse(f.at) > Date.parse(b.at) && sameThing(f.name, b.name))) continue;
    // The same trip from the calendar and from the booking mail: one find, the fields of both.
    const twins = trips.filter((x) => idOf(x) === id).sort((a, b) => Number(/calendar/.test(a.ref.service)) - Number(/calendar/.test(b.ref.service)));
    const pick = <K extends "from" | "place" | "end">(k: K) => twins.map((x) => x[k]).find(Boolean);
    const from = pick("from");
    const place = pick("place");
    const end = pick("end");
    const name = twins.map((x) => FLIGHT_NO.exec(x.name)?.[0]).find(Boolean) ?? b.name;
    const lead = b.what === "flight" ? 2 * HOUR : b.what === "train" ? 20 * 60_000 : 0;
    const leave = lead ? hmAt(t - lead, c.zone) : "";
    const when = `${dayZh(b.start, c)} ${hm(b.start, c.zone)}`;
    const arrive = end ? hm(end, c.zone) : "";
    let zh: string;
    let en: string;
    if (b.what === "flight") {
      const base = `${when} ${name}${from ? ` 从${from}` : ""}起飞${place ? `，飞${place}` : ""}`;
      zh = `${base}${arrive ? `，${arrive} 到` : ""}；${leave} 前到机场。`;
      if ([...zh].length > 60) zh = `${base}；${leave} 前到机场。`;
      en = `${name} leaves${from ? ` ${from}` : ""} at ${hm(b.start, c.zone)} ${dayEn(b.start, c)}${place ? ` for ${place}` : ""}${arrive ? `, landing ${arrive}` : ""}. Be at the airport by ${leave}.`;
    } else if (b.what === "train") {
      zh = `${when} ${name}${from ? ` 从${from}` : ""}出发${place ? `去${place}` : ""}；${leave} 前到站。`;
      en = `${name} leaves${from ? ` ${from}` : ""} at ${hm(b.start, c.zone)} ${dayEn(b.start, c)}${place ? ` for ${place}` : ""}. Be at the station by ${leave}.`;
    } else {
      zh = `${when} ${name}${b.place ? `（${b.place}）` : ""}。`;
      en = `${name} at ${hm(b.start, c.zone)} ${dayEn(b.start, c)}${b.place ? ` (${b.place})` : ""}.`;
    }
    const trip = b.what !== "other";
    const mailed = twins.find((x) => x.ref.service !== "googlecalendar" && !/calendar/.test(x.ref.service));
    out.push({
      key: `coming:${id}`,
      kind: "coming_up",
      cost: trip ? 80 : 60,
      urgent: trip ? t - c.now <= URGENT_AHEAD_MS : t - c.now <= 6 * HOUR,
      dueAt: b.start,
      ...(mailed && senderOf(mailed) ? { sender: senderOf(mailed) } : {}),
      people: [],
      how: twins.map(howOf).slice(0, 3),
      words: { zh: zhSpace(zh), en },
      ...(b.what === "flight"
        ? {
            step: {
              kind: "lookup" as const,
              goLabel: { zh: "查一下航班状态", en: "Check the flight status" },
              brief: "Look up the live status of the flight below (on time or not, terminal, gate) on the airline's or the airport's site. Read only: check in nothing, change nothing, buy nothing. Report in two lines.",
              data: { flight: name, departs: b.start, ...(from ? { from } : {}), ...(place ? { to: place } : {}) },
              needs: { browse: true },
            },
          }
        : {}),
      facts: twins.map((x) => x.id),
      topic: name,
      // dots' "I checked the booking mail and found no later change" (2026-11-13): the bar may say so.
      ...(mailed ? { notes: ["no later change notice for it"] } : {}),
    });
  }
  return out;
}

/** 你用的服务 / A service you use: maintenance ahead, an outage now, a job that keeps failing, a shutdown, a security alert. */
function services(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  const svc = facts.filter((f): f is Service => f.type === "service");
  const undone = (f: Service) => svc.some((r) => r.what === "resolved" && Date.parse(r.at) > Date.parse(f.at) && (sameName(r.name, f.name) || (senderOf(r) !== "" && senderOf(r) === senderOf(f))));
  const trips = facts.filter((f): f is Booking => f.type === "booking" && (f.what === "flight" || f.what === "train") && hasTime(f.start));
  const endOf = (x: Service) => (x.end ? Date.parse(x.end) : Date.parse(x.start!) + HOUR);

  // Maintenance in the next two days: one find per sender and day, joined with the person's trip that day.
  const groups = new Map<string, Service[]>();
  for (const f of svc) {
    if (f.what !== "maintenance" || !f.start || undone(f)) continue;
    const t = Date.parse(f.start);
    if (endOf(f) <= c.now || t - c.now > 48 * HOUR) continue;
    const k = `${senderOf(f) || norm(f.name)}|${dayKey(t, c.zone)}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
    const first = list[0]!;
    const prod = list.some((x) => x.prod);
    const t = Date.parse(first.start!);
    const lastEnd = Math.max(...list.map(endOf));
    const times = [...new Set(list.map((x) => hm(x.start!, c.zone)))];
    const who = senderOf(first) || first.name;
    const what = list.length > 1 ? `${list.length} 个${prod ? "生产" : ""}实例` : "";
    const whatEn = list.length > 1 ? `${list.length} ${prod ? "production " : ""}instances` : "";
    // The trip that day that isn't over before the window starts.
    // Only production is joined with their plans: a building's notice stays a building's notice.
    const trip = prod ? trips.find((b) => dayKey(Date.parse(b.start), c.zone) === dayKey(t, c.zone)) : undefined;
    let joinZh = "";
    let joinEn = "";
    if (trip) {
      const s = Date.parse(trip.start);
      const e = trip.end ? Date.parse(trip.end) : s + 2 * HOUR;
      const tripName = FLIGHT_NO.exec(trip.name)?.[0] ?? trip.name;
      if (list.some((x) => Date.parse(x.start!) < e && endOf(x) > s)) {
        joinZh = `那会儿你在 ${tripName} 上`;
        joinEn = `you'll be on ${tripName} then`;
      } else if (lastEnd <= s) {
        joinZh = `${list.length > 1 ? "都" : ""}在你 ${hm(trip.start, c.zone)} 的航班之前`;
        joinEn = `${list.length > 1 ? "both " : ""}before your ${hm(trip.start, c.zone)} ${tripName}`;
      } else {
        joinZh = `当天你 ${hm(trip.start, c.zone)} 要走`;
        joinEn = `you leave on ${tripName} at ${hm(trip.start, c.zone)} that day`;
      }
      if (trip.what === "train") joinZh = joinZh.replace("航班", "车");
    }
    const zh = `${dayZh(first.start!, c)} ${times.join("、")} ${who}${what ? ` ${what}` : ""}要维护${joinZh ? `，${joinZh}` : ""}。`;
    const en = `${who} has maintenance${whatEn ? ` on ${whatEn}` : ""} ${dayEn(first.start!, c)} at ${times.join(" and ")}${first.effect ? ` (${first.effect})` : ""}${joinEn ? `, ${joinEn}` : ""}.`;
    out.push({
      key: `service:${list.map((x) => x.id).sort().join(":")}`,
      kind: "service",
      cost: prod ? 76 + (trip ? 8 : 0) : 42,
      urgent: prod && t - c.now <= URGENT_AHEAD_MS,
      dueAt: first.start!,
      ...(who ? { sender: who } : {}),
      people: [],
      how: [...list.map(howOf), ...(trip ? [howOf(trip)] : [])].slice(0, 4),
      words: { zh: zhSpace(zh), en },
      step: {
        kind: "read",
        goLabel: { zh: "看看要准备什么", en: "See what to prepare" },
        brief: "A service the person uses has maintenance coming (below). Read the notice and say in a few lines which of their systems it touches, what may break (connections, jobs, deploys), and what to have ready or who should watch it come back. Read only: change nothing, reply to nothing.",
        data: { service: who, notice: first.label, windows: list.map((x) => `${x.name} ${x.start}${x.end ? `–${x.end}` : ""}`).join("; ") },
      },
      facts: [...list.map((x) => x.id), ...(trip ? [trip.id] : [])],
      topic: who,
      notes: [...new Set(list.map((x) => x.effect).filter((x): x is string => Boolean(x)))].map((e) => `effect: ${e}`),
    });
  }

  // An outage or an incident in the last 12 hours, not since resolved.
  for (const f of svc) {
    if ((f.what !== "outage" && f.what !== "incident") || undone(f) || c.now - Date.parse(f.at) > 12 * HOUR) continue;
    const who = senderOf(f) || f.name;
    out.push({
      key: `service:${f.id}`,
      kind: "service",
      cost: f.prod ? 85 : 48,
      urgent: Boolean(f.prod),
      dueAt: f.end ?? new Date(Date.parse(f.at) + 12 * HOUR).toISOString(),
      sender: who,
      people: [],
      how: [howOf(f)],
      words: { zh: zhSpace(`${f.name} 出了故障${f.end ? `，预计 ${hm(f.end, c.zone)} 恢复` : ""}。`), en: `${f.name} has an outage${f.effect ? ` (${f.effect})` : ""}${f.end ? `, expected back by ${hm(f.end, c.zone)}` : ""}.` },
      step: { kind: "read", goLabel: { zh: "看看影响到哪", en: "See what it affects" }, brief: "A service the person uses reports an outage (below). Read the notice and its status page and say in a few lines what is down, what of theirs it touches, and when it is expected back. Read only.", data: { service: who, notice: f.label } },
      facts: [f.id],
      topic: who,
      ...(f.effect ? { notes: [`effect: ${f.effect}`] } : {}),
    });
  }

  // A job that keeps failing: two or more failures of the same thing in three days (one is CI noise),
  // or one on production.
  const fails = new Map<string, Service[]>();
  for (const f of svc) {
    if (f.what !== "failing" || undone(f) || c.now - Date.parse(f.at) > 72 * HOUR) continue;
    const k = norm(f.name).replace(/\d+/g, "#");
    fails.set(k, [...(fails.get(k) ?? []), f]);
  }
  for (const list of fails.values()) {
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const prod = list.some((x) => x.prod);
    const n = list.length;
    if (n < 2 && !prod) continue;
    const first = list[0]!;
    const last = list.at(-1)!;
    if (c.now - Date.parse(last.at) > 24 * HOUR) continue;
    out.push({
      key: `failing:${first.id}`,
      kind: "service",
      cost: Math.min(88, 58 + n * 5 + (prod ? 8 : 0)),
      urgent: prod && n >= 3,
      sender: senderOf(first) || first.name,
      people: [],
      how: list.map(howOf).slice(-3),
      words:
        n > 1
          ? { zh: zhSpace(`${first.name} 从${dayZh(first.at, c)} ${hm(first.at, c.zone)} 起失败了 ${n} 次，最近一次 ${hm(last.at, c.zone)}。`), en: `${first.name} has failed ${n} times since ${hm(first.at, c.zone)} ${dayEn(first.at, c)}; the last at ${hm(last.at, c.zone)}.` }
          : { zh: zhSpace(`${first.name} ${dayZh(first.at, c)} ${hm(first.at, c.zone)} 失败了。`), en: `${first.name} failed at ${hm(first.at, c.zone)} ${dayEn(first.at, c)}.` },
      step: { kind: "read", goLabel: { zh: "先帮我看看哪儿坏了", en: "Find what's failing" }, brief: "A job of the person's keeps failing (below). Read the failure notices and the run's log page if one is linked, and say in a few lines what fails, since when, and the likely cause. Read only: re-run nothing, change nothing.", data: { job: first.name, notices: list.map((x) => x.label).slice(-3).join("; ") } },
      facts: list.map((x) => x.id),
      topic: first.name,
      notes: [`failures: ${n}`, ...(prod ? ["production"] : [])],
    });
  }

  // A product shutting down within six weeks (one later undone is not said).
  for (const f of svc) {
    if (f.what !== "shutdown" || undone(f)) continue;
    const d = f.start ? daysUntil(f.start, c.now, c.zone) : undefined;
    if (d !== undefined && (d < 0 || d > 45)) continue;
    if (d === undefined && c.now - Date.parse(f.at) > 3 * 86_400_000) continue;
    const who = senderOf(f) || f.name;
    out.push({
      key: `shutdown:${f.id}`,
      kind: "service",
      cost: d !== undefined && d <= 14 ? 70 : 60,
      urgent: false,
      ...(f.start ? { dueAt: f.start } : {}),
      sender: who,
      people: [],
      how: [howOf(f)],
      words: f.start ? { zh: zhSpace(`${f.name} 说 ${md(f.start, c.zone)} 停止服务。`), en: `${f.name} says it shuts down on ${md(f.start, c.zone)}.` } : { zh: zhSpace(`${f.name} 说要停止服务。`), en: `${f.name} says it is shutting down.` },
      step: { kind: "lookup", goLabel: { zh: "看看要怎么迁走", en: "See how to move off it" }, brief: "A product the person uses says it is shutting down (below). Read the announcement and say in a few lines when, what happens to their data, how to export it, and one or two alternatives. Read only: export nothing, sign up for nothing.", data: { product: who, notice: f.label }, needs: { browse: true } },
      facts: [f.id],
      topic: who,
    });
  }

  // A security alert on their account in the last two days: the bar decides (most are their own sign-ins).
  for (const f of svc) {
    if (f.what !== "security" || c.now - Date.parse(f.at) > 2 * 86_400_000) continue;
    const who = senderOf(f) || f.name;
    out.push({
      key: `security:${f.id}`,
      kind: "service",
      cost: 52,
      urgent: false,
      dueAt: new Date(Date.parse(f.at) + 2 * 86_400_000).toISOString(),
      sender: who,
      people: [],
      how: [howOf(f)],
      words: { zh: zhSpace(`${f.name}：${dayZh(f.at, c)} ${hm(f.at, c.zone)} 有一条安全提醒，看看是不是你。`), en: `${f.name}: a security alert ${dayEn(f.at, c)} at ${hm(f.at, c.zone)}; check it was you.` },
      step: { kind: "read", goLabel: { zh: "帮我看看", en: "Look at it for me" }, brief: "A security alert on one of the person's accounts (below). Read it and say in two lines what happened (device, place, time) and whether it looks like the person. Read only: change no password, sign out nothing.", data: { service: who, alert: f.label } },
      facts: [f.id],
      topic: who,
    });
  }
  return out;
}

/** 快到期 · 要花钱 / Deadlines and money (D243): what they are charged is about to change. */
function billing(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  for (const f of facts.filter((x): x is Extract<Fact, { type: "billing" }> => x.type === "billing")) {
    const d = daysUntil(f.on, c.now, c.zone);
    const failed = f.what === "payment_failed";
    if (failed ? c.now - Date.parse(f.at) > 3 * 86_400_000 : d < 0 || d > 10) continue;
    const amt = f.amount ? `（${f.amount}）` : "";
    const amtEn = f.amount ? ` (${f.amount})` : "";
    const when = md(f.on, c.zone);
    const w: Record<BillingWhat, { zh: string; en: string }> = {
      starts_charging: { zh: `${f.name} ${when} 起开始收费${amt}。还要用的话，去控制台确认一下。`, en: `${f.name} starts charging on ${when}${amtEn}. If you still need it, check it in the console.` },
      price_up: { zh: `${f.name} ${when} 起涨价${amt}。`, en: `${f.name} goes up on ${when}${amtEn}.` },
      payment_failed: { zh: `${f.name} 的扣款没成功${amt}。`, en: `A payment to ${f.name} failed${amtEn}.` },
      over_limit: { zh: `${f.name} 的用量超过免费额度了，${when} 起会收费${amt}。`, en: `${f.name} is over its free tier; charges start ${when}${amtEn}.` },
      trial_ends: { zh: `${f.name} 的试用 ${when} 结束${amt}。`, en: `The ${f.name} trial ends on ${when}${amtEn}.` },
      other: { zh: `${f.name} 的费用 ${when} 起有变化${amt}。`, en: `What ${f.name} charges changes on ${when}${amtEn}.` },
    };
    out.push({
      key: `billing:${f.id}`,
      kind: "deadline",
      cost: failed ? 85 : Math.min(82, 58 + (10 - d) * 2 + (f.what === "over_limit" ? 6 : 0)),
      urgent: failed || d <= 1,
      dueAt: failed ? new Date(Date.parse(f.at) + 3 * 86_400_000).toISOString() : f.on,
      sender: senderOf(f) || f.name,
      people: [],
      how: [howOf(f)],
      words: { zh: zhSpace(w[f.what].zh), en: w[f.what].en },
      step: {
        kind: "lookup",
        goLabel: { zh: "打开账单页", en: "Open the billing page" },
        brief: `Open the billing or usage page for the service below in Ducter's browser and stop there: tell the person what changes on ${dayKey(Date.parse(f.on), c.zone)}, what they would be charged on their plan, and what is using it if it shows. Never pay, never change a setting or a plan; that is the person's.`,
        data: { service: f.name, mail: f.label, ...(f.amount ? { amount: f.amount } : {}) },
        needs: { browse: true, signedIn: true },
      },
      facts: [f.id],
      topic: f.name,
    });
  }
  return out;
}

/** 之前说的有变 / An update to what I told you: a later notice undoes or changes a find already said. */
function updates(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  for (const s of c.said ?? []) {
    if (!s.topic || s.passed || c.now - s.at > 14 * 86_400_000) continue;
    const mine = new Set(s.facts);
    const own = facts.filter((f) => mine.has(f.id));
    const sameSender = (f: Fact) => own.some((o) => senderOf(o) !== "" && senderOf(o) === senderOf(f));
    for (const f of facts) {
      if (mine.has(f.id) || Date.parse(f.at) <= s.at) continue;
      const undo = f.type === "service" && f.what === "resolved";
      if (!undo && f.type !== "change") continue;
      const name = f.type === "service" || f.type === "change" ? f.name : "";
      if (!sameThing(name, s.topic) && !sameSender(f)) continue;
      const first = s.text.split(/[。.!?！？；;]/)[0]!.trim();
      const effect = f.type === "service" ? f.effect : undefined;
      const now = f.type === "change" ? (hasTime(f.on) ? `${md(f.on, c.zone)} ${hm(f.on, c.zone)}` : md(f.on, c.zone)) : "";
      out.push({
        key: `update:${s.findId}:${f.id}`,
        kind: "update",
        cost: 80,
        // It corrects something they may act on: said now, not tomorrow.
        urgent: true,
        sender: senderOf(f) || name,
        people: [],
        how: [howOf(f), ...own.map(howOf)].slice(0, 3),
        words: undo
          ? { zh: zhSpace(`更正：之前说的「${first}」不算数了。`), en: `Correction: "${first}" no longer holds${effect ? `: ${effect}` : ""}.` }
          : { zh: zhSpace(`更正：之前说的「${first}」改了，现在是 ${now}。`), en: `Correction to "${first}": it changed, now ${now}.` },
        facts: [f.id],
        topic: s.topic,
        ...(effect ? { notes: [`effect: ${effect}`] } : {}),
      });
      break;
    }
  }
  return out;
}

