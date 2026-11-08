// McpHub: role-scoped Ducter tools served over stateless Streamable HTTP at /mcp.
// Tokens are self-describing and HMAC-signed (secret in <dataDir>/mcp.secret), so a task
// session resumed after a restart keeps working. Tokens are never logged.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpHub, ToolHandler } from "@ducter/protocol/src/internal.ts";

type Role = "partner" | "task";
interface Tool {
  description: string;
  inputSchema: object;
  handler: ToolHandler;
}
export interface Ctx {
  role: Role;
  taskId?: string;
}

export interface CoreMcpHub extends McpHub {
  handle(req: Request): Promise<Response>;
  setPort(port: number): void;
  verify(token: string): Ctx | undefined;
  tools(role: Role): string[];
  /** Calls a tool in-process, exactly as an MCP client would (tests, stubs). */
  call(ctx: Ctx, name: string, args: unknown): Promise<unknown>;
}

/**
 * Minimal argument check against the tool's JSON schema: required keys present, and required
 * string keys non-empty. Models do guess names (seen live: task_send called with `message`
 * instead of `text`), and a silent undefined would reach the task as an empty turn.
 */
export function checkArgs(tool: string, schema: object, args: unknown) {
  const s = schema as { required?: string[]; properties?: Record<string, { type?: string }> };
  if (!s.required?.length) return;
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const bad = s.required.filter((k) => {
    const v = a[k];
    if (v === undefined || v === null) return true;
    return s.properties?.[k]?.type === "string" && (typeof v !== "string" || !v.trim());
  });
  if (!bad.length) return;
  const expected = Object.keys(s.properties ?? {}).map((k) => (s.required!.includes(k) ? k : `${k}?`));
  const got = Object.keys(a);
  throw new Error(`${tool}: missing or empty ${bad.join(", ")}. Expected arguments: ${expected.join(", ")}; got: ${got.join(", ") || "none"}.`);
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");

export function createMcpHub(opts: { secret: string; port?: number; version?: string }): CoreMcpHub {
  let port = opts.port ?? 7777;
  const registry: Record<Role, Map<string, Tool>> = { partner: new Map(), task: new Map() };
  const mac = (payload: string) => createHmac("sha256", opts.secret).update(payload).digest("base64url");
  const tokenFor = (payload: string) => `dtk.${b64(payload)}.${mac(payload)}`;

  const verify = (token: string): Ctx | undefined => {
    const [p, enc, sig] = token.split(".");
    if (p !== "dtk" || !enc || !sig) return;
    const payload = Buffer.from(enc, "base64url").toString();
    const want = Buffer.from(mac(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return;
    if (payload === "partner") return { role: "partner" };
    if (payload.startsWith("task:") && payload.length > 5) return { role: "task", taskId: payload.slice(5) };
  };

  const call = async (ctx: Ctx, name: string, args: unknown) => {
    const tool = registry[ctx.role].get(name);
    if (!tool) throw new Error(`tool ${name} is not available to role ${ctx.role}`);
    checkArgs(name, tool.inputSchema, args ?? {});
    return tool.handler(args ?? {}, ctx);
  };

  const serverFor = (ctx: Ctx) => {
    const server = new Server({ name: "ducter", version: opts.version ?? "0.0.1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...registry[ctx.role]].map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema as any })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const out = await call(ctx, req.params.name, req.params.arguments);
        const text = typeof out === "string" ? out : JSON.stringify(out ?? { ok: true });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    });
    return server;
  };

  return {
    register(role, name, description, inputSchema, handler) {
      registry[role].set(name, { description, inputSchema, handler });
    },
    configFor(role) {
      const payload = role === "partner" ? "partner" : `task:${role.taskId}`;
      return {
        name: "ducter",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { Authorization: `Bearer ${tokenFor(payload)}` },
      };
    },
    setPort: (p) => void (port = p),
    verify,
    tools: (role) => [...registry[role].keys()],
    call,
    async handle(req) {
      const auth = req.headers.get("authorization") ?? "";
      const ctx = auth.startsWith("Bearer ") ? verify(auth.slice(7).trim()) : undefined;
      if (!ctx) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const server = serverFor(ctx);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try {
        const res = await transport.handleRequest(req);
        // Materialize the body before closing the per-request server.
        const body = res.body ? await res.arrayBuffer() : null;
        return new Response(body, { status: res.status, headers: res.headers });
      } finally {
        await server.close().catch(() => {});
      }
    },
  };
}
