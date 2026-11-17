// D295: a pretend Nowledge Mem for the demo core, so Settings › 记忆 and › 连上的 AI agent can be
// seen in each state without touching the machine's real nmem or Mem. DEMO_MEM picks the state:
// cloud (default: signed in to Nowledge Mem Cloud, the persona connected with your AI agents),
// local (the Mem app on this computer), ready (signed in, not yet connected), signin (nmem here,
// not signed in), install (no nmem here), none (memory on, no Mem answer at all).
// D321: the pretend Mem has Mem's own kinds, answers search, and forgets and fixes in place.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type DemoMem = "cloud" | "local" | "ready" | "signin" | "install" | "none";

export const demoMem = (): DemoMem => {
  const v = process.env.DEMO_MEM ?? "cloud";
  return (["cloud", "local", "ready", "signin", "install", "none"] as const).includes(v as DemoMem) ? (v as DemoMem) : "cloud";
};

const SPACE = { id: "personal-4e742092-837d-4438-a2b3-55ada58d8e65", label: "Only me" };

/**
 * D321: a pretend Mem with its own kinds (preference, decision, fact, context), like the real one: the
 * person's ways told to Ducter, kept by Codex or distilled by Mem; decisions they made; facts about
 * their people; and the other tools' working notes (context, plan), which the page only counts.
 */
function memories(zh: boolean) {
  const day = 86_400_000;
  const at = (d: number) => new Date(Date.now() - d * day).toISOString();
  const m = (id: string, source: string, unit_type: string, title: string, d: number) => ({ id, title, content: "", importance: 0.7, source, unit_type, created_at: at(d), space_id: SPACE.id });
  return [
    m("m_cc1", "claude-code", "context", zh ? "Ducter 的 Go 代码提交前先跑 gofmt -l" : "Run gofmt -l before committing Ducter's Go code", 0.2),
    m("m_cx1", "codex", "context", "nowledge-co/mem#10358: AI Now subject continuity after assistant alternatives", 0.3),
    m("m_cx3", "codex", "plan", zh ? "HawDB compaction：先修 Linux CI 的偶发失败" : "HawDB compaction: fix the Linux CI flake first", 0.6),
    m("m_p1", "ducter", "preference", zh ? "喜欢先看结论，细节放后面" : "Likes the conclusion first, details after", 1),
    m("m_cx4", "codex", "context", "Nowledge Labs company SVG A — repository rollout", 1.1),
    m("m_p2", "codex", "preference", zh ? "聊天用中文，仓库里的文档和代码用英文" : "Chat in Chinese; docs and code in the repo in English", 1.5),
    m("m_d1", "ducter", "decision", zh ? "周报每周五下午发，发给 Nowledge 全组" : "The weekly report goes out Friday afternoon, to the whole Nowledge team", 2),
    m("m_cc2", "claude-code", "context", zh ? "发版前先在 Bun 1.4.4 上跑一遍测试" : "Run the tests on Bun 1.4.4 before a release", 2.2),
    m("m_p3", "thread_distillation", "preference", zh ? "英文邮件回得短、口语，不用敬语" : "English mail: short and plain, no formalities", 3),
    m("m_f1", "ducter", "fact", zh ? "Weizhen 负责 HawDB 的代码评审" : "Weizhen reviews HawDB's code", 3.5),
    m("m_p4", "ducter", "preference", zh ? "开会前一天提醒，不要当天早上" : "Meeting reminders the day before, not that morning", 4),
    m("m_d2", "cli", "decision", zh ? "Ducter 先只做 macOS 和网页，Windows 往后放" : "Ducter ships macOS and the web first; Windows later", 6),
    m("m_cu1", "cursor", "context", zh ? "web 客户端的颜色只用 token，不写死" : "The web client uses colour tokens, never fixed values", 6.5),
    m("m_d3", "codex", "decision", "mem#2332: keep the old API name", 9),
    m("m_f2", "ducter", "fact", zh ? "报销单每月 25 号前交给 Siwei" : "Expense reports go to Siwei before the 25th each month", 12),
  ];
}

type Mem = ReturnType<typeof memories>[number];
let kept: Mem[] | undefined;
const store = (zh: boolean) => (kept ??= memories(zh));

/** D321: the pretend Mem forgets and fixes like the real one (the partner's Mem client in the demo). */
export const demoForget = async (id: string) => {
  const before = kept?.length ?? 0;
  kept = kept?.filter((x) => x.id !== id);
  return (kept?.length ?? 0) < before;
};
export const demoFix = async (id: string, title: string) => {
  const it = kept?.find((x) => x.id === id);
  if (it) it.title = title;
  return !!it;
};

/** The fake `nmem --json …` for core's Bridge row and Mem glance. */
export function fakeNmem(state: DemoMem, zh: boolean) {
  const ok = (o: unknown) => ({ code: 0, out: JSON.stringify(o), err: "" });
  let connected = false;
  return async (args: string[]) => {
    const a = args.join(" ");
    if (state === "install" || state === "none") return undefined; // no nmem here
    if (a === "--version") return { code: 0, out: "nmem 0.10.119", err: "" };
    if (a === "status") {
      if (state === "signin") return { code: 1, out: JSON.stringify({ status: "unauthorized" }), err: "" };
      return ok({ status: "ok", cli_version: "0.10.119", mode: state === "local" ? "local" : "remote", backend: state === "local" ? "local" : "cloud", update: { current: "0.10.119", latest: "0.10.119", update_available: false } });
    }
    if (a === "bridge setup") return ok({ candidates: [{ id: SPACE.id, kind: "personal", label: SPACE.label }] });
    // D332: a pretend connect (DEMO_MEM=ready: the home connects by itself once the person has agents of their own).
    if (a.startsWith("bridge connections connect")) {
      connected = true;
      const ctx = args[args.indexOf("--context") + 1];
      return ok({ state: "connected", agent_context: ctx, selection: { scope: { space_id: SPACE.id } }, connection: { agent_id: "ducter", state: "active", connection_id: "bc_demo" } });
    }
    if (args.includes("--agent-context") && a.endsWith("bridge setup")) return ok({ endpoint: { address: { agent_id: "ducter" } } });
    if (a.startsWith("bridge connections revoke")) {
      connected = false;
      return ok({ connection: { connection_id: "bc_demo", state: "revoked" } });
    }
    if (a.startsWith("bridge connections list")) return ok({ connections: state === "ready" && !connected ? [] : [{ connection_id: "bc_demo", state: connected || state !== "ready" ? "active" : "revoked" }] });
    if (a.startsWith("m list")) {
      const typed = args.includes("--unit-type");
      const kind = args[args.indexOf("--unit-type") + 1];
      const all = store(zh).filter((x) => !typed || x.unit_type === kind);
      return ok({ memories: all, total: typed ? all.length : 10980 - (memories(zh).length - store(zh).length), returned: all.length });
    }
    if (args[0] === "m" && args[1] === "search") {
      const words = args.slice(args.indexOf("--") + 1).join(" ").toLowerCase().split(/\s+/).filter(Boolean);
      const hits = store(zh).filter((x) => words.some((w) => x.title.toLowerCase().includes(w)));
      return ok({ query: words.join(" "), total: hits.length, memories: hits });
    }
    return { code: 1, out: "", err: "not in the demo" };
  };
}

/** The persona connected with your AI agents (cloud, local): the record a confirmed connect leaves. */
export function seedConnection(dataDir: string, state: DemoMem) {
  if (state !== "cloud" && state !== "local") return;
  const r = { context: "ducter", agentId: "ducter", spaceId: SPACE.id, spaceLabel: SPACE.label, connectionId: "bc_demo", confirmed: true, at: new Date().toISOString() };
  writeFileSync(join(dataDir, "bridge-connection.json"), JSON.stringify(r, null, 2) + "\n");
}

/** What it noted over the past weeks (记下了), for the Memory page's this week / earlier. */
export const notedSeed = (zh: boolean): { title: string; daysAgo: number }[] => [
  { title: zh ? "周报每周五下午发，发给 Nowledge 全组" : "The weekly report goes out Friday afternoon, to the whole Nowledge team", daysAgo: 2 },
  { title: zh ? "开会前一天提醒，不要当天早上" : "Meeting reminders the day before, not that morning", daysAgo: 3 },
  { title: zh ? "回复英文邮件用简短的口语，不用敬语" : "English mail replies: short and plain, no formalities", daysAgo: 5 },
  { title: zh ? "报销单每月 25 号前交" : "Expense reports go in before the 25th each month", daysAgo: 12 },
  { title: zh ? "喜欢先看结论，细节放后面" : "Likes the conclusion first, details after", daysAgo: 19 },
  { title: zh ? "Ducter 的设计文档用英文写，聊天用中文" : "Ducter's design docs are written in English; chat is in Chinese", daysAgo: 26 },
];

type DemoLog = { append(e: { stream: string; origin: string; kind: string; body: unknown }): { seq: number } };

/**
 * D304 (DEMO_RECALL=1): the conversation side of Mem, seeded: the week's morning note offering what
 * it learned, a reply that leaned on the person's own words (想起了你 … 说的), and one that leaned on
 * what Claude Code saved (想起了 Claude Code … 记下的). Forget and corrections "reach Mem" (a fake).
 */
export function seedRecall(core: { log: DemoLog; settings: { learnedThisWeek(at: number): number; setForgetter(f: (id: string) => Promise<boolean>): void; setCorrector?(f: (id: string, t: string) => Promise<boolean>): void } }, zh: boolean, setSkew: (ms: number) => void) {
  const log = core.log;
  const day = 86_400_000;
  const ymd = (back: number) => new Date(Date.now() - back).toISOString().slice(0, 10);
  core.settings.setForgetter(async () => true);
  core.settings.setCorrector?.(async () => true);
  const week = core.settings.learnedThisWeek(Date.now());
  setSkew(-3 * 3600_000);
  log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "note_week", rung: "morning", opening: zh ? "早。" : "Morning.", finds: [], learned: { count: week } } });
  setSkew(-40 * 60_000);
  const u1 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "周报一般哪天发、发给谁来着？" : "When does the weekly report go out again, and to whom?" } });
  const a1 = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "周五下午发，发给 Nowledge 全组。" : "Friday afternoon, to the whole Nowledge team.", replyTo: u1.seq } });
  const said = notedSeed(zh)[0]!;
  log.append({ stream: "channel", origin: "partner", kind: "memory_recalled", body: { memoryId: "m_week1", title: said.title, by: "said", date: ymd(said.daysAgo * day), aboutSeq: a1.seq, replyTo: u1.seq } });
  setSkew(-8 * 60_000);
  const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "我要提交 ducter 的 Go 改动了，有什么要先跑的吗？" : "I'm about to commit the Go changes in ducter. Anything to run first?" } });
  const a2 = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "先跑一下 `gofmt -l apps/desktop`，有列出来的文件就 `gofmt -w` 一下再提交。" : "Run `gofmt -l apps/desktop` first; anything it lists, `gofmt -w` before you commit.", replyTo: u2.seq } });
  const cc = memories(zh)[0]!;
  log.append({ stream: "channel", origin: "partner", kind: "memory_recalled", body: { memoryId: cc.id, title: cc.title, by: "tool", from: "Claude Code", date: cc.created_at.slice(0, 10), aboutSeq: a2.seq, replyTo: u2.seq } });
  setSkew(0);
}
