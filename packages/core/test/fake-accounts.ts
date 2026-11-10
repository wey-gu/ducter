// A fake source of accounts for D165's tests: what oo, an OpenConnector or another MCP server
// would answer, from a synthetic inbox (fixtures/inbox.ts). It stands in for the broker's
// ConnectionsStore, keeps 自己留意 / 不让 Ducter 看这个 like it, and records every call, so a test
// can show that nothing but reads ever happened.
import type { ConnectionCaller, ConnectionOutcome } from "@ducter/protocol/src/internal.ts";
import type { ConnectionSource, ConnectionView } from "@ducter/protocol";
import type { AppTarget, ConnectionsStore } from "../src/connections.ts";
import { ooOp } from "../src/oo-link.ts";
import { ME, type Fixture } from "./fixtures/inbox.ts";

export interface FakeApp {
  service: string;
  title: string;
  account?: string;
}

export interface FakeCall {
  who: ConnectionCaller["role"];
  connection: string;
  action: string;
  input: Record<string, unknown>;
  account?: string;
}

export function fakeAccounts(fx: Fixture, o: { id?: string; source?: ConnectionSource; name?: string; apps?: FakeApp[]; state?: ConnectionView["state"] } = {}) {
  const id = o.id ?? "conn_oo";
  const apps: FakeApp[] = o.apps ?? [
    { service: "gmail", title: "Gmail", account: ME },
    { service: "googlecalendar", title: "Google Calendar", account: ME },
    { service: "github", title: "GitHub", account: "wey" },
    { service: "discord", title: "Discord", account: "wey" },
  ];
  const calls: FakeCall[] = [];
  const listeners = new Set<() => void>();
  const removers = new Set<(id: string) => void>();
  const flags = new Map<string, { watch?: boolean; excluded?: boolean }>();
  let present = true;
  let state: ConnectionView["state"] = o.state ?? "ok";
  const key = (service: string, account?: string) => `${service}:${account ?? ""}`;

  const after = (input: Record<string, unknown>): number => {
    const q = String(input.query ?? "");
    const m = /after:(\d+)/.exec(q);
    if (m) return Number(m[1]) * 1000;
    if (typeof input.since === "string") return Date.parse(input.since);
    if (typeof input.after === "string") return Date.parse(input.after);
    return 0;
  };

  async function read(who: ConnectionCaller, connection: string, action: string, input: unknown, account?: string): Promise<ConnectionOutcome> {
    const inp = (input ?? {}) as Record<string, unknown>;
    calls.push({ who: who.role, connection, action, input: inp, ...(account ? { account } : {}) });
    if (connection !== id || !present) return { ok: false, error: "No such connection." };
    if (ooOp(action) === "write") return { ok: false, error: "a write outside the Go path", op: "write" };
    const service = action.split(".")[0]!;
    const app = apps.find((a) => a.service === service && (!account || a.account === account));
    if (!app) return { ok: false, error: `unknown action ${action}` };
    if (flags.get(key(service, app.account))?.excluded) return { ok: false, error: "excluded" };
    if (state !== "ok") return { ok: false, error: `${state}` };
    const since = after(inp);
    if (service === "gmail") {
      if (action !== "gmail.search_threads") return { ok: false, error: `unknown action ${action}` };
      const rows = fx.mail.filter((m) => Date.parse(m.date) > since).map((m) => ({ ...m, ...(m.listUnsubscribe ? { headers: [{ name: "List-Unsubscribe", value: "<mailto:u@x>" }] } : {}) }));
      return { ok: true, op: "read", result: { threads: rows } };
    }
    if (/calendar/.test(service)) {
      if (action !== "googlecalendar.list_events") return { ok: false, error: `unknown action ${action}` };
      const lo = Date.parse(String(inp.timeMin ?? "")) || 0;
      const hi = Date.parse(String(inp.timeMax ?? "")) || Infinity;
      return { ok: true, op: "read", result: { items: fx.events.filter((e) => Date.parse(e.start.dateTime) >= lo && Date.parse(e.start.dateTime) <= hi) } };
    }
    if (service === "github") {
      if (action !== "github.list_notifications") return { ok: false, error: `unknown action ${action}` };
      return { ok: true, op: "read", result: fx.github.filter((g) => Date.parse(g.updated_at) > since) };
    }
    if (service === "discord") {
      if (action !== "discord.list_mentions") return { ok: false, error: `unknown action ${action}` };
      return { ok: true, op: "read", result: { messages: fx.chat.filter((c) => Date.parse(c.timestamp) > since) } };
    }
    return { ok: false, error: `unknown action ${action}` };
  }

  const view = (): ConnectionView[] =>
    present
      ? [{ id, name: o.name ?? "oo", url: "oo:", source: o.source ?? "oo", addedAt: "2026-11-09T00:00:00Z", via: "oo", state, apps: apps.map((a) => ({ service: a.service, title: a.title, accounts: a.account ? [a.account] : [] })) }]
      : [];

  const store = {
    view,
    read,
    list: () => [],
    apps(cid: string): AppTarget[] {
      if (cid !== id || !present) return [];
      return apps.map((a) => {
        const f = flags.get(key(a.service, a.account)) ?? {};
        return { connectionId: id, source: o.source ?? "oo", service: a.service, title: a.title, ...(a.account ? { account: a.account, label: a.account } : {}), watch: f.watch ?? true, excluded: f.excluded ?? false };
      });
    },
    setApp(cid: string, service: string, account: string | undefined, patch: { watch?: boolean; excluded?: boolean }) {
      if (cid !== id) return false;
      const k = key(service, account ?? apps.find((a) => a.service === service)?.account);
      flags.set(k, { ...(flags.get(k) ?? {}), ...patch });
      listeners.forEach((f) => f());
      return true;
    },
    onChange(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onRemove(fn: (id: string) => void) {
      removers.add(fn);
      return () => removers.delete(fn);
    },
    oo: () => ({ installed: true, account: true }),
  } as unknown as ConnectionsStore;

  return {
    id,
    store,
    calls,
    fx,
    remove() {
      present = false;
      removers.forEach((f) => f(id));
      listeners.forEach((f) => f());
    },
    setState(s: ConnectionView["state"]) {
      state = s;
    },
    /** What was called that is not a read the broker would let a watcher make. */
    writes: () => calls.filter((c) => ooOp(c.action) === "write"),
  };
}
