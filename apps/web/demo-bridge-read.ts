// D-PENDING: one home for the pictures of 已送达 / 已读 / 「{n}/{m} 已读」 beside a message Ducter sent
// on the person's behalf: Settings › Agent 通信's 来往, the conversation's relay line, a task's own
// `agent_message` row, and a helper's rounds on its Keep page. No nmem runs and nothing reaches Mem.
//   DUCTER_PORT=7630 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-bridge-read.ts
// then open /app#settings=peers, /app, /app#keep=<id>/full (the id is printed).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-bridge-read-")), "data");
mkdirSync(dataDir, { recursive: true });
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SPACE = "personal-4e742092";
const TEAM = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";

// The helper as hel keeps it: one address, its own Keep, the work its rounds take.
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修 CI 和评审意见，能合并后回信。", "Take over Nowledge Mem PRs with Codex, fix CI and review comments, answer when it can merge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-50 * HOUR),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: SPACE },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.124");
  if (a.includes("bridge connections --help")) return ok({});
  if (a.includes("connections list --help")) return ok({});
  if (a === "status") return ok({ status: "healthy", backend: "cloud" });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const sys = { which: () => undefined, exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/Users/demo", platform: "darwin" as const, uid: 501 };

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({
  clock,
  dataDir,
  persona: { id: "default", name: "Ducter", identity: "" },
  push: false,
  ooSource: noOo,
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) },
  keeps: { endAsk: async () => ({ until: w("每个 PR 跟到能合并为止", "Each PR until it can merge") }) },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
core.settings.setPeers?.({ trusted: ["Codex"], allowed: ["reviewer (dev team)"] });
core.bridgeLink.setMailboxes?.([{ harness: "codex", open: true }, { harness: "claude-code", open: true }]);
void core.bridgeLink.connect();
core.keeps.sync();
const h = core.helpers.list()[0]!;
const keepId = core.keeps.all().find((k) => k.from.kind === "helper" && k.from.helperId === h.id)!.keepId;
const log = core.log;
const mail = (b: Record<string, unknown>, ms: number) => log.append({ stream: "channel", origin: b.direction === "in" ? "peer" : "partner", kind: "bridge_msg", body: b } as never);
const receipt = (opId: string, messageId: string, r: Record<string, unknown>) => log.append({ stream: "channel", origin: "system", kind: "bridge_read", body: { opId, messageId, receipt: r } } as never);

// A message from the person's Codex, the partner's reply: delivered, nobody has opened it yet.
shift = -2 * DAY;
const codex = { from: "another agent", mine: true, agent: "Codex", selfNamed: true, role: w("Mem 协作", "Mem helper"), space: SPACE };
mail({ direction: "in", messageId: "m-in-1", ...codex, sentAt: iso(-2 * DAY), text: w("PR #412 合进去之后帮我重跑一遍 benchmark，看 p99 有没有回退。", "Once PR #412 is in, rerun the benchmark and see whether p99 regressed."), linked: true, first: true }, 2 * DAY);
mail({ direction: "out", messageId: "m-rep-1", opId: "o-rep-1", inReplyTo: "m-in-1", ...codex, text: w("接下了，开了任务「重跑 PR #412 的 benchmark」。", "On it: task \"Rerun the benchmark for PR #412\"."), state: "sent" }, 2 * DAY + 2000);
receipt("o-rep-1", "m-rep-1", { state: "unread", count: 0, total: 1 });

// A reply to a teammate's agent in a Space several people read: 2 of 5 opened it.
shift = -22 * HOUR;
const reviewer = { to: "reviewer (dev team)", agent: "reviewer (dev team)", space: TEAM, spaceLabel: "dev team", shared: true };
mail({ direction: "out", messageId: "m-rep-2", opId: "o-rep-2", ...reviewer, text: w("还没定，我问了他，定了告诉你。", "Not yet; I've asked him and will tell you."), decisionId: "d-q2", state: "sent" }, 22 * HOUR);
receipt("o-rep-2", "m-rep-2", { state: "partly", count: 2, total: 5 });

// A reply to Claude Code: read.
shift = -5 * HOUR;
const cc = { from: "another agent", mine: true, agent: "Claude Code", selfNamed: true, role: w("终端", "terminal"), space: SPACE };
mail({ direction: "in", messageId: "m-in-3", ...cc, sentAt: iso(-5 * HOUR), text: w("CI 红了，是不是 main 上谁动了 runner？", "CI is red; did someone touch the runner on main?"), linked: true }, 5 * HOUR);
mail({ direction: "out", messageId: "m-rep-3", opId: "o-rep-3", inReplyTo: "m-in-3", ...cc, text: w("是昨晚的 runner 改动，我开了任务去看。", "It's last night's runner change; I've opened a task."), state: "sent" }, 5 * HOUR - 2 * MIN);
receipt("o-rep-3", "m-rep-3", { state: "read", count: 1, total: 1 });

// A task's own agent_message to Codex: read. This is the 来往 row marked as a task's.
shift = -3 * HOUR;
if (!core.tasks.get("t_send")) log.append({ stream: "channel", origin: "partner", kind: "task_open", body: { taskId: "t_send", title: w("重跑 PR #412 的 benchmark", "Rerun the benchmark for PR #412"), project: "HawDB", place: { kind: "none" }, harness: "codex", brief: "x" } } as never);
mail({ direction: "out", messageId: "m-task-1", opId: "o-task-1", by: "task", taskId: "t_send", ...codex, text: w("基准跑完了，p99 没退，报告在任务里。", "The benchmark is done; p99 did not regress. The report is in the task."), state: "sent" }, 3 * HOUR);
receipt("o-task-1", "m-task-1", { state: "read", count: 1, total: 1 });

// A question with no receipt from this Mem: nothing is shown beside its time.
shift = -90 * MIN;
mail({ direction: "out", messageId: "m-q-4", opId: "o-q-4", ...reviewer, text: w("API 改名那件事 Wey 定了吗？", "Has Wey decided on the API rename?"), decisionId: "d-q4", state: "sent" }, 90 * MIN);

// The helper's work: an arrival, its claim, and the task's round; Mem says 3 of 4 readers opened the claim.
shift = -40 * MIN;
if (!core.tasks.get("t_helper_round")) {
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "m-work-1", from: "another agent", mine: true, agent: "Codex", selfNamed: true, helper: h.id, space: SPACE, text: "https://github.com/nowledge-co/mem/pull/11441", linked: true } } as never);
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m-claim-1", opId: "o-claim-1", inReplyTo: "m-work-1", taskId: "t_helper_round", helper: h.id, to: "Codex", agent: "Codex", role: w("Mem 协作", "Mem helper"), mine: true, selfNamed: true, text: w("接下了。", "On it."), state: "sent" } } as never);
  receipt("o-claim-1", "m-claim-1", { state: "partly", count: 3, total: 4 });
  log.append({ stream: "channel", origin: "partner", kind: "task_open", body: { taskId: "t_helper_round", title: w("接手 mem#11441：修 Plus 年付额度卡", "Take mem#11441: fix the Plus annual quota card"), project: "mem", place: { kind: "none" }, harness: "codex", brief: "x" } } as never);
  log.append({ stream: "task:t_helper_round", origin: "task", kind: "report", body: { taskId: "t_helper_round", state: "done", summary: w("修好了，CI 绿了，PR 可以合并。", "Fixed, CI is green, the PR can merge."), questions: [], evidence: [] } } as never);
  core.tasks.setState("t_helper_round", "done", "parked");
}

console.log(`[demo] D-PENDING receipts at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
console.log(`[demo] keep ${keepId}`);
console.log(`[demo] task t_send ${w("重跑 PR #412 的 benchmark", "Rerun the benchmark for PR #412")}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
