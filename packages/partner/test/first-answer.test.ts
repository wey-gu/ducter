// D440: a message said while nothing on the home can think is kept, said once by code, and
// answered first the moment something to think with arrives (a pasted key, a sign-in). Fakes only:
// core's real hold (brain-hold.ts) over a home whose agents change, a fake harness, an in-memory Log.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrainHold } from "../../core/src/brain-hold.ts";
import { FakeClock } from "../../core/src/clock.ts";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { said } from "../src/words.ts";
import { FakeClock as PartnerClock, fakeCore, fakeMemory, fakeRunner, type FakeSession } from "./fakes.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const partnerSaid = (events: LogEvent[]) => events.filter((e) => e.stream === "channel" && e.origin === "partner" && e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text);
const settle = async (p: { idle(): Promise<void> }) => {
  for (let i = 0; i < 5; i++) {
    await p.idle();
    await Bun.sleep(5);
  }
};

function world() {
  const clock = new FakeClock(Date.parse("2026-11-21T09:00:00Z"));
  const fc = fakeCore(new PartnerClock(), mkdtempSync(join(tmpdir(), "ducter-first-answer-")));
  const ran: string[] = [];
  const fr = fakeRunner(async (input: string, s: FakeSession) => {
    ran.push(s.spec.harness);
    const asked = [...input.matchAll(/\[user\] ([^\n]+)/g)].map((m) => m[1]!);
    s.say(`答：${asked.join(" / ")}`);
    s.end();
  });
  // A fresh Mac: Claude Code isn't signed in; pi is there once the pasted key makes it so.
  const home = [
    { harness: "claude-code", installed: false, loggedIn: false },
    { harness: "pi", installed: false, loggedIn: false },
  ];
  const hold = createBrainHold({ log: fc.core.log, clock, base: () => "pi", home: () => home });
  fc.core.brainHold = hold;
  const partner = createPartner(fc.core, fr.runner, { now: () => clock.now(), persistState: false, prewarm: false, settleMs: 0, onError: () => {}, memory: fakeMemory().memory, bridge: null });
  stops.push(() => partner.close(), () => hold.stop());
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, ran, home, hold, partner, user };
}

test("nothing to think with: the message is kept, said once, and answered first when a key arrives", async () => {
  const w = world();
  expect(w.hold.blind()).toBe(true);
  w.user("周末带爸妈去哪儿吃饭好？");
  await settle(w.partner);
  // No turn on an agent that isn't there; one plain line instead.
  expect(w.ran).toEqual([]);
  expect(partnerSaid(w.fc.events)).toEqual([said("zh", "blind")]);
  // A second message meanwhile: kept too, the line not said again.
  w.user("最好不用排队");
  await settle(w.partner);
  expect(w.ran).toEqual([]);
  expect(partnerSaid(w.fc.events)).toHaveLength(1);
  // The pasted key made pi ready: the home's agents change, and both are answered, in one turn.
  w.home[1] = { harness: "pi", installed: true, loggedIn: true };
  w.hold.seen();
  await settle(w.partner);
  expect(w.ran).toHaveLength(1); // one turn, on whatever core says it thinks with (brain.ts)
  const out = partnerSaid(w.fc.events);
  expect(out).toHaveLength(2);
  expect(out[1]).toContain("周末带爸妈去哪儿吃饭好？");
  expect(out[1]).toContain("最好不用排队");
});

test("in English, and a home that can think never hears the line", async () => {
  const w = world();
  w.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "warm up" } });
  w.home[0] = { harness: "claude-code", installed: true, loggedIn: true };
  w.hold.seen();
  expect(w.hold.blind()).toBe(false);
  w.user("What's a good name for a cat?");
  await settle(w.partner);
  expect(partnerSaid(w.fc.events).some((t) => t === said("en", "blind") || t === said("zh", "blind"))).toBe(false);
  expect(w.ran.length).toBeGreaterThan(0);
});

test("the line in both languages names the two ways in, never an agent the person doesn't have as broken", () => {
  expect(said("zh", "blind")).toContain("API 密钥");
  expect(said("en", "blind")).toContain("API key");
  expect(said("en", "blind")).not.toMatch(/isn't working|out of credit/);
});
