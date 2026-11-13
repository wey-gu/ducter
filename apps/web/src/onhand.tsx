// On hand as a workspace (D216): one list on every screen. The phone, the side pane beside the
// conversation, the whole screen and the rail beside an opened task all draw the same rows, and
// only the room changes. A row says what the task is on now in words (its latest step, what it
// waits for, its question, its result), and on a repo task its branch, +/−, and a draft PR or a
// merge. Density grows with use: the find field from ten tasks, by project from two projects,
// keys and selection only where a keyboard and a pointer are.
import type { ComponentChildren } from "preact";
import { memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { callEnded, type Bodies, type LogEvent } from "@ducter/protocol";
import { blocksOf, type Block } from "@ducter/protocol/src/transcript.ts";
import { sayable, proofLabel } from "@ducter/protocol/src/say.ts";
import { A } from "./app.ts";
import { Btn, Seg } from "./controls.tsx";
import { ago, harnessName } from "./format.ts";
import { CallRow } from "./phone.tsx";
import { attention, canIntegrate, finished, harnessOf, headlineEvidence, LANE, placeOf, projectOf, reasonOf, reportOf, title, type Task } from "./store.ts";
import { liveWords, rowWords, shortTitle, StepMark, taskBlocks } from "./transcript.tsx";
import { computerName, deviceWait, manyComputers } from "./where.ts";
import { DecisionCard, stateLabel } from "./views.tsx";
import { Goal, Groove, untilLine, WaitBubble, waitCaption, waitLine } from "./work.tsx";
import { handover, isNewResult, statusOf, urgentOf, type Status } from "./seen.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Where the list is drawn: the phone's page, the pane beside the conversation, the whole screen,
 *  or the rail beside a task opened at the whole screen. */
export type Room = "phone" | "side" | "full" | "rail";

// ---------- what a row says ----------

const isStep = (b: Bodies["task_event"]) => b.role === "tool" || (b.role === "assistant" && (!!b.text?.trim() || !!b.thinking?.length));

/** The task's latest step or words: the newest one this client holds, else the card's (D216). */
export function latestOf(task: Task): LogEvent | undefined {
  let held: LogEvent | undefined;
  for (let i = task.events.length - 1; i >= 0; i--) {
    const e = task.events[i]!;
    if (e.kind === "task_event" && isStep(e.body as Bodies["task_event"])) {
      held = e;
      break;
    }
  }
  const card = task.card?.latest;
  return held && (!card || held.seq >= card.seq) ? held : card;
}

const stepCache = new WeakMap<LogEvent, Block[]>();
/** What a working task is on now: the mark of its latest step and the step in words (the
 *  transcript's own words, D210), or the agent's latest words. */
export function nowLine(task: Task): { mark: string; words: string; code: string; bad?: boolean } | undefined {
  const ev = latestOf(task);
  if (!ev) return undefined;
  let blocks = stepCache.get(ev);
  if (!blocks) stepCache.set(ev, (blocks = blocksOf(harnessOf(task), [ev], true)));
  const b = blocks.at(-1);
  if (b?.k === "voice") return { mark: "", words: b.text.split("\n")[0]!, code: "" };
  if (b?.k !== "steps") return undefined;
  const l = b.lines.at(-1);
  if (!l) return undefined;
  if (l.k === "looks") return { mark: l.searches && !l.reads ? "searched" : "read", words: liveWords(blocks), code: "" };
  const [words, code] = rowWords(l.row);
  const bad = l.row.outcome === "error";
  return { mark: bad ? "error" : (l.row.step?.kind ?? "thought"), words, code, bad };
}

/** The second line of a row: what it is on, waits for, asks, or came to. */
export function storyOf(task: Task): { mark?: string; words: string; code?: string; tone?: "needs" | "failed" } {
  const a = attention(task);
  const r = reportOf(task);
  if (a === "needs_you") {
    const d = A.S.pendingDecision(task.id);
    const q = d?.question || r?.questions?.[0]?.text || (r?.summary ? sayable(r.summary, A.L.lang) : "");
    return { words: q || stateLabel(a), tone: "needs" };
  }
  if (a === "blocked") {
    const w = A.S.waiterFor(task.id);
    if (w) return { words: [waitLine(w.reason), waitCaption(w)].filter(Boolean).join(" · ") };
    const why = reasonOf(task);
    return { words: (why && (deviceWait(why) ?? why)) || stateLabel(a) };
  }
  if (a === "working" || a === "queued") {
    const u = A.S.untilOf(task);
    if (u) return { words: untilLine(u) };
    const n = nowLine(task);
    if (n) return { mark: n.mark, words: n.words, code: n.code };
    return { words: stateLabel(a) };
  }
  const failed = a === "failed";
  const ev = r && !failed ? headlineEvidence(task.evidence.length ? task.evidence : r.evidence) : undefined;
  const first = r ? sayable(r.summary.split("\n")[0], A.L.lang) : undefined;
  return { words: first || (ev && proofLabel(ev, A.L.lang)) || stateLabel(a), ...(failed ? { tone: "failed" as const } : {}) };
}

/** How long it has been at it ("12 分钟"), or when it last changed ("3 分钟前"). */
function timeOf(task: Task, now = Date.now()): string {
  const a = attention(task);
  if (a === "working" || a === "queued") {
    const at = Date.parse(task.card?.openedAt ?? task.openedAt ?? "");
    if (!Number.isFinite(at)) return "";
    const m = Math.max(0, Math.floor((now - at) / 60_000));
    return m < 1 ? t("time.now") : m < 60 ? t("time.min", m) : t("time.hour", Math.floor(m / 60));
  }
  return ago(A.L, task.card?.updatedAt, now);
}

/** A repo task's draft PR or merge from Ducter, in a word. */
function prWord(task: Task): string {
  const i = task.card?.integrated;
  if (task.acted?.ok && task.acted.action === "merge") return t("onhand.pr.merged");
  if (task.acted?.ok && task.acted.action === "open_pr") return t("onhand.pr.draft");
  return i ? t(i.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft") : "";
}

/** What a row is matched against by Find and the switcher. */
export function haystack(task: Task): string {
  const p = placeOf(task);
  return [title(task), projectOf(task), p.kind === "repo" ? `${p.repoPath} ${p.branch ?? ""}` : p.kind === "folder" ? p.path : "", harnessName(harnessOf(task)), p.kind !== "none" ? computerName(p.device) : "", storyOf(task).words].join(" ").toLowerCase();
}

/** Every word typed is somewhere in it (any order); "" matches all. */
export function matches(task: Task, q: string): boolean {
  const hay = haystack(task);
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

// ---------- the keys, the focus and the selection ----------

/** The list's state that outlives a render: the row the keys are on, what is selected, Find. */
export const L = { focus: "", sel: new Set<string>(), anchor: "", find: "", order: [] as string[], dropAsk: false };

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

function move(by: number, open: boolean) {
  const o = L.order;
  if (!o.length) return;
  const i = o.indexOf(L.focus);
  const next = o[i < 0 ? (by > 0 ? 0 : o.length - 1) : Math.max(0, Math.min(o.length - 1, i + by))]!;
  L.focus = next;
  if (open) A.go({ name: "task", id: next, full: A.route.name !== "conv" && !!A.route.full });
  else A.changed();
  requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
}

/** D244: the next (1) or the previous (-1) task, opened in place: the rail's order when it is
 *  drawn (or On hand's), else the board's own by state. */
export function walk(by: number) {
  const r = A.route;
  const cur = r.name === "task" ? r.id : L.focus;
  let o = L.order;
  if (!o.includes(cur)) {
    const b = A.S.board();
    o = [b.lanes[LANE.needs]!, b.lanes[LANE.working]!, b.lanes[LANE.waiting]!, b.lanes[LANE.done]!].flat().map((x) => x.id);
  }
  if (!o.length) return;
  const i = o.indexOf(cur);
  const next = o[i < 0 ? (by > 0 ? 0 : o.length - 1) : Math.max(0, Math.min(o.length - 1, i + by))]!;
  if (next === cur) return;
  L.focus = next;
  A.go({ name: "task", id: next, full: r.name !== "conv" && !!r.full });
  requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
}
A.walk = walk;

/** ⌘⇧] / ⌘⇧[ (Ctrl elsewhere), from anywhere, the composer included (Lody's keys). */
export function walkKey(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || A.sheet || A.live) return;
  const by = e.code === "BracketRight" || e.key === "}" || e.key === "]" ? 1 : e.code === "BracketLeft" || e.key === "{" || e.key === "[" ? -1 : 0;
  if (!by || A.route.name !== "task") return;
  e.preventDefault();
  walk(by);
}

function toggle(id: string) {
  if (L.sel.has(id)) L.sel.delete(id);
  else L.sel.add(id);
  L.anchor = id;
  L.dropAsk = false;
  A.changed();
}

function extend(id: string) {
  const o = L.order;
  const a = o.indexOf(L.anchor || L.focus);
  const b = o.indexOf(id);
  if (a < 0 || b < 0) return toggle(id);
  for (const x of o.slice(Math.min(a, b), Math.max(a, b) + 1)) L.sel.add(x);
  L.dropAsk = false;
  A.changed();
}

/** j/k (or the arrows) walk the list, Enter opens, x selects, / finds, Esc lets go first. In the
 *  rail beside an opened task, j/k open the next one. */
function useKeys(room: Room) {
  useEffect(() => {
    if (room === "phone") return;
    const k = (e: KeyboardEvent) => {
      if (A.sheet || A.live || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !typing()) {
        const f = document.getElementById("onhand-find");
        if (f) return void (e.preventDefault(), f.focus());
      }
      if (typing()) return;
      const rail = room === "rail";
      if (e.key === "j" || e.key === "ArrowDown") return void (e.preventDefault(), move(1, rail));
      if (e.key === "k" || e.key === "ArrowUp") return void (e.preventDefault(), move(-1, rail));
      if ((e.key === "Enter" || e.key === "o") && L.focus && !rail) return void (e.preventDefault(), A.go({ name: "task", id: L.focus, full: A.route.name === "onhand" && !!A.route.full }));
      if (e.key === "x" && L.focus && room === "full") return void (e.preventDefault(), toggle(L.focus));
      if (e.key === "Escape" && (L.sel.size || L.find) && !rail) {
        e.preventDefault();
        if (L.sel.size) L.sel.clear();
        else L.find = "";
        L.dropAsk = false;
        A.changed();
      }
    };
    // Before Esc's "up one level" (main.tsx), so a selection or a Find is let go of first.
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [room]);
}

// ---------- one row ----------

type RowProps = { task: Task; room: Room; state?: boolean; v: string; focus: boolean; sel: boolean; opened: boolean };

/** One task in two lines: the title, and what it is on; on the right what changed, a draft PR or
 *  a merge, and the time; under it where and who (wide). Hover offers the one next step. */
const TaskRow = memo(function TaskRow({ task, room, state, focus, sel, opened }: RowProps) {
  const a = attention(task);
  const p = placeOf(task);
  const s = storyOf(task);
  const ch = task.card?.changes;
  const pr = prWord(task);
  const w = a === "blocked" ? A.S.waiterFor(task.id) : undefined;
  const u = A.S.untilOf(task);
  const arrived = a !== "blocked" && A.S.justArrived(task.id);
  // D244: one status place: needs you > working > new result. In the rail all three; elsewhere the
  // sections already say needs you and working, so only a new result takes it.
  const st = statusOf(task.id, a, task.card?.updatedAt);
  const handing = handover(task.id, st);
  const rail = room === "rail";
  const place: Status = rail ? st : st === "new" ? "new" : "";
  // An active row in the rail drops its resting facts (+a −d, a draft PR, the time).
  const active = rail && place !== "";
  const unseen = st === "new";
  const wide = room !== "phone";
  const meta = wide && room !== "rail" ? [manyComputers() && p.kind !== "none" ? computerName(p.device) : "", harnessName(harnessOf(task))].filter(Boolean).join(" · ") : "";
  const branch = wide && room !== "rail" && p.kind === "repo" ? p.branch : "";
  const acts = wide ? <RowActs task={task} /> : null;
  const onClick = (e: MouseEvent) => {
    if (room === "full" && (e.metaKey || e.ctrlKey)) return void (e.preventDefault(), toggle(task.id));
    if (room === "full" && e.shiftKey) return void (e.preventDefault(), extend(task.id));
    L.focus = task.id;
    A.go({ name: "task", id: task.id, full: room === "full" || room === "rail" });
  };
  return (
    <div class={`trow${focus ? " kfocus" : ""}${sel ? " sel" : ""}${opened ? " opened" : ""}${arrived ? " arrived" : ""}${unseen ? " unseen" : ""} a-${a}`} data-row={task.id}>
      <button class="tmain" onClick={onClick} title={title(task)} aria-current={opened ? "page" : undefined}>
        {arrived && <span class="pop-bub" aria-hidden="true" />}
        <span class="l1">
          {w && <WaitBubble w={w} />}
          <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
          {!active && ch && (ch.adds > 0 || ch.dels > 0) && (
            <span class="stat">
              {ch.adds > 0 && <i class="add">+{ch.adds}</i>}
              {ch.dels > 0 && <i class="del">−{ch.dels}</i>}
            </span>
          )}
          {pr && !active && <span class="pr">{pr}</span>}
          {state && <b class={`st ${a === "needs_you" ? "needs" : a === "failed" ? "failed" : ""}`}>{stateLabel(a)}</b>}
          {place && <StatusFace s={place} failed={a === "failed"} handing={handing} />}
          {!active && <span class="time">{timeOf(task)}</span>}
        </span>
        <span class={`l2${s.tone ? ` ${s.tone}` : ""}`}>
          {s.mark && <StepMark k={s.mark} />}
          <span class="w">{s.words}</span>
          {s.code && <code class="c">{s.code}</code>}
          {branch && <code class="br">{branch}</code>}
          {meta && <span class="meta">{meta}</span>}
        </span>
        {u && !finished(task) && room !== "rail" && <Goal u={u} />}
        {w && (w.check || w.event) && room !== "rail" && <Groove w={w} />}
      </button>
      {acts}
    </div>
  );
});

/** D244: a row's status place: the partner's own clay face at 24, still (no breathing in a row).
 *  Needs you raises its flag, working reads, a new result smiles (a failed one raises the flag).
 *  The handover plays once: the reading face sinks and fades as the done face pops up. */
export function StatusFace({ s, failed, handing, title: label }: { s: Status; failed?: boolean; handing?: boolean; title?: string }) {
  if (!s) return null;
  const art = s === "needs" || (s === "new" && failed) ? "needsyou" : s === "working" ? "working" : "done";
  const words = label ?? (s === "new" ? t("onhand.new") : s === "needs" ? t("lane.needs_you") : t("lane.working"));
  return (
    <span key={`${s}${handing ? "-h" : ""}`} class={`sface s-${s}${handing ? " handing" : ""}`} role="img" aria-label={words} title={words}>
      {handing && <img class="from" src="app/art/working.webp" alt="" draggable={false} />}
      <img class="to" src={`app/art/${art}.webp`} alt="" draggable={false} />
    </span>
  );
}

/** The one next step a row offers on hover (pointer, wide): merge or a draft PR for finished work
 *  with a branch, Pause for work under way. */
function RowActs({ task }: { task: Task }) {
  const a = attention(task);
  const p = placeOf(task);
  const integrated = !!task.card?.integrated || !!(task.acted?.ok && (task.acted.action === "merge" || task.acted.action === "open_pr"));
  if (task.acting) return <span class="tacts on"><span class="busy">{t(`result.acting.${task.acting}`, p.kind === "repo" ? (p.baseBranch ?? "main") : "")}</span></span>;
  if (finished(task) && canIntegrate(task) && !integrated && p.kind === "repo")
    return (
      <span class="tacts">
        <Btn kind="text" size="sm" label={t("result.merge", p.baseBranch ?? "main")} about={title(task)} onClick={() => A.taskAction(task.id, "merge")} />
        <Btn kind="text" size="sm" label={t("result.pr")} about={title(task)} onClick={() => A.taskAction(task.id, "open_pr")} />
      </span>
    );
  if (a === "working")
    return (
      <span class="tacts">
        <Btn kind="text" size="sm" label={t("task.action.pause")} about={title(task)} onClick={() => A.taskAction(task.id, "interrupt")} />
      </span>
    );
  return null;
}

// ---------- groups ----------

function Rows({ tasks, room, state }: { tasks: Task[]; room: Room; state?: boolean }) {
  if (!tasks.length) return null;
  const r = A.route;
  const openId = r.name === "task" ? r.id : "";
  return (
    <div class="trows">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} room={room} state={state} v={ver(task)} focus={L.focus === task.id && room !== "phone"} sel={L.sel.has(task.id)} opened={openId === task.id} />
      ))}
    </div>
  );
}

/** What a row draws from, so a row is redrawn only when it changed (memo). */
function ver(task: Task): string {
  const c = task.card;
  const l = latestOf(task);
  const w = A.S.waiterFor(task.id);
  return [attention(task), l?.seq, c?.updatedAt, c?.changes?.adds, c?.changes?.dels, c?.integrated?.act, task.acting, task.acted?.action, w?.lastLookAt, A.S.justArrived(task.id), timeOf(task), A.L.lang, task.open?.title, isNewResult(task.id, attention(task), c?.updatedAt), handover(task.id, statusOf(task.id, attention(task), c?.updatedAt))].join("|");
}

type Fold = { shut: boolean; onToggle: () => void; mark: Status; counts: string };

function Section({ name, n, children, end, fold }: { name: string; n?: number; children: ComponentChildren; end?: ComponentChildren; fold?: Fold }) {
  if (fold) {
    const about = [fold.shut ? t("onhand.fold.open") : t("onhand.fold.close"), fold.counts].filter(Boolean).join(" · ");
    return (
      <section class={`tsec fold${fold.shut ? " shut" : ""}`} aria-label={name}>
        <h3>
          <button class="fold-name" aria-expanded={!fold.shut} title={about} aria-label={`${name}${fold.counts ? ` · ${fold.counts}` : ""}`} onClick={fold.onToggle}>
            <Chevron open={!fold.shut} />
            <span class="nm">{name}</span> {n ? <span class="n">{n}</span> : null}
          </button>
          {fold.shut && fold.mark && <StatusFace s={fold.mark} title={fold.counts} />}
          {end && <span class="end">{end}</span>}
        </h3>
        {children}
      </section>
    );
  }
  return (
    <section class="tsec" aria-label={name}>
      <h3>
        {name} {n ? <span class="n">{n}</span> : null}
        {end && <span class="end">{end}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A drawn disclosure chevron: right when folded, down when open. */
const Chevron = ({ open }: { open: boolean }) => (
  <svg class={`chev${open ? " open" : ""}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// ---------- folded groups (D244): remembered on this device ----------

const FOLDED = "ducter.onhand.folded";
export function readFolded(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function foldGroup(name: string, shut: boolean) {
  const f = readFolded();
  if (shut) f.add(name);
  else f.delete(name);
  try {
    localStorage.setItem(FOLDED, JSON.stringify([...f]));
  } catch {}
  A.changed();
}

/** A folded group's counts in words, only the parts that are there: "1 needs you · 2 working". */
export function foldCounts(statuses: Status[]): string {
  const n = (s: Status) => statuses.filter((x) => x === s).length;
  const needs = n("needs");
  const working = n("working");
  const fresh = n("new");
  return [needs ? t("onhand.fold.needs", needs) : "", working ? t("onhand.fold.working", working) : "", fresh ? (fresh === 1 ? t("onhand.fold.new.one") : t("onhand.fold.new", fresh)) : ""]
    .filter(Boolean)
    .join(" · ");
}

type Group = { name: string; place?: { device: string; repoPath: string }; tasks: Task[] };

/** The board's tasks by project, in the order their first task comes (what needs you first),
 *  then Other. */
export function projectGroups(lanes: Task[][]): Group[] {
  const out: Group[] = [];
  const at = new Map<string, number>();
  let other: Group | undefined;
  for (const lane of lanes.slice(0, 4))
    for (const task of lane) {
      const p = placeOf(task);
      const name = projectOf(task) || (p.kind === "repo" ? (p.repoPath.replace(/\/+$/, "").split("/").pop() ?? "") : "");
      if (!name) {
        (other ??= { name: "", tasks: [] }).tasks.push(task);
        continue;
      }
      let i = at.get(name);
      if (i === undefined) at.set(name, (i = out.push({ name, tasks: [] }) - 1));
      const g = out[i]!;
      if (p.kind === "repo" && !g.place) g.place = { device: p.device, repoPath: p.repoPath };
      g.tasks.push(task);
    }
  if (other) out.push(other);
  return out;
}

const BY = "ducter.onhand.by";
function readBy(): "state" | "project" {
  try {
    return localStorage.getItem(BY) === "project" ? "project" : "state";
  } catch {
    return "state";
  }
}

/** From how many tasks Find shows, and from how many projects By project is offered. */
export const FIND_FROM = 10;
export const PROJECTS_FROM = 2;

// ---------- the list ----------

/** On hand's list, in any room. `head` draws above it (the counts, Next) and gets the toggle. */
export function OnHandList({ room }: { room: Room }) {
  const [by, setBy] = useState(readBy);
  useKeys(room);
  const b = A.S.board();
  const all = b.lanes.slice(0, 4).flat();
  const q = L.find.trim();
  const keep = (ts: Task[]) => (q ? ts.filter((x) => matches(x, q)) : ts);
  const needs = keep(b.lanes[LANE.needs]!);
  const working = keep(b.lanes[LANE.working]!);
  const waiting = keep(b.lanes[LANE.waiting]!);
  const done = keep(b.lanes[LANE.done]!);
  const partnerDs = q ? [] : A.S.partnerDecisions();
  const loose = q ? [] : A.S.armedWaiters().filter((w) => !w.taskId);
  const missed = q ? [] : A.S.missedToday();
  const calls = q ? [] : (A.S.onHand?.calls ?? []);
  const liveCalls = calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state));
  const endedCalls = calls.filter((c) => callEnded(c.state) && c.state !== "held");
  const groups = projectGroups(b.lanes);
  const canBy = groups.filter((g) => g.name).length >= PROJECTS_FROM && room !== "rail";
  const project = canBy && by === "project";
  const rail = room === "rail";
  // The order the keys walk, as drawn.
  const folded = readFolded();
  L.order = (project ? groups.flatMap((g) => (folded.has(g.name) ? [] : keep(g.tasks))) : [...needs, ...working, ...waiting, ...done]).map((x) => x.id);
  for (const id of [...L.sel]) if (!all.some((x) => x.id === id)) L.sel.delete(id);
  const pick = (v: "state" | "project") => {
    setBy(v);
    try {
      localStorage.setItem(BY, v);
    } catch {}
  };
  const openN = A.defaultable().length;
  const nNeeds = b.lanes[LANE.needs]!.length + A.S.partnerDecisions().length;
  const findable = all.length >= FIND_FROM;
  const shown = needs.length + working.length + waiting.length + done.length;
  return (
    <div class={`onhand-list room-${room}`}>
      {(findable || canBy) && (
        <div class="tools">
          {findable && <Find />}
          {canBy && <Seg label={t("onhand.by")} value={by} options={[{ v: "state", label: t("onhand.by.state") }, { v: "project", label: t("onhand.by.project") }]} onPick={pick} />}
        </div>
      )}
      {q && !shown && <p class="none">{t("onhand.find.none")}</p>}
      {project ? (
        <>
          {!rail &&
            partnerDs.map((d) => (
              <div class="pd" key={d.decisionId}>
                <DecisionCard d={d} />
              </div>
            ))}
          {groups.map((g) => {
            const ts = keep(g.tasks);
            if (!ts.length) return null;
            const name = g.name || t("onhand.other");
            const shut = folded.has(g.name);
            const statuses = ts.map((x) => statusOf(x.id, attention(x), x.card?.updatedAt));
            const mark = urgentOf(statuses);
            const counts = foldCounts(statuses);
            return (
              <Section
                key={g.name}
                name={name}
                n={ts.length}
                fold={{ shut, onToggle: () => foldGroup(g.name, !shut), mark: shut ? mark : "", counts }}
                end={
                  <button class="plus" aria-label={`${t("onhand.newhere")} ${name}`} title={t("onhand.newhere")} onClick={() => A.openNewTask(g.place ? { kind: "repo", device: g.place.device, repoPath: g.place.repoPath } : { kind: "none" })}>
                    <PlusSm />
                  </button>
                }
              >
                {!shut && <Rows tasks={ts} room={room} state />}
              </Section>
            );
          })}
        </>
      ) : (
        <>
          {(nNeeds > 0 || !q) && (
            <Section
              name={t("lane.needs_you")}
              n={needs.length + partnerDs.length}
              end={openN >= 2 && !rail ? <Btn kind="text" size="sm" label={t("decision.goall", openN)} onClick={() => A.goOnAllDefaults()} /> : undefined}
            >
              {!nNeeds && !q && <p class="calm-line">{working.length ? t("onhand.calm.working", A.S.personaName, working.length) : t("onhand.calm")}</p>}
              {/* What needs you is answered in place: its card, not a row (beside a task, a row). */}
              {rail ? (
                <Rows tasks={needs} room={room} />
              ) : (
                <>
                  {partnerDs.map((d) => (
                    <DecisionCard key={d.decisionId} d={d} />
                  ))}
                  {needs.map((task) => {
                    const d = A.S.pendingDecision(task.id);
                    return d ? <DecisionCard key={task.id} d={d} taskId={task.id} /> : <Rows key={task.id} tasks={[task]} room={room} />;
                  })}
                </>
              )}
            </Section>
          )}
          {working.length + liveCalls.length > 0 && (
            <Section name={t("lane.working")} n={working.length + liveCalls.length}>
              {!rail && liveCalls.map((c) => <CallRow key={c.callId} c={c} />)}
              <Rows tasks={working} room={room} />
            </Section>
          )}
          {waiting.length + loose.length > 0 && (
            <Section name={t("lane.waiting")} n={waiting.length + loose.length}>
              <Rows tasks={waiting} room={room} />
              {!rail && loose.map((w) => <LooseWait key={w.waiterId} w={w} />)}
            </Section>
          )}
          {done.length + missed.length + endedCalls.length > 0 && (
            <Section name={t("lane.done")} n={done.length + missed.length + endedCalls.length}>
              {!rail && endedCalls.map((c) => <CallRow key={c.callId} c={c} />)}
              {!rail &&
                missed.map((w) => (
                  <div class="trow loose" key={w.waiterId}>
                    <span class="tmain static">
                      <span class="l1">
                        <WaitBubble w={w} />
                        <span class="t">{w.reason}</span>
                      </span>
                      <span class="l2">
                        <span class="w">{t("wait.missed", w.unmet ?? t("wait.missed.ranout"))}</span>
                      </span>
                    </span>
                    <span class="tacts on">
                      <Btn kind="text" size="sm" label={t("wait.rearm")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "rearm")} />
                    </span>
                  </div>
                ))}
              <Rows tasks={done} room={room} />
            </Section>
          )}
        </>
      )}
      {room === "full" && L.sel.size > 0 && <BulkBar />}
    </div>
  );
}

function LooseWait({ w }: { w: NonNullable<ReturnType<typeof A.S.armedWaiters>>[number] }) {
  const live = !!(w.check || w.event);
  return (
    <div class="trow loose">
      <span class="tmain static">
        <span class="l1">
          {live ? <WaitBubble w={w} /> : null}
          <span class="t">{live ? waitLine(w.reason) : w.reason}</span>
        </span>
        {waitCaption(w) && (
          <span class="l2">
            <span class="w">{waitCaption(w)}</span>
          </span>
        )}
        {live && <Groove w={w} />}
      </span>
      {live && (
        <span class="tacts on">
          <Btn kind="text" size="sm" label={t("wait.cancel")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "cancel")} />
        </span>
      )}
    </div>
  );
}

/** Find: narrows the list as you type; Esc or Clear lets go. */
function Find() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label class="find">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <circle cx="7" cy="7" r="4.4" />
        <path d="M10.3 10.3 13.5 13.5" />
      </svg>
      <input
        id="onhand-find"
        ref={ref}
        type="search"
        value={L.find}
        placeholder={t("onhand.find.placeholder")}
        aria-label={t("onhand.find.placeholder")}
        autocomplete="off"
        spellcheck={false}
        onInput={(e) => ((L.find = e.currentTarget.value), (L.focus = ""), A.changed())}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation(), e.preventDefault(), (L.find = ""), ref.current?.blur(), A.changed();
          if (e.key === "Enter" || e.key === "ArrowDown") e.preventDefault(), ref.current?.blur(), (L.focus = L.order[0] ?? ""), A.changed();
        }}
      />
    </label>
  );
}

// ---------- many at once ----------

/** What the selected tasks can do together, each counted; Cancel asks once. */
export function bulkOf(ids: Iterable<string>) {
  const ts = [...ids].map((id) => A.S.tasks.get(id)).filter((x): x is Task => !!x);
  const integrated = (x: Task) => !!x.card?.integrated || !!(x.acted?.ok && (x.acted.action === "merge" || x.acted.action === "open_pr"));
  const merge = ts.filter((x) => finished(x) && canIntegrate(x) && !integrated(x) && !x.acting);
  return {
    all: ts,
    merge,
    pr: merge,
    pause: ts.filter((x) => attention(x) === "working"),
    drop: ts.filter((x) => !finished(x) && attention(x) !== "dropped"),
  };
}

function BulkBar() {
  const k = bulkOf(L.sel);
  const done = () => (L.sel.clear(), (L.dropAsk = false), A.changed());
  const run = (ts: Task[], action: "merge" | "open_pr" | "interrupt" | "drop") => {
    for (const x of ts) A.taskAction(x.id, action);
    done();
  };
  return (
    <div class="bulk" role="toolbar" aria-label={t("onhand.sel.n", k.all.length)}>
      <b>{t("onhand.sel.n", k.all.length)}</b>
      {L.dropAsk ? (
        <>
          <span class="ask">{t("onhand.sel.drop.ask", k.drop.length)}</span>
          <Btn kind="secondary" size="sm" label={t("onhand.sel.drop.yes")} onClick={() => run(k.drop, "drop")} />
          <Btn kind="text" size="sm" label={t("onhand.sel.drop.no")} onClick={() => ((L.dropAsk = false), A.changed())} />
        </>
      ) : (
        <>
          {k.merge.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.merge", k.merge.length)} onClick={() => run(k.merge, "merge")} />}
          {k.pr.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.pr", k.pr.length)} onClick={() => run(k.pr, "open_pr")} />}
          {k.pause.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.pause", k.pause.length)} onClick={() => run(k.pause, "interrupt")} />}
          {k.drop.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.drop", k.drop.length)} onClick={() => ((L.dropAsk = true), A.changed())} />}
          <span class="grow" />
          <Btn kind="text" size="sm" label={t("onhand.sel.clear")} about="Esc" onClick={done} />
        </>
      )}
    </div>
  );
}

const PlusSm = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

// ---------- the switcher (⌘O) ----------

/** Every task this client knows that has a title, what needs you first, then the newest. */
export function switchList(q: string, limit = 40): Task[] {
  const rank = (x: Task) => ({ needs_you: 0, working: 1, queued: 1, blocked: 2 }[attention(x) as string] ?? 3);
  const at = (x: Task) => x.card?.updatedAt ?? x.openedAt ?? "";
  const low = q.toLowerCase();
  const named = (x: Task) => (low && title(x).toLowerCase().includes(low) ? 0 : 1);
  return [...A.S.tasks.values()]
    .filter((x) => title(x) && attention(x) !== "superseded" && matches(x, q))
    .sort((a, b) => named(a) - named(b) || rank(a) - rank(b) || at(b).localeCompare(at(a)))
    .slice(0, limit);
}

/** 打开一件事 / Open a task: type a few words of it, Enter opens it; nothing matches, Enter
 *  starts a new task with those words. */
export function Switcher() {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const list = switchList(q.trim());
  const fresh = q.trim() && !list.length;
  const close = () => ((A.sheet = null), A.changed());
  const go = (x?: Task) => {
    if (!x) {
      if (!q.trim()) return;
      A.sheet = null;
      A.openNewTask();
      A.nt.words = q.trim();
      return A.changed();
    }
    A.sheet = null;
    const full = A.route.name !== "conv" && !!A.route.full;
    A.go({ name: "task", id: x.id, full });
  };
  const at = Math.min(i, Math.max(0, list.length - 1));
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="switcher" role="dialog" aria-modal="true" aria-label={t("switch.label")}>
        <input
          ref={ref}
          class="sw-in"
          value={q}
          placeholder={t("switch.placeholder")}
          aria-label={t("switch.placeholder")}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => (setQ(e.currentTarget.value), setI(0))}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), close();
            else if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) e.preventDefault(), setI(Math.min(at + 1, list.length - 1));
            else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) e.preventDefault(), setI(Math.max(at - 1, 0));
            else if (e.key === "Enter" && !e.isComposing) e.preventDefault(), go(list[at]);
          }}
        />
        <div class="sw-list" role="listbox">
          {list.map((x, n) => {
            const p = placeOf(x);
            const where = [projectOf(x) || (p.kind === "repo" ? p.repoPath.split("/").pop() : ""), p.kind === "repo" ? p.branch : ""].filter(Boolean).join(" · ");
            const a = attention(x);
            return (
              <button key={x.id} role="option" aria-selected={n === at} class={`sw-row${n === at ? " on" : ""}`} onMouseMove={() => n !== at && setI(n)} onClick={() => go(x)}>
                <span class="t">{shortTitle(title(x))}</span>
                {where && <span class="m">{where}</span>}
                <b class={`st ${a === "needs_you" ? "needs" : a === "failed" ? "failed" : ""}`}>{stateLabel(a)}</b>
              </button>
            );
          })}
          {fresh && (
            <button class="sw-row on new" onClick={() => go()}>
              <span class="t">{t("switch.new", q.trim())}</span>
            </button>
          )}
          {!q.trim() && !list.length && <p class="none">{t("onhand.empty", A.S.personaName)}</p>}
        </div>
      </div>
    </>
  );
}
