// D388: 同一个安排的几个说法 / one coming plan, every source side by side. The calendar's hold, a mail
// that mentions it, the confirmation, what the person said in the conversation and a public page
// a web look read are each one source's word on the plan: its day, and its time and place when
// it gives them. Code puts the words on one sheet per plan and reads two things off it:
//   - a contradiction: two sources put it on different days (the talk on Friday in a weekly
//     report, on Saturday in the calendar), said before the decision it affects (booking travel);
//   - an open question: what no source says yet (the time), kept after the contradiction is said
//     and closed later by a source that says it, which is said once as a follow-up line.
// Every line of 怎么知道的 is a source with what it says (and its page, for the web); the answer
// to "how did you know?" is composed from the same lines (engine `noticed`), never invented.
// No model here: the facts came typed from triage, the calendar and the person's own words.
import type { FindHow, FindSrc } from "@ducter/protocol";
import type { Candidate } from "./candidate.ts";
import type { Fact } from "./ledger.ts";
import type { DetectCtx } from "./detect.ts";

const DAY = 86_400_000;
/** Plans this many days ahead have a sheet (the D226 two weeks). */
export const SHEET_DAYS = 14;
/** Two words on one plan may be this many days apart and still be about the same plan (a Fri/Sat mix-up). */
const SAME_PLAN_DAYS = 3;

/** D388: something the person said they'd do on a day (said.ts), as the sheet reads it. */
export interface OwnClaim {
  id: string;
  what: string;
  /** Their line, clipped: the source line's words. */
  quote: string;
  at: number;
  dueAt: string;
}

/** One source's word on a plan. */
export interface Claim {
  /** The fact's id, or own:<id> for the person's own words. */
  id: string;
  src: FindSrc;
  /** hold: the calendar's all-day hold; event: a timed calendar event; confirm: a confirmation mail; mention: a mail that names it; said: the person; page: a public page. */
  role: "hold" | "event" | "confirm" | "mention" | "said" | "page";
  name: string;
  /** The local day it puts the plan on (YYYY-MM-DD). */
  day: string;
  time?: string;
  /** The time is the doors' (a page says so), not when the person's part starts. */
  doors?: boolean;
  tbd?: boolean;
  place?: string;
  label: string;
  sender?: string;
  at: string;
  url?: string;
}

export interface Sheet {
  /** Stable while the same plan: its first claim's id. */
  key: string;
  name: string;
  claims: Claim[];
  /** Flights, trains and stays within a day of it: what a wrong day would cost. */
  travel: Extract<Fact, { type: "booking" }>[];
}

// ---------- days in the person's zone ----------

const FMT = new Map<string, Intl.DateTimeFormat>();
function localParts(ms: number, zone: string) {
  let f = FMT.get(zone);
  if (!f) FMT.set(zone, (f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })));
  const p = f.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}
/** A date's own day and time: as written when it says where it happens, else in the zone. */
function dayTime(iso: string, zone: string): { day: string; time?: string } {
  const lit = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d)(?::\d\d(?:\.\d+)?)?([+-]\d\d:\d\d))?$/.exec(iso.trim());
  if (lit) return { day: lit[1]!, ...(lit[2] ? { time: lit[2] } : {}) };
  const p = localParts(Date.parse(iso), zone);
  return { day: p.day, time: p.time };
}
const dayNo = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);
const todayNo = (c: DetectCtx) => dayNo(localParts(c.now, c.zone).day);
const WD_ZH = "日一二三四五六";
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wd = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const mdOf = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
/** "11/21（周六）" / "Sat 11/21" */
export const dayZh = (day: string) => `${mdOf(day)}（周${WD_ZH[wd(day)]}）`;
export const dayEn = (day: string) => `${WD_EN[wd(day)]} ${mdOf(day)}`;

// ---------- the same plan by name ----------

/** Words that name the kind of thing or the city, not the thing itself. */
const STOP = new Set(
  "talk talks meetup meeting meet event events sync call weekly report the and for with from about dinner lunch party session workshop conference summit day night trip visit share sharing beijing shanghai shenzhen hangzhou guangzhou tokyo osaka kyoto london paris berlin singapore york francisco seattle".split(" "),
);
const CJK_STOP = ["北京", "上海", "深圳", "杭州", "广州", "东京", "大阪", "分享", "活动", "会议", "参加", "晚上", "下午", "上午", "晚饭", "午饭", "见面", "周报", "开会", "演讲", "出差"];

function latin(x: string): string[] {
  return (x.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !/^\d+$/.test(w));
}
function keysOf(x: string): string[] {
  const w = latin(x);
  const keys = w.filter((t) => t.length >= 4 && !STOP.has(t));
  // "AGI Bar" is also "agibar": two short words joined name it as one.
  for (let i = 0; i + 1 < w.length; i++) if (!STOP.has(w[i]!) && !STOP.has(w[i + 1]!) && (w[i]! + w[i + 1]!).length >= 5) keys.push(w[i]! + w[i + 1]!);
  return keys;
}
function cjk(x: string): string {
  let t = (x.match(/[㐀-鿿]+/g) ?? []).join("|");
  for (const s of CJK_STOP) t = t.replaceAll(s, "|");
  return t;
}
/** The same plan by name: a distinctive Latin word (or two short ones joined), or three Chinese characters past the generic words. */
export function samePlan(a: string, b: string): boolean {
  const la = latin(a).join("");
  const lb = latin(b).join("");
  if (keysOf(a).some((k) => lb.includes(k)) || keysOf(b).some((k) => la.includes(k))) return true;
  const ca = cjk(a);
  const cb = cjk(b);
  for (const run of ca.split("|")) for (let i = 0; i + 3 <= run.length; i++) if (cb.includes(run.slice(i, i + 3))) return true;
  return false;
}

// ---------- the claims and the sheets ----------

const isCalendar = (service: string) => /calendar/i.test(service);
const midnight = (iso: string) => /T00:00:00(\.000)?Z$/.test(iso);
/** An explicit clock time in the person's own words ("19:00", "7 点"), never "晚上". */
const OWN_TIME = /(\d{1,2})[:：](\d\d)|(\d{1,2})\s*点/;

export function claimsOf(facts: Fact[], c: DetectCtx): Claim[] {
  const out: Claim[] = [];
  const base = (f: Fact) => ({ id: f.id, label: f.label, ...(f.sender && f.sender !== f.label ? { sender: f.sender } : {}), at: f.at });
  for (const f of facts) {
    if (f.type === "plan") {
      out.push({ ...base(f), src: f.src, role: f.src === "calendar" ? "hold" : f.src === "web" ? "page" : "mention", name: f.name, day: f.day, ...(f.time ? { time: f.time } : {}), ...(f.doors ? { doors: true } : {}), ...(f.tbd ? { tbd: true } : {}), ...(f.place ? { place: f.place } : {}), ...(f.url ? { url: f.url } : {}) });
    } else if (f.type === "booking" && f.what === "other" && f.name) {
      // A calendar's all-day event with a place (eventFact: a booking at UTC midnight) is a hold; a mail's is its confirmation.
      if (isCalendar(f.ref.service)) {
        const allDay = midnight(f.start);
        const dt = allDay ? { day: f.start.slice(0, 10) } : dayTime(f.start, c.zone);
        out.push({ ...base(f), src: "calendar", role: "hold", name: f.name, ...dt, ...(allDay ? { tbd: true } : {}), ...(f.place ? { place: f.place } : {}) });
      } else {
        out.push({ ...base(f), src: "mail", role: "confirm", name: f.name, ...dayTime(f.start, c.zone), ...(f.place ? { place: f.place } : {}) });
      }
    } else if (f.type === "meeting" && f.title) {
      out.push({ ...base(f), src: "calendar", role: "event", name: f.title, ...dayTime(f.start, c.zone), ...(f.location ? { place: f.location } : {}) });
    }
  }
  for (const o of c.own ?? []) {
    const m = OWN_TIME.exec(o.quote);
    const time = m ? `${String(Number(m[1] ?? m[3])).padStart(2, "0")}:${m[2] ?? "00"}` : undefined;
    out.push({ id: `own:${o.id}`, src: "you", role: "said", name: o.what, day: localParts(Date.parse(o.dueAt), c.zone).day, ...(time && Number(time.slice(0, 2)) < 24 ? { time } : {}), label: o.quote, at: new Date(o.at).toISOString() });
  }
  const t0 = todayNo(c);
  return out.filter((x) => {
    const d = dayNo(x.day) - t0;
    return d >= 0 && d <= SHEET_DAYS;
  });
}

/** The plans coming up, each with every source's word on it; only plans more than one source names. */
export function sheetsOf(facts: Fact[], c: DetectCtx): Sheet[] {
  const claims = claimsOf(facts, c).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const parent = claims.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < claims.length; i++)
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      if (Math.abs(dayNo(a.day) - dayNo(b.day)) > SAME_PLAN_DAYS || !samePlan(a.name, b.name)) continue;
      // Two timed events of the calendar's own are two meetings, not one plan.
      if (a.role === "event" && b.role === "event") continue;
      parent[root(j)] = root(i);
    }
  const groups = new Map<number, Claim[]>();
  claims.forEach((cl, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), cl]));
  const travel = facts.filter((f): f is Extract<Fact, { type: "booking" }> => f.type === "booking" && f.what !== "other");
  const out: Sheet[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const days = new Set(g.map((x) => dayNo(x.day)));
    const near = travel.filter((t) => [...days].some((d) => Math.abs(dayNo(dayTime(t.start, c.zone).day) - d) <= 1));
    const anchor = pickAnchor(g);
    out.push({ key: g[0]!.id, name: anchor.name, claims: g, travel: near });
  }
  return out;
}

/** Whose word the plan is told by: the person's, then the calendar's, then a confirmation's, then a mention's. */
const ANCHOR: Claim["role"][] = ["said", "hold", "event", "confirm", "mention", "page"];
/** Which disagreeing word to name: the confirmation, then a mention, then the calendar, then the person, then a page. */
const ODD: Claim["role"][] = ["confirm", "mention", "hold", "event", "said", "page"];
function pickAnchor(g: Claim[]): Claim {
  return [...g].sort((a, b) => ANCHOR.indexOf(a.role) - ANCHOR.indexOf(b.role) || Date.parse(b.at) - Date.parse(a.at))[0]!;
}

// ---------- the words ----------

const clipName = (x: string) => {
  const t = x.trim();
  return [...t].length > 18 ? `${[...t].slice(0, 17).join("")}…` : t;
};
const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const report = (cl: Claim) => /周报|weekly|report|newsletter|周刊|简报/i.test(cl.label);

/** "日历上" / "Mia Chen 的确认信写的" ... the source as the sentence names it. */
function leadZh(cl: Claim): string {
  // A person by their first name ("Lina"), a company as it is: the line stays one phone line.
  const short = cl.sender && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(cl.sender) ? cl.sender.split(" ")[0] : cl.sender;
  const who = short ? `${short} 的` : "";
  switch (cl.role) {
    case "hold":
    case "event":
      return "日历上";
    case "said":
      return "你说的";
    case "confirm":
      return `${who}确认信写的`;
    case "page":
      return `${host(cl.url) || "网上"}写的`;
    default:
      return report(cl) ? `${who}周报写的` : `${who}信里写的`;
  }
}
function leadEn(cl: Claim): string {
  const who = cl.sender ? `${cl.sender}'s` : "a";
  switch (cl.role) {
    case "hold":
    case "event":
      return "your calendar has";
    case "said":
      return "you said";
    case "confirm":
      return `the confirmation${cl.sender ? ` from ${cl.sender}` : ""} says`;
    case "page":
      return `${host(cl.url) || "the web"} says`;
    default:
      return report(cl) ? `${who} weekly report says` : `${who} mail says`;
  }
}

/** What one source says, for its 怎么知道的 line. */
export function saysOf(cl: Claim): { zh: string; en: string } {
  const t = cl.time ? `${cl.time}${cl.doors ? "（开门）" : ""}` : "";
  const tEn = cl.time ? ` ${cl.time}${cl.doors ? " (doors)" : ""}` : "";
  const open = cl.tbd ? "，全天，没写时间" : "";
  const openEn = cl.tbd ? ", all day, no time" : "";
  return { zh: `${dayZh(cl.day)}${t}${open}`, en: `${dayEn(cl.day)}${tEn}${openEn}` };
}

const SRC_OF: Record<Claim["role"], FindSrc> = { hold: "calendar", event: "calendar", confirm: "mail", mention: "mail", said: "you", page: "web" };
export function howOfClaim(cl: Claim): FindHow {
  return { what: cl.label || cl.name, ...(cl.sender ? { from: cl.sender } : {}), at: cl.at, src: SRC_OF[cl.role], ...(cl.url ? { url: cl.url } : {}) };
}

const SRC_ZH: Record<FindSrc, string> = { calendar: "日历", mail: "邮件", chat: "聊天", github: "GitHub", you: "你说的", web: "网上" };
const SRC_EN: Record<FindSrc, string> = { calendar: "your calendar", mail: "a mail", chat: "a chat", github: "GitHub", you: "you said", web: "the web" };

/**
 * D388: the answer to "how did you know?", composed by code from a find's own lines, in the order
 * it rests on them: each source, what it says, its page; then what it doesn't know and what it
 * didn't change. Nothing here the lines don't hold.
 */
export function provenance(how: FindHow[], o: { unknown?: string; untouched?: string }): { zh: string; en: string } {
  const day = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(5, 10).replace("-", "/").replace(/^0/, "").replace(/\/0/, "/");
  };
  // D388: each page is a Markdown link, so the answer carries it as written (the partner gives why word for word).
  const link = (h: FindHow) => (h.url ? `[${h.what}](${h.url})` : h.what);
  const zh = how.map((h, i) => {
    const src = h.src ? SRC_ZH[h.src] : "";
    const who = h.src === "you" ? `你 ${day(h.at)} 说的「${h.what}」` : h.src === "web" ? `网页 ${link(h)}` : h.src === "mail" ? `${h.from ? `${h.from} 的` : ""}邮件「${h.what}」` : `${src}${h.from ? ` ${h.from} 的` : ""}「${h.what}」`;
    return `${i + 1}. ${who}${h.says ? `：${h.says}` : ""}${h.url && h.src !== "web" ? `（[链接](${h.url})）` : ""}`;
  });
  const en = how.map((h, i) => {
    const who = h.src === "you" ? `you said on ${day(h.at)}: "${h.what}"` : h.src === "web" ? `the page ${link(h)}` : `${h.src ? SRC_EN[h.src] : "a source"}${h.from ? ` from ${h.from}` : ""}, "${h.what}"`;
    return `${i + 1}. ${who}${h.says ? `: ${h.says}` : ""}${h.url && h.src !== "web" ? ` ([link](${h.url}))` : ""}`;
  });
  return {
    zh: `${zh.join("\n")}\n${o.unknown ? `还不知道：${o.unknown}。` : ""}${o.untouched ?? ""}`.trim(),
    en: `${en.join("\n")}\n${o.unknown ? `Not known yet: ${o.unknown}.` : ""}${o.untouched ? ` ${o.untouched}` : ""}`.trim(),
  };
}

/** D388: the open question a plan leaves: its time, when no source gives one (a doors time is not the person's slot). */
export const timeOpen = (s: Sheet) => !s.claims.some((x) => x.time && !x.doors);

// ---------- the contradiction ----------

/**
 * Two sources put one plan on different days. Said unless only the person's own words disagree
 * with their calendar (they know what they said). Cost of a miss: what a wrong day costs (travel
 * booked or about to be), and how soon the first of the two days is.
 */
export function planMismatches(facts: Fact[], c: DetectCtx): Candidate[] {
  const out: Candidate[] = [];
  const t0 = todayNo(c);
  for (const s of sheetsOf(facts, c)) {
    const anchor = pickAnchor(s.claims);
    const others = s.claims.filter((x) => x.day !== anchor.day).sort((a, b) => ODD.indexOf(a.role) - ODD.indexOf(b.role) || Date.parse(b.at) - Date.parse(a.at));
    const odd = others[0];
    if (!odd) continue;
    const agree = s.claims.filter((x) => x !== anchor && x.day === anchor.day);
    // Their words against their own calendar only: they know; the sheet still shows it when asked.
    if (anchor.role === "said" && s.claims.every((x) => x.role === "said" || x.role === "hold" || x.role === "event")) continue;
    const first = Math.min(dayNo(anchor.day), dayNo(odd.day)) - t0;
    const youAgree = anchor.role === "said" && agree.some((x) => x.src === "calendar");
    const travel = s.travel[0];
    // No time at all, or only the doors': what is open is the time, or when their part starts.
    const tbd = timeOpen(s);
    const doorsOnly = tbd && s.claims.some((x) => x.time && x.doors);
    const cost = Math.min(95, 70 + (first <= 2 ? 15 : first <= 7 ? 5 : 0) + (travel ? 8 : 0) - (youAgree ? 12 : 0));
    const urgent = first <= 1 || (first <= 3 && !youAgree);
    const name = clipName(anchor.role === "said" ? (s.claims.find((x) => x.role !== "said")?.name ?? anchor.name) : anchor.name);
    const headZh = anchor.src === "calendar" ? `日历上「${name}」是 ${dayZh(anchor.day)}` : `「${name}」${leadZh(anchor)}是 ${dayZh(anchor.day)}`;
    const oddZh = `${leadZh(odd)}是 ${dayZh(odd.day)}`;
    const nextZh = travel ? `你订的 ${travel.name} 是 ${mdOf(dayTime(travel.start, c.zone).day)} 的。` : first <= 7 ? (tbd && !doorsOnly ? "时间也没定，订票前先跟主办方确认。" : "订票前先跟主办方确认哪天。") : tbd && !doorsOnly ? "时间也还没定。" : "";
    const headEn = anchor.src === "calendar" ? `Your calendar has "${name}" on ${dayEn(anchor.day)}` : `"${name}": ${leadEn(anchor)} ${dayEn(anchor.day)}`;
    const oddEn = `${leadEn(odd)} ${dayEn(odd.day)}`;
    const nextEn = travel ? ` Your ${travel.name} is on ${mdOf(dayTime(travel.start, c.zone).day)}.` : first <= 7 ? (tbd && !doorsOnly ? " No time yet either: check with the organiser before booking travel." : " Check the day with the organiser before booking travel.") : tbd && !doorsOnly ? " No time yet either." : "";
    // The order 怎么知道的 tells it in: the plan's own word first, then who agrees, then who doesn't.
    const told = [anchor, ...agree, ...others].slice(0, 4);
    // D226's key for a calendar event against its confirmation, so a find said before is not said again.
    const key = anchor.role === "event" && odd.role === "confirm" ? `mismatch:${odd.id}:${anchor.id}` : `plan:${anchor.id}:${odd.id}`;
    const sender = odd.sender ?? (odd.role === "page" ? host(odd.url) : undefined);
    const hasCalendar = s.claims.some((x) => x.src === "calendar");
    out.push({
      key,
      kind: "mismatch",
      cost,
      urgent,
      dueAt: new Date(Date.parse(`${(dayNo(anchor.day) >= dayNo(odd.day) ? anchor : odd).day}T23:59:00Z`)).toISOString(),
      ...(sender ? { sender } : {}),
      people: [],
      how: told.map(howOfClaim),
      says: told.map(saysOf),
      words: { zh: `${headZh}，${oddZh}。${nextZh}`, en: `${headEn}, but ${oddEn}.${nextEn}` },
      ...(tbd ? { unknown: doorsOnly ? { zh: "你几点上场", en: "when your part starts" } : { zh: "几点开始", en: "what time it starts" } } : {}),
      ...(hasCalendar ? { untouched: { zh: "日历我没改。", en: "I didn't change your calendar." } } : {}),
      step: {
        kind: "read",
        goLabel: { zh: "核对哪个对", en: "Check which is right" },
        brief: `The person's sources disagree on the day of the same plan (below): ${told.map((x) => `${x.role} says ${x.day}${x.time ? ` ${x.time}` : ""}`).join("; ")}. Read the mail and the event and say in two lines which date is right and why. Read only: move nothing, reply to nothing.`,
        data: { plan: name, ...Object.fromEntries(told.map((x, i) => [`source_${i + 1}`, x.label.slice(0, 80)])) },
      },
      facts: s.claims.filter((x) => !x.id.startsWith("own:")).map((x) => x.id),
      topic: name,
      open: { sheet: s.key, name, day: anchor.day, ...(anchor.place ?? odd.place ? { place: (anchor.place ?? odd.place)! } : {}), fields: tbd ? ["day", "time"] : ["day"], days: [anchor.day, odd.day] },
    });
  }
  return out;
}

/** D388: the sheet an open question was about, again (its key, else the same name on one of its days). */
export function sheetFor(facts: Fact[], c: DetectCtx, o: { sheet: string; name: string; days: string[] }): Sheet | undefined {
  const all = sheetsOf(facts, c);
  return all.find((s) => s.claims.some((x) => x.id === o.sheet)) ?? all.find((s) => samePlan(s.name, o.name) && s.claims.some((x) => o.days.includes(x.day)));
}

/** A claim that came after the question was asked and gives a time for the plan (not only the doors'), else one that gives the doors. */
export function timeFill(s: Sheet, since: number): Claim | undefined {
  const fresh = s.claims.filter((x) => x.time && Date.parse(x.at) >= since && x.role !== "said");
  return fresh.find((x) => !x.doors) ?? fresh[0];
}

/** Every source said after the question agrees on one day: the day is settled by them. */
export function daySettled(s: Sheet, since: number): Claim | undefined {
  const fresh = s.claims.filter((x) => Date.parse(x.at) >= since && x.role !== "said");
  if (!fresh.length) return;
  const days = new Set(fresh.map((x) => x.day));
  if (days.size !== 1) return;
  return fresh.sort((a, b) => ODD.indexOf(a.role) - ODD.indexOf(b.role))[0];
}
