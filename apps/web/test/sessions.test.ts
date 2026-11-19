// D390: every task fully open. The find-anything field (⌘K) groups what it found in a fixed
// order and always ends with the two ways on with the words; a place named in full leads; the
// words are the same set in zh and en; ⌘K and ⌘O both open it.
import { describe, expect, test } from "bun:test";
import { sessionWords } from "../src/i18n-sessions.ts";

const now = new Date().toISOString();
const card = (id: string, title: string, attention: string) => ({
  taskId: id,
  persona: "default",
  title,
  project: "hawdb",
  place: { kind: "repo", device: "local", repoPath: "/r/hawdb", branch: `ducter/${id}`, baseBranch: "main" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: now,
  updatedAt: now,
});

async function home() {
  const { A } = await import("../src/app.ts");
  const { strings } = await import("../src/i18n.ts");
  A.L = strings("en");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks: [card("t1", "Compaction throttle", "working"), card("t2", "Range scan", "needs_you")], counts: { needs_you: 1, working: 1, waiting: 0, done_today: 0 } } } as never);
  return { A, k: await import("../src/palette.tsx") };
}

describe("the find-anything field", () => {
  test("zh and en hold the same words", () => {
    expect(Object.keys(sessionWords.zh).sort()).toEqual(Object.keys(sessionWords.en).sort());
  });

  test("no words: what is on hand (needs you first), then the places", async () => {
    const { k } = await home();
    const g = k.paletteGroups("");
    expect(g.map((x) => x.key)).toEqual(["recent", "go"]);
    expect(g[0]!.rows.map((r) => r.id)).toEqual(["t2", "t1"]);
  });

  test("words: on hand, then the earlier ones the home found (none shown twice), then tell and new last", async () => {
    const { k, A } = await home();
    k.K.askedPast = "kp1";
    k.onPaletteFrame({ t: "past_result", id: "kp1", items: [{ taskId: "t1", title: "Compaction throttle", project: "hawdb", harness: "codex", openedAt: now, updatedAt: now, attention: "working", kind: "build" }, { taskId: "p9", title: "Compaction doc", project: "hawdb", harness: "pi", openedAt: now, updatedAt: now, attention: "done", kind: "write", hit: { field: "file", text: "docs/compaction.md" } }], total: 2, facets: { projects: [], harnesses: [], tags: [] }, suggestions: [] } as never);
    const g = k.paletteGroups("compaction");
    expect(g.map((x) => x.key)).toEqual(["onhand", "past", "on"]);
    expect(g[1]!.rows.map((r) => r.id)).toEqual(["p9"]);
    expect(g.at(-1)!.rows.map((r) => r.k)).toEqual(["tell", "new"]);
  });

  test("a place named in full leads", async () => {
    const { k } = await home();
    k.resetPalette();
    expect(k.paletteGroups("Settings")[0]!.rows.map((r) => r.id)).toEqual(["go:settings"]);
  });

  test("⌘K and ⌘O open it; ⇧⌘K does not", async () => {
    const { A } = await home();
    const { openKey } = await import("../src/wide.ts");
    const asked: string[] = [];
    const was = A.command.bind(A);
    A.command = ((c: string) => void asked.push(c)) as never;
    const key = (k: string, shift = false) => openKey({ key: k, metaKey: true, ctrlKey: false, shiftKey: shift, altKey: false, preventDefault() {} } as KeyboardEvent);
    key("k");
    key("o");
    key("k", true);
    A.command = was;
    expect(asked).toEqual(["switch", "switch"]);
  });
});
