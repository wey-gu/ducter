// Live smoke test: real Claude Code (haiku) via OAR, a temp git repo, and a minimal fake core
// serving the task MCP tools over HTTP. Run with: DUCTER_LIVE=1 bun test test/live.test.ts
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Bodies } from "@ducter/protocol";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const live = process.env.DUCTER_LIVE === "1";

function serveMcp(core: FakeCore) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      // Stateless JSON mode: no standalone SSE stream (Claude Code opens a GET; refuse it fast).
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      const auth = req.headers.get("authorization") ?? "";
      const m = /^Bearer task-token-(\w+)$/.exec(auth);
      if (!m) return new Response("unauthorized", { status: 401 });
      const taskId = m[1]!;
      const mcp = new Server({ name: "ducter", version: "0.0.1" }, { capabilities: { tools: {} } });
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [...core.tools.entries()]
          .filter(([, t]) => t.role === "task")
          .map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema as any })),
      }));
      mcp.setRequestHandler(CallToolRequestSchema, async (r) => {
        const t = core.tools.get(r.params.name);
        if (!t) return { content: [{ type: "text", text: `unknown tool ${r.params.name}` }], isError: true };
        try {
          const out = await t.handler(r.params.arguments ?? {}, { role: "task", taskId });
          return { content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }] };
        } catch (e) {
          return { content: [{ type: "text", text: String(e) }], isError: true };
        }
      });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcp.connect(transport);
      return transport.handleRequest(req);
    },
  });
  return server;
}

function cleanupClaudeProjects(root: string): string[] {
  const projects = join(homedir(), ".claude", "projects");
  if (!existsSync(projects)) return [];
  const slugs = new Set([root, realpathSync(root)].map((p) => p.replace(/[^A-Za-z0-9]/g, "-")));
  const removed: string[] = [];
  for (const name of readdirSync(projects)) {
    if ([...slugs].some((s) => name.includes(s))) {
      rmSync(join(projects, name), { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

test.skipIf(!live)(
  "live: claude-code haiku creates hello.txt in a worktree and reports done",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ducter-live-"));
    const core = createFakeCore(join(root, "data"));
    registerTaskTools(core);
    const server = serveMcp(core);
    core.setMcpUrl(`http://127.0.0.1:${server.port}/mcp`);
    const repo = join(root, "repo");
    Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
    writeFileSync(join(repo, "README.md"), "live\n");
    Bun.spawnSync(["git", "-C", repo, "add", "."]);
    Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);

    const runner = createRunner(core);
    try {
      const card = await runner.openTask({
        persona: "p1",
        title: "hello file",
        brief: "Create a file hello.txt containing exactly 'hi' in your working directory, then report done via report_to_main with the file as evidence. Do not commit.",
        place: { kind: "repo", device: "mac", repoPath: repo },
        model: "haiku",
      });
      await runner.whenStarted(card.taskId);
      const report = await waitFor(() => core.events.find((e) => e.kind === "report"), "report", 150_000);
      await waitFor(() => core.tasks.get(card.taskId)?.residency === "warm", "warm", 60_000);

      const evs = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]);
      const wt = (card.place as any).worktree as string;
      console.log(
        `[live] events=${evs.length} tools=${evs.filter((e) => e.tool).map((e) => e.tool!.name).join(",")} ` +
          `report=${JSON.stringify((report.body as any).state)} states=${core.states(card.taskId).join(" > ")}`,
      );
      expect(evs.some((e) => e.role === "assistant" || e.tool)).toBe(true);
      expect((report.body as Bodies["report"]).state).toBe("done");
      expect(readFileSync(join(wt, "hello.txt"), "utf8").trim()).toBe("hi");
      const turnEnd = evs.find((e) => (e.raw as any)?.turnEnd);
      console.log(`[live] usage=${JSON.stringify((turnEnd?.raw as any)?.usage)} session=${runner.sessionId(card.taskId) ? "yes" : "no"}`);
    } finally {
      await runner.dispose();
      server.stop(true);
      const removed = cleanupClaudeProjects(root);
      console.log(`[live] cleaned ${removed.length} ~/.claude/projects folder(s)`);
      rmSync(root, { recursive: true, force: true });
    }
  },
  240_000,
);
