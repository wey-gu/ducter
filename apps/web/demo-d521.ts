// D521: the opened task's 后台 / In the background, as a demo core both clients read: the author's
// LoCoMo eval task, its agent's subagents, shells and a Monitor watch logged as the runner logs them
// (task_event raw.background), so core folds the tray's list from the Log as it does live.
// DEMO_RUNNING: how many still run (0, 2 or 6); 22 have ended either way.
//   DUCTER_PORT=7518 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_RUNNING=6 bun apps/web/demo-d521.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const running = Number(process.env.DEMO_RUNNING ?? 6);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d521-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const MIN = 60_000;

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const at = async (ms: number) => {
  await Bun.sleep(20);
  shift = ms;
};
const id = "t_locomo";
const ev = (b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const bg = (background: Record<string, unknown>) => ev({ role: "system", text: `${background.act} in the background`, raw: { background } });
const place: Place = { kind: "repo", device: "local", repoPath: "/Users/weyl/dev/mem", branch: "ducter/locomo-ledger", baseBranch: "main" };
const title = w("跑一遍 LoCoMo 评测，按题记账", "Run the LoCoMo eval with a per-question ledger");

await at(-95 * MIN);
log.append({ stream: `task:${id}`, origin: "you", kind: "task_open", body: { taskId: id, title, project: "mem", place, harness: "claude-code", model: "opus", brief: title, origin: "you" } });
seed.tasks.setState(id, "working", "hot");
ev({ role: "assistant", text: w("库在后台建，我先把账本的格式定下来。", "The store builds in the background; I'm settling the ledger's shape first.") });

const ended: [string, string, number?, string?][] = [
  ["shell", "uv run python scripts/build_store.py --dataset locomo10", 0, "built 10 conversations, 1,986 questions\nstore: .cache/locomo (412 MB)"],
  ["agent", "S0: draft the ledger schema"],
  ["agent", "Find where the judge drops the category label"],
  ["shell", 'rg -n "strict_rubric" eval/', 0, "eval/judge.py:88:    strict_rubric = load_rubric(\"strict\")"],
  ["shell", "tail -n 200 logs/eval.log", 0, "[r-1124] 1,986/1,986 judged\n[r-1124] wrote out/r-1124/summary.json"],
  ["shell", "Watch the store build for disk pressure"],
  ["agent", "S2: sample 40 answers for a human check"],
  ["shell", "git log --oneline -20 -- eval/judge.py", 0, "e2b8b62 judge: keep the category on retries\n41c09aa judge: strict rubric"],
  ["agent", "Compare the run against the 2026-11-20 baseline"],
  ["shell", "bun run eval:partner --model haiku", 0, "233/283 passed"],
  ["shell", "du -sh .cache/locomo", 0, "412M\t.cache/locomo"],
  ["agent", "Check that every session id in the ledger resolves"],
  ["agent", "S3: summarise what moved by category"],
  ["shell", "python -m eval.report --run r-1124", 0, "single-hop +2.1  multi-hop +0.4  temporal -0.8  open-domain +1.2"],
  ["shell", "curl -s localhost:8080/healthz", 0, '{"ok":true}'],
  ["agent", "Re-run the 12 answers that timed out"],
  ["shell", "make lint", 0, "ruff: 0 problems"],
  ["watch", "Watch the judge's rate limit headers"],
  ["shell", "jq '.categories' out/r-1124/summary.json", 0, '{ "single_hop": 0.712, "multi_hop": 0.534, "temporal": 0.488 }'],
  ["agent", "S4: write the per-question notes"],
  ["shell", "ls -la out/r-1124", 0, "summary.json  ledger.jsonl  notes.md"],
  ["shell", "pytest tests/test_ledger.py -q", 2, "FAILED tests/test_ledger.py::test_category_kept - KeyError: 'category'\n1 failed, 47 passed in 3.40s"],
];
for (let i = 0; i < ended.length; i++) {
  const [kind, what, exit, output] = ended[i]!;
  const type = kind === "agent" ? "agent" : "shell";
  await at(-(90 - i * 3) * MIN);
  bg({ id: `d${i}`, act: "started", type, ...(kind === "watch" ? { tool: "Monitor" } : {}), what, stop: true });
  await at(-(90 - i * 3 - 2) * MIN - (i % 5) * 9_000);
  bg({ id: `d${i}`, act: i === 11 ? "stopped" : exit && exit !== 0 ? "failed" : "ended", type, what, ...(exit !== undefined ? { exitCode: exit } : {}), ...(output ? { output } : {}) });
}

const live: [number, string, string, boolean, string?][] = [
  [80, "agent", "S0: per-question eval ledger", true],
  [0.45, "shell", w("等 LoCoMo 的库建完再开始评测", "Wait for the LoCoMo store to finish"), true],
  [12, "shell", "cargo bench --bench wal -- --save-baseline main", false],
  [41, "shell", "Watch the eval log for OOM kills and 429s from the judge", true, "Monitor"],
  [33, "agent", "S1: re-judge the 1,986 answers with the strict rubric and keep a per-category diff against the baseline run", true],
  [2, "shell", "bun test packages/core --timeout 20000", false],
];
const order = live.map((x, i) => [x, i] as const).sort((a, b) => b[0][0] - a[0][0]);
for (const [[ago, type, what, stop, tool], i] of order) {
  if (i >= running) continue;
  await at(-ago * MIN);
  bg({ id: `r${i}`, act: "started", type, ...(tool ? { tool } : {}), what, ...(stop ? { stop: true } : {}) });
}
await at(-30_000);
ev({ role: "assistant", text: w("S0 的账本格式定了，等库建完就开始跑。", "S0's ledger shape is set; the run starts when the store is built.") });
await at(0);

await Bun.sleep(300);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", port: Number(process.env.DUCTER_PORT ?? 7518) });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D521 the background tray (${zh ? "zh" : "en"}, ${running} running) at http://127.0.0.1:${core.port}/app#task=${id}/full (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
