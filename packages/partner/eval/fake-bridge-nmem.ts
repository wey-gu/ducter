#!/usr/bin/env bun
// A FAKE `nmem` for the Bridge spike (bridge-live.ts, the partner eval, unit tests): two or more
// local mailboxes in one JSON file, so a real Ducter partner and a real Claude Code session (an
// agent Ducter didn't start) can talk without touching the user's Mem. It implements only the
// Agent-mailbox verbs Ducter uses and mirrors the public help (`bridge setup/contacts/send/inbox/
// open/reply/outbox/inspect/resume`). `contacts` and passive `setup` copy the REAL shapes seen on
// 2026-11-10 (research/37 §6: `cards[]` with `space {id,label,kind}`, `member: "Member <id>"`, `agent`,
// `description`, `contact`, `send_args_prefix`; setup's `identity.custodian_id`). The other verbs'
// shapes are still GUESSES until the live trial.
//
// D205 (nmem 0.10.118, Mem PR #9996): `--version`, passive `bridge setup` with no context (the
// user's places as `candidates[]`, one of them `kind: "personal"`), `bridge connections connect /
// list / revoke` and `bridge session --host H --session-id S prepare`, in the shapes the 0.10.118-rc2
// CLI source prints (research/private/37b). Interfaces only: no Mem source is copied here.
//   NMEM_FAKE_VERSION=0.10.116    an nmem without `bridge connections` (exit 2, as clap does)
//   NMEM_FAKE_REFUSE=<error_code> connect answers Mem's 403 refusal with that registered code
//   NMEM_FAKE_SPACES=none|two     no personal place, or two of them
//   NMEM_FAKE_ARGV_LOG=/path      every call's argv, one JSON line each (tests check the exact argv)
//
//   NMEM_FAKE_BRIDGE_STATE=/path/state.json nmem [--json] --agent-context NAME bridge <verb> ...
//
// Lost responses (J-Q6 tests): NMEM_FAKE_BRIDGE_LOSE="send" (or "reply", or "send,reply") makes the
// next such call keep its operation but answer like a dropped connection (exit 1, no JSON).
// NMEM_FAKE_BRIDGE_LOSE_MODE="pending" keeps it undelivered until `resume`; the default "delivered"
// delivers it and only the answer is lost. Each lose applies once (state.lost counts them).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

interface Msg { id: string; op: string; from: string; to: string; body: string; in_reply_to?: string; created_at: string; read_at?: string; pending?: boolean }
interface Ident { agent: string; member: string; member_id?: string; description: string }
interface Conn { connection_id: string; agent_id: string; identity_birth: string; client_label: string; state: "active" | "revoked"; space_id: string }
interface State { identities: Record<string, Ident>; messages: Msg[]; seq: number; lost?: string[]; connections?: Conn[] }

if (process.env.NMEM_FAKE_ARGV_LOG) appendFileSync(process.env.NMEM_FAKE_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\n");
const VERSION = process.env.NMEM_FAKE_VERSION ?? "0.10.118";
const connects = (() => {
  const [a, b, c] = VERSION.split(/[.-]/).map(Number);
  return a! > 0 || b! > 10 || (b === 10 && c! >= 118);
})();
if (process.argv.includes("--version") || process.argv.includes("-V")) {
  console.log(`nmem ${VERSION}`);
  process.exit(0);
}
const statePath = process.env.NMEM_FAKE_BRIDGE_STATE;
if (!statePath) {
  console.error("NMEM_FAKE_BRIDGE_STATE is not set");
  process.exit(2);
}
const load = (): State => JSON.parse(readFileSync(statePath, "utf8"));
const save = (s: State) => writeFileSync(statePath, JSON.stringify(s, null, 2));

const argv = process.argv.slice(2);
const take = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
argv.splice(0, argv.length, ...argv.filter((a) => a !== "--json" && a !== "-j"));
const ctx = take("--agent-context") ?? process.env.NMEM_AGENT_CONTEXT;
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const fail = (code: string, message: string, exit = 1) => {
  console.error(JSON.stringify({ error: code, message }));
  process.exit(exit);
};

if (argv[0] !== "bridge") fail("bad_arguments", "fake nmem: only `bridge` is implemented", 2);
const verb = argv[1];
if (!verb || verb === "--help" || verb === "help") {
  console.log("fake nmem bridge: setup | contacts [--query Q] | send --to CONTACT (--body TEXT | --body-file -) | inbox | open MESSAGE | reply (--body TEXT | --body-file -) MESSAGE | outbox | inspect OP | resume OP");
  process.exit(0);
}
if (!existsSync(statePath)) fail("not_configured", "no fake Bridge state");
const s = load();
const SPACE = { id: "fake-space", label: "Only me", kind: "personal" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
};
// D205: the verbs that need no context: passive setup without one, connections, a native session.
if (verb === "connections") {
  if (!connects) {
    console.error("error: unrecognized subcommand 'connections'");
    process.exit(2);
  }
  const sub = argv[2];
  if (sub === "--help" || !sub) {
    console.log("See or individually revoke connections representing an Agent\n\nCommands:\n  connect  list  revoke");
    process.exit(0);
  }
  s.connections ??= [];
  if (sub === "connect") {
    const space = flag("--space-id");
    const agent = flag("--agent-id");
    const name = flag("--context") ?? agent;
    if (!space || !agent) fail("bad_arguments", "connect needs --space-id and --agent-id", 2);
    const refuse = process.env.NMEM_FAKE_REFUSE;
    if (refuse) {
      // As the CLI prints a registered Bridge setup refusal under --json (stdout, exit 1).
      console.log(JSON.stringify({ error_code: refuse, detail: `Mem refused (${refuse}).`, outcome_unknown: false, http_status: refuse.endsWith("binding_conflict") ? 409 : 403 }));
      process.exit(1);
    }
    let c = s.connections.find((x) => x.agent_id === agent && x.client_label === name);
    if (c?.state === "revoked") {
      console.log(JSON.stringify({ error_code: "cloud_bridge_setup_connection_revoked", detail: "Retained connection revoked", outcome_unknown: false, http_status: 403 }));
      process.exit(1);
    }
    if (!c) {
      c = { connection_id: uuid(s.connections.length + 1), agent_id: agent!, identity_birth: uuid(900 + s.connections.length), client_label: name!, state: "active", space_id: space! };
      s.connections.push(c);
    }
    s.identities[name!] ??= { agent: agent!, member: "Weyl", member_id: "member-weyl", description: `${agent} (connected)` };
    save(s);
    const { space_id: _sp, ...summary } = c;
    out({
      state: "connected", selected_by: "requested", agent_context: name, connection: summary,
      selection: { scope: { store_id: "ws-1", workspace_id: "ws-1", space_id: space }, address: { agent_id: agent, identity_birth: c.identity_birth } },
      registration_confirmed: true, delivery_ready: null, native_session: null, next_args: [`--agent-context=${name}`, "bridge", "contacts"],
    });
    process.exit(0);
  }
  if (sub === "list") {
    const space = flag("--space-id");
    const agent = flag("--agent-id");
    const list = s.connections.filter((x) => x.space_id === space && (!agent || x.agent_id === agent)).map(({ space_id: _sp, ...c }) => c);
    out({ schema_version: 1, connections: list, next_connection_id: null });
    process.exit(0);
  }
  if (sub === "revoke") {
    const c = s.connections.find((x) => x.connection_id === argv[3]);
    if (!c) fail("bad_arguments", "Use the actual connection ID");
    c!.state = "revoked";
    save(s);
    const { space_id: _sp, ...summary } = c!;
    out({ schema_version: 1, connection: summary });
    process.exit(0);
  }
  fail("bad_arguments", `fake nmem: bridge connections ${sub} is not implemented`, 2);
}
if (verb === "session") {
  const host = flag("--host");
  const session = flag("--session-id");
  if (!host || !session || !argv.includes("prepare")) fail("bad_arguments", "fake nmem: only `bridge session --host H --session-id S prepare`", 2);
  const name = `${host}-${session!.slice(0, 8)}`;
  s.identities[name] ??= { agent: host === "claude-code" ? "terminal-claude" : host!, member: "Weyl", member_id: "member-weyl", description: `${host} session in ~/dev/ducter` };
  save(s);
  out({ schema_version: 1, state: "prepared", contact: `bsc1:${name}`, host, native_session_id: session, context: name, selection: { scope: { space_id: SPACE.id }, address: { agent_id: s.identities[name]!.agent } }, delivery_ready: true, resumed: false });
  process.exit(0);
}
if (verb === "setup" && !ctx) {
  // Passive, no context, no Space: the user's places, none chosen (0.10.116 shape, VERIFIED).
  const which = process.env.NMEM_FAKE_SPACES;
  const personal = (id: string) => ({ id, label: "Only me", kind: "personal", readers: 1, write_default: true });
  const candidates = [
    { id: "fake-default", label: "Before the team", kind: "default", readers: 6, write_default: false },
    { id: "fake-team", label: "dev team", kind: "team", readers: 7, write_default: false },
    ...(which === "none" ? [] : [personal(SPACE.id)]),
    ...(which === "two" ? [personal("fake-space-2")] : []),
  ];
  out({ state: "selection_needed", detail: "Choose the exact Space for Bridge. No identity, credential or mailbox was created.", next: "Choose one of candidates.", candidates, note: "Name the Space explicitly by its id." });
  process.exit(0);
}
if (!ctx || !s.identities[ctx]) fail("agent_context_required", "Use an approved --agent-context.");
const me = ctx!;
const memberId = (name: string) => s.identities[name]!.member_id ?? s.identities[name]!.member;
// As the real CLI shows a member: an id-only label, never a person's name.
const card = (name: string) => ({ space: SPACE, member: `Member ${memberId(name)}`, agent: s.identities[name]!.agent, description: s.identities[name]!.description });
const body = async (): Promise<string> => {
  const inline = take("--body");
  if (inline !== undefined) return inline;
  const f = take("--body-file");
  if (f === "-") return (await new Response(Bun.stdin.stream()).text()).trim();
  if (f) return readFileSync(f, "utf8").trim();
  fail("bad_arguments", "need --body or --body-file");
  return "";
};
const newId = () => `msg-${String(++s.seq).padStart(3, "0")}`;
// A lost answer: the operation is kept (delivered, or pending until resume), the caller hears nothing.
const lose = (kind: "send" | "reply", m: Msg): boolean => {
  const want = (process.env.NMEM_FAKE_BRIDGE_LOSE ?? "").split(",").includes(kind);
  const done = (s.lost ?? []).filter((k) => k === kind).length;
  if (!want || done > 0) return false;
  s.lost = [...(s.lost ?? []), kind];
  if (process.env.NMEM_FAKE_BRIDGE_LOSE_MODE === "pending") m.pending = true;
  return true;
};
const opView = (m: Msg) => ({ operation: m.op, state: m.pending ? "pending" : "sent", message: m.pending ? undefined : m.id, to: card(m.to), ...(m.in_reply_to ? { in_reply_to: m.in_reply_to } : {}), created_at: m.created_at });

switch (verb) {
  case "setup": {
    // Passive inspect only; the fake never enables anything.
    out({ schema_version: 1, state: "ready", space_id: SPACE.id, identity: { custodian_id: memberId(me), agent_id: s.identities[me]!.agent }, registration_confirmed: true, messaging_confirmed: false, receiving_confirmed: false });
    break;
  }
  case "contacts": {
    const q = (take("--query") ?? "").toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const contacts = Object.keys(s.identities)
      .filter((n) => n !== me)
      .filter((n) => !words.length || words.some((w) => `${n} ${s.identities[n]!.agent} ${s.identities[n]!.member} ${s.identities[n]!.description}`.toLowerCase().includes(w)))
      .map((n) => ({ ...card(n), contact: `ct-${n}`, send_args_prefix: ["nmem", "bridge", `--resolved-space-id=${SPACE.id}`, "send", `--to=ct-${n}`] }));
    out({ cards: contacts, spaces: [{ space: SPACE, status: "searched", next_cursor: null }], coverage_scope: "current_space_batch" });
    break;
  }
  case "send":
  case "reply": {
    let to: string;
    let inReplyTo: string | undefined;
    if (verb === "send") {
      to = take("--to")?.replace(/^ct-/, "") ?? "";
      if (!to || !s.identities[to]) fail("unknown_contact", "Use a contact handle from `bridge contacts`.");
    } else {
      const text0 = argv[argv.length - 1];
      const orig = s.messages.find((x) => x.id === text0 && x.to === me);
      if (!orig) fail("not_found", "Reply only to a message in this mailbox.");
      to = orig!.from;
      inReplyTo = orig!.id;
    }
    const text = await body();
    const m: Msg = { id: newId(), op: `op-${s.seq}`, from: me, to, body: text, ...(inReplyTo ? { in_reply_to: inReplyTo } : {}), created_at: new Date().toISOString() };
    s.messages.push(m);
    const lost = lose(verb, m);
    save(s);
    if (lost) {
      console.error("connection reset by peer");
      process.exit(1);
    }
    out({ state: "sent", message: m.id, operation: m.op, ...(inReplyTo ? { in_reply_to: inReplyTo } : {}) });
    break;
  }
  case "inbox": {
    const messages = s.messages.filter((m) => m.to === me && !m.pending).map((m) => ({ message: m.id, ...card(m.from), created_at: m.created_at, read: !!m.read_at, ...(m.in_reply_to ? { in_reply_to: m.in_reply_to } : {}) }));
    const outgoing = s.messages.filter((m) => m.from === me && !m.pending).map((m) => ({ message: m.id, read: !!m.read_at }));
    out({ messages, outgoing });
    break;
  }
  case "open": {
    const m = s.messages.find((x) => x.id === argv[2] && x.to === me && !x.pending);
    if (!m) fail("not_found", "No such message in this mailbox.");
    m!.read_at ??= new Date().toISOString();
    save(s);
    out({ message: { id: m!.id, ...card(m!.from), created_at: m!.created_at, ...(m!.in_reply_to ? { in_reply_to: m!.in_reply_to } : {}) }, body: m!.body });
    break;
  }
  case "outbox": {
    out({ operations: s.messages.filter((m) => m.from === me).slice(-20).reverse().map(opView) });
    break;
  }
  case "inspect": {
    const m = s.messages.find((x) => x.op === argv[2] && x.from === me);
    if (!m) fail("not_found", "No such operation.");
    out({ ...opView(m!), body: m!.body });
    break;
  }
  case "resume": {
    const m = s.messages.find((x) => x.op === argv[2] && x.from === me);
    if (!m) fail("not_found", "No such operation.");
    m!.pending = false; // the same original, never a replacement
    save(s);
    out({ state: "sent", operation: m!.op, message: m!.id });
    break;
  }
  default:
    fail("bad_arguments", `fake nmem: bridge ${verb} is not implemented`, 2);
}
