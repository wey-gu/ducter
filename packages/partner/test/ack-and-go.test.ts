// D120 ack and go: the ack ends the user's wait, and the task starts from the streamed head of
// its task_open call (title + place) while the model is still writing the brief.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PartnerActivity, Place, TaskCard } from "../../protocol/src/index.ts";
import type { Runner } from "../../protocol/src/internal.ts";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const T = "mcp__ducter__task_open";
const FS = { home: "/Users/w", isDir: (p: string) => p.startsWith("/Users/w/dev/foo"), isRepo: (p: string) => p === "/Users/w/dev/foo" };

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-ack-go-")));
  const acts: (PartnerActivity | null)[] = [];
  fc.core.activity = { set: (a) => void acts.push(a) };
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const early: { input: Parameters<NonNullable<Runner["openTaskEarly"]>>[0]; brief?: string; rejected?: string; at: number }[] = [];
  let n = 0;
  fr.runner.openTaskEarly = async (input, brief) => {
    const rec: (typeof early)[number] = { input, at: fc.events.length };
    early.push(rec);
    brief.then(
      (b) => void (rec.brief = b),
      (e: Error) => void (rec.rejected = e.message),
    );
    const card: TaskCard = { taskId: `e${++n}`, persona: input.persona, title: input.title, project: "", place: input.place ?? ({ kind: "none" } as Place), harness: "claude-code", attention: "queued", residency: "provisioning", openedAt: "", updatedAt: "" };
    fc.cards.set(card.taskId, card);
    return card;
  };
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, fs: FS, memory: undefined });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user, early, acts };
}

test("the task starts from the call's head, before its brief; the ack ends the waiting line", async () => {
  let result: any;
  let openedBeforeCall = false;
  const { fc, fr, partner, user, early, acts } = setup(async (_i, s) => {
    s.say("好，我去看看 foo 里那个不稳定的测试，弄清楚了告诉你。");
    s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
    s.emit({ role: "tool", tool: { name: T, input: { title: "foo: 不稳定的测试" } }, raw: { kind: "tool_call_title", callId: "c1" } });
    s.emit({ role: "tool", tool: { name: T, input: { title: "foo: 不稳定的测试", place: { kind: "repo", repoPath: "~/dev/foo" } } }, raw: { kind: "tool_call_head", callId: "c1" } });
    await Bun.sleep(5);
    openedBeforeCall = early.length === 1;
    result = await fc.callTool("task_open", { title: "foo: 不稳定的测试", place: { kind: "repo", repoPath: "~/dev/foo" }, brief: "User's words: 修一下 foo 的不稳定测试" });
    s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
    s.say("任务已经开了。");
    s.end();
  });
  user("修一下 ~/dev/foo 里那个不稳定的测试");
  await partner.idle();
  await Bun.sleep(5);
  expect(openedBeforeCall).toBe(true);
  expect(fr.opened).toHaveLength(0); // never opened a second time
  expect(early[0]!.input.place).toEqual({ kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" });
  expect(early[0]!.brief).toContain("修一下 foo 的不稳定测试");
  expect(early[0]!.brief).toContain("修一下 ~/dev/foo 里那个不稳定的测试"); // the user's words, verbatim
  expect(result).toMatchObject({ ok: true, taskId: "e1" });
  const said = fc.events.filter((e) => e.stream === "channel" && e.origin === "partner").map((e) => e.kind);
  expect(said).toEqual(["ack", "job_status"]); // one sentence; the filler after it is dropped
  const ack = fc.events.find((e) => e.kind === "ack")!;
  const job = fc.events.find((e) => e.kind === "job_status")!;
  expect((job.body as any).jobId).toBe((ack.body as any).jobId);
  expect((job.body as any).taskId).toBe("e1");
  // thinking, then off at the ack: no step is shown after it.
  expect(acts.map((a) => a?.step ?? null)).toEqual(["thinking", null]);
  expect(ack.seq).toBeLessThanOrEqual(early[0]!.at + 1);
});

test("the title opens it when the user named the place; a head that names another place replaces it", async () => {
  let atTitle = 0;
  const { fc, fr, partner, user, early } = setup(async (_i, s) => {
    s.say("我去看看。");
    s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
    s.emit({ role: "tool", tool: { name: T, input: { title: "t" } }, raw: { kind: "tool_call_title", callId: "c1" } });
    await Bun.sleep(5);
    atTitle = early.length;
    s.emit({ role: "tool", tool: { name: T, input: { title: "t", place: { kind: "folder", path: "/tmp/notes" } } }, raw: { kind: "tool_call_head", callId: "c1" } });
    await Bun.sleep(5);
    await fc.callTool("task_open", { title: "t", place: { kind: "folder", path: "/tmp/notes" }, brief: "b" });
    s.end();
  });
  user("看看 ~/dev/foo 和别的");
  await partner.idle();
  await Bun.sleep(5);
  expect(atTitle).toBe(1);
  expect(early.map((e) => e.input.place?.kind)).toEqual(["repo", "folder"]);
  expect(early[0]!.rejected).toBeDefined();
  expect(early[1]!.brief).toContain("b");
  expect(fr.opened).toHaveLength(0);
  expect(fc.events.filter((e) => e.kind === "ack")).toHaveLength(1);
});

test("a call that names another place drops the early task and opens the right one", async () => {
  const { fc, fr, partner, user, early } = setup(async (_i, s) => {
    s.say("I'll look into it.");
    s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
    s.emit({ role: "tool", tool: { name: T, input: { title: "t", place: { kind: "none" } } }, raw: { kind: "tool_call_head", callId: "c1" } });
    await Bun.sleep(5);
    await fc.callTool("task_open", { title: "t", place: { kind: "repo", repoPath: "~/dev/foo" }, brief: "b" });
    s.end();
  });
  user("look into it");
  await partner.idle();
  await Bun.sleep(5);
  expect(early).toHaveLength(1);
  expect(early[0]!.rejected).toBeDefined();
  expect(fr.opened).toHaveLength(1);
  expect(fr.opened[0]!.place).toEqual({ kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" });
  const jobs = fc.events.filter((e) => e.kind === "job_status").map((e) => e.body as any);
  const ack = fc.events.find((e) => e.kind === "ack")!.body as any;
  expect(fc.events.filter((e) => e.kind === "ack")).toHaveLength(1);
  expect(jobs.at(-1)).toMatchObject({ jobId: ack.jobId, taskId: "t1", state: "running" });
});

test("a turn that never makes the call drops the early task; no head place waits for the call", async () => {
  const { fc, fr, partner, user, early } = setup(async (_i, s, n) => {
    s.say("On it.");
    s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: `c${n}` } });
    if (n === 0) s.emit({ role: "tool", tool: { name: T, input: { title: "t", place: { kind: "none" } } }, raw: { kind: "tool_call_head", callId: "c0" } });
    else {
      // brief before place: the head has no place, so nothing opens early
      s.emit({ role: "tool", tool: { name: T, input: { title: "t2" } }, raw: { kind: "tool_call_head", callId: "c1" } });
      await Bun.sleep(5);
      await fc.callTool("task_open", { title: "t2", brief: "b", place: { kind: "none" } });
    }
    s.end();
  });
  user("do it");
  await partner.idle();
  await Bun.sleep(5);
  expect(early).toHaveLength(1);
  expect(early[0]!.rejected).toBe("task_open never arrived");
  user("do the other thing");
  await partner.idle();
  expect(early).toHaveLength(1);
  expect(fr.opened.map((o) => o.title)).toEqual(["t2"]);
  expect(fc.events.filter((e) => e.kind === "ack")).toHaveLength(2);
});
