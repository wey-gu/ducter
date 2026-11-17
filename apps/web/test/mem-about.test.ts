// D321: what it knows about you (groups by Mem's kind, each line's source) and 连上的 AI agent's 试试看
// (which agents can hear the words, the live row). The Mac has the same rules (apps/desktop/internal/views/memory.go).
import { describe, expect, test } from "bun:test";
import { aboutGroups, bySource, FIRST_FRESH_MS, handoffPhase, tryAgents } from "../src/mem-view.ts";

describe("What it knows about you (D321)", () => {
  test("groups in a fixed order, empty kinds left out", () => {
    const g = aboutGroups([
      { id: "a", kind: "fact" as const },
      { id: "b", kind: "preference" as const },
      { id: "c", kind: "preference" as const },
    ]);
    expect(g.map((x) => `${x.kind}:${x.items.map((i) => i.id).join("")}`)).toEqual(["preference:bc", "fact:a"]);
    expect(aboutGroups([])).toEqual([]);
  });

  test("each line's source", () => {
    expect(bySource({ by: "said" })).toEqual({ key: "mem.by.said", args: [] });
    expect(bySource({ by: "tool", from: "Codex" })).toEqual({ key: "mem.by.tool", args: ["Codex"] });
    expect(bySource({ by: "tool" })).toEqual({ key: "mem.by.you", args: [] });
    expect(bySource({ by: "mem" })).toEqual({ key: "mem.by.mem", args: [] });
  });

  test("the live row: waiting, then it worked for a while, then nothing", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(handoffPhase(undefined, now)).toBe("waiting");
    expect(handoffPhase(new Date(now - 60_000).toISOString(), now)).toBe("first");
    expect(handoffPhase(new Date(now - FIRST_FRESH_MS - 1).toISOString(), now)).toBe("none");
  });

  test("which agents can hear the words: signed in somewhere, Mem's plugin in it, else where to put it (the home first)", () => {
    const h = (harness: string, mem?: string, loggedIn = true) => ({ harness, installed: true, loggedIn, ...(mem ? { mem: { state: mem } } : {}) });
    const a = tryAgents([
      { id: "mb", name: "MacBook", harnesses: [h("claude-code", "installed"), h("codex", "absent")] },
      { id: "mini", name: "Mac mini", home: true, harnesses: [h("codex", "absent")] },
    ]);
    expect(a).toEqual([{ harness: "claude-code", plugin: "on" }, { harness: "codex", plugin: "off", device: "mini" }]);
    expect(tryAgents([{ id: "x", name: "x", harnesses: [h("codex")] }])).toEqual([{ harness: "codex" }]);
    expect(tryAgents([{ id: "x", name: "x", harnesses: [h("codex", "installed", false)] }])).toEqual([]);
  });
});
