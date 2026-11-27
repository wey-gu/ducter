// D585: the person talking to a task in its own box, as a conductor does: their words reach the agent
// as typed (with one line saying who wrote them), the answer is the agent's own reply under them, and
// a direct exchange owes no report: never nudged, the card back where it stood. A scripted agent (OAR's
// scriptedRuntime) on the real runner over the fake core, one test per state.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import { createOarHarnessPort, createRunner, NUDGE, registerTaskTools } from "../src/index.ts";
import { DIRECT_NOTE } from "../src/direct.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-direct-test-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ID = "tsk00001";
const evs = () => core.events.filter((e) => e.kind === "task_event" && (e.body as Bodies["task_event"]).taskId === ID).map((e) => e.body as Bodies["task_event"]);
const reports = () => core.events.filter((e) => e.kind === "report").map((e) => e.body as Bodies["report"]);
const turnsEnded = () => evs().filter((e) => (e.raw as { kind?: string } | undefined)?.kind === "turn_ended").length;
const attention = () => core.tasks.get(ID)?.attention;
const report = (state: Bodies["report"]["state"], summary: string) => core.call("report_to_main", { state, summary, ...(state === "needs_input" ? { questions: [{ id: "q", text: "Which Space?", blocking: true, default: "dev-team", reversible: true }] } : {}) }, ID);

/**
 * A task whose first turn ends on `first` (its report), then answers each later input with `answer`.
 * `inputs` is what the agent was handed, turn by turn.
 */
async function taskThat(first: (t: ScriptedTurn) => Promise<void>, answer: (t: ScriptedTurn) => Promise<void>) {
  const inputs: string[] = [];
  const port = createOarHarnessPort({
    loadRuntime: async () =>
      scriptedRuntime({
        id: "claude",
        turn: async (t) => {
          inputs.push(t.input);
          if (inputs.length === 1) return first(t);
          if (t.input === NUDGE) return t.tool("mcp__ducter__report_to_main", "{}", () => report("progress", "I answered the user in the task.")).then(() => t.say("I reported it to Ducter."));
          return answer(t);
        },
      }),
  });
  const runner = createRunner(core, { harness: port, newId: () => ID });
  const card = await runner.openTask({ persona: "p1", title: "Open the mailbox", brief: "Open Claude Code's mailbox in Mem." });
  await runner.whenStarted(card.taskId);
  await waitFor(() => turnsEnded() >= 1, "first turn");
  await Bun.sleep(30);
  return { runner, inputs };
}

const answers = (t: ScriptedTurn) => {
  t.say("There are 8 Spaces: dev-team, codex, nowledge-mem, default, all, userfiles, Only me, nowledge-co/mem.");
  return Promise.resolve();
};

describe("D585: a question typed in the task", () => {
  test("waiting on the person (needs_you): answered in its reply, no nudge, the card back on needs_you", async () => {
    const { runner, inputs } = await taskThat(async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("needs_input", "Which Space should the mailbox go in?"))), answers);
    expect(attention()).toBe("needs_you");
    expect(await runner.send(ID, "都有哪些 space?", undefined, "user", "c1")).toEqual({ delivered: "prompted" });
    await waitFor(() => turnsEnded() >= 2, "answer turn");
    await Bun.sleep(60);
    // Verbatim in the Log; the agent reads them with the line saying who wrote them.
    expect(evs().find((e) => e.role === "user" && e.from === "user")?.text).toBe("都有哪些 space?");
    expect(inputs[1]).toBe(`都有哪些 space?\n\n${DIRECT_NOTE}`);
    expect(inputs).not.toContain(NUDGE);
    expect(evs().filter((e) => e.role === "assistant").at(-1)?.text).toContain("8 Spaces");
    expect(reports()).toHaveLength(1);
    expect(attention()).toBe("needs_you");
    await runner.dispose();
  });

  test("finished (done): continued from its composer, answered, no second done, the card stays finished", async () => {
    const { runner, inputs } = await taskThat(async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "The mailbox is open."))), async (t) => t.say("It's in dev-team, the Space the other Claude uses."));
    expect(attention()).toBe("done_claimed");
    await runner.send(ID, "Which Space did you put it in?", undefined, "user", "c2");
    await waitFor(() => turnsEnded() >= 2, "answer turn");
    await Bun.sleep(60);
    expect(inputs).not.toContain(NUDGE);
    expect(reports()).toHaveLength(1);
    expect(attention()).toBe("done_claimed");
    await runner.dispose();
  });

  test("waiting on something else (blocked): answered, still Waiting after", async () => {
    const { runner, inputs } = await taskThat(async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("blocked", "Waiting for CI."))), async (t) => t.say("CI is at 14 of 16 checks."));
    expect(attention()).toBe("blocked");
    await runner.send(ID, "How far is CI?", undefined, "user", "c3");
    await waitFor(() => turnsEnded() >= 2, "answer turn");
    await Bun.sleep(60);
    expect(inputs).not.toContain(NUDGE);
    expect(attention()).toBe("blocked");
    await runner.dispose();
  });

  test("an agent that answers only through report_to_main: the report is marked direct (kept out of the living message)", async () => {
    const { runner } = await taskThat(
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "Reviewed #551."))),
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("progress", "Not yet: GitHub shows no review from me on #551."))),
    );
    await runner.send(ID, "你 review #551 了么？", undefined, "user", "c4");
    await waitFor(() => reports().length === 2, "its answer as a report");
    await waitFor(() => turnsEnded() >= 2, "answer turn");
    expect(reports()[0]!.direct).toBeUndefined();
    expect(reports()[1]!.direct).toBe(true);
    await runner.dispose();
  });

  test("its turn ended with no report: stopped, not working; a person's words are a conversation then", async () => {
    // D645 (research/245 §3.7, B4): a turn that ends with nothing running is stopped (D467's
    // 停下了), never 在做. Its first turn was nudged; the nudge turn said nothing new, so it is
    // stopped. The person's own words there are a conversation (D585): it goes back to stopped,
    // owes no report, and is never nudged twice for it.
    const { runner, inputs } = await taskThat(async (t) => t.say("Started."), async (t) => t.say("Still on it."));
    await waitFor(() => inputs.includes(NUDGE), "the nudge of its own turn");
    await waitFor(() => turnsEnded() >= 2, "nudge turn");
    await Bun.sleep(30);
    expect(attention()).toBe("blocked");
    await runner.send(ID, "carry on", undefined, "user", "c5");
    await waitFor(() => turnsEnded() >= 3, "the person's turn");
    await Bun.sleep(60);
    expect(inputs.filter((i) => i === NUDGE)).toHaveLength(1);
    expect(attention()).toBe("blocked");
    await runner.dispose();
  });

  test("a slash command goes as typed, with nothing after it", async () => {
    const { runner, inputs } = await taskThat(async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "ok"))), async (t) => t.say("Reviewed."));
    await runner.send(ID, "/review", undefined, "user", "c6");
    await waitFor(() => inputs.length >= 2, "the command");
    expect(inputs[1]).toBe("/review");
    await runner.dispose();
  });
});

describe("D587: a done reported in the person's own turn", () => {
  test("marked direct, logged as it came: another AI's look never takes it, so no message comes back to the task", async () => {
    const took: string[] = [];
    registerTaskTools(core, { freshLook: { take: (id) => (took.push(id), true), heldWords: "held", waiting: () => false } });
    const { runner, inputs } = await taskThat(
      async (t) => t.say("Started."),
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "Reviewed #551: two comments posted."))),
    );
    // Its own first turn said nothing: nudged, and its report is the look's (the old rule).
    await waitFor(() => took.length === 1, "the look takes its own turn's report");
    await waitFor(() => turnsEnded() >= 2, "nudge turn");
    await runner.send(ID, "review #551 then", undefined, "user", "d1");
    await waitFor(() => reports().some((r) => r.direct), "the done of the person's turn");
    await waitFor(() => turnsEnded() >= 3, "the person's turn");
    expect(took).toHaveLength(1);
    expect(reports().at(-1)).toMatchObject({ state: "done", direct: true });
    expect(inputs.filter((i) => i === NUDGE)).toHaveLength(1);
    await runner.dispose();
  });

  test("one with an ask (merge it?) is still read once: what a Go would send keeps its look", async () => {
    const took: Bodies["report"][] = [];
    registerTaskTools(core, { freshLook: { take: (_id, body) => (took.push(body), false), heldWords: "held", waiting: () => false } });
    const { runner } = await taskThat(
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "The mailbox is open."))),
      async (t) =>
        void (await t.tool("mcp__ducter__report_to_main", "{}", () =>
          core.call("report_to_main", { state: "done", summary: "CI is green.", questions: [{ id: "q", text: "Merge #1592 now?", blocking: true, default: "merge", reversible: false }] }, ID),
        )),
    );
    await runner.send(ID, "is CI green?", undefined, "user", "d2");
    await waitFor(() => reports().length === 2, "its done with the ask");
    expect(took.at(-1)).toMatchObject({ direct: true, state: "done" });
    await runner.dispose();
  });
});

describe("D585: words sent while it works", () => {
  test("steered into the running turn with the line; the turn is its own work and still owes its report", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const steered: string[][] = [];
    const inputs: string[] = [];
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        scriptedRuntime({
          id: "claude",
          turn: async (t) => {
            inputs.push(t.input);
            if (inputs.length === 1) {
              await gate;
              steered.push([...t.steered]);
              t.say("The PR isn't open yet; I open it after this last check.");
              await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "Opened the PR."));
            }
          },
        }),
    });
    const runner = createRunner(core, { harness: port, newId: () => ID });
    const card = await runner.openTask({ persona: "p1", title: "Fix 11105", brief: "Fix it and open a PR." });
    await runner.whenStarted(card.taskId);
    await waitFor(() => inputs.length === 1, "turn running");
    expect(await runner.send(ID, "这个工作，我们的 pr 是什么？", "steer", "user", "s1")).toEqual({ delivered: "steered" });
    release();
    await waitFor(() => turnsEnded() >= 1, "turn end");
    await Bun.sleep(40);
    expect(steered[0]![0]).toBe(`这个工作，我们的 pr 是什么？\n\n${DIRECT_NOTE}`);
    expect(evs().find((e) => e.role === "user" && e.from === "user")?.raw).toMatchObject({ delivered: "steer" });
    // Its own turn's report is not marked direct: the turn was the brief's, not the person's.
    expect(reports()[0]!.direct).toBeUndefined();
    await runner.dispose();
  });

  test("After this turn: held at the home, then the next turn, the person's own (no nudge when it answers)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inputs: string[] = [];
    const port = createOarHarnessPort({
      loadRuntime: async () =>
        scriptedRuntime({
          id: "claude",
          turn: async (t) => {
            inputs.push(t.input);
            if (inputs.length === 1) {
              await gate;
              await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "Done."));
              return;
            }
            t.say("Yes, all three tests pass.");
          },
        }),
    });
    const runner = createRunner(core, { harness: port, newId: () => ID });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    await waitFor(() => inputs.length === 1, "turn running");
    expect(await runner.send(ID, "do the tests pass?", "queue", "user", "h1")).toEqual({ delivered: "queued" });
    release();
    await waitFor(() => turnsEnded() >= 2, "the held words' turn");
    await Bun.sleep(60);
    expect(inputs[1]).toBe(`do the tests pass?\n\n${DIRECT_NOTE}`);
    expect(inputs).not.toContain(NUDGE);
    expect(attention()).toBe("done_claimed");
    await runner.dispose();
  });
});

// D602: 「这个任务是什么情况，能关闭么」 typed in a finished task that an open duplicate draft still held
// (hel 5ykh7m6y): the agent answered 「可以关闭」 and nothing ended. Now it ends the task itself from the
// same turn: done, letting the duplicate go, or dropped when the work is unfinished and they asked.
describe("D602: asked in the task to close it", () => {
  const PR = "nowledge-co/mem#11179";
  const owned = () =>
    core.log.append({
      stream: `task:${ID}`,
      origin: "system",
      kind: "owned_news",
      body: { taskId: ID, pr: PR, news: [], seen: { since: "2026-11-24T16:42:46.855Z", from: "integrate", state: "open", standing: { at: "2026-11-24T16:43:29.460Z", draft: true, checks: { total: 3, passed: 2, failed: ["ci/pr-closing-references"], pending: [] } } } },
    });
  const letGoes = () => core.events.filter((e) => e.kind === "owned_news" && (e.body as Bodies["owned_news"]).seen.letGo).map((e) => e.body as Bodies["owned_news"]);

  test("a finished task held by a duplicate draft: done again with let_go; the draft let go, never closed", async () => {
    const { runner, inputs } = await taskThat(
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("done", "#11179 是 #11166 已合并内容的重复草稿。"))),
      async (t) => {
        await t.tool("mcp__ducter__report_to_main", "{}", () =>
          core.call("report_to_main", { state: "done", summary: "这个任务结束了：#11166 已合并。", let_go: [{ pr: "https://github.com/nowledge-co/mem/pull/11179", why: "duplicate" }] }, ID),
        );
        t.say("结束了。#11179 是重复草稿，我不再跟它；它在 GitHub 上还开着，你说一声我就关掉它。");
      },
    );
    owned();
    await runner.send(ID, "这个任务是什么情况，能关闭么", undefined, "user", "d602-1");
    await waitFor(() => turnsEnded() >= 2, "its answer turn");
    await Bun.sleep(60);
    expect(inputs[1]).toBe(`这个任务是什么情况，能关闭么\n\n${DIRECT_NOTE}`);
    expect(letGoes().map((b) => [b.pr, b.seen.letGo?.why])).toEqual([[PR, "duplicate"]]);
    expect(reports().at(-1)).toMatchObject({ state: "done", direct: true, letGo: [{ pr: PR, why: "duplicate" }] });
    expect(inputs).not.toContain(NUDGE);
    expect(attention()).toBe("done_claimed");
    await runner.dispose();
  });

  test("unfinished work they want stopped: dropped with its reason, its session closed after the turn", async () => {
    const { runner } = await taskThat(
      async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => report("blocked", "Waiting for CI."))),
      async (t) => {
        const said = await core.call("report_to_main", { state: "dropped", summary: "你说不用再跟了：#11179 的 CI 不再等。" }, ID);
        await t.tool("mcp__ducter__report_to_main", "{}", () => said);
        t.say("好，放下了。");
      },
    );
    await runner.send(ID, "别跟了，关掉这个任务吧", undefined, "user", "d602-2");
    await waitFor(() => attention() === "dropped", "dropped");
    await waitFor(() => core.tasks.get(ID)?.residency === "parked", "its session closed");
    const st = core.events.filter((e) => e.kind === "task_state" && (e.body as Bodies["task_state"]).attention === "dropped").map((e) => e.body as Bodies["task_state"]);
    expect(st[0]?.reason).toBe("你说不用再跟了：#11179 的 CI 不再等。");
    // Not a report: nobody is told what they asked for themselves.
    expect(reports().map((r) => r.state)).toEqual(["blocked"]);
    await runner.dispose();
  });

  test("dropped outside a turn the person opened is refused: only they put a task down unfinished", async () => {
    let answer: unknown;
    const { runner } = await taskThat(
      async (t) => {
        answer = await core.call("report_to_main", { state: "dropped", summary: "Giving up." }, ID);
        await t.tool("mcp__ducter__report_to_main", "{}", () => report("blocked", "Waiting for CI."));
      },
      async (t) => t.say("ok"),
    );
    expect(String(answer)).toContain("Not dropped");
    expect(attention()).toBe("blocked");
    await runner.dispose();
  });
});
