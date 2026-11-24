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
  test("a bar too narrow for the trail says only the way up, the places one step away", () => {
    expect(css).toMatch(/@container bar \(max-width: 720px\) \{\n  \.top\.crumbs \.trail \{\n    display: none;\n  \}\n  \.top\.crumbs \.crumb-up \{\n    display: flex;/);
    expect(css).toMatch(/\.top\.crumbs \.acts \.places \{\n    display: none;/);
  });
});

describe("rounds that changed nothing fold (D544)", () => {
  // The Mac's TestQuietRounds, the same rounds: each a wake, its words, a review_report (a PR marked
  // changed in every eighth), its progress report.
  const rounds = (person?: number) => {
    const evs: object[] = [{ seq: 1, ts: "2026-11-24T00:00:00Z", persona: "default", stream: "task:t", origin: "partner", kind: "task_open", body: { taskId: "t", title: "loop", brief: "每 45 分钟看一次。" } }];
    for (let i = 0; i < 24; i++) {
      const seq = 10 + i * 5;
      const ts = (s: number) => new Date(Date.parse("2026-11-24T00:00:00Z") + i * 45 * 60_000 + s * 1000).toISOString();
      const loud = i % 8 === 3;
      evs.push(
        { seq, ts: ts(0), persona: "default", stream: "task:t", origin: "partner", kind: "task_event", body: { taskId: "t", role: "user", from: "partner", text: "到时间了：「45 分钟后复查」。接着做。" } },
        person === i
          ? { seq: seq + 1, ts: ts(20), persona: "default", stream: "task:t", origin: "user", kind: "task_event", body: { taskId: "t", role: "user", text: "先看 #551" } }
          : { seq: seq + 1, ts: ts(20), persona: "default", stream: "task:t", origin: "task", kind: "task_event", body: { taskId: "t", role: "assistant", text: "没有新的请求，9 个都没变。" } },
        { seq: seq + 2, ts: ts(40), persona: "default", stream: "task:t", origin: "task", kind: "task_event", body: { taskId: "t", role: "tool", tool: { name: "mcp__ducter__review_report", input: { prs: [{ ref: "o/r#1", changed: loud }, { ref: "o/r#2", changed: false }] } } } },
        { seq: seq + 3, ts: ts(60), persona: "default", stream: "task:t", origin: "task", kind: "report", body: { taskId: "t", state: "progress", summary: "没有新的请求，9 个都没变。", questions: [], evidence: [] } },
      );
    }
    return evs as never[];
  };
  test("from the structured outcome only: a changed PR, the person's words, the latest round stay", async () => {
    const { quietRuns } = await import("@ducter/protocol/src/transcript.ts");
    expect(quietRuns(rounds()).map((r) => r.keys.length)).toEqual([3, 7, 7, 2]);
    expect(quietRuns(rounds(5)).map((r) => r.keys.length)).toEqual([3, 5, 7, 2]);
    const r = quietRuns(rounds())[0]!;
    expect(r.keys).toEqual([10, 15, 20]);
    expect(r.from < r.to).toBe(true);
  });
  test("a run of done reports with no wake folds too, and words decide nothing", async () => {
    const { quietRuns } = await import("@ducter/protocol/src/transcript.ts");
    const rep = (seq: number, state: string, summary: string) => ({ seq, ts: `2026-11-24T0${seq % 10}:00:00Z`, persona: "default", stream: "task:t", origin: "task", kind: "report", body: { taskId: "t", state, summary, questions: [], evidence: [] } });
    const evs = [rep(1, "done", "改了很多东西"), rep(2, "done", "没有新的请求"), rep(3, "done", "没有新的请求"), rep(4, "needs_input", "要你定"), rep(5, "done", "x"), rep(6, "done", "y"), rep(7, "done", "z")] as never[];
    expect(quietRuns(evs).map((r) => r.keys)).toEqual([[1, 2, 3], [5, 6]]);
  });
});
