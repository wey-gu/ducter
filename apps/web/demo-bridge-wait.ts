// D656 (research/243 Brief D): a task's question that is never answered is held and said.
// One task on pi asked the person's Codex a question 2 h ago and rests; the conversation says so
// once, naming the task and who it waits on, and the card says 在等 Codex 回话. BRIDGE_WAIT_BEFORE=1
// draws the old conversation (the task waits silently, no line). Never this machine's Mem, port or
// data: DUCTER_DATA_DIR and its own port.
//   DUCTER_PORT=7681 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-bridge-wait.ts
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const before = process.env.BRIDGE_WAIT_BEFORE === "1";
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-bridge-wait-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const HOUR = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const title = w("修 Linux 上的 runner 测试", "Fix the Linux runner tests");
const question = w("live.test.ts 在 Linux 上为什么要跳过 open？", "Why does live.test.ts skip open on Linux?");
const line = w(
  `「${title}」还在等 Codex 回话：2 小时前问的「${question}」，还没回。回了我马上告诉你。`,
  `“${title}” is still waiting for Codex to answer what it asked 2 hours ago: "${question}". I'll tell you as soon as it does.`,
);

let shift = -(2 * HOUR + 10 * 60_000);
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
process.env.DUCTER_CLOSE_LOOP_REPAIR = "0"; // the waits in this demo are seeded, not repaired
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en", quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" } });
const log = seed.log;
const at = async (ms: number) => {
  await Bun.sleep(20);
  shift = ms;
};

// The person's words open the conversation in their language (D262).
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("让 pi 去修 Linux 上的 runner 测试；要问什么直接问我的 Codex。", "Have pi fix the Linux runner tests; ask my Codex directly if it needs something.") } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("好，我开了一个任务，它要是问你的 Codex，我先告诉你。", "Okay: I opened a task. If it asks your Codex, I'll tell you first.") } });

// The task, opened 2 h 10 min ago; its question to the Codex went 2 h ago; it rests on the answer.
await at(-(2 * HOUR + 10 * 60_000));
log.append({
  stream: "channel",
  origin: "partner",
  kind: "task_open",
  body: {
    taskId: "t-wait-1",
    title,
    project: "",
    place: { kind: "none" },
    harness: "pi",
    model: "haiku",
    brief: w("把 live.test.ts 里只在 macOS 上成立的 open 断言改成跨平台的，ubuntu CI 绿了算完。要问的可以直接问我的 Codex。", "Make the macOS-only open assertion in live.test.ts cross-platform; done when ubuntu CI is green. Ask my Codex when needed."),
  },
});
seed.tasks.setState("t-wait-1", "working", "hot");
await at(-(2 * HOUR + 8 * 60_000));
log.append({
  stream: "channel",
  origin: "partner",
  kind: "bridge_msg",
  body: {
    direction: "out",
    messageId: "bm-demo-o1",
    opId: "bo-demo-1",
    operation: "op-demo-1",
    by: "task",
    taskId: "t-wait-1",
    decisionId: "d-demo-1",
    contact: "ct-codex",
    to: "Codex",
    agent: "Codex",
    mine: true,
    text: question,
    state: "sent",
  },
});
await at(-(2 * HOUR));
log.append({ stream: "task:t-wait-1", origin: "task", kind: "task_event", body: { taskId: "t-wait-1", role: "system", from: "runner", text: w("已通过 Nowledge Mem 发给 Codex", "sent to Codex through Nowledge Mem"), raw: { bridge: "sent", opId: "bo-demo-1" } } });
seed.tasks.setState("t-wait-1", "blocked", "parked", w("在等 Codex 回话", "Waiting for Codex to answer"));
if (!before) {
  await at(-1 * HOUR);
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: line } });
}
await Bun.sleep(200);
await seed.stop();

// Serve the same Log with a silent partner: the shots are of what the person reads.
process.env.DUCTER_CLOSE_LOOP_REPAIR = "0";
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", port: Number(process.env.DUCTER_PORT || 0) });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
console.log(`[demo] bridge wait ${before ? "before" : "after"} at http://127.0.0.1:${core.port}/app#onhand (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
