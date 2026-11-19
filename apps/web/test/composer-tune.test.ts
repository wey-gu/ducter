// D354, D387: under an opened task's composer, its model and effort in plain words, always there
// while it can be switched: one chip, one card with a stepped control over the levels that model
// takes (the agent's live list, D352), Back to default, and the model list; a choice is the in-place
// switch (D282). Gone where it can't switch or there is no live list.
import { describe, expect, test } from "bun:test";
import type { TaskCard } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";

const ULTRA = ["low", "medium", "high", "xhigh", "max", "ultra"];
const codex = {
  harness: "codex",
  from: "live" as const,
  models: [
    { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6.1-terra", label: "GPT-6.1-Terra", default: true as const, efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6-astra", label: "GPT-6-Astra", efforts: ULTRA, defaultEffort: "medium" },
    { id: "gpt-6-plain", label: "GPT-6-Plain" },
  ],
};
const card = (over: Partial<TaskCard> = {}): TaskCard =>
  ({ taskId: "t1", persona: "p", title: "Ship it", project: "", place: { kind: "repo", device: "local", repoPath: "/r" }, harness: "codex", attention: "working", residency: "hot", openedAt: "2026-11-18T10:00:00Z", updatedAt: "2026-11-18T10:00:00Z", ...over }) as TaskCard;

async function setup(c: TaskCard) {
  const { A } = await import("../src/app.ts");
  const tune = await import("../src/composer-tune.tsx");
  const sent: object[] = [];
  A.send = ((f: object) => void sent.push(f)) as typeof A.send;
  A.L = strings("zh");
  A.newTaskOptions = undefined;
  A.S.welcomed = true;
  A.S.apply({ t: "on_hand", onHand: { tasks: [c], counts: { needs_you: 0, working: 1, waiting: 0, done_today: 0 }, waiters: [] } });
  return { A, tune, sent, task: () => A.S.tasks.get("t1")! };
}

describe("the chips under the task's composer (D354)", () => {
  test("no live list yet: no chips; the opened task asks for one, once", async () => {
    const { A, tune, sent, task } = await setup(card());
    expect(tune.composerTune(task())).toBeUndefined();
    A.S.welcomed = false; // painted from the glance, the socket not open yet: nothing goes, and it asks again after welcome
    A.askTaskModels("t1");
    expect(sent).toEqual([]);
    A.S.welcomed = true;
    A.askTaskModels("t1");
    A.askTaskModels("t1");
    expect(sent).toEqual([{ t: "task_new_options" }]);
  });

  test("on its own default: the model in plain words and its default effort; the list is the live one", async () => {
    const { A, tune, task } = await setup(card());
    A.newTaskOptions = { places: [], candidates: [], models: [codex] };
    const tu = tune.composerTune(task())!;
    expect(tu.model.label).toBe("GPT-6.1-Terra");
    expect(tu.effort).toBe("low");
    expect(tu.models.map((m) => m.label)).toEqual(["GPT-6.2-Sol", "GPT-6.2-Astra", "GPT-6.1-Terra", "GPT-6-Astra", "GPT-6-Plain"]);
    expect(tu.model.efforts).toEqual(ULTRA);
    expect(tu.model.defaultEffort).toBe("low");
  });

  test("its own model and effort; a model without levels has no effort chip", async () => {
    const { A, tune, task } = await setup(card({ model: "gpt-6-astra", effort: "high" }));
    A.newTaskOptions = { places: [], candidates: [], models: [codex] };
    expect(tune.composerTune(task())).toMatchObject({ model: { id: "gpt-6-astra" }, effort: "high" });
    const plain = await setup(card({ model: "gpt-6-plain" }));
    plain.A.newTaskOptions = { places: [], candidates: [], models: [codex] };
    expect(plain.tune.composerTune(plain.task())!.model.efforts).toBeUndefined();
  });

  test("hidden when the task can't switch", async () => {
    for (const attention of ["dropped", "superseded"] as const) {
      const { A, tune, task } = await setup(card({ attention }));
      A.newTaskOptions = { places: [], candidates: [], models: [codex] };
      expect(tune.tunable(task())).toBe(false);
      expect(tune.composerTune(task())).toBeUndefined();
    }
  });

  test("choosing sends the in-place switch", async () => {
    const { A, sent } = await setup(card());
    A.retuneTask("t1", "codex", "gpt-6.2-sol");
    A.retuneTask("t1", "codex", "gpt-6.2-sol", "high");
    expect(sent).toEqual([
      { t: "task_switch", taskId: "t1", harness: "codex", model: "gpt-6.2-sol" },
      { t: "task_switch", taskId: "t1", harness: "codex", model: "gpt-6.2-sol", effort: "high" },
    ]);
  });

  test("its words, zh and en, the same keys as the Mac", () => {
    const zh = strings("zh");
    const en = strings("en");
    expect(zh.t("tune.reset")).toBe("回到默认");
    expect(en.t("tune.reset")).toBe("Back to default");
    expect(zh.t("tune.change.model")).toBe("换模型");
    expect(en.t("tune.back")).toBe("Back");
    expect(zh.t("tune.next.model", "GPT-6.2-Sol")).toBe("下一轮起用 GPT-6.2-Sol");
    expect(en.t("tune.next.model", "GPT-6.2-Sol")).toBe("From its next turn: GPT-6.2-Sol");
    expect(zh.t("tune.next.effort", zh.t("effort.high"))).toBe("下一轮起思考：高");
    expect(en.t("tune.next.effort", en.t("effort.high"))).toBe("From its next turn: High effort");
  });
});

describe("the one chip and its card (D387)", () => {
  test("the control's levels are the model's own, in its order; a model without levels has none", async () => {
    const { effortSteps, stepOf } = await import("../src/composer-tune.tsx");
    expect(effortSteps(codex.models[0]!)).toEqual(ULTRA);
    // Claude Code's Haiku 4.5 takes none (harness-facts): no control, no hidden levels shown.
    expect(effortSteps(codex.models[4]!)).toEqual([]);
    const luna = { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" };
    expect(effortSteps(luna)).not.toContain("ultra");
    expect(stepOf(ULTRA, "high")).toBe(2);
    expect(stepOf(ULTRA, "")).toBe(-1); // the agent's own unnamed default: no thumb
  });

  test("keys move it one level, Home and End to the ends, never past them", async () => {
    const { stepKey } = await import("../src/composer-tune.tsx");
    expect(stepKey("ArrowRight", 1, 6)).toBe(2);
    expect(stepKey("ArrowUp", 5, 6)).toBe(5);
    expect(stepKey("ArrowLeft", 0, 6)).toBe(0);
    expect(stepKey("ArrowDown", 3, 6)).toBe(2);
    expect(stepKey("Home", 4, 6)).toBe(0);
    expect(stepKey("End", 1, 6)).toBe(5);
    expect(stepKey("ArrowRight", -1, 5)).toBe(0);
    expect(stepKey("a", 1, 6)).toBeUndefined();
    expect(stepKey("ArrowRight", 0, 0)).toBeUndefined();
  });

  test("a drag or tap lands on the nearest dot", async () => {
    const { stepAt } = await import("../src/composer-tune.tsx");
    expect(stepAt(0, 250, 6)).toBe(0);
    expect(stepAt(250, 250, 6)).toBe(5);
    expect(stepAt(120, 250, 6)).toBe(2);
    expect(stepAt(130, 250, 6)).toBe(3);
    expect(stepAt(-40, 250, 6)).toBe(0);
    expect(stepAt(400, 250, 6)).toBe(5);
    expect(stepAt(50, 250, 1)).toBe(0);
  });

  test("Back to default: the model's own default, only when the agent names it and the task is off it", async () => {
    const { resetTo } = await import("../src/composer-tune.tsx");
    const sol = codex.models[0]!;
    expect(resetTo(sol, "high")).toBe("low");
    expect(resetTo(sol, "low")).toBeUndefined();
    // Claude Code lists no default level: nothing to go back to that Ducter could name.
    expect(resetTo({ id: "opus", label: "Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"] }, "high")).toBeUndefined();
    expect(resetTo({ id: "x", label: "X" }, "high")).toBeUndefined();
  });

  test("the chip's level mark: one to three bars by how high the level is", async () => {
    const { markBars } = await import("../src/composer-tune.tsx");
    expect([0, 1, 2, 3, 4, 5].map((i) => markBars(i, 6))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(markBars(-1, 6)).toBe(0);
  });

  test("switching from the card: an effort is the same model with that level; Back to default sends it by name", async () => {
    const { A, sent } = await setup(card({ model: "gpt-6.2-sol", effort: "high" }));
    A.newTaskOptions = { places: [], candidates: [], models: [codex] };
    const { resetTo } = await import("../src/composer-tune.tsx");
    const sol = codex.models[0]!;
    A.retuneTask("t1", "codex", sol.id, resetTo(sol, "high"));
    expect(sent.at(-1)).toEqual({ t: "task_switch", taskId: "t1", harness: "codex", model: "gpt-6.2-sol", effort: "low" });
  });
});

describe("a popover by the composer stays on the screen (D387)", () => {
  const view = { w: 390, h: 844 };
  const safe = { top: 47, right: 0, bottom: 34, left: 0 };
  test("over its anchor, start-aligned, inside the margin", async () => {
    const { placePop } = await import("../src/pop-place.ts");
    const p = placePop({ left: 20, top: 780, right: 160, bottom: 810 }, { w: 300, h: 260 }, view, safe);
    expect(p).toMatchObject({ side: "above", left: 20, width: 300 });
    expect(p.top).toBe(780 - 8 - 260);
  });
  test("the ring at the right edge: end-aligned and moved in, never past the left margin", async () => {
    const { placePop } = await import("../src/pop-place.ts");
    const p = placePop({ left: 230, top: 760, right: 262, bottom: 792 }, { w: 340, h: 380 }, view, safe, { align: "end" });
    expect(p.left).toBe(12);
    expect(p.left + p.width).toBeLessThanOrEqual(390 - 12);
    const narrow = placePop({ left: 300, top: 760, right: 332, bottom: 792 }, { w: 340, h: 380 }, { w: 360, h: 640 }, safe, { align: "end" });
    expect(narrow.width).toBe(336);
    expect(narrow.left).toBe(12);
  });
  test("taller than the room: it takes the side with more, capped to it, and scrolls inside", async () => {
    const { placePop } = await import("../src/pop-place.ts");
    const p = placePop({ left: 20, top: 300, right: 60, bottom: 330 }, { w: 300, h: 600 }, view, safe);
    expect(p.side).toBe("below");
    expect(p.maxH).toBe(844 - 34 - 12 - 330 - 8);
    expect(p.top + Math.min(600, p.maxH)).toBeLessThanOrEqual(844 - 34 - 12);
    const up = placePop({ left: 20, top: 780, right: 60, bottom: 810 }, { w: 300, h: 900 }, view, safe);
    expect(up.side).toBe("above");
    expect(up.top).toBeGreaterThanOrEqual(47 + 12);
  });
});
