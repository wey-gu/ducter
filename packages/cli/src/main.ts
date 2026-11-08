#!/usr/bin/env bun
// `ducter`: the one command a person runs. up · open · doctor · status · version.
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { parseArgs, type Args } from "./args.ts";
import { launchDesktop, planDesktop, sourceRepoRoot, type Launched } from "./desktop.ts";
import { ansiStyle, formatReport, realHost, runDoctor, width, type Host, type Style } from "./doctor.ts";
import { detectLocale, translator, type T } from "./i18n.ts";
import { fetchSnapshot, formatSnapshot } from "./status.ts";
import { cmdDevices, cmdPair, cmdService, isLoopback, publicUrl } from "./remote.ts";
import { cmdWorker } from "./worker.ts";
import { scriptedRunnerModule } from "./scripted.ts";
import { hostname } from "node:os";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";

declare const DUCTER_COMMIT: string | undefined; // set by build.sh via --define

export const DOCTOR_MARKER = ".doctor-passed";

export function versionLine(compiled: boolean): string {
  const commit = typeof DUCTER_COMMIT === "string" ? DUCTER_COMMIT : "dev";
  return `ducter ${pkg.version} (${commit}, bun ${Bun.version}${compiled ? ", single binary" : ""}, ${process.platform}-${process.arch})`;
}

export function helpText(t: T): string {
  const cmd = (name: string, desc: string) => `  ${name.padEnd(10)}${desc}`;
  const opt = (name: string, desc: string) => `  ${name.padEnd(18)}${desc}`;
  return [
    t("help.usage"),
    "",
    t("help.commands"),
    cmd("up", t("help.up")),
    cmd("open", t("help.open")),
    cmd("doctor", t("help.doctor")),
    cmd("status", t("help.status")),
    cmd("version", t("help.version")),
    cmd("pair", t("help.pair")),
    cmd("devices", t("help.devices")),
    cmd("service", t("help.service")),
    cmd("worker", t("help.worker")),
    "",
    t("help.options"),
    opt("--port <n>", t("help.port")),
    opt("--data-dir <dir>", t("help.dataDir")),
    opt("--no-desktop", t("help.noDesktop")),
    opt("--headless", t("help.headless")),
    opt("--host <addr>", t("help.host")),
    opt("--json", t("help.json")),
  ].join("\n");
}

/** Bun's os.userInfo() reads $SHELL/$USER; under launchd or a stripped env they may be unset (research/18). */
function fixEnv() {
  if (!process.env.SHELL?.startsWith("/")) process.env.SHELL = process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
  if (!process.env.USER) {
    const r = Bun.spawnSync(["/usr/bin/id", "-un"], { stdout: "pipe", stderr: "ignore" });
    const u = r.stdout.toString().trim();
    if (u) process.env.USER = process.env.LOGNAME = u;
  }
}

const tilde = (p: string) => (p.startsWith(homedir()) ? "~" + p.slice(homedir().length) : p);

function box(title: string, rows: [string, string][], style: Style): string {
  const w = Math.max(...rows.map(([k]) => width(k))) + 3;
  return [`  ${style.ok("●")} ${style.bold(title)}`, ...rows.map(([k, v]) => `    ${k}${" ".repeat(w - width(k))}${v}`)].join("\n");
}

interface Ctx {
  args: Args;
  t: T;
  style: Style;
  host: Host;
  port: number;
  dataDir: string;
}

async function cmdDoctor(ctx: Ctx): Promise<number> {
  const report = await runDoctor(ctx.host, ctx.t, { port: ctx.port, dataDir: ctx.dataDir });
  if (ctx.args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report, ctx.t, ctx.style));
  if (report.ok) writeFileSync(join(ctx.dataDir, DOCTOR_MARKER), new Date().toISOString());
  return report.ok ? 0 : 1;
}

async function cmdStatus(ctx: Ctx): Promise<number> {
  const snap = await fetchSnapshot(ctx.port);
  if (!snap) {
    console.log(ctx.t("status.notRunning", { port: ctx.port }));
    return 1;
  }
  console.log(ctx.args.json ? JSON.stringify(snap, null, 2) : formatSnapshot(snap, ctx.t, ctx.style));
  return 0;
}

function desktopPlan(ctx: Ctx) {
  return planDesktop({
    env: process.env,
    execPath: process.execPath,
    compiled: ctx.host.compiled,
    repoRoot: sourceRepoRoot(ctx.host.compiled),
    exists: existsSync,
    which: (c) => Bun.which(c),
  });
}

async function cmdOpen(ctx: Ctx): Promise<number> {
  if ((await ctx.host.port(ctx.port)) !== "ducter") {
    console.log(ctx.t("open.notRunning"));
    return 1;
  }
  const plan = desktopPlan(ctx);
  if (plan.kind === "none") {
    console.log(ctx.t("open.none"));
    return 1;
  }
  const r = await launchDesktop(plan, { port: ctx.port, dataDir: ctx.dataDir, onBuild: () => console.log(ctx.t("up.desktop.building")) });
  if (!r || "error" in r) {
    console.log(ctx.t("up.desktop.failed", { reason: r ? r.error : "?" }));
    return 1;
  }
  r.proc.unref();
  return 0;
}

async function cmdUp(ctx: Ctx): Promise<number | "running"> {
  const { t, style } = ctx;
  const state = await ctx.host.port(ctx.port);
  if (state === "ducter") {
    const snap = await fetchSnapshot(ctx.port);
    console.log(t("up.already", { name: snap?.personaName ?? "Ducter", url: `ws://127.0.0.1:${ctx.port}/ws` }));
    if (ctx.args.desktop) await cmdOpen(ctx);
    return 0;
  }
  // Doctor runs on the first `up`, and again whenever something looks off (port taken).
  if (!existsSync(join(ctx.dataDir, DOCTOR_MARKER)) || state === "busy") {
    if (state !== "busy") console.log(t("up.firstRun") + "\n");
    const report = await runDoctor(ctx.host, t, { port: ctx.port, dataDir: ctx.dataDir });
    console.log(formatReport(report, t, style, { closing: false }) + "\n");
    // A server keeps running with nothing signed in: the user pairs a device and signs in later.
    if (!report.ok && ctx.args.headless && state !== "busy") console.log(t("headless.notReady") + "\n");
    else if (!report.ok) {
      console.log(t("up.blocked"));
      return 1;
    } else writeFileSync(join(ctx.dataDir, DOCTOR_MARKER), new Date().toISOString());
  }

  console.log(style.dim(t("up.starting", { name: process.env.DUCTER_PERSONA_NAME || "Ducter" })));
  // String-literal imports so `bun build --compile` bundles them; core's own path-based loader
  // can't be bundled. A module that fails to load falls back to core's stub.
  const [runnerMod, partnerMod, coreMain] = await Promise.all([
    import("@ducter/runner").catch(() => undefined),
    import("@ducter/partner").catch(() => undefined),
    import("@ducter/core/src/main.ts"),
  ]);
  // Demo / e2e mode: canned model words over the real tools (scripted.ts). Says so in every reply.
  const runner = runnerMod && process.env.DUCTER_SCRIPTED_MODEL === "1" ? scriptedRunnerModule(runnerMod) : runnerMod;
  const booted = await coreMain.main({ runner, partner: partnerMod });
  const { core } = booted;

  let desktop: Launched | undefined;
  let desktopLine: string;
  const plan = ctx.args.desktop ? desktopPlan(ctx) : ({ kind: "none" } as const);
  if (!ctx.args.desktop) desktopLine = "--no-desktop";
  else if (plan.kind === "none") desktopLine = t("up.desktop.none", { url: core.url });
  else {
    const r = await launchDesktop(plan, { port: core.port, dataDir: core.dataDir, onBuild: () => console.log(style.dim(t("up.desktop.building"))) });
    if (r && !("error" in r)) {
      desktop = r;
      desktopLine = t("up.desktop.open");
    } else desktopLine = t("up.desktop.failed", { reason: r && "error" in r ? r.error : "?" });
  }

  const name = core.persona.name;
  if (ctx.args.headless) {
    printHeadless(ctx, name, core.port);
    return "running";
  }
  console.log(
    "\n" +
      box(t("up.ready", { name }), [
        [t("up.address"), core.url],
        [t("up.data"), tilde(core.dataDir)],
        [t("up.memory"), booted.identitySource === "nowledge-mem" ? t("up.memory.mem") : t("up.memory.default")],
        [t("up.desktop"), desktopLine],
      ], style) +
      "\n\n  " +
      t(desktop ? "up.hint" : "up.hintNoDesktop") +
      "\n",
  );

  let stopping = false;
  const stopDesktop = () => {
    stopping = true;
    try {
      desktop?.proc.kill();
    } catch {}
  };
  process.on("SIGINT", () => {
    if (!stopping) console.log("\n" + style.dim(t("up.stopping", { name })));
    stopDesktop();
  });
  process.on("SIGTERM", stopDesktop);
  process.on("exit", stopDesktop);
  void desktop?.exited.then(() => {
    if (!stopping) console.log(style.dim(t("up.desktop.closed", { name })));
  });
  return "running"; // core's own signal handlers stop the process
}

function printHeadless(ctx: Ctx, name: string, port: number) {
  const { t, style } = ctx;
  const bind = process.env.DUCTER_HOST || "127.0.0.1";
  const auth = openDeviceAuth(ctx.dataDir);
  const n = auth.list().length;
  auth.close();
  const rows: [string, string][] = [
    [t("headless.listen"), `${bind}:${port}`],
    [t("up.data"), tilde(ctx.dataDir)],
    [t("check.devices"), n ? t("check.devices.ok", { n }) : t("check.devices.none")],
  ];
  const pub = publicUrl(ctx.dataDir);
  if (pub) rows.splice(1, 0, [t("pair.address"), pub]);
  console.log("\n" + box(t("headless.ready", { name, device: hostname() }), rows, style) + "\n");
  if (!isLoopback(bind)) console.log("  " + t("headless.public", { host: `${bind}:${port}` }));
  console.log("  " + t("headless.next") + "\n");
}

export async function run(argv: string[]): Promise<number | "running"> {
  const t = translator(detectLocale());
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(t(parsed.error.key, parsed.error.vars) + "\n\n" + helpText(t));
    return 2;
  }
  const { args } = parsed;
  if (args.command === "help") return console.log(helpText(t)), 0;
  const host = realHost();
  if (args.command === "version") return console.log(versionLine(host.compiled)), 0;

  // Flags win over env; core reads the env, so set it once here.
  if (args.port) process.env.DUCTER_PORT = String(args.port);
  if (args.dataDir) process.env.DUCTER_DATA_DIR = args.dataDir;
  if (args.host) process.env.DUCTER_HOST = args.host;
  const port = Number(process.env.DUCTER_PORT || 7777);
  const dataDir = process.env.DUCTER_DATA_DIR || join(homedir(), ".ducter");
  fixEnv();
  const style = ansiStyle(Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !args.json);
  const ctx: Ctx = { args, t, style, host, port, dataDir };
  host.writable(dataDir); // creates it; doctor reports if it can't
  host.pairedDevices = () => {
    try {
      const auth = openDeviceAuth(dataDir);
      const n = auth.list().length;
      auth.close();
      return n;
    } catch {
      return 0;
    }
  };

  switch (args.command) {
    case "doctor":
      return cmdDoctor(ctx);
    case "status":
      return cmdStatus(ctx);
    case "open":
      return cmdOpen(ctx);
    case "up":
      return cmdUp(ctx);
    case "pair":
      return cmdPair({ t, style, dataDir, port, json: args.json, running: (await host.port(port)) === "ducter", wait: Boolean(process.stdout.isTTY) && !args.json });
    case "devices":
      return cmdDevices({ t, style, dataDir, json: args.json, rest: args.rest ?? [] });
    case "service":
      return cmdService({
        t,
        style,
        host,
        dataDir,
        port,
        bindHost: args.host,
        rest: args.rest ?? [],
        onInstalled: async () => {
          const auth = openDeviceAuth(dataDir);
          const none = auth.list().length === 0;
          auth.close();
          if (none) await cmdPair({ t, style, dataDir, port, json: false, running: true, wait: Boolean(process.stdout.isTTY) });
        },
      });
    case "worker":
      return cmdWorker({ t, style, args, dataDir });
  }
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  if (code !== "running") process.exit(code);
}
