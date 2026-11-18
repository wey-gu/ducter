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
// token and its Mem's address, made into a connect link here, D371): Mem's own
// `nmem connect <link> --tool <each agent there>`, which redeems the link, writes Mem's single
// credential home (~/.nowledge-mem/config.json), verifies it live, and registers Mem's plugin in
// Claude Code and Codex (DOCUMENTED, SKILL.md "What nmem connect does"). With no link and Mem
// already signed in, the same command only connects the agents. The link goes to nmem's argv and
// nowhere else: never logged, kept, or sent back; any line shown is scrubbed of it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeviceMemReason, DeviceMemView } from "@ducter/protocol";
import { toolsOwnBin } from "./agent-path.ts";
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

/** Mem's own tool id for each agent `nmem connect` registers by itself (SKILL.md: Claude Code and Codex). */
export const MEM_CONNECT_TOOLS: Readonly<Record<string, string>> = { "claude-code": "claude-code", codex: "codex-cli" };

export interface WorkerMemSys {
  platform: string;
  arch: string;
  download(url: string, onProgress?: (pct: number) => void): Promise<Uint8Array>;
  run(argv: string[], o: { env: Record<string, string>; timeoutMs: number }): Promise<{ code: number; out: string }>;
  /** Where `nmem` is now (the person's own first, then Ducter's tools folder), or null. */
  which(cmd: string): string | null;
  /** nmem's environment (the basics and Mem's own NMEM_*; the widened PATH, so it finds the agents). */
  env(): Record<string, string>;
  writeFile?: (p: string, b: Uint8Array) => void;
}

export interface WorkerMem {
  /** Reads where Mem stands now (doctor) and says it. */
  look(): Promise<void>;
  install(): void;
  /** With a link: sign in and connect the agents; without one (already signed in): connect the agents. */
  connect(link?: string): void;
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
  // D371: Mem turned the sign-in down (a key it doesn't accept).
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
  /** Tests: another uv pin (a fake download's checksum). */
  uv?: typeof UV_RELEASE;
}): WorkerMem {
  const { sys } = o;
  const UV = o.uv ?? UV_RELEASE;
  const writeFile = sys.writeFile ?? ((p: string, b: Uint8Array) => writeFileSync(p, b));
  const tools = join(o.dataDir, "tools");
  const bin = toolsOwnBin(o.dataDir);
  const asset = UV.assets[`${sys.platform}-${sys.arch}`];
  let view: DeviceMemView = { state: "absent", ...(asset ? { installable: true } : {}) };
  let step: DeviceMemView["step"];
  let running = false;

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
    const nmem = sys.which("nmem");
    if (!nmem) {
      view = { state: "absent", ...(asset ? { installable: true } : {}) };
      return say();
    }
    const v = await sys.run([nmem, "--version"], { env: sys.env(), timeoutMs: 10_000 });
    const version = /(\d+\.\d+\.\d+[\w.-]*)/.exec(v.out)?.[1];
    const d = await sys.run([nmem, "--json", "doctor"], { env: sys.env(), timeoutMs: 30_000 });
    const doc = readDoctor(d.out);
    view = { state: doc?.ready ? "ready" : "sign_in", ...(version ? { version } : {}), ...(doc?.agents.length ? { agents: doc.agents } : {}) };
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

  async function installNow(): Promise<void> {
    set({ phase: "installing" });
    let last = -1;
    const got = await ensureUv((p) => {
      const pct = Math.round(p * 0.6); // uv is most of the download; Mem's package is the rest
      if (pct === last) return;
      last = pct;
      set({ phase: "installing", pct });
    });
    if (!got.ok) return set({ phase: "failed", reason: got.reason, ...(got.detail ? { detail: got.detail } : {}) });
    set({ phase: "installing", pct: 60 });
    const r = await sys.run([got.uv, "tool", "install", MEM_PACKAGE], { env: uvEnv(), timeoutMs: 10 * 60_000 });
    if (r.code !== 0 && !/already installed/i.test(r.out)) {
      const detail = lastLine(r.out);
      return set({ phase: "failed", reason: installReason(r.out), ...(detail ? { detail } : {}) });
    }
    step = undefined;
    await look();
  }

  async function connectNow(pasted?: string): Promise<void> {
    const nmem = sys.which("nmem");
    if (!nmem) return set({ phase: "failed", reason: "failed" });
    // D371: what Mem copies is a whole prompt (or its token, or a link): the link is made from it.
    const link = pasted === undefined ? undefined : connectLinkFrom(pasted);
    if (pasted !== undefined && !link) return set({ phase: "failed", reason: "bad_link" });
    set({ phase: "connecting" });
    const here = o.agents().filter((h) => MEM_CONNECT_TOOLS[h]);
    const toolArgs = here.length ? here.flatMap((h) => ["--tool", MEM_CONNECT_TOOLS[h]!]) : ["--skip-tools"];
    // Cloning a plugin's marketplace is most of it; a slow line gets five minutes.
    const r = await sys.run([nmem, "--json", "connect", ...(link ? [link] : []), ...toolArgs], { env: sys.env(), timeoutMs: 5 * 60_000 });
    if (r.code !== 0) {
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
    install: () => once(async () => (sys.which("nmem") ? look() : installNow())),
    connect: (link) => once(() => connectNow(link)),
    view: () => ({ ...view, ...(step ? { step } : {}) }),
    busy: () => running,
  };
}

/** The real seams: Ducter's download and process runner (agent-setup.ts), nmem found where the worker looks. */
export function realWorkerMemSys(o: { platform: string; arch: string; which: (c: string) => string | null; env: () => Record<string, string> }): WorkerMemSys {
  const s = realAgentSetupSys({ platform: o.platform, arch: o.arch, which: o.which });
  return { platform: o.platform, arch: o.arch, download: s.download, run: s.run, which: o.which, env: o.env };
}
