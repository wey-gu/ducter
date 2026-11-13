// D214: 工作台 / Workbench, the opened task's control surface beside its conversation. Hidden by
// default; one toggle in the task's header (and ⌥⌘B with a keyboard). Wide, a resizable column on
// the right of the task (the task takes the whole screen for it); on a phone, a sheet over the
// task with a compact strip of pages that swipe. Pages show only when they have something:
//   改动 / Changes   the files it changed, each with its diff, and 改回去 / Undo per file;
//   文件 / Files     its working copy: a lazy tree, a file with its colours, and editing with a
//                    save that refuses when the agent wrote the file in between;
//   预览 / Preview   a page it serves (a dev server), framed from an address of its own;
//   浏览器 / Browser Ducter's own browser while it uses it (the live view, D190);
//   手机 / Phone     the phone it uses (a screen registered by the phone-use view), and an iOS
//                    Simulator booted on its computer when that is its business (D220, sim.tsx);
//   成果 / Results   what it made: pictures, links and files it showed.
// Everything is asked for only while the workbench is open and the page is in sight (D209).
import type { EvidenceRef, MediaRef } from "@ducter/protocol";
import type { WbAnswer, WbChange, WbEntry, WbError, WbPort, WbRequest, WbSim } from "@ducter/protocol/src/workbench.ts";
import { WB_HEAVY } from "@ducter/protocol/src/workbench.ts";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { hlLines, escHtml } from "./hl.ts";
import { LiveView, liveSize } from "./live.tsx";
import { MediaBlock } from "./media.tsx";
import { attention, browsing, finished, placeOf, reportOf, resultEvidence, type Task } from "./store.ts";
import { computerName } from "./where.ts";
import { SimScreen } from "./sim.tsx";
import { driverFor, screenFor } from "./workbench-screens.ts";
import { ask, wbSender } from "./workbench-ask.ts";

wbSender((f) => A.send(f));

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

export type BenchTab = "changes" | "files" | "preview" | "browser" | "phone" | "made";
const TABS: BenchTab[] = ["changes", "files", "preview", "browser", "phone", "made"];

// ---------- state (this device's own: open or not, the page, the width) ----------

const KEY = "ducter.bench";
interface Bench {
  open: boolean;
  tab: BenchTab;
  /** The column's width on a wide screen, CSS px. */
  width: number;
  /** Opened from the two panes: closing goes back beside the conversation. */
  promoted?: boolean;
}
const read = (): Bench => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Bench>;
    return { open: !!v.open, tab: TABS.includes(v.tab as BenchTab) ? (v.tab as BenchTab) : "changes", width: typeof v.width === "number" ? v.width : 0 };
  } catch {
    return { open: false, tab: "changes", width: 0 };
  }
};
export const bench: Bench = read();
const keep = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ open: bench.open, tab: bench.tab, width: bench.width }));
  } catch {}
};

interface FileView {
  path: string;
  answer?: Extract<WbAnswer, { op: "read" }>;
  draft?: string;
  saving?: boolean;
  conflict?: boolean;
  err?: string;
}
interface Data {
  changes?: Extract<WbAnswer, { op: "changes" }>;
  changesErr?: string;
  /** The change whose diff is open (Changes). */
  sel?: string;
  diffs: Map<string, Extract<WbAnswer, { op: "diff" }> | { err: string }>;
  dirs: Map<string, Extract<WbAnswer, { op: "files" }> | { err: string }>;
  expanded: Set<string>;
  file?: FileView;
  ports?: WbPort[];
  preview?: { port: number; url?: string; base?: string; reach?: "yes" | "no"; width: "phone" | "tablet" | "fill"; nonce: number };
  asking?: string;
  revert?: string;
  /** D220: booted iOS Simulators on its computer that are this task's business. */
  sims?: WbSim[];
  /** The screen shown on the Phone page when there is more than one: "phone" (Ducter's) or a simulator's udid. */
  screen?: string;
}
const store = new Map<string, Data>();
export const dataOf = (id: string): Data => {
  let d = store.get(id);
  if (!d) store.set(id, (d = { diffs: new Map(), dirs: new Map(), expanded: new Set([""]) }));
  return d;
};

// ---------- asking the home (workbench-ask.ts) ----------

const errWords = (e: { error?: WbError; message?: string }) =>
  e?.error === "failed" ? (e.message && e.message !== "timeout" ? t("wb.err.failed", e.message) : t("wb.err.generic")) : t(`wb.err.${e?.error ?? "generic"}`);

// ---------- which pages show (only those that have something) ----------

const kindOf = (task: Task) => placeOf(task).kind;
const hasFiles = (task: Task) => kindOf(task) === "repo" || kindOf(task) === "folder";

function made(task: Task): { media: MediaRef[]; links: EvidenceRef[] } {
  const media = [...(reportOf(task)?.media ?? [])];
  const links = resultEvidence(task).filter((e) => /^https?:\/\//.test(e.ref) || e.kind === "url");
  return { media, links };
}

export function tabsOf(task: Task): BenchTab[] {
  const d = dataOf(task.id);
  const out: BenchTab[] = [];
  if (hasFiles(task)) out.push("changes", "files");
  if (d.ports?.length) out.push("preview");
  const live = A.live?.watch && A.live.taskId === task.id;
  if (live || (!finished(task) && !!A.S.onHand?.tasks.find((c) => c.taskId === task.id)?.browsing)) out.push("browser");
  if (screenFor("phone", task) || d.sims?.length) out.push("phone");
  const m = made(task);
  if (m.media.length || m.links.length) out.push("made");
  return out;
}

/** Whether the workbench has anything for this task at all (the toggle shows only then). */
export const benchable = (task: Task) => tabsOf(task).length > 0;

/** The page shown: the one chosen when it is there, else the first that is. */
export function tabOf(task: Task): BenchTab | undefined {
  const tabs = tabsOf(task);
  return tabs.includes(bench.tab) ? bench.tab : tabs[0];
}

/** The task whose workbench is on screen now (main.tsx sets it each frame). */
export const benchShown = { taskId: "" };

export function benchOpen(task: Task | undefined): boolean {
  return !!task && bench.open && benchable(task);
}

/** Opens or closes it. Wide, from the two panes, it takes the whole screen for it (and gives it back). */
export function toggleBench(taskId: string, on = benchShown.taskId !== taskId) {
  const r = A.route;
  bench.open = on;
  if (on && r.name === "task" && !r.full && wideNow()) {
    bench.promoted = true;
    keep();
    return A.fill(true);
  }
  if (!on && bench.promoted && r.name === "task" && r.full) {
    bench.promoted = false;
    keep();
    return A.fill(false);
  }
  keep();
  A.changed();
}

/** Opens the workbench at a page (the head's Watch, the working copy's changes). */
export function openBenchAt(task: Task, tab: BenchTab) {
  bench.tab = tab;
  if (benchShown.taskId !== task.id) toggleBench(task.id, true);
  else showTab(task, tab);
}

export function showTab(task: Task, tab: BenchTab) {
  bench.tab = tab;
  keep();
  A.changed();
  void load(task, tab);
}

const wideNow = () => typeof matchMedia === "function" && matchMedia("(min-width: 1000px)").matches;

/** ⌥⌘B (Ctrl+Alt+B elsewhere): the right-hand panel's key in VS Code, Zed, Codex and t3code. */
export function benchKey(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!(mod && e.altKey && !e.shiftKey && (e.code === "KeyB" || e.key.toLowerCase() === "b"))) return false;
  const r = A.route;
  const task = r.name === "task" ? A.S.tasks.get(r.id) : undefined;
  if (!task || !benchable(task)) return false;
  e.preventDefault();
  toggleBench(task.id);
  return true;
}

// ---------- loading, only while open and in sight ----------

async function loadChanges(task: Task) {
  const d = dataOf(task.id);
  try {
    d.changes = (await ask(task.id, { op: "changes" })) as Extract<WbAnswer, { op: "changes" }>;
    d.changesErr = undefined;
    // A diff that is open is read again (it moved on).
    if (d.sel) void loadDiff(task, d.sel);
  } catch (e) {
    d.changesErr = errWords(e as { error: WbError });
  }
  A.changed();
}
async function loadDiff(task: Task, path: string) {
  const d = dataOf(task.id);
  try {
    d.diffs.set(path, (await ask(task.id, { op: "diff", path })) as Extract<WbAnswer, { op: "diff" }>);
  } catch (e) {
    d.diffs.set(path, { err: errWords(e as { error: WbError }) });
  }
  A.changed();
}
async function loadDir(task: Task, path: string) {
  const d = dataOf(task.id);
  try {
    d.dirs.set(path, (await ask(task.id, { op: "files", path })) as Extract<WbAnswer, { op: "files" }>);
  } catch (e) {
    d.dirs.set(path, { err: errWords(e as { error: WbError }) });
  }
  A.changed();
}
async function loadPorts(task: Task) {
  const d = dataOf(task.id);
  try {
    const p = (await ask(task.id, { op: "ports" })) as Extract<WbAnswer, { op: "ports" }>;
    const before = d.ports?.map((x) => x.port).join();
    d.ports = p.ports;
    if (before !== p.ports.map((x) => x.port).join()) A.changed();
  } catch {
    // Pages are a bonus: an older computer, or one away, just shows none.
  }
}
async function loadSims(task: Task) {
  const d = dataOf(task.id);
  try {
    const a = (await ask(task.id, { op: "sims" })) as Extract<WbAnswer, { op: "sims" }>;
    const before = JSON.stringify(d.sims ?? []);
    d.sims = a.sims;
    if (before !== JSON.stringify(a.sims)) A.changed();
  } catch {
    // An older computer, one away, or no Xcode: no simulator, nothing said.
  }
}
async function openFile(task: Task, path: string, keepDraft = false) {
  const d = dataOf(task.id);
  const prev = d.file?.path === path ? d.file : undefined;
  d.file = { path, ...(keepDraft && prev?.draft != null ? { draft: prev.draft } : {}) };
  A.changed();
  try {
    d.file.answer = (await ask(task.id, { op: "read", path })) as Extract<WbAnswer, { op: "read" }>;
  } catch (e) {
    d.file.err = errWords(e as { error: WbError });
  }
  A.changed();
}

function load(task: Task, tab: BenchTab | undefined) {
  if (!tab) return;
  const d = dataOf(task.id);
  if (tab === "changes") return loadChanges(task);
  if (tab === "files") {
    for (const p of d.expanded) void loadDir(task, p);
    if (d.file?.path && d.file.draft == null) void openFile(task, d.file.path);
  }
}

// ---------- the toggle (the task's header) ----------

const PanelMark = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
    <rect x="2.5" y="3.5" width="15" height="13" rx="3" />
    <path d={on ? "M11.5 3.8v12.4" : "M12.5 3.8v12.4"} />
    {on && <path d="M12 4h2.6a2.6 2.6 0 0 1 2.6 2.6v6.8a2.6 2.6 0 0 1-2.6 2.6H12z" fill="currentColor" stroke="none" opacity="0.28" />}
  </svg>
);

export function BenchToggle({ task }: { task: Task }) {
  // Pages appear as the task gets something to show: its ports are looked for once here.
  useEffect(() => void (A.S.welcomed && hasFiles(task) && !dataOf(task.id).ports && loadPorts(task)), [task.id, A.S.welcomed]);
  // D220: and the simulators that are its business, once (a computer with none answers at once).
  useEffect(() => void (A.S.welcomed && !dataOf(task.id).sims && loadSims(task)), [task.id, A.S.welcomed]);
  if (!benchable(task)) return null;
  const on = benchShown.taskId === task.id;
  return (
    <button class={`bench-toggle${on ? " on" : ""}`} aria-pressed={on} aria-label={t("wb.toggle")} title={`${t("wb.toggle")} · ${t("wb.toggle.about")}${coarseNow() ? "" : " (⌥⌘B)"}`} onClick={() => toggleBench(task.id)}>
      <PanelMark on={on} />
    </button>
  );
}
const coarseNow = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;

// ---------- the workbench ----------

const Close = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export function Workbench({ task, sheet }: { task: Task; sheet?: boolean }) {
  const tabs = tabsOf(task);
  const tab = tabOf(task);
  const d = dataOf(task.id);
  const pages = useRef<HTMLDivElement>(null);
  // First open, and again whenever the task moves on (a turn, a report), debounced.
  const n = task.events.length;
  useEffect(() => void load(task, tab), [task.id, tab, A.S.welcomed]);
  useEffect(() => {
    if (!tab || (tab !== "changes" && tab !== "files")) return;
    const id = setTimeout(() => {
      if (document.visibilityState !== "hidden") void load(task, tab);
    }, 1200);
    return () => clearTimeout(id);
  }, [n, task.card?.changes?.at, task.card?.folder?.at]);
  // Pages it serves come and go: looked for while open and in sight.
  useEffect(() => {
    void loadPorts(task);
    void loadSims(task);
    const id = setInterval(() => document.visibilityState !== "hidden" && (loadPorts(task), loadSims(task)), finished(task) ? 20_000 : 7_000);
    return () => clearInterval(id);
  }, [task.id, finished(task)]);
  // On the phone the pages swipe; the strip follows the page in view.
  useLayoutEffect(() => {
    const el = pages.current;
    if (!sheet || !el || !tab) return;
    const i = tabs.indexOf(tab);
    const x = i * el.clientWidth;
    if (Math.abs(el.scrollLeft - x) > 4) el.scrollTo({ left: x, behavior: "instant" as ScrollBehavior });
  }, [sheet, tab, tabs.join()]);
  const onSwipe = (e: JSX.TargetedEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const to = tabs[i];
    if (to && to !== tab && Math.abs(el.scrollLeft - i * el.clientWidth) < 2) showTab(task, to);
  };
  if (!tab) return null;
  const strip = (
    <div class="bench-tabs" role="tablist" aria-label={t("wb.tabs")}>
      {tabs.map((k) => (
        <button key={k} role="tab" aria-selected={k === tab} class={`bench-tab${k === tab ? " on" : ""}`} onClick={() => showTab(task, k)}>
          {t(`wb.tab.${k}`)}
          {k === "changes" && d.changes?.files.length ? <span class="bench-count">{d.changes.files.length + d.changes.more}</span> : null}
        </button>
      ))}
    </div>
  );
  const page = (k: BenchTab) => (
    <section key={k} class={`bench-page page-${k}`} role="tabpanel" aria-label={t(`wb.tab.${k}`)} hidden={!sheet && k !== tab}>
      {(sheet ? Math.abs(tabs.indexOf(k) - tabs.indexOf(tab)) <= 1 : k === tab) && <Page task={task} tab={k} />}
    </section>
  );
  if (sheet)
    return (
      <div class="bench as-sheet" role="dialog" aria-modal="true" aria-label={t("wb.toggle")}>
        <header class="bench-head">
          {strip}
          <button class="bench-x" aria-label={t("wb.close")} onClick={() => toggleBench(task.id, false)}>
            <Close />
          </button>
        </header>
        <div class="bench-pages" ref={pages} onScroll={onSwipe}>
          {tabs.map(page)}
        </div>
      </div>
    );
  return (
    <aside class="bench as-column" aria-label={t("wb.toggle")}>
      <Resizer />
      <header class="bench-head">
        {strip}
        <button class="bench-x" aria-label={t("wb.close")} title={`${t("wb.close")} (⌥⌘B)`} onClick={() => toggleBench(task.id, false)}>
          <Close />
        </button>
      </header>
      <div class="bench-pages">{page(tab)}</div>
    </aside>
  );
}

/** The column's left edge: drag to resize (kept on this device); arrows with a keyboard. */
function Resizer() {
  const set = (w: number) => {
    bench.width = Math.round(Math.min(Math.max(w, 340), innerWidth - 480));
    document.documentElement.style.setProperty("--bench-w", `${bench.width}px`);
  };
  useEffect(() => void (bench.width && set(bench.width)), []);
  return (
    <div
      class="bench-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("wb.resize")}
      tabIndex={0}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (m: PointerEvent) => set(innerWidth - m.clientX);
        const up = () => (el.removeEventListener("pointermove", move), el.removeEventListener("pointerup", up), keep());
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
      onKeyDown={(e) => {
        const w = bench.width || (document.querySelector(".bench.as-column") as HTMLElement | null)?.offsetWidth || 480;
        if (e.key === "ArrowLeft") set(w + 24), keep();
        if (e.key === "ArrowRight") set(w - 24), keep();
      }}
    />
  );
}

function Page({ task, tab }: { task: Task; tab: BenchTab }) {
  switch (tab) {
    case "changes":
      return <ChangesPage task={task} />;
    case "files":
      return <FilesPage task={task} />;
    case "preview":
      return <PreviewPage task={task} />;
    case "browser":
      return <BrowserPage task={task} />;
    case "phone":
      return <PhonePage task={task} />;
    case "made":
      return <MadePage task={task} />;
  }
}

// ---------- 改动 / Changes ----------

const statusWord = (c: WbChange) => (c.status === "added" ? t("wb.status.added") : c.status === "deleted" ? t("wb.status.deleted") : c.status === "renamed" && c.from ? t("wb.status.renamed", c.from) : "");

function Counts({ c }: { c: { adds?: number; dels?: number; binary?: boolean } }) {
  if (c.binary) return <span class="wb-n">{t("wb.status.binary")}</span>;
  return (
    <span class="wb-n">
      {c.adds ? <span class="add">+{c.adds}</span> : null}
      {c.dels ? <span class="del">−{c.dels}</span> : null}
    </span>
  );
}

const split = (p: string) => {
  const i = p.lastIndexOf("/");
  return i < 0 ? ["", p] : [p.slice(0, i + 1), p.slice(i + 1)];
};

function ChangesPage({ task }: { task: Task }) {
  const d = dataOf(task.id);
  const c = d.changes;
  if (d.changesErr && !c) return <p class="bench-note">{d.changesErr}</p>;
  if (!c) return <p class="bench-note quiet">{t("task.loading")}</p>;
  if (d.sel) return <DiffView task={task} path={d.sel} change={c.files.find((f) => f.path === d.sel)} />;
  if (!c.files.length) return <p class="bench-note">{t("wb.changes.none")}</p>;
  const adds = c.files.reduce((s, f) => s + (f.adds ?? 0), 0);
  const dels = c.files.reduce((s, f) => s + (f.dels ?? 0), 0);
  return (
    <div class="wb-changes">
      <div class="wb-sum">
        <span>{t("wb.changes.files", c.files.length + c.more)}</span>
        <Counts c={{ adds, dels }} />
        <span class="grow" />
        <span class="wb-base">{c.kind === "repo" && c.base ? t("wb.changes.base", c.base) : t("wb.changes.folder")}</span>
      </div>
      <ul class="wb-list">
        {c.files.map((f) => {
          const [dir, name] = split(f.path);
          return (
            <li key={f.path}>
              <button class={`wb-row st-${f.status}`} onClick={() => ((d.sel = f.path), A.changed(), loadDiff(task, f.path))}>
                <FileMark status={f.status} />
                <span class="wb-path">
                  <span class="nm">{name}</span>
                  {dir && <span class="dir">{dir.replace(/\/$/, "")}</span>}
                </span>
                {statusWord(f) && <span class="wb-st">{statusWord(f)}</span>}
                <Counts c={f} />
              </button>
            </li>
          );
        })}
      </ul>
      {c.more > 0 && <p class="bench-note quiet">{t("wb.changes.more", c.more)}</p>}
    </div>
  );
}

/** A file's mark: a page, with a corner for new and a stroke through for deleted. Drawn, never a character. */
function FileMark({ status, dir }: { status?: WbChange["status"]; dir?: boolean }) {
  if (dir)
    return (
      <svg class="fmark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
        <path d="M2 4.5c0-.8.6-1.5 1.5-1.5h3l1.5 1.6h4.5c.8 0 1.5.7 1.5 1.5v5.4c0 .8-.7 1.5-1.5 1.5h-9C2.6 13 2 12.3 2 11.5z" />
      </svg>
    );
  return (
    <svg class={`fmark ${status ?? ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <path d="M4 1.8h5.2L12.5 5v8.2c0 .6-.5 1-1 1h-7.5c-.6 0-1-.4-1-1V2.8c0-.6.4-1 1-1z" />
      <path d="M9 1.9V5h3.4" />
      {status === "added" && <path d="M8 7.5v4M6 9.5h4" stroke-linecap="round" />}
      {status === "deleted" && <path d="M5.6 9.5h4.8" stroke-linecap="round" />}
      {status === "modified" && <circle cx="8" cy="9.6" r="1.5" fill="currentColor" stroke="none" />}
      {status === "renamed" && <path d="M5.6 9.5h4.6M8.8 8l1.5 1.5L8.8 11" stroke-linecap="round" />}
    </svg>
  );
}

const Back = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);

interface DLine {
  k: "ctx" | "add" | "del" | "hunk";
  a?: number;
  b?: number;
  text: string;
}
/** A unified diff as lines with both numbers (the git header lines left out). */
export function parsePatch(patch: string): DLine[] {
  const out: DLine[] = [];
  let a = 0,
    b = 0,
    inHunk = false;
  for (const l of patch.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
    if (h) {
      a = Number(h[1]);
      b = Number(h[2]);
      inHunk = true;
      out.push({ k: "hunk", text: h[3]!.trim() });
      continue;
    }
    if (!inHunk) continue;
    if (l.startsWith("+")) out.push({ k: "add", b: b++, text: l.slice(1) });
    else if (l.startsWith("-")) out.push({ k: "del", a: a++, text: l.slice(1) });
    else if (l.startsWith(" ")) out.push({ k: "ctx", a: a++, b: b++, text: l.slice(1) });
    else if (l.startsWith("\\")) continue;
  }
  return out;
}

const DIFF_PAGE = 600;

function DiffView({ task, path, change }: { task: Task; path: string; change?: WbChange }) {
  const d = dataOf(task.id);
  const diff = d.diffs.get(path);
  const [shown, setShown] = useState(DIFF_PAGE);
  const lines = useMemo(() => (diff && "patch" in diff ? parsePatch(diff.patch) : []), [diff]);
  const html = useMemo(() => {
    // Colours per side: the old text and the new each read as code.
    const olds = hlLines(lines.filter((l) => l.k !== "add" && l.k !== "hunk").map((l) => l.text).join("\n"), path);
    const news = hlLines(lines.filter((l) => l.k !== "del" && l.k !== "hunk").map((l) => l.text).join("\n"), path);
    let i = 0,
      j = 0;
    return lines.map((l) => (l.k === "hunk" ? escHtml(l.text) : l.k === "del" ? olds[i++]! : l.k === "add" ? news[j++]! : (i++, news[j++]!)));
  }, [lines, path]);
  const [dir, name] = split(path);
  const canRevert = !!change && (kindOf(task) === "repo" || kindOf(task) === "folder") && attention(task) !== "working";
  return (
    <div class="wb-diff">
      <div class="wb-crumb">
        <button class="wb-back" onClick={() => ((d.sel = undefined), (d.revert = undefined), A.changed())}>
          <Back />
          <span>{t("wb.changes.back")}</span>
        </button>
      </div>
      <div class="wb-file-head">
        <div class="wb-path big">
          <span class="nm">{name}</span>
          {dir && <span class="dir">{dir.replace(/\/$/, "")}</span>}
        </div>
        {change && <Counts c={change} />}
      </div>
      <div class="wb-acts">
        {change?.status !== "deleted" && <Btn kind="text" size="sm" label={t("wb.open.file")} onClick={() => openInFiles(task, path)} />}
        {canRevert && d.revert !== path && <Btn kind="secondary" size="sm" label={t("wb.revert")} about={name} onClick={() => ((d.revert = path), A.changed())} />}
      </div>
      {d.revert === path && (
        <div class="card confirm wb-confirm" role="alert">
          <div class="said">{t("wb.revert.ask", name)}</div>
          <div class="btns">
            <Btn kind="text" label={t("wb.cancel")} onClick={() => ((d.revert = undefined), A.changed())} />
            <Btn kind="primary" label={t("wb.revert.go")} onClick={() => void revert(task, path)} />
          </div>
        </div>
      )}
      {!diff ? (
        <p class="bench-note quiet">{t("task.loading")}</p>
      ) : "err" in diff ? (
        <p class="bench-note">{diff.err}</p>
      ) : diff.binary ? (
        <p class="bench-note">{t("wb.diff.binary")}</p>
      ) : !lines.length ? (
        <p class="bench-note">{t("wb.diff.same")}</p>
      ) : (
        <div class="code wdiff" role="table">
          {lines.slice(0, shown).map((l, i) => (
            <div key={i} class={`wl ${l.k}${l.k === "hunk" && !l.text ? " bare" : ""}`} role="row">
              <span class="ln" aria-hidden="true">{l.a ?? ""}</span>
              <span class="ln" aria-hidden="true">{l.b ?? ""}</span>
              <span class="sg" aria-hidden="true">{l.k === "add" ? "+" : l.k === "del" ? "-" : ""}</span>
              <span class="tx" dangerouslySetInnerHTML={{ __html: html[i] || " " }} />
            </div>
          ))}
          {lines.length > shown && (
            <button class="qlink wb-more" onClick={() => setShown(shown + DIFF_PAGE)}>
              {t("wb.files.more", lines.length - shown)}
            </button>
          )}
        </div>
      )}
      {diff && "truncated" in diff && diff.truncated && <p class="bench-note quiet">{t("wb.diff.cut")}</p>}
    </div>
  );
}

async function revert(task: Task, path: string) {
  const d = dataOf(task.id);
  d.revert = undefined;
  try {
    await ask(task.id, { op: "revert", path });
    A.toast(t("wb.revert.done", split(path)[1]));
    d.sel = undefined;
  } catch (e) {
    A.toast(errWords(e as { error: WbError }));
  }
  void loadChanges(task);
}

function openInFiles(task: Task, path: string) {
  const d = dataOf(task.id);
  // Open its folders on the way.
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) d.expanded.add(parts.slice(0, i).join("/"));
  bench.tab = "files";
  keep();
  void openFile(task, path);
  for (const p of d.expanded) if (!d.dirs.has(p)) void loadDir(task, p);
  A.changed();
}

// ---------- 文件 / Files ----------

interface Row {
  path: string;
  name: string;
  depth: number;
  e: WbEntry;
}
const ROW_H = 30;

function FilesPage({ task }: { task: Task }) {
  const d = dataOf(task.id);
  if (d.file) return <FileView task={task} />;
  return <Tree task={task} />;
}

function Tree({ task }: { task: Task }) {
  const d = dataOf(task.id);
  const changed = new Map((d.changes?.files ?? []).map((f) => [f.path, f.status]));
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [h, setH] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The visible tree, flattened: only opened folders are walked (lazily listed).
  const rows: Row[] = [];
  const walk = (dir: string, depth: number) => {
    const l = d.dirs.get(dir);
    if (!l || "err" in l) return;
    for (const e of l.entries) {
      const path = dir ? `${dir}/${e.name}` : e.name;
      rows.push({ path, name: e.name, depth, e });
      if (e.kind === "d" && d.expanded.has(path)) walk(path, depth + 1);
    }
  };
  walk("", 0);
  const root = d.dirs.get("");
  if (!root) return <p class="bench-note quiet">{t("task.loading")}</p>;
  if ("err" in root) return <p class="bench-note">{root.err}</p>;
  if (!rows.length) return <p class="bench-note">{t("wb.files.empty")}</p>;
  // Windowed: a tree of thousands of rows draws only what is in view.
  const first = Math.max(0, Math.floor(top / ROW_H) - 10);
  const last = Math.min(rows.length, Math.ceil((top + h) / ROW_H) + 10);
  const dirChanged = (p: string) => [...changed.keys()].some((c) => c.startsWith(p + "/"));
  return (
    <div class="wb-tree" ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} role="tree" aria-label={t("wb.files.root")}>
      <div style={{ height: `${rows.length * ROW_H}px`, position: "relative" }}>
        {rows.slice(first, last).map((r, i) => {
          const st = changed.get(r.path);
          const open = r.e.kind === "d" && d.expanded.has(r.path);
          const heavy = r.e.kind === "d" && WB_HEAVY.has(r.name);
          return (
            <button
              key={r.path}
              role="treeitem"
              aria-expanded={r.e.kind === "d" ? open : undefined}
              class={`wb-node${st ? ` st-${st}` : ""}${r.e.kind === "d" && dirChanged(r.path) ? " has" : ""}${heavy ? " heavy" : ""}`}
              style={{ top: `${(first + i) * ROW_H}px`, paddingLeft: `${10 + r.depth * 16}px` }}
              title={heavy ? t("wb.files.heavy") : r.path}
              onClick={() => {
                if (r.e.kind === "d") {
                  if (open) d.expanded.delete(r.path);
                  else d.expanded.add(r.path), void loadDir(task, r.path);
                  A.changed();
                } else if (r.e.kind === "f") void openFile(task, r.path);
              }}
            >
              {r.e.kind === "d" ? <Caret open={open} /> : <span class="caret" />}
              <FileMark dir={r.e.kind === "d"} status={st} />
              <span class="nm">{r.name}</span>
              {st && <span class={`dot st-${st}`} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {[...d.dirs.values()].some((l) => "more" in l && l.more > 0) && <p class="bench-note quiet">{t("wb.files.more", [...d.dirs.values()].reduce((s, l) => s + ("more" in l ? l.more : 0), 0))}</p>}
    </div>
  );
}

const Caret = ({ open }: { open: boolean }) => (
  <svg class="caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : undefined }}>
    <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function FileView({ task }: { task: Task }) {
  const d = dataOf(task.id);
  const f = d.file!;
  const a = f.answer;
  const [dir, name] = split(f.path);
  const editing = f.draft != null;
  const html = useMemo(() => (a?.text != null ? hlLines(a.text, f.path) : []), [a?.text, f.path]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLDivElement>(null);
  const draftHtml = useMemo(() => (editing ? hlLines(f.draft!, f.path).join("\n") + "\n" : ""), [editing, f.draft, f.path]);
  const working = attention(task) === "working";
  const save = async (force = false) => {
    if (!a || f.draft == null) return;
    f.saving = true;
    A.changed();
    try {
      // Keep mine: over the version it is now (read again just before).
      const base = force ? ((await ask(task.id, { op: "read", path: f.path })) as Extract<WbAnswer, { op: "read" }>).version : a.version;
      const w = (await ask(task.id, { op: "write", path: f.path, text: f.draft, base })) as Extract<WbAnswer, { op: "write" }>;
      f.answer = { ...a, text: f.draft, version: w.version };
      f.draft = undefined;
      f.conflict = false;
      A.toast(t("wb.saved"));
      void loadChanges(task);
    } catch (e) {
      const err = e as { error: WbError };
      if (err.error === "conflict") f.conflict = true;
      else A.toast(errWords(err));
    }
    f.saving = false;
    A.changed();
  };
  return (
    <div class="wb-file">
      <div class="wb-crumb">
        <button class="wb-back" onClick={() => ((d.file = undefined), A.changed())}>
          <Back />
          <span>{t("wb.files.root")}</span>
        </button>
      </div>
      <div class="wb-file-head">
        <div class="wb-path big">
          <span class="nm">{name}</span>
          {dir && <span class="dir">{dir.replace(/\/$/, "")}</span>}
        </div>
        {a?.text != null && <span class="wb-n quiet">{t("wb.file.lines", html.length)}</span>}
      </div>
      {a?.text != null && (
        <div class="wb-acts">
          {editing ? (
            <>
              <span class="wb-unsaved">{f.draft !== a.text ? t("wb.unsaved") : ""}</span>
              <span class="grow" />
              <Btn kind="text" size="sm" label={t("wb.cancel")} onClick={() => ((f.draft = undefined), (f.conflict = false), A.changed())} />
              <Btn kind="primary" size="sm" label={f.saving ? t("wb.saving") : t("wb.save")} disabled={f.saving || f.draft === a.text} onClick={() => void save()} />
            </>
          ) : (
            <Btn kind="secondary" size="sm" label={t("wb.edit")} about={name} onClick={() => ((f.draft = a.text), A.changed(), requestAnimationFrame(() => ta.current?.focus()))} />
          )}
        </div>
      )}
      {editing && working && !f.conflict && <p class="bench-note warn">{t("wb.working")}</p>}
      {f.conflict && (
        <div class="card confirm wb-confirm" role="alert">
          <div class="said">{t("wb.conflict")}</div>
          <div class="btns">
            <Btn kind="text" label={t("wb.conflict.theirs")} onClick={() => ((f.conflict = false), (f.draft = undefined), A.changed(), openFile(task, f.path))} />
            <Btn kind="primary" label={t("wb.conflict.mine")} onClick={() => void save(true)} />
          </div>
        </div>
      )}
      {f.err ? (
        <p class="bench-note">{f.err}</p>
      ) : !a ? (
        <p class="bench-note quiet">{t("task.loading")}</p>
      ) : a.image ? (
        <div class="wb-image">
          <img src={a.image} alt={name} />
        </div>
      ) : a.tooBig ? (
        <p class="bench-note">{t("wb.file.big", size(a.size))}</p>
      ) : a.binary || a.text == null ? (
        <p class="bench-note">{t("wb.file.binary")}</p>
      ) : editing ? (
        // The editor: a plain textarea over the same text in colour; both scroll as one.
        <div class="code editor">
          <div class="gutter" aria-hidden="true">
            {f.draft!.split("\n").map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div class="ed">
            <div class="ed-hl" ref={pre} aria-hidden="true" dangerouslySetInnerHTML={{ __html: draftHtml }} />
            <textarea
              ref={ta}
              class="ed-ta"
              spellcheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label={name}
              value={f.draft}
              onInput={(e) => ((f.draft = e.currentTarget.value), A.changed())}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") return void (e.preventDefault(), save());
                if (e.key === "Escape") e.stopPropagation();
                if (e.key === "Tab" && !e.shiftKey && !e.metaKey) {
                  e.preventDefault();
                  const el = e.currentTarget;
                  el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
                  f.draft = el.value;
                  A.changed();
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div class="code view" role="document">
          {html.map((h, i) => (
            <div key={i} class="cl">
              <span class="ln" aria-hidden="true">{i + 1}</span>
              <span class="tx" dangerouslySetInnerHTML={{ __html: h || " " }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 预览 / Preview ----------

const Reload = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" />
  </svg>
);
const Out = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
  </svg>
);

/** The address a preview is at, from this page's own host (a port of the home's own). */
function previewBase(previewPort: number): string {
  return `${location.protocol}//${location.hostname.includes(":") ? `[${location.hostname}]` : location.hostname}:${previewPort}`;
}

async function openPreview(task: Task, port: number) {
  const d = dataOf(task.id);
  d.preview = { port, width: d.preview?.width ?? "fill", nonce: 0 };
  A.changed();
  try {
    const a = (await ask(task.id, { op: "preview", port })) as Extract<WbAnswer, { op: "preview" }>;
    const base = previewBase(a.previewPort);
    // Can this device reach it? (Over a home's one secure address it can't: say so, and offer Ducter's browser.)
    const reach = location.protocol === "https:" ? "no" : await fetch(`${base}/__ducter/ping`, { signal: AbortSignal.timeout(2500), cache: "no-store" }).then((r) => (r.ok || r.status === 204 ? "yes" : "no"), () => "no");
    if (d.preview?.port !== port) return;
    d.preview = { ...d.preview, base, url: `${base}/__ducter/enter/${a.token}?to=/`, reach: reach as "yes" | "no" };
  } catch (e) {
    if (d.preview?.port === port) d.preview = { ...d.preview, reach: "no" };
    A.toast(errWords(e as { error: WbError }));
  }
  A.changed();
}

const WIDTHS = { phone: 390, tablet: 820, fill: 0 } as const;

function PreviewPage({ task }: { task: Task }) {
  const d = dataOf(task.id);
  const ports = d.ports ?? [];
  const p = d.preview && ports.some((x) => x.port === d.preview!.port) ? d.preview : undefined;
  useEffect(() => {
    if (!p && ports[0]) void openPreview(task, ports[0].port);
  }, [ports.map((x) => x.port).join(), !!p]);
  const where = computerName(placeOf(task).device);
  const cur = ports.find((x) => x.port === p?.port);
  return (
    <div class="wb-preview">
      <div class="wb-bar">
        {ports.length > 1 ? (
          <select class="wb-select" aria-label={t("wb.preview.pages")} value={p?.port} onChange={(e) => void openPreview(task, Number(e.currentTarget.value))}>
            {ports.map((x) => (
              <option key={x.port} value={x.port}>
                {x.title ? `${x.title} · ${x.port}` : String(x.port)}
              </option>
            ))}
          </select>
        ) : (
          <div class="wb-where">
            <span class="nm">{cur?.title ?? `localhost:${cur?.port ?? ""}`}</span>
            <span class="dir">{t("wb.preview.on", where, cur?.port ?? 0)}</span>
          </div>
        )}
        <span class="grow" />
        <div class="seg sm" role="radiogroup" aria-label={t("wb.preview.width")}>
          {(["phone", "tablet", "fill"] as const).map((w) => (
            <button key={w} role="radio" aria-checked={p?.width === w} class={p?.width === w ? "on" : ""} onClick={() => p && ((p.width = w), A.changed())}>
              {t(`wb.preview.w.${w}`)}
            </button>
          ))}
        </div>
        <button class="wb-icon" aria-label={t("wb.preview.reload")} title={t("wb.preview.reload")} disabled={!p?.url} onClick={() => p && ((p.nonce += 1), A.changed())}>
          <Reload />
        </button>
        <button class="wb-icon" aria-label={t("wb.preview.open")} title={t("wb.preview.open")} disabled={!p?.url || p.reach !== "yes"} onClick={() => p?.url && window.open(p.url, "_blank", "noopener")}>
          <Out />
        </button>
      </div>
      {!p || !p.reach ? (
        <p class="bench-note quiet">{t("task.loading")}</p>
      ) : p.reach === "no" ? (
        <div class="wb-far">
          <p class="bench-note">{t("wb.preview.far")}</p>
          <Btn kind="secondary" label={t("wb.preview.via")} onClick={() => viaBrowser(task, p.port)} />
        </div>
      ) : (
        <div class={`wb-stage w-${p.width}`}>
          <iframe
            key={`${p.port}:${p.nonce}`}
            class="wb-frame"
            title={cur?.title ?? `localhost:${p.port}`}
            src={p.url}
            style={WIDTHS[p.width] ? { width: `${WIDTHS[p.width]}px` } : undefined}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            referrerpolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}

/** Where this device can't reach the page: Ducter's own browser on its computer opens it there. */
function viaBrowser(task: Task, port: number) {
  const device = placeOf(task).device;
  A.openLive("try", "localhost", liveSize(), true, device && device !== "local" ? device : undefined);
  const want = `http://localhost:${port}/`;
  const go = () => {
    if (A.live?.id && A.live.state === "open") return void A.liveInput({ kind: "go", url: want });
    if (A.live) setTimeout(go, 300);
  };
  setTimeout(go, 300);
}

// ---------- 浏览器 / Browser, 手机 / Phone: one screen frame ----------

/** One frame for every screen the task drives (Ducter's browser, a phone, a computer): who is driving, then the screen. */
export function Screen({ driver, where, head, children }: { driver: "agent" | "you" | "idle"; where?: string; head?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class={`screen drive-${driver}`}>
      <div class="screen-head">
        {head}
        {driver !== "idle" && (
          <span class={`driver ${driver}`} role="status">
            <span class="driver-mark" aria-hidden="true" />
            {driver === "agent" ? t("wb.browser.agent") : t("wb.browser.you")}
          </span>
        )}
        {where && <span class="screen-where">{where}</span>}
      </div>
      <div class="screen-body">{children}</div>
    </div>
  );
}

function BrowserPage({ task }: { task: Task }) {
  const lv = A.live;
  const mine = lv?.watch && lv.taskId === task.id;
  const br = browsing(task);
  if (!mine)
    return (
      <Screen driver="idle" where={br?.host}>
        <div class="screen-wait">
          <p class="bench-note">{t("wb.browser.idle")}</p>
          <Btn kind="secondary" label={t("wb.browser.watch")} onClick={() => A.watchLive(task.id, liveSize())} />
        </div>
      </Screen>
    );
  return (
    <Screen driver={lv!.turn === "you" ? "you" : "agent"}>
      <LiveView embedded />
    </Screen>
  );
}

/** Ducter's phone while the task uses it, and the simulators that are its business (D220). With
 *  more than one, a choice of screens above; each screen in the same frame. */
function PhonePage({ task }: { task: Task }) {
  const d = dataOf(task.id);
  const P = screenFor("phone", task);
  const sims = d.sims ?? [];
  const keys = [...(P ? ["phone"] : []), ...sims.map((x) => x.udid)];
  const on = d.screen && keys.includes(d.screen) ? d.screen : keys[0];
  if (!on) return null;
  const sim = sims.find((x) => x.udid === on);
  const where = computerName(placeOf(task).device);
  const pick = keys.length > 1 && (
    <div class="seg sm screens" role="radiogroup" aria-label={t("wb.screens")}>
      {keys.map((k) => (
        <button key={k} role="radio" aria-checked={k === on} class={k === on ? "on" : ""} onClick={() => ((d.screen = k), A.changed())}>
          {k === "phone" ? t("wb.phone.ducter") : sims.find((x) => x.udid === k)?.name}
        </button>
      ))}
    </div>
  );
  if (sim)
    return (
      <Screen driver="idle" where={[sim.name, sim.os, t("wb.sim.on", where)].filter(Boolean).join(" · ")} head={pick}>
        <SimScreen task={task} sim={sim} where={where} active={tabOf(task) === "phone" && benchShown.taskId === task.id} onSim={(s) => ((d.sims = sims.map((x) => (x.udid === s.udid ? s : x))), A.changed())} />
      </Screen>
    );
  const Phone = P!;
  return (
    <Screen driver={driverFor("phone", task)} head={pick}>
      <Phone task={task} active={tabOf(task) === "phone" && benchShown.taskId === task.id} />
    </Screen>
  );
}

// ---------- 成果 / Results ----------

function MadePage({ task }: { task: Task }) {
  const m = made(task);
  return (
    <div class="wb-made">
      {m.media.length > 0 && (
        <section>
          <h3 class="wb-h">{t("wb.made.pictures")}</h3>
          <MediaBlock media={m.media} side="task" ctx={{ kind: "task", taskId: task.id }} />
        </section>
      )}
      {m.links.length > 0 && (
        <section>
          <h3 class="wb-h">{t("wb.made.links")}</h3>
          <ul class="wb-list">
            {m.links.map((e) => (
              <li key={e.ref}>
                <button
                  class="wb-row"
                  onClick={() => (/^https?:\/\//.test(e.ref) ? window.open(e.ref, "_blank", "noopener") : hasFiles(task) ? openInFiles(task, e.ref.replace(/^\.?\//, "")) : undefined)}
                >
                  {/^https?:\/\//.test(e.ref) ? <Out /> : <FileMark />}
                  <span class="wb-path">
                    <span class="nm">{e.label || e.ref}</span>
                    {e.label && <span class="dir">{e.ref}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
