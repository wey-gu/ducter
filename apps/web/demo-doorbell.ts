// D-PENDING: a Keep with a doorbell, for shots and a look. One task in rounds looks at #10473's CI
// every 30 minutes; its doorbell rang once (CI #42), so the round says 门铃响了 with the caller's
// label; its doorbell is on. The URL is revealed to the page once, as a partner's turn-on does.
//   DUCTER_PORT=7600 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-doorbell.ts
// then open /app#keep=<id>/full (the id is printed).
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-doorbell-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const TASK = "t_ci";
const brief = zh ? "每 30 分钟看一次 #10473 的 CI。" : "Look at #10473's CI every 30 minutes.";

const seed = startCore({ dataDir, port: Number(process.env.DUCTER_PORT ?? 7600), push: false, persona, ooSource: noOo });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });

const log = seed.log;
log.append({ stream: `task:${TASK}`, origin: "partner", kind: "task_open", body: { taskId: TASK, title: zh ? "看 #10473 的 CI" : "#10473's CI", project: "", place: { kind: "none", device: "local" }, harness: "codex", brief } });
seed.tasks.setState(TASK, "working", "hot");
await seed.mcp.call({ role: "task", taskId: TASK } as never, "wait_for", { reason: zh ? "30 分钟后再看 #10473 的 CI" : "Look at #10473's CI again in 30 minutes", afterMinutes: 30 });
await Bun.sleep(80);
const k = seed.keeps!.all().find((x) => x.from.kind === "loop" && x.from.taskId === TASK);
if (!k) throw new Error("the loop's Keep did not appear");
// A partner asked for the doorbell, so its URL is revealed to the first page that opens it.
await seed.keeps!.change(k.keepId, { bell: "on" }, { by: "partner" });
// One ring a minute ago, and the round it woke (a fired timer and the report it wrote).
log.append({ stream: `keep:${k.keepId}`, origin: "system", kind: "keep_ring", body: { keepId: k.keepId, at: iso(-MIN), label: "CI #42" } });
log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_ring", reason: zh ? "门铃" : "the doorbell", state: "fired", taskId: TASK, wakes: "task", at: iso(-MIN + 1000) } });
log.append({ stream: `task:${TASK}`, origin: "task", kind: "report", body: { taskId: TASK, state: "done", summary: zh ? "CI 还是红的：lint 在 src/auth.ts 报了一个错。等下一次。" : "CI is still red: lint reports one error in src/auth.ts. Waiting for the next look.", questions: [], evidence: [] } });
seed.tasks.setState(TASK, "blocked", "warm");
await Bun.sleep(50);

console.log(`[demo] keep=${k.keepId} port=${seed.port} open=http://127.0.0.1:${seed.port}/app#keep=${k.keepId}/full`);
