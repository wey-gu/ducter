// D216: On hand as one list. A row says what the task is doing now from the card alone (its latest
// step), a draft PR or a merge shows on it, Find and the switcher match every word, and many at
// once offer only what fits each task.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { onhandWords } from "../src/i18n-onhand.ts";

const now = new Date().toISOString();
const card = (id: string, title: string, project: string, attention: string, extra: object = {}) => ({
  taskId: id,
  persona: "default",
  title,
  project,
  place: { kind: "repo", device: "local", repoPath: `/r/${project}`, branch: `ducter/${id}`, baseBranch: "main" },
  harness: "claude-code",
  attention,
  residency: "hot",
  openedAt: now,
  updatedAt: now,
  ...extra,
});
const step = (seq: number, taskId: string, tool: object) => ({ seq, ts: now, persona: "default", stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "tool", tool } });

async function home() {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  A.L = strings("en");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [
        card("t1", "Keyboard on On hand", "ducter", "working", { latest: step(9, "t1", { name: "Bash", input: { command: "bun test apps/web" } }), changes: { files: 2, adds: 40, dels: 3, at: now } }),
        card("t2", "Range scan benchmark", "hawdb", "done", { integrated: { act: "open_pr", ref: "https://github.com/o/r/pull/7", at: now }, lastReport: { taskId: "t2", state: "done", summary: "Added three benchmarks.", questions: [], evidence: [] } }),
        card("t3", "README in Chinese", "mem", "done", { lastReport: { taskId: "t3", state: "done", summary: "Written.", questions: [], evidence: [] } }),
      ],
      counts: { needs_you: 0, working: 1, waiting: 0, done_today: 2 },
      waiters: [],
    },
  } as any);
  return { A, o };
}

describe("On hand rows (D216)", () => {
  test("a working row says its latest step from the card, before any task event is held", async () => {
    const { A, o } = await home();
    const s = o.storyOf(A.S.tasks.get("t1")!);
    expect(s.mark).toBe("ran");
    expect(`${s.words} ${s.code}`).toContain("bun test");
    // A newer event the client holds wins over the card's.
    A.receive({ t: "events", events: [step(12, "t1", { name: "Read", input: { file_path: "/r/ducter/apps/web/src/onhand.tsx" } })] } as any);
    expect(o.storyOf(A.S.tasks.get("t1")!).mark).toBe("read");
  });

  test("a done row says its result; Find and the switcher match every word", async () => {
    const { A, o } = await home();
    expect(o.storyOf(A.S.tasks.get("t2")!).words).toBe("Added three benchmarks.");
    expect(o.matches(A.S.tasks.get("t2")!, "hawdb bench")).toBe(true);
    expect(o.matches(A.S.tasks.get("t1")!, "hawdb")).toBe(false);
    expect(o.switchList("bench").map((x) => x.id)).toEqual(["t2"]);
    // What needs you or works comes before what is done.
    expect(o.switchList("")[0]!.id).toBe("t1");
  });

  test("many at once offer only what fits: a draft PR already opened is not merged again", async () => {
    const { o } = await home();
    const k = o.bulkOf(["t1", "t2", "t3"]);
    expect(k.pause.map((x) => x.id)).toEqual(["t1"]);
    expect(k.merge.map((x) => x.id)).toEqual(["t3"]);
    expect(k.drop.map((x) => x.id)).toEqual(["t1"]);
  });
});

describe("On hand copy (D216)", () => {
  test("zh and en have the same keys, and the same as the Mac", () => {
    expect(Object.keys(onhandWords.zh).sort()).toEqual(Object.keys(onhandWords.en).sort());
    const mac = readFileSync(new URL("../../desktop/internal/i18n/onhand.go", import.meta.url), "utf8");
    const macKeys = [...mac.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1]);
    expect([...new Set(macKeys)].sort()).toEqual(Object.keys(onhandWords.zh).sort());
    for (const [k, v] of Object.entries({ ...onhandWords.zh, ...onhandWords.en })) expect(mac).toContain(`"${k}":`), expect(mac).toContain(JSON.stringify(v));
  });
});
