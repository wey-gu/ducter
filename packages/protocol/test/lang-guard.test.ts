// D292: no new inline zh/en branches. Code-made words come from per-language tables picked by the
// fallback chain (lang.ts words(), the clients' i18n tables), never `zh ? "…" : "…"`, and a
// language is never decided by "has Han → Chinese, else English". The allowlist holds what is
// left, per file, as a ceiling: it may only shrink (research/99 lists each with its reason).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import allow from "./lang-guard.allow.json" with { type: "json" };

const ROOT = join(import.meta.dir, "../../..");
const SCAN = ["packages", "apps/web/src", "apps/desktop"];
const SKIP = /(^|\/)(node_modules|dist|test|tests|eval|fixtures|testdata|mock|vendor|build)(\/|$)|\.test\.tsx?$|_test\.go$|(^|\/)demo[^/]*$/;

/** An inline zh/en branch, a zh-or-English decision, or a Han-only language test. */
export const BRANCH =
  /[!=]==? ?"(zh|en)"|\bzh \?|\bisZh \?|\bisChinese\(|\buserZh\(|[!=]= ?(i18n\.)?(ZH|EN)\b|\bpick\(zh|\bif zh \{|\bzh := /g;

function files(dir: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    const rel = relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) files(p, out);
    else if (/\.(ts|tsx|go)$/.test(n) && !/\.d\.ts$/.test(n)) out.push(rel);
  }
  return out;
}

export function branchCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of SCAN)
    for (const f of files(join(ROOT, root))) {
      const n = (readFileSync(join(ROOT, f), "utf8").match(BRANCH) ?? []).length;
      if (n) counts[f] = n;
    }
  return counts;
}

describe("D292 language guard", () => {
  test("no file has more inline zh/en branches than the allowlist says", () => {
    const ceiling = allow.files as Record<string, number>;
    // LANG_GUARD_PRINT=1 prints the counts now, for shrinking the allowlist by hand.
    if (process.env.LANG_GUARD_PRINT) console.log(JSON.stringify(branchCounts(), null, 2));
    const over = Object.entries(branchCounts())
      .filter(([f, n]) => n > (ceiling[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (allowed ${ceiling[f] ?? 0})`);
    expect(over, "use a table (lang.ts words(), an i18n key) instead of an inline zh/en branch").toEqual([]);
  });
});
