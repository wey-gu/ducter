// D668 (research/246 §3.3, §3.7): the sandbox, as a profile in text and as real denials.
//
// The profile tests are platform text: macOS's Seatbelt rules and bwrap's arguments can be read
// without running anything. The live tests on macOS run our own fixture reader and three probes
// (a read outside the declared list, a socket, a write outside the temp folder); they are skipped
// where the host refuses to apply a nested Seatbelt profile, never treated as a pass.
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { parseImport } from "../src/imports/format.ts";
import { createPluginRuntime } from "../src/imports/plugins.ts";
import { bwrapArgs, declaredRoot, expandDeclaredPath, resolveUse, runSandboxed, seatbeltProfile, type PluginRun } from "../src/imports/sandbox.ts";
import { importInto } from "../src/imports/service.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";

const fixture = join(import.meta.dir, "fixtures/plugin");
const onlineFixture = join(import.meta.dir, "fixtures/plugin-online");
const NOW = Date.parse("2026-12-01T10:00:00Z");

/** Can this shell apply a Seatbelt profile at all? A development sandbox may deny sandbox_apply. */
function liveSeatbelt(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    const r = Bun.spawnSync(["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", "/bin/echo", "ok"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const LIVE = liveSeatbelt();
/** A Mac whose own sandbox refuses `sandbox_apply`: the runner must refuse, never run unconfined. */
const REFUSED = process.platform === "darwin" && !LIVE && existsSync("/usr/bin/sandbox-exec");
if (!LIVE) {
  // A skip is not a pass: say why, so the Linux (or a normal Mac) run is the one that counts.
  console.warn("plugin sandbox live denials skipped: this host refused sandbox_apply (nested Seatbelt)");
}

const spec = (over: Partial<PluginRun> = {}): PluginRun => ({
  id: "fixture-reader",
  dir: "/Users/me/plugin",
  argv: ["/usr/bin/true"],
  reads: [],
  starts: [],
  tempDir: "/tmp/ducter-plugin-tmp",
  home: "/Users/me",
  ...over,
});

test("the Seatbelt profile denies by default, reads only the declaration, writes only temp and has no network", () => {
  const p = seatbeltProfile(
    spec({
      reads: ["~/Library/Notes/**/*.sqlite*", "/etc/hosts"],
      starts: ["/usr/bin/true"],
    }),
    { bunPath: "/opt/ducter/bun" },
  );
  expect(p).toContain("(deny default)");
  expect(p).toContain("(deny network*)");
  expect(p).toContain('(subpath "/Users/me/Library/Notes")');
  expect(p).toContain('(literal "/etc/hosts")');
  expect(p).toContain('(allow file-write* (subpath "/tmp/ducter-plugin-tmp"))');
  // Seatbelt matches real paths, so a symlinked program is named by where it lands (Linux CI: gnutrue).
  expect(p).toContain(`(allow process-exec (literal "${realpathSync("/usr/bin/true")}")`);
  expect(p).toContain('(literal "/opt/ducter/bun")');
  // The whole home is never granted: only the named glob's static root is.
  expect(p).not.toContain('(allow file-read* (subpath "/Users/me"))');
  // A declared file that is inside the home stays literal, not a directory.
  expect(p).not.toContain('(allow file-read* (subpath "/etc"))');
});

test("a declared online use gets outbound network and the command it starts, and nothing else", () => {
  const use = { command: "lody", path: "/opt/bin/lody", real: "/opt/bin/lody", installDir: "/opt/lib/lody", interpreter: "/bin/sh", interpreterDir: "/bin", online: true };
  const p = seatbeltProfile(spec({ reads: [], uses: [use], network: true }), { bunPath: "/opt/ducter/bun" });
  expect(p).toContain("(allow network-outbound)");
  expect(p).not.toContain("(deny network*)");
  // DNS and the system's TLS roots come with going online.
  expect(p).toContain("com.apple.dnssd.service");
  expect(p).toContain('(subpath "/etc/ssl")');
  // The command, its real path and its interpreter may exec; its package folder is readable.
  expect(p).toContain('(allow process-exec ');
  expect(p).toContain('(literal "/opt/bin/lody")');
  expect(p).toContain(`(literal "${realpathSync("/bin/sh")}")`);
  expect(p).toContain('(allow file-read* (subpath "/opt/lib/lody"))');
  // The online flag is not a grant to the whole home.
  expect(p).not.toContain('(allow file-read* (subpath "/Users/me"))');
  // An offline run keeps the denial even when it starts a command.
  const off = seatbeltProfile(spec({ uses: [{ ...use, online: false }] }), { bunPath: "/opt/ducter/bun" });
  expect(off).toContain("(deny network*)");
  expect(off).not.toContain("(allow network-outbound)");
});

test("bwrap gets a read-only bind per declaration, a tmpfs /tmp, no network and no capabilities", () => {
  const tb = tempDir();
  const install = join(tb.dir, "pkg");
  mkdirSync(install, { recursive: true });
  const args = bwrapArgs(
    spec({
      dir: fixture,
      argv: ["/opt/ducter/bun", "main.ts"],
      reads: ["/etc/hosts"],
      starts: [],
      tempDir: "/tmp/ducter-plugin-tmp",
    }),
    { path: "/usr/bin:/bin" },
  );
  expect(args.slice(0, 3)).toEqual(["--unshare-net", "--die-with-parent", "--new-session"]);
  expect(args).toContain("--tmpfs");
  expect(args).toContain("--cap-drop");
  expect(args).toContain(fixture);
  expect(args).toContain("/etc/hosts");
  expect(args).toContain("--clearenv");
  // The argv is last, after `--`; nothing after it is a sandbox flag.
  const dd = args.indexOf("--");
  expect(dd).toBeGreaterThan(0);
  expect(args.slice(dd + 1)).toEqual(["/opt/ducter/bun", "main.ts"]);
  // No writable bind of the plugin folder or the home.
  expect(args.some((a, i) => a === "--bind" && args[i + 1] === fixture)).toBe(false);

  // An online use is the only reason to keep the network: no --unshare-net, and the command's
  // own folder is bound read-only so it can load.
  const use = { command: "lody", path: "/opt/bin/lody", real: "/opt/bin/lody", installDir: install, online: true };
  const online = bwrapArgs(spec({ dir: fixture, argv: ["/opt/ducter/bun", "main.ts"], uses: [use], network: true }), { path: "/usr/bin:/bin" });
  expect(online).not.toContain("--unshare-net");
  expect(online).toContain(install);
  if (existsSync("/etc/resolv.conf")) expect(online).toContain("/etc/resolv.conf");
  expect(online.indexOf("--")).toBeGreaterThan(0);
  tb.cleanup();
});

test("a use resolves to the program and its shebang interpreter", () => {
  const t = tempDir();
  const bin = join(t.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const lody = join(bin, "lody");
  writeFileSync(lody, "#!/bin/sh\necho '{\"ok\":true}\n'\n");
  chmodSync(lody, 0o755);
  const r = resolveUse("lody", { dir: t.dir, path: `${bin}:${process.env.PATH ?? ""}` })!;
  expect(r.path).toBe(lody);
  expect(r.real).toBe(realpathSync(lody));
  // The shebang's /bin/sh, as its real program (dash on Linux CI).
  expect(r.interpreter === "/bin/sh" || r.interpreter === realpathSync("/bin/sh")).toBe(true);
  expect(r.online).toBe(false);
  expect(resolveUse("no-such-command-here", { dir: t.dir, path: bin })).toBeUndefined();
  t.cleanup();
});

test("a declaration expands literally; .. is refused and a glob grants its static root", () => {
  expect(expandDeclaredPath("~/Library/Notes/x.sqlite", { dir: "/x", home: "/Users/me" })).toBe("/Users/me/Library/Notes/x.sqlite");
  expect(expandDeclaredPath("./threads.json", { dir: "/x/plugin", home: "/Users/me" })).toBe("/x/plugin/threads.json");
  expect(() => expandDeclaredPath("~/x/../secret", { dir: "/x", home: "/Users/me" })).toThrow();
  expect(declaredRoot("/Users/me/Library/Notes/**/*.sqlite*")).toEqual({ path: "/Users/me/Library/Notes", glob: true });
  expect(declaredRoot("/Users/me/Library/Notes/one.sqlite")).toEqual({ path: "/Users/me/Library/Notes/one.sqlite", glob: false });
});

function probe(dir: string, mode: "read" | "write" | "socket"): string {
  const script = join(dir, "probe.ts");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
const mode = process.env.PROBE_MODE;
try {
  if (mode === "read") { readFileSync(process.env.PROBE_PATH!, "utf8"); console.log("READ_OK"); }
  else if (mode === "write") { writeFileSync(process.env.PROBE_PATH!, "x"); console.log("WRITE_OK"); }
  else {
    await new Promise<void>((done) => {
      let said = false;
      const say = (w: string) => { if (said) return; said = true; console.log(w); done(); };
      const s = connect(Number(process.env.PROBE_PORT), "127.0.0.1");
      s.on("connect", () => { say("SOCKET_OK"); s.destroy(); });
      s.on("error", () => say("SOCKET_DENIED"));
      setTimeout(() => { say("SOCKET_DENIED"); s.destroy(); }, 800);
    });
  }
} catch { console.log(mode.toUpperCase() + "_DENIED"); }
`,
  );
  writeFileSync(join(dir, "decoy.txt"), "this one is declared");
  return script;
}

test.skipIf(!REFUSED)("when the host refuses sandbox_apply, the reader is refused, never run unconfined", async () => {
  const t = tempDir();
  const tmp = join(t.dir, "tmp-refused");
  mkdirSync(tmp, { recursive: true });
  const r = await runSandboxed(spec({ dir: fixture, argv: [process.execPath, "main.ts"], reads: ["./threads.json"], tempDir: tmp }));
  expect(r.error).toBe("sandbox_unavailable");
  expect(r.stdout).toBe("");
  t.cleanup();
});

test.skipIf(!LIVE)("a real fixture reader runs under Seatbelt and its stream imports", async () => {
  const t = tempDir();
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, curated: [] });
  const a = await rt.install(fixture);
  expect(a.ok).toBe(true);
  rt.consent("fixture-reader", ["./threads.json"]);
  const r = await rt.run("fixture-reader");
  expect(r.error).toBeUndefined();
  const p = parseImport(r.stream, { now: () => NOW });
  expect([p.ok, p.counts.threads, p.counts.messages]).toEqual([true, 2, 4]);

  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  try {
    const into = await importInto({ log, tasks, persona: "default", now: () => NOW, stamp: { app: "Fixture Notes", account: "fixture-reader", reader: "fixture-reader", readerVersion: "0.1.0" } }, r.stream);
    expect([into.ok, into.threads, into.messages]).toEqual([true, 2, 4]);
  } finally {
    log.close();
    t.cleanup();
  }
});

test.skipIf(!LIVE)("a declared online reader opens a loopback socket and starts its command under Seatbelt", async () => {
  const t = tempDir();
  const bin = join(t.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const lody = join(bin, "lody");
  writeFileSync(lody, "#!/bin/sh\nprintf '{\"ok\":true,\"workspaces\":[]}\\n'\n");
  chmodSync(lody, 0o755);
  const server = createServer(() => undefined);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const port = (server.address() as { port: number }).port;
  const rt = createPluginRuntime({
    dataDir: t.dir,
    now: () => NOW,
    curated: [],
    path: `${bin}:${process.env.PATH ?? ""}`,
    env: { PROBE_PORT: String(port), PROBE_LODY: "1" },
  });
  try {
    expect((await rt.install(onlineFixture)).ok).toBe(true);
    rt.consent("fixture-online", ["./threads.json"], true);
    const r = await rt.run("fixture-online");
    expect(r.error).toBeUndefined();
    expect(r.stderr).toContain("SOCKET_OK");
    expect(r.stderr).toContain("LODY_OK");
    const p = parseImport(r.stream, { now: () => NOW });
    expect([p.ok, p.counts.threads, p.counts.messages]).toEqual([true, 2, 4]);
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
    t.cleanup();
  }
});

test.skipIf(!LIVE)("Seatbelt denies a read outside the declared list, a socket and a write outside temp", async () => {
  const t = tempDir();
  const plugin = join(t.dir, "plugin");
  mkdirSync(plugin, { recursive: true });
  const outside = join(t.dir, "outside.txt");
  writeFileSync(outside, "not yours to read");

  // Read: only decoy.txt is declared; outside.txt is not.
  {
    const script = probe(plugin, "read");
    const tmp = join(t.dir, "tmp-read");
    mkdirSync(tmp, { recursive: true });
    const r = await runSandboxed(
      spec({ dir: plugin, argv: [process.execPath, script], reads: ["./decoy.txt"], tempDir: tmp, env: { PROBE_MODE: "read", PROBE_PATH: outside } }),
      { bunPath: process.execPath },
    );
    expect(r.stdout.trim()).toBe("READ_DENIED");
  }
  // Write: only temp is writable; outside.txt is not.
  {
    const script = probe(plugin, "write");
    const tmp = join(t.dir, "tmp-write");
    mkdirSync(tmp, { recursive: true });
    const r = await runSandboxed(spec({ dir: plugin, argv: [process.execPath, script], reads: ["./decoy.txt"], tempDir: tmp, env: { PROBE_MODE: "write", PROBE_PATH: outside } }), { bunPath: process.execPath });
    expect(r.stdout.trim()).toBe("WRITE_DENIED");
    expect(readFileSync(outside, "utf8")).toBe("not yours to read");
  }
  // Socket: a listener on loopback is still unreachable.
  {
    const server = createServer(() => undefined);
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
    const port = (server.address() as { port: number }).port;
    const script = probe(plugin, "socket");
    const tmp = join(t.dir, "tmp-socket");
    mkdirSync(tmp, { recursive: true });
    const r = await runSandboxed(spec({ dir: plugin, argv: [process.execPath, script], reads: ["./decoy.txt"], tempDir: tmp, env: { PROBE_MODE: "socket", PROBE_PORT: String(port) } }), { bunPath: process.execPath });
    await new Promise<void>((res) => server.close(() => res()));
    expect(r.stdout.trim()).toBe("SOCKET_DENIED");
  }
  t.cleanup();
});
