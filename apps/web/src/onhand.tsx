// On hand as a workspace (D216): one list on every screen. The phone, the side pane beside the
// conversation, the whole screen and the rail beside an opened task all draw the same rows, and
// only the room changes. A row says what the task is on now in words (its latest step, what it
// waits for, its question, its result), and on a repo task its branch, +/−, and a draft PR or a
// merge. Density grows with use: the find field from ten tasks, by project from two projects,
// keys and selection only where a keyboard and a pointer are.
import type { ComponentChildren } from "preact";
import { memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { callEnded, type Bodies, type LogEvent, type Place } from "@ducter/protocol";
import { blocksOf, type Block } from "@ducter/protocol/src/transcript.ts";
import { sayable, proofLabel } from "@ducter/protocol/src/say.ts";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { ago, clock, day, harnessName, when } from "./format.ts";
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
    // D261: a wait always says what it waits for: its waiter, the state's reason, what the task
    // last reported, or that it stopped without saying (true, and worth a look).
    const w = A.S.waiterFor(task.id);
    if (w?.reason?.trim()) return { words: waitLine(w.reason) };
    const why = reasonOf(task);
    if (why && !why.startsWith("report:") && !why.endsWith("by user")) return { words: deviceWait(why) ?? why };
    const said = r?.summary?.trim() ? sayable(r.summary.trim().split("\n")[0], A.L.lang) : "";
    return { words: said || t("onhand.wait.unsaid") };
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

// ---------- D261: quiet waits, the next look, the project lens ----------

/** A wait nothing has changed on for a day folds away under the fresh ones. */
export const QUIET_MS = 24 * 3600_000;
export function quietWait(task: Task, now = Date.now()): boolean {
  if (attention(task) !== "blocked" || !task.card?.updatedAt) return false;
  let at = Date.parse(task.card.updatedAt);
  const w = A.S.waiterFor(task.id);
  if (w?.changes && w.lastLookAt) at = Math.max(at, Date.parse(w.lastLookAt));
  return Number.isFinite(at) && now - at >= QUIET_MS;
}

/** A time of day, with its day only when it isn't today. */
function soon(iso: string, now = Date.now()): string {
  return day(A.L, iso, now) === day(A.L, new Date(now).toISOString(), now) ? clock(iso) : when(A.L, iso, now);
}

/** When a wait looks again (or goes on), in words, and how far along that interval it is (the
 *  small ring); "" when it doesn't look on its own. The waiter's own times, never a model. */
export function waitNext(w: ReturnType<typeof A.S.waiterFor>, now = Date.now()): { text: string; frac: number } {
  if (!w) return { text: "", frac: 0 };
  if (w.check || w.event) {
    const next = Date.parse(w.nextLookAt ?? "");
    if (!Number.isFinite(next) || next <= now) return { text: "", frac: 0 };
    const last = Date.parse(w.lastLookAt ?? w.armedAt ?? "");
    const frac = Number.isFinite(last) && next > last ? (now - last) / (next - last) : 0;
    return { text: t("onhand.wait.next", soon(w.nextLookAt!, now)), frac };
  }
  const at = Date.parse(w.at ?? "");
  if (Number.isFinite(at) && at > now) {
    const from = Date.parse(w.armedAt ?? "");
    return { text: t("onhand.wait.at", soon(w.at!, now)), frac: Number.isFinite(from) && at > from ? (now - from) / (at - from) : 0 };
  }
  return { text: "", frac: 0 };
}

/** What comes next for a waiting task, in one line, for the opened task's head. */
export function taskNext(task: Task, now = Date.now()): string {
  if (attention(task) !== "blocked") return "";
  const parts = [quietWait(task, now) ? t("onhand.wait.since", ago(A.L, task.card?.updatedAt, now)) : "", waitNext(A.S.waiterFor(task.id), now).text].filter(Boolean);
  const s = parts.join(" · ");
  return A.L.lang === "zh" || !s ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** A small ring: how far along a wait's interval is. */
const Ring = ({ frac }: { frac: number }) => {
  const f = Math.max(0, Math.min(1, frac));
  const a = f * 2 * Math.PI;
  const x = 6 + 3.6 * Math.sin(a), y = 6 - 3.6 * Math.cos(a);
  return (
    <svg class="wring" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
      {f >= 0.999 ? <circle cx="6" cy="6" r="3.6" class="fill" /> : f > 0 && <path class="fill" d={`M6 6V2.4A3.6 3.6 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} />}
    </svg>
  );
};

/** The lens key a task is under: its project, else "~" (其他 / Other). */
export const OTHER = "~";
export const lensOf = (task: Task) => {
  const p = placeOf(task);
  return projectOf(task) || (p.kind === "repo" ? (p.repoPath.replace(/\/+$/, "").split("/").pop() ?? "") : p.kind === "folder" ? (p.path.replace(/\/+$/, "").split("/").pop() ?? "") : "") || OTHER;
};
export const lensName = (key: string) => (key === OTHER ? t("onhand.other") : key);

const LENS = "ducter.onhand.lens";
export function readLens(): string {
  try {
    return localStorage.getItem(LENS) ?? "";
  } catch {
    return "";
  }
}
export function setLens(key: string) {
  try {
    if (key) localStorage.setItem(LENS, key);
    else localStorage.removeItem(LENS);
  } catch {}
  L.focus = "";
  A.changed();
}

export type LensGroup = { key: string; name: string; place?: Place; tasks: Task[] };
/** The board's projects, what needs you first, then the projects added by hand, Other last. */
export function lensGroups(): LensGroup[] {
  const b = A.S.board();
  const out: LensGroup[] = [];
  const at = new Map<string, number>();
  let other: LensGroup | undefined;
  for (const lane of b.lanes.slice(0, 4))
    for (const task of lane) {
      const k = lensOf(task);
      if (k === OTHER) {
        (other ??= { key: OTHER, name: t("onhand.other"), tasks: [] }).tasks.push(task);
        continue;
      }
      let i = at.get(k);
      if (i === undefined) at.set(k, (i = out.push({ key: k, name: k, tasks: [] }) - 1));
      const g = out[i]!;
      const p = placeOf(task);
      if (!g.place && (p.kind === "repo" || p.kind === "folder")) g.place = p;
      g.tasks.push(task);
    }
  for (const p of A.S.onHand?.projects ?? []) if (!at.has(p.name)) at.set(p.name, out.push({ key: p.name, name: p.name, place: p.place, tasks: [] }) - 1);
  if (other) out.push(other);
  return out;
}
/** Offered from two groups (one project with errands beside it is already two kinds of work). */
export const lensOn = (groups: LensGroup[]) => groups.length >= 2;
/** The lens kept on this device, if that project is still there; else all. */
export function currentLens(groups: LensGroup[]): string {
  const k = readLens();
  return k && lensOn(groups) && groups.some((g) => g.key === k) ? k : "";
}
/** The lanes narrowed to a lens. */
export const lensLanes = (lens: string): Task[][] => A.S.board().lanes.slice(0, 4).map((l) => (lens ? l.filter((x) => lensOf(x) === lens) : l));
/** Only all, and Other, hold what belongs to no task: the partner's own asks, task-less waits, calls. */
export const looseIn = (lens: string) => !lens || lens === OTHER;

/** A group's unmerged changes, summed over its tasks' branches. */
function groupStat(tasks: Task[]): { adds: number; dels: number } {
  let adds = 0, dels = 0;
  for (const x of tasks) {
    if (x.card?.integrated?.act === "merge" || (x.acted?.ok && x.acted.action === "merge")) continue;
    adds += x.card?.changes?.adds ?? 0;
    dels += x.card?.changes?.dels ?? 0;
  }
  return { adds, dels };
}

function LensEntry({ k, name, tasks, on, tab }: { k: string; name: string; tasks: Task[]; on: boolean; tab?: boolean }) {
  const statuses = tasks.map((x) => statusOf(x.id, attention(x), x.card?.updatedAt));
  const mark = urgentOf(statuses);
  const counts = foldCounts(statuses);
  const st = tab ? { adds: 0, dels: 0 } : groupStat(tasks);
  return (
    <button class={`lens-row${on ? " on" : ""}${k === OTHER ? " other" : ""}`} aria-pressed={on} aria-label={[name, counts].filter(Boolean).join(" · ")} title={counts || undefined} onClick={() => setLens(k)}>
      <span class="nm">
        <b>{name}</b>
        {st.adds + st.dels > 0 && (
          <span class="stat">
            {st.adds > 0 && <i class="add">+{st.adds}</i>}
            {st.dels > 0 && <i class="del">−{st.dels}</i>}
          </span>
        )}
      </span>
      {mark && !(tab && mark === "working") && <StatusFace s={mark} title={counts} />}
      {!tab && <span class="n">{tasks.length || ""}</span>}
    </button>
  );
}

/** The lens beside the board (wide): All, each project, Other; then Add a folder. */
export function LensColumn() {
  const groups = lensGroups();
  if (!lensOn(groups)) return null;
  const lens = currentLens(groups);
  return (
    <nav class="lens-col" aria-label={t("onhand.lens")}>
      <LensEntry k="" name={t("onhand.lens.all")} tasks={groups.flatMap((g) => g.tasks)} on={!lens} />
      <span class="gap" />
      {groups.map((g) => (
        <LensEntry key={g.key} k={g.key} name={g.name} tasks={g.tasks} on={lens === g.key} />
      ))}
    </nav>
  );
}

/** The lens where there is no room for the column: one row of names, the chosen one raised. */
export function LensTabs({ inBoard }: { inBoard?: boolean }) {
  const groups = lensGroups();
  if (!lensOn(groups)) return null;
  const lens = currentLens(groups);
  return (
    <nav class={`lens-tabs${inBoard ? " in-board" : ""}`} aria-label={t("onhand.lens")}>
      <LensEntry k="" name={t("onhand.lens.all")} tasks={groups.flatMap((g) => g.tasks)} on={!lens} tab />
      {groups.map((g) => (
        <LensEntry key={g.key} k={g.key} name={g.name} tasks={g.tasks} on={lens === g.key} tab />
      ))}
    </nav>
  );
}

/** The strip's four counts in a lens: needs you, working, waiting, done today. */
function stateCounts(lens: string): number[] {
  const l = lensLanes(lens);
  const loose = looseIn(lens);
  const calls = loose ? (A.S.onHand?.calls ?? []) : [];
  return [
    l[0]!.length + (loose ? A.S.partnerDecisions().length : 0),
    l[1]!.length + calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state)).length,
    l[2]!.length + (loose ? A.S.armedWaiters().filter((w) => !w.taskId).length : 0),
    l[3]!.length + (loose ? A.S.missedToday().length + calls.filter((c) => callEnded(c.state) && c.state !== "held").length : 0),
  ];
}

/** The board's head: one calm sentence when nothing needs you, the strip of four counts (each one a
 *  filter; pressed again, or Esc, lets go), Find from ten tasks, New task here under a project. */
function BoardTop({ lens, groups, findable }: { lens: string; groups: LensGroup[]; findable: boolean }) {
  const n = stateCounts(lens);
  if (L.filter && !n[L.filter - 1]) L.filter = 0;
  const names = ["lane.needs_you", "lane.working", "lane.waiting", "lane.done"];
  const g = groups.find((x) => x.key === lens && x.key !== OTHER);
  return (
    <div class="board-top">
      {!n[0] && <p class="calm-line">{n[1] ? t("onhand.calm.working", A.S.personaName, n[1]) : t("onhand.calm")}</p>}
      <div class="strip-row">
        <div class="strip" role="group" aria-label={t("onhand.strip")}>
          {names.map((k, i) => {
            const c = n[i]!;
            const on = L.filter === i + 1;
            return (
              <button
                key={k}
                class={`cell${on ? " on" : ""}${!c ? " none" : ""}${i === 0 && c ? " needs" : ""}`}
                disabled={!c}
                aria-pressed={on}
                aria-label={`${t(k)} ${c}`}
                onClick={() => ((L.filter = on ? 0 : i + 1), (L.focus = ""), A.changed())}
              >
                <b>{c}</b>
                <span>{t(k)}</span>
              </button>
            );
          })}
        </div>
        <span class="grow" />
        {g && (
          <button class="plus" aria-label={`${t("onhand.newhere")} ${g.name}`} title={t("onhand.newhere")} onClick={() => A.openNewTask(g.place && g.place.kind !== "none" ? g.place : { kind: "none" })}>
            <PlusSm />
          </button>
        )}
        {findable && <Find />}
      </div>
    </div>
  );
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
export const L = { focus: "", sel: new Set<string>(), anchor: "", find: "", order: [] as string[], dropAsk: false, filter: 0, quietOn: false, showProj: false };

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
      if (e.key === "Escape" && (L.sel.size || L.find || L.filter) && !rail) {
        e.preventDefault();
        if (L.sel.size) L.sel.clear();
        else if (L.find) L.find = "";
        else L.filter = 0; // D261: then the strip's filter
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
  // D261: where, quietly: its project when the board shows all of them, its computer with two or
  // more. Who does it and its branch are in the task.
  const meta = room !== "rail" ? [L.showProj ? lensName(lensOf(task)) : "", wide && manyComputers() && p.kind !== "none" ? computerName(p.device) : ""].filter(Boolean).join(" · ") : "";
  const quiet = a === "blocked" && room !== "rail" && quietWait(task);
  const next = a === "blocked" && room !== "rail" && !quiet ? waitNext(w) : undefined;
  const acts = wide ? <RowActs task={task} /> : null;
  const onClick = (e: MouseEvent) => {
    if (room === "full" && (e.metaKey || e.ctrlKey)) return void (e.preventDefault(), toggle(task.id));
    if (room === "full" && e.shiftKey) return void (e.preventDefault(), extend(task.id));
    L.focus = task.id;
    A.go({ name: "task", id: task.id, full: room === "full" || room === "rail" });
  };
  return (
    <div class={`trow${quiet ? " quiet" : ""}${focus ? " kfocus" : ""}${sel ? " sel" : ""}${opened ? " opened" : ""}${arrived ? " arrived" : ""}${unseen ? " unseen" : ""} a-${a}`} data-row={task.id}>
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
          {quiet && <span class="next">{t("onhand.wait.since", ago(A.L, task.card?.updatedAt))}</span>}
          {next?.text && (
            <span class="next">
              <Ring frac={next.frac} />
              {next.text}
            </span>
          )}
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
  return [attention(task), l?.seq, c?.updatedAt, c?.changes?.adds, c?.changes?.dels, c?.integrated?.act, task.acting, task.acted?.action, w?.lastLookAt, w?.nextLookAt, L.showProj, quietWait(task), A.S.justArrived(task.id), timeOf(task), A.L.lang, task.open?.title, isNewResult(task.id, attention(task), c?.updatedAt), handover(task.id, statusOf(task.id, attention(task), c?.updatedAt))].join("|");
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
/** From how many tasks Find shows. */
export const FIND_FROM = 10;

// ---------- the list ----------

/** Seen results under 今天做完 are folded by default; unfolded is remembered on this device. */
const DONE_OPEN = "ducter.onhand.done-open";
function doneOpenKept(): boolean {
  try {
    return localStorage.getItem(DONE_OPEN) === "1";
  } catch {
    return false;
  }
}
function keepDoneOpen(on: boolean) {
  try {
    if (on) localStorage.setItem(DONE_OPEN, "1");
    else localStorage.removeItem(DONE_OPEN);
  } catch {}
  A.changed();
}

/** A quiet line that folds what is under it away: its words and a chevron. */
const FoldLine = ({ words, open, onToggle }: { words: string; open: boolean; onToggle: () => void }) => (
  <button class="fold-line" aria-expanded={open} onClick={onToggle}>
    <span>{words}</span>
    <Chevron open={open} />
  </button>
);

/** On hand's list, in any room (D216, D261): under the project lens, by state, with the strip's
 *  filter; what needs you first and taking no room when there is none; a wait quiet for a day and
 *  a result you have seen folded away. Beside an opened task (the rail) every task is a row. */
export function OnHandList({ room }: { room: Room }) {
  useKeys(room);
  const groups = lensGroups();
  const lens = currentLens(groups);
  L.showProj = lensOn(groups) && !lens;
  const lanes = lensLanes(lens);
  const all = lanes.flat();
  const q = L.find.trim();
  const rail = room === "rail";
  const f = rail ? 0 : L.filter;
  const show = (i: number) => !f || f === i;
  const keep = (ts: Task[]) => (q ? ts.filter((x) => matches(x, q)) : ts);
  const needs = keep(lanes[LANE.needs]!);
  const working = keep(lanes[LANE.working]!);
  const waiting = keep(lanes[LANE.waiting]!);
  const done = keep(lanes[LANE.done]!);
  const loose = !q && looseIn(lens);
  const partnerDs = loose ? A.S.partnerDecisions() : [];
  const looseWs = loose ? A.S.armedWaiters().filter((w) => !w.taskId) : [];
  const missed = loose ? A.S.missedToday() : [];
  const calls = loose ? (A.S.onHand?.calls ?? []) : [];
  const liveCalls = calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state));
  const endedCalls = calls.filter((c) => callEnded(c.state) && c.state !== "held");
  const fresh = rail ? waiting : waiting.filter((x) => !quietWait(x));
  const quiet = rail ? [] : waiting.filter((x) => quietWait(x));
  const newer = rail ? done : done.filter((x) => statusOf(x.id, attention(x), x.card?.updatedAt) === "new");
  const seen = rail ? [] : done.filter((x) => statusOf(x.id, attention(x), x.card?.updatedAt) !== "new");
  const quietOpen = L.quietOn || f === 3 || !!q;
  const doneOpen = doneOpenKept() || f === 4 || !!q;
  // The order the keys walk, as drawn.
  L.order = [...(show(1) ? needs : []), ...(show(2) ? working : []), ...(show(3) ? fresh : []), ...(show(3) && quietOpen ? quiet : []), ...(show(4) ? newer : []), ...(show(4) && doneOpen ? seen : [])].map((x) => x.id);
  for (const id of [...L.sel]) if (!all.some((x) => x.id === id)) L.sel.delete(id);
  const openN = A.defaultable().length;
  const shown = needs.length + working.length + waiting.length + done.length;
  return (
    <div class={`onhand-list room-${room}`}>
      {!rail && (
        <>
          {room !== "full" && <LensTabs />}
          {room === "full" && <LensTabs inBoard />}
          <BoardTop lens={lens} groups={groups} findable={all.length >= FIND_FROM} />
        </>
      )}
      {q && !shown && <p class="none">{t("onhand.find.none")}</p>}
      {needs.length + partnerDs.length > 0 && show(1) && (
        <Section name={t("lane.needs_you")} n={needs.length + partnerDs.length} end={openN >= 2 && !rail ? <Btn kind="text" size="sm" label={t("decision.goall", openN)} onClick={() => A.goOnAllDefaults()} /> : undefined}>
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
      {working.length + liveCalls.length > 0 && show(2) && (
        <Section name={t("lane.working")} n={working.length + liveCalls.length}>
          {!rail && liveCalls.map((c) => <CallRow key={c.callId} c={c} />)}
          <Rows tasks={working} room={room} />
        </Section>
      )}
      {waiting.length + looseWs.length > 0 && show(3) && (
        <Section name={t("lane.waiting")} n={waiting.length + looseWs.length}>
          <Rows tasks={fresh} room={room} />
          {!rail && looseWs.map((w) => <LooseWait key={w.waiterId} w={w} />)}
          {quiet.length > 0 && f !== 3 && !q && <FoldLine words={t("onhand.wait.quiet", quiet.length)} open={quietOpen} onToggle={() => ((L.quietOn = !L.quietOn), A.changed())} />}
          {quiet.length > 0 && quietOpen && <Rows tasks={quiet} room={room} />}
        </Section>
      )}
      {done.length + missed.length + endedCalls.length > 0 && show(4) && (
        <Section name={t("lane.done")} n={done.length + missed.length + endedCalls.length}>
          <Rows tasks={newer} room={room} />
          {seen.length + missed.length + endedCalls.length > 0 && f !== 4 && !q && (
            <FoldLine words={t("onhand.done.seen", seen.length + missed.length + endedCalls.length)} open={doneOpen} onToggle={() => keepDoneOpen(!doneOpenKept())} />
          )}
          {doneOpen && (
            <>
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
              <Rows tasks={seen} room={room} />
            </>
          )}
        </Section>
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
