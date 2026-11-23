// Preloaded by every `bun test` run (bunfig.toml): no test reaches the developer's real Nowledge Mem.
//
// Ducter talks to Mem through the person's own `nmem` (on PATH, NMEM_CLI_PATH, ~/.local/bin, ...)
// and its config (~/.nowledge-mem, NMEM_API_URL/KEY). CI has none of it, so a test there sees "no
// Mem"; a developer's machine has all of it, and a partner or core built without a fake memory or
// Bridge would read, and write (memory_add, an identity, Bridge setup, acks), their real Mem. This
// makes every test process look like CI's, in one place:
//   - every NMEM_* and the Bridge switches leave the environment; Mem's config dir is an empty one;
//   - in this process, a real `nmem` is never found (Bun.which) and never started (Bun.spawn):
//     it fails as a missing command does on CI. An `nmem` a test wrote (in the temp folder) runs;
//   - a child process finds scripts/test/no-mem/nmem first on PATH, which says so and exits 127;
//   - a fetch to Mem's local server port is refused.
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";

const GUARD_DIR = join(import.meta.dir, "no-mem");
const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
const TEMP = [real(tmpdir()), "/tmp", "/private/tmp"].map((d) => d.replace(/\/+$/, "") + "/");

for (const k of Object.keys(process.env)) if (k.startsWith("NMEM_")) delete process.env[k];
for (const k of ["DUCTER_BRIDGE", "DUCTER_BRIDGE_CONTEXT"]) delete process.env[k];
process.env.NMEM_CLI_CONFIG_DIR = mkdtempSync(join(tmpdir(), "ducter-test-no-mem-"));
process.env.PATH = [GUARD_DIR, ...(process.env.PATH ?? "").split(delimiter).filter((d) => d && d !== GUARD_DIR)].join(delimiter);

/** A real nmem (anything named nmem outside the temp folder, or the guard): never found, never run. */
export function realNmem(path: string): boolean {
  const name = basename(path);
  if (!/^nmem([-_.].*)?$/.test(name)) return false; // nmem, nmem-wrapper (Mem.app), nmem_old
  const r = real(path);
  return !TEMP.some((t) => r.startsWith(t) || path.startsWith(t));
}

const which = Bun.which;
const spawn = Bun.spawn;
const spawnSync = Bun.spawnSync;
const notFound = (cmd: string) => Object.assign(new Error(`Executable not found in $PATH: "${cmd}"`), { code: "ENOENT", errno: -2, path: cmd });
/**
 * Refuses a real nmem; else the same call, with process.env as it is now when the call names no
 * env (Bun 1.3's default is the env the process started with, which still has the NMEM_* and PATH
 * this file changed).
 */
const guarded = (args: unknown[]): unknown[] => {
  const first = args[0] as any;
  const array = Array.isArray(first);
  const opts = (array ? args[1] : first) as { env?: Record<string, string | undefined> } | undefined;
  const argv: unknown = array ? first : first?.cmd;
  const cmd = Array.isArray(argv) ? argv[0] : undefined;
  if (typeof cmd === "string") {
    const path = cmd.includes("/") ? cmd : which(cmd, { PATH: opts?.env?.PATH ?? process.env.PATH ?? "" });
    if (realNmem(path ?? cmd)) throw notFound(cmd);
  }
  if (opts?.env) return args;
  return array ? [first, { ...opts, env: { ...process.env } }, ...args.slice(2)] : [{ ...first, env: { ...process.env } }, ...args.slice(1)];
};
(Bun as any).which = (cmd: string, o?: Parameters<typeof Bun.which>[1]) => {
  const r = which(cmd, o);
  return r && realNmem(r) ? null : r;
};
(Bun as any).spawn = (...args: unknown[]) => (spawn as any)(...guarded(args));
(Bun as any).spawnSync = (...args: unknown[]) => (spawnSync as any)(...guarded(args));

const MEM_PORT = "14242"; // Mem's own local server (packages/core/src/mem-relay.ts MEM_LOCAL_DEFAULT)
const fetchReal = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    try {
      const u = new URL(String(url));
      if (u.port === MEM_PORT && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return Promise.reject(new TypeError(`fetch to the real Nowledge Mem (${u.host}) is off in tests`));
    } catch {
      /* not a URL fetch understands either: let it say so */
    }
    return fetchReal(input, init);
  },
  fetchReal,
) as typeof fetch;
