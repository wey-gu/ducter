// D366: Nowledge Mem on a computer for tasks (design/memory.md "Mem on a computer for tasks").
// A task runs with the person's own Nowledge Mem plugin (D168), so a computer lent for tasks
// (D363 put its AI agents there) needs Mem's command line, signed in, with its agents connected to
// it; otherwise its tasks start without the person's Context Bundle and nothing they do there
// reaches Mem. This is the worker's side: where Mem stands there, putting it there, signing it in.
//
// Where it stands: Mem's own `nmem --json doctor` (credential home, server reachable, api key, one
// line per AI tool), read on start, when its card opens, and after each step. Nothing is written.
//
// Putting it there (the person's tap): Mem's PyPI package `nmem-cli`, the route Mem's setup guide
// names for "any other machine" (https://mem.nowledge.co/SKILL.md), through uv, the way Ducter puts
// its own tools there (D363): uv's own static build, pinned and its SHA-256 checked, into
// <data>/tools/bin, then `uv tool install nmem-cli` with every uv folder inside <data>/tools. No
// sudo, no system Python's pip (a bare Ubuntu has none, and its Python is marked externally
// managed), nothing outside Ducter's folder; deleting <data>/tools undoes it. A computer that
// already has `nmem` (the person's own) keeps it.
//
// Signing in (the person's tap, with what Mem's Connectors page copies: a prompt carrying a one-time
// token and its Mem's address, made into a connect link here, D370): Mem's own
// `nmem connect <link> --tool <each agent there>`, which redeems the link, writes Mem's single
// credential home (~/.nowledge-mem/config.json), verifies it live, and registers Mem's plugin in
// Claude Code and Codex (DOCUMENTED, SKILL.md "What nmem connect does"). With no link and Mem
// already signed in, the same command only connects the agents. The link goes to nmem's argv and
// nowhere else: never logged, kept, or sent back; any line shown is scrubbed of it.
//
// D386: the person's own nmem too old for this (the old Python CLI, which has neither `doctor` nor
// `connect`: haswell's answered the pasted prompt with an argparse usage error). Known up front, from
// its doctor's usage error, so the paste is never sent to it: the row says so and offers one tap that
// puts Ducter's own current copy in <data>/tools (the same uv route) and uses it on that computer,
// for Mem's steps here and, through a link in <data>/tools/prefer that goes first on PATH
// (agent-path.ts), for the tasks and Mem's plugins inside them. The person's own copy is never
// changed; the row says how they'd update it. Once theirs works again, the link goes away and theirs
// is used, as before. A sign-in that still meets an nmem that can't take it puts Ducter's in first.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MEM_CONNECT_TOOLS, memHealthOf, memHost, nmemTooOld, type DeviceMemReason, type DeviceMemView } from "@ducter/protocol";
import { toolsOwnBin, toolsPreferBin } from "./agent-path.ts";
import { realAgentSetupSys } from "./agent-setup.ts";
import { connectLinkFrom } from "./mem-cli.ts";

/** uv, the one tool Ducter brings to put Mem's command line in (a release at least two weeks old). */
export const UV_RELEASE = {
  version: "0.13.7",
  base: "https://github.com/astral-sh/uv/releases/download",
  assets: {
    "darwin-arm64": { target: "aarch64-apple-darwin", sha256: "81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731" },
    "darwin-x64": { target: "x86_64-apple-darwin", sha256: "20c47e4c1f630b8abaff8c291fa9b9aa300fef92c4fbff95adf198b55287cda7" },
    "linux-arm64": { target: "aarch64-unknown-linux-musl", sha256: "2d3ec076a0c4c0e8250bb6418c44080828b544f1a3be0b6e46adf9fb6923de45" },
    "linux-x64": { target: "x86_64-unknown-linux-musl", sha256: "287491da03f2a785c70fa75b13e1f849918c2f2b5415fe84876b8214eeb792f9" },
  } as Record<string, { target: string; sha256: string }>,
};
export const MEM_PACKAGE = "nmem-cli";

/** Mem's own tool id for each agent `nmem connect` registers by itself (SKILL.md: Claude Code and Codex); D375 moved it to the protocol. */
export { MEM_CONNECT_TOOLS };

export interface WorkerMemSys {
  platform: string;
  arch: string;
  download(url: string, onProgress?: (pct: number) => void): Promise<Uint8Array>;
  run(argv: string[], o: { env: Record<string, string>; timeoutMs: number }): Promise<{ code: number; out: string }>;
  /** Where `nmem` is now (the person's own first, then Ducter's tools folder), or null; with `path`, on that PATH instead. */
  which(cmd: string, path?: string): string | null;
  /** nmem's environment (the basics and Mem's own NMEM_*; the widened PATH, so it finds the agents). */
  env(): Record<string, string>;
  writeFile?: (p: string, b: Uint8Array) => void;
  /** Tests: whether a file is there (default: the disk). */
  exists?: (p: string) => boolean;
  /** Tests: where a command really is and its first line (default: the disk), to say how the person updates theirs. */
  inspect?: (p: string) => { real: string; head: string };
}

/** D386: how the person updates their own nmem, from where it really is and what runs it. */
export function theirUpdateHow(i: { real: string; head: string }): "pipx" | "uv" | "pip" | undefined {
  const both = `${i.real}\n${i.head}`;
  if (/[\\/]pipx[\\/]/.test(both)) return "pipx";
  if (/[\\/]uv[\\/]tools[\\/]/.test(both)) return "uv";
  if (/^#!.*python/.test(i.head)) return "pip";
  return undefined;
}

const realInspect = (p: string) => {
  let real = p;
  let head = "";
  try {
    real = realpathSync(p);
    head = readFileSync(real).subarray(0, 200).toString("utf8").split("\n")[0] ?? "";
  } catch {
    /* can't tell: no hint */
  }
  return { real, head };
};

export interface WorkerMem {
  /** Reads where Mem stands now (doctor) and says it. */
  look(): Promise<void>;
  install(): void;
  /** With a link: sign in and connect the agents; without one (already signed in): connect the agents. */
  connect(link?: string): void;
  /**
   * D375: the home's 装上 for one agent's Mem plugin here (D169): Mem's own `nmem connect --tool`
   * for those agents, no link (Mem must be signed in here). Answers when it ended; the home then
   * reads the plugin check again. unsupported: no nmem, or none of these agents is one Mem connects.
   */
  connectTools(harnesses: string[]): Promise<{ ok: true } | { ok: false; reason: "unsupported" | "busy" | "failed"; detail?: string }>;
  view(): DeviceMemView;
  busy(): boolean;
}

const NET = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|getaddrinfo|network|socket hang up|fetch failed|Unable to connect|timed? ?out/i;
const SPACE = /ENOSPC|no space left/i;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
const installReason = (text: string): DeviceMemReason => (SPACE.test(text) ? "space" : NET.test(text) ? "network" : "failed");

/** A line safe to show: no link, no token or key shape, at most 160 characters. */
export function scrub(text: string, link?: string): string {
  let s = text.replace(ANSI, "");
  if (link) s = s.split(link.trim()).join("<link>");
  return s
    .replace(/https?:\/\/\S*(nmem_connect|nmem_api_key|[?&](token|key)=)\S*/gi, "<link>")
    .replace(/\bnmem_[a-z]{2}_[A-Za-z0-9_\-]+/g, "nmem_…")
    .replace(/\bnmem_[A-Za-z0-9]{20,}/g, "nmem_…")
    .replace(/("?api[_-]?key"?\s*[:=]\s*"?)[^\s",}]+/gi, "$1…")
    .replace(/\b(sk|key|token)[-_][A-Za-z0-9_\-]{12,}/gi, "…");
}
const lastLine = (text: string, link?: string) =>
  scrub(text, link)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^warning: .*not on your PATH/i.test(l))
    .pop()
    ?.slice(0, 160);

/** What `nmem connect` said when it didn't (Mem answers a used or expired link with one 410). */
export function connectReason(out: string): DeviceMemReason {
  if (/\b410\b|gone|already (been )?used|expired|redeem(ed)?.*(once|invalid)/i.test(out)) return "used";
  // D370: Mem turned the sign-in down (a key it doesn't accept).
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|invalid api key/i.test(out)) return "refused";
  if (/dns error|failed to lookup|connection refused|tcp connect|timed? ?out|unreachable|error sending request|certificate/i.test(out)) return "unreachable";
  return "failed";
}

/** Mem's own doctor, as the card needs it: signed in or not, and which of these agents it connected. */
export function readDoctor(out: string): { ready: boolean; agents: string[] } | undefined {
  let j: { checks?: { name?: unknown; status?: unknown; tool?: unknown }[] };
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  if (!Array.isArray(j?.checks)) return undefined;
  const by = (n: string) => j.checks!.find((c) => String(c.name ?? "").toLowerCase() === n)?.status;
  // Signed in: the server answers and the key is good (a fresh computer's default is a local Mem that isn't there).
  const ready = by("server reachable") === "pass" && by("api key") === "pass";
  const tools = Object.entries(MEM_CONNECT_TOOLS);
  const agents = j.checks.filter((c) => c.status === "pass" && typeof c.tool === "string").flatMap((c) => tools.filter(([, id]) => id === c.tool).map(([h]) => h));
  return { ready, agents };
}

export function createWorkerMem(o: {
  dataDir: string;
  sys: WorkerMemSys;
  /** The agents installed on this computer now (harness ids), for `--tool`. */
  agents: () => string[];
  /** The view changed: send it up now. */
  changed: () => void;
  /** After a sign-in: the home reads Mem's plugin check again (the agents' Mem lines). */
  connected?: () => void;
  /** D386: Ducter's nmem went ahead on PATH or stepped back: the worker widens its PATH again. */
  pathChanged?: () => void;
  /** Tests: another uv pin (a fake download's checksum). */
  uv?: typeof UV_RELEASE;
}): WorkerMem {
  const { sys } = o;
  const UV = o.uv ?? UV_RELEASE;
  const writeFile = sys.writeFile ?? ((p: string, b: Uint8Array) => writeFileSync(p, b));
  const tools = join(o.dataDir, "tools");
  const bin = toolsOwnBin(o.dataDir);
  const asset = UV.assets[`${sys.platform}-${sys.arch}`];
  const exists = sys.exists ?? existsSync;
  const inspect = sys.inspect ?? realInspect;
  const prefer = toolsPreferBin(o.dataDir);
  let view: DeviceMemView = { state: "absent", ...(asset ? { installable: true } : {}) };
  let step: DeviceMemView["step"];
  let running = false;
  /** D386: the nmem Ducter uses here, as the last look found it (one whose doctor answers), or undefined. */
  let usable: string | undefined;

  const inTools = (p: string) => p === tools || p.startsWith(tools + "/");
  /** Ducter's own copy, when it is there. */
  const oursNow = () => {
    const p = join(bin, "nmem");
    if (exists(p)) return p;
    const w = sys.which("nmem");
    return w && w.startsWith(bin + "/") ? w : undefined;
  };
  /** The person's own: the first `nmem` on PATH outside Ducter's tools folder. */
  const theirsNow = () => {
    const outside = (sys.env().PATH ?? process.env.PATH ?? "").split(":").filter((d) => d && !inTools(d)).join(":");
    const w = sys.which("nmem", outside);
    return w && !inTools(w) ? w : undefined;
  };
  /** D386: Ducter's nmem first on PATH (tasks, Mem's plugins in them) only while the person's is too old. */
  const preferOurs = (on: boolean) => {
    const link = join(prefer, "nmem");
    const had = existsSync(link);
    try {
      if (on && !had) {
        rmSync(prefer, { recursive: true, force: true });
        mkdirSync(prefer, { recursive: true });
        symlinkSync(join(bin, "nmem"), link);
      } else if (!on && existsSync(prefer)) rmSync(prefer, { recursive: true, force: true });
    } catch {
      return; // a read-only tools folder: Ducter's own steps still use its copy by its path
    }
    if (on !== had) o.pathChanged?.();
  };
  const doctor = (nmem: string) => sys.run([nmem, "--json", "doctor"], { env: sys.env(), timeoutMs: 30_000 });
  const serverOf = async (nmem: string): Promise<string | undefined> => {
    const r = await sys.run([nmem, "--json", "status"], { env: sys.env(), timeoutMs: 20_000 }).catch(() => undefined);
    if (!r || r.code !== 0) return undefined;
    const at = r.out.indexOf("{");
    try {
      return memHost((JSON.parse(at > 0 ? r.out.slice(at) : r.out) as { api_url?: unknown }).api_url);
    } catch {
      return undefined;
    }
  };

  const say = () => o.changed();
  const set = (s: DeviceMemView["step"]) => ((step = s), say());
  const uvEnv = (): Record<string, string> => ({
    ...sys.env(),
    UV_TOOL_DIR: join(tools, "uv-tools"),
    UV_TOOL_BIN_DIR: bin,
    UV_PYTHON_INSTALL_DIR: join(tools, "python"),
    UV_CACHE_DIR: join(tools, ".uv-cache"),
    UV_NO_MODIFY_PATH: "1",
  });

  async function look(): Promise<void> {
    const theirs = theirsNow();
    const ours = oursNow();
    let nmem = theirs ?? ours;
    usable = undefined;
    if (!nmem) {
      preferOurs(false);
      view = { state: "absent", ...(asset ? { installable: true } : {}) };
      return say();
    }
    let d = await doctor(nmem);
    // D386: the person's own one has no doctor (too old to sign in): Ducter's own copy, if it put one here.
    let theirsOld: DeviceMemView["theirs"];
    if (theirs && memHealthOf(d, [])?.issue === "old") {
      const how = theirUpdateHow(inspect(theirs));
      theirsOld = { old: true, ...(how ? { how } : {}) };
      if (ours) d = await doctor((nmem = ours));
    }
    preferOurs(!!theirsOld && !!ours);
    if (theirsOld && !ours) {
      // Nothing here can sign in: the row offers Ducter's own copy, never the paste.
      view = { state: "sign_in", health: { issue: "old" }, theirs: theirsOld, ...(asset ? { installable: true } : {}) };
      return say();
    }
    const v = await sys.run([nmem, "--version"], { env: sys.env(), timeoutMs: 10_000 });
    const version = /(\d+\.\d+\.\d+[\w.-]*)/.exec(v.out)?.[1];
    const doc = readDoctor(d.out);
    // D375: what Mem's own doctor says is wrong here, said on the row (a first sign-in and an agent
    // not connected yet are the row's own states already).
    const h = memHealthOf(d, o.agents());
    const health = h?.issue && h.issue !== "plugin" && !(h.issue === "signed_out" && h.fresh) ? { health: { issue: h.issue } } : {};
    if (h?.issue !== "old") usable = nmem;
    // D480: which Mem server this computer's own connection talks to (read-only), so a mailbox
    // opened here is known to reach the partner's Mem or not.
    const server = doc?.ready ? await serverOf(nmem) : undefined;
    view = {
      state: doc?.ready ? "ready" : "sign_in",
      ...(server ? { server } : {}),
      ...(version ? { version } : {}),
      ...(doc?.agents.length ? { agents: doc.agents } : {}),
      ...health,
      ...(nmem.startsWith(bin) ? { ours: true as const } : {}),
      ...(theirsOld ? { theirs: theirsOld } : {}),
    };
    say();
  }

  /** uv's own build, put in <data>/tools/bin once. */
  async function ensureUv(onPct: (pct: number) => void): Promise<{ ok: true; uv: string } | { ok: false; reason: DeviceMemReason; detail?: string }> {
    const uv = join(bin, "uv");
    if (existsSync(uv)) return { ok: true, uv };
    if (!asset) return { ok: false, reason: "unsupported" };
    const file = `uv-${asset.target}.tar.gz`;
    let bytes: Uint8Array;
    try {
      bytes = await sys.download(`${UV.base}/${UV.version}/${file}`, onPct);
    } catch (e) {
      return { ok: false, reason: "network", detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return { ok: false, reason: "failed", detail: "the download didn't match its checksum" };
    const tmp = join(tools, ".uv-new");
    try {
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFile(join(tmp, file), bytes);
    } catch (e) {
      return { ok: false, reason: installReason(String(e)), detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    const r = await sys.run(["tar", "-xzf", join(tmp, file), "-C", tmp], { env: sys.env(), timeoutMs: 2 * 60_000 });
    if (r.code !== 0) return { ok: false, reason: installReason(r.out), detail: lastLine(r.out) };
    try {
      renameSync(join(tmp, `uv-${asset.target}`, "uv"), uv);
      rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, reason: installReason(String(e)), detail: lastLine(String((e as Error)?.message ?? e)) };
    }
    return { ok: true, uv };
  }

  type Done = { ok: true } | { ok: false; reason: DeviceMemReason; detail?: string };
  const failed = (r: Done) => (r.ok ? undefined : set({ phase: "failed", reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) }));

  async function installNow(): Promise<void> {
    const r = await putOurs();
    if (!r.ok) return failed(r);
    step = undefined;
    await look();
  }

  /** Ducter's own current nmem into its tools folder (uv's checked build, then `uv tool install`). */
  async function putOurs(): Promise<Done> {
    set({ phase: "installing" });
    let last = -1;
    const got = await ensureUv((p) => {
      const pct = Math.round(p * 0.6); // uv is most of the download; Mem's package is the rest
      if (pct === last) return;
      last = pct;
      set({ phase: "installing", pct });
    });
    if (!got.ok) return got;
    set({ phase: "installing", pct: 60 });
    const r = await sys.run([got.uv, "tool", "install", MEM_PACKAGE], { env: uvEnv(), timeoutMs: 10 * 60_000 });
    if (r.code !== 0 && !/already installed/i.test(r.out)) {
      const detail = lastLine(r.out);
      return { ok: false, reason: installReason(r.out), ...(detail ? { detail } : {}) };
    }
    return { ok: true };
  }

  /** D375: an nmem too old to have a doctor: Ducter's own copy is upgraded in place; the person's own is theirs. */
  async function upgradeNow(): Promise<void> {
    if (!oursNow() || !exists(join(bin, "uv"))) return look();
    const r = await upgradeOurs();
    if (!r.ok) return failed(r);
    step = undefined;
    await look();
  }

  async function upgradeOurs(): Promise<Done> {
    set({ phase: "installing" });
    const r = await sys.run([join(bin, "uv"), "tool", "upgrade", MEM_PACKAGE], { env: uvEnv(), timeoutMs: 10 * 60_000 });
    if (r.code !== 0) {
      const detail = lastLine(r.out);
      return { ok: false, reason: installReason(r.out), ...(detail ? { detail } : {}) };
    }
    return { ok: true };
  }

  /**
   * D386: an nmem here that can sign in, looked at now: the one the last look found, else Ducter's
   * own put in (the person's is too old, or there is none) or updated (Ducter's own is too old).
   */
  async function readyNmem(): Promise<{ ok: true; nmem: string } | { ok: false; reason: DeviceMemReason; detail?: string }> {
    await look();
    if (usable) return { ok: true, nmem: usable };
    const ours = oursNow();
    const r: Done = ours ? (exists(join(bin, "uv")) ? await upgradeOurs() : { ok: false, reason: "old" }) : asset ? await putOurs() : { ok: false, reason: "old" };
    step = undefined;
    if (!r.ok) return r;
    await look();
    return usable ? { ok: true, nmem: usable } : { ok: false, reason: "old" };
  }

  async function connectToolsNow(harnesses: string[]): Promise<{ ok: true } | { ok: false; reason: "unsupported" | "busy" | "failed"; detail?: string }> {
    await look();
    const nmem = usable; // D386: never one too old to connect
    const tools = harnesses.flatMap((h) => (MEM_CONNECT_TOOLS[h] ? ["--tool", MEM_CONNECT_TOOLS[h]!] : []));
    if (!nmem || !tools.length) return { ok: false, reason: "unsupported" };
    // abort: an agent that already has another memory integration is left alone (the task that follows reads it).
    const r = await sys.run([nmem, "--json", "connect", ...tools, "--on-conflict", "abort"], { env: sys.env(), timeoutMs: 5 * 60_000 });
    await look();
    if (r.code !== 0) {
      const detail = nmemTooOld(r.out) ? undefined : lastLine(r.out);
      return { ok: false, reason: "failed", ...(detail ? { detail } : {}) };
    }
    return { ok: true };
  }

  async function connectNow(pasted?: string): Promise<void> {
    // D370: what Mem copies is a whole prompt (or its token, or a link): the link is made from it.
    const link = pasted === undefined ? undefined : connectLinkFrom(pasted);
    if (pasted !== undefined && !link) return set({ phase: "failed", reason: "bad_link" });
    // D386: never to an nmem that can't take it (the link stays unspent): Ducter's own first.
    const got = await readyNmem();
    if (!got.ok) return failed(got);
    const nmem = got.nmem;
    set({ phase: "connecting" });
    const here = o.agents().filter((h) => MEM_CONNECT_TOOLS[h]);
    const toolArgs = here.length ? here.flatMap((h) => ["--tool", MEM_CONNECT_TOOLS[h]!]) : ["--skip-tools"];
    // Cloning a plugin's marketplace is most of it; a slow line gets five minutes.
    const r = await sys.run([nmem, "--json", "connect", ...(link ? [link] : []), ...toolArgs], { env: sys.env(), timeoutMs: 5 * 60_000 });
    if (r.code !== 0) {
      // D386: a usage error is "too old", said in words (nmem refused it before redeeming anything).
      if (nmemTooOld(r.out)) return set({ phase: "failed", reason: "old" });
      const detail = lastLine(r.out, link);
      return set({ phase: "failed", reason: connectReason(r.out), ...(detail ? { detail } : {}) });
    }
    step = undefined;
    await look();
    if (view.state === "ready") o.connected?.();
  }

  const once = (fn: () => Promise<void>) => {
    if (running) return;
    running = true;
    void fn()
      .catch((e) => set({ phase: "failed", reason: "failed", detail: lastLine(String((e as Error)?.message ?? e)) ?? "" }))
      .finally(() => (running = false));
  };

  return {
    look: () => (running ? Promise.resolve() : look().catch(() => {})),
    // D386: the person's own too old (or none) and none of Ducter's here yet: Ducter's own goes in beside it.
    install: () => once(async () => (!oursNow() && (!theirsNow() || view.theirs?.old) ? installNow() : view.health?.issue === "old" && oursNow() ? upgradeNow() : look())),
    connect: (link) => once(() => connectNow(link)),
    async connectTools(harnesses) {
      if (running) return { ok: false, reason: "busy" };
      running = true;
      try {
        return await connectToolsNow(harnesses);
      } catch (e) {
        const detail = lastLine(String((e as Error)?.message ?? e));
        return { ok: false, reason: "failed", ...(detail ? { detail } : {}) };
      } finally {
        running = false;
      }
    },
    view: () => ({ ...view, ...(step ? { step } : {}) }),
    busy: () => running,
  };
}

/** The real seams: Ducter's download and process runner (agent-setup.ts), nmem found where the worker looks. */
export function realWorkerMemSys(o: { platform: string; arch: string; which: (c: string, path?: string) => string | null; env: () => Record<string, string> }): WorkerMemSys {
  const s = realAgentSetupSys({ platform: o.platform, arch: o.arch, which: o.which });
  return { platform: o.platform, arch: o.arch, download: s.download, run: s.run, which: o.which, env: o.env };
}
