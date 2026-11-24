// Where the Autofill key lives (D191). The saved file is AES-256-GCM; its 32-byte key is kept
// apart from it, so a copy of the data folder (a backup, a synced folder, a disk image) alone
// opens nothing:
//   - on a Mac, in the login keychain (a generic password, service "Ducter Autofill", one per
//     data folder), read with /usr/bin/security;
//   - elsewhere (a Linux server), in <dataDir>/saved/key, 0600, readable only by the user Ducter
//     runs as. Weaker than a keychain (anyone who can read the user's files has both), and said so
//     on screen ("kept in a key file on this computer").
// Under `bun test` (or with DUCTER_SAVED_KEY=file) the keychain is never touched.
// D539: the same lock for the keys Ducter keeps on each computer (protocol/src/key-shelf.ts), under
// its own keychain service ("Ducter Keys"), so one never opens the other. Moved here from
// core/src/saved/key.ts (which re-exports it) so a worker, which has no core, uses the same code.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type KeptIn = "keychain" | "file";

export interface KeySource {
  keptIn: KeptIn;
  /** The key, made the first time it is asked for when `create`; undefined when there is none yet. */
  get(create: boolean): Buffer | undefined;
}

export const KEYCHAIN_SERVICE = "Ducter Autofill";
const AUTOFILL = { name: KEYCHAIN_SERVICE, label: "Autofill", about: "The key Ducter uses to lock your saved sign-ins and cards" };
/** D539: the lock of the keys Ducter keeps on a computer for its tasks there. */
export const KEPT_KEYS_SERVICE = { name: "Ducter Keys", label: "kept keys", about: "The key Ducter uses to lock the keys it keeps on this computer for its tasks" };

/** The keychain account for a data folder: a hash, so two Ducters (a test, a scratch) never share a key. */
export const keychainAccount = (dataDir: string) => `dataDir-${createHash("sha256").update(dataDir).digest("hex").slice(0, 16)}`;

export function fileKey(dir: string): KeySource {
  const path = join(dir, "key");
  return {
    keptIn: "file",
    get(create) {
      if (existsSync(path)) {
        const k = Buffer.from(readFileSync(path, "utf8").trim(), "base64");
        if (k.length === 32) return k;
        throw new Error(`the Autofill key file ${path} is damaged`);
      }
      if (!create) return undefined;
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const k = randomBytes(32);
      writeFileSync(path, k.toString("base64") + "\n", { mode: 0o600 });
      chmodSync(path, 0o600);
      return k;
    },
  };
}

export interface Exec {
  (argv: string[]): { code: number; out: string };
}

const run: Exec = (argv) => {
  const p = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, out: p.stdout.toString() };
};

/** The login keychain through /usr/bin/security. exec: test seam. */
export function keychainKey(dataDir: string, exec: Exec = run, service: { name: string; label: string; about: string } = AUTOFILL): KeySource {
  const account = keychainAccount(dataDir);
  let cached: Buffer | undefined;
  return {
    keptIn: "keychain",
    get(create) {
      if (cached) return cached;
      const r = exec(["/usr/bin/security", "find-generic-password", "-s", service.name, "-a", account, "-w"]);
      if (r.code === 0 && r.out.trim()) {
        const k = Buffer.from(r.out.trim(), "base64");
        if (k.length !== 32) throw new Error(`the ${service.label} key in the keychain is damaged`);
        return (cached = k);
      }
      if (!create) return undefined;
      const k = randomBytes(32);
      // The key is on this one command line for a moment (security takes -w as an argument); it
      // never reaches a log, a file or a model.
      const w = exec(["/usr/bin/security", "add-generic-password", "-U", "-s", service.name, "-a", account, "-l", service.name, "-j", service.about, "-w", k.toString("base64")]);
      if (w.code !== 0) throw new Error(`couldn't keep the ${service.label} key in the keychain`);
      return (cached = k);
    },
  };
}

/** The key source for this home: the keychain on a Mac (never under test), a key file elsewhere. */
export function keySource(o: { dataDir: string; dir: string; platform?: string; env?: Record<string, string | undefined>; exec?: Exec; service?: typeof KEPT_KEYS_SERVICE }): KeySource {
  const env = o.env ?? process.env;
  const testing = env.NODE_ENV === "test" || env.BUN_ENV === "test";
  const wantFile = (env.DUCTER_SAVED_KEY ?? "").trim().toLowerCase() === "file";
  if ((o.platform ?? process.platform) === "darwin" && !testing && !wantFile) return keychainKey(o.dataDir, o.exec, o.service);
  return fileKey(o.dir);
}
