// `bun run up`: boots core, then runner and partner (stubs if they're missing or fail).
import type { CoreApi, Partner, Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, defaultDataDir, type Core } from "./core.ts";
import { loadPersona } from "./persona.ts";

async function loadModule<T>(pkg: string, relative: string, factory: string): Promise<((...a: any[]) => T) | undefined> {
  const errors: string[] = [];
  for (const spec of [new URL(relative, import.meta.url).href, pkg]) {
    try {
      const mod = await import(spec);
      if (typeof mod[factory] === "function") return mod[factory];
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

async function main() {
  const persona = await loadPersona();
  let core: Core;
  try {
    core = startCore({ persona });
  } catch (err) {
    console.error(`[ducter] failed to start core (is port ${process.env.DUCTER_PORT || 7777} in use?):`, (err as Error).message);
    process.exit(1);
  }

  let runner: Runner | undefined;
  const createRunner = await loadModule<Runner | Promise<Runner>>("@ducter/runner", "../../runner/src/index.ts", "createRunner");
  if (createRunner) {
    try {
      runner = await createRunner(core);
    } catch (err) {
      console.warn("[ducter] createRunner threw; running with a stub runner:", err);
    }
  }
  runner ??= stubRunner(core);
  core.setRunner(runner);

  let partner: Partner | undefined;
  const createPartner = await loadModule<Partner | Promise<Partner>>("@ducter/partner", "../../partner/src/index.ts", "createPartner");
  if (createPartner) {
    try {
      partner = await createPartner(core, runner);
    } catch (err) {
      console.warn("[ducter] createPartner threw; running with a stub partner:", err);
    }
  }
  partner ??= stubPartner(core);
  core.setPartner(partner);

  console.log(`[ducter] ${persona.name} is up (identity: ${persona.source}, data: ${defaultDataDir()})`);
  console.log(`[ducter] clients: ${core.url}`);
  console.log(`[ducter] tools:   http://127.0.0.1:${core.port}/mcp`);

  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[ducter] ${sig}: shutting down`);
    const force = setTimeout(() => process.exit(1), 5000);
    for (const part of [partner, runner] as any[]) {
      try {
        await part?.stop?.();
      } catch (err) {
        console.warn("[ducter] stop failed:", err);
      }
    }
    await core.stop();
    clearTimeout(force);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (import.meta.main) await main();
