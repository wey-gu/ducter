// The partner's first words (D298): a real message in the Log, said by the home the first time
// someone opens the conversation, so it is there within a second and the partner knows it said it.
// No model runs for it (nothing may be signed in yet, and the first second shouldn't cost a
// thing); the words are worked out from what the home holds and, unless the person said no, from
// their own Claude Code and Codex records on this computer (local-agents/), which never leave it
// except as these words, which go where the person's own words go: to the model they chose.
//
// Specific before general: two or three things the person was doing lately, by folder and title,
// each a tap that fills the composer (never sends); then everyday examples to make three. Nothing
// found, or looking turned off: a warm hello and everyday examples. Nothing to think with yet: it
// says so, and how to fix it in one step (sign in, or paste a key).
//
// D292: the words are per-language tables picked by the hello's language (lang.ts words()); a
// language without a table gets English.
import { homedir, tmpdir } from "node:os";
import { basename, resolve, sep } from "node:path";
import { HIDDEN } from "@ducter/protocol/src/redact.ts";
import { fill, words, type FirstStart, type FirstWords, type LangTag, type Words } from "@ducter/protocol";
import type { LocalAgent, LocalAgents, SessionSummary } from "./local-agents/index.ts";
import { space } from "./first-screen.ts";

/** A folder the person worked in lately with their own agents, and its sessions, newest first. */
export interface FirstFolder {
  cwd: string;
  name: string;
  sessions: SessionSummary[];
}

const under = (p: string, root: string) => {
  const a = resolve(p);
  const b = resolve(root);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
};

/**
 * The folders for the first words, from D299's reader of the agents' own records: the newest
 * sessions of the last `days` (default 14), at most `files` per agent (default 40), grouped by
 * folder; never the home itself, a temporary folder, or Ducter's own (its data and Ducter folders).
 */
export function recentFolders(reader: Pick<LocalAgents, "sessions">, o: { now?: Date; days?: number; files?: number; exclude?: string[]; home?: string; leftOut?: (cwd: string) => boolean } = {}): FirstFolder[] {
  const now = (o.now ?? new Date()).getTime();
  const since = now - (o.days ?? 14) * DAY;
  const home = o.home ?? homedir();
  const skip = [tmpdir(), "/tmp", "/private/tmp", "/private/var/folders", "/var/folders", ...(o.exclude ?? [])];
  const by = new Map<string, FirstFolder>();
  for (const s of reader.sessions({ limit: o.files ?? 40 })) {
    const at = Date.parse(s.updatedAt);
    if (!(at >= since) || !s.cwd.startsWith("/") || resolve(s.cwd) === resolve(home) || resolve(s.cwd) === "/") continue;
    if (skip.some((r) => r && under(s.cwd, r))) continue;
    if (o.leftOut?.(s.cwd)) continue; // D327: a folder the person left out
    const key = resolve(s.cwd);
    const f = by.get(key) ?? { cwd: key, name: basename(key), sessions: [] };
    f.sessions.push(s);
    by.set(key, f);
  }
  return [...by.values()].sort((a, b) => Date.parse(b.sessions[0]!.updatedAt) - Date.parse(a.sessions[0]!.updatedAt));
}

export interface FirstWordsInput {
  name: string;
  /** The hello's language (any tag; zh and en have tables, the rest fall back to English). */
  lang: LangTag;
  now: Date;
  tz?: string;
  /** Recent folders from the person's own agents (empty when looking is off or nothing was found). */
  projects: FirstFolder[];
  /** Everyday starters (first-screen.ts), both languages. */
  everyday: Words[];
  /** Nothing on the home can think yet. */
  noBrain?: boolean;
  /** D327: the home's own name ("Wey’s MacBook Pro"), said where the records were read; absent: "this computer". */
  computer?: string;
  /**
   * D327: the agents that kept records here lately (by file times alone): the first words offer
   * to look at them, a start whose tap is the person's yes. Nothing is read before that tap.
   */
  canLook?: LocalAgent[];
  /**
   * D329: the person's own Nowledge Mem answers on the home, signed in, and memory is on. The first
   * words say so in one line (nothing in Mem is read for it: D327's rule holds for every source), and
   * one start asks what it remembers, whose tap fills the composer; sent, the partner looks then.
   */
  mem?: boolean;
  home?: string;
}

/** At most this many offers from the person's own work, and this many starts in all. */
export const FIRST_OFFERS = 3;
export const FIRST_STARTS = 4;

const DAY = 86_400_000;

interface Table {
  /** How the sentences join. */
  join: string;
  /** Morning, noon, afternoon, evening, late: "{name}" is the partner's name. */
  hello: [string, string, string, string, string];
  /** Today, yesterday, {n} days ago, last week. */
  when: [string, string, string, string];
  and: string;
  looked: string;
  lookedOne: string;
  /** Where the records were read: this computer, or the home by its name (D327). */
  here: string;
  on: string;
  plain: string;
  /** D327: the start that asks to look, and the answer when nothing was found. */
  look: string;
  none: string;
  /** What an answer to a look says once what it found was forgotten. */
  forgotten: string;
  /** D329: Mem is there (status only), and the start that asks what it remembers. */
  mem: string;
  memAsk: string;
  noBrain: string;
  offer: string;
  offerDraft: string;
  bare: string;
  bareDraft: string;
  /** A topic's width on screen (a CJK character counts two). */
  width: number;
}

const T: { en: Table } & Partial<Record<LangTag, Table>> = {
  zh: {
    join: "",
    hello: ["早上好，我是{name}。", "中午好，我是{name}。", "下午好，我是{name}。", "晚上好，我是{name}。", "这么晚还没睡？我是{name}。"],
    when: ["今天", "昨天", "{n} 天前", "上周"],
    and: " 和 ",
    looked: "我看了看{where}你的 {who} 最近在做的事，这几件要不要接着来？",
    lookedOne: "我看了看{where}你的 {who} 最近在做的事，这件要不要接着来？",
    here: "这台电脑上",
    on: "{computer} 上",
    plain: "有什么想做的，跟我说一句就行：查点东西、理理文件、写封邮件都可以。大一点的活我交给一个任务去做，做好了再来告诉你。",
    look: "接着我最近在 {who} 里做的事",
    none: "我看了看{where}你的 {who} 最近两周的记录，没找到能接着做的事。想做什么，直接跟我说就行。",
    forgotten: "从 {who} 的记录里看到的几件事，按你说的忘掉了。",
    mem: "你的 Nowledge Mem 我也接上了：你跟别的 AI 交代过的习惯，用得着的时候我会想起来。",
    memAsk: "你都记得我些什么？",
    noBrain: "不过我现在还没有能用来思考的 AI：登录 Claude Code 或 Codex，或者在下面贴一个 API 密钥，我就能开始。",
    offer: "{when}你在 {folder} 里做「{topic}」，要我接着看看吗？",
    offerDraft: "接着 {folder} 里「{topic}」这件事：先看看它停在哪儿，再跟我说下一步。（文件夹：{path}）",
    bare: "{when}你在 {folder} 里用过 {agent}，要我看看那儿现在怎么样吗？",
    bareDraft: "看看 {folder} 现在怎么样：最近改了什么，有没有没收尾的。（文件夹：{path}）",
    width: 40,
  },
  en: {
    join: " ",
    hello: ["Good morning, I'm {name}.", "Hi there, I'm {name}.", "Good afternoon, I'm {name}.", "Good evening, I'm {name}.", "Up late? I'm {name}."],
    when: ["Today", "Yesterday", "{n} days ago", "Last week"],
    and: " and ",
    looked: "I had a look at what your {who} worked on lately {where}. Want to pick one of these up?",
    lookedOne: "I had a look at what your {who} worked on lately {where}. Want to pick this up?",
    here: "on this computer",
    on: "on {computer}",
    plain: "Tell me anything you'd like done: look something up, tidy some files, write an email. Bigger work goes to a task, and I come back when it's done.",
    look: "Pick up what I was doing in {who} lately",
    none: "I looked at your {who} records from the last two weeks {where} and found nothing to pick up. Tell me what you'd like to do.",
    forgotten: "What I found in your {who} records is forgotten, as you asked.",
    mem: "I'm on your Nowledge Mem too: whatever you told your other AI tools about how you like things, I'll recall when it matters.",
    memAsk: "What do you remember about me?",
    noBrain: "One thing first: I have nothing to think with yet. Sign in to Claude Code or Codex, or paste an API key below, and I'm ready.",
    offer: "{when} you were on “{topic}” in {folder}. Want me to pick it up?",
    offerDraft: "Pick up “{topic}” in {folder}: see where it stopped, then tell me the next step. (Folder: {path})",
    bare: "{when} you used {agent} in {folder}. Want me to see where it stands?",
    bareDraft: "See where {folder} stands: what changed lately and what's unfinished. (Folder: {path})",
    width: 48,
  },
};

/** The words of a both-languages pair in this language (a table per language, D292). */
const pairIn = (w: Words, lang: LangTag) => words<string>({ en: w.en, zh: w.zh }, lang);

function hourIn(now: Date, tz?: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz || undefined, hour: "2-digit", hourCycle: "h23" }).format(now));
  } catch {
    return now.getHours();
  }
}

function dayIn(t: Date, tz?: string): number {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
    return Math.floor(Date.parse(`${p}T00:00:00Z`) / DAY);
  } catch {
    return Math.floor(t.getTime() / DAY);
  }
}

/** Good morning / 早上好, by the person's hour, in the partner's name. */
export function greet(lang: LangTag, name: string, now: Date, tz?: string): string {
  const h = hourIn(now, tz);
  const i = h >= 5 && h < 11 ? 0 : h >= 11 && h < 13 ? 1 : h >= 13 && h < 18 ? 2 : h >= 18 && h < 23 ? 3 : 4;
  return space(fill(words(T, lang).hello[i]!, { name }));
}

/** 今天 / 昨天 / 3 天前 / 上周, by the person's calendar day. */
export function whenSaid(lang: LangTag, at: string, now: Date, tz?: string): string {
  const d = dayIn(now, tz) - dayIn(new Date(at), tz);
  const w = words(T, lang).when;
  return d <= 0 ? w[0] : d === 1 ? w[1] : d < 7 ? fill(w[2], { n: d }) : w[3];
}

/** Cut to a width (a CJK character counts two), at a word's end when the words are Latin. */
const cut = (s: string, max: number) => {
  const cs = [...s.replace(/[。.！!？?…]+$/u, "").trim()];
  const wide = (c: string) => (/[ᄀ-￿]/.test(c) ? 2 : 1);
  let w = 0;
  let n = 0;
  for (; n < cs.length && w + wide(cs[n]!) <= max; n++) w += wide(cs[n]!);
  if (n >= cs.length) return cs.join("");
  let head = cs.slice(0, n).join("");
  const gap = head.lastIndexOf(" ");
  if (/[A-Za-z0-9]/.test(cs[n]!) && gap > head.length * 0.5) head = head.slice(0, gap);
  return head.trimEnd().replace(/[,，、:：;；-]+$/u, "") + "…";
};

const tilde = (p: string, home: string) => (p === home ? "~" : p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);

const AGENT: Record<LocalAgent, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "pi" };

/** One offer for one folder: its newest session with something to say. */
function offer(p: FirstFolder, i: FirstWordsInput, home: string): FirstStart {
  const t = words(T, i.lang);
  const s = p.sessions.find((x) => x.title || x.firstPrompt) ?? p.sessions[0]!;
  // D327: a title that had a key in it is never offered: the folder alone is (the bare offer).
  const said = s.title ?? s.firstPrompt;
  const topic = said && !said.includes(HIDDEN) ? said : undefined;
  const vars = { when: whenSaid(i.lang, s.updatedAt, i.now, i.tz), folder: p.name, path: tilde(p.cwd, home), agent: AGENT[s.agent], topic: topic ? cut(topic, t.width) : "" };
  return {
    id: `local:${s.agent}:${s.id}`,
    from: s.agent,
    words: space(fill(topic ? t.offer : t.bare, vars)),
    draft: space(fill(topic ? t.offerDraft : t.bareDraft, vars)),
    path: vars.path,
    at: s.updatedAt,
  };
}

export interface FirstWordsOut {
  text: string;
  first: FirstWords;
}

export function firstWords(i: FirstWordsInput): FirstWordsOut {
  const t = words(T, i.lang);
  const home = i.home ?? homedir();
  const offers = i.projects.slice(0, FIRST_OFFERS).map((p) => offer(p, i, home));
  const looked = [...new Set(i.projects.slice(0, FIRST_OFFERS).flatMap((p) => p.sessions.map((s) => s.agent)))].sort() as LocalAgent[];
  const parts = [greet(i.lang, i.name, i.now, i.tz)];
  if (i.mem) parts.push(space(t.mem));
  const where = i.computer ? fill(t.on, { computer: i.computer }) : t.here;
  if (offers.length) parts.push(space(fill(offers.length > 1 ? t.looked : t.lookedOne, { who: looked.map((a) => AGENT[a]).join(t.and), where })));
  else parts.push(t.plain);
  if (i.noBrain) parts.push(t.noBrain);
  const starts: FirstStart[] = [...offers];
  // D327: nothing read yet, but their agents kept records here: the first start asks to look.
  if (!offers.length && i.canLook?.length) {
    const look = space(fill(t.look, { who: i.canLook.map((a) => AGENT[a]).join(t.and) }));
    starts.push({ id: "look", from: "look", words: look, draft: look });
  }
  // D329: with Mem there, one start asks what it remembers (an everyday start: no record was read).
  if (i.mem) starts.push({ id: "mem", from: "everyday", words: space(t.memAsk), draft: space(t.memAsk) });
  // One everyday example after the person's own things (life is more than code), three without them.
  const want = offers.length ? Math.min(FIRST_STARTS, offers.length + 1) : 3;
  for (const w of i.everyday) {
    if (starts.length >= want) break;
    const text = space(pairIn(w, i.lang));
    if (!starts.some((s) => s.draft === text)) starts.push({ id: `everyday:${starts.length}`, from: "everyday", words: text, draft: text });
  }
  return { text: parts.join(t.join), first: { starts, ...(looked.length ? { looked, ...(i.computer ? { computer: i.computer } : {}) } : {}) } };
}

/**
 * D327: the first words with what came from the records forgotten: every start read from them (or,
 * with `folder`, only those for that folder and the folders inside it) goes, and when none is left
 * the sentence that said where they were read gives way to the everyday line. The greeting and the
 * everyday examples stay. Undefined when nothing changes.
 */
export function forgetFirstWords(body: { text: string; first?: FirstWords }, o: { folder?: string; home?: string } = {}): { text: string; first: FirstWords } | undefined {
  const fw = body.first;
  if (!fw) return undefined;
  const home = o.home ?? homedir();
  const abs = (p: string) => resolve(p === "~" ? home : p.startsWith("~/") ? home + p.slice(1) : p);
  const goes = (s: FirstStart) => s.from !== "everyday" && (!o.folder || (s.path !== undefined && under(abs(s.path), abs(o.folder))));
  const starts = fw.starts.filter((s) => !goes(s));
  if (starts.length === fw.starts.length && (o.folder || fw.forgot)) return undefined;
  let text = body.text;
  if (!starts.some((s) => s.from !== "everyday") && fw.looked?.length) {
    // The sentence is the home's own template: found in either table, it gives way to the everyday line.
    // An answer to the person's look says that it forgot; the first words say the everyday line.
    for (const t of Object.values(T) as Table[]) {
      const where = fw.computer ? fill(t.on, { computer: fw.computer }) : t.here;
      const who = fw.looked.map((a) => AGENT[a]).join(t.and);
      for (const pat of [t.looked, t.lookedOne, t.none]) {
        const said = space(fill(pat, { who, where }));
        if (text.includes(said)) text = fw.look ? space(fill(t.forgotten, { who })) : text.replace(said, t.plain);
      }
    }
  }
  return { text, first: { ...fw, starts, ...(o.folder ? {} : { forgot: true as const }) } };
}

/**
 * D327: the answer to the person's look tap: what their agents did lately (D298's offers, each with
 * where it was read and when), or, when nothing is there, that nothing was found. No everyday
 * examples (the first words already have them) and no greeting (it is an answer).
 */
export function lookWords(i: Omit<FirstWordsInput, "name" | "everyday" | "noBrain" | "canLook" | "mem"> & { agents: LocalAgent[] }): FirstWordsOut {
  const t = words(T, i.lang);
  const home = i.home ?? homedir();
  const offers = i.projects.slice(0, FIRST_OFFERS).map((p) => offer(p, { ...i, name: "", everyday: [] }, home));
  const found = [...new Set(i.projects.slice(0, FIRST_OFFERS).flatMap((p) => p.sessions.map((s) => s.agent)))].sort() as LocalAgent[];
  const looked = found.length ? found : [...i.agents].sort();
  const where = i.computer ? fill(t.on, { computer: i.computer }) : t.here;
  const who = looked.map((a) => AGENT[a]).join(t.and);
  const text = space(fill(offers.length ? (offers.length > 1 ? t.looked : t.lookedOne) : t.none, { who, where }));
  return { text, first: { starts: offers, ...(looked.length ? { looked } : {}), ...(i.computer ? { computer: i.computer } : {}), look: true } };
}
