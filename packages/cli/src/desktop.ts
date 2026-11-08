// Finds and launches the desktop client (apps/desktop, Go + MyGo).
// Order: $DUCTER_DESKTOP, next to the `ducter` binary, then (source checkout only) a `go build`
// of apps/desktop into apps/desktop/.build/. The client reads DUCTER_PORT to find the main process.
import { existsSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DESKTOP_BIN = "ducter-desktop";

export type DesktopPlan =
  | { kind: "binary"; path: string }
  | { kind: "build"; dir: string; out: string; go: string } // dev: go build first, then run `out`
  | { kind: "none" };

export interface DesktopEnv {
  env: Record<string, string | undefined>;
  execPath: string;
  compiled: boolean;
  /** Repo root when running from a source checkout. */
  repoRoot?: string;
  exists(p: string): boolean;
  which(cmd: string): string | null;
}

export function planDesktop(d: DesktopEnv): DesktopPlan {
  const explicit = d.env.DUCTER_DESKTOP;
  if (explicit) return d.exists(explicit) ? { kind: "binary", path: explicit } : { kind: "none" };
  if (d.compiled) {
    const sibling = join(dirname(d.execPath), DESKTOP_BIN);
    if (d.exists(sibling)) return { kind: "binary", path: sibling };
  }
  if (d.repoRoot) {
    const dir = join(d.repoRoot, "apps", "desktop");
    const out = join(dir, ".build", DESKTOP_BIN);
    const go = d.which("go");
    if (d.exists(join(dir, "go.mod")) && go) return { kind: "build", dir, out, go };
    if (d.exists(out)) return { kind: "binary", path: out };
  }
  return { kind: "none" };
}

/** apps/desktop relative to this file, when it isn't inside a compiled binary. */
export function sourceRepoRoot(compiled: boolean): string | undefined {
  if (compiled) return undefined;
  const root = resolve(import.meta.dir, "..", "..", "..");
  return existsSync(join(root, "apps", "desktop", "go.mod")) ? root : undefined;
}

export interface Launched {
  proc: ReturnType<typeof Bun.spawn>;
  exited: Promise<number>;
}

/** Builds (if needed) and starts the client; its output goes to <dataDir>/desktop.log. */
export async function launchDesktop(plan: DesktopPlan, opts: { port: number; dataDir: string; onBuild?: () => void }): Promise<Launched | { error: string } | undefined> {
  if (plan.kind === "none") return undefined;
  const logFd = openSync(join(opts.dataDir, "desktop.log"), "a");
  let bin: string;
  if (plan.kind === "build") {
    if (!existsSync(plan.out)) opts.onBuild?.();
    const b = Bun.spawn([plan.go, "build", "-o", plan.out, "."], { cwd: plan.dir, stdout: logFd, stderr: logFd, stdin: "ignore" });
    if ((await b.exited) !== 0) return { error: `go build failed; see ${join(opts.dataDir, "desktop.log")}` };
    bin = plan.out;
  } else bin = plan.path;
  try {
    const proc = Bun.spawn([bin], {
      env: { ...process.env, DUCTER_PORT: String(opts.port) },
      stdout: logFd,
      stderr: logFd,
      stdin: "ignore",
    });
    return { proc, exited: proc.exited };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
