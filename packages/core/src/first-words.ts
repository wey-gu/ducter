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
import { homedir } from "node:os";
import { fill, words, type FirstStart, type FirstWords, type LangTag, type Words } from "@ducter/protocol";
import type { LocalAgent, LocalProject, LocalSession } from "./local-agents/index.ts";
import { space } from "./first-screen.ts";

export interface FirstWordsInput {
  name: string;
  /** The hello's language (any tag; zh and en have tables, the rest fall back to English). */
  lang: LangTag;
  now: Date;
  tz?: string;
  /** Recent folders from the person's own agents (empty when looking is off or nothing was found). */
  projects: LocalProject[];
  /** Everyday starters (first-screen.ts), both languages. */
  everyday: Words[];
  /** Nothing on the home can think yet. */
  noBrain?: boolean;
  /** D295's hook: one line from Nowledge Mem about the person, when Mem is connected (not wired yet). */
  memLine?: Words;
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
  plain: string;
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
    looked: "我看了看这台电脑上你的 {who} 最近在做的事，这几件要不要接着来？",
    lookedOne: "我看了看这台电脑上你的 {who} 最近在做的事，这件要不要接着来？",
    plain: "有什么想做的，跟我说一句就行：查点东西、理理文件、写封邮件都可以。大一点的活我交给一个任务去做，做好了再来告诉你。",
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
    looked: "I had a look at what your {who} worked on lately on this computer. Want to pick one of these up?",
    lookedOne: "I had a look at what your {who} worked on lately on this computer. Want to pick this up?",
    plain: "Tell me anything you'd like done: look something up, tidy some files, write an email. Bigger work goes to a task, and I come back when it's done.",
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

const AGENT: Record<LocalAgent, string> = { "claude-code": "Claude Code", codex: "Codex" };

/** One offer for one folder: its newest session with something to say. */
function offer(p: LocalProject, i: FirstWordsInput, home: string): FirstStart {
  const t = words(T, i.lang);
  const s: LocalSession = p.sessions.find((x) => x.title || x.ask) ?? p.sessions[0]!;
  const topic = s.title ?? s.ask;
  const vars = { when: whenSaid(i.lang, s.at, i.now, i.tz), folder: p.name, path: tilde(p.cwd, home), agent: AGENT[s.agent], topic: topic ? cut(topic, t.width) : "" };
  return {
    id: `local:${s.agent}:${s.id}`,
    from: s.agent,
    words: space(fill(topic ? t.offer : t.bare, vars)),
    draft: space(fill(topic ? t.offerDraft : t.bareDraft, vars)),
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
  if (i.memLine) parts.push(space(pairIn(i.memLine, i.lang)));
  if (offers.length) parts.push(space(fill(offers.length > 1 ? t.looked : t.lookedOne, { who: looked.map((a) => AGENT[a]).join(t.and) })));
  else parts.push(t.plain);
  if (i.noBrain) parts.push(t.noBrain);
  const starts: FirstStart[] = [...offers];
  // One everyday example after the person's own things (life is more than code), three without them.
  const want = offers.length ? Math.min(FIRST_STARTS, offers.length + 1) : 3;
  for (const w of i.everyday) {
    if (starts.length >= want) break;
    const text = space(pairIn(w, i.lang));
    if (!starts.some((s) => s.draft === text)) starts.push({ id: `everyday:${starts.length}`, from: "everyday", words: text, draft: text });
  }
  return { text: parts.join(t.join), first: { starts, ...(looked.length ? { looked } : {}) } };
}
