// The phone's screens: the conversation (default), 手头的事 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import type { Attention, Bodies, Candidate, DeviceHarness, EvidenceRef, LivingItem, OoDetect } from "@ducter/protocol";
import { Fragment } from "preact";
import { PARTNER_RESERVE } from "@ducter/protocol/src/loadout.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A } from "./app.ts";
import { ago, cjkPad, deviceLabel, duration, firstClause, harnessName, modelName, placeLine, sameWords, splitOutcome, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { disablePush, enablePush } from "./push-client.ts";
import { inApp } from "./native.ts";
import { Goal, Groove, RoutineFacts, RoutineShelf, TryStrip, untilLine, WaitBubble, waitCaption, WaitDetails, waitLine } from "./work.tsx";
import { saidSince, shortGo, shortTitle, TaskBar, TimerPie, WhatItDid } from "./transcript.tsx";
import {
  attention,
  bodyReasonOf,
  editedFiles,
  finalAt,
  finished,
  isPlumbing,
  isRepro,
  harnessOf,
  LANE,
  latestByLabel,
  machineChecked,
  modelOf,
  outsideActs,
  placeOf,
  canIntegrate,
  reasonOf,
  reportOf,
  sortEvidence,
  headlineEvidence,
  resultEvidence,
  title,
  whoOf,
  type DecisionState,
  type Entry,
  type Task,
} from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const coarse = () => matchMedia("(pointer: coarse)").matches;

// ---------- small pieces ----------

const ART = ["idle", "working", "needsyou", "done", "napping", "waiting"] as const;
type Face = (typeof ART)[number];
const FACE_KEY = { idle: "face.idle", working: "face.working", needsyou: "face.needs_you", done: "face.done", napping: "face.napping", waiting: "face.waiting" };
const stillMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Blinks the idle face every 3-6 s, sometimes twice (D77): its closed frame (the same render
 *  with the eyes shut, tools/art/eyes.py) shows for a moment. Character only. */
function useBlink(ref: { current: HTMLElement | null }, on: boolean) {
  useEffect(() => {
    if (!on || stillMotion()) return;
    let h: ReturnType<typeof setTimeout>;
    const blink = () => {
      for (const shut of ref.current?.querySelectorAll<HTMLElement>(".idle.on .shut") ?? [])
        shut.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 150, easing: "ease-in-out" });
    };
    const next = (ms: number) =>
      (h = setTimeout(() => {
        blink();
        if (Math.random() < 0.2) setTimeout(blink, 260);
        next(3000 + Math.random() * 3200);
      }, ms));
    next(800 + Math.random() * 2500);
    return () => clearTimeout(h);
  }, [on]);
}

/** The clay partner: the face for its state (or the one given), breathing; the idle face blinks.
 *  Faces cross-fade on a change, standing on the box's bottom edge. */
export function Avatar({ size, state, still }: { size: number; state?: Face; still?: boolean }) {
  const p = state ?? A.presence();
  const ref = useRef<HTMLSpanElement>(null);
  useBlink(ref, !still);
  return (
    <span ref={ref} class={`avatar${still ? "" : " breathe"}`} style={{ width: size, height: size }} role="img" aria-label={t(FACE_KEY[p], A.S.personaName)}>
      {ART.map((n) =>
        n === "idle" ? (
          <span key={n} class={`idle${n === p ? " on" : ""}`}>
            <img src="app/art/idle.webp" alt="" draggable={false} />
            <img class="shut" src="app/art/idle_closed.webp" alt="" draggable={false} />
          </span>
        ) : (
          <img key={n} class={n === p ? "on" : ""} src={`app/art/${n}.webp`} alt="" draggable={false} />
        ),
      )}
    </span>
  );
}

/** An opened task's face: how the partner looks about it (D76). */
function faceOf(a: Attention): Face {
  if (a === "needs_you" || a === "failed") return "needsyou";
  if (a === "done" || a === "done_claimed") return "done";
  if (a === "working") return "working";
  if (a === "dropped" || a === "superseded") return "napping";
  if (a === "blocked") return "waiting"; // D112: on its bench, looking out
  return "idle";
}

// No status dots (ui.md, "Shown, not dotted"): state is the thing itself, its words, or a
// drawn mark for an exception.
const Forward = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 7h9M8 3.5L11.5 7 8 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.4l2.6 2.6L11 4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Clock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
    <path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>
);
const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Chev = () => (
  <svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Out = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.5 10.5l7-7M5.5 3.5h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
/** A small speech bubble: it is asking you (the calm mark of needs you; "!" reads as an alarm). */
const AskMark = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.6 2h6.8A2.1 2.1 0 0 1 12.5 4.1v3.6a2.1 2.1 0 0 1-2.1 2.1H6.2L3.6 12.3V9.8A2.1 2.1 0 0 1 1.5 7.7V4.1A2.1 2.1 0 0 1 3.6 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
  </svg>
);
/** The drawn mark of an attention state: → under way, clock waiting, a speech bubble asking you, ✓ done, × didn't work. */
function StateMark({ a }: { a: Attention }) {
  if (a === "blocked" || a === "queued") return <Clock />;
  if (a === "needs_you") return <AskMark />;
  if (a === "done" || a === "done_claimed") return <Check />;
  if (a === "failed" || a === "dropped" || a === "superseded") return <Cross />;
  return <Forward />;
}
const Back = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// A finished task reads "Done": done_claimed means nothing checked it yet, and no check runs
// today, so "Done · checking" would promise one that never comes (desktop: stateLabel).
const stateLabel = (a: Attention) => t(`state.${a === "done_claimed" ? "done" : a}`);

/** One clay button family (D76): primary last in a row, at most one per group. */
function Btn(p: { kind: "primary" | "secondary" | "text" | "accent"; size?: "sm" | "lg"; onClick: () => void; label: string; about?: string; disabled?: boolean; grow?: boolean; class?: string }) {
  return (
    <button
      class={`btn ${p.kind}${p.size ? ` ${p.size}` : ""}${p.grow ? " grow" : ""}${p.class ? ` ${p.class}` : ""}`}
      onClick={p.onClick}
      title={p.kind === "primary" ? p.label : undefined}
      aria-label={p.about ? `${p.label} · ${p.about}` : undefined}
      disabled={p.disabled}
    >
      <span class="lbl">{p.label}</span>
    </button>
  );
}

function AutoText(p: { value: string; onInput: (v: string) => void; placeholder: string; label: string; onEnter?: () => void; autoFocus?: boolean; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [p.value]);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      id={p.id}
      rows={1}
      value={p.value}
      placeholder={p.placeholder}
      aria-label={p.label}
      enterkeyhint="send"
      onInput={(e) => p.onInput((e.target as HTMLTextAreaElement).value)}
      onKeyDown={(e) => {
        // On a phone Return breaks the line and the button sends; with a keyboard Enter sends.
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !coarse() && p.onEnter) {
          e.preventDefault();
          p.onEnter();
        }
      }}
    />
  );
}

// ---------- decisions ----------

function defaultInfo(d: DecisionState, now: number): { line: string; frac?: number } {
  if (!d.reversible) return { line: t("decision.no_default") };
  const at = d.defaultAt ? Date.parse(d.defaultAt) : NaN;
  if (d.defaultOption !== "go" || Number.isNaN(at)) return { line: t("decision.default.hold") };
  const left = at - now;
  if (left <= 0) return { line: t("decision.default.due"), frac: 0 };
  if (!d.goLabel) return { line: t("decision.default.goon", duration(A.L, left)) };
  let label = d.goLabel;
  if (A.L.lang === "zh" && label.charCodeAt(0) < 0x80) label = " " + label;
  const asked = d.askedAt ? Date.parse(d.askedAt) : NaN;
  const frac = Number.isNaN(asked) || at <= asked ? undefined : Math.max(0, Math.min(1, left / (at - asked)));
  return { line: t("decision.default.go", duration(A.L, left), label), frac };
}

/** The Go button's words: the action itself when it is a short verb ("Rebase"; zh "好，rebase"),
 *  else Go / 好: never a sentence (D127). */
export function goLabel(d: DecisionState): string {
  return shortGo(d.goLabel);
}

/** An ask's default on a card (D127): a small timer of the time left and one caption
 *  ("28 分钟后按默认：等你登录后继续"); a default that holds, or none, in words alone. */
function DefaultRow({ d }: { d: DecisionState }) {
  const at = d.defaultAt ? Date.parse(d.defaultAt) : NaN;
  if (!d.reversible || d.defaultOption !== "go" || Number.isNaN(at)) return <div class="dl">{defaultInfo(d, Date.now()).line}</div>;
  const left = at - Date.now();
  let g = (d.goLabel || t("decision.go")).trim().replace(/[.。]+$/, "");
  if (A.L.lang !== "zh" && /^[A-Z][a-z]/.test(g)) g = g.charAt(0).toLowerCase() + g.slice(1);
  const asked = d.askedAt ? Date.parse(d.askedAt) : NaN;
  const frac = Number.isNaN(asked) || at <= asked ? 1 : left / (at - asked);
  const words = left <= 0 ? t("decision.default.due") : t("decision.default.in", duration(A.L, left), g);
  return (
    <div class="dl timer" title={words}>
      <TimerPie frac={frac} />
      <span>{words}</span>
    </div>
  );
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}

/** How an ask was answered, in the user's own words (D129): "你说：好，rebase" / "You said: Rebase". */
function answeredWords(d: DecisionState): string {
  const opt = d.resolved?.option ?? (d.pending || "go");
  if (d.resolved?.by === "default") return t("decision.resolved.default");
  if (opt === "reply") return t("decision.resolved.reply", d.resolved?.text ?? "");
  if (opt === "hold") return t("decision.resolved.hold");
  return t("decision.resolved.go", goLabel(d));
}

function Resolved({ d }: { d: DecisionState }) {
  const msg = answeredWords(d);
  return (
    <div class="resolved" role="status">
      <span class="tick">
        <Check />
      </span>
      {msg}
    </div>
  );
}

export function DecisionBody({ d, taskId }: { d: DecisionState; taskId?: string }) {
  useTick(1000);
  const open = !d.resolved && !d.pending;
  const about = (() => {
    const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
    return task && title(task) ? title(task) : d.question.slice(0, 40);
  })();
  const goText = goLabel(d);
  const draft = A.replyDraft.get(d.decisionId) ?? "";
  return (
    <>
      <div class="q">{d.question}</div>
      {d.routineId && <RoutineFacts routineId={d.routineId} />}
      {open && <DefaultRow d={d} />}
      {open ? (
        // Reply… · Hold · Go, the primary last (D76). Hold and Go stay one pair; a long Go
        // sends Reply… to its own line under them (.btns.decide).
        <div class="btns decide">
          <Btn
            kind="text"
            label={t("decision.reply")}
            about={about}
            onClick={() => {
              A.replyOpen.has(d.decisionId) ? A.replyOpen.delete(d.decisionId) : A.replyOpen.add(d.decisionId);
              A.changed();
            }}
          />
          <span class="pair">
            <Btn kind="secondary" label={t("decision.hold")} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
            <Btn kind="primary" label={goText} about={about} onClick={() => A.decide(d.decisionId, "go")} />
          </span>
        </div>
      ) : (
        <Resolved d={d} />
      )}
      {open && A.replyOpen.has(d.decisionId) && (
        <div class="reply">
          <AutoText
            value={draft}
            autoFocus
            label={t("decision.reply.placeholder")}
            placeholder={t("decision.reply.placeholder")}
            onInput={(v) => (A.replyDraft.set(d.decisionId, v), A.changed())}
            onEnter={() => draft.trim() && (A.decide(d.decisionId, "reply", draft.trim()), A.replyDraft.delete(d.decisionId))}
          />
          <button
            class="btn accent icon send"
            aria-label={t("composer.send")}
            disabled={!draft.trim()}
            onClick={() => {
              A.decide(d.decisionId, "reply", draft.trim());
              A.replyDraft.delete(d.decisionId);
            }}
          >
            <Arrow />
          </button>
        </div>
      )}
    </>
  );
}

/** One ask: the asking task's title as a quiet link (nothing for the partner's own asks, or
 *  inside its own task), the question, its default, and Go / Hold / Reply…. */
function DecisionCard({ d, taskId, inTask }: { d: DecisionState; taskId?: string; inTask?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const flash = A.flash === d.decisionId;
  useEffect(() => {
    if (flash) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      A.flash = undefined;
    }
  }, [flash]);
  const id = taskId || d.taskId;
  const task = id ? A.S.tasks.get(id) : undefined;
  return (
    <div ref={ref} class={`decision${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
      {task && title(task) && !inTask && (
        // Who asks and about what (D127): the agent's coin and the task's short title, the way into it.
        <button class="asker" title={title(task)} onClick={() => ((A.sheet = null), A.go({ name: "task", id: task.id }))}>
          {harnessOf(task) && <img src={`app/art/${harnessOf(task) === "claude-code" ? "token_orange" : "token_ink"}.webp`} alt="" width="20" height="20" />}
          <span>{shortTitle(title(task))} ›</span>
        </button>
      )}
      <DecisionBody d={d} taskId={taskId} />
    </div>
  );
}

// ---------- tasks in the conversation ----------

/** A task in the partner's words: its drawn mark, its title as a link, its status in muted
 *  words. No fill, no capsule (D73). */
function TaskLine({ task, detail }: { task: Task; detail?: string }) {
  const a = attention(task);
  let d = (!sameWords(detail, title(task)) && detail) || stateLabel(a);
  // Who is doing it ends the line while it is under way, with why when it isn't the plain pick (D89).
  const [who, why] = whoLine(task);
  if (who && !finished(task) && a !== "dropped") d += ` · ${who}${why ? ` · ${why}` : ""}`;
  return (
    <button class="taskline" onClick={() => A.go({ name: "task", id: task.id })}>
      <span class="ic">
        <StateMark a={a} />
      </span>
      <span class="t">{title(task) || t("task.unknown")}</span>
      <span class="s">· {d} ›</span>
    </button>
  );
}

function openEvidence(ev: EvidenceRef, task?: Task) {
  if (ev.kind === "diff" && task) return A.go({ name: "task", id: task.id });
  if (/^https?:/.test(ev.ref)) return void window.open(ev.ref, "_blank", "noopener");
  navigator.clipboard?.writeText(ev.ref).catch(() => {});
  A.toast(`${ev.label} · ${ev.ref}`);
}

/** The changes in words: "2 files changed". A label that already counts them stands; else they
 *  are counted from the task's edits, else from the files it named; "See changes" when nothing
 *  counts them (a bare "commit" or a hash says nothing to a person). */
function changesLabel(task: Task, changed: EvidenceRef[]): string {
  const counted = changed.find((e) => e.kind === "diff" && /\d+\s*(files?\b|个文件)/i.test(e.label));
  if (counted) return counted.label;
  const n = editedFiles(task) || changed.filter((e) => e.kind === "file").length;
  if (n) return n === 1 ? t("result.files.one") : t("result.files", n);
  return t("result.changes");
}

/** How the task knows, as one quiet line that wraps: a drawn ✓ (× for a task that didn't work)
 *  and plain words per check, the changes as "2 files changed ›", and, withTitle, the task's
 *  title as a link at its end. */
function ProofLine({ task, evs, withTitle, max = 4 }: { task: Task; evs: EvidenceRef[]; withTitle?: boolean; max?: number }) {
  const list = sortEvidence(latestByLabel(evs));
  const failed = attention(task) === "failed";
  // The changes are one item, "2 files changed ›" (D73): commits and changed files fold into it.
  const changed = list.filter((e) => e.kind === "diff" || (e.kind === "file" && !/^https?:/.test(e.ref)));
  const rest = list.filter((e) => !changed.includes(e));
  const changes = changed.length ? changesLabel(task, changed) : "";
  if (!rest.length && !changes && !withTitle) return null;
  return (
    <div class="proof">
      {rest.slice(0, max).map((ev, i) =>
        /^https?:/.test(ev.ref) ? (
          <button key={i} class="qlink" onClick={() => openEvidence(ev, task)}>
            {ev.label} ›
          </button>
        ) : (
          <span key={i} class="mk" title={ev.ref}>
            {/* A reproduction failed on purpose: a quiet ×, never a ✓ (the run after it carries the ✓). */}
            {failed ? <Cross /> : isRepro(ev) ? <span class="repro"><Cross /></span> : machineChecked(ev.kind) ? <span class="ok"><Check /></span> : null}
            {ev.label}
          </span>
        ),
      )}
      {rest.length > max && (
        <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
          {t("result.more", rest.length - max)}
        </button>
      )}
      {changes &&
        (withTitle ? (
          <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
            {changes} ›
          </button>
        ) : (
          <span class="mk">{changes}</span>
        ))}
      {withTitle && (
        <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
          {title(task) || t("task.unknown")} ›
        </button>
      )}
    </div>
  );
}

/** What the task sent out, in one line, from its log. Empty when nothing went out (a row
 * with nothing to say is left out; the task's Sent out card still says so), or until the log
 * is loaded. */
function outsideLine(task: Task): string {
  if (!task.historyLoaded) return "";
  const acts = outsideActs(task);
  if (!acts.length) return "";
  return `${acts[0]!.command}${acts.length > 1 ? " · " + t("result.more", acts.length - 1) : ""}`;
}

/** Why the last Open draft PR didn't work, in words, or "". It stays on the task until the next
 *  try or the next result, not a toast that is gone in 4 seconds. */
function prFailure(task: Task): string {
  const a = task.acted;
  if (!a || a.ok || a.action !== "open_pr") return "";
  return noRemote(task) ? t("result.pr.noremote") : t("result.pr.failed", a.message ?? "");
}

/** The repo has nowhere to push to, so a PR can't be opened: Open draft PR isn't offered. */
function noRemote(task: Task): boolean {
  if ((placeOf(task) as { hasRemote?: boolean }).hasRemote === false) return true;
  const a = task.acted;
  return !!a && !a.ok && a.action === "open_pr" && /no (origin )?remote/i.test(a.message ?? "");
}

function PrFailure({ task }: { task: Task }) {
  const why = prFailure(task);
  // No remote is how the repo is, not something that went wrong: muted, not the failed ink.
  return why ? <div class={`small${noRemote(task) ? "" : " fail-line"}`} role="status">{why}</div> : null;
}

function ResultActions({ task, inTask }: { task: Task; inTask?: boolean }) {
  const p = placeOf(task);
  if (!canIntegrate(task) || p.kind !== "repo") return null;
  const base = p.baseBranch || "main";
  return (
    <>
    <div class="btns">
      {task.acting ? (
        <span class="small">{t(`result.acting.${task.acting}`, base)}</span>
      ) : task.unsure ? (
        // The result was lost with the connection and the Log doesn't show it done: say so,
        // offer to try again, never claim a failure.
        <>
          <span class="small">{t("result.unsure")}</span>
          <Btn kind="secondary" label={t("task.action.retry")} about={title(task)} onClick={() => A.retryAction(task.id)} />
        </>
      ) : task.acted?.ok && task.acted.action === "merge" ? (
        <span class="small" style={{ color: "var(--done-ink)", fontWeight: 700 }}>
          {t("result.merged", base)}
        </span>
      ) : (
        <>
          {!noRemote(task) && <Btn kind="secondary" label={t("result.pr")} about={title(task)} onClick={() => A.taskAction(task.id, "open_pr")} />}
          <Btn kind="primary" label={t("result.merge", base)} about={title(task)} onClick={() => A.taskAction(task.id, "merge")} />
        </>
      )}
    </div>
    {!task.acting && <PrFailure task={task} />}
    </>
  );
}

/** What went out, only when something did: a drawn ↗ and the literal action. */
function SentLine({ task }: { task: Task }) {
  const line = outsideLine(task);
  if (!line) return null;
  return (
    <div class="proof">
      <span class="mk">
        <Out />
        {line}
      </span>
    </div>
  );
}

// ---------- the quiet conversation (D104) ----------
// By default the conversation is the partner's words. What stands behind a message (its task, the
// proof, the changes, what went out, what it noted) is one tap away under a single quiet
// Details; Merge into main stays one tap as a text button when it is the next step.

/** The single quiet affordance under a message: Details, or Hide once open. */
function DetailsToggle({ k, about }: { k: string; about?: string }) {
  const open = A.detailsOpen(k);
  return (
    <button class="tb" aria-expanded={open} aria-label={about ? `${t(open ? "details.hide" : "details.show")} · ${about}` : undefined} onClick={() => A.toggleDetails(k)}>
      {t(open ? "details.hide" : "details.show")}
      <Chev />
    </button>
  );
}

/** Merge into main as a text button when it is the task's next step; its state in words after. */
function MergeAction({ task }: { task: Task }) {
  const p = placeOf(task);
  if (!finished(task) || !canIntegrate(task) || p.kind !== "repo") return null;
  const base = p.baseBranch || "main";
  if (task.acting) return <span class="qs">{t(`result.acting.${task.acting}`, base)}</span>;
  if (task.unsure) return <Btn kind="text" size="sm" class="tb act" label={t("task.action.retry")} about={t("result.unsure")} onClick={() => A.retryAction(task.id)} />;
  if (task.acted?.ok && task.acted.action === "merge")
    return (
      <span class="qs done">
        <Check />
        {t("result.merged", base)}
      </span>
    );
  return <button class="tb act" aria-label={`${t("result.merge", base)} · ${title(task)}`} onClick={() => A.taskAction(task.id, "merge")}>{t("result.merge", base)}</button>;
}

/** A task's lines inside Details: under way, its status line; finished, the proof with the
 *  changes and its title as links, and Open draft PR. What went out shows above the row. */
function ResultDetails({ task, detail }: { task: Task; detail?: string }) {
  if (!finished(task)) return <TaskLine task={task} detail={detail} />;
  A.history(task.id);
  const pr = canIntegrate(task) && !task.acting && !(task.acted?.ok && task.acted.action === "merge");
  return (
    <>
      <ProofLine task={task} evs={resultEvidence(task)} withTitle />
      {pr && !noRemote(task) && (
        <div class="proof">
          <button class="qlink" onClick={() => A.taskAction(task.id, "open_pr")}>
            {t("result.pr")}
          </button>
        </div>
      )}
      {!task.acting && <PrFailure task={task} />}
    </>
  );
}

function NotedLine({ n }: { n: { seq: number; title: string } }) {
  return (
    <div class="proof">
      <span class="mk">{t("memory.noted", n.title)}</span>
      <button class="qlink" onClick={() => A.forget(n.seq)}>
        {t("partner.memory.forget")}
      </button>
    </div>
  );
}

/** Under a partner message: one quiet row (Merge into main, Details), then Details when open. */
function Quiet({ k, tasks, detail, noted = [] }: { k: string; tasks: Task[]; detail?: string; noted?: { seq: number; title: string }[] }) {
  if (!tasks.length && !noted.length) return null;
  const open = A.detailsOpen(k);
  return (
    <>
      {/* What went out is never folded away (D104): the exception that matters to trust. */}
      {tasks.filter(finished).map((task) => (
        <SentLine key={task.id} task={task} />
      ))}
      <div class="qrow">
        {tasks.map((task) => (
          <MergeAction key={task.id} task={task} />
        ))}
        <DetailsToggle k={k} about={tasks[0] ? title(tasks[0]) : undefined} />
      </div>
      {open && (
        <div class="det">
          {tasks.map((task) => (
            <ResultDetails key={task.id} task={task} detail={detail} />
          ))}
          {noted.map((n) => (
            <NotedLine key={n.seq} n={n} />
          ))}
        </div>
      )}
    </>
  );
}

function JobRow({ e, chipOwner, noted, join }: { e: Entry; chipOwner: Map<string, number>; noted: { seq: number; title: string }[]; join?: boolean }) {
  const j = e.job!;
  const st = j.status;
  const task = st?.taskId ? A.S.tasks.get(st.taskId) : undefined;
  const own = task && title(task) && chipOwner.get(task.id) === e.firstSeq;
  return (
    <div class={`partner${join ? " join" : ""}`}>
      {j.ack && <div class="bubble">{j.ack.text}</div>}
      {st && !(task && title(task)) && <div class={`status-line${st.state === "failed" ? " failed" : ""}`}>{st.text}</div>}
      <Quiet k={`m${e.firstSeq}`} tasks={own ? [task!] : []} detail={st?.text} noted={noted} />
    </div>
  );
}

/** How long the partner usually needs to say a finished task in its own words (measured: 30–75 s). */
const WORDS_MS = 120_000;

/** Milliseconds until a finished task's line may stand in for the partner's words: while the
 *  partner is putting its result into words, the place shows its waiting presence instead. Zero
 *  once it is late (or offline): then the line says it plainly. */
function wordsDueIn(task: Task): number {
  if (A.status === "offline") return 0;
  const at = finalAt(task);
  return Number.isNaN(at) ? 0 : Math.max(0, at + WORDS_MS - Date.now());
}

/** A living item the partner didn't report itself, said as one sentence (D104): a task that
 *  didn't work, or one that came back. Work under way and waits are not said; the header and
 *  On hand carry them (with Details shown, they show as lines). */
function News({ it, k, owns }: { it: LivingItem; k: string; owns: boolean }) {
  const task = A.S.tasks.get(it.taskId);
  const wait = task ? wordsDueIn(task) : 0;
  useEffect(() => {
    if (wait <= 0) return;
    const h = setTimeout(() => A.changed(), wait + 50);
    return () => clearTimeout(h);
  }, [wait > 0]);
  // The partner is putting the result into its own words (D124): its waiting presence holds the
  // place, not a template line that its message replaces a minute later.
  if (wait > 0) return <Presence line={t("activity.result")} />;
  const text = it.title ? t(it.kind === "failed" ? "living.failed" : "living.done", it.title, it.text) : it.text;
  return (
    <div class="partner">
      <div class="bubble">{text}</div>
      {task ? (
        <Quiet k={k} tasks={owns ? [task] : []} />
      ) : (
        <div class="qrow">
          <DetailsToggle k={k} />
        </div>
      )}
    </div>
  );
}

function LivingLine({ it }: { it: LivingItem }) {
  const text = it.title ? `${it.title} · ${it.text}` : it.text;
  return (
    <button class="line" onClick={() => it.taskId && A.go({ name: "task", id: it.taskId })}>
      <span class="ic">{it.kind === "done" ? <Check /> : it.kind === "blocked" ? <Clock /> : it.kind === "failed" ? <Cross /> : <Forward />}</span>
      <span class="tx">{text}</span>
    </button>
  );
}

const openAsk = (d?: DecisionState) => !!d && !d.resolved && !d.pending;
const dueAt = (d: DecisionState) => (d.defaultAt ? Date.parse(d.defaultAt) : Infinity);

/** One ask in the partner's words (D104): the question as it speaks, its default in one muted
 *  line with Details, and, when it is the one being asked, Reply… · Hold · Go in one small row. */
function Ask({ d, taskId, buttons = true }: { d: DecisionState; taskId?: string; buttons?: boolean }) {
  useTick(1000);
  const ref = useRef<HTMLDivElement>(null);
  const flash = A.flash === d.decisionId;
  useEffect(() => {
    if (flash) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      A.flash = undefined;
    }
  }, [flash]);
  const id = taskId || d.taskId;
  const task = id ? A.S.tasks.get(id) : undefined;
  const open = openAsk(d);
  const k = `d${d.decisionId}`;
  const about = task && title(task) ? title(task) : d.question.slice(0, 40);
  const draft = A.replyDraft.get(d.decisionId) ?? "";
  const wait = open ? relayDueIn(d) : 0;
  useEffect(() => {
    if (wait <= 0) return;
    const h = setTimeout(() => A.changed(), wait + 50);
    return () => clearTimeout(h);
  }, [wait > 0]);
  // The partner is putting a task's question into its own words (D129): its waiting presence
  // holds the place; the task's own wording never shows in the conversation first.
  if (wait > 0) return <Presence line={t("activity.relay")} />;
  return (
    <div ref={ref} class={`partner askq${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
      <div class="bubble">{d.said || d.question}</div>
      {/* A routine's proposal card (D29, D114): what it would do, before one Go. */}
      {d.routineId && open && <RoutineFacts routineId={d.routineId} />}
      {open ? (
        <>
          {/* One compact tray (D129): Reply… · Hold as quiet text, Go last, named by the action. */}
          {buttons && (
            <div class="tray">
              <Btn kind="text" size="sm" label={t("decision.reply")} about={about} onClick={() => (A.replyOpen.has(d.decisionId) ? A.replyOpen.delete(d.decisionId) : A.replyOpen.add(d.decisionId), A.changed())} />
              <Btn kind="text" size="sm" label={t("decision.hold")} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
              <span class="grow" />
              <Btn kind="primary" size="sm" label={goLabel(d)} about={about} onClick={() => A.decide(d.decisionId, "go")} />
            </div>
          )}
          <div class="dflt">
            <span>{defaultInfo(d, Date.now()).line}</span>
            {task && title(task) && <DetailsToggle k={k} about={about} />}
          </div>
          {task && A.detailsOpen(k) && (
            <div class="det">
              <TaskLine task={task} />
              {d.said && d.question && <div class="its">{t("decision.its_words", d.question)}</div>}
            </div>
          )}
          {A.replyOpen.has(d.decisionId) && (
            <div class="reply">
              <AutoText
                value={draft}
                autoFocus
                label={t("decision.reply.placeholder")}
                placeholder={t("decision.reply.placeholder")}
                onInput={(v) => (A.replyDraft.set(d.decisionId, v), A.changed())}
                onEnter={() => draft.trim() && (A.decide(d.decisionId, "reply", draft.trim()), A.replyDraft.delete(d.decisionId))}
              />
              <button
                class="btn accent icon send"
                aria-label={t("composer.send")}
                disabled={!draft.trim()}
                onClick={() => {
                  A.decide(d.decisionId, "reply", draft.trim());
                  A.replyDraft.delete(d.decisionId);
                }}
              >
                <Arrow />
              </button>
            </div>
          )}
        </>
      ) : (
        // Answered: one tiny line on the user's side, in their own words.
        <div class="said" role="status">
          {answeredWords(d)}
        </div>
      )}
    </div>
  );
}

/** How long a task's question waits for the partner's own words before its own wording stands in. */
const RELAY_MS = 60_000;
function relayDueIn(d: DecisionState): number {
  if (!d.taskId || d.said || A.status === "offline" || !d.askedAt) return 0;
  const at = Date.parse(d.askedAt);
  return Number.isNaN(at) ? 0 : Math.max(0, at + RELAY_MS - Date.now());
}

/** The living message without its card (D104): a small divider when the person was away, what
 *  didn't work or came back as sentences, then the asks: the one whose default comes soonest
 *  with its buttons, the rest gathered in one line until it is answered or opened. */
function Living({ e, items, chipOwner }: { e: Entry; items: LivingItem[]; chipOwner: Map<string, number> }) {
  if (!A.livingAway.has(e.firstSeq)) A.livingAway.set(e.firstSeq, e.firstSeq <= A.S.headSeq && A.S.unread(e));
  const away = A.livingAway.get(e.firstSeq)!;
  const shown = A.details === "shown";
  const asks = items
    .filter((it) => it.kind === "decision")
    .map((it) => ({ it, d: it.decisionId ? A.S.decisions.get(it.decisionId) : undefined }))
    .filter((x): x is { it: LivingItem; d: DecisionState } => !!x.d);
  const answered = asks.filter((x) => !openAsk(x.d));
  const waiting = asks.filter((x) => openAsk(x.d)).sort((a, b) => dueAt(a.d) - dueAt(b.d) || a.d.seq - b.d.seq);
  const all = shown || A.moreAsks.has(e.firstSeq);
  const head = all ? waiting : waiting.slice(0, 1);
  const rest = waiting.length - head.length;
  const defaults = waiting.filter((x) => x.d.reversible).length;
  const news = items.filter((it) => it.kind === "failed" || it.kind === "done");
  const lines = shown ? items.filter((it) => it.kind === "progress" || it.kind === "blocked") : [];
  if (!asks.length && !news.length && !lines.length) return null;
  return (
    <section class="living" key={`${e.firstSeq}:${e.revision}`} aria-label={t("living.title")}>
      {away && <div class="when">{t("living.away.at", clockOf(e.ev.ts))}</div>}
      {news.map((it, i) => (
        <News key={`n${i}`} it={it} k={`l${e.firstSeq}:${it.taskId}`} owns={chipOwner.get(it.taskId) === e.firstSeq} />
      ))}
      {lines.length > 0 && (
        <div class="det lines">
          {lines.map((it, i) => (
            <LivingLine key={i} it={it} />
          ))}
        </div>
      )}
      {answered.map(({ it, d }) => (
        <Ask key={d.decisionId} d={d} taskId={it.taskId} />
      ))}
      {head.map(({ it, d }) => (
        <Ask key={d.decisionId} d={d} taskId={it.taskId} />
      ))}
      {(rest > 0 || (head.length >= 2 && defaults >= 2)) && (
        <div class="qrow gather">
          {rest > 0 && (
            <button class="tb" aria-expanded="false" onClick={() => (A.moreAsks.add(e.firstSeq), A.changed())}>
              {t("living.more", rest)}
              <Chev />
            </button>
          )}
          {defaults >= 2 && <button class="tb" onClick={() => A.goOnAllDefaults()}>{t("decision.goall", A.defaultable().length)}</button>}
        </div>
      )}
    </section>
  );
}

const clockOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function replyTasks(e: Entry, chipOwner: Map<string, number>): Task[] {
  const ids = e.ai?.replyTo ? A.S.tasksOfReply(e.ai.replyTo).filter((id) => chipOwner.get(id) === e.firstSeq) : [];
  return ids.map((id) => A.S.tasks.get(id)).filter((x): x is Task => !!x);
}

/** A row ends on a bubble with nothing under it, so the next one of the same voice may stack on
 *  it (D129). */
function bare(e: Entry, chipOwner: Map<string, number>): boolean {
  if (e.user) return true;
  if (e.ai) return !replyTasks(e, chipOwner).length && !A.notedFor(e).length;
  if (e.job) {
    const st = e.job.status;
    if (!e.job.ack || A.notedFor(e).length) return false;
    if (!st) return true;
    const task = st.taskId ? A.S.tasks.get(st.taskId) : undefined;
    return !!task && !!title(task) && chipOwner.get(task.id) !== e.firstSeq;
  }
  return false;
}

/** Whether e's first bubble stacks on prev's last one: the same voice, prev bare, no time line. */
function stacks(prev: Entry | undefined, e: Entry, chipOwner: Map<string, number>): boolean {
  if (!prev || !!prev.user !== !!e.user || !bare(prev, chipOwner)) return false;
  return !!e.user || !!e.ai || !!e.job?.ack;
}

function EntryView({ e, chipOwner, livingItems, join }: { e: Entry; chipOwner: Map<string, number>; livingItems: (e: Entry) => LivingItem[]; join?: boolean }) {
  if (e.user) return <div class={`user${join ? " join" : ""}`}>{e.user.text}</div>;
  if (e.ai) {
    return (
      <div class={`partner${join ? " join" : ""}`}>
        <div class="bubble" dangerouslySetInnerHTML={{ __html: markdown(e.ai.text) }} />
        <Quiet k={`m${e.firstSeq}`} tasks={replyTasks(e, chipOwner)} noted={A.notedFor(e)} />
      </div>
    );
  }
  if (e.job) return <JobRow e={e} chipOwner={chipOwner} noted={A.notedFor(e)} join={join} />;
  if (e.living) return <Living e={e} items={livingItems(e)} chipOwner={chipOwner} />;
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    if (!d) return null;
    return <Ask d={d} />;
  }
  return null;
}

/** While the user waits on a reply (D104): the clay partner where its words will appear, and
 *  one plain line of what it is doing, updated in place, gone when the reply lands. A step past
 *  15 s adds a reassuring line; past 45 s, that it will say when it's ready. */
function Presence({ line }: { line?: string }) {
  useTick(1000);
  const a = A.S.activity;
  const lastUser = [...A.S.channel].reverse().find((e) => e.user);
  const since = a?.at ?? A.thinkingSince ?? (lastUser ? Date.parse(lastUser.ev.ts) : Date.now());
  const s = (Date.now() - since) / 1000;
  // A result being put into words has its own line and no "taking longer" (it ends in 2 minutes).
  const sub = line ? "" : s >= 45 ? t("activity.long") : s >= 15 ? t("activity.slow") : "";
  return (
    <div class="presence" role="status" aria-live="polite">
      <span class="bob">
        <Avatar size={32} state="working" still />
      </span>
      <span class="pline">
        {line ?? t(`activity.${a?.step ?? "thinking"}`)}
        {sub && <span class="sub">{sub}</span>}
      </span>
    </div>
  );
}

// ---------- header, composer ----------

function OnHandButton() {
  // Just the word: the header line says what needs you, in words; no row of colored dots.
  return <Btn kind="secondary" size="sm" label={t("nav.onhand")} onClick={() => A.go({ name: "onhand" })} />;
}

function Top({ back, face = true }: { back?: string; face?: boolean }) {
  if (back)
    return (
      <header class="top">
        <button class="back" onClick={() => (history.length > 1 && location.hash ? history.back() : A.go({ name: "conv" }))}>
          <Back />
          {back}
        </button>
        <span style={{ flex: 1 }} />
        {face && <Avatar size={40} />}
      </header>
    );
  return (
    <header class="top">
      <button class="who" onClick={() => A.openSettings()} aria-label={t("settings.title")}>
        <Avatar size={52} />
        <span style={{ minWidth: 0 }}>
          <div class="name">{A.S.personaName}</div>
          <div class="sum" role="status">
            {A.summary()}
          </div>
        </span>
      </button>
      <OnHandButton />
    </header>
  );
}

function Held() {
  if (!A.held) return null;
  return (
    <div class="held" role="alert">
      <span>{t("secret.held")}</span>
      <Btn kind="text" size="sm" label={t("secret.send")} onClick={() => A.sendHeld()} />
      <Btn kind="secondary" size="sm" label={t("secret.cancel")} onClick={() => ((A.held = undefined), A.changed())} />
    </div>
  );
}

function Composer({ taskId }: { taskId?: string }) {
  const value = taskId ? (A.taskDrafts.get(taskId) ?? "") : A.draft;
  const set = (v: string) => {
    if (taskId) A.taskDrafts.set(taskId, v);
    else A.draft = v;
    A.changed();
  };
  const submit = () => {
    const ok = taskId ? A.sendToTask(taskId, value) : A.sendMessage(value);
    if (ok) set("");
  };
  const label = taskId ? t("composer.task") : t("composer.label", A.S.personaName);
  return (
    <div class="composer-wrap">
      {(A.held?.taskId ?? "") === (taskId ?? "") && <Held />}
      <div class="composer">
        <AutoText id="composer" value={value} onInput={set} onEnter={submit} label={label} placeholder={taskId ? t("composer.task") : t("composer.placeholder", A.S.personaName)} />
        <button class="btn accent icon send" aria-label={t("composer.send")} disabled={!value.trim()} onClick={submit}>
          <Arrow />
        </button>
      </div>
    </div>
  );
}

// ---------- notifications ask (in the partner's voice, with a default) ----------

/** Asks the browser, subscribes, tells core; says so if the browser can't. */
async function turnOnPush() {
  try {
    const s = await Promise.race([
      enablePush(A.api, A.base, A.L.lang, A.me!.push.publicKey!),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 20_000)),
    ]);
    if (s === "denied") A.toast(t("notify.denied"));
    if (s === "unsupported") A.toast(t(inApp() ? "notify.app.unavailable" : "notify.unsupported"));
    return s;
  } catch (err) {
    A.toast(t("result.action.failed", (err as Error).message));
    return "off" as const;
  }
}

const ASKED = "ducter.notify.asked";
const asked = () => {
  try {
    return localStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
};

function NotifyAsk() {
  const [busy, setBusy] = useState(false);
  if (asked() || !A.me) return null;
  const hasWork = A.S.board().lanes.some((l) => l.length > 0) || A.S.openDecisions().length > 0;
  if (!hasWork) return null; // asked at the moment it means something: once there's work out
  const dismiss = () => {
    try {
      localStorage.setItem(ASKED, "1");
    } catch {}
    A.changed();
  };
  if (A.push === "ios-install")
    return (
      <div class="hint" role="note">
        {t("notify.ios")}{" "}
        <button class="more" onClick={dismiss}>
          {t("sheet.close")}
        </button>
      </div>
    );
  if (A.push !== "off" || !A.me.push.publicKey || (inApp() && !A.me.push.apns)) return null;
  return (
    <div class="ask">
      <div class="q">{t("notify.ask")}</div>
      <div class="note">{t("notify.ask.note", "23:00", "08:00")}</div>
      <div class="btns">
        <Btn kind="secondary" label={t("notify.later")} onClick={dismiss} />
        <Btn
          kind="primary"
          label={t("notify.on")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            A.push = await turnOnPush();
            setBusy(false);
            dismiss();
            if (A.push === "on") A.toast(t("notify.enabled"));
          }}
        />
      </div>
    </div>
  );
}

// ---------- the conversation ----------

/** A messaging app's time line: before the first message, and wherever 15 minutes passed. */
const GAP_MS = 15 * 60_000;
function timeGap(prev: Entry | undefined, e: Entry): boolean {
  if (!prev) return true;
  return Date.parse(e.ev.ts) - Date.parse(prev.ev.ts) >= GAP_MS;
}

export function Conversation() {
  const { rows, livingItems, chipOwner } = A.rows();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  });
  const empty = rows.length === 0 && A.pending.length === 0 && A.S.welcomed;
  return (
    <>
      <Top />
      {A.status === "offline" && (
        <div class="conn" role="status">
          {t("conn.offline")}
        </div>
      )}
      <main
        class="scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div class="spacer" />
        {empty && <Hello />}
        {rows.map((e, i) => {
          const gap = timeGap(rows[i - 1], e);
          return (
            <Fragment key={e.firstSeq}>
              {gap && !(e.living && A.livingAway.get(e.firstSeq)) && <div class="when">{when(A.L, e.ev.ts)}</div>}
              <EntryView e={e} chipOwner={chipOwner} livingItems={livingItems} join={!gap && stacks(rows[i - 1], e, chipOwner)} />
            </Fragment>
          );
        })}
        {A.pending.map((p, i) => (
          <div key={p.clientId} class={`user pending${i > 0 || rows.at(-1)?.user ? " join" : ""}`}>
            {p.text}
          </div>
        ))}
        {A.thinking() && <Presence />}
        <NotifyAsk />
      </main>
      <Composer />
    </>
  );
}

function Hello() {
  return (
    <div class="hello">
      <Avatar size={150} state="idle" />
      <h1>{t("empty.conversation.title", A.S.personaName)}</h1>
      <p>{t("empty.conversation")}</p>
      <div class="try">
        <div class="label">{t("empty.try")}</div>
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            class="btn secondary suggest"
            onClick={() => {
              A.draft = t(`suggest.${i}`); // fills the composer; never sends
              A.changed();
              document.getElementById("composer")?.focus();
            }}
          >
            {t(`suggest.${i}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- On hand ----------

/** Where a task runs and why there, in one short muted line ("Codex · MacBook · Your rule …");
 *  the model, the repo, the branch and the rest of the reason are in the task's Details. */
function metaLine(task: Task): string {
  const p = placeOf(task);
  const where = p.kind === "none" ? "" : deviceLabel(A.L, p.device);
  return [harnessName(harnessOf(task)), where, firstClause(bodyReasonOf(task))].filter(Boolean).join(" · ");
}

/** What a waiting task waits for, said once: the lane already says it is waiting. */
function waitReason(task: Task): string {
  const w = A.S.waiterFor(task.id);
  if (w) return [waitLine(w.reason), waitCaption(w)].filter(Boolean).join(" · ");
  return reasonOf(task) || metaLine(task);
}

/** A working row's line: a keep-going loop's try, or a routine's run, else where and who. */
function workLine(task: Task): string {
  const u = A.S.untilOf(task);
  if (u) return untilLine(u);
  const from = task.card?.fromRoutine;
  return [from ? t("routine.from", from.name) : "", metaLine(task)].filter(Boolean).join(" · ");
}

function Row({ task, meta }: { task: Task; meta: string }) {
  const w = attention(task) === "blocked" ? A.S.waiterFor(task.id) : undefined;
  const u = A.S.untilOf(task);
  // Its wait just came true (D115): the bubble pops and the card springs into Working.
  const arrived = attention(task) !== "blocked" && A.S.justArrived(task.id);
  return (
    <button class={`row${arrived ? " arrived" : ""}`} onClick={() => A.go({ name: "task", id: task.id })}>
      {arrived && <span class="pop-bub" aria-hidden="true" />}
      {w && <WaitBubble w={w} />}
      <span class="main">
        <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
        {u && !finished(task) && <Goal u={u} />}
        {w && <Groove w={w} />}
        <span class="m">{meta}</span>
      </span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function OnHand() {
  const b = A.S.board();
  const needs = b.lanes[LANE.needs]!;
  const partnerDs = A.S.partnerDecisions();
  const working = b.lanes[LANE.working]!;
  const waiting = b.lanes[LANE.waiting]!;
  const done = b.lanes[LANE.done]!;
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  const nothing = !needs.length && !partnerDs.length && !working.length && !waiting.length && !done.length && !loose.length && !routines.length;
  const openCount = A.defaultable().length;
  return (
    <>
      <Top back={t("nav.back")} />
      <main class="scroll" style={{ gap: 16 }}>
        <h1 class="page-title">{t("onhand.title")}</h1>
        {nothing ? (
          <div class="calm">{t("onhand.empty", A.S.personaName)}</div>
        ) : (
          <>
            <section class="section">
              <h3>
                {t("lane.needs_you")} <span class="n">{needs.length + partnerDs.length || ""}</span>
                {openCount >= 2 && (
                  <span style={{ marginLeft: "auto" }}>
                    <Btn kind="text" size="sm" label={t("decision.goall", openCount)} onClick={() => A.goOnAllDefaults()} />
                  </span>
                )}
              </h3>
              {!needs.length && !partnerDs.length && (
                <div class="calm">{working.length ? t("onhand.calm.working", A.S.personaName, working.length) : t("onhand.calm")}</div>
              )}
              {partnerDs.map((d) => (
                <DecisionCard key={d.decisionId} d={d} />
              ))}
              {needs.map((task) => {
                const d = A.S.pendingDecision(task.id);
                return d ? <DecisionCard key={task.id} d={d} taskId={task.id} /> : <Row key={task.id} task={task} meta={metaLine(task)} />;
              })}
            </section>
            {working.length > 0 && (
              <section class="section">
                <h3>
                  {t("lane.working")} <span class="n">{working.length}</span>
                </h3>
                {working.map((task) => (
                  <Row key={task.id} task={task} meta={workLine(task)} />
                ))}
              </section>
            )}
            {(waiting.length > 0 || loose.length > 0) && (
              <section class="section">
                <h3>
                  {t("lane.waiting")} <span class="n">{waiting.length + loose.length}</span>
                </h3>
                {waiting.map((task) => (
                  <Row key={task.id} task={task} meta={waitReason(task)} />
                ))}
                {loose.map((w) => (
                  <div class="row" key={w.waiterId}>
                    {w.check || w.event ? <WaitBubble w={w} /> : <Clock />}
                    <span class="main">
                      <span class="t">{w.check || w.event ? waitLine(w.reason) : w.reason}</span>
                      {(w.check || w.event) && <Groove w={w} />}
                      {waitCaption(w) && <span class="m">{waitCaption(w)}</span>}
                    </span>
                    {(w.check || w.event) && <Btn kind="text" size="sm" label={t("wait.cancel")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "cancel")} />}
                  </div>
                ))}
              </section>
            )}
            {done.length > 0 && (
              <section class="section">
                <h3>
                  {t("lane.done")} <span class="n">{done.length}</span>
                </h3>
                {done.map((task) => {
                  const r = reportOf(task);
                  const ev = headlineEvidence(task.evidence.length ? task.evidence : (r?.evidence ?? []));
                  // The lane says Done; only the exception (Didn't work) is said, in words.
                  const failed = attention(task) === "failed";
                  return <Row key={task.id} task={task} meta={[failed ? stateLabel("failed") : "", (!failed && ev?.label) || (r?.summary.split("\n")[0] ?? "")].filter(Boolean).join(" · ")} />;
                })}
              </section>
            )}
            <RoutineShelf />
          </>
        )}
      </main>
    </>
  );
}

// ---------- an opened task ----------

/** A face that only shows a state holds still; the partner's own presence breathes. */
const stillFace = (a: Attention) => a === "dropped" || a === "superseded";

function reportLabel(r: Bodies["report"]) {
  const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[r.state as string] ?? "task.report";
  return t(k, A.S.personaName);
}

/** A quiet disclosure at the bottom: who is doing it, where (repo and branch), saved progress,
 *  what went out. A row with nothing to say is left out. */
/** Who does a task and why, as one sentence for Details (D89). */
function whoSentence(task: Task): string {
  const who = whoLine(task)[0];
  if (!who) return "";
  const w = whoOf(task)?.why;
  if (w?.kind === "rule" && w.text) return t("who.sentence.rule", who, w.text);
  if (w?.kind === "limit" && w.ruleId) return t("who.sentence.limit.rule", who, harnessName(w.from ?? ""));
  if (w?.kind === "limit" && w.from) return t("who.sentence.limit", who, harnessName(w.from));
  if (w?.kind === "you") return t("who.sentence.you", who);
  if (w?.kind === "default") return t("who.sentence.default", who, A.S.personaName);
  return t("who.sentence", who);
}

/** Who does a task, in words ("Codex · gpt-5"), and why when it isn't Ducter's plain pick (D89). */
function whoLine(task: Task): [string, string] {
  const m = modelOf(task);
  const who = [harnessName(harnessOf(task)), m && modelName(m)].filter(Boolean).join(" · ");
  const w = whoOf(task)?.why;
  if (!w) return [who, ""];
  if (w.kind === "rule" && w.text) return [who, t("who.why.rule", w.text)];
  if (w.kind === "limit") return [who, w.ruleId ? t("who.why.limit.rule", harnessName(w.from ?? "")) : w.from ? t("who.why.limit", harnessName(w.from)) : ""];
  if (w.kind === "you") return [who, t("who.why.you")];
  return [who, ""];
}

const pct = (f: number) => Math.round(f * 100);
const candName = (c: Candidate) => [harnessName(c.harness), c.model && modelName(c.model)].filter(Boolean).join(" · ");

function candReason(c: Candidate): string {
  if (c.blocked === "reserve") return [t("cand.reserve", A.S.personaName), c.resetsAt && t("cand.resets", when(A.L, c.resetsAt))].filter(Boolean).join(" · ");
  if (c.blocked) return t(`cand.${c.blocked}`);
  const why = { rule: t("cand.rule"), fit: t("cand.fit"), fast: t("cand.fast") }[c.reason.kind as string] ?? "";
  return [why, c.left != null && t("cand.left", pct(c.left)), c.billing === "usage" && t("cand.paid")].filter(Boolean).join(" · ");
}

/** 换谁来做 / Switch who does it: who does it now, who else could with why and the limit each,
 *  the ones that can't greyed with why, and 换到 X 接着做 / Continue on X. */
function SwitchList({ task }: { task: Task }) {
  const [pick, setPick] = useState("");
  const list = A.candidates.get(task.id);
  const running = ["working", "queued"].includes(attention(task));
  if (!list) return <div class="small sub">{t("who.loading")}</div>;
  const chosen = list.find((c) => !c.blocked && !c.current && `${c.harness}/${c.model ?? ""}` === pick);
  const free = list.filter((c) => !c.blocked && !c.current).length;
  return (
    <div class="switch-list" role="radiogroup" aria-label={t("who.switch")}>
      <div class="small sub">{t(running ? "who.switch.note" : "who.switch.note.idle")}</div>
      {list.map((c) => {
        const key = `${c.harness}/${c.model ?? ""}`;
        const off = !!c.blocked;
        return (
          <button key={key} role="radio" aria-checked={pick === key} disabled={off || c.current} class={`cand${off ? " off" : ""}${pick === key ? " on" : ""}`} onClick={() => setPick(key)}>
            <img src={`app/art/${c.harness === "claude-code" ? "token_orange" : "token_ink"}.webp`} alt="" width="36" height="36" />
            <span class="grow">
              <b>{candName(c)}</b>
              <small>{candReason(c)}</small>
            </span>
            {c.current && <small class="now">{t("who.now")}</small>}
          </button>
        );
      })}
      {free === 0 && <div class="small sub">{t("cand.none")}</div>}
      {chosen &&
        (A.switching ? (
          <div class="small sub">{t("who.go", candName(chosen))}…</div>
        ) : (
          <Btn kind="primary" label={t("who.go", candName(chosen))} about={title(task)} onClick={() => A.switchTask(task.id, chosen.harness, chosen.model, candName(chosen))} />
        ))}
    </div>
  );
}

/** The folder a task works in, as a path: on hover only, never spelled out (D127). */
function placePath(task: Task): string {
  const p = placeOf(task) as { repoPath?: string; path?: string };
  return p.repoPath || p.path || "";
}

function TaskDetails({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const who = whoSentence(task);
  const why = bodyReasonOf(task);
  const canSwitch = !!harnessOf(task) && !["dropped", "superseded"].includes(attention(task));
  const where = placeLine(A.L, placeOf(task));
  const acts = task.historyLoaded ? outsideActs(task) : [];
  const cps = task.events.filter((ev) => ev.kind === "checkpoint");
  return (
    <section class="details-box">
      <button class={`fold-line${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("task.details")} <span class="chev">›</span>
      </button>
      {open && (
        <dl class="kv">
          {who && (
            <>
              <dt>{t("task.dossier.body")}</dt>
              <dd>
                {who}
                {why && <div>{why}</div>}
                {canSwitch && (
                  <button class="inline-link" aria-expanded={A.switchFor === task.id} onClick={() => A.openSwitch(task.id)}>
                    {t("who.switch")} ›
                  </button>
                )}
              </dd>
            </>
          )}
          {where && (
            <>
              <dt>{t("task.dossier.where")}</dt>
              <dd title={placePath(task) || undefined}>{where}</dd>
            </>
          )}
          {cps.length > 0 && (
            <>
              <dt>{t("task.dossier.checkpoints")}</dt>
              <dd>
                {cps.map((ev) => (
                  <div key={ev.seq}>{(ev.body as Bodies["checkpoint"]).text}</div>
                ))}
              </dd>
            </>
          )}
          {acts.length > 0 && (
            <>
              <dt>{t("outside.title")}</dt>
              <dd>
                {acts.map((x) => (
                  <code key={x.seq}>{x.command}</code>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}
      {open && A.switchFor === task.id && <SwitchList task={task} />}
    </section>
  );
}

/** An opened task: one column, read top to bottom (D74). Where it stands in words; a pending
 *  ask; the outcome said once with how it knows and what to do next; what it did; Details.
 *  The phone shows no diffs: the changes are named in the proof line. */
export function TaskView({ id }: { id: string }) {
  const task = A.S.tasks.get(id);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => A.history(id), [id, A.S.welcomed]);
  if (!task)
    return (
      <>
        <Top back={t("nav.back")} />
        <main class="scroll">
          <div class="small">{t("task.loading")}</div>
        </main>
      </>
    );
  const a = attention(task);
  const d = A.S.pendingDecision(id);
  const r = reportOf(task);
  // Where it stands: what it said or saved since its latest report when it has moved on (D127).
  const detail = !finished(task) ? (a === "working" && saidSince(task)) || (r ? r.summary.split("\n")[0]! : "") : "";
  const [headline, lede] = finished(task) && r ? splitOutcome(r.summary) : ["", ""];
  return (
    <>
      <Top back={t("nav.back")} face={false} />
      <main class="scroll task-page" ref={scroller}>
        <div class="task-head">
          <span class="face">
            <Avatar size={96} state={faceOf(a)} still={stillFace(a)} />
            {a === "blocked" && A.S.waiterFor(id) && <WaitBubble w={A.S.waiterFor(id)} size="lg" />}
          </span>
          <div class="head-words">
            <div class={`standing st-${a}`}>
              <StateMark a={a} />
              <b>{stateLabel(a)}</b>
              {task.openedAt && <span class="when">· {t("task.opened", ago(A.L, task.openedAt))}</span>}
            </div>
            <h1 title={title(task)}>{shortTitle(title(task)) || t("task.unknown")}</h1>
            {a === "blocked" && A.S.waiterFor(id) && (
              <p class="waitline">{waitLine(A.S.waiterFor(id)!.reason)}</p>
            )}
          </div>
          {headline && <p class="headline">{headline}</p>}
        </div>
        {detail && <div class="outcome"><div class="said">{detail}</div></div>}
        {d && !d.resolved && <DecisionCard d={d} taskId={id} inTask />}
        {finished(task) && (
          <div class="outcome">
            {lede && <div class="said">{lede}</div>}
            <ProofLine task={task} evs={resultEvidence(task)} />
            <SentLine task={task} />
            {a === "failed" ? (
              // Didn't work (D76): try the same again, or tell it how; that opens its composer.
              <div class="btns">
                <Btn kind="secondary" label={t("task.action.retry")} onClick={() => A.taskAction(id, "reopen")} />
                <Btn kind="primary" label={t("task.action.tell")} onClick={() => document.getElementById("composer")?.focus()} />
              </div>
            ) : (
              <ResultActions task={task} inTask />
            )}
          </div>
        )}
        {!finished(task) && (
          <div class="btns">
            {(a === "working" || a === "queued") && <Btn kind="text" label={t("task.action.pause")} onClick={() => A.taskAction(id, "interrupt")} />}
            {!["dropped", "superseded", "done"].includes(a) && <Btn kind="text" label={t("task.action.drop")} onClick={() => A.drop(id)} />}
          </div>
        )}
        <WaitDetails task={task} />
        <TryStrip task={task} />
        <section class="section">
          <h2 class="sec-title">{t("task.transcript")}</h2>
          <WhatItDid task={task} />
        </section>
        <TaskDetails task={task} />
      </main>
      <TaskBar task={task} stateLabel={stateLabel(a)} opened={task.openedAt ? t("task.opened", ago(A.L, task.openedAt)) : ""} />
      <Composer taskId={id} />
    </>
  );
}

// ---------- sheets ----------

function Sheet({ children, label }: { children: preact.ComponentChildren; label: string }) {
  const close = () => ((A.sheet = null), A.changed());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div class="grab" />
        {children}
        <Btn kind="secondary" class="sheet-close" label={t("sheet.close")} onClick={close} />
      </div>
    </>
  );
}

function DecisionSheet({ id }: { id: string }) {
  const d = A.S.decisions.get(id);
  const answered = !!(d?.resolved || d?.pending);
  useEffect(() => {
    // Decided with one thumb: let the card settle, then get out of the way.
    if (!answered) return;
    const h = setTimeout(() => ((A.sheet = null), A.changed()), 1400);
    return () => clearTimeout(h);
  }, [answered]);
  if (!d) return <Sheet label={t("state.needs_you")}>{<div class="small">{t("conn.connecting")}</div>}</Sheet>;
  const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  return (
    <Sheet label={t("state.needs_you")}>
      <DecisionCard d={d} taskId={d.taskId} />
    </Sheet>
  );
}

// A segmented choice: flat, the chosen one on the surface with an ink hairline (no ledge, no pill).
function Seg<V extends string | number>(p: { label: string; value: V | undefined; options: { v: V; label: string }[]; onPick: (v: V) => void }) {
  return (
    <div class="seg" role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === p.value} class={o.v === p.value ? "on" : ""} onClick={() => o.v !== p.value && p.onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch">
      <span>{p.label}</span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function NameRow() {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const save = () => {
    const n = draft.trim();
    if (n && n !== A.S.personaName) A.setSettings({ name: n });
    setEditing(false);
  };
  return (
    <div class="partner-head">
      <Avatar size={64} />
      {editing ? (
        <>
          <input
            class="name-input"
            value={draft}
            maxLength={24}
            aria-label={t("partner.rename")}
            autoFocus
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) save();
              if (e.key === "Escape") e.stopPropagation(), setEditing(false);
            }}
          />
          <Btn kind="text" label={t("partner.rename.cancel")} onClick={() => setEditing(false)} />
          <Btn kind="primary" label={t("partner.rename")} onClick={save} />
        </>
      ) : (
        <>
          <h2 class="grow">{A.S.personaName}</h2>
          {A.settings && <Btn kind="text" label={t("partner.rename")} onClick={() => (setDraft(A.S.personaName), setEditing(true))} />}
        </>
      )}
    </div>
  );
}

function PartnerSettings() {
  const s = A.settings;
  const mem = A.mem;
  if (!s) return <div class="small">{t("conn.connecting")}</div>;
  const quiet = s.quiet;
  const setQuiet = (start: string, end: string) => A.setSettings({ quiet: { start, end, tz: quiet?.tz ?? tz() } });
  return (
    <>
      <section class="set">
        <h3>{t("partner.talk.title")}</h3>
        <Seg
          label={t("partner.talk.title")}
          value={s.language}
          options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`partner.talk.${v}`) }))}
          onPick={(language) => A.setSettings({ language })}
        />
        <div class="small sub">{s.language === "auto" ? t("partner.talk.auto.note") : t("partner.talk.fixed.note", t(`partner.talk.${s.language}`))}</div>
      </section>
      <section class="set">
        <h3>{t("partner.notify.title")}</h3>
        <Toggle label={t("partner.notify.on")} checked={s.notify} onChange={(notify) => A.setSettings({ notify })} />
        <div class="small sub">{t(s.notify ? "partner.notify.on.note" : "partner.notify.off.note")}</div>
        <Toggle label={t("partner.quiet")} checked={!!quiet} onChange={(on) => A.setSettings({ quiet: on ? { start: "23:00", end: "08:00", tz: tz() } : null })} />
        {quiet && (
          <div class="quiet-range">
            <input type="time" aria-label={t("partner.quiet")} value={quiet.start} onChange={(e) => setQuiet((e.target as HTMLInputElement).value || quiet.start, quiet.end)} />
            <span>{t("partner.quiet.to")}</span>
            <input type="time" aria-label={`${t("partner.quiet")} ${t("partner.quiet.to")}`} value={quiet.end} onChange={(e) => setQuiet(quiet.start, (e.target as HTMLInputElement).value || quiet.end)} />
          </div>
        )}
        {quiet && <div class="small sub">{t("partner.quiet.note")}</div>}
      </section>
      <section class="set">
        <h3>{t("partner.default.title")}</h3>
        <div class="small sub">{t("partner.default.line")}</div>
        <Seg
          label={t("partner.default.line")}
          value={s.defaultAfterMin}
          options={[10, 30, 60, 120].map((v) => ({ v, label: v < 60 ? t("partner.default.min", v) : t("partner.default.hour", v / 60) }))}
          onPick={(defaultAfterMin) => A.setSettings({ defaultAfterMin })}
        />
        <div class="small sub">{t("partner.default.note")}</div>
      </section>
      <section class="set">
        <h3>{t("partner.memory.title")}</h3>
        {mem && <div class="small sub">{t(`partner.memory.${mem.state}`)}</div>}
        {mem?.state === "missing" && (
          <a class="more" href="https://mem.nowledge.co" target="_blank" rel="noopener">
            {t("partner.memory.connect")}
          </a>
        )}
        <Toggle label={t("partner.memory.switch")} checked={s.memory} onChange={(memory) => A.setSettings({ memory })} />
        {s.memory && !!mem?.noted.length && (
          <div class="noted" aria-label={t("partner.memory.recent")}>
            {mem.noted.map((n) => (
              <div class="noted-row" key={n.seq}>
                <span>{n.title}</span>
                <Btn kind="text" label={t("partner.memory.forget")} about={n.title} onClick={() => A.forget(n.seq)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function agentLine(h: DeviceHarness, brain: boolean): string {
  if (!h.installed) return t("loadout.missing");
  if (h.harness === "pi" && !h.loggedIn) return t("loadout.pi");
  if (!h.loggedIn) return t("loadout.signed_out");
  const al = h.allowance;
  if (!al) return t("loadout.signed_in");
  const left = brain && al.left <= PARTNER_RESERVE ? t("loadout.left.reserve", pct(al.left), A.S.personaName) : t("loadout.left", pct(al.left));
  return [left, al.sharedBy && al.sharedBy > 1 ? t("loadout.acct.shared", al.sharedBy) : t("loadout.acct.only"), al.resetsAt && t("loadout.acct.resets", when(A.L, al.resetsAt))].filter(Boolean).join(" · ");
}

const MODELS: Record<string, { id: string; label: string }[]> = { "claude-code": [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] };
const isFast = (id: string) => /sonnet|haiku|mini|luna|flash/i.test(id);

/** What it thinks with, and who does the tasks (D89), as lists: no stage on the phone. */
function Loadout() {
  const s = A.settings;
  const agents = A.agents ?? [];
  if (!s) return null;
  const brain = s.brain ?? { harness: "claude-code", model: "opus" };
  const b = agents.find((h) => h.harness === brain.harness);
  const models = b?.models?.length ? b.models : (MODELS[brain.harness] ?? []);
  const brains = agents.filter((h) => h.canBePartner);
  const ready = agents.filter((h) => h.installed && h.loggedIn);
  const name = A.S.personaName;
  const setBrain = (harness: string, model?: string) => {
    const h = agents.find((x) => x.harness === harness);
    const m = model ?? (h?.models?.[0]?.id || MODELS[harness]?.[0]?.id);
    A.setSettings({ brain: { harness: harness as never, ...(m ? { model: m } : {}) } });
    A.toast(t("loadout.toast.brain", name, harnessName(harness)));
  };
  const reserve = b?.allowance ? (b.allowance.left <= PARTNER_RESERVE ? t("loadout.left.reserve", pct(b.allowance.left), name) : `${t("loadout.left", pct(b.allowance.left))} · ${t("loadout.brain.reserve", name)}`) : t("loadout.brain.reserve", name);
  return (
    <>
      <section class="set">
        <h3>{t("loadout.brain.title")}</h3>
        <div class="agent">
          <img src={`app/art/${brain.harness === "claude-code" ? "token_orange" : "token_ink"}.webp`} alt="" width="40" height="40" />
          <span class="grow">
            <b>{harnessName(brain.harness)}</b>
            <small>{reserve}</small>
          </span>
        </div>
        {brains.length > 1 && (
          <Seg label={t("loadout.socket")} value={brain.harness} options={brains.map((h) => ({ v: h.harness, label: harnessName(h.harness) }))} onPick={(v) => setBrain(v)} />
        )}
        {models.length > 0 && (
          <Seg
            label={t("loadout.brain.model")}
            value={brain.model}
            options={models.map((m, i) => ({ v: m.id, label: `${m.label || m.id} · ${t(i > 0 || isFast(m.id) ? "loadout.model.fast" : "loadout.model.smart")}` }))}
            onPick={(m) => setBrain(brain.harness, m)}
          />
        )}
        <div class="small sub">{t("loadout.brain.keep")}</div>
      </section>
      <section class="set">
        <h3>{t("loadout.tasks.title")}</h3>
        {ready.length <= 1 && !(A.rules ?? []).length ? (
          <div class="small sub">{t("loadout.tasks.one", harnessName(ready[0]?.harness ?? brain.harness), name)}</div>
        ) : (
          <>
            <div class="small sub">{t("loadout.tasks.default", name)}</div>
            {agents.map((h) => {
              const on = (s.taskAccounts as Record<string, { enabled: boolean }> | undefined)?.[h.harness]?.enabled !== false;
              const isBrain = h.harness === brain.harness;
              return (
                <div class="agent" key={h.harness}>
                  <img class={h.installed && h.loggedIn ? "" : "dim"} src={`app/art/${h.harness === "claude-code" ? "token_orange" : "token_ink"}.webp`} alt="" width="40" height="40" />
                  <span class="grow">
                    <b>{harnessName(h.harness)}</b>
                    <small>{agentLine(h, isBrain)}</small>
                    {h.loggedIn && h.billing === "usage" && <small class="paid">{t("loadout.acct.paid")}</small>}
                  </span>
                  {h.installed && h.loggedIn && (
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`${t("loadout.acct.tasks")} · ${harnessName(h.harness)}`}
                      checked={on}
                      onChange={(e) => A.setSettings({ taskAccounts: { ...s.taskAccounts, [h.harness]: { enabled: (e.target as HTMLInputElement).checked } } })}
                    />
                  )}
                </div>
              );
            })}
            {b && <div class="small sub">{t("loadout.acct.same", name, name)}</div>}
            <h3>{t("loadout.rules")}</h3>
            {!(A.rules ?? []).length && <div class="small sub">{t("loadout.rules.none")}</div>}
            {(A.rules ?? []).map((r) => (
              <div class="noted-row" key={r.id}>
                <span>{r.text}</span>
                <Btn kind="text" label={t("loadout.rule.remove")} about={r.text} onClick={() => (A.send({ t: "rule_remove", id: r.id }), A.toast(t("loadout.rule.removed", r.text)))} />
              </div>
            ))}
            <Btn kind="text" label={t("loadout.rule.add", name)} onClick={() => A.tellRule()} />
          </>
        )}
      </section>
    </>
  );
}

/** A small clay mailbox (the prototype's look, design/connectors.md §9): no flag, the lid shows the source. */
function Mailbox(p: { source: "oomol" | "self" | "mcp" | "oo"; big?: boolean }) {
  const body = p.source === "oomol" || p.source === "oo" ? "var(--accent)" : p.source === "self" ? "var(--working-dot)" : "var(--ink-muted)";
  return (
    <svg class="mailbox" width={p.big ? 36 : 30} height={p.big ? 58 : 46} viewBox="0 0 52 84" aria-hidden="true">
      <ellipse cx="26" cy="80" rx="12" ry="3.5" fill="rgba(70,46,20,.25)" />
      <rect x="22" y="44" width="8" height="37" rx="3" fill="var(--line-2)" />
      <path d="M6 46 V26 a20 18 0 0 1 40 0 V46 Z" fill={body} />
      <path d="M6 46 h40" stroke="rgba(0,0,0,.22)" stroke-width="3" stroke-linecap="round" />
      <path d="M10 44 V28 a16 14 0 0 1 32 0 V44 Z" fill="var(--surface)" opacity=".92" />
      <rect x="15" y="27" width="22" height="15" rx="2.5" fill={body} />
      <path d="M15.5 28l10.5 8 10.5-8" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2" stroke-linejoin="round" />
      <path d="M12 12 q6 -5 14 -5" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round" fill="none" />
    </svg>
  );
}

const HOSTED_URL = "https://connector.oomol.com";

/** The one tap (D122): the user's oo is signed in. What Ducter will read, literally; where mail passes; one button. */
function OoOffer(p: { oo: OoDetect }) {
  const apps = p.oo.apps;
  return (
    <div class="acct-offer">
      <div class="acct-offer-head">
        <Mailbox source="oo" big />
        <div class="grow">
          <div class="acct-name">{t("acct.oo.title")}</div>
          <div class="small sub">{t("acct.oo.lede")}</div>
        </div>
      </div>
      {!apps ? (
        <div class="small sub">{t("acct.oo.loading")}</div>
      ) : !apps.length ? (
        <div class="small sub">{t("acct.oo.empty")}</div>
      ) : (
        <ul class="acct-offer-apps">
          {apps.map((a) => (
            <li key={a.service}>
              <b>{a.title}</b>
              <span>{a.accounts.join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="small sub">{t("acct.oo.where")}</div>
      {!!apps?.length && (
        <div>
          <Btn kind="primary" label={A.connecting ? t("acct.oo.using") : t("acct.oo.use")} disabled={A.connecting} onClick={() => A.useOoConnection()} />
        </div>
      )}
    </div>
  );
}

/** 它能看的账号 / Accounts it can read (D96): the user's OpenConnector, hosted or self-hosted, or another MCP server. */
function Accounts() {
  const [adding, setAdding] = useState(false);
  const [where, setWhere] = useState<"oomol" | "self" | "mcp">("oomol");
  const [url, setUrl] = useState(HOSTED_URL);
  const [token, setToken] = useState("");
  const [how, setHow] = useState(false); // How to connect: the setup steps behind a fold
  useEffect(() => {
    if (!A.connections) A.askConnections();
  }, []);
  useEffect(() => {
    // A connection arrived: close the form and drop the typed token.
    if (adding && !A.connecting && A.connections?.some((c) => c.url.startsWith(url.replace(/\/+$/, "")))) setAdding(false), setToken("");
  }, [A.connections?.length]);
  const list = A.connections;
  const oo = A.oo;
  // D122: oo signed in makes the one tap the default; the address-and-key form steps back.
  const usedOo = !!list?.some((c) => c.via === "oo");
  const offer = !!oo?.account && !usedOo;
  const pick = (w: "oomol" | "self" | "mcp") => {
    setWhere(w);
    setUrl(w === "oomol" ? HOSTED_URL : w === "self" ? "http://localhost:3000" : "");
  };
  return (
    <section class="set accounts">
      <h3>{t("acct.title")}</h3>
      <div class="small sub">{t("acct.lede")}</div>
      {list && !list.length && !offer && <div class="small sub">{t("acct.none")}</div>}
      {list?.map((c) => (
        <div class="acct-row" key={c.id}>
          <Mailbox source={c.source} />
          <div class="grow">
            <div class="acct-name">{c.source === "oo" ? t("acct.oo.name") : c.name}</div>
            {!!c.apps?.length && <div class="small acct-apps">{c.apps.map((a) => (a.accounts.length > 1 ? `${a.title} (${a.accounts.length})` : a.title)).join(" · ")}</div>}
            <div class="small sub">{t(`acct.src.${c.source}`)}</div>
            {(c.state === "unreachable" || c.state === "unauthorized") && <div class="small warn">{t(`acct.state.${c.state}`)}</div>}
          </div>
          <Btn kind="text" label={t("acct.remove")} about={c.name} onClick={() => A.removeConnection(c.id)} />
        </div>
      ))}
      {offer && <OoOffer oo={oo!} />}
      {!offer && oo?.selfHosted && !usedOo && (
        <div class="acct-oo">
          <Btn kind="secondary" label={t("acct.oo")} disabled={A.connecting} onClick={() => A.useOoConnection()} />
          <div class="small sub">{t("acct.oo.note", oo.selfHosted.url)}</div>
        </div>
      )}
      {!adding ? (
        offer ? (
          <button class="qlink" onClick={() => setAdding(true)}>
            {t("acct.manual")} ›
          </button>
        ) : (
          <Btn kind="secondary" label={t("acct.add")} onClick={() => setAdding(true)} />
        )
      ) : (
        <div class="acct-form">
          <Seg label={t("acct.where")} value={where} options={(["oomol", "self", "mcp"] as const).map((v) => ({ v, label: t(`acct.where.${v}`) }))} onPick={pick} />
          <div class="small sub">{t(`acct.where.${where}.note`)}</div>
          <label class="acct-field">
            <span class="small">{t("acct.address")}</span>
            <input id="acct-url" type="url" inputMode="url" autoComplete="off" spellcheck={false} value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          </label>
          <label class="acct-field">
            <span class="small">{t("acct.key")}</span>
            <input id="acct-token" type="password" autoComplete="off" spellcheck={false} value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
          </label>
          <button class="qlink" aria-expanded={how} onClick={() => setHow(!how)}>
            {t(how ? "acct.how.hide" : "acct.how")} ›
          </button>
          {how && <div class="small sub steps">{t(`acct.how.${where}`)}</div>}
          <div class="row">
            <Btn kind="text" label={t("acct.cancel")} onClick={() => (setAdding(false), setToken(""))} />
            <Btn kind="primary" label={A.connecting ? t("acct.checking") : t("acct.check")} disabled={A.connecting || !url.trim()} onClick={() => A.addConnection(url.trim(), token.trim())} />
          </div>
        </div>
      )}
      <div class="small sub">{t("acct.honest")}</div>
    </section>
  );
}

function PhoneSettings() {
  const [push, setPush] = useState<{ done: boolean } | null>(null);
  useEffect(() => {
    void A.api.call<{ done: boolean }>("api/push/settings").then((r) => r.data && setPush(r.data));
  }, [A.push]);
  return (
    <section class="set">
      <h3>{t("settings.phone")}</h3>
      <div class="small">{A.me?.via === "device" ? `${A.me.deviceName ?? ""}` : deviceLabel(A.L, "local")}</div>
      <div class="small sub">{t("settings.lang.title")}</div>
      <Seg label={t("settings.lang.title")} value={A.uiLang} options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`settings.lang.${v}`) }))} onPick={(v) => A.setUiLang(v)} />
      <div class="small sub">{t("settings.details.title")}</div>
      <Seg label={t("settings.details.title")} value={A.details} options={(["folded", "shown"] as const).map((v) => ({ v, label: t(`settings.details.${v}`) }))} onPick={(v) => A.setDetails(v)} />
      {A.settings?.notify !== false && (
        <>
          {A.push === "ios-install" && <div class="hint">{t("notify.ios")}</div>}
          {A.push === "unsupported" && <div class="hint">{t(inApp() ? "notify.app.unavailable" : "notify.unsupported")}</div>}
          {inApp() && A.push === "off" && !A.me?.push.apns && <div class="hint">{t("notify.app.nokey")}</div>}
          {A.push === "denied" && <div class="hint">{t("notify.denied")}</div>}
          {A.push === "off" && A.me?.push.publicKey && (!inApp() || A.me.push.apns) && (
            <Btn
              kind="primary"
              label={t("notify.on")}
              onClick={async () => {
                A.push = await turnOnPush();
                A.changed();
              }}
            />
          )}
          {A.push === "on" && (
            <>
              <div class="small">{t("notify.enabled")}</div>
              <Toggle
                label={t("notify.done")}
                checked={push?.done ?? false}
                onChange={async (done) => {
                  const r = await A.api.call<{ done: boolean }>("api/push/settings", { method: "POST", body: { done } });
                  if (r.data) setPush(r.data);
                }}
              />
              <div class="btns">
                <Btn
                  kind="text"
                  label={t("notify.off")}
                  onClick={async () => {
                    A.push = await disablePush(A.api);
                    A.changed();
                  }}
                />
                <Btn
                  kind="secondary"
                  label={t("notify.test")}
                  onClick={async () => {
                    const r = await A.api.call("api/push/test", { method: "POST" });
                    A.toast(r.status === 200 ? t("notify.test.sent") : t("result.action.failed", String(r.status)));
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function SettingsSheet() {
  useEffect(() => {
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  return (
    <Sheet label={t("settings.title")}>
      <NameRow />
      <Loadout />
      <PartnerSettings />
      <Accounts />
      <PhoneSettings />
    </Sheet>
  );
}

export function Sheets() {
  if (!A.sheet) return null;
  return A.sheet.kind === "decision" ? <DecisionSheet id={A.sheet.id} /> : <SettingsSheet />;
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {A.toasts.map((x) => (
        <div class="toast" key={x.id}>
          <span>{x.text}</span>
          {x.action && (
            <button
              onClick={() => {
                x.action!.run();
                A.toasts = A.toasts.filter((y) => y.id !== x.id);
                A.changed();
              }}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
