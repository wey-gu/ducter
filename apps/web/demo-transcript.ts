// A demo core for the opened task as the agent tells it (D152): Codex connecting Nowledge Mem on a
// Linux server home, its brief carrying a connect token (hidden on the way out), from
// packages/protocol/fixtures/transcript-cases.ts, the same run the desktop renders
// (apps/desktop/internal/views/task_mem_test.go).
//   DUCTER_PORT=7993 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PHASE=running|done|failed|yourturn bun apps/web/demo-transcript.ts
// then open http://127.0.0.1:7993/app#task=mem1 (cc1 for "failed").
import { startCore, stubRunner } from "@ducter/core";
import type { Attention, LogEvent } from "@ducter/protocol";
import { cases } from "../../packages/protocol/fixtures/transcript-cases.ts";

const phase = process.env.DEMO_PHASE ?? "running";
const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
let offset = 0;
const clock = { now: () => Date.now() - offset, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ persona: { id: "default", name: zh ? "小鸭" : "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", clock });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

const c = cases[{ running: 1, done: 0, yourturn: 1, failed: 2 }[phase] ?? 1]!;
const evs: LogEvent[] = [...c.events];
const end = Date.parse(evs.at(-1)!.ts);
const id = evs[0]!.stream.slice("task:".length);
// Each event as long before now as it was before the run's last one, plus 20 s.
for (const ev of evs) {
  offset = end - Date.parse(ev.ts) + 20_000;
  core.log.append({ stream: ev.stream, origin: ev.origin, kind: ev.kind, body: ev.body } as never);
}
offset = 0;
// The fixture's Go was relayed already (its "User says Go" is in the stream): its ask is answered.
for (const d of core.log.read({ stream: "channel", kinds: ["decision"] })) core.decisions.decide((d.body as { decisionId: string }).decisionId, "go");
if (phase === "yourturn")
  core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "assistant", text: "nmem is connected. Before I touch `~/.codex/config.toml`: do you want Mem as a Codex plugin or as an MCP server? This Codex may not have the plugin command." } });
if (phase === "failed")
  core.log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "failed", summary: "Couldn't commit: the turn failed when the stream dropped. The fix is in src/cart.ts and the tests pass.", questions: [], evidence: [] } });
const state: Attention = ({ running: "working", done: "done", yourturn: "needs_you", failed: "failed" } as const)[phase as "running"] ?? "working";
core.tasks.setState(id, state, "warm");

console.log(`[demo] http://127.0.0.1:${core.port}/app#task=${id}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
