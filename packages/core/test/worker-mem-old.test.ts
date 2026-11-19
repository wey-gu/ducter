// D386: the person's own nmem too old to sign in (the old Python CLI: no `doctor`, no `connect`), as
// haswell had it. Known up front; the paste never goes to it; Ducter's own current copy goes in
// beside it and is used there, ahead on PATH for nmem alone; the person's copy is never touched.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nmemTooOld } from "@ducter/protocol";
import { agentPath, toolsOwnBin, toolsPreferBin, type AgentPathFs } from "../src/agent-path.ts";
import { createBridgeLink } from "../src/bridge-link.ts";
import { createWorkerMem, theirUpdateHow, type WorkerMemSys } from "../src/worker-mem.ts";

// What haswell's own nmem answered (an argparse usage error, exit 2).
const OLD_USAGE = (cmd: string) =>
  `usage: nmem [-h] [--json] COMMAND ...\nnmem: error: argument COMMAND: invalid choice: '${cmd}' (choose from status, plugins, stats, fs, export, import, tui, key, serve, service, update, models, memo)`;
const DOCTOR = (signedIn: boolean) =>
  JSON.stringify({
    checks: [
      { name: "credential home", status: "pass", detail: signedIn ? "" : "config.json not present — using http://127.0.0.1:14242 (default), no api key", tool: null },
      { name: "server reachable", status: signedIn ? "pass" : "fail", detail: "", tool: null },
      { name: "api key", status: signedIn ? "pass" : "warn", detail: "", tool: null },
      { name: "Codex", status: signedIn ? "pass" : "warn", detail: "", tool: "codex-cli" },
    ],
    failed: !signedIn,
  });
// Made up, obviously fake.
const TOKEN = `nmem_ct_${"0f".repeat(32)}`;
const PROMPT = `Connect Nowledge Mem for this AI tool.\nPOST https://mem.example.invalid/api/remote-access/redeem-connect-token\nBody: {"token":"${TOKEN}"}`;

const flush = () => new Promise((r) => setTimeout(r, 5));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 400 && !fn(); i++) await flush();
};

/** theirs: the person's own nmem (old or current, or none); ours: whether Ducter's copy is there and whether it is current. */
function rig(o: { theirs?: "old" | "new"; ours?: "old" | "new"; how?: string; connectOut?: { code: number; out: string } } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "wmem-old-"));
  const bin = toolsOwnBin(dataDir);
  const ours = join(bin, "nmem");
  const theirs = "/home/x/.local/bin/nmem";
  let theirsKind = o.theirs;
  let oursKind = o.ours;
  const bytes = new TextEncoder().encode("uv tarball");
  const pin = { version: "9.9.9", base: "https://example.invalid", assets: { "linux-x64": { target: "x86_64-unknown-linux-musl", sha256: createHash("sha256").update(bytes).digest("hex") } } };
  const putOurs = (kind: "old" | "new") => {
    mkdirSync(bin, { recursive: true });
    writeFileSync(ours, "#!/bin/sh\n");
    oursKind = kind;
  };
  if (o.ours) {
    putOurs(o.ours);
    writeFileSync(join(bin, "uv"), "#!/bin/sh\n");
  }
  let signedIn = false;
  const calls: string[][] = [];
  let pathChanges = 0;
  const sys: WorkerMemSys = {
    platform: "linux",
    arch: "x64",
    // The person's own first on PATH, Ducter's last (D363); asked outside Ducter's folder, never Ducter's.
    which: (c, path) => (c !== "nmem" ? null : theirsKind ? theirs : path === undefined && oursKind ? ours : null),
    env: () => ({ PATH: `/home/x/.local/bin:/usr/bin:${bin}`, HOME: "/home/x" }),
    download: async () => bytes,
    inspect: (p) => ({ real: p === theirs ? "/home/x/.local/share/pipx/venvs/nmem-cli/bin/nmem" : p, head: "#!/home/x/.local/share/pipx/venvs/nmem-cli/bin/python" }),
    async run(argv) {
      calls.push(argv);
      if (argv[0] === "tar") {
        const dir = join(argv[4]!, "uv-x86_64-unknown-linux-musl");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "uv"), "#!/bin/sh\n");
        return { code: 0, out: "" };
      }
      if (argv[1] === "tool" && (argv[2] === "install" || argv[2] === "upgrade")) {
        putOurs("new");
        return { code: 0, out: "Installed 1 executable: nmem" };
      }
      const kind = argv[0] === theirs ? theirsKind : argv[0] === ours ? oursKind : undefined;
      if (!kind) return { code: 127, out: "not found" };
      if (argv[1] === "--version") return { code: 0, out: kind === "old" ? "nmem 0.4.2\n" : "nmem 0.10.120\n" };
      const cmd = argv.find((a) => a === "doctor" || a === "connect");
      if (kind === "old" && cmd) return { code: 2, out: OLD_USAGE(cmd) };
      if (cmd === "doctor") return { code: signedIn ? 0 : 1, out: DOCTOR(signedIn) };
      if (cmd === "connect") {
        const r = o.connectOut ?? { code: 0, out: "{}" };
        if (r.code === 0) signedIn = true;
        return r;
      }
      return { code: 1, out: "unknown" };
    },
  };
  const m = createWorkerMem({ dataDir, sys, uv: pin, agents: () => ["codex"], changed: () => {}, pathChanged: () => pathChanges++ });
  return {
    m,
    calls,
    dataDir,
    bin,
    ours,
    theirs,
    pathChanges: () => pathChanges,
    setTheirs: (k: "old" | "new" | undefined) => (theirsKind = k),
    sentTo: (who: string) => calls.filter((c) => c[0] === who && c.includes("connect")),
  };
}

describe("D386 the usage error is known, never shown", () => {
  test("argparse's invalid choice (haswell's) and clap's unrecognized subcommand are 'too old'", () => {
    expect(nmemTooOld(OLD_USAGE("connect"))).toBe(true);
    expect(nmemTooOld("error: unrecognized subcommand 'doctor'")).toBe(true);
    expect(nmemTooOld("error: redeem failed: 410 Gone")).toBe(false);
  });
  test("how the person updates their own, from where it really is", () => {
    expect(theirUpdateHow({ real: "/home/x/.local/share/pipx/venvs/nmem-cli/bin/nmem", head: "" })).toBe("pipx");
    expect(theirUpdateHow({ real: "/home/x/.local/share/uv/tools/nmem-cli/bin/nmem", head: "" })).toBe("uv");
    expect(theirUpdateHow({ real: "/home/x/.local/bin/nmem", head: "#!/usr/bin/python3" })).toBe("pip");
    expect(theirUpdateHow({ real: "/usr/bin/nmem", head: "\x7fELF" })).toBeUndefined();
  });
});

describe("D386 the person's own nmem is too old", () => {
  test("known up front: no paste box, Ducter's own offered, how to update theirs", async () => {
    const r = rig({ theirs: "old" });
    await r.m.look();
    expect(r.m.view()).toEqual({ state: "sign_in", health: { issue: "old" }, theirs: { old: true, how: "pipx" }, installable: true });
    expect(r.sentTo(r.theirs).filter((c) => c.includes("connect"))).toEqual([]);
  });

  test("the paste is never sent to it: Ducter's own goes in, then signs in with the link", async () => {
    const r = rig({ theirs: "old" });
    await r.m.look();
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    expect(r.calls.some((c) => c[0] === r.theirs && c.some((x) => x.includes(TOKEN)))).toBe(false);
    expect(r.calls.some((c) => c[1] === "tool" && c[2] === "install")).toBe(true);
    const sent = r.sentTo(r.ours);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([r.ours, "--json", "connect", `https://mem.example.invalid/app?nmem_connect=${TOKEN}`, "--tool", "codex-cli"]);
    expect(r.m.view()).toMatchObject({ state: "ready", ours: true, theirs: { old: true } });
    expect(JSON.stringify(r.m.view())).not.toContain(TOKEN);
  });

  test("install: Ducter's own beside it, ahead on PATH for nmem alone, theirs untouched", async () => {
    const r = rig({ theirs: "old" });
    await r.m.look();
    r.m.install();
    await until(() => !r.m.busy());
    expect(r.m.view()).toMatchObject({ state: "sign_in", ours: true, theirs: { old: true, how: "pipx" } });
    const link = join(toolsPreferBin(r.dataDir), "nmem");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(r.ours);
    expect(r.pathChanges()).toBe(1);
    // Nothing ran against the person's copy but its doctor (read-only): no upgrade, no connect.
    expect(r.calls.filter((c) => c[0] === r.theirs).every((c) => c.includes("doctor"))).toBe(true);
    expect(r.calls.some((c) => c[0] === "pipx" || c.includes("upgrade"))).toBe(false);
  });

  test("once theirs works again, theirs is used and Ducter's steps back", async () => {
    const r = rig({ theirs: "old", ours: "new" });
    await r.m.look();
    expect(existsSync(join(toolsPreferBin(r.dataDir), "nmem"))).toBe(true);
    r.setTheirs("new");
    await r.m.look();
    expect(r.m.view().ours).toBeUndefined();
    expect(r.m.view().theirs).toBeUndefined();
    expect(existsSync(toolsPreferBin(r.dataDir))).toBe(false);
    expect(r.pathChanges()).toBe(2);
  });

  test("a current nmem of the person's own: theirs is used, Ducter's nothing preferred", async () => {
    const r = rig({ theirs: "new", ours: "new" });
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    expect(r.sentTo(r.theirs)).toHaveLength(1);
    expect(r.sentTo(r.ours)).toHaveLength(0);
    expect(existsSync(toolsPreferBin(r.dataDir))).toBe(false);
  });
});

describe("D386 Ducter's own copy too old", () => {
  test("it is updated first, then the link is sent to it", async () => {
    const r = rig({ ours: "old" });
    await r.m.look();
    expect(r.m.view()).toMatchObject({ health: { issue: "old" }, ours: true });
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    const i = r.calls.findIndex((c) => c[1] === "tool" && c[2] === "upgrade");
    const j = r.calls.findIndex((c) => c.some((x) => x.includes(TOKEN)));
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(r.m.view().state).toBe("ready");
  });

  test("a usage error from connect is said as 'too old', never its raw lines", async () => {
    const r = rig({ theirs: "new", connectOut: { code: 2, out: OLD_USAGE("connect") } });
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    expect(r.m.view().step).toEqual({ phase: "failed", reason: "old" });
    expect(JSON.stringify(r.m.view())).not.toMatch(/usage|invalid choice/);
  });
});

describe("D386 PATH: Ducter's nmem ahead only while its link is there", () => {
  const fsWith = (files: string[]): AgentPathFs => ({ exists: (p) => files.includes(p), readdir: () => [], read: () => undefined });
  test("the prefer folder goes first; the rest of Ducter's tools stay last", () => {
    const data = "/d";
    const prefer = toolsPreferBin(data);
    const on = agentPath({ dataDir: data, env: { PATH: "/home/x/.local/bin:/usr/bin" }, home: "/nohome", fs: fsWith([join(prefer, "nmem")]), login: [] }).split(":");
    expect(on[0]).toBe(prefer);
    expect(on.at(-1)).toBe(toolsOwnBin(data));
    expect(on.indexOf("/home/x/.local/bin")).toBeLessThan(on.indexOf(toolsOwnBin(data)));
  });
  test("no link (or a link to nothing): no prefer folder, even one the PATH kept from before", () => {
    const data = "/d";
    const prefer = toolsPreferBin(data);
    const off = agentPath({ dataDir: data, env: { PATH: `${prefer}:/usr/bin` }, home: "/nohome", fs: fsWith([]), login: [] }).split(":");
    expect(off).not.toContain(prefer);
  });
});

describe("D386 the home's own sign-in (D225/D370)", () => {
  test("an nmem too old for Mem's connect is never sent the link; the row's update offer stays", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "home-old-"));
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "--version") return { code: 0, out: "nmem 0.4.2", err: "" };
      return { code: 2, out: "", err: OLD_USAGE(args[0] ?? "") };
    };
    const link = createBridgeLink({ dataDir, identity: () => "ducter", home: () => "home-x", run, env: { PATH: "/usr/bin", NMEM_CLI_PATH: "/nonexistent/nmem" } });
    await link.signInMem(PROMPT);
    expect(calls.some((c) => c.some((x) => x.includes(TOKEN)))).toBe(false);
    const v = await link.view();
    expect(JSON.stringify(v)).not.toMatch(/usage|invalid choice/);
  });
});
