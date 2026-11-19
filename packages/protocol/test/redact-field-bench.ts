// bun packages/protocol/test/redact-field-bench.ts: the field step, the old unanchored pattern
// against replaceField, over a tool output as a long task holds them (code with "token" and "key"
// in it and nothing secret).
import { replaceField } from "../src/redact.ts";

const FIELD_BEFORE =
  /((?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'`,;<>()\[\]{}\\•]{12,})/gi;
let s = "";
for (let i = 0; i < 30; i++) s += `const token = readConfig(path_to_config, ${"x".repeat(i % 7)}); // the key of the map is the file's name, not a secret\n`;
const f = (m: string) => m;
for (const [name, run] of [
  ["before", () => s.replace(FIELD_BEFORE, f)],
  ["now", () => replaceField(s, f)],
] as const) {
  for (let i = 0; i < 200; i++) run();
  const n = 3000;
  const t = performance.now();
  for (let i = 0; i < n; i++) run();
  console.log(`${name}: ${(((performance.now() - t) / n) * 1000).toFixed(1)} µs/op`);
}
