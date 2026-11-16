// `ducter key add` (D298): a pasted API key, read from stdin (never an argument: those show in
// the process list), recognised, checked with one call that spends nothing, kept in keys.env and,
// when nothing on this computer can think yet, made what the partner thinks with. The Mac app's
// first run calls it with --json before Ducter runs; the running home does the same itself (the
// key_add frame).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESSES, keyWords, type HarnessId, type KeyResult } from "@ducter/protocol";
import { addKey } from "@ducter/core/src/api-key.ts";

export interface KeyCmd {
  dataDir: string;
  lang: "zh" | "en";
  json: boolean;
  rest: string[];
  stdin?: () => Promise<string>;
  fetch?: typeof fetch;
  canRun?: (h: HarnessId) => boolean;
  /** Whether some agent here is already signed in (then the partner's own choice is left alone). */
  signedIn?: () => Promise<boolean>;
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
    print(c.lang === "zh" ? "用法：ducter key add < key.txt（从标准输入读密钥，不放在命令行里）" : "Usage: ducter key add < key.txt (the key is read from stdin, never the command line)");
    return 2;
  }
  const raw = (await (c.stdin ?? (() => Bun.stdin.text()))()).trim();
  let result: KeyResult;
  if (!raw) result = { ok: false, reason: "shape" };
  else {
    const blind = c.signedIn ? !(await c.signedIn().catch(() => false)) : true;
    result = await addKey(raw, { dataDir: c.dataDir, lang: c.lang, ...(c.fetch ? { fetch: c.fetch } : {}), ...(c.canRun ? { canRun: c.canRun } : {}) });
    if (result.ok && result.harness && !result.needs && blind) brainFromKeyFile(c.dataDir, result.harness, result.model);
  }
  const words = keyWords(result);
  if (c.json) print(JSON.stringify({ ...result, say: words }));
  else {
    print(words[c.lang]);
    if (result.needs === "pi" && result.install) print(`  ${result.install}`);
  }
  return result.ok ? 0 : 1;
}
