// D220: the workbench's Phone page with a simulator, and 工作副本 / Working copy. Every word the
// two views use exists in zh and en (designed together), and the Mac says the same words.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { workbench as workbenchWords } from "../src/i18n-workbench.ts";

const used = (file: string) => [...readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").matchAll(/t\("((?:wb\.sim|wb\.phone|wb\.screens|info)[\w.]*)"/g)].map((m) => m[1]!);

test("the Mac app says the same words", () => {
  const go = readFileSync(new URL("../../desktop/internal/i18n/workbench.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const)
    for (const [k, v] of Object.entries(workbenchWords[lang])) if (/^(wb\.sim|info\.|wb\.phone\.ducter|wb\.screens)/.test(k)) expect(go.includes(`"${k}"`) && go.includes(JSON.stringify(v).slice(1, -1)), `${lang} ${k}`).toBe(true);
});
