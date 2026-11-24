// D544: (1) a task in rounds keeps who it is while its long transcript is read: a slim line under
// the bar once the head is out of view, the Keep's lantern and 看守中, what waits for the person,
// when the next round comes and which round; nothing for an ordinary task. (2) On hand beside the
// conversation on one grid: Find on the pane's left edge at its width, the lead at the pane's
// heading size, a section's name on the rows' inner edge, an ask on that edge too, a row's mark on
// its title's first line. The browser walk is in .shots/onhand-two-pane/d544.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const now = new Date().toISOString();
const card = (id: string, title: string, attention: string, extra: object = {}) => ({
  taskId: id,
  persona: "default",
  title,
  project: "nowledge-co",
  place: { kind: "none" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: now,
  updatedAt: now,
  ...extra,
});

async function home() {
  const { A } = await import("../src/app.ts");
  const k = await import("../src/keep.tsx");
  const l = await import("../src/loop-line.tsx");
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  const next = new Date(Date.now() + 40 * 60_000).toISOString();
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [
        card("t_review", "持续评审 nowledge-co，并处理 100gle 分给你的待办", "blocked", { rounds: { everyMs: 45 * 60_000, nextAt: next }, keep: { id: "kp_review", name: "持续评审" } }),
        card("t_loose", "每小时看一次 CI", "blocked", { rounds: { everyMs: 60 * 60_000, nextAt: next } }),
        card("t_plain", "整理本周 mem 的发布说明", "working"),
      ],
      counts: { needs_you: 0, working: 1, waiting: 2, done_today: 0 },
      waiters: [],
      keeps: [{ id: "kp_review", title: "持续评审", run: "same", life: "on", taskIds: ["t_review"], items: [], wakes: [{ kind: "every" }], asks: 1, everyMs: 45 * 60_000, nextAt: next, week: 20, since: now }],
    },
  } as any);
  return { A, k, l, task: (id: string) => A.S.tasks.get(id)! };
}

describe("a task in rounds keeps who it is (D544)", () => {
  test("a Keep's round task: 看守中, what waits for you, the next round, and which round once its page is read", async () => {
    const { k, l, task } = await home();
    const f = l.loopFacts(task("t_review"))!;
    expect(f.keep).toBe("kp_review");
    expect(f.words[0]).toBe("看守中");
    expect(f.words.some((w) => w.startsWith("下一轮"))).toBe(true);
    expect(f.needs).toBe("1 个在等你");
    expect(f.round).toBeUndefined();
    k.K.pages.set("kp_review", { rounds: Array.from({ length: 302 }, () => ({})) } as never);
    expect(l.loopFacts(task("t_review"))!.round).toBe(302);
    k.K.pages.delete("kp_review");
  });
  test("a task in rounds without a Keep says its rhythm and next round; an ordinary task nothing", async () => {
    const { l, task } = await home();
    const f = l.loopFacts(task("t_loose"))!;
    expect(f.keep).toBeUndefined();
    expect(f.words[0]).toBe("每 1 小时 一轮".replace("1 小时 ", "1 小时")) ;
    expect(l.loopFacts(task("t_plain"))).toBeUndefined();
  });
  test("the line takes no tap while the head is in view, and comes in by the enter motion", () => {
    expect(css).toMatch(/\.fact-pill \{[^}]*opacity: 0;[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.fact-pill\.on \{[^}]*opacity: 1;[^}]*pointer-events: auto;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n  \.fact-pill \{/);
  });
});

describe("On hand beside the conversation on one grid (D544)", () => {
  test("Find on the left edge at the pane's width; the brief as the phone's grid; the lead at lg", () => {
    expect(css).toMatch(/\.room-side \.strip-row \.find \{\n  flex: 1 1 100%;/);
    expect(css).toMatch(/\.room-side \.oh-head\.oh-brief \{\n  display: grid;\n  grid-template-columns: 56px minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.room-side \.oh-head\.oh-brief \.oh-say \{\n  font-size: var\(--lg\);/);
  });
  test("a section's name and an ask on the rows' inner edge (16); a row's mark on its title's first line", () => {
    expect(css).toMatch(/\.onhand-list\.room-side \.tsec h3,\n\.onhand-list\.room-phone \.tsec h3 \{\n  padding-left: 16px;/);
    expect(css).toMatch(/\.onhand-list\.room-side \.decision \{\n  padding-left: 16px;\n  padding-right: 16px;/);
    expect(css).toMatch(/\.onhand-list\.room-side \.ocard \.omark,\n\.onhand-list\.room-phone \.ocard \.omark \{\n  align-self: start;/);
  });
});
