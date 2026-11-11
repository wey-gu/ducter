// A fake Tuwa (research/53 §8): its OAuth 2.1 server (RFC 9728 + 8414 metadata, a registration that
// wants redirect_uris, device authorization, token with authorization_pending / slow_down, refresh)
// and its MCP server at /mcp, over real HTTP, with the tool list and input schemas Tuwa's server
// listed on 2026-11-11 (fixtures/tuwa-tools.json, descriptions dropped). The call flow behind the
// tools is a small state machine the test drives: draft → (needs_input) → ready → approval →
// confirm → executing → (pendingQuestion) → succeeded | uncertain | failed. Never the real Tuwa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const TUWA_TOOLS = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "tuwa-tools.json"), "utf8")) as { name: string; inputSchema: object; annotations?: object }[];

export interface FakeTask {
  taskId: string;
  args: Record<string, unknown>;
  status: "draft" | "awaiting_confirmation" | "scheduled" | "executing" | "succeeded" | "partial" | "failed" | "canceled" | "uncertain";
  questions: string[]; // needs_input, until answered
  confirmationId?: string;
  personReply?: string;
  pending?: { question: string; token: string; kind?: string; options?: string[] };
  replies: Record<string, unknown>[];
  durationSec?: number;
  result?: Record<string, unknown>;
}

export interface FakeTuwa {
  url: string; // the MCP URL (…/mcp)
  origin: string;
  calls: { name: string; args: Record<string, unknown> }[];
  tasks: Map<string, FakeTask>;
  userAgents: string[];
  settings: Record<string, unknown>;
  /** The owner approves the device login on their phone (the next token poll succeeds). */
  approve(): void;
  deny(): void;
  /** Rotate the access token (the old one answers 401 from now on; refresh gives the new one). */
  expireAccess(): void;
  access(): string;
  refresh(): string;
  /** Next draft answers needs_input with these questions. */
  askOnDraft(qs: string[]): void;
  /** confirm answers this gate instead of dialing. */
  gate(g: "payment_method_required" | "prepaid_balance_low" | undefined): void;
  /**
   * D208: the next confirm answers an error. placed: it dialed anyway (the error came after);
   * stale: it didn't (the confirmation expired; the draft still awaits its yes). blind: status
   * answers errors too, so nobody can tell.
   */
  failConfirm(how: "placed" | "stale" | "blind" | undefined): void;
  /** Drive a task (the line). */
  set(taskId: string, patch: Partial<FakeTask>): void;
  last(): FakeTask | undefined;
  stop(): void;
}

export function fakeTuwa(opts: { pendingPolls?: number; registration?: "needs_redirect" | "off" } = {}): FakeTuwa {
  const calls: FakeTuwa["calls"] = [];
  const tasks = new Map<string, FakeTask>();
  const userAgents: string[] = [];
  const settings: Record<string, unknown> = { voiceSampling: "on", agentName: "Tuwa", voice: { personal: null } };
  let approved: boolean | undefined;
  let polls = 0;
  let n = 0;
  let access = "at_1";
  let refresh = "rt_1";
  let ask: string[] | undefined;
  let gate: string | undefined;
  let failConfirm: "placed" | "stale" | "blind" | undefined;
  let blind = false;
  let origin = "";
  const text = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o) }], structuredContent: o as Record<string, unknown> });

  const run = (name: string, a: Record<string, unknown>): Record<string, unknown> => {
    const t = tasks.get(String(a.taskId ?? ""));
    switch (name) {
      case "tuwa_call_draft": {
        const taskId = `T${++n}`;
        const task: FakeTask = { taskId, args: a, status: "draft", questions: ask ?? [], replies: [] };
        ask = undefined;
        tasks.set(taskId, task);
        return task.questions.length ? { status: "needs_input", taskId, questions: task.questions } : { status: "ready", taskId };
      }
      case "tuwa_call_answer":
        if (!t) return { status: "error", error: "unknown task" };
        t.questions = [];
        t.args = { ...t.args, answers: a.answers };
        return { status: "ready", taskId: t.taskId };
      case "tuwa_call_request_approval":
        if (!t) return { status: "error", error: "unknown task" };
        t.status = "awaiting_confirmation";
        t.confirmationId = `C${t.taskId}`;
        // Shaped like the summary Tuwa showed the author on 2026-11-11 (one "Label: value" a line).
        return {
          status: "confirm_in_chat",
          confirmationId: t.confirmationId,
          summary: [
            `To: ${String(t.args.recipientName)} (${String(t.args.to)})`,
            `Goal: ${String(t.args.goal)}`,
            `May tell them: ${((t.args.shareable as string[]) ?? []).join(", ") || "nothing"}`,
            `Scope: this call only; private guidance ${t.args.privateGuidance ? "given" : "none"}`,
            `Must not: ${((t.args.mustNot as string[]) ?? []).length} rules`,
            `When in UTC: ${t.args.scheduledAt ? String(t.args.scheduledAt) : "right after approval"}`,
            "Calling from: a Tuwa number",
          ].join("\n"),
        };
      case "tuwa_confirm": {
        const task = [...tasks.values()].find((x) => x.confirmationId === a.confirmationId);
        if (task && failConfirm) {
          const how = failConfirm;
          failConfirm = undefined;
          if (how === "placed") (task.personReply = String(a.personReply)), (task.status = task.args.scheduledAt ? "scheduled" : "executing");
          if (how === "stale") task.confirmationId = `${task.confirmationId}x`;
          if (how === "blind") blind = true;
          return { status: "error", error: "upstream timeout" };
        }
        if (task) {
          if (gate) return { status: gate, ...(gate === "payment_method_required" ? { setupUrl: "https://checkout.stripe.com/fake" } : {}) };
          if (a.decision !== "approve") return (task.status = "canceled"), { status: "declined" };
          task.personReply = String(a.personReply);
          task.status = task.args.scheduledAt ? "scheduled" : "executing";
          return { status: task.status, taskId: task.taskId };
        }
        if (String(a.confirmationId).startsWith("CV")) return { status: "applied" };
        if (String(a.confirmationId).startsWith("CL")) return { status: "applied" };
        return { status: "error", error: "unknown confirmation" };
      }
      case "tuwa_call_status":
        if (blind) return { status: "error", error: "upstream timeout" };
        if (!t) return { status: "error", error: "unknown task" };
        return { taskId: t.taskId, status: t.status, finished: ["succeeded", "partial", "failed", "canceled", "uncertain"].includes(t.status), ...(t.durationSec ? { durationSec: t.durationSec } : {}), ...(t.pending ? { pendingQuestion: t.pending } : {}) };
      case "tuwa_call_reply":
        if (!t || !t.pending || t.pending.token !== a.token) return { status: "error", error: "no such question" };
        t.replies.push(a);
        t.pending = undefined;
        return { status: "sent" };
      case "tuwa_call_result":
        if (!t) return { status: "error", error: "unknown task" };
        return { taskId: t.taskId, status: t.status, ...(t.result ?? {}) };
      case "tuwa_call_cancel":
        if (t) t.status = "canceled";
        return { status: "canceled" };
      case "tuwa_spending_limit":
        if (a.dailyLimitCents === undefined) return { dailyLimitCents: settings.dailyLimitCents ?? 5000 };
        if (Number(a.dailyLimitCents) > Number(settings.dailyLimitCents ?? 5000)) return { status: "confirm_in_chat", confirmationId: "CL1", summary: "Raise the limit" };
        settings.dailyLimitCents = a.dailyLimitCents;
        return { status: "applied", dailyLimitCents: a.dailyLimitCents };
      case "tuwa_settings":
        Object.assign(settings, a);
        return { ...settings, summary: "settings" };
      case "tuwa_shared_ai":
        if (a.sync) settings.sharedSync = a.sync;
        return { sync: settings.sharedSync ?? { on: true } };
      case "tuwa_settings_request_change":
        if (a.change === "record_personal_voice") return { status: "ok", recordingUrl: "https://tuwa.ai/record/fake" };
        if (a.change === "use_personal_voice") return (settings.voice as { personal: unknown }).personal ? { status: "confirm_in_chat", confirmationId: "CV1", summary: "Use your voice" } : { status: "no_personal_voice" };
        if (a.change === "delete_voice_data") return { status: "confirm_in_chat", confirmationId: "CV2", summary: "Delete your voice" };
        return { status: "error", error: "unknown change" };
      case "tuwa_balance":
        return { prepaidMinutes: 10 };
      default:
        return { status: "ok" };
    }
  };

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const u = new URL(req.url);
      userAgents.push(req.headers.get("user-agent") ?? "");
      // Cloudflare in front of the real one refuses default agents (error 1010).
      if (!/^Ducter\//.test(req.headers.get("user-agent") ?? "")) return new Response("error code: 1010", { status: 403 });
      const form = async () => Object.fromEntries(new URLSearchParams(await req.text()));
      if (u.pathname === "/.well-known/oauth-protected-resource/mcp" || u.pathname === "/.well-known/oauth-protected-resource")
        return Response.json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["tuwa.calls"], bearer_methods_supported: ["header"], resource_name: "Tuwa phone calls" });
      if (u.pathname === "/.well-known/oauth-authorization-server")
        return Response.json({ issuer: origin, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`, revocation_endpoint: `${origin}/oauth/revoke`, device_authorization_endpoint: `${origin}/oauth/device_authorization`, grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"], token_endpoint_auth_methods_supported: ["none"] });
      if (u.pathname === "/oauth/register") {
        const j = (await req.json()) as { redirect_uris?: string[] };
        if (opts.registration === "off" || !j.redirect_uris?.length) return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
        return Response.json({ client_id: "cli_registered" }, { status: 201 });
      }
      if (u.pathname === "/oauth/device_authorization") {
        const f = await form();
        calls.push({ name: "device_authorization", args: f });
        return Response.json({ device_code: "dc_1", user_code: "WXYZ-2345", verification_uri: `${origin}/oauth/device`, verification_uri_complete: `${origin}/oauth/device?user_code=WXYZ-2345`, expires_in: 900, interval: 1, ...(f.client_id ? {} : { client_id: "cli_from_device" }) });
      }
      if (u.pathname === "/oauth/token") {
        const f = await form();
        calls.push({ name: "token", args: f });
        if (f.grant_type === "refresh_token") return f.refresh_token === refresh ? Response.json({ access_token: access, refresh_token: refresh, expires_in: 3600 }) : Response.json({ error: "invalid_grant" }, { status: 400 });
        if (approved === false) return Response.json({ error: "access_denied" }, { status: 400 });
        polls++;
        if (!approved) return Response.json({ error: polls === 2 ? "slow_down" : "authorization_pending" }, { status: 400 });
        return Response.json({ access_token: access, refresh_token: refresh, expires_in: 3600, token_type: "Bearer" });
      }
      if (u.pathname === "/oauth/revoke") return new Response(null, { status: 200 });
      if (u.pathname !== "/mcp") return new Response("not found", { status: 404 });
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${access}`) return Response.json({ error: "invalid_token" }, { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", error="invalid_token"` } });
      if (req.method !== "POST") return new Response(null, { status: 405 });
      const s = new Server({ name: "tuwa-fake", version: "1" }, { capabilities: { tools: {} } });
      s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TUWA_TOOLS.map((t) => ({ name: t.name, inputSchema: t.inputSchema as never, ...(t.annotations ? { annotations: t.annotations } : {}) })) }));
      s.setRequestHandler(CallToolRequestSchema, async (r) => {
        const args = (r.params.arguments ?? {}) as Record<string, unknown>;
        calls.push({ name: r.params.name, args });
        const out = run(r.params.name, args);
        return { ...text(out), ...(out.status === "error" ? { isError: true } : {}) };
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
  origin = `http://127.0.0.1:${server.port}`;
  void polls;
  return {
    url: `${origin}/mcp`,
    origin,
    calls,
    tasks,
    userAgents,
    settings,
    approve: () => void (approved = true),
    deny: () => void (approved = false),
    expireAccess: () => void (access = `at_${++n + 100}`),
    access: () => access,
    refresh: () => refresh,
    askOnDraft: (qs) => void (ask = qs),
    gate: (g) => void (gate = g),
    failConfirm: (how) => void (failConfirm = how),
    set: (id, patch) => void Object.assign(tasks.get(id)!, patch),
    last: () => [...tasks.values()].at(-1),
    stop: () => void server.stop(true),
  };
}
