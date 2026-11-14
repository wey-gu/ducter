// D257: Settings › 记忆 / Memory and › 你的其他 AI: where the memory stands, the one update worth
// saying, the Settings entry's line, when 你的其他 AI shows, the noted lines by when, and the words
// equal to the Mac's (apps/desktop/internal/i18n/memory.go). The same cases as the Mac's
// (apps/desktop/internal/views/memtab_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BridgeView, MemView } from "@ducter/protocol";
import { groupNoted, memBadge, memPhase, memUpdate, peersShown } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const b = (o: Partial<BridgeView>): BridgeView => ({ state: "connected", identity: "ducter", ...o });
const conn: MemView = { state: "connected", noted: [] };

describe("Memory (D257)", () => {
  test("where the memory stands", () => {
    expect(memPhase(false, conn, undefined)).toBe("off");
    expect(memPhase(true, undefined, undefined)).toBe("missing");
    expect(memPhase(true, conn, undefined)).toBe("on");
    expect(memPhase(true, { state: "missing", noted: [] }, b({ state: "install_mem" }))).toBe("install");
    expect(memPhase(true, undefined, b({ state: "signing_in" }))).toBe("signing_in");
    // An older Mem, or one answering from the computer itself, still remembers.
    expect(memPhase(true, undefined, b({ state: "update_mem" }))).toBe("on");
    expect(memPhase(true, undefined, b({ state: "local_mem" }))).toBe("on");
  });

  test("the one update worth saying, and the Settings entry's line", () => {
    const kind = (v?: BridgeView) => memUpdate(v)?.kind ?? "";
    expect(kind(undefined)).toBe("");
    expect(kind(b({}))).toBe("");
    const needed = memUpdate(b({ state: "update_mem", version: "0.10.116", canRun: true }));
    expect(needed).toMatchObject({ kind: "needed", canRun: true, version: "0.10.116", app: false });
    expect(memBadge(needed)).toBe("mem.badge.needed");
    const newer = memUpdate(b({ version: "0.10.118", newer: "0.10.121", upkeep: { kind: "update" } }));
    expect(newer).toMatchObject({ kind: "newer", newer: "0.10.121", version: "0.10.118" });
    expect(memBadge(newer)).toBe("mem.badge.newer");
    // Mem says a newer one is out, but the copy is the app's: said, with no button of Ducter's.
    expect(memUpdate(b({ newer: "" }))).toMatchObject({ kind: "app", newer: "" });
    expect(memBadge(memUpdate(b({ newer: "" })))).toBe("mem.badge.newer");
    expect(kind(b({ state: "ready", upkeep: { kind: "move" } }))).toBe("move");
    expect(memBadge(memUpdate(b({ state: "ready", upkeep: { kind: "move" } })))).toBe("");
    expect(kind(b({ state: "updating" }))).toBe("updating");
    expect(kind(b({ state: "ready", done: "updated" }))).toBe("done");
  });

  test("你的其他 AI shows once it means something (J6)", () => {
    const none = { reach: "own" as const, trusted: [], muted: [] };
    expect(peersShown(undefined, b({}), true)).toBe(false);
    expect(peersShown(none, undefined, false)).toBe(false);
    expect(peersShown(none, b({ state: "install_mem" }), false)).toBe(false);
    expect(peersShown(none, b({ state: "sign_in" }), false)).toBe(false);
    expect(peersShown(none, b({ state: "ready" }), false)).toBe(true);
    expect(peersShown(none, b({ state: "update_mem" }), false)).toBe(true);
    expect(peersShown(none, undefined, true)).toBe(true);
    expect(peersShown({ ...none, trusted: ["terminal-claude"] }, undefined, false)).toBe(true);
  });

  test("the noted lines by when: today, this week, earlier", () => {
    const now = new Date(2026, 10, 14, 15, 0, 0);
    const at = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
    const gs = groupNoted([{ at: at(1) }, { at: at(10) }, { at: at(26) }, { at: at(6 * 24) }, { at: at(9 * 24) }, { at: "?" }], now);
    expect(gs.map((g) => `${g.when}:${g.items.length}`)).toEqual(["today:2", "week:2", "earlier:2"]);
  });

  test("zh and en have the same keys, and the same words as the Mac", () => {
    expect(Object.keys(memoryWords.zh).sort()).toEqual(Object.keys(memoryWords.en).sort());
    const mac = readFileSync(new URL("../../desktop/internal/i18n/memory.go", import.meta.url), "utf8");
    const macKeys = [...mac.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1]);
    expect([...new Set(macKeys)].sort()).toEqual(Object.keys(memoryWords.zh).sort());
    for (const [k, v] of Object.entries({ ...memoryWords.zh, ...memoryWords.en })) expect(mac).toContain(`"${k}":`), expect(mac).toContain(JSON.stringify(v));
  });
});
