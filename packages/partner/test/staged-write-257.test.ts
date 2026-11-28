// D659 (#257): a staged connection write is drawn as a staged write with its outcome, never
// as an `ask`; its answer line wakes nobody; its outcome is the wake; and a preamble before the
// card is not sent as a message.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { openConnections, ooSource } from "../../core/src/connections.ts";
import { fakeOpenConnector } from "../../core/test/fake-mcp.ts";
import { createPartner } from "../src/index.ts";
import { isTrigger } from "../src/partner.ts";
import { renderHistoryLine, renderTrigger } from "../src/render.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type FakeSession } from "./fakes.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-staged257-"));
  dirs.push(d);
  return d;
};

const write = { connection: "Gmail", action: "gmail.send_email" };
const decision = (decisionId: string): Bodies["decision"] => ({ decisionId, question: "Send it?", goLabel: "Send", defaultOption: "hold", reversible: false, write });
const call = (decisionId: string, state: Bodies["connection_call"]["state"], more: Partial<Bodies["connection_call"]> = {}): Bodies["connection_call"] => ({
  callId: `c_${decisionId}_${state}`,
  connectionId: "c1",
  connection: "Gmail",
  action: "gmail.send_email",
  op: "write",
  state,
  decisionId,
  staged: true,
  wake: "always",
  ...more,
});

test("history: a staged write and its outcome, never `you asked (ask)`", async () => {
  const clock = new FakeClock();
  const dir = tmp();
  const fc = fakeCore(clock, dir);
  fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "send it to Lina" } });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: decision("d1") });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "needs_go") });
  fc.core.log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "done", { summary: "sent m1" }) });
  const fr = fakeRunner((_i, s) => {
    s.say("好。");
    s.emit({ role: "system", turnEnd: true, usage: { inputTokens: 10, contextTokens: 3_000 } });
  });
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, prewarm: false, onError: () => {}, spine: false, persistState: false, recutTokens: 2_000 });
  const say = async (text: string) => {
    clock.advance(60_000);
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
    await partner.idle();
  };
  await say("继续");
  await say("然后呢");
  expect(partner.stats.recuts).toBeGreaterThan(0);
  const seed = fr.sessions[fr.sessions.length - 1]!.inputs[0]!;
  expect(seed).toContain("you staged a write: gmail.send_email on Gmail");
  expect(seed).toContain("connection_call decision d1");
  expect(seed).toMatch(/write ran, decision d1/);
  expect(seed).toMatch(/Ran: gmail\.send_email on Gmail \(sent m1\)/);
  expect(seed).not.toContain("you asked (ask)");
  await partner.close();
});

test("the answer line wakes nobody; the staged write's outcome wakes the partner", () => {
  const resolved: LogEvent = { seq: 3, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "go", by: "user", write } };
  expect(isTrigger(resolved)).toBe(false);
  const needs: LogEvent = { seq: 4, ts: "2026-11-28T09:00:01Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "needs_go") };
  expect(isTrigger(needs)).toBe(false);
  for (const state of ["done", "failed", "held"] as const) {
    const e: LogEvent = { seq: 5, ts: "2026-11-28T09:00:02Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", state) };
    expect(isTrigger(e)).toBe(true);
  }
  const quiet = (state: "done" | "failed"): LogEvent => ({ seq: 6, ts: "2026-11-28T09:00:03Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", state, { wake: "quietDone" }) });
  expect(isTrigger(quiet("done"))).toBe(false);
  expect(isTrigger(quiet("failed"))).toBe(true);
});

test("the wake and the history say Ran, Failed or Held with the decision id", () => {
  const ctx = { decision: () => undefined, taskTitle: () => undefined } as never;
  const done = renderTrigger({ seq: 2, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "done", { summary: "sent m1" }) }, ctx);
  expect(done).toContain("Ran: gmail.send_email on Gmail (sent m1)");
  expect(done).toContain("d1");
  const failed = renderTrigger({ seq: 2, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "failed", { error: "not signed in" }) }, ctx);
  expect(failed).toContain("Failed: gmail.send_email on Gmail: not signed in");
  expect(failed).toContain("nothing was sent");
  const held = renderTrigger({ seq: 2, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "held", { answer: "reply" }) }, ctx);
  expect(held).toContain("replied instead");
  expect(held).toContain("nothing was sent");
  const answer = renderTrigger({ seq: 3, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "hold", by: "user", write } }, ctx);
  expect(answer).toContain("staged write");
  expect(answer.toLowerCase()).toContain("nothing has been sent");
  expect(answer).not.toContain("your question answered");
  expect(renderHistoryLine({ seq: 1, ts: "2026-11-28T09:00:00Z", persona: "p1", stream: "channel", origin: "partner", kind: "decision", body: decision("d1") }, ctx)).toContain("you staged a write");
  expect(renderHistoryLine({ seq: 2, ts: "2026-11-28T09:00:01Z", persona: "p1", stream: "channel", origin: "partner", kind: "connection_call", body: call("d1", "done", { summary: "sent m1" }) }, ctx)).toContain("Ran: gmail.send_email on Gmail (sent m1)");
});

test("a preamble written before the card is not sent as a message", async () => {
  const clock = new FakeClock();
  const dir = tmp();
  const oc = fakeOpenConnector(
    [
      { id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) },
      { id: "gmail.send_email", operationType: "write", run: () => ({ id: "m1" }) },
    ],
    "oct_staged_257",
  );
  const fc = fakeCore(clock, dir);
  const conns = openConnections({ dataDir: dir, log: fc.core.log, oo: ooSource({ env: {}, dir: join(dir, "no-oo"), which: () => null }) });
  fc.core.connections = conns;
  let inside: ReturnType<typeof fakeCore> | undefined;
  const fr = fakeRunner(async (_input: string, s: FakeSession) => {
    s.say("Need recipients from the thread.");
    const r = await inside!.callTool("connection_call", {
      connection: "OpenConnector",
      action: "gmail.send_email",
      input: { to: "lina@example.com", body: "Hi" },
      question: "把这封回复发给 Lina 吗？",
      goLabel: "发给 Lina",
    });
    expect((r as { ok?: boolean }).ok).toBe(true);
    s.say("卡片在下面。");
    s.end();
  });
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, prewarm: false, persistState: false, onError: () => {}, memory: fakeMemory([]).memory });
  inside = fc;
  expect((await conns.add({ url: oc.url, token: "oct_staged_257" })).ok).toBe(true);
  partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "回复 Lina" } }));
  await partner.idle();
  const said = fc.events.filter((e) => e.stream === "channel" && (e.kind === "ai_msg" || e.kind === "ack")).map((e) => (e.body as { text: string }).text).join("\n");
  expect(said).not.toContain("Need recipients from the thread.");
  expect(fc.events.some((e) => e.kind === "decision")).toBe(true);
  await partner.close();
});

test("a 30K read is cut to the turn's headroom and does not re-cut the session every turn", async () => {
  const clock = new FakeClock();
  const dir = tmp();
  const big = "x".repeat(30_000);
  const oc = fakeOpenConnector([{ id: "gmail.search_threads", operationType: "read", run: () => ({ text: big }) }], "oct_big_257");
  const fc = fakeCore(clock, dir);
  const conns = openConnections({ dataDir: dir, log: fc.core.log, oo: ooSource({ env: {}, dir: join(dir, "no-oo"), which: () => null }) });
  fc.core.connections = conns;
  const fr = fakeRunner((_i, s) => {
    s.say("好。");
    s.emit({ role: "system", turnEnd: true, usage: { inputTokens: 10, contextTokens: 1_900 } });
  });
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, prewarm: false, persistState: false, onError: () => {}, spine: false, recutTokens: 2_000 });
  expect((await conns.add({ url: oc.url, token: "oct_big_257" })).ok).toBe(true);
  const say = async (text: string) => {
    clock.advance(60_000);
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
    await partner.idle();
  };
  await say("先看看");
  const r = (await fc.callTool("connection_call", { connection: "OpenConnector", action: "gmail.search_threads", input: { query: "all" } })) as { ok: boolean; result: { cutToFit?: boolean; truncated?: boolean; note?: string; head?: string } };
  expect(r.ok).toBe(true);
  expect(r.result.cutToFit).toBe(true);
  expect(r.result.truncated).toBe(true);
  expect(r.result.note).toContain("cut to fit this turn");
  expect(r.result.head!.length).toBeLessThan(big.length);
  expect((r.result.head ?? "").length).toBeLessThanOrEqual(4_000); // ≈1K tokens, well under the 2K re-cut
  const before = partner.stats.recuts ?? 0;
  await say("继续");
  await say("再说一句");
  expect(partner.stats.recuts ?? 0).toBe(before);
  expect(fr.sessions.length).toBe(1);
  await partner.close();
});
