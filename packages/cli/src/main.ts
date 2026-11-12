#!/usr/bin/env bun
// `ducter`: the one command a person runs. up · open · doctor · status · version.
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { parseArgs, type Args } from "./args.ts";
import { launchDesktop, planDesktop, sourceRepoRoot, type Launched } from "./desktop.ts";
import { ansiStyle, formatBlocked, formatReport, formatSummary, realHost, runDoctor, width, type DoctorReport, type Host, type Style } from "./doctor.ts";
import { cleanName, readPersonaFile, removeOldHints, writePersonaFile } from "./firstrun.ts";
import { commandsFor, commandWith, detectLocale, translator, type T } from "./i18n.ts";
import { cmdAnswer, cmdOpenTask, cmdSay, cmdTail, cmdTask, notReached, type TalkCtx } from "./talk.ts";
import { commandClass, homeJson, resolveTarget, type Target } from "./home.ts";
import { cliChecks, cmdConnect, cmdDevicesAt, cmdDisconnect, cmdPairAt, targetLine } from "./homecmds.ts";
import { realpathSync } from "node:fs";
import { fetchSnapshot, formatSnapshot, pickTask, taskAction, toMerge } from "./status.ts";
import { cmdAbility, cmdBrowser } from "./browser-cmd.ts";
import { cmdDevices, cmdPair, cmdService, ducterCommand, fetchPublicIp, isLoopback, publicUrl } from "./remote.ts";
import { cmdAnywhere } from "./anywhere-cmd.ts";
import { caddyfileFor, cmdDomain, realDomainSys, removeDucterSite } from "./domain.ts";
import { cmdWorker } from "./worker.ts";
import { cmdUpdate } from "./update.ts";
import { agentLabel, executeUninstall, formatPlan, planUninstall } from "./uninstall.ts";
import { osText, versionsText, writeReport } from "./report.ts";
import { parentPid, watchParent } from "./parent.ts";
import { scriptedRunnerModule } from "./scripted.ts";
import { hostname } from "node:os";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { probeHarnesses } from "@ducter/core/src/harness-probe.ts";
import { harnessName } from "@ducter/protocol";

declare const DUCTER_COMMIT: string | undefined; // set by build.sh via --define

export const DOCTOR_MARKER = ".doctor-passed";

export function versionLine(compiled: boolean): string {
  const commit = typeof DUCTER_COMMIT === "string" ? DUCTER_COMMIT : "dev";
  return `ducter ${pkg.version} (${commit}, bun ${Bun.version}${compiled ? ", single binary" : ""}, ${process.platform}-${process.arch})`;
}

export function helpText(t: T): string {
  const cmd = (name: string, desc: string) => `  ${name.padEnd(10)}${desc}`;
  // Wide enough for the longest option (--include-conversation ran into its text).
  const opt = (name: string, desc: string) => `  ${name.padEnd(24)}${desc}`;
  return [
    t("help.usage"),
    "",
    t("help.commands"),
    cmd("up", t("help.up")),
    cmd("open", t("help.open")),
    cmd("doctor", t("help.doctor")),
    cmd("status", t("help.status")),
    cmd("merge", t("help.merge")),
    cmd("undo", t("help.undo")),
    cmd("task", t("help.task")),
    cmd("say", t("help.say")),
    cmd("tail", t("help.tail")),
    cmd("answer", t("help.answer")),
    cmd("version", t("help.version")),
    cmd("pair", t("help.pair")),
    cmd("devices", t("help.devices")),
    cmd("connect", t("help.connect")),
    cmd("disconnect", t("help.disconnect")),
    cmd("ability", t("help.ability")),
    cmd("browser", t("help.browser")),
    cmd("service", t("help.service")),
    cmd("anywhere", t("help.anywhere")),
    cmd("domain", t("help.domain")),
    cmd("worker", t("help.worker")),
    cmd("uninstall", t("help.uninstall")),
    cmd("report", t("help.report")),
    cmd("update", t("help.update")),
    "",
    t("help.options"),
    opt("--port <n>", t("help.port")),
    opt("--data-dir <dir>", t("help.dataDir")),
    opt("--no-desktop", t("help.noDesktop")),
    opt("--headless", t("help.headless")),
    opt("--host <addr>", t("help.host")),
    opt("--worker", t("help.pairWorker")),
    opt("--repo <dir>", t("help.repo")),
    opt("--agent <name>", t("help.agent")),
    opt("--effort <level>", t("help.effort")),
    opt("--base <branch>", t("help.base")),
    opt("--timeout <s>", t("help.timeout")),
    opt("--json", t("help.json")),
    opt("--local", t("help.local")),
    opt("--home <address>", t("help.homeFlag")),
    opt("--remove", t("help.remove")),
    opt("--print", t("help.print")),
    opt("--no-dns-check", t("help.noDnsCheck")),
    opt("--all", t("help.all")),
    opt("--dry-run", t("help.dryRun")),
    opt("--yes", t("help.yes")),
    opt("--check", t("help.check")),
    opt("--to <version>", t("help.to")),
    opt("--include-conversation", t("help.includeConversation")),
    opt("--out <dir>", t("help.out")),
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

/** What a person opens: the web app this Ducter serves (the ws address is for clients). */
export const appUrl = (port: number) => `http://127.0.0.1:${port}/app`;

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
  /** Where a home command goes (D147): the Ducter the CLI follows, else this machine's. */
  target: Target;
}

const remoteAt = (ctx: Ctx) => (ctx.target.kind === "remote" ? ctx.target : undefined);

async function cmdDoctor(ctx: Ctx): Promise<number> {
  const report = await runDoctor(ctx.host, ctx.t, { port: ctx.port, dataDir: ctx.dataDir });
  // D147: which Ducter the command line follows, and whether this ducter updates with the app.
  let real = process.execPath;
  try {
    real = realpathSync(real);
  } catch {}
  const appCli = ["/Applications/Ducter.app", join(homedir(), "Applications", "Ducter.app")].map((a) => join(a, "Contents", "Helpers", "ducter")).find((p) => existsSync(p));
  report.checks.push(...cliChecks(ctx.t, { dataDir: ctx.dataDir, realExecPath: real, compiled: ctx.host.compiled, platform: process.platform, appInstalled: Boolean(appCli), ...(appCli ? { appCli } : {}) }));
  if (ctx.args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report, ctx.t, ctx.style));
  if (report.ok) writeFileSync(join(ctx.dataDir, DOCTOR_MARKER), new Date().toISOString());
  return report.ok ? 0 : 1;
}

async function cmdStatus(ctx: Ctx): Promise<number> {
  const snap = await fetchSnapshot(ctx.target);
  if (!snap) {
    if (ctx.args.json) console.log(JSON.stringify({ running: false, home: homeJson(ctx.target) }));
    else console.log(await notReached(ctx.t, ctx.target));
    return 1;
  }
  console.log(ctx.args.json ? JSON.stringify({ ...snap, home: homeJson(ctx.target) }, null, 2) : formatSnapshot(snap, ctx.t, ctx.style));
  return 0;
}

/** `ducter merge <part of a title>`: the same Merge the app's button does, for one finished task. */
async function cmdMerge(ctx: Ctx): Promise<number> {
  const { t } = ctx;
  const name = (ctx.args.rest ?? []).join(" ").trim();
  if (!name) return console.log(t("merge.usage")), 2;
  const snap = await fetchSnapshot(ctx.target);
  if (!snap) return console.log(await notReached(t, ctx.target)), 1;
  const found = pickTask(snap.onHand.tasks.filter(toMerge), name);
  if (!found.length) return console.log(t("merge.none", { name })), 1;
  if (found.length > 1) return console.log(t("merge.many", { name, titles: found.map((c) => c.title).join(" · ") })), 1;
  const r = await taskAction(ctx.target, found[0]!.taskId, "merge");
  if (!r) return console.log(remoteAt(ctx) ? await notReached(t, ctx.target) : t("merge.failed", { port: ctx.port })), 1;
  if (ctx.args.json) console.log(JSON.stringify({ ...r, home: homeJson(ctx.target) }, null, 2));
  else console.log(r.message ?? "");
  return r.ok ? 0 : 1;
}

/** `ducter undo <part of a title>` (D142): the app's 改回去 / Undo all changes for a folder task.
 *  A folder changed since the task finished says what would be lost; --yes goes ahead. */
async function cmdUndo(ctx: Ctx): Promise<number> {
  const { t } = ctx;
  const name = (ctx.args.rest ?? []).join(" ").trim();
  if (!name) return console.log(t("undo.usage")), 2;
  const snap = await fetchSnapshot(ctx.target);
  if (!snap) return console.log(await notReached(t, ctx.target)), 1;
  const found = pickTask(snap.onHand.tasks.filter((c) => c.place.kind === "folder" && c.folder?.undo === "open"), name);
  if (!found.length) return console.log(t("undo.none", { name })), 1;
  if (found.length > 1) return console.log(t("merge.many", { name, titles: found.map((c) => c.title).join(" · ") })), 1;
  const r = await taskAction(ctx.target, found[0]!.taskId, "undo", 5 * 60_000, ctx.args.yes ? { force: true } : {});
  if (!r) return console.log(remoteAt(ctx) ? await notReached(t, ctx.target) : t("undo.failed", { port: ctx.port })), 1;
  if (ctx.args.json) console.log(JSON.stringify({ ...r, home: homeJson(ctx.target) }, null, 2));
  else console.log(r.message ?? "", r.confirm ? `\n${t("undo.confirm")}` : "");
  return r.ok ? 0 : 1;
}

/** The AI agents on this machine that outlive Ducter (pi ships inside it): what Remove may
 *  promise stays. A failed probe says nothing rather than guessing. */
async function installedAgents(dataDir: string): Promise<{ name: string; signedIn: boolean }[] | undefined> {
  const host = realHost();
  try {
    const found = await probeHarnesses({
      exec: async (argv, ms) => {
        const r = await host.run(argv, ms);
        return { code: r.code, out: r.stdout };
      },
      which: (c) => host.which(c),
      dataDir,
    });
    return found.filter((h) => h.harness !== "pi" && h.installed).map((h) => ({ name: harnessName(h.harness), signedIn: h.loggedIn }));
  } catch {
    return undefined;
  }
}

async function cmdUninstall(ctx: Ctx): Promise<number> {
  const { t, args } = ctx;
  const home = homedir();
  const label = agentLabel(process.env, process.execPath);
  const agents = await installedAgents(ctx.dataDir);
  const sys = realDomainSys();
  const cfPath = args.all ? await caddyfileFor(sys) : undefined;
  const cfText = cfPath ? sys.read(cfPath) : undefined;
  const caddyfile = cfPath && cfText !== undefined ? { path: cfPath, text: cfText } : undefined;
  const plan = planUninstall({ home, dataDir: ctx.dataDir, platform: process.platform, agentLabel: label, execPath: process.execPath, all: Boolean(args.all), fromApp: process.env.DUCTER_FROM_APP === "1", t, agents, caddyfile });
  const { repos: _repos, ...shown } = plan;
  if (args.dryRun) {
    console.log(args.json ? JSON.stringify(shown, null, 2) : formatPlan(plan, t, home));
    return 0;
  }
  if (args.all && !args.yes) {
    if (!process.stdin.isTTY || args.json) {
      console.error(t("uninstall.needsYes"));
      return 2;
    }
    console.log(formatPlan(plan, t, home) + "\n");
    const answer = (prompt(t("uninstall.confirm")) ?? "").trim();
    if (answer !== "remove" && answer !== "删除") {
      console.log(t("uninstall.cancelled"));
      return 1;
    }
  }
  const res = await executeUninstall(plan, {
    label,
    port: ctx.port,
    t,
    runner: {
      uid: process.getuid?.() ?? 0,
      run: (cmd) => ctx.host.run(cmd, 15_000),
      removeCaddySite: async (path) => {
        const r = await removeDucterSite(sys, path);
        return r.error ? { ok: false, error: r.error === "root" ? "needs root: sudo ducter domain --remove" : r.error } : { ok: true };
      },
      healthy: async (p) => (await ctx.host.port(p)) === "ducter",
    },
  });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    if (!args.all || args.yes) console.log(formatPlan(plan, t, home) + "\n");
    for (const f of res.failed) console.log(t("uninstall.failed", f));
    for (const w of res.warnings) if (w.id === "running-elsewhere") console.log(w.detail);
    console.log(t("uninstall.done", { n: res.removed.length }));
  }
  return res.failed.length || res.warnings.some((w) => w.id === "running-elsewhere") ? 1 : 0;
}

async function cmdReport(ctx: Ctx): Promise<number> {
  const { t, args } = ctx;
  const doctor = await runDoctor(ctx.host, t, { port: ctx.port, dataDir: ctx.dataDir });
  const res = writeReport({
    dataDir: ctx.dataDir,
    out: args.out,
    home: homedir(),
    includeConversation: Boolean(args.includeConversation),
    doctor,
    versions: versionsText({ versionLine: versionLine(ctx.host.compiled), env: process.env, os: osText(process.platform) }),
    locale: detectLocale(),
    fromApp: Boolean(process.env.DUCTER_APP_VERSION) || process.env.DUCTER_FROM_APP === "1",
  });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(t("report.wrote", { dir: tilde(res.dir) }));
    for (const f of res.files) console.log(`  ${f.name}  ${f.bytes} B`);
    console.log("\n" + t("report.issue") + "\n" + res.issueUrl);
  }
  return 0;
}

/** What the talking commands (talk.ts) need from this run. */
function talk(ctx: Ctx): TalkCtx {
  const a = ctx.args;
  return {
    t: ctx.t,
    style: ctx.style,
    port: ctx.port,
    target: ctx.target,
    json: a.json,
    rest: a.rest ?? [],
    ...(a.repo ? { repo: a.repo } : {}),
    ...(a.agent ? { agent: a.agent } : {}),
    ...(a.effort ? { effort: a.effort } : {}),
    ...(a.base ? { base: a.base } : {}),
    ...(a.timeout ? { timeoutS: a.timeout } : {}),
    cmd: commandWith({ port: a.port, dataDir: a.dataDir ? resolve(a.dataDir) : undefined }),
  };
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
  // `ducter open <part of a title or id>` (D128): show that task in the app.
  if (ctx.args.rest?.length) return cmdOpenTask(talk(ctx));
  // Following a Ducter elsewhere (D147): the app connects there by itself; nothing runs here.
  if (!remoteAt(ctx) && (await ctx.host.port(ctx.port)) !== "ducter") {
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
  // Started by Ducter.app: stop when the app goes away (quit, crash), like any child of it.
  const parent = parentPid(process.env);
  if (parent) watchParent(parent, () => process.kill(process.pid, "SIGTERM"));
  const state = await ctx.host.port(ctx.port);
  if (state === "ducter") {
    const snap = await fetchSnapshot(ctx.port);
    console.log(t("up.already", { name: snap?.personaName ?? "Ducter", url: appUrl(ctx.port) }));
    if (ctx.args.desktop) await cmdOpen(ctx);
    return 0;
  }
  // Doctor runs on the first `up`, and again whenever something looks off (port taken).
  let firstReport: DoctorReport | undefined;
  if (!existsSync(join(ctx.dataDir, DOCTOR_MARKER)) || state === "busy") {
    if (state !== "busy") console.log(t("up.firstRun") + "\n");
    const report = await runDoctor(ctx.host, t, { port: ctx.port, dataDir: ctx.dataDir });
    if (report.ok) {
      // A ready Mac gets one line; the full table stays in `ducter doctor`.
      console.log(formatSummary(report, t, style) + "\n");
      writeFileSync(join(ctx.dataDir, DOCTOR_MARKER), new Date().toISOString());
      firstReport = report;
    } else if (ctx.args.headless && state !== "busy") {
      // A server keeps running with nothing signed in: the user pairs a device and signs in later.
      console.log(formatReport(report, t, style, { closing: false }) + "\n");
      console.log(t("headless.notReady") + "\n");
    } else {
      // Only what blocks, each with its one fix.
      console.log(formatBlocked(report, t, style) + "\n");
      const n = report.checks.filter((k) => k.required && k.status !== "ok").length;
      console.log(t(n === 1 ? "up.blocked" : "up.blocked.many"));
      return 1;
    }
  }

  // D204: no first-run repo scan any more; the old hints file goes.
  removeOldHints(ctx.dataDir);
  await nameOnFirstRun(ctx, firstReport);

  // A server's logs belong in its journal; in front of a person they go to ducter.log.
  if (!ctx.args.headless) quietCoreLogs(ctx.dataDir);
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
  if (!ctx.args.desktop) desktopLine = t("up.desktop.off");
  else if (plan.kind === "none") desktopLine = t("up.desktop.none", { url: appUrl(core.port) });
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
        [t("up.where"), t("up.where.value", { dir: tilde(core.dataDir) })],
        // Core doesn't wait for Mem (~6 s); "loading" means nmem answered slowly, not that it's missing.
        [t("up.memory"), booted.identitySource === "off" ? t("up.memory.off") : booted.identitySource === "nowledge-mem" ? t("up.memory.mem") : booted.identitySource === "loading" ? t("up.memory.loading") : t("up.memory.default")],
        [t("up.desktop"), desktopLine],
        ...(desktop ? [] : ([[t("up.address"), appUrl(core.port)]] as [string, string][])),
        [t("up.reach"), t("up.reach.value")],
      ], style) +
      "\n\n  " +
      t(desktop ? "up.hint" : "up.hintNoDesktop", { name }) +
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

/**
 * The one optional question of the first run: the partner's name. Asked only in a terminal,
 * only once, and not when Nowledge Mem is connected (the identity there already has a name).
 * A name saved earlier applies to every later `up` unless DUCTER_PERSONA_NAME is set.
 */
async function nameOnFirstRun(ctx: Ctx, firstReport: DoctorReport | undefined) {
  const saved = readPersonaFile(ctx.dataDir);
  const memOk = firstReport?.checks.some((k) => k.id === "nmem" && k.status === "ok");
  if (!saved && firstReport && !memOk && !process.env.DUCTER_PERSONA_NAME && process.stdin.isTTY && process.stdout.isTTY) {
    const answer = cleanName((await ask("  " + ctx.t("name.ask", { name: "Ducter" }))) ?? "");
    const name = answer && answer.toLowerCase() !== "ducter" ? answer : undefined;
    try {
      writePersonaFile(ctx.dataDir, { ...(name ? { name } : {}), askedAt: new Date().toISOString() });
    } catch {}
    if (name) console.log("  " + ctx.style.ok(ctx.t("name.set", { name })));
    console.log("");
  }
  const name = readPersonaFile(ctx.dataDir)?.name;
  if (name && !process.env.DUCTER_PERSONA_NAME) process.env.DUCTER_PERSONA_NAME = name;
}

/** One line from the terminal; undefined on Ctrl-D. */
async function ask(prompt: string): Promise<string | undefined> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let answered = false;
    rl.question(prompt, (a) => {
      answered = true;
      resolve(a); // before close(): close fires synchronously and would resolve undefined
      rl.close();
    });
    rl.on("close", () => {
      if (!answered) process.stdout.write("\n");
      resolve(undefined);
    });
  });
}

/**
 * Core prints its own "[ducter] ..." bring-up lines (English, addresses, paths). In front of a
 * person they are noise, so `up` sends them to <dataDir>/ducter.log; warnings and errors still
 * show, and go to the log too.
 */
function quietCoreLogs(dataDir: string) {
  const file = join(dataDir, "ducter.log");
  const write = (level: string, args: unknown[]) => {
    try {
      appendFileSync(file, `${new Date().toISOString()} ${level} ${args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" ")}\n`);
    } catch {}
  };
  const isCore = (args: unknown[]) => typeof args[0] === "string" && args[0].startsWith("[");
  for (const level of ["log", "info"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => (isCore(args) ? write(level, args) : orig(...args));
  }
  for (const level of ["warn", "error"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (isCore(args)) write(level, args);
      orig(...args);
    };
  }
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
  // Internal: a harness that takes stdio MCP only reaches Ducter through this (D85). Not in help.
  if (argv[0] === "mcp-bridge") return (await import("@ducter/runner/src/mcp-bridge.ts")).bridgeMain(argv[1]);
  const t0 = translator(detectLocale());
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(t0(parsed.error.key, parsed.error.vars) + "\n\n" + helpText(t0));
    return 2;
  }
  const { args } = parsed;
  // Every hint names the commands with the --port / --data-dir given here.
  const t = translator(detectLocale(), commandsFor({ port: args.port, dataDir: args.dataDir ? resolve(args.dataDir) : undefined }));
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
  const ctx: Ctx = { args, t, style, host, port, dataDir, target: { kind: "local", port } };
  // The CLI itself: which Ducter it follows (D147).
  if (args.command === "connect") return cmdConnect({ t, style, dataDir, json: args.json, rest: args.rest ?? [], ...(args.code ? { code: args.code } : {}) });
  if (args.command === "disconnect") return cmdDisconnect({ t, style, dataDir, json: args.json });
  // A home command goes to the Ducter the CLI follows; a machine command stays here (D147).
  if (commandClass(args.command, { all: args.all, check: args.check }) === "home") {
    const r = resolveTarget({ dataDir, port, local: args.local, home: args.home, portGiven: args.port != null });
    if (!r.ok) {
      if (args.json) console.log(JSON.stringify({ ok: false, error: r.key === "home.needsConnect" ? "not_connected" : "bad_address", ...r.vars }));
      else console.log(t(r.key, r.vars));
      return 1;
    }
    ctx.target = r.target;
    if (!args.json) console.log(targetLine(t, r.target, style));
  }
  // Neither creates the data folder: one takes it away, the other only reads it.
  if (args.command === "uninstall") return cmdUninstall(ctx);
  if (args.command === "report") return cmdReport(ctx);
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
    case "undo":
      return cmdUndo(ctx);
    case "merge":
      return cmdMerge(ctx);
    case "status":
      return cmdStatus(ctx);
    case "open":
      return cmdOpen(ctx);
    case "task":
      return cmdTask(talk(ctx));
    case "say":
      return cmdSay(talk(ctx));
    case "tail":
      return cmdTail(talk(ctx));
    case "answer":
      return cmdAnswer(talk(ctx));
    case "up":
      return cmdUp(ctx);
    case "pair":
      if (ctx.target.kind === "remote") return cmdPairAt({ t, style, target: ctx.target, json: args.json });
      return cmdPair({ t, style, dataDir, port, json: args.json, running: (await host.port(port)) === "ducter", wait: Boolean(process.stdout.isTTY) && !args.json, worker: args.worker, publicIp: fetchPublicIp, self: ducterCommand() });
    case "anywhere":
      return cmdAnywhere({
        t,
        style,
        target: ctx.target,
        json: args.json,
        rest: args.rest ?? [],
        ...(args.token ? { token: args.token } : {}),
        ...(args.address ? { address: args.address } : {}),
        ...(ctx.target.kind === "local" && process.stdout.isTTY && !args.json ? { pair: () => cmdPair({ t, style, dataDir, port, json: false, running: true, wait: true, self: ducterCommand() }) } : {}),
      });
    case "domain":
      return cmdDomain({
        t,
        style,
        sys: realDomainSys(),
        dataDir,
        port,
        json: args.json,
        domain: args.rest?.[0],
        remove: args.remove,
        print: args.print,
        dnsCheck: args.dnsCheck,
        pair: () => cmdPair({ t, style, dataDir, port, json: false, running: true, wait: Boolean(process.stdout.isTTY) }),
      });
    case "devices":
      if (ctx.target.kind === "remote") return cmdDevicesAt({ t, style, target: ctx.target, json: args.json, rest: args.rest ?? [] });
      return cmdDevices({ t, style, dataDir, json: args.json, rest: args.rest ?? [], port });
    case "ability":
      return cmdAbility({ t, target: ctx.target, json: args.json, rest: args.rest ?? [] });
    case "browser":
      return cmdBrowser({ t, target: ctx.target, json: args.json, rest: args.rest ?? [] });
    case "service":
      return cmdService({
        t,
        style,
        host,
        dataDir,
        port,
        bindHost: args.host,
        worker: args.worker,
        rest: args.rest ?? [],
        onInstalled: async () => {
          const auth = openDeviceAuth(dataDir);
          const none = auth.list().length === 0;
          auth.close();
          if (none) await cmdPair({ t, style, dataDir, port, json: false, running: true, wait: Boolean(process.stdout.isTTY), publicIp: fetchPublicIp, self: ducterCommand() });
        },
      });
    case "worker":
      return cmdWorker({ t, style, args, dataDir });
    case "update":
      return cmdUpdate({ t, style, args, port, dataDir, target: ctx.target });
  }
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  if (code !== "running") process.exit(code);
}
