// D345: 待办来源 › GitHub › 连上 / Connect, end to end with fakes: the GitHub row is there with no gh,
// gh is put on the home in one tap (GitHub's own build into Ducter's folder, or Homebrew on a Mac),
// the device flow shows its code and waits, and once signed in GitHub is a source with its count.
// Never the network, never brew, never the real gh: a fake gh (fake-gh-issues.ts) that exists only
// once the fake install put a file where Ducter's own tools live.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GitLoginState, LogEvent, ServerFrame } from "@ducter/protocol";
import { createGitLogin, loginWhy, TOKEN_NEW_URL, type GhRun } from "@ducter/protocol/src/git-login.ts";
import { startCore, type Core } from "../src/core.ts";
import { createDid } from "../src/did.ts";
import { createGhInstaller, GH_RELEASE, toolsBin, useOwnTools, type GhInstallSys } from "../src/gh-install.ts";
import { fakeGh } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A real gh-shaped archive made here (a tiny script as bin/gh), and the release table naming it. */
async function fakeRelease(dir: string, platform = "linux", arch = "x64") {
  const name = platform === "darwin" ? `gh_9.9.9_macOS_${arch === "arm64" ? "arm64" : "amd64"}` : `gh_9.9.9_linux_${arch === "arm64" ? "arm64" : "amd64"}`;
  const src = join(dir, "src");
  mkdirSync(join(src, name, "bin"), { recursive: true });
  writeFileSync(join(src, name, "bin", "gh"), "#!/bin/sh\necho fake gh\n");
  const file = platform === "darwin" ? `${name}.zip` : `${name}.tar.gz`;
  const out = join(dir, file);
  const p = platform === "darwin" ? Bun.spawn(["zip", "-q", "-r", out, name], { cwd: src }) : Bun.spawn(["tar", "-czf", out, "-C", src, name]);
  await p.exited;
  const bytes = new Uint8Array(readFileSync(out));
  const release = { version: "9.9.9", base: "https://example.invalid/releases", assets: { [`${platform}-${arch}`]: { file, sha256: createHash("sha256").update(bytes).digest("hex") } } };
  return { bytes, release };
}

function fakeSys(o: { platform?: string; arch?: string; brew?: boolean; brewFails?: boolean; bytes?: Uint8Array; downloadErr?: string }) {
  const calls: string[][] = [];
  const sys: GhInstallSys = {
    platform: o.platform ?? "linux",
    arch: o.arch ?? "x64",
    which: (cmd) => (cmd === "brew" && o.brew ? "/opt/homebrew/bin/brew" : undefined),
    async exec(argv, env) {
      calls.push(argv);
      if (argv[1] === "install" && argv[2] === "gh") return o.brewFails ? { code: 1, out: "Error: Failed to download resource" } : { code: 0, out: "" };
      // tar and unzip run for real on the archive made in the test's own folder.
      const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", ...(env ? { env } : {}) });
      const [a, b] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
      return { code: await p.exited, out: a + b };
    },
    async download(url, onProgress) {
      calls.push(["download", url]);
      if (o.downloadErr) throw new Error(o.downloadErr);
      onProgress(40);
      onProgress(99);
      return o.bytes ?? new Uint8Array([1, 2, 3]);
    },
  };
  return { sys, calls };
}

describe("D345 putting gh on the home", () => {
  test("Linux with no root: GitHub's own build, checked, into Ducter's own folder, first on its PATH", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const { bytes, release } = await fakeRelease(t.dir);
    const { sys, calls } = fakeSys({ bytes });
    const env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin" };
    const inst = createGhInstaller({ dataDir: t.dir, sys, env, release });
    expect(inst.plan()).toEqual({ how: "release", where: toolsBin(t.dir) });
    const seen: (number | undefined)[] = [];
    const r = await inst.install((p) => seen.push(p.progress));
    expect(r).toMatchObject({ ok: true, how: "release", where: toolsBin(t.dir), version: "9.9.9" });
    expect(existsSync(join(toolsBin(t.dir), "gh"))).toBe(true);
    expect(seen).toEqual([0, 40, 99, 100]);
    expect(env.PATH).toBe(`${toolsBin(t.dir)}:/usr/bin:/bin`);
    useOwnTools(t.dir, env); // once only
    expect(env.PATH!.split(":").filter((p) => p === toolsBin(t.dir))).toHaveLength(1);
    expect(calls.some((c) => c[0] === "sudo" || c.includes("apt-get") || c.includes("dnf"))).toBe(false);
  });

  test("a Mac with Homebrew: brew install gh; if brew can't, GitHub's own build", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const ok = fakeSys({ platform: "darwin", arch: "arm64", brew: true });
    const inst = createGhInstaller({ dataDir: t.dir, sys: ok.sys, env: {} });
    expect(inst.plan()).toEqual({ how: "brew", where: "/opt/homebrew" });
    expect(await inst.install(() => {})).toMatchObject({ ok: true, how: "brew" });
    expect(ok.calls[0]).toEqual(["/opt/homebrew/bin/brew", "install", "gh"]);

    const { bytes, release } = await fakeRelease(t.dir, "darwin", "arm64");
    const bad = fakeSys({ platform: "darwin", arch: "arm64", brew: true, brewFails: true, bytes });
    const r = await createGhInstaller({ dataDir: t.dir, sys: bad.sys, env: {}, release }).install(() => {});
    expect(r).toMatchObject({ ok: true, how: "release", where: toolsBin(t.dir) });
    expect(existsSync(join(toolsBin(t.dir), "gh"))).toBe(true);
  });

  test("each failure says why: no network, a bad download, no build for this system", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const net = fakeSys({ downloadErr: "Unable to connect. Is the computer able to access the url?" });
    expect(await createGhInstaller({ dataDir: t.dir, sys: net.sys, env: {} }).install(() => {})).toMatchObject({ ok: false, reason: "network" });
    const sum = fakeSys({ bytes: new Uint8Array([9, 9, 9]) });
    expect(await createGhInstaller({ dataDir: t.dir, sys: sum.sys, env: {} }).install(() => {})).toMatchObject({ ok: false, reason: "install", message: "the download didn't match its checksum" });
    const none = createGhInstaller({ dataDir: t.dir, sys: fakeSys({ platform: "win32" }).sys, env: {} });
    expect(none.plan()).toBeUndefined();
    expect(await none.install(() => {})).toMatchObject({ ok: false, reason: "unsupported" });
    expect(existsSync(join(toolsBin(t.dir), "gh"))).toBe(false);
  });

  test("the pinned build names a file and a checksum for each system it covers", () => {
    for (const k of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) expect(GH_RELEASE.assets[k]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("GitHub out of reach reads as no network, not an expired code; the token link fills in its permissions", () => {
    expect(loginWhy('Post "https://github.com/login/device/code": dial tcp: lookup github.com: no such host')).toBe("network");
    expect(loginWhy("the device code has expired")).toBe("expired");
    const u = new URL(TOKEN_NEW_URL);
    expect(u.host).toBe("github.com");
    expect(u.searchParams.get("issues")).toBe("write");
    expect(u.searchParams.get("pull_requests")).toBe("write");
    expect(u.searchParams.get("contents")).toBe("write");
  });
});

// ---------- end to end, through the home's socket ----------

function boot(o: { platform?: string; flow?: "approve" | "hold" | "expired" | "denied" | "network"; noInstall?: boolean } = {}) {
  const t = tempDir();
  const gh = fakeGh([
    { repo: "acme/web", number: 12, title: "Login redirect drops the return path" },
    { repo: "acme/api", number: 31, title: "Rate limiter counts retries twice" },
  ]);
  gh.signedIn = false;
  gh.deviceFlow = o.flow ?? "hold";
  // gh is there only once the install put it in Ducter's own folder.
  const run: GhRun = (args, x) => (existsSync(join(toolsBin(t.dir), "gh")) ? gh.run(args, x) : Promise.resolve({ code: 127, out: "", err: "", missing: true as const }));
  return { t, gh, run, async start() {
    const { bytes, release } = await fakeRelease(join(t.dir, "..", `${t.dir.split("/").pop()}-rel`));
    const { sys } = fakeSys({ platform: o.platform ?? "linux", bytes });
    const core = startCore({
      dataDir: t.dir,
      port: 0,
      batchMs: 5,
      deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "server" },
      gitLoginHome: createGitLogin({ run, env: {} }),
      ...(o.noInstall ? {} : { ghInstaller: createGhInstaller({ dataDir: t.dir, sys, env: {}, release }) }),
      taskSources: { ghRun: run, ghEnv: {}, home: join(t.dir, "no-home"), pollMs: 3_600_000, quietMs: 0 },
    });
    stops.push(t.cleanup, () => core.stop());
    core.setPartner({ onTrigger: (_e: LogEvent) => {} });
    return core;
  } };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 6000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${JSON.stringify(frames.map((f) => [f.t, (f as { state?: string }).state]))}`);
  };
  await until((f) => f.t === "on_hand");
  const send = (f: object) => ws.send(JSON.stringify(f));
  return { send, until, frames };
}

type Gls = Extract<ServerFrame, { t: "git_login_state" }>;
const gls = (cid: string, pred: (s: GitLoginState) => boolean = () => true) => (f: ServerFrame) => f.t === "git_login_state" && f.clientId === cid && pred(f as Gls);
type Src = Extract<ServerFrame, { t: "sources" }>;

describe("D345 连上 GitHub from 待办来源, end to end", () => {
  test("no gh: the row is offered, one tap installs it, the code shows, approval makes GitHub a source with its count", async () => {
    const w = boot();
    const core = await w.start();
    const c = await client(core);
    c.send({ t: "sources" });
    const first = await c.until<Src>((f) => f.t === "sources" && !!(f as Src).found.github);
    expect(first.found.github?.state).toBe("no_tool");
    expect(first.sources).toHaveLength(0);

    c.send({ t: "git_login", action: "status", for: "todos", clientId: "s1" });
    expect(await c.until<Gls>(gls("s1"))).toMatchObject({ state: "no_gh", install: { how: "release", where: toolsBin(w.t.dir) } });

    c.send({ t: "git_login", action: "install", for: "todos", clientId: "i1" });
    const installing = await c.until<Gls>(gls("i1", (s) => s.state === "installing" && s.progress === 40));
    expect(installing.install).toEqual({ how: "release", where: toolsBin(w.t.dir) });
    const code = await c.until<Gls>(gls("i1", (s) => s.state === "code"));
    expect(code).toMatchObject({ code: "AB12-CD34", url: "https://github.com/login/device" });
    expect(c.frames.some((f) => gls("i1", (s) => s.state === "signed_in")(f))).toBe(false);

    w.gh.approve();
    expect(await c.until<Gls>(gls("i1", (s) => s.state === "signed_in"))).toMatchObject({ account: "lin-dev" });
    const after = await c.until<Src>((f) => f.t === "sources" && (f as Src).sources.some((s) => s.kind === "github" && s.open === 2));
    const s = after.sources.find((x) => x.kind === "github")!;
    expect(s).toMatchObject({ name: "lin-dev", state: "ok", whenNew: "tell", whenDone: "ask" });

    // Logged: the install (Done for you lists it), and nothing was started by itself.
    const inst = core.log.read({ kinds: ["tool_install"] as never, limit: 10 }).map((e) => (e.body as { phase: string }).phase);
    expect(inst).toEqual(["started", "done"]);
    expect(createDid({ log: core.log, tasks: core.tasks }).query({}).items.find((i) => i.sub === "install")).toMatchObject({ kind: "changed", to: "gh", via: "GitHub", who: { by: "you" } });
    expect(core.tasks.list()).toHaveLength(0);
  });

  test("already signed in: Connect adds it at once; New task's own sign-in never adds a source", async () => {
    const w = boot();
    mkdirSync(toolsBin(w.t.dir), { recursive: true });
    writeFileSync(join(toolsBin(w.t.dir), "gh"), "");
    const core = await w.start();
    const c = await client(core);
    c.send({ t: "sources" });
    w.gh.deviceFlow = "approve";
    c.send({ t: "git_login", action: "start", clientId: "n1" });
    await c.until(gls("n1", (s) => s.state === "signed_in"));
    await Bun.sleep(50);
    expect(core.taskSources.view().sources).toHaveLength(0);
    c.send({ t: "git_login", action: "start", for: "todos", clientId: "t1" });
    await c.until(gls("t1", (s) => s.state === "signed_in"));
    await c.until<Src>((f) => f.t === "sources" && (f as Src).sources.some((s) => s.kind === "github"));
  });

  test("failures say why and leave a next step: no network, an expired code, a refused token then a good one", async () => {
    const w = boot({ flow: "network" });
    mkdirSync(toolsBin(w.t.dir), { recursive: true });
    writeFileSync(join(toolsBin(w.t.dir), "gh"), "");
    const core = await w.start();
    const c = await client(core);
    c.send({ t: "git_login", action: "start", for: "todos", clientId: "a" });
    expect(await c.until<Gls>(gls("a", (s) => s.state === "failed"))).toMatchObject({ reason: "network" });
    w.gh.deviceFlow = "expired";
    c.send({ t: "git_login", action: "start", for: "todos", clientId: "b" });
    expect(await c.until<Gls>(gls("b", (s) => s.state === "failed"))).toMatchObject({ reason: "expired" });
    c.send({ t: "git_login", action: "token", token: "ghp_notenoughscopes000000", for: "todos", clientId: "c" });
    expect(await c.until<Gls>(gls("c", (s) => s.state === "failed"))).toMatchObject({ reason: "bad_token" });
    w.gh.goodTokens.push("github_pat_11AAAAAAA0goodtoken000000");
    c.send({ t: "git_login", action: "token", token: "github_pat_11AAAAAAA0goodtoken000000", for: "todos", clientId: "d" });
    expect(await c.until<Gls>(gls("d", (s) => s.state === "signed_in"))).toMatchObject({ account: "lin-dev" });
    expect(core.taskSources.view().sources.map((s) => s.kind)).toEqual(["github"]);
  });

  test("a system with no gh build: no install is offered, and asking for one says so plainly", async () => {
    const w = boot({ platform: "freebsd" });
    const core = await w.start();
    const c = await client(core);
    c.send({ t: "git_login", action: "status", for: "todos", clientId: "s" });
    const s = await c.until<Gls>(gls("s"));
    expect(s.state).toBe("no_gh");
    expect(s.install).toBeUndefined();
    c.send({ t: "git_login", action: "install", for: "todos", clientId: "i" });
    expect(await c.until<Gls>(gls("i", (x) => x.state === "failed"))).toMatchObject({ reason: "unsupported" });
    expect(core.log.read({ kinds: ["tool_install"] as never, limit: 10 })).toHaveLength(0);
  });

  test("a worker is never asked to install from here", async () => {
    const w = boot();
    const core = await w.start();
    const c = await client(core);
    c.send({ t: "git_login", action: "install", device: "wmac", clientId: "w" });
    expect(await c.until<Gls>(gls("w"))).toMatchObject({ state: "failed", reason: "unsupported" });
  });
});
