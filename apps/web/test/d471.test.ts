// D471: On hand on the author's real board, in the shapes `demo-replay-shapes.ts` keeps with invented
// words. Names are said whole; a raw tool line is never shown; a project whose tasks never started
// there is no project yet; every task is one row, said once; the project column has no line counts
// and no faces; the peek follows only the keys. The Mac's onhand_d471_test.go checks the same.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";
import { shapeRows } from "../demo-replay-shapes.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const card = (id: string, title: string, attention: string, at: string, more: Record<string, unknown> = {}) => ({
  taskId: id,
  persona: "default",
  title,
  place: { kind: "none" },
  harness: "codex",
  attention,
  residency: "parked",
  openedAt: at,
  updatedAt: at,
  ...more,
});

async function board(tasks: unknown[]) {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.S.tasks.clear();
  A.receive({ t: "on_hand", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as any);
  return { A, o };
}

describe("On hand on a real board (D471)", () => {
  test("names: a source's cut title is said to its last word; a name in a sentence is never cut inside a word", async () => {
    const { shortTitle, untrail, sayName } = await import("../src/transcript.tsx");
    expect(shortTitle("Reconcile the orbit plugin's tail offsets with the…")).toBe("Reconcile the orbit plugin's tail offsets");
    expect(shortTitle("A half-finished tag merge leaves no record of the…")).toBe("A half-finished tag merge leaves no record");
    expect(untrail("tile_merge_response_tests fail intermittently under…")).toBe("tile_merge_response_tests fail intermittently");
    expect(untrail("为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆")).toBe("为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆");
    const said = sayName("A half-finished tag merge leaves no record of the…", 28);
    expect(said).not.toBe("A half-finished…");
    expect(said.endsWith(" …")).toBe(false);
    expect(sayName("为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆", 28)).not.toContain("Studio M…");
  });

  test("stuck: never a raw tool line; the phone from its report; a lock and an unknown error in the partner's words", async () => {
    const { A } = await board([
      card("phone", "用借来的手机录一段官网的屏并发帖", "blocked", iso(-9 * 86_400_000)),
      card("lock", "整理设置页文案", "failed", iso(-6 * 3600_000), { reason: "git worktree add failed: Preparing worktree\nfatal: Unable to create '/r/.git/worktrees/x/index.lock': File exists." }),
      card("other", "细审长文案", "failed", iso(-6 * 3600_000), { cant: { why: "other", computer: "Studio Mac", what: "lumen" } }),
      card("clone", "Reconcile the orbit plugin's tail offsets with the…", "failed", iso(-11 * 3600_000), { cant: { why: "no_repo", computer: "Studio Mac", what: "orbit", cloneHere: true } }),
    ]);
    A.S.applyEvent({ seq: 9001, ts: iso(-9 * 86_400_000), stream: "task:phone", origin: "task", kind: "report", body: { taskId: "phone", state: "blocked", summary: "又试了一次，手机那边还是说这个任务的手机访问被停止了，没法接着操作。", questions: [], evidence: [] } } as any);
    const b = await import("../src/onhand-brief.tsx");
    const k = (id: string) => b.stuckOf(A.S.tasks.get(id)!);
    expect(k("phone").kind).toBe("phone");
    expect(b.stuckClause(k("phone"))).toBe(A.L.t("onhand.stuck.phone"));
    expect(b.stuckClause(k("phone"))).not.toContain("工具");
    expect(b.stuckClause(k("lock"))).toBe(A.L.t("onhand.stuck.lock"));
    expect(b.stuckClause(k("lock"))).not.toContain("fatal");
    expect(k("other").kind).toBe("unknown");
    expect(b.stuckClause(k("other"))).toBe(A.L.t("onhand.stuck.unknown.start"));
    expect(k("clone").kind).toBe("cant");
    expect(b.rawFailure("fatal: not a git repository")).toBe("unknown");
    expect(b.peekWords("cp review-report-round235.json review/")).toBe("");
    expect(b.peekWords("运行测试")).toBe("运行测试");
    A.S.tasks.clear();
  });

  test("a project whose tasks never started there is no project yet; All still counts them", async () => {
    const { A, o } = await board([
      card("orbit", "Reconcile the orbit plugin's tail offsets", "failed", iso(-11 * 3600_000), { project: "lumen-notes-orbit-plugin", cant: { why: "no_repo", computer: "Studio Mac", what: "orbit" } }),
      card("a", "Warm the tile cache", "done", iso(-60_000), { project: "lumen-notes" }),
      card("b", "Fix the flaky test", "blocked", iso(-60_000), { project: "lumen-notes" }),
      card("c", "查周六机票", "done", iso(-60_000)),
    ]);
    expect(o.lensGroups().map((g) => g.name)).not.toContain("lumen-notes-orbit-plugin");
    expect(o.lensLanes("").flat()).toHaveLength(4);
    A.S.tasks.clear();
  });

  test("one row each, said once; the column has no line counts or faces; four sizes; theme tokens only", () => {
    const onhand = src("onhand.tsx");
    expect(onhand).not.toContain("BriefLines");
    expect(onhand).not.toContain("<WaitAxis");
    const entry = onhand.slice(onhand.indexOf("function LensEntry"), onhand.indexOf("/** The lens beside the board"));
    expect(entry).not.toContain("StatusFace");
    expect(entry).not.toContain('class="stat"');
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    const block = css.slice(css.indexOf("/* ---------- D471: On hand as one ledger ---------- */"));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(block).not.toMatch(/border-left:/);
    const sizes = new Set([...block.matchAll(/font-size: ([^;]+);/g)].map((m) => m[1]));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  test("a group with one part left on the board is that task's own row, never a lone number", async () => {
    const { boardGroups } = await import("../src/groups-view.ts");
    const g = (members: unknown[]) => ({ id: "g1", name: "通用设置", order: "line", by: "partner", persona: "default", members }) as any;
    const lane = (id: string) => (id === "t1" ? 1 : -1);
    expect(boardGroups([g([{ taskId: "t1" }, { taskId: "gone" }])], lane, () => "working")).toEqual([]);
    const two = boardGroups([g([{ taskId: "t1" }, { key: "k2", title: "在新 Mac 上照着设好" }])], lane, () => "working");
    expect(two).toHaveLength(1);
    expect(two[0]!.rows.map((r) => r.part)).toEqual([1, 2]);
  });

  test("zh and en together, no counter noun", () => {
    const zh = strings("zh"), en = strings("en");
    for (const k of ["onhand.stuck.unknown", "onhand.stuck.unknown.start", "onhand.stuck.lock", "onhand.stuck.failed", "onhand.stuck.phone", "onhand.stuck.stopped", "onhand.peek.said"]) {
      expect(zh.t(k)).not.toBe(k);
      expect(en.t(k)).not.toBe(k);
      expect(zh.t(k, "x")).not.toContain("件");
    }
  });

  test("the committed shapes are invented words in the real lengths: a cut English title, a raw git error, a phone report", () => {
    const rows = shapeRows(now);
    const text = rows.map((r) => r.body).join("\n");
    expect(text).toContain("with the…");
    expect(text).toContain("index.lock");
    expect(text).toContain("手机访问被停止");
    expect(rows.every((r, i) => r.seq === i + 1)).toBe(true);
    // Never the author's own words, names or hosts.
    for (const w of ["weyl", "/root/", "@gmail"]) expect(text).not.toContain(w);
  });
});
