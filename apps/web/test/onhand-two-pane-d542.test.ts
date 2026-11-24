// D542: a row tapped in On hand opens what it names, at its own view. The author, on a foldable, an
// iPad and a two-column browser: 「点击左边的这个任务的这个，它就会出现这个成果这个东西，很怪」. Three causes,
// each guarded here: the workbench was open for every task once opened for one (and kept so across
// visits), at the page the last task showed; in the rail a Keep in rounds stood as its round's task,
// so its row opened that task instead of the Keep; and a row's faded actions (暂停 / Pause) took taps
// on a touch screen, where nothing hovers to show them first. The tap walk is in .shots/onhand-two-pane.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const now = new Date().toISOString();
const card = (id: string, title: string, attention: string, extra: object = {}) => ({
  taskId: id,
  persona: "default",
  title,
  project: "mem",
  place: { kind: "repo", device: "local", repoPath: "/r/mem", branch: `ducter/${id}`, baseBranch: "main" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: now,
  updatedAt: now,
  ...extra,
});
const made = { lastReport: { taskId: "t_notes", state: "done", summary: "Release notes written.", questions: [], evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10855" }] } };
const keep = (id: string, run: string, taskIds: string[]) => ({ id, title: id, run, life: "on", taskIds, items: [], wakes: [], since: now });

async function home() {
  const { A } = await import("../src/app.ts");
  const wb = await import("../src/workbench.tsx");
  const o = await import("../src/onhand.tsx");
  const k = await import("../src/keep.tsx");
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [
        card("t_notes", "整理本周 mem 的发布说明", "done", made),
        card("t_prefs", "把 Macbook Pro M3 的通用设置导出来", "working"),
        card("t_review", "持续评审 nowledge-co，并处理 100gle 分给你的待办", "working", { rounds: { n: 9 } }),
        card("t_10847", "graph_error_response_tests intermittently #8826", "working"),
      ],
      counts: { needs_you: 0, working: 3, waiting: 0, done_today: 1 },
      waiters: [],
      keeps: [keep("kp_review", "same", ["t_review"]), keep("kp_babysit", "perItem", ["t_10847"])],
    },
  } as any);
  return { A, wb, o, k, task: (id: string) => A.S.tasks.get(id)! };
}

let went: unknown[] = [];
let wasGo: unknown;
beforeEach(async () => {
  const { A } = await import("../src/app.ts");
  const { bench } = await import("../src/workbench.tsx");
  const { K } = await import("../src/keep.tsx");
  went = [];
  wasGo = A.go;
  A.go = ((r: unknown) => void (went.push(r), (A.route = r as typeof A.route))) as typeof A.go;
  A.route = { name: "onhand", full: true };
  bench.open = false;
  bench.kept = undefined;
  bench.tabs.clear();
  K.open = "";
});
afterEach(async () => {
  const { A } = await import("../src/app.ts");
  A.go = wasGo as typeof A.go;
  A.route = { name: "conv" };
});

describe("the workbench is the task's own (D542)", () => {
  test("task A with 成果 open, then a tap on task B: B opens at its conversation, A keeps its page", async () => {
    const { A, wb, o, task } = await home();
    o.openRow("t_notes", "full");
    expect(A.route).toEqual({ name: "task", id: "t_notes", full: true });
    expect(wb.tabsOf(task("t_notes"))).toContain("made");
    wb.openBenchAt(task("t_notes"), "made");
    expect(wb.benchOpen(task("t_notes"))).toBe(true);
    expect(wb.tabOf(task("t_notes"))).toBe("made");
    // The rail's next row: a task with pages of its own (changes, files) opens without the workbench.
    o.openRow("t_prefs", "rail");
    expect(A.route).toEqual({ name: "task", id: "t_prefs", full: true });
    expect(wb.benchable(task("t_prefs"))).toBe(true);
    expect(wb.benchOpen(task("t_prefs"))).toBe(false);
    // Opened there by hand, it opens at its own first page, never A's 成果.
    wb.toggleBench("t_prefs", true);
    expect(wb.benchOpen(task("t_prefs"))).toBe(true);
    expect(wb.tabOf(task("t_prefs"))).toBe("changes");
    // Back on A: closed (the workbench went to B), and opening it again shows A's own page.
    o.openRow("t_notes", "rail");
    expect(wb.benchOpen(task("t_notes"))).toBe(false);
    wb.toggleBench("t_notes", true);
    expect(wb.tabOf(task("t_notes"))).toBe("made");
  });

  test("what this device kept opens for that task only; an open workbench kept for no task opens for none", async () => {
    const { wb } = await home();
    expect(wb.readBench(JSON.stringify({ open: true, tab: "made", width: 0 })).open).toBe(false);
    const b = wb.readBench(JSON.stringify({ open: true, tab: "made", width: 480, kept: "t_notes" }));
    expect(b.open).toBe(true);
    expect(b.kept).toBe("t_notes");
    expect(b.tabs.get("t_notes")).toBe("made");
    expect(b.tabs.get("t_prefs")).toBeUndefined();
    expect(wb.readBench("not json").open).toBe(false);
  });
});

describe("a Keep's row opens the Keep (D542)", () => {
  test("in the rail, a Keep in rounds is its page; a Keep's item is its own task", async () => {
    const { A, o, k } = await home();
    A.route = { name: "task", id: "t_prefs", full: true };
    expect(k.keepOfTask("t_review")).toBe("kp_review");
    expect(k.keepOfTask("t_10847")).toBeUndefined(); // one PR the babysitter holds: a task of its own
    expect(k.keepOfTask("t_prefs")).toBeUndefined();
    o.openRow("t_review", "rail");
    expect(k.K.open).toBe("kp_review");
    // At the whole screen still: the other Keeps at its left, its page on the right.
    expect(A.route).toEqual({ name: "onhand", full: true });
    o.openRow("t_10847", "rail");
    expect(A.route).toEqual({ name: "task", id: "t_10847", full: true });
  });

  test("on the board, a row opens its task as before (a Keep stands as its own sheet there)", async () => {
    const { A, o, k } = await home();
    o.openRow("t_review", "full");
    expect(k.K.open).toBe("");
    expect(A.route).toEqual({ name: "task", id: "t_review", full: true });
  });
});

describe("a faded action takes no tap (D542)", () => {
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = () => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.replace(/\s+/g, " ").trim(), body: m[2]! }));
  // What the stylesheet says at rest and in the touch media (no hover): blocks inside a hover
  // media query are left out by reading only the rules outside any @media (hover…) block.
  const outsideHover = () => {
    let out = css;
    for (;;) {
      const i = out.search(/@media \(hover: hover\)(, \(any-hover: hover\))? \{/);
      if (i < 0) return out;
      let depth = 0;
      let j = out.indexOf("{", i);
      for (; j < out.length; j++) {
        if (out[j] === "{") depth++;
        else if (out[j] === "}" && --depth === 0) break;
      }
      out = out.slice(0, i) + out.slice(j + 1);
    }
  };
  test("a row's faded actions are not hit-testable at rest", () => {
    for (const sel of [".ocard .tacts", ".trow .tacts"]) {
      const r = [...outsideHover().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.replace(/\s+/g, " ").trim(), body: m[2]! })).filter((x) => x.sel.split(",").map((s) => s.trim()).includes(sel) && /opacity:\s*0\b/.test(x.body));
      expect(r.length).toBeGreaterThan(0);
      for (const x of r) expect(x.body).toMatch(/pointer-events:\s*none/);
    }
  });
  test("only a pointer's hover or the keyboard's focus shows them; a tap's focus never does", () => {
    const shown = [...outsideHover().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => m[1]!.replace(/\s+/g, " ")).filter((s) => /\.(ocard|trow)\b[^,{]*\.tacts/.test(s));
    for (const s of shown) {
      expect(s).not.toMatch(/(ocard|trow):hover[^,]*\.tacts/);
      expect(s).not.toMatch(/(ocard|trow):focus-within[^,]*\.tacts/);
    }
    expect(rules().some((r) => /\.ocard:has\(:focus-visible\) \.tacts/.test(r.sel) && /pointer-events:\s*auto/.test(r.body))).toBe(true);
  });
});

describe("the opened task's head and composer (D542)", () => {
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
  test("who does it is said once: the agent; the model only when the composer's chip doesn't show it; never the branch", async () => {
    const { task } = await home();
    const tr = await import("../src/transcript.tsx");
    const t = task("t_prefs");
    (t.card as { model?: string }).model = "gpt-6-luna";
    expect(tr.headFacts(t, true)).toEqual(["Codex", "mem"]);
    expect(tr.headFacts(t, false)[0]).toBe("Codex");
    expect(tr.headFacts(t, false).length).toBeGreaterThan(2);
    for (const chip of [true, false]) expect(tr.headFacts(t, chip)).not.toContain("ducter/t_prefs");
  });
  test("the state is the shared Tag in its state's tint", async () => {
    const tr = await import("../src/transcript.tsx");
    expect(["needs_you", "working", "queued", "blocked", "failed", "done", "dropped"].map(tr.stateTone)).toEqual(["needs", "working", "working", "waiting", "failed", "on", ""]);
    for (const tone of ["working", "waiting", "failed"]) expect(css).toMatch(new RegExp(`\\.tag\\.${tone} \\{[^}]*var\\(--${tone}-surface\\)[^}]*var\\(--${tone}-ink\\)`));
  });
  test("the head is the mark at the title's size, never the 96 face; the chip lives in the composer's row", () => {
    const views = readFileSync(join(import.meta.dir, "../src/views.tsx"), "utf8");
    const at = views.indexOf('<div class="task-head"');
    const head = views.slice(at, views.indexOf("{headline &&", at));
    expect(head).toContain("<Avatar size={28}");
    expect(head).not.toMatch(/size=\{[^}]*96/);
    expect(css).toMatch(/\.task-head,\n:root\[data-density="compact"\] \.task-head \{\n  grid-template-columns: 28px/);
    const from = views.indexOf("function Composer(");
    const comp = views.slice(from, views.indexOf("\n}\n", from));
    const tools = comp.slice(comp.indexOf("tools={"), comp.indexOf("/>\n", comp.indexOf("tools={")));
    expect(tools).toContain("<ComposerTune task={task} />");
    expect(tools).toContain("<ContextButton task={task} />");
    // No row under the box, at rest or on focus.
    expect(comp).not.toContain("composer-hint");
  });
});
