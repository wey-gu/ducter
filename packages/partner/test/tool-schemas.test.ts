// D479: every tool Ducter hands an agent, the partner's and a task's, listed or not, sits inside the
// schema limits of every model any agent sends it to (harness-facts toolSchema, tool-schema.ts).
// Seen live on hel (2026-11-22): wait_for's check said `oneOf: {type: "array"}` with no items, and
// Gemini refused the whole request, so every Antigravity task failed before doing anything.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_FACTS } from "../../protocol/src/harness-facts.ts";
import { HARNESS_IDS } from "../../protocol/src/harnesses.ts";
import { agentToolName, schemaProblems, SCHEMA_DIALECTS, type SchemaDialect } from "../../protocol/src/tool-schema.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { registerTaskTools } from "../../runner/src/tools.ts";
import { createPartner, type PartnerHandle } from "../src/partner.ts";
import { fakeRunner } from "./fakes.ts";
import { fakeOoCalendar } from "../../core/test/fake-oo-calendar.ts";
import { fakeGh } from "../../core/test/fake-gh-issues.ts";

let dir: string;
let core: Core;
let partner: PartnerHandle;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-schemas-"));
  // Everything that registers a tool: a calendar account, a to-do source, Bridge's relay, a saved card.
  const oo = fakeOoCalendar({ day: "2026-11-18" });
  const gh = fakeGh([{ repo: "acme/web", number: 12, title: "Fix the login redirect" }]);
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", ooSource: oo.source, taskSources: { ghRun: gh.run, ghEnv: {}, pollMs: 3_600_000 } });
  core.autofill.store.put({ kind: "card", name: "Budget", number: "4242424242424242", expMonth: 12, expYear: 2099 });
  await core.connections.addFromOo();
  await core.taskSources.add("github");
  registerTaskTools(core as never, {});
  const no = { ok: false as const, reason: "refused" as const, message: "" };
  const bridge = { check: async () => ({ ok: true as const, messages: [] }), reply: async () => no, send: async () => no, contacts: async () => ({ ok: true as const, contacts: [], more: false }) };
  partner = createPartner(core as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {}, bridge, bridgeIntervalMs: 0, bridgeStartMark: false });
});
afterAll(async () => {
  await partner.close();
  await core.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("every agent names the model families it sends tools to, each one known", () => {
  for (const h of HARNESS_IDS) {
    const d = HARNESS_FACTS[h].toolSchema.value;
    expect(d.length).toBeGreaterThan(0);
    for (const x of d) expect(Object.keys(SCHEMA_DIALECTS)).toContain(x);
  }
  // Antigravity is Gemini's, whatever model is chosen in it.
  expect(HARNESS_FACTS.antigravity.toolSchema.value).toContain("gemini");
});

test("every Ducter tool's schema fits every model family an agent sends it to", () => {
  const all = core.mcp.schemas();
  // The set is large enough that a missing registration would show (the partner's and a task's).
  expect(all.filter((t) => t.role === "task").map((t) => t.name)).toEqual(expect.arrayContaining(["wait_for", "report_to_main", "checkpoint", "ask_for_key", "agent_message"]));
  expect(all.filter((t) => t.role === "partner").map((t) => t.name)).toEqual(expect.arrayContaining(["wait_for", "task_open", "calendar", "todos", "app"]));
  const used = new Set<SchemaDialect>(HARNESS_IDS.flatMap((h) => HARNESS_FACTS[h].toolSchema.value));
  const problems: string[] = [];
  for (const t of all)
    for (const d of used) {
      for (const p of schemaProblems(t.inputSchema, d)) problems.push(`${d} ${t.role}.${t.name} ${p}`);
      if (!SCHEMA_DIALECTS[d].value.name.test(agentToolName(t.name))) problems.push(`${d} ${t.role}.${t.name}: the name ${agentToolName(t.name)} is not allowed`);
    }
  expect(problems).toEqual([]);
});

test("the check is structural: the schema hel's Gemini refused is caught", () => {
  const before = { type: "object", properties: { check: { type: "object", properties: { succeedWhen: { type: "object", properties: { equals: {}, oneOf: { type: "array" } } } } } } };
  expect(schemaProblems(before, "gemini")).toEqual([".properties.check.properties.succeedWhen.properties.equals: no type", ".properties.check.properties.succeedWhen.properties.oneOf: an array must say what its items are"]);
  expect(schemaProblems({ type: "object", properties: { config: { type: "object" } } }, "gemini")).toEqual([".properties.config: an object must name its properties"]);
  expect(schemaProblems({ type: "object", properties: { x: { type: "string", additionalProperties: false } } }, "gemini")).toEqual([".properties.x: key additionalProperties is not allowed"]);
  expect(schemaProblems({ type: "object", properties: { n: { type: "number", enum: [1, 2] } } }, "gemini")).toEqual([".properties.n: enum only on a string, with string values"]);
  expect(schemaProblems({ anyOf: [{ type: "object" }] }, "anthropic")).toEqual(['(top): the top level must be {type: "object"}']);
  expect(schemaProblems({ type: "object", properties: { a: { type: "string" } } }, "openai-strict")).toEqual(["(top): additionalProperties must be false", "(top): a must be required"]);
  expect(schemaProblems({ type: "object", properties: { a: { type: "array", items: { type: "string" } } }, required: ["a"] }, "gemini")).toEqual([]);
});
