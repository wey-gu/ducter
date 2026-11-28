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
//   NMEM_FAKE_REFUSE=<error_code> connect answers Mem's 403 refusal with that registered code (503 for _unavailable)
//   NMEM_FAKE_SIGNED_OUT=1 · NMEM_FAKE_BACKEND=local   (D225: `status`, `connect <link>`)
//   NMEM_FAKE_SPACES=none|two     no personal place, or two of them
//   NMEM_FAKE_ARGV_LOG=/path      every call's argv, one JSON line each (tests check the exact argv)
//   NMEM_FAKE_FOREIGN=<label,...> D324: connections another login made; revoking one from here is refused
//   (state.connections may hold several, one per home, each with its own client_label = its --context)
//
//   NMEM_FAKE_BRIDGE_STATE=/path/state.json nmem [--json] --agent-context NAME bridge <verb> ...
//
// D249: by default `inbox`, `open`, `contacts`, `send`, `inspect` answer in nmem 0.10.118's shapes as
// seen against Mem Cloud on 2026-11-13 (research/66 §7): `open` names no sender, `reply_to` is the
// message's own handle, cards come as `contacts[]` with `match_state`. `in_reply_to` on a reply is
// INFERRED (the trial's raw output had none). `agents context show --name NAME` answers the saved
// context (Space `personal-<member>` for the user's own place). NMEM_FAKE_SHAPE=named keeps the old,
// richer shape (sender agent and member on `open` and `inbox`) for the partner eval's teammates.
//   NMEM_FAKE_UNREGISTERED=<context>  sends to it answer Mem's 409 "no current registered mailbox"
// D294 (Mem PR #10278, in nmem 0.10.120; interfaces only, research/66 §8, research/134): NMEM_FAKE_SHAPE=presentation
// (the default once NMEM_FAKE_VERSION is 0.10.120 or later, D364)
// adds `sender: {actor_id, member, agent, agent_id}` and `in_reply_to` (null on an original) to `inbox`
// messages and `open`, and `agent_id` + `mailbox_available` to contact cards (an unregistered one has
// `send_args_prefix: null`). NMEM_FAKE_SENDER_MEMBER=<label> replaces `sender.member` (a display name).
//   NMEM_FAKE_BUSY=<verb>[:n][:unknown]  the first n (default 1) calls of that verb answer Mem's 503
//   (`retryable: true`, `outcome_unknown: false`, or true with ":unknown"), exit 1, nothing done.
// D335: NMEM_FAKE_INBOX_WAIT=1 lists `--wait <SECONDS>` in `bridge inbox --help` and holds `inbox --wait`
// until an unread message is there for that context (its Space; every Space with --all-spaces);
// =error answers every wait with a 503-like failure, =error:<ctx>[,<ctx>] only those contexts'.
// D656: NMEM_FAKE_FOLLOW=1 lists `bridge follow` in `bridge follow --help` and answers it with the
// shape this branch reads (INFERRED; no real answer has been read): {operation, state, replies:
// [{message, in_reply_to, body, sender, created_at}]}. NMEM_FAKE_FOLLOW_SHAPE=other answers some other
// shape with no reply bodies, so the client must fall back to the inbox and still deliver the answer.
// D338 (nmem 0.10.120 on the author's home, VERIFIED 2026-11-17): NMEM_FAKE_SELECT_404=<space>[,<space>]
// answers `agents context select` in those Spaces with HTTP 404 and an unverifiable body (no JSON,
// no error_code), exit 1, nothing saved: the identity is a contact there but can't be selected.
//
// Lost responses (J-Q6 tests): NMEM_FAKE_BRIDGE_LOSE="send" (or "reply", or "send,reply") makes the
// next such call keep its operation but answer like a dropped connection (exit 1, no JSON).
// NMEM_FAKE_BRIDGE_LOSE_MODE="pending" keeps it undelivered until `resume`; the default "delivered"
// delivers it and only the answer is lost. Each lose applies once (state.lost counts them).
//
// D334 (Spaces; interfaces from nmem 0.10.119's help, the answers' shapes are GUESSES): a context is
// (identity, one exact Space). `state.spaces` lists the person's Spaces (passive `setup` offers them
// as candidates); an identity's `space` is its context's Space (default the personal one); a message's
// `space` is where it was sent (default its recipient context's). `inbox` reads only its context's
// Space, `open` and `reply` only a message there; `send --to` takes a card's handle from the sender's
// own Space (`ct-<ctx>` or, for an agent in `state.everywhere`, `ct-<ctx>@<space id>`), else
// `space_mismatch`. `contacts --all-spaces` returns cards from every Space, each naming its Space
// (`space {id,label,kind}`, `resolved_space_id`); an agent in `state.everywhere` has a card in every
// Space. `agents context select --name N --agent-id A --space-id S` makes a local context when some
// context already speaks as A (NMEM_FAKE_SELECT_REFUSE=<space id,...> answers Mem's refusal there).
// D367 (nmem 0.10.120 against Mem Cloud, VERIFIED 2026-11-18, research/137): `inbox` answers at most
// 20 messages a page, oldest first, opened ones included, with `next` a cursor for `--cursor` (a new
// opaque string on every call) and "" on the last page. NMEM_FAKE_INBOX_PAGE=<n> changes the 20.
// The `named` shape stays one page with no `next` (an older answer, which Ducter still reads).
//   NMEM_FAKE_WIDE=1   Mem #10402: `bridge inbox --help` offers `--all-spaces`, and `inbox --all-spaces`
//                      reads the identity's messages in every Space (each with `space_id`).
// D400 (nmem 0.10.121, research/161; help VERIFIED, answer shapes GUESSED from its strings): at
// NMEM_FAKE_VERSION=0.10.121 or later (or NMEM_FAKE_IDENTITY=1) the plain `inbox` is the identity
// inbox: "List incoming identity mail across currently authorized Spaces", every Space's mail for the
// context's identity, each entry with `space {id,label,kind}`, `space_id`, `open_args` and
// `reply_args_prefix` (Mem's argv, written `--agent-context=<ctx>`); no `--all-spaces` (clap's plain
// "unexpected argument", exit 2); `--wait` takes 1..=5 (else `bad_arguments`, "25 is not in 1..=5");
// `--watch` prints one JSON line whenever new unread mail is there and runs until killed.
//   NMEM_FAKE_UNAPPROVED=<ctx>[,<ctx>]  inbox answers the plain text "error: Select your approved Agent
//                                       Context for the identity inbox" (exit 1, no JSON even under --json)
//   NMEM_FAKE_CURSOR_STALE=1            the first `--cursor` read answers "Identity inbox cursor no longer
//                                       matches this Context or Space roster; restart the inbox" (once)
//   NMEM_FAKE_WATCH=exit                every `--watch` exits at once with Mem's 503
//   NMEM_FAKE_LATENCY=<verb>:<ms>,...   D409: that verb answers only after <ms> (Mem Cloud's pace, 2026-11-20)
// `contacts` without a Space selector groups one `identity_contact` card per identity (no Space; a send
// resolves it in the sender's Space); `--all-spaces` keeps the per-Space view. `connections connect`
// takes `--device-label` (kept on the connection); before 0.10.121 it is an unexpected argument.
// `bridge notices status` (local): NMEM_FAKE_NOTICES=on lists a subscription for the context's identity
// with the OS channel on; else none. Before 0.10.121 `notices` is an unrecognized subcommand.
// D559 (the live T1, 2026-11-25, VERIFIED): a native session's identity (`native: "<host>"`, made by
// `bridge session ... prepare`) is in no `contacts` answer, and its mail names it as Mem does: `sender.agent`
// "Bridge agent" with `sender.host` its host. It is reached only by a reply on a message it sent.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

interface Msg { id: string; op: string; from: string; to: string; body: string; in_reply_to?: string; created_at: string; read_at?: string; pending?: boolean; space?: string }
interface Ident { agent: string; member: string; member_id?: string; description: string; space?: string; native?: string }
interface Space { id: string; label: string; kind: string }
interface Conn { connection_id: string; agent_id: string; identity_birth: string; client_label: string; state: "active" | "revoked"; space_id: string; device_label?: string }
interface State { identities: Record<string, Ident>; messages: Msg[]; seq: number; lost?: string[]; staled?: boolean; connections?: Conn[]; retained?: Record<string, { to: string; body: string }>; busy?: Record<string, number>; agents?: Record<string, { name: string; source_app: string; description?: string }>; spaces?: Space[]; everywhere?: string[] }

if (process.env.NMEM_FAKE_ARGV_LOG) appendFileSync(process.env.NMEM_FAKE_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\n");
const VERSION = process.env.NMEM_FAKE_VERSION ?? "0.10.118";
const connects = (() => {
  const [a, b, c] = VERSION.split(/[.-]/).map(Number);
  return a! > 0 || b! > 10 || (b === 10 && c! >= 118);
})();
// D400: nmem 0.10.121's identity inbox, notices and device labels.
const IDENT = process.env.NMEM_FAKE_IDENTITY === "1" || (() => {
  const [a, b, c] = VERSION.split(/[.-]/).map(Number);
  return a! > 0 || b! > 10 || (b === 10 && c! >= 121);
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
// D400: Mem's own argv carries `--api-url=<its server>`; the fake has no server to point at.
argv.splice(0, argv.length, ...argv.filter((a) => !a.startsWith("--api-url=")));
// D400: a `bm1:` reference (the identity inbox's) names its message.
const unref = (a: string | undefined): string | undefined => {
  if (!a?.startsWith("bm1:")) return a;
  try {
    return JSON.parse(Buffer.from(a.slice(4), "base64url").toString()).message;
  } catch {
    return a;
  }
};
// Both forms parse, as in the real CLI (D369): `--agent-context x` and `--agent-context=x` (Mem's own argv).
const ctxEq = argv.findIndex((a) => a.startsWith("--agent-context="));
const ctx = (ctxEq >= 0 ? argv.splice(ctxEq, 1)[0]!.slice("--agent-context=".length) : undefined) ?? take("--agent-context") ?? process.env.NMEM_AGENT_CONTEXT;
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const fail = (code: string, message: string, exit = 1) => {
  console.error(JSON.stringify({ error: code, message }));
  process.exit(exit);
};

// D225: `status` (signed in?) and `connect <link>` (the sign-in). NMEM_FAKE_SIGNED_OUT=1: not signed
// in until a connect; NMEM_FAKE_BACKEND=local: Mem answers from this computer; a link containing
// "used" answers Mem's 410.
const signedFile = `${statePath}.signed-in`;
if (argv[0] === "status") {
  if (process.env.NMEM_FAKE_SIGNED_OUT === "1" && !existsSync(signedFile)) {
    console.log(JSON.stringify({ status: "error", error: "unreachable", api_url: "http://127.0.0.1:14242" }));
    process.exit(1);
  }
  out({ status: "healthy", cli_version: VERSION, mode: "remote", backend: process.env.NMEM_FAKE_BACKEND ?? "cloud" });
  process.exit(0);
}
if (argv[0] === "connect") {
  const link = argv.filter((a) => !a.startsWith("--"))[1] ?? "";
  if (/used/.test(link)) {
    console.error("Error: redeem failed: 410 Gone (the link was used, expired or never valid)");
    process.exit(1);
  }
  writeFileSync(signedFile, "1");
  out({ ok: true, server: "https://cloud.example", workspace: "fake", key: "nmem_ck_…0000" });
  process.exit(0);
}
if (process.env.NMEM_FAKE_SIGNED_OUT === "1" && !existsSync(signedFile)) fail("unreachable", "fake nmem: not signed in", 1);
const NAMED = process.env.NMEM_FAKE_SHAPE === "named";
// D364: nmem 0.10.120 is the first CLI that asks Mem for #10278's representation (VERIFIED in its
// binary, research/134), so a fake at 0.10.120+ answers in it unless NMEM_FAKE_SHAPE says otherwise
// (NMEM_FAKE_SHAPE=released keeps 0.10.118/0.10.119's bare shape at any version).
const presentsSince = (() => {
  const [a, b, c] = VERSION.split(/[.-]/).map(Number);
  return a! > 0 || b! > 10 || (b === 10 && c! >= 120);
})();
const PRESENT = process.env.NMEM_FAKE_SHAPE === "presentation" || (!process.env.NMEM_FAKE_SHAPE && presentsSince);
if (argv[0] === "agents" && argv[1] === "context" && argv[2] === "show") {
  // Local read of a saved context (0.10.118 shape): its custodian and exact Space.
  const name = argv[argv.indexOf("--name") + 1] ?? "";
  const st: State | undefined = existsSync(statePath) ? load() : undefined;
  const id = st?.identities[name];
  if (!id) {
    out({ state: "selection_required", configured: false, name });
    process.exit(0);
  }
  const member = id.member_id ?? id.member;
  const space = id.space ?? st!.connections?.find((c) => c.client_label === name)?.space_id ?? `personal-${member}`;
  out({ state: "unverified", configured: true, validation: "unverified", reason: "live_validation_required", name, revision: "rev-1", selection: { scope: { space_id: space }, address: { custodian_id: member, agent_id: id.agent } } });
  process.exit(0);
}
// D334: `agents context select`: a local context for an existing identity in one exact Space.
if (argv[0] === "agents" && argv[1] === "context" && argv[2] === "select") {
  const st: State = existsSync(statePath) ? load() : { identities: {}, messages: [], seq: 0 };
  const val = (f: string) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : undefined);
  const name = val("--name") ?? "";
  const agent = val("--agent-id") ?? "";
  const space = val("--space-id") ?? "";
  if (!name || !agent || !space) fail("bad_arguments", "select needs --name, --agent-id and --space-id", 2);
  if (st.identities[name] && !argv.includes("--expected-revision")) fail("revision_required", "A context by that name exists: pass --expected-revision.");
  if ((process.env.NMEM_FAKE_SELECT_404 ?? "").split(",").includes(space)) {
    console.error("error: Bridge request failed: HTTP 404 Not Found (response body could not be verified)");
    process.exit(1);
  }
  if ((process.env.NMEM_FAKE_SELECT_REFUSE ?? "").split(",").includes(space)) {
    console.log(JSON.stringify({ error_code: "cloud_bridge_setup_role_attachment_mismatch", detail: "This identity can't be selected in that Space.", outcome_unknown: false, http_status: 403 }));
    process.exit(1);
  }
  const like = Object.values(st.identities).find((i) => i.agent === agent);
  if (!like) fail("not_found", `No connection represents ${agent} here.`);
  st.identities[name] = { ...like!, space };
  save(st);
  out({ state: "selected", name, revision: "rev-1", selection: { scope: { space_id: space }, address: { custodian_id: like!.member_id ?? like!.member, agent_id: agent } } });
  process.exit(0);
}
// D324: the trial's own throwaway identity (bridge-trial.ts): enroll, clear its local context, delete it.
// Interfaces as nmem 0.10.119's help prints them (`agents enroll <ID> --name --source-app`,
// `agents context clear --name --expected-revision`, `agents delete <ID> --yes`); the answers are GUESSES.
if (argv[0] === "agents" && (argv[1] === "enroll" || argv[1] === "delete" || (argv[1] === "context" && argv[2] === "clear"))) {
  const st: State = existsSync(statePath) ? load() : { identities: {}, messages: [], seq: 0 };
  st.agents ??= {};
  if (argv[1] === "enroll") {
    const id = argv[2] ?? "";
    if (!id || id.startsWith("-")) fail("bad_arguments", "enroll needs an ID", 2);
    if (st.agents[id]) fail("agent_exists", `Agent ${id} already exists`);
    const i = argv.indexOf("--name");
    st.agents[id] = { name: i >= 0 ? argv[i + 1]! : id, source_app: argv[argv.indexOf("--source-app") + 1] ?? "" };
    save(st);
    out({ agent: { id, display_name: st.agents[id]!.name }, created: true });
  } else if (argv[1] === "delete") {
    const id = argv[2] ?? "";
    if (!st.agents[id]) fail("not_found", `Agent ${id} not found`);
    if (!argv.includes("--yes") && !argv.includes("-y")) fail("confirmation_required", "pass --yes", 2);
    delete st.agents[id];
    save(st);
    out({ deleted: true, id });
  } else {
    const name = argv[argv.indexOf("--name") + 1] ?? "";
    if (argv[argv.indexOf("--expected-revision") + 1] !== "rev-1") fail("revision_mismatch", "Read the context again.");
    if (!st.identities[name]) fail("not_found", `context ${name} not found`);
    delete st.identities[name];
    save(st);
    out({ cleared: true, name });
  }
  process.exit(0);
}
// D333: an Agent's public profile (`agents show <ID>`, `agents set <ID> --description …`, nmem
// 0.10.119's help); the answers' shape follows mem-identity.ts's reader (`{agent: {…}}`), a GUESS.
if (argv[0] === "agents" && (argv[1] === "show" || argv[1] === "set")) {
  const st: State = existsSync(statePath) ? load() : { identities: {}, messages: [], seq: 0 };
  const id = argv[2] ?? "";
  const a = st.agents?.[id];
  if (!a) fail("not_found", `Agent ${id} not found`);
  if (argv[1] === "set") {
    const i = argv.indexOf("--description");
    if (i >= 0) a!.description = argv[i + 1] ?? "";
    save(st);
  }
  out({ agent: { id, display_name: a!.name, source_app: a!.source_app, ...(a!.description !== undefined ? { description: a!.description } : {}) } });
  process.exit(0);
}
if (argv[0] !== "bridge") fail("bad_arguments", "fake nmem: only `bridge` is implemented", 2);
const verb = argv[1];
if (!verb || verb === "--help" || verb === "help") {
  console.log("fake nmem bridge: setup | contacts [--query Q] | send --to CONTACT (--body TEXT | --body-file -) | inbox | open MESSAGE | reply (--body TEXT | --body-file -) MESSAGE | outbox | inspect OP | resume OP | follow OPERATION");
  process.exit(0);
}
// D335: an nmem whose `inbox` takes `--wait` (NMEM_FAKE_INBOX_WAIT=1; =error: every wait fails;
// =error:<context>[,<context>]: only those contexts' waits fail, the others hold as with =1).
const WAITS = process.env.NMEM_FAKE_INBOX_WAIT;
// D656: an nmem whose `bridge follow --help` lists follow (the branch's capability check).
const FOLLOW = process.env.NMEM_FAKE_FOLLOW === "1";
if (verb === "follow" && (argv.includes("--help") || argv.includes("-h"))) {
  if (!FOLLOW) fail("bad_arguments", "fake nmem: bridge follow is not implemented", 2);
  console.log(`Follow one original in its exact Space without opening or acknowledging mail\n\nUsage: nmem bridge follow [OPTIONS] <OPERATION>\n\nArguments:\n  <OPERATION>  \n\nOptions:\n      --wait <WAIT>                Bound the entire observation in seconds (default: one scan, at most 30s)\n  -j, --json                       Emit raw JSON instead of human-readable output\n      --max-pages <MAX_PAGES>      Total inbox page budget, including repeat scans while waiting [default: 5]\n      --agent-context <NAME>       Reuse a named local agent context for mailbox or collaboration hints\n  -h, --help                       Print help`);
  process.exit(0);
}
if (verb === "inbox" && (argv.includes("--help") || argv.includes("-h")) && IDENT) {
  // nmem 0.10.121's own words (VERIFIED, research/161).
  console.log(`List incoming identity mail across currently authorized Spaces\n\nUsage: nmem bridge inbox [OPTIONS]\n\nOptions:\n      --cursor <CURSOR>       \n  -j, --json                  Emit raw JSON instead of human-readable output\n      --wait <WAIT>           Wait up to five seconds for an incoming change, without consuming mail\n      --agent-context <NAME>  Reuse a named local agent context\n      --watch                 Observe incoming changes continuously as JSON lines; never acknowledges mail\n  -h, --help                  Print help`);
  process.exit(0);
}
if (verb === "inbox" && (argv.includes("--help") || argv.includes("-h"))) {
  console.log(`List incoming messages and automatically refresh outgoing read status\n\nUsage: nmem bridge inbox [OPTIONS]\n\nOptions:\n      --cursor <CURSOR>\n${process.env.NMEM_FAKE_WIDE === "1" ? "      --all-spaces            Read this identity's messages in every Space\n" : ""}${WAITS ? "      --wait <SECONDS>        Hold until a message arrives, at most this long\n" : ""}  -j, --json\n      --agent-context <NAME>`);
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
  if (sub === "connect" && argv.includes("--help")) {
    console.log(`Represent an existing role using this login; save a logical Context\n\nUsage: nmem bridge connections connect [OPTIONS] --space-id <SPACE_ID> --agent-id <AGENT_ID>\n\nOptions:\n      --space-id <SPACE_ID>\n      --agent-id <AGENT_ID>\n  -j, --json\n      --context <CONTEXT>            Convenience name, defaulting to the requested role; never an identity\n${IDENT ? "      --device-label <DEVICE_LABEL>  Optional device label; the home identifier remains private and stable\n" : ""}  -h, --help`);
    process.exit(0);
  }
  if (sub === "connect" && !IDENT && argv.some((a) => a === "--device-label" || a.startsWith("--device-label="))) {
    console.error("error: unexpected argument '--device-label' found");
    process.exit(2);
  }
  if (sub === "connect") {
    const space = flag("--space-id");
    const agent = flag("--agent-id");
    const name = flag("--context") ?? agent;
    if (!space || !agent) fail("bad_arguments", "connect needs --space-id and --agent-id", 2);
    const refuse = process.env.NMEM_FAKE_REFUSE;
    if (refuse) {
      // As the CLI prints a registered Bridge setup refusal under --json (stdout, exit 1).
      // nmem 0.10.118 against a Cloud that can't take it (research/66 §3): 503, outcome unknown,
      // an agent-facing warning on stderr.
      const down = /_(unavailable|busy|capacity|outcome_unknown)$/.test(refuse);
      if (down) console.error("Warning: Nowledge Bridge cannot be prepared with this connection. Stop trying Bridge commands or registering another identity.");
      console.log(JSON.stringify({ error_code: refuse, detail: down ? "Bridge setup is unavailable. Stop and keep the current connection; do not mint another key or try another backend." : `Mem refused (${refuse}).`, retryable: false, outcome_unknown: down, http_status: down ? 503 : refuse.endsWith("binding_conflict") ? 409 : 403 }));
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
    const device = flag("--device-label");
    if (device) c.device_label = device;
    s.identities[name!] ??= { agent: agent!, member: "Weyl", member_id: "member-weyl", description: `${agent} (connected)`, ...(space !== SPACE.id ? { space: space! } : {}) };
    save(s);
    const { space_id: _sp, ...summary } = c;
    out({
      state: "connected", selected_by: "requested", agent_context: name, connection: summary,
      selection: { scope: { store_id: "ws-1", workspace_id: "ws-1", space_id: space }, address: { agent_id: agent, identity_birth: c.identity_birth } },
      registration_confirmed: true, delivery_ready: null, native_session: null, next_args: [`--agent-context=${name}`, "bridge", "contacts"],
    });
    process.exit(0);
  }
  // D433, D461 (research/200, VERIFIED live on 0.10.121): `list --include-activity` answers `schema_version: 2`
  // with `activity_available` once for the list and, per connection, `created_at_ms`, `last_seen_at_ms` (null
  // until seen), `home_id` and `device_label` (null). NMEM_FAKE_SEEN="<label>=<ms>,…" sets the last-seen times.
  if (sub === "list" && argv.includes("--help")) {
    console.log(`Read one bounded page in an exact Space; follow the returned cursor\n\nUsage: nmem bridge connections list [OPTIONS] --space-id <SPACE_ID>\n\nOptions:\n      --space-id <SPACE_ID>\n      --agent-id <AGENT_ID>\n  -j, --json\n      --after-connection-id <AFTER_CONNECTION_ID>\n${IDENT ? "      --include-activity\n          Include advisory device activity in the version two JSON presentation\n" : ""}  -h, --help`);
    process.exit(0);
  }
  if (sub === "list") {
    const space = flag("--space-id");
    const agent = flag("--agent-id");
    const seen = new Map((process.env.NMEM_FAKE_SEEN ?? "").split(",").filter(Boolean).map((kv) => [kv.slice(0, kv.lastIndexOf("=")), Number(kv.slice(kv.lastIndexOf("=") + 1))] as const));
    const withActivity = IDENT && argv.includes("--include-activity");
    const list = s.connections
      .filter((x) => x.space_id === space && (!agent || x.agent_id === agent))
      .map(({ space_id: _sp, ...c }) => (withActivity ? { ...c, created_at_ms: 1, last_seen_at_ms: seen.get(c.client_label) ?? null, home_id: null, device_label: null } : c));
    out(withActivity ? { schema_version: 2, connections: list, next_connection_id: null, outcome_unknown: false, metadata_available: true, activity_available: true } : { schema_version: 1, connections: list, next_connection_id: null });
    process.exit(0);
  }
  if (sub === "revoke") {
    const c = s.connections.find((x) => x.connection_id === argv[3]);
    if (!c) fail("bad_arguments", "Use the actual connection ID");
    // D324: "Revoke one own connection": one another login made (NMEM_FAKE_FOREIGN lists its labels) is refused.
    if ((process.env.NMEM_FAKE_FOREIGN ?? "").split(",").includes(c!.client_label)) {
      console.log(JSON.stringify({ error_code: "cloud_bridge_setup_role_control_denied", detail: "Only the login that made a connection can revoke it.", outcome_unknown: false, http_status: 403 }));
      process.exit(1);
    }
    c!.state = "revoked";
    save(s);
    const { space_id: _sp, ...summary } = c!;
    out({ schema_version: 1, connection: summary });
    process.exit(0);
  }
  fail("bad_arguments", `fake nmem: bridge connections ${sub} is not implemented`, 2);
}
// D400: `bridge notices` (nmem 0.10.121): only `status`, local, read-only. The answer's shape is a GUESS.
if (verb === "notices") {
  if (!IDENT) {
    console.error("error: unrecognized subcommand 'notices'");
    process.exit(2);
  }
  if (argv.includes("--help") || !argv[2]) {
    console.log("Observe approved mailbox subscriptions locally; never starts an agent\n\nUsage: nmem bridge notices [OPTIONS] <COMMAND>\n\nCommands:\n  reset        Explicitly forget this device's notice attempts; current mail may remind again\n  watch        Run the foreground device observer for approved subscriptions\n  unsubscribe  Remove only this ended host session's local subscriptions and hints\n  status       Inspect bounded local configuration without a backend request\n  subscribe    Subscribe an actual host session using the existing approved Context\n  help         Print this message or the help of the given subcommand(s)");
    process.exit(0);
  }
  if (argv[2] !== "status") fail("bad_arguments", `fake nmem: bridge notices ${argv[2]} is not implemented`, 2);
  const agent = ctx ? s.identities[ctx]?.agent : undefined;
  const on = process.env.NMEM_FAKE_NOTICES === "on" && agent;
  out({ schema_version: 1, observer: { observing: false }, subscriptions: on ? [{ target: { agent_id: agent, context: ctx }, channels: ["hooks", "os"], identity_mail: "chooser" }] : [] });
  process.exit(0);
}
if (verb === "session") {
  const host = flag("--host");
  const session = flag("--session-id");
  if (!host || !session || !argv.includes("prepare")) fail("bad_arguments", "fake nmem: only `bridge session --host H --session-id S prepare`", 2);
  const name = `${host}-${session!.slice(0, 8)}`;
  s.identities[name] ??= { agent: host === "claude-code" ? "terminal-claude" : host!, member: "Weyl", member_id: "member-weyl", description: `${host} session in ~/dev/ducter`, native: host! };
  save(s);
  out({ schema_version: 1, state: "prepared", contact: `bsc1:${name}`, host, native_session_id: session, context: name, selection: { scope: { space_id: SPACE.id }, address: { agent_id: s.identities[name]!.agent } }, delivery_ready: true, resumed: false });
  process.exit(0);
}
if (verb === "setup" && !ctx) {
  // Passive, no context, no Space: the user's places, none chosen (0.10.116 shape, VERIFIED).
  const which = process.env.NMEM_FAKE_SPACES;
  // D269: Mem on this computer: NMEM_FAKE_LOCAL_BRIDGE=off answers it doesn't connect agents; else
  // its one place (the app's or a Vault's), of its own kind.
  if (process.env.NMEM_FAKE_BACKEND === "local") {
    if (process.env.NMEM_FAKE_LOCAL_BRIDGE === "off") fail("bridge_unavailable", "Bridge isn't available on this Mem.");
    out({ state: "selection_needed", detail: "Choose the exact Space for Bridge.", candidates: [{ id: SPACE.id, label: "My vault", kind: "local", readers: 1, write_default: true }] });
    process.exit(0);
  }
  const personal = (id: string) => ({ id, label: "Only me", kind: "personal", readers: 1, write_default: true });
  // D334: the person's Spaces as the state lists them.
  if (s.spaces?.length && !which) {
    out({ state: "selection_needed", detail: "Choose the exact Space for Bridge. No identity, credential or mailbox was created.", candidates: s.spaces.map((x) => ({ ...x, readers: x.kind === "personal" ? 1 : 5, write_default: x.kind === "personal" })) });
    process.exit(0);
  }
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
// D334: a context's Space, a message's Space, and who a message is for (an agent in a Space).
const spaceOf = (name: string) => s.identities[name]?.space ?? SPACE.id;
const spaceInfo = (id: string): Space => s.spaces?.find((x) => x.id === id) ?? (id === SPACE.id ? SPACE : { id, label: id, kind: "team" });
const msgSpace = (m: Msg) => m.space ?? spaceOf(m.to);
const agentOfCtx = (name: string) => s.identities[name]?.agent ?? name;
const WIDE = IDENT || (process.env.NMEM_FAKE_WIDE === "1" && (verb !== "inbox" || argv.includes("--all-spaces")));
const forMe = (m: Msg) => agentOfCtx(m.to) === agentOfCtx(me) && (WIDE || msgSpace(m) === spaceOf(me));
// As the real CLI shows a member: an id-only label, never a person's name.
const card = (name: string, space = spaceOf(name)) => ({ space: spaceInfo(space), member: `Member ${memberId(name)}`, agent: s.identities[name]!.agent, description: s.identities[name]!.description });
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
// D294: Mem's side answering "can't right now" for the first n calls of one verb (nothing is done).
{
  const [want, n, unknown] = (process.env.NMEM_FAKE_BUSY ?? "").split(":");
  if (want && want === verb && ((s.busy ?? {})[verb] ?? 0) < Number(n || 1)) {
    s.busy = { ...(s.busy ?? {}), [verb]: ((s.busy ?? {})[verb] ?? 0) + 1 };
    save(s);
    const write = verb === "send" || verb === "reply";
    const error_code = write ? "cloud_agent_original_authority_busy" : "cloud_agent_im_backend_unavailable";
    out({ stage: "upstream", upstream: { error_code, detail: "Try again shortly.", retryable: true, outcome_unknown: unknown === "unknown", http_status: 503 } });
    process.exit(1);
  }
}
// Mem #10278's sender attribution, as the owner's CLI shows it (member label as on its cards).
const sender = (name: string) => {
  const id = s.identities[name]!;
  return { actor_id: `actor-${memberId(name)}-${id.agent}`, member: process.env.NMEM_FAKE_SENDER_MEMBER ?? `Member ${memberId(name)}`, agent: id.native ? "Bridge agent" : id.agent, agent_id: id.agent, ...(id.native ? { host: id.native } : {}) };
};
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

// D409: Mem Cloud's own pace (the live trial, 2026-11-20: the identity inbox 44 to 52 s, contacts 31 to 40 s).
// NMEM_FAKE_LATENCY=<verb>:<ms>[,<verb>:<ms>] holds that verb's answer that long first.
{
  const ms = (process.env.NMEM_FAKE_LATENCY ?? "").split(",").map((x) => x.split(":")).find(([v]) => v === verb)?.[1];
  if (ms && Number(ms) > 0) await Bun.sleep(Number(ms));
}
switch (verb) {
  case "setup": {
    // Passive inspect only; the fake never enables anything.
    // D409: nmem 0.10.121 for a context `connections connect` saved (VERIFIED, the live trial of
    // 2026-11-20): `enable_needed`, the identity under `endpoint.address`. Its inbox still reads.
    if (IDENT) {
      out({ state: "enable_needed", endpoint: { scope: { space_id: spaceOf(me) }, address: { custodian_id: memberId(me), agent_id: s.identities[me]!.agent }, membership_generation: 1 }, detail: "This connection is authorized as this Agent in this Space. Enable explicitly to reuse its mailbox; no credential will be created.", next_args: [`--agent-context=${me}`, "bridge", "setup", "--enable"] });
      break;
    }
    out({ schema_version: 1, state: "ready", space_id: SPACE.id, identity: { custodian_id: memberId(me), agent_id: s.identities[me]!.agent }, registration_confirmed: true, messaging_confirmed: false, receiving_confirmed: false });
    break;
  }
  case "contacts": {
    const q = (take("--query") ?? "").toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (argv.includes("--all-spaces")) {
      // D334: every Space the person reads; each card names its Space. An agent in `everywhere` has one in each.
      const spaces = s.spaces?.length ? s.spaces : [SPACE];
      const cards: unknown[] = [];
      for (const sp of spaces) {
        const here = new Map<string, string>(); // agent -> the context that shows it here
        for (const n of Object.keys(s.identities)) if (!s.identities[n]!.native && spaceOf(n) === sp.id && !here.has(s.identities[n]!.agent)) here.set(s.identities[n]!.agent, n);
        for (const a of s.everywhere ?? []) {
          const rep = Object.keys(s.identities).find((n) => s.identities[n]!.agent === a);
          if (rep && !here.has(a)) here.set(a, `${rep}@${sp.id}`);
        }
        for (const [a, n0] of here) {
          const n = n0.split("@")[0]!;
          if (n0 === me || (a === agentOfCtx(me) && sp.id === spaceOf(me))) continue;
          if (words.length && !words.some((w) => `${n} ${a} ${s.identities[n]!.member} ${s.identities[n]!.description}`.toLowerCase().includes(w))) continue;
          const available = process.env.NMEM_FAKE_UNREGISTERED !== n;
          const prefix = ["nmem", "bridge", `--resolved-space-id=${sp.id}`, "send", `--to=ct-${n0}`];
          cards.push({ ...card(n, sp.id), agent_id: a, contact: `ct-${n0}`, resolved_space_id: sp.id, ...(PRESENT ? { mailbox_available: available } : {}), send_args_prefix: PRESENT && !available ? null : prefix });
        }
      }
      out({ contacts: cards, spaces: spaces.map((x) => ({ space: x, status: "searched", next_cursor: null })), coverage_scope: "all_spaces_batch", next_spaces_cursor: null });
      break;
    }
    if (IDENT) {
      // D400: one card per identity across every Space (no Space on it); a send resolves it in the sender's Space.
      const seen = new Set<string>([agentOfCtx(me)]);
      const cards: unknown[] = [];
      for (const n of Object.keys(s.identities)) {
        const a = s.identities[n]!.agent;
        if (seen.has(a) || s.identities[n]!.native) continue;
        if (words.length && !words.some((w) => `${n} ${a} ${s.identities[n]!.member} ${s.identities[n]!.description}`.toLowerCase().includes(w))) continue;
        seen.add(a);
        const available = process.env.NMEM_FAKE_UNREGISTERED !== n;
        const { space: _sp, ...who } = card(n);
        cards.push({ kind: "identity_contact", ...who, agent_id: a, contact: `ct-${n}`, mailbox_available: available, send_args_prefix: available ? ["nmem", `--agent-context=${me}`, "bridge", "send", `--to=ct-${n}`] : null });
      }
      out({ contacts: cards, next: null, match_state: cards.length === 1 ? "unique" : cards.length ? "ambiguous" : "none", has_more: false });
      break;
    }
    const contacts = Object.keys(s.identities)
      .filter((n) => n !== me && !s.identities[n]!.native && spaceOf(n) === spaceOf(me))
      .filter((n) => !words.length || words.some((w) => `${n} ${s.identities[n]!.agent} ${s.identities[n]!.member} ${s.identities[n]!.description}`.toLowerCase().includes(w)))
      .map((n) => {
        const available = process.env.NMEM_FAKE_UNREGISTERED !== n;
        const prefix = ["nmem", "bridge", `--resolved-space-id=${SPACE.id}`, "send", `--to=ct-${n}`];
        return PRESENT ? { ...card(n), contact: `ct-${n}`, agent_id: s.identities[n]!.agent, mailbox_available: available, send_args_prefix: available ? prefix : null } : { ...card(n), contact: `ct-${n}`, send_args_prefix: prefix };
      });
    if (NAMED) out({ cards: contacts, spaces: [{ space: SPACE, status: "searched", next_cursor: null }], coverage_scope: "current_space_batch" });
    // 0.10.118 in one Space: no per-card Space, the batch's own envelope.
    else out({ contacts: contacts.map(({ space: _s, ...c }) => c), next: null, match_state: contacts.length === 1 ? "unique" : contacts.length ? "ambiguous" : "none", has_more: false, outgoing: [] });
    break;
  }
  case "send":
  case "reply": {
    let to: string;
    let inReplyTo: string | undefined;
    let space = spaceOf(me);
    if (verb === "send") {
      const [handle, at] = (take("--to")?.replace(/^ct-/, "") ?? "").split("@");
      to = handle ?? "";
      if (!to || !s.identities[to]) fail("unknown_contact", "Use a contact handle from `bridge contacts`.");
      // D334: a card from another Space than this context's can't be sent to from here.
      if (!(IDENT && !at) && (at ?? spaceOf(to)) !== spaceOf(me)) fail("space_mismatch", "That contact card is from another Space than this context's.");
    } else {
      // The message is the positional word, wherever it stands (clap's way; Mem's argv puts it before the body flag).
      const words = argv.slice(2).filter((a, i, all) => !a.startsWith("-") && !(i > 0 && /^--(body-file|body|shared-document)$/.test(all[i - 1]!)));
      const text0 = unref(words[0]);
      const orig = s.messages.find((x) => x.id === text0 && forMe(x));
      if (!orig) fail("not_found", "Reply only to a message in this mailbox.");
      to = orig!.from;
      inReplyTo = orig!.id;
      space = msgSpace(orig!);
    }
    const text = await body();
    if (process.env.NMEM_FAKE_UNREGISTERED && process.env.NMEM_FAKE_UNREGISTERED === to) {
      // The real 409 (2026-11-13): the card's agent has no registered mailbox now. Outcome unknown;
      // the CLI retains the original, and inspect/resume answer from it.
      const op = `op-x${++s.seq}`;
      s.retained = { ...(s.retained ?? {}), [op]: { to, body: text } };
      save(s);
      out({ stage: "upstream", upstream: { error_code: "cloud_agent_original_selection_unavailable", detail: "A selected recipient has no current registered mailbox. A previous unknown send remains unresolved; do not replace its identity.", retryable: false, outcome_unknown: true, request_id: `req-${s.seq}`, original_operation: "prepare", request_may_have_changed_state: true, http_status: 409 }, operation: op, detail: "Retain this operation. Resume it or inspect outbox; do not send a replacement." });
      process.exit(1);
    }
    const m: Msg = { id: newId(), op: `op-${s.seq}`, from: me, to, body: text, ...(inReplyTo ? { in_reply_to: inReplyTo } : {}), created_at: new Date().toISOString(), ...(space !== spaceOf(to) ? { space } : {}) };
    s.messages.push(m);
    const lost = lose(verb, m);
    save(s);
    if (lost) {
      console.error("connection reset by peer");
      process.exit(1);
    }
    if (NAMED) out({ state: "sent", message: m.id, operation: m.op, ...(inReplyTo ? { in_reply_to: inReplyTo } : {}) });
    else out({ message: m.id, status: "delivered", operation: m.op });
    break;
  }
  case "follow": {
    // D656: follow one original, never opening or acknowledging mail. The shape is this branch's
    // INFERRED one (see the header); `NMEM_FAKE_FOLLOW_SHAPE=other` is the unseen shape a real CLI
    // may answer, which the client must not adopt: the inbox still delivers the reply.
    if (!FOLLOW) fail("bad_arguments", "fake nmem: bridge follow is not implemented", 2);
    const wanted = unref(argv[2]);
    const orig = s.messages.find((m) => (m.op === wanted || m.id === wanted) && m.from === me);
    if (!orig) fail("not_found", "No such operation.");
    const replies = s.messages.filter((m) => m.in_reply_to === orig!.id && m.from !== me && !m.pending);
    if (process.env.NMEM_FAKE_FOLLOW_SHAPE === "other") {
      out({ operation: orig!.op, state: "sent", items: replies.map((m) => ({ message: m.id })) });
      break;
    }
    out({
      operation: orig!.op,
      state: "sent",
      replies: replies.map((m) => ({ message: m.id, in_reply_to: m.in_reply_to, body: m.body, sender: sender(m.from), created_at: m.created_at })),
    });
    break;
  }
  case "inbox": {
    // D335: `inbox --wait <s>` (asked of Mem in nowledge-co/mem#10402): holds until an unread
    // message is there for this context (D334: its Space, or every Space with --all-spaces) or the
    // wait ends, then answers as `inbox` does.
    if (IDENT) {
      // D400: nmem 0.10.121's identity inbox: clap's plain refusals, its plain-text context refusal.
      const bad = argv.find((a) => a === "--all-spaces" || a.startsWith("--space-id") || a.startsWith("--resolved-space-id"));
      if (bad) {
        console.error(`error: unexpected argument '${bad}' found\n\nUsage: nmem bridge inbox [OPTIONS]\n\nFor more information, try '--help'.`);
        process.exit(2);
      }
      if ((process.env.NMEM_FAKE_UNAPPROVED ?? "").split(",").includes(me)) {
        console.error("error: Select your approved Agent Context for the identity inbox");
        process.exit(1);
      }
      const w = argv.indexOf("--wait");
      if (w >= 0 && !(Number(argv[w + 1]) >= 1 && Number(argv[w + 1]) <= 5)) fail("bad_arguments", `error: invalid value '${argv[w + 1]}' for '--wait <WAIT>': ${argv[w + 1]} is not in 1..=5`, 2);
      if (argv.includes("--watch")) {
        if (process.env.NMEM_FAKE_WATCH === "exit") fail("cloud_agent_im_backend_unavailable", "fake nmem: the watch couldn't start", 1);
        // One JSON line whenever unread mail for this identity grows; runs until killed.
        const unread = () => load().messages.filter((m) => forMe(m) && !m.pending && !m.read_at).map((m) => m.id);
        let had = new Set(unread());
        for (;;) {
          await Bun.sleep(50);
          const now = unread();
          const fresh = now.filter((id) => !had.has(id));
          if (fresh.length) console.log(JSON.stringify({ event: "incoming_changed", messages: fresh.map((message) => ({ message })) }));
          had = new Set(now);
        }
      }
      if (process.env.NMEM_FAKE_CURSOR_STALE === "1" && argv.includes("--cursor") && !s.staled) {
        s.staled = true;
        save(s);
        console.error("error: Identity inbox cursor no longer matches this Context or Space roster; restart the inbox");
        process.exit(1);
      }
    }
    const wait = take("--wait");
    if (wait !== undefined) {
      if (!WAITS && !IDENT) fail("bad_arguments", "error: unexpected argument '--wait' found", 2);
      const failing = WAITS === "error" || (!!WAITS && WAITS.startsWith("error:") && WAITS!.slice(6).split(",").includes(me));
      if (failing) fail("cloud_agent_im_backend_unavailable", "fake nmem: the wait failed", 1);
      const until = Date.now() + Number(wait) * 1000;
      const unread = () => load().messages.some((m) => forMe(m) && !m.pending && !m.read_at);
      while (!unread() && Date.now() < until) await Bun.sleep(50);
      Object.assign(s, load());
    }
    const all = s.messages.filter((m) => forMe(m) && !m.pending);
    const cursor = take("--cursor");
    if (NAMED) {
      const mine = all;
      const messages = mine.map((m) => ({ message: m.id, ...card(m.from), created_at: m.created_at, read: !!m.read_at, ...(m.in_reply_to ? { in_reply_to: m.in_reply_to } : {}) }));
      const outgoing = s.messages.filter((m) => m.from === me && !m.pending).map((m) => ({ message: m.id, read: !!m.read_at }));
      out({ messages, outgoing });
      break;
    }
    // D367: one page from the cursor's place, oldest first; `next` "" on the last page.
    const size = Math.max(1, Number(process.env.NMEM_FAKE_INBOX_PAGE) || 20);
    let at = 0;
    if (cursor !== undefined) {
      const m = /^at:(\d+):/.exec(Buffer.from(cursor, "base64url").toString());
      if (!m) fail("invalid_cursor", "That cursor isn't one this inbox gave.");
      at = Number(m![1]);
    }
    const mine = all.slice(at, at + size);
    const next = at + size < all.length ? Buffer.from(`at:${at + size}:${crypto.randomUUID()}`).toString("base64url") : "";
    // 0.10.118: handles only; our own sent messages' read status beside them.
    const outgoing = s.messages.filter((m) => m.from === me && !m.pending).map((m) => ({ message: m.id, status: m.read_at ? "read" : "delivered", read_recipients: m.read_at ? 1 : 0, recipients: 1 }));
    if (IDENT) {
      // D400, D409: nmem 0.10.121's identity inbox as read live (2026-11-19, research/161 §8; the live
      // trial's raw answers of 2026-11-20, §9): each entry its Space by id alone, `mine` (the sender is
      // the reader's own member; null on an expired one), `state: "pending"` on every live entry (opened
      // or not: the trial's peer mailbox), whether it may be opened, `expires_at_ms`, Mem #10278's
      // `sender` and `in_reply_to` (null on an original), a `bm1:` reference and Mem's open/reply argv
      // ending in it. Our own sent messages' read status is under each Space (`spaces[].outgoing`), not
      // at the top; a later page lists only the Spaces that had more.
      const stuck = (process.env.NMEM_FAKE_SPACE_STUCK ?? "").split(",").filter(Boolean);
      const expired = (process.env.NMEM_FAKE_EXPIRED ?? "").split(",").filter(Boolean);
      const shown = mine.filter((m) => !stuck.includes(msgSpace(m)));
      const ref = (m: Msg) => `bm1:${Buffer.from(JSON.stringify({ message: m.id })).toString("base64url")}`;
      const sentIn = (id: string) => s.messages.filter((m) => m.from === me && !m.pending && msgSpace(m) === id).map((m) => ({ message: m.id, status: m.read_at ? "read" : "delivered", read_recipients: m.read_at ? 1 : 0, recipients: 1 }));
      const more = (id: string) => all.slice(at + size).some((m) => msgSpace(m) === id);
      const spaces = (s.spaces?.length ? s.spaces : [SPACE])
        .filter((x) => cursor === undefined || more(x.id) || shown.some((m) => msgSpace(m) === x.id))
        .map((x) => (stuck.includes(x.id) ? { space_id: x.id, status: "unavailable", error_code: "cloud_mailbox_own_source_unreconciled" } : { space_id: x.id, status: "observed", next_cursor: more(x.id) ? `sc-${x.id}` : "", outgoing: cursor === undefined ? sentIn(x.id) : [] }));
      const created = (m: Msg) => Date.parse(m.created_at) || Date.now();
      out({
        messages: shown.map((m, i) => {
          const dead = expired.includes(m.id);
          return {
            message: m.id,
            mine: dead ? null : memberId(m.from) === memberId(me),
            state: dead ? "expired" : "pending",
            eligible: !dead,
            expires_at_ms: created(m) + 7 * 86_400_000,
            sequence: at + i + 1,
            ...(dead ? {} : { sender: sender(m.from), in_reply_to: m.in_reply_to ?? null }),
            space_id: msgSpace(m),
            reference: ref(m),
            open_args: ["nmem", "--api-url=https://cloud.example/remote-api", `--agent-context=${me}`, "bridge", "open", ref(m)],
            reply_args_prefix: ["nmem", "--api-url=https://cloud.example/remote-api", `--agent-context=${me}`, "bridge", "reply", ref(m)],
          };
        }),
        spaces,
        next: next || null,
        incomplete: stuck.length > 0 || !!next,
        coverage_scope: "current_space_batch",
        outcome_unknown: false,
        identity: agentOfCtx(me),
      });
      break;
    }
    out({ messages: mine.map((m) => ({ ...(PRESENT ? { message: m.id, sender: sender(m.from), in_reply_to: m.in_reply_to ?? null } : { message: m.id }), ...(WIDE ? { space_id: msgSpace(m) } : {}) })), next, outgoing, status_observed_at_us: Date.now() * 1000 });
    break;
  }
  case "open": {
    const m = s.messages.find((x) => x.id === unref(argv[2]) && agentOfCtx(x.to) === agentOfCtx(me) && (IDENT || process.env.NMEM_FAKE_WIDE === "1" || msgSpace(x) === spaceOf(me)) && !x.pending);
    if (!m) fail("not_found", "No such message in this mailbox.");
    m!.read_at ??= new Date().toISOString();
    save(s);
    // One JSON document per shape: two would make the whole answer unparseable (the eval's D294 break).
    if (NAMED) out({ message: { id: m!.id, ...card(m!.from), created_at: m!.created_at, ...(m!.in_reply_to ? { in_reply_to: m!.in_reply_to } : {}) }, body: m!.body });
    else if (PRESENT) out({ message: m!.id, body: m!.body, reply_to: m!.id, in_reply_to: m!.in_reply_to ?? null, sender: sender(m!.from), outgoing: [], status_observed_at_us: Date.now() * 1000 });
    // 0.10.118: no sender; `reply_to` is this message's own handle (in_reply_to INFERRED).
    else out({ message: m!.id, body: m!.body, reply_to: m!.id, ...(m!.in_reply_to ? { in_reply_to: m!.in_reply_to } : {}), outgoing: [] });
    break;
  }
  case "outbox": {
    out({ operations: s.messages.filter((m) => m.from === me).slice(-20).reverse().map(opView) });
    break;
  }
  case "inspect": {
    const kept = s.retained?.[argv[2]!];
    // 0.10.118: the retained original, with no state (VERIFIED: `source: "retained_input"`).
    if (kept) {
      out({ operation: argv[2], source: "retained_input", body: kept.body, contacts: [`ct-${kept.to}`], reply_to: null, outgoing: [] });
      break;
    }
    const m = s.messages.find((x) => x.op === argv[2] && x.from === me);
    if (!m) fail("not_found", "No such operation.");
    if (NAMED) out({ ...opView(m!), body: m!.body });
    else out({ operation: m!.op, source: "retained_input", body: m!.body, contacts: [`ct-${m!.to}`], reply_to: m!.in_reply_to ?? null, outgoing: [] });
    break;
  }
  case "resume": {
    if (s.retained?.[argv[2]!]) {
      out({ stage: "upstream", upstream: { error_code: "cloud_agent_original_selection_unavailable", detail: "A selected recipient has no current registered mailbox. A previous unknown send remains unresolved; do not replace its identity.", retryable: false, outcome_unknown: true, http_status: 409 }, operation: argv[2] });
      process.exit(1);
    }
    const m = s.messages.find((x) => x.op === argv[2] && x.from === me);
    if (!m) fail("not_found", "No such operation.");
    m!.pending = false; // the same original, never a replacement
    save(s);
    out(NAMED ? { state: "sent", operation: m!.op, message: m!.id } : { message: m!.id, status: "delivered", operation: m!.op });
    break;
  }
  default:
    fail("bad_arguments", `fake nmem: bridge ${verb} is not implemented`, 2);
}
