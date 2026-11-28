// D662 (research/245 §3.5): 列表 / List. A 40-task board with real lengths (zh and en titles, a long
// repository name, seven agents, three computers, PRs with CI): the columns, the urgency order, the
// filters and the three built-in views (only while they have rows), PR and CI as their own cells,
// the muted 它说 fallback, the one ask that names the count and what is skipped, the keys hint in
// both languages, and the calm under eight. With Chrome, the real app.css lays a table out at the
// board's widths for 390, 1000, 1180 and 1400 and no fixed cell runs past its track.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const AGENTS = ["codex", "claude-code", "pi", "antigravity", "opencode", "kimi", "cursor"];
const PROJECTS: [string, string][] = [
  ["github.com/nowledge-co/mem", "mem"],
  ["github.com/nowledge-co/nowledge-labs-website", "nowledge-labs-website"],
  ["github.com/nowledge-co/openclaw-memory-integration-experiments", "openclaw-memory-integration-experiments"],
  ["github.com/wey-gu/ducter", "ducter"],
];
const TITLES = [
  "核对数据迁移设计并补齐统一备份与恢复",
  "The homepage hero image is cut in half on a phone",
  "跟进 #11230：远程访问设置重构，等 hawkingrei 复审",
  "Make every Keep say when it ends, how long it has gone, and end",
  "OpenClaw 记忆插件：把会话摘要接到 Mem 的 thread API",
];
const ATT = ["needs_you", "working", "working", "blocked", "blocked", "done", "done", "done"];

function fixture(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const [key, name] = PROJECTS[i % PROJECTS.length]!;
    const att = ATT[i % ATT.length]!;
    const pr = i % 5 === 0 ? [{ pr: `nowledge-co/mem#${11200 + i}`, url: "", state: "open" as const, at: iso(-MIN), standing: { at: iso(-MIN), title: "t", head: "352a5bf1", checks: { total: 11, passed: 6, failed: [], pending: ["build"] } } }] : undefined;
    return {
      taskId: `t${i}`,
      persona: "default",
      title: `${TITLES[i % TITLES.length]} ${i}`,
      place: i % 3 === 0 ? { kind: "none" } : { kind: "repo", device: ["local", "haswell", "mac"][i % 3], repoPath: `/w/${name}`, branch: `b${i}` },
      harness: AGENTS[i % AGENTS.length],
      attention: att,
      residency: "warm",
      openedAt: iso(-(i + 1) * HOUR),
      updatedAt: iso(-i * MIN),
      projectKey: key,
      projectName: name,
      ...(pr ? { prs: pr } : {}),
      ...(i % 4 === 1 ? { gist: { text: "在连接器设置里换掉旧的 CLI 调用。", reportSeq: 1 } } : {}),
      ...(i === 2 ? { lastReport: { state: "progress", summary: "在跑 lcov 和 e2e，还剩一项检查。", questions: [], evidence: [] }, language: "zh" } : {}),
      ...(att === "working" && i % 8 === 1 ? { truth: { state: "working", since: iso(-7 * HOUR) } } : {}),
    };
  });
}

async function board(n = 40, lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  const l = await import("../src/onhand-list.tsx");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks: fixture(n), counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as never);
  return { A, l, tasks: l.listTasks(A.S.tasks.values()) };
}

describe("D662: the list's rows and columns", () => {
  test("forty tasks, one row each, ordered needs-you > working > waiting > done", async () => {
    const { l, tasks } = await board();
    expect(tasks).toHaveLength(40);
    const rows = l.listRows(tasks, {}, "urgency");
    const rank = { needs_you: 0, stopped: 1, working: 2, waiting: 3, done: 4 };
    const ranks = rows.map((x) => rank[l.truthState(x)]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    // By last change: the newest first.
    const changed = l.listRows(tasks, {}, "changed");
    expect(changed[0]!.id).toBe("t0");
  });

  test("seven agents, three computers, the long repository name; PR and CI are two cells", async () => {
    const { l, tasks } = await board();
    expect(new Set(tasks.map((x) => x.card?.harness)).size).toBe(7);
    const withPr = tasks.find((x) => x.id === "t5")!;
    expect(l.prCells(withPr)).toEqual({ pr: "#11205", ci: "CI 6/11" });
    expect(l.prCells(tasks.find((x) => x.id === "t1")!)).toEqual({ pr: "", ci: "" });
    // Never joined: the cell text holds neither " · " nor the other's words.
    for (const x of tasks) {
      const c = l.prCells(x);
      expect(c.pr).not.toContain("·");
      expect(c.ci).not.toContain("#");
    }
  });

  test("the last step is the gist; before it, the task's words muted behind 它说", async () => {
    const { l, tasks } = await board();
    expect(l.lastStep(tasks.find((x) => x.id === "t1")!)).toEqual({ text: "在连接器设置里换掉旧的 CLI 调用。", said: false });
    const raw = l.lastStep(tasks.find((x) => x.id === "t2")!);
    expect(raw.said).toBe(true);
    expect(raw.text.startsWith("它说：")).toBe(true);
  });

  test("filters: state, project, computer, agent; Find narrows by words", async () => {
    const { l, tasks } = await board();
    expect(l.listRows(tasks, { state: "needs_you" }, "urgency").every((x) => l.truthState(x) === "needs_you")).toBe(true);
    expect(l.listRows(tasks, { project: "github.com/wey-gu/ducter" }, "urgency")).toHaveLength(10);
    expect(l.listRows(tasks, { computer: "haswell" }, "urgency").every((x) => (x.card?.place as { device?: string }).device === "haswell")).toBe(true);
    expect(l.listRows(tasks, { agent: "kimi" }, "urgency").every((x) => x.card?.harness === "kimi")).toBe(true);
    expect(l.listRows(tasks, {}, "urgency", "hero image").length).toBe(8);
  });

  test("the built-in views show only while they have rows", async () => {
    const { l, tasks } = await board();
    const names = l.savedViews(tasks).map((v) => v.builtin);
    expect(names).toEqual(["needs_today", "running_long", "prs_waiting"]);
    // A finished task whose PR is still open waits: PRs waiting keeps it.
    const done = tasks.filter((x) => l.truthState(x) === "done");
    expect(l.savedViews(done).map((v) => v.builtin)).toEqual(["prs_waiting"]);
    const calm = done.filter((x) => !x.card?.prs);
    expect(l.savedViews(calm).map((v) => v.builtin)).toEqual([]);
  });
});

describe("D662: many at once", () => {
  test("the ask names the count and what is skipped, zh and en", async () => {
    const { A, l, tasks } = await board();
    const sel = l.listRows(tasks, {}, "urgency").slice(0, 8);
    const working = sel.filter((x) => l.truthState(x) === "working").length;
    expect(working).toBeGreaterThan(0);
    expect(l.bulkAskWords({ op: "end" }, sel)).toBe(`8 个里 ${working} 个正在做，会做完这一轮再停。`);
    A.L = strings("en");
    expect(l.bulkAskWords({ op: "end" }, sel)).toBe(`Of 8, ${working} are working; they stop when this round ends.`);
    const done = sel.filter((x) => l.truthState(x) !== "working");
    expect(l.bulkAskWords({ op: "end" }, done)).toBe(`End all ${done.length}?`);
    expect(l.bulkAskWords({ op: "move", device: "haswell" }, sel, "haswell")).toBe("Move all 8 to haswell?");
  });

  test("every bulk and key word exists in both languages", () => {
    const zh = strings("zh");
    const en = strings("en");
    for (const k of ["onhand.bulk.end", "onhand.bulk.pause", "onhand.bulk.continue", "onhand.bulk.move", "onhand.bulk.reassign", "onhand.bulk.drop", "onhand.bulk.go", "onhand.keys.walk", "onhand.keys.drop.cap", "onhand.view.save", "onhand.view.needs_today", "onhand.view.running_long", "onhand.view.prs_waiting", "onhand.overview", "onhand.list"]) {
      expect(zh.t(k)).not.toBe(k);
      expect(en.t(k)).not.toBe(k);
    }
    // ⌫ is not a glyph a phone draws as text (D211): the key is said in words.
    expect(zh.t("onhand.keys.drop.cap")).toBe("⌘ 退格");
    expect(en.t("onhand.keys.drop.cap")).toBe("⌘ Delete");
  });
});

describe("D662: the consumer stays calm", () => {
  test("under eight tasks: no views, no toggle", async () => {
    const { l, tasks } = await board(6);
    expect(tasks.length).toBeLessThan(l.LIST_FROM);
    expect(l.BoardViews({ tasks })).toBeNull();
  });

  test("the list is never the default by itself", async () => {
    const { l } = await board();
    try {
      localStorage.removeItem("ducter.onhand.mode");
    } catch {
      /* no storage in this runtime: readMode falls back to overview */
    }
    expect(l.readMode()).toBe("overview");
  });
});

// ---- the CSS and the rendered geometry ----

function decl(selector: string): string {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const items = m[1]!.split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (items.includes(selector)) out.push(m[2]!);
  }
  return out.join(";");
}

describe("D662: the table's CSS", () => {
  test("the grid in app.css is listGrid's, the row 32 tall, the list wide with no peek", async () => {
    const { l } = await board();
    expect(decl(".otable > .lrow")).toContain(`grid-template-columns: ${l.listGrid(1180).template}`);
    expect(decl(".otable > .lrow")).toMatch(/height:\s*32px/);
    expect(css).toContain(".board-wrap:has(.list-mode) .peek-col { display: none; }");
    expect(css).toMatch(/@container \(max-width: 760px\)/);
    expect(l.listGrid(390).compact).toBe(true);
  });
});

function chrome(): string | undefined {
  const home = process.env.HOME ?? "";
  const paths = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((p): p is string => !!p);
  for (const p of paths) if (existsSync(p)) return p;
  for (const n of ["google-chrome", "chromium"]) {
    const found = Bun.which(n);
    if (found) return found;
  }
  return undefined;
}

// The board's room at each window (the project column and the gutters taken off), as the demo
// measured it: 390 is the phone's two-line row.
const ROOM: [number, number][] = [[390, 358], [1000, 952], [1180, 840], [1400, 1060]];
const LONG = "openclaw-memory-integration-experiments";
const row = (i: number) =>
  `<div role="row" class="table-row lrow s-working"><span class="c-state"><span class="lmark k-working"><svg viewBox="0 0 20 20" width="18" height="18"></svg></span></span>` +
  `<span class="c-title">${TITLES[i % TITLES.length]}</span><span class="c-project">${LONG}</span><span class="c-computer">MacBook Pro M3</span>` +
  `<span class="c-agent">Kimi Code CLI</span><span class="c-age">44 分钟前</span><span class="c-step">在处理 thread API 的分页，还剩两项检查。</span><span class="c-pr">#11230</span><span class="c-ci">CI 11/14</span></div>`;
const compactRow = (i: number) =>
  `<div role="row" class="table-row lrow compact s-working"><span class="c-title">${TITLES[i % TITLES.length]}</span><span class="c-meta"><span class="lmark k-working"></span><span>${LONG}</span><span>44 分钟前</span><span class="c-step">在处理 thread API 的分页。</span></span></div>`;
const table = (w: number, room: number) =>
  `<div data-w="${w}" style="width:${room}px"><div class="onhand-list-table${w < 700 ? " compact" : ""}"><div class="otable${w < 700 ? " compact" : ""}">` +
  (w < 700 ? "" : `<div class="otable-head" role="row"><span class="c-state"></span><span class="c-title">任务</span><span class="c-project">项目</span><span class="c-computer">电脑</span><span class="c-agent">AI agent</span><span class="c-age">多久了</span><span class="c-step">最后一步</span><span class="c-pr">PR</span><span class="c-ci">CI</span></div>`) +
  Array.from({ length: 5 }, (_, i) => (w < 700 ? compactRow(i) : row(i))).join("") +
  `</div><div class="sel-bar" role="toolbar"><b>已选 8 个</b><span class="bulk-ask">8 个里 2 个正在做，会做完这一轮再停。</span><button class="btn secondary sm"><span class="lbl">就这样</span></button><button class="btn text sm"><span class="lbl">先不</span></button></div></div></div>`;

const browser = chrome();
if (!browser) {
  test.skip("the list's table fits 390, 1000, 1180 and 1400 (no Chrome here)", () => {});
} else {
  test("the list's table fits 390, 1000, 1180 and 1400 (rendered in Chrome)", () => {
    for (const [w, room] of ROOM) {
      const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">${table(w, room)}<pre id="result"></pre><script>
{
  const bad = [];
  const page = document.querySelector("[data-w]");
  const box = page.getBoundingClientRect();
  for (const el of page.querySelectorAll(".otable, .lrow, .otable-head, .sel-bar")) {
    const r = el.getBoundingClientRect();
    if (r.right > box.right + 1) bad.push(el.className + " runs to " + r.right.toFixed(1) + " past " + box.right.toFixed(1));
    if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className + " scrollWidth " + el.scrollWidth + " > " + el.clientWidth);
  }
  // The fixed cells say all of what they hold: age, PR and CI are never cut.
  for (const el of page.querySelectorAll(".c-age, .c-pr, .c-ci")) {
    if (getComputedStyle(el).display === "none") continue;
    if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className + " cut: " + el.textContent);
  }
  for (const el of page.querySelectorAll(".lrow:not(.compact)")) {
    const h = el.getBoundingClientRect().height;
    if (Math.abs(h - 32) > 0.5) bad.push("row " + h + " tall");
  }
  document.getElementById("result").textContent = JSON.stringify({ bad });
}
</script></body></html>`;
      const dir = mkdtempSync(join(tmpdir(), "ducter-list-geometry-"));
      const file = join(dir, "list.html");
      try {
        writeFileSync(file, html);
        const run = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-crash-reporter", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=2000", `--window-size=${w},1200`, "--dump-dom", `file://${file}`], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
        const out = `${run.stdout ?? ""}`;
        const m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(out);
        if (!m) throw new Error(`Chrome drew no result at ${w} (status ${run.status}):\n${out.slice(-800)}`);
        const got = JSON.parse(m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) as { bad: string[] };
        expect({ w, bad: got.bad }).toEqual({ w, bad: [] });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
}
