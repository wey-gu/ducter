// D661 (research/245 §3.3): every web surface reads the snapshot's one truth. The counts are
// core's lists, the head says what needs the person, a row says what it waits for, a raw report is
// the task's own words (它说 / It said), a PR shown under its holder is not a second row, and the
// other holders of a PR are their own facts.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const PROJECT = "github.com/nowledge-co/mem";

const card = (id: string, attention: string, o: Record<string, unknown> = {}) => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  project: "",
  place: { kind: "none" as const },
  harness: "claude-code",
  attention,
  residency: "hot",
  openedAt: iso(-60 * 60_000),
  updatedAt: iso(-5 * 60_000),
  ...o,
});
const truth = (state: string, o: Record<string, unknown> = {}) => ({ state, since: iso(-5 * 60_000), ...o });
const holders = [
  { role: "author", harness: "antigravity", device: "haswell" },
  { role: "review", keep: "Mem PR Babysitter" },
  { role: "handoff", to: "Antigravity" },
];

/** hel's 15:18 board as the snapshot now sends it: the truth lists and the cards together. */
async function home(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  const question = lang === "zh" ? "这个 PR 要不要合并？" : "Should this PR merge?";
  const raw = lang === "zh" ? "写完了。" : "Written.";
  const tasks = [
    // A live card says working, but the snapshot's truth says the person is owed an answer.
    card("n1", "working", { title: lang === "zh" ? "复审这个 PR" : "Review the PR", projectKey: PROJECT, projectName: "mem", waitsFor: question, truth: truth("needs_you", { waitsFor: question }) }),
    card("w1", "working", { title: lang === "zh" ? "跑测试" : "Run the tests", truth: truth("working") }),
    // The PR's holder: the row that names the other holders.
    card("h1", "working", { title: lang === "zh" ? "接手 #11389" : "Take over #11389", holders, truth: truth("working") }),
    card("wa1", "blocked", { title: lang === "zh" ? "等 CI" : "Wait for CI", truth: truth("waiting", { wait: { name: "CI" } }) }),
    // A fresh stop: the row rests in 等结果 for its half hour (D467), never 等你 yet.
    card("st1", "blocked", { title: lang === "zh" ? "停下的" : "Stopped one", truth: truth("stopped") }),
    card("d1", "done", {
      title: lang === "zh" ? "做完的" : "Done today",
      updatedAt: iso(-60_000),
      gist: { text: lang === "zh" ? "做完了。" : "Done.", at: iso(-60_000), reportSeq: 99 },
      lastReport: { taskId: "d1", state: "done", summary: raw, questions: [], evidence: [] },
      truth: truth("done"),
    }),
    // No gist yet: the report is shown as the task's own words.
    card("raw1", "done", {
      title: lang === "zh" ? "没 gist 的" : "No gist yet",
      open: { language: lang },
      lastReport: { taskId: "raw1", state: "done", summary: raw, questions: [], evidence: [] },
      truth: truth("done"),
    }),
    // Its PR is shown under h1's row: this card is never a row of its own.
    card("held1", "working", { title: lang === "zh" ? "同一个 PR" : "The same PR", heldUnder: { ref: "nowledge-co/mem#11389", taskId: "h1" } }),
  ];
  const counts = { needs_you: 1, working: 2, waiting: 1, done_today: 1 };
  A.receive({
    t: "on_hand",
    onHand: {
      tasks,
      counts,
      waiters: [],
      groups: [],
      truth: {
        needsYou: [{ state: "needs_you", taskId: "n1", projectKey: PROJECT, waitsFor: question, since: iso(-5 * 60_000) }],
        working: [truth("working", { taskId: "w1" }), truth("working", { taskId: "h1", attrs: holders })],
        waiting: [truth("waiting", { taskId: "wa1", wait: { name: "CI" } })],
        stopped: [truth("stopped", { taskId: "st1" })],
        done: [truth("done", { taskId: "d1", doneToday: true }), truth("done", { taskId: "raw1", doneToday: false })],
        failed: [],
        asOf: 42,
        at: iso(0),
      },
    },
  } as never);
  return { A, o, counts };
}

describe("D661: the web reads the snapshot's one truth", () => {
  test("the four counts are the snapshot's lists, in a lens too", async () => {
    const { A, o, counts } = await home("zh");
    expect(o.stateCounts("")).toEqual([counts.needs_you, counts.working, counts.waiting, counts.done_today]);
    // A project lens filters by projectKey; Other keeps what has none.
    expect(o.stateCounts(PROJECT)).toEqual([1, 0, 0, 0]);
    expect(o.stateCounts(o.OTHER)).toEqual([0, 2, 1, 1]);
    A.S.tasks.clear();
  });

  test("the head says needs-you, the row says what it waits for, and a gist is the person's line", async () => {
    const { A, o } = await home("zh");
    expect(o.headLine("")).toBe(A.L.t("onhand.say.needs.one"));
    expect(o.storyOf(A.S.tasks.get("n1")!).words).toBe("这个 PR 要不要合并？");
    expect(o.storyOf(A.S.tasks.get("d1")!).words).toBe("做完了。");
    expect(o.storyOf(A.S.tasks.get("d1")!).tone).not.toBe("said");
    A.S.tasks.clear();
  });

  test("a report with no gist is the task's words: 它说, in the said ink", async () => {
    const { A, o } = await home("zh");
    const s = o.storyOf(A.S.tasks.get("raw1")!);
    expect(s.words).toBe(A.L.t("onhand.said", "写完了。"));
    expect(s.words).toContain("它说");
    expect(s.tone).toBe("said");
    A.S.tasks.clear();
  });

  test("a held-under card is not a lane of its own, and each holder is its own fact", async () => {
    const { A, o } = await home("zh");
    const ids = A.S.board().lanes.flat().map((x) => x.id);
    expect(ids).not.toContain("held1");
    expect(o.lensLanes("").flat().map((x) => x.id)).not.toContain("held1");
    const meta = o.whereMeta(A.S.tasks.get("h1")!);
    expect(meta).toContain("作者：haswell 上的 Antigravity");
    expect(meta).toContain("复审：Mem PR Babysitter");
    expect(meta).toContain("交给：Antigravity");
    expect(meta.some((m) => m.includes(" · "))).toBe(false);
    A.S.tasks.clear();
  });

  test("the same lines in English", async () => {
    const { A, o } = await home("en");
    expect(o.headLine("")).toBe("One thing needs you.");
    expect(o.storyOf(A.S.tasks.get("raw1")!).words).toBe("It said: Written.");
    const meta = o.whereMeta(A.S.tasks.get("h1")!);
    expect(meta).toContain("By Antigravity on haswell");
    expect(meta).toContain("Review: Mem PR Babysitter");
    expect(meta).toContain("Handed to Antigravity");
    A.S.tasks.clear();
  });
});

describe("D661 turn 2: a stopped task that needs you", () => {
  test("stands as a stopped row with its fact, never a bare question", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    const { Store, attention } = await import("../src/store.ts");
    A.S = new Store();
    A.L = strings("zh");
    A.send = () => {};
    A.S.welcomed = true;
    const fact = "它停了 40 分钟，没说在等什么。";
    const c = card("sn1", "needs_you", {
      title: "核对数据迁移设计并补齐统一备份与恢复",
      updatedAt: iso(-40 * 60_000),
      truth: truth("needs_you", { needs: "stopped", waitsFor: fact }),
    });
    A.receive({
      t: "on_hand",
      onHand: {
        tasks: [c],
        counts: { needs_you: 1, working: 0, waiting: 0, done_today: 0 },
        waiters: [],
        groups: [],
        truth: {
          needsYou: [{ state: "needs_you", needs: "stopped", taskId: "sn1", waitsFor: fact, since: iso(-40 * 60_000) }],
          working: [],
          waiting: [],
          stopped: [],
          done: [],
          failed: [],
          asOf: 1,
          at: iso(0),
        },
      },
    } as never);
    const task = A.S.tasks.get("sn1")!;
    expect(attention(task)).toBe("blocked");
    expect(o.stoppedWait(task)).toBe(true);
    expect(o.storyOf(task).words).toBe(fact);
    expect(o.storyOf(task).words).not.toContain("停下吗");
    expect(o.stateCounts("")).toEqual([1, 0, 0, 0]);
    expect(o.headLine("")).toBe(A.L.t("onhand.line.stopped.one"));
    A.S.tasks.clear();
  });

  test("a failure is named failed, and a stop plus a failure says both", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    const { Store } = await import("../src/store.ts");
    A.S = new Store();
    A.L = strings("zh");
    A.send = () => {};
    A.S.welcomed = true;
    const fact = "它停了 40 分钟，没说在等什么。";
    const failed = [truth("failed", { taskId: "f1" }), truth("failed", { taskId: "f2" })];
    const stopNeeds = { state: "needs_you", needs: "stopped", taskId: "sn1", waitsFor: fact, since: iso(-40 * 60_000) };
    const boards = [
      { truth: { needsYou: [], working: [], waiting: [], stopped: [], done: [], failed, asOf: 1, at: iso(0) }, tasks: [card("f1", "failed", { truth: truth("failed") }), card("f2", "failed", { truth: truth("failed") })], want: A.L.t("onhand.line.failed", 2) },
      { truth: { needsYou: [stopNeeds], working: [], waiting: [], stopped: [], done: [], failed: [truth("failed", { taskId: "f1" })], asOf: 1, at: iso(0) }, tasks: [card("sn1", "needs_you", { updatedAt: iso(-40 * 60_000), truth: truth("needs_you", { needs: "stopped", waitsFor: fact }) }), card("f1", "failed", { truth: truth("failed") })], want: A.L.t("onhand.line.stopped.failed", 1, 1) },
    ];
    for (const b of boards) {
      A.receive({ t: "on_hand", onHand: { tasks: b.tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], groups: [], truth: b.truth } } as never);
      expect(o.headLine("")).toBe(b.want);
    }
    A.L = strings("en");
    A.receive({ t: "on_hand", onHand: { tasks: [card("f1", "failed", { truth: truth("failed") }), card("f2", "failed", { truth: truth("failed") })], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], groups: [], truth: { needsYou: [], working: [], waiting: [], stopped: [], done: [], failed: [truth("failed", { taskId: "f1" }), truth("failed", { taskId: "f2" })], asOf: 1, at: iso(0) } } } as never);
    expect(o.headLine("")).toBe("2 didn't work out.");
    A.S.tasks.clear();
  });
});
