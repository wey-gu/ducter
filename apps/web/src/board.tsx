// On hand at the whole screen, and the header of a level at the whole screen (D184). Wide, the
// two panes stay the default; On hand, or an opened task, can take the whole screen, and there it
// is the Mac app's On hand (apps/desktop/internal/views/onhand.go, byproject.go): the same
// header (对话 / 手头的事 and what's on hand in a line; 按状态 · 按项目; 开一件事), the same Next
// line, the same four lanes side by side with the same cards, the same grouping by project, in the
// same order and words. Only touch, sizes and a foldable's fold adapt it.
import type { ComponentChildren } from "preact";
import { callEnded } from "@ducter/protocol";
import { CallRow } from "./phone.tsx";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Seg } from "./controls.tsx";
import { ago, when } from "./format.ts";
import { proofLabel, sayable } from "@ducter/protocol/src/say.ts";
import { attention, headlineEvidence, LANE, placeOf, projectOf, reasonOf, reportOf, title, type Task } from "./store.ts";
import { shortTitle } from "./transcript.tsx";
import { deviceWait } from "./where.ts";
import { Avatar, DecisionCard, faceOf, metaLine, stateLabel } from "./views.tsx";
import { useCanFill, useFill } from "./wide.ts";
import { Goal, Groove, RoutineShelf, untilLine, WaitBubble, waitCaption, waitLine } from "./work.tsx";

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

const BY = "ducter.onhand.by";
function readBy(): "state" | "project" {
  try {
    return localStorage.getItem(BY) === "project" ? "project" : "state";
  } catch {
    return "state";
  }
}

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

export function Board() {
  const [by, setBy] = useState(readBy);
  const b = A.S.board();
  const needs = b.lanes[LANE.needs]!;
  const partnerDs = A.S.partnerDecisions();
  const working = b.lanes[LANE.working]!;
  const waiting = b.lanes[LANE.waiting]!;
  const done = b.lanes[LANE.done]!;
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const missed = A.S.missedToday();
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  // D193: calls. A Go card or a question is a decision (the needs lane); a call on the line or
  // waiting for its hour is working; an ended one is done today.
  const calls = A.S.onHand?.calls ?? [];
  const liveCalls = calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state));
  const endedCalls = calls.filter((c) => callEnded(c.state) && c.state !== "held");
  const nothing = !needs.length && !partnerDs.length && !working.length && !waiting.length && !done.length && !loose.length && !missed.length && !routines.length && !liveCalls.length && !endedCalls.length;
  const pick = (v: "state" | "project") => {
    setBy(v);
    try {
      localStorage.setItem(BY, v);
    } catch {}
  };
  const next = forecast();
  const nNeeds = needs.length + partnerDs.length;
  return (
    <>
      <FullTop sub={boardSummary()}>
        {!nothing && <Seg label={t("onhand.by")} value={by} options={[{ v: "state", label: t("onhand.by.state") }, { v: "project", label: t("onhand.by.project") }]} onPick={pick} />}
        {/* 开一件事 / New task: a quiet text button, never a floating one (D128). */}
        <Btn kind="text" size="sm" label={t("newtask.button")} about="⌘N" onClick={() => A.openNewTask()} />
      </FullTop>
      <main class="scroll board">
        {nothing ? (
          <div class="board-empty">
            <Avatar size={120} state="idle" />
            <p>{t("onhand.empty", A.S.personaName)}</p>
          </div>
        ) : (
          <>
            {next && (
              <p class="next" title={next}>
                <b>{t("onhand.next")}</b>
                {next}
              </p>
            )}
            {by === "project" ? (
              <ByProject />
            ) : (
              <>
                {!nNeeds && (
                  // Nothing needs you: one warm line, not an empty lane (as on the Mac).
                  <div class="calm-band">
                    <Check />
                    {working.length ? t("onhand.calm.working", A.S.personaName, working.length) : t("onhand.calm")}
                  </div>
                )}
                <div class="lanes">
                  {/* On a book fold the first column is the fold's first half, the rest the second. */}
                  <div class="col">
                    {nNeeds > 0 && (
                      <Lane kind="needs" n={nNeeds}>
                        {partnerDs.map((d) => (
                          <DecisionCard key={d.decisionId} d={d} />
                        ))}
                        {needs.map((task) => {
                          const d = A.S.pendingDecision(task.id);
                          return d ? <DecisionCard key={task.id} d={d} taskId={task.id} /> : <WorkCard key={task.id} task={task} />;
                        })}
                      </Lane>
                    )}
                  </div>
                  <div class="col">
                    {working.length + liveCalls.length > 0 && (
                      <Lane kind="working" n={working.length + liveCalls.length}>
                        {liveCalls.map((c) => (
                          <CallRow key={c.callId} c={c} />
                        ))}
                        {working.map((task) => (
                          <WorkCard key={task.id} task={task} />
                        ))}
                      </Lane>
                    )}
                    {(waiting.length > 0 || loose.length > 0) && (
                      <Lane kind="waiting" n={waiting.length + loose.length}>
                        {waiting.map((task) => (
                          <WaitCard key={task.id} task={task} />
                        ))}
                        {loose.map((w) => (
                          <div class="bcard wait" key={w.waiterId}>
                            <span class="wrow">
                              {w.check || w.event ? <WaitBubble w={w} /> : <Clock />}
                              <span>{w.check || w.event ? waitLine(w.reason) : w.reason}</span>
                            </span>
                            {(w.check || w.event) && <Groove w={w} />}
                            {waitCaption(w) && <span class="m">{waitCaption(w)}</span>}
                            {(w.check || w.event) && <Btn kind="text" size="sm" label={t("wait.cancel")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "cancel")} />}
                          </div>
                        ))}
                      </Lane>
                    )}
                    {(done.length > 0 || missed.length > 0 || endedCalls.length > 0) && (
                      <Lane kind="done" n={done.length + missed.length + endedCalls.length}>
                        {endedCalls.map((c) => (
                          <CallRow key={c.callId} c={c} />
                        ))}
                        {missed.map((w) => (
                          <div class="bcard wait" key={w.waiterId}>
                            <span class="wrow">
                              <WaitBubble w={w} />
                              <span>{w.reason}</span>
                            </span>
                            <span class="m">{t("wait.missed", w.unmet ?? t("wait.missed.ranout"))}</span>
                            <Btn kind="text" size="sm" label={t("wait.rearm")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "rearm")} />
                          </div>
                        ))}
                        {done.length > 0 && <DoneList tasks={done} />}
                      </Lane>
                    )}
                  </div>
                </div>
              </>
            )}
            <RoutineShelf />
          </>
        )}
      </main>
    </>
  );
}

const LANE_NAME = { needs: "lane.needs_you", working: "lane.working", waiting: "lane.waiting", done: "lane.done" } as const;

/** One lane: its name and count at 20 (the count in muted ink), then its cards. */
function Lane({ kind, n, children }: { kind: keyof typeof LANE_NAME; n: number; children: ComponentChildren }) {
  const open = A.defaultable().length;
  return (
    <section class={`lane ${kind}`} aria-label={t(LANE_NAME[kind])}>
      <h2>
        {t(LANE_NAME[kind])} <span class="n">{n}</span>
        {kind === "needs" && open >= 2 && (
          <span class="end">
            <Btn kind="text" size="sm" label={t("decision.goall", open)} onClick={() => A.goOnAllDefaults()} />
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

const open = (task: Task) => A.go({ name: "task", id: task.id });

/** A working task's card (Mac: workingCard): its title, where it stands, then where, who and when. */
function WorkCard({ task }: { task: Task }) {
  const u = A.S.untilOf(task);
  const r = reportOf(task);
  const arrived = attention(task) !== "blocked" && A.S.justArrived(task.id);
  const said = u ? untilLine(u) : r?.summary ? sayable(r.summary, A.L.lang) : "";
  const from = task.card?.fromRoutine;
  const meta = [from ? t("routine.from", from.name) : "", metaLine(task), task.card?.updatedAt ? t("onhand.reported", ago(A.L, task.card.updatedAt)) : ""].filter(Boolean).join(" · ");
  return (
    <button class={`bcard${arrived ? " arrived" : ""}`} onClick={() => open(task)} title={title(task)}>
      {arrived && <span class="pop-bub" aria-hidden="true" />}
      <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
      {u && <Goal u={u} />}
      {said && <span class="s">{said}</span>}
      {meta && <span class="m">{meta}</span>}
    </button>
  );
}

/** A waiting task's card (Mac: waitingCard): what it waits for, the groove of a check, its line. */
function WaitCard({ task }: { task: Task }) {
  const w = A.S.waiterFor(task.id);
  const r = reasonOf(task);
  // The lane and the line already say waiting: the reason itself, as the Mac says it.
  const why = w ? w.reason : (r && (deviceWait(r) ?? r)) || "";
  const live = !!w && !!(w.check || w.event);
  const said = reportOf(task)?.summary ? sayable(reportOf(task)!.summary, A.L.lang) : "";
  return (
    <button class="bcard wait" onClick={() => open(task)} title={title(task)}>
      <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
      <span class="wrow">
        {live ? <WaitBubble w={w} /> : <Clock />}
        <span>{why ? t("onhand.waiting.for", why) : stateLabel("blocked")}</span>
      </span>
      {live && <Groove w={w!} />}
      {w && waitCaption(w) && <span class="m">{waitCaption(w)}</span>}
      {said && <span class="m two">{said}</span>}
    </button>
  );
}

/** Done today (Mac: doneList): one card, a row per task: its title, its result's first line, its first check. */
function DoneList({ tasks }: { tasks: Task[] }) {
  return (
    <div class="bcard list">
      {tasks.map((task) => {
        const r = reportOf(task);
        const failed = attention(task) === "failed";
        const first = r ? sayable(r.summary.split("\n")[0], A.L.lang) : undefined;
        const ev = r && !failed ? headlineEvidence(task.evidence.length ? task.evidence : r.evidence) : undefined;
        return (
          <button key={task.id} class="drow" onClick={() => open(task)} title={title(task)}>
            <span class="dtop">
              <span class="t">{title(task) || t("task.unknown")}</span>
              {failed && <b class="failed">{stateLabel("failed")}</b>}
            </span>
            {first && <span class="s">{first}</span>}
            {ev && (
              <span class="m ev">
                <Check />
                {proofLabel(ev, A.L.lang)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- by project (Mac: byproject.go) ----------

type Group = { name: string; place?: { device: string; repoPath: string }; tasks: Task[] };

/** The board's tasks by project, in the order their first task comes on the board (what needs you
 *  first, then working, waiting, done today), Other last. */
export function projectGroups(lanes: Task[][]): Group[] {
  const out: Group[] = [];
  const at = new Map<string, number>();
  let other: Group | undefined;
  for (const lane of lanes.slice(0, 4))
    for (const task of lane) {
      const p = placeOf(task);
      const name = projectOf(task) || (p.kind === "repo" ? p.repoPath.replace(/\/+$/, "").split("/").pop() ?? "" : "");
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

function ByProject() {
  const groups = projectGroups(A.S.board().lanes);
  return (
    <>
      {A.S.partnerDecisions().map((d) => (
        <div class="pd" key={d.decisionId}>
          <DecisionCard d={d} />
        </div>
      ))}
      <div class="groups">
        {groups.map((g) => {
          const name = g.name || t("onhand.other");
          return (
            <section class="group" key={g.name} aria-label={name}>
              <h2>
                <span class="gname">{name}</span> <span class="n">{g.tasks.length}</span>
                <span class="end">
                  <button class="plus" aria-label={`${t("onhand.newhere")} ${name}`} title={t("onhand.newhere")} onClick={() => A.openNewTask(g.place ? { kind: "repo", device: g.place.device, repoPath: g.place.repoPath } : { kind: "none" })}>
                    <PlusSm />
                  </button>
                </span>
              </h2>
              <div class="bcard list">
                {g.tasks.map((task) => (
                  <ProjectRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/** One task of a group, in one line: its face, title, branch, what changed, its state in words. */
function ProjectRow({ task }: { task: Task }) {
  const a = attention(task);
  const p = placeOf(task);
  const ch = task.card?.changes;
  return (
    <button class="prow" onClick={() => open(task)} title={title(task)}>
      <Avatar size={32} state={faceOf(a)} still />
      <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
      {p.kind === "repo" && p.branch && <code class="br">{p.branch}</code>}
      {ch && (
        <span class="stat">
          <i class="add">+{ch.adds}</i>
          <i class="del">−{ch.dels}</i>
        </span>
      )}
      <b class={`st ${a === "needs_you" ? "needs" : a === "failed" ? "failed" : ""}`}>{stateLabel(a)}</b>
    </button>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Clock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" />
    <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);
const PlusSm = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

