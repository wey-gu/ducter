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
  // D490: two searches a turn, the budget said in each result; no word of the person's lifts it (ASKS_RECALL retired).
  test("returns compact hits with a do-not-paste note; two searches a turn, each saying what is left", async () => {
    const results: any[] = [];
    const { partner, user, fc, mem } = setup(async (_i, s) => {
      results.push(await fc.callTool("memory_search", { query: "HawDB bench" }));
      results.push(await fc.callTool("memory_search", { query: "bench again" }));
      results.push(await fc.callTool("memory_search", { query: "bench once more" }));
      s.say("好，照上次的跑法来。");
      s.end();
    });
    user("你再好好想想，像上次那样跑一下 HawDB 的基准");
    await partner.idle();
    expect(results[0].ok).toBe(true);
    expect(results[0].results[0]).toMatchObject({ title: "HawDB 基准测试的做法", date: "2026-11-02" });
    expect(results[0].note).toMatch(/never paste/i);
    expect(results.map((r) => [r.ok, r.searchesLeftThisTurn])).toEqual([[true, 1], [true, 0], [false, undefined]]);
    expect(results[2].error).toMatch(/already searched memory 2 times/);
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
      r = await fc.callTool("memory_add", { title: "测试统一用假时钟", content: "Weyl 要求以后所有涉及时间的测试都用假时钟，不用真实 sleep。", said: "以后测试里涉及时间的都用假时钟", importance: 0.8 });
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
      rs.push(await fc.callTool("memory_add", { title: "OpenAI key", content: "key is sk-proj-abcdefghijklmnopqrstuvwxyz0123", said: "hi there" }));
      rs.push(await fc.callTool("memory_add", { title: "TTL fix", content: "Commit c3d9f01 on ducter/fix-flaky-ttl", said: "hi there" }));
      rs.push(await fc.callTool("memory_add", { title: "worktree", content: "it lives in ~/.ducter/worktrees/abc", said: "hi there" }));
      s.end();
    });
    user("hi there");
    await partner.idle();
    expect(rs.map((r) => r.ok)).toEqual([false, false, false]);
    expect(rs[0].error).toMatch(/secret/);
    expect(rs[1].error).toMatch(/plumbing/);
    expect(mem.added.length).toBe(0);
    expect(channel().some((e) => e.kind === "memory_noted")).toBe(false);
  });

  // D490: grounded writes (ONE_TIME retired: whether it lasts is the partner's judgement, held by the
  // memory eval). Code checks only that the words it rests on were said: by the person, earlier in the
  // conversation, or by a task's report this turn; width, case, spacing and the quote marks around them aside.
  test("kept only on words that were said: the person's, earlier ones, a task's report; never paraphrased", async () => {
    const rs: any[] = [];
    const { partner, user, fc, mem } = setup(async (_i, s, n) => {
      if (n === 1) {
        rs.push(await fc.callTool("memory_add", { title: "测试缩进", content: "Weyl 的测试一律用 4 个空格缩进。" })); // no said
        rs.push(await fc.callTool("memory_add", { title: "测试缩进", content: "Weyl 的测试一律用 4 个空格缩进。", said: "测试一律四个空格" })); // paraphrase
        rs.push(await fc.callTool("memory_add", { title: "测试缩进", content: "Weyl 的测试一律用 4 个空格缩进。", said: "「以后测试都用 4 个空格缩进。」" }));
      }
      if (n === 2) rs.push(await fc.callTool("memory_add", { title: "Prefers pnpm", content: "Weyl prefers pnpm over npm.", said: "Use pnpm, not npm" })); // said a turn before
      if (n === 3) rs.push(await fc.callTool("memory_add", { title: "Release order", content: "Weyl bumps Cargo.toml and the CHANGELOG in one commit.", said: "bumps Cargo.toml and CHANGELOG.md in the same commit" }));
      s.end();
    });
    user("Use pnpm, not npm, in ~/dev/web.");
    await partner.idle();
    user("以后测试都用 4 个空格缩进，这次也是");
    await partner.idle();
    user("ok");
    await partner.idle();
    partner.onTrigger(fc.core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "Released.", questions: [], evidence: [], remember: [{ title: "Release order", content: "He bumps Cargo.toml and CHANGELOG.md in the same commit." }] } }));
    await partner.idle();
    expect(rs.map((r) => r.ok)).toEqual([false, false, true, true, true]);
    expect(rs[0].error).toMatch(/needs `said`/);
    expect(rs[1].error).toMatch(/aren't in what the user said/);
    expect(mem.added.map((m) => m.title)).toEqual(["测试缩进", "Prefers pnpm", "Release order"]);
  });

  test("a word made of hex letters is not plumbing", async () => {
    let r: any;
    const { partner, user, fc } = setup(async (_i, s) => {
      r = await fc.callTool("memory_add", { title: "Prefers decaf", content: "Weyl drinks decaffeinated coffee after 3pm.", said: "decaf after 3pm" });
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
        r = await fc.callTool("memory_add", { title: "t", content: "c", said: "以后都用中文回我" });
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

  // D563: the note says the true reason: no Mem on the home is never "not signed in", and never pitched.
  for (const [down, has, hasNot] of [
    [true, /conversation itself still holds/, /signed in on the home|Settings › Memory is where/],
    ["signed_out", /sign-in on the home has lapsed/, /switched memory off/],
    ["off", /switched memory off/, /signed in|lapsed/],
  ] as const) {
    test(`a save that went nowhere says why (${down})`, async () => {
      let r: any;
      const { partner, user, fc } = setup(
        async (_i, s) => {
          r = await fc.callTool("memory_add", { title: "t", content: "c", said: "以后都用中文回我" });
          s.end();
        },
        fakeMemory([], { down }),
      );
      user("以后都用中文回我");
      await partner.idle();
      expect(r).toMatchObject({ ok: false, saved: false });
      expect(r.note).toMatch(has);
      expect(r.note).not.toMatch(hasNot);
    });
  }

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
    // Each call keeps its own argv (D329: a save searches beside its write, so two calls can overlap);
    // a write's stdin and argv are kept apart from the search's.
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/call.$$"\necho $$ >> "${dir}/order"\nif [ "$3" != search ]; then cp "${dir}/call.$$" "${dir}/args.w"; cat > "${dir}/stdin" 2>/dev/null; fi\n${script}\n`);
    chmodSync(bin, 0o755);
    const lines = (f: string) => readFileSync(join(dir, f), "utf8").trim().split("\n");
    return { bin, dir, args: () => lines(`call.${lines("order").at(-1)}`), writeArgs: () => lines("args.w"), stdin: () => readFileSync(join(dir, "stdin"), "utf8") };
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

  test("D461: the offers ask for one kind of memory, and scan threads deep (Mem ranks them by match, not date)", async () => {
    const s = stub(`echo '{"memories":[],"threads":[]}'`);
    const c = createNmemClient({ bin: s.bin });
    await c.search("once", 8, { unitType: "decision" });
    expect(s.args()).toEqual(["--json", "m", "search", "-n", "8", "--unit-type", "decision", "--", "once"]);
    await c.threads!("下次", 3, { scan: 20 });
    expect(s.args()).toEqual(["--json", "t", "search", "-n", "20", "--", "下次"]);
    await c.threads!("下次", 3, { scan: 999 });
    expect(s.args()).toEqual(["--json", "t", "search", "-n", "30", "--", "下次"]);
    await c.threads!("下次", 3);
    expect(s.args()).toEqual(["--json", "t", "search", "-n", "5", "--", "下次"]);
  });

  test("add: content via stdin, provenance flags, no identity or space invented when none is bound", async () => {
    const s = stub(`echo '{"id":"m9"}'`);
    const r = await createNmemClient({ bin: s.bin, env: { PATH: process.env.PATH } }).add({
      title: "-Fake clock",
      content: "--all time tests use a fake clock",
      importance: 0.8,
      provenance: { persona: "default", logSeq: 7 },
    });
    expect(r).toEqual({ ok: true, id: "m9" });
    const a = s.writeArgs();
    expect(a.slice(0, 4)).toEqual(["--json", "m", "add", "--stdin"]);
    expect(a).toContain("--title=-Fake clock");
    expect(a.join(" ")).toContain("--source ducter --source-app ducter --source-msg ducter;persona=default;log=7");
    expect(a).not.toContain("--agent-id");
    expect(a).not.toContain("--space");
    expect(s.stdin()).toBe("--all time tests use a fake clock");
  });

  test("nmem gets the basics and NMEM_*, never Ducter's keys (D102)", async () => {
    const s = stub(`env > "$(dirname "$0")/env"; echo '{"memories":[]}'`);
    const env = { PATH: process.env.PATH, HOME: "/h", NMEM_API_KEY: "nm-1", NMEM_SPACE: "work", ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oa", DUCTER_MCP_SECRET: "x", GH_TOKEN: "ghp" };
    await createNmemClient({ bin: s.bin, env }).search("x", 1);
    const seen = readFileSync(join(s.dir, "env"), "utf8");
    expect(seen).toContain("NMEM_API_KEY=nm-1");
    expect(seen).toContain("NMEM_SPACE=work");
    expect(seen).toContain("HOME=/h");
    for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DUCTER_MCP_SECRET", "GH_TOKEN"]) expect(seen).not.toContain(k);
  });

  test("D141: the persona's identity is named on every write, its Space on search too; the env's NMEM_AGENT_ID never wins", async () => {
    const s = stub(`echo '{"id":"m10"}'`);
    let who: { agentId: string; space?: string } | undefined = { agentId: "ducter" };
    const c = createNmemClient({ bin: s.bin, env: { PATH: process.env.PATH, NMEM_AGENT_ID: "someone-else" }, identity: () => who });
    await c.add({ title: "t", content: "c", provenance: { persona: "default", logSeq: 3 } });
    let a = s.writeArgs();
    expect(a.join(" ")).toContain("--source-app ducter --source-msg ducter;persona=default;log=3 --agent-id ducter");
    expect(a).not.toContain("--space");
    expect(a).not.toContain("someone-else");
    who = { agentId: "ducter-scratch", space: "ducter-scratch" }; // read per call: a bind mid-run applies at once
    await c.add({ title: "t", content: "c", provenance: { persona: "default" } });
    a = s.writeArgs();
    expect(a.slice(-4)).toEqual(["--agent-id", "ducter-scratch", "--space", "ducter-scratch"]);
    await c.search("q", 2);
    expect(s.args()).toEqual(["--json", "m", "search", "-n", "2", "--space", "ducter-scratch", "--", "q"]);
  });

  test("D229: no Space chosen, the identity has a lane: recall reads where saves land and its lane, merged by id and Mem's score", async () => {
    // In the shape of nmem 0.10.118 `--json m search`: query, total, search_mode, memories[{id, score, space_id, …}].
    const s = stub(`case "$*" in
  *--space-id*) echo '{"query":"q","total":2,"search_mode":"normal","memories":[{"id":"a","title":"lane A","content":"x","score":0.9,"space_id":"lane-1"},{"id":"same","title":"dup","content":"x","score":0.5,"space_id":"lane-1"}]}' ;;
  *) echo '{"query":"q","total":2,"search_mode":"normal","memories":[{"id":"same","title":"dup","content":"x","score":0.5,"space_id":"personal-1"},{"id":"b","title":"own note","content":"x","score":0.7,"space_id":"personal-1"}]}' ;;
esac
printf '%s\\n' "$*" >> "$(dirname "$0")/all"`);
    const c = createNmemClient({ bin: s.bin, identity: () => ({ agentId: "ducter", lane: "lane-1" }) });
    const r = await c.search("q", 5);
    const calls = readFileSync(join(s.dir, "all"), "utf8").trim().split("\n").sort();
    expect(calls).toEqual(["--json m search -n 5 --space-id lane-1 -- q", "--json m search -n 5 -- q"].sort());
    expect(r.ok && r.hits.map((h) => h.id)).toEqual(["a", "b", "same"]);
    // A Space the user chose wins alone: no lane read.
    const s2 = stub(`echo '{"memories":[]}'`);
    await createNmemClient({ bin: s2.bin, identity: () => ({ agentId: "ducter", space: "Work", lane: "lane-1" }) }).search("q", 2);
    expect(s2.args()).toEqual(["--json", "m", "search", "-n", "2", "--space", "Work", "--", "q"]);
  });

  test("D229: one of the two reads fails: the other's hits; both fail: the failure, as before", async () => {
    const s = stub(`case "$*" in *--space-id*) echo 'boom' >&2; exit 1 ;; *) echo '{"memories":[{"id":"b","title":"own","content":"x","score":0.7}]}' ;; esac`);
    const r = await createNmemClient({ bin: s.bin, identity: () => ({ agentId: "ducter", lane: "lane-1" }) }).search("q", 5);
    expect(r.ok && r.hits.map((h) => h.id)).toEqual(["b"]);
    const d = stub(`echo 'boom' >&2; exit 1`);
    const f = await createNmemClient({ bin: d.bin, identity: () => ({ agentId: "ducter", lane: "lane-1" }) }).search("q", 5);
    expect(f).toMatchObject({ ok: false, reason: "unavailable" });
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
