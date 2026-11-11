// The phone's screens: the conversation (default), 手头的事 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import type { AgentUpdate, Attention, Bodies, Candidate, DeviceHarness, DeviceUpdate, DeviceView, EvidenceRef, FolderChange, FolderSummary, LivingItem, OoDetect, Reach } from "@ducter/protocol";
import { Fragment } from "preact";
import { PARTNER_RESERVE } from "@ducter/protocol/src/loadout.ts";
import { inTongue, proofLabel, sayable } from "@ducter/protocol/src/say.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A, candKey, effortWord, placeKey, type SettingsPage } from "./app.ts";
import { TRY_LIVE } from "@ducter/protocol";
import { closingWords, computerApart, computerName, computerOf, computers, computerState, deviceWait, manyComputers, whereAsk, whereCandReason } from "./where.ts";
import { ago, behind, cjkPad, deviceLabel, duration, firstClause, harnessName, modelName, phaseLine as phaseWords, placeLine, sameWords, splitOutcome, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { Coin } from "./coin.tsx";
import { EyeShut, liveSize } from "./live.tsx";
import { Btn, Chev, Seg, Toggle } from "./controls.tsx";
import { deviceArt, DevicesSection } from "./devcard.tsx";
import { ProactiveChips, SourceCards } from "./accounts.tsx";
import { CallDecision, CallRow, PhoneCard, PhoneOffer } from "./phone.tsx";
import { callEnded } from "@ducter/protocol";
import { FindsNote } from "./finds.tsx";
import { AddPictures, DropHint, MediaBlock, Tray, useDropPaste, Viewer } from "./media.tsx";
import { NewTaskSheet } from "./newtask.tsx";
import { BenchToggle } from "./workbench.tsx";
import { appPush, disablePush, enablePush } from "./push-client.ts";
import { inApp, unsupportedKey } from "./native.ts";
import { useWide } from "./wide.ts";
import { AutofillSettings, FillBody, fillTitle, PayBody } from "./autofill.tsx";
import { FillButton, forecast, FullTop } from "./board.tsx";
import { Goal, Groove, RoutineFacts, RoutineShelf, TryStrip, untilLine, WaitBubble, waitCaption, WaitDetails, waitLine } from "./work.tsx";
import { safe, saidSince, shortGo, shortTitle, taskBlocks, TaskFoot, TaskMeta, TimerPie, WhatItDid } from "./transcript.tsx";
import {
  attention,
  bodyReasonOf,
  browsing,
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
  effortOf,
  outsideActs,
  placeOf,
  canIntegrate,
  countsChanges,
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
// A touch screen with no pointer beside it: an iPad with a trackpad and keyboard is not coarse.
export const coarse = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;

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
export function faceOf(a: Attention): Face {
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

/** A drawn ✓ (D73: marks are drawn glyphs, never a font's symbol). */
export const Check = () => (
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

// A finished task reads "Done": done_claimed means Ducter couldn't check its evidence and the
// partner hasn't confirmed it yet, usually for seconds (desktop: stateLabel).
export const stateLabel = (a: Attention) => t(`state.${a === "done_claimed" ? "done" : a}`);


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
        // ⌘⏎ sends everywhere, a keyboard on a phone or tablet included (D210).
        if (e.key === "Enter" && !e.isComposing && p.onEnter && (e.metaKey || e.ctrlKey || (!e.shiftKey && !coarse()))) {
          e.preventDefault();
          p.onEnter();
        }
      }}
    />
  );
}

// ---------- decisions ----------

function defaultInfo(d: DecisionState, now: number): { line: string; frac?: number } {
  if (d.asker) return { line: t("peer.default") }; // silence never answers for the user (D164)
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
  if (d.where) return whereAsk(d.where).go;
  if (d.asker) return d.goLabel; // X1: the asking agent's own option, as it named it
  if (d.closing) return closingWords(d.closing).go;
  if (d.memPlugin) return t("memp.card.go");
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
  if (opt === "hold") return d.where ? t("where.ask.waited", d.where.device) : t("decision.resolved.hold");
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
  if (d.signIn) return <SignInBody d={d} />;
  // D191: a payment names merchant, amount and card and asks for the security code; a first use asks OK.
  if (d.pay) return <PayBody d={d} />;
  if (d.fill) return <FillBody d={d} />;
  if (d.call) return <CallDecision d={d} />;
  // D157: wait for a computer (the default) or do it now on another; built in the user's words.
  const wa = d.where ? whereAsk(d.where) : undefined;
  return (
    <>
      <div class="q">{wa?.question ?? (d.closing ? closingWords(d.closing).question : d.memPlugin ? t("memp.card.question", harnessName(d.memPlugin.harness), d.memPlugin.deviceName) : d.question)}</div>
      {d.routineId && <RoutineFacts routineId={d.routineId} />}
      {open && wa && wa.lines.map((l, i) => <div key={i} class={`dl${l.widen ? " widen" : ""}`}>{l.text}</div>)}
      {open && !wa && (d.asker ? <div class="dl">{t("peer.default")}</div> : <DefaultRow d={d} />)}
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
            {d.asker?.other ? (
              // X1: its second option, answered in its own words (a reply), never Hold.
              <Btn kind="secondary" label={d.asker.other} about={about} onClick={() => A.decide(d.decisionId, "reply", d.asker!.other)} />
            ) : (
              <Btn kind="secondary" label={wa?.hold ?? (d.closing ? closingWords(d.closing).hold : d.memPlugin ? t("memp.card.hold") : d.trust ? t("peers.trust.hold") : t("decision.hold"))} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
            )}
            <Btn kind="primary" label={d.asker ? d.goLabel : goText} about={about} onClick={() => A.decide(d.decisionId, "go")} />
          </span>
          {d.asker?.suggests && <span class="sug">{t("peer.suggests", d.goLabel)}</span>}
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

/** D170 (X1): asked for one of the user's own agents: its coin, who it is and where it works stand
 *  where a task's title would; the coin bobs while it waits on the user. */
function PeerAsker({ d }: { d: DecisionState }) {
  return (
    <div class="asker peer">
      <span>
        {t("peer.asks", d.asker!.agent)}
        {d.asker!.where && <small> · {d.asker!.where}</small>}
      </span>
    </div>
  );
}

/** The coin of an agent Ducter didn't start, from its name; a plain coin when the kind is unknown. */
export function peerHarness(agent: string): string {
  return /claude/i.test(agent) ? "claude-code" : /codex/i.test(agent) ? "codex" : /\bpi\b/i.test(agent) ? "pi" : "peer";
}

/** One ask: the asking task's title as a quiet link (nothing for the partner's own asks, or
 *  inside its own task), the question, its default, and Go / Hold / Reply…. */
export function DecisionCard({ d, taskId, inTask }: { d: DecisionState; taskId?: string; inTask?: boolean }) {
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
      {d.asker && <PeerAsker d={d} />}
      {task && title(task) && !inTask && (
        // Who asks and about what (D127): the agent's coin and the task's short title, the way into it.
        <button class="asker" title={title(task)} onClick={() => ((A.sheet = null), A.go({ name: "task", id: task.id }))}>
          <span>{shortTitle(title(task))}</span>
          <Chev />
        </button>
      )}
      <DecisionBody d={d} taskId={taskId} />
    </div>
  );
}

// ---------- signing in (D151) ----------

/** 需要你登录一下 {site} / Sign in to {site}: what it is, who does it, and the way in. */
export function SignInBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const site = d.signIn!.site;
  const open = !d.resolved && !d.pending;
  return (
    <>
      {!compact && <div class="q">{t("signin.title", site)}</div>}
      <div class="signin-why">
        <EyeShut />
        <span>{t("signin.why")}</span>
      </div>
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("signin.later")} about={site} onClick={() => A.decide(d.decisionId, "hold")} />
          {compact && <span class="grow" />}
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t("signin.open")} about={site} onClick={() => A.openLive(d.decisionId, site, liveSize())} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {!compact && (
            <span class="tick">
              <Check />
            </span>
          )}
          {d.resolved?.option === "hold" ? t("signin.resolved.hold") : t("signin.resolved")}
        </div>
      )}
    </>
  );
}


// ---------- tasks in the conversation ----------

/** A task in the partner's words: its drawn mark, its title as a link, its status in muted
 *  words. No fill, no capsule (D73). */
function TaskLine({ task, detail }: { task: Task; detail?: string }) {
  const a = attention(task);
  const br = browsing(task);
  if (br) detail = browsingLine(br);
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
      <span class="s">
        · {d}
        <Chev />
      </span>
    </button>
  );
}

/** Where its browser is looking: Ducter's own, or the user's Chrome (D126). */
const browsingLine = (br: { host: string; own?: boolean }) => t(br.own ? "browser.looking.own" : "browser.looking", br.host);

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
  if (counted && inTongue(counted.label, A.L.lang)) return counted.label;
  // D154: a count in the task's language, said in the reader's.
  const k = counted ? Number(/(\d+)\s*(files?\b|个文件)/i.exec(counted.label)![1]) : 0;
  if (k) return k === 1 ? t("result.files.one") : t("result.files", k);
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
  const changes = changed.length && countsChanges(task) ? changesLabel(task, changed) : "";
  if (!rest.length && !changes && !withTitle) return null;
  return (
    <div class="proof">
      {rest.slice(0, max).map((ev, i) =>
        /^https?:/.test(ev.ref) ? (
          <button key={i} class="qlink" onClick={() => openEvidence(ev, task)}>
            {proofLabel(ev, A.L.lang)}
            <Chev />
          </button>
        ) : (
          <span key={i} class="mk" title={ev.ref}>
            {/* A reproduction failed on purpose: a quiet ×, never a ✓ (the run after it carries the ✓). */}
            {failed ? <Cross /> : isRepro(ev) ? <span class="repro"><Cross /></span> : machineChecked(ev.kind) ? <span class="ok"><Check /></span> : null}
            {/* D154: the task's label when it is in the reader's language or a name, else neutral. */}
            {proofLabel(ev, A.L.lang)}
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
            {changes}
            <Chev />
          </button>
        ) : (
          <span class="mk">{changes}</span>
        ))}
      {withTitle && (
        <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
          {title(task) || t("task.unknown")}
          <Chev />
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
  // D154: the task's own sentence only when it is in the reader's language; else just what came
  // of it, by its title (the opened task keeps its words).
  const said = sayable(it.text, A.L.lang);
  const kind = it.kind === "failed" ? "living.failed" : "living.done";
  const text = said ? (it.title ? t(kind, it.title, said) : said) : t(`${kind}.short`, it.title || t("living.it"));
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
  // D151: a sign-in ask opens the live view instead of Go.
  // D193: a call's Go card or a question from the line: the whole card, in the conversation too.
  if (d.call)
    return (
      <div ref={ref} class={`partner askq call${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="decision">
          <CallDecision d={d} />
        </div>
      </div>
    );
  if (d.signIn)
    return (
      <div ref={ref} class={`partner askq signin${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="bubble">{d.said || t("signin.title", d.signIn.site)}</div>
        {(buttons || !open) && <SignInBody d={d} compact />}
      </div>
    );
  // D191: 付款 / Pay and a first use: the facts and the code on the card itself, never in prose.
  if (d.pay || d.fill)
    return (
      <div ref={ref} class={`partner askq pay${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="bubble">{d.said || (d.pay ? t("pay.title", d.pay.site) : fillTitle(d.fill!))}</div>
        {(buttons || !open) && (d.pay ? <PayBody d={d} compact /> : <FillBody d={d} compact />)}
      </div>
    );
  return (
    <div ref={ref} class={`partner askq${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
      {d.asker && <PeerAsker d={d} />}
      <div class="bubble">{d.said || d.question}</div>
      {/* A routine's proposal card (D29, D114): what it would do, before one Go. */}
      {d.routineId && open && <RoutineFacts routineId={d.routineId} />}
      {open ? (
        <>
          {/* One compact tray (D129): Reply… · Hold as quiet text, Go last, named by the action. */}
          {buttons && (
            <div class="tray">
              <Btn kind="text" size="sm" label={t("decision.reply")} about={about} onClick={() => (A.replyOpen.has(d.decisionId) ? A.replyOpen.delete(d.decisionId) : A.replyOpen.add(d.decisionId), A.changed())} />
              {d.asker?.other ? (
                // X1: its second option, answered in its own words (a reply), never Hold.
                <Btn kind="secondary" size="sm" label={d.asker.other} about={about} onClick={() => A.decide(d.decisionId, "reply", d.asker!.other)} />
              ) : (
                <Btn kind="text" size="sm" label={d.trust ? t("peers.trust.hold") : t("decision.hold")} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
              )}
              <span class="grow" />
              <Btn kind="primary" size="sm" label={goLabel(d)} about={about} onClick={() => A.decide(d.decisionId, "go")} />
            </div>
          )}
          <div class="dflt">
            <span>
              {d.asker?.suggests && <b class="sug">{t("peer.suggests", d.goLabel)}</b>}
              {defaultInfo(d, Date.now()).line}
            </span>
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
  if (e.user) {
    // D206: the pictures stand above the words, on their own, as in a messaging app.
    if (!e.user.media?.length) return <div class={`user${join ? " join" : ""}`}>{e.user.text}</div>;
    return (
      <div class={`user-m${join ? " join" : ""}`}>
        <MediaBlock media={e.user.media} side="user" ctx={{ kind: "conv" }} />
        {e.user.text && <div class="user">{e.user.text}</div>}
      </div>
    );
  }
  if (e.ai) {
    return (
      <div class={`partner${join ? " join" : ""}`}>
        <div class="bubble" dangerouslySetInnerHTML={{ __html: markdown(e.ai.text) }} />
        {/* D206: what a task showed, under the partner's words about it. */}
        {e.ai.media?.length ? <MediaBlock media={e.ai.media} side="partner" ctx={{ kind: "conv" }} /> : null}
        <Quiet k={`m${e.firstSeq}`} tasks={replyTasks(e, chipOwner)} noted={A.notedFor(e)} />
      </div>
    );
  }
  if (e.job) return <JobRow e={e} chipOwner={chipOwner} noted={A.notedFor(e)} join={join} />;
  if (e.living) return <Living e={e} items={livingItems(e)} chipOwner={chipOwner} />;
  if (e.finds) return <FindsNote n={e.finds} join={join} />;
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    if (!d) return null;
    return <Ask d={d} />;
  }
  if (e.peer) {
    // A question it asked shows once, as its card (which already says who asks).
    const asked = e.peer.direction === "in" && [...A.S.decisions.values()].some((d) => d.asker?.messageId === e.peer!.messageId);
    return asked ? null : <PeerLine b={e.peer} ts={e.ev.ts} />;
  }
  return null;
}

/** One quiet line about the user's other agents (D170, J-Q5): who, and what, never Bridge words. */
export function peerLineText(b: Bodies["bridge_msg"], ts: string, setAside?: number): string {
  const agent = b.agent ?? b.from ?? b.to ?? "";
  const who = b.mine ? (A.L.lang === "zh" ? `你的 ${agent}` : `your ${agent}`) : agent;
  if (b.direction === "in" && b.state === "set_aside") return t("peer.set_aside", b.mine ? who : agent, String(setAside ?? 1));
  if (b.direction === "in") {
    const gist = b.text.replace(/\s+/g, " ").trim();
    return t(b.mine ? "peer.in" : "peer.in.other", agent, gist.length > 40 ? gist.slice(0, 39) + "…" : gist);
  }
  void ts;
  return t(b.decisionId ? "peer.sent" : "peer.replied", who);
}

function PeerLine({ b, ts }: { b: Bodies["bridge_msg"]; ts: string }) {
  const n = b.state === "set_aside" ? A.S.setAside.get(`${b.from}|${ts.slice(0, 10)}`)?.n : undefined;
  return (
    <div class="peerline" role="status">
      <span>{peerLineText(b, ts, n)}</span>
    </div>
  );
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

const Plus = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

function Top({ back, face = true, plus, level, extra }: { back?: string; face?: boolean; plus?: boolean; level?: string; extra?: preact.ComponentChildren }) {
  // D176: side by side, the conversation's own header carries the face, and On hand is already
  // in view: its pane's header names it instead of going back to a conversation that is there.
  const wide = useWide();
  if (back || level)
    return (
      <header class="top">
        {wide && level ? (
          <h1 class="level">{level}</h1>
        ) : (
          // Side by side, an opened task goes back to On hand: the conversation never left.
          <button class="back" onClick={() => (wide ? A.go({ name: "onhand" }) : history.length > 1 && location.hash ? history.back() : A.go({ name: "conv" }))}>
            <Back />
            {wide ? t("nav.onhand") : back}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {plus && (
          // 开一件事 / New task (D128): a quiet ＋, never a floating button.
          <button class="plus" aria-label={t("newtask.button")} title={`${t("newtask.button")} (⌘N)`} onClick={() => A.openNewTask()}>
            <Plus />
          </button>
        )}
        {extra}
        {face && !wide && <Avatar size={40} />}
        {/* D184: wide, the level can take the whole screen; the same button brings it back. */}
        {wide && <FillButton level={level ? "onhand" : "task"} />}
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
      {!wide && <OnHandButton />}
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
  const where = taskId ?? "";
  const pics = A.picks.get(where) ?? [];
  const wrap = useRef<HTMLDivElement>(null);
  const over = useDropPaste(wrap, where);
  const value = taskId ? (A.taskDrafts.get(taskId) ?? "") : A.draft;
  const set = (v: string) => {
    if (taskId) A.taskDrafts.set(taskId, v);
    else A.draft = v;
    A.changed();
  };
  const submit = () => {
    // What is typed now, not this render's copy (Enter can come before the next render).
    const now = taskId ? (A.taskDrafts.get(taskId) ?? "") : A.draft;
    const ok = taskId ? A.sendToTask(taskId, now) : A.sendMessage(now);
    if (ok) set("");
  };
  const label = taskId ? t("composer.task") : t("composer.label", A.S.personaName);
  return (
    <div class="composer-wrap" ref={wrap}>
      {(A.held?.taskId ?? "") === (taskId ?? "") && <Held />}
      <DropHint on={over} />
      <Tray where={where} />
      <div class="composer">
        <AddPictures where={where} />
        <AutoText id={taskId ? "composer-task" : "composer"} value={value} onInput={set} onEnter={submit} label={label} placeholder={taskId ? t("composer.task") : t("composer.placeholder", A.S.personaName)} />
        <button class="btn accent icon send" aria-label={t("composer.send")} disabled={!value.trim() && !pics.length} onClick={submit}>
          <Arrow />
        </button>
      </div>
    </div>
  );
}

// ---------- notifications ask (in the partner's voice, with a default) ----------

/** Asks the browser, subscribes, tells core; says so if the browser can't. */
export async function turnOnPush() {
  try {
    const s = await Promise.race([
      enablePush(A.api, A.base, A.L.lang, A.me!.push.publicKey!),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 20_000)),
    ]);
    if (s === "denied") A.toast(t("notify.denied"));
    if (s === "unsupported") A.toast(t(unsupportedKey()));
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
  const dropping = useDropPaste(scroller, "");
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  });
  const empty = rows.length === 0 && A.pending.length === 0 && A.S.welcomed;
  return (
    <>
      {/* Offline is said once, in the header's line under the sleeping face (D73, D211). */}
      <Top />
      <main
        class="scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div class="spacer" />
        <DropHint on={dropping} />
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
        {A.pending.map((p, i) =>
          p.pics?.length ? (
            <div key={p.clientId} class={`user-m pending${i > 0 || rows.at(-1)?.user ? " join" : ""}`}>
              <MediaBlock pics={p.pics} side="user" ctx={{ kind: "conv" }} />
              {p.text && <div class="user">{p.text}</div>}
              {/* Words are never lost (D206): they wait here with the picture until it goes. */}
              {p.failed && (
                <div class="unsent" role="alert">
                  <span>{t("media.failed")}</span>
                  <Btn kind="text" size="sm" label={t("media.retry")} onClick={() => A.retryPending(p.clientId)} />
                </div>
              )}
            </div>
          ) : (
            <div key={p.clientId} class={`user pending${i > 0 || rows.at(-1)?.user ? " join" : ""}`}>
              {p.text}
            </div>
          ),
        )}
        {A.thinking() && <Presence />}
        <NotifyAsk />
      </main>
      <Composer />
    </>
  );
}

/** The part of the day an hour falls in, for the greeting. */
export function dayPart(h: number): "morning" | "noon" | "afternoon" | "evening" | "late" {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 13) return "noon";
  if (h >= 13 && h < 18) return "afternoon";
  if (h >= 18 && h < 23) return "evening";
  return "late";
}

/** A short paragraph split after its first sentence, so each shows on its own line. */
export function sentences(s: string): string[] {
  for (const end of ["。", ". "]) {
    const i = s.indexOf(end);
    if (i > 0 && i + end.length < s.trim().length) return [s.slice(0, i + end.length).trim(), s.slice(i + end.length).trim()];
  }
  return [s];
}

/** The first screen (D149): the partner says hello in its own name by the time of day, says what
 *  it can do for this person (or the one timely thing, for someone returning), and offers 3–4
 *  things to say, worded on the home. A starter fills the composer; it never sends. The partner
 *  waves once when it appears and leans toward the composer while there are words in it. */
function Hello() {
  const f = A.S.first;
  const words = (w: { zh: string; en: string }) => (A.L.lang === "zh" ? w.zh : w.en);
  const visit = f?.visit === "returning" ? "back" : "first";
  const hi = t(`hello.${visit}.${dayPart(new Date().getHours())}`, A.S.personaName);
  const starters = f?.starters.map((s) => words(s.words)).filter(Boolean) ?? [];
  for (let i = 1; starters.length < 3; i++) starters.push(t(`suggest.${i}`));
  const news = f?.news;
  const typing = A.draft.trim() !== "";
  return (
    <div class="hello">
      <span class={`hello-face${typing ? " leaning" : ""}`}>
        <Avatar size={136} state="idle" />
      </span>
      <h1>{hi}</h1>
      {news ? (
        <div class="hello-news">
          <div class="bubble">{words(news.words)}</div>
          <button class="btn text" onClick={() => (news.taskId ? A.go({ name: "task", id: news.taskId }) : A.go({ name: "onhand" }))}>
            {t("hello.news.open")}
          </button>
        </div>
      ) : (
        <p>
          {sentences(f ? words(f.line) : t("empty.conversation")).map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </p>
      )}
      <div class="try">
        <div class="label">{t("empty.try")}</div>
        <div class="grid">
          {starters.map((s) => (
            <button
              key={s}
              class="btn secondary suggest"
              onClick={() => {
                A.draft = s; // fills the composer; never sends
                A.changed();
                document.getElementById("composer")?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- On hand ----------

/** Where a task runs and why there, in one short muted line ("Codex · MacBook · Your rule …");
 *  the model, the repo, the branch and the rest of the reason are in the task's Details. */
export function metaLine(task: Task): string {
  const p = placeOf(task);
  // D157: with two or more computers every row names its computer.
  const where = manyComputers() ? computerName(p.device) : p.kind === "none" ? "" : deviceLabel(A.L, p.device);
  return [harnessName(harnessOf(task)), where, firstClause(bodyReasonOf(task))].filter(Boolean).join(" · ");
}

/** What a waiting task waits for, said once: the lane already says it is waiting. */
export function waitReason(task: Task): string {
  const w = A.S.waiterFor(task.id);
  if (w) return [waitLine(w.reason), waitCaption(w)].filter(Boolean).join(" · ");
  const r = reasonOf(task);
  return (r && (deviceWait(r) ?? r)) || metaLine(task);
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
        <Chev />
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
  const missed = A.S.missedToday();
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  // D193: calls on the line (or waiting for their hour) work; ended ones are done today.
  const calls = A.S.onHand?.calls ?? [];
  const liveCalls = calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state));
  const endedCalls = calls.filter((c) => callEnded(c.state) && c.state !== "held");
  const nothing = !needs.length && !partnerDs.length && !working.length && !waiting.length && !done.length && !loose.length && !missed.length && !routines.length && !liveCalls.length && !endedCalls.length;
  const openCount = A.defaultable().length;
  const wide = useWide();
  // Beside the conversation, 接下来 as the Mac shows it: one quiet grey line, only when more than one thing is coming (D184).
  const next = wide && !nothing ? forecast() : "";
  return (
    <>
      <Top back={t("nav.back")} plus level={t("onhand.title")} />
      <main class="scroll" style={{ gap: 16 }}>
        {!wide && <h1 class="page-title">{t("onhand.title")}</h1>}
        {nothing ? (
          <div class="calm">{t("onhand.empty", A.S.personaName)}</div>
        ) : (
          <>
            {next && (
              <p class="next" title={next}>
                <b>{t("onhand.next")}</b>
                {next}
              </p>
            )}
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
            {working.length + liveCalls.length > 0 && (
              <section class="section">
                <h3>
                  {t("lane.working")} <span class="n">{working.length + liveCalls.length}</span>
                </h3>
                {liveCalls.map((c) => (
                  <CallRow key={c.callId} c={c} />
                ))}
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
            {(done.length > 0 || missed.length > 0 || endedCalls.length > 0) && (
              <section class="section">
                <h3>
                  {t("lane.done")} <span class="n">{done.length + missed.length + endedCalls.length}</span>
                </h3>
                {endedCalls.map((c) => (
                  <CallRow key={c.callId} c={c} />
                ))}
                {missed.map((w) => (
                  <div class="row" key={w.waiterId}>
                    <WaitBubble w={w} />
                    <span class="main">
                      <span class="t">{w.reason}</span>
                      <span class="m">{t("wait.missed", w.unmet ?? t("wait.missed.ranout"))}</span>
                    </span>
                    <Btn kind="text" size="sm" label={t("wait.rearm")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "rearm")} />
                  </div>
                ))}
                {done.map((task) => {
                  const r = reportOf(task);
                  const ev = headlineEvidence(task.evidence.length ? task.evidence : (r?.evidence ?? []));
                  // The lane says Done; only the exception (Didn't work) is said, in words.
                  const failed = attention(task) === "failed";
                  // D154: the task's own words only when they are in the reader's language.
                  const meta = (!failed && ev && proofLabel(ev, A.L.lang)) || (sayable(r?.summary.split("\n")[0], A.L.lang) ?? "");
                  return <Row key={task.id} task={task} meta={[failed ? stateLabel("failed") : "", meta].filter(Boolean).join(" · ")} />;
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
  if ((w?.kind === "limit" || w?.kind === "unavailable") && w.ruleId) return t("who.sentence.limit.rule", who, harnessName(w.from ?? ""));
  if (w?.kind === "limit" && w.from) return t("who.sentence.limit", who, harnessName(w.from));
  if (w?.kind === "unavailable" && w.from) return t("who.sentence.unavailable", who, harnessName(w.from));
  if (w?.kind === "you") return t("who.sentence.you", who);
  if (w?.kind === "default") return t("who.sentence.default", who, A.S.personaName);
  return t("who.sentence", who);
}

/** Who does a task, in words ("Codex · gpt-5"), and why when it isn't Ducter's plain pick (D89). */
function whoLine(task: Task): [string, string] {
  const m = modelOf(task);
  const e = effortOf(task);
  const who = [harnessName(harnessOf(task)), m && modelName(m), e && effortWord(A.L, e)].filter(Boolean).join(" · ");
  const w = whoOf(task)?.why;
  if (!w) return [who, ""];
  if (w.kind === "rule" && w.text) return [who, t("who.why.rule", w.text)];
  if (w.kind === "limit" || w.kind === "unavailable") {
    const plain = w.kind === "limit" ? "who.why.limit" : "who.why.unavailable";
    return [who, w.ruleId ? t("who.why.limit.rule", harnessName(w.from ?? "")) : w.from ? t(plain, harnessName(w.from)) : ""];
  }
  if (w.kind === "you") return [who, t("who.why.you")];
  return [who, ""];
}

const pct = (f: number) => Math.round(f * 100);
export const candName = (c: Candidate) => [harnessName(c.harness), c.model && modelName(c.model)].filter(Boolean).join(" · ");

export function candReason(c: Candidate): string {
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
  const keyOf = (c: Candidate) => `${c.device ?? ""}|${c.harness}/${c.model ?? ""}`;
  const chosen = list.find((c) => !c.blocked && !c.current && keyOf(c) === pick);
  const free = list.filter((c) => !c.blocked && !c.current).length;
  // D157: two or more computers: the list grouped by computer (the phone has no island strip).
  const multi = list.some((c) => c.device);
  const groups: string[] = [];
  for (const c of list) if (!groups.includes(c.device ?? "")) groups.push(c.device ?? "");
  const cur = list.find((c) => c.current)?.device;
  const moving = !!chosen && multi && !!chosen.device && chosen.device !== cur;
  const row = (c: Candidate) => {
    const key = keyOf(c);
    const off = !!c.blocked;
    return (
      <button key={key} role="radio" aria-checked={pick === key} disabled={off || c.current} class={`cand${off ? " off" : ""}${pick === key ? " on" : ""}${c.waits ? " waits" : ""}`} onClick={() => setPick(key)}>
        <Coin harness={c.harness} size={36} off={off} />
        <span class="grow">
          <b>{candName(c)}</b>
          <small>{whereCandReason(c) || candReason(c)}</small>
        </span>
        {c.current && <small class="now">{t("who.now")}</small>}
      </button>
    );
  };
  const go = moving ? t("switch.move.go", chosen!.deviceName ?? "") : chosen ? t("who.go", candName(chosen)) : "";
  return (
    <div class="switch-list" role="radiogroup" aria-label={t("who.switch")}>
      {/* D161 (6): with two or more computers the sheet says it covers where too. */}
      {multi && <div class="switch-sub">{t("switch.sub")}</div>}
      <div class="small sub">{t(running ? "who.switch.note" : "who.switch.note.idle")}</div>
      {multi
        ? groups.map((g) => {
            const dv = computerOf(g);
            return (
              <div key={g} class="switch-group">
                <div class="switch-head">
                  {/* D161 (9): a group head is the device's mini card. */}
                  {dv && <img src={deviceArt(dv)} alt="" />}
                  <b>{dv?.name ?? g}</b>
                  {dv && <span class={dv.state === "asleep" ? "asleep" : ""}>· {computerState(dv)}</span>}
                </div>
                {list.filter((c) => (c.device ?? "") === g).map(row)}
              </div>
            );
          })
        : list.map(row)}
      {free === 0 && <div class="small sub">{t("cand.none")}</div>}
      {moving && (
        <div class="move-lines">
          <div class="small">{t(placeOf(task).kind === "repo" ? "switch.move.explain" : "switch.move.plain")}</div>
          {chosen!.needsSignIn && <div class="small">{t("switch.move.signin")}</div>}
          {chosen!.widens && <div class="small widen">{t("switch.move.widens")}</div>}
        </div>
      )}
      {chosen &&
        (A.switching ? (
          <div class="small sub">{go}…</div>
        ) : (
          <Btn kind="primary" label={go} about={title(task)} onClick={() => A.switchTask(task.id, chosen.harness, chosen.model, candName(chosen), moving ? chosen.device : undefined)} />
        ))}
    </div>
  );
}

/** The folder a task works in, as a path: on hover only, never spelled out (D127). */
function placePath(task: Task): string {
  const p = placeOf(task) as { repoPath?: string; path?: string };
  return p.repoPath || p.path || "";
}

/** D135: how many times the task's harness compacted its context (the runner logs each, with its count). */
export function compactions(task: Task): number {
  let n = 0;
  for (const ev of task.events) {
    if (ev.kind !== "task_event") continue;
    const raw = (ev.body as Bodies["task_event"]).raw as { kind?: string; outcome?: string; compactions?: number } | undefined;
    if (raw?.kind === "compaction_ended" && (raw.outcome ?? "completed") === "completed") n = Math.max(n + 1, raw.compactions ?? 0);
  }
  return n;
}

/** What went out of the machine: its commands, quiet (the one row left of the old Details, D152;
 *  who, where and the clock are the meta line, saved progress is in the transcript once). */
function OutsideActs({ task }: { task: Task }) {
  const acts = task.historyLoaded ? outsideActs(task) : [];
  if (!acts.length) return null;
  return (
    <section class="outside">
      <small>{t("outside.title")}</small>
      {acts.map((x) => (
        <code key={x.seq}>{safe(x.command)}</code>
      ))}
    </section>
  );
}

/** An opened task: one column, read top to bottom (D74). Where it stands in words; a pending
 *  ask; the outcome said once with how it knows and what to do next; what it did; Details.
 *  The phone shows no diffs: the changes are named in the proof line. */
// ---------- D142: a folder that isn't a git repo ----------

/** What a task did to the folder in one line: "整理了 42 个文件，新建了 6 个文件夹". */
function folderSentence(f: FolderSummary): string {
  const n = (key: string, k: number) => (k === 1 ? t(`${key}.one`) : t(key, k));
  const parts: string[] = [];
  if (f.moved && f.folders) parts.push(t("folder.movedInto", f.moved, f.folders));
  else {
    if (f.moved) parts.push(n("folder.moved", f.moved));
    if (f.folders) parts.push(n("folder.folders", f.folders));
  }
  for (const [key, k] of [["folder.renamed", f.renamed], ["folder.added", f.added], ["folder.changed", f.changed], ["folder.removed", f.removed]] as const) if (k) parts.push(n(key, k));
  const s = parts.join(t("folder.sep"));
  return /^[a-z]/.test(s) ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function folderUntil(task: Task, f: FolderSummary): string {
  if (f.undo === "undone") return t("folder.undone");
  if (f.undo === "kept") return t("folder.kept");
  if (f.undo === "expired") return t("folder.expired");
  if (f.undo === "none") return "";
  if (!finished(task)) return t("folder.working");
  const d = f.undoUntil ? new Date(f.undoUntil) : undefined;
  if (!d || isNaN(+d)) return t("folder.anytime");
  return t("folder.until", t("folder.date", d.getMonth() + 1, d.getDate(), d.toLocaleString("en", { month: "short" })));
}

const lastPart = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** The Changes of a folder task: the sentence, until when it can be undone, Undo all changes /
 *  Keep the changes, an in-place confirm when the folder changed since, and the list on request. */
function FolderChangesView({ task }: { task: Task }) {
  const [listOpen, setListOpen] = useState(false);
  const f: FolderSummary | undefined = task.folder ?? task.card?.folder;
  if (!f) return null;
  const any = f.added + f.changed + f.removed + f.moved + f.renamed + f.folders > 0;
  if (!any && f.undo !== "undone") return null;
  const open = f.undo === "open";
  const c = task.confirm;
  const until = folderUntil(task, f);
  const row = (x: FolderChange) =>
    x.kind === "moved"
      ? `${x.from} → ${x.path}`
      : t(x.kind === "added" ? (x.dir ? "folder.row.dir" : "folder.row.added") : x.kind === "removed" ? (x.dir ? "folder.row.removedDir" : "folder.row.removed") : "folder.row.changed", x.path);
  return (
    <section class="section folder-changes">
      <h2 class="sec-title">{t("folder.title")}</h2>
      {f.undo !== "undone" && <div class="said">{folderSentence(f)}</div>}
      {until && <div class="small">{until}</div>}
      {open && c && (
        <div class="card confirm" role="alert">
          <div class="said">
            {t(c.count === 1 ? "folder.confirm.one" : "folder.confirm", c.count, [...c.files.map(lastPart), ...(c.count > c.files.length ? ["…"] : [])].join(t("folder.sep")))}
          </div>
          <div class="btns">
            <Btn kind="text" label={t("folder.confirm.no")} onClick={() => ((task.confirm = undefined), A.changed())} />
            <Btn kind="primary" label={t("folder.confirm.go")} onClick={() => A.folderAction(task.id, "undo", { force: true })} />
          </div>
        </div>
      )}
      {open && !c && finished(task) && (
        <div class="btns">
          {task.acting === "undo" || task.acting === "keep" ? (
            <span class="small">…</span>
          ) : (
            <>
              <Btn kind="text" label={t("folder.keep")} about={title(task)} onClick={() => A.folderAction(task.id, "keep")} />
              <Btn kind="secondary" label={t("folder.undo")} about={title(task)} onClick={() => A.folderAction(task.id, "undo")} />
            </>
          )}
        </div>
      )}
      {any && f.undo !== "undone" && (
        listOpen ? (
          task.folder ? (
            <ul class="folder-list">
              {task.folder.files.map((x) => (
                <li key={x.kind + x.path} class={x.kind === "removed" ? "fail-line" : ""}>
                  <span class="mono-ish">{row(x)}</span>
                  {open && finished(task) && !x.dir && (
                    <button class="qlink" aria-label={`${t("folder.row.restore")} · ${lastPart(x.path)}`} onClick={() => A.folderAction(task.id, "undo", { path: x.path })}>
                      {t("folder.row.restore")}
                    </button>
                  )}
                </li>
              ))}
              {task.folder.more > 0 && <li class="small">{t("folder.more", task.folder.more)}</li>}
            </ul>
          ) : (
            <div class="small">{t("task.loading")}</div>
          )
        ) : (
          <button class="qlink" onClick={() => (setListOpen(true), A.folderChanges(task.id))}>
            {t("folder.list")}
            <Chev />
          </button>
        )
      )}
    </section>
  );
}

export function TaskView({ id, full }: { id: string; full?: boolean }) {
  const task = A.S.tasks.get(id);
  const scroller = useRef<HTMLDivElement>(null);
  // D210: it opens at its latest while it works or waits on you, at its head once finished (the
  // outcome is there). While it works, a reader at the end follows the newest step; one who
  // scrolled up stays, with Jump to latest.
  const atEnd = useRef(false);
  const [away, setAway] = useState(false);
  const opened = useRef("");
  const moving = !!task && ["working", "queued"].includes(attention(task));
  const live = moving || (!!task && attention(task) === "needs_you");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !task?.historyLoaded || opened.current === id) return;
    opened.current = id;
    if (live) el.scrollTop = el.scrollHeight;
    atEnd.current = live;
  }, [id, task?.historyLoaded]);
  useEffect(() => {
    const el = scroller.current;
    if (el && moving && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [task?.events.length, task?.sends.length, moving]);
  useEffect(() => A.history(id), [id, A.S.welcomed]);
  // D142: a folder task's list, again whenever its count or an undo / keep moved on.
  const isFolder = !!task && placeOf(task).kind === "folder";
  useEffect(() => void (isFolder && A.folderChanges(id)), [id, A.S.welcomed, isFolder, task?.card?.folder?.at, task?.acted]);
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
  const br = browsing(task);
  // Only a browser's place or a wait is said here: the agent's words are the transcript's, said once (D152).
  const detail = !finished(task) ? (br && browsingLine(br)) || "" : "";
  // D190: it holds Ducter's own browser (not the user's Chrome): its tab can be watched.
  const watchable = !finished(task) && !!A.S.onHand?.tasks.find((c) => c.taskId === id)?.browsing;
  const [headline, lede] = finished(task) && r ? splitOutcome(safe(r.summary)) : ["", ""];
  const blocks = taskBlocks(task);
  // Waiting on you with nothing to answer (its turn ended on a question in its own words, or a
  // wait ran out): say so, never a mystery (D152).
  const yourTurn = a === "needs_you" && !d;
  const canSwitch = !!harnessOf(task) && !["dropped", "superseded"].includes(a);
  return (
    <>
      {full ? (
        // D184: the whole screen, as the Mac shows an opened task: the crumbs (Pause and Cancel
        // task are in the foot, D210, D213); D214: the workbench's toggle at the header's end.
        <FullTop task={task}>
          <BenchToggle task={task} />
        </FullTop>
      ) : (
        <Top back={t("nav.back")} face={false} extra={<BenchToggle task={task} />} />
      )}
      <main class="scroll task-page" ref={scroller} onScroll={(e) => { const el = e.currentTarget; const gap = el.scrollHeight - el.scrollTop - el.clientHeight; atEnd.current = gap < 48; if (gap > 240 !== away) setAway(gap > 240); }}>
        <div class="task-head">
          <span class="face">
            <Avatar size={96} state={faceOf(a)} still={stillFace(a)} />
            {a === "blocked" && A.S.waiterFor(id) && <WaitBubble w={A.S.waiterFor(id)} size="lg" />}
          </span>
          <div class="head-words">
            <TaskMeta task={task} stateLabel={yourTurn ? t("task.your.turn") : stateLabel(a)} mark={<StateMark a={a} />} onSwitch={canSwitch ? () => A.openSwitch(task.id) : undefined} />
            <h1 title={safe(title(task))}>{safe(shortTitle(title(task))) || t("task.unknown")}</h1>
            {a === "blocked" && A.S.waiterFor(id) && (
              <p class="waitline">{waitLine(A.S.waiterFor(id)!.reason)}</p>
            )}
          </div>
          {headline && <p class="headline">{headline}</p>}
        </div>
        {(detail || watchable) && (
          <div class={`outcome${watchable ? " watch-row" : ""}`}>
            {detail && <div class="said">{safe(detail)}</div>}
            {/* D190: the page it is working on, live, from here. */}
            {watchable && <Btn kind="secondary" size="sm" label={t("live.watch.title")} about={safe(title(task))} onClick={() => A.watchLive(id, liveSize())} />}
          </div>
        )}
        {A.switchFor === id && <SwitchList task={task} />}
        {finished(task) && (
          <div class="outcome">
            {lede && <div class="said">{lede}</div>}
            {r?.media?.length ? <MediaBlock media={r.media} side="task" ctx={{ kind: "task", taskId: id }} /> : null}
            <ProofLine task={task} evs={resultEvidence(task)} />
            <SentLine task={task} />
            {a === "failed" ? (
              // Didn't work (D76): try the same again, or tell it how; that opens its composer.
              <div class="btns">
                <Btn kind="secondary" label={t("task.action.retry")} onClick={() => A.taskAction(id, "reopen")} />
                <Btn kind="primary" label={t("task.action.tell")} onClick={() => document.getElementById("composer-task")?.focus()} />
              </div>
            ) : (
              <ResultActions task={task} inTask />
            )}
          </div>
        )}
        <WaitDetails task={task} />
        <TryStrip task={task} />
        <FolderChangesView task={task} />
        <WhatItDid task={task} blocks={blocks} />
        <OutsideActs task={task} />
      </main>
      {live && away && (
        <div class="jump-dock">
          <button class="jump" aria-label={t("jump.latest")} title={t("jump.latest")} onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
            </svg>
          </button>
        </div>
      )}
      <TaskFoot task={task} blocks={blocks} />
      {/* A pending ask sits over the composer, where the answer is typed (D152). */}
      {d && !d.resolved && (
        <div class="ask-dock">
          <DecisionCard d={d} taskId={id} inTask />
        </div>
      )}
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
// Options sit side by side while every label fits on one line; when they don't (a narrow phone,
// longer words in the other language), the options stack, one per row, and never spill.


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

function TalkSettings() {
  const s = A.settings;
  if (!s) return null;
  return (
    <section class="set">
      <h3>{t("partner.talk.title")}</h3>
      <div class="set-card">
        <div class="set-item">
          <b>{t("settings.talk.row")}</b>
          <small>{s.language === "auto" ? t("partner.talk.auto.note") : t("partner.talk.fixed.note", t(`partner.talk.${s.language}`))}</small>
          <Seg
            label={t("partner.talk.title")}
            value={s.language}
            options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`partner.talk.${v}`) }))}
            onPick={(language) => A.setSettings({ language })}
          />
        </div>
      </div>
    </section>
  );
}

/** 记得什么 (D150): said as it is. No Mem: no switch, the way to get it; connected: whose name it's kept under (D141). */
function MemorySettings() {
  const s = A.settings;
  const mem = A.mem;
  if (!s) return null;
  const missing = mem?.state === "missing" && s.memory;
  const help = !s.memory
    ? t("partner.memory.off")
    : mem?.keptUnder
      ? t("partner.memory.under", mem.keptUnder)
      : mem?.state === "connected"
        ? t("partner.memory.connected")
        : t("partner.memory.on.help");
  return (
    <section class="set">
      <h3>{t("partner.memory.title")}</h3>
      {missing ? (
        <div class="set-card">
          <div class="set-item">
            <b>{t("partner.memory.switch")}</b>
            <small>{t("partner.memory.missing")}</small>
            <a class="btn secondary sm set-go" href="https://mem.nowledge.co" target="_blank" rel="noopener">
              <span class="lbl">{t("partner.memory.connect")}</span>
            </a>
          </div>
        </div>
      ) : (
        <>
          <Toggle label={t("partner.memory.switch")} help={help} checked={s.memory} onChange={(memory) => A.setSettings({ memory })} />
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
        </>
      )}
    </section>
  );
}

/** 自己就做，还是先问你: the rules core keeps, in everyday words (read-only). */
function TrustSettings() {
  const list = (head: string, prefix: string, cls: string) => (
    <div class={`trust ${cls}`}>
      <b>{t(head)}</b>
      <ul>
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>{t(`${prefix}.${i}`)}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <section class="set">
      <h3>{t("partner.trust.title")}</h3>
      <div class="set-card trust-card">
        {list("partner.trust.own", "partner.trust.own", "own")}
        {list("partner.trust.asks", "partner.trust.asks", "asks")}
      </div>
      <div class="small sub">{t("partner.trust.note")}</div>
    </section>
  );
}

/**
 * D205: the persona's own connection with the user's other AI agents (Nowledge Bridge underneath,
 * never named): what 连上 will do, each step, Mem's refusal with the step the user takes in Mem,
 * and 断开. With an older Mem on the home, the one line that says to update it.
 */
function BridgeRow() {
  const b = A.bridge;
  const s = A.settings;
  if (!b || !s) return null;
  const name = s.name;
  const space = b.space?.label ?? "Only me";
  if (b.state === "update_mem")
    return (
      <div class="set-item">
        <small class="bridge-only">{t("bridge.update", b.home ?? "")}</small>
      </div>
    );
  const note =
    b.state === "ready" ? t("bridge.ready", b.identity, space)
    : b.state === "connecting" ? t("bridge.connecting")
    : b.state === "disconnecting" ? t("bridge.disconnecting")
    : b.state === "connected" ? (b.pinned ? t("bridge.pinned") : t("bridge.connected", b.identity, space))
    : b.state === "no_space" ? t("bridge.no_space")
    : b.state === "refused" ? t(`bridge.refused.${b.reason ?? "control_denied"}`, b.identity)
    : b.state === "unconfirmed" ? t("bridge.unconfirmed", b.identity)
    : t("bridge.failed", b.detail ?? "");
  const busy = b.state === "connecting" || b.state === "disconnecting";
  const canUndo = (b.state === "connected" && !b.pinned) || b.state === "unconfirmed";
  const canTry = b.state === "ready" || b.state === "refused" || b.state === "failed" || b.state === "unconfirmed";
  return (
    <div class="set-item">
      <b>{t("bridge.title", name)}</b>
      <small>{note}</small>
      {b.space && (b.state === "ready" || b.state === "connected") && <small class="bridge-id">{`${b.identity} · ${space} · ${b.space.id}`}</small>}
      {b.state === "connected" && b.detail && <small>{t("bridge.undo.failed", b.detail)}</small>}
      {canUndo && A.bridgeConfirm && <small>{t("bridge.undo.ask")}</small>}
      {(canTry || canUndo || busy) && (
        <div class="set-go bridge-acts">
          {canUndo && A.bridgeConfirm && <Btn kind="text" size="sm" label={t("bridge.undo.keep")} onClick={() => ((A.bridgeConfirm = false), A.changed())} />}
          {canUndo && <Btn kind="secondary" size="sm" label={t("bridge.undo")} about={b.identity} onClick={() => A.disconnectBridge()} />}
          {canTry && <Btn kind={b.state === "ready" ? "primary" : "secondary"} size="sm" label={b.state === "ready" ? t("bridge.connect") : t("bridge.retry")} about={b.identity} onClick={() => A.connectBridge()} />}
          {busy && <Btn kind="secondary" size="sm" disabled label={b.state === "connecting" ? t("bridge.connecting") : t("bridge.disconnecting")} onClick={() => {}} />}
        </div>
      )}
    </div>
  );
}

/**
 * D170: who of the user's other AI agents may reach the partner, what it learned about them, and
 * whom the user stopped listening to. D205: always findable once the home's Mem can connect them
 * (or needs updating to); before that, only once another agent has written (J6: a fresh user
 * never meets it). Two levels: 断开 ends it all (no checks, nothing sent); 谁都不行 lets no
 * other agent reach the partner, while what the user sends on a card still goes.
 */
function PeerSettings() {
  const s = A.settings;
  const p = s?.peers;
  const seen = A.S.channel.some((e) => e.peer);
  const b = A.bridge;
  if (!s || !p || (!b && !seen && !p.trusted.length && !p.muted.length)) return null;
  const name = s.name;
  const set = (patch: Partial<typeof p>) => A.setSettings({ peers: { ...p, ...patch } });
  // An older Mem with nothing ever written: the one update line, nothing else.
  const reachShown = seen || !!p.trusted.length || !!p.muted.length || (!!b && b.state !== "update_mem");
  return (
    <section class="set">
      <h3>{t("peers.title", name)}</h3>
      <div class="set-card">
        <BridgeRow />
        {reachShown && (
          <div class="set-item">
            <b>{t("peers.reach", name)}</b>
            <small>{p.reach === "off" ? t("peers.reach.off.note", name) : t("peers.reach.note")}</small>
            <Seg label={t("peers.reach", name)} value={p.reach} options={(["own", "team", "off"] as const).map((v) => ({ v, label: t(`peers.reach.${v}`) }))} onPick={(reach) => set({ reach })} />
          </div>
        )}
      </div>
      {p.trusted.map((a) => (
        <div class="noted-row" key={`t-${a}`}>
          <span>
            {t("peers.trusted", a)} · <small>{t("peers.trusted.why")}</small>
          </span>
          <Btn kind="text" label={t("peers.trusted.stop")} about={a} onClick={() => set({ trusted: p.trusted.filter((x) => x !== a) })} />
        </div>
      ))}
      {p.muted.map((a) => (
        <div class="noted-row" key={`m-${a}`}>
          <span>{t("peers.muted", a)}</span>
          <Btn kind="text" label={t("peers.muted.undo")} about={a} onClick={() => set({ muted: p.muted.filter((x) => x !== a) })} />
        </div>
      ))}
    </section>
  );
}

function NotifySettings() {
  const s = A.settings;
  if (!s) return <div class="small">{t("conn.connecting")}</div>;
  const quiet = s.quiet;
  const setQuiet = (start: string, end: string) => A.setSettings({ quiet: { start, end, tz: quiet?.tz ?? tz() } });
  return (
    <>
      <section class="set">
        <h3>{t("partner.notify.title")}</h3>
        <Toggle label={t("partner.notify.on")} help={t(s.notify ? "partner.notify.on.note" : "partner.notify.off.note")} checked={s.notify} onChange={(notify) => A.setSettings({ notify })} />
        {s.notify && <Toggle label={t("partner.quiet")} help={t("partner.quiet.note")} checked={!!quiet} onChange={(on) => A.setSettings({ quiet: on ? { start: "23:00", end: "08:00", tz: tz() } : null })} />}
        {s.notify && quiet && (
          <div class="quiet-range">
            <input type="time" aria-label={t("partner.quiet")} value={quiet.start} onChange={(e) => setQuiet((e.target as HTMLInputElement).value || quiet.start, quiet.end)} />
            <span>{t("partner.quiet.to")}</span>
            <input type="time" aria-label={`${t("partner.quiet")} ${t("partner.quiet.to")}`} value={quiet.end} onChange={(e) => setQuiet(quiet.start, (e.target as HTMLInputElement).value || quiet.end)} />
          </div>
        )}
      </section>
      {/* D165: the same chips as on Accounts, once there is something to watch. */}
      {(s.proactive || !!A.connections?.length) && (
        <section class="set">
          <ProactiveChips />
        </section>
      )}
      <section class="set">
        <h3>{t("partner.default.title")}</h3>
        <div class="set-card">
          <div class="set-item">
            <b>{t("partner.default.line")}</b>
            <small>{t("partner.default.note")}</small>
            <Seg
              label={t("partner.default.line")}
              value={s.defaultAfterMin}
              options={[10, 30, 60, 120].map((v) => ({ v, label: v < 60 ? t("partner.default.min", v) : t("partner.default.hour", v / 60) }))}
              onPick={(defaultAfterMin) => A.setSettings({ defaultAfterMin })}
            />
          </div>
        </div>
      </section>
      {s.notify && <PhonePush />}
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
  return [left, al.sharedBy && al.sharedBy > 1 ? t("loadout.acct.shared", al.sharedBy) : t("loadout.acct.only", A.homeName ?? ""), al.resetsAt && t("loadout.acct.resets", when(A.L, al.resetsAt))].filter(Boolean).join(" · ");
}


/** What it thinks with, and who does the tasks (D89), as lists: no stage on the phone. */
function Loadout() {
  const s = A.settings;
  const agents = A.agents ?? [];
  if (!s) return null;
  const brain = A.brainNow ?? s.brain ?? { harness: "claude-code", model: "opus" };
  const b = agents.find((h) => h.harness === brain.harness);
  // D150: the models come from the home (settings.brainNow), never a list of the phone's own.
  const models = A.brainNow?.harness === brain.harness ? A.brainNow.models : [];
  const brains = agents.filter((h) => h.canBePartner && h.installed && h.loggedIn);
  const ready = agents.filter((h) => h.installed && h.loggedIn);
  const name = A.S.personaName;
  const setBrain = (harness: string, model?: string) => {
    const h = agents.find((x) => x.harness === harness);
    const m = model ?? h?.models?.[0]?.id;
    A.setSettings({ brain: { harness: harness as never, ...(m ? { model: m } : {}) } });
    A.toast(t("loadout.toast.brain", name, harnessName(harness)));
  };
  const reserve = b?.allowance ? (b.allowance.left <= PARTNER_RESERVE ? t("loadout.left.reserve", pct(b.allowance.left), name) : `${t("loadout.left", pct(b.allowance.left))} · ${t("loadout.brain.reserve", name)}`) : t("loadout.signed_in"); // no limit reported: no reserve to claim (D133)
  return (
    <>
      <section class="set">
        <h3>{t("loadout.brain.title")}</h3>
        <div class="agent">
          <Coin harness={brain.harness} size={40} />
          <span class="grow">
            <b>{harnessName(brain.harness)}</b>
            {A.brainNow?.why && <small class="auto">{A.brainNow.why === "only_codex" ? t("loadout.brain.auto", harnessName(brain.harness)) : t("loadout.brain.auto_other")}</small>}
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
            options={models.map((m) => ({ v: m.id, label: `${m.label || m.id} · ${t(m.kind === "fast" ? "loadout.model.fast" : "loadout.model.smart")}` }))}
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
                  <Coin harness={h.harness} size={40} off={!(h.installed && h.loggedIn)} />
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
            {b && <div class="small sub">{t("loadout.acct.same", name)}</div>}
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

// OOMOL Hosted (research/44): the address the user meets (the server turns it into its MCP
// endpoint, /v1/mcp), where a key is made, and where accounts are connected to OOMOL.
const HOSTED_URL = "https://connector.oomol.com";
const OOMOL_KEY_PAGE = "https://console.oomol.com/api-key";
const OOMOL_ACCOUNTS = "https://console.oomol.com/app-connections";

/** A refusal, in the failed look (D158): never the done look. A refused OOMOL key offers a new one. */
function AcctRefusal(p: { reason: string; hosted: boolean }) {
  return (
    <div class="acct-refusal" role="alert">
      <span class="acct-refusal-mark" aria-hidden="true">
        !
      </span>
      <span class="grow">{t(`acct.err.${p.reason}`)}</span>
      {p.hosted && p.reason === "unauthorized" && (
        <a class="btn secondary sm" href={OOMOL_KEY_PAGE} target="_blank" rel="noopener noreferrer">
          <span class="lbl">{t("acct.key.get")}</span>
        </a>
      )}
    </div>
  );
}

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
  const [show, setShow] = useState(false); // the key shows as typed
  const [noKey, setNoKey] = useState(false); // OOMOL Hosted checked with no key: said on the field, nothing sent
  const [how, setHow] = useState(false); // How to connect: the setup steps behind a fold
  useEffect(() => {
    if (!A.connections) A.askConnections();
  }, []);
  useEffect(() => {
    // A connection arrived: close the form and drop the typed token.
    if (adding && !A.connecting && !A.connRefusal && A.connections?.some((c) => c.url.startsWith(url.replace(/\/+$/, "")))) setAdding(false), setToken(""), setShow(false);
  }, [A.connections?.length, A.connecting]); // the answer comes after the new list: close then
  const list = A.connections;
  const oo = A.oo;
  // D122: oo signed in makes the one tap the default; the address-and-key form steps back.
  const usedOo = !!list?.some((c) => c.via === "oo");
  const offer = !!oo?.account && !usedOo;
  const pick = (w: "oomol" | "self" | "mcp") => {
    setWhere(w);
    setNoKey(false);
    A.connRefusal = undefined;
    setUrl(w === "oomol" ? HOSTED_URL : w === "self" ? "http://localhost:3000" : "");
  };
  const hosted = where === "oomol";
  const check = (e?: Event) => {
    e?.preventDefault();
    const address = hosted ? HOSTED_URL : url.trim();
    // A pasted key often brings a space or a line break along.
    const key = token.replace(/\s+/g, "");
    if (A.connecting || !address) return;
    if (hosted && !key) return void (setNoKey(true), (A.connRefusal = undefined), A.changed());
    setNoKey(false);
    A.addConnection(address, key);
  };
  const refusal = A.connRefusal && A.connRefusal !== "no_key" ? A.connRefusal : undefined;
  const showNoKey = noKey || (adding && A.connRefusal === "no_key");
  // D166: with a source, a character sheet per source and the chips above them; adding another
  // steps back to a quiet text button.
  if (list?.length && !adding && !offer)
    return (
      <>
        <SourceCards list={list} />
        <section class="set accounts quiet-add">
          <Btn kind="text" chev label={t("acct.add")} onClick={() => setAdding(true)} />
          {refusal && <AcctRefusal reason={refusal} hosted={false} />}
        </section>
      </>
    );
  return (
    <section class="set accounts">
      <h3>{t("acct.title")}</h3>
      <div class="small sub">{t("acct.lede")}</div>
      {list && !list.length && !offer && <div class="small sub">{t("acct.none")}</div>}
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
            {t("acct.manual")}
            <Chev />
          </button>
        ) : (
          <Btn kind="secondary" label={t("acct.add")} onClick={() => setAdding(true)} />
        )
      ) : (
        <form class="acct-form" onSubmit={check} noValidate>
          <Seg label={t("acct.where")} value={where} options={(["oomol", "self", "mcp"] as const).map((v) => ({ v, label: t(`acct.where.${v}`) }))} onPick={pick} />
          <div class="small sub">{t(`acct.where.${where}.note`)}</div>
          {hosted ? (
            // D158: OOMOL Hosted has one address, so no address field; three steps, each with its page.
            <ol class="acct-steps">
              <li>
                <span>{t("acct.step.oomol.1")}</span>
                <a class="qlink" href={OOMOL_ACCOUNTS} target="_blank" rel="noopener noreferrer">
                  {t("acct.connect.oomol")}
                  <Chev />
                </a>
              </li>
              <li>
                <span>{t("acct.step.oomol.2")}</span>
                <a class="btn secondary sm" href={OOMOL_KEY_PAGE} target="_blank" rel="noopener noreferrer">
                  <span class="lbl">{t("acct.key.get")}</span>
                </a>
              </li>
              <li>
                <span>{t("acct.step.oomol.3")}</span>
              </li>
            </ol>
          ) : (
            <label class="acct-field">
              <span class="small">{t("acct.address")}</span>
              <input id="acct-url" type="url" inputMode="url" autoComplete="off" spellcheck={false} value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
            </label>
          )}
          <div class="acct-field">
            <label class="small" for="acct-token">
              {t("acct.key")}
            </label>
            <div class="acct-key">
              <input
                id="acct-token"
                class={showNoKey ? "wrong" : undefined}
                type={show ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellcheck={false}
                enterKeyHint="go"
                aria-invalid={showNoKey}
                aria-describedby={showNoKey ? "acct-nokey" : undefined}
                value={token}
                onInput={(e) => {
                  setToken((e.target as HTMLInputElement).value);
                  if (noKey) setNoKey(false);
                }}
              />
              <button type="button" class="qlink" aria-pressed={show} onClick={() => setShow(!show)}>
                {t(show ? "acct.key.hide" : "acct.key.show")}
              </button>
            </div>
            {showNoKey && (
              <div id="acct-nokey" class="small warn" role="alert">
                {t("acct.err.no_key")}
              </div>
            )}
          </div>
          {refusal && <AcctRefusal reason={refusal} hosted={hosted} />}
          {!hosted && (
            <>
              <button type="button" class="qlink" aria-expanded={how} onClick={() => setHow(!how)}>
                {t(how ? "acct.how.hide" : "acct.how")}
                <Chev />
              </button>
              {how && <div class="small sub steps">{t(`acct.how.${where}`)}</div>}
            </>
          )}
          <div class="row">
            <Btn kind="text" label={t("acct.cancel")} onClick={() => (setAdding(false), setToken(""), setNoKey(false), (A.connRefusal = undefined))} />
            <button type="submit" class="btn primary" disabled={A.connecting || (!hosted && !url.trim())}>
              <span class="lbl">{A.connecting ? t("acct.checking") : t("acct.check")}</span>
            </button>
          </div>
        </form>
      )}
      {!adding && refusal && <AcctRefusal reason={refusal} hosted={false} />}
      <div class="small sub">{t("acct.honest")}</div>
      {/* D193: calls are their own card, offered beside the accounts. */}
      {list && (list.some((c) => c.phone) ? list.filter((c) => c.phone).map((c) => <PhoneCard key={c.id} c={c} />) : <PhoneOffer />)}
    </section>
  );
}

/** This phone's own notifications: turn them on here, what they cover, a test. */
function PhonePush() {
  const [push, setPush] = useState<{ done: boolean } | null>(null);
  useEffect(() => {
    void A.api.call<{ done: boolean }>("api/push/settings").then((r) => r.data && setPush(r.data));
  }, [A.push]);
  return (
    <section class="set">
      <h3>{t("settings.phone")}</h3>
      {A.push === "ios-install" && <div class="hint">{t("notify.ios")}</div>}
      {A.push === "unsupported" && <div class="hint">{t(unsupportedKey())}</div>}
      {inApp() && A.push === "off" && !A.me?.push.apns && <div class="hint">{t("notify.app.nokey")}</div>}
      {inApp() && A.push === "on" && appPush.why && <div class="hint">{t(appPush.why === "relay" ? "notify.app.relaydown" : appPush.why === "update" ? "notify.app.update" : "notify.app.nokey")}</div>}
      {inApp() && A.push === "on" && !appPush.why && A.me?.push.relay === "unreachable" && <div class="hint">{t("notify.app.relaydown")}</div>}
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
          <Toggle
            label={t("notify.done")}
            help={t("notify.enabled")}
            checked={push?.done ?? false}
            onChange={async (done) => {
              const r = await A.api.call<{ done: boolean }>("api/push/settings", { method: "POST", body: { done } });
              if (r.data) setPush(r.data);
            }}
          />
          {inApp() && A.me?.push.apnsVia === "relay" && <div class="small sub">{t("notify.app.private")}</div>}
          <div class="btns end">
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
                const r = await A.api.call<{ relay?: string }>("api/push/test", { method: "POST" });
                A.toast(r.status === 200 ? t("notify.test.sent") : r.data?.relay === "unreachable" ? t("notify.app.relaydown") : t("result.action.failed", String(r.status)));
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}

/** 这台手机 / This phone: its own language and how Details show. */
function PhoneSettings() {
  return (
    <section class="set">
      <div class="small sub">{A.me?.via === "device" ? `${A.me.deviceName ?? ""}` : deviceLabel(A.L, "local")}</div>
      <div class="set-card">
        <div class="set-item">
          <b>{t("settings.lang.title")}</b>
          <Seg label={t("settings.lang.title")} value={A.uiLang} options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`settings.lang.${v}`) }))} onPick={(v) => A.setUiLang(v)} />
        </div>
        <div class="set-item">
          <b>{t("settings.details.title")}</b>
          <Seg label={t("settings.details.title")} value={A.details} options={(["folded", "shown"] as const).map((v) => ({ v, label: t(`settings.details.${v}`) }))} onPick={(v) => A.setDetails(v)} />
        </div>
      </div>
    </section>
  );
}

const SECTIONS: { page: Exclude<SettingsPage, "">; art: string; title: string }[] = [
  { page: "partner", art: "idle", title: "settings.tab.partner" },
  { page: "notify", art: "wait_clock", title: "settings.tab.notify" },
  { page: "accounts", art: "wait_mail", title: "settings.tab.accounts" },
  { page: "autofill", art: "set_autofill", title: "settings.tab.autofill" },
  { page: "devices", art: "mini_awake", title: "settings.tab.devices" },
  { page: "phone", art: "phone", title: "settings.phone" },
];

/** Settings (D150): the same sections as the Mac's rail, as a list; a tap pushes its page. */
function SettingsSheet() {
  useEffect(() => {
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  const page = (A.sheet?.kind === "settings" && A.sheet.page) || "";
  const go = (p: SettingsPage) => ((A.sheet = { kind: "settings", page: p }), A.changed());
  const sec = SECTIONS.find((x) => x.page === page);
  const brain = A.brainNow ?? A.settings?.brain;
  return (
    <Sheet label={t("settings.title")}>
      {!sec ? (
        <div class="set-page" key="list">
          <h2>{t("settings.title")}</h2>
          <button class="set-hero" onClick={() => go("partner")}>
            <Avatar size={64} />
            <span class="grow">
              <b>{A.S.personaName}</b>
              {brain && A.homeName && <small>{t("partner.header", A.homeName, harnessName(brain.harness))}</small>}
            </span>
            <Chev />
          </button>
          <div class="set-card set-list">
            {SECTIONS.map((x) => (
              <button class="set-row" key={x.page} onClick={() => go(x.page)}>
                <img src={`app/art/${x.art}.webp`} alt="" width="40" height="40" />
                <span class="grow">
                  <b>{t(x.title)}</b>
                  <small>{t(`settings.list.${x.page}`)}</small>
                </span>
                <Chev />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div class="set-page pushed" key={page}>
          <button class="set-back" onClick={() => go("")} aria-label={t("settings.back")}>
            <span class="back-chev" aria-hidden="true">
              <Chev back />
            </span>
            {t("settings.back")}
          </button>
          <h2 class="set-title">
            <img src={`app/art/${sec.art}.webp`} alt="" width="32" height="32" />
            {t(sec.title)}
          </h2>
          {page === "partner" && (
            <>
              <NameRow />
              <Loadout />
              <TalkSettings />
              <MemorySettings />
              <TrustSettings />
              <PeerSettings />
            </>
          )}
          {page === "notify" && <NotifySettings />}
          {page === "accounts" && <Accounts />}
          {page === "autofill" && <AutofillSettings />}
          {page === "devices" && <DevicesSection />}
          {page === "phone" && <PhoneSettings />}
        </div>
      )}
    </Sheet>
  );
}

// ---------- 开一件事 / New task (D128, D185): the sheet is in newtask.tsx ----------

export function Sheets() {
  if (A.viewer) return <Viewer />;
  if (!A.sheet) return null;
  if (A.sheet.kind === "newtask") return <NewTaskSheet />;
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
