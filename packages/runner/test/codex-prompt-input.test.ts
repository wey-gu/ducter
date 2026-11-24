// D512: what a clean Codex session (the partner) really gets. Codex's app-server appends a
// thread's config to the launch's `-c` list, and a whole `mcp_servers` table there replaced the
// `enabled=false` entries for the person's servers: the 0.171 eval's partner had context7, Mem,
// cua-driver and node_repl behind tool search while `codex mcp list` showed them off. So:
//   1. the partner's OAR options carry no `mcpServers` (OAR sends no thread `mcp_servers` table
//      for none), Ducter's server rides in the launch arguments, its token in the env;
//   2. with Codex installed, `codex debug prompt-input` under exactly those arguments and env, on a
//      scratch CODEX_HOME holding two live servers of "the person's", renders the model's real
//      input: Ducter's namespace and none of theirs, and no shell tool (D512's second half).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { adaptSpec, codexOwnServers } from "../src/oar.ts";

const TOKEN = "dtk.not-a-real-token";
let dir: string;
let home: string;
let server: ReturnType<typeof Bun.serve> | undefined;
let url = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-codex-input-"));
  home = join(dir, "codex-home");
  mkdirSync(home);
  mkdirSync(join(dir, "partner"));
  // Two stdio servers of "the person's", one named the way Codex has to normalize (a hyphen).
  const stdio = join(dir, "their-server.ts");
  writeFileSync(
    stdio,
    [
      `import { Server } from ${JSON.stringify(Bun.resolveSync("@modelcontextprotocol/sdk/server/index.js", import.meta.dir))};`,
      `import { StdioServerTransport } from ${JSON.stringify(Bun.resolveSync("@modelcontextprotocol/sdk/server/stdio.js", import.meta.dir))};`,
      `import { ListToolsRequestSchema } from ${JSON.stringify(Bun.resolveSync("@modelcontextprotocol/sdk/types.js", import.meta.dir))};`,
      `const s = new Server({ name: "theirs", version: "1" }, { capabilities: { tools: {} } });`,
      `s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "their_lookup", description: "Look up library docs.", inputSchema: { type: "object", properties: {} } }] }));`,
      `await s.connect(new StdioServerTransport());`,
    ].join("\n"),
  );
  const theirs = (name: string) => `[mcp_servers.${name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(stdio)}]\n`;
  writeFileSync(join(home, "config.toml"), theirs("context7") + theirs("nowledge-mem"));
  // Ducter's own server: answers only with the session's token.
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.headers.get("authorization") !== `Bearer ${TOKEN}`) return new Response("no", { status: 401 });
      const s = new Server({ name: "ducter", version: "1" }, { capabilities: { tools: {} } });
      s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "task_open", description: "Open a task.", inputSchema: { type: "object", properties: {} } }] }));
      s.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: "ok" }] }));
      const t = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await s.connect(t);
      const res = await t.handleRequest(req);
      const body = res.body ? await res.arrayBuffer() : null;
      await s.close().catch(() => {});
      return new Response(body, { status: res.status, headers: res.headers });
    },
  });
  url = `http://127.0.0.1:${server.port}/mcp`;
});
afterAll(() => {
  server?.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const partner = (): SessionSpec => ({
  harness: "codex",
  cwd: join(dir, "partner"),
  systemPrompt: "You are Ducter.",
  mcp: [{ name: "ducter", url, headers: { Authorization: `Bearer ${TOKEN}` } }],
  permissionMode: "bypass",
  isolateUserConfig: true,
  readOnly: true,
  noWeb: true,
});

describe("D512: the partner's Codex session", () => {
  test("no thread mcp_servers table: Ducter's server is one launch override ahead of the person's servers turned off, its token in the env", () => {
    const a = adaptSpec(partner(), { dataDir: dir, env: { CODEX_HOME: home } });
    expect(a.options.mcpServers ?? []).toEqual([]); // none: OAR then sends no thread `mcp_servers`
    const args = a.options.launchArgs!;
    const own = args.findIndex((x) => x.startsWith("mcp_servers={"));
    expect(own).toBe(1);
    expect(args.indexOf("mcp_servers.context7.enabled=false")).toBeGreaterThan(own);
    expect(args.indexOf("mcp_servers.nowledge-mem.enabled=false")).toBeGreaterThan(own);
    expect(args.join(" ")).not.toContain(TOKEN); // never in the process's arguments
    const env = a.options.env as Record<string, string>;
    expect(env.DUCTER_CODEX_MCP_0_HEADER_0).toBe(`Bearer ${TOKEN}`);
    expect(args).toContain("features.shell_tool=false");
  });

  test("a stdio server's env goes through env_vars, a name Codex can't take bare is quoted", () => {
    const o = codexOwnServers([{ name: "my.server", command: "/bin/x", args: ["a b"], env: { K: "v" } }]);
    expect(o.args).toEqual(["-c", 'mcp_servers={ "my.server" = { command = "/bin/x", args = ["a b"], env_vars = ["K"], enabled = true } }']);
    expect(o.env).toEqual({ K: "v" });
    expect(codexOwnServers([])).toEqual({ args: [], env: {} });
  });

  const codex = Bun.which("codex");
  // Async: Ducter's server answers from this process while Codex connects to it.
  const promptInput = async (args: string[], env: Record<string, string | null | undefined>): Promise<string> => {
    const e: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ...env })) if (typeof v === "string") e[k] = v;
    const p = Bun.spawn([codex!, "debug", "prompt-input", ...args, "hi"], { env: e, cwd: join(dir, "partner"), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });
    const out = await new Response(p.stdout).text();
    expect(await p.exited).toBe(0);
    return out;
  };
  // A server's namespace as the model sees it: deferred ("- mcp__context7") or a direct tool's prefix.
  const has = (input: string, ns: string) => input.includes(`- ${ns}\\n`) || input.includes(`- ${ns}:`) || input.includes(`${ns}__`);

  test.skipIf(!codex)(
    "with Codex installed: the model's real input holds Ducter's tools and none of the person's servers, and no shell",
    async () => {
      // The fixture is live: without the clean setup Codex gives the person's servers to the model.
      const bare = await promptInput([], { CODEX_HOME: home });
      expect(has(bare, "mcp__context7") && has(bare, "mcp__nowledge_mem")).toBe(true);
      // The partner's own arguments and env, exactly as the session is launched.
      const a = adaptSpec(partner(), { dataDir: dir, env: { CODEX_HOME: home } });
      const input = await promptInput(a.options.launchArgs!, { ...(a.options.env as Record<string, string | null>), CODEX_HOME: home });
      expect(has(input, "mcp__ducter")).toBe(true);
      expect(has(input, "mcp__context7") || has(input, "mcp__nowledge_mem")).toBe(false);
      expect(input).not.toContain("their_lookup");
      // The shell's tools as code mode declares them (its own text names exec_command as an example).
      expect(bare).toContain("exec_command(args");
      expect(input).not.toContain("exec_command(args");
      expect(input).not.toContain("write_stdin");
    },
    90_000,
  );
});
