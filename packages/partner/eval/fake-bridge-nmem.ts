#!/usr/bin/env bun
// A FAKE `nmem` for the Bridge spike (bridge-live.ts): two or more local mailboxes in one JSON
// file, so a real Ducter partner and a real Claude Code session (an agent Ducter didn't start) can
// talk without touching the user's Mem. It implements only the Agent-mailbox verbs Ducter uses and
// mirrors the public help (`bridge contacts/send/inbox/open/reply`); the JSON shapes are GUESSES
// (research/33): replace them with the real ones from the author's live trial.
//
//   FAKE_BRIDGE_STATE=/path/state.json nmem [--json] --agent-context NAME bridge <verb> ...
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface Msg { id: string; from: string; to: string; body: string; in_reply_to?: string; created_at: string; read_at?: string }
interface State { identities: Record<string, { agent: string; member: string; description: string }>; messages: Msg[]; seq: number }

const statePath = process.env.FAKE_BRIDGE_STATE;
if (!statePath) {
  console.error("FAKE_BRIDGE_STATE is not set");
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
  console.log("fake nmem bridge: contacts [--query Q] | send --to CONTACT (--body TEXT | --body-file -) | inbox | open MESSAGE | reply (--body TEXT | --body-file -) MESSAGE");
  process.exit(0);
}
if (!existsSync(statePath)) fail("not_configured", "no fake Bridge state");
const s = load();
if (!ctx || !s.identities[ctx]) fail("agent_context_required", "Use an approved --agent-context.");
const me = ctx!;
const card = (name: string) => ({ agent: { display_name: s.identities[name]!.agent, description: s.identities[name]!.description }, member: { display_name: s.identities[name]!.member } });
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

switch (verb) {
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
  case "send": {
    const to = take("--to")?.replace(/^ct-/, "");
    if (!to || !s.identities[to]) fail("unknown_contact", "Use a contact handle from `bridge contacts`.");
    const m: Msg = { id: newId(), from: me, to: to!, body: await body(), created_at: new Date().toISOString() };
    s.messages.push(m);
    save(s);
    out({ state: "sent", message: m.id });
    break;
  }
  case "inbox": {
    const messages = s.messages.filter((m) => m.to === me).map((m) => ({ message: m.id, ...card(m.from), created_at: m.created_at, read: !!m.read_at, ...(m.in_reply_to ? { in_reply_to: m.in_reply_to } : {}) }));
    const outgoing = s.messages.filter((m) => m.from === me).map((m) => ({ message: m.id, read: !!m.read_at }));
    out({ messages, outgoing });
    break;
  }
  case "open": {
    const m = s.messages.find((x) => x.id === argv[2] && x.to === me);
    if (!m) fail("not_found", "No such message in this mailbox.");
    m!.read_at ??= new Date().toISOString();
    save(s);
    out({ message: { id: m!.id, ...card(m!.from), created_at: m!.created_at, ...(m!.in_reply_to ? { in_reply_to: m!.in_reply_to } : {}) }, body: m!.body });
    break;
  }
  case "reply": {
    const text = await body();
    const orig = s.messages.find((x) => x.id === argv[2] && x.to === me);
    if (!orig) fail("not_found", "Reply only to a message in this mailbox.");
    const m: Msg = { id: newId(), from: me, to: orig!.from, body: text, in_reply_to: orig!.id, created_at: new Date().toISOString() };
    s.messages.push(m);
    save(s);
    out({ state: "sent", message: m.id, in_reply_to: orig!.id });
    break;
  }
  default:
    fail("bad_arguments", `fake nmem: bridge ${verb} is not implemented`, 2);
}
