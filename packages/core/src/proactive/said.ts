// D281: the person's own words as finds of their own (你说过的 / You said). Code, no model: a
// reminder they asked for ("周五下午提醒我交水电费", "remind me tomorrow to call Leo"), a thing they
// said they would do on a day ("我明天要给张三回邮件", "I need to renew the passport on Friday"),
// and the partner's own promise to remind ("好，明天提醒你"). The partner's wait_until is still the
// way a reminder is kept; this is the net under it: what the person was told would happen happens,
// even when no wait was armed in that turn. Precision over recall: a casual "回头看看" with no day
// is never kept, and a recurring ask ("每周一…") is a routine's, not this.

export interface OwnWords {
  /** They asked to be reminded (or the partner promised to remind them): kept in every mode, 不用主动找我 too. */
  asked: boolean;
  /** What it is about, in their words, clipped ("交水电费"). */
  what: string;
  /** When: an exact time, or a day (its start in their zone, `timed` false), or none (asked, no day: the next morning). */
  dueAt?: string;
  timed: boolean;
}

const DAY = 86_400_000;

// ---------- local dates in a zone ----------

const FMT = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, zone: string) {
  let f = FMT.get(zone);
  if (!f) FMT.set(zone, (f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })));
  const p = f.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")), h: Number(g("hour")), min: Number(g("minute")), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
}
/** The instant a local wall time in `zone` names (two passes settle a DST edge). */
export function atLocal(y: number, m: number, d: number, h: number, min: number, zone: string): number {
  const want = Date.UTC(y, m - 1, d, h, min);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = parts(t, zone);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  return t;
}

// ---------- the words ----------

const ZH_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const zhNum = (s: string): number => {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (ZH_DIGIT[s[1]!] ?? 0);
  if (s.endsWith("十")) return (ZH_DIGIT[s[0]!] ?? 0) * 10;
  if (s.includes("十")) return (ZH_DIGIT[s[0]!] ?? 0) * 10 + (ZH_DIGIT[s[2]!] ?? 0);
  return ZH_DIGIT[s] ?? NaN;
};
const ZH_WD: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** A request to be reminded. */
const ASK = /提醒我|叫我一声|叫一下我|别让我忘|记得叫我|\bremind me\b|\bdon'?t let me forget\b|\bping me\b/i;
/** The partner promising to remind. */
const PROMISE = /提醒你|\bI'?ll remind you\b|\bI will remind you\b|\bI'?ll ping you\b/i;
/** The partner saying it won't, or can't. */
const REFUSE = /不用|不会|没法|无法|不能|不再|\bcan'?t\b|\bcannot\b|\bwon'?t\b|\bwill not\b/i;
/** Something they said they would do themselves. */
const SELF = /(?:^|[，,。\s])我[^。！？\n]{0,8}(?:要|得|得去|需要|打算|准备|会去|该)|\bI(?:'ll| will| need to| have to| must| should| am going to|'m going to| gotta)\b/i;
/** Recurring: a routine's, never a one-off reminder. */
const RECURRING = /每天|每周|每个?月|每晚|每早|天天|\bevery (?:day|week|month|morning|evening|night|mon|tue|wed|thu|fri|sat|sun)/i;
/** Not about the future at all ("我刚提醒你", "remind me what…"). */
/** A guess or a state of being, not a thing to do. */
const HEDGE = /觉得|可能|也许|大概|估计|好像|\bmaybe\b|\bprobably\b|\bI think\b|\bI'?ll be (?:in|at|on|away|out|back|home|busy|free|off)\b/i;
const NOT = /提醒我一下[^。！？\n]{0,6}(?:是什么|是啥|怎么)|\bremind me (?:what|who|how|why|where|which)\b|上次|刚才|刚刚/i;

interface When {
  at?: number;
  timed: boolean;
  /** The span the date words took, removed from `what`. */
  spans: string[];
}

function when(text: string, now: number, zone: string): When | undefined {
  const p = parts(now, zone);
  const spans: string[] = [];
  let dayOff: number | undefined;
  let h: number | undefined;
  let min = 0;
  let part: "am" | "noon" | "pm" | "eve" | undefined;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text);
    if (m) spans.push(m[0]);
    return m;
  };
  // relative: 半小时后 / 20 分钟后 / in 2 hours
  let m = take(/(半|\d+|[一二两三四五六七八九十]+)\s*(个)?\s*(小时|钟头|分钟)(?:之?后|以后)/);
  if (m) {
    const n = m[1] === "半" ? 0.5 : zhNum(m[1]!);
    return { at: now + n * (m[3] === "分钟" ? 60_000 : 3_600_000), timed: true, spans };
  }
  m = take(/\bin (\d+|an?|one|two|three|half an) (minutes?|hours?|mins?)\b/i);
  if (m) {
    const w = m[1]!.toLowerCase();
    const n = /^\d+$/.test(w) ? Number(w) : w === "half an" ? 0.5 : w === "two" ? 2 : w === "three" ? 3 : 1;
    return { at: now + n * (/^h/i.test(m[2]!) ? 3_600_000 : 60_000), timed: true, spans };
  }
  // days: the first day word in the line is the one it is about ("我明天要…，今天太累了")
  const zhWeek = (g: RegExpExecArray): number => {
    const wd = ZH_WD[g[2]!]!;
    if (g[1]?.startsWith("下")) return (wd || 7) - (p.wd || 7) + 7 * (g[1] === "下下" ? 2 : 1);
    const off = (wd - p.wd + 7) % 7;
    return off === 0 ? 7 : off;
  };
  const enWeek = (g: RegExpExecArray): number => {
    const wd = EN_WD.indexOf(g[2]!.toLowerCase());
    let off = (wd - p.wd + 7) % 7;
    if (off === 0) off = 7;
    if (/next/i.test(g[1] ?? "") && wd !== 0 && p.wd !== 0 && wd > p.wd) off += 7;
    return off;
  };
  const DAYS: [RegExp, (g: RegExpExecArray) => { off: number; part?: typeof part }][] = [
    [/今晚|今天晚上|\btonight\b/i, () => ({ off: 0, part: "eve" })],
    [/今天|今儿|\btoday\b|\bthis (?:afternoon|evening)\b/i, () => ({ off: 0 })],
    [/明早|明天早上|明天上午|\btomorrow morning\b/i, () => ({ off: 1, part: "am" })],
    [/明晚|明天晚上|\btomorrow (?:evening|night)\b/i, () => ({ off: 1, part: "eve" })],
    [/明天|明儿|明日|\btomorrow\b/i, () => ({ off: 1 })],
    [/大后天/, () => ({ off: 3 })],
    [/(?<!大)后天/, () => ({ off: 2 })],
    [/(下下|下个?|这个?|本)?(?:周|星期|礼拜)([一二三四五六日天])/, (g) => ({ off: zhWeek(g) })],
    [/\b(next |this |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, (g) => ({ off: enWeek(g) })],
  ];
  let first: { i: number; len: number; g: RegExpExecArray; f: (g: RegExpExecArray) => { off: number; part?: typeof part } } | undefined;
  for (const [re, f] of DAYS) {
    const g = re.exec(text);
    if (g && (!first || g.index < first.i || (g.index === first.i && g[0].length > first.len))) first = { i: g.index, len: g[0].length, g, f };
  }
  if (first) {
    spans.push(first.g[0]);
    const d = first.f(first.g);
    dayOff = d.off;
    if (d.part) part = d.part;
  }
  // parts of the day
  if (!part) {
    if (take(/早上|上午|早晨|\bmorning\b/i)) part = "am";
    else if (take(/中午|\bnoon\b/i)) part = "noon";
    else if (take(/下午|\bafternoon\b/i)) part = "pm";
    else if (take(/晚上|傍晚|\bevening\b|\bnight\b/i)) part = "eve";
  }
  // a clock time
  if ((m = take(/(\d{1,2})[:：](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i))) {
    h = Number(m[1]);
    min = Number(m[2]);
    if (/^p/i.test(m[3] ?? "") && h < 12) h += 12;
    if (/^a/i.test(m[3] ?? "") && h === 12) h = 0;
  } else if ((m = take(/(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*点\s*(半|一刻|三刻|(\d{1,2}|[一二三四五六七八九十]{1,3})\s*分?)?/))) {
    h = zhNum(m[1]!);
    min = m[2] === "半" ? 30 : m[2] === "一刻" ? 15 : m[2] === "三刻" ? 45 : m[3] ? zhNum(m[3]) : 0;
  } else if ((m = take(/(?:\bat\s+)?\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i))) {
    h = Number(m[1]);
    if (/^p/i.test(m[2]!) && h < 12) h += 12;
    if (/^a/i.test(m[2]!) && h === 12) h = 0;
  } else if ((m = take(/\bat (\d{1,2})\b/i))) h = Number(m[1]);
  if (h !== undefined && (Number.isNaN(h) || h > 23 || min > 59)) h = undefined;
  if (h !== undefined && h < 12 && (part === "pm" || part === "eve")) h += 12;
  if (h === undefined && part) h = part === "am" ? 9 : part === "noon" ? 12 : part === "pm" ? 15 : 20;
  if (dayOff === undefined && h === undefined) return undefined;
  const timed = h !== undefined;
  let off = dayOff ?? 0;
  const base = now + off * DAY;
  const bp = parts(base, zone);
  let at = atLocal(bp.y, bp.m, bp.d, h ?? 0, timed ? min : 0, zone);
  // A time with no day that has passed today ("3 点" at 16:00) is tomorrow's.
  if (dayOff === undefined && timed && at <= now) {
    off = 1;
    const np = parts(now + DAY, zone);
    at = atLocal(np.y, np.m, np.d, h!, min, zone);
  }
  return { at, timed, spans };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function whatOf(text: string, w: When | undefined, trigger: RegExp): string {
  let s = text;
  for (const x of w?.spans ?? []) s = s.replace(x, " ");
  s = s.replace(trigger, " ");
  s = s
    .replace(/^[\s，,。:：]*(好的?|嗯|ok|okay|hey|please|麻烦|帮我|请)[\s，,。]*/i, "")
    .replace(/(的时候|之前|以前)?(一下|一声)?/g, (x) => (x.startsWith("的时候") || x.startsWith("之前") ? x : ""))
    .replace(/^(?:我|I)\s*(?:要|得|需要|打算|准备|会|该|'ll|will|need to|have to|must|should|am going to|'m going to|gotta)\s*/i, "")
    .replace(/^\s*(?:to|that|about|我|你)\s+/i, "")
    .replace(/^[\s，,、]*(要|记得|该)/, "")
    .replace(/[\s，,。.！!？?~～]+$/g, "")
    .replace(/^[\s，,。:：]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clip(s, 40);
}

/** The person's own line (or the partner's): what it holds for later, if anything. */
export function ownWords(text: string, now: number, zone: string, who: "user" | "partner"): OwnWords | undefined {
  const t = text.trim();
  if (!t || t.length > 300 || RECURRING.test(t) || NOT.test(t)) return;
  // One sentence is enough: the first one that holds the trigger.
  const sentences = t.split(/(?<=[。！？!?\n])|(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
  const trig = who === "partner" ? PROMISE : ASK;
  const s0 = sentences.find((x) => trig.test(x)) ?? (who === "user" ? sentences.find((x) => SELF.test(x)) : undefined);
  if (!s0) return;
  const asked = trig.test(s0);
  // The clause it is said in ("我明天要回邮件，今天太累了": not the second half), when it holds a day or a time.
  const clause = s0.split(/[，,；;]\s*/).find((x) => (asked ? trig : SELF).test(` ${x}`));
  const s = clause && when(clause, now, zone) ? clause : s0;
  if (who === "partner" && REFUSE.test(s)) return;
  const w = when(s, now, zone);
  // The partner's "提醒你一下" is a heads-up now; only a promise with a day or a time is one.
  if (who === "partner" && !w) return;
  // Something they'll do themselves is kept only with a day or a time: "我回头看看" is not a promise.
  if (!asked && !w) return;
  // A question, a guess or a state ("我明天要不要去？", "我觉得明天会下雨", "I'll be in Tokyo") is not a promise.
  if (!asked && (/[？?]|要不要|吗|呢/.test(s0) || HEDGE.test(s0))) return;
  if (w?.at !== undefined && w.at <= now) return;
  // Too far ahead to be this net's (a date next month belongs in a calendar or a routine).
  if (w?.at !== undefined && w.at - now > 14 * DAY) return;
  const what = whatOf(s, w, asked ? trig : /$^/);
  if (what.length < 2) return;
  return { asked, what, ...(w?.at !== undefined ? { dueAt: new Date(w.at).toISOString() } : {}), timed: Boolean(w?.timed) };
}
