// D366: Nowledge Mem on a computer for tasks: where it stands (Mem's doctor), putting its command
// line there through Ducter's own uv, and signing it in with a one-time link that is never shown.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectReason, createWorkerMem, readDoctor, scrub, type WorkerMemSys } from "../src/worker-mem.ts";

const DOCTOR_FRESH = JSON.stringify({
  checks: [
    { name: "credential home", status: "pass", detail: "config.json not present — using http://127.0.0.1:14242 (default), no api key", tool: null },
    { name: "server reachable", status: "fail", detail: "Connection refused", tool: null },
    { name: "api key", status: "warn", detail: "skipped (server unreachable)", tool: null },
  ],
  failed: true,
});
const DOCTOR_READY = JSON.stringify({
  checks: [
    { name: "credential home", status: "pass", detail: "", tool: null },
    { name: "server reachable", status: "pass", detail: "", tool: null },
    { name: "api key", status: "pass", detail: "", tool: null },
    { name: "Claude Code", status: "pass", detail: "", tool: "claude-code" },
    { name: "Codex", status: "pass", detail: "", tool: "codex-cli" },
    { name: "Cursor", status: "warn", detail: "", tool: "cursor" },
  ],
  failed: false,
});

const flush = () => new Promise((r) => setTimeout(r, 5));
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 200 && !fn(); i++) await flush();
};

function rig(o: { nmem?: boolean; signedIn?: boolean; connect?: { code: number; out: string } } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "wmem-"));
  const bytes = new TextEncoder().encode("uv tarball");
  const pin = { version: "9.9.9", base: "https://example.invalid", assets: { "linux-x64": { target: "x86_64-unknown-linux-musl", sha256: createHash("sha256").update(bytes).digest("hex") } } };
  let nmem = o.nmem ? "/usr/bin/nmem" : null;
  let signedIn = !!o.signedIn;
  const calls: string[][] = [];
  const envs: Record<string, string>[] = [];
  const sys: WorkerMemSys = {
    platform: "linux",
    arch: "x64",
    which: (c) => (c === "nmem" ? nmem : null),
    env: () => ({ PATH: "/usr/bin", HOME: "/home/x" }),
    download: async (_u, pct) => (pct?.(50), pct?.(100), bytes),
    async run(argv, { env }) {
      calls.push(argv);
      envs.push(env);
      if (argv[0] === "tar") {
        const dir = join(argv[4]!, "uv-x86_64-unknown-linux-musl");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "uv"), "#!/bin/sh\n");
        return { code: 0, out: "" };
      }
      if (argv[1] === "tool" && argv[2] === "install") {
        nmem = join(dataDir, "tools", "bin", "nmem");
        return { code: 0, out: " + nmem-cli==0.10.120\nInstalled 1 executable: nmem" };
      }
      if (argv[1] === "--version") return { code: 0, out: "nmem 0.10.120\n" };
      if (argv.includes("doctor")) return signedIn ? { code: 0, out: DOCTOR_READY } : { code: 1, out: DOCTOR_FRESH };
      if (argv.includes("connect")) {
        const r = o.connect ?? { code: 0, out: "{}" };
        if (r.code === 0) signedIn = true;
        return r;
      }
      return { code: 1, out: "unknown" };
    },
  };
  let changes = 0;
  let connected = 0;
  const m = createWorkerMem({ dataDir, sys, uv: pin, agents: () => ["codex", "claude-code", "pi"], changed: () => changes++, connected: () => connected++ });
  return { m, calls, envs, dataDir, changes: () => changes, connected: () => connected };
}

describe("D366 Mem's doctor", () => {
  test("a fresh computer (the default local Mem isn't there) is not signed in", () => {
    expect(readDoctor(DOCTOR_FRESH)).toEqual({ ready: false, agents: [] });
  });
  test("signed in, with the agents Mem connected by their Ducter names", () => {
    expect(readDoctor(DOCTOR_READY)).toEqual({ ready: true, agents: ["claude-code", "codex"] });
  });
  test("not JSON: nothing to say", () => {
    expect(readDoctor("error: boom")).toBeUndefined();
  });
});

describe("D366 the words a failure shows", () => {
  test("a used or expired link, the unreachable server, anything else", () => {
    expect(connectReason("error: redeem failed: 410 Gone")).toBe("used");
    expect(connectReason("error: connecting to https://mem.example.invalid: dns error: failed to lookup address information")).toBe("unreachable");
    expect(connectReason("error: something else")).toBe("failed");
  });
  test("a shown line never carries the link, a token or a key", () => {
    const link = "https://cloud.nowledge.co/app?nmem_connect=nmem_ct_abcdef123456";
    const out = scrub(`error: redeeming ${link} failed; key nmem_ck_secret1862 refused`, link);
    expect(out).not.toContain("nmem_ct_abcdef123456");
    expect(out).not.toContain("secret1862");
    expect(out).toContain("<link>");
  });
});

describe("D366 on a computer for tasks", () => {
  test("no nmem there: absent, and Ducter can put it there", async () => {
    const r = rig();
    await r.m.look();
    expect(r.m.view()).toEqual({ state: "absent", installable: true });
  });

  test("install: uv's checked build into the tools folder, then nmem-cli through it, every uv folder inside", async () => {
    const r = rig();
    r.m.install();
    await until(() => !r.m.busy());
    expect(existsSync(join(r.dataDir, "tools", "bin", "uv"))).toBe(true);
    const i = r.calls.findIndex((c) => c[1] === "tool" && c[2] === "install");
    expect(r.calls[i]).toEqual([join(r.dataDir, "tools", "bin", "uv"), "tool", "install", "nmem-cli"]);
    const env = r.envs[i]!;
    for (const k of ["UV_TOOL_DIR", "UV_TOOL_BIN_DIR", "UV_PYTHON_INSTALL_DIR", "UV_CACHE_DIR"]) expect(env[k]!.startsWith(join(r.dataDir, "tools"))).toBe(true);
    expect(r.m.view()).toEqual({ state: "sign_in", version: "0.10.120" });
  });

  test("a download that doesn't match its checksum stops, nothing put there", async () => {
    const r = rig();
    // The real pin: a fake download is never its file.
    const m = createWorkerMem({ dataDir: r.dataDir, sys: { platform: "linux", arch: "x64", which: () => null, env: () => ({}), download: async () => new Uint8Array([1]), run: async () => ({ code: 0, out: "" }) }, agents: () => [], changed: () => {} });
    m.install();
    await until(() => !m.busy());
    expect(m.view().step).toMatchObject({ phase: "failed", reason: "failed", detail: "the download didn't match its checksum" });
    expect(existsSync(join(r.dataDir, "tools", "bin", "uv"))).toBe(false);
  });

  test("a computer with no build: not installable", async () => {
    const r = rig();
    const m = createWorkerMem({ dataDir: r.dataDir, sys: { platform: "freebsd", arch: "x64", which: () => null, env: () => ({}), download: async () => new Uint8Array(), run: async () => ({ code: 0, out: "" }) }, agents: () => [], changed: () => {} });
    await m.look();
    expect(m.view()).toEqual({ state: "absent" });
  });

  test("the person's own nmem stays: install only looks", async () => {
    const r = rig({ nmem: true });
    r.m.install();
    await until(() => !r.m.busy());
    expect(r.calls.some((c) => c[0] === "tar" || c[2] === "install")).toBe(false);
    expect(r.m.view().state).toBe("sign_in");
  });

  test("connect: the link to nmem connect with the agents Mem registers (pi left out), then ready and the home told", async () => {
    const r = rig({ nmem: true });
    const link = "https://cloud.nowledge.co/app?nmem_connect=nmem_ct_000111";
    r.m.connect(link);
    await until(() => !r.m.busy());
    const c = r.calls.find((x) => x.includes("connect"))!;
    expect(c).toEqual(["/usr/bin/nmem", "--json", "connect", link, "--tool", "codex-cli", "--tool", "claude-code"]);
    expect(r.m.view()).toEqual({ state: "ready", version: "0.10.120", agents: ["claude-code", "codex"] });
    expect(r.connected()).toBe(1);
  });

  test("not a connect link: refused before anything runs", async () => {
    const r = rig({ nmem: true });
    r.m.connect("nowledgemem://login?x=1");
    await until(() => !r.m.busy());
    expect(r.calls.some((c) => c.includes("connect"))).toBe(false);
    expect(r.m.view().step).toEqual({ phase: "failed", reason: "bad_link" });
  });

  test("a used link: its words, and the line shown carries no link", async () => {
    const link = "https://cloud.nowledge.co/app?nmem_connect=nmem_ct_used999";
    const r = rig({ nmem: true, connect: { code: 1, out: `error: redeeming ${link}: 410 Gone` } });
    r.m.connect(link);
    await until(() => !r.m.busy());
    const s = r.m.view().step!;
    expect(s.phase).toBe("failed");
    expect(s.reason).toBe("used");
    expect(JSON.stringify(r.m.view())).not.toContain("nmem_ct_used999");
    expect(r.connected()).toBe(0);
  });

  test("already signed in: connect without a link only connects the agents", async () => {
    const r = rig({ nmem: true, signedIn: true });
    r.m.connect();
    await until(() => !r.m.busy());
    expect(r.calls.find((x) => x.includes("connect"))).toEqual(["/usr/bin/nmem", "--json", "connect", "--tool", "codex-cli", "--tool", "claude-code"]);
  });
});

describe("D370 signing in with what Mem copies", () => {
  // Made up: never a real token.
  const TOKEN = `nmem_ct_${"fedcba9876543210".repeat(4)}`;
  const PROMPT = `Connect Nowledge Mem for this AI tool.\n\nStep 1: Redeem the one-time connect link (single use, expires in 15 minutes):\nPOST https://cloud.nowledge.co/api/remote-access/redeem-connect-token\nContent-Type: application/json\nX-Nmem-Space-Protocol: exact-v1\nBody: {"token":"${TOKEN}"}\n\nStep 2: Store the credential (never print, quote, or echo the api_key):\nnmem config client set --url https://cloud.nowledge.co --api-key <api_key from step 1>\n`;
  const quiet = () => {
    const heard: string[] = [];
    const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(keep) as (keyof typeof keep)[]) console[k] = (...a: unknown[]) => void heard.push(a.map(String).join(" "));
    return { heard, done: () => Object.assign(console, keep) };
  };

  test("the whole prompt: nmem connect redeems the link made from it; the key never passes through Ducter", async () => {
    const c = quiet();
    const r = rig({ nmem: true });
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    c.done();
    const call = r.calls.find((x) => x.includes("connect"))!;
    expect(call).toEqual(["/usr/bin/nmem", "--json", "connect", `https://cloud.nowledge.co/app?nmem_connect=${TOKEN}`, "--tool", "codex-cli", "--tool", "claude-code"]);
    expect(r.calls.flat().some((a) => /api[-_]key/i.test(a))).toBe(false);
    expect(r.m.view().state).toBe("ready");
    expect(JSON.stringify(r.m.view())).not.toContain(TOKEN);
    expect(c.heard.join("\n")).not.toContain(TOKEN);
  });

  test("410 from Mem: used, and nothing shown carries the token", async () => {
    const c = quiet();
    const r = rig({ nmem: true, connect: { code: 1, out: `error: redeem https://cloud.nowledge.co/app?nmem_connect=${TOKEN} failed: 410 Gone (token ${TOKEN})` } });
    r.m.connect(PROMPT);
    await until(() => !r.m.busy());
    c.done();
    expect(r.m.view().step).toMatchObject({ phase: "failed", reason: "used" });
    expect(JSON.stringify(r.m.view())).not.toContain(TOKEN);
    expect(c.heard.join("\n")).not.toContain(TOKEN);
  });

  test("401 from Mem: refused, one honest line with no key in it", async () => {
    const r = rig({ nmem: true, connect: { code: 1, out: `error: verifying credential: 401 Unauthorized ("api_key": "nmem_${"a1".repeat(16)}")` } });
    r.m.connect(TOKEN);
    await until(() => !r.m.busy());
    const v = r.m.view();
    expect(v.step).toMatchObject({ phase: "failed", reason: "refused" });
    expect(JSON.stringify(v)).not.toContain("a1a1a1a1");
  });

  test("words with no token or link in them: refused before anything runs", async () => {
    const r = rig({ nmem: true });
    r.m.connect("Connect Nowledge Mem for this AI tool. Step 3: Read https://mem.nowledge.co/SKILL.md");
    await until(() => !r.m.busy());
    expect(r.calls.some((c) => c.includes("connect"))).toBe(false);
    expect(r.m.view().step).toEqual({ phase: "failed", reason: "bad_link" });
  });
});
