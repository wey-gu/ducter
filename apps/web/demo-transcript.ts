// A demo core for the opened task as the agent tells it (D152): Codex connecting Nowledge Mem on a
// Linux server home, its brief carrying a connect token (hidden on the way out), from
// packages/protocol/fixtures/transcript-cases.ts, the same run the desktop renders
// (apps/desktop/internal/views/task_mem_test.go).
//   DUCTER_PORT=7993 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PHASE=running|done|failed|yourturn bun apps/web/demo-transcript.ts
// then open http://127.0.0.1:7993/app#task=mem1 (cc1 for "failed").
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import type { Attention, LogEvent, MediaRef } from "@ducter/protocol";
import { readFileSync } from "node:fs";
import { cases, glanceEvents } from "../../packages/protocol/fixtures/transcript-cases.ts";

const phase = process.env.DEMO_PHASE ?? "running";
const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
let offset = 0;
const clock = { now: () => Date.now() - offset, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", clock });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

// DEMO_CASE=glance (D210): a long Claude Code run on Ducter itself, with pictures; DEMO_PICS names a
// folder holding empty.png (the user's screenshot) and filled.png (what the task showed);
// DEMO_EXTRA adds that many reads and searches (a long history).
const glance = process.env.DEMO_CASE === "glance";
const picsDir = process.env.DEMO_PICS;
const put = (f: string) => (picsDir ? (core as unknown as { media: { put(b: Uint8Array): MediaRef } }).media.put(new Uint8Array(readFileSync(`${picsDir}/${f}`))) : undefined);
const pics = glance ? { brief: put("empty.png"), you: put("filled.png"), report: put("filled.png") } : {};
const c = cases[{ running: 1, done: 0, yourturn: 1, failed: 2 }[phase] ?? 1]!;
const upTo = ({ running: 342, yourturn: 90 } as Record<string, number>)[phase] ?? Infinity;
const evs: LogEvent[] = glance ? glanceEvents({ zh, extra: Number(process.env.DEMO_EXTRA ?? 0), upTo, pics }) : [...c.events];
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
if (phase === "yourturn" && !glance)
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
