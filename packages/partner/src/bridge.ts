// The partner's Bridge port: hand-offs from the user's other agents through Nowledge Bridge
// (design/bridge.md). Off unless DUCTER_BRIDGE=1 and DUCTER_BRIDGE_CONTEXT names an Agent
// Context the user already approved with nmem.
//
// Boundary
//   - The persona is the addressee (principle 17): Ducter uses the persona's Agent mailbox
//     (`nmem bridge inbox/open/reply`), never a native-session mailbox. Harness sessions are
//     caches (principle 1); an address bound to one would die at the next re-cut.
//   - Ducter never sets anything up. It never calls `bridge setup --enable`, `session prepare`,
//     `agents enroll`, `keys create`, `contacts` or `send`. It only reads the persona's inbox and
//     replies to a message that is already in the Log. The Agent Context (identity + exact Space)
//     is the user's; Ducter passes its name and nothing else.
//   - A message body is untrusted task context from another agent, never the user's permission.
//     The partner can't open a task from it in a turn the user hasn't spoken in (partner.ts).
//   - The Log is the ledger: a message id already logged as `bridge_msg` is never opened again,
//     so a restart or a second check can't duplicate a hand-off.
//   - Every failure comes back as { ok: false }; nothing here throws into a turn or a check.
//   - Tests inject a fake BridgeClient or point `bin` at a stub; nothing in tests reaches Mem.
//
// The nmem JSON shapes below are read tolerantly: `bridge inbox` lists `messages[]` with a
// `message` handle; `bridge open <message>` returns `body` and the sender. Field names that are
// not documented in the CLI help are guesses with fallbacks (research/31).

export interface BridgeMessage {
  messageId: string; // the CLI's message handle (what `open` and `reply` take)
  from: string; // a readable sender: agent and member as the CLI returns them
  text: string; // clipped
  sentAt?: string;
}

export type BridgeResult<T> = ({ ok: true } & T) | { ok: false; reason: "not_configured" | "unavailable" | "refused"; message: string };

export interface BridgeClient {
  /** New messages in the persona's inbox, with bodies, skipping ids the caller already has. */
  check(known: Set<string>): Promise<BridgeResult<{ messages: BridgeMessage[] }>>;
  /** Reply to a received message; the CLI derives the recipient from that original. */
  reply(messageId: string, text: string): Promise<BridgeResult<{ messageId?: string }>>;
}

export interface NmemBridgeOptions {
  context: string; // the approved named Agent Context (nmem --agent-context)
  bin?: string; // default NMEM_CLI_PATH or "nmem"
  timeoutMs?: number; // per call, default 20 s
  maxOpen?: number; // bodies opened per check, default 5
  env?: Record<string, string | undefined>;
}

const MAX_TEXT = 4000;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

/** A readable sender from whatever the CLI returned (an object with names/ids, or a string). */
export function senderOf(m: any): string {
  const pick = (o: any): string | undefined => {
    if (!o) return undefined;
    if (typeof o === "string") return o;
    return str(o.display_name) ?? str(o.name) ?? str(o.label) ?? str(o.agent_id) ?? str(o.id);
  };
  const agent = pick(m?.agent) ?? pick(m?.sender?.agent) ?? pick(m?.from?.agent) ?? str(m?.sender_agent_id) ?? str(m?.agent_id);
  const member = pick(m?.member) ?? pick(m?.sender?.member) ?? pick(m?.from?.member) ?? str(m?.member_display_name) ?? str(m?.custodian_id);
  const flat = typeof m?.from === "string" ? m.from : typeof m?.sender === "string" ? m.sender : undefined;
  if (agent && member && agent !== member) return `${agent} (${member})`;
  return agent ?? member ?? flat ?? "another agent";
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
        env: env as Record<string, string>,
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
  const failure = (r: { code: number; err: string; out: string } | { missing: true }) => {
    if ("missing" in r) return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't installed on this machine." };
    const text = `${r.err}\n${r.out}`;
    if (/not admitted|denied|forbidden|role_insufficient|403|refus/i.test(text)) return { ok: false as const, reason: "refused" as const, message: "Bridge refused this connection." };
    if (/agent context|not configured|api key|401|unknown context/i.test(text)) return { ok: false as const, reason: "not_configured" as const, message: "Bridge isn't set up for this partner." };
    return { ok: false as const, reason: "unavailable" as const, message: `Bridge didn't answer (${clip((r.err || r.out || `exit ${r.code}`).trim(), 120)}).` };
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
  return {
    async check(known) {
      const r = await run(["inbox"]);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer (it may be switched off for this account)." };
      const fresh = inboxIds(j).filter((id) => !known.has(id)).slice(0, maxOpen);
      const messages: BridgeMessage[] = [];
      for (const id of fresh) {
        // `open` records this recipient's first read: Ducter has the body in its Log from here on.
        const o = await run(["open", id]);
        if ("missing" in o || o.code !== 0) continue; // left unread; the next check tries again
        const b = parse(o.out);
        const body = str(b?.body) ?? str(b?.message?.body) ?? str(b?.text);
        if (!body) continue;
        const sentAt = str(b?.sent_at) ?? str(b?.created_at) ?? str(b?.message?.created_at);
        messages.push({ messageId: id, from: senderOf(b?.message && typeof b.message === "object" ? { ...b, ...b.message } : b), text: clip(body, MAX_TEXT), ...(sentAt ? { sentAt } : {}) });
      }
      return { ok: true, messages };
    },
    async reply(messageId, text) {
      // Body through stdin (--body-file -): text starting with "-" can't parse as a flag.
      const r = await run(["reply", "--body-file", "-", messageId], text);
      if ("missing" in r || r.code !== 0) return failure(r);
      const j = parse(r.out);
      if (j === undefined) return { ok: false, reason: "unavailable", message: "Bridge gave no answer; the reply may not have gone out." };
      const id = str(j?.message) ?? str(j?.message_id) ?? str(j?.operation);
      return { ok: true, ...(id ? { messageId: id } : {}) };
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
