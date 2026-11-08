// Regressions from the live runs (2026-11-09): language, ack latency (prewarm).
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script, extra: Parameters<typeof createPartner>[2] = {}) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-reg-")));
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, ...extra });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user };
}
const ok: Script = (_i, s) => {
  s.say("ok");
  s.end();
};

describe("live-run regressions", () => {
  test("English message gets an explicit reply-in-English line; Chinese does not", async () => {
    const { fr, partner, user } = setup(ok);
    user("Fix the flaky test in ~/dev/foo, then tell me.");
    await partner.idle();
    expect(fr.sessions[0]!.inputs[0]).toContain("[language] The user wrote this in English");
    user("修一下");
    await partner.idle();
    expect(fr.sessions[0]!.inputs[1]).not.toContain("[language]");
  });

  test("prewarm: the session starts at creation and the first turn still carries the seed", async () => {
    const { fc, fr, partner, user } = setup(ok);
    await Bun.sleep(5);
    expect(fr.sessions).toHaveLength(1); // started before any message
    expect(fr.sessions[0]!.inputs).toHaveLength(0);
    fc.core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "earlier" } });
    user("hi");
    await partner.idle();
    expect(fr.sessions).toHaveLength(1);
    expect(partner.stats.freshStarts).toBe(1);
    expect(fr.sessions[0]!.inputs[0]).toContain("<conversation_so_far>");
  });

  test("the partner session always isolates the user's harness config", async () => {
    const { fr, partner, user } = setup(ok);
    user("hi");
    await partner.idle();
    expect(fr.sessions[0]!.spec.isolateUserConfig).toBe(true);
  });

  test("task_open without title derives one from the brief; without brief it fails before touching the channel", async () => {
    let bad: any, good: any;
    const { fc, fr, partner, user } = setup(async (_i, s) => {
      bad = await fc.callTool("task_open", { title: "x" });
      good = await fc.callTool("task_open", { brief: "User's words: \"Fix the flaky test in ~/dev/foo\"\nDone: tests pass" });
      s.end();
    });
    user("Fix the flaky test in ~/dev/foo");
    await partner.idle();
    expect(bad.ok).toBe(false);
    expect(good.ok).toBe(true);
    expect(fr.opened).toHaveLength(1);
    expect(fr.opened[0]!.title).toBe("User's words: \"Fix the flaky test in ~/dev/foo\"");
    const channelText = JSON.stringify(fc.events.filter((e) => e.stream === "channel").map((e) => e.body));
    expect(channelText).not.toContain("undefined");
    expect(fc.events.filter((e) => e.kind === "ack")).toHaveLength(1);
    expect(fc.events.filter((e) => e.kind === "job_status").map((e) => (e.body as any).state)).toEqual(["running"]);
  });

  test("prewarm off: no session until the first trigger", async () => {
    const { fr, partner, user } = setup(ok, { prewarm: false });
    await Bun.sleep(5);
    expect(fr.sessions).toHaveLength(0);
    user("hi");
    await partner.idle();
    expect(fr.sessions).toHaveLength(1);
  });
});
