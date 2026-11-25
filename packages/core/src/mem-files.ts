// D566: what Ducter made, kept in the person's own Nowledge Mem as Artifacts (design/made.md, "In
// Nowledge Mem"; research/231 for the interface). Three ways in, one path:
//   - a tap on 存到 Nowledge Mem / Save to Nowledge Mem (a file card, the viewer): mem_file_save;
//   - the partner asked in words (made_find keep);
//   - 做好的文件也存进 Nowledge Mem (Settings › Memory, off by default): a finished task's
//     reports and documents (memAutoKeeps), never a log, code or a picture, never a file of secrets.
// Through the person's own `nmem` (its own sign-in), as their own data: no Go (D61 covers outward
// actions on others; this is the person's own store, said in D566).
//   - into one folder named 「Ducter」 at the root of the Space the persona is bound to (D141:
//     persona.mem.space; none bound: no --space, so Mem's own default; never a guessed Space). An
//     existing top-level 「Ducter」 folder there is used; else it is made with a client-chosen id
//     (`folders mk --id`, safe to repeat, research/231 §3);
//   - a file is one artifact for its life: the same name from the same task (or the conversation)
//     saved again is `artifacts update <doc> --base <rev> --file`, a new version, never a second
//     artifact; Mem answers `unchanged` for the same bytes. Refused because someone saved a newer
//     version in Mem: asked by the person, saved on top of it (both versions stay in Mem's history);
//     by itself, left as it is (their version stays current) and said once;
//   - why it wasn't kept comes from Mem's facts (D563): off, missing, signed_out, unreachable,
//     refused (Mem's own words), secret (redact.ts finds a key in it, or a secrets file's name),
//     gone (no longer on the home). The file always stays where it is.
// Never `delete`, `move` or a folder rename: Ducter only adds and updates what it saved.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileFamily, memAutoKeeps, memKeeps, secretFileName, type Bodies, type LogEvent, type MediaRef, type MemFileSaved, type MemFileWhy } from "@ducter/protocol";
import { redact } from "@ducter/protocol/src/redact.ts";
import { nmemEnv } from "@ducter/protocol/src/tool-env.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const MEM_FILES_FILE = "mem-files.json";
export const MEM_FOLDER = "Ducter";
/** An upload to Mem Cloud: a 17 MB PDF took about 20 s on 2026-11-24 (research/231 §2, INFERRED pace). */
export const MEM_FILE_MS = 120_000;
const SAVED_MAX = 500;
const TEXT_CHECK_BYTES = 1024 * 1024;

export type MemFileResult = { ok: true; saved: MemFileSaved } | { ok: false; why: MemFileWhy; message?: string };
export type MemFileBy = "tap" | "partner" | "auto";
export type Run = (argv: string[], timeoutMs: number) => Promise<{ code: number; out: string; err: string } | { missing: true }>;

export interface MemFilesDeps {
  dataDir: string;
  log: LogStore;
  media: { get(id: string): MediaRef | undefined; path(id: string): string | undefined; named(id: string): string | undefined };
  /** Memory on (the switch), the Settings default, and whether Mem answers on the home (D375's view). */
  memory: () => boolean;
  autoOn: () => boolean;
  memState: () => "connected" | "missing" | "off" | undefined;
  /** The persona's binding (D141): its Space when it has one. */
  identity: () => { agentId: string; space?: string } | undefined;
  taskTitle: (taskId: string) => string | undefined;
  /** Something changed that the settings frame shows (mem.files). */
  changed: () => void;
  run?: Run;
  bin?: () => string;
  now?: () => number;
}

interface Doc {
  doc: string;
  rev: number;
  space?: string;
}
interface State {
  /** The 「Ducter」 folder, by Space ("" for Mem's default). */
  folders: Record<string, string>;
  /** One artifact per file: by its task (or "chat") and name. */
  docs: Record<string, Doc>;
  /** Every version saved, by media id (newest last). */
  saved: Record<string, MemFileSaved>;
  /** The last time a file wasn't kept by itself: said once under the Settings row. */
  trouble?: { name: string; why: MemFileWhy; message?: string; at: string };
  /** Mem on the web, from `nmem status` (Cloud only). */
  web?: string;
}

export interface MemFiles {
  save(mediaId: string, by?: MemFileBy): Promise<MemFileResult>;
  view(): Record<string, MemFileSaved>;
  trouble(): State["trouble"];
  /** The one place Mem says why a save failed, said as it is (never a stack). */
  stop(): void;
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

/** Mem's own words, without the CLI's "error:" and its request id. */
export function memWords(text: string): string {
  return clip(
    text
      .replace(/\(Request ID: [^)]*\)/gi, "")
      .replace(/^\s*error:\s*/i, "")
      .replace(/\/sources\/\S+ returned \d{3}:\s*/i, ""),
    200,
  );
}

/** D563: why, from what Mem said; never guessed from a name. */
export function whyOf(r: { code: number; out: string; err: string } | { missing: true }): { why: MemFileWhy; message?: string } {
  if ("missing" in r) return { why: "missing" };
  const text = `${r.err}\n${r.out}`;
  if (/api key|unauthori[sz]ed|not (signed in|configured|connected)|connect link|\b401\b|\b403\b/i.test(text)) return { why: "signed_out" };
  if (/timed? ?out|connection (refused|reset)|could not connect|unreachable|dns|network|\b50[234]\b|ECONN/i.test(text)) return { why: "unreachable" };
  const words = memWords(r.err || r.out || `exit ${r.code}`);
  return { why: "refused", ...(words ? { message: words } : {}) };
}

/** The artifact an `add` or `update` answered with (every shape seen or guessed, research/231 §4). */
export function artifactOf(out: string): { doc: string; rev: number; outcome?: string } | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  const cands: any[] = [];
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== "object" || depth > 4) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v.id === "string" || typeof v.source_id === "string" || typeof v.document_id === "string") cands.push(v);
    for (const k of ["source", "sources", "artifact", "artifacts", "revision", "results", "items", "data"]) if (k in v) walk(v[k], depth + 1);
  };
  walk(j, 0);
  const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
  for (const c of cands) {
    const doc = [c.document_id, c.source_id, c.id].find((x) => typeof x === "string" && SAFE.test(x));
    if (!doc) continue;
    const rev = Number(c.latest_revision ?? c.revision ?? j?.latest_revision ?? j?.revision ?? 1);
    const outcome = typeof (c.outcome ?? j?.outcome) === "string" ? String(c.outcome ?? j.outcome) : undefined;
    return { doc, rev: Number.isFinite(rev) && rev > 0 ? Math.floor(rev) : 1, ...(outcome ? { outcome } : {}) };
  }
  return undefined;
}

/** The version Mem says is current, from update's refusal: "… is now current, not 2; nothing was changed." */
export function currentOf(text: string): number | undefined {
  const m = /revision (\d+) is now current|(\d+) is now current, not \d+/i.exec(text);
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The read-back (D566 rev.): what `artifacts list --json` (a VERIFIED shape, research/231 §2) says of
 * the file just written. By its artifact when the write named one (any of its versions), else by
 * the 「Ducter」 folder and the file's exact name, newest first; with the file's sha256, only the
 * version holding these bytes. Undefined: Mem doesn't show it, so it isn't called saved.
 */
export function confirmFrom(out: string, want: { doc?: string; folder?: string; name: string; sha256?: string }): { doc: string; rev: number } | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  const items: any[] = Array.isArray(j?.sources) ? j.sources : Array.isArray(j) ? j : [];
  const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
  const docOf = (x: any) => (typeof x?.document_id === "string" ? x.document_id : typeof x?.id === "string" ? x.id : "");
  const fits = items.filter((x) => {
    if (!x || typeof x !== "object" || !SAFE.test(docOf(x))) return false;
    if (want.doc) {
      if (docOf(x) !== want.doc && x.id !== want.doc) return false;
    } else if (x.original_name !== want.name || (want.folder !== undefined && x.folder_id !== want.folder)) return false;
    return !want.sha256 || x.sha256 === want.sha256;
  });
  const when = (x: any) => Date.parse(x.updated_at ?? x.created_at ?? "") || 0;
  const best = fits.sort((a, b) => (Number(b.revision) || 0) - (Number(a.revision) || 0) || when(b) - when(a))[0];
  if (!best) return undefined;
  const rev = Number(best.revision ?? best.latest_revision ?? 1);
  return { doc: docOf(best), rev: Number.isFinite(rev) && rev > 0 ? Math.floor(rev) : 1 };
}

const NOT_FOUND = /not found|no such|404|doesn't exist|does not exist|deleted/i;
const STALE = /is now current, not|newer version|refused when a newer/i;

const defaultRun = (bin: () => string): Run => async (argv, timeoutMs) => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([bin(), "--json", ...argv], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: nmemEnv() });
  } catch {
    return { missing: true };
  }
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
    return { code, out, err: code !== 0 && !err && !out ? "timed out" : err };
  } finally {
    clearTimeout(timer);
  }
};

/** A file's lineage: the same name from the same task is one artifact in Mem. */
const keyOf = (m: MediaRef) => `${m.from?.taskId ?? "chat"}\u0000${m.name ?? m.id}`;

export function createMemFiles(d: MemFilesDeps): MemFiles {
  const file = join(d.dataDir, MEM_FILES_FILE);
  const now = d.now ?? Date.now;
  const run = d.run ?? defaultRun(d.bin ?? (() => process.env.NMEM_CLI_PATH ?? "nmem"));
  let st: State = { folders: {}, docs: {}, saved: {} };
  try {
    if (existsSync(file)) st = { folders: {}, docs: {}, saved: {}, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch (e) {
    console.warn("[mem-files] couldn't read", MEM_FILES_FILE, (e as Error).message);
  }
  const keep = () => {
    const ids = Object.keys(st.saved);
    for (const id of ids.slice(0, Math.max(0, ids.length - SAVED_MAX))) delete st.saved[id];
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(st), { mode: 0o600 });
    renameSync(tmp, file);
  };
  const inFlight = new Map<string, Promise<MemFileResult>>();
  let chain: Promise<unknown> = Promise.resolve();
  let webRead = false;

  const space = () => d.identity()?.space;
  const spaceArgs = () => (space() ? ["--space", space()!] : []);

  /** Mem on the web, once: its Cloud's own page (`nmem status`: backend cloud, api_url's origin). */
  const readWeb = async () => {
    if (webRead) return;
    webRead = true;
    const r = await run(["status"], 15_000);
    if ("missing" in r || r.code !== 0) return;
    try {
      const j = JSON.parse(r.out);
      if (j?.backend !== "cloud" || typeof j?.api_url !== "string") return;
      const u = new URL(j.api_url);
      if (u.protocol === "https:") st.web = `${u.origin}/app`;
    } catch {
      /* no web link */
    }
  };

  /** The 「Ducter」 folder in the persona's Space: found, else made with an id of ours (safe to repeat). */
  const folder = async (): Promise<{ id: string } | { fail: { code: number; out: string; err: string } | { missing: true } }> => {
    const sp = space() ?? "";
    if (st.folders[sp]) return { id: st.folders[sp]! };
    const ls = await run(["artifacts", "folders", "ls", ...spaceArgs()], 30_000);
    if ("missing" in ls || ls.code !== 0) return { fail: ls };
    try {
      const j = JSON.parse(ls.out);
      const list: any[] = Array.isArray(j?.folders) ? j.folders : [];
      const top = list.find((f) => f && typeof f.id === "string" && f.name === MEM_FOLDER && !f.parent_id);
      if (top) {
        st.folders[sp] = top.id;
        keep();
        return { id: top.id };
      }
    } catch {
      /* made below */
    }
    const id = randomUUID();
    const mk = await run(["artifacts", "folders", "mk", MEM_FOLDER, "--id", id, ...spaceArgs()], 30_000);
    if ("missing" in mk || mk.code !== 0) return { fail: mk };
    let got = id;
    try {
      const j = JSON.parse(mk.out);
      const f = j?.folder ?? j;
      if (typeof f?.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(f.id)) got = f.id;
    } catch {
      /* our own id */
    }
    st.folders[sp] = got;
    keep();
    return { id: got };
  };

  const looksSecret = (m: MediaRef, path: string): boolean => {
    if (secretFileName(m.name)) return true;
    const f = fileFamily(m);
    if (f !== "text" && f !== "code" && f !== "sheet") return false;
    try {
      const buf = readFileSync(path);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(0, TEXT_CHECK_BYTES));
      return redact(text) !== text;
    } catch {
      return false;
    }
  };

  const comment = (m: MediaRef) => {
    const title = m.from?.taskId ? d.taskTitle(m.from.taskId) : undefined;
    return clip(title ? `Made by Ducter: ${title}` : "Made by Ducter in the conversation", 200);
  };

  const doSave = async (id: string, by: MemFileBy): Promise<MemFileResult> => {
    if (!d.memory()) return { ok: false, why: "off" };
    const had = st.saved[id];
    if (had) return { ok: true, saved: had };
    const m = d.media.get(id);
    const path = m ? (d.media.named(id) ?? d.media.path(id)) : undefined;
    if (!m || !path || !existsSync(path)) return { ok: false, why: "gone" };
    if (looksSecret(m, path)) return { ok: false, why: "secret" };
    if (d.memState() === "missing") return { ok: false, why: "missing" };
    await readWeb();
    const key = keyOf(m);
    const prev = st.docs[key];
    const sp = space();
    const done = (doc: string, rev: number): MemFileResult => {
      const saved: MemFileSaved = { uri: `nowledgemem://source/${doc}`, rev, at: new Date(now()).toISOString(), ...(st.web ? { web: st.web } : {}) };
      st.docs[key] = { doc, rev, ...(sp ? { space: sp } : {}) };
      st.saved[id] = saved;
      if (by === "auto" && st.trouble) delete st.trouble;
      keep();
      d.changed();
      return { ok: true, saved };
    };
    const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
    /** The raw answer of a write, for the Log (Mem's metadata only, never the file's contents). */
    const note = (op: "add" | "update", r: Awaited<ReturnType<Run>>, res: MemFileResult) =>
      d.log.append({
        stream: "mem",
        origin: "system",
        kind: "mem_file",
        body: {
          media: id,
          name: m.name ?? "",
          by,
          op,
          ok: res.ok,
          ...(res.ok ? { uri: res.saved.uri, rev: res.saved.rev } : { why: res.why, ...(res.message ? { message: res.message } : {}) }),
          ...("missing" in r ? { raw: "(no nmem)" } : { code: r.code, raw: clip(`${r.out}\n${r.err}`, 2000) }),
        },
      });
    /** Saved only once Mem's own list shows it (the write's answer is a hint at most). */
    const confirmed = async (op: "add" | "update", r: { code: number; out: string; err: string }, want: { doc?: string; folder?: string }): Promise<MemFileResult> => {
      const hint = artifactOf(r.out);
      const doc = want.doc ?? hint?.doc;
      let got: { doc: string; rev: number } | undefined;
      for (let i = 0; i < 2 && !got; i++) {
        if (i) await Bun.sleep(1500); // Mem may list it a moment later
        const l = await run(["artifacts", "list", "-n", "50", ...spaceArgs()], 30_000);
        if (!("missing" in l) && l.code === 0) got = confirmFrom(l.out, { ...(doc ? { doc } : { folder: want.folder }), name: m.name ?? "", sha256: sha });
      }
      const res: MemFileResult = got ? done(got.doc, got.rev) : { ok: false, why: "refused", message: memWords(r.err || r.out) || "Nowledge Mem didn't list the file after saving it" };
      note(op, r, res);
      return res;
    };
    if (prev && (prev.space ?? "") === (sp ?? "")) {
      const update = (base: number) => run(["artifacts", "update", prev.doc, "--base", String(base), "--file", path, ...spaceArgs()], MEM_FILE_MS);
      let r = await update(prev.rev);
      if (!("missing" in r) && r.code !== 0 && STALE.test(`${r.err}\n${r.out}`)) {
        // Someone saved a newer version in Mem. Asked by the person: on top of it (both stay in its
        // history). By itself: theirs stays current.
        if (by === "auto") return { ok: false, why: "refused", message: memWords(r.err || r.out) };
        const cur = currentOf(`${r.err}\n${r.out}`) ?? (await latestOf(prev.doc));
        if (cur) r = await update(cur);
      }
      if (!("missing" in r) && r.code === 0) return confirmed("update", r, { doc: prev.doc });
      // Gone from Mem (deleted there): a new artifact, below. Anything else: said as Mem said it.
      if ("missing" in r || !NOT_FOUND.test(`${r.err}\n${r.out}`)) {
        const res: MemFileResult = { ok: false, ...whyOf(r) };
        note("update", r, res);
        return res;
      }
    }
    const f = await folder();
    if ("fail" in f) return { ok: false, ...whyOf(f.fail) };
    const add = await run(["artifacts", "add", path, "--folder", f.id, "-l", "ducter", "-c", comment(m), ...spaceArgs()], MEM_FILE_MS);
    if ("missing" in add || add.code !== 0) {
      // A folder removed in Mem since: found or made again once.
      if (!("missing" in add) && /folder/i.test(add.err) && NOT_FOUND.test(add.err)) {
        delete st.folders[sp ?? ""];
        const g = await folder();
        if ("fail" in g) return { ok: false, ...whyOf(g.fail) };
        const again = await run(["artifacts", "add", path, "--folder", g.id, "-l", "ducter", "-c", comment(m), ...spaceArgs()], MEM_FILE_MS);
        if (!("missing" in again) && again.code === 0) return confirmed("add", again, { folder: g.id });
        const res: MemFileResult = { ok: false, ...whyOf(again) };
        note("add", again, res);
        return res;
      }
      const res: MemFileResult = { ok: false, ...whyOf(add) };
      note("add", add, res);
      return res;
    }
    return confirmed("add", add, { folder: f.id });
  };

  const latestOf = async (doc: string): Promise<number | undefined> => {
    const r = await run(["artifacts", "history", doc, "-n", "1", ...spaceArgs()], 30_000);
    if ("missing" in r || r.code !== 0) return undefined;
    try {
      const n = Number(JSON.parse(r.out)?.latest_revision);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    } catch {
      return undefined;
    }
  };

  const save = (id: string, by: MemFileBy = "tap"): Promise<MemFileResult> => {
    if (typeof id !== "string" || !/^[a-f0-9]{16,64}$/.test(id)) return Promise.resolve({ ok: false, why: "gone" });
    const going = inFlight.get(id);
    if (going) return going;
    // One at a time: two versions of one file never race to be its next version.
    const p = (chain = chain.then(() => doSave(id, by)).catch((e) => ({ ok: false as const, why: "refused" as const, message: clip(String((e as Error)?.message ?? e), 200) }))) as Promise<MemFileResult>;
    inFlight.set(id, p);
    void p.finally(() => inFlight.delete(id));
    return p;
  };

  // The Settings default: a finished task's reports and documents, by themselves.
  const off = d.log.subscribe((e: LogEvent) => {
    if (e.kind !== "report") return;
    const b = e.body as Bodies["report"];
    if (b.state !== "done" || !b.media?.length || !d.autoOn() || !d.memory() || d.memState() !== "connected") return;
    for (const m of b.media) {
      if (!memAutoKeeps(m) || !memKeeps(m) || st.saved[m.id]) continue;
      void save(m.id, "auto").then((r) => {
        if (r.ok || r.why === "secret" || r.why === "off") return;
        st.trouble = { name: m.name ?? "", why: r.why, ...(r.message ? { message: r.message } : {}), at: new Date(now()).toISOString() };
        keep();
        d.changed();
      });
    }
  });

  return {
    save,
    view: () => ({ ...st.saved }),
    trouble: () => st.trouble,
    stop: off,
  };
}
