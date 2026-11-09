// A fake MCP server over real Streamable HTTP, for connection tests: either an OpenConnector
// (its five discovery tools and a tiny action catalog) or a plain MCP server with annotations.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface FakeAction {
  id: string;
  operationType: "read" | "write" | "destructive";
  run: (input: Record<string, unknown>) => unknown;
}

export interface FakeServer {
  url: string; // base URL (OpenConnector style: /mcp is appended by Ducter)
  executed: { name: string; args: Record<string, unknown> }[];
  authSeen: string[];
  stop(): void;
}

type ToolDef = { name: string; description: string; inputSchema: object; annotations?: object; run: (args: Record<string, unknown>) => unknown };

function serve(tools: ToolDef[], token?: string): FakeServer {
  const executed: FakeServer["executed"] = [];
  const authSeen: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/mcp") return new Response("not found", { status: 404 });
      const auth = req.headers.get("authorization") ?? "";
      authSeen.push(auth);
      if (token && auth !== `Bearer ${token}`) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      if (req.method !== "POST") return new Response(null, { status: 405 });
      const s = new Server({ name: "fake", version: "1" }, { capabilities: { tools: {} } });
      s.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as any, ...(t.annotations ? { annotations: t.annotations } : {}) })),
      }));
      s.setRequestHandler(CallToolRequestSchema, async (r) => {
        const t = tools.find((x) => x.name === r.params.name);
        const args = (r.params.arguments ?? {}) as Record<string, unknown>;
        if (!t) return { content: [{ type: "text", text: "unknown tool" }], isError: true };
        executed.push({ name: t.name, args });
        const out = t.run(args);
        const ok = (out as { ok?: boolean })?.ok !== false;
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out as any, ...(ok ? {} : { isError: true }) };
      });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await s.connect(transport);
      try {
        const res = await transport.handleRequest(req);
        const body = res.body ? await res.arrayBuffer() : null;
        return new Response(body, { status: res.status, headers: res.headers });
      } finally {
        await s.close().catch(() => {});
      }
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, executed, authSeen, stop: () => void server.stop(true) };
}

const obj = { type: "object", properties: {} };

/** An OpenConnector look-alike: search_actions, get_action_guide (with operationType), execute_action. */
export function fakeOpenConnector(actions: FakeAction[], token?: string): FakeServer {
  const by = new Map(actions.map((a) => [a.id, a]));
  return serve(
    [
      { name: "list_apps", description: "Browse providers", inputSchema: obj, annotations: { readOnlyHint: true }, run: () => ({ ok: true, data: [...new Set(actions.map((a) => a.id.split(".")[0]))] }) },
      { name: "list_connections", description: "Accounts of one service", inputSchema: obj, annotations: { readOnlyHint: true }, run: () => ({ ok: true, data: [] }) },
      {
        name: "search_actions",
        description: "Search actions",
        inputSchema: obj,
        annotations: { readOnlyHint: true },
        run: (a) => ({ ok: true, data: actions.filter((x) => !a.service || x.id.startsWith(`${a.service}.`)).map((x) => ({ id: x.id, description: x.id, available: true })) }),
      },
      {
        name: "get_action_guide",
        description: "Guide",
        inputSchema: obj,
        annotations: { readOnlyHint: true },
        run: (a) => {
          const x = by.get(String(a.actionId));
          if (!x) return { ok: false, error: { code: "unknown_action", message: `Unknown action: ${a.actionId}` } };
          return { ok: true, data: { capability: { operationType: x.operationType }, markdown: `# ${x.id}\nInput: {}` } };
        },
      },
      {
        name: "execute_action",
        description: "Execute",
        inputSchema: obj,
        annotations: { readOnlyHint: false, destructiveHint: true },
        run: (a) => {
          const x = by.get(String(a.actionId));
          if (!x) return { ok: false, error: { code: "unknown_action", message: "Unknown action" } };
          return { ok: true, data: x.run((a.input ?? {}) as Record<string, unknown>) };
        },
      },
    ],
    token,
  );
}

/** A plain MCP server: one tool marked read-only, one not marked at all. */
export function fakePlainMcp(token?: string): FakeServer {
  return serve(
    [
      { name: "read_notes", description: "Read the notes", inputSchema: obj, annotations: { readOnlyHint: true }, run: () => ({ notes: ["a", "b"] }) },
      { name: "post_note", description: "Post a note", inputSchema: obj, run: () => ({ posted: true }) },
    ],
    token,
  );
}
