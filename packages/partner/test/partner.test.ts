import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { buildSystemPrompt, createPartner, findPaths, resolvePlace, type PlaceFs } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-partner-test-"));

function setup(script: Script, extra: Parameters<typeof createPartner>[2] = {}) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, ...extra });
  const user = (text: string) => {
    const e = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
    partner.onTrigger(e);
    return e;
  };
  const channel = () => fc.events.filter((e) => e.stream === "channel");
  return { clock, fc, fr, partner, user, channel };
}

const kinds = (evs: LogEvent[]) => evs.map((e) => `${e.origin}:${e.kind}`);

describe("persona", () => {
  test("system prompt carries L1 identity, language rule, ack rule; no volatile bytes", () => {
    const p = buildSystemPrompt({ id: "p", name: "Ducter", identity: "IDENTITY-XYZ" });
    expect(p).toContain("IDENTITY-XYZ");
    expect(p).toContain("language of the user's latest message");
    expect(p).toContain("wins over any language preference under Identity");
    expect(p).toContain("never its");
    expect(p).toContain("task_open");
    expect(p).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(buildSystemPrompt({ id: "p", name: "Ducter", identity: "IDENTITY-XYZ" })).toBe(p); // deterministic
  });

  test("session spec: claude-code, bypass, partner MCP, cwd <dataDir>/partner, prompt override", async () => {
    const { fr, fc, partner, user } = setup((_i, s) => {
      s.say("好的。");
      s.end();
    });
    user("你好");
    await partner.idle();
    const spec = fr.sessions[0]!.spec;
    expect(spec.harness).toBe("claude-code");
    expect(spec.permissionMode).toBe("bypass");
    expect(spec.cwd).toBe(join(fc.core.dataDir, "partner"));
    expect(spec.mcp[0]!.url).toContain("/mcp");
    expect(spec.systemPrompt).toContain("IDENTITY-L1");
    expect(spec.model).toBe(process.env.DUCTER_PARTNER_MODEL ?? "opus");
  });
});

describe("ack → job → result", () => {
  test("text before task_open becomes the ack, emitted before the task opens", async () => {
    let ackSeenBeforeOpen = false;
    const { fc, fr, partner, user, channel } = setup(async (_input, s) => {
      s.say("我去看看 ~/dev/foo 里那个不稳定的测试。");
      s.emit({ role: "assistant", tool: { name: "mcp__ducter__task_open", input: {} } });
      await Bun.sleep(5);
      const origOpen = fr.runner.openTask;
      fr.runner.openTask = async (inp) => {
        ackSeenBeforeOpen = fc.events.some((e) => e.kind === "ack");
        return origOpen(inp);
      };
      const r = (await fc.callTool("task_open", { title: "修 flaky test", brief: "Fix the flaky test", place: { kind: "repo", device: "local", repoPath: "/x/foo" } })) as { taskId: string };
      expect(r.taskId).toBe("t1");
      s.emit({ role: "tool", tool: { name: "mcp__ducter__task_open", output: '{"taskId":"t1"}', ok: true } });
      s.end();
    });
    const u = user("修一下 ~/dev/foo 里那个 flaky test，修好告诉我");
    await partner.idle();
    expect(ackSeenBeforeOpen).toBe(true);
    const ch = channel();
    expect(kinds(ch)).toEqual(["user:user_msg", "partner:ack", "partner:job_status"]);
    const ack = ch[1]!.body as Bodies["ack"];
    const js = ch[2]!.body as Bodies["job_status"];
    expect(ack.text).toBe("我去看看 ~/dev/foo 里那个不稳定的测试。");
    expect(ack.replyTo).toBe(u.seq);
    expect(js).toEqual({ jobId: ack.jobId, text: "修 flaky test", state: "running", taskId: "t1" });
    // brief got the user's verbatim words appended, place passed through
    expect(fr.opened[0]!.brief).toContain("修一下 ~/dev/foo 里那个 flaky test，修好告诉我");
    expect(fr.opened[0]!.place).toEqual({ kind: "repo", device: "local", repoPath: "/x/foo" });
  });

  test("MCP call overtaking the streamed text still yields one ack, no duplicate ai_msg", async () => {
    const { fc, partner, user, channel } = setup(async (_input, s) => {
      const p = fc.callTool("task_open", { title: "Fix CI", brief: "fix ci" });
      await Bun.sleep(20);
      s.say("I'll look at the CI.");
      await p;
      s.emit({ role: "tool", tool: { name: "mcp__ducter__task_open", output: "{}", ok: true } });
      s.end();
    });
    user("fix the CI please");
    await partner.idle();
    expect(kinds(channel())).toEqual(["user:user_msg", "partner:ack", "partner:job_status"]);
    expect((channel()[1]!.body as Bodies["ack"]).text).toBe("I'll look at the CI.");
  });

  test("task_open without a preceding line gets a generated ack in the user's language", async () => {
    const { fc, partner, user, channel } = setup(async (_i, s) => {
      await fc.callTool("task_open", { title: "整理下载文件夹", brief: "b" });
      s.end();
    }, { ackWaitMs: 20 });
    user("帮我整理一下下载文件夹");
    await partner.idle();
    expect(kinds(channel())).toEqual(["user:user_msg", "partner:ack", "partner:job_status"]);
    expect((channel()[1]!.body as Bodies["ack"]).text).toContain("整理下载文件夹");
  });

  test("plain answer: every assistant text is an ai_msg replying to the user", async () => {
    const { partner, user, channel } = setup((_i, s) => {
      s.say("第一句。");
      s.emit({ role: "assistant", tool: { name: "mcp__ducter__log_search", input: { query: "x" } } });
      s.say("第二句。");
      s.end();
    });
    const u = user("你记得昨天说的吗？");
    await partner.idle();
    const ch = channel();
    expect(kinds(ch)).toEqual(["user:user_msg", "partner:ai_msg", "partner:ai_msg"]);
    expect((ch[1]!.body as Bodies["ai_msg"]).replyTo).toBe(u.seq);
  });

  test("report done → job_status done, tagged delta with evidence, result ai_msg", async () => {
    let turn = 0;
    const { fc, fr, partner, user, channel } = setup(async (input, s) => {
      turn++;
      if (turn === 1) {
        s.say("我去修。");
        await fc.callTool("task_open", { title: "Fix flaky test", brief: "b" });
      } else {
        expect(input).toContain('[task t1 "Fix flaky test" report: done] Fixed race in setup');
        expect(input).toContain("evidence (test): bun test -> 42 pass");
        s.say("修好了：setup 里的竞态，bun test 42 个全过。");
      }
      s.end();
    });
    const u = user("修一下那个测试");
    await partner.idle();
    const rep = fc.core.log.append({
      stream: "task:t1",
      origin: "task",
      kind: "report",
      body: { taskId: "t1", state: "done", summary: "Fixed race in setup", questions: [], evidence: [{ kind: "test", label: "bun test", ref: "42 pass" }] },
    });
    partner.onTrigger(rep);
    await partner.idle();
    const ch = channel();
    expect(kinds(ch)).toEqual(["user:user_msg", "partner:ack", "partner:job_status", "partner:job_status", "partner:ai_msg"]);
    const ack = ch[1]!.body as Bodies["ack"];
    expect(ch[3]!.body).toEqual({ jobId: ack.jobId, text: "Fix flaky test", state: "done", taskId: "t1" });
    const result = ch[4]!.body as Bodies["ai_msg"];
    expect(result.text).toContain("42");
    expect(result.replyTo).toBe(u.seq); // result replies to the original ask
    expect(fr.sessions.length).toBe(1); // warm: same session
  });
});

describe("turn loop", () => {
  test("triggers arriving mid-turn are coalesced into ONE next turn, origin-tagged", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fc, fr, partner, user } = setup(async (_i, s, n) => {
      if (n === 0) await gate;
      s.say(`reply ${n}`);
      s.end();
    });
    user("first");
    await Bun.sleep(5);
    user("second");
    const dec = fc.core.log.append({
      stream: "channel",
      origin: "task",
      kind: "decision",
      body: { decisionId: "d1", taskId: "t9", question: "Rebase onto main?", goLabel: "Rebase", defaultOption: "go", reversible: true },
    });
    const res = fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "go", by: "user" } });
    partner.onTrigger(res);
    partner.onTrigger(res); // duplicate delivery is ignored
    void dec;
    user("third");
    release();
    await partner.idle();
    const inputs = fr.sessions[0]!.inputs;
    expect(inputs.length).toBe(2);
    expect(inputs[0]).toContain("[user] first");
    const second = inputs[1]!;
    expect(second).toContain("[user] second");
    expect(second).toContain('[decision resolved: go] (task t9: "Rebase onto main?")');
    expect(second).toContain("[user] third");
    expect(second.indexOf("[user] second")).toBeLessThan(second.indexOf("[user] third"));
    expect(second).toContain("[time] ");
    expect(second).not.toContain("<conversation_so_far>"); // warm: deltas only
  });

  test("cold (idle > 55 min): fresh session seeded with projection, never reset text", async () => {
    let n = 0;
    const { clock, fc, fr, partner, user } = setup(async (_i, s) => {
      n++;
      if (n === 1) {
        s.say("我去看看。");
        await fc.callTool("task_open", { title: "Fix flaky test", brief: "b", place: { kind: "repo", device: "local", repoPath: "/x/foo" } });
      } else s.say("在做，还没报告。");
      s.end();
    });
    user("修一下 ~/dev/foo 的 flaky test");
    await partner.idle();
    fc.core.log.append({
      stream: "channel",
      origin: "task",
      kind: "decision",
      body: { decisionId: "d1", taskId: "t1", question: "Also bump deps?", goLabel: "Bump", defaultOption: "hold", reversible: true },
    });
    // warm follow-up: same session, deltas only
    clock.advance(10 * 60 * 1000);
    user("进度？");
    await partner.idle();
    expect(fr.sessions.length).toBe(1);
    // cold
    clock.advance(56 * 60 * 1000);
    user("现在怎么样了？");
    await partner.idle();
    expect(fr.sessions.length).toBe(2);
    expect(fr.sessions[0]!.closed).toBe(true);
    expect(fr.sessions[1]!.spec.resumeSessionId).toBeUndefined();
    expect(fr.sessions[1]!.spec.systemPrompt).toBe(fr.sessions[0]!.spec.systemPrompt); // L0/L1 byte-identical
    const seed = fr.sessions[1]!.inputs[0]!;
    expect(seed).toContain("<conversation_so_far>");
    expect(seed).toContain("user] 修一下 ~/dev/foo 的 flaky test");
    expect(seed).toContain("you] 我去看看。");
    expect(seed).toContain("task t1 running] Fix flaky test");
    expect(seed).toContain("task t1 asks] Also bump deps?");
    expect(seed).toContain("you] 在做，还没报告。");
    expect(seed).toContain('<tasks>\nOpen:\n- t1 "Fix flaky test" · working · repo /x/foo');
    // the triggering message is the delta at the end, not in the background
    expect(seed.trimEnd().split("\n").slice(-2)[0]).toBe("[user] 现在怎么样了？");
    expect(seed.match(/现在怎么样了/g)!.length).toBe(1);
    expect(seed).not.toMatch(/reset|restart|new session|fresh session|lost|重置|重启|新会话/i);
    expect(partner.stats.freshStarts).toBe(2);
  });

  test("restart while warm resumes the persisted session id", async () => {
    const clock = new FakeClock();
    const dir = tmp();
    const fc = fakeCore(clock, dir);
    const fr = fakeRunner((_i, s) => {
      s.say("ok");
      s.end();
    });
    const p1 = createPartner(fc.core, fr.runner, { now: clock.now, onError: () => {} });
    p1.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "hi" } }));
    await p1.idle();
    await p1.close();
    clock.advance(5 * 60 * 1000);
    const fc2 = { ...fc.core, mcp: fakeCore(clock, dir).core.mcp };
    const p2 = createPartner(fc2, fr.runner, { now: clock.now, onError: () => {} });
    p2.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "again" } }));
    await p2.idle();
    expect(fr.sessions[1]!.spec.resumeSessionId).toBe("sess-1");
    expect(fr.sessions[1]!.inputs[0]).not.toContain("<conversation_so_far>");
    expect(p2.stats.resumes).toBe(1);
  });

  test("restart under a different persona starts fresh instead of resuming", async () => {
    const clock = new FakeClock();
    const dir = tmp();
    const fc = fakeCore(clock, dir);
    const fr = fakeRunner((_i, s) => {
      s.say("ok");
      s.end();
    });
    const p1 = createPartner(fc.core, fr.runner, { now: clock.now, onError: () => {} });
    p1.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "hi" } }));
    await p1.idle();
    await p1.close();
    clock.advance(5 * 60 * 1000);
    const fc2 = { ...fc.core, mcp: fakeCore(clock, dir).core.mcp, persona: { ...fc.core.persona, name: "小鸭" } };
    const p2 = createPartner(fc2, fr.runner, { now: clock.now, onError: () => {} });
    p2.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "again" } }));
    await p2.idle();
    expect(fr.sessions[1]!.spec.resumeSessionId).toBeUndefined();
    expect(p2.stats.resumes).toBe(0);
  });

  test("wait_until: armed waiter now, [timer fired] trigger when core fires it", async () => {
    const { fc, fr, partner, user, channel } = setup(async (input, s, n) => {
      if (n === 0) {
        s.say("好，三点提醒你。");
        await fc.callTool("wait_until", { at: "2026-11-08T15:00:00Z", reason: "提醒：给 Alice 回邮件" });
      } else {
        expect(input).toContain("[timer fired] 提醒：给 Alice 回邮件");
        s.say("三点了：该给 Alice 回邮件了。");
      }
      s.end();
    });
    user("三点提醒我给 Alice 回邮件");
    await partner.idle();
    const armed = channel().find((e) => e.kind === "waiter")!;
    expect(armed.body).toMatchObject({ state: "armed", at: "2026-11-08T15:00:00.000Z", reason: "提醒：给 Alice 回邮件" });
    // Core's waiter module fires it (see core/test/waiters.test.ts); here we play core.
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { ...(armed.body as Bodies["waiter"]), state: "fired" } }));
    await partner.idle();
    expect(fr.sessions[0]!.inputs.length).toBe(2);
    expect(kinds(channel())).toEqual(["user:user_msg", "partner:ai_msg", "waiter:waiter", "waiter:waiter", "partner:ai_msg"]);
  });

  test("restart mid-turn: the unanswered trigger is queued again; answered ones are not", async () => {
    const clock = new FakeClock();
    const dir = tmp();
    const fc = fakeCore(clock, dir);
    let hang = false;
    const fr = fakeRunner((_i, s) => {
      if (hang) return; // the turn never ends: the process dies mid-turn
      s.say("ok");
      s.end();
    });
    const p1 = createPartner(fc.core, fr.runner, { now: clock.now, onError: () => {} });
    p1.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "first" } }));
    await p1.idle();
    hang = true;
    p1.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "second" } }));
    await Bun.sleep(5);
    // Restart: a new partner over the same Log and data dir.
    hang = false;
    const fc2 = { ...fc.core, mcp: fakeCore(clock, dir).core.mcp };
    const p2 = createPartner(fc2, fr.runner, { now: clock.now, onError: () => {} });
    await Bun.sleep(5);
    await p2.idle();
    const last = fr.sessions.at(-1)!;
    expect(last.inputs.at(-1)).toContain("[user] second");
    expect(last.inputs.join("\n")).not.toContain("[user] first");
    const replies = fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).replyTo);
    expect(replies).toEqual([1, 3]);
  });
});
describe("place", () => {
  const fs: PlaceFs = {
    home: "/Users/w",
    isDir: (p) => ["/Users/w/dev/foo", "/Users/w/dev/foo/src", "/Users/w/notes"].includes(p),
    isRepo: (p) => p === "/Users/w/dev/foo",
  };
  test("finds paths in mixed zh/en text", () => {
    expect(findPaths("修一下 ~/dev/foo 里的测试")).toEqual(["~/dev/foo"]);
    expect(findPaths("look at /Users/w/notes.")).toEqual(["/Users/w/notes"]);
  });
  test("path → repo root, folder, known repo by name, none", () => {
    expect(resolvePlace(undefined, ["fix ~/dev/foo/src/a.test.ts"], [], fs)).toEqual({ kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" });
    expect(resolvePlace(undefined, ["tidy /Users/w/notes"], [], fs)).toEqual({ kind: "folder", device: "local", path: "/Users/w/notes" });
    const known = [{ place: { kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" } } as never];
    expect(resolvePlace(undefined, ["foo 的 CI 又挂了"], known, fs)).toEqual({ kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" });
    expect(resolvePlace(undefined, ["写首诗"], known, fs)).toEqual({ kind: "none" });
    expect(resolvePlace({ kind: "repo", device: "", repoPath: "~/dev/foo" }, [], [], fs)).toEqual({ kind: "repo", device: "local", repoPath: "/Users/w/dev/foo" });
  });
});

