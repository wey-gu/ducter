// D353: under an opened task's composer, its model and effort in plain words, always there while it
// can be switched: the model chip lists the agent's live models (D352), the effort chip that model's
// levels; a choice is the in-place switch (D282). Gone where it can't switch or there is no live list.
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

describe("the chips under the task's composer (D353)", () => {
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
    expect(zh.t("tune.effort", zh.t("effort.low"))).toBe("思考：低");
    expect(en.t("tune.effort", en.t("effort.low"))).toBe("Effort: Low");
    expect(zh.t("tune.next.model", "GPT-6.2-Sol")).toBe("下一轮起用 GPT-6.2-Sol");
    expect(en.t("tune.next.model", "GPT-6.2-Sol")).toBe("From its next turn: GPT-6.2-Sol");
    expect(zh.t("tune.next.effort", zh.t("effort.high"))).toBe("下一轮起思考：高");
    expect(en.t("tune.next.effort", en.t("effort.high"))).toBe("From its next turn: High effort");
  });
});
