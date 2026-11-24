// D524: a unit `ducter service install` wrote before a setting existed gets it on the first start
// of the Ducter that brings it (the start after an update swapped the binary), with a
// daemon-reload and no restart of its own: the update's restart is the one that ran this start.
//
// Only the [Service] settings Ducter owns are put in or changed (MANAGED); the rest of the file
// (ExecStart, PATH, the port, the person's own edits) stays as it was. A unit not written by
// `ducter service install` is never touched.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const UNIT_HEADER = "# Written by `ducter service install`.";

/**
 * The settings every Ducter unit carries now, in order, each with its comment. The unit template
 * (cli remote.ts systemdUnit) writes these same lines.
 */
export const MANAGED: { key: string; value: string; comment: string }[] = [
  { key: "OOMPolicy", value: "continue", comment: "# A task's child stopped for lack of memory takes only itself; Ducter keeps running." },
  { key: "MemoryMax", value: "90%", comment: "# Memory runs short inside this unit first, never for the whole computer (sshd stays)." },
];
/** Settings an earlier released template had and this one doesn't (none yet). */
export const RETIRED: string[] = [];

export const managedLines = (): string[] => MANAGED.flatMap((m) => [m.comment, `${m.key}=${m.value}`]);

export const REFRESH_RECORD = "unit-refreshed.json";

/** The unit's text with Ducter's settings as they are now; undefined when nothing changes. */
export function refreshUnitText(text: string): string | undefined {
  if (!text.startsWith(UNIT_HEADER)) return undefined;
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === "[Service]");
  if (start < 0) return undefined;
  let end = lines.findIndex((l, i) => i > start && /^\[.+\]$/.test(l.trim()));
  if (end < 0) end = lines.length;
  const comments = new Set(MANAGED.map((m) => m.comment));
  const owned = new Set([...MANAGED.map((m) => m.key), ...RETIRED]);
  const keyOf = (l: string) => /^([A-Za-z]+)=/.exec(l.trim())?.[1];
  const service = lines.slice(start + 1, end).filter((l) => !comments.has(l) && !owned.has(keyOf(l) ?? ""));
  // Where the template puts them: right after RestartSec (else at the section's end, before blanks).
  let at = service.findIndex((l) => keyOf(l) === "RestartSec") + 1;
  if (at === 0) {
    at = service.length;
    while (at > 0 && service[at - 1]!.trim() === "") at--;
  }
  service.splice(at, 0, ...managedLines());
  const out = [...lines.slice(0, start + 1), ...service, ...lines.slice(end)].join("\n");
  return out === text ? undefined : out;
}

export interface RefreshSys {
  read(path: string): string | undefined;
  write(path: string, text: string): boolean;
  run(argv: string[]): Promise<{ code: number; out: string }>;
  now(): number;
}

const realRefreshSys: RefreshSys = {
  read: (p) => {
    try {
      return existsSync(p) ? readFileSync(p, "utf8") : undefined;
    } catch {
      return undefined;
    }
  },
  write: (p, s) => {
    try {
      writeFileSync(p, s);
      return true;
    } catch {
      return false;
    }
  },
  async run(argv) {
    try {
      const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
      const timer = setTimeout(() => p.kill(), 20_000);
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      clearTimeout(timer);
      return { code, out: (out + err).trim() };
    } catch (e) {
      return { code: -1, out: (e as Error).message };
    }
  },
  now: Date.now,
};

export interface RefreshResult {
  unit: string;
  refreshed: boolean;
  /** The daemon-reload's first line when it failed (the file is new; systemd reads it at the next start). */
  reloadError?: string;
}

/**
 * Under systemd on Linux: the user unit (or, for root's worker, the system unit) brought up to
 * date, then `daemon-reload` so the running service carries it. Never a restart.
 */
export async function refreshServiceUnit(o: { dataDir: string; home?: string; systemDir?: string; uid?: number; sys?: RefreshSys; log?: (l: string) => void }): Promise<RefreshResult | undefined> {
  const sys = o.sys ?? realRefreshSys;
  const userUnit = join(o.home ?? homedir(), ".config", "systemd", "user", "ducter.service");
  const systemUnit = join(o.systemDir ?? "/etc/systemd/system", "ducter.service");
  const candidates: [string, string[]][] = [[userUnit, ["systemctl", "--user", "daemon-reload"]]];
  if ((o.uid ?? process.getuid?.()) === 0) candidates.push([systemUnit, ["systemctl", "daemon-reload"]]);
  for (const [unit, reload] of candidates) {
    const text = sys.read(unit);
    if (text === undefined) continue;
    const next = refreshUnitText(text);
    if (!next) return { unit, refreshed: false };
    if (!sys.write(unit, next)) return { unit, refreshed: false, reloadError: "the unit file couldn't be written" };
    const r = await sys.run(reload);
    const reloadError = r.code === 0 ? undefined : r.out.split("\n")[0] || `exit ${r.code}`;
    sys.write(join(o.dataDir, REFRESH_RECORD), JSON.stringify({ at: new Date(sys.now()).toISOString(), unit, ...(reloadError ? { reloadError } : {}) }));
    (o.log ?? console.log)(`[ducter] service settings updated (${unit}): ${MANAGED.map((m) => `${m.key}=${m.value}`).join(", ")}${reloadError ? `; daemon-reload failed (${reloadError}), they apply at the next start` : ""}`);
    return { unit, refreshed: true, ...(reloadError ? { reloadError } : {}) };
  }
  return undefined;
}

/** Only where it means something: Linux, started by systemd (INVOCATION_ID), not in tests. */
export function refreshOnStart(dataDir: string, env: Record<string, string | undefined> = process.env): void {
  if (process.platform !== "linux" || !env.INVOCATION_ID || env.NODE_ENV === "test") return;
  void refreshServiceUnit({ dataDir }).catch(() => {});
}
