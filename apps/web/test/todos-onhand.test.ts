// D357: 你的待办 / Your to-dos on On hand. The group is named by its one source (GitHub 上标给你的 /
// Assigned to you on GitHub), counts only what a look read, folds all but the few shown; the fold asks
// the home a page at a time and keeps the pages in order; 交给{name} / Hand to {name} opens a task
// bound to the to-do the way New task's pick does (the home finds the folder); Settings' counts open
// On hand at the group. The words are the Mac's (apps/desktop/internal/i18n/todos.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceGlance, SourceItem, SourceView } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { todoWords } from "../src/i18n-todos.ts";

const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/todos.go"), "utf8");
const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

const gh = (o: Partial<SourceView> = {}): SourceView => ({ id: "src_gh", kind: "github", name: "lin-dev", state: "ok", whenNew: "tell", whenDone: "ask", checkedAt: "2026-11-18T01:00:00Z", open: 557, review: 4, ...o });
const vault = (o: Partial<SourceView> = {}): SourceView => ({ id: "src_v", kind: "obsidian", name: "Life", state: "ok", whenNew: "quiet", whenDone: "tick", checkedAt: "2026-11-18T01:00:00Z", open: 6, ...o });
const item = (ref: string, o: Partial<SourceItem> = {}): SourceItem => ({ source: "src_gh", kind: "github", ref, label: `#${ref.split("#")[1]}`, where: ref.split("#")[0], title: `Title ${ref}`, state: "open", ...o });

async function withSent<T>(fn: (sent: unknown[]) => Promise<T> | T): Promise<T> {
  const { A } = await import("../src/app.ts");
  const sent: unknown[] = [];
  const was = A.send;
  A.send = ((f: unknown) => void sent.push(f)) as typeof A.send;
  try {
    return await fn(sent);
  } finally {
    A.send = was;
  }
}

describe("the group", () => {
  test("named by its one source, else 你的待办; counted only after a look; the rest is what isn't shown", async () => {
    const { A } = await import("../src/app.ts");
    const { todoCounts, todoGroupName } = await import("../src/todos.tsx");
    A.L = strings("zh");
    expect(todoGroupName([gh()])).toBe("GitHub 上标给你的");
    expect(todoGroupName([vault()])).toBe("Life 里的待办");
    expect(todoGroupName([gh(), vault()])).toBe("你的待办");
    A.L = strings("en");
    expect(todoGroupName([gh()])).toBe("Assigned to you on GitHub");
    expect(todoGroupName([gh(), vault()])).toBe("Your to-dos");
    const glance: SourceGlance[] = [{ ...item("a/b#9", { review: true }), why: "review" }, { ...item("a/b#1"), why: "mentioned" }, { ...item("a/b#2"), why: "recent" }];
    // A review request shown isn't one of the 557 assigned: 555 more.
    expect(todoCounts([gh()], glance)).toEqual({ open: 557, atLeast: false, review: 4, rest: 555 });
    expect(todoCounts([gh(), vault()], [])).toMatchObject({ open: 563, rest: 563 });
    // Before a look, or a failed one: nothing counted.
    expect(todoCounts([gh({ checkedAt: undefined }), vault({ state: "error" })], [])).toMatchObject({ open: 0, review: 0, rest: 0 });
    expect(todoCounts([gh({ openAtLeast: true })], []).atLeast).toBe(true);
  });
});

describe("the fold", () => {
  test("a page at a time, narrowed as chosen; pages kept in order, an old answer ignored", async () => {
    const { A } = await import("../src/app.ts");
    const { askFold, TF } = await import("../src/todos.tsx");
    await withSent((sent) => {
      Object.assign(TF, { open: true, q: " parser ", source: undefined, where: "acme/web", tag: undefined, review: false });
      askFold(1);
      expect(sent.at(-1)).toEqual({ t: "source_items", page: 1, clientId: TF.cid, query: "parser", where: "acme/web" });
      const first = TF.cid;
      A.onSourcesFrame!({ t: "source_items_result", clientId: first, page: 1, more: true, items: [item("acme/web#1"), item("acme/web#2")], wheres: ["acme/web", "acme/api"], tags: [] });
      expect(TF.items.map((i) => i.ref)).toEqual(["acme/web#1", "acme/web#2"]);
      expect(TF.more).toBe(true);
      expect(TF.wheres).toEqual(["acme/web", "acme/api"]);
      askFold(2);
      // An answer to an earlier ask doesn't land.
      A.onSourcesFrame!({ t: "source_items_result", clientId: first, page: 1, items: [item("acme/web#77")] });
      A.onSourcesFrame!({ t: "source_items_result", clientId: TF.cid, page: 2, more: false, items: [item("acme/web#2"), item("acme/web#3")] });
      expect(TF.items.map((i) => i.ref)).toEqual(["acme/web#1", "acme/web#2", "acme/web#3"]);
      expect(TF.more).toBe(false);
      // GitHub's rate limit is said as such.
      askFold(1);
      A.onSourcesFrame!({ t: "source_items_result", clientId: TF.cid, page: 1, items: [], limited: true, errors: [{ source: "src_gh", error: "rate limit" }] });
      expect(TF.limited).toBe(true);
      // The review list.
      Object.assign(TF, { q: "", where: undefined, review: true });
      askFold(1);
      expect(sent.at(-1)).toEqual({ t: "source_items", page: 1, clientId: TF.cid, review: true });
    });
  });
});

describe("hand it over", () => {
  test("交给{name}: New task's path with the to-do and handed, no place; the card says why when it fails", async () => {
    const { A } = await import("../src/app.ts");
    const { handOver, HAND } = await import("../src/todos.tsx");
    A.L = strings("zh");
    await withSent((sent) => {
      const i = item("acme/web#12", { url: "https://github.com/acme/web/issues/12", labels: ["bug"], body: "long text" });
      handOver(i);
      const f = sent.at(-1) as { t: string; words: string; item: Record<string, unknown>; handed: boolean; clientId: string; place?: unknown };
      expect(f).toMatchObject({ t: "task_new", words: "Title acme/web#12", handed: true });
      expect(f.place).toBeUndefined();
      expect(f.item).toEqual({ source: "src_gh", kind: "github", ref: "acme/web#12", label: "#12", where: "acme/web", title: "Title acme/web#12", url: "https://github.com/acme/web/issues/12" });
      expect(HAND.sending["acme/web#12"]).toBe(f.clientId);
      // The answer is the hand-over's, not the New task card's.
      expect(A.onHanded!({ t: "task_new_result", ok: false, clientId: f.clientId, reason: "no_agent", message: "x" })).toBe(true);
      expect(HAND.sending["acme/web#12"]).toBeUndefined();
      expect(HAND.failed["acme/web#12"]).toBe(A.L.t("newtask.err.no_agent"));
      expect(A.onHanded!({ t: "task_new_result", ok: true, clientId: "nt-other", taskId: "t1" })).toBe(false);
      // One with a live task opens it; nothing is sent.
      const n = sent.length;
      const was = A.go;
      let went: unknown;
      A.go = ((r: unknown) => void (went = r)) as typeof A.go;
      handOver(item("acme/web#14", { taskId: "t14" }));
      A.go = was;
      expect(sent.length).toBe(n);
      expect(went).toEqual({ name: "task", id: "t14" });
    });
  });

  test("Settings' counts open On hand at the group: the fold open, the review list when that was tapped", async () => {
    const { A } = await import("../src/app.ts");
    const { seeTodos, TF, TS } = await import("../src/todos.tsx");
    TS.frame = { t: "sources", sources: [gh()], found: { vaults: [] } };
    await withSent((sent) => {
      const was = A.go;
      let went: unknown;
      A.go = ((r: unknown) => void (went = r)) as typeof A.go;
      A.sheet = { kind: "settings", page: "todos" } as typeof A.sheet;
      seeTodos({ source: "src_gh", review: true });
      A.go = was;
      expect(went).toEqual({ name: "onhand" });
      expect(A.sheet).toBeNull();
      expect(TF).toMatchObject({ open: true, review: true, scroll: true, source: undefined });
      expect(sent.at(-1)).toMatchObject({ t: "source_items", page: 1, review: true });
    });
  });
});

describe("words and look", () => {
  test("zh and en, the same as the Mac's", () => {
    const keys = Object.keys(todoWords.zh).filter((k) => k.startsWith("onhand.todos.") || k === "todos.see");
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys)
      for (const lang of ["zh", "en"] as const) {
        expect(todoWords[lang][k]).toBeTruthy();
        expect(mac).toContain(`"${todoWords[lang][k]}"`);
      }
  });

  test("44-tall actions and Find; the board's own card and low card; tokens only", () => {
    expect(css).toMatch(/\.todo-card \.todo-foot \.btn,\s*\.todo-row-card \.tacts \.btn \{\s*min-height: 44px;/);
    expect(css).toMatch(/\.onhand-list \.todo-fold \.todo-find \{\s*flex: none;\s*height: 44px;/);
    const block = css.slice(css.indexOf("/* D357"));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});
