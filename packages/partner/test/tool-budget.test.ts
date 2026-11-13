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
import { fakeOoCalendar } from "../../core/test/fake-oo-calendar.ts";
import { partnerFingerprint } from "./fingerprint.ts";

const PARTNER_TOOLS = [
  "ask", "connection_call", "connection_guide", "connection_search", "connection_share", "connections_list",
  "keep_going", "log_read", "log_search", "memory_add", "memory_search", "move_before_closing",
  "notice_rule", "noticed", "phone_call",
  "routine_list", "routine_pause", "routine_propose", "rule_list", "rule_save", "saved_list", "task_open",
  "task_read", "task_retitle", "task_send", "wait_cancel", "wait_for", "wait_until",
]; // saved_list (D191, 0.4K): listed only once something is saved in Autofill (seeded below)
const TASK_TOOLS = ["ask_for_key", "checkpoint", "log_read", "log_search", "memory_search", "report_to_main", "wait_for"]; // memory_search: only where Mem is connected and the plugin is absent (D168); ask_for_key (D233, 0.8K): every task not in a browser place
/** JSON characters of the whole tools/list result (≈ chars / 3.6 tokens). */
const CEILING = {
  partner: 30_100, // 29.6K today (D243: + noticed, 0.5K, the partner's answer to "anything for me?" from the same detectors as the note); (D215's call sheet fields on phone_call, D217's needs.phone on task_open): 26 tools (phone_call, D193, 2.2K after trimming; D206 media on task_open and task_send); wait_for (3.9K) and task_open (4.8K) are the largest
  partnerWithCalendar: 32_100, // D243: + noticed; D222: + calendar (≈1.9K), listed only while a calendar account is connected
  task: 9_200, // 8.7K: 7 tools (ask_for_key, D233, 0.7K); wait_for alone is 3.6K; memory_search (1.2K) is the D168 fallback where the Mem plugin is absent
};

let dir: string;
let core: Core;
let partner: PartnerHandle;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-tools-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin" });
  core.autofill.store.put({ kind: "card", name: "Budget", number: "4242424242424242", expMonth: 12, expYear: 2099 });
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

// D222: the calendar tool is listed only while a calendar account is connected (no cost otherwise);
// with one, the whole list stays under its own ceiling.
test("with a calendar connected: calendar is listed, still under a ceiling", async () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-tools-cal-"));
  const oo = fakeOoCalendar({ day: "2026-11-18" });
  const c = startCore({ dataDir: d, port: 0, push: false, platform: "darwin", ooSource: oo.source });
  c.autofill.store.put({ kind: "card", name: "Budget", number: "4242424242424242", expMonth: 12, expYear: 2099 });
  expect((await c.connections.addFromOo()).ok).toBe(true);
  const p = createPartner(c as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  try {
    const cfg = c.mcp.configFor("partner");
    const req = new Request("http://127.0.0.1/mcp", { method: "POST", headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    const tools = ((await (await c.mcp.handle(req)).json()) as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual([...PARTNER_TOOLS, "calendar"].sort());
    expect(JSON.stringify(tools).length).toBeLessThan(CEILING.partnerWithCalendar);
    // No oo write ran to list it.
    expect(oo.runs.filter((r) => !/^(list|get)_/.test(r.action))).toEqual([]);
  } finally {
    await p.close();
    await c.stop();
    rmSync(d, { recursive: true, force: true });
  }
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
