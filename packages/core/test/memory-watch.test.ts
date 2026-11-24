import { describe, expect, test } from "bun:test";
import { CHILD_OOM_ADJ, cgroupDir, createMemoryWatch, descendants, isLow, markChild, parseMeminfo, readRecords, RECORD_FILE, type WatchFs } from "../src/memory-watch.ts";

// A fake /proc shaped like hel's at 07:26 on 2026-11-24 (7.6 GiB, no swap): the home (bun, about
// 130 MB), agy under it, and agy's node children: tsc with a 4 GB heap, a Vite server, a scan.
const KB = 1024;
const GiB = 1024 * 1024; // in kB
function machine(o: { availableKb: number; current?: number; high?: string; max?: string; kills?: number } = { availableKb: 4 * GiB }) {
  const files = new Map<string, string>();
  const put = (p: string, s: string) => files.set(p, s);
  put("/proc/meminfo", `MemTotal:        ${Math.round(7.6 * GiB)} kB\nMemFree:  1 kB\nMemAvailable:    ${o.availableKb} kB\n`);
  put("/proc/self/cgroup", "0::/user.slice/user-0.slice/user@0.service/app.slice/ducter.service\n");
  const cg = "/sys/fs/cgroup/user.slice/user-0.slice/user@0.service/app.slice/ducter.service";
  if (o.current !== undefined) {
    put(`${cg}/memory.current`, `${o.current}\n`);
    put(`${cg}/memory.high`, `${o.high ?? "max"}\n`);
    put(`${cg}/memory.max`, `${o.max ?? "max"}\n`);
    put(`${cg}/memory.events`, `low 0\nhigh 0\nmax 0\noom ${o.kills ?? 0}\noom_kill ${o.kills ?? 0}\n`);
  }
  const proc = (pid: number, ppid: number, name: string, rssKb: number, cmd: string[], adj = 100) => {
    put(`/proc/${pid}/stat`, `${pid} (${name}) S ${ppid} ${pid} ${pid} 0 -1`);
    put(`/proc/${pid}/statm`, `999999 ${rssKb / 4} 0 0 0 0 0`);
    put(`/proc/${pid}/cmdline`, cmd.join("\0") + "\0");
    put(`/proc/${pid}/oom_score_adj`, `${adj}\n`);
  };
  proc(1, 0, "systemd", 12 * KB, ["/sbin/init"], 0);
  proc(1011, 1, "caddy", 35 * KB, ["/usr/bin/caddy", "run"], 0);
  proc(100, 1, "ducter", 130 * KB, ["/root/.local/bin/ducter", "up", "--headless"]);
  proc(200, 100, "agy", 250 * KB, ["/root/.local/bin/agy", "serve"]);
  proc(300, 200, "MainThread", Math.round(2.6 * GiB), ["/root/.cache/node/bin/node", "--max-old-space-size=4096", "/w/node_modules/typescript/bin/tsc", "--noEmit"]);
  proc(301, 200, "MainThread", Math.round(1.1 * GiB), ["/root/.cache/node/bin/node", "/w/node_modules/vite/bin/vite.js", "--port", "1421"]);
  proc(302, 301, "chrome-headless", 390 * KB, ["/pw/chrome-headless-shell", "--headless"], 300);
  const writes: string[] = [];
  const fs: WatchFs = {
    read: (p) => files.get(p),
    write: (p, s) => {
      writes.push(p);
      files.set(p, s);
      return true;
    },
    list: (d) => (d === "/proc" ? [...new Set([...files.keys()].map((k) => /^\/proc\/(\d+)\//.exec(k)?.[1]).filter((x): x is string => !!x))] : []),
  };
  return { fs, files, writes, cg };
}

describe("memory watch (D524)", () => {
  test("reads /proc/meminfo and the unit's cgroup folder", () => {
    expect(parseMeminfo("MemTotal: 8000 kB\nMemAvailable: 1200 kB\n")).toEqual({ totalKb: 8000, availableKb: 1200 });
    expect(parseMeminfo("nothing")).toBeUndefined();
    expect(cgroupDir("0::/user.slice/a.service\n")).toBe("/sys/fs/cgroup/user.slice/a.service");
    // cgroup v1 only: no unified line, no folder.
    expect(cgroupDir("12:memory:/x\n")).toBeUndefined();
  });

  test("low: under a tenth of the computer (and 768 MB), or past nine tenths of the unit's own limit", () => {
    const total = Math.round(7.6 * GiB);
    expect(isLow({ totalKb: total, availableKb: 4 * GiB })).toBe(false);
    expect(isLow({ totalKb: total, availableKb: 500 * KB })).toBe(true);
    // A big machine with 2 GB left of 64 is fine: the floor is 768 MB, not a tenth.
    expect(isLow({ totalKb: 64 * GiB, availableKb: 2 * GiB })).toBe(false);
    expect(isLow({ totalKb: total, availableKb: 4 * GiB, cgroup: { currentB: 5.9e9, highB: 6.5e9, oomKills: 0 } })).toBe(true);
    expect(isLow({ totalKb: total, availableKb: 4 * GiB, cgroup: { currentB: 2e9, oomKills: 0 } })).toBe(false);
  });

  test("finds every process under the home, and only those", () => {
    const { fs } = machine();
    expect(descendants(fs, 100).map((p) => p.pid).sort()).toEqual([200, 300, 301, 302]);
  });

  test("marks the home's children so the kernel stops them first; never the home, never lowers", () => {
    const m = machine();
    const w = createMemoryWatch({ dataDir: "/d", fs: m.fs, pid: 100, everyMs: 0, log: () => {}, gc: () => {} });
    w.tick();
    for (const pid of [200, 300, 301]) expect(m.files.get(`/proc/${pid}/oom_score_adj`)).toBe(String(CHILD_OOM_ADJ));
    expect(m.files.get("/proc/100/oom_score_adj")).toBe("100\n");
    expect(m.files.get("/proc/1011/oom_score_adj")).toBe("0\n");
    // Chrome already at 300 is raised; one already above 500 is left alone.
    expect(m.files.get("/proc/302/oom_score_adj")).toBe(String(CHILD_OOM_ADJ));
    m.files.set("/proc/302/oom_score_adj", "900\n");
    expect(markChild(m.fs, 302)).toBe(false);
  });

  test("low memory: logs the biggest under the home, sheds caches, writes the record doctor reads", () => {
    const m = machine({ availableKb: 300 * KB });
    const lines: string[] = [];
    let shed = 0;
    let gc = 0;
    let t = Date.parse("2026-11-24T07:25:58Z");
    const w = createMemoryWatch({ dataDir: "/d", fs: m.fs, pid: 100, everyMs: 0, now: () => t, log: (l) => lines.push(l), shed: () => shed++, gc: () => gc++ });
    const r = w.tick()!;
    expect(r.kind).toBe("low");
    expect(r.top[0]).toMatchObject({ pid: 300, rssMb: 2662 });
    expect(r.top[0]!.cmd).toContain("tsc --noEmit");
    expect(r.top.find((p) => p.home)).toMatchObject({ pid: 100, rssMb: 130 });
    expect(lines[0]).toContain("memory is low");
    expect(lines[0]).toContain("tsc");
    expect([shed, gc]).toEqual([1, 1]);
    expect(readRecords("/d", m.fs)).toHaveLength(1);
    // Still low a few seconds later: no second report within the minute.
    t += 5_000;
    expect(w.tick()).toBeUndefined();
    t += 60_000;
    expect(w.tick()?.kind).toBe("low");
    expect(readRecords("/d", m.fs)).toHaveLength(2);
    expect(m.writes).toContain(`/d/${RECORD_FILE}`);
  });

  test("a kill the cgroup counts is recorded with who was biggest a moment before", () => {
    const m = machine({ availableKb: 3 * GiB, current: 2e9, kills: 0 });
    const lines: string[] = [];
    const w = createMemoryWatch({ dataDir: "/d", fs: m.fs, pid: 100, everyMs: 0, log: (l) => lines.push(l), gc: () => {} });
    expect(w.tick()).toBeUndefined();
    // tsc is gone (killed) and the cgroup counted it.
    for (const f of ["stat", "statm", "cmdline", "oom_score_adj"]) m.files.delete(`/proc/300/${f}`);
    m.files.set(`${m.cg}/memory.events`, "oom 1\noom_kill 1\n");
    const r = w.tick()!;
    expect(r).toMatchObject({ kind: "oom_kill", kills: 1 });
    expect(r.top[0]).toMatchObject({ pid: 300 });
    expect(lines[0]).toContain("the kernel stopped 1 process(es)");
    expect(w.tick()).toBeUndefined();
  });

  test("no /proc/meminfo (not Linux): nothing happens", () => {
    const fs: WatchFs = { read: () => undefined, write: () => true, list: () => [] };
    expect(createMemoryWatch({ dataDir: "/d", fs, pid: 1, everyMs: 0 }).tick()).toBeUndefined();
  });
});
