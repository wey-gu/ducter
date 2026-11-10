// The seven kinds (D165 §4), found by code over the facts ledger. A detector proposes; the bar
// (judge.ts) decides what is said. Each candidate carries its evidence (怎么知道的 / How I know:
// the facts' labels and dates), its one next step, and plain words in both languages, two
// sentences at most (zh ≤ ~60 characters).
import type { FindHow, FindKind } from "@ducter/protocol";
import type { Candidate } from "./candidate.ts";
import type { Fact, Ledger } from "./ledger.ts";

export type { Candidate, StepKind } from "./candidate.ts";

const DAY = 86_400_000;

export interface DetectCtx {
  now: number;
  zone: string;
  /** Which kinds to look for (all, unless the first look asks for one). */
  kinds?: FindKind[];
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
    const whenZh = ago === -1 ? "昨天" : `${-ago} 天前`;
    const zh = `${who} ${whenZh}问你${first.what ? `「${first.what}」` : "一件事"}${again ? `，${daysUntil(last.at, c.now, c.zone) === 0 ? "今天" : ""}又问了一次。` : `，还没回。`}`;
    const en = `${who} asked you${first.what ? ` "${first.what}"` : " something"} ${ago === -1 ? "yesterday" : `${-ago} days ago`}${again ? ", and asked again." : ", not answered yet."}`;
    out.push({
      key: `wait_you:${k}:${list.length}`,
      kind: "waiting_on_you",
      cost: Math.min(90, 50 + (again ? 15 : 0) + days * 5),
      urgent: false,
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
  return [
    ...(want("mismatch") ? mismatches(facts, c) : []),
    ...(want("deadline") ? deadlines(facts, c) : []),
    ...(want("plan_changed") ? changes(facts, c) : []),
    ...(want("waiting_on_you") ? waitingOnYou(facts, c) : []),
    ...(want("waiting_on_them") ? waitingOnThem(facts, c) : []),
    ...(want("promised") ? promised(facts, c) : []),
  ];
}
