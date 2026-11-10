// D135: the harness facts registry and the small-window settings built on it.
import { expect, test } from "bun:test";
import { HARNESS_IDS } from "../src/harnesses.ts";
import { claudeCompactPct, HARNESS_FACTS, modelForWindow, parseTokens, resolveWindows, saveBeforeAt, versionStanding, WINDOW_DEFAULTS, windowKnobs } from "../src/harness-facts.ts";

test("every harness has facts, each with evidence", () => {
  for (const h of HARNESS_IDS) {
    const f = HARNESS_FACTS[h];
    expect(f.harness).toBe(h);
    for (const k of ["models", "windowKnob", "compactAtKnob", "defaultCompactAt", "preCompactHook", "compactionEvents", "contextReport", "toolSearch", "resume", "browser"] as const) {
      expect(["VERIFIED", "DOCUMENTED", "INFERRED"]).toContain(f[k].evidence.kind);
    }
  }
});

test("Claude Code's compaction point: the percentage lands the threshold on the asked number", () => {
  // threshold = min(floor((W - 20K) x pct/100), W - 33K) (2.1.319 binary)
  const pct = claudeCompactPct(200_000, 160_000)!;
  expect(Math.min(Math.floor(180_000 * (pct / 100)), 167_000)).toBe(160_000);
  expect(claudeCompactPct(200_000, 200_000)).toBeUndefined(); // the default point (167K) is lower already
  expect(claudeCompactPct(200_000, 167_000)).toBeUndefined();
});

test("knobs per harness", () => {
  expect(windowKnobs("claude-code", { window: 200_000, compactAt: 160_000 }).env).toMatchObject({ CLAUDE_CODE_DISABLE_1M_CONTEXT: "1", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" });
  expect(windowKnobs("claude-code", { window: 50_000, compactAt: 40_000 }).env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("100000"); // clamped to its range
  expect(windowKnobs("claude-code", { window: 500_000, compactAt: 400_000 }).env.CLAUDE_CODE_DISABLE_1M_CONTEXT).toBeUndefined();
  expect(windowKnobs("codex", { window: 200_000, compactAt: 160_000 }).args).toEqual(["-c", "model_context_window=200000", "-c", "model_auto_compact_token_limit=160000"]);
  expect(windowKnobs("pi", { window: 200_000, compactAt: 160_000 }).unbounded).toBe(true);
  expect(windowKnobs("deepseek-harness", { window: 200_000, compactAt: 160_000 }).unbounded).toBe(true);
});

test("model ids: aliases as concrete ids, never a 1M variant on a standard window", () => {
  expect(modelForWindow("claude-code", "opus", 200_000)).toBe("claude-opus-5-5");
  expect(modelForWindow("claude-code", "sonnet[1m]", 200_000)).toBe("claude-sonnet-5-5");
  expect(modelForWindow("claude-code", "opus[1m]", 1_000_000)).toBe("claude-opus-5-5[1m]");
  expect(modelForWindow("claude-code", undefined, 200_000)).toBeUndefined();
  expect(modelForWindow("codex", "gpt-6.1-sol", 200_000)).toBe("gpt-6.1-sol");
});

test("settings: defaults, env over the file, out-of-range values named and not used", () => {
  expect(resolveWindows(undefined, {})).toEqual({ windows: WINDOW_DEFAULTS, problems: [] });
  expect(WINDOW_DEFAULTS).toEqual({ partner: { window: 200_000, recutAt: 120_000, compactAt: 200_000 }, tasks: { window: 200_000, compactAt: 160_000 } });
  const r = resolveWindows({ tasks: { window: 300_000 } }, { DUCTER_TASK_COMPACT_AT: "200k", DUCTER_PARTNER_RECUT_AT: "100000" });
  expect(r.windows.tasks).toEqual({ window: 300_000, compactAt: 200_000 });
  expect(r.windows.partner.recutAt).toBe(100_000);
  expect(resolveWindows({ tasks: { window: 300_000 } }).windows.tasks.compactAt).toBe(240_000); // 80% when unset
  const bad = resolveWindows({ partner: { window: 2_000_000, recutAt: 5 }, tasks: { compactAt: 250_000 } }, { DUCTER_TASK_WINDOW: "abc" });
  expect(bad.windows).toEqual(WINDOW_DEFAULTS);
  expect(bad.problems).toHaveLength(4);
  // The partner's cap can't sit at or below the re-cut.
  expect(resolveWindows({ partner: { recutAt: 150_000, compactAt: 140_000 } }).windows.partner.compactAt).toBe(200_000);
  expect(parseTokens("1m")).toBe(1_000_000);
  expect(parseTokens("-5")).toBeUndefined();
  expect(saveBeforeAt(160_000)).toBe(140_000);
});

test("versions against the verified range", () => {
  expect(versionStanding("claude-code", "2.1.319 (Claude Code)")).toBe("verified");
  expect(versionStanding("claude-code", "2.1.322 (Claude Code)")).toBe("verified"); // re-verified live (D175 (2))
  expect(versionStanding("claude-code", "2.1.323 (Claude Code)")).toBe("newer");
  expect(versionStanding("pi", "1.5.1")).toBe("verified");
  expect(versionStanding("pi", "1.5.2")).toBe("newer");
  expect(versionStanding("codex", "codex-cli 0.160.0")).toBe("older");
  expect(versionStanding("codex", "garbage")).toBe("unknown");
  expect(versionStanding("deepseek-harness", "1.0.0")).toBe("unknown"); // never verified
});
