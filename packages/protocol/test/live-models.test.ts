// D352: the model list is the agent's own, live; the registry supplies what Ducter has checked
// (windows), and a model newer than this Ducter comes in with the agent's own facts, marked fresh.
import { expect, test } from "bun:test";
import { HARNESS_FACTS, liveModels, parseCodexCatalog, resolveModel, versionStanding, windowKnobs } from "../src/harness-facts.ts";

/** `codex debug models` on codex-cli 0.169.1 (2026-11-18), trimmed to what Ducter reads. */
const DEBUG_MODELS = `{"models":[
 {"slug":"gpt-6.2-sol","context_window":500000,"default_reasoning_level":"low","visibility":"list","supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"},{"effort":"max"},{"effort":"ultra"}]},
 {"slug":"gpt-6.2-astra","context_window":272000,"default_reasoning_level":"low","visibility":"list","supported_reasoning_levels":[{"effort":"low"},{"effort":"ultra"}]},
 {"slug":"gpt-7-nova","context_window":640000,"default_reasoning_level":"medium","visibility":"list","supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"}]},
 {"slug":"gpt-reserve","context_window":272000,"default_reasoning_level":"medium","visibility":"hide"},
 {"slug":"codex-auto-review","context_window":272000,"default_reasoning_level":"medium","visibility":"hide"}
]}`;

test("0.169.1 is verified, and the two new models are in the registry with their windows", () => {
  expect(versionStanding("codex", "codex-cli 0.169.1")).toBe("verified");
  expect(versionStanding("codex", "codex-cli 0.170.0")).toBe("newer");
  expect(HARNESS_FACTS.codex.models.value["gpt-6.2-sol"]).toEqual({ id: "gpt-6.2-sol", window: 500_000 });
  expect(HARNESS_FACTS.codex.models.value["gpt-6.2-astra"]).toEqual({ id: "gpt-6.2-astra", window: 272_000 });
  expect(HARNESS_FACTS.codex.models.evidence).toMatchObject({ kind: "VERIFIED", version: "0.169.1" });
});

test("the catalog parse leaves hidden models out and keeps each one's window and efforts", () => {
  const cat = parseCodexCatalog(`some banner\n${DEBUG_MODELS}`);
  expect(Object.keys(cat)).toEqual(["gpt-6.2-sol", "gpt-6.2-astra", "gpt-7-nova"]);
  expect(cat["gpt-7-nova"]).toEqual({ window: 640_000, defaultEffort: "medium", efforts: ["low", "medium"] });
  expect(parseCodexCatalog("not json")).toEqual({});
  expect(parseCodexCatalog("")).toEqual({});
});

test("merge: the list decides which models; the registry its windows; a new one takes Codex's and is marked fresh", () => {
  const listed = [
    { id: "gpt-7-nova", label: "GPT-7-Nova" }, // newer than this Ducter: no efforts in the list either
    { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ["low", "ultra"], defaultEffort: "low" },
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", default: true as const },
  ];
  const out = liveModels("codex", listed, parseCodexCatalog(DEBUG_MODELS));
  expect(out.map((m) => m.id)).toEqual(["gpt-7-nova", "gpt-6.2-sol", "gpt-6.1-terra"]);
  expect(out[0]).toEqual({ id: "gpt-7-nova", label: "GPT-7-Nova", efforts: ["low", "medium"], defaultEffort: "medium", window: 640_000, fresh: true });
  // Known: the registry's window, the list's own efforts kept (never the catalog's), not fresh.
  expect(out[1]).toEqual({ id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: ["low", "ultra"], defaultEffort: "low", window: 500_000 });
  expect(out[2]).toMatchObject({ window: 500_000, default: true });
  expect(out[2]!.fresh).toBeUndefined();
  // A hidden model never comes in through the catalog: only the list adds models.
  expect(out.some((m) => m.id === "gpt-reserve")).toBe(false);
  // No catalog (it couldn't be read): a new model is still listed, fresh, with no window.
  expect(liveModels("codex", [{ id: "gpt-7-nova", label: "GPT-7-Nova" }])).toEqual([{ id: "gpt-7-nova", label: "GPT-7-Nova", fresh: true }]);
  // pi names every model by its own catalog: none is "new".
  expect(liveModels("pi", [{ id: "anthropic/claude-haiku-4-5", label: "Haiku" }])[0]!.fresh).toBeUndefined();
});

test("a model said the way people say it becomes the agent's id", () => {
  const list = Object.keys(HARNESS_FACTS.codex.models.value).map((id) => ({ id, label: id }));
  expect(resolveModel("codex", "6.2 sol", list)).toEqual({ id: "gpt-6.2-sol" });
  expect(resolveModel("codex", "GPT-6.2-Sol", list)).toEqual({ id: "gpt-6.2-sol" });
  expect(resolveModel("codex", "6.2sol", list)).toEqual({ id: "gpt-6.2-sol" });
  expect(resolveModel("codex", "6.2 astra", list)).toEqual({ id: "gpt-6.2-astra" });
  expect(resolveModel("codex", "6 sol", list)).toEqual({ id: "gpt-6-sol" }); // not gpt-5.6-sol
  expect(resolveModel("codex", "sol", list)).toMatchObject({ ambiguous: expect.arrayContaining(["gpt-6.2-sol", "gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol"]) });
  expect(resolveModel("codex", "gpt-9", list)).toMatchObject({ none: expect.arrayContaining(["gpt-6.2-sol"]) });
  // No live list: the registry's ids.
  expect(resolveModel("codex", "6.2 sol")).toEqual({ id: "gpt-6.2-sol" });
  // The live list's labels count too ("GPT-6.1 Terra").
  expect(resolveModel("codex", "gpt 6.1 terra", [{ id: "gpt-6.1-terra", label: "GPT-6.1 Terra" }])).toEqual({ id: "gpt-6.1-terra" });
  expect(resolveModel("claude-code", "Opus", [{ id: "opus", label: "Opus 5.5" }, { id: "sonnet", label: "Sonnet 5.5" }])).toEqual({ id: "opus" });
  // An empty registry and no list: nothing to check against.
  expect(resolveModel("pi", "anthropic/claude-haiku-4-5")).toEqual({ none: [] });
});

test("Codex never gets a window above its model's own (the registry's, else the one Codex listed)", () => {
  const big = { window: 400_000, compactAt: 320_000 };
  expect(windowKnobs("codex", big, "gpt-6.2-astra").args).toEqual(["-c", "model_context_window=272000", "-c", "model_auto_compact_token_limit=272000"]);
  expect(windowKnobs("codex", big, "gpt-6.2-sol").args).toEqual(["-c", "model_context_window=400000", "-c", "model_auto_compact_token_limit=320000"]);
  expect(windowKnobs("codex", big, "gpt-7-nova", 300_000).args).toEqual(["-c", "model_context_window=300000", "-c", "model_auto_compact_token_limit=300000"]);
  // Unknown and unlisted: as asked. The default plan fits every model.
  expect(windowKnobs("codex", big, "gpt-7-nova").args).toEqual(["-c", "model_context_window=400000", "-c", "model_auto_compact_token_limit=320000"]);
  expect(windowKnobs("codex", { window: 200_000, compactAt: 160_000 }, "gpt-6.2-astra").args).toEqual(["-c", "model_context_window=200000", "-c", "model_auto_compact_token_limit=160000"]);
});
