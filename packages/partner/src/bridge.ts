// The partner's Bridge port: requests from the user's other agents through Nowledge Bridge
// (design/bridge.md). On once the user connected the persona in Settings › 伙伴 (D205, core's
// bridge-link.ts runs that one `bridge connections connect` on their tap), or forced with
// DUCTER_BRIDGE=1 and DUCTER_BRIDGE_CONTEXT naming an Agent Context the user approved with nmem.
//
// Boundary
//   - The persona is the addressee (principle 17): Ducter uses the persona's Agent mailbox
//     (`nmem bridge inbox/open/reply`), never a native-session mailbox. Harness sessions are
//     caches (principle 1); an address bound to one would die at the next re-cut.
//   - The partner never sets anything up. It never calls `bridge setup --enable`, `session prepare`,
//     `agents enroll` or `keys create`. It reads the persona's inbox and replies to a message that
//     is already in the Log. It may also run `contacts` (read-only) and `send`, but `send` runs only
//     after the user tapped Go on a card naming the recipient (D105), and passive `setup` once to
//     learn the user's own member. After an unknown outcome it runs `outbox`, `inspect` and
//     `resume` on the same original, never a second send (D106). The Agent Context (identity +
//     exact Space) is the user's; Ducter passes its name and nothing else.
//   - A message body is untrusted task context from another agent, never the user's permission.
//     The partner can't open a task from it in a turn the user hasn't spoken in (partner.ts).
//   - The Log is the ledger: a message id already logged as `bridge_msg` is never opened again,
//     so a restart or a second check can't duplicate a message.
//   - Every failure comes back as { ok: false }; nothing here throws into a turn or a check.
//   - Tests inject a fake BridgeClient or point `bin` at a stub; nothing in tests reaches Mem.
//
// The nmem JSON shapes below are read tolerantly. nmem 0.10.118 against Mem Cloud (VERIFIED
// 2026-11-13, research/66 §7): `bridge inbox` lists `messages[]` of `{message}` only; `bridge open`
// returns `{message, body, reply_to, outgoing}` with no sender at all, `reply_to` being the message's
// own handle. Sender fields read below come from older shapes and stay as fallbacks (research/31).
// Mem PR #10278 (merged 2026-11-15, deployed on Mem Cloud; in the CLI after 0.10.119, research/66 §8):
// `inbox` messages and `open` add `sender: {actor_id, member?, agent?, agent_id?}` and `in_reply_to`
// (the actual parent; `reply_to` stays the message itself); contact cards add `agent_id` and
// `mailbox_available` (false = no registered mailbox now: no send arguments). Read below (D294).
//
// D334: the address is the identity, not the Space. A context reads one Space's inbox, so the client
// holds one context per Space the home reads (core's bridge-link.ts finds them) and reads each; every
// message keeps the Space it came in, and a reply, an open, an inspect or a resume runs with that
// Space's context. Contacts are looked up in every Space (`--all-spaces`); a send runs with the
// context of the Space its card came from. With Mem's one inbox for every Space (#10402, `wide`), the
// first context reads them all with `inbox --all-spaces` and the Space comes from each message.
import type { BridgePlace, BridgeWhere } from "../../protocol/src/internal.ts";
import { nmemEnv } from "./memory.ts";

export interface BridgeMessage {
  messageId: string; // the CLI's message handle (what `open` and `reply` take)
  from: string; // a readable sender: agent and member as the CLI returns them
  agent?: string; // the sending agent's own name
  mine?: boolean; // the sender belongs to the user (same member as the persona's owner)
  text: string; // clipped
  sentAt?: string;
  inReplyTo?: string; // set when this answers a message we sent (the CLI's in_reply_to)
  space?: string; // D334: the exact Space it came in (its reply goes back there)
  spaceLabel?: string;
  shared?: boolean; // D334: it came in a Space the person shares with others (not their own place)
  member?: string; // D334: the sender's member by name, when Mem names one (never an id)
}

/** One recipient card from `bridge contacts`: an opaque handle plus who and where, as returned. */
export interface BridgeContact {
  contact: string; // the opaque handle `send --to` takes; choosing it grants nothing
  label: string; // "agent (member)" when the member has a name, else the agent alone, for the user's card
  agent?: string;
  mine?: boolean; // the user's own agent
  description?: string;
  space?: string; // the exact Space the card came from, when the CLI says
  spaceLabel?: string; // D334
  spaceKind?: string; // D334: "personal" for the person's own place
  key?: string; // D334: one agent across Spaces (its id or name, and its member)
}

/** One outgoing operation as `bridge outbox` / `inspect` report it (tolerant; research/37 B8). */
export interface BridgeOp {
  operation: string; // the selector `inspect` and `resume` take
  state: "sent" | "pending" | "failed" | "unknown";
  messageId?: string;
  inReplyTo?: string;
  body?: string;
  space?: string; // D334: the Space whose context's outbox listed it
}

/**
 * "busy": Mem's side couldn't take it right now and said it was NOT admitted (`outcome_unknown:
 * false`), after a short bounded retry (D294); nothing went out, so a later send is no replacement.
 * "unavailable": no answer, or Mem doesn't know; for a send or reply the outcome is UNKNOWN (D106).
 */
export type BridgeFailure = { ok: false; reason: "not_configured" | "unavailable" | "busy" | "refused"; message: string; operation?: string };
export type BridgeResult<T> = ({ ok: true } & T) | BridgeFailure;

export interface BridgeClient {
  /**
   * New messages in the persona's inbox, with bodies, skipping ids the caller already has.
   * `reads`: the read status of our own sent messages, when the inbox reports it.
   */
  check(known: Set<string>): Promise<BridgeResult<{ messages: BridgeMessage[]; reads?: Record<string, boolean> }>>;
  /**
   * The handles in the inbox, without opening any (nothing is marked read). Used once, when Bridge
   * is first on for a persona: what is already there is not a request to it (B14, D170).
   */
  inboxIds?(): Promise<BridgeResult<{ ids: string[] }>>;
  /**
   * Reply to a received message; the CLI derives the recipient from that original.
   * A failure with reason "unavailable" means the outcome is UNKNOWN (D106): recover it, never resend.
   */
  reply(messageId: string, text: string, space?: string): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /** Read-only recipient discovery in every Space the home reads (D334; one bounded page each). */
  contacts?(query: string): Promise<BridgeResult<{ contacts: BridgeContact[]; more: boolean }>>;
  /** A new message to a contact handle the user confirmed on a card, sent in the card's Space. Failures as for `reply`. */
  send?(contact: string, text: string, space?: string): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /** Recovery after an unknown outcome (D106): recent outgoing operations, then the one original. */
  outbox?(): Promise<BridgeResult<{ ops: BridgeOp[] }>>;
  inspect?(operation: string, space?: string): Promise<BridgeResult<{ op: BridgeOp }>>;
  /** Recover the exact operation; the CLI never sends a replacement. */
  resume?(operation: string, space?: string): Promise<BridgeResult<{ messageId?: string }>>;
}

export interface NmemBridgeOptions {
  context: string; // the approved named Agent Context (nmem --agent-context)
  /**
   * D334: every Space the home reads, each with its own context (the first is `context`'s own).
   * Default: `context` alone. wide: Mem reads every Space with one inbox (#10402).
   */
  places?: BridgePlace[];
  wide?: boolean;
  bin?: string; // default NMEM_CLI_PATH or "nmem"
  timeoutMs?: number; // per call, default 20 s
  maxOpen?: number; // bodies opened per check, default 5
  /**
   * The user's member (id or display name), to tell the user's own agents from teammates'.
   * Default DUCTER_BRIDGE_MEMBER, else the member that passive `bridge setup` reports for the
   * persona's context. Unknown = every sender is treated as a teammate's (the safe side).
   */
  me?: string;
  env?: Record<string, string | undefined>;
  /**
   * D294: the waits before each retry of a call Mem answered "can't right now" (503, 429, `_busy`,
   * `_unavailable`, `_capacity`, `retryable`). Reads retry; a send or reply only when Mem said it was
   * not admitted (`outcome_unknown: false`), so a retry can never be a second copy. Default [400, 1200].
   */
  retryDelaysMs?: number[];
}

/** Mem's error answer, flat (`{error_code, http_status, retryable, outcome_unknown}`) or under
 *  `upstream` (a send's 409/503, VERIFIED 2026-11-13), from stdout or stderr JSON. */
export interface MailboxError {
  code?: string;
  http?: number;
  retryable?: boolean;
  unknown?: boolean; // Mem's own `outcome_unknown`
}
export function mailboxError(text: string): MailboxError {
  for (const chunk of [text, ...text.split("\n")]) {
    let j: any;
    try {
      j = JSON.parse(chunk);
    } catch {
      continue;
    }
    const e = j && typeof j === "object" ? (j.upstream && typeof j.upstream === "object" ? j.upstream : j) : undefined;
    if (!e) continue;
    const code = str(e.error_code) ?? str(e.code) ?? str(e.error);
    const http = typeof e.http_status === "number" ? e.http_status : undefined;
    if (!code && http === undefined && typeof e.outcome_unknown !== "boolean") continue;
    return {
      ...(code ? { code } : {}),
      ...(http !== undefined ? { http } : {}),
      ...(typeof e.retryable === "boolean" ? { retryable: e.retryable } : {}),
      ...(typeof e.outcome_unknown === "boolean" ? { unknown: e.outcome_unknown } : {}),
    };
  }
  const http = /\b(?:HTTP|status)\s*(\d{3})\b/i.exec(text)?.[1];
  return http ? { http: Number(http) } : {};
}
/** Mem's side can't take it right now: worth a short wait and one more try (D294). */
export const transient = (e: MailboxError) => e.http === 503 || e.http === 429 || /_(unavailable|busy|capacity)$/.test(e.code ?? "") || e.retryable === true;

/** Agents Mem names only generically: every native session's Agent is "Bridge agent" (research/66 §7). */
const GENERIC_AGENT = /^bridge agent$/i;

const MAX_TEXT = 4000;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

const pickName = (o: any): string | undefined => {
  if (!o) return undefined;
  if (typeof o === "string") return o;
  return str(o.display_name) ?? str(o.displayName) ?? str(o.name) ?? str(o.label) ?? str(o.agent_id) ?? str(o.id);
};
const agentOf = (m: any): string | undefined => {
  const a = pickName(m?.agent) ?? pickName(m?.sender?.agent) ?? pickName(m?.from?.agent);
  // A generic label says nothing about which agent it is, and its id reads no better (D294).
  if (a && GENERIC_AGENT.test(a)) return undefined;
  return a ?? str(m?.sender_agent_id) ?? str(m?.agent_id);
};

/** The id in an id-only member label ("Member 4e74…"), as real contact cards carry it. */
export function memberIdLabel(v: string): string | undefined {
  return /^Member\s+(\S+)$/.exec(v.trim())?.[1];
}

/** A readable sender from whatever the CLI returned (an object with names/ids, or a string). */
export function senderOf(m: any): string {
  const agent = agentOf(m);
  // Only a member's name reads well; an id-only label ("Member <uuid>", the real CLI's card) never
  // reaches a card or the conversation (research/37 §6).
  const raw = pickName(m?.member) ?? pickName(m?.sender?.member) ?? pickName(m?.from?.member) ?? str(m?.member_display_name);
  const member = raw && !memberIdLabel(raw) ? raw : undefined;
  const flat = typeof m?.from === "string" ? m.from : typeof m?.sender === "string" ? m.sender : undefined;
  if (agent && member && agent !== member) return `${agent} (${member})`;
  return agent ?? member ?? flat ?? "another agent";
}

/** The member behind a message, a card or the persona's own setup: its id and name, as returned. */
export function memberOf(m: any): { id?: string; name?: string } {
  const o = m?.member ?? m?.sender?.member ?? m?.from?.member ?? m?.owner ?? m?.agent?.owner;
  // The real CLI (nmem 0.10.116, 2026-11-10): a contact card's member is the string "Member <id>",
  // and passive `bridge setup` in a Space reports the user's own member as `identity.custodian_id`.
  const labelled = typeof o === "string" ? memberIdLabel(o) : undefined;
  const id =
    labelled ?? str(o?.id) ?? str(o?.member_id) ?? str(m?.member_id) ?? str(m?.sender_member_id) ?? str(m?.owner_member_id) ?? str(m?.ownerMemberId) ??
    str(m?.agent?.ownerMemberId) ?? str(m?.agent?.owner_member_id) ?? str(m?.custodian_member_id) ?? str(m?.custodianMemberId) ?? str(m?.identity?.custodian_id) ??
    // nmem 0.10.119: passive `bridge setup` reports it as `endpoint.address.custodian_id`.
    str(m?.endpoint?.address?.custodian_id);
  const name = labelled ? str(m?.member_display_name) : ((typeof o === "string" ? o : str(o?.display_name) ?? str(o?.displayName) ?? str(o?.name)) ?? str(m?.member_display_name));
  return { ...(id ? { id } : {}), ...(name ? { name } : {}) };
}

/** Whether a sender or card belongs to the user: its member is the persona's own member. */
export function isMine(m: any, me: string | undefined): boolean {
  if (!me) return false;
  const who = memberOf(m);
  return who.id === me || (!!who.name && who.name === me);
}

/** Message handles from `bridge inbox --json`: `messages[]` of strings or of `{message|id}`. */
export function inboxIds(j: any): string[] {
  const list = Array.isArray(j?.messages) ? j.messages : Array.isArray(j?.incoming) ? j.incoming : [];
  const ids: string[] = [];
  for (const m of list) {
    const id = typeof m === "string" ? m : str(m?.message) ?? str(m?.message_id) ?? str(m?.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Read status of our own sent messages, from the inbox's outgoing refresh (when present). */
export function outgoingReads(j: any): Record<string, boolean> | undefined {
  const list = Array.isArray(j?.outgoing) ? j.outgoing : Array.isArray(j?.sent) ? j.sent : undefined;
  if (!list) return undefined;
  const out: Record<string, boolean> = {};
  for (const m of list) {
    const id = str(m?.message) ?? str(m?.message_id) ?? str(m?.id);
    // nmem 0.10.118 (VERIFIED): `{message, status: "delivered"|"read", read_recipients, recipients}`.
    if (id) out[id] = m?.read === true || !!str(m?.read_at) || /read|opened/i.test(str(m?.state) ?? str(m?.status) ?? "") || (typeof m?.read_recipients === "number" && m.read_recipients > 0);
  }
  return out;
}

/**
 * A teammate's agent whose card names no member (the real CLI, B11) is told by its team instead:
 * "reviewer (dev team)" (D162; D291: never a " · " join). The user's own agents and personal Spaces keep the bare name.
 */
function teamLabel(c: any, label: string, mine: boolean): string {
  const team = str(c?.space?.label);
  const kind = str(c?.space?.kind);
  if (mine || !team || kind === "personal" || label !== (agentOf(c) ?? label)) return label;
  return `${label} (${team})`;
}

/** Recipient cards from `bridge contacts --json`: `contacts[]` (or `cards[]`) with an opaque `contact`. */
export function contactsOf(j: any, me?: string): BridgeContact[] {
  const list = Array.isArray(j?.contacts) ? j.contacts : Array.isArray(j?.cards) ? j.cards : [];
  const out: BridgeContact[] = [];
  for (const c of list) {
    const contact = str(c?.contact) ?? str(c?.handle);
    if (!contact || out.some((x) => x.contact === contact)) continue;
    const description = str(c?.agent?.description) ?? str(c?.description);
    const space = str(c?.space_id) ?? str(c?.resolved_space_id) ?? str(c?.space?.id);
    const agent = agentOf(c);
    // Mem #10278: a card whose agent has no registered mailbox now can't be sent to (the 409 of
    // 2026-11-13: a stale card picked by name, every send unknown). Left out, never offered.
    if (c?.mailbox_available === false) continue;
    const spaceLabel = str(c?.space?.label);
    const spaceKind = str(c?.space?.kind);
    const who = memberOf(c);
    out.push({
      contact,
      label: teamLabel(c, senderOf(c), isMine(c, me)),
      ...(agent ? { agent } : {}),
      ...(isMine(c, me) ? { mine: true } : {}),
      ...(description ? { description: clip(description, 200) } : {}),
      ...(space ? { space } : {}),
      ...(spaceLabel ? { spaceLabel } : {}),
      ...(spaceKind ? { spaceKind } : {}),
      key: `${str(c?.agent_id) ?? agent ?? contact}|${who.id ?? who.name ?? ""}`,
    });
  }
  return out;
}

const opState = (v: unknown): BridgeOp["state"] => {
  const s = (str(v) ?? "").toLowerCase();
  if (/^(sent|delivered|received|read|opened|committed)/.test(s)) return "sent";
  if (/^(refused|retired|failed|rejected|denied|cancel)/.test(s)) return "failed";
  if (/^(pending|queued|incomplete|in_progress|accepted)/.test(s)) return "pending";
  return "unknown";
};
/** One operation from `outbox` / `inspect` output, read tolerantly. */
export function opOf(o: any): BridgeOp | undefined {
  const operation = str(o?.operation) ?? str(o?.operation_id) ?? str(o?.op) ?? str(o?.id);
  if (!operation) return undefined;
  const messageId = str(o?.message) ?? str(o?.message_id);
  const inReplyTo = str(o?.in_reply_to) ?? str(o?.reply_to);
  const body = str(o?.body) ?? str(o?.text) ?? str(o?.original?.body);
  return { operation, state: opState(o?.state ?? o?.status), ...(messageId ? { messageId } : {}), ...(inReplyTo ? { inReplyTo } : {}), ...(body ? { body } : {}) };
}

/** The operation selector in a send/reply answer, even a failed one (stdout or stderr JSON). */
function operationIn(text: string): string | undefined {
  for (const chunk of [text, ...text.split("\n")]) {
    try {
      const j = JSON.parse(chunk);
      const op = str(j?.operation) ?? str(j?.operation_id) ?? str(j?.inspect_args?.[j.inspect_args.length - 1]);
      if (op) return op;
    } catch {
      /* not JSON */
    }
  }
  return undefined;
}
/** BridgeClient over the user's nmem CLI and their approved Agent Context (D334: one per Space it reads). */
export function createNmemBridge(opts: NmemBridgeOptions): BridgeClient {
  const env = opts.env ?? process.env;
  const bin = opts.bin ?? env.NMEM_CLI_PATH ?? "nmem";
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxOpen = opts.maxOpen ?? 5;
  // D334: the home's own context first; every other Space it reads after it, each once.
  const places: BridgePlace[] = [];
  for (const p of [{ context: opts.context }, ...(opts.places ?? [])]) {
    const same = places.find((x) => x.context === p.context);
    if (same) Object.assign(same, { ...p, ...same, ...(p.spaceId ? { spaceId: p.spaceId } : {}), ...(p.spaceLabel ? { spaceLabel: p.spaceLabel } : {}), ...(p.kind ? { kind: p.kind } : {}) });
    else places.push({ ...p });
  }
  const wide = !!opts.wide;
  const home = places[0]!;
  /** The context that reads (and answers in) a Space; the home's own when it isn't one the home reads. */
  const ctxFor = (space?: string): string => (wide || !space ? home.context : (places.find((p) => p.spaceId === space)?.context ?? home.context));
  // `whole`: the arguments are a whole nmem command (not a `bridge` one under the context).
  const run = async (args: string[], input?: string, whole = false, ctx = home.context): Promise<{ code: number; out: string; err: string } | { missing: true }> => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      // Argument vector, never a shell string: message text can't become a flag or a command.
      proc = Bun.spawn(whole ? [bin, "--json", ...args] : [bin, "--json", "--agent-context", ctx, "bridge", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: input !== undefined ? new Blob([input]) : "ignore",
        env: nmemEnv(env), // D102: the basics and NMEM_*, never Ducter's keys
      });
    } catch {
      return { missing: true };
    }
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, out, err };
    } finally {
      clearTimeout(timer);
    }
  };
  const delays = opts.retryDelaysMs ?? [400, 1200];
  type Ran = { code: number; out: string; err: string } | { missing: true };
  /**
   * D294: a call Mem answered "can't right now" is tried again after a short wait, at most
   * `delays.length` more times (about 1.6 s). `write`: a send or reply, retried only when Mem said
   * it was not admitted (`outcome_unknown: false`), so a retry is never a second copy.
   */
  const retried = async (call: () => Promise<Ran>, write: boolean): Promise<Ran> => {
    let r = await call();
    for (const ms of delays) {
      if ("missing" in r || r.code === 0) return r;
      const e = mailboxError(`${r.out}\n${r.err}`);
      if (!transient(e) || (write && e.unknown !== false)) return r;
      await Bun.sleep(ms);
      r = await call();
    }
    return r;
  };
  const read = (args: string[], ctx = home.context) => retried(() => run(args, undefined, false, ctx), false);
  const write = (args: string[], input: string, ctx = home.context) => retried(() => run(args, input, false, ctx), true);
  const failure = (r: Ran): BridgeFailure => {
    if ("missing" in r) return { ok: false, reason: "not_configured", message: "Nowledge Mem isn't installed on this machine." };
    const text = `${r.err}\n${r.out}`;
    const operation = operationIn(r.out) ?? operationIn(r.err);
    const op = operation ? { operation } : {};
    const e = mailboxError(text);
    // Mem's own word on the outcome first: unknown is recovered, never called refused (D106).
    if (e.unknown === true) return { ok: false, reason: "unavailable", message: "Nowledge Mem didn't say whether it went out.", ...op };
    if (e.unknown === false && transient(e)) return { ok: false, reason: "busy", message: "Nowledge Mem can't take messages right now; nothing went out.", ...op };
    if (e.unknown === false && e.code && !/agent_context|not_configured/.test(e.code)) return { ok: false, reason: "refused", message: "Nowledge Mem didn't take it; nothing went out.", ...op };
    if (/not admitted|denied|forbidden|role_insufficient|403|refus/i.test(text)) return { ok: false, reason: "refused", message: "Bridge refused this connection.", ...op };
    if (/agent context|not configured|api key|401|unknown context/i.test(text)) return { ok: false, reason: "not_configured", message: "Bridge isn't set up for this partner.", ...op };
    return { ok: false, reason: "unavailable", message: `Bridge didn't answer (${clip((r.err || r.out || `exit ${r.code}`).trim(), 120)}).`, ...op };
  };
  // A feature-denied Bridge exits 0 with empty stdout: a skipped capability, not an empty inbox.
  const parse = (out: string): any | undefined => {
    if (!out.trim()) return undefined;
    try {
      return JSON.parse(out);
    } catch {
      return undefined;
    }
  };
  // A saved context, read locally (nothing sent): the user's own member is its custodian, and its
  // exact Space. "personal-<custodian>" is the user's "Only me" place (VERIFIED 2026-11-13: every card
  // there is that member's), where every sender can only be one of the user's own agents.
  const where = new Map<string, Promise<{ custodian?: string; space?: string; personal: boolean }>>();
  const placeOf = (ctx: string) => {
    let p = where.get(ctx);
    if (!p) {
      p = (async () => {
        const c = await run(["agents", "context", "show", "--name", ctx], undefined, true);
        if ("missing" in c || c.code !== 0) return { personal: false };
        const sel = parse(c.out)?.selection;
        const custodian = str(sel?.address?.custodian_id);
        const space = str(sel?.scope?.space_id);
        return { ...(custodian ? { custodian } : {}), ...(space ? { space } : {}), personal: !!custodian && space === `personal-${custodian}` };
      })();
      where.set(ctx, p);
    }
    return p;
  };
  /** D334: whether a Space is the person's own place (Mem's kind, else the saved context's id). */
  const personalSpace = async (pl: BridgePlace | undefined, space?: string): Promise<boolean> => {
    if (pl?.kind) return pl.kind === "personal";
    if (pl) return (await placeOf(pl.context)).personal;
    const own = await placeOf(home.context);
    return !!space && !!own.custodian && space === `personal-${own.custodian}`;
  };
  // The user's own member: given, or what passive setup reports for this context (asked once).
  let me: Promise<string | undefined> | undefined;
  const self = () =>
    (me ??= (async () => {
      const given = (opts.me ?? env.DUCTER_BRIDGE_MEMBER)?.trim();
      if (given) return given;
      const r = await run(["setup"]); // passive: inspects only, never --enable
      if (!("missing" in r) && r.code === 0) {
        const m = memberOf(parse(r.out));
        if (m.id ?? m.name) return m.id ?? m.name;
      }
      // nmem 0.10.118: a context saved by `bridge connections connect` is found by inbox, contacts
      // and `agents context show`, but `bridge setup` says it was "not found".
      return (await placeOf(home.context)).custodian;
    })());
  const sent = (r: { code: number; out: string; err: string } | { missing: true }): BridgeResult<{ messageId?: string; operation?: string }> => {
    if ("missing" in r || r.code !== 0) return failure(r);
    const j = parse(r.out);
    if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer; it may or may not have gone out." };
    const id = str(j?.message) ?? str(j?.message_id);
    const operation = str(j?.operation) ?? str(j?.operation_id);
    return { ok: true, ...(id ? { messageId: id } : {}), ...(operation ? { operation } : {}) };
  };
  /** The inboxes to read: each place's own, or (wide) the home's one inbox for every Space. */
  const inboxes = (): { pl: BridgePlace; args: string[] }[] => (wide ? [{ pl: home, args: ["inbox", "--all-spaces"] }] : places.map((pl) => ({ pl, args: ["inbox"] })));
  /** D334: the Space an inbox entry or an opened message names (wide), else its place's. */
  const spaceIn = (o: any, pl: BridgePlace): { id?: string; label?: string; kind?: string } => {
    const id = str(o?.space_id) ?? str(o?.resolved_space_id) ?? str(o?.space?.id) ?? (typeof o?.space === "string" ? o.space : undefined);
    if (wide && id) {
      const known = places.find((p) => p.spaceId === id);
      const label = str(o?.space?.label) ?? known?.spaceLabel;
      const kind = str(o?.space?.kind) ?? known?.kind;
      return { id, ...(label ? { label } : {}), ...(kind ? { kind } : {}) };
    }
    return { ...(pl.spaceId ? { id: pl.spaceId } : {}), ...(pl.spaceLabel ? { label: pl.spaceLabel } : {}), ...(pl.kind ? { kind: pl.kind } : {}) };
  };
  return {
    async check(known) {
      const messages: BridgeMessage[] = [];
      let reads: Record<string, boolean> | undefined;
      let answered = false;
      let lastFail: BridgeFailure | undefined;
      for (const { pl, args } of inboxes()) {
        const r = await read(args, pl.context);
        if ("missing" in r || r.code !== 0) {
          lastFail = failure(r);
          continue; // one Space not answering doesn't hide the others'
        }
        const j = parse(r.out);
        if (j === undefined) {
          lastFail = { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
          continue;
        }
        answered = true;
        const list = Array.isArray(j?.messages) ? j.messages : Array.isArray(j?.incoming) ? j.incoming : [];
        const entry = (id: string) => list.find((m: any) => (typeof m === "string" ? m : str(m?.message) ?? str(m?.message_id) ?? str(m?.id)) === id);
        const fresh = inboxIds(j).filter((id) => !known.has(id) && !messages.some((m) => m.messageId === id)).slice(0, Math.max(0, maxOpen - messages.length));
        const mine = fresh.length ? await self() : undefined;
        for (const id of fresh) {
          // `open` records this recipient's first read: Ducter has the body in its Log from here on.
          const o = await read(["open", id], pl.context);
          if ("missing" in o || o.code !== 0) continue; // left unread; the next check tries again
          const b = parse(o.out);
          const body = str(b?.body) ?? str(b?.message?.body) ?? str(b?.text);
          if (!body) continue;
          const sentAt = str(b?.sent_at) ?? str(b?.created_at) ?? str(b?.message?.created_at);
          // nmem 0.10.118's `open` (VERIFIED): `{message, body, reply_to, outgoing}`, where `reply_to` is
          // the handle `reply` takes, the message's own id. Only a different one names a parent.
          const handle = str(b?.reply_to);
          const inReplyTo = str(b?.in_reply_to) ?? str(b?.message?.in_reply_to) ?? (handle && handle !== id ? handle : undefined);
          const who = b?.message && typeof b.message === "object" ? { ...b, ...b.message } : b;
          const agent = agentOf(who);
          const sp = spaceIn(typeof entry(id) === "object" ? { ...entry(id), ...who } : who, pl);
          // In the user's "Only me" place every sender is one of their own agents, named or not
          // (D249; D294: Mem #10278's `sender.member` may be a display name, not the custodian id).
          // Elsewhere, only a sender whose member is the user's own.
          const said = memberOf(who);
          const byMember = !!(said.id || said.name) && isMine(who, mine);
          // The saved context is read only when it decides something (an own sender in an unnamed Space doesn't).
          const personal = sp.kind ? sp.kind === "personal" : byMember && !sp.id ? false : await personalSpace(wide ? places.find((p) => p.spaceId === sp.id) : pl, sp.id);
          const own = byMember || personal;
          // D334: a teammate's agent is told by its Space ("reviewer (dev team)", "AI agent (Everyone)").
          const shared = !personal && !!sp.id;
          const from = senderOf(who);
          const named = !own && sp.label ? `${agent ?? (from === "another agent" ? "AI agent" : from)} (${sp.label})` : from;
          messages.push({
            messageId: id,
            from: named,
            ...(!own && said.name && !memberIdLabel(said.name) && said.name !== agent ? { member: said.name } : {}),
            ...(agent ? { agent } : {}),
            ...(own ? { mine: true } : {}),
            text: clip(body, MAX_TEXT),
            ...(sentAt ? { sentAt } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(sp.id ? { space: sp.id } : {}),
            ...(sp.label ? { spaceLabel: sp.label } : {}),
            ...(shared ? { shared: true } : {}),
          });
        }
        const rd = outgoingReads(j);
        if (rd) reads = { ...(reads ?? {}), ...rd };
      }
      if (!answered && lastFail) return lastFail;
      return { ok: true, messages, ...(reads ? { reads } : {}) };
    },
    async inboxIds() {
      const ids: string[] = [];
      for (const { pl, args } of inboxes()) {
        const r = await read(args, pl.context);
        if ("missing" in r || r.code !== 0) return failure(r);
        const j = parse(r.out);
        if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
        for (const id of inboxIds(j)) if (!ids.includes(id)) ids.push(id);
      }
      return { ok: true, ids };
    },
    async reply(messageId, text, space) {
      // Body through stdin (--body-file -): text starting with "-" can't parse as a flag.
      // D334: in the Space the message came in, with that Space's context.
      return sent(await write(["reply", "--body-file", "-", messageId], text, ctxFor(space)));
    },
    // Read-only discovery, then a send the user confirmed (design/bridge.md, S2). D334: in every
    // Space the person reads (`--all-spaces`); an nmem without it, the home's own Space.
    async contacts(query) {
      let r = await read(["contacts", "--all-spaces", "--query", query]);
      if (!("missing" in r) && r.code !== 0 && /all-spaces|unexpected argument|unrecognized/i.test(`${r.err}\n${r.out}`)) r = await read(["contacts", "--query", query]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      const more = (Array.isArray(j?.next_args) && j.next_args.length > 0) || !!str(j?.spaces_cursor) || !!str(j?.next_spaces_cursor);
      // A card without a Space came from the home's own.
      const cards = contactsOf(j, await self()).map((c) => (c.space ? c : { ...c, ...(home.spaceId ? { space: home.spaceId } : {}), ...(home.spaceLabel ? { spaceLabel: home.spaceLabel } : {}) }));
      return { ok: true, contacts: cards, more };
    },
    async send(contact, text, space) {
      return sent(await write(["send", "--to", contact, "--body-file", "-"], text, ctxFor(space)));
    },
    // Recovery of an unknown outcome (D106): read-only, then resume the same original.
    async outbox() {
      const ops: BridgeOp[] = [];
      let answered = false;
      let lastFail: BridgeFailure | undefined;
      for (const pl of wide ? [home] : places) {
        const r = await read(["outbox"], pl.context);
        if ("missing" in r || r.code !== 0) {
          lastFail = failure(r);
          continue;
        }
        const j = parse(r.out);
        if (j === undefined) continue;
        answered = true;
        const list = Array.isArray(j?.operations) ? j.operations : Array.isArray(j?.outgoing) ? j.outgoing : Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        for (const o of list.map(opOf).filter((o: BridgeOp | undefined): o is BridgeOp => !!o)) ops.push({ ...o, ...(pl.spaceId && !wide ? { space: pl.spaceId } : {}) });
      }
      if (!answered) return lastFail ?? { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
      return { ok: true, ops };
    },
    async inspect(operation, space) {
      const r = await read(["inspect", operation], ctxFor(space));
      if ("missing" in r || r.code !== 0) return failure(r);
      const op = opOf({ operation, ...(parse(r.out) ?? {}) });
      return op ? { ok: true, op: { ...op, ...(space ? { space } : {}) } } : { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
    },
    async resume(operation, space) {
      const r = await run(["resume", operation], undefined, false, ctxFor(space));
      return sent(r);
    },
  };
}

/**
 * The Agent Context Bridge runs with, or undefined when it is off (D205). `connected`: the context
 * the user's connection in Settings › 伙伴 saved (core's bridge link), which turns Bridge on by
 * itself. DUCTER_BRIDGE=1 forces it on (tests, the fake, a context made by hand) and needs
 * DUCTER_BRIDGE_CONTEXT; DUCTER_BRIDGE=0 forces it off; DUCTER_BRIDGE_CONTEXT overrides the name.
 * Never a guessed identity or Space: with neither, it is off.
 */
export function bridgeContextFor(env: Record<string, string | undefined>, connected?: string): string | undefined {
  if (env.DUCTER_BRIDGE === "0") return undefined;
  const named = env.DUCTER_BRIDGE_CONTEXT?.trim() || undefined;
  if (env.DUCTER_BRIDGE === "1") return named;
  return connected?.trim() ? (named ?? connected.trim()) : undefined;
}

/**
 * The Bridge client for the environment and the user's connection, or null when Bridge is off.
 * D334: `where`, the Spaces the connection reads (core's bridge link); a context named by hand
 * (DUCTER_BRIDGE_CONTEXT) reads its own Space alone.
 */
export function bridgeFor(env: Record<string, string | undefined>, connected?: string, where?: BridgeWhere): BridgeClient | null {
  const context = bridgeContextFor(env, connected);
  if (!context) return null;
  const own = !env.DUCTER_BRIDGE_CONTEXT?.trim() && where?.places[0]?.context === context;
  return createNmemBridge({ context, env, ...(own ? { places: where!.places, wide: where!.wide } : {}) });
}

/** D334: what decides the partner's client: its context and every Space it reads (a change makes a new one). */
export function bridgeKeyFor(env: Record<string, string | undefined>, connected?: string, where?: BridgeWhere): string | undefined {
  const context = bridgeContextFor(env, connected);
  return context ? JSON.stringify([context, where?.wide ?? false, (where?.places ?? []).map((p) => [p.context, p.spaceId ?? ""])]) : undefined;
}

/** The Bridge client from the environment alone (DUCTER_BRIDGE=1 + DUCTER_BRIDGE_CONTEXT), or null. */
export function bridgeFromEnv(env: Record<string, string | undefined> = process.env): BridgeClient | null {
  return env.DUCTER_BRIDGE === "1" ? bridgeFor(env) : null;
}
