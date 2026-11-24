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
import { fakeGh } from "../../core/test/fake-gh-issues.ts";
import { partnerFingerprint } from "./fingerprint.ts";

const PARTNER_TOOLS = [
  "app", "ask", "brain_switch", "connection_call", "connection_guide", "connection_search", "connection_share", "connections_list", "did_list",
  "keep_change", "keep_going", "keep_list", "keep_make", "log_read", "log_search", "made_find", "memory_add", "memory_search", "move_before_closing", "new_tasks",
  "notice_rule", "noticed", "own_session_continue", "own_session_find", "partner", "phone_call",
  "routine_propose", "rule_list", "rule_save", "saved_list", "task_find", "task_fork", "task_group",
  "task_open", "task_read", "task_retitle", "task_send", "task_switch", "wait_cancel", "wait_for", "wait_until", "web_look", "without_asking",
]; // saved_list (D191, 0.4K): listed only once something is saved in Autofill (seeded below)
const TASK_TOOLS = ["ask_for_key", "checkpoint", "log_read", "log_search", "memory_search", "report_to_main", "wait_for"]; // memory_search: only where Mem is connected and the plugin is absent (D168); ask_for_key (D233, 0.8K): every task not in a browser place
/** JSON characters of the whole tools/list result (≈ chars / 3.6 tokens). */
const CEILING = {
  partner: 51_800, // 51.7K today (D533: keep_change cap, computer, agent and address, 0.25K, so "review 那个以后让 Codex 来做" and the page's 谁来做 change the same rule; D511: keep_list and keep_change take the place of routine_list and routine_change, and + keep_make, 2.1K with the eval's wording (a first look the model's call, an address with no clock, stop never by task_send), so "盯着这班机票，降到 2000 告诉我" and a babysitter their agents hand PRs to are one Keep made at once with its receipt card; the helper tool, Bridge-only, is gone); 49.3K before (D510: + new_tasks, 0.5K, "以后默认在 hel 上跑，用 Codex" sets New tasks start from the conversation, the setting Settings › Partner shows; D499: without_asking answers a task's ask of a step the person already allowed and keeps a go for one task, with three task steps (ci_rerun, pr_comment, branch_push), 0.35K; rule_save no_second_look, 0.13K, so 这类不用复查 is the partner's to keep, not a code reader's; D495: + without_asking, 0.85K: the partner records a standing go for an outward action, "review 直接发，别问我" or a loop told to keep posting, with the words checked as theirs, in place of a code reader; D490: memory_add said, the words of theirs a memory rests on, checked word for word, and its content a statement, never that a tool or computer cannot do something; memory_search reads their past conversations with every search and says two a turn, 0.4K, in place of ONE_TIME, ASKS_RECALL and POINTS_AT_THREAD; D486: + partner, 1.3K, make, pass to and rename the person's partners from the conversation ("再给我做一个管家里事的伙伴", "跟小家说一声…"); D478: + task_open effort (the partner reads 仔细 / carefully, no code reads the words), 0.2K; D479: every schema inside every model family's limits, 1.9K: routine_propose's trigger and place name their fields (Gemini refuses an object with none), failWhen names its fields, a free-form input is JSON text, task_open replaces says it is how a task that couldn't start opens elsewhere; keep_going's check shed its examples, 1.3K, wait_for's are enough; D462: needs.site as a domain, the app tool says a task app is made with its html and removes at once, 0.1K, after the Codex eval; D436: task_open needs.buy and one sentence on buying or booking, 0.25K, so "帮我订下周五去杭州的高铁" is one errand that stops at the checkout for the person's own tap; D427: routine_pause becomes routine_change, which also resumes, runs one now, changes a task in rounds' rhythm and ends one, and routine_list covers tasks in rounds with health and where, 0.35K, so "我的循环任务都怎么样了", "把 review 改成每小时" and "别跑了" work from the conversation; D426: + task_open asks and task_send asks, 0.3K, "查下周预约，再把这三个记进日历" opens one task whose four things each tick off under the message; D422: app + 0.4K, answer first with adding folded last, what they just said goes in, no native date or time input, each fact its own element, no delete on every row, and 28 marks by meaning in icon, so "做个小应用记宝宝喝奶。今天 6:10 喝了 120ml" opens with today's 210ml on top and both feeds in; D416: + antigravity in the harness enums of task_open, task_switch, task_fork and rule_save, 0.2K, "让 Antigravity 来做" and "Gemini 的事交给 Antigravity"; D410: app grows 1.3K, the kit's class names, prefill from what the partner knows, its shelf line, icon, remove and shelf, so "给我做个小应用，记一下出差花销" opens finished, already filled with the trip, and "删掉它" / "我的小应用在哪" work from the conversation; D405: + app, 0.9K, "做个记北京出差花销的小应用" made and changed by talking, with the authoring rules in its description so a home with no app pays only this; D391: + task_find and task_fork, 2.2K, "接着上周那个 compaction 的 PR" found in every task with where it stopped, and "从第 3 步换 Codex 再试" redone from a step in one turn; D390: + brain_switch, 0.55K, "用 astra 跟我聊" switches what the partner itself thinks with; D383: + made_find, 0.65K, "找一下上周做的那个行程表" and "the PDF you made for the visa" found and shown again from the conversation; D380: + web_look, 0.6K, one live fact from the web back in seconds without a task; D376: + own_session_find and own_session_continue, 1.1K, "接着我终端里那个 Claude 在做的" from the conversation, and task_switch device/confirmed, 0.3K, a follow-up that needs another computer's sign-ins; D373: task_open and task_send say continuity first, errands as well as code, 0.1K; D372: + task_open kind, rule_save kind/never and harness "别用 X", 0.45K, errands routed to a faster model and "别用 Claude Code 订酒店"; D360: + task_group, 0.6K, "把这几件放一起" from the conversation, and task_open group, 0.3K, a split opened as its parts held in line; D352: + task_switch, 0.7K, "这个任务换成 6.2 sol" without a trip to the app; D300: + did_list, 0.6K, the partner's answer to "what did you send for me today?" from the Done for you record; D245: routine_propose watch, routine_list run state; D247: needs.phone covers the person's own phone; D243: + noticed, 0.5K, the partner's answer to "anything for me?" from the same detectors as the note); (D215's call sheet fields on phone_call, D217's needs.phone on task_open): 26 tools (phone_call, D193, 2.2K after trimming; D206 media on task_open and task_send); wait_for (3.9K) and task_open (4.8K) are the largest
  partnerWithCalendar: 53_300, // D533: keep_change cap, computer, agent, address, 0.25K (see partner); D511: keep_make, keep_list, keep_change, 2.1K (see partner); D510: + new_tasks, 0.5K (see partner); D499: without_asking answer, task and three task steps, rule_save no_second_look, 0.5K (see partner); D495: + without_asking, 0.85K (see partner); D490: memory_add said, memory_search conversations and two a turn, 0.4K (see partner); D486: + partner, 1.3K (see partner); D478: + task_open effort (the partner reads 仔细 / carefully, no code reads the words), 0.2K; D479: every schema inside every model family's limits, 1.9K (see partner); D477: + task_open where and replaces (the person's word on where, recorded by the partner; the work a reopen carries on), 0.3K, with 0.25K trimmed from place and needs, so "只在 hel 上做，不要用 Mac" is held by code from what the partner recorded; D462: needs.site, app; D436: task_open needs.buy; D427: routine_change, routine_list with tasks in rounds; D426: + task_open/task_send asks; D422: app + 0.4K; D416: + antigravity in four harness enums; D410: app + 1.3K; D405: + app; D391: + task_find, task_fork; D390: + brain_switch; D383: + made_find; D380: + web_look; D376: + own_session_find/continue, task_switch device; D373: continuity first in task_open/task_send; D372: + task_open kind, rule_save kind/never; D360: + task_group and task_open group; D352: + task_switch
  partnerWithTodos: 54_000, // 53.9K: D533: keep_change cap, computer, agent, address, 0.25K (see partner); D511: keep_make, keep_list, keep_change, 2.1K (see partner); D510: + new_tasks, 0.5K (see partner); D499: without_asking answer, task and three task steps, rule_save no_second_look, 0.5K (see partner); D495: + without_asking, 0.85K (see partner); D490: memory_add said, memory_search conversations and two a turn, 0.4K (see partner); D486: + partner, 1.3K (see partner); D478: + task_open effort (the partner reads 仔细 / carefully, no code reads the words), 0.2K; D479: every schema inside every model family's limits, 1.9K (see partner); D477: + task_open where and replaces, 0.3K, 0.25K trimmed from place and needs; D436: task_open needs.buy, 0.25K; D431: app + 0.2K, the empty first screen (k-none, a ghost list, the first add open); D429: routine_list say; D427: routine_change, routine_list with tasks in rounds; D426: + task_open/task_send asks; D422: app + 0.4K (answer first, filled from what they said, marks by meaning); D416: + antigravity in four harness enums; D410: app + 1.3K; D405: + app; D391: + task_find, task_fork; D390: + brain_switch; D385: + todos do=find, and do=hand set/note/shape/group (≈0.6K incl. their params), a subject pulled out as a set card and handed over with the person's note from the conversation; D383: + made_find; D380: + web_look; D376: + own_session_find/continue, task_switch device; D373: continuity first in task_open/task_send; D372: + task_open kind, rule_save kind/never; D360: + task_group and task_open group; D359: + todos do=sort and do=hand (≈0.3K), the pile sorted and handed over from the conversation; D352: + task_switch; D341: + todos (≈1.4K), listed only while a to-do source is on or the home's gh is signed in // D300: + did_list; D245, D247; D243: + noticed; D222: + calendar (≈1.9K), listed only while a calendar account is connected
  taskRelayed: 11_100, // D483: checkpoint owns (a PR the task opened, watched for it) and untilISO saying every wait ends, 0.2K; D479: wait_for inside Gemini's limits (oneOf's items, equals typed, failWhen's fields, event config as JSON text), 0.4K; D448: + agent_message (≈0.9K), listed only for a task on an agent with no Bridge of its own while Bridge is on, so "问问我终端里的 Codex" works from a pi or Antigravity task
  task: 10_300, // 10.2K: D483: checkpoint owns (a PR the task opened: its reviews, CI and pushes wake it) and untilISO saying every wait ends, 0.2K; D479: wait_for inside Gemini's limits (an array's items, a typed equals, failWhen's fields, config as JSON text), 0.4K, so an Antigravity task's first call goes through; D426: report_to_main asks, 0.3K, each thing asked ticked off under the message by its own state; 7 tools (ask_for_key, D233, 0.7K); wait_for alone is 3.6K; memory_search (1.2K) is the D168 fallback where the Mem plugin is absent
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

// D341: the todos tool is listed only while a to-do source is on (or GitHub could be read through the home's gh).
test("with a to-do source: todos is listed, still under a ceiling", async () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-tools-todos-"));
  const gh = fakeGh([{ repo: "acme/web", number: 12, title: "Fix the login redirect" }]);
  const c = startCore({ dataDir: d, port: 0, push: false, platform: "darwin", taskSources: { ghRun: gh.run, ghEnv: {}, pollMs: 3_600_000 } });
  c.autofill.store.put({ kind: "card", name: "Budget", number: "4242424242424242", expMonth: 12, expYear: 2099 });
  expect((await c.taskSources.add("github")).ok).toBe(true);
  const p = createPartner(c as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  try {
    const cfg = c.mcp.configFor("partner");
    const req = new Request("http://127.0.0.1/mcp", { method: "POST", headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    const tools = ((await (await c.mcp.handle(req)).json()) as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual([...PARTNER_TOOLS, "todos"].sort());
    expect(JSON.stringify(tools).length).toBeLessThan(CEILING.partnerWithTodos);
    // Listing it wrote nothing to GitHub.
    expect(gh.comments).toEqual([]);
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

// D448: agent_message is listed only for a task Ducter carries messages for (Bridge on, an agent whose
// Mem plugin has no Bridge of its own): such a task's list grows by it, under its own ceiling; a
// Claude Code task's list stays the same.
test("a task Ducter carries messages for: agent_message is listed for it, still under a ceiling", async () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-tools-relay-"));
  const c = startCore({ dataDir: d, port: 0, push: false, platform: "darwin" });
  registerTaskTools(c as never, {});
  const no = { ok: false as const, reason: "refused" as const, message: "" };
  const bridge = { check: async () => ({ ok: true as const, messages: [] }), reply: async () => no, send: async () => no, contacts: async () => ({ ok: true as const, contacts: [], more: false }) };
  const p = createPartner(c as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {}, bridge, bridgeIntervalMs: 0, bridgeStartMark: false });
  try {
    const listFor = async (taskId: string) => {
      const cfg = c.mcp.configFor({ taskId });
      const req = new Request("http://127.0.0.1/mcp", { method: "POST", headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
      return ((await (await c.mcp.handle(req)).json()) as { result: { tools: { name: string }[] } }).result.tools;
    };
    c.log.append({ stream: "task:tp", origin: "partner", kind: "task_open", body: { taskId: "tp", title: "x", project: "", place: { kind: "none" }, harness: "pi", brief: "x" } });
    c.log.append({ stream: "task:tc", origin: "partner", kind: "task_open", body: { taskId: "tc", title: "x", project: "", place: { kind: "none" }, harness: "claude-code", brief: "x" } });
    c.log.append({ stream: "task:tb", origin: "partner", kind: "task_open", body: { taskId: "tb", title: "x", project: "", place: { kind: "browser" } as never, harness: "claude-code", brief: "x" } });
    const pi = await listFor("tp");
    expect(pi.map((t) => t.name).sort()).toEqual([...TASK_TOOLS, "agent_message"].sort());
    expect(JSON.stringify(pi).length).toBeLessThan(CEILING.taskRelayed);
    // D494: a Claude Code task too (the home receives for every task); never a browser task (D62).
    expect((await listFor("tc")).map((t) => t.name).sort()).toEqual([...TASK_TOOLS, "agent_message"].sort());
    expect((await listFor("tb")).map((t) => t.name)).not.toContain("agent_message");
  } finally {
    await p.close();
    await c.stop();
    rmSync(d, { recursive: true, force: true });
  }
});
