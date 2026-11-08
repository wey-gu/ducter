// Memory slice: recall/remember tools, gating, provenance, the Noted line, and the nmem client
// against a STUB binary (never the user's real Mem).
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { buildSystemPrompt, createNmemClient, createPartner, provenanceRef, renderHistoryLine } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-memory-test-"));

function setup(script: Script, mem = fakeMemory([{ title: "HawDB 基准测试的做法", content: "跑 hawdb bench 时用 release 构建、固定 4 线程、跑 3 次取中位数。", date: "2026-11-02", kind: "procedure" }])) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: mem.memory });
  const user = (text: string) => {
    const e = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
    partner.onTrigger(e);
    return e;
  };
  const channel = () => fc.events.filter((e) => e.stream === "channel");
  return { fc, fr, partner, user, channel, mem };
}

describe("memory_search", () => {
  test("returns compact hits with a do-not-paste note; one recall per turn", async () => {
    const results: any[] = [];
    const { partner, user, fc, mem } = setup(async (_i, s) => {
      results.push(await fc.callTool("memory_search", { query: "HawDB bench" }));
      results.push(await fc.callTool("memory_search", { query: "bench again" }));
      s.say("好，照上次的跑法来。");
      s.end();
    });
    user("像上次那样跑一下 HawDB 的基准");
    await partner.idle();
    expect(results[0].ok).toBe(true);
    expect(results[0].results[0]).toMatchObject({ title: "HawDB 基准测试的做法", date: "2026-11-02" });
    expect(results[0].note).toMatch(/never paste/i);
    expect(results[1].ok).toBe(false); // gated
    expect(mem.searches.length).toBe(1);
  });

  test("the user asking to look again lifts the gate", async () => {
    const results: any[] = [];
    const { partner, user, fc, mem } = setup(async (_i, s) => {
      results.push(await fc.callTool("memory_search", { query: "a" }));
      results.push(await fc.callTool("memory_search", { query: "b" }));
      s.end();
    });
    user("你再好好想想，上次 HawDB 的基准是怎么跑的？");
    await partner.idle();
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(mem.searches.length).toBe(2);
  });

  test("Mem not configured: says so, the turn goes on", async () => {
    let r: any;
    const { partner, user, fc, channel } = setup(
      async (_i, s) => {
        r = await fc.callTool("memory_search", { query: "x" });
        s.say("你上次是怎么跑的？");
        s.end();
      },
      fakeMemory([], { down: true }),
    );
    user("像上次那样跑一下基准");
    await partner.idle();
    expect(r).toMatchObject({ ok: false, available: false });
    expect(r.note).toMatch(/carry on/i);
    expect(channel().filter((e) => e.kind === "ai_msg").length).toBe(1);
  });
});

describe("memory_add", () => {
  test("saves with provenance and shows one Noted line after the reply", async () => {
    let r: any;
    const { partner, user, fc, channel, mem } = setup(async (_i, s) => {
      r = await fc.callTool("memory_add", { title: "测试统一用假时钟", content: "Weyl 要求以后所有涉及时间的测试都用假时钟，不用真实 sleep。", importance: 0.8 });
      s.say("好，以后都这样。");
      s.end();
    });
    const u = user("以后测试里涉及时间的都用假时钟，别再用真 sleep 了");
    await partner.idle();
    expect(r.ok).toBe(true);
    expect(mem.added[0]!.provenance).toEqual({ persona: "p1", logSeq: u.seq });
    const ch = channel().filter((e) => e.origin === "partner");
    expect(ch.map((e) => e.kind)).toEqual(["ai_msg", "memory_noted"]);
    expect(ch[1]!.body as Bodies["memory_noted"]).toEqual({ title: "测试统一用假时钟", memoryId: "mem-1", replyTo: u.seq });
  });

  test("refuses secrets and task plumbing; nothing saved, no line", async () => {
    const rs: any[] = [];
    const { partner, user, fc, channel, mem } = setup(async (_i, s) => {
      rs.push(await fc.callTool("memory_add", { title: "OpenAI key", content: "key is sk-proj-abcdefghijklmnopqrstuvwxyz0123" }));
      rs.push(await fc.callTool("memory_add", { title: "TTL fix", content: "Commit c3d9f01 on ducter/fix-flaky-ttl" }));
      rs.push(await fc.callTool("memory_add", { title: "worktree", content: "it lives in ~/.ducter/worktrees/abc" }));
      s.end();
    });
    user("hi");
    await partner.idle();
    expect(rs.map((r) => r.ok)).toEqual([false, false, false]);
    expect(rs[0].error).toMatch(/secret/);
    expect(rs[1].error).toMatch(/plumbing/);
    expect(mem.added.length).toBe(0);
    expect(channel().some((e) => e.kind === "memory_noted")).toBe(false);
  });

  test("a word made of hex letters is not plumbing", async () => {
    let r: any;
    const { partner, user, fc } = setup(async (_i, s) => {
      r = await fc.callTool("memory_add", { title: "Prefers decaf", content: "Weyl drinks decaffeinated coffee after 3pm." });
      s.end();
    });
    user("note: decaf after 3pm");
    await partner.idle();
    expect(r.ok).toBe(true);
  });

  test("Mem down: not saved, no line, the partner still replies", async () => {
    let r: any;
    const { partner, user, fc, channel } = setup(
      async (_i, s) => {
        r = await fc.callTool("memory_add", { title: "t", content: "c" });
        s.say("好。");
        s.end();
      },
      fakeMemory([], { down: true }),
    );
    user("以后都用中文回我");
    await partner.idle();
    expect(r).toMatchObject({ ok: false, saved: false });
    expect(channel().filter((e) => e.origin === "partner").map((e) => e.kind)).toEqual(["ai_msg"]);
  });

  test("memory tools between the ack line and task_open keep the ack intact", async () => {
    const { partner, user, fc, channel } = setup(async (_i, s) => {
      s.say("我照上次的跑法去跑 HawDB 的基准。");
      s.emit({ role: "assistant", tool: { name: "mcp__ducter__memory_search", input: { query: "HawDB bench" } } });
      await fc.callTool("memory_search", { query: "HawDB bench" });
      s.emit({ role: "tool", tool: { name: "mcp__ducter__memory_search", output: "{}", ok: true } });
      s.emit({ role: "assistant", tool: { name: "mcp__ducter__task_open", input: {} } });
      await fc.callTool("task_open", { title: "HawDB: 跑基准", brief: "b" });
      s.end();
    });
    user("像上次那样跑一下 HawDB 的基准");
    await partner.idle();
    const ch = channel().filter((e) => e.origin === "partner");
    expect(ch.map((e) => e.kind)).toEqual(["ack", "job_status"]);
    expect((ch[0]!.body as Bodies["ack"]).text).toContain("基准");
  });
});

describe("rendering and persona", () => {
  test("a fresh session sees what it already remembered", () => {
    const line = renderHistoryLine(
      { seq: 3, ts: "2026-11-08T14:00:00Z", persona: "p1", stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "测试统一用假时钟" } },
      { taskTitle: () => undefined, decision: () => undefined },
    );
    expect(line).toContain("you remembered] 测试统一用假时钟");
  });

  test("persona carries the memory rules", () => {
    const p = buildSystemPrompt({ id: "p", name: "Ducter", identity: "" });
    expect(p).toContain("memory_search once");
    expect(p).toContain("Never secrets");
    expect(p).toContain("\"Noted\" line");
  });

  test("provenance ref is metadata-shaped", () => {
    expect(provenanceRef({ persona: "default", logSeq: 42, taskId: "t9" })).toBe("ducter;persona=default;log=42;task=t9");
  });
});

describe("nmem client (stub binary)", () => {
  function stub(script: string) {
    const dir = tmp();
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/args"\ncat > "${dir}/stdin" 2>/dev/null\n${script}\n`);
    chmodSync(bin, 0o755);
    return { bin, dir, args: () => readFileSync(join(dir, "args"), "utf8").trim().split("\n"), stdin: () => readFileSync(join(dir, "stdin"), "utf8") };
  }

  test("search: argv, compact parse", async () => {
    const s = stub(`echo '{"memories":[{"id":"m1","title":"T","content":"${"x".repeat(400)}","created_at":"2026-11-02T10:00:00+00:00","unit_type":"preference","space_id":"personal-1"}]}'`);
    const r = await createNmemClient({ bin: s.bin }).search("-像上次那样", 3);
    expect(s.args()).toEqual(["--json", "m", "search", "-n", "3", "--", "-像上次那样"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hits[0]).toMatchObject({ title: "T", date: "2026-11-02", kind: "preference" });
      expect(r.hits[0]!.content.length).toBeLessThanOrEqual(280);
      expect(JSON.stringify(r.hits)).not.toContain("personal-1");
    }
  });

  test("add: content via stdin, provenance flags, no identity or space invented", async () => {
    const s = stub(`echo '{"id":"m9"}'`);
    const r = await createNmemClient({ bin: s.bin, env: { PATH: process.env.PATH } }).add({
      title: "-Fake clock",
      content: "--all time tests use a fake clock",
      importance: 0.8,
      provenance: { persona: "default", logSeq: 7 },
    });
    expect(r).toEqual({ ok: true, id: "m9" });
    const a = s.args();
    expect(a.slice(0, 4)).toEqual(["--json", "m", "add", "--stdin"]);
    expect(a).toContain("--title=-Fake clock");
    expect(a.join(" ")).toContain("--source ducter --source-app ducter --source-msg ducter;persona=default;log=7");
    expect(a).not.toContain("--agent-id");
    expect(a).not.toContain("--space");
    expect(s.stdin()).toBe("--all time tests use a fake clock");
  });

  test("missing binary and auth errors read as not configured; others as unavailable", async () => {
    const missing = await createNmemClient({ bin: join(tmp(), "nope") }).search("x", 1);
    expect(missing).toMatchObject({ ok: false, reason: "not_configured" });
    const auth = stub(`echo 'Error: 401 Unauthorized: invalid API key' >&2; exit 1`);
    expect(await createNmemClient({ bin: auth.bin }).search("x", 1)).toMatchObject({ ok: false, reason: "not_configured" });
    const down = stub(`echo 'connection refused' >&2; exit 2`);
    expect(await createNmemClient({ bin: down.bin }).add({ title: "t", content: "c", provenance: { persona: "p" } })).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
