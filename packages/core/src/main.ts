// `bun run up`: boots core, then runner and partner (stubs if they're missing or fail).
import type { CoreApi, Partner, Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "./core.ts";
import { DEFAULT_IDENTITY, loadPersona } from "./persona.ts";
import { bindMemIdentity, nmemRunner, readMemIdentity, renameMemIdentity } from "./mem-identity.ts";
import { homedir } from "node:os";

/**
 * D141: binds the persona's Mem identity the first time Mem answers with memory on (enrolling
 * Ducter's own when the user has none set), and carries a rename to the identity Ducter enrolled.
 */
export function keepMemIdentity(core: Core, memConnected: boolean, run = nmemRunner()) {
  if (memConnected && !core.persona.mem && core.settings.get().memory) {
    void bindMemIdentity({ dataDir: core.dataDir, personaId: core.persona.id, name: core.persona.name, run }).then(
      (mem) => {
        if (!mem) return console.warn("[ducter] Nowledge Mem didn't answer; the partner's Mem identity is bound on a later start");
        core.persona.mem = mem;
        core.settings.memIdentityChanged();
        console.log(`[ducter] Mem identity: ${mem.agentId}${mem.owned ? " (Ducter's own)" : ""}${mem.space ? `, Space ${mem.space}` : ""}`);
      },
      (err) => console.warn("[ducter] binding the Mem identity failed:", (err as Error).message),
    );
  }
  let named = core.persona.name;
  core.settings.onChange(() => {
    if (core.persona.name === named) return;
    named = core.persona.name;
    const mem = core.persona.mem;
    if (mem?.owned) void renameMemIdentity(run, mem, named).then((ok) => ok || console.warn("[ducter] Mem kept the partner's old name; it is updated on the next rename"));
  });
}

async function loadModule(pkg: string, relative: string, factory: string): Promise<Record<string, any> | undefined> {
  const errors: string[] = [];
  for (const spec of [new URL(relative, import.meta.url).href, pkg]) {
    try {
      const mod = await import(spec);
      if (typeof mod[factory] === "function") return mod;
      errors.push(`${spec}: no ${factory} export`);
    } catch (err) {
      errors.push(`${spec}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  console.warn(`[ducter] ${pkg} unavailable; running with a stub.\n  ${errors.join("\n  ")}`);
}

export function stubRunner(core: CoreApi): Runner {
  const off = async () => {
    throw new Error("runner is not available (packages/runner failed to load)");
  };
  return {
    harness: { start: off, available: async () => [] },
    openTask: off,
    async send(taskId) {
      console.warn(`[ducter] stub runner: message for ${taskId} not delivered`);
      return { delivered: "queued" };
    },
    interrupt: async () => {},
    drop: async () => {},
  };
}

export function stubPartner(core: CoreApi): Partner {
  return {
    onTrigger(e) {
      if (e.kind !== "user_msg") return;
      core.log.append({
        stream: "channel",
        origin: "system",
        kind: "ai_msg",
        body: { text: "My main AI isn't running yet (packages/partner failed to load). Your message is saved in the Log.", replyTo: e.seq },
      });
    },
  };
}

/** Modules preloaded by a host (the compiled `ducter` CLI, where path-based dynamic import can't be bundled). */
export interface BootModules {
  runner?: Record<string, any>;
  partner?: Record<string, any>;
}

const BANNER_WAIT_MS = 300;
const IDENTITY_WAIT_MS = 8_000;

export async function main(mods: BootModules = {}) {
  // Clients can connect at once; identity from Mem (slow: several seconds) is folded in when it
  // lands (below). Triggers that arrive before the partner is wired are held by core and replayed.
  const persona = { id: "default", name: process.env.DUCTER_PERSONA_NAME || "Ducter", identity: DEFAULT_IDENTITY };
  const bootName = persona.name;
  let core: Core;
  try {
    // D204: the projects in this computer's Ducter folder are offered on the New task card (core.ts).
    core = startCore({ persona });
  } catch (err) {
    console.error(`[ducter] failed to start core (is port ${process.env.DUCTER_PORT || 7777} in use?):`, (err as Error).message);
    process.exit(1);
  }
  // D141: the persona's Mem identity, bound on an earlier start; named on every Mem call.
  const boundMem = process.env.DUCTER_MEMORY === "off" ? undefined : readMemIdentity(core.dataDir);
  if (boundMem) core.persona.mem = boundMem;
  const loaded = loadPersona({ timeoutMs: 10_000, ...(boundMem ? { mem: boundMem } : {}) });
  console.log(`[ducter] clients: ${core.url}`);
  console.log(`[ducter] tools:   http://127.0.0.1:${core.port}/mcp`);

  let runner: Runner | undefined;
  const runnerMod = mods.runner ?? (await loadModule("@ducter/runner", "../../runner/src/index.ts", "createRunner"));
  if (runnerMod) {
    try {
      // Task-role tools (report_to_main, checkpoint) are the runner's; register them once.
      // The branch check reads the runner, created just below; reports only come after it is.
      type Late = { branchChanges?(id: string): Promise<unknown>; checkEvidence?(id: string, ev: unknown[]): Promise<unknown[]> } | undefined;
      if (typeof runnerMod.registerTaskTools === "function")
        runnerMod.registerTaskTools(core, {
          branchChanges: (id: string) => (runner as Late)?.branchChanges?.(id),
          checkEvidence: (id: string, ev: unknown[]) => (runner as Late)?.checkEvidence?.(id, ev),
          // D142: a folder task's report says what it changed and until when it can be undone.
          folderChanges: (id: string) => (runner as { folderReport?(id: string): Promise<unknown> } | undefined)?.folderReport?.(id),
          // D206: the files a report shows, read where the task runs and copied into the home's media.
          shown: (id: string, paths: string[]) => (runner as { shown?(id: string, paths: string[]): Promise<unknown> } | undefined)?.shown?.(id, paths),
        });
      else console.warn("[ducter] runner has no registerTaskTools: tasks cannot report_to_main");
      runner = await runnerMod.createRunner(core);
    } catch (err) {
      console.warn("[ducter] createRunner threw; running with a stub runner:", err);
    }
  }
  runner ??= stubRunner(core);
  core.setRunner(runner);

  // Don't hold boot on Mem (`nmem context` takes ~6 s): fold the identity in when it lands.
  // The partner starts its session only after it lands or IDENTITY_WAIT_MS passes, so the
  // first session normally carries the real L1 identity.
  let source = "loading";
  const identity = loaded.then((mem) => {
    // A name chosen on the Partner page while Mem was still loading wins.
    const renamed = core.persona.name !== bootName;
    Object.assign(core.persona, renamed ? { identity: mem.identity.split(mem.name).join(core.persona.name) } : { name: mem.name, identity: mem.identity });
    source = mem.source;
    if (mem.source !== "off") core.settings.setMemState(mem.source === "nowledge-mem" ? "connected" : "missing");
    return mem.source;
  });
  void identity.then((src) => keepMemIdentity(core, src === "nowledge-mem"));
  // D225: Nowledge Mem put in or signed in from Settings › 伙伴 while running: Mem is connected
  // now, so the persona's identity is bound as on a start (no restart).
  core.bridgeLink.onMemReady(() => {
    if (process.env.DUCTER_MEMORY === "off") return;
    core.settings.setMemState("connected");
    keepMemIdentity(core, true);
  });
  const identityOrTimeout = Promise.race([identity, Bun.sleep(IDENTITY_WAIT_MS).then(() => "timeout")]);
  await Promise.race([identity, Bun.sleep(BANNER_WAIT_MS)]); // usually lost: the banner says "loading"

  let partner: Partner | undefined;
  const partnerMod = mods.partner ?? (await loadModule("@ducter/partner", "../../partner/src/index.ts", "createPartner"));
  if (partnerMod) {
    try {
      partner = await partnerMod.createPartner(core, runner, { ready: identityOrTimeout });
    } catch (err) {
      console.warn("[ducter] createPartner threw; running with a stub partner:", err);
    }
  }
  partner ??= stubPartner(core);
  core.setPartner(partner);

  console.log(`[ducter] ${persona.name} is up at ${core.url} (identity: ${source}, data: ${core.dataDir})`);
  void identity.then((src) => src !== "default" && console.log(`[ducter] identity loaded from ${src}`));

  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[ducter] ${sig}: shutting down`);
    const force = setTimeout(() => process.exit(1), 5000);
    for (const [label, part] of [["partner", partner], ["runner", runner]] as [string, any][]) {
      const t0 = Date.now();
      try {
        await part?.stop?.();
      } catch (err) {
        console.warn("[ducter] stop failed:", err);
      }
      console.log(`[ducter] ${label} stopped in ${Date.now() - t0} ms`);
    }
    await core.stop();
    clearTimeout(force);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  return { core, runner, partner, identitySource: source, identity, shutdown };
}

if (import.meta.main) await main();
