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
//
// D400 (nmem 0.10.121, research/161): #10402 shipped as the default `bridge inbox` ("List incoming
// identity mail across currently authorized Spaces"), with no `--all-spaces`. Its help's words (or
// `--watch`) mean wide, whatever the connection says: one plain `inbox` with the home's context, each
// message's own Space, and an entry's `open_args` / `reply_args_prefix` (Mem's own argv) used for its
// open and reply. `--wait` takes 1–5 s there, so a wait is clamped to what the help states; `--watch`
// (JSON lines, never acknowledges) is the long-poll when offered. The plain-text "Select your approved
// Agent Context…" is `not_configured`; "Identity inbox cursor no longer matches…" restarts the read
// from page one. Contacts take the grouped default (one card per identity) first, `--all-spaces` after.
//
// D557 (nmem 0.10.123 against Mem Cloud, VERIFIED 2026-11-25 in the live trial that passed every check,
// research/226 §4): an identity-inbox entry is `{message, reference, sequence, space_id, state,
// eligible, mine, read, in_reply_to, created_at_us, expires_at_ms, open_args, reply_args_prefix,
// sender}`; `open` is `{message, body, reply_to, in_reply_to, sender, space_id, created_at_us,
// outgoing, status_observed_at_us, outcome_unknown}`; `sender` is `{actor_id, member: "Member <id>",
// agent, agent_id, host?}` (`host` only on a native session: "claude-code", its `agent` the generic
// "Bridge agent"); `in_reply_to` is null on an original and the parent's id on an answer. So a
// sender's tool is read from `sender.host` alone, a message's time from `created_at_us`, and on nmem
// 0.10.120 or later every message is in the linked shape (D249 (5)'s maybe-answered rule keeps only
// older CLIs). The other fallbacks above stay for nmem 0.10.118 and 0.10.119, which still run.
import type { BridgePlace, BridgeWhere } from "../../protocol/src/internal.ts";
import { nmemEnv } from "./memory.ts";
import { ownAgentSelf } from "../../protocol/src/peer-self.ts";

export interface BridgeMessage {
  messageId: string; // the CLI's message handle (what `open` and `reply` take)
  from: string; // a readable sender: agent and member as the CLI returns them
  agent?: string; // the sending agent's own name
  host?: string; // the tool it runs in ("Claude Code"), when Mem says so and it has no name of its own
  mine?: boolean; // the sender belongs to the user (same member as the persona's owner)
  text: string; // clipped
  sentAt?: string;
  inReplyTo?: string; // set when this answers a message we sent (the CLI's in_reply_to)
  /**
   * D364: Mem's linked representation (nmem 0.10.120+, #10278) said `in_reply_to: null`: an original,
   * not an answer to anything Ducter sent.
   */
  linked?: true;
  space?: string; // D334: the exact Space it came in (its reply goes back there)
  spaceLabel?: string;
  shared?: boolean; // D334: it came in a Space the person shares with others (not their own place)
  member?: string; // D334: the sender's member by name, when Mem names one (never an id)
  /** D418: an own agent Mem doesn't name, by what its message says it is: `agent` its tool, `role` the rest. */
  selfNamed?: true;
  role?: string;
  /** D418: Mem's reply argv for it (`reply_args_prefix`), kept in the Log so a reply after a restart still goes Mem's way. */
  route?: string[];
  /** D444: what it hands over from Mem (references in its words or among Mem's typed references; a shared plan's card). */
  refs?: MessageRef[];
  /** D494: it came to one of the person's helpers (its id on the home), read with that helper's context. */
  helper?: string;
}

/** D444: one thing a message hands over from Nowledge Mem, before it is read. */
export interface MessageRef {
  uri?: string;
  title?: string;
  kind: "memory" | "artifact" | "thread" | "plan" | "other";
}

/** One recipient card from `bridge contacts`: an opaque handle plus who and where, as returned. */
export interface BridgeContact {
  contact: string; // the opaque handle `send --to` takes; choosing it grants nothing
  label: string; // "agent (member)" when the member has a name, else the agent alone, for the user's card
  agent?: string;
  /** D559: the tool it runs in, when Mem says (a native session's `sender.host`): how the person reads a nameless one. */
  host?: string;
  mine?: boolean; // the user's own agent
  description?: string;
  space?: string; // the exact Space the card came from, when the CLI says
  spaceLabel?: string; // D334
  spaceKind?: string; // D334: "personal" for the person's own place
  key?: string; // D334: one agent across Spaces (its id or name, and its member)
  /** D338: a card in a Space the home doesn't read (nmem 0.10.120's 404, nowledge-co/mem#10402): its answer may not reach the partner. */
  unheard?: true;
}

/** One outgoing operation as `bridge outbox` / `inspect` report it (tolerant; research/37 B8). */
export interface BridgeOp {
  operation: string; // the selector `inspect` and `resume` take
  /** D418: Mem listed this op with nothing but its selector and phase (nmem 0.10.121's outbox): only inspect tells what it is. */
  bare?: true;
  state: "sent" | "pending" | "failed" | "unknown";
  messageId?: string;
  inReplyTo?: string;
  body?: string;
  space?: string; // D334: the Space whose context's outbox listed it
  /** D555: whether the recipient opened what this op sent, where Mem gives a read receipt (nmem 0.10.123+). */
  read?: OpRead;
}

/**
 * D555 (research/226), D595: whether the recipient opened what an op sent. The contract, from Mem's
 * Bridge owner on nowledge-co/mem#11262 (2026-11-25) and VERIFIED read-only on nmem 0.10.124
 * (2026-11-26): each `outbox.operations[]` row and `inspect`'s top-level object carry
 * `receipt_available` and `read_state` (unread | partially_read | read) at the top; with a receipt,
 * `read_recipients` and `recipients` are integers (people) and `receipt_observed_at_us` the time it was
 * seen. Without one, `receipt_available: false` and `read_state: "unknown"`: a missing count is never a
 * zero. The nested `read_receipt` (the binary's older protocol, D555's guess) is read only as a fallback.
 */
export type OpRead = { state: "read" | "partly" | "unread"; count?: number; at?: number };
export function receiptOf(o: any): OpRead | undefined {
  const nested = o?.read_receipt && typeof o.read_receipt === "object" ? o.read_receipt : o?.receipt && typeof o.receipt === "object" ? o.receipt : undefined;
  const r = o && typeof o === "object" && "receipt_available" in o ? o : nested;
  if (!r || typeof r !== "object" || r.receipt_available !== true) return undefined;
  const s = typeof r.read_state === "string" ? r.read_state : "";
  const state = s === "read" ? "read" : s === "partially_read" ? "partly" : s === "unread" ? "unread" : undefined;
  const rr = r.read_recipients ?? r.read_count;
  const count = Number.isInteger(rr) && rr >= 0 ? (rr as number) : Array.isArray(rr) ? rr.length : undefined;
  if (!state && count === undefined) return undefined;
  const at = typeof r.receipt_observed_at_us === "number" && r.receipt_observed_at_us > 0 ? Math.floor(r.receipt_observed_at_us / 1000) : undefined;
  return { state: state ?? (count! > 0 ? "read" : "unread"), ...(count !== undefined ? { count } : {}), ...(at ? { at } : {}) };
}

/**
 * "busy": Mem's side couldn't take it right now and said it was NOT admitted (`outcome_unknown:
 * false`), after a short bounded retry (D294); nothing went out, so a later send is no replacement.
 * "unavailable": no answer, or Mem doesn't know; for a send or reply the outcome is UNKNOWN (D106).
 */
/**
 * D369: `stuck`: Mem said this mailbox can't be read until something on Mem's side is sorted out
 * (`cloud_mailbox_own_source_unreconciled`, VERIFIED 2026-11-18, research/139), not retryable and
 * nothing the person or Ducter can do from here; `code` is Mem's registered code, as it said it.
 */
export type BridgeFailure = { ok: false; reason: "not_configured" | "unavailable" | "busy" | "refused"; message: string; operation?: string; code?: string; stuck?: true };
export type BridgeResult<T> = ({ ok: true } & T) | BridgeFailure;

export interface BridgeClient {
  /**
   * New messages in the persona's inbox, with bodies, skipping ids the caller already has.
   * `reads`: the read status of our own sent messages, when the inbox reports it.
   */
  /**
   * `receives` (D604): the Spaces this mailbox was read in on this check, by id and label: Mem's
   * identity inbox lists each Space it read (`spaces[]`, `status: "observed"`), or each place read.
   */
  check(known: Set<string>): Promise<BridgeResult<{ messages: BridgeMessage[]; reads?: Record<string, boolean>; stuckIn?: { code: string; space: string }; receives?: { id: string; label: string }[] }>>;
  /**
   * The handles in the inbox, without opening any (nothing is marked read). Used once, when Bridge
   * is first on for a persona: what is already there is not a request to it (B14, D170).
   */
  inboxIds?(): Promise<BridgeResult<{ ids: string[] }>>;
  /**
   * D335: whether this CLI's `bridge inbox` takes `--wait` (a long-poll; asked of Mem in
   * nowledge-co/mem#10402). Read from `inbox --help` once per nmem version, like D205's checks.
   */
  canWait?(): Promise<boolean>;
  /**
   * D335: one long-poll, `inbox --wait <seconds>` with that context (the home's when none is given):
   * the inbox's handles once something is there or the wait ends. Opens nothing; the caller checks when a handle is new to it.
   */
  waitInbox?(seconds: number, context?: string): Promise<BridgeResult<{ ids: string[] }>>;
  /**
   * D335 with D334: the contexts to long-poll, one loop each: every place's own, or (wide) the
   * home's one, whose `inbox --all-spaces --wait` covers every Space. None given: one, the home's.
   */
  waitContexts?(): string[];
  /** D400: whether this CLI's `bridge inbox` takes `--watch` (nmem 0.10.121: JSON lines, never acknowledges). */
  canWatch?(): Promise<boolean>;
  /**
   * D400: one `inbox --watch` child with that context (the home's when none is given), running until
   * `stop()`. Each JSON line it prints calls `onChange` (the caller runs its usual check; nothing is
   * opened here). `ended` resolves when the child exits: ok after `stop()`, else why it ended.
   */
  watchInbox?(onChange: () => void, context?: string): { stop(): void; ended: Promise<BridgeResult<{}>> };
  /**
   * Reply to a received message; the CLI derives the recipient from that original.
   * A failure with reason "unavailable" means the outcome is UNKNOWN (D106): recover it, never resend.
   */
  reply(messageId: string, text: string, space?: string, route?: string[]): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /**
   * D560: which of the person's own AI tools Mem says can receive now: an active connection Mem labels
   * with that tool (`bridge connections list`, `client_label`: what a native session's prepare makes),
   * never Ducter's own identities. Only `open: true` comes back; a tool Mem says nothing about is left
   * out, never guessed closed from a name (D444's card-name reading, retired). Read only.
   */
  mailboxes?(): Promise<BridgeResult<{ list: { harness: string; open: boolean }[] }>>;
  /**
   * D444: one `nowledgemem://` reference a message handed over, resolved read-only (`resources get`):
   * Mem's title for it and its first words. undefined when Mem didn't answer.
   */
  resource?(uri: string): Promise<{ title?: string; text?: string } | undefined>;
  /** Read-only recipient discovery in every Space the home reads (D334; one bounded page each). */
  contacts?(query: string): Promise<BridgeResult<{ contacts: BridgeContact[]; more: boolean }>>;
  /** A new message to a contact handle the user confirmed on a card, sent in the card's Space. Failures as for `reply`. */
  send?(contact: string, text: string, space?: string): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /** Recovery after an unknown outcome (D106): recent outgoing operations, then the one original. */
  outbox?(spaces?: string[]): Promise<BridgeResult<{ ops: BridgeOp[]; complete?: boolean }>>;
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
  timeoutMs?: number; // per call, default CALL_TIMEOUT_MS (D409)
  maxOpen?: number; // bodies opened per check, default 5
  inboxPages?: number; // D367: inbox pages read per inbox, default 25 (20 messages each in nmem 0.10.120)
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
/**
 * D369: Mem's word that a mailbox needs sorting out on Mem's side before it can be read (nmem 0.10.120
 * has no command for it): `cloud_mailbox_own_source_unreconciled`, 409, not retryable. Any other
 * `cloud_mailbox_*_unreconciled` code is read the same way.
 */
export const mailboxStuck = (e: MailboxError) => /^cloud_mailbox_\w*_unreconciled$/.test(e.code ?? "") && e.retryable !== true;
/** Mem's side can't take it right now: worth a short wait and one more try (D294). */
export const transient = (e: MailboxError) => e.http === 503 || e.http === 429 || /_(unavailable|busy|capacity)$/.test(e.code ?? "") || e.retryable === true;

/** Agents Mem names only generically: every native session's Agent is "Bridge agent" (research/66 §7). */
const GENERIC_AGENT = /^bridge agent$/i;

const MAX_TEXT = 4000;
/**
 * D409: how long one nmem call may take before it is given up. nmem 0.10.121's identity inbox reads
 * every authorized Space in one call: against Mem Cloud with eight Spaces it took 44 to 52 s, and
 * `contacts` 31 to 40 s (VERIFIED, the live trial of 2026-11-20, research/161 §9). The old 20 s
 * killed every inbox read, so nothing sent to the partner was ever seen. Twice the slowest seen.
 */
export const CALL_TIMEOUT_MS = 120_000;
/** D418: how long Mem keeps a message (an entry's `expires_at_ms` is 7 days after its send, VERIFIED research/161 §9). */
export const MEM_TTL_MS = 7 * 86_400_000;
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

// The tools a sender may run in, by the host ids Mem uses (`bridge session --host`, `source_app`), in the
// tool's own name. An id not listed says nothing a person reads, so it is dropped.
const HOSTS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "codex-cli": "Codex",
  grok: "Grok Build",
  "grok-build": "Grok Build",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  "copilot-cli": "Copilot CLI",
  opencode: "OpenCode",
  pi: "pi",
};

/**
 * The tool a sender runs in, when Mem says. D557: `sender.host` is where Mem says it (VERIFIED, nmem
 * 0.10.123, 2026-11-25: "claude-code" on a native session's message); the guessed places are gone.
 * Only a known tool, by its name.
 */
export function hostOf(m: any): string | undefined {
  const h = str(m?.sender?.host);
  return h ? HOSTS[h.toLowerCase()] : undefined;
}

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

/**
 * D367: the cursor to the inbox's next page, or undefined on the last one. nmem 0.10.120 (VERIFIED
 * 2026-11-18, research/137): 20 messages a page, oldest first, `next` a cursor for `--cursor`, "" on
 * the last page. `next_cursor` is the same thing by another name; an older answer has neither.
 */
export function inboxNext(j: any): string | undefined {
  return str(j?.next) ?? str(j?.next_cursor);
}

/** D400: what an nmem's `bridge inbox` offers, read from its `--help`. */
export interface InboxShape {
  /** nmem 0.10.121+ (#10402): the plain `inbox` reads the identity's mail in every authorized Space. */
  identity: boolean;
  /** An earlier preview of #10402: `inbox --all-spaces` does. */
  allSpaces: boolean;
  /** The longest `--wait` it takes, in seconds; 0 without `--wait`. */
  waitMax: number;
  /** `--watch`: changes as JSON lines, continuously. */
  watch: boolean;
}
const SAID_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, thirty: 30, sixty: 60 };
/** Before 0.10.121 no released CLI had `--wait`; the fake's older help states no bound (D335's 25 s). */
export const UNSTATED_WAIT_S = 25;
/**
 * D400: the shape from `bridge inbox --help`. nmem 0.10.121 (VERIFIED, research/161): "List incoming
 * identity mail across currently authorized Spaces", `--wait <WAIT>` "Wait up to five seconds…"
 * (1..=5), `--watch`; no `--all-spaces`.
 */
export function inboxShapeIn(help: string): InboxShape {
  const allSpaces = /--all-spaces\b/.test(help);
  const watch = /--watch\b/.test(help);
  const identity = /identity mail across/i.test(help) || (watch && !allSpaces);
  let waitMax = 0;
  if (/--wait\b/.test(help)) {
    const line = help.split("\n").find((l) => /--wait\b/.test(l)) ?? "";
    const said = /up to (\d+|[a-z]+) seconds?/i.exec(line)?.[1]?.toLowerCase();
    const range = /\b1\s*\.\.=?\s*(\d+)\b/.exec(line)?.[1];
    const n = said ? (/^\d+$/.test(said) ? Number(said) : SAID_NUMBERS[said]) : range ? Number(range) : undefined;
    waitMax = n && n > 0 ? n : identity ? 5 : UNSTATED_WAIT_S;
  }
  return { identity, allSpaces, waitMax, watch };
}

/** D400: the bound in a refused wait ("25 is not in 1..=5"), so the next one asks for what it takes. */
export function waitBoundIn(text: string): number | undefined {
  const m = /\b\d+ is not in (\d+)\s*\.\.=?\s*(\d+)/.exec(text);
  return m ? Number(m[2]) : undefined;
}

/**
 * D400: an argv Mem returned on an inbox entry (`open_args`, `reply_args_prefix`), as the arguments
 * after `nmem`: only strings, only a `bridge <verb>` command, never another verb Ducter doesn't run
 * for it; `--json` is dropped (the client adds its own). Undefined when it isn't one.
 */
export function memArgv(v: unknown, verb: "open" | "reply"): string[] | undefined {
  if (!Array.isArray(v) || !v.length || !v.every((a) => typeof a === "string" && a.length > 0 && a.length < 2048)) return undefined;
  let rest = v as string[];
  if (/(^|\/)nmem(\.exe)?$/.test(rest[0]!)) rest = rest.slice(1);
  rest = rest.filter((a) => a !== "--json" && a !== "-j");
  const b = rest.indexOf("bridge");
  if (b < 0) return undefined;
  const words = rest.slice(b + 1).filter((a) => !a.startsWith("-"));
  if (words[0] !== verb) return undefined;
  // Before `bridge`, only global flags and their values (`--agent-context=x` or `--agent-context x`).
  const head = rest.slice(0, b);
  if (head.some((a, i) => !a.startsWith("-") && !(i > 0 && head[i - 1]!.startsWith("-") && !head[i - 1]!.includes("=")))) return undefined;
  return rest;
}

/** D400: whether a `memArgv` already names what it acts on (a word after its verb, e.g. the `bm1:` reference). */
export function namesTarget(args: readonly string[]): boolean {
  const b = args.indexOf("bridge");
  const words: string[] = [];
  for (let i = b + 1; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("-")) {
      if (!a.includes("=") && /^--(body-file|body|shared-document|cursor|to)$/.test(a)) i++; // a flag that takes the next word
      continue;
    }
    words.push(a);
  }
  return words.length > 1;
}

/**
 * D400: a Space the identity inbox couldn't read this time, as nmem 0.10.121 reports it beside the
 * messages (`spaces[]`: `{space_id, status: "unavailable", error_code}`, VERIFIED 2026-11-19), when
 * it is D369's stuck code: the read worked, that one Space didn't.
 */
export function stuckSpaceIn(j: any): { code: string; space: string } | undefined {
  for (const s of Array.isArray(j?.spaces) ? j.spaces : []) {
    const code = str(s?.error_code);
    const space = str(s?.space_id) ?? str(s?.space?.id);
    if (code && space && str(s?.status) !== "observed" && mailboxStuck({ code, ...(typeof s?.retryable === "boolean" ? { retryable: s.retryable } : {}) })) return { code, space };
  }
  return undefined;
}

/**
 * D461: an identity inbox that answered with no message and every Space it covers unavailable is
 * no read at all (VERIFIED live, research/200: a context whose connection was revoked gets exit 0,
 * `messages: []` and each Space `{status: "unavailable", error_code:
 * "cloud_agent_context_authority_denied"}`). The first Space's code, or undefined when the read counts.
 */
export function inboxRefused(j: any): string | undefined {
  const spaces = Array.isArray(j?.spaces) ? j.spaces : [];
  const list = Array.isArray(j?.messages) ? j.messages : Array.isArray(j?.incoming) ? j.incoming : [];
  if (!spaces.length || list.length) return undefined;
  if (!spaces.every((s: any) => str(s?.status) === "unavailable" || (!!str(s?.error_code) && str(s?.status) !== "observed"))) return undefined;
  return str(spaces[0]?.error_code) ?? "unavailable";
}

/** D400: Mem's word that an identity inbox cursor is stale (a Context or Space changed): read again from page one. */
export const cursorStale = (text: string) => /cursor no longer matches|restart the inbox/i.test(text);

/** D367: two inbox pages as one answer: messages in order, each once; a later page's read status wins. */
export function mergeInboxPages(a: any, b: any): any {
  const key = (m: any) => (typeof m === "string" ? m : str(m?.message) ?? str(m?.message_id) ?? str(m?.id));
  const join = (x: unknown, y: unknown) => {
    const list = [...(Array.isArray(x) ? x : []), ...(Array.isArray(y) ? y : [])];
    const seen = new Set<string>();
    return list.filter((m) => {
      const k = key(m);
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const out: any = { ...a, ...b };
  for (const f of ["messages", "incoming"]) if (Array.isArray(a?.[f]) || Array.isArray(b?.[f])) out[f] = join(a?.[f], b?.[f]);
  // D409: nmem 0.10.121 reports each Space's read under `spaces[]` (our sent mail's read status in its
  // `outgoing`), and a later page lists only the Spaces that had more: every Space stays, the later
  // page's word on it wins, and its `outgoing` keeps what an earlier page said.
  if (Array.isArray(a?.spaces) || Array.isArray(b?.spaces)) {
    const sid = (x: any) => str(x?.space_id) ?? str(x?.space?.id);
    const by = new Map<string, any>();
    const rest: any[] = [];
    for (const x of [...(Array.isArray(a?.spaces) ? a.spaces : []), ...(Array.isArray(b?.spaces) ? b.spaces : [])]) {
      const k = sid(x);
      if (!k) {
        rest.push(x);
        continue;
      }
      const was = by.get(k);
      by.set(k, was ? { ...was, ...x, outgoing: [...(Array.isArray(was.outgoing) ? was.outgoing : []), ...(Array.isArray(x?.outgoing) ? x.outgoing : [])] } : x);
    }
    out.spaces = [...by.values(), ...rest];
  }
  for (const f of ["outgoing", "sent"])
    if (Array.isArray(a?.[f]) || Array.isArray(b?.[f])) {
      const later = Array.isArray(b?.[f]) ? b[f] : [];
      const ids = new Set(later.map(key).filter(Boolean));
      out[f] = [...(Array.isArray(a?.[f]) ? a[f] : []).filter((m: any) => !ids.has(key(m))), ...later];
    }
  return out;
}

/** Read status of our own sent messages, from the inbox's outgoing refresh (when present). */
export function outgoingReads(j: any): Record<string, boolean> | undefined {
  const top = Array.isArray(j?.outgoing) ? j.outgoing : Array.isArray(j?.sent) ? j.sent : undefined;
  // D409: nmem 0.10.121 (VERIFIED 2026-11-20): `spaces[].outgoing`, one list per Space, none at the top.
  const per = Array.isArray(j?.spaces) ? j.spaces.filter((x: any) => Array.isArray(x?.outgoing)).flatMap((x: any) => x.outgoing) : [];
  const list = top || per.length ? [...(top ?? []), ...per] : undefined;
  if (!list) return undefined;
  const out: Record<string, boolean> = {};
  for (const m of list) {
    const id = str(m?.message) ?? str(m?.message_id) ?? str(m?.id);
    // nmem 0.10.118 (VERIFIED): `{message, status: "delivered"|"read", read_recipients, recipients}`.
    // D595: `read_recipients` is an integer (Mem's contract, #11262; VERIFIED 0.10.124), read first; the
    // words only when there is no count, and whole ("unread" is never a read).
    if (!id) continue;
    const n = m?.read_recipients;
    out[id] = Number.isInteger(n) ? n > 0 : m?.read === true || !!str(m?.read_at) || /^(read|partially_read|opened)$/i.test(str(m?.state) ?? str(m?.status) ?? "");
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
/** D444: the AI tool a contact card's agent runs, by its name, host or description (Ducter's harness ids). */
export function toolOfCard(c: any): string | undefined {
  const text = [agentOf(c), hostOf(c), str(c?.agent?.description) ?? str(c?.description), str(c?.agent?.source_app) ?? str(c?.source_app)].filter(Boolean).join(" ");
  if (/claude[\s-]?code|\bclaude\b/i.test(text)) return "claude-code";
  if (/\bcodex\b/i.test(text)) return "codex";
  if (/antigravity|\bagy\b/i.test(text)) return "antigravity";
  if (/\bpi\b/.test(text)) return "pi";
  return undefined;
}

/** D560: Mem's own tool label on a connection (`client_label`), as Ducter's harness id. */
const LABEL_HARNESS: Record<string, string> = { "claude-code": "claude-code", codex: "codex", "codex-cli": "codex", antigravity: "antigravity", agy: "antigravity" };

/**
 * D560: the person's own AI tools Mem says can receive now, from `bridge connections list` (schema 2,
 * VERIFIED on hel 2026-11-25: `connections[] {connection_id, agent_id, client_label, state, created_at_ms,
 * last_seen_at_ms, home_id, device_label}`, `next_connection_id`). A connection is the tool's when Mem
 * labels it so (`client_label` "claude-code" or "codex": what each native session's prepare makes) and
 * it is `active`. Ducter's own identities (the partner's, its helpers', its trials': `skip`) are never the
 * person's tool, whatever their session's label. A tool Mem says nothing about is left out, never guessed
 * closed from a card's name (D444 read "Claude 收尾协调", a closed identity, as Claude Code's mailbox).
 */
export function receiversOf(j: any, skip: (agentId: string) => boolean = () => false): { harness: string; open: boolean }[] {
  const list = Array.isArray(j?.connections) ? j.connections : [];
  const out: { harness: string; open: boolean }[] = [];
  for (const c of list) {
    const h = LABEL_HARNESS[(str(c?.client_label) ?? "").toLowerCase()];
    const agent = str(c?.agent_id);
    if (!h || !agent || skip(agent) || str(c?.state) !== "active") continue;
    if (!out.some((x) => x.harness === h)) out.push({ harness: h, open: true });
  }
  return out;
}

/** D560: an identity Ducter made (the partner's default `ducter`, `ducter-helper-…`, `ducter-trial-…`). */
export const ducterIdentity = (agentId: string): boolean => /^ducter(-|$)/i.test(agentId);

const REF_URI = /nowledgemem:\/\/[^\s<>"'`)\]}，。；、]+/g;

/** D444: the kind of thing a `nowledgemem://` reference names, by its path. */
export function refKind(uri: string): MessageRef["kind"] {
  const head = uri.replace(/^nowledgemem:\/\//i, "").split(/[/?#]/)[0]!.toLowerCase();
  if (/^memor(y|ies)$/.test(head)) return "memory";
  if (/^(artifacts?|sources?|library|lib|files?|documents?|docs?)$/.test(head)) return "artifact";
  if (/^threads?$|^conversations?$/.test(head)) return "thread";
  // D461: Mem's own kinds (live: memory, thread, source; its resolver also names collaboration,
  // working-memory and context); a plural or another word is refused by Mem ("unsupported kind").
  if (/^(collab|collaboration|plans?|notes)$/.test(head)) return "plan";
  return "other";
}

/**
 * D444: what a message hands over from Mem: `nowledgemem://` references in its words, Mem's typed
 * references (`references` / `knowledge_references`, each `{uri, purpose, origin}`), and a shared
 * plan's card (`shared_document`, named only). At most three, each once.
 */
export function refsIn(b: any, body: string): MessageRef[] {
  const out: MessageRef[] = [];
  const add = (r: MessageRef) => {
    if (out.length >= 3 || (r.uri && out.some((x) => x.uri === r.uri))) return;
    out.push(r);
  };
  const m = b?.message && typeof b.message === "object" ? b.message : undefined;
  for (const list of [b?.references, b?.knowledge_references, m?.references, m?.knowledge_references])
    if (Array.isArray(list))
      for (const x of list) {
        const uri = str(x?.uri) ?? str(x?.reference?.uri);
        if (uri && /^nowledgemem:\/\//i.test(uri)) add({ uri, kind: refKind(uri), ...(str(x?.title) ? { title: clip(str(x.title)!, 80) } : {}) });
      }
  for (const u of body.match(REF_URI) ?? []) add({ uri: u.replace(/[.,;:!?]+$/, ""), kind: refKind(u) });
  for (const d of [b?.shared_document, m?.shared_document]) {
    const title = str(d?.title) ?? str(d?.document?.title);
    if (d && typeof d === "object" && title) add({ title: clip(title, 80), kind: "plan" });
  }
  return out;
}

/** D461: a Markdown body without the YAML frontmatter block Mem puts first (ids, Space, scores: not words to read). */
export function withoutFrontmatter(body: string): string {
  const m = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(body);
  return m ? body.slice(m[0].length) : body;
}

/**
 * D444: Mem's title and first words for a resolved resource (`resources get --json`), read tolerantly.
 * D461, VERIFIED live on nmem 0.10.121 for a memory, a thread and a source (research/200):
 * `{requested_uri, canonical_uri, kind, path, mime_type: "text/markdown", body, frontmatter: {title, …}}`,
 * and `body` starts with the same frontmatter as a YAML block, which is cut before the words are read.
 */
export function resourceOf(out: string): { title?: string; text?: string } | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    const t = withoutFrontmatter(out).trim();
    return t ? { text: clip(t, 600) } : undefined;
  }
  const r = j?.resource && typeof j.resource === "object" ? j.resource : j;
  const fm = r?.frontmatter && typeof r.frontmatter === "object" ? r.frontmatter : r?.metadata && typeof r.metadata === "object" ? r.metadata : {};
  const title = str(r?.title) ?? str(fm?.title) ?? str(r?.name) ?? str(r?.memory?.title) ?? str(r?.artifact?.title);
  const raw = str(r?.body) ?? str(r?.content) ?? str(r?.text) ?? str(r?.memory?.content);
  const text = raw ? str(withoutFrontmatter(raw)) : undefined;
  if (!title && !text) return undefined;
  return { ...(title ? { title: clip(title, 80) } : {}), ...(text ? { text: clip(text, 600) } : {}) };
}

/**
 * Whether `bridge contacts` has more to show than this page. D461, VERIFIED live (research/200): the
 * grouped answer pages Spaces with `spaces_cursor`, `spaces_next_args`, `spaces_truncated` and
 * `space_batch {offset, count, total}`; its top-level `next` is a sentence, not a cursor.
 */
export function contactsMore(j: any): boolean {
  const b = j?.space_batch;
  const batchShort = !!b && typeof b.offset === "number" && typeof b.count === "number" && typeof b.total === "number" && b.offset + b.count < b.total;
  return (Array.isArray(j?.next_args) && j.next_args.length > 0) || (Array.isArray(j?.spaces_next_args) && j.spaces_next_args.length > 0) || j?.spaces_truncated === true || batchShort || !!str(j?.spaces_cursor) || !!str(j?.next_spaces_cursor);
}

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
  // D418: nmem 0.10.121's outbox lists `{operation, phase}` only (VERIFIED on hel 2026-11-20); inspect has the rest.
  const bare = !messageId && !inReplyTo && !body;
  const read = receiptOf(o);
  return { operation, state: opState(o?.state ?? o?.status ?? o?.phase), ...(messageId ? { messageId } : {}), ...(inReplyTo ? { inReplyTo } : {}), ...(body ? { body } : {}), ...(bare ? { bare: true as const } : {}), ...(read ? { read } : {}) };
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
  const timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
  const maxOpen = opts.maxOpen ?? 5;
  const inboxPages = Math.max(1, opts.inboxPages ?? 25);
  // D334: the home's own context first; every other Space it reads after it, each once.
  const places: BridgePlace[] = [];
  for (const p of [{ context: opts.context }, ...(opts.places ?? [])]) {
    const same = places.find((x) => x.context === p.context);
    if (same) Object.assign(same, { ...p, ...same, ...(p.spaceId ? { spaceId: p.spaceId } : {}), ...(p.spaceLabel ? { spaceLabel: p.spaceLabel } : {}), ...(p.kind ? { kind: p.kind } : {}) });
    else places.push({ ...p });
  }
  const wide = !!opts.wide;
  // D400: wide also when this nmem's plain `inbox` is the identity inbox (0.10.121), whatever the connection said.
  let wideNow = wide;
  // D557: this nmem asks for Mem's linked shape (0.10.120+), so every message it opens is an original or an answer.
  let linksNow = false;
  const home = places[0]!;
  /** The context that reads (and answers in) a Space; the home's own when it isn't one the home reads. */
  const ctxFor = (space?: string): string => (wideNow || !space ? home.context : (places.find((p) => p.spaceId === space)?.context ?? home.context));
  // `whole`: the arguments are a whole nmem command (not a `bridge` one under the context).
  // D335: `limitMs` for a long-poll, which holds the read open longer than any other call.
  const run = async (args: string[], o: { input?: string; whole?: boolean; ctx?: string; limitMs?: number } = {}): Promise<{ code: number; out: string; err: string } | { missing: true }> => {
    const { input, whole = false, ctx = home.context, limitMs = timeoutMs } = o;
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
    const timer = setTimeout(() => proc.kill(), limitMs);
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
  const read = (args: string[], ctx = home.context) => retried(() => run(args, { ctx }), false);
  /** D400: a whole nmem command Mem handed back (`open_args`, `reply_args_prefix`), with `--json` added. */
  const readWhole = (args: string[]) => retried(() => run(args, { whole: true }), false);
  const writeWhole = (args: string[], input: string) => retried(() => run(args, { input, whole: true }), true);
  const write = (args: string[], input: string, ctx = home.context) => retried(() => run(args, { input, ctx }), true);
  const failure = (r: Ran): BridgeFailure => {
    if ("missing" in r) return { ok: false, reason: "not_configured", message: "Nowledge Mem isn't installed on this machine." };
    const text = `${r.err}\n${r.out}`;
    const operation = operationIn(r.out) ?? operationIn(r.err);
    const op = operation ? { operation } : {};
    const e = mailboxError(text);
    // D369: before "outcome unknown": Mem says the mailbox itself needs sorting out (a read that changed nothing).
    // D400: nmem 0.10.121's plain-text refusals (no JSON even under --json): the identity inbox wants the approved context.
    if (/select your approved agent context|select the original agent context/i.test(text)) return { ok: false, reason: "not_configured", message: "Nowledge Mem wants the partner's approved Agent Context for its inbox.", ...op };
    if (mailboxStuck(e)) return { ok: false, reason: "refused", stuck: true, code: e.code!, message: "Nowledge Mem has to sort out this mailbox on its side before it can be read; nothing to do here.", ...op };
    // Mem's own word on the outcome first: unknown is recovered, never called refused (D106).
    if (e.unknown === true) return { ok: false, reason: "unavailable", message: "Nowledge Mem didn't say whether it went out.", ...op };
    if (e.unknown === false && transient(e)) return { ok: false, reason: "busy", message: "Nowledge Mem can't take messages right now; nothing went out.", ...op };
    if (e.unknown === false && e.code && !/agent_context|not_configured/.test(e.code)) return { ok: false, reason: "refused", message: "Nowledge Mem didn't take it; nothing went out.", ...op };
    // D418: Mem said plainly it didn't go (`outcome_unknown: false`), with no code to say why: refused, not unknown.
    if (e.unknown === false && !e.code) return { ok: false, reason: "refused", message: "Nowledge Mem didn't take it; nothing went out.", ...op };
    if (/not admitted|denied|forbidden|role_insufficient|403|refus/i.test(text)) return { ok: false, reason: "refused", message: "Bridge refused this connection.", ...op };
    if (/agent context|not configured|api key|401|unknown context/i.test(text)) return { ok: false, reason: "not_configured", message: "Bridge isn't set up for this partner.", ...op };
    // D418: the CLI turned the call down before reaching Mem (clap's usage error, exit 2), or Mem said the
    // message isn't there or is past its time: nothing went out.
    if (r.code === 2 || /\b(not found|no such message|unknown message|expired|not eligible|invalid value|unexpected argument)\b/i.test(text)) return { ok: false, reason: "refused", message: `Nowledge Mem didn't take it (${clip(text.trim(), 120)}).`, ...op };
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
  const where = new Map<string, Promise<{ custodian?: string; space?: string; agent?: string; personal: boolean }>>();
  const placeOf = (ctx: string) => {
    let p = where.get(ctx);
    if (!p) {
      p = (async () => {
        const c = await run(["agents", "context", "show", "--name", ctx], { whole: true });
        if ("missing" in c || c.code !== 0) return { personal: false };
        const sel = parse(c.out)?.selection;
        const custodian = str(sel?.address?.custodian_id);
        const space = str(sel?.scope?.space_id);
        const agent = str(sel?.address?.agent_id);
        return { ...(custodian ? { custodian } : {}), ...(space ? { space } : {}), ...(agent ? { agent } : {}), personal: !!custodian && space === `personal-${custodian}` };
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
  // D335, D400: what `inbox` offers (its --help), per nmem version; the version is looked at again after 5 min.
  const shapeBy = new Map<string, InboxShape | undefined>();
  let shapeAt = -Infinity;
  let shapeNow: Promise<InboxShape | undefined> | undefined;
  const inboxShape = (): Promise<InboxShape | undefined> => {
    if (shapeNow && Date.now() - shapeAt < 5 * 60_000) return shapeNow;
    shapeAt = Date.now();
    return (shapeNow = (async () => {
      const v = await run(["--version"], { whole: true });
      if ("missing" in v || v.code !== 0) return undefined;
      const version = (v.out || v.err).trim();
      linksNow = linksReplies(version);
      if (!shapeBy.has(version)) {
        const h = await run(["inbox", "--help"]);
        shapeBy.set(version, "missing" in h || h.code !== 0 ? undefined : inboxShapeIn(`${h.out}\n${h.err}`));
      }
      const sh = shapeBy.get(version);
      wideNow = wide || !!sh?.identity;
      return sh;
    })());
  };
  let waitCap: number | undefined; // D400: the bound a refused wait named
  const replyBy = new Map<string, string[]>(); // D400: Mem's reply argv prefix per message handle (this run)
  /** D418: Mem's reply argv for a message, from a fresh read of the inbox (its entry stays listed until it expires). */
  const routeFor = async (messageId: string): Promise<string[] | undefined> => {
    for (const { pl, args } of await inboxes()) {
      const got = await readInbox(args, pl.context);
      if ("fail" in got) continue;
      const list = Array.isArray(got.j?.messages) ? got.j.messages : [];
      for (const m of list) {
        const id = typeof m === "object" ? (str(m?.message) ?? str(m?.message_id) ?? str(m?.id)) : undefined;
        const r = id && typeof m === "object" ? memArgv(m?.reply_args_prefix, "reply") : undefined;
        if (id && r) replyBy.set(id, r);
      }
      if (replyBy.has(messageId)) return replyBy.get(messageId);
    }
    return undefined;
  };
  const sent = (r: { code: number; out: string; err: string } | { missing: true }): BridgeResult<{ messageId?: string; operation?: string }> => {
    if ("missing" in r || r.code !== 0) return failure(r);
    const j = parse(r.out);
    if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer; it may or may not have gone out." };
    const id = str(j?.message) ?? str(j?.message_id);
    const operation = str(j?.operation) ?? str(j?.operation_id);
    return { ok: true, ...(id ? { messageId: id } : {}), ...(operation ? { operation } : {}) };
  };
  /**
   * The inboxes to read: each place's own, or (wide) the home's one inbox for every Space: D400, the
   * plain `inbox` on an identity-inbox nmem (0.10.121), else `inbox --all-spaces`.
   */
  const inboxes = async (): Promise<{ pl: BridgePlace; args: string[] }[]> => {
    const sh = await inboxShape();
    if (!wideNow) return places.map((pl) => ({ pl, args: ["inbox"] }));
    return [{ pl: home, args: sh?.identity && !sh.allSpaces ? ["inbox"] : ["inbox", "--all-spaces"] }];
  };
  /**
   * D400: the person's Spaces by id, from passive `bridge setup` (no context, nothing chosen), read once
   * when the identity inbox names a Space only by id (nmem 0.10.121's entries carry `space_id` alone).
   */
  const names = new Map<string, { spaceLabel?: string; kind?: string }>();
  let namesRead: Promise<void> | undefined;
  const learnNames = () =>
    (namesRead ??= (async () => {
      const r = await run(["bridge", "setup"], { whole: true });
      if ("missing" in r || r.code !== 0) return void (namesRead = undefined);
      for (const c of Array.isArray(parse(r.out)?.candidates) ? parse(r.out).candidates : []) {
        const id = str(c?.id);
        if (id) names.set(id, { ...(str(c?.label) ? { spaceLabel: str(c.label) } : {}), ...(str(c?.kind) ? { kind: str(c.kind) } : {}) });
      }
    })());
  /** D334: the Space an inbox entry or an opened message names (wide), else its place's. */
  const spaceIn = (o: any, pl: BridgePlace): { id?: string; label?: string; kind?: string } => {
    const id = str(o?.space_id) ?? str(o?.resolved_space_id) ?? str(o?.space?.id) ?? (typeof o?.space === "string" ? o.space : undefined);
    if (wideNow && id) {
      const known = places.find((p) => p.spaceId === id) ?? names.get(id);
      const label = str(o?.space?.label) ?? str(o?.space_label) ?? str(o?.space_name) ?? known?.spaceLabel;
      const kind = str(o?.space?.kind) ?? str(o?.space_kind) ?? known?.kind;
      return { id, ...(label ? { label } : {}), ...(kind ? { kind } : {}) };
    }
    return { ...(pl.spaceId ? { id: pl.spaceId } : {}), ...(pl.spaceLabel ? { label: pl.spaceLabel } : {}), ...(pl.kind ? { kind: pl.kind } : {}) };
  };
  /**
   * D367: the rest of an inbox after its first page, as one answer. Mem answers oldest first, so the
   * newest mail is on the last page: every page is read, at most `inboxPages`. A page that fails or
   * adds nothing ends it with what came so far (the next check reads again).
   */
  const restOfInbox = async (first: any, args: string[], ctx: string): Promise<any> => {
    let all = first;
    let page = first;
    let restarted = false;
    for (let n = 1; n < inboxPages; n++) {
      const cursor = inboxNext(page);
      if (!cursor) break;
      const r = await read([...args, "--cursor", cursor], ctx);
      // D400: an identity cursor goes stale when a Context or Space changes: once, from page one again.
      if (!("missing" in r) && r.code !== 0 && !restarted && cursorStale(`${r.err}\n${r.out}`)) {
        restarted = true;
        const again = await read(args, ctx);
        const p0 = "missing" in again || again.code !== 0 ? undefined : parse(again.out);
        if (p0 === undefined) break;
        all = mergeInboxPages(all, p0);
        page = p0;
        n = 0;
        continue;
      }
      if ("missing" in r || r.code !== 0) break;
      const p = parse(r.out);
      if (p === undefined) break;
      const had = inboxIds(all).length;
      all = mergeInboxPages(all, p);
      if (inboxIds(all).length === had) break; // nothing new: never a loop on a cursor that repeats
      page = p;
    }
    return all;
  };
  /** One inbox, every page (D367): the answer, or why it didn't come. */
  const readInbox = async (args: string[], ctx: string): Promise<{ j: any } | { fail: BridgeFailure }> => {
    const r = await read(args, ctx);
    if ("missing" in r || r.code !== 0) return { fail: failure(r) };
    const j = parse(r.out);
    if (j === undefined) return { fail: { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." } };
    return { j: await restOfInbox(j, args, ctx) };
  };
  return {
    async check(known) {
      const messages: BridgeMessage[] = [];
      let reads: Record<string, boolean> | undefined;
      let stuckIn: { code: string; space: string } | undefined;
      let answered = false;
      let lastFail: BridgeFailure | undefined;
      // D604: the Spaces this mailbox was read in, so the home knows (and says) where it receives.
      const receives: { id: string; label: string }[] = [];
      const receivesIn = async (j: any, pl: BridgePlace) => {
        const seen = Array.isArray(j?.spaces) ? j.spaces.filter((x: any) => str(x?.status) === "observed" && str(x?.space_id)) : [];
        if (wideNow && seen.length) {
          if (seen.some((x: any) => !str(x?.space?.label) && !places.some((p) => p.spaceId === str(x.space_id) && p.spaceLabel) && !names.has(str(x.space_id)!))) await learnNames().catch(() => {});
          for (const x of seen) {
            const sp = spaceIn(x, pl);
            if (sp.id && !receives.some((r) => r.id === sp.id)) receives.push({ id: sp.id, label: sp.label ?? sp.id });
          }
        } else if (pl.spaceId && !receives.some((r) => r.id === pl.spaceId)) receives.push({ id: pl.spaceId, label: pl.spaceLabel ?? pl.spaceId });
      };
      for (const { pl, args } of await inboxes()) {
        const got = await readInbox(args, pl.context);
        if ("fail" in got) {
          lastFail = got.fail;
          continue; // one Space not answering doesn't hide the others'
        }
        const j = got.j;
        // D461: every Space refused: not an empty inbox, and not a read.
        const refused = inboxRefused(j);
        if (refused) {
          lastFail = { ok: false, reason: /_denied$|_forbidden$/.test(refused) ? "refused" : "unavailable", code: refused, message: /_denied$|_forbidden$/.test(refused) ? "Bridge refused this connection." : "Nowledge Mem couldn't read any of the partner's Spaces just now." };
          continue;
        }
        answered = true;
        stuckIn ??= stuckSpaceIn(j);
        await receivesIn(j, pl);
        const list = Array.isArray(j?.messages) ? j.messages : Array.isArray(j?.incoming) ? j.incoming : [];
        const entry = (id: string) => list.find((m: any) => (typeof m === "string" ? m : str(m?.message) ?? str(m?.message_id) ?? str(m?.id)) === id);
        // D400: nmem 0.10.121 marks an entry it won't open (`eligible: false`, e.g. `state: "expired"`,
        // VERIFIED 2026-11-19): never opened, so it isn't tried again every check.
        const closed = (id: string) => {
          const e = entry(id);
          return !!e && typeof e === "object" && (e.eligible === false || /^expired$/i.test(str(e.state) ?? ""));
        };
        const fresh = inboxIds(j).filter((id) => !known.has(id) && !closed(id) && !messages.some((m) => m.messageId === id)).slice(0, Math.max(0, maxOpen - messages.length));
        const mine = fresh.length ? await self() : undefined;
        if (fresh.length && wideNow && fresh.some((id) => {
          const e = entry(id);
          const sid = typeof e === "object" ? str(e?.space_id) ?? str(e?.space?.id) : undefined;
          return !!sid && !str(e?.space?.label) && !places.some((p) => p.spaceId === sid && p.spaceLabel) && !names.has(sid);
        })) await learnNames();
        for (const id of fresh) {
          // D400: Mem's own argv for this entry when it gives one (the identity inbox: the Context it came by).
          const e0 = entry(id);
          const openArgs = typeof e0 === "object" ? memArgv(e0?.open_args, "open") : undefined;
          const listed = typeof e0 === "object" ? memArgv(e0?.reply_args_prefix, "reply") : undefined;
          if (listed) replyBy.set(id, listed);
          // `open` records this recipient's first read: Ducter has the body in its Log from here on.
          // nmem 0.10.121 (VERIFIED 2026-11-19): Mem's argv already ends in the entry's `reference` (`bm1:…`).
          const o = openArgs ? await readWhole(namesTarget(openArgs) ? openArgs : [...openArgs, id]) : await read(["open", id], pl.context);
          if ("missing" in o || o.code !== 0) continue; // left unread; the next check tries again
          const b = parse(o.out);
          const body = str(b?.body) ?? str(b?.message?.body) ?? str(b?.text);
          if (!body) continue;
          // D595: nmem 0.10.124's `open` returns the same scoped reply argv as the entry (#11277 via #11288,
          // VERIFIED read-only 2026-11-26): the opened message's own is taken first, the entry's for an older nmem.
          const replyArgs = memArgv(b?.reply_args_prefix, "reply") ?? listed;
          if (replyArgs) replyBy.set(id, replyArgs);
          // D418: nmem 0.10.121's `open` carries no time; its entry's `expires_at_ms` is 7 days after the send
          // (VERIFIED, research/161 §9), so a message read late still says when it was sent.
          const exp = typeof e0 === "object" && typeof e0?.expires_at_ms === "number" ? e0.expires_at_ms : undefined;
          // D557: nmem 0.10.123's `open` and entry carry `created_at_us` (VERIFIED 2026-11-25), read first.
          const us = typeof b?.created_at_us === "number" ? b.created_at_us : typeof e0 === "object" && typeof e0?.created_at_us === "number" ? e0.created_at_us : undefined;
          const sentAt = (us ? new Date(Math.floor(us / 1000)).toISOString() : undefined) ?? str(b?.sent_at) ?? str(b?.created_at) ?? str(b?.message?.created_at) ?? (typeof e0 === "object" ? str(e0?.sent_at) ?? str(e0?.created_at) : undefined) ?? (exp ? new Date(exp - MEM_TTL_MS).toISOString() : undefined);
          // nmem 0.10.118's `open` (VERIFIED): `{message, body, reply_to, outgoing}`, where `reply_to` is
          // the handle `reply` takes, the message's own id. Only a different one names a parent.
          const handle = str(b?.reply_to);
          const inReplyTo = str(b?.in_reply_to) ?? str(b?.message?.in_reply_to) ?? (handle && handle !== id ? handle : undefined);
          // D364: `in_reply_to: null` is Mem's linked shape saying this is an original, not an answer
          // (nmem 0.10.120+; 0.10.119 never sends the key on an original). D557: on nmem 0.10.120 or later
          // every message is in that shape (VERIFIED live 2026-11-25), so one without a parent is an original.
          const linked = !inReplyTo && (linksNow || (!!b && typeof b === "object" && b.in_reply_to === null) || (!!b?.message && typeof b.message === "object" && b.message.in_reply_to === null) || (typeof e0 === "object" && e0?.in_reply_to === null));
          const who = b?.message && typeof b.message === "object" ? { ...b, ...b.message } : b;
          const agent = agentOf(who);
          const sp = spaceIn(typeof entry(id) === "object" ? { ...entry(id), ...who } : who, pl);
          // In the user's "Only me" place every sender is one of their own agents, named or not
          // (D249; D294: Mem #10278's `sender.member` may be a display name, not the custodian id).
          // Elsewhere, only a sender whose member is the user's own.
          const said = memberOf(who);
          const byMember = !!(said.id || said.name) && isMine(who, mine);
          // The saved context is read only when it decides something (an own sender in an unnamed Space doesn't).
          const personal = sp.kind ? sp.kind === "personal" : byMember && !sp.id ? false : await personalSpace(wideNow ? places.find((p) => p.spaceId === sp.id) : pl, sp.id);
          const own = byMember || personal;
          // D334: a teammate's agent is told by its Space ("reviewer (dev team)", "AI agent (Everyone)").
          const shared = !personal && !!sp.id;
          // D418: an own agent Mem doesn't name, by what it says it is ("我是 Wey 的 Mem 协作 Codex"); never a teammate's.
          const self = own && !agent ? ownAgentSelf(body) : undefined;
          // D470 round 2 (hel, 2026-11-22): a sender Mem names in no way but that is known (its agent, or one of
          // the person's own that says what it is) is logged by that name, never "another agent".
          const said0 = senderOf(who);
          const from = said0 === "another agent" ? (agent ?? self?.agent ?? said0) : said0;
          const named = !own && sp.label ? `${agent ?? (from === "another agent" ? "AI agent" : from)} (${sp.label})` : from;
          messages.push({
            messageId: id,
            from: named,
            ...(!own && said.name && !memberIdLabel(said.name) && said.name !== agent ? { member: said.name } : {}),
            ...(agent ? { agent } : self ? { agent: self.agent, selfNamed: true as const, ...(self.role ? { role: self.role } : {}) } : {}),
            ...(!agent && !self && hostOf(who) ? { host: hostOf(who) } : {}),
            ...(own ? { mine: true } : {}),
            ...(replyArgs ? { route: replyArgs } : {}),
            text: clip(body, MAX_TEXT),
            ...(sentAt ? { sentAt } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(linked ? { linked: true as const } : {}),
            ...(sp.id ? { space: sp.id } : {}),
            ...(sp.label ? { spaceLabel: sp.label } : {}),
            ...(shared ? { shared: true } : {}),
            ...((refs) => (refs.length ? { refs } : {}))(refsIn(b, body)),
          });
        }
        const rd = outgoingReads(j);
        if (rd) reads = { ...(reads ?? {}), ...rd };
      }
      if (!answered && lastFail) return lastFail;
      return { ok: true, messages, ...(reads ? { reads } : {}), ...(stuckIn ? { stuckIn } : {}), ...(receives.length ? { receives } : {}) };
    },
    async inboxIds() {
      const ids: string[] = [];
      for (const { pl, args } of await inboxes()) {
        const got = await readInbox(args, pl.context);
        if ("fail" in got) return got.fail;
        for (const id of inboxIds(got.j)) if (!ids.includes(id)) ids.push(id);
      }
      return { ok: true, ids };
    },
    // D335: a long-poll when the CLI offers one, asked once per nmem version.
    async canWait() {
      const sh = await inboxShape();
      // Wide through `--all-spaces` (an earlier #10402 preview): the wait must take it too.
      return !!sh && sh.waitMax > 0 && (!wideNow || sh.identity || sh.allSpaces);
    },
    // D400: `--watch` (nmem 0.10.121): the identity inbox only, never with a Space selector.
    async canWatch() {
      const sh = await inboxShape();
      return !!sh && sh.watch && (sh.identity || !wideNow);
    },
    // D335 with D334: one long-poll per place's context, or (wide) one on the home's for every Space.
    waitContexts() {
      return wideNow ? [home.context] : places.map((pl) => pl.context);
    },
    async waitInbox(seconds, context) {
      const all = await inboxes();
      const at = all.find(({ pl }) => pl.context === context) ?? all[0]!;
      // D400: never longer than this CLI takes (nmem 0.10.121: 1..=5 s), and once more at the bound a refusal names.
      const sh = await inboxShape();
      const cap = waitCap ?? (sh?.waitMax || seconds);
      let s = Math.max(1, Math.min(seconds, cap));
      let r = await run([...at.args, "--wait", String(s)], { ctx: at.pl.context, limitMs: s * 1000 + timeoutMs });
      const bound = "missing" in r || r.code === 0 ? undefined : waitBoundIn(`${r.err}\n${r.out}`);
      if (bound && bound > 0 && bound < s) {
        waitCap = bound;
        s = bound;
        r = await run([...at.args, "--wait", String(s)], { ctx: at.pl.context, limitMs: s * 1000 + timeoutMs });
      }
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
      // D367: the wait answers the first page (oldest first); new mail is on the last one.
      return { ok: true, ids: inboxIds(await restOfInbox(j, at.args, at.pl.context)) };
    },
    watchInbox(onChange, context) {
      const ctx = context ?? home.context;
      let stopped = false;
      let proc: ReturnType<typeof Bun.spawn> | undefined;
      try {
        proc = Bun.spawn([bin, "--json", "--agent-context", ctx, "bridge", "inbox", "--watch"], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: nmemEnv(env) });
      } catch {
        return { stop() {}, ended: Promise.resolve({ ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't installed on this machine." }) };
      }
      const p = proc;
      const ended = (async (): Promise<BridgeResult<{}>> => {
        let other = "";
        const lines = (async () => {
          const dec = new TextDecoder();
          let buf = "";
          for await (const chunk of p.stdout as ReadableStream<Uint8Array>) {
            buf += dec.decode(chunk, { stream: true });
            let i: number;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line) continue;
              if (parse(line) !== undefined) {
                if (!stopped) onChange();
              } else other = clip(`${other}\n${line}`, 2000);
            }
          }
          if (buf.trim()) other = clip(`${other}\n${buf.trim()}`, 2000);
        })();
        const [err, code] = await Promise.all([new Response(p.stderr as ReadableStream).text(), p.exited, lines]);
        if (stopped) return { ok: true };
        if (code === 0) return { ok: false, reason: "unavailable", message: "Bridge's watch ended." };
        return failure({ code, out: other, err });
      })();
      return {
        stop() {
          if (stopped) return;
          stopped = true;
          p.kill();
        },
        ended,
      };
    },
    async reply(messageId, text, space, route) {
      // Body through stdin (--body-file -): text starting with "-" can't parse as a flag.
      // D400: Mem's own reply argv when the inbox gave one (it keeps the original's Context and Space).
      // D418: the one kept in the Log with the message first (this run's map is empty after a restart);
      // with neither, on an identity-inbox nmem, the inbox is read again for it: the bare id with the
      // home's context is not how 0.10.121 replies (on hel, 2026-11-20, three replies to mail in another
      // Space went that way and Mem took none of them).
      let pre = memArgv(route, "reply") ?? replyBy.get(messageId);
      // (Only once this run has read the inbox's shape: a check always comes before a reply.)
      if (!pre && shapeNow && (await shapeNow)?.identity) pre = await routeFor(messageId);
      if (pre) return sent(await writeWhole([...pre, "--body-file", "-", ...(namesTarget(pre) ? [] : [messageId])], text));
      // D334: in the Space the message came in, with that Space's context.
      return sent(await write(["reply", "--body-file", "-", messageId], text, ctxFor(space)));
    },
    // Read-only discovery, then a send the user confirmed (design/bridge.md, S2). D334: in every
    // Space the person reads (`--all-spaces`); an nmem without it, the home's own Space. D400: on an
    // identity-inbox nmem (0.10.121) the plain `contacts` groups one card per identity across Spaces
    // and a send resolves it in the home's Space; `--all-spaces` (one card per Space) if that fails.
    async contacts(query) {
      const sh = await inboxShape();
      const plain = () => read(["contacts", "--query", query]);
      const every = () => read(["contacts", "--all-spaces", "--query", query]);
      let r = sh?.identity ? await plain() : await every();
      if (sh?.identity) {
        if (!("missing" in r) && r.code !== 0) r = await every();
      } else if (!("missing" in r) && r.code !== 0 && /all-spaces|unexpected argument|unrecognized/i.test(`${r.err}\n${r.out}`)) r = await plain();
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      const more = contactsMore(j);
      // A card without a Space came from the home's own.
      const cards = contactsOf(j, await self()).map((c) => (c.space ? c : { ...c, ...(home.spaceId ? { space: home.spaceId } : {}), ...(home.spaceLabel ? { spaceLabel: home.spaceLabel } : {}) }));
      // D338: a card in a Space the home doesn't read (known only when every place names its Space).
      const known = !wideNow && places.every((p) => !!p.spaceId);
      for (const c of cards) if (known && c.space && !places.some((p) => p.spaceId === c.space)) c.unheard = true;
      return { ok: true, contacts: cards, more };
    },
    async mailboxes() {
      // D560: Mem's connections in the home's Space (the login's whole list, the same in every Space:
      // VERIFIED on hel), a few pages at most; the partner's own identity is never one of the person's tools.
      const own = await placeOf(home.context);
      const space = home.spaceId ?? own.space;
      const skip = (a: string) => ducterIdentity(a) || a === own.agent;
      const found = new Map<string, { harness: string; open: boolean }>();
      let after: string | undefined;
      for (let page = 0; page < 5; page++) {
        const r = await read(["connections", "list", ...(space ? ["--space-id", space] : []), ...(after ? ["--after-connection-id", after] : [])]);
        if ("missing" in r || r.code !== 0) return failure(r);
        const j = parse(r.out);
        if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
        for (const x of receiversOf(j, skip)) found.set(x.harness, x);
        after = str(j?.next_connection_id);
        if (!after) break;
      }
      return { ok: true, list: [...found.values()] };
    },
    async resource(uri) {
      if (!/^nowledgemem:\/\/[^\s]{1,400}$/i.test(uri)) return undefined;
      const r = await retried(() => run(["--agent-context", home.context, "resources", "get", "--", uri], { whole: true, limitMs: Math.min(timeoutMs, 10_000) }), false);
      if ("missing" in r || r.code !== 0) return undefined;
      return resourceOf(r.out);
    },
    async send(contact, text, space) {
      return sent(await write(["send", "--to", contact, "--body-file", "-"], text, ctxFor(space)));
    },
    // Recovery of an unknown outcome (D106): read-only, then resume the same original.
    async outbox(spaces) {
      const ops: BridgeOp[] = [];
      let answered = false;
      let complete = true;
      let lastFail: BridgeFailure | undefined;
      await inboxShape();
      // D418 (wide): the home's outbox, and each other Space an op went out in by Mem's Space selector
      // (`--resolved-space-id <id>` with the home's context answers that Space's, VERIFIED read-only on hel).
      const home0 = (await placeOf(home.context)).space ?? home.spaceId;
      const reads: { ctx: string; args: string[]; space?: string }[] = wideNow
        ? [{ ctx: home.context, args: ["outbox"] }, ...[...new Set(spaces ?? [])].filter((x) => x && x !== home0).map((x) => ({ ctx: home.context, args: ["--resolved-space-id", x, "outbox"], space: x }))]
        : places.map((pl) => ({ ctx: pl.context, args: ["outbox"], ...(pl.spaceId ? { space: pl.spaceId } : {}) }));
      for (const at of reads) {
        const r = await read(at.args, at.ctx);
        if ("missing" in r || r.code !== 0) {
          lastFail = failure(r);
          complete = false;
          continue;
        }
        const j = parse(r.out);
        if (j === undefined) {
          complete = false;
          continue;
        }
        answered = true;
        // D418: only Mem's own word that this is the whole of it lets a missing op count as never sent.
        if (j?.outcome_unknown !== false || !!str(j?.next)) complete = false;
        const list = Array.isArray(j?.operations) ? j.operations : Array.isArray(j?.outgoing) ? j.outgoing : Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        for (const o of list.map(opOf).filter((o: BridgeOp | undefined): o is BridgeOp => !!o)) ops.push({ ...o, ...(at.space ? { space: at.space } : {}) });
      }
      if (!answered) return lastFail ?? { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
      return { ok: true, ops, complete };
    },
    async inspect(operation, space) {
      const r = await read(["inspect", operation], ctxFor(space));
      if ("missing" in r || r.code !== 0) return failure(r);
      const op = opOf({ operation, ...(parse(r.out) ?? {}) });
      return op ? { ok: true, op: { ...op, ...(space ? { space } : {}) } } : { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
    },
    async resume(operation, space) {
      const r = await run(["resume", operation], { ctx: ctxFor(space) });
      return sent(r);
    },
  };
}

/**
 * D557: whether an nmem (its `--version` line) asks Mem for the linked shape (0.10.120+, #10278), where
 * an answer names its question and an original says so. A pre-release counts; an unreadable one doesn't.
 */
export function linksReplies(version: string): boolean {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a > 0 || b > 10 || (b === 10 && c >= 120);
}

/**
 * The Agent Context Bridge runs with, or undefined when it is off (D205). `connected`: the context
 * the user's connection in Settings › 伙伴 saved (core's bridge link), which turns Bridge on by
 * itself. D557: that is the default (D170 (9) met by the live trial of 2026-11-25): the person's own
 * home connects by itself once Mem is ready (core's bridge-auto, D332), with no flag. DUCTER_BRIDGE=0
 * is the off switch for the whole home; DUCTER_BRIDGE=1 pins a context made by hand (tests, the fake)
 * and needs DUCTER_BRIDGE_CONTEXT; DUCTER_BRIDGE_CONTEXT overrides the name.
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
