// How big the partner's live session is, and what happens when it grows (principle 4,
// research/11 §7.3.7): the harness's own count replaces the estimate, the size survives a
// restart, a session re-cuts even with no digest, the harness's own compactor is bounded for the
// partner only, and a compaction it runs anyway is recorded and undone by a re-cut.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/partner.ts";
import { memorySpineStore } from "../src/spine/spine.ts";
import type { DigestWriter } from "../src/spine/writer.ts";
import { FakeClock, fakeCore, fakeRunner, type FakeSession } from "./fakes.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-ctx-"));
  dirs.push(d);
  return d;
};

/** A harness that reports its context size at each turn end (as OAR's contextUsage does). */
function reporting(sizes: number[]) {
  return (_input: string, s: FakeSession, n: number) => {
    s.say("好。");
    const contextTokens = sizes[Math.min(n, sizes.length - 1)];
    s.emit({ role: "system", turnEnd: true, ...(contextTokens ? { usage: { inputTokens: 10, contextTokens } } : {}) });
  };
}

function setup(script: Parameters<typeof fakeRunner>[0], opts: Partial<Parameters<typeof createPartner>[2]> = {}, dir = tmp()) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, dir);
  const fr = fakeRunner(script);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, prewarm: false, onError: () => {}, spine: false, persistState: false, historyLimit: 4, ...opts });
  const say = async (text: string) => {
    clock.advance(60_000);
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
    await partner.idle();
  };
  const sessionEvents = () => fc.events.filter((e) => e.kind === "partner_session").map((e) => ({ stream: e.stream, ...(e.body as Bodies["partner_session"]) }));
  return { clock, fc, fr, partner, say, sessionEvents, dir };
}

test("the harness's own count is the context size: a short exchange that holds 150K re-cuts at the next turn", async () => {
  // Each turn is a few characters (the estimate would say tens of tokens), but the harness says
  // the context holds 150K: the system prompt, tool schemas, tool inputs and thinking count too.
  const w = setup(reporting([150_000, 20_000]));
  await w.say("在吗");
  expect(w.partner.stats.contextTokens).toBe(150_000);
  expect(w.fr.sessions.length).toBe(1);
  await w.say("继续");
  expect(w.partner.stats.recuts).toBe(1);
  expect(w.fr.sessions.length).toBe(2);
  expect(w.fr.sessions[0]!.closed).toBe(true);
  expect(w.partner.stats.contextTokens).toBe(20_000); // the new session's own count
  // Logged before it applied, on the partner's own stream, never the channel.
  expect(w.sessionEvents()).toEqual([{ stream: "partner", event: "recut", harness: "claude-code", sessionId: "sess-1", contextTokens: 150_000, digested: false }]);
  await w.partner.close();
});

test("without a harness count the estimate still adds up, and a small session never re-cuts", async () => {
  const w = setup(reporting([]));
  for (let k = 0; k < 4; k++) await w.say(`第 ${k} 句`);
  expect(w.partner.stats.recuts).toBeUndefined();
  expect(w.fr.sessions.length).toBe(1);
  expect(w.partner.stats.contextTokens).toBeGreaterThan(0);
  expect(w.partner.stats.contextTokens).toBeLessThan(1_000);
  await w.partner.close();
});

test("resume: the size is kept in state.json and restored, so a resumed session re-cuts on time", async () => {
  const dir = tmp();
  const a = setup(reporting([90_000]), { persistState: true }, dir);
  await a.say("你好");
  await a.partner.close();
  const state = JSON.parse(readFileSync(join(dir, "partner", "state.json"), "utf8"));
  expect(state.contextTokens).toBe(90_000);

  // A restart a minute later resumes the same session and keeps its size.
  const b = setup(reporting([110_000, 130_000]), { persistState: true }, dir);
  b.clock.advance(60_000);
  await b.say("还在吗");
  expect(b.partner.stats.resumes).toBe(1);
  expect(b.fr.sessions[0]!.spec.resumeSessionId).toBe("sess-1");
  expect(b.partner.stats.contextTokens).toBe(110_000);
  await b.partner.close();

  // Persisted past the re-cut size: the restart starts fresh from the projection instead of
  // resuming a session it would cut on the next turn.
  writeFileSync(join(dir, "partner", "state.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(dir, "partner", "state.json"), "utf8")), contextTokens: 140_000 }));
  const c = setup(reporting([30_000]), { persistState: true, prewarm: true }, dir);
  await c.say("接着说");
  expect(c.partner.stats.resumes).toBe(0);
  expect(c.partner.stats.recuts).toBe(1);
  expect(c.fr.sessions.length).toBe(1);
  expect(c.fr.sessions[0]!.spec.resumeSessionId).toBeUndefined();
  expect(c.sessionEvents()).toMatchObject([{ event: "recut", sessionId: "sess-1", contextTokens: 140_000 }]);
  await c.partner.close();
});

test("no digests (DUCTER_DIGEST=off): a warm session past the size re-cuts onto the window and a pointer to the rest", async () => {
  const w = setup(reporting([1_000, 1_000, 1_000, 1_000, 1_000, 125_000, 5_000]));
  for (let k = 0; k < 6; k++) await w.say(`第 ${k} 件事`);
  expect(w.fr.sessions.length).toBe(1);
  await w.say("最后一件");
  expect(w.partner.stats.recuts).toBe(1);
  const seed = w.fr.sessions[1]!.inputs[0]!;
  // historyLimit 4: the last few lines verbatim, with seqs, and where the older ones are.
  expect(seed).toMatch(/\(#1–#\d+ are not shown here; log_read or log_search them when you need them\)/);
  expect(seed).toMatch(/#\d+ \[2026-/);
  expect(seed).toContain("第 5 件事");
  expect(seed).not.toContain("第 0 件事");
  expect(seed).not.toMatch(/reset|restart|lost|重置|重启/i);
  expect(w.sessionEvents()[0]).toMatchObject({ event: "recut", digested: false, contextTokens: 125_000 });
  await w.partner.close();
});

test("a failing digest writer: the session re-cuts anyway, onto the verbatim window and the gap pointer", async () => {
  const failing: DigestWriter = { name: "down", write: async () => Promise.reject(new Error("writer down")) };
  const store = memorySpineStore();
  const w = setup(reporting([2_000, 2_000, 2_000, 2_000, 2_000, 2_000, 2_000, 2_000, 125_000, 5_000]), {
    spine: { writer: failing, store, cut: { hiTokens: 120, loTokens: 40, minTokens: 30, quietMs: 3600_000, gapMs: 30 * 60_000 }, pokeMs: 0 },
  });
  for (let k = 0; k < 9; k++) await w.say(`第 ${k} 件事：` + "细节".repeat(20));
  await w.partner.spine!.idle();
  expect(store.records.length).toBe(0); // nothing frozen: the writer never got one through
  expect(w.fr.sessions.length).toBe(1);
  await w.say("再说一件");
  expect(w.partner.stats.recuts).toBe(1);
  const seed = w.fr.sessions[1]!.inputs[0]!;
  expect(seed).not.toContain("<earlier_conversation>");
  expect(seed).toMatch(/are not shown here; log_read or log_search them/);
  expect(seed).toContain("第 8 件事");
  expect(w.sessionEvents()[0]).toMatchObject({ event: "recut", digested: false });
  await w.partner.close();
});

test("the harness's compactor is bounded for the partner, above the re-cut", async () => {
  const w = setup(reporting([]));
  await w.say("你好");
  const spec = w.fr.sessions[0]!.spec;
  expect(spec.harnessCompactAt).toBe(200_000);
  expect(spec.contextWindow).toBe(200_000); // D135: a small window, standard-window model (runner/oar.ts)
  expect(spec.harnessCompactAt!).toBeGreaterThan(120_000);
  expect(spec.isolateUserConfig).toBe(true); // the adapter loads its tools up front (runner/oar.ts)
  await w.partner.close();
  // A larger re-cut size keeps the bound above it.
  const big = setup(reporting([]), { recutTokens: 300_000 });
  await big.say("你好");
  expect(big.fr.sessions[0]!.spec.harnessCompactAt).toBe(450_000);
  await big.partner.close();
});

test("a compaction the harness runs anyway is logged and the next turn re-cuts onto Ducter's projection", async () => {
  const w = setup((_input, s, n) => {
    s.say("好。");
    if (n === 0) s.emit({ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "auto" } });
    s.emit({ role: "system", turnEnd: true, usage: { contextTokens: 30_000 } });
  });
  await w.say("你好");
  expect(w.partner.stats.harnessCompactions).toBe(1);
  expect(w.sessionEvents()).toMatchObject([{ stream: "partner", event: "harness_compacted", harness: "claude-code", sessionId: "sess-1", outcome: "completed", trigger: "auto" }]);
  await w.say("继续");
  expect(w.partner.stats.recuts).toBe(1);
  expect(w.fr.sessions.length).toBe(2);
  await w.say("再继续");
  expect(w.fr.sessions.length).toBe(2); // once: the fresh session is Ducter's own
  // Nothing about it reaches the channel.
  expect(w.fc.events.filter((e) => e.stream === "channel" && e.origin !== "user").map((e) => JSON.stringify(e.body)).join("\n")).not.toMatch(/compact|recut/i);
  await w.partner.close();
});
