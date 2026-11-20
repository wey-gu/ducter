// `ducter key add` (D298): a pasted API key, read from stdin (never an argument: those show in
// the process list), recognised, checked with one call that spends nothing, kept in keys.env and,
// when nothing on this computer can think yet, made what the partner thinks with. The Mac app's
// first run calls it with --json before Ducter runs; the running home does the same itself (the
// key_add frame).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESSES, keyWords, words, type HarnessId, type KeyResult, type LangTag } from "@ducter/protocol";

const USAGE = {
  en: "Usage: ducter key add < key.txt (the key is read from stdin, never the command line)",
  zh: "用法：ducter key add < key.txt（从标准输入读密钥，不放在命令行里）",
};
import { addKey } from "@ducter/core/src/api-key.ts";

export interface KeyCmd {
  dataDir: string;
  lang: LangTag;
  json: boolean;
  rest: string[];
  stdin?: () => Promise<string>;
  fetch?: typeof fetch;
  canRun?: (h: HarnessId) => boolean;
  /** Whether some agent here is already signed in (then the partner's own choice is left alone). */
  signedIn?: () => Promise<boolean>;
  /** D440: put the agent a good key needs on this computer (pi into Ducter's tools folder). */
  prepare?: (h: HarnessId) => Promise<boolean>;
  print?: (s: string) => void;
}

/** With nothing chosen in settings.json, the pasted key's agent becomes what the partner thinks with. */
export function brainFromKeyFile(dataDir: string, harness: HarnessId, model?: string): boolean {
  if (!HARNESSES[harness]?.partner) return false;
  const path = join(dataDir, "settings.json");
  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return false; // never overwrite a file we can't read
    }
  }
  if (data.brain !== undefined) return false;
  data.brain = { harness, ...(model ? { model } : {}) };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
  return true;
}

export async function cmdKey(c: KeyCmd): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  if (c.rest[0] !== "add") {
    print(words(USAGE, c.lang));
    return 2;
  }
  const raw = (await (c.stdin ?? (() => Bun.stdin.text()))()).trim();
  let result: KeyResult;
  if (!raw) result = { ok: false, reason: "shape" };
  else {
    const blind = c.signedIn ? !(await c.signedIn().catch(() => false)) : true;
    result = await addKey(raw, { dataDir: c.dataDir, lang: c.lang, ...(c.fetch ? { fetch: c.fetch } : {}), ...(c.canRun ? { canRun: c.canRun } : {}), ...(c.prepare ? { prepare: c.prepare } : {}) });
    if (result.ok && result.harness && !result.needs && blind) brainFromKeyFile(c.dataDir, result.harness, result.model);
  }
  const said = keyWords(result);
  if (c.json) print(JSON.stringify({ ...result, say: said }));
  else {
    print(words(said, c.lang));
    if (result.needs === "pi" && result.install) print(`  ${result.install}`);
  }
  return result.ok ? 0 : 1;
}

/**
 * D440: pi for a pasted key, before Ducter runs (the Mac's first run): D363's install into
 * <data>/tools (Node's own build, checked, then pi's npm package), the same as the home does.
 */
export async function preparePi(dataDir: string, h: HarnessId): Promise<boolean> {
  if (h !== "pi") return false;
  const { createAgentSetup, installAndWait, realAgentSetupSys } = await import("@ducter/core/src/agent-setup.ts");
  const { widenAgentPath } = await import("@ducter/core/src/agent-path.ts");
  const { whichNow } = await import("@ducter/protocol/src/which.ts");
  const setup = createAgentSetup({ dataDir, sys: realAgentSetupSys({ platform: process.platform, arch: process.arch, which: (c) => whichNow(c) }), probe: async () => void widenAgentPath({ dataDir }), changed: () => {} });
  try {
    const ok = await installAndWait(setup, h);
    widenAgentPath({ dataDir });
    return ok;
  } finally {
    setup.stop();
  }
}
