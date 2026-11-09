// `ducter task / say / tail / answer / open <task>` (D128) against a real core on a random
// port, with a scripted partner and a runner that only logs what it is asked.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { parseArgs } from "../src/args.ts";
import { commandWith, translator } from "../src/i18n.ts";
import { channelLine, cmdAnswer, cmdOpenTask, cmdSay, cmdTail, cmdTask, resolveAgent, taskLine, type TalkCtx } from "../src/talk.ts";

const zh = translator("zh");
const en = translator("en");
let core: Core;
let dir: string;
let repo: string;
const opened: Parameters<Runner["openTask"]>[0][] = [];

const run = (...a: string[]) => Bun.spawnSync(["git", "-C", repo, ...a], { stdout: "pipe", stderr: "pipe" });

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-talk-")));
  repo = join(dir, "tinycart");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  run("config", "user.name", "t");
  run("config", "user.email", "t@t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  run("add", ".");
  run("commit", "-qm", "init");
  const data = join(dir, "data");
  const harnesses = async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: true },
  ];
  core = startCore({ dataDir: data, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "laptop" } });
  let n = 0;
  core.setRunner({
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      opened.push(input);
      const taskId = `t${++n}`;
      const s = `task:${taskId}`;
      core.log.append({ stream: s, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "claude-code", ...(input.model ? { model: input.model } : {}), brief: input.brief, ...(input.origin ? { origin: input.origin } : {}) } });
      core.log.append({ stream: s, origin: "system", kind: "body_selected", body: { taskId, harness: input.harness ?? "claude-code", ...(input.model ? { model: input.model } : {}), why: { kind: input.harness ? "you" : "default" } } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  // The partner: thinking, then the reply, an ask, and the end of its turn (ack-and-go shape).
  core.setPartner({
    onTrigger(e: LogEvent) {
      if (e.kind !== "user_msg") return;
      const at = new Date().toISOString();
      core.activity?.set({ step: "thinking", since: at, stepSince: at });
      setTimeout(() => {
        core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "你好！我在。", replyTo: e.seq } });
        core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_hello", question: "要我先看看 tinycart 的 CI 吗？", goLabel: "看 CI", defaultOption: "hold", reversible: true } });
        setTimeout(() => core.activity?.set(null), 30);
      }, 40);
    },
  });
});
afterAll(async () => {
  await core.stop();
  rmSync(dir, { recursive: true, force: true });
});

function ctx(over: Partial<TalkCtx> & { rest: string[] }): TalkCtx & { lines: string[] } {
  const lines: string[] = [];
  return { t: zh, port: core.port, json: false, cmd: commandWith({ port: core.port }), print: (s) => void lines.push(s), lines, ...over };
}

describe("args", () => {
  test("the new commands take their words and flags", () => {
    expect(parseArgs(["task", "修一下测试", "--repo", "/r", "--agent", "codex", "--base", "dev"])).toEqual({ ok: true, args: { command: "task", desktop: true, json: false, rest: ["修一下测试"], repo: "/r", agent: "codex", base: "dev" } });
    expect(parseArgs(["say", "你好", "--timeout", "30"])).toMatchObject({ ok: true, args: { command: "say", rest: ["你好"], timeout: 30 } });
    expect(parseArgs(["answer", "d1", "go"])).toMatchObject({ ok: true, args: { command: "answer", rest: ["d1", "go"] } });
    expect(parseArgs(["open", "tinycart"])).toMatchObject({ ok: true, args: { command: "open", rest: ["tinycart"] } });
    expect(parseArgs(["tail"])).toMatchObject({ ok: true, args: { command: "tail" } });
    expect(parseArgs(["say", "x", "--timeout", "soon"])).toMatchObject({ ok: false, error: { key: "err.badTimeout" } });
  });

  test("--agent names someone on the list, a harness, or harness/model", () => {
    const list = [
      { harness: "claude-code", model: "opus", reason: { kind: "fit" as const } },
      { harness: "codex", reason: { kind: "fit" as const } },
      { harness: "claude-code", model: "sonnet", reason: { kind: "fast" as const } },
    ];
    expect(resolveAgent("codex", list)).toEqual({ harness: "codex" });
    expect(resolveAgent("Claude Code", list)).toEqual({ harness: "claude-code" });
    expect(resolveAgent("claude", list)).toEqual({ harness: "claude-code" });
    expect(resolveAgent("sonnet", list)).toEqual({ harness: "claude-code", model: "sonnet" });
    expect(resolveAgent("claude-code/haiku", list)).toEqual({ harness: "claude-code", model: "haiku" });
    expect(resolveAgent("gemini", list)).toBeUndefined();
  });
});

describe("talking to a running Ducter", () => {
  test("task: opens with the words as they are, in this repo; says what it opened and what to run next", async () => {
    const c = ctx({ rest: ["修一下 tinycart 里失败的测试。别改 API。"], cwd: repo, agent: "codex" });
    expect(await cmdTask(c)).toBe(0);
    expect(opened.at(-1)).toMatchObject({ brief: "修一下 tinycart 里失败的测试。别改 API。", title: "修一下 tinycart 里失败的测试", harness: "codex", origin: "you", place: { kind: "repo", repoPath: repo, baseBranch: "main" } });
    expect(c.lines[0]).toBe("开了：「修一下 tinycart 里失败的测试」· tinycart (main) · Codex（你选的）");
    expect(c.lines[1]).toBe(`看它做：ducter tail t1 --port ${core.port}   在应用里打开：ducter open t1 --port ${core.port}`);
    // Nothing in the conversation but the quiet note for the partner.
    expect(core.log.read({ stream: "channel" }).map((e) => [e.kind, e.origin])).toEqual([["job_status", "user"]]);
  });

  test("task: outside a repo says how to name one; --repo none is no particular place", async () => {
    const out = ctx({ rest: ["Look at the logs"], cwd: dir });
    expect(await cmdTask(out)).toBe(2);
    expect(out.lines[0]).toBe(`${dir} 不是 git 仓库。到仓库里运行，或者指一个：--repo <目录>（--repo none：不用特定的地方）。`);
    const none = ctx({ rest: ["Look at the logs"], cwd: dir, repo: "none", t: en });
    expect(await cmdTask(none)).toBe(0);
    expect(none.lines[0]).toBe('Opened: "Look at the logs" · No particular place · Claude Code');
    const nobody = ctx({ rest: ["x"], cwd: repo, agent: "gemini", t: en });
    expect(await cmdTask(nobody)).toBe(2);
    expect(nobody.lines[0]).toContain('Nobody here called "gemini" can take it. Who can: claude-code/opus, codex');
  });

  test("say: sends the words, prints the partner's reply and its ask with the id, ends when the turn settles", async () => {
    const c = ctx({ rest: ["你好"] });
    expect(await cmdSay(c)).toBe(0);
    expect(c.lines).toEqual(["Ducter  你好！我在。", "  ? 要我先看看 tinycart 的 CI 吗？  [好: 看 CI] [先等等]  d_hello", `回答其中一个：ducter answer --port ${core.port} <编号或问题里的几个字> go|hold|"<回复>"`]);
    const json = ctx({ rest: ["再说一遍"], json: true });
    expect(await cmdSay(json)).toBe(0);
    const j = JSON.parse(json.lines[0]!);
    expect(j).toMatchObject({ settled: true, replies: [{ text: "你好！我在。", kind: "ai_msg" }], decisions: [{ decisionId: "d_hello" }] });
  });

  test("say: nothing listening says Ducter isn't running there", async () => {
    const down = ctx({ rest: ["hi"], port: 1 });
    expect(await cmdSay(down)).toBe(1);
    expect(down.lines[0]).toBe(zh("status.notRunning", { port: 1 }));
  });

  test("answer: by part of the question, go; the decision resolves", async () => {
    const c = ctx({ rest: ["tinycart 的 CI", "go"] });
    expect(await cmdAnswer(c)).toBe(0);
    expect(c.lines[0]).toBe("好，看 CI");
    const r = core.log.read({ kinds: ["decision_resolved"] }).map((e) => e.body as Bodies["decision_resolved"]);
    expect(r.at(-1)).toMatchObject({ decisionId: "d_hello", option: "go", by: "user" });
    const again = ctx({ rest: ["d_hello", "hold"] });
    expect(await cmdAnswer(again)).toBe(1);
    expect(again.lines[0]).toBe("没有对得上「d_hello」的待决定。");
  });

  test("tail: the conversation, then one task's steps, as text", async () => {
    const c = ctx({ rest: [], followMs: 150 });
    const p = cmdTail(c);
    await Bun.sleep(60);
    core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "测试都过了。" } });
    expect(await p).toBe(0);
    expect(c.lines).toContain("· 你自己开了「修一下 tinycart 里失败的测试」");
    expect(c.lines).toContain("你  你好");
    expect(c.lines).toContain("Ducter  你好！我在。");
    expect(c.lines).toContain("  ✓ 回答了：好");
    expect(c.lines.at(-1)).toBe("Ducter  测试都过了。");

    core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "Bash", input: { command: "bun test" }, output: "1 fail", ok: false } } });
    core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "mcp__ducter__checkpoint", input: { text: "x" } } } });
    const tc = ctx({ rest: ["tinycart"], followMs: 150 });
    const tp = cmdTail(tc);
    await Bun.sleep(60);
    core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "Fixed the date test.", questions: [], evidence: [] } });
    expect(await tp).toBe(0);
    expect(tc.lines[0]).toBe("修一下 tinycart 里失败的测试  t1");
    expect(tc.lines).toContain("— 在做");
    expect(tc.lines).toContain("× Bash  bun test");
    expect(tc.lines.some((l) => l.includes("mcp__ducter__"))).toBe(false);
    expect(tc.lines).toContain("■ 做完了  Fixed the date test.");
  });

  test("open <task>: shows it in a connected app; with none, says where it is", async () => {
    const c = ctx({ rest: ["Look at"] });
    expect(await cmdOpenTask(c)).toBe(0);
    expect(c.lines[0]).toBe("Look at the logs  t2");
    expect(c.lines[1]).toBe("  不用特定的地方");
    expect(c.lines[2]).toBe(`应用没开着。在这里看：ducter tail t2 --port ${core.port}`);
    // An app is connected: it is told, and the command says so.
    const ws = new WebSocket(core.url);
    const got: string[] = [];
    ws.onmessage = (m) => got.push(JSON.parse(String(m.data)).t);
    await new Promise<void>((r) => (ws.onopen = () => r()));
    ws.send(JSON.stringify({ t: "hello", client: "desktop" }));
    await Bun.sleep(50);
    const shown = ctx({ rest: ["t1"] });
    expect(await cmdOpenTask(shown)).toBe(0);
    expect(shown.lines[0]).toBe("在应用里打开了「修一下 tinycart 里失败的测试」。");
    await Bun.sleep(30);
    expect(got).toContain("open_task");
    ws.close();
  });
});

describe("lines", () => {
  test("a task's step lines leave Ducter's plumbing out", () => {
    const ev = (body: any, kind: LogEvent["kind"] = "task_event"): LogEvent => ({ seq: 1, ts: "", persona: "default", stream: "task:t", origin: "task", kind, body });
    expect(taskLine(ev({ role: "user", from: "runner", text: "Start the task" }), en)).toBeNull();
    expect(taskLine(ev({ role: "user", from: "user", text: "use b.ts" }), en)).toBe("→ use b.ts");
    expect(taskLine(ev({ role: "system", text: "turn completed", usage: {} }), en)).toBeNull();
    expect(taskLine(ev({ role: "tool", tool: { name: "Edit", input: { file_path: "/r/a.ts" }, ok: true } }), en)).toBe("· Edit  /r/a.ts");
    expect(taskLine(ev({ taskId: "t", attention: "needs_you", residency: "hot" }, "task_state"), en)).toBe("— needs you");
    expect(channelLine({ ...ev({ text: "hi" }, "ai_msg"), origin: "peer", stream: "channel" }, "D", en, () => undefined)).toBeNull();
  });
});
