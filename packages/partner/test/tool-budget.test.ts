// Guardrail (research/48 G2): the tool list each role gets, as the harness sees it (tools/list over
// Ducter's MCP endpoint), is a snapshot with a size ceiling. Tool definitions sit in the cached
// prefix of every session (research/08), so a new tool or a longer description costs every turn of
// every session. Adding one is fine; doing it without noticing is what this stops: the names are
// listed here, and the ceiling moves only with a reason written next to it.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "../../core/src/core.ts";
import { registerTaskTools } from "../../runner/src/tools.ts";
import { createPartner, type PartnerHandle } from "../src/partner.ts";
import { fakeRunner } from "./fakes.ts";
import { partnerFingerprint } from "./fingerprint.ts";

const PARTNER_TOOLS = [
  "ask", "connection_call", "connection_guide", "connection_search", "connection_share", "connections_list",
  "keep_going", "log_read", "log_search", "memory_add", "memory_search", "move_before_closing",
  "notice_rule", "phone_call",
  "routine_list", "routine_pause", "routine_propose", "rule_list", "rule_save", "task_open",
  "task_read", "task_retitle", "task_send", "wait_cancel", "wait_for", "wait_until",
];
const TASK_TOOLS = ["checkpoint", "log_read", "log_search", "memory_search", "report_to_main", "wait_for"]; // memory_search: only where Mem is connected and the plugin is absent (D168)
/** JSON characters of the whole tools/list result (≈ chars / 3.6 tokens). */
const CEILING = {
  partner: 28_000, // 27.7K today: 26 tools (phone_call, D193, 2.2K after trimming); wait_for (3.9K) and task_open (4.4K) are the largest
  task: 8_500, // 7.6K: 6 tools; wait_for alone is 3.6K; memory_search (1.2K) is the D168 fallback where the Mem plugin is absent
};

let dir: string;
let core: Core;
let partner: PartnerHandle;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-tools-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin" });
  registerTaskTools(core as never, {});
  partner = createPartner(core as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
});
afterAll(async () => {
  await partner.close();
  await core.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function list(role: "partner" | { taskId: string }): Promise<{ name: string }[]> {
  const cfg = core.mcp.configFor(role);
  const req = new Request("http://127.0.0.1/mcp", {
    method: "POST",
    headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const j = (await (await core.mcp.handle(req)).json()) as { result: { tools: { name: string }[] } };
  return j.result.tools;
}

test("the partner's tools: the listed set, under the ceiling", async () => {
  const tools = await list("partner");
  expect(tools.map((t) => t.name).sort()).toEqual(PARTNER_TOOLS);
  expect(JSON.stringify(tools).length).toBeLessThan(CEILING.partner);
});

test("a task's tools: the listed set, under the ceiling (no partner tool leaks into a task)", async () => {
  core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "x", project: "", place: { kind: "none" }, harness: "codex", brief: "x" } });
  const tools = await list({ taskId: "t1" });
  expect(tools.map((t) => t.name).sort()).toEqual(TASK_TOOLS);
  expect(JSON.stringify(tools).length).toBeLessThan(CEILING.task);
});

// D175 (4), research/48 F6: a persona or partner-tool change ships with a fresh eval result. The
// last full run (packages/partner/eval/results/LATEST.json) hashed what it judged; when the persona
// or the tool list differs from that, run `bun run eval:partner --model haiku` (about $1) and commit
// its results file and LATEST.json with the change.
test("the persona and the partner's tools are what the last eval judged", async () => {
  const latest = join(import.meta.dir, "..", "eval", "results", "LATEST.json");
  expect(existsSync(latest)).toBe(true);
  const ran = JSON.parse(readFileSync(latest, "utf8")) as { file: string; persona: string; tools: string };
  const now = await partnerFingerprint();
  const stale = [now.persona !== ran.persona ? "the persona" : "", now.tools !== ran.tools ? "the partner's tools" : ""].filter(Boolean);
  expect(stale.length ? `${stale.join(" and ")} changed since the eval in ${ran.file}: run bun run eval:partner --model haiku and commit its results` : "fresh").toBe("fresh");
  expect(existsSync(join(import.meta.dir, "..", "eval", "results", ran.file))).toBe(true);
});
