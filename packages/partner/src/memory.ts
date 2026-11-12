// The partner's long-term memory port: recall and remember through Nowledge Mem (principle 17,
// design/system.md "Identity and Mem boundary").
//
// Boundary
//   - Mem is optional and swappable. Every failure comes back as { ok: false, reason } and the
//     partner carries on; nothing here throws into a turn.
//   - Identity (D141): the persona's own Mem AI Identity, bound once by core (mem-identity.ts),
//     named on every write (--agent-id) and, when the user chose one, its Space (--space). Until
//     it is bound, nmem's own fallback applies. Ducter never picks a Space of its own.
//   - Lane (D229): with no Space chosen, recall reads where saves land (no Space named: Mem's
//     default, "Only me" in a team workspace) and the identity's own lane (its profile's default
//     Space, --space-id), the way Mem's plugin reads it for an NMEM_AGENT_ID, merged by id.
//   - Provenance on every write: who = the identity above; through what =
//     source / source_app "ducter"; from where = persona, Log seq and task id, carried in Mem's
//     source metadata (--source-msg, kept under metadata.source_message_id), never in the text.
//   - Tests inject a fake MemoryClient or point `bin` at a stub; nothing in tests reaches the
//     user's real Mem.

/** What nmem needs from Ducter's environment: paths, user, locale, temp folder, proxies, CA bundles. */
const NMEM_BASICS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LANGUAGE", "TERM", "TMPDIR", "TMP", "TEMP", "TZ",
  "SYSTEMROOT", "APPDATA", "LOCALAPPDATA", "USERPROFILE",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
]);

/**
 * nmem's environment (D102): the basics and its own NMEM_* settings (its API key among them),
 * never the whole of Ducter's, which may hold harness keys. The partner package stays free of
 * other packages, so this is the same allowlist as protocol/src/tool-env.ts, kept here.
 */
export function nmemEnv(inherited: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(inherited)) if (typeof v === "string" && (NMEM_BASICS.has(k) || k.startsWith("NMEM_") || k.startsWith("LC_") || k.startsWith("XDG_"))) out[k] = v;
  return out;
}

export interface MemoryHit {
  id?: string; // Mem's own id (D168: a task can name what it was told)
  title: string;
  content: string; // clipped
  date?: string; // YYYY-MM-DD the memory was recorded
  kind?: string; // unit type: preference, decision, fact, …
}

export interface Provenance {
  persona: string; // Ducter persona id
  logSeq?: number; // the channel event the memory comes from (usually the user's message)
  taskId?: string;
}

export interface MemoryAdd {
  title: string;
  content: string;
  importance?: number; // 0..1
  provenance: Provenance;
}

export type MemoryResult<T> = ({ ok: true } & T) | { ok: false; reason: "not_configured" | "unavailable" | "rejected"; message: string };

export interface MemoryClient {
  search(query: string, limit: number): Promise<MemoryResult<{ hits: MemoryHit[] }>>;
  add(m: MemoryAdd): Promise<MemoryResult<{ id?: string }>>;
  /**
   * Forgets one memory the user asked to forget (the Partner page, D71): `nmem m forget`, which
   * hides it from recall and from reads by id. Not a hard delete. True when Mem did it.
   */
  forget?(id: string): Promise<boolean>;
}

/** The Log pointer Ducter stores in Mem's source metadata (never in the memory text). */
export function provenanceRef(p: Provenance): string {
  return ["ducter", `persona=${p.persona}`, p.logSeq !== undefined ? `log=${p.logSeq}` : "", p.taskId ? `task=${p.taskId}` : ""].filter(Boolean).join(";");
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

/** Compacts one search hit from `nmem --json m search`. */
export function compactHit(m: any, maxChars = 280): MemoryHit {
  const hit: MemoryHit = { title: clip(String(m?.title ?? ""), 80), content: clip(String(m?.content ?? ""), maxChars) };
  if (typeof m?.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(m.id)) hit.id = m.id;
  const d = typeof m?.created_at === "string" ? m.created_at.slice(0, 10) : undefined;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) hit.date = d;
  if (typeof m?.unit_type === "string" && m.unit_type) hit.kind = m.unit_type;
  return hit;
}

export interface NmemOptions {
  bin?: string; // default "nmem"
  timeoutMs?: number; // default 15 s (a Cloud search takes ~4 s)
  env?: Record<string, string | undefined>; // default process.env
  /** The persona's Mem AI Identity (D141), read on every call: named explicitly, never taken from the env. */
  identity?: () => { agentId: string; space?: string; lane?: string } | undefined;
}

/** MemoryClient over the nmem CLI (the user's own binary and its own connection config). */
export function createNmemClient(opts: NmemOptions = {}): MemoryClient {
  // Read per call: D225 can put nmem in (and name it in NMEM_CLI_PATH) while Ducter runs.
  const binNow = () => opts.bin ?? process.env.NMEM_CLI_PATH ?? "nmem";
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const run = async (args: string[], input?: string): Promise<{ code: number; out: string; err: string } | { missing: true }> => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([binNow(), "--json", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: input !== undefined ? new Blob([input]) : "ignore",
        env: nmemEnv(opts.env), // D102: the basics and NMEM_*, never Ducter's keys
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
    if (/api key|unauthori[sz]ed|not configured|no (api )?url|connect link|401|403/i.test(text))
      return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't connected." };
    return { ok: false as const, reason: "unavailable" as const, message: `Nowledge Mem didn't answer (${clip(r.err || r.out || `exit ${r.code}`, 120)}).` };
  };
  return {
    async search(query, limit) {
      const who = opts.identity?.();
      // The user's Space alone; else where saves land and, when it has one, the identity's lane (D229).
      const scopes: string[][] = who?.space ? [["--space", who.space]] : who?.lane ? [[], ["--space-id", who.lane]] : [[]];
      const rs = await Promise.all(scopes.map((sc) => run(["m", "search", "-n", String(limit), ...sc, "--", query])));
      const lists: any[][] = [];
      let unreadable = false;
      for (const r of rs) {
        if ("missing" in r || r.code !== 0) continue;
        try {
          const j = JSON.parse(r.out);
          lists.push(Array.isArray(j?.memories) ? j.memories : Array.isArray(j) ? j : []);
        } catch {
          unreadable = true;
        }
      }
      if (!lists.length) return unreadable ? { ok: false, reason: "unavailable", message: "Nowledge Mem gave an unreadable answer." } : failure(rs[0]!);
      // One list: Mem's order. Two: merged by id, by Mem's own score.
      const seen = new Set<string>();
      const merged = lists.length === 1 ? lists[0]! : lists.flat().filter((m) => {
        const id = typeof m?.id === "string" ? m.id : undefined;
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0));
      return { ok: true, hits: merged.slice(0, limit).map((m: unknown) => compactHit(m)) };
    },
    async add(m) {
      const imp = Math.min(1, Math.max(0, m.importance ?? 0.6));
      // Content goes through stdin: a positional argument starting with "-" would parse as a flag.
      const args = ["m", "add", "--stdin", `--title=${m.title}`, "-i", imp.toFixed(2), "--source", "ducter", "--source-app", "ducter", "--source-msg", provenanceRef(m.provenance)];
      // Who: the persona's identity, always named (D141); with none bound yet, nmem's own fallback.
      const who = opts.identity?.();
      if (who) args.push("--agent-id", who.agentId, ...(who.space ? ["--space", who.space] : []));
      const r = await run(args, m.content);
      if ("missing" in r || r.code !== 0) return failure(r);
      let id: string | undefined;
      try {
        const j = JSON.parse(r.out);
        id = j?.id ?? j?.memory?.id ?? undefined;
      } catch {
        /* written; no id to show */
      }
      return { ok: true, ...(id ? { id: String(id) } : {}) };
    },
    async forget(id) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
      const r = await run(["m", "forget", "--force", "--reason", "Forgotten from Ducter's Partner page", "--", id]);
      return !("missing" in r) && r.code === 0;
    },
  };
}

/** Mem switched off (DUCTER_MEMORY=off) or absent: every call says so, the partner carries on. */
export const noMemory: MemoryClient = {
  search: async () => ({ ok: false, reason: "not_configured", message: "Memory is off for this partner." }),
  add: async () => ({ ok: false, reason: "not_configured", message: "Memory is off for this partner." }),
};
