// What the author hit on real machines (2026-11-10): an AI agent's update said 没更新成 · 没有更新的
// 版本 after it had updated; Try it's footer said "这是  上的浏览器"; a zh card showed English notes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { DeviceHarness } from "@ducter/protocol";
import { withoutStaleAgentUpdate } from "../src/format.ts";
import { strings, usedArgs } from "../src/i18n.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const pi = (version: string, update: DeviceHarness["update"]): DeviceHarness => ({ harness: "pi", installed: true, loggedIn: true, canBePartner: true, version, how: "npm", ...(update ? { update } : {}) });

describe("an agent's update, judged against the version there now", () => {
  test("nothing newer is never a failure; on the target it is done; moved on, it's gone", () => {
    const at = "2026-11-10T09:00:00Z";
    expect(withoutStaleAgentUpdate(pi("1.5.1", { phase: "failed", from: "1.5.1", to: "1.5.1", reason: "no_update", at })).update).toMatchObject({ phase: "done", to: "1.5.1" });
    expect(withoutStaleAgentUpdate(pi("1.5.0", { phase: "failed", from: "1.5.0", to: "1.5.1", reason: "no_update", at })).update).toBeUndefined();
    expect(withoutStaleAgentUpdate(pi("1.5.0", { phase: "failed", from: "1.5.0", to: "1.5.1", reason: "unchanged", at })).update).toMatchObject({ phase: "failed" });
    expect(withoutStaleAgentUpdate(pi("1.5.2", { phase: "failed", from: "1.5.0", to: "1.5.1", reason: "unchanged", at })).update).toBeUndefined();
    expect(withoutStaleAgentUpdate(pi("1.5.0", { phase: "done", from: "1.5.0", to: "1.5.1", at })).update).toBeUndefined();
    expect(withoutStaleAgentUpdate(pi("1.5.0", { phase: "updating", from: "1.5.0", to: "1.5.1", at })).update).toMatchObject({ phase: "updating" });
  });
});

describe("no placeholder drawn empty", () => {
  test("the preloaded guard (test/guard.ts) throws for a printed one, not for an unprinted one", () => {
    const zh = strings("zh");
    expect(() => zh.t("live.try.note", "")).toThrow("live.try.note");
    expect(zh.t("live.try.note", "hel")).toContain("hel");
    expect(usedArgs("%[2]s only", 2)).toEqual([false, true]);
    expect(usedArgs("%d%% of %s", 2)).toEqual([true, true]);
  });

  test("the live view never fills a sentence with a maybe-empty name", () => {
    // `t("…", x ?? "")` is how "这是  上的浏览器" got drawn: name the device (liveDevice) instead.
    expect(src("views.tsx").match(/\bt\("live\.[^"]+",[^)]*\?\?\s*""\)/g) ?? []).toEqual([]);
  });
});

describe("what's new is in the reader's language", () => {
  test("the card reads notesBy for its own language; the English notes list is gone", () => {
    const card = src("devcard.tsx");
    expect(card).toContain("notesBy?.[A.L.lang]");
    expect(card).not.toMatch(/\bu\.notes\b/);
  });
});
