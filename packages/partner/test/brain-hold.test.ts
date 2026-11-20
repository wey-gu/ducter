// D435: the partner never goes quiet when its own agent runs out. Fakes only: a fake harness whose
// Claude Code turns fail on the usage limit with a reset time, core's real hold (brain-hold.ts) on
// a fake clock, and an in-memory Log. Out of credit → the next agent answers → said once → back at
// the reset; nobody else → said once, the messages wait, answered at the reset in order; a restart
// in between keeps the hold and the waiting messages.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrainHold, type BrainHold } from "../../core/src/brain-hold.ts";
import { FakeClock } from "../../core/src/clock.ts";
import type { Bodies, HarnessId, LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { clockWords } from "../src/words.ts";
import { FakeClock as PartnerClock, fakeCore, fakeMemory, fakeRunner, type FakeSession } from "./fakes.ts";

const START = Date.parse("2026-11-21T11:30:00Z");
const RESET = "2026-11-21T12:53:00.000Z";
const LIMIT_WORDS = "You've hit your limit · resets 8:53pm (Asia/Shanghai)";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A fake agent home: Claude Code fails on its limit while `out`, every other agent answers. */
function world(o: { home: HarnessId[]; dir?: string }) {
  const clock = new FakeClock(START);
  const fc = fakeCore(new PartnerClock(), o.dir ?? mkdtempSync(join(tmpdir(), "ducter-brain-hold-")));
  const state = { out: true, ran: [] as string[] };
  const fr = fakeRunner(async (input: string, s: FakeSession) => {
    state.ran.push(s.spec.harness);
    if (s.spec.harness === "claude-code" && state.out) {
      // OAR's quota failure with the reset, as the runner normalizes it (normalize.ts turn_ended).
      s.emit({ role: "system", text: `turn failed (quota): ${LIMIT_WORDS}`, turnEnd: true, raw: { kind: "turn_ended", outcome: "failed", failure: "quota", resetsAt: RESET, reason: LIMIT_WORDS } });
      return;
    }
    const asked = /\[user\] ([^\n]+)/g;
    const lines = [...input.matchAll(asked)].map((m) => m[1]!);
    s.say(`(${s.spec.harness}) 答：${lines.at(-1) ?? ""}`);
    s.end();
  });
  const homeNow = () => o.home.map((h) => ({ harness: h, loggedIn: true }));
  const mkHold = () => createBrainHold({ log: fc.core.log, clock, base: () => "claude-code", home: homeNow });
  return { clock, fc, fr, state, mkHold };
}

function boot(w: ReturnType<typeof world>, hold: BrainHold, persist = false) {
  w.fc.core.brainHold = hold;
  const partner = createPartner(w.fc.core, w.fr.runner, { now: () => w.clock.now(), persistState: persist, prewarm: false, settleMs: 0, onError: () => {}, memory: fakeMemory().memory, bridge: null });
  stops.push(() => partner.close(), () => hold.stop());
  const user = (text: string) => {
    const e = w.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
    partner.onTrigger(e);
    return e;
  };
  return { partner, user };
}

const partnerSaid = (events: LogEvent[]) => events.filter((e) => e.stream === "channel" && e.origin === "partner" && e.kind === "ai_msg").map((e) => e.body as Bodies["ai_msg"]);
const settle = async (p: { idle(): Promise<void> }) => {
  for (let i = 0; i < 5; i++) {
    await p.idle();
    await Bun.sleep(5);
  }
};

test("out of credit: Codex answers at once, said once, back to Claude Code at the reset", async () => {
  const w = world({ home: ["claude-code", "codex"] });
  const hold = w.mkHold();
  const { partner, user } = boot(w, hold);
  const m1 = user("今天下午有什么安排？");
  await settle(partner);
  // The turn failed on Claude Code; the same message ran again on Codex, and nothing else did.
  expect(w.state.ran).toEqual(["claude-code", "codex"]);
  const said1 = partnerSaid(w.fc.events);
  expect(said1).toHaveLength(2);
  // One short line first, in the person's language, with the reset in the home's own time.
  const at = clockWords("zh", RESET, START);
  expect(said1[0]!.text).toBe(`Claude Code 的额度用完了，这会儿先用 Codex 答你，${at} 换回来。`);
  expect(said1[0]!.replyTo).toBeUndefined(); // the answer is still owed (a restart redoes it)
  expect(said1[1]!.text).toContain("(codex) 答：今天下午有什么安排？");
  expect(said1[1]!.replyTo).toBe(m1.seq);
  expect(hold.now()).toMatchObject({ from: "claude-code", why: "quota", until: RESET, resetKnown: true, to: "codex" });
  // A second message meanwhile: Codex again, nothing said about it again.
  user("那明天呢？");
  await settle(partner);
  expect(w.state.ran).toEqual(["claude-code", "codex", "codex"]);
  expect(partnerSaid(w.fc.events).filter((b) => b.text.includes("额度"))).toHaveLength(1);
  // The reset comes (with a minute's slack): Claude Code is back, the hold ends on its first good turn.
  w.state.out = false;
  w.clock.advance(Date.parse(RESET) - START + 61_000);
  expect(hold.now()).toBeUndefined();
  user("好的，谢谢");
  await settle(partner);
  expect(w.state.ran.at(-1)).toBe("claude-code");
  const kinds = w.fc.events.filter((e) => e.kind === "partner_session").map((e) => `${(e.body as Bodies["partner_session"]).event}:${(e.body as Bodies["partner_session"]).harness}`);
  expect(kinds).toEqual(["brain_held:claude-code", "brain_back:claude-code"]);
  expect(partnerSaid(w.fc.events).filter((b) => b.text.includes("额度"))).toHaveLength(1);
});

test("nobody else can answer: said once with the reset, the messages wait and are answered then, in order", async () => {
  const w = world({ home: ["claude-code"] });
  const hold = w.mkHold();
  const { partner, user } = boot(w, hold);
  const m1 = user("What's on this afternoon?");
  await settle(partner);
  const m2 = user("And tomorrow?");
  await settle(partner);
  // Tried once; the second message didn't even start a turn.
  expect(w.state.ran).toEqual(["claude-code"]);
  const said = partnerSaid(w.fc.events);
  expect(said).toHaveLength(1);
  expect(said[0]!.text).toBe(`Claude Code is out of credit and no other AI can take over. It's back at ${clockWords("en", RESET, START)}; I'll answer then, and anything you send meanwhile, in order.`);
  expect(hold.now()).toMatchObject({ from: "claude-code", waits: true });
  // A minute short of the reset's slack: still waiting.
  w.clock.advance(Date.parse(RESET) - START);
  await settle(partner);
  expect(w.state.ran).toEqual(["claude-code"]);
  // The time comes: both are answered in one turn, the first first (D236: messages that wait together are one turn).
  w.state.out = false;
  w.clock.advance(61_000);
  await settle(partner);
  const answers = partnerSaid(w.fc.events).slice(1);
  expect(answers).toHaveLength(1);
  expect(answers[0]!.replyTo).toBe(m2.seq);
  const input = w.fr.sessions.at(-1)!.inputs.at(-1)!;
  expect(input.indexOf("What's on this afternoon?")).toBeGreaterThan(-1);
  expect(input.indexOf("What's on this afternoon?")).toBeLessThan(input.indexOf("And tomorrow?"));
  expect(m1.seq).toBeLessThan(m2.seq);
  expect(hold.now()).toBeUndefined();
});

test("a restart in between keeps the hold and the waiting message: answered once, at the reset, nothing said twice", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-brain-hold-restart-"));
  const w = world({ home: ["claude-code"], dir });
  const hold1 = w.mkHold();
  const a = boot(w, hold1, true);
  const m1 = a.user("帮我看看这周的日程");
  await settle(a.partner);
  expect(partnerSaid(w.fc.events)).toHaveLength(1);
  // Ducter stops (the partner and core's hold), and comes back on the same Log.
  await a.partner.close();
  hold1.stop();
  w.clock.advance(10 * 60_000);
  const hold2 = w.mkHold();
  expect(hold2.now()).toMatchObject({ from: "claude-code", why: "quota", until: RESET, waits: true });
  const b = boot(w, hold2, true);
  await settle(b.partner);
  // Re-queued from the Log and held again: no turn, no second line.
  expect(w.state.ran).toEqual(["claude-code"]);
  expect(partnerSaid(w.fc.events)).toHaveLength(1);
  w.state.out = false;
  w.clock.advance(Date.parse(RESET) - START);
  await settle(b.partner);
  const answers = partnerSaid(w.fc.events).slice(1);
  expect(answers).toHaveLength(1);
  expect(answers[0]!.replyTo).toBe(m1.seq);
  expect(w.state.ran).toEqual(["claude-code", "claude-code"]);
});

test("a restart while another agent answers: it keeps answering on Codex, and the line isn't said again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-brain-hold-restart2-"));
  const w = world({ home: ["claude-code", "codex"], dir });
  const hold1 = w.mkHold();
  const a = boot(w, hold1, true);
  a.user("今天下午有什么安排？");
  await settle(a.partner);
  await a.partner.close();
  hold1.stop();
  const b = boot(w, w.mkHold(), true);
  b.user("那明天呢？");
  await settle(b.partner);
  expect(w.state.ran).toEqual(["claude-code", "codex", "codex"]);
  expect(partnerSaid(w.fc.events).filter((x) => x.text.includes("额度"))).toHaveLength(1);
});
