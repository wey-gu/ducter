// D295: a pretend Nowledge Mem for the demo core, so Settings › 记忆 and › 连上的 AI agent can be
// seen in each state without touching the machine's real nmem or Mem. DEMO_MEM picks the state:
// cloud (default: signed in to Nowledge Mem Cloud, the persona connected with your AI agents),
// local (the Mem app on this computer), ready (signed in, not yet connected), signin (nmem here,
// not signed in), install (no nmem here), none (memory on, no Mem answer at all).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type DemoMem = "cloud" | "local" | "ready" | "signin" | "install" | "none";

export const demoMem = (): DemoMem => {
  const v = process.env.DEMO_MEM ?? "cloud";
  return (["cloud", "local", "ready", "signin", "install", "none"] as const).includes(v as DemoMem) ? (v as DemoMem) : "cloud";
};

const SPACE = { id: "personal-4e742092-837d-4438-a2b3-55ada58d8e65", label: "Only me" };

/** What the person's other AI tools saved to Mem lately (titles only reach the page). */
function memories(zh: boolean) {
  const day = 86_400_000;
  const at = (d: number) => new Date(Date.now() - d * day).toISOString();
  const m = (id: string, source: string, title: string, d: number) => ({ id, title, content: "", importance: 0.6, source, unit_type: "fact", created_at: at(d), space_id: SPACE.id });
  return [
    m("m_cc1", "claude-code", zh ? "Ducter 的 Go 代码提交前先跑 gofmt -l" : "Run gofmt -l before committing Ducter's Go code", 0.2),
    m("m_cli", "cli", zh ? "（命令行记的）" : "(saved from the command line)", 0.4),
    m("m_cx1", "codex", zh ? "HawDB 的 compaction 测试只在 Linux CI 上偶发失败" : "HawDB's compaction test only flakes on Linux CI", 1.2),
    m("m_cu1", "cursor", zh ? "web 客户端的颜色只用 token，不写死" : "The web client uses colour tokens, never fixed values", 2.5),
    m("m_cc2", "claude-code", zh ? "发版前先在 Bun 1.4.4 上跑一遍测试" : "Run the tests on Bun 1.4.4 before a release", 4),
    m("m_dx", "ducter", zh ? "测试统一用假时钟，不写死等待" : "Tests use a fake clock, never fixed sleeps", 5),
    m("m_cx2", "codex", zh ? "OAR 0.96 的 steer 接口换了参数顺序" : "OAR 0.96 swapped the steer API's arguments", 9),
  ];
}

/** The fake `nmem --json …` for core's Bridge row and Mem glance. */
export function fakeNmem(state: DemoMem, zh: boolean) {
  const ok = (o: unknown) => ({ code: 0, out: JSON.stringify(o), err: "" });
  return async (args: string[]) => {
    const a = args.join(" ");
    if (state === "install" || state === "none") return undefined; // no nmem here
    if (a === "--version") return { code: 0, out: "nmem 0.10.119", err: "" };
    if (a === "status") {
      if (state === "signin") return { code: 1, out: JSON.stringify({ status: "unauthorized" }), err: "" };
      return ok({ status: "ok", cli_version: "0.10.119", mode: state === "local" ? "local" : "remote", backend: state === "local" ? "local" : "cloud", update: { current: "0.10.119", latest: "0.10.119", update_available: false } });
    }
    if (a === "bridge setup") return ok({ candidates: [{ id: SPACE.id, kind: "personal", label: SPACE.label }] });
    if (a.startsWith("bridge connections list")) return ok({ connections: [{ connection_id: "bc_demo", state: "active" }] });
    if (a.startsWith("m list")) return ok({ memories: memories(zh), total: 1284, returned: 7 });
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
