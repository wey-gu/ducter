// The persona's Nowledge Mem AI Identity (D141, D18): bound once, kept in persona.json next to the
// partner's name, and named explicitly on every Mem call (memory_add, the identity bundle, a
// task's NMEM_AGENT_ID), so what Ducter writes never depends on whatever NMEM_AGENT_ID the
// environment happens to hold.
//
// Binding, the first time Mem answers with memory on:
//   1. persona.json already has one: use it (every later start; no Mem call).
//   2. Ducter itself runs with NMEM_AGENT_ID set (the user chose an identity for this machine):
//      adopt it, with their NMEM_SPACE. Ducter never edits an identity it adopted.
//   3. Else the persona's own identity, `ducter` (another persona: `ducter-<id>`): adopted when
//      it already exists in Mem (another Ducter of the same user enrolled it), else enrolled with
//      the partner's name, source app `ducter`, and no Space of its own (Mem's default write
//      Space stays the user's call). Mem records the id on every write whether or not a profile
//      exists, so a key that may not enroll (a team member's) still binds the id, without a profile.
// A rename keeps the identity (Mem's identity is the stable binding; a name is only its profile)
// and, for one Ducter enrolled, updates its display name.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MemIdentity } from "@ducter/protocol/src/internal.ts";

const PERSONA_FILE = "persona.json";
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const REFUSED = /\b403\b|forbidden|not granted|insufficient/i;

/** The identity id Ducter enrolls for a persona. */
export function identityIdFor(personaId: string): string {
  return personaId === "default" ? "ducter" : `ducter-${personaId}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}

function readFile(dataDir: string): Record<string, unknown> {
  const p = join(dataDir, PERSONA_FILE);
  try {
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, "utf8"));
      if (j && typeof j === "object") return j;
    }
  } catch {
    /* unreadable: treated as empty */
  }
  return {};
}

export function readMemIdentity(dataDir: string): MemIdentity | undefined {
  const m = readFile(dataDir).mem as Partial<MemIdentity> | undefined;
  if (!m || typeof m.agentId !== "string" || !ID.test(m.agentId)) return undefined;
  return {
    agentId: m.agentId,
    owned: m.owned === true,
    ...(typeof m.space === "string" && m.space ? { space: m.space } : {}),
    ...(typeof m.label === "string" && m.label ? { label: m.label } : {}),
  };
}

export function writeMemIdentity(dataDir: string, mem: MemIdentity) {
  const p = join(dataDir, PERSONA_FILE);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...readFile(dataDir), mem: { ...mem, boundAt: new Date().toISOString() } }, null, 2) + "\n");
  renameSync(tmp, p);
}

export type NmemRun = (args: string[]) => Promise<{ code: number; out: string } | undefined>;

/** `nmem --json …` with a timeout; undefined when nmem can't be started. */
export function nmemRunner(opts: { bin?: string; timeoutMs?: number; env?: Record<string, string | undefined> } = {}): NmemRun {
  return async (args) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([opts.bin ?? (opts.env ?? process.env).NMEM_CLI_PATH ?? "nmem", "--json", ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: (opts.env ?? process.env) as Record<string, string> });
    } catch {
      return undefined;
    }
    const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 15_000);
    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, out: out || err };
    } finally {
      clearTimeout(timer);
    }
  };
}

const parse = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** An agent profile from `nmem --json agents show <id>`: undefined = no such identity, null = Mem didn't answer. */
async function showAgent(run: NmemRun, id: string): Promise<{ name?: string; sourceApp?: string } | undefined | null> {
  const r = await run(["agents", "show", id]);
  if (!r) return null;
  const j = parse(r.out);
  if (j?.error === "not_found") return undefined;
  if (r.code !== 0 || !j || j.error) return null;
  const a = j.agent ?? j.profile ?? j;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { name: str(a.display_name) ?? str(a.displayName) ?? str(a.name), sourceApp: str(a.source_app) ?? str(a.sourceApp) };
}

export interface BindOptions {
  dataDir: string;
  personaId: string;
  /** The partner's name now: an enrolled identity's display name. */
  name: string;
  run: NmemRun;
  /** Ducter's own environment (default process.env): NMEM_AGENT_ID / NMEM_SPACE adopt the user's choice. */
  env?: Record<string, string | undefined>;
  /** Overrides the id Ducter enrolls (the live check's scratch identity). */
  agentId?: string;
  /** A Space for an identity Ducter enrolls (the live check's ducter-scratch); default none. */
  space?: string;
}

/** The persona's identity: the saved one, else bound now (and saved). undefined when Mem didn't answer. */
export async function bindMemIdentity(o: BindOptions): Promise<MemIdentity | undefined> {
  const saved = readMemIdentity(o.dataDir);
  if (saved) return saved;
  const env = o.env ?? process.env;
  let mem: MemIdentity | undefined;
  const userId = env.NMEM_AGENT_ID?.trim();
  if (!o.agentId && userId && ID.test(userId)) {
    const a = await showAgent(o.run, userId);
    if (a === null) return undefined;
    mem = { agentId: userId, owned: false, ...(env.NMEM_SPACE?.trim() ? { space: env.NMEM_SPACE.trim() } : {}), ...(a?.name ? { label: a.name } : {}) };
  } else {
    const id = o.agentId ?? identityIdFor(o.personaId);
    const a = await showAgent(o.run, id);
    if (a === null) return undefined;
    if (a) {
      const owned = a.sourceApp === "ducter";
      mem = { agentId: id, owned, ...(o.space ? { space: o.space } : {}), ...(!owned && a.name ? { label: a.name } : {}) };
    } else {
      const args = ["agents", "enroll", id, "--name", o.name, "--source-app", "ducter", "--description", "Ducter, a personal AI partner. Its conversation and its tasks write to Mem as this identity."];
      if (o.space) args.push("--default-space", o.space);
      const r = await o.run(args);
      if (!r) return undefined;
      // Mem records any identity id on a write; the profile only names it. A key that may not make
      // profiles (a team member's, verified live: 403 "scope … is not granted") still binds the id.
      if (r.code !== 0 && !REFUSED.test(r.out)) return undefined;
      mem = { agentId: id, owned: true, ...(o.space ? { space: o.space } : {}) };
    }
  }
  writeMemIdentity(o.dataDir, mem);
  return mem;
}

/** A rename reaches Mem: the display name of an identity Ducter enrolled. True when Mem took it. */
export async function renameMemIdentity(run: NmemRun, mem: MemIdentity, name: string): Promise<boolean> {
  if (!mem.owned || !name) return false;
  const r = await run(["agents", "set", mem.agentId, "--name", name]);
  return !!r && r.code === 0;
}
