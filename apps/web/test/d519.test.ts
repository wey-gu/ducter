// D519: a PR's phase always reads whole. The author's babysitter page on hel read 「%s 要求修改」 under
// 手上的: a request for changes with no reviewer's login. Every name fills, or the words go without it;
// the preloaded guard (test/guard.ts) fails any copy drawn with a placeholder left unfilled.
import { describe, expect, test } from "bun:test";
import { noOrphan } from "@ducter/protocol";
import { strings, verbsOf } from "../src/i18n.ts";

describe("D519: no raw placeholder reaches a person", () => {
  test("a request for changes with no reviewer, and with one", async () => {
    const { A } = await import("../src/app.ts");
    const p = await import("../src/onhand-pr.tsx");
    for (const lang of ["zh", "en"] as const) {
      A.L = strings(lang);
      for (const by of [undefined, [], [""], ["  "]]) {
        const w = p.prPhaseWords({ phase: "changes", ...(by ? { by } : {}) } as never);
        expect(w).not.toMatch(/%(\[\d+\])?[sd]/);
        expect(w).toBe(A.L.t("onhand.prs.changes.anon"));
      }
      expect(p.prPhaseWords({ phase: "changes", by: ["100gle"] } as never)).toContain("100gle");
    }
  });

  test("no Han character alone on a wrapped line", () => {
    expect(noOrphan("12 月 20 日上海飞东京的机票")).toBe("12 月 20 日上海飞东京的机⁠票");
    expect(noOrphan("持续评审 nowledge-co，并处理 100gle…")).toBe("持续评审 nowledge-co，并处理 100gle…");
    expect(noOrphan("分给你的待…")).toBe("分给你的⁠待…");
    expect(noOrphan(noOrphan("东京的机票"))).toBe("东京的机⁠票");
    expect(noOrphan("Shanghai to Tokyo on Dec 20")).toBe("Shanghai to Tokyo on Dec 20");
  });

  test("the guard counts what a template prints", () => {
    expect(verbsOf("%s 要求修改")).toBe(1);
    expect(verbsOf("%[2]s 和 %[1]s")).toBe(2);
    expect(verbsOf("100%% 完成")).toBe(0);
    expect(strings("zh").t("onhand.prs.changes")).toContain("%s"); // a test reading the template itself is not drawing it
  });
});
