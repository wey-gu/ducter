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
import { homedir } from "node:os";
import type { FirstStart, FirstWords, Words } from "@ducter/protocol";
import type { LocalAgent, LocalProject, LocalSession } from "./local-agents/index.ts";
import { space } from "./first-screen.ts";

export interface FirstWordsInput {
  name: string;
  lang: "zh" | "en";
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

/** Good morning / 早上好, by the person's hour. */
export function greet(lang: "zh" | "en", name: string, now: Date, tz?: string): string {
  const h = hourIn(now, tz);
  const zh = h >= 5 && h < 11 ? "早上好" : h < 13 && h >= 11 ? "中午好" : h >= 13 && h < 18 ? "下午好" : h >= 18 && h < 23 ? "晚上好" : "这么晚还没睡？";
  const en = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 18 ? "Good afternoon" : h >= 18 && h < 23 ? "Good evening" : "Up late";
  if (lang === "zh") return space(zh.endsWith("？") ? `${zh}我是${name}。` : `${zh}，我是${name}。`);
  return en === "Up late" ? `Up late? I'm ${name}.` : `${en}, I'm ${name}.`;
}

/** 今天 / 昨天 / 3 天前 / 上周, by the person's calendar day. */
export function whenSaid(lang: "zh" | "en", at: string, now: Date, tz?: string): string {
  const d = dayIn(now, tz) - dayIn(new Date(at), tz);
  if (lang === "zh") return d <= 0 ? "今天" : d === 1 ? "昨天" : d < 7 ? `${d} 天前` : "上周";
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : "Last week";
}

/** Cut to a width (a CJK character counts two), at a word's end when the words are Latin. */
const cut = (s: string, max: number) => {
  const cs = [...s.replace(/[。.！!？?…]+$/u, "").trim()];
  const wide = (c: string) => (/[\u1100-\uffff]/.test(c) ? 2 : 1);
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
  const s: LocalSession = p.sessions.find((x) => x.title || x.ask) ?? p.sessions[0]!;
  const topic = s.title ?? s.ask;
  const when = whenSaid(i.lang, s.at, i.now, i.tz);
  const where = tilde(p.cwd, home);
  const zh = i.lang === "zh";
  if (topic) {
    const t = cut(topic, zh ? 40 : 48);
    return {
      id: `local:${s.agent}:${s.id}`,
      from: s.agent,
      words: zh ? space(`${when}你在 ${p.name} 里做「${t}」，要我接着看看吗？`) : `${when} you were on “${t}” in ${p.name}. Want me to pick it up?`,
      draft: zh ? space(`接着 ${p.name} 里「${t}」这件事：先看看它停在哪儿，再跟我说下一步。（文件夹：${where}）`) : `Pick up “${t}” in ${p.name}: see where it stopped, then tell me the next step. (Folder: ${where})`,
    };
  }
  return {
    id: `local:${s.agent}:${s.id}`,
    from: s.agent,
    words: zh ? space(`${when}你在 ${p.name} 里用过 ${AGENT[s.agent]}，要我看看那儿现在怎么样吗？`) : `${when} you used ${AGENT[s.agent]} in ${p.name}. Want me to see where it stands?`,
    draft: zh ? space(`看看 ${p.name} 现在怎么样：最近改了什么，有没有没收尾的。（文件夹：${where}）`) : `See where ${p.name} stands: what changed lately and what's unfinished. (Folder: ${where})`,
  };
}

export interface FirstWordsOut {
  text: string;
  first: FirstWords;
}

export function firstWords(i: FirstWordsInput): FirstWordsOut {
  const zh = i.lang === "zh";
  const home = i.home ?? homedir();
  const offers = i.projects.slice(0, FIRST_OFFERS).map((p) => offer(p, i, home));
  const looked = [...new Set(i.projects.slice(0, FIRST_OFFERS).flatMap((p) => p.sessions.map((s) => s.agent)))].sort() as LocalAgent[];
  const parts = [greet(i.lang, i.name, i.now, i.tz)];
  if (i.memLine) parts.push(zh ? space(i.memLine.zh) : i.memLine.en);
  if (offers.length) {
    const who = looked.map((a) => AGENT[a]).join(zh ? " 和 " : " and ");
    parts.push(
      zh
        ? space(`我看了看这台电脑上你的 ${who} 最近在做的事，${offers.length > 1 ? "这几件" : "这件"}要不要接着来？`)
        : `I had a look at what your ${who} worked on lately on this computer. Want to pick ${offers.length > 1 ? "one of these" : "this"} up?`,
    );
  } else {
    parts.push(
      zh
        ? "有什么想做的，跟我说一句就行：查点东西、理理文件、写封邮件都可以。大一点的活我交给一个任务去做，做好了再来告诉你。"
        : "Tell me anything you'd like done: look something up, tidy some files, write an email. Bigger work goes to a task, and I come back when it's done.",
    );
  }
  if (i.noBrain)
    parts.push(
      zh
        ? "不过我现在还没有能用来思考的 AI：登录 Claude Code 或 Codex，或者在下面贴一个 API 密钥，我就能开始。"
        : "One thing first: I have nothing to think with yet. Sign in to Claude Code or Codex, or paste an API key below, and I'm ready.",
    );
  const starts: FirstStart[] = [...offers];
  // One everyday example after the person's own things (life is more than code), three without them.
  const want = offers.length ? Math.min(FIRST_STARTS, offers.length + 1) : 3;
  for (const w of i.everyday) {
    if (starts.length >= want) break;
    const text = zh ? space(w.zh) : w.en;
    if (!starts.some((s) => s.draft === text)) starts.push({ id: `everyday:${starts.length}`, from: "everyday", words: text, draft: text });
  }
  const text = zh ? parts.join("") : parts.join(" ");
  return { text, first: { starts, ...(looked.length ? { looked } : {}) } };
}
