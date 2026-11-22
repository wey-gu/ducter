// On hand at the whole screen, the rail beside a task opened there, and the header of a level at
// the whole screen (D184, D216). Wide, the two panes stay the default; On hand, or an opened task,
// can take the whole screen. There On hand is the one list (onhand.tsx) on a wide measure, under
// the crumbs 对话 / 手头的事 with the counts and New task; a task opened there keeps the list
// beside it as a rail when the screen has the room. The Mac app draws the same
// (apps/desktop/internal/views/onhand.go).
import type { ComponentChildren } from "preact";
import { A } from "./app.ts";
import { Facts, NavBtn, PlusMark } from "./controls.tsx";
import { spoken, when } from "./format.ts";
import { LANE, title } from "./store.ts";
import { shortTitle } from "./transcript.tsx";
import { Avatar, Places } from "./views.tsx";
import { useCanFill, useFill } from "./wide.ts";
import { RoutineShelf } from "./work.tsx";
import { currentLens, lensGroups, lensName, lensOn, LensColumn, OnHandList, Peek, stateCounts } from "./onhand.tsx";
import type { Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

// ---------- the take-the-whole-screen button, both ways ----------

/** Arrows out: take the whole screen. Arrows in: back beside the conversation. */
const Spread = ({ out }: { out: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d={out ? "M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6" : "M4 10h6V4M10 10L4 4M20 14h-6v6M14 14l6 6"}
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/** D184: the one control both ways, at the right end of the level's header (⌘2 does the same). */
export function FillButton({ level }: { level: "onhand" | "task" }) {
  const fill = useFill();
  const can = useCanFill(level);
  if (!can) return null;
  const label = fill ? t("pane.beside") : t("pane.fill");
  return (
    <button class="plus fill" aria-label={label} title={level === "onhand" ? `${label} (⌘2)` : label} onClick={() => A.fill(!fill)}>
      <Spread out={!fill} />
    </button>
  );
}

// ---------- the header at the whole screen: the Mac's crumbs ----------

/** 对话 / 手头的事 [/ the task]: each crumb but the last goes there; the last is the title. */
export function FullTop({ task, children }: { task?: Task; children?: ComponentChildren }) {
  const name = task ? shortTitle(title(task)) || t("task.unknown") : t("onhand.title");
  return (
    <header class="top crumbs">
      <nav class="trail" aria-label={t("nav.onhand")}>
        <button class="crumb" onClick={() => A.go({ name: "conv" })}>
          {t("nav.conversation")}
        </button>
        <span class="slash" aria-hidden="true">/</span>
        {task && (
          <>
            <button class="crumb" onClick={() => A.go({ name: "onhand", full: true })}>
              {t("onhand.title")}
            </button>
            <span class="slash" aria-hidden="true">/</span>
          </>
        )}
        {/* D270: the current crumb at the bar's one size, in full ink, not a button; no line under
            it (who does a task, where it stands and where are said once, in the task's head). */}
        <h1 class="here" title={task ? title(task) : undefined}>
          {name}
        </h1>
      </nav>
      {/* D262: the bar's one anatomy: this place's own actions, then the way to the other places. */}
      <span class="acts">
        {children}
        <FillButton level={task ? "task" : "onhand"} />
        {/* D290: Devices and Settings open over the board; the knob goes there and comes back. */}
        <Places here={A.sheet?.kind === "settings" ? (A.sheet.page === "devices" ? "devices" : "settings") : task ? undefined : "onhand"} />
      </span>
    </header>
  );
}

// ---------- On hand at the whole screen ----------


/** One thing coming on its own: its time and what it is, two elements (D291). */
export type Coming = { at: number; when: string; text: string };

/** 接下来 / Next: what comes on its own, soonest first, only when more than one thing is coming (D127). */
export function forecast(now = Date.now()): Coming[] {
  const b = A.S.board();
  const items: Coming[] = [];
  const add = (iso: string | undefined, text: string) => {
    const at = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(at) && at > now - 60_000) items.push({ at, when: when(A.L, iso, now), text });
  };
  for (const task of b.lanes[LANE.needs]!) {
    const d = A.S.pendingDecision(task.id);
    if (d && d.reversible && d.defaultOption === "go") add(d.defaultAt, shortTitle(title(task)));
  }
  for (const task of b.lanes[LANE.waiting]!) {
    const w = A.S.waiterFor(task.id);
    if (w) add(w.until || w.at, shortTitle(title(task)));
  }
  for (const w of A.S.armedWaiters().filter((w) => !w.taskId)) add(w.at, w.reason);
  if (items.length < 2) return [];
  return items.sort((a, b) => a.at - b.at);
}

/** The Next line: its label, then each thing coming as its own element, its time muted and in
 *  tabular figures before its name, spaced by a gap, never one dotted string (D291). */
export function NextLine({ items }: { items: Coming[] }) {
  if (!items.length) return null;
  return (
    <p class="next" title={spoken(A.L, ...items.map((i) => `${i.when} ${i.text}`))}>
      <b>{t("onhand.next")}</b>
      <Facts
        items={items.map((i) => (
          <>
            <span class="tm">{i.when}</span> {i.text}
          </>
        ))}
      />
    </p>
  );
}

/** On hand at the whole screen (D216): the crumbs and counts, Next, then the one list on a wide
 *  measure, with Find, By project, keys and selection. */
export function Board() {
  const b = A.S.board();
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  const calls = A.S.onHand?.calls ?? [];
  const nothing = b.lanes.slice(0, 4).every((l) => !l.length) && !A.S.partnerDecisions().length && !loose.length && !A.S.missedToday().length && !routines.length && !calls.length;
  return (
    <>
      <FullTop>
        {/* 新建 / New task: a quiet text button, never a floating one (D128). */}
        <NavBtn label={t("newtask.button")} about={`${t("newtask.button")} (⌘N)`} glyph={<PlusMark />} onClick={() => A.openNewTask()} />
      </FullTop>
      <main class="scroll board">
        {nothing ? (
          <div class="board-empty">
            <Avatar size={120} state="idle" />
            <p>{t("onhand.empty", A.S.personaName)}</p>
          </div>
        ) : (
          <div class="board-wrap">
          <LensColumn />
          <div class="board-col">
            {/* D467 round 4: no 接下来 line over the board: the brief's 接下来 says what comes back next. */}
            <OnHandList room="full" />
            <RoutineShelf />
          </div>
          {/* D467: the peek, the conductor's "sit in": the focused task live, from 1280. */}
          <div class="peek-col">
            <Peek />
          </div>
          </div>
        )}
      </main>
    </>
  );
}

/** Beside a task opened at the whole screen, the list as a rail (D216): the same rows, narrower;
 *  j/k open the next and the one before. */
export function Rail() {
  // D261: the rail is the board narrowed by the same lens; its head says which.
  const groups = lensGroups();
  const lens = currentLens(groups);
  return (
    <aside class="rail" aria-label={t("nav.onhand")}>
      {/* D270: the bar already says On hand; the rail names only its lens, when there is one. */}
      {lensOn(groups) && (
        <div class="rail-head">
          <button class="crumb" onClick={() => A.go({ name: "onhand", full: true })}>
            {lens ? lensName(lens) : t("onhand.lens.all")}
          </button>
        </div>
      )}
      <div class="scroll rail-list">
        <OnHandList room="rail" />
      </div>
    </aside>
  );
}
