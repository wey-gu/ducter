// D494: 帮手 / Helpers. The person asks for a standing agent their other agents hand work to; the
// partner makes a helper (never a task that loops on its own); mail to the helper's address from one
// of the person's own agents opens the work without a card, its brief carrying the helper's; the claim
// and the result go back from the helper's own address (never the partner's), and a wait is not a
// result. Fakes only: an in-process Bridge per address, a fake link for the helper's address.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createHelpers } from "../../core/src/helpers.ts";
import { createPartner, renderHelpers, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-helpers-test-"));
const settle = () => new Promise((r) => setTimeout(r, 20));

function box(inbox: BridgeMessage[] = []) {
  const replies: { messageId: string; text: string }[] = [];
  const mail = [...inbox];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: mail.filter((m) => !known.has(m.messageId)) };
    },
    async reply(messageId, text) {
      replies.push({ messageId, text });
      return { ok: true, messageId: `r-${replies.length}`, operation: `op-${replies.length}` };
    },
  };
  return { bridge, replies, deliver: (m: BridgeMessage) => mail.push(m) };
}

const PR: BridgeMessage = { messageId: "bm-pr", from: "codex-mem (Weyl)", agent: "codex-mem", mine: true, text: "Babysit nowledge-co/mem#10932 until it can merge: fix CI, address review; don't merge." };

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const links: string[] = [];
  const revoked: string[] = [];
  const helpers = createHelpers({
    dataDir: fc.core.dataDir,
    partnerName: () => "Ducter",
    home: () => "hel",
    link: () => ({
      async connectAs(agentId) {
        links.push(agentId);
        return { ok: true, context: `${agentId}-on-hel`, connectionId: `c-${agentId}`, spaceId: "personal-1" };
      },
      async revokeConnection(id) {
        revoked.push(id);
        return true;
      },
    }),
  });
  (fc.core as { helpers?: unknown }).helpers = helpers;
  const main = box();
  const hb = box();
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: main.bridge, helperBridge: () => hb.bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0 });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  const report = (taskId: string, state: "done" | "blocked", summary: string) =>
    partner.onTrigger(fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, evidence: [], questions: [] } }));
  return { fc, fr, partner, helpers, main, hb, links, revoked, user, report };
}

describe("D494: a helper", () => {
  test("made by the partner's tool; its address is made by the home; mail to it opens the work; answers go from its address", async () => {
    const inputs: string[] = [];
    const r: any[] = [];
    const { fc, fr, partner, helpers, main, hb, links, user, report } = setup(async (input, s, n) => {
      inputs.push(input);
      if (n === 0) r.push(await fc.callTool("helper", { do: "make", name: "Nowledge Mem PR babysitter", about: "PRs on nowledge-co/mem my agents hand over", brief: "Watch the PR's CI and reviews; fix and push to its own branch; never merge; ask me before replying to a reviewer." }));
      if (n === 1) r.push(await fc.callTool("task_open", { title: "Babysit mem#10932", brief: "nowledge-co/mem#10932: get it mergeable." }));
      s.end();
    });
    user("帮我启动一个 codex 的 loop agent，名字就叫 Nowledge Mem PR babysitter");
    await partner.idle();
    await settle();
    expect(r[0]).toMatchObject({ ok: true, made: { name: "Nowledge Mem PR babysitter" } });
    expect(r[0].next).toContain("设置 › Agent 通信"); // the pane by its real name, in the person's language
    expect(links).toEqual(["ducter-helper-nowledge-mem-pr-babysitter"]);
    expect(helpers.listening()).toEqual([{ id: "nowledge-mem-pr-babysitter", name: "Nowledge Mem PR babysitter", context: "ducter-helper-nowledge-mem-pr-babysitter-on-hel" }]);
    hb.deliver(PR);
    await partner.checkBridge();
    await partner.idle();
    expect(inputs[1]).toContain('[message to your helper "Nowledge Mem PR babysitter" from');
    expect(inputs[1]).toContain('[helpers] ');
    expect(r[1].ok).toBe(true); // no card: making the helper was the go
    expect(fr.opened.length).toBe(1);
    expect(fr.opened[0]!.brief).toContain("交给「Nowledge Mem PR babysitter」的");
    expect(fr.opened[0]!.brief).toContain("never merge");
    // The claim went from the helper's address, not the partner's.
    expect(hb.replies.length).toBe(1);
    expect(main.replies.length).toBe(0);
    // A wait on CI is not an outcome; done is, in the task's own words.
    report("t1", "blocked", "Waiting for CI on the new head.");
    await partner.idle();
    expect(hb.replies.length).toBe(1);
    report("t1", "done", "mem#10932 can merge: CI green, both review threads resolved.");
    await partner.idle();
    expect(hb.replies[1]).toEqual({ messageId: "bm-pr", text: "mem#10932 can merge: CI green, both review threads resolved." });
    const ins = fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in").map((e) => e.body as Bodies["bridge_msg"]);
    expect(ins[0]).toMatchObject({ helper: "nowledge-mem-pr-babysitter", messageId: "bm-pr" });
  }, 20_000);

  test("a teammate's agent writing to a helper still waits for the person; a stopped helper's address is ended", async () => {
    const r: any[] = [];
    const { fc, fr, partner, helpers, hb, revoked } = setup(async (_i, s) => {
      r.push(await fc.callTool("task_open", { title: "x", brief: "x" }));
      s.end();
    });
    const made = helpers.make({ name: "PR babysitter", about: "PRs", brief: "" });
    if (!made.ok) throw new Error("not made");
    await helpers.tick();
    hb.deliver({ messageId: "bm-t", from: "reviewer (Alex)", agent: "reviewer", text: "babysit my PR" });
    await partner.checkBridge();
    await partner.idle();
    expect(fr.opened.length).toBe(0);
    await helpers.stop(made.helper.id);
    expect(revoked).toEqual([`c-${made.helper.agentId}`]);
    expect(helpers.listening()).toEqual([]);
    expect(helpers.get(made.helper.id)?.state).toBe("stopped");
  }, 20_000);

  test("the [helpers] line: name, what it takes, its address, its work on hand", () => {
    const line = renderHelpers(
      [{ id: "b", name: "PR babysitter", about: "PRs on mem", brief: "", persona: "default", agentId: "ducter-helper-pr-babysitter", state: "on", createdAt: "", mem: "ready" }],
      () => [{ taskId: "t9", title: "mem#10932" }],
      "zh",
    );
    expect(line).toContain('"PR babysitter" (takes: PRs on mem; on, its address works; on hand: task t9 "mem#10932")');
    expect(line).toContain("设置 › Agent 通信");
  });
});
