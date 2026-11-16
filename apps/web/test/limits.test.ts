// D297: a task resting on its agent's usage limit, on the web: every word in both languages (no
// " · " joins, D291), the state words from the wait itself (the reset, its grace minute left out),
// the row's line in the viewer's language, and On hand's group of tasks on one account.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";
import { limitWords } from "../src/i18n-limits.ts";

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const card = (id: string, title: string, harness = "claude-code") => ({ taskId: id, persona: "default", title, project: "hawdb", place: { kind: "none" }, harness, attention: "blocked", residency: "warm", openedAt: iso(now), updatedAt: iso(now) });
const wait = (id: string, harness: string, at: number, known: boolean, handTo?: string) => ({ waiterId: `w_${id}`, taskId: id, wakes: "task", reason: `${harness}'s limit resets`, state: "armed", at: iso(at), armedAt: iso(now - 30 * 60_000), limit: { harness, resetKnown: known, ...(handTo ? { handTo: { harness: handTo } } : {}) } });

async function home(lang: "zh" | "en") {
  const { A } = await import("../src/app.ts");
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  const reset = now + 92 * 60_000;
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [card("t1", "Run the WAL bench"), card("t2", "Sort out the review comments"), card("t3", "Update the changelog"), card("t4", "Pull the weekly numbers", "pi")],
      counts: { needs_you: 0, working: 0, waiting: 4, done_today: 0 },
      waiters: [wait("t1", "claude-code", reset + 60_000, true, "codex"), wait("t2", "claude-code", reset + 60_000, true, "codex"), wait("t3", "claude-code", reset + 60_000, true), wait("t4", "pi", now + 47 * 60_000, false)],
    },
  } as any);
  return { A, reset };
}

test("every limit word in zh and en, the same keys, never a dot join", () => {
  expect(Object.keys(limitWords.zh).sort()).toEqual(Object.keys(limitWords.en).sort());
  for (const v of [...Object.values(limitWords.zh), ...Object.values(limitWords.en)]) expect(v).not.toContain(" · ");
  const zh = strings("zh");
  const en = strings("en");
  expect(zh.t("limit.back", "3:12")).toBe("额度 3:12 恢复，到时接着做");
  expect(en.t("limit.back", "3:12")).toBe("The limit resets at 3:12, and it carries on then");
  expect(zh.t("limit.handoff", "Codex")).toBe("现在换 Codex 接着做");
  expect(en.t("limit.handoff", "Codex")).toBe("Hand it to Codex now");
  expect(zh.t("limit.cancel")).toBe("先停下");
  // D291: the hairlines say the fact; their times are drawn apart.
  expect(en.t("note.limit", "Claude Code")).toBe("Claude Code's limit ran out");
  expect(zh.t("wake.limit", "Claude Code")).toBe("Claude Code 的额度恢复了，接着做");
});

describe("a limit wait's words", () => {
  test("the state says the reset, without its grace minute; with no reset, that it waits", async () => {
    const { A, reset } = await home("zh");
    const w = await import("../src/work.tsx");
    const { clock } = await import("../src/format.ts");
    const w1 = A.S.waiterFor("t1")!;
    expect(w.limitAt(w1)).toBe(iso(reset));
    expect(w.limitState(w1)).toBe(`额度 ${clock(iso(reset))} 恢复`);
    expect(w.backWords(w1)).toBe(`额度 ${clock(iso(reset))} 恢复`);
    expect(w.limitState(A.S.waiterFor("t4")!)).toBe("等额度恢复");
  });

  test("the row's line names whose limit, in the viewer's language", async () => {
    const { A } = await home("en");
    const o = await import("../src/onhand.tsx");
    expect(o.storyOf(A.S.tasks.get("t1")!).words).toBe("Waiting until Claude Code's limit resets");
    expect(o.storyOf(A.S.tasks.get("t4")!).words).toBe("Waiting until pi's limit resets");
    const { A: Z } = await home("zh");
    expect(o.storyOf(Z.S.tasks.get("t1")!).words).toBe("等 Claude Code 的额度恢复");
    expect(o.waitNext(Z.S.waiterFor("t1")).text).toMatch(/^额度 .+ 恢复$/);
  });

  test("On hand groups the tasks on one account (two or more), a known reset over a next try", async () => {
    const { A } = await home("en");
    const o = await import("../src/onhand.tsx");
    const tasks = ["t1", "t2", "t3", "t4"].map((id) => A.S.tasks.get(id)!);
    const g = o.groupLimits(tasks);
    expect(g).toHaveLength(1);
    expect(g[0]!.harness).toBe("claude-code");
    expect(g[0]!.tasks.map((x) => x.id)).toEqual(["t1", "t2", "t3"]);
    expect(g[0]!.w.limit!.resetKnown).toBe(true);
    expect(o.groupLimits(tasks.slice(3))).toEqual([]);
  });
});

test("the transcript's limit line and the wake that follows (shared with the Mac through the fixture)", async () => {
  const { blocksOf } = await import("@ducter/protocol/src/transcript.ts");
  const cases = (await import("@ducter/protocol/fixtures/transcript.json")).default as { name: string; harness: string; working: boolean; events: any[] }[];
  const c = cases.find((x) => x.name.startsWith("a usage limit overnight"))!;
  const blocks = blocksOf(c.harness, c.events, c.working);
  expect(blocks.find((b) => b.k === "note")).toMatchObject({ say: "limit", name: "Claude Code", at: "2026-11-10T19:00:00.000Z" });
  expect(blocks.some((b) => b.k === "note" && (b as { bad?: boolean }).bad)).toBe(false);
  expect(blocks.find((b) => b.k === "wake")).toMatchObject({ text: "Claude Code", limit: true });
});
