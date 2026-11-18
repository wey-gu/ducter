// D352: 换谁来做 / Switch who does it on a Codex task offers the models Codex lists now (two it
// added overnight among them) with their own default effort, no Ducter release needed; the model
// a task is on is always a chip, even past the row's first eight; a pick switches in place.
import { describe, expect, test } from "bun:test";
import { inPlaceTune } from "../src/format.ts";
import { strings } from "../src/i18n.ts";

const ULTRA = ["low", "medium", "high", "xhigh", "max", "ultra"];
/** Codex 0.169.1's row as the home sends it (task_new_options): eight, the person's default marked. */
const codex = {
  harness: "codex",
  from: "live" as const,
  models: [
    { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", suggested: true as const, default: true as const, efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: ULTRA, defaultEffort: "low" },
    { id: "gpt-6-astra", label: "GPT-6-Astra", efforts: ULTRA, defaultEffort: "medium" },
    { id: "gpt-6-sol", label: "GPT-6-Sol", efforts: ULTRA, defaultEffort: "medium" },
    { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: ULTRA.slice(0, 5), defaultEffort: "medium" },
    { id: "gpt-5.6-sol", label: "GPT-5.6-Sol", efforts: ULTRA, defaultEffort: "low" },
  ],
};

describe("the in-place Model and Effort rows (D282, D352)", () => {
  test("a Codex task on its own default: the new models are chips; its default chosen, at its default effort", () => {
    const tu = inPlaceTune([codex], "codex", undefined, undefined, undefined)!;
    expect(tu.models.slice(0, 2).map((m) => m.label)).toEqual(["GPT-6.2-Sol", "GPT-6.2-Astra"]);
    expect(tu.model?.id).toBe("gpt-6.1-terra");
    expect(tu.effort).toBe("low");
  });

  test("on gpt-6.2-sol: chosen, at its own default effort; a picked effort wins", () => {
    expect(inPlaceTune([codex], "codex", undefined, "gpt-6.2-sol", undefined)).toMatchObject({ model: { id: "gpt-6.2-sol" }, effort: "low" });
    expect(inPlaceTune([codex], "codex", undefined, "gpt-6.2-sol", "high")?.effort).toBe("high");
  });

  test("on a model past the row (gpt-5.6-luna): still a chip, chosen; no effort row to offer for it", () => {
    const tu = inPlaceTune([codex], "codex", undefined, "gpt-5.6-luna", undefined)!;
    expect(tu.models.at(-1)).toEqual({ id: "gpt-5.6-luna", label: "gpt-5.6-luna" });
    expect(tu.model?.id).toBe("gpt-5.6-luna");
    expect(tu.model?.efforts).toBeUndefined();
  });

  test("no live list (Ducter's tier table only): no in-place rows", () => {
    expect(inPlaceTune([{ ...codex, from: "tiers" }], "codex", undefined, undefined, undefined)).toBeUndefined();
    expect(inPlaceTune([], "codex", undefined, undefined, undefined)).toBeUndefined();
  });

  test("its words, zh and en", () => {
    expect(strings("zh").t("switch.tune.note", "Codex")).toContain("Codex");
    expect(strings("en").t("switch.tune.note", "Codex")).toContain("Codex");
  });
});
