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
