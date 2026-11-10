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

/**
 * Options that make it look like OOMOL Hosted (research/44): its MCP endpoint at /v1/mcp, a gateway
 * in front of every path that answers 401 in plain text ("token not found" / "invalid token"),
 * and GET /v1/apps with the accounts connected there.
 */
export interface ServeOpts {
  path?: string;
  plain401?: boolean;
  apps?: unknown[];
}

/**
 * OOMOL Hosted's catalog since 2026-11 (D180): the tools carry a prefix (`connector_` by default),
 * search takes `q`, the guide answers `{ action: { operationType, inputSchema } }`, execute picks an
 * account by `appId` or `alias` and wraps the result as `{ executionId, actionId, output }`.
 */
export function fakeOpenConnectorV2(actions: FakeAction[], token?: string, opts: ServeOpts & { prefix?: string } = {}): FakeServer {
  const by = new Map(actions.map((a) => [a.id, a]));
  const px = opts.prefix ?? "connector_";
  const schema = (props: string[], required: string[] = []) => ({ type: "object", properties: Object.fromEntries(props.map((p) => [p, { type: "string" }])), required });
  return serve(
    [
      { name: `${px}list_services`, description: "Services", inputSchema: schema(["teamName", "cursor", "limit", "query"]), annotations: { readOnlyHint: true }, run: () => ({ services: [] }) },
      {
        name: `${px}search_actions`,
        description: "Search actions",
        inputSchema: schema(["teamName", "q", "service", "limit"], ["q"]),
        annotations: { readOnlyHint: true },
        run: (a) => ({ actions: actions.filter((x) => !a.service || x.id.startsWith(`${a.service}.`)).map((x) => ({ actionId: x.id, description: x.id, authenticated: true })) }),
      },
      {
        name: `${px}get_action`,
        description: "One action",
        inputSchema: schema(["teamName", "actionId"], ["actionId"]),
        annotations: { readOnlyHint: true },
        run: (a) => {
          const x = by.get(String(a.actionId));
          if (!x) return { errorCode: "invalid_input", message: `unknown action: ${a.actionId}`, ok: false };
          return { action: { id: x.id, operationType: x.operationType, inputSchema: { type: "object" } } };
        },
      },
      {
        name: `${px}execute_action`,
        description: "Execute",
        inputSchema: schema(["teamName", "actionId", "input", "approval", "appId", "alias"], ["actionId"]),
        annotations: { readOnlyHint: false, destructiveHint: true },
        run: (a) => {
          const x = by.get(String(a.actionId));
          if (!x) return { errorCode: "invalid_input", message: "unknown action", ok: false };
          return { executionId: "ex_1", actionId: x.id, output: x.run((a.input ?? {}) as Record<string, unknown>) };
        },
      },
    ],
    token,
    opts,
  );
}

function serve(tools: ToolDef[], token?: string, opts: ServeOpts = {}): FakeServer {
  const executed: FakeServer["executed"] = [];
  const authSeen: string[] = [];
  const mcpPath = opts.path ?? "/mcp";
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("authorization") ?? "";
      const refuse = () =>
        opts.plain401
          ? new Response(auth ? "invalid token" : "token not found", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } })
          : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      if (opts.plain401 && token && auth !== `Bearer ${token}`) return refuse();
      if (url.pathname === "/v1/apps" && opts.apps && req.method === "GET") {
        if (token && auth !== `Bearer ${token}`) return refuse();
        return Response.json({ success: true, data: opts.apps });
      }
      if (url.pathname !== mcpPath) return new Response("404 Not Found", { status: 404, headers: { "content-type": "text/plain" } });
      authSeen.push(auth);
      if (token && auth !== `Bearer ${token}`) return refuse();
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
export function fakeOpenConnector(actions: FakeAction[], token?: string, opts: ServeOpts = {}): FakeServer {
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
    opts,
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
