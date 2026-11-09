// The empty conversation's words (D149): the line under the greeting, one timely line for a
// returning person, and 3–4 starters, worked out on the home from what it already holds. Only
// names and metadata: the accounts connected (which apps, never their mail), the titles of
// noted lines, task titles and states, folder and project names, device names. Nothing is read
// from inside a mailbox, a folder or a repo, and no model runs. The clients greet by time of day
// themselves and show these words as they are, in their own language (both are sent).
//
// Life first: a code starter only for someone who clearly works on code (two tasks in repos),
// by project name, never a path, and always last. Fresh users get everyday examples (an email,
// a trip, a folder, a reminder). The choice and wording rotate by the person's day, so the
// screen isn't the same three lines every time.
import { basename } from "node:path";
import type { FirstScreen, OnHand, OoApp, StarterKind, TaskCard, Words } from "@ducter/protocol";

export interface FirstScreenInput {
  /** Every task the home knows (TaskRegistry.list()). */
  tasks: TaskCard[];
  onHand: Pick<OnHand, "missed">;
  /** Recent 记下了 / Noted titles, newest first. */
  noted: { title: string; at: string }[];
  /** The apps the person connected (oo's list, or a connection's name). */
  apps: Pick<OoApp, "service" | "title">[];
  /** Computers Ducter can use (the home or a paired one): their names, the home first. */
  computers: { name: string; home: boolean }[];
  /** The person ever said something in the conversation. */
  talked: boolean;
  now: Date;
  /** The person's IANA zone (hello.tz); the home's own when absent. */
  tz?: string;
}

const MAIL = /mail|outlook|imap|exchange|邮/i;
const CALENDAR = /calendar|cal\b|日历|日程/i;
const DAY = 86_400_000;
/** Starters shown: four on the screen, at least three. */
export const STARTERS = 4;
/** Repo tasks that make someone clearly a developer. */
export const DEVELOPER_TASKS = 2;

/** Puts a space between Han and Latin letters or digits (D78), as the clients' autospace does. */
export function space(s: string): string {
  return s
    .replace(/([\p{Script=Han}])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/([A-Za-z0-9%])([\p{Script=Han}])/gu, "$1 $2");
}

/** A title short enough for one line: at most 18 characters (a CJK one counts once). */
export function short(title: string, max = 18): string {
  const s = title.replace(/\s+/g, " ").trim().replace(/[。.！!？?]+$/u, "");
  const cs = [...s];
  return cs.length <= max ? s : cs.slice(0, max - 1).join("").trimEnd() + "…";
}

/** The person's day number in their zone: the rotation's seed. */
export function dayOf(now: Date, tz?: string): number {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return Math.floor(Date.parse(`${p}T00:00:00Z`) / DAY);
  } catch {
    return Math.floor(now.getTime() / DAY);
  }
}

const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return h >>> 0;
};
const pick = <T>(xs: T[], day: number, salt: string): T => xs[(day + hash(salt)) % xs.length]!;
const w = (zh: string, en: string): Words => ({ zh: space(zh), en });

interface Candidate {
  kind: StarterKind;
  key: string; // stable per thing, for the id and the rotation
  words: Words;
}

/** Everyday examples for anyone, by kind: two or three wordings each, rotated by day. */
const EVERYDAY: Record<"mail" | "trip" | "folder" | "reminder" | "plan", Words[]> = {
  mail: [
    w("帮我写封邮件，跟房东说续租的事", "Help me write to my landlord about renewing the lease"),
    w("帮我回封邮件，把周五的会推到下周", "Reply to an email and move Friday's meeting to next week"),
  ],
  trip: [
    w("下个月想去京都，帮我排个行程", "Plan me a few days in Kyoto next month"),
    w("周末带家人去近郊，哪儿好玩？", "Somewhere nearby for the family this weekend?"),
  ],
  folder: [
    w("把下载文件夹里的旧文件理一理", "Tidy up the old files in my Downloads folder"),
    w("桌面太乱了，帮我分类收一收", "Sort my messy desktop into folders"),
  ],
  reminder: [
    w("周五下午提醒我交水电费", "Remind me on Friday afternoon to pay the utility bill"),
    w("明早 9 点提醒我回邮件", "Remind me at 9 tomorrow morning to answer my email"),
  ],
  plan: [w("帮我把这周要做的事理一理", "Help me sort out what I need to do this week"), w("你能帮我做些什么？举三个例子", "What can you do for me? Give me three examples")],
};

function personal(i: FirstScreenInput, day: number): { life: Candidate[]; code?: Candidate } {
  const life: Candidate[] = [];
  const mail = i.apps.find((a) => MAIL.test(a.service) || MAIL.test(a.title));
  const cal = i.apps.find((a) => CALENDAR.test(a.service) || CALENDAR.test(a.title));
  if (mail)
    life.push({
      kind: "mail",
      key: "mail",
      words: pick(
        [w("帮我看看今天有哪些邮件要回", "Which emails today need a reply from me?"), w("这周没回的邮件，挑要紧的说说", "Which unanswered emails this week matter?")],
        day,
        "mail",
      ),
    });
  if (cal)
    life.push({
      kind: "calendar",
      key: "calendar",
      words: pick([w("明天我都有什么安排？", "What's on my calendar tomorrow?"), w("这周哪天下午有空？", "Which afternoon this week am I free?")], day, "calendar"),
    });
  for (const a of i.apps) {
    if (a === mail || a === cal || !a.title) continue;
    life.push({ kind: "app", key: `app:${a.service}`, words: w(`${a.title} 上有没有等我回的？`, `Anything on ${a.title} waiting for me?`) });
  }
  // An unfinished thing from before: the newest noted line of the last three weeks.
  const recent = i.noted.find((n) => i.now.getTime() - Date.parse(n.at) < 21 * DAY);
  if (recent?.title) {
    const t = short(recent.title, 12);
    life.push({ kind: "memory", key: `mem:${recent.title}`, words: w(`接着弄上次的「${t}」`, `Pick up “${t}” from last time`) });
  }
  const byNew = [...i.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const working = byNew.find((t) => t.attention === "working" || t.attention === "blocked");
  if (working) {
    const t = short(working.title);
    life.push({ kind: "task", key: `task:${working.taskId}`, words: w(`「${t}」做到哪了？`, `How far along is “${t}”?`) });
  }
  const folder = byNew.find((t) => t.place.kind === "folder");
  if (folder && folder.place.kind === "folder") {
    const name = basename(folder.place.path);
    life.push({ kind: "folder", key: `folder:${name}`, words: w(`再帮我把「${name}」理一理`, `Tidy up “${name}” again for me`) });
  } else if (i.computers.length && !i.computers[0]!.home) {
    // Ducter lives on a server: the computer it can tidy is a paired one, named. (On a home
    // computer the everyday folder example says the same.)
    const c = i.computers[0]!;
    life.push({ kind: "folder", key: "downloads", words: w(`把 ${c.name} 上的下载文件夹理一理`, `Tidy up the Downloads folder on ${c.name}`) });
  }
  // Clearly a developer: tasks in repos, more than once. One starter, by the project's name.
  const repos = byNew.filter((t) => t.place.kind === "repo");
  let code: Candidate | undefined;
  if (repos.length >= DEVELOPER_TASKS) {
    const r = repos[0]!;
    const name = projectName(r);
    if (name)
      code = {
        kind: "code",
        key: `code:${name}`,
        words: pick(
          [
            w(`说说 ${name} 这周都改了些什么`, `What changed in ${name} this week?`),
            w(`${name} 里有哪些分支没收尾？`, `Which branches in ${name} are unfinished?`),
            w(`${name} 最近有测试没过吗？`, `Any failing tests in ${name} lately?`),
          ],
          day,
          "code",
        ),
      };
  }
  return { life, code };
}

/** A project's name, never its path: the card's project, else the repo folder's name. */
function projectName(t: TaskCard): string {
  const p = t.project?.trim();
  if (p && !p.includes("/") && !p.includes("\\")) return p;
  return t.place.kind === "repo" ? basename(t.place.repoPath) : "";
}

/** Rotates a list by day: a different start each day, the same all day. */
function rotate<T>(xs: T[], day: number): T[] {
  if (xs.length < 2) return xs;
  const k = day % xs.length;
  return [...xs.slice(k), ...xs.slice(0, k)];
}

export function starters(i: FirstScreenInput): FirstScreen["starters"] {
  const day = dayOf(i.now, i.tz);
  const { life, code } = personal(i, day);
  const out: Candidate[] = [];
  const room = STARTERS - (code ? 1 : 0);
  // Personal life starters, rotated so a long list shows different ones on different days; one
  // place is always left for an everyday example, so the screen never reads as a report.
  for (const c of rotate(life, day)) if (out.length < room - 1) out.push(c);
  // Topped up with everyday examples of kinds not already there (a connected mailbox replaces
  // the email example; a folder starter the folder one).
  const have = new Set<string>(out.map((c) => c.kind));
  // A folder example needs a computer to tidy; without one, a plan for the week instead.
  const base: (keyof typeof EVERYDAY)[] = ["mail", "trip", i.computers.length ? "folder" : "plan", "reminder"];
  const kinds = rotate(base, day).filter((k) => !have.has(k));
  for (const k of kinds) {
    if (out.length >= room) break;
    out.push({ kind: "everyday", key: `everyday:${k}`, words: pick(EVERYDAY[k], day, k) });
  }
  if (code) out.push(code); // life first; code last
  return out.map((c) => ({ id: c.key, kind: c.kind, words: c.words }));
}

/** The line under the greeting: what the partner can do for this person, in everyday words. */
export function canLine(i: FirstScreenInput): Words {
  const zh: string[] = [];
  const en: string[] = [];
  if (i.apps.some((a) => MAIL.test(a.service) || MAIL.test(a.title))) zh.push("邮件"), en.push("email");
  if (i.apps.some((a) => CALENDAR.test(a.service) || CALENDAR.test(a.title))) zh.push("日程"), en.push("your calendar");
  if (i.computers.length) zh.push("电脑上的文件"), en.push("files on your computer");
  if (i.tasks.filter((t) => t.place.kind === "repo").length >= DEVELOPER_TASKS) zh.push("代码"), en.push("code");
  const tail = { zh: "需要你的时候，我再来问你。", en: "I'll come to you only when it needs you." };
  if (zh.length >= 2) {
    const list = en.length > 2 ? `${en.slice(0, -1).join(", ")} and ${en.at(-1)}` : en.join(" and ");
    return { zh: space(`${zh.join("、")}，都可以交给我。${tail.zh}`), en: `${list[0]!.toUpperCase()}${list.slice(1)}: hand them to me. ${tail.en}` };
  }
  return { zh: `查点东西、记件事、到点提醒你，说一句就行。${tail.zh}`, en: `Ask me to look something up, keep track of things or remind you on time. ${tail.en}` };
}

/** One timely line for a returning person, only when there is something real. */
export function news(i: FirstScreenInput): FirstScreen["news"] {
  const now = i.now.getTime();
  const byNew = [...i.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const needs = byNew.find((t) => t.attention === "needs_you");
  if (needs) {
    const t = short(needs.title);
    return { kind: "needs_you", taskId: needs.taskId, words: w(`「${t}」在等你一句话。`, `“${t}” is waiting on a word from you.`) };
  }
  const missed = (i.onHand.missed ?? []).find((m) => now - Date.parse(m.endedAt) < DAY);
  if (missed) {
    const r = short(missed.reason);
    return { kind: "missed", words: w(`「${r}」没等到。要接着等吗？`, `“${r}” didn't happen. Keep waiting?`) };
  }
  const done = byNew.find((t) => t.attention === "done" && now - Date.parse(t.updatedAt) < DAY);
  if (done) {
    const t = short(done.title);
    return { kind: "done", taskId: done.taskId, words: w(`「${t}」做好了，结果在这儿。`, `“${t}” is done. The result's here.`) };
  }
  return undefined;
}

export function firstScreen(i: FirstScreenInput): FirstScreen {
  const returning = i.talked || i.tasks.length > 0 || i.noted.length > 0;
  const n = returning ? news(i) : undefined;
  return { visit: returning ? "returning" : "first", line: canLine(i), ...(n ? { news: n } : {}), starters: starters(i) };
}
