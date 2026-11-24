// D539: 复制密钥 / Copy a key, one computer's side (design/system.md "Keys copied between computers").
// Every computer Ducter runs on (the home and each worker) has the same ops, so the home drives a
// copy the same way whichever computers it is between:
//   keys_has    whether a variable is here: kept by Ducter, in Ducter's key file, or in the person's
//               shell (their login shell prints that one variable; nothing else is read). A yes or no.
//   keys_offer  this computer will keep it: a fresh X25519 pair for this one copy; the public half
//               goes back, the private half stays in memory for two minutes at most.
//   keys_seal   this computer has it: read it here and seal it to the offer (key-seal.ts). Only the
//               sealed box leaves; the value is never in an answer, a frame, a log or a file.
//   keys_take   open the sealed box with the offer and keep it in the shelf.
//   keys_list   the names kept here, with where from and when (never a value).
//   keys_remove forget one (and take it out of every task file here at once).
//   keys_file   a task here gets the kept keys it holds: a 0600 file it sources inside one command.
//   keys_drop   that task ended: its file goes.
// The shelf is <dataDir>/kept-keys/keys.enc, AES-256-GCM, its key apart from it: the login keychain
// on a Mac ("Ducter Keys"), a 0600 key file elsewhere (protocol/src/lock-key.ts). A task session
// started here with keyRefs gets those variables in its environment, read here, at its start.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import type { SessionSpec } from "./internal.ts";
import type { KeptKeyView, KeySource } from "./key-copy.ts";
import { offerPair, openKey, sealKey, type SealedKey } from "./key-seal.ts";
import { KEPT_KEYS_SERVICE, keySource as lockOf, type KeySource as Lock } from "./lock-key.ts";
import { readKeys } from "./keys.ts";
import { KEY_ENV, KEY_ENV_DENIED } from "./saved.ts";

const OFFER_MS = 120_000;
const NAME_MAX = 120;

interface Kept {
  env: string;
  name: string;
  value: string;
  from?: string;
  at: string;
  usedAt?: string;
}

/** A variable a key may be kept under: capitals, and never one that changes how a program starts. */
export function keyEnvOk(raw: unknown): string {
  const env = String(raw ?? "").trim();
  if (!KEY_ENV.test(env) || KEY_ENV_DENIED.test(env)) throw new Error(`${env || "that"} isn't a variable a key can be kept under`);
  return env;
}

/** A path quoted for a POSIX shell. */
const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/**
 * The person's login shell prints one variable, between markers (an rc file that prints a banner
 * can't be mistaken for it). The name is checked first, so nothing else reaches the shell.
 */
export async function shellVar(env: string, o: { shell?: string; timeoutMs?: number } = {}): Promise<string | undefined> {
  const name = keyEnvOk(env);
  const shell = o.shell || process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  try {
    const p = Bun.spawn([shell, "-ilc", `printf '\\036%s\\036' "\${${name}:-}"`], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, DUCTER_KEY_LOOK: "1" } });
    const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 10_000);
    const out = await new Response(p.stdout).text();
    clearTimeout(timer);
    await p.exited;
    const m = /\x1e([^\x1e]*)\x1e/.exec(out);
    return m?.[1] ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

export interface KeyShelfOptions {
  dataDir: string;
  /** Test seam: the person's shell's value of a variable (default: their login shell, shellVar). */
  shell?: (env: string) => Promise<string | undefined>;
  /** Test seam: Ducter's own environment here (default process.env). */
  env?: Record<string, string | undefined>;
  /** Test seam: the shelf's lock (default: the keychain on a Mac, a key file elsewhere). */
  lock?: Lock;
  now?: () => Date;
}

export interface KeyShelf {
  /** The ops the home calls on this computer (worker-host extraOps, or the home's own). */
  ops: Record<string, (a: any) => Promise<unknown>>;
  /** A session spec with the kept keys it names (keyRefs) in its environment, read here. */
  withKeys(spec: SessionSpec): SessionSpec;
  /** Every value kept here (for scrubbing what a task here prints, on its way to the home). */
  values(): string[];
  list(): KeptKeyView[];
}

export function createKeyShelf(o: KeyShelfOptions): KeyShelf {
  const dir = join(o.dataDir, "kept-keys");
  const path = join(dir, "keys.enc");
  const filesDir = join(o.dataDir, "task-keys");
  const lock = o.lock ?? lockOf({ dataDir: o.dataDir, dir, service: KEPT_KEYS_SERVICE });
  const now = o.now ?? (() => new Date());
  // Under `bun test` the person's own shell is never started (a test gives its own).
  const testing = process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test";
  const shell = o.shell ?? (testing ? async () => undefined : (env: string) => shellVar(env));
  const offers = new Map<string, { env: string; priv: KeyObject; until: number }>();
  let cache: Kept[] | undefined;

  const load = (): Kept[] => {
    if (cache) return cache;
    if (!existsSync(path)) return (cache = []);
    const k = lock.get(false);
    if (!k) throw new Error("the lock of the keys kept here is missing, so they can't be opened");
    const f = JSON.parse(readFileSync(path, "utf8")) as { v: 1; iv: string; tag: string; data: string };
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(f.iv, "base64"));
    d.setAuthTag(Buffer.from(f.tag, "base64"));
    return (cache = (JSON.parse(Buffer.concat([d.update(Buffer.from(f.data, "base64")), d.final()]).toString("utf8")) as { keys: Kept[] }).keys ?? []);
  };
  const save = (keys: Kept[]) => {
    const k = lock.get(true)!;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", k, iv);
    const data = Buffer.concat([c.update(JSON.stringify({ keys }), "utf8"), c.final()]);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") }), { mode: 0o600 });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
    cache = keys;
  };
  const view = (k: Kept): KeptKeyView => ({ env: k.env, name: k.name, at: k.at, ...(k.from ? { from: k.from } : {}), ...(k.usedAt ? { usedAt: k.usedAt } : {}) });
  const kept = (env: string) => load().find((k) => k.env === env);

  /** Where a variable is here, in the order a copy reads it. */
  const find = async (env: string): Promise<{ source: KeySource | "kept"; value: string } | undefined> => {
    const k = kept(env);
    if (k) return { source: "kept", value: k.value };
    const own = (o.env ?? process.env)[env] || readKeys(o.dataDir)[env];
    if (own) return { source: "ducter", value: own };
    const sh = await shell(env);
    return sh ? { source: "shell", value: sh } : undefined;
  };

  const fileOf = (taskId: string) => join(filesDir, `${String(taskId).replace(/[^A-Za-z0-9_-]+/g, "_")}.kept.env`);
  /** Which kept keys each task file here holds (so a removal reaches them at once). */
  const holds = new Map<string, string[]>();
  const writeFile = (taskId: string, envs: string[]): string | undefined => {
    const file = fileOf(taskId);
    const have = envs.map((e) => kept(e)).filter((k): k is Kept => !!k);
    holds.set(taskId, have.map((k) => k.env));
    if (!have.length) return void rmSync(file, { force: true });
    mkdirSync(filesDir, { recursive: true, mode: 0o700 });
    const body = [
      "# Keys Ducter keeps on this computer, given to this task (D539). Source this file inside the one",
      "# command that needs them; never print it. It is removed when the task ends.",
      ...have.map((k) => `export ${k.env}=${shq(k.value)}`),
      "",
    ].join("\n");
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
    return file;
  };
  const touch = (envs: string[]) => {
    const keys = load();
    const at = now().toISOString();
    let changed = false;
    for (const k of keys) if (envs.includes(k.env)) (k.usedAt = at), (changed = true);
    if (changed) save(keys);
  };
  const sweepOffers = () => {
    const t = Date.now();
    for (const [id, x] of offers) if (x.until <= t) offers.delete(id);
  };

  const ops: KeyShelf["ops"] = {
    async keys_has(a: { env?: unknown }) {
      const env = keyEnvOk(a.env);
      const f = await find(env);
      return f ? { has: true, source: f.source } : { has: false };
    },
    async keys_offer(a: { env?: unknown; copy?: unknown }) {
      const env = keyEnvOk(a.env);
      const copy = String(a.copy ?? "");
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(copy)) throw new Error("a copy needs its id");
      sweepOffers();
      const { pub, priv } = offerPair();
      offers.set(copy, { env, priv, until: Date.now() + OFFER_MS });
      return { pub };
    },
    async keys_seal(a: { env?: unknown; pub?: unknown; copy?: unknown }) {
      const env = keyEnvOk(a.env);
      const f = await find(env);
      if (!f) throw new Error(`${env} isn't on this computer any more`);
      return sealKey(String(a.pub ?? ""), f.value, `${String(a.copy ?? "")}:${env}`);
    },
    async keys_take(a: { env?: unknown; name?: unknown; from?: unknown; copy?: unknown; sealed?: SealedKey }) {
      const env = keyEnvOk(a.env);
      const copy = String(a.copy ?? "");
      sweepOffers();
      const offer = offers.get(copy);
      if (!offer || offer.env !== env) throw new Error("this copy took too long; try again");
      offers.delete(copy);
      const value = openKey(offer.priv, a.sealed as SealedKey, `${copy}:${env}`);
      if (!value) throw new Error("the key came through empty");
      const keys = load().filter((k) => k.env !== env);
      const name = String(a.name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || env;
      const from = String(a.from ?? "").replace(/\s+/g, " ").trim().slice(0, 64);
      keys.push({ env, name, value, at: now().toISOString(), ...(from ? { from } : {}) });
      save(keys);
      // A task here already holding this variable gets the new value in its file too.
      for (const [taskId, envs] of holds) if (envs.includes(env)) writeFile(taskId, envs);
      return { ok: true };
    },
    async keys_list() {
      return { keys: load().map(view) };
    },
    async keys_remove(a: { env?: unknown }) {
      const env = keyEnvOk(a.env);
      const keys = load();
      if (!keys.some((k) => k.env === env)) return { removed: false };
      save(keys.filter((k) => k.env !== env));
      for (const [taskId, envs] of holds) if (envs.includes(env)) writeFile(taskId, envs.filter((e) => e !== env));
      return { removed: true };
    },
    async keys_file(a: { taskId?: unknown; envs?: unknown }) {
      const taskId = String(a.taskId ?? "");
      if (!taskId) throw new Error("which task?");
      const envs = (Array.isArray(a.envs) ? a.envs : []).map(String).filter((e) => KEY_ENV.test(e));
      const file = writeFile(taskId, envs);
      if (file) touch(holds.get(taskId) ?? []);
      return { file: file ?? null, envs: holds.get(taskId) ?? [] };
    },
    async keys_drop(a: { taskId?: unknown }) {
      const taskId = String(a.taskId ?? "");
      holds.delete(taskId);
      rmSync(fileOf(taskId), { force: true });
      return {};
    },
  };

  // Files of tasks that ended while Ducter was off: nothing to hold them for. (A live task's file
  // is written again when it is next given a key.)
  try {
    if (existsSync(filesDir)) for (const f of readdirSync(filesDir)) if (f.endsWith(".kept.env")) rmSync(join(filesDir, f), { force: true });
  } catch {
    /* nothing to sweep */
  }

  return {
    ops,
    withKeys(spec) {
      const refs = (spec.keyRefs ?? []).filter((e) => KEY_ENV.test(e) && !KEY_ENV_DENIED.test(e));
      if (!refs.length) return spec;
      let have: Kept[] = [];
      try {
        have = refs.map((e) => kept(e)).filter((k): k is Kept => !!k);
      } catch (err) {
        console.warn(`[keys] couldn't open the keys kept here: ${(err as Error).message}`);
      }
      if (!have.length) return spec;
      try {
        touch(have.map((k) => k.env));
      } catch {
        /* a last-used time is not worth failing a start */
      }
      return { ...spec, env: { ...(spec.env ?? {}), ...Object.fromEntries(have.map((k) => [k.env, k.value])) } };
    },
    values() {
      try {
        return load().map((k) => k.value);
      } catch {
        return [];
      }
    },
    list() {
      try {
        return load().map(view);
      } catch {
        return [];
      }
    },
  };
}
