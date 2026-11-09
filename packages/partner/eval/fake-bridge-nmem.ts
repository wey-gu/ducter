#!/usr/bin/env bun
// A FAKE `nmem` for the Bridge spike (bridge-live.ts, the partner eval, unit tests): two or more
// local mailboxes in one JSON file, so a real Ducter partner and a real Claude Code session (an
// agent Ducter didn't start) can talk without touching the user's Mem. It implements only the
// Agent-mailbox verbs Ducter uses and mirrors the public help (`bridge setup/contacts/send/inbox/
// open/reply/outbox/inspect/resume`); the JSON shapes are GUESSES (research/37): replace them with
// the real ones from the author's live trial.
//
//   NMEM_FAKE_BRIDGE_STATE=/path/state.json nmem [--json] --agent-context NAME bridge <verb> ...
//
// Lost responses (J-Q6 tests): NMEM_FAKE_BRIDGE_LOSE="send" (or "reply", or "send,reply") makes the
// next such call keep its operation but answer like a dropped connection (exit 1, no JSON).
// NMEM_FAKE_BRIDGE_LOSE_MODE="pending" keeps it undelivered until `resume`; the default "delivered"
// delivers it and only the answer is lost. Each lose applies once (state.lost counts them).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface Msg { id: string; op: string; from: string; to: string; body: string; in_reply_to?: string; created_at: string; read_at?: string; pending?: boolean }
interface Ident { agent: string; member: string; member_id?: string; description: string }
interface State { identities: Record<string, Ident>; messages: Msg[]; seq: number; lost?: string[] }

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
if (!ctx || !s.identities[ctx]) fail("agent_context_required", "Use an approved --agent-context.");
const me = ctx!;
const memberOf = (name: string) => ({ display_name: s.identities[name]!.member, ...(s.identities[name]!.member_id ? { id: s.identities[name]!.member_id } : {}) });
const card = (name: string) => ({ agent: { display_name: s.identities[name]!.agent, description: s.identities[name]!.description }, member: memberOf(name) });
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
    out({ state: "ready", readiness_scope: "registration", agent: { display_name: s.identities[me]!.agent }, member: memberOf(me) });
    break;
  }
  case "contacts": {
    const q = (take("--query") ?? "").toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const contacts = Object.keys(s.identities)
      .filter((n) => n !== me)
      .filter((n) => !words.length || words.some((w) => `${n} ${s.identities[n]!.agent} ${s.identities[n]!.member} ${s.identities[n]!.description}`.toLowerCase().includes(w)))
      .map((n) => ({ contact: `ct-${n}`, ...card(n) }));
    out({ space_id: "fake-space", contacts, next_args: [] });
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
