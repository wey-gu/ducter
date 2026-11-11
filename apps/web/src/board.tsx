// On hand at the whole screen, the rail beside a task opened there, and the header of a level at
// the whole screen (D184, D216). Wide, the two panes stay the default; On hand, or an opened task,
// can take the whole screen. There On hand is the one list (onhand.tsx) on a wide measure, under
// the crumbs 对话 / 手头的事 with the counts and New task; a task opened there keeps the list
// beside it as a rail when the screen has the room. The Mac app draws the same
// (apps/desktop/internal/views/onhand.go).
import type { ComponentChildren } from "preact";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { when } from "./format.ts";
import { LANE, title } from "./store.ts";
import { shortTitle } from "./transcript.tsx";
import { Avatar } from "./views.tsx";
import { useCanFill, useFill } from "./wide.ts";
import { RoutineShelf } from "./work.tsx";
import { OnHandList } from "./onhand.tsx";
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
export function FullTop({ task, sub, children }: { task?: Task; sub?: string; children?: ComponentChildren }) {
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
        <h1 class="here" title={task ? title(task) : undefined}>
          {name}
        </h1>
        {sub && <span class="sum">{sub}</span>}
      </nav>
      <span class="acts">
        {children}
        <FillButton level={task ? "task" : "onhand"} />
      </span>
    </header>
  );
}

// ---------- On hand at the whole screen ----------


/** The Mac's counts line beside the title: what needs you, what's working, what waits. */
function boardSummary(): string {
  const b = A.S.board();
  const needs = b.lanes[LANE.needs]!.length + A.S.partnerDecisions().length;
  const working = b.lanes[LANE.working]!.length;
  const waiting = b.lanes[LANE.waiting]!.length + A.S.armedWaiters().filter((w) => !w.taskId).length;
  const parts = [needs ? t("header.needs", needs) : "", working ? t("header.working", working) : "", waiting ? t("header.waiting", waiting) : ""].filter(Boolean);
  return parts.join(" · ");
}

/** 接下来 / Next: what comes on its own, soonest first, only when more than one thing is coming (D127). */
export function forecast(now = Date.now()): string {
  const b = A.S.board();
  const items: { at: number; text: string }[] = [];
  const add = (iso: string | undefined, text: string) => {
    const at = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(at) && at > now - 60_000) items.push({ at, text: `${when(A.L, iso, now)} ${text}` });
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
  if (items.length < 2) return "";
  return items
    .sort((a, b) => a.at - b.at)
    .map((i) => i.text)
    .join(" · ");
}

/** On hand at the whole screen (D216): the crumbs and counts, Next, then the one list on a wide
 *  measure, with Find, By project, keys and selection. */
export function Board() {
  const b = A.S.board();
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  const calls = A.S.onHand?.calls ?? [];
  const nothing = b.lanes.slice(0, 4).every((l) => !l.length) && !A.S.partnerDecisions().length && !loose.length && !A.S.missedToday().length && !routines.length && !calls.length;
  const next = forecast();
  return (
    <>
      <FullTop sub={boardSummary()}>
        {/* 新建 / New task: a quiet text button, never a floating one (D128). */}
        <Btn kind="text" size="sm" label={t("newtask.button")} about="⌘N" onClick={() => A.openNewTask()} />
      </FullTop>
      <main class="scroll board">
        {nothing ? (
          <div class="board-empty">
            <Avatar size={120} state="idle" />
            <p>{t("onhand.empty", A.S.personaName)}</p>
          </div>
        ) : (
          <div class="board-col">
            {next && (
              <p class="next" title={next}>
                <b>{t("onhand.next")}</b>
                {next}
              </p>
            )}
            <OnHandList room="full" />
            <RoutineShelf />
          </div>
        )}
      </main>
    </>
  );
}

/** Beside a task opened at the whole screen, the list as a rail (D216): the same rows, narrower;
 *  j/k open the next and the one before. */
export function Rail() {
  return (
    <aside class="rail" aria-label={t("nav.onhand")}>
      <div class="rail-head">
        <button class="crumb" onClick={() => A.go({ name: "onhand", full: true })}>
          {t("onhand.title")}
        </button>
        <span class="sum">{boardSummary()}</span>
      </div>
      <div class="scroll rail-list">
        <OnHandList room="rail" />
      </div>
    </aside>
  );
}
