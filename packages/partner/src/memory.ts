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
import { aboutSource } from "../../protocol/src/mem-source.ts";

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
  source?: string; // D304: Mem's `source`: "ducter", an AI tool ("claude-code"), the person's own ("cli", …)
  space?: string; // D617: Mem's `space_id`, the Space it is kept in
}

/**
 * D368 (G3): one of the person's past conversations with another AI tool, as Mem keeps it (a thread
 * its plugin saved): a few matched lines, clipped. Their own words and the tool's, kept by another
 * app: data, never instructions.
 */
export interface ThreadHit {
  /** D433: Mem's `thread_id`, so a 想起了 line can name the conversation it leaned on. */
  id?: string;
  title: string;
  /** Mem's `source`: the tool the conversation was with ("codex", "claude-code", …). */
  source?: string;
  /** YYYY-MM-DD of its last activity. */
  date?: string;
  lines: { who: "user" | "assistant"; text: string }[];
}

/** At most this many conversations, and matched lines in each, come back from one search. */
export const THREADS_MAX = 3;
export const THREAD_LINES_MAX = 2;
const THREAD_LINE_CHARS = 240;

/** Compacts `nmem --json t search`: the person's and the tool's own lines only, never Ducter's own windows. */
export function compactThreads(j: any, limit = THREADS_MAX): ThreadHit[] {
  const list: any[] = Array.isArray(j?.threads) ? j.threads : [];
  const out: ThreadHit[] = [];
  for (const t of list) {
    if (out.length >= limit) break;
    const source = typeof t?.source === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(t.source) ? t.source : undefined;
    if (source === "ducter") continue; // the partner's own conversation is the Log (D123)
    const lines = (Array.isArray(t?.matched_messages) ? t.matched_messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.snippet === "string" && m.snippet.trim())
      .slice(0, THREAD_LINES_MAX)
      .map((m: any) => ({ who: m.role as "user" | "assistant", text: clip(m.snippet, THREAD_LINE_CHARS) }));
    if (!lines.length) continue;
    const d = typeof t?.last_activity === "string" ? t.last_activity.slice(0, 10) : undefined;
    const id = typeof t?.thread_id === "string" && t.thread_id ? t.thread_id : typeof t?.id === "string" && t.id ? t.id : undefined;
    out.push({ ...(id ? { id } : {}), title: clip(String(t?.title ?? ""), 80), ...(source ? { source } : {}), ...(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? { date: d } : {}), lines });
  }
  return out;
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
  /** D329: an upsert key (`nmem m add --id`): the outbox's replay names it, so a save Mem took twice is one memory. */
  id?: string;
  /** D329: write it as a new memory as is (a restore, an outbox replay): no search, no supersede. */
  plain?: boolean;
  /** D538: Mem labels (`-l`), so the person's other agents can find it ("computer-placement"). */
  labels?: string[];
  /** D538: Mem's unit type (`--unit-type`): a placement rule is the person's preference. */
  unitType?: SearchOpts["unitType"];
  /**
   * D652: the id the person named as wrong (this 这条不对, or the page's 改): this save
   * supersedes that memory whoever wrote it, instead of the search for the partner's own earlier
   * one. The tool's caller checks the id was named by the person; the client only checks its shape.
   */
  replaces?: string;
}

/** D329: the partner's own earlier memory a save took the place of (Mem's supersede). */
export interface Replaced {
  id: string;
  title: string;
}

/** D563: why a call found no Mem to use: memory switched off, no Mem on the home, or Mem there but not signed in. */
export type MemWhy = "off" | "missing" | "signed_out";

export type MemoryResult<T> = ({ ok: true } & T) | { ok: false; reason: "not_configured" | "unavailable" | "rejected"; message: string; why?: MemWhy };

/** D461: a narrower read for the morning's offers: one kind of memory (`--unit-type`). */
export interface SearchOpts {
  unitType?: "fact" | "preference" | "decision" | "plan" | "procedure" | "learning" | "context" | "event";
}
/**
 * D461: Mem's thread search is full text, every word must match, ranked by match, not by date
 * (VERIFIED live, research/200): a read for recent conversations scans deeper (`scan`, at most
 * THREADS_SCAN_MAX) and the caller keeps the recent ones.
 */
export interface ThreadOpts {
  scan?: number;
}
export const THREADS_SCAN_MAX = 30;

export interface MemoryClient {
  search(query: string, limit: number, opts?: SearchOpts): Promise<MemoryResult<{ hits: MemoryHit[] }>>;
  /** D368 (G3): the person's past conversations with their other AI tools that Mem keeps (`nmem t search`). */
  threads?(query: string, limit: number, opts?: ThreadOpts): Promise<MemoryResult<{ threads: ThreadHit[] }>>;
  /**
   * D329: replaced: the partner's own earlier memory this one supersedes (searched before writing);
   * waiting: Mem was down and the save waits in the outbox under this key (the outbox wrapper's).
   */
  add(m: MemoryAdd): Promise<MemoryResult<{ id?: string; replaced?: Replaced; waiting?: string }>>;
  /**
   * Forgets one memory the user asked to forget (the Partner page, D71): `nmem m forget`, which
   * hides it from recall and explicit by-id reads. Not a hard delete. D652: the result carries
   * Mem's own reason (signed out, unreachable, refused), so the page can say why it wasn't forgotten.
   */
  forget?(id: string): Promise<MemoryResult<{ id?: string }>>;
  /**
   * D304: the person corrected a noted line's words (这周记下的 / What it learned this week):
   * `nmem m update` sets its title and text to them. True when Mem took it.
   */
  correct?(id: string, title: string): Promise<boolean>;
  /**
   * D652: the person corrected a memory by its id on Settings › 记忆. The corrected words are
   * written as a new memory (keeping Mem's kind), then `m supersede <old> <new>` retires the one
   * that was wrong, whoever wrote it; the new id is the one the page shows next. Archiving the new
   * one is the rollback when the supersede itself fails, so a refusal never leaves two live copies.
   */
  replace?(id: string, title: string, provenance: Provenance, kind?: "preference" | "decision" | "fact" | "other"): Promise<MemoryResult<{ id?: string }>>;
  /**
   * D652: tell Nowledge Mem a recall was not helpful (`memory_feedback`, MCP only today). True
   * when Mem took it. The CLI has no such verb at nmem 0.10.125, so this is present only once one
   * advertises it; until then the caller records the intent in the Log (core settings).
   */
  feedback?(id: string, note?: string): Promise<boolean>;
  /**
   * D444: what Mem knows about the person, for "你都记得我些什么？": their preferences (from anyone Mem
   * names), and the decisions and facts they saved or told the partner (another tool's are its working
   * notes), newest first, ABOUT_PER_KIND each (`nmem m list --unit-type`, read only; D321's rule).
   */
  about?(): Promise<MemoryResult<{ hits: MemoryHit[] }>>;
  /** D329: 撤销 / Undo on a Noted line: `nmem m archive` (hidden from recall, kept audit-readable; never deleted). */
  archive?(id: string): Promise<boolean>;
  /** D538: the memories carrying one label, newest first (`nmem m list -l`), read only. */
  labeled?(label: string, limit: number): Promise<MemoryResult<{ hits: MemoryHit[] }>>;
  /** D329: an undone save's replaced memory comes back: its words read (`nmem m show`) and written again. */
  restore?(id: string, provenance: Provenance): Promise<boolean>;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
const bigrams = (s: string) => {
  const cs = [...s];
  const out = new Map<string, number>();
  for (let i = 0; i + 1 < cs.length; i++) out.set(cs[i]! + cs[i + 1]!, (out.get(cs[i]! + cs[i + 1]!) ?? 0) + 1);
  if (cs.length === 1) out.set(cs[0]!, 1);
  return out;
};
/** Dice's coefficient over character pairs (script-agnostic: Chinese titles have no spaces). */
export function likeness(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let common = 0;
  for (const [k, n] of A) common += Math.min(n, B.get(k) ?? 0);
  const total = [...A.values()].reduce((s, n) => s + n, 0) + [...B.values()].reduce((s, n) => s + n, 0);
  return total ? (2 * common) / total : 0;
}

/** D329: titles this alike name the same thing (a restatement, or the same topic said anew). */
export const SAME_THING = 0.6;

/**
 * D329: the partner's own earlier memory a new save restates or updates, from a search by its title:
 * saved through Ducter (source "ducter"), its words whole (never clipped: an undo writes them back),
 * and its title alike enough, or one title holding the other. Undefined: it is new.
 */
export function sameAs(title: string, hits: MemoryHit[]): MemoryHit | undefined {
  const t = norm(title);
  let best: { h: MemoryHit; s: number } | undefined;
  for (const h of hits) {
    if (!h.id || h.source !== "ducter" || h.content.endsWith("…")) continue;
    const o = norm(h.title);
    const s = o && t && (o.includes(t) || t.includes(o)) && Math.min([...o].length, [...t].length) >= 4 ? 1 : likeness(title, h.title);
    if (s >= SAME_THING && (!best || s > best.s)) best = { h, s };
  }
  return best?.h;
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
  if (typeof m?.source === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(m.source)) hit.source = m.source;
  // D617: the Space is Mem's exact id, never a label (Ducter holds no label map here).
  if (typeof m?.space_id === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(m.space_id)) hit.space = m.space_id;
  return hit;
}

export interface NmemOptions {
  bin?: string; // default "nmem"
  timeoutMs?: number; // default 15 s (a Cloud search takes ~4 s)
  env?: Record<string, string | undefined>; // default process.env
  /** The persona's Mem AI Identity (D141), read on every call: named explicitly, never taken from the env. */
  identity?: () => { agentId: string; space?: string; lane?: string } | undefined;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

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
    if ("missing" in r) return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't installed on this machine.", why: "missing" as const };
    const text = `${r.err}\n${r.out}`;
    if (/api key|unauthori[sz]ed|not configured|no (api )?url|connect link|401|403/i.test(text))
      return { ok: false as const, reason: "not_configured" as const, message: "Nowledge Mem isn't connected.", why: "signed_out" as const };
    return { ok: false as const, reason: "unavailable" as const, message: `Nowledge Mem didn't answer (${clip(r.err || r.out || `exit ${r.code}`, 120)}).` };
  };
  // D652: whether this nmem advertises a memory-feedback verb; read once, the first time the
  // person corrects something. Undefined: not asked yet.
  let feedbackVerb: boolean | undefined;
  const client: MemoryClient = {
    async search(query, limit, so) {
      const who = opts.identity?.();
      // The user's Space alone; else where saves land and, when it has one, the identity's lane (D229).
      const scopes: string[][] = who?.space ? [["--space", who.space]] : who?.lane ? [[], ["--space-id", who.lane]] : [[]];
      const kind = so?.unitType ? ["--unit-type", so.unitType] : [];
      const rs = await Promise.all(scopes.map((sc) => run(["m", "search", "-n", String(limit), ...kind, ...sc, "--", query])));
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
    async threads(query, limit, to) {
      const who = opts.identity?.();
      // The chosen Space, else where Mem's plugins save threads (its default): one read, bounded.
      // D461: a scan returns every conversation it read (the caller keeps the recent ones).
      const scan = to?.scan ? Math.min(THREADS_SCAN_MAX, Math.max(1, to.scan)) : undefined;
      const n = scan ?? Math.min(THREADS_MAX, Math.max(1, limit));
      // A few more than shown: Ducter's own windows and tool-only matches are skipped.
      const r = await run(["t", "search", "-n", String(scan ?? n + 2), ...(who?.space ? ["--space", who.space] : []), "--", query]);
      if ("missing" in r || r.code !== 0) return failure(r);
      try {
        return { ok: true, threads: compactThreads(JSON.parse(r.out), n) };
      } catch {
        return { ok: false, reason: "unavailable", message: "Nowledge Mem gave an unreadable answer." };
      }
    },
    async add(m) {
      const imp = Math.min(1, Math.max(0, m.importance ?? 0.6));
      // D329: search before writing: the partner's own earlier memory of the same thing is superseded
      // by this one, never duplicated. A search that fails is no reason not to save.
      // D652: the person named the wrong memory (这条不对): no search, that exact memory is
      // superseded however it was written; only its shape is checked here, the caller guards that
      // the person named it.
      const explicit = typeof m.replaces === "string" && SAFE_ID.test(m.replaces) ? m.replaces : undefined;
      const before = m.plain || explicit ? undefined : client.search(m.title, 5);
      // Content goes through stdin: a positional argument starting with "-" would parse as a flag.
      const args = ["m", "add", "--stdin", `--title=${m.title}`, "-i", imp.toFixed(2), "--source", "ducter", "--source-app", "ducter", "--source-msg", provenanceRef(m.provenance)];
      if (m.id && SAFE_ID.test(m.id)) args.push(`--id=${m.id}`);
      for (const l of m.labels ?? []) if (SAFE_ID.test(l)) args.push("-l", l);
      if (m.unitType) args.push("--unit-type", m.unitType);
      // Who: the persona's identity, always named (D141); with none bound yet, nmem's own fallback.
      const who = opts.identity?.();
      if (who) args.push("--agent-id", who.agentId, ...(who.space ? ["--space", who.space] : []));
      const [r, seen] = await Promise.all([run(args, m.content), before]);
      if ("missing" in r || r.code !== 0) return failure(r);
      let id: string | undefined;
      try {
        const j = JSON.parse(r.out);
        id = j?.id ?? j?.memory?.id ?? undefined;
      } catch {
        /* written; no id to show */
      }
      // D652: the one the person named is retired, whoever wrote it; else D329's own earlier one.
      let oldTitle = explicit;
      if (explicit) {
        const sh = await run(["m", "show", "--", explicit]);
        if (!("missing" in sh) && sh.code === 0) {
          try {
            const j = JSON.parse(sh.out);
            const t = j?.memory?.title ?? j?.title;
            if (typeof t === "string" && t.trim()) oldTitle = t.trim();
          } catch {
            /* the id is still the id */
          }
        }
      }
      const old = explicit
        ? { id: explicit, title: oldTitle ?? explicit }
        : seen?.ok
          ? sameAs(m.title, seen.hits.filter((h) => h.id !== id))
          : undefined;
      let replaced: Replaced | undefined;
      if (old?.id && id && old.id !== String(id)) {
        const s = await run(["m", "supersede", "--reason", explicit ? "Corrected by the person in Ducter" : "Said again in Ducter", ...(who?.space ? ["--space", who.space] : []), "--", old.id, String(id)]);
        if (!("missing" in s) && s.code === 0) replaced = { id: old.id, title: old.title };
        else if (explicit) {
          // A right one beside the wrong one is the fault this path exists to end: take the new one
          // back out of recall (archive, never delete) and tell the caller it didn't happen.
          await run(["m", "archive", "--reason", "Correction didn't supersede", ...(who?.space ? ["--space", who.space] : []), "--", String(id)]);
          return { ok: false, reason: "rejected", message: "Nowledge Mem didn't take the supersede." };
        }
      }
      return { ok: true, ...(id ? { id: String(id) } : {}), ...(replaced ? { replaced } : {}) };
    },
    async about() {
      const who = opts.identity?.();
      const sc = who?.space ? ["--space", who.space] : [];
      const kinds = ["preference", "decision", "fact"] as const;
      const rs = await Promise.all(kinds.map((k) => run(["m", "list", "--unit-type", k, "-n", k === "preference" ? "16" : "40", ...sc])));
      const hits: MemoryHit[] = [];
      let any = false;
      kinds.forEach((k, i) => {
        const r = rs[i]!;
        if ("missing" in r || r.code !== 0) return;
        let list: any[] = [];
        try {
          const j = JSON.parse(r.out);
          list = Array.isArray(j?.memories) ? j.memories : Array.isArray(j) ? j : [];
        } catch {
          return;
        }
        any = true;
        hits.push(...aboutHits(list, k));
      });
      return any ? { ok: true, hits } : failure(rs[0]!);
    },
    async labeled(label, limit) {
      if (!SAFE_ID.test(label)) return { ok: true, hits: [] };
      const who = opts.identity?.();
      const r = await run(["m", "list", "-l", label, "-n", String(Math.min(50, Math.max(1, limit))), ...(who?.space ? ["--space", who.space] : [])]);
      if ("missing" in r || r.code !== 0) return failure(r);
      try {
        const j = JSON.parse(r.out);
        const list: unknown[] = Array.isArray(j?.memories) ? j.memories : Array.isArray(j) ? j : [];
        return { ok: true, hits: list.map((m) => compactHit(m)) };
      } catch {
        return { ok: false, reason: "unavailable", message: "Nowledge Mem gave an unreadable answer." };
      }
    },
    async archive(id) {
      if (!SAFE_ID.test(id)) return false;
      const r = await run(["m", "archive", "--reason", "Undone in Ducter", "--", id]);
      return !("missing" in r) && r.code === 0;
    },
    async restore(id, provenance) {
      if (!SAFE_ID.test(id)) return false;
      const r = await run(["m", "show", "--", id]);
      if ("missing" in r || r.code !== 0) return false;
      let j: any;
      try {
        j = JSON.parse(r.out);
      } catch {
        return false;
      }
      const mem = j?.memory ?? j;
      const title = typeof mem?.title === "string" ? mem.title : "";
      const content = typeof mem?.content === "string" ? mem.content : "";
      if (!title || !content) return false;
      const back = await client.add({ title, content, provenance, plain: true, ...(typeof mem?.importance === "number" ? { importance: mem.importance } : {}) });
      return back.ok;
    },
    async forget(id) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return { ok: false as const, reason: "rejected" as const, message: "Not a memory id." };
      const r = await run(["m", "forget", "--force", "--reason", "Forgotten from Ducter's Partner page", "--", id]);
      if ("missing" in r || r.code !== 0) return failure(r);
      return { ok: true as const, id };
    },
    async replace(id, title, provenance, kind) {
      const words = title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !words) return { ok: false as const, reason: "rejected" as const, message: "Not a memory to correct." };
      const who = opts.identity?.();
      const space = who?.space ? ["--space", who.space] : [];
      const args = ["m", "add", "--stdin", `--title=${words}`, "-i", "0.70", "--source", "ducter", "--source-app", "ducter", "--source-msg", provenanceRef(provenance)];
      if (kind && kind !== "other") args.push("--unit-type", kind);
      if (who) args.push("--agent-id", who.agentId, ...space);
      const r = await run(args, words);
      if ("missing" in r || r.code !== 0) return failure(r);
      let newId: string | undefined;
      try {
        const j = JSON.parse(r.out);
        const v = j?.id ?? j?.memory?.id;
        if (typeof v === "string" && SAFE_ID.test(v)) newId = v;
      } catch {
        /* no id: the supersede cannot be aimed */
      }
      if (!newId) {
        return { ok: false as const, reason: "unavailable" as const, message: "Nowledge Mem wrote the correction but named no id." };
      }
      const s = await run(["m", "supersede", "--reason", "Corrected by the person in Ducter", ...space, "--", id, newId]);
      if ("missing" in s || s.code !== 0) {
        // Never leave the right one beside the wrong one: archive the new copy (never delete).
        await run(["m", "archive", "--reason", "Correction didn't supersede", ...space, "--", newId]);
        return failure(s);
      }
      return { ok: true as const, id: newId };
    },
    async feedback(id, note) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
      if (feedbackVerb === undefined) {
        // Mem's memory_feedback is an MCP tool only at nmem 0.10.125 (no CLI verb). Read the group's
        // help once: a later nmem that grows it is used; today this stays false and nothing is sent.
        const h = await run(["m", "--help"]);
        feedbackVerb = !("missing" in h) && h.code === 0 && /\bfeedback\b/.test(`${h.out}\n${h.err}`);
      }
      if (!feedbackVerb) return false;
      // Shape follows Mem's memory_feedback (memory id, verdict, the person's note); read that verb's
      // own help when it lands and correct this before trusting it (design/todo.md's trigger).
      const r = await run(["m", "feedback", "--id", id, "--verdict", "not_helpful", ...(note ? ["--note", note] : [])]);
      return !("missing" in r) && r.code === 0;
    },
    async correct(id, title) {
      const words = title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !words) return false;
      // The `--x=value` form: words starting with "-" would otherwise parse as a flag.
      const r = await run(["m", "update", `--title=${words}`, `--content=${words}`, "--", id]);
      return !("missing" in r) && r.code === 0;
    },
  };
  return client;
}

/** At most this many of each kind about the person (D321's page shows as many). */
export const ABOUT_PER_KIND = 8;

/**
 * D444, D321's rule: from one kind's list, what is about the person: a preference from anyone Mem
 * names; a decision or a fact only when the person saved it or told the partner.
 */
export function aboutHits(list: any[], kind: "preference" | "decision" | "fact"): MemoryHit[] {
  const out: MemoryHit[] = [];
  for (const m of list) {
    if (out.length >= ABOUT_PER_KIND) break;
    if (typeof m?.title !== "string" || !m.title.trim()) continue;
    const who = aboutSource(m?.source);
    if (!who || (kind !== "preference" && who.by !== "said" && who.by !== "you")) continue;
    out.push({ ...compactHit({ ...m, unit_type: kind }, 200), kind });
  }
  return out;
}

/** Mem switched off (DUCTER_MEMORY=off) or absent: every call says so, the partner carries on. */
export const noMemory: MemoryClient = {
  search: async () => ({ ok: false, reason: "not_configured", message: "Memory is off for this partner.", why: "off" }),
  add: async () => ({ ok: false, reason: "not_configured", message: "Memory is off for this partner.", why: "off" }),
};
