// D507: a helper on On hand. How it reads at a glance comes from the home's one model (HelperWork);
// a helper's task standing anywhere but under its helper says whose it is.
import { describe, expect, test } from "bun:test";
import { helperGlance } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";

const now = new Date().toISOString();

describe("D507: a helper at a glance", () => {
  test("its address first, then nothing yet, its work, or what waits for the person", () => {
    expect(helperGlance({ mem: "connecting", items: [] })).toBe("address");
    expect(helperGlance({ mem: "ready", items: [] })).toBe("idle");
    expect(helperGlance({ mem: "ready", items: [{ taskId: "a", title: "a", at: "work" }, { taskId: "b", title: "b", at: "ready" }] })).toBe("busy");
    expect(helperGlance({ mem: "ready", items: [{ taskId: "a", title: "a", at: "work" }, { taskId: "b", title: "b", at: "you" }] })).toBe("you");
  });

  test("a row says its helper's name wherever it stands but under the helper", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    A.L = strings("en");
    A.send = () => {};
    A.S.welcomed = true;
    A.receive({
      t: "on_hand",
      onHand: {
        tasks: [{ taskId: "h1", persona: "default", title: "Follow #11030", project: "mem", place: { kind: "none" }, harness: "codex", attention: "done", residency: "parked", openedAt: now, updatedAt: now, helper: { id: "b", name: "Nowledge Mem PR Babysitter" } }],
        counts: { needs_you: 0, working: 0, waiting: 0, done_today: 1 },
        waiters: [],
      },
    } as any);
    expect(o.whereMeta(A.S.tasks.get("h1")!)).toContain("Nowledge Mem PR Babysitter");
  });
});
