// D538: what a computer has and has free, measured by Ducter itself, so nobody has to tell it
// ("haswell has 64 GB" is a fact, not a preference). The home looks at itself; a worker sends its
// look on its heartbeat (the ping, every 15 s). Cheap: /proc and statfs on Linux, one `vm_stat` on a
// Mac at most every 30 s, `nvidia-smi` once per process. Nothing here is a judgment: placement
// (packages/core/src/candidates.ts) and the person's own rules decide what the numbers mean.
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { existsSync, readFileSync, statfsSync } from "node:fs";
import type { DeviceResources } from "./index.ts";
import { spawnNow, whichNow } from "./which.ts";

const DAY_MS = 24 * 3600_000;

/** What the probe reads, injectable for tests (a fake /proc, a fake vm_stat). */
export interface ResourceSys {
  platform: string;
  now(): number;
  totalmem(): number;
  freemem(): number;
  cores(): number;
  cpu(): string | undefined;
  load(): number | undefined;
  read(path: string): string | undefined;
  statfs(dir: string): { free: number; total: number } | undefined;
  /** A command's output (vm_stat, nvidia-smi), or undefined. */
  run(argv: string[]): Promise<string | undefined>;
}

export function realResourceSys(): ResourceSys {
  return {
    platform: process.platform,
    now: () => Date.now(),
    totalmem,
    freemem,
    cores: () => cpus().length || 1,
    cpu: () => cpus()[0]?.model?.trim() || undefined,
    load: () => (process.platform === "win32" ? undefined : loadavg()[0]),
    read: (p) => {
      try {
        return existsSync(p) ? readFileSync(p, "utf8") : undefined;
      } catch {
        return undefined;
      }
    },
    statfs: (dir) => {
      try {
        const s = statfsSync(dir);
        return { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) };
      } catch {
        return undefined;
      }
    },
    run: async (argv) => {
      if (!whichNow(argv[0]!)) return undefined;
      try {
        const p = spawnNow(argv, { stdout: "pipe", stderr: "ignore" });
        const timer = setTimeout(() => p.kill(), 3000);
        const [out, code] = await Promise.all([new Response(p.stdout as ReadableStream).text(), p.exited]);
        clearTimeout(timer);
        return code === 0 ? out : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/** Linux /proc/meminfo: a field in bytes (its kB), or undefined. */
export function meminfo(text: string | undefined, field: string): number | undefined {
  const m = text ? new RegExp(`^${field}:\\s+(\\d+)\\s*kB`, "m").exec(text) : null;
  return m ? Number(m[1]) * 1024 : undefined;
}

/** macOS `vm_stat`: free + inactive + purgeable + speculative pages, in bytes (what programs can still take). */
export function vmStatFree(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const size = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 0);
  if (!size) return undefined;
  const pages = (name: string) => Number(new RegExp(`^Pages ${name}:\\s+(\\d+)`, "m").exec(text)?.[1] ?? 0);
  return (pages("free") + pages("inactive") + pages("purgeable") + pages("speculative")) * size;
}

/** Linux: the cgroup v2 folder this process is in (`0::/user.slice/…/ducter.service`). */
export function ownCgroup(text: string | undefined): string | undefined {
  const m = text ? /^0::(\/[^\n]*)$/m.exec(text) : null;
  return m ? `/sys/fs/cgroup${m[1] === "/" ? "" : m[1]}` : undefined;
}

/** cgroup v2 memory.events: how many programs the kernel stopped for memory in it so far. */
export function oomKills(text: string | undefined): number | undefined {
  const m = text ? /^oom_kill\s+(\d+)/m.exec(text) : null;
  return m ? Number(m[1]) : undefined;
}

/**
 * One computer's prober. look() is cheap enough for every heartbeat: it keeps the last vm_stat for
 * 30 s and asks nvidia-smi once; the kernel's stops are counted from the cgroup's own counter, each
 * new one kept with its time for a day.
 */
export function createResourceProbe(o: { dir: string; sys?: ResourceSys }) {
  const sys = o.sys ?? realResourceSys();
  let vm: { at: number; free?: number } | undefined;
  let gpu: Promise<string | undefined> | undefined;
  let cg: string | undefined | null = null;
  let kills: number | undefined;
  const stops: number[] = [];
  const free = async (): Promise<number> => {
    if (sys.platform === "linux") return meminfo(sys.read("/proc/meminfo"), "MemAvailable") ?? sys.freemem();
    if (sys.platform === "darwin") {
      if (!vm || sys.now() - vm.at > 30_000) {
        const f = vmStatFree(await sys.run(["vm_stat"]));
        vm = { at: sys.now(), ...(f !== undefined ? { free: f } : {}) };
      }
      return Math.min(vm.free ?? sys.freemem(), sys.totalmem());
    }
    return sys.freemem();
  };
  const oom = (): string[] | undefined => {
    if (sys.platform !== "linux") return undefined;
    if (cg === null) cg = ownCgroup(sys.read("/proc/self/cgroup"));
    if (!cg) return undefined;
    const n = oomKills(sys.read(`${cg}/memory.events`));
    if (n === undefined) return undefined;
    // The first look only learns the counter: stops before this process started aren't dated.
    if (kills !== undefined && n > kills) for (let i = 0; i < Math.min(n - kills, 10); i++) stops.push(sys.now());
    kills = n;
    const since = sys.now() - DAY_MS;
    while (stops.length && stops[0]! < since) stops.shift();
    return stops.map((t) => new Date(t).toISOString());
  };
  return {
    async look(): Promise<DeviceResources> {
      gpu ??= sys.platform === "linux" ? sys.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]).then((t) => t?.split("\n")[0]?.trim() || undefined) : Promise.resolve(undefined);
      const [memFree, g] = await Promise.all([free(), gpu]);
      const disk = sys.statfs(o.dir);
      const swap = sys.platform === "linux" ? meminfo(sys.read("/proc/meminfo"), "SwapTotal") : undefined;
      const load = sys.load();
      const cpu = sys.cpu();
      const stopped = oom();
      return {
        at: new Date(sys.now()).toISOString(),
        memTotal: sys.totalmem(),
        memFree,
        cores: sys.cores(),
        ...(load !== undefined ? { load: Math.round(load * 100) / 100 } : {}),
        ...(swap !== undefined ? { swapTotal: swap } : {}),
        ...(disk ? { diskFree: disk.free, diskTotal: disk.total } : {}),
        ...(cpu ? { cpu: cpu.slice(0, 80) } : {}),
        ...(g ? { gpu: g.slice(0, 80) } : {}),
        ...(stopped?.length ? { oom: stopped } : {}),
      };
    },
  };
}

export { HEAVY_FREE, HEAVY_PER, heavySlots, roomFor } from "./room.ts";

/** D538: whether a fresh look differs enough from the last one shown to tell the clients (not every heartbeat). */
export function resourcesMoved(a: DeviceResources | undefined, b: DeviceResources): boolean {
  if (!a) return true;
  const step = Math.max(512 * 2 ** 20, b.memTotal * 0.05);
  return Math.abs(a.memFree - b.memFree) >= step || (a.oom?.length ?? 0) !== (b.oom?.length ?? 0) || a.memTotal !== b.memTotal || Math.abs((a.diskFree ?? 0) - (b.diskFree ?? 0)) >= 2 * 2 ** 30;
}

/** A plain resources object from the wire (a worker's ping), or undefined (anything else dropped). */
export function parseResources(raw: unknown): DeviceResources | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  const memTotal = num(r.memTotal);
  const memFree = num(r.memFree);
  const cores = num(r.cores);
  if (!memTotal || memFree === undefined || !cores) return undefined;
  const oom = Array.isArray(r.oom) ? r.oom.filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x))).slice(-20) : [];
  const opt = (k: string, v: unknown) => (v !== undefined ? { [k]: v } : {});
  return {
    at: str(r.at) ?? new Date().toISOString(),
    memTotal,
    memFree: Math.min(memFree, memTotal),
    cores: Math.round(cores),
    ...opt("load", num(r.load)),
    ...opt("swapTotal", num(r.swapTotal)),
    ...opt("diskFree", num(r.diskFree)),
    ...opt("diskTotal", num(r.diskTotal)),
    ...opt("cpu", str(r.cpu)),
    ...opt("gpu", str(r.gpu)),
    ...(oom.length ? { oom } : {}),
  };
}
