// Ducter's key file (D102). One rule for every secret: a 0600 file in the data folder, read only
// by the code that uses it. API keys and login tokens for harnesses live in <dataDir>/keys.env
// (KEY=value lines). They never enter a process environment wholesale: the runner hands each key
// only to the harness session that needs it (packages/runner/src/child-env.ts).
//
// <dataDir>/env stays for non-secret settings (a server's systemd unit loads it as its
// EnvironmentFile). Keys found there are moved to keys.env on start (migrateKeys).
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Keys and tokens for harnesses, 0600. */
export const KEYS_FILE = "keys.env";
/** Non-secret settings; on a server, the systemd unit's EnvironmentFile. */
export const SETTINGS_ENV_FILE = "env";

/**
 * Whether a variable name looks like it holds a secret: an API key, a token, a password, a
 * credential. Matched on name parts, so `SSH_AUTH_SOCK` or `KEYCHAIN_PATH` are not secrets but
 * `ANTHROPIC_API_KEY`, `OO_CONNECTOR_TOKEN`, `AWS_SECRET_ACCESS_KEY` and `DB_PASSWORD` are.
 */
export function isSecretName(name: string): boolean {
  return /(?:^|_)(?:API_?KEY|KEY|KEYS|TOKEN|SECRET|SECRETS|PASSWORD|PASSWD|PASS|PWD|CREDENTIALS?|COOKIE|PRIVATE)(?:_|$)/i.test(name) && name !== "PWD" && name !== "OLDPWD";
}

/** A line that a key migration moves: secret-shaped, and not one of Ducter's own settings. */
function movable(name: string): boolean {
  return isSecretName(name) && !name.startsWith("DUCTER_");
}

const ASSIGN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/** KEY=value lines; # comments, optional quotes, `export ` prefixes. Empty values are left out. */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = ASSIGN.exec(line);
    if (!m) continue;
    let v = m[2]!;
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    if (v) out[m[1]!] = v;
  }
  return out;
}

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/** A KEY=value file; unreadable means empty. */
export function readEnvFile(path: string): Record<string, string> {
  return parseEnvText(readText(path) ?? "");
}

/**
 * Every key Ducter holds: keys.env, then (until it is migrated) a secret-shaped line left in the
 * old <dataDir>/env. keys.env wins. Values are for the code that passes them on; never log them.
 */
export function readKeys(dataDir: string, read: (path: string) => string | undefined = readText): Record<string, string> {
  const legacy = Object.fromEntries(Object.entries(parseEnvText(read(join(dataDir, SETTINGS_ENV_FILE)) ?? "")).filter(([k]) => movable(k)));
  return { ...legacy, ...parseEnvText(read(join(dataDir, KEYS_FILE)) ?? "") };
}

function writePrivate(path: string, text: string) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

const NOTE = "# API keys and tokens live in keys.env next to this file (0600), not here.";

/**
 * Moves secret-shaped lines from <dataDir>/env to <dataDir>/keys.env and leaves the other lines
 * (comments, Ducter's own settings, a proxy) in place. A key already in keys.env keeps its value
 * there. Both files end up 0600. Idempotent: a second run changes nothing. Returns the names moved.
 */
export function migrateKeys(dataDir: string): { moved: string[] } {
  const envPath = join(dataDir, SETTINGS_ENV_FILE);
  const keysPath = join(dataDir, KEYS_FILE);
  const moved: string[] = [];
  const text = readText(envPath);
  if (text !== undefined) {
    const kept: string[] = [];
    const lines: string[] = [];
    for (const line of text.split("\n")) {
      const m = line.trim().startsWith("#") ? undefined : ASSIGN.exec(line);
      if (m && movable(m[1]!)) {
        moved.push(m[1]!);
        lines.push(line.trim());
      } else kept.push(line);
    }
    if (moved.length) {
      const prior = readText(keysPath) ?? "";
      const have = new Set(Object.keys(parseEnvText(prior)));
      const add = lines.filter((l) => {
        const name = ASSIGN.exec(l)![1]!;
        return !have.has(name) && Object.keys(parseEnvText(l)).length > 0;
      });
      const head = prior ? (prior.endsWith("\n") ? prior : prior + "\n") : "# Ducter's keys for harness sign-ins (0600). Each goes only to the harness that uses it.\n";
      // keys.env first: a crash between the two writes leaves a key in both files, never in none.
      writePrivate(keysPath, head + (add.length ? add.join("\n") + "\n" : ""));
      if (!kept.includes(NOTE)) kept.unshift(NOTE);
      writePrivate(envPath, kept.join("\n"));
    }
  }
  for (const p of [envPath, keysPath]) {
    try {
      if (existsSync(p)) chmodSync(p, 0o600);
    } catch {
      /* not ours to change */
    }
  }
  return { moved: [...new Set(moved)] };
}

/**
 * Drops the keys Ducter holds from this process's environment (a server's unit may have loaded
 * them from an un-migrated env file before migrateKeys ran). Only a variable whose value is the
 * key file's is dropped: the code that needs it reads the file.
 */
export function scrubKeysFromEnv(keys: Record<string, string>, env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(keys)) {
    if (env[k] !== undefined && env[k] === v) {
      delete env[k];
      out.push(k);
    }
  }
  return out;
}
