// D467: On hand in one grammar, by attention. A wait nothing will bring back (no waiter, nothing
// asked for later, not a computer that will wake) and a task that didn't work out stand in 等你 and
// the head line says so; 今天做完 is today's, yesterday's folds away; the to-dos' summary says facts
// that add up to the open count; the day column beside the board is gone. The Mac's d467_test.go
// checks the same.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const startOfDay = new Date(new Date(now).toDateString()).getTime();
const DAY = 86_400_000;
const card = (id: string, attention: string, at: string, reason = "") => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  place: { kind: "none" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: at,
  updatedAt: at,
  ...(reason ? { reason } : {}),
});
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

async function board(tasks: unknown[], waiters: unknown[] = []) {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  // Its own store: a full run leaves other files' devices, settings and tasks in A.S (CI order).
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters, missed: [] } } as any);
  return { A, o };
}

describe("On hand by attention (D467)", () => {
  test("a wait with nothing to bring it back stands in 等你; one with a waiter, a fresh one or a sleeping computer stays in 在等", async () => {
    const today = Math.max(startOfDay + 1000, now - 60_000) - now;
    const { A, o } = await board(
      [
        card("phone", "blocked", iso(-8 * DAY)),
        card("ci", "blocked", iso(-48 * 60_000)),
        card("fresh", "blocked", iso(-5 * 60_000)),
        card("asleep", "blocked", iso(-3 * DAY), "device:asleep:Mac mini"),
        card("work", "working", iso(-23 * 60_000)),
        card("typo", "done", iso(today)),
        card("flaky", "done", new Date(startOfDay - 3_600_000).toISOString()),
        card("broke", "failed", iso(today)),
      ],
      [{ waiterId: "w1", taskId: "ci", reason: "the pipeline finishes", state: "armed", at: iso(37 * 60_000), armedAt: iso(-48 * 60_000) }],
    );
    const parts = o.boardParts(o.lensLanes(""));
    expect(parts.stopped.map((x) => x.id)).toEqual(["phone"]);
    expect(parts.failed.map((x) => x.id)).toEqual(["broke"]);
    expect(parts.waiting.map((x) => x.id).sort()).toEqual(["asleep", "ci", "fresh"]);
    expect(parts.today.map((x) => x.id)).toEqual(["typo"]);
    expect(parts.earlier.map((x) => x.id)).toEqual(["flaky"]);
    // The strip: 等你 counts the stopped and the failed; 今天做完 counts what it lists.
    expect(o.stateCounts("")).toEqual([2, 1, 3, 1]);
    // The head is true to the body: nothing to decide, two stopped.
    expect(o.headLine("")).toBe(A.L.t("onhand.line.stopped", 2));
    A.S.tasks.clear();
  });

  test("the head line: a question outranks a stop; one stop alone is said as one", async () => {
    const { A, o } = await board([card("phone", "blocked", iso(-8 * DAY))]);
    expect(o.stateCounts("")[0]).toBe(1);
    expect(o.headLine("")).toBe(A.L.t("onhand.line.stopped.one"));
    // With something to decide too, the count of all that needs the person.
    expect(o.headLine("", [2, 0, 0, 0])).toBe(A.L.t("onhand.say.needs", 2));
    A.L = strings("en");
    expect(o.headLine("")).toBe("One has stopped and needs a look.");
    A.S.tasks.clear();
  });

  test("the to-dos' summary: facts that add up to the open count, the rest said as already under way", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    const { pileTaken } = await import("../src/pile.tsx");
    A.L = strings("zh");
    const pile = { open: 555, clearedToday: 0, sortedAt: iso(-19 * 3600_000), read: 553, unread: 16, groups: { do: 236, decide: 104, close: 0, later: 197 }, queue: { running: 0, waiting: 0, cap: 6 } } as any;
    expect(pileTaken(pile)).toBe(2);
    const f = o.sourceFacts(pile, "Ducter");
    expect(f.leadGroup).toBe("do");
    expect(f.lead).toBe("236 个可以交给 Ducter 做");
    expect(f.facts).toEqual(["104 个要你拿主意", "197 个可以先放着", "16 个还没细看", "2 个已经在做"]);
    const sum = [f.lead, ...f.facts].map((x) => Number(/^\d+/.exec(x)![0])).reduce((a, b) => a + b, 0);
    expect(sum).toBe(555);
    // Not sorted yet: the one way to start it.
    expect(o.sourceFacts({ ...pile, sortedAt: undefined, read: 0 }, "Ducter").leadGroup).toBe("first");
  });

  test("one card shape, one to a row; no day column; the summary card has no art", () => {
    const onhand = src("onhand.tsx");
    const board = src("board.tsx");
    expect(board).not.toContain("DayColumn");
    expect(board).not.toContain("day-col");
    expect(onhand).not.toContain("CompactCard");
    expect(onhand).not.toContain('class="tcards"');
    expect(onhand).not.toContain("<Coin ");
    const sum = onhand.slice(onhand.indexOf("function SourceSummary"), onhand.indexOf("/** D285: On hand's one quiet way"));
    expect(sum).not.toContain("Art");
    expect(sum).not.toContain("pile-n");
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    const block = css.slice(css.indexOf("/* D467: On hand's one card."));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(block).toMatch(/\.ocards \{\s*display: flex;\s*flex-direction: column;/);
    expect(block).not.toMatch(/border-left:/);
  });

  test("zh and en together", async () => {
    const { onhandWords } = await import("../src/i18n-onhand.ts");
    for (const k of ["onhand.line.stopped.one", "onhand.line.stopped", "onhand.done.yesterday", "onhand.src.do", "onhand.src.decide", "onhand.src.close", "onhand.src.later", "onhand.src.unread", "onhand.src.taken", "onhand.src.taken.row", "onhand.src.review", "onhand.src.all", "onhand.src.hide"]) {
      expect(onhandWords.zh[k], k).toBeTruthy();
      expect(onhandWords.en[k], k).toBeTruthy();
      expect(onhandWords.zh[k]).not.toContain("件");
    }
  });
});

// D467 round 2: a partner that reports. The brief at the head (true to the body, the fix inline), no
// count strip and no counts on the section labels, the trail from the task's own steps, a waiting
// line that never says the title again, the PR as an outcome, the source as one offer, the peek.
describe("On hand reports (D467 round 2)", () => {
  const ev = (seq: number, taskId: string, ms: number, body: Record<string, unknown>) => ({ seq, ts: iso(ms), stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, ...body } });

  test("what stopped at the phone says its fix on its own row; never a count strip (D471: no brief lines)", async () => {
    const { A, o } = await board(
      [card("phone", "blocked", iso(-8 * DAY)), card("ci", "blocked", iso(-48 * 60_000)), { ...card("ask", "needs_you", iso(-5 * 60_000)) }],
      [{ waiterId: "w1", taskId: "ci", reason: "the pipeline finishes", state: "armed", at: iso(37 * 60_000), armedAt: iso(-48 * 60_000) }],
    );
    A.S.applyEvent(ev(9001, "phone", -8 * DAY, { role: "tool", tool: { name: "phone_record_start", input: {}, output: "access stopped", ok: false } }) as any);
    const { stuckOf, stuckClause, onPhone } = await import("../src/onhand-brief.tsx");
    const phone = A.S.tasks.get("phone")!;
    expect(onPhone(phone)).toBe(true);
    const n = stuckOf(phone);
    expect(n.kind).toBe("phone");
    expect(n.text).toBe(A.L.t("onhand.brief.stopped.phone", "Task phone"));
    expect(stuckClause(n)).toBe(A.L.t("onhand.stuck.phone"));
    // The question and the stop are both 等你: the line counts them, the rows say them.
    expect(o.stateCounts("")[0]).toBe(2);
    const onhand = src("onhand.tsx");
    expect(onhand).not.toContain('class="strip"');
    // The section labels say no count (a folded section on the phone keeps its own).
    expect(onhand).toContain('{/* D467: a quiet label, never a count');
    A.S.tasks.clear();
  });

  test("a stopped task says what is true, never its log (D471); a failed one with no words says the error is unknown", async () => {
    const { A, o } = await board([card("x", "blocked", iso(-3 * DAY)), card("y", "failed", iso(-60 * 60_000))]);
    A.S.applyEvent({ seq: 9100, ts: iso(-3 * DAY), stream: "task:x", origin: "task", kind: "report", body: { taskId: "x", state: "blocked", summary: "等你把 Pixel Fold 连上。外部录屏还没做。", questions: [], evidence: [] } } as any);
    const { stuckOf, stuckClause, firstSentence } = await import("../src/onhand-brief.tsx");
    expect(firstSentence("等你把 Pixel Fold 连上。外部录屏还没做。")).toBe("等你把 Pixel Fold 连上。");
    expect(stuckOf(A.S.tasks.get("x")!).kind).toBe("stopped");
    expect(stuckClause(stuckOf(A.S.tasks.get("x")!))).toBe(A.L.t("onhand.stuck.said", "等你把 Pixel Fold 连上")); // D471 round 2: the partner says what it knows
    expect(stuckOf(A.S.tasks.get("y")!).kind).toBe("unknown");
    expect(o.stateCounts("")[0]).toBe(2);
    A.S.tasks.clear();
  });

  test("a waiting line that only says the title again gives way", async () => {
    const { echoes } = await import("../src/onhand-brief.tsx");
    expect(echoes("等 acme-web 的发布流水线跑完再合并", "等 acme-web 的发布流水线跑完")).toBe(true);
    expect(echoes("Merge acme-web once its release pipeline is through", "Waiting until acme-web's release pipeline finishes")).toBe(false);
    expect(echoes("PR #1592：修 compaction 测试", "等 PR #1592 的 CI 跑完")).toBe(false);
  });

  test("a result is its outcome: the PR from its evidence, quiet", async () => {
    const { A } = await board([{ ...card("typo", "done", iso(-60_000)), place: { kind: "repo", device: "local", repoPath: "/r/web", branch: "ducter/typo" } }]);
    A.S.applyEvent({ seq: 9200, ts: iso(-60_000), stream: "task:typo", origin: "task", kind: "report", body: { taskId: "typo", state: "done", summary: "Fixed; draft PR #1190.", questions: [], evidence: [{ kind: "url", label: "PR", ref: "https://github.com/acme/web/pull/1190" }] } } as any);
    const { outcomeOf } = await import("../src/onhand-brief.tsx");
    expect(outcomeOf(A.S.tasks.get("typo")!)).toEqual({ label: "#1190", url: "https://github.com/acme/web/pull/1190" });
    A.S.tasks.clear();
  });

  test("the trail counts the task's own steps on its time; the peek follows the keys, else the first at work", async () => {
    const { A, o } = await board([card("idle", "blocked", iso(-5 * 60_000)), card("work", "working", iso(-23 * 60_000))]);
    A.S.applyEvent(ev(9301, "work", -20 * 60_000, { role: "tool", tool: { name: "Bash", input: { command: "defaults read -g" }, output: "ok", ok: true } }) as any);
    A.S.applyEvent(ev(9302, "work", -60_000, { role: "assistant", text: "Picking the Dock settings." }) as any);
    A.S.applyEvent(ev(9303, "work", -30_000, { role: "tool", tool: { name: "Bash", input: { command: "false" }, output: "no", ok: false } }) as any);
    const { stepsOf, peekTask } = await import("../src/onhand-brief.tsx");
    const steps = stepsOf(A.S.tasks.get("work")!);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.bad)).toEqual([false, false, true]);
    expect(peekTask("", ["idle", "work"])!.id).toBe("work");
    expect(peekTask("idle", ["idle", "work"])!.id).toBe("idle");
    expect(peekTask("gone", ["idle", "work"])!.id).toBe("work");
    // D471: a focus kept from a task opened before doesn't hold the peek; the work under way does.
    expect(peekTask("idle", ["idle", "work"], false)!.id).toBe("work");
    void o;
    A.S.tasks.clear();
  });

  test("the source is one offer; the peek stands only at a wide window", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    expect(A.L.t("onhand.src.offer", 49)).toBe("里面有 49 个我现在就能做，交给我就开始。");
    A.L = strings("en");
    expect(A.L.t("onhand.src.offer", 49)).toBe("49 of them I can take on now; hand them over and I'll start.");
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    const block = css.slice(css.indexOf("/* D467 round 2"));
    expect(block).toMatch(/\.peek-col \{\s*display: none;/);
    expect(block).toMatch(/@media \(min-width: 1280px\) \{\s*\.peek-col \{\s*display: block;/);
    expect(block).toMatch(/prefers-reduced-motion: reduce/);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(src("../src/board.tsx".replace("../src/", ""))).toContain("<Peek />");
    for (const k of ["onhand.brief.stopped.phone", "onhand.stuck.phone", "onhand.progress.steps", "onhand.peek.open", "onhand.src.offer"]) expect(strings("zh").t(k, "x", "y", 1)).not.toContain("件");
  });
});

describe("On hand said once (D467 round 3)", () => {
  test("D471: nothing is told twice: every task is its own row; the head is one sentence", async () => {
    const { A, o } = await board(
      [card("typo", "done", iso(-30 * 60_000)), card("ci", "blocked", iso(-48 * 60_000)), card("ci2", "blocked", iso(-40 * 60_000))],
      [
        { waiterId: "w1", taskId: "ci", reason: "the pipeline finishes", state: "armed", at: iso(37 * 60_000), armedAt: iso(-48 * 60_000) },
        { waiterId: "w2", taskId: "ci2", reason: "the nightly finishes", state: "armed", at: iso(3 * 3600_000), armedAt: iso(-40 * 60_000) },
      ],
    );
    const parts = o.boardParts(o.lensLanes(""));
    expect(parts.waiting.map((x) => x.id).sort()).toEqual(["ci", "ci2"]);
    const onhand = src("onhand.tsx");
    expect(onhand).not.toContain("BriefLines");
    expect(onhand).not.toContain("brief.told");
    expect(onhand).not.toContain("<WaitAxis");
    expect(o.headLine("")).toBe(A.L.t("onhand.line.first", "17:00").replace("17:00", o.headLine("").match(/\d{1,2}:\d{2}/)?.[0] ?? ""));
    A.S.tasks.clear();
  });

  test("all quiet: done says today's all", async () => {
    const { A, o } = await board([card("a", "done", iso(-60_000))]);
    expect(o.headLine("")).toBe("今天就这些，都做完了。");
    expect(strings("en").t("onhand.line.done")).toBe("That's all for today. Everything's done.");
    A.S.tasks.clear();
  });

  test("a name in a sentence is cut at a word's end, never inside one (D471); the trail merges dense steps into spans", async () => {
    const { briefName, trailRuns } = await import("../src/onhand-brief.tsx");
    expect(briefName("用手机把 Ducter 官网录一段屏发到 X")).toBe("用手机把 Ducter 官网录一段…");
    expect(briefName("Fix the typo")).toBe("Fix the typo");
    expect(briefName("Record the Ducter site on the phone and post it to X")).toBe("Record the Ducter site on…");
    const runs = trailRuns([
      { x: 10, bad: false, key: 1 },
      { x: 40, bad: false, key: 2 },
      { x: 90, bad: false, key: 3 },
      { x: 90.5, bad: true, key: 4 },
      { x: 91, bad: false, key: 5 },
      { x: 91.6, bad: false, key: 6 },
    ]);
    expect(runs).toEqual([
      { from: 10, to: 10, bad: false, key: 1 },
      { from: 40, to: 40, bad: false, key: 2 },
      { from: 90, to: 91.6, bad: true, key: 3 },
    ]);
  });

  test("one encoding a level; a face only where something needs you; the axis from two waits", () => {
    const onhand = src("onhand.tsx");
    const g = onhand.slice(onhand.indexOf("function GroupCard"), onhand.indexOf("/** How the parts run"));
    expect(g).not.toContain("<StateMark");
    expect(g).toContain('k === "working" ? <span class="gmark k-blank"');
    expect(onhand).toContain("const needsHere = ");
    expect(src("onhand-brief.tsx")).not.toContain("function WaitAxis"); // D471: the times stand on the rows' own edge
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    const block = css.slice(css.indexOf("/* D467 round 3"));
    expect(block).toMatch(/\.ocard \.omark \.pulse i \{\s*animation: none;/);
    expect(block).toMatch(/\.peek \.pt \{[^}]*white-space: nowrap;/);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe("Every stuck kind has its fix (D467 round 4)", () => {
  const dev = (id: string, name: string, o: Record<string, unknown> = {}) => ({ id, name, kind: "laptop", home: id === "local", state: "awake", harnesses: [], abilities: [], ...o });
  test("signed out, offline, the switches off, couldn't start: each says what fixes it, in the partner's words", async () => {
    const { A, o } = await board([
      { ...card("auth", "failed", iso(-2 * 3600_000)), harness: "claude-code", place: { kind: "repo", device: "local", repoPath: "/r", branch: "b" } },
      { ...card("away", "blocked", iso(-2 * 3600_000), "device:unreachable:Mac mini") },
      { ...card("cu", "blocked", iso(-2 * 3600_000)), computing: { device: "mini" } },
      { ...card("cant", "failed", iso(-2 * 3600_000)), cant: { why: "no_repo", computer: "hel", what: "hawdb", elsewhere: { device: "local", name: "MacBook" } } },
      { ...card("pi", "failed", iso(-2 * 3600_000)), harness: "pi" },
    ]);
    A.receive({
      t: "devices",
      devices: [
        dev("local", "MacBook", { harnesses: [{ harness: "claude-code", installed: true, loggedIn: false }, { harness: "pi", installed: true, loggedIn: false }] }),
        dev("mini", "Mac mini", { state: "asleep", lastSeen: iso(-2 * 3600_000), abilities: [{ id: "computer", state: "on", perms: { accessibility: false, screen: true } }] }),
      ],
    } as any);
    const b = await import("../src/onhand-brief.tsx");
    const k = (id: string) => b.stuckOf(A.S.tasks.get(id)!);
    expect(k("auth").kind).toBe("signin");
    expect(k("auth").text).toBe(A.L.t("onhand.brief.signin", "Task auth", "Claude Code", "MacBook"));
    expect(k("pi").kind).toBe("signin-pi");
    expect(k("away").kind).toBe("offline");
    expect(k("away").text).toContain("Mac mini");
    expect(k("away").text).toContain("2 小时前");
    expect(k("cu").kind).toBe("perm");
    expect(k("cu").text).toBe(A.L.t("onhand.brief.perm", "Task cu", "Mac mini"));
    expect(k("cant").kind).toBe("cant");
    // A computer that went away without a word has stopped once it has been away a while; asleep hasn't.
    expect(o.stoppedWait(A.S.tasks.get("away")!)).toBe(true);
    // The card names its task already: its own line, without the name.
    expect(b.stuckClause(k("cu"))).toBe(A.L.t("onhand.stuck.perm", "Mac mini"));
    A.receive({ t: "devices", devices: [] } as any);
    A.S.tasks.clear();
  });

  test("a limit: its own row says whose and offers the hand-over (D471: no brief line)", async () => {
    const { A, o } = await board([card("lim", "blocked", iso(-10 * 60_000))], [{ waiterId: "wl", taskId: "lim", reason: "limit", state: "armed", at: iso(130 * 60_000), armedAt: iso(-10 * 60_000), limit: { harness: "claude-code", resetKnown: true, handTo: { harness: "codex" } } }]);
    expect(o.boardParts(o.lensLanes("")).waiting.map((x) => x.id)).toEqual(["lim"]);
    expect(o.storyOf(A.S.tasks.get("lim")!).words).toBe(A.L.t("limit.line", "Claude Code"));
    expect(src("onhand.tsx")).toContain('A.waiterAction(w.waiterId, "handoff")');
    A.S.tasks.clear();
  });

  test("the keys are the Mac's, zh and en together; the peek offers to watch; phone width keeps 44-tall fixes", () => {
    const zh = strings("zh"), en = strings("en");
    for (const k of ["onhand.brief.signin", "onhand.brief.signin.go", "onhand.brief.signin.pi", "onhand.brief.offline", "onhand.brief.offline.unknown", "onhand.brief.perm", "onhand.brief.perm.go", "onhand.brief.limit", "onhand.brief.limit.many", "onhand.peek.phone", "onhand.peek.last"]) {
      expect(zh.t(k)).not.toBe(k);
      expect(en.t(k)).not.toBe(k);
    }
    const brief = src("onhand-brief.tsx");
    expect(brief).toContain("A.watchLive(task.id, liveSize())");
    expect(brief).toContain('mode: "watch"');
    expect(brief).toContain('A.agentSetup(n.device!, "login"');
    expect(brief).toContain('t: "computer_grant"');
    expect(src("onhand.tsx")).toContain('A.waiterAction(w.waiterId, "handoff")');
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    expect(css).toContain(".room-phone .bneed .bacts .btn,\n.room-phone .ocard .oacts.on .btn {\n  min-height: 44px;");
  });
});
