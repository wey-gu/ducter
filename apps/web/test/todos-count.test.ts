// To-do sources' count is never a guess (0.0.75 said "0 件没做完" with 50+ assigned): it shows only
// after a look that read the list; before one it says 正在看… / Looking…; a failed look says it
// couldn't read the app, gh's reason, and 再试一次 / Try again. The words are the Mac's
// (apps/desktop/internal/views/todos_test.go, TestTodosCountOnlyAfterALook).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { todoWords } from "../src/i18n-todos.ts";

const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/todos.go"), "utf8");

describe("to-do sources' count", () => {
  test("counted only after a look that read it", async () => {
    const { countOf } = await import("../src/todos.tsx");
    expect(countOf({ state: "ok" })).toBe("looking");
    expect(countOf({ state: "ok", open: 0 })).toBe("looking");
    expect(countOf({ state: "ok", checkedAt: "2026-11-18T01:23:00Z", open: 0 })).toBe("counted");
    expect(countOf({ state: "ok", checkedAt: "2026-11-18T01:23:00Z", open: 50 })).toBe("counted");
    expect(countOf({ state: "error", checkedAt: "2026-11-18T01:23:00Z" })).toBe("failed");
    expect(countOf({ state: "signed_out" })).toBe("failed");
  });

  test("the words exist in zh and en, the same as the Mac's", () => {
    expect(todoWords.zh["todos.read.failed"]).toBe("没能读到 %s。");
    expect(todoWords.en["todos.read.failed"]).toBe("Couldn't read %s.");
    for (const k of ["todos.read.failed", "todos.retry", "todos.looking"])
      for (const lang of ["zh", "en"] as const) {
        expect(todoWords[lang][k]).toBeTruthy();
        expect(mac).toContain(`"${todoWords[lang][k]}"`);
      }
  });
});
