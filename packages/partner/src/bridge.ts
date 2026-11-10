// The partner's Bridge port: requests from the user's other agents through Nowledge Bridge
// (design/bridge.md). Off unless DUCTER_BRIDGE=1 and DUCTER_BRIDGE_CONTEXT names an Agent
// Context the user already approved with nmem.
//
// Boundary
//   - The persona is the addressee (principle 17): Ducter uses the persona's Agent mailbox
//     (`nmem bridge inbox/open/reply`), never a native-session mailbox. Harness sessions are
//     caches (principle 1); an address bound to one would die at the next re-cut.
//   - Ducter never sets anything up. It never calls `bridge setup --enable`, `session prepare`,
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
// The nmem JSON shapes below are read tolerantly: `bridge inbox` lists `messages[]` with a
// `message` handle; `bridge open <message>` returns `body` and the sender. Field names that are
// not documented in the CLI help are guesses with fallbacks (research/31).
import { nmemEnv } from "./memory.ts";

export interface BridgeMessage {
  messageId: string; // the CLI's message handle (what `open` and `reply` take)
  from: string; // a readable sender: agent and member as the CLI returns them
  agent?: string; // the sending agent's own name
  mine?: boolean; // the sender belongs to the user (same member as the persona's owner)
  text: string; // clipped
  sentAt?: string;
  inReplyTo?: string; // set when this answers a message we sent (the CLI's in_reply_to)
}

/** One recipient card from `bridge contacts`: an opaque handle plus who and where, as returned. */
export interface BridgeContact {
  contact: string; // the opaque handle `send --to` takes; choosing it grants nothing
  label: string; // "agent (member)" when the member has a name, else the agent alone, for the user's card
  agent?: string;
  mine?: boolean; // the user's own agent
  description?: string;
  space?: string; // the exact Space the card came from, when the CLI says
}

/** One outgoing operation as `bridge outbox` / `inspect` report it (tolerant; research/37 B8). */
export interface BridgeOp {
  operation: string; // the selector `inspect` and `resume` take
  state: "sent" | "pending" | "failed" | "unknown";
  messageId?: string;
  inReplyTo?: string;
  body?: string;
}

export type BridgeFailure = { ok: false; reason: "not_configured" | "unavailable" | "refused"; message: string; operation?: string };
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
  reply(messageId: string, text: string): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /** Read-only recipient discovery in the context's own Space (one bounded page). */
  contacts?(query: string): Promise<BridgeResult<{ contacts: BridgeContact[]; more: boolean }>>;
  /** A new message to a contact handle the user confirmed on a card. Failures as for `reply`. */
  send?(contact: string, text: string): Promise<BridgeResult<{ messageId?: string; operation?: string }>>;
  /** Recovery after an unknown outcome (D106): recent outgoing operations, then the one original. */
  outbox?(): Promise<BridgeResult<{ ops: BridgeOp[] }>>;
  inspect?(operation: string): Promise<BridgeResult<{ op: BridgeOp }>>;
  /** Recover the exact operation; the CLI never sends a replacement. */
  resume?(operation: string): Promise<BridgeResult<{ messageId?: string }>>;
}

export interface NmemBridgeOptions {
  context: string; // the approved named Agent Context (nmem --agent-context)
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
}

const MAX_TEXT = 4000;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

const pickName = (o: any): string | undefined => {
  if (!o) return undefined;
  if (typeof o === "string") return o;
  return str(o.display_name) ?? str(o.displayName) ?? str(o.name) ?? str(o.label) ?? str(o.agent_id) ?? str(o.id);
};
const agentOf = (m: any): string | undefined => pickName(m?.agent) ?? pickName(m?.sender?.agent) ?? pickName(m?.from?.agent) ?? str(m?.sender_agent_id) ?? str(m?.agent_id);

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
    str(m?.agent?.ownerMemberId) ?? str(m?.agent?.owner_member_id) ?? str(m?.custodian_member_id) ?? str(m?.custodianMemberId) ?? str(m?.identity?.custodian_id);
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
    if (id) out[id] = m?.read === true || !!str(m?.read_at) || /read|opened/i.test(str(m?.state) ?? "");
  }
  return out;
}

/**
 * A teammate's agent whose card names no member (the real CLI, B11) is told by its team instead:
 * "reviewer · dev team" (D162). The user's own agents and personal Spaces keep the bare name.
 */
function teamLabel(c: any, label: string, mine: boolean): string {
  const team = str(c?.space?.label);
  const kind = str(c?.space?.kind);
  if (mine || !team || kind === "personal" || label !== (agentOf(c) ?? label)) return label;
  return `${label} · ${team}`;
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
    out.push({
      contact,
      label: teamLabel(c, senderOf(c), isMine(c, me)),
      ...(agent ? { agent } : {}),
      ...(isMine(c, me) ? { mine: true } : {}),
      ...(description ? { description: clip(description, 200) } : {}),
      ...(space ? { space } : {}),
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

/** BridgeClient over the user's nmem CLI and their approved Agent Context. */
export function createNmemBridge(opts: NmemBridgeOptions): BridgeClient {
  const env = opts.env ?? process.env;
  const bin = opts.bin ?? env.NMEM_CLI_PATH ?? "nmem";
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxOpen = opts.maxOpen ?? 5;
  const run = async (args: string[], input?: string): Promise<{ code: number; out: string; err: string } | { missing: true }> => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      // Argument vector, never a shell string: message text can't become a flag or a command.
      proc = Bun.spawn([bin, "--json", "--agent-context", opts.context, "bridge", ...args], {
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
  const failure = (r: { code: number; err: string; out: string } | { missing: true }): BridgeFailure => {
    if ("missing" in r) return { ok: false, reason: "not_configured", message: "Nowledge Mem isn't installed on this machine." };
    const text = `${r.err}\n${r.out}`;
    const operation = operationIn(r.out) ?? operationIn(r.err);
    const op = operation ? { operation } : {};
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
  // The user's own member: given, or what passive setup reports for this context (asked once).
  let me: Promise<string | undefined> | undefined;
  const self = () =>
    (me ??= (async () => {
      const given = (opts.me ?? env.DUCTER_BRIDGE_MEMBER)?.trim();
      if (given) return given;
      const r = await run(["setup"]); // passive: inspects only, never --enable
      if ("missing" in r || r.code !== 0) return undefined;
      const j = parse(r.out);
      const m = memberOf(j);
      return m.id ?? m.name;
    })());
  const sent = (r: { code: number; out: string; err: string } | { missing: true }): BridgeResult<{ messageId?: string; operation?: string }> => {
    if ("missing" in r || r.code !== 0) return failure(r);
    const j = parse(r.out);
    if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer; it may or may not have gone out." };
    const id = str(j?.message) ?? str(j?.message_id);
    const operation = str(j?.operation) ?? str(j?.operation_id);
    return { ok: true, ...(id ? { messageId: id } : {}), ...(operation ? { operation } : {}) };
  };
  return {
    async check(known) {
      const r = await run(["inbox"]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      const fresh = inboxIds(j).filter((id) => !known.has(id)).slice(0, maxOpen);
      const messages: BridgeMessage[] = [];
      const mine = fresh.length ? await self() : undefined;
      for (const id of fresh) {
        // `open` records this recipient's first read: Ducter has the body in its Log from here on.
        const o = await run(["open", id]);
        if ("missing" in o || o.code !== 0) continue; // left unread; the next check tries again
        const b = parse(o.out);
        const body = str(b?.body) ?? str(b?.message?.body) ?? str(b?.text);
        if (!body) continue;
        const sentAt = str(b?.sent_at) ?? str(b?.created_at) ?? str(b?.message?.created_at);
        const inReplyTo = str(b?.in_reply_to) ?? str(b?.message?.in_reply_to) ?? str(b?.reply_to);
        const who = b?.message && typeof b.message === "object" ? { ...b, ...b.message } : b;
        const agent = agentOf(who);
        messages.push({
          messageId: id,
          from: senderOf(who),
          ...(agent ? { agent } : {}),
          ...(isMine(who, mine) ? { mine: true } : {}),
          text: clip(body, MAX_TEXT),
          ...(sentAt ? { sentAt } : {}),
          ...(inReplyTo ? { inReplyTo } : {}),
        });
      }
      const reads = outgoingReads(j);
      return { ok: true, messages, ...(reads ? { reads } : {}) };
    },
    async inboxIds() {
      const r = await run(["inbox"]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      return { ok: true, ids: inboxIds(j) };
    },
    async reply(messageId, text) {
      // Body through stdin (--body-file -): text starting with "-" can't parse as a flag.
      return sent(await run(["reply", "--body-file", "-", messageId], text));
    },
    // Read-only discovery, then a send the user confirmed (design/bridge.md, S2).
    async contacts(query) {
      const r = await run(["contacts", "--query", query]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      return { ok: true, contacts: contactsOf(j, await self()), more: Array.isArray(j?.next_args) && j.next_args.length > 0 };
    },
    async send(contact, text) {
      return sent(await run(["send", "--to", contact, "--body-file", "-"], text));
    },
    // Recovery of an unknown outcome (D106): read-only, then resume the same original.
    async outbox() {
      const r = await run(["outbox"]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
      const list = Array.isArray(j?.operations) ? j.operations : Array.isArray(j?.outgoing) ? j.outgoing : Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
      return { ok: true, ops: list.map(opOf).filter((o: BridgeOp | undefined): o is BridgeOp => !!o) };
    },
    async inspect(operation) {
      const r = await run(["inspect", operation]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const op = opOf({ operation, ...(parse(r.out) ?? {}) });
      return op ? { ok: true, op } : { ok: false, reason: "unavailable", message: "Bridge gave no answer." };
    },
    async resume(operation) {
      const r = await run(["resume", operation]);
      return sent(r);
    },
  };
}

/** The Bridge client from the environment, or null when Bridge is off (the default). */
export function bridgeFromEnv(env: Record<string, string | undefined> = process.env): BridgeClient | null {
  if (env.DUCTER_BRIDGE !== "1") return null;
  const context = env.DUCTER_BRIDGE_CONTEXT?.trim();
  if (!context) return null; // never guess an identity or a Space
  return createNmemBridge({ context, env });
}
