import { describe, expect, test } from "bun:test";
import { refreshServiceUnit, refreshUnitText, REFRESH_RECORD, type RefreshSys } from "../src/unit-refresh.ts";
import { systemdUnit } from "../../cli/src/remote.ts";

// hel's unit as 0.1.40 wrote it (2026-11-24), before D524.
const OLD = `# Written by \`ducter service install\`. Remove with \`ducter service uninstall\`.
[Unit]
Description=Ducter (main process)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/root/.local/bin/ducter up --headless --port 7777
Restart=on-failure
RestartSec=3
WorkingDirectory=%h
Environment=DUCTER_DATA_DIR=/root/.ducter
Environment=PATH=/root/.local/bin:/usr/bin:/root/.bun/bin
Environment=NO_COLOR=1
# Settings only. Keys go in keys.env next to it, never here (Ducter moves any it finds).
EnvironmentFile=-/root/.ducter/env

[Install]
WantedBy=default.target
`;

function fakeSys(files: Record<string, string>, reload = { code: 0, out: "" }) {
  const calls: string[] = [];
  const sys: RefreshSys = {
    read: (p) => files[p],
    write: (p, s) => ((files[p] = s), true),
    run: async (argv) => (calls.push(argv.join(" ")), argv[0] === "systemctl" && argv.includes("daemon-reload") ? reload : { code: 1, out: "unexpected" }),
    now: () => Date.parse("2026-11-24T09:00:00Z"),
  };
  return { sys, calls, files };
}

describe("unit refresh (D524)", () => {
  test("an older unit gets OOMPolicy and MemoryMax after RestartSec; everything else stays", () => {
    const next = refreshUnitText(OLD)!;
    expect(next).toMatch(/^RestartSec=3\n# A task's child.*\nOOMPolicy=continue\n# Memory runs short.*\nMemoryMax=90%\nWorkingDirectory=%h$/m);
    expect(next).not.toContain("MemoryHigh");
    const without = next.split("\n").filter((l) => !/^(OOMPolicy|MemoryMax)=|^# (A task's child|Memory runs short)/.test(l)).join("\n");
    expect(without).toBe(OLD);
    // Once is enough: the refreshed unit is already up to date.
    expect(refreshUnitText(next)).toBeUndefined();
  });

  test("today's template needs nothing; a changed value is put back; not ours is never touched", () => {
    const fresh = systemdUnit({ execStart: ["/root/.local/bin/ducter"], dataDir: "/root/.ducter", path: "/usr/bin", port: 7777 });
    expect(refreshUnitText(fresh)).toBeUndefined();
    expect(fresh).not.toContain("MemoryHigh");
    const edited = refreshUnitText(fresh.replace("MemoryMax=90%", "MemoryMax=50%"))!;
    expect(edited).toBe(fresh);
    expect(refreshUnitText(OLD.replace("# Written by", "# Mine"))).toBeUndefined();
  });

  test("writes the unit, daemon-reloads (never restarts), logs one line and leaves the record doctor reads", async () => {
    const f = fakeSys({ "/root/.config/systemd/user/ducter.service": OLD });
    const lines: string[] = [];
    const r = await refreshServiceUnit({ dataDir: "/root/.ducter", home: "/root", uid: 0, sys: f.sys, log: (l) => lines.push(l) });
    expect(r).toEqual({ unit: "/root/.config/systemd/user/ducter.service", refreshed: true });
    expect(f.calls).toEqual(["systemctl --user daemon-reload"]);
    expect(f.calls.some((c) => /restart|stop|start/.test(c.replace("daemon-reload", "")))).toBe(false);
    expect(f.files["/root/.config/systemd/user/ducter.service"]).toContain("OOMPolicy=continue");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("service settings updated");
    expect(JSON.parse(f.files[`/root/.ducter/${REFRESH_RECORD}`]!)).toMatchObject({ at: "2026-11-24T09:00:00.000Z" });
    // The next start: nothing to do, nothing run.
    const again = await refreshServiceUnit({ dataDir: "/root/.ducter", home: "/root", uid: 0, sys: f.sys, log: (l) => lines.push(l) });
    expect(again).toEqual({ unit: "/root/.config/systemd/user/ducter.service", refreshed: false });
    expect(f.calls).toHaveLength(1);
    expect(lines).toHaveLength(1);
  });

  test("root's system worker unit reloads the system manager; a failed reload is said, not retried", async () => {
    const f = fakeSys({ "/etc/systemd/system/ducter.service": OLD.replace("up --headless --port 7777", "worker") }, { code: 1, out: "Failed to connect to bus" });
    const lines: string[] = [];
    const r = await refreshServiceUnit({ dataDir: "/root/.ducter", home: "/root", uid: 0, sys: f.sys, log: (l) => lines.push(l) });
    expect(r).toMatchObject({ unit: "/etc/systemd/system/ducter.service", refreshed: true, reloadError: "Failed to connect to bus" });
    expect(f.calls).toEqual(["systemctl daemon-reload"]);
    expect(lines[0]).toContain("apply at the next start");
    // Not root: the system unit isn't Ducter's to change.
    const g = fakeSys({ "/etc/systemd/system/ducter.service": OLD });
    expect(await refreshServiceUnit({ dataDir: "/d", home: "/home/me", uid: 1000, sys: g.sys })).toBeUndefined();
    expect(g.calls).toEqual([]);
  });
});
