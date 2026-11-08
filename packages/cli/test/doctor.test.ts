// Doctor against a fake machine: no real CLIs, logins, or network.
import { describe, expect, test } from "bun:test";
import { formatReport, runDoctor, versionAtLeast, width, type Host, type RunResult } from "../src/doctor.ts";
import { STRINGS, detectLocale, translator } from "../src/i18n.ts";

const en = translator("en");
const zh = translator("zh");
const opts = { port: 7783, dataDir: "/tmp/ducter-test" };

interface Machine {
  tools?: string[];
  out?: Record<string, RunResult>;
  port?: "free" | "ducter" | "busy";
  writable?: boolean;
  compiled?: boolean;
  bunVersion?: string;
}

const ALL = ["git", "claude", "codex", "nmem", "cua-driver"];
const HAPPY: Record<string, RunResult> = {
  "git --version": { code: 0, stdout: "git version 2.50.1 (Apple Git-155)\n" },
  "claude --version": { code: 0, stdout: "2.1.319 (Claude Code)\n" },
  "claude auth status": { code: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }) },
  "codex login status": { code: 0, stdout: "Logged in using ChatGPT\n" },
  "nmem --json status": { code: 0, stdout: JSON.stringify({ status: "healthy", mode: "local" }) },
  "cua-driver --version": { code: 0, stdout: "cua-driver 0.6.8\n" },
};

function fake(m: Machine = {}): Host & { calls: string[] } {
  const tools = new Set(m.tools ?? ALL);
  const out = { ...HAPPY, ...m.out };
  const calls: string[] = [];
  return {
    calls,
    which: (c) => (tools.has(c) ? `/usr/local/bin/${c}` : null),
    async run(cmd) {
      const k = cmd.join(" ");
      calls.push(k);
      if (!tools.has(cmd[0]!)) throw new Error(`forbidden: ${k} is not installed`);
      return out[k] ?? { code: 1, stdout: "" };
    },
    port: async () => m.port ?? "free",
    writable: () => m.writable ?? true,
    compiled: m.compiled ?? false,
    bunVersion: m.bunVersion ?? "1.3.1",
  };
}

const byId = (r: Awaited<ReturnType<typeof runDoctor>>, id: string) => r.checks.find((c) => c.id === id)!;

describe("doctor", () => {
  test("a fully set-up Mac passes with no fixes", async () => {
    const r = await runDoctor(fake(), en, opts);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["bun", "ok"], ["git", "ok"], ["claude", "ok"], ["codex", "ok"], ["nmem", "ok"], ["cua", "ok"], ["port", "ok"], ["data", "ok"],
    ]);
    expect(r.checks.every((c) => c.fix === undefined)).toBe(true);
    expect(byId(r, "claude").detail).toBe("signed in (2.1.319)");
    expect(byId(r, "git").detail).toBe("2.50.1");
    expect(byId(r, "nmem").detail).toBe("connected (local)");
  });

  test("a fresh Mac: nothing installed, every missing item has one fix", async () => {
    const h = fake({ tools: [] });
    const r = await runDoctor(h, en, opts);
    expect(r.ok).toBe(false);
    expect(r.harnessReady).toBe(false);
    expect(h.calls).toEqual([]); // nothing missing gets executed
    expect(byId(r, "git")).toMatchObject({ status: "missing", required: true, fix: "xcode-select --install" });
    expect(byId(r, "claude")).toMatchObject({ status: "missing", required: true, fix: "curl -fsSL https://claude.ai/install.sh | bash" });
    expect(byId(r, "codex")).toMatchObject({ status: "missing", required: false, fix: "brew install codex" });
    expect(byId(r, "nmem")).toMatchObject({ status: "missing", required: false });
    expect(byId(r, "cua")).toMatchObject({ status: "missing", required: false });
    for (const c of r.checks) if (c.status !== "ok") expect(c.fix).toBeTruthy();
  });

  test("Claude Code installed but logged out", async () => {
    const r = await runDoctor(fake({ tools: ["git", "claude"], out: { "claude auth status": { code: 1, stdout: JSON.stringify({ loggedIn: false }) } } }), en, opts);
    expect(byId(r, "claude")).toMatchObject({ status: "missing", required: true, detail: "installed, not signed in", fix: "claude auth login" });
    expect(r.ok).toBe(false);
  });

  test("Codex alone is enough; Claude Code becomes optional", async () => {
    const r = await runDoctor(fake({ tools: ["git", "codex"] }), en, opts);
    expect(r.ok).toBe(true);
    expect(r.harnessReady).toBe(true);
    expect(byId(r, "claude")).toMatchObject({ status: "missing", required: false });
  });

  test("Codex says 'Not logged in'", async () => {
    const r = await runDoctor(fake({ out: { "codex login status": { code: 1, stdout: "Not logged in\n" } } }), en, opts);
    expect(byId(r, "codex")).toMatchObject({ status: "missing", detail: "installed, not signed in", fix: "codex login" });
    expect(r.ok).toBe(true);
  });

  test("Mem installed but unreachable is a warning, not a blocker", async () => {
    const r = await runDoctor(fake({ out: { "nmem --json status": { code: 1, stdout: "connection refused" } } }), en, opts);
    expect(byId(r, "nmem")).toMatchObject({ status: "warn", required: false, fix: "nmem status" });
    expect(r.ok).toBe(true);
  });

  test("DUCTER_MEMORY=off says off, never 'connected', and doesn't ask nmem; modes are translated", async () => {
    const host = fake();
    const r = await runDoctor(host, zh, { ...opts, memoryOff: true });
    expect(byId(r, "nmem").detail).toBe("关着（DUCTER_MEMORY=off）：不读身份，不回想，不记");
    expect(host.calls.some((c) => c.startsWith("nmem"))).toBe(false);
    const remote = await runDoctor(fake({ out: { "nmem --json status": { code: 0, stdout: JSON.stringify({ status: "healthy", mode: "remote" }) } } }), zh, { ...opts, memoryOff: false });
    expect(byId(remote, "nmem").detail).toBe("已连接（远程）");
  });

  test("port: taken by another program blocks; taken by Ducter does not", async () => {
    const busy = await runDoctor(fake({ port: "busy" }), en, opts);
    expect(byId(busy, "port")).toMatchObject({ status: "missing", required: true, fix: "DUCTER_PORT=7784 ducter up" });
    expect(busy.ok).toBe(false);
    const ours = await runDoctor(fake({ port: "ducter" }), en, opts);
    expect(byId(ours, "port")).toMatchObject({ status: "warn", detail: "Ducter is already running here" });
    expect(ours.ok).toBe(true);
  });

  test("unwritable data dir blocks", async () => {
    const r = await runDoctor(fake({ writable: false }), en, opts);
    expect(byId(r, "data")).toMatchObject({ status: "missing", required: true });
    expect(byId(r, "data").fix).toContain("/tmp/ducter-test");
  });

  test("bun: built into the binary, or too old from source", async () => {
    expect(byId(await runDoctor(fake({ compiled: true, bunVersion: "1.4.4" }), en, opts), "bun").detail).toBe("built in (bun 1.4.4)");
    const old = await runDoctor(fake({ bunVersion: "1.2.9" }), en, opts);
    expect(byId(old, "bun")).toMatchObject({ status: "missing", required: true });
  });

  test("zh output uses the zh strings and lines up CJK labels", async () => {
    const r = await runDoctor(fake({ tools: ["git", "codex"] }), zh, opts);
    const text = formatReport(r, zh);
    expect(text).toContain("检查这台 Mac");
    expect(text).toContain("修复：");
    expect(text).toContain("一切就绪");
    const rows = text.split("\n").filter((l) => /^  [✓✗·] /.test(l));
    expect(rows.length).toBe(8);
    // Every detail starts at the same display column, even after 2-column CJK labels.
    const cols = rows.map((l, i) => width(l.slice(0, l.indexOf(r.checks[i]!.detail))));
    expect(new Set(cols).size).toBe(1);
  });

  test("the report names what to fix, then how many", async () => {
    const text = formatReport(await runDoctor(fake({ tools: ["git"] }), en, opts), en);
    expect(text).toContain("fix: curl -fsSL https://claude.ai/install.sh | bash");
    expect(text).toContain("Ducter needs at least one AI");
    expect(text).toContain("One thing to fix");
  });
});

describe("helpers", () => {
  test("versionAtLeast", () => {
    expect(versionAtLeast("1.4.4", "1.3.0")).toBe(true);
    expect(versionAtLeast("1.3.0", "1.3.0")).toBe(true);
    expect(versionAtLeast("1.2.21", "1.3.0")).toBe(false);
    expect(versionAtLeast("1.10.0", "1.9.0")).toBe(true);
    expect(versionAtLeast("1.4.4-canary.1", "1.4.4")).toBe(true);
  });

  test("width counts CJK as two columns", () => {
    expect(width("git")).toBe(3);
    expect(width("端口 7783")).toBe(9);
  });
});

describe("i18n", () => {
  test("zh and en have the same keys and placeholders", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    expect(Object.keys(STRINGS.zh).sort()).toEqual(Object.keys(STRINGS.en).sort());
    for (const k of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) expect([k, ph(STRINGS.zh[k])]).toEqual([k, ph(STRINGS.en[k])]);
  });

  test("detectLocale", () => {
    expect(detectLocale({})).toBe("en");
    expect(detectLocale({ LANG: "zh_CN.UTF-8" })).toBe("zh");
    expect(detectLocale({ LANG: "zh_CN.UTF-8", LC_ALL: "en_US.UTF-8" })).toBe("en");
    expect(detectLocale({ LANG: "en_US.UTF-8", DUCTER_LOCALE: "zh" })).toBe("zh");
    expect(detectLocale({ LC_ALL: "C", LANG: "zh_TW.UTF-8" })).toBe("zh");
  });

  test("interpolation leaves unknown placeholders visible", () => {
    expect(en("check.port", { port: 7783 })).toBe("Port 7783");
    expect(en("check.port")).toBe("Port {port}");
  });
});

describe("doctor on a Linux server", () => {
  const server = (m: Machine & { devices?: number } = {}, extra: Record<string, RunResult> = {}) => {
    const h = fake({ ...m, tools: [...(m.tools ?? ALL), "systemctl", "loginctl"], out: { ...m.out, ...extra } });
    return Object.assign(h, { platform: "linux", pairedDevices: () => m.devices ?? 0 });
  };
  const user = process.env.USER || "$USER";
  const svc = (active: string, linger: string) => ({
    "systemctl --user is-active ducter.service": { code: active === "active" ? 0 : 3, stdout: active + "\n" },
    [`loginctl show-user ${user} -p Linger`]: { code: 0, stdout: `Linger=${linger}\n` },
  });

  test("logged-out harnesses get the headless commands; service and devices rows appear", async () => {
    const r = await runDoctor(
      server(
        { out: { "claude auth status": { code: 1, stdout: JSON.stringify({ loggedIn: false, authMethod: "none" }) }, "codex login status": { code: 1, stdout: "Not logged in\n" } } },
        svc("inactive", "no"),
      ),
      en,
      opts,
    );
    expect(byId(r, "claude").fix).toBe("claude auth login");
    expect(byId(r, "claude").detail).toContain("paste the code back");
    expect(byId(r, "codex").fix).toBe("codex login --device-auth");
    expect(byId(r, "service")).toMatchObject({ status: "missing", required: false, fix: "ducter service install" });
    expect(byId(r, "devices")).toMatchObject({ status: "missing", fix: "ducter pair" });
    expect(formatReport(r, en)).toContain("Checking this server for Ducter");
  });

  test("a set-up server: service on with linger, one device, token login counts", async () => {
    const r = await runDoctor(
      server({ devices: 1, out: { "claude auth status": { code: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token" }) } } }, svc("active", "yes")),
      en,
      opts,
    );
    expect(r.ok).toBe(true);
    expect(byId(r, "claude").detail).toContain("long-lived sign-in");
    expect(byId(r, "service").status).toBe("ok");
    expect(byId(r, "devices").detail).toBe("1 connected");
  });

  test("service on without linger is a warning with the sudo line", async () => {
    const r = await runDoctor(server({}, svc("active", "no")), en, opts);
    expect(byId(r, "service")).toMatchObject({ status: "warn", fix: `sudo loginctl enable-linger ${user}` });
  });

  test("a Mac shows no server rows", async () => {
    const r = await runDoctor(fake(), en, opts);
    expect(r.checks.some((c) => c.id === "service" || c.id === "devices")).toBe(false);
  });
});
