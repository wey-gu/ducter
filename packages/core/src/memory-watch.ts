// D524: the home watches the memory of the computer it runs on (Linux), so a task's heavy child
// is what the kernel stops when memory runs out, never the home, and the reason is on record.
//
// hel (7.6 GiB, no swap), 2026-11-24 07:26–07:30 UTC: a task ran tsc with a 4 GB heap, a Vite dev
// server, Playwright with headless Chrome and a whole-repo scan side by side. The kernel killed the
// biggest node child three times; each kill stopped the whole unit (systemd's OOMPolicy=stop), so
// the home and every client went down, and the task, resumed on start, ran it all again.
//
// What this does, every few seconds, reading /proc and the unit's cgroup only:
//  - marks every process under the home with a higher oom_score_adj (CHILD_OOM_ADJ): the kernel
//    then stops a task's child before the home. Raising one's own children needs no privilege.
//  - when memory runs low, logs the biggest processes under the home, sheds the home's caches and
//    writes one line to <dataDir>/memory-watch.json, which `ducter doctor` reads;
//  - when the cgroup counts a kill, records it with the biggest processes seen just before.
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/** Higher than the home's (systemd's user manager starts units at 100): children go first. */
export const CHILD_OOM_ADJ = 500;
export const WATCH_EVERY_MS = 5_000;
/** One report per minute at most while memory stays low. */
export const REPORT_GAP_MS = 60_000;
export const RECORD_FILE = "memory-watch.json";
const KEEP_RECORDS = 30;

export interface Proc {
  pid: number;
  ppid: number;
  name: string;
  rssKb: number;
  cmd: string;
}

export interface MemSample {
  totalKb: number;
  availableKb: number;
  /** The unit's cgroup (v2), when the home runs in one with the memory controller. */
  cgroup?: { currentB: number; highB?: number; maxB?: number; oomKills: number };
}

export interface MemRecord {
  at: string;
  kind: "low" | "oom_kill";
  availableMb: number;
  totalMb: number;
  /** For oom_kill: how many kills the cgroup counted since the last look. */
  kills?: number;
  top: { pid: number; name: string; rssMb: number; cmd: string; home?: true }[];
}

/** Every file the watch reads or writes goes through here (tests use a fake /proc). */
export interface WatchFs {
  read(path: string): string | undefined;
  write(path: string, text: string): boolean;
  list(dir: string): string[];
}

export const realFs: WatchFs = {
  read(p) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return undefined;
    }
  },
  write(p, text) {
    try {
      writeFileSync(p, text);
      return true;
    } catch {
      return false;
    }
  },
  list(d) {
    try {
      return readdirSync(d);
    } catch {
      return [];
    }
  },
};

/** /proc/meminfo: MemTotal and MemAvailable, in kB. */
export function parseMeminfo(text: string | undefined): { totalKb: number; availableKb: number } | undefined {
  if (!text) return undefined;
  const kb = (k: string) => {
    const m = new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const totalKb = kb("MemTotal");
  const availableKb = kb("MemAvailable");
  return totalKb && availableKb !== undefined ? { totalKb, availableKb } : undefined;
}

/** /proc/self/cgroup on cgroup v2 ("0::/user.slice/…/ducter.service") → its folder under /sys/fs/cgroup. */
export function cgroupDir(text: string | undefined, root = "/sys/fs/cgroup"): string | undefined {
  const m = text && /^0::(\/.*)$/m.exec(text);
  return m ? join(root, m[1]!.trim()) : undefined;
}

const num = (s: string | undefined) => {
  const v = s?.trim();
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
};

export function sample(fs: WatchFs, cg: string | undefined): MemSample | undefined {
  const mi = parseMeminfo(fs.read("/proc/meminfo"));
  if (!mi) return undefined;
  if (!cg) return mi;
  const currentB = num(fs.read(join(cg, "memory.current")));
  if (currentB === undefined) return mi;
  const kills = /^oom_kill\s+(\d+)/m.exec(fs.read(join(cg, "memory.events")) ?? "");
  const highB = num(fs.read(join(cg, "memory.high")));
  const maxB = num(fs.read(join(cg, "memory.max")));
  return { ...mi, cgroup: { currentB, ...(highB !== undefined ? { highB } : {}), ...(maxB !== undefined ? { maxB } : {}), oomKills: kills ? Number(kills[1]) : 0 } };
}

/**
 * Low: the computer has less than a tenth of its memory (and under 768 MB) left, or the unit is
 * past nine tenths of its own limit (MemoryHigh, else MemoryMax). Either way the kernel is close.
 */
export function isLow(s: MemSample): boolean {
  if (s.availableKb < Math.min(s.totalKb * 0.1, 768 * 1024)) return true;
  const c = s.cgroup;
  const limit = c && Math.min(c.highB ?? Infinity, c.maxB ?? Infinity);
  return !!c && !!limit && Number.isFinite(limit) && c.currentB > limit * 0.9;
}

/** One process from /proc/<pid>/stat (name in parens may hold spaces) and statm (pages). */
export function readProc(fs: WatchFs, pid: number, pageKb = 4): Proc | undefined {
  const stat = fs.read(`/proc/${pid}/stat`);
  if (!stat) return undefined;
  const close = stat.lastIndexOf(")");
  const name = stat.slice(stat.indexOf("(") + 1, close);
  const ppid = Number(stat.slice(close + 2).split(" ")[1]);
  const pages = Number(fs.read(`/proc/${pid}/statm`)?.split(" ")[1] ?? 0);
  const cmd = (fs.read(`/proc/${pid}/cmdline`) ?? "").split("\0").filter(Boolean).join(" ");
  return Number.isFinite(ppid) ? { pid, ppid, name, rssKb: pages * pageKb, cmd } : undefined;
}

/** Every process under `root` (not `root` itself), by walking /proc's parent links. */
export function descendants(fs: WatchFs, root: number, pageKb = 4): Proc[] {
  const all = fs
    .list("/proc")
    .filter((d) => /^\d+$/.test(d))
    .map((d) => readProc(fs, Number(d), pageKb))
    .filter((p): p is Proc => !!p);
  const kids = new Map<number, Proc[]>();
  for (const p of all) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p]);
  const out: Proc[] = [];
  const walk = (pid: number, depth: number) => {
    if (depth > 64) return;
    for (const k of kids.get(pid) ?? []) {
      out.push(k);
      walk(k.pid, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** Raises a child's oom_score_adj to CHILD_OOM_ADJ (never lowers one: Chrome sets its own 300+). */
export function markChild(fs: WatchFs, pid: number, adj = CHILD_OOM_ADJ): boolean {
  const path = `/proc/${pid}/oom_score_adj`;
  const text = fs.read(path)?.trim();
  if (!text || !/^-?\d+$/.test(text) || Number(text) >= adj) return false;
  return fs.write(path, String(adj));
}

const mb = (kb: number) => Math.round(kb / 1024);
const short = (cmd: string) => (cmd.length > 160 ? `${cmd.slice(0, 157)}...` : cmd);

export function topOf(home: Proc | undefined, kids: Proc[], n = 5): MemRecord["top"] {
  return [...(home ? [{ ...home, home: true as const }] : []), ...kids]
    .sort((a, b) => b.rssKb - a.rssKb)
    .slice(0, n)
    .map((p) => ({ pid: p.pid, name: p.name, rssMb: mb(p.rssKb), cmd: short(p.cmd), ...("home" in p && p.home ? { home: true as const } : {}) }));
}

export function describe(r: MemRecord): string {
  const top = r.top.map((p) => `${p.home ? "home" : p.name} ${p.rssMb} MB (pid ${p.pid}${p.home ? "" : `: ${p.cmd}`})`).join("; ");
  const head = r.kind === "oom_kill" ? `the kernel stopped ${r.kills ?? 1} process(es) under the home for lack of memory` : `memory is low: ${r.availableMb} MB of ${r.totalMb} MB left`;
  return `[memory] ${head}; biggest: ${top}`;
}

export function readRecords(dataDir: string, fs: WatchFs = realFs): MemRecord[] {
  try {
    const j = JSON.parse(fs.read(join(dataDir, RECORD_FILE)) ?? "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function appendRecord(dataDir: string, r: MemRecord, fs: WatchFs) {
  const all = [...readRecords(dataDir, fs), r].slice(-KEEP_RECORDS);
  const file = join(dataDir, RECORD_FILE);
  if (fs === realFs) {
    // Whole or not at all: a half-written file would hide every earlier line from doctor.
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 1));
      renameSync(`${file}.tmp`, file);
    } catch {}
  } else fs.write(file, JSON.stringify(all));
}

export interface WatchOptions {
  dataDir: string;
  /** The home's caches to drop when memory is low (the GC runs after them). */
  shed?: () => void;
  fs?: WatchFs;
  pid?: number;
  now?: () => number;
  log?: (line: string) => void;
  gc?: () => void;
  pageKb?: number;
  /** How often it looks; 0: never by itself (tests call tick). */
  everyMs?: number;
}

export interface MemoryWatch {
  /** One look (the timer calls it; tests call it directly). */
  tick(): MemRecord | undefined;
  stop(): void;
}

export function createMemoryWatch(o: WatchOptions): MemoryWatch {
  const fs = o.fs ?? realFs;
  const pid = o.pid ?? process.pid;
  const now = o.now ?? Date.now;
  const log = o.log ?? ((l: string) => console.warn(l));
  const gc = o.gc ?? (() => Bun.gc(true));
  const cg = cgroupDir(fs.read("/proc/self/cgroup"));
  let lastReport = -Infinity;
  let kills: number | undefined;
  let lastTop: MemRecord["top"] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = (): MemRecord | undefined => {
    const s = sample(fs, cg);
    if (!s) return undefined;
    const kids = descendants(fs, pid, o.pageKb);
    for (const k of kids) markChild(fs, k.pid);
    const top = topOf(readProc(fs, pid, o.pageKb), kids);
    const base = { at: new Date(now()).toISOString(), availableMb: mb(s.availableKb), totalMb: mb(s.totalKb) };
    let rec: MemRecord | undefined;
    const counted = s.cgroup?.oomKills;
    if (counted !== undefined && kills !== undefined && counted > kills) {
      // What was biggest a moment before the kill says who it was; the killed one is gone now.
      rec = { ...base, kind: "oom_kill", kills: counted - kills, top: lastTop.length ? lastTop : top };
    } else if (isLow(s) && now() - lastReport >= REPORT_GAP_MS) {
      rec = { ...base, kind: "low", top };
      lastReport = now();
      try {
        o.shed?.();
      } catch {}
      try {
        gc();
      } catch {}
    }
    if (counted !== undefined) kills = counted;
    lastTop = top;
    if (rec) {
      log(describe(rec));
      appendRecord(o.dataDir, rec, fs);
    }
    return rec;
  };

  const every = o.everyMs ?? WATCH_EVERY_MS;
  if (every > 0) {
    timer = setInterval(() => {
      try {
        tick();
      } catch {}
    }, every);
    (timer as { unref?: () => void }).unref?.();
  }
  return {
    tick,
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

/** The watch runs where /proc and cgroups are: Linux. Elsewhere nothing starts. */
export function startMemoryWatch(o: WatchOptions): MemoryWatch | undefined {
  if (process.platform !== "linux" || process.env.DUCTER_MEMORY_WATCH === "0" || process.env.NODE_ENV === "test" || !existsSync("/proc/meminfo")) return undefined;
  return createMemoryWatch(o);
}
