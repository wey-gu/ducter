// D85: the four first-wave harnesses. What each spec becomes per harness (no process starts),
// DeepSeek Harness against OAR's own declared contract on the scripted runtime, the stdio MCP
// bridge, and the one tool-name form.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { dshRuntime } from "@botiverse/oar/runtimes/dsh";
import { HARNESSES, HARNESS_IDS } from "@ducter/protocol";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { CLAUDE_SWITCHES } from "@ducter/protocol/src/harness-facts.ts";
import { adaptSpec, codexCleanArgs, contextTokensOf, createOarHarnessPort, PARTNER_READ_MAX_TOKENS, PI_CLEAN_FLAGS, withPreamble } from "../src/oar.ts";
import { Normalizer, stripThinking } from "../src/normalize.ts";
import { runBridge } from "../src/mcp-bridge.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-harness-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ducterMcp = { name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { Authorization: "Bearer dtk.test.sig" } };
const spec = (harness: SessionSpec["harness"], over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness,
  cwd: join(dir, "partner"),
  systemPrompt: "You are Ducter.",
  mcp: [ducterMcp],
  permissionMode: "bypass",
  isolateUserConfig: true,
  ...over,
});

test("the capability table covers the four, each task-capable", () => {
  expect([...HARNESS_IDS]).toEqual(["claude-code", "codex", "pi", "deepseek-harness"]);
  for (const id of HARNESS_IDS) expect(HARNESSES[id]).toMatchObject({ id, task: true });
  // v1 rule (ai-loadout): only Claude Code and Codex may be the partner until the others pass the eval.
  expect(HARNESS_IDS.filter((id) => HARNESSES[id].partner)).toEqual(["claude-code", "codex"]);
  expect(HARNESSES["deepseek-harness"].name).toBe("DeepSeek Harness");
});

describe("adaptSpec: the partner's clean setup per harness", () => {
  test("Claude Code: OAR's native exclude, and the features that compete with Ducter denied", () => {
    const a = adaptSpec(spec("claude-code"), { dataDir: dir });
    expect(a.options.userConfiguration).toBe("exclude");
    expect(a.options.disallowedTools).toContain("AskUserQuestion");
    expect(a.options.systemPrompt).toBe("You are Ducter.");
    expect(a.options.mcpServers).toEqual([{ name: "ducter", type: "http", url: ducterMcp.url, headers: ducterMcp.headers }]);
  });

  test("D122: every harness's oo is signed out (an empty config folder), so no session reaches the accounts around Go", () => {
    for (const h of HARNESS_IDS) {
      const a = adaptSpec(spec(h), { dataDir: dir, inherited: { PATH: "/usr/bin", HOME: dir, OO_CONFIG_DIR: "/Users/x/oo-real" } });
      const env = a.options.env as Record<string, string | null>;
      expect(env.OO_CONFIG_DIR).toBe(join(dir, "oo-signed-out"));
      expect(statSync(join(dir, "oo-signed-out")).mode & 0o777).toBe(0o700);
    }
  });

  test("Codex: each user MCP server off by name (not Ducter's), hooks/plugins off, no userConfiguration", () => {
    const home = join(dir, "codex-home");
    mkdirSync(home);
    writeFileSync(join(home, "config.toml"), 'model = "x"\n[mcp_servers.context7]\ncommand = "npx"\n[mcp_servers."my.server"]\nurl = "https://e"\n[mcp_servers.ducter]\nurl = "http://old"\n');
    const a = adaptSpec(spec("codex", { disallowedTools: ["Bash", "mcp__x__y"] }), { dataDir: dir, env: { CODEX_HOME: home } });
    const args = a.options.launchArgs!;
    expect(args).toContain("mcp_servers.context7.enabled=false");
    expect(args).toContain('mcp_servers."my.server".enabled=false');
    expect(args.join(" ")).not.toContain("mcp_servers.ducter");
    for (const f of ["hooks", "plugins", "apps", "memories"]) expect(args).toContain(`features.${f}=false`);
    expect(args).toContain("notify=[]");
    expect(a.options.userConfiguration).toBeUndefined();
    expect(a.options.disallowedTools).toEqual(["mcp__x__y"]); // codex denies MCP tools only
  });

  test("principle 6: a read-only (partner) session can't write or run; a task keeps its tools", () => {
    const claude = adaptSpec(spec("claude-code", { readOnly: true }), { dataDir: dir });
    for (const t of ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "Task"]) expect(claude.options.disallowedTools).toContain(t);
    for (const t of ["Read", "Grep", "Glob", "WebFetch", "WebSearch"]) expect(claude.options.disallowedTools).not.toContain(t);
    expect(claude.options.disallowedTools!.some((t) => t.startsWith("mcp__"))).toBe(false); // Ducter's tools stay
    expect((claude.options.env as Record<string, string>).CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS).toBe(String(PARTNER_READ_MAX_TOKENS));
    const codex = adaptSpec(spec("codex", { readOnly: true }), { dataDir: dir, env: { CODEX_HOME: join(dir, "none") } });
    expect(codex.options.launchArgs!.slice(-2)).toEqual(["-c", 'sandbox_mode="read-only"']);
    // Codex declines MCP calls under its sandbox unless marked read-only: Ducter's MCP is told.
    expect((codex.options.mcpServers![0] as { url: string }).url).toBe(ducterMcp.url + "?sandbox=read-only");
    expect((claude.options.mcpServers![0] as { url: string }).url).toBe(ducterMcp.url);
    const pi = adaptSpec(spec("pi", { readOnly: true }), { dataDir: dir });
    expect(pi.options.disallowedTools).toEqual(["bash", "edit", "write"]);
    const task = adaptSpec(spec("claude-code", { isolateUserConfig: false }), { dataDir: dir });
    expect(task.options.disallowedTools).not.toContain("Bash");
    expect(adaptSpec(spec("codex", { isolateUserConfig: false }), { dataDir: dir }).options.launchArgs).toBeUndefined();
  });

  test("Claude Code: a clean session loads Ducter's tools up front; a task keeps the user's tool search", () => {
    const clean = adaptSpec(spec("claude-code", { isolateUserConfig: true }), { dataDir: dir });
    expect((clean.options.env as Record<string, string>)[CLAUDE_SWITCHES.toolSearchEnv]).toBe("false");
    const own = adaptSpec(spec("claude-code", { isolateUserConfig: true, env: { [CLAUDE_SWITCHES.toolSearchEnv]: "true" } }), { dataDir: dir });
    expect((own.options.env as Record<string, string>)[CLAUDE_SWITCHES.toolSearchEnv]).toBe("true");
    const task = adaptSpec(spec("claude-code", { isolateUserConfig: false }), { dataDir: dir });
    expect((task.options.env as Record<string, string | null>)[CLAUDE_SWITCHES.toolSearchEnv]).toBeUndefined();
    // Never a Claude Code switch on another harness.
    const codex = adaptSpec(spec("codex", { isolateUserConfig: true }), { dataDir: dir, env: { CODEX_HOME: join(dir, "none") } });
    expect((codex.options.env as Record<string, string | null>)[CLAUDE_SWITCHES.toolSearchEnv]).toBeUndefined();
  });

  test("Codex task (not clean): no overrides at all", () => {
    const a = adaptSpec(spec("codex", { isolateUserConfig: false }), { dataDir: dir });
    expect(a.options.launchArgs).toBeUndefined();
  });

  test("the partner's harness compactor bound: Claude Code env + idle/precompute off in its own folder; Codex -c; none without it", () => {
    const cc = adaptSpec(spec("claude-code", { harnessCompactAt: 200_000 }), { dataDir: dir });
    expect((cc.options.env as Record<string, string | null>).CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("200000");
    const file = join(dir, "partner", ".claude", "settings.local.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ idleCompaction: false, precomputeCompactionEnabled: false });
    // A setting already in that file is kept.
    writeFileSync(file, JSON.stringify({ other: 1, idleCompaction: true }));
    adaptSpec(spec("claude-code", { harnessCompactAt: 200_000 }), { dataDir: dir });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ other: 1, idleCompaction: false, precomputeCompactionEnabled: false });

    const cx = adaptSpec(spec("codex", { harnessCompactAt: 200_000 }), { dataDir: dir });
    const args = cx.options.launchArgs!;
    expect(args.slice(-4)).toEqual(["-c", "model_context_window=200000", "-c", "model_auto_compact_token_limit=200000"]);
    expect(args).toContain("features.hooks=false"); // the clean setup stays

    // A spec with no window carries none: no env, no settings file, no -c.
    const taskDir = join(dir, "task");
    const t1 = adaptSpec(spec("claude-code", { cwd: taskDir, isolateUserConfig: false }), { dataDir: dir });
    expect((t1.options.env as Record<string, string | null>).CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined();
    expect(() => readFileSync(join(taskDir, ".claude", "settings.local.json"))).toThrow();
    const t2 = adaptSpec(spec("codex", { isolateUserConfig: false }), { dataDir: dir });
    expect(t2.options.launchArgs).toBeUndefined();
  });

  test("D135 partner: a 200K window on the standard model, the alias as its concrete id, the compactor capped at the window", () => {
    const cc = adaptSpec(spec("claude-code", { model: "opus", contextWindow: 200_000, harnessCompactAt: 200_000 }), { dataDir: dir });
    const env = cc.options.env as Record<string, string | null>;
    expect(cc.options.model).toBe("claude-opus-5-5");
    expect(env.CLAUDE_CODE_DISABLE_1M_CONTEXT).toBe("1"); // every name gets 1M otherwise (live, 2.1.319)
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("200000");
    expect(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE).toBeUndefined(); // its own point (167K) is already below the cap
    for (const m of ["opus[1m]", "sonnet", "claude-haiku-5-5", "haiku[1M]"]) {
      const id = adaptSpec(spec("claude-code", { model: m, contextWindow: 200_000 }), { dataDir: dir }).options.model!;
      expect(id).toMatch(/^claude-(opus|sonnet|haiku)-5-5$/); // never a [1m] variant
    }
    // A user who sets a 1M window keeps the 1M variant and gets no switch.
    const big = adaptSpec(spec("claude-code", { model: "opus[1m]", contextWindow: 1_000_000 }), { dataDir: dir });
    expect(big.options.model).toBe("claude-opus-5-5[1m]");
    expect((big.options.env as Record<string, string | null>).CLAUDE_CODE_DISABLE_1M_CONTEXT).toBeUndefined();
    // Unknown names pass as they are.
    expect(adaptSpec(spec("claude-code", { model: "claude-next-9", contextWindow: 200_000 }), { dataDir: dir }).options.model).toBe("claude-next-9");
  });

  test("D135 tasks: compaction at 160K, the PreCompact note via --settings, or its folder's settings under exclude", () => {
    const taskDir = join(dir, "task");
    const t = adaptSpec(spec("claude-code", { cwd: taskDir, isolateUserConfig: false, contextWindow: 200_000, harnessCompactAt: 160_000, preCompactNote: "keep it's brief" }), { dataDir: dir });
    const env = t.options.env as Record<string, string | null>;
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("200000");
    expect(Math.floor(180_000 * (Number(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) / 100))).toBe(160_000);
    const args = t.options.launchArgs!;
    const settings = JSON.parse(args[args.indexOf("--settings") + 1]!);
    expect(settings).toMatchObject({ idleCompaction: false, hooks: { PreCompact: [{ matcher: "auto" }] } });
    const cmd = settings.hooks.PreCompact[0].hooks[0].command as string;
    expect(Bun.spawnSync(["sh", "-c", cmd]).stdout.toString()).toBe("keep it's brief\n"); // shell-safe quoting
    expect(() => readFileSync(join(taskDir, ".claude", "settings.local.json"))).toThrow();
    // A browser place runs with "exclude": OAR owns --settings there, so the folder holds them.
    const b = adaptSpec(spec("claude-code", { cwd: taskDir, isolateUserConfig: false, userConfiguration: "exclude", contextWindow: 200_000, harnessCompactAt: 160_000, preCompactNote: "n" }), { dataDir: dir });
    expect(b.options.launchArgs ?? []).not.toContain("--settings");
    expect(JSON.parse(readFileSync(join(taskDir, ".claude", "settings.local.json"), "utf8"))).toMatchObject({ idleCompaction: false, hooks: { PreCompact: [{ matcher: "auto" }] } });

    const cx = adaptSpec(spec("codex", { isolateUserConfig: false, contextWindow: 200_000, harnessCompactAt: 160_000, preCompactNote: "n" }), { dataDir: dir });
    expect(cx.options.launchArgs).toEqual(["-c", "model_context_window=200000", "-c", "model_auto_compact_token_limit=160000"]);
    // pi has no per-session knob: nothing is passed (design/todo.md).
    const p = adaptSpec(spec("pi", { isolateUserConfig: false, contextWindow: 200_000, harnessCompactAt: 160_000 }), { dataDir: dir });
    expect(p.options.launchArgs).toBeUndefined();
  });

  test("context size: the harness's reading, but never Codex's cumulative fallback", () => {
    expect(contextTokensOf({ tokens: 17_908, contextWindow: 1_000_000 }, "claude-code")).toBe(17_908);
    expect(contextTokensOf({ tokens: 17_908, contextWindow: null }, "claude-code")).toBe(17_908);
    expect(contextTokensOf({ tokens: 44_200, contextWindow: null }, "codex")).toBeUndefined(); // no `last`: cumulative input
    expect(contextTokensOf({ tokens: 30_000, contextWindow: 258_000 }, "codex")).toBe(30_000);
    expect(contextTokensOf({ tokens: null, contextWindow: 1_000_000 }, "claude-code")).toBeUndefined(); // right after a compaction
    expect(contextTokensOf(null)).toBeUndefined();
  });

  test("codexCleanArgs with no user config still turns hooks and plugins off", () => {
    expect(codexCleanArgs(undefined)).toContain("features.hooks=false");
  });

  test("pi: the clean setup is CLI flags on its RPC process; options stay plain", () => {
    expect(PI_CLEAN_FLAGS).toEqual(["--no-skills", "--no-context-files", "--no-prompt-templates", "--no-extensions", "--no-themes"]);
    const a = adaptSpec(spec("pi", { model: "minimax-coding-plan/MiniMax-M3" }), { dataDir: dir });
    expect(a.options.userConfiguration).toBeUndefined();
    expect(a.options.systemPrompt).toBe("You are Ducter.");
    expect(a.options.model).toBe("minimax-coding-plan/MiniMax-M3");
  });

  test("DeepSeek Harness: own home with the prompt as its AGENTS.md, the key from Ducter's file, MCP over the bridge", () => {
    writeFileSync(join(dir, "keys.env"),"# keys\nDEEPSEEK_API_KEY=\"sk-test-not-real\"\n", { mode: 0o600 });
    const a = adaptSpec(spec("deepseek-harness", { model: "deepseek-flash" }), { dataDir: dir, env: {}, refused: dshRuntime.refusedSessionOptions as Record<string, string> });
    const home = join(dir, "harness", "deepseek-harness");
    expect(a.options.env).toMatchObject({ DSH_HOME: home, DSH_AGENTS_HOME: join(home, "agents"), DEEPSEEK_API_KEY: "sk-test-not-real" });
    expect(readFileSync(join(home, "AGENTS.md"), "utf8")).toBe("You are Ducter.\n");
    expect(a.preamble).toBeUndefined();
    expect(a.options.model).toBe("deepseek-official/deepseek-flash");
    // Nothing OAR's dsh runtime refuses is sent.
    for (const k of Object.keys(dshRuntime.refusedSessionOptions)) expect(k in a.options).toBe(false);
    const [m] = a.options.mcpServers as { name: string; command: string; args: string[] }[];
    expect(m!.name).toBe("ducter");
    expect("url" in m! || "headers" in m! || "env" in m!).toBe(false);
    const file = m!.args.at(-1)!;
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ url: ducterMcp.url, headers: ducterMcp.headers });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(m!.args.join(" ")).not.toContain("dtk."); // the token is never on the command line
  });

  test("DeepSeek Harness task (not clean): the user's own home, instructions ride on the first message", () => {
    const a = adaptSpec(spec("deepseek-harness", { isolateUserConfig: false, systemPrompt: undefined, appendSystemPrompt: "Task brief." }), { dataDir: dir, env: {} });
    expect(a.options.env?.DSH_HOME).toBeUndefined();
    expect(a.preamble).toBe("Task brief.");
    expect(a.options.appendSystemPrompt).toBeUndefined();
  });
});

/** A scripted runtime that keeps OAR's dsh contract: it refuses by presence what dsh refuses, and has no authStatus. */
function dshLike(seen: { options?: any; inputs: string[] }, turn: (t: ScriptedTurn) => Promise<void> = async (t) => t.say("ok")): Runtime {
  const rt = scriptedRuntime({
    id: "dsh",
    turn: async (t) => {
      seen.inputs.push(t.input);
      await turn(t);
    },
  });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (prop === "refusedSessionOptions") return dshRuntime.refusedSessionOptions;
      if (prop === "authStatus") return undefined;
      if (prop === "session")
        return (inst: any, options: any, ctx: any) => {
          for (const k of Object.keys(dshRuntime.refusedSessionOptions)) if (k in options) throw new Error(`refused: ${k}`);
          if ((options.mcpServers ?? []).some((s: any) => s.url || s.headers || s.env)) throw new Error("refused: mcpServers");
          seen.options = options;
          return target.session(inst, options, ctx);
        };
      return Reflect.get(target, prop, recv);
    },
  });
}

async function drain(s: { events(): AsyncIterable<any> }, until: (e: any) => boolean) {
  for await (const e of s.events()) if (until(e)) return;
}

describe("DeepSeek Harness on OAR's scripted runtime", () => {
  test("a task's instructions arrive once, with its first message; a resumed session gets none", async () => {
    const seen = { inputs: [] as string[] } as { options?: any; inputs: string[] };
    const port = createOarHarnessPort({ loadRuntime: async () => dshLike(seen), dataDir: dir });
    const s = await port.start(spec("deepseek-harness", { isolateUserConfig: false, systemPrompt: undefined, appendSystemPrompt: "Brief: fix the test." }));
    const it = s.events()[Symbol.asyncIterator]();
    await s.send("Start.");
    while (!(await it.next()).value?.turnEnd);
    await s.send("And then?");
    while (!(await it.next()).value?.turnEnd);
    expect(seen.inputs[0]).toBe(withPreamble("Brief: fix the test.", "Start."));
    expect(seen.inputs[1]).toBe("And then?");
    await s.close();

    const r = await port.start(spec("deepseek-harness", { isolateUserConfig: false, systemPrompt: undefined, appendSystemPrompt: "Brief.", resumeSessionId: s.id }));
    await r.send("Carry on.").catch(() => {});
    await Bun.sleep(30);
    expect(seen.inputs.at(-1)).toBe("Carry on.");
    await r.close();
  });

  test("the partner opens clean: no refused option sent, Ducter's tool reached over stdio", async () => {
    const seen = { inputs: [] as string[] } as { options?: any; inputs: string[] };
    const port = createOarHarnessPort({ loadRuntime: async () => dshLike(seen), dataDir: dir });
    const s = await port.start(spec("deepseek-harness"));
    expect(seen.options.mcpServers[0].command).toBeTruthy();
    expect(seen.options.env.DSH_HOME).toBe(join(dir, "harness", "deepseek-harness"));
    await s.send("hi");
    await drain(s, (e) => e.turnEnd);
    expect(seen.inputs[0]).toBe("hi"); // the prompt is the home's AGENTS.md, not the message
    await s.close();
  });

  test("available(): installed via the scripted runtime; signed in only with a DeepSeek key", async () => {
    const port = createOarHarnessPort({ loadRuntime: async (h) => (h === "deepseek-harness" ? dshLike({ inputs: [] }) : undefined), dataDir: dir, env: { DEEPSEEK_API_KEY: null, DSH_HOME: join(dir, "nohome") } });
    const prev = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      let ds = (await port.available()).find((h) => h.harness === "deepseek-harness")!;
      expect(ds).toMatchObject({ installed: true, loggedIn: false });
      // An older install's env file, not yet migrated, still counts (readKeys).
      writeFileSync(join(dir, "env"), "# keys\nDEEPSEEK_API_KEY=\"sk-test-not-real\"\n", { mode: 0o600 });
      ds = (await port.available()).find((h) => h.harness === "deepseek-harness")!;
      expect(ds.loggedIn).toBe(true);
    } finally {
      if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
    }
  });
});

describe("the stdio MCP bridge", () => {
  test("forwards requests with the headers, answers by id, ignores notifications' bodies", async () => {
    const calls: { url: string; headers: any; body: string }[] = [];
    const fakeFetch = (async (url: string, init: any) => {
      calls.push({ url, headers: init.headers, body: init.body });
      const msg = JSON.parse(init.body);
      if (msg.id === undefined) return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const out: string[] = [];
    async function* lines() {
      yield JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      yield JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
      yield "not json";
      yield JSON.stringify({ jsonrpc: "2.0", id: "b", method: "tools/list" });
    }
    await runBridge({ url: ducterMcp.url, headers: ducterMcp.headers }, { lines: lines(), write: (l) => out.push(l), fetch: fakeFetch });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.headers.Authorization).toBe("Bearer dtk.test.sig");
    expect(out.map((l) => JSON.parse(l).id).sort()).toEqual([1, "b"].sort() as any);
  });

  test("an unreachable Ducter answers the request with an error, not silence", async () => {
    const out: string[] = [];
    async function* lines() {
      yield JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" });
    }
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await runBridge({ url: ducterMcp.url, headers: {} }, { lines: lines(), write: (l) => out.push(l), fetch: failing });
    expect(JSON.parse(out[0]!)).toMatchObject({ id: 7, error: { code: -32603 } });
  });
});

describe("one tool-name form, no leaked reasoning", () => {
  test("a tool reported as server + tool becomes mcp__server__tool", () => {
    const n = new Normalizer(() => undefined);
    const out = n.push({ kind: "tool_call_started", callId: "c1", tool: "mcp", server: "ducter", toolName: "task_open" });
    expect(out[0]!.tool!.name).toBe("mcp__ducter__task_open");
  });

  test("a harness compaction surfaces with its outcome and trigger, so the partner can record it", () => {
    const n = new Normalizer(() => undefined);
    expect(n.push({ kind: "compaction_ended", outcome: "completed", trigger: "auto" })).toEqual([{ role: "system", text: "compaction completed", raw: { kind: "compaction_ended", outcome: "completed", trigger: "auto" } }]);
  });

  test("the turn end carries the harness's context reading next to the running totals", () => {
    const n = new Normalizer(() => ({ inputTokens: 17_908, outputTokens: 4, contextTokens: 17_908 }));
    const out = n.push({ kind: "turn_ended", outcome: { kind: "completed" } });
    expect(out[0]).toMatchObject({ turnEnd: true, usage: { contextTokens: 17_908 } });
  });

  test("reasoning written into the reply is dropped", () => {
    expect(stripThinking("The user asks… let me check.</think>\n\nNo.")).toBe("No.");
    expect(stripThinking("<think>hmm</think>On it.")).toBe("On it.");
    expect(stripThinking("Plain reply.")).toBe("Plain reply.");
  });
});
