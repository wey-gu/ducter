// Regressions from the live runs (2026-11-09): language, ack latency (prewarm).
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSystemPrompt, createPartner, redactSecrets } from "../src/index.ts";
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
    expect(fr.sessions[0]!.spec.env).toEqual({ ENABLE_TOOL_SEARCH: "false" });
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

  test("ask: a partner-level decision (no taskId); its answer comes back as a trigger to act on", async () => {
    const { fc, fr, partner, user } = setup(async (input, s, n) => {
      if (n === 0) {
        await fc.callTool("ask", { question: "改公开签名吗？", goLabel: "改签名", default: "go", reversible: true });
      } else {
        expect(input).toContain('[your question answered: go] "改公开签名吗？": go ahead with "改签名"');
      }
      s.end();
    });
    user("改之前先问我要不要改公开签名，给个默认");
    await partner.idle();
    const d = fc.events.find((e) => e.kind === "decision")!;
    expect(d).toMatchObject({ stream: "channel", origin: "partner" });
    expect(d.body).toMatchObject({ question: "改公开签名吗？", goLabel: "改签名", defaultOption: "go", reversible: true });
    expect((d.body as any).taskId).toBeUndefined();
    partner.onTrigger(
      fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: (d.body as any).decisionId, option: "go", by: "user" } }),
    );
    await partner.idle();
    expect(fr.sessions[0]!.inputs).toHaveLength(2);
  });

  test("honesty guard: claiming a Go/Hold choice with no decision event triggers one correction turn", async () => {
    const { fc, fr, partner, user } = setup(async (_input, s, n) => {
      if (n === 0) s.say("这个提交问题已经在你那边显示了，选 Go 就保留，选 Hold 就撤销。");
      if (n === 1) await fc.callTool("ask", { question: "保留这个提交吗？", goLabel: "保留", default: "go", reversible: true });
      s.end();
    });
    user("结果怎么样？");
    await partner.idle();
    const inputs = fr.sessions[0]!.inputs;
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("no such choice exists");
    expect(fc.events.filter((e) => e.kind === "decision")).toHaveLength(1);
  });

  test("honesty guard: no correction when the decision really exists, or for ordinary text", async () => {
    const { fc, fr, partner, user } = setup(async (_input, s, n) => {
      if (n === 0) {
        await fc.callTool("ask", { question: "Merge into main?", goLabel: "Merge", default: "hold", reversible: false });
        s.say("Tap Go to merge it.");
      }
      if (n === 1) s.say("好，我去做。Go ahead is not a claim.");
      s.end();
    });
    user("done?");
    await partner.idle();
    user("ok");
    await partner.idle();
    expect(fr.sessions[0]!.inputs).toHaveLength(2);
    expect(fr.sessions[0]!.inputs.join("\n")).not.toContain("no such choice exists");
  });

  test("persona: result anatomy, no internals, ask for choices, silence after the ack", () => {
    const p = buildSystemPrompt({ id: "p", name: "Ducter", identity: "ID" });
    expect(p).toMatchSnapshot();
    // Tuned with packages/partner/eval: the result prose leaves evidence, Outside and Merge to the app.
    for (const s of ["at most 2 lines", "left-out line", "Never restate the evidence", "no task ids", "call ask", "then write nothing", "write nothing more", "goes to that\n      task with task_send", "gets ask first", "never pass it to a task", "ONE\n  concrete example"]) {
      expect(p).toContain(s);
    }
  });

  test("one ack per task_open even when stream events lag the MCP call (live: a second 'On it')", async () => {
    const T = "mcp__ducter__task_open";
    const { fc, partner, user } = setup(async (_i, s, n) => {
      if (n === 0) {
        s.say("I'll add values() in foo.");
        s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c1" } });
        await Bun.sleep(5);
        await fc.callTool("task_open", { title: "foo: values()", brief: "add values()" });
        s.emit({ role: "tool", tool: { name: T, input: { title: "foo: values()" } }, raw: { kind: "tool_call_title", callId: "c1" } });
        s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
      } else {
        // No line first, and the handler overtakes every stream event.
        await fc.callTool("task_open", { title: "foo: keys()", brief: "add keys()" });
        s.emit({ role: "tool", tool: { name: T }, raw: { kind: "tool_call_started", callId: "c2" } });
        s.emit({ role: "tool", tool: { name: T, input: { title: "foo: keys()" } }, raw: { kind: "tool_call_title", callId: "c2" } });
        s.emit({ role: "tool", tool: { name: T, output: "{}", ok: true } });
      }
      s.end();
    });
    user("add values() to Cache in foo");
    await partner.idle();
    user("and keys()");
    await partner.idle();
    const acks = fc.events.filter((e) => e.kind === "ack").map((e) => (e.body as any).text);
    expect(acks).toEqual(["I'll add values() in foo.", "On it: foo: keys()"]);
  });

  test("silence after the ack: a short follow-up line is dropped, a question is kept", async () => {
    const { fc, partner, user } = setup(async (_i, s, n) => {
      s.say(n === 0 ? "I'll add values() in foo." : "我去改。");
      await fc.callTool("task_open", { title: "t", brief: "b" });
      s.emit({ role: "tool", tool: { name: "mcp__ducter__task_open", output: "{}", ok: true } });
      s.say(n === 0 ? "Task opened." : "顺便问一下：要不要同时更新 README？");
      s.end();
    });
    user("add values()");
    await partner.idle();
    user("改一下");
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as any).text)).toEqual(["顺便问一下：要不要同时更新 README？"]);
  });

  test("handing work to an existing task: the line before task_send is the ack, filler after it is dropped", async () => {
    const { fc, partner, user } = setup(async (_i, s) => {
      s.say("我给 slugify 加上可选的分隔符参数。");
      s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", input: { taskId: "t1", text: "add sep" } } });
      s.emit({ role: "tool", tool: { name: "mcp__ducter__task_send", output: "{}", ok: true } });
      s.say("已经交给它去做了，做完会告诉您结果。");
      s.end();
    });
    user("再给 slugify 加一个可选的分隔符参数");
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as any).text)).toEqual(["我给 slugify 加上可选的分隔符参数。"]);
  });

  test("a merge the user did by button reaches the partner's next turn", async () => {
    const { fc, fr, partner, user } = setup(ok);
    user("hi");
    await partner.idle();
    fc.core.log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t1_merge", taskId: "t1", state: "done", text: "the user merged this task's branch into its base branch (e336541)" } });
    user("main 上测试过了吗");
    await partner.idle();
    expect(fr.sessions[0]!.inputs.at(-1)).toContain("[the user did this by button] task t1: the user merged");
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

// Regressions from the partner eval (packages/partner/eval, 2026-11-09).
describe("partner eval regressions", () => {
  const report = (fc: ReturnType<typeof fakeCore>, taskId: string, summary: string) =>
    fc.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary, questions: [], evidence: [] } });

  test("two tasks finishing together settle into one turn", async () => {
    const { fc, fr, partner } = setup(ok, { settleMs: 30 });
    partner.onTrigger(report(fc, "t1", "values() added"));
    await Bun.sleep(5);
    partner.onTrigger(report(fc, "t2", "keys() added"));
    await partner.idle();
    expect(fr.sessions[0]!.inputs).toHaveLength(1);
    expect(fr.sessions[0]!.inputs[0]).toContain("values() added");
    expect(fr.sessions[0]!.inputs[0]).toContain("keys() added");
  });

  test("a user message does not wait for the settle window", async () => {
    const { fr, partner, user } = setup(ok, { settleMs: 5_000 });
    const t0 = Date.now();
    user("hi");
    await partner.idle();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(fr.sessions[0]!.inputs).toHaveLength(1);
  });

  test("a report-only turn carries the language of the user's last message", async () => {
    const { fc, fr, partner, user } = setup(ok, { settleMs: 0 });
    user("Fix the flaky test in ~/dev/foo, then tell me.");
    await partner.idle();
    partner.onTrigger(report(fc, "t1", "测试修好了"));
    await partner.idle();
    expect(fr.sessions[0]!.inputs[1]).toContain("[language] The user's last message was in English");
    user("好的");
    await partner.idle();
    partner.onTrigger(report(fc, "t1", "done"));
    await partner.idle();
    expect(fr.sessions[0]!.inputs[3]).not.toContain("[language]");
  });

  test("a pasted key never reaches a task: briefs and task_send are redacted", async () => {
    const key = "sk-proj-FAKEevalKeyNotReal0000000000000000000000";
    const { fc, fr, partner, user } = setup(async (_i, s) => {
      await fc.callTool("task_open", { title: "foo: .env", brief: "Add OPENAI_API_KEY to ~/dev/foo/.env" });
      await fc.callTool("task_send", { taskId: "t1", text: `use ${key}` });
      s.end();
    });
    user(`Here's my key: ${key}. Put it in ~/dev/foo/.env`);
    await partner.idle();
    expect(fr.opened[0]!.brief).not.toContain(key);
    expect(fr.opened[0]!.brief).toContain("[secret removed");
    expect(fr.sent[0]!.text).not.toContain(key);
    expect(redactSecrets("ghp_" + "a".repeat(36) + " and AKIAABCDEFGHIJKLMNOP")).not.toMatch(/ghp_a|AKIAABCD/);
    expect(redactSecrets("commit c3d9f01, sk-short")).toBe("commit c3d9f01, sk-short");
  });

  test("the card speaks for itself: a short line after ask is dropped, a line before it is kept", async () => {
    const { fc, partner, user } = setup(async (_i, s) => {
      s.say("这会动公开 API。");
      await fc.callTool("ask", { question: "改成 async 吗？", goLabel: "改成 async", default: "hold" });
      s.say("等你点 Go 或 Hold。");
      s.end();
    });
    user("改之前问我");
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as any).text)).toEqual(["这会动公开 API。"]);
  });

  test("an ask's question never carries its own default (the card renders the default line)", async () => {
    const { fc, partner, user } = setup(async (_i, s) => {
      await fc.callTool("ask", { question: "把 Cache 改名叫 TtlCache 吗？默认：直接改名。", goLabel: "改名", default: "hold" });
      await fc.callTool("ask", { question: "Call it breaking? (default: yes)", goLabel: "Breaking", default: "hold" });
      s.end();
    });
    user("改名前先问我");
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "decision").map((e) => (e.body as any).question)).toEqual(["把 Cache 改名叫 TtlCache 吗？", "Call it breaking?"]);
  });

  test("a turn woken only by a task's question stays quiet (the card shows it)", async () => {
    const { fc, partner } = setup((_i, s) => {
      s.say("The task is waiting on one question: regenerate the table? Go or Hold on the card.");
      s.end();
    }, { settleMs: 0 });
    partner.onTrigger(
      fc.core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "needs_input", summary: "s", questions: [{ id: "q", text: "Regenerate the table?", blocking: true, reversible: true }], evidence: [] } }),
    );
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "ai_msg")).toHaveLength(0);
  });

  test("a merge by button names the base branch", async () => {
    const { fc, fr, partner, user } = setup(ok);
    fc.cards.set("t1", { taskId: "t1", persona: "p1", title: "fix", project: "", place: { kind: "repo", device: "local", repoPath: "/r", baseBranch: "main" } as any, harness: "claude-code", attention: "done", residency: "parked", openedAt: "", updatedAt: "" });
    user("hi");
    await partner.idle();
    fc.core.log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t1_merge", taskId: "t1", state: "done", text: "the user merged this task's branch into its base branch (e81f2aa)" } });
    user("is it on main?");
    await partner.idle();
    expect(fr.sessions[0]!.inputs.at(-1)).toContain("into its base branch (e81f2aa) (base branch: main)");
  });
});
