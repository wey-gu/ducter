// The partner's long-term memory port: recall and remember through Nowledge Mem (principle 17,
// design/system.md "Identity and Mem boundary").
//
// Boundary
//   - Mem is optional and swappable. Every failure comes back as { ok: false, reason } and the
//     partner carries on; nothing here throws into a turn.
//   - Identity and Space are the user's configuration: nmem reads NMEM_AGENT_ID / NMEM_SPACE
//     from the environment it inherits, and its own config for the default Space. Ducter never
//     names an identity or a Space of its own (no --agent-id, no --space), so it can't invent
//     or enroll one.
//   - Provenance on every write: who = the identity above (nmem stamps it); through what =
//     source / source_app "ducter"; from where = persona, Log seq and task id, carried in Mem's
//     source metadata (--source-msg, kept under metadata.source_message_id), never in the text.
//   - Tests inject a fake MemoryClient or point `bin` at a stub; nothing in tests reaches the
//     user's real Mem.

export interface MemoryHit {
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
  const d = typeof m?.created_at === "string" ? m.created_at.slice(0, 10) : undefined;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) hit.date = d;
  if (typeof m?.unit_type === "string" && m.unit_type) hit.kind = m.unit_type;
  return hit;
}

export interface NmemOptions {
  bin?: string; // default "nmem"
  timeoutMs?: number; // default 15 s (a Cloud search takes ~4 s)
  env?: Record<string, string | undefined>; // default process.env
}

/** MemoryClient over the nmem CLI (the user's own binary and its own connection config). */
export function createNmemClient(opts: NmemOptions = {}): MemoryClient {
  const bin = opts.bin ?? "nmem";
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const run = async (args: string[], input?: string): Promise<{ code: number; out: string; err: string } | { missing: true }> => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([bin, "--json", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: input !== undefined ? new Blob([input]) : "ignore",
        env: (opts.env ?? process.env) as Record<string, string>,
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
      const r = await run(["m", "search", "-n", String(limit), "--", query]);
      if ("missing" in r || r.code !== 0) return failure(r);
      try {
        const j = JSON.parse(r.out);
        const list = Array.isArray(j?.memories) ? j.memories : Array.isArray(j) ? j : [];
        return { ok: true, hits: list.slice(0, limit).map((m: unknown) => compactHit(m)) };
      } catch {
        return { ok: false, reason: "unavailable", message: "Nowledge Mem gave an unreadable answer." };
      }
    },
    async add(m) {
      const imp = Math.min(1, Math.max(0, m.importance ?? 0.6));
      // Content goes through stdin: a positional argument starting with "-" would parse as a flag.
      const args = ["m", "add", "--stdin", `--title=${m.title}`, "-i", imp.toFixed(2), "--source", "ducter", "--source-app", "ducter", "--source-msg", provenanceRef(m.provenance)];
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
