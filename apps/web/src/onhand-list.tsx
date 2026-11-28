// D-PENDING (research/245 §3.5): 列表 / List, the dense table of the same board. One row per task,
// 32 pt tall, its one state glyph, its title, project, computer, agent, age, last step, and PR and
// CI as cells of their own. The list is a way of looking, never a second board: the filter, the
// sort and the mode are one saved view, and the same tasks, state and actions stand behind it.
//
// Under eight tasks none of this is offered: the consumer keeps today's calm board.
import { useEffect, useState } from "preact/hooks";
import type { BoardMode, BoardView, TaskFilter, TaskSort } from "@ducter/protocol";
import { BUILTIN_VIEWS, VIEW_NAME_MAX } from "@ducter/protocol/src/views.ts";
import { prOf, prSaid } from "@ducter/protocol/src/pr-state.ts";
import { sayable } from "@ducter/protocol/src/say.ts";
import { A } from "./app.ts";
import { Btn, Field, KeyCaps, SelectionBar, TableRow } from "./controls.tsx";
import { Menu, MenuItem, MenuSep } from "./menu.tsx";
import { ago, harnessName } from "./format.ts";
import { attention, harnessOf, placeOf, reportOf, title, type Task } from "./store.ts";
import { computerName, computers } from "./where.ts";
import { firstSentence } from "./onhand-brief.tsx";
import { shortTitle } from "./transcript.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The list is offered from this many tasks on, and the keys hint comes with it. */
export const LIST_FROM = 8;
const MODE_KEY = "ducter.onhand.mode";
const LONG_MS = 6 * 3600_000;

/** 概览 / Overview unless this device chose 列表 / List. Never the default by itself. */
export function readMode(): BoardMode {
  try {
    return localStorage.getItem(MODE_KEY) === "list" ? "list" : "overview";
  } catch {
    return "overview";
  }
}

export function writeMode(m: BoardMode) {
  try {
    if (m === "list") localStorage.setItem(MODE_KEY, "list");
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* a private window keeps it for this page only */
  }
}

/** Every task one row each: a card under another holder's PR is not a second row. */
export function listTasks(tasks: Iterable<Task>): Task[] {
  return [...tasks].filter((x) => !!x.card && !x.card.heldUnder && attention(x) !== "superseded" && attention(x) !== "dropped");
}

/** The one truth state, as D661 derives it; a failure is the done tier's (the references' order). */
export function truthState(task: Task): "needs_you" | "stopped" | "working" | "waiting" | "done" {
  const s = task.card?.truth?.state;
  if (s === "needs_you" || s === "stopped" || s === "working" || s === "waiting") return s;
  if (s === "done" || s === "failed") return "done";
  const a = attention(task);
  if (a === "needs_you") return "needs_you";
  if (a === "working" || a === "queued") return "working";
  if (a === "blocked") return "waiting";
  return "done";
}

/** A task's state's own time: when it came into the state it is in. */
export function stateSince(task: Task): string {
  return task.card?.truth?.since ?? task.card?.updatedAt ?? task.card?.openedAt ?? "";
}

const ageMs = (task: Task, now = Date.now()) => {
  const at = Date.parse(stateSince(task));
  return Number.isFinite(at) ? Math.max(0, now - at) : 0;
};

/** 跑了很久的 / Running long: working, or in rounds, for more than six hours. */
export function runningLong(task: Task, now = Date.now()): boolean {
  const s = truthState(task);
  if (!(s === "working" || !!task.card?.rounds)) return false;
  return ageMs(task, now) >= LONG_MS;
}

/** An open PR (or one ready to merge) is waiting: the PR cell has something to say. */
export function prWaiting(task: Task): boolean {
  const pr = prOf(task.card?.prs);
  if (pr) {
    const said = prSaid(pr);
    return pr.state === "open" && said.phase !== "merged" && said.phase !== "closed" && said.phase !== "let_go" && said.phase !== "duplicate";
  }
  return !!prNo(task);
}

/** 来自 / From: the source's kind (a GitHub issue, an Obsidian note, a Linear ticket). */
export function sourceOf(task: Task): string {
  const s = task.card?.source as { kind?: string; source?: string } | undefined;
  return s?.kind ?? s?.source ?? "";
}

export function taskMatches(task: Task, f: TaskFilter, now = Date.now()): boolean {
  if (f.state && truthState(task) !== f.state) return false;
  if (f.project && task.card?.projectKey !== f.project) return false;
  const p = placeOf(task);
  if (f.computer && (p.kind === "none" ? "" : (p as { device?: string }).device ?? "local") !== f.computer) return false;
  if (f.agent && (task.card?.harness ?? "") !== f.agent) return false;
  if (f.source && sourceOf(task) !== f.source) return false;
  if (f.long && !runningLong(task, now)) return false;
  if (f.pr && !prWaiting(task)) return false;
  return true;
}

const RANK: Record<string, number> = { needs_you: 0, stopped: 1, working: 2, waiting: 3, done: 4 };

/** The rows the list draws: the filter, Find's words, then the order chosen. */
export function listRows(tasks: Task[], f: TaskFilter, sort: TaskSort, q = "", now = Date.now()): Task[] {
  const low = q.trim().toLowerCase();
  const rows = tasks.filter((x) => taskMatches(x, f, now) && (!low || `${title(x)} ${x.card?.projectName ?? ""} ${harnessName(harnessOf(x))}`.toLowerCase().includes(low)));
  return [...rows].sort((a, b) => {
    if (sort === "urgency") {
      const d = (RANK[truthState(a)] ?? 9) - (RANK[truthState(b)] ?? 9);
      if (d) return d;
      return Date.parse(stateSince(a)) - Date.parse(stateSince(b));
    }
    if (sort === "age") return Date.parse(stateSince(a)) - Date.parse(stateSince(b));
    const at = (x: Task) => Date.parse(x.card?.updatedAt ?? x.card?.openedAt ?? "") || 0;
    return at(b) - at(a);
  });
}

/** A built-in's own name, and a person's saved name. */
export function viewName(v: BoardView): string {
  const k = v.builtin ? `onhand.view.${v.builtin}` : "";
  return (k && A.L.t(k)) || v.name;
}

/** The three built-ins are offered only while they have rows; a person's view always is. */
export function savedViews(tasks: Task[], now = Date.now()): BoardView[] {
  const built = BUILTIN_VIEWS.filter((v) => tasks.some((x) => taskMatches(x, v.filter, now)));
  return [...built, ...A.S.views];
}

export function applyView(v: BoardView) {
  A.applyView?.(v);
}

// ---------- the list's columns ----------

/** PR number and CI count as their own cells: never dot-joined. */
export function prCells(task: Task): { pr: string; ci: string } {
  const n = prNo(task);
  const pr = prOf(task.card?.prs);
  const said = pr ? prSaid(pr) : undefined;
  const c = said?.checks;
  const ci = c ? t("onhand.list.ci", c.passed, c.total) : said?.phase === "failing" ? t("onhand.list.ci.failed") : "";
  return { pr: n ? `#${n}` : "", ci };
}

/** The PR number from the facts Ducter holds: a card's PRs, else a merge/PR link it made. */
export function prNo(task: Task): string {
  const p = prOf(task.card?.prs);
  if (p) return p.pr.split("#")[1] ?? "";
  const ref = (task.card?.integrated?.ref ?? task.acted?.ref ?? "") as string;
  return /\/pull\/(\d+)/.exec(ref)?.[1] ?? "";
}

/** The last step in the person's words: the report's gist; before it exists, the task's own words
 *  muted behind 它说 / It said, never Ducter speaking. */
export function lastStep(task: Task): { text: string; said: boolean } {
  const g = task.card?.gist?.text?.trim();
  if (g) return { text: g, said: false };
  const r = reportOf(task);
  const raw = r ? (sayable(r.summary, A.readerLang(task)) ?? "") : "";
  const line = firstSentence(raw);
  return line ? { text: t("onhand.said", line), said: true } : { text: "", said: false };
}

export function ageText(task: Task, now = Date.now()): string {
  return ago(A.L, stateSince(task), now);
}

/** The table's grid at a width: fixed columns and two that share what is left. The list mode takes
 *  the board's whole width (no peek), so 1180 and 1400 both hold every column. */
export function listGrid(width: number): { template: string; compact: boolean } {
  if (width < 700) return { template: "1fr", compact: true };
  return { template: "24px minmax(150px, 1.15fr) minmax(78px, .7fr) minmax(72px, .6fr) minmax(78px, .62fr) 64px minmax(140px, 1.15fr) 56px 64px", compact: false };
}

// ---------- the view, the filters and the keys' foot ----------

function filterCount(f: TaskFilter): number {
  return Object.values(f).filter((x) => x !== undefined && x !== "" && x !== false).length;
}

function FilterBar(p: {
  tasks: Task[];
  filter: TaskFilter;
  sort: TaskSort;
  onFilter: (f: TaskFilter) => void;
  onSort: (s: TaskSort) => void;
  onSave: (name: string) => void;
}) {
  const [open, setOpen] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2400);
    return () => clearTimeout(id);
  }, [saved]);
  const projects: [string, string][] = [...new Map<string, string>(p.tasks.flatMap((x) => (x.card?.projectKey ? [[x.card.projectKey, x.card.projectName || x.card.projectKey] as [string, string]] : []))).entries()];
  const computers = [...new Set(p.tasks.map((x) => {
    const q = placeOf(x);
    return q.kind === "none" ? "" : (q as { device?: string }).device ?? "local";
  }).filter(Boolean))];
  const agents = [...new Set(p.tasks.map((x) => x.card?.harness ?? "").filter(Boolean))];
  const sources = [...new Set(p.tasks.map(sourceOf).filter(Boolean))];
  const pick = (k: keyof TaskFilter, v: string) => {
    const nf: TaskFilter = { ...p.filter };
    if (!v) delete nf[k];
    else (nf as Record<string, unknown>)[k] = v;
    p.onFilter(nf);
    setOpen("");
  };
  const chip = (id: string, label: string, on: boolean, options: { v: string; label: string }[]) => (
    <span class="fchip-wrap">
      <Btn kind="text" size="sm" class={`filter-chip${on ? " on" : ""}`} label={label} chev expanded={open === id} onClick={() => setOpen(open === id ? "" : id)} />
      {open === id && (
        <Menu class="filter-menu" label={label} onClose={() => setOpen("")}>
          <MenuItem onClick={() => pick(id as keyof TaskFilter, "")} checked={!on}>
            {t("onhand.filter.any")}
          </MenuItem>
          <MenuSep />
          {options.map((o) => (
            <MenuItem key={o.v} onClick={() => pick(id as keyof TaskFilter, o.v)} checked={(p.filter as Record<string, unknown>)[id] === o.v}>
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  );
  return (
    <div class="filter-bar" role="toolbar" aria-label={t("onhand.filter")}>
      {chip("state", p.filter.state ? t(`onhand.state.${p.filter.state}`) : t("onhand.filter.state"), !!p.filter.state, [
        { v: "needs_you", label: t("onhand.state.needs_you") },
        { v: "stopped", label: t("onhand.state.stopped") },
        { v: "working", label: t("onhand.state.working") },
        { v: "waiting", label: t("onhand.state.waiting") },
        { v: "done", label: t("onhand.state.done") },
      ])}
      {chip("project", p.filter.project ? (projects.find(([k]) => k === p.filter.project)?.[1] ?? p.filter.project) : t("onhand.filter.project"), !!p.filter.project, projects.map(([k, n]) => ({ v: k, label: n })))}
      {chip("computer", p.filter.computer ? computerName(p.filter.computer) : t("onhand.filter.computer"), !!p.filter.computer, computers.map((v) => ({ v, label: computerName(v) })))}
      {chip("agent", p.filter.agent ? harnessName(p.filter.agent) : t("onhand.filter.agent"), !!p.filter.agent, agents.map((v) => ({ v, label: harnessName(v) })))}
      {chip("source", p.filter.source ? p.filter.source : t("onhand.filter.source"), !!p.filter.source, sources.map((v) => ({ v, label: v })))}
      <span class="grow" />
      <span class="fchip-wrap">
        <Btn kind="text" size="sm" class="filter-chip" label={t(`onhand.sort.${p.sort}`)} chev expanded={open === "sort"} onClick={() => setOpen(open === "sort" ? "" : "sort")} />
        {open === "sort" && (
          <Menu class="filter-menu" label={t("onhand.sort")} onClose={() => setOpen("")}>
            {(["urgency", "changed", "age"] as TaskSort[]).map((s) => (
              <MenuItem key={s} onClick={() => (p.onSort(s), setOpen(""))} checked={p.sort === s}>
                {t(`onhand.sort.${s}`)}
              </MenuItem>
            ))}
          </Menu>
        )}
      </span>
      {filterCount(p.filter) > 0 && <Btn kind="text" size="sm" class="filter-clear" label={t("onhand.filter.clear")} onClick={() => p.onFilter({})} />}
      {!saving ? (
        <span class="view-save-wrap">
          <Btn kind="text" size="sm" class="view-save" label={saved ? t("onhand.view.saved") : t("onhand.view.save")} onClick={() => setSaving(true)} />
        </span>
      ) : (
        <span class="view-save-inline">
          <Field value={name} label={t("onhand.view.name")} placeholder={t("onhand.view.name.ph")} maxLength={VIEW_NAME_MAX} autoFocus onInput={setName} onKeyDown={(e) => {
            if (e.key === "Escape") setSaving(false);
            if (e.key === "Enter" && name.trim()) (p.onSave(name.trim()), setSaving(false), setSaved(true), setName(""));
          }} />
          <Btn kind="secondary" size="sm" label={t("onhand.view.save.go")} disabled={!name.trim()} onClick={() => (p.onSave(name.trim()), setSaving(false), setSaved(true), setName(""))} />
          <Btn kind="text" size="sm" label={t("onhand.bulk.cancel")} onClick={() => setSaving(false)} />
        </span>
      )}
    </div>
  );
}

/** The keys, said once at the list's foot (D457's drawn caps). */
function KeysFoot() {
  return (
    <KeyCaps
      items={[
        { keys: "j k", words: t("onhand.keys.move") },
        { keys: "⏎", words: t("onhand.keys.open") },
        { keys: "esc", words: t("onhand.keys.back") },
        { keys: "x", words: t("onhand.keys.pick") },
        { keys: "⇧", words: t("onhand.keys.extend") },
        { keys: "⌘A", words: t("onhand.keys.all") },
        { keys: "/", words: t("onhand.keys.find") },
        { keys: "f", words: t("onhand.keys.filter") },
        { keys: "g p", words: t("onhand.keys.project") },
        { keys: "g s", words: t("onhand.keys.state") },
        { keys: "e", words: t("onhand.keys.end") },
        { keys: "p", words: t("onhand.keys.pause") },
        { keys: "m", words: t("onhand.keys.move") },
        { keys: "a", words: t("onhand.keys.agent") },
        { keys: "⌘ 退格", words: t("onhand.keys.drop") },
        { keys: "⌘K", words: t("onhand.keys.act") },
      ]}
    />
  );
}

// ---------- many at once ----------

export type BulkAsk = { op: import("@ducter/protocol").BulkOp; device?: string; harness?: string };

/** What the selection can do together, each counted from the rows it names. */
export function bulkCounts(rows: Task[]): { end: number; pause: number; cont: number; move: number; reassign: number; drop: number; working: number; skippedEnd: number; skippedPause: number; skippedCont: number; skippedDrop: number } {
  const atWork = (x: Task) => truthState(x) === "working";
  const fin = (x: Task) => truthState(x) === "done";
  return {
    end: rows.length,
    pause: rows.filter(atWork).length,
    cont: rows.filter((x) => !atWork(x)).length,
    move: rows.filter((x) => !fin(x)).length,
    reassign: rows.filter((x) => !fin(x)).length,
    drop: rows.filter((x) => !fin(x)).length,
    working: rows.filter(atWork).length,
    skippedEnd: rows.filter(atWork).length,
    skippedPause: rows.filter((x) => !atWork(x)).length,
    skippedCont: rows.filter(atWork).length,
    skippedDrop: rows.filter(fin).length,
  };
}

/** The one confirmation's words, naming the count and what is skipped. */
export function bulkAskWords(ask: BulkAsk, rows: Task[], target?: string): string {
  const n = rows.length;
  const c = bulkCounts(rows);
  switch (ask.op) {
    case "end":
      return c.skippedEnd ? t("onhand.bulk.ask.end", n, c.skippedEnd) : t("onhand.bulk.ask.end.all", n);
    case "pause":
      return c.skippedPause ? t("onhand.bulk.ask.pause", n, c.skippedPause) : t("onhand.bulk.ask.pause.all", n);
    case "continue":
      return c.skippedCont ? t("onhand.bulk.ask.continue", n, c.skippedCont) : t("onhand.bulk.ask.continue.all", n);
    case "drop":
      return c.skippedDrop ? t("onhand.bulk.ask.drop", n, c.skippedDrop) : t("onhand.bulk.ask.drop.all", n);
    case "move":
      return t("onhand.bulk.ask.move", n, target ?? "");
    case "reassign":
      return t("onhand.bulk.ask.reassign", n, target ?? "");
  }
}

function BulkBar(p: { rows: Task[]; pick?: "" | "move" | "reassign"; onPicked?: () => void; onBulk: (ask: BulkAsk) => void; onClear: () => void }) {
  const [ask, setAsk] = useState<BulkAsk | null>(null);
  const [menu, setMenu] = useState<"" | "move" | "reassign">(p.pick ?? "");
  useEffect(() => setMenu(p.pick ?? ""), [p.pick]);
  const c = bulkCounts(p.rows);
  const machines = computers();
  const agents = [...new Set(p.rows.map((x) => x.card?.harness ?? "").filter(Boolean))];
  const target = ask ? (ask.op === "move" ? computerName(ask.device) : ask.op === "reassign" ? harnessName(ask.harness ?? "") : "") : "";
  return (
    <SelectionBar label={t("onhand.sel.n", p.rows.length)} onClear={p.onClear} clearLabel={t("onhand.sel.clear")}>
      {ask ? (
        <>
          <span class="bulk-ask">{bulkAskWords(ask, p.rows, target)}</span>
          <Btn kind="secondary" size="sm" label={t("onhand.bulk.go")} onClick={() => (p.onBulk(ask), setAsk(null))} />
          <Btn kind="text" size="sm" label={t("onhand.bulk.cancel")} onClick={() => setAsk(null)} />
        </>
      ) : (
        <>
          <Btn kind="text" size="sm" label={t("onhand.bulk.end")} disabled={!c.end} onClick={() => setAsk({ op: "end" })} />
          <Btn kind="text" size="sm" label={t("onhand.bulk.pause")} disabled={!c.pause} onClick={() => setAsk({ op: "pause" })} />
          <Btn kind="text" size="sm" label={t("onhand.bulk.continue")} disabled={!c.cont} onClick={() => setAsk({ op: "continue" })} />
          <span class="fchip-wrap">
            <Btn kind="text" size="sm" label={t("onhand.bulk.move")} chev expanded={menu === "move"} disabled={!c.move} onClick={() => setMenu(menu === "move" ? "" : "move")} />
            {menu === "move" && (
              <Menu class="bulk-menu" label={t("onhand.bulk.move")} onClose={() => (setMenu(""), p.onPicked?.())}>
                {machines.map((d) => (
                  <MenuItem key={d.id} onClick={() => (setMenu(""), p.onPicked?.(), setAsk({ op: "move", device: d.home ? "local" : d.id }))}>
                    {d.name}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </span>
          <span class="fchip-wrap">
            <Btn kind="text" size="sm" label={t("onhand.bulk.reassign")} chev expanded={menu === "reassign"} disabled={!c.reassign} onClick={() => setMenu(menu === "reassign" ? "" : "reassign")} />
            {menu === "reassign" && (
              <Menu class="bulk-menu" label={t("onhand.bulk.reassign")} onClose={() => (setMenu(""), p.onPicked?.())}>
                {agents.map((h) => (
                  <MenuItem key={h} onClick={() => (setMenu(""), p.onPicked?.(), setAsk({ op: "reassign", harness: h }))}>
                    {harnessName(h)}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </span>
          <Btn kind="text" size="sm" label={t("onhand.bulk.drop")} disabled={!c.drop} onClick={() => setAsk({ op: "drop" })} />
        </>
      )}
    </SelectionBar>
  );
}

// ---------- the table ----------

function RowMark({ s }: { s: ReturnType<typeof truthState> }) {
  const path = s === "done" ? "M5 10.5l3.2 3.2L15 7" : s === "needs_you" ? "M10 5.5v5.5M10 14.2v.3" : s === "stopped" ? "M7 7l6 6M13 7l-6 6" : "";
  return (
    <span class={`lmark k-${s}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18">
        {s === "working" ? <circle cx="10" cy="10" r="4.4" fill="currentColor" /> : s === "waiting" ? <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8" /> : <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6" />}
        {path && <path d={path} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />}
      </svg>
    </span>
  );
}

function projectWords(task: Task): string {
  const k = task.card?.projectKey;
  if (k) return task.card?.projectName || k;
  return task.card?.projectGroup === "computer" ? t("onhand.computers") : t("onhand.other");
}

function ListRow(p: { task: Task; at: boolean; sel: boolean; room: string; onOpen: () => void; onPick: (e: MouseEvent) => boolean }) {
  const task = p.task;
  const s = truthState(task);
  const pcell = prCells(task);
  const step = lastStep(task);
  const pl = placeOf(task);
  const dev = pl.kind === "none" ? "" : ((pl as { device?: string }).device ?? "local");
  const label = `${t(`onhand.state.${s}`)} ${title(task)}`;
  return (
    <TableRow at={p.at} selected={p.sel} label={label} class={`lrow s-${s}${p.room === "phone" ? " compact" : ""}`} onOpen={p.onOpen} onPick={p.onPick}>
      <span class="c-state" title={t(`onhand.state.${s}`)}>
        <RowMark s={s} />
      </span>
      <span class="c-title" title={title(task)}>
        {shortTitle(title(task)) || t("task.unknown")}
      </span>
      <span class="c-project" title={projectWords(task)}>{projectWords(task)}</span>
      <span class="c-computer">{dev ? computerName(dev) : ""}</span>
      <span class="c-agent">{harnessName(harnessOf(task))}</span>
      <span class="c-age">{ageText(task)}</span>
      <span class={`c-step${step.said ? " said" : ""}`} title={step.text}>{step.text}</span>
      <span class="c-pr">{pcell.pr}</span>
      <span class="c-ci">{pcell.ci}</span>
    </TableRow>
  );
}

export function ListBoard(p: {
  room: "full" | "phone" | "side";
  tasks: Task[];
  rows: Task[];
  filter: TaskFilter;
  sort: TaskSort;
  mode: BoardMode;
  focus: string;
  sel: Set<string>;
  onFilter: (f: TaskFilter) => void;
  onSort: (s: TaskSort) => void;
  onSave: (name: string) => void;
  onFocus: (id: string) => void;
  onPick: (id: string, e: MouseEvent) => boolean;
  onOpen: (id: string) => void;
  onClear: () => void;
  onBulk: (ask: BulkAsk) => void;
  pick?: "" | "move" | "reassign";
  onPicked?: () => void;
}) {
  const [compact, setCompact] = useState(p.room === "phone");
  useEffect(() => setCompact(p.room === "phone" || (typeof innerWidth === "number" && innerWidth < 700)), [p.room]);
  useEffect(() => {
    const on = () => setCompact(p.room === "phone" || (typeof innerWidth === "number" && innerWidth < 700));
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, [p.room]);
  if (p.room === "phone" || compact) {
    return (
      <div class="onhand-list-table compact">
        <FilterBar tasks={p.tasks} filter={p.filter} sort={p.sort} onFilter={p.onFilter} onSort={p.onSort} onSave={p.onSave} />
        <div class="otable compact" role="table" aria-label={t("onhand.list")}>
          {p.rows.map((task) => (
            <TableRow key={task.id} at={p.focus === task.id} selected={p.sel.has(task.id)} label={title(task)} class={`lrow compact s-${truthState(task)}`} onOpen={() => p.onOpen(task.id)} onPick={(e) => p.onPick(task.id, e)}>
              <span class="c-title" title={title(task)}>{shortTitle(title(task)) || t("task.unknown")}</span>
              <span class="c-meta">
                <RowMark s={truthState(task)} />
                <span>{projectWords(task)}</span>
                <span>{ageText(task)}</span>
                <span class="c-step">{lastStep(task).text}</span>
              </span>
            </TableRow>
          ))}
        </div>
        {p.sel.size > 0 && <BulkBar rows={p.tasks.filter((x) => p.sel.has(x.id))} pick={p.pick} onPicked={p.onPicked} onBulk={p.onBulk} onClear={p.onClear} />}
      </div>
    );
  }
  return (
    <div class="onhand-list-table">
      <FilterBar tasks={p.tasks} filter={p.filter} sort={p.sort} onFilter={p.onFilter} onSort={p.onSort} onSave={p.onSave} />
      <div class="otable" role="table" aria-label={t("onhand.list")}>
        <div class="otable-head" role="row">
          <span class="c-state" aria-hidden="true" />
          <span class="c-title" role="columnheader">{t("onhand.col.title")}</span>
          <span class="c-project" role="columnheader">{t("onhand.col.project")}</span>
          <span class="c-computer" role="columnheader">{t("onhand.col.computer")}</span>
          <span class="c-agent" role="columnheader">{t("onhand.col.agent")}</span>
          <span class="c-age" role="columnheader">{t("onhand.col.age")}</span>
          <span class="c-step" role="columnheader">{t("onhand.col.step")}</span>
          <span class="c-pr" role="columnheader">PR</span>
          <span class="c-ci" role="columnheader">CI</span>
        </div>
        {p.rows.map((task) => (
          <ListRow key={task.id} task={task} at={p.focus === task.id} sel={p.sel.has(task.id)} room={p.room} onOpen={() => p.onOpen(task.id)} onPick={(e) => p.onPick(task.id, e)} />
        ))}
      </div>
      {!p.rows.length && <p class="none">{t("onhand.list.none")}</p>}
      {p.sel.size > 0 && <BulkBar rows={p.tasks.filter((x) => p.sel.has(x.id))} pick={p.pick} onPicked={p.onPicked} onBulk={p.onBulk} onClear={p.onClear} />}
      <div class="list-foot">
        <KeysFoot />
      </div>
    </div>
  );
}

/** The saved views under the projects, in the project column: the built-ins first (only those with
 *  rows), then the person's own. */
export function BoardViews(p: { tasks: Task[] }) {
  const vs = savedViews(p.tasks);
  if (!vs.length) return null;
  return (
    <div class="view-list" role="group" aria-label={t("onhand.views")}>
      <small class="view-head">{t("onhand.views")}</small>
      {vs.map((v) => (
        <Btn key={v.id} kind="text" size="sm" class="view-row" label={viewName(v)} onClick={() => applyView(v)} />
      ))}
    </div>
  );
}
