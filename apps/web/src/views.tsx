// The phone's screens: the conversation (default), 手头的事 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import type { AgentUpdate, Attention, Bodies, Candidate, DeviceHarness, DeviceUpdate, DeviceView, EvidenceRef, FolderChange, FolderSummary, LivingItem, OoDetect, Reach } from "@ducter/protocol";
import { Fragment } from "preact";
import { PARTNER_RESERVE } from "@ducter/protocol/src/loadout.ts";
import { inTongue, proofLabel, sayable } from "@ducter/protocol/src/say.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A, candKey, placeKey, type SettingsPage } from "./app.ts";
import { TRY_LIVE } from "@ducter/protocol";
import { closingWords, computerApart, computerName, computerOf, computers, computerState, deviceWait, manyComputers, whereAsk, whereCandReason } from "./where.ts";
import { ago, behind, cjkPad, deviceLabel, duration, firstClause, harnessName, modelName, phaseLine as phaseWords, placeLine, sameWords, splitOutcome, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { Coin } from "./coin.tsx";
import { disablePush, enablePush } from "./push-client.ts";
import { inApp } from "./native.ts";
import { Goal, Groove, RoutineFacts, RoutineShelf, TryStrip, untilLine, WaitBubble, waitCaption, WaitDetails, waitLine } from "./work.tsx";
import { BriefCard, safe, saidSince, shortGo, shortTitle, taskBlocks, TaskMeta, TimerPie, WhatItDid } from "./transcript.tsx";
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

// A finished task reads "Done": done_claimed means Ducter couldn't check its evidence and the
// partner hasn't confirmed it yet, usually for seconds (desktop: stateLabel).
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
  if (d.where) return whereAsk(d.where).go;
  if (d.closing) return closingWords(d.closing).go;
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
  // D157: wait for a computer (the default) or do it now on another; built in the user's words.
  const wa = d.where ? whereAsk(d.where) : undefined;
  return (
    <>
      <div class="q">{wa?.question ?? (d.closing ? closingWords(d.closing).question : d.question)}</div>
      {d.routineId && <RoutineFacts routineId={d.routineId} />}
      {open && wa && wa.lines.map((l, i) => <div key={i} class={`dl${l.widen ? " widen" : ""}`}>{l.text}</div>)}
      {open && !wa && <DefaultRow d={d} />}
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
            <Btn kind="secondary" label={wa?.hold ?? (d.closing ? closingWords(d.closing).hold : t("decision.hold"))} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
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
          {harnessOf(task) && <Coin harness={harnessOf(task)} size={20} motion="needs_you" />}
          <span>{shortTitle(title(task))} ›</span>
        </button>
      )}
      <DecisionBody d={d} taskId={taskId} />
    </div>
  );
}

// ---------- signing in (D151) ----------

/** A closed eye: what it can't see while you sign in. */
const EyeShut = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 6.5c1.6 2 3.6 3 6 3s4.4-1 6-3M4.2 8.9 3 10.6M8 9.6v2M11.8 8.9l1.2 1.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
  </svg>
);

/** The size the page is shown at in the live view (CSS pixels): this screen, less the two bars. */
const liveSize = () => ({ width: Math.min(innerWidth, 1280), height: Math.max(360, Math.min(innerHeight, 1600) - 128), scale: devicePixelRatio || 1 });

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

/**
 * The live view of Ducter's browser (D151): the page as the server's browser paints it, your
 * taps and keys going straight into it. Over everything, until 好了 / Done or 先不登了 / Not now.
 * Nothing here is kept: frames are shown and dropped.
 */
export function LiveView() {
  const lv = A.live;
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const touch = useRef<{ x: number; y: number; lastY: number; moved: boolean } | undefined>(undefined);
  const composing = useRef(false);
  useEffect(() => {
    if (!lv) return;
    const onResize = () => A.liveInput({ kind: "resize", ...liveSize() });
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [!!lv]);
  if (!lv) return null;
  const at = (e: { clientX: number; clientY: number }) => {
    const r = img.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const focusKeys = () => keys.current?.focus({ preventScroll: true });
  const SPECIAL: Record<string, import("@ducter/protocol").LiveKey> = {
    Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Escape: "Escape", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  };
  const host = (() => {
    try {
      return new URL(lv.url ?? "").hostname.replace(/^www\./, "") || lv.site;
    } catch {
      return lv.site;
    }
  })();
  return (
    <div class="live" role="dialog" aria-modal="true" aria-label={lv.try ? t("web.try") : t("signin.title", lv.site)}>
      <div class="live-top">
        <button class="btn text sm" aria-label={t("live.back")} onClick={() => A.liveInput({ kind: "nav", action: "back" })}>
          <Back />
        </button>
        <div class="live-where">
          <div class="live-host">{host}</div>
          {/* Whose browser this is, and that the partner is blind while you're in it; for Try it,
              which browser on which machine (D154). */}
          <div class="live-sub">
            {lv.try && lv.browser ? (
              <span>{t("live.try.where", lv.browser.device, `${lv.browser.name}${lv.browser.version ? ` ${lv.browser.version.split(".")[0]}` : ""}`)}</span>
            ) : (
              <>
                <EyeShut />
                <span>
                  {t("live.where")} · {t("live.blind")}
                </span>
              </>
            )}
          </div>
        </div>
        <button class="btn text sm" onClick={() => A.liveInput({ kind: "nav", action: "reload" })}>
          <span class="lbl">{t("live.reload")}</span>
        </button>
      </div>
      <div class="live-page" onClick={focusKeys}>
        {lv.src ? (
          <img
            ref={img}
            src={lv.src}
            alt={lv.title ?? host}
            draggable={false}
            onLoad={() => lv.seq != null && A.liveShown(lv.seq)}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              if (e.pointerType === "touch") return void (touch.current = { x: e.clientX, y: e.clientY, lastY: e.clientY, moved: false });
              A.liveInput({ kind: "mouse", type: "down", ...at(e), button: e.button === 2 ? "right" : "left" });
              focusKeys();
            }}
            onPointerMove={(e) => {
              const tc = touch.current;
              if (tc) {
                if (Math.abs(e.clientY - tc.y) > 8 || Math.abs(e.clientX - tc.x) > 8) tc.moved = true;
                if (tc.moved) {
                  const r = img.current!.getBoundingClientRect();
                  const scale = (lv.h ?? r.height) / r.height;
                  A.liveInput({ kind: "wheel", ...at(e), dx: 0, dy: (tc.lastY - e.clientY) * scale });
                  tc.lastY = e.clientY;
                }
                return;
              }
              if (e.buttons) A.liveInput({ kind: "mouse", type: "move", ...at(e) });
            }}
            onPointerUp={(e) => {
              const tc = touch.current;
              touch.current = undefined;
              if (tc) {
                if (!tc.moved) {
                  A.liveInput({ kind: "mouse", type: "down", ...at(e) });
                  A.liveInput({ kind: "mouse", type: "up", ...at(e) });
                  focusKeys();
                }
                return;
              }
              A.liveInput({ kind: "mouse", type: "up", ...at(e), button: e.button === 2 ? "right" : "left" });
            }}
            onWheel={(e) => (e.preventDefault(), A.liveInput({ kind: "wheel", ...at(e), dx: e.deltaX, dy: e.deltaY }))}
          />
        ) : (
          <div class="live-wait">{t("live.opening", lv.site)}</div>
        )}
        {/* What you type goes straight to the page, a key or a word at a time; nothing is kept here. */}
        <input
          ref={keys}
          class="live-keys"
          aria-label={t("live.keyboard")}
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false;
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v) A.liveInput({ kind: "text", text: v });
            (e.currentTarget as HTMLInputElement).value = "";
          }}
          onInput={(e) => {
            if (composing.current) return;
            const el = e.currentTarget as HTMLInputElement;
            if (el.value) A.liveInput({ kind: "text", text: el.value });
            el.value = "";
          }}
          onKeyDown={(e) => {
            if (composing.current) return;
            const k = SPECIAL[e.key];
            if (k) {
              e.preventDefault();
              A.liveInput({ kind: "key", key: k, ...(e.shiftKey ? { shift: true } : {}) });
            }
          }}
        />
      </div>
      <div class="live-bottom">
        {lv.try && <div class="live-note">{t("live.try.note", lv.browser?.device ?? "")}</div>}
        <div class="btns">
          {!lv.try && <Btn kind="secondary" label={t("live.notnow")} onClick={() => A.closeLive(false)} />}
          <Btn kind="primary" label={t("live.done")} onClick={() => A.closeLive(true)} />
        </div>
      </div>
    </div>
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
      <span class="s">· {d} ›</span>
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
            {proofLabel(ev, A.L.lang)} ›
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
  if (d.signIn)
    return (
      <div ref={ref} class={`partner askq signin${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="bubble">{d.said || t("signin.title", d.signIn.site)}</div>
        {(buttons || !open) && <SignInBody d={d} compact />}
      </div>
    );
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

const Plus = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

function Top({ back, face = true, plus }: { back?: string; face?: boolean; plus?: boolean }) {
  if (back)
    return (
      <header class="top">
        <button class="back" onClick={() => (history.length > 1 && location.hash ? history.back() : A.go({ name: "conv" }))}>
          <Back />
          {back}
        </button>
        <span style={{ flex: 1 }} />
        {plus && (
          // 开一件事 / New task (D128): a quiet ＋, never a floating button.
          <button class="plus" aria-label={t("newtask.button")} title={t("newtask.button")} onClick={() => A.openNewTask()}>
            <Plus />
          </button>
        )}
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
function metaLine(task: Task): string {
  const p = placeOf(task);
  // D157: with two or more computers every row names its computer.
  const where = manyComputers() ? computerName(p.device) : p.kind === "none" ? "" : deviceLabel(A.L, p.device);
  return [harnessName(harnessOf(task)), where, firstClause(bodyReasonOf(task))].filter(Boolean).join(" · ");
}

/** What a waiting task waits for, said once: the lane already says it is waiting. */
function waitReason(task: Task): string {
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
  const missed = A.S.missedToday();
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  const nothing = !needs.length && !partnerDs.length && !working.length && !waiting.length && !done.length && !loose.length && !missed.length && !routines.length;
  const openCount = A.defaultable().length;
  return (
    <>
      <Top back={t("nav.back")} plus />
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
            {(done.length > 0 || missed.length > 0) && (
              <section class="section">
                <h3>
                  {t("lane.done")} <span class="n">{done.length + missed.length}</span>
                </h3>
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
  const who = [harnessName(harnessOf(task)), m && modelName(m)].filter(Boolean).join(" · ");
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
      <div class="small sub">{t(running ? "who.switch.note" : "who.switch.note.idle")}</div>
      {multi
        ? groups.map((g) => {
            const dv = computerOf(g);
            return (
              <div key={g} class="switch-group">
                <div class="switch-head">
                  <b>{dv?.name ?? g}</b>
                  {dv && <span>· {computerState(dv)}</span>}
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
            {t("folder.list")} ›
          </button>
        )
      )}
    </section>
  );
}

export function TaskView({ id }: { id: string }) {
  const task = A.S.tasks.get(id);
  const scroller = useRef<HTMLDivElement>(null);
  // D152: while it works, a reader at the end follows the newest step; one who scrolled up stays.
  const atEnd = useRef(false);
  const moving = !!task && ["working", "queued"].includes(attention(task));
  useEffect(() => {
    const el = scroller.current;
    if (el && moving && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [task?.events.length, moving]);
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
  const [headline, lede] = finished(task) && r ? splitOutcome(safe(r.summary)) : ["", ""];
  const blocks = taskBlocks(task);
  // Waiting on you with nothing to answer (its turn ended on a question in its own words, or a
  // wait ran out): say so, never a mystery (D152).
  const yourTurn = a === "needs_you" && !d;
  const canSwitch = !!harnessOf(task) && !["dropped", "superseded"].includes(a);
  return (
    <>
      <Top back={t("nav.back")} face={false} />
      <main class="scroll task-page" ref={scroller} onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}>
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
        {detail && <div class="outcome"><div class="said">{safe(detail)}</div></div>}
        {yourTurn && <div class="small sub">{t("task.your.turn.hint")}</div>}
        {A.switchFor === id && <SwitchList task={task} />}
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
        <FolderChangesView task={task} />
        <BriefCard task={task} blocks={blocks} />
        <WhatItDid task={task} blocks={blocks} />
        <OutsideActs task={task} />
      </main>
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
function Seg<V extends string | number>(p: { label: string; value: V | undefined; options: { v: V; label: string }[]; onPick: (v: V) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const words = p.options.map((o) => o.label).join("\n");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.classList.remove("stack");
      el.classList.toggle("stack", el.scrollWidth > el.clientWidth + 1);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) (w = el.clientWidth), fit();
    });
    ro.observe(el);
    // Fonts arriving late change the words' widths.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [words]);
  return (
    <div class="seg" role="radiogroup" aria-label={p.label} ref={ref}>
      {p.options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === p.value} class={o.v === p.value ? "on" : ""} onClick={() => o.v !== p.value && p.onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(p: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch">
      <span>
        {p.label}
        {p.help && <small>{p.help}</small>}
      </span>
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
            {A.brainNow?.why === "only_codex" && <small class="auto">{t("loadout.brain.auto", harnessName(brain.harness))}</small>}
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

// ---------- 你的设备 / Your devices (D148): each card renamed in place, its version and update ----------

/** What a device is and what it's for, in plain words (the desktop's kindLine). */
function kindLine(dv: DeviceView): string {
  const who = A.S.personaName;
  let what = t("device.what.computer");
  if (dv.kind === "server") what = t("device.what.cloud");
  else if ((dv.platform ?? "").startsWith("darwin") || dv.kind === "laptop" || dv.kind === "mini") what = t("device.what.mac");
  if (dv.home) return t("device.what.home", what, who);
  return t("device.what.worker", dv.kind === "server" ? what : t("device.other"), who);
}

type Client = Reach["clients"][number];

// D155: one computer, one card. The command line (and the app window on a computer that does tasks)
// folds into its computer's card as one quiet line, with its own 断开; alone, it stands as its
// computer, never as "CLI on …".
const isCli = (cl: Client) => cl.form === "cli" || (!cl.form && cl.name.startsWith("CLI on "));
function clientComputer(cl: Client): string {
  if (cl.computer) return cl.computer;
  if (isCli(cl)) return cl.name.replace(/^CLI on /, "").trim();
  return /^(darwin|linux|win)/i.test(cl.platform) ? cl.name : "";
}
const clientName = (cl: Client) => (isCli(cl) && cl.name.startsWith("CLI on ") ? clientComputer(cl) || cl.name : cl.name);

/** Which clients fold into which card ("dev:id" | "cl:id"), and which get none of their own. */
export function foldClients(devices: DeviceView[], clients: Client[]): { hidden: Set<string>; members: Map<string, Client[]> } {
  const key = (s: string) => s.trim().toLowerCase();
  const workers = new Map<string, string>();
  for (const dv of devices) if (!dv.home) workers.set(key(dv.computer || dv.name), `dev:${dv.id}`);
  const apps = new Map<string, string>();
  for (const cl of clients) {
    const k = key(clientComputer(cl));
    if (k && !isCli(cl) && !apps.has(k)) apps.set(k, `cl:${cl.id}`);
  }
  const hidden = new Set<string>();
  const members = new Map<string, Client[]>();
  for (const cl of clients) {
    const k = key(clientComputer(cl));
    if (!k) continue;
    const owner = workers.get(k) ?? (isCli(cl) ? apps.get(k) : undefined);
    if (!owner) continue;
    hidden.add(cl.id);
    members.set(owner, [...(members.get(owner) ?? []), cl]);
  }
  return { hidden, members };
}

function clientKind(cl: Client): string {
  const p = cl.platform.toLowerCase();
  if (isCli(cl)) return t("device.kind.cli");
  if (p.includes("ios") || p.includes("iphone")) return t(p.includes("safari") || p.includes("web") ? "device.kind.iphone.safari" : "device.kind.iphone.app");
  if (p.includes("android")) return t("device.kind.android");
  if (p.startsWith("darwin") || p.includes("mac")) return t("device.kind.mac.app");
  return p ? t("device.kind.browser") : t("device.kind.other");
}

function clientDoes(cl: Client): string {
  const p = cl.platform.toLowerCase();
  const who = A.S.personaName;
  if (isCli(cl)) return t("device.does.cli");
  if (/ios|iphone|android/.test(p)) return t("device.does.phone", who);
  if (p.startsWith("darwin") || p.includes("mac")) return t("device.does.app", who);
  return t("device.does.browser", who);
}

/** A computer card's quiet lines: the command line (and the app) on it, each with its own 断开. */
function Folded({ list, computer, alone }: { list: Client[]; computer: string; alone?: boolean }) {
  if (!list.length) return null;
  return (
    <div class="dev-folded">
      {list.map((cl) => {
        const cli = isCli(cl);
        const name = t(cli ? "device.cli.name" : "device.app.name", computer);
        return (
          <div class="dev-fold" key={cl.id}>
            <div class="dev-fold-line">
              <span class={`dev-fold-dot ${cl.connected ? "on" : ""}`} aria-hidden="true" />
              <span>{t(cli ? (alone ? "device.cli.only" : "device.cli.too") : "device.app.too")}</span>
              {!cl.connected && cl.lastSeen && <span class="small sub"> · {ago(A.L, cl.lastSeen)}</span>}
            </div>
            <Disconnect id={cl.id} name={name} means={cli ? "device.disconnect.means.cli" : "device.disconnect.means.client"} />
          </div>
        );
      })}
    </div>
  );
}

const phaseLine = (u: DeviceUpdate) => phaseWords(A.L, u);

/** A card's name: a tap makes it a field; Enter keeps it, Esc puts it back. */
function CardName({ id, name, renamable }: { id: string; name: string; renamable: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const next = (draft ?? "").trim();
    if (next && next !== name) A.renameDevice(id, next);
    setDraft(null);
  };
  if (draft === null)
    return renamable ? (
      <button class="dev-name" aria-label={`${t("device.rename")} · ${name}`} onClick={() => setDraft(name)}>
        {name}
      </button>
    ) : (
      <div class="dev-name">{name}</div>
    );
  return (
    <div class="dev-edit">
      <input
        class="dev-input"
        value={draft}
        aria-label={t("device.rename")}
        autoFocus
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") e.stopPropagation(), setDraft(null);
        }}
        onBlur={save}
      />
      <div class="small sub">{t("device.rename.keys")}</div>
    </div>
  );
}

function Disconnect({ id, name, client, means }: { id: string; name: string; client?: boolean; means?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <Btn kind="text" size="sm" label={t("device.disconnect")} about={name} onClick={() => setAsking(true)} />;
  return (
    <div class="dev-cut">
      <div class="dev-cut-q">{t("device.disconnect.ask", name)}</div>
      <div class="small sub">{t(means ?? (client ? "device.disconnect.means.client" : "device.disconnect.means"))}</div>
      <div class="btns">
        <Btn kind="secondary" size="sm" label={t("device.disconnect.ok")} about={name} onClick={() => (A.disconnectDevice(id), setAsking(false))} />
        <Btn kind="text" size="sm" label={t("device.disconnect.cancel")} onClick={() => setAsking(false)} />
      </div>
    </div>
  );
}

function VersionBlock({ dv }: { dv: DeviceView }) {
  const u = dv.update;
  if (!u && !dv.version) return null;
  const current = u?.current ?? dv.version ?? "";
  const line = u ? phaseLine(u) : "";
  const offer = !!u && (behind(u) || (u.phase === "failed" && u.available));
  const answer = A.deviceAnswer?.device === dv.id ? A.deviceAnswer.reason : undefined;
  return (
    <div class="dev-ver">
      {/* D156: the agents above carry versions too; this one is Ducter's own. */}
      <div class="dev-sub">Ducter</div>
      <div class="dev-ver-row">
        <span>{t("devup.version", current)}</span>
        {u && behind(u) && (
          <>
            <span class="dot" aria-hidden="true" />
            <b>{t("devup.available", u.latest)}</b>
          </>
        )}
        {u && !u.available && u.latest && !u.phase && <span class="sub">{t("devup.current")}</span>}
      </div>
      {line && <div class={`dev-phase ${u!.phase}`}>{line}</div>}
      {u?.phase === "failed" && u.reason && <div class="small sub">{t(`devup.why.${u.reason}`)}</div>}
      {u?.phase === "downloading" && !!u.progress && (
        <div class="dev-bar">
          <i style={{ width: `${Math.round(u.progress * 100)}%` }} />
        </div>
      )}
      {offer && u!.phase !== "failed" && u!.how === "self" && u!.notes?.map((n) => <div class="small sub">{n}</div>)}
      {offer &&
        (u!.how === "self" ? (
          dv.state === "awake" ? (
            <Btn kind="secondary" size="sm" label={t(u!.phase === "failed" ? "devup.retry" : "devup.button")} about={dv.name} onClick={() => A.updateDevice(dv.id)} />
          ) : (
            <div class="small sub">{t("devup.how.away", dv.name)}</div>
          )
        ) : (
          <div class="small sub">{u!.how === "app" ? t("devup.how.app", dv.name) : u!.how === "manual" ? t("devup.how.manual", dv.name) : t("devup.how.source")}</div>
        ))}
      {answer && <div class="small warn">{t(answer === "name_taken" ? "device.rename.name_taken" : `devup.why.${answer}`)}</div>}
    </div>
  );
}

/** D156: an agent update under way. */
const agentRunning = (u?: AgentUpdate) => !!u && (u.phase === "waiting" || u.phase === "updating" || u.phase === "checking");

function agentPhase(u: AgentUpdate): string {
  switch (u.phase) {
    case "waiting":
      return t("agentv.phase.waiting");
    case "updating":
      return t("agentv.phase.updating", u.to ?? "");
    case "checking":
      return t("agentv.phase.checking", u.to ?? "");
    case "done":
      return t("agentv.phase.done", u.to ?? u.from);
    case "failed":
      return u.rolledBack ? t("agentv.phase.rolledback", u.from) : t("agentv.phase.failed");
  }
  return "";
}

/**
 * D156: one AI agent on a device card: its coin and name, its version quietly; a dot and 有新版本
 * with 更新 when it's behind; an honest line when Ducter hasn't checked the version; a copy in
 * an app or inside Ducter says where its update comes from.
 */
function AgentRow({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const u = h.update;
  const behindNow = !!h.available && !!h.latest && !agentRunning(u) && u?.phase !== "failed";
  const retry = u?.phase === "failed" && !!h.available;
  const answer = A.agentAnswer?.device === dv.id && A.agentAnswer.harness === h.harness ? A.agentAnswer.reason : undefined;
  return (
    <div class="dev-agent">
      <Coin harness={h.harness} size={28} />
      <div class="dev-agent-what">
        <div class="dev-agent-name">{harnessName(h.harness)}</div>
        {h.version && (
          <div class="dev-agent-ver">
            <span>{t("agentv.version", h.version)}</span>
            {h.how === "app" && <span>{t("agentv.how.app", h.harness === "claude-code" ? "Claude" : "Codex")}</span>}
            {h.how === "ducter" && <span>{t("agentv.how.ducter")}</span>}
            {behindNow && (
              <>
                <span class="dot" aria-hidden="true" />
                <b>{t("agentv.available", h.latest)}</b>
              </>
            )}
          </div>
        )}
        {(h.standing === "newer" || h.standing === "older") && <div class="dev-agent-note">{t("agentv.unverified")}</div>}
        {u && agentPhase(u) && <div class={`dev-phase small ${u.phase}`}>{agentPhase(u)}</div>}
        {u?.phase === "failed" && u.reason && <div class="dev-agent-note">{t(`agentv.why.${u.reason}`)}</div>}
        {(behindNow || retry) && h.latestVerified === false && <div class="dev-agent-note">{t("agentv.latest.unverified", h.latest)}</div>}
        {(behindNow || retry) &&
          (dv.state === "awake" ? (
            <Btn kind="secondary" size="sm" label={t(retry ? "agentv.retry" : "agentv.button")} about={harnessName(h.harness)} onClick={() => A.updateAgent(dv.id, h.harness)} />
          ) : (
            <div class="dev-agent-note">{t("agentv.away", dv.name)}</div>
          ))}
        {answer && <div class="small warn">{t(`agentv.why.${answer}`)}</div>}
      </div>
    </div>
  );
}

function DeviceCard({ dv, folded }: { dv: DeviceView; folded: Client[] }) {
  const state =
    dv.state === "awake" ? t("device.state.awake") : dv.state === "asleep" ? t("device.state.asleep") : dv.lastSeen ? t("device.state.unreachable", ago(A.L, dv.lastSeen)) : t("device.state.unreachable.never");
  const signedIn = dv.harnesses.filter((h) => h.installed && h.loggedIn);
  return (
    <div class="dev-card" role="group" aria-label={dv.name}>
      <div class="dev-head">
        <CardName id={dv.id} name={dv.name} renamable />
      </div>
      <div class="dev-kind">{kindLine(dv)}</div>
      <div class={`dev-state ${dv.state}`}>{state}</div>
      <Folded list={folded} computer={dv.computer || dv.name} />
      {!!signedIn.length && (
        <div class="dev-agents">
          {signedIn.map((h) => (
            <AgentRow dv={dv} h={h} key={h.harness} />
          ))}
        </div>
      )}
      <BrowserBlock dv={dv} />
      <VersionBlock dv={dv} />
      {!dv.home && (
        <div class="dev-actions">
          <Disconnect id={dv.id} name={dv.name} />
        </div>
      )}
    </div>
  );
}

/** D151: 上网 on a server (Ducter's own browser): getting it, what's in the way, then the sites signed in to. */
function BrowserBlock({ dv }: { dv: DeviceView }) {
  const ab = dv.abilities.find((a) => a.id === "web");
  const [clearing, setClearing] = useState(false);
  const on = ab?.where === "ducter" && ab.state === "on" && !ab.setup;
  useEffect(() => {
    if (on) A.send({ t: "browser_sites" });
  }, [on]);
  if (!ab || ab.where !== "ducter") return null;
  const add = () => A.send({ t: "ability", device: dv.id, ability: "web", on: true });
  const sites = A.sites?.sites ?? [];
  return (
    <div class="dev-web">
      {!on && <div class="dev-sub">{t("web.title")}</div>}
      {ab.setup === "installing" ? (
        <div class="dev-note">{t("web.installing")}</div>
      ) : ab.state === "unavailable" && ab.reason === "browser_deps" ? (
        <>
          <div class="dev-note">{t("web.deps")}</div>
          <code class="dev-cmd">{ab.detail}</code>
          <Btn kind="secondary" size="sm" label={t("web.retry")} onClick={add} />
        </>
      ) : ab.state === "unavailable" && ab.reason === "browser_failed" ? (
        <>
          <div class="dev-note">{t("web.failed", ab.detail ?? "")}</div>
          <Btn kind="secondary" size="sm" label={t("web.retry")} onClick={add} />
        </>
      ) : ab.state === "off" ? (
        <>
          <div class="small">{t("web.about")}</div>
          {dv.state === "awake" && <Btn kind="secondary" size="sm" label={t("web.add")} about={t("web.title")} onClick={add} />}
        </>
      ) : on ? (
        <>
          {/* D154: 试一下 / Try it, the live view on a harmless page: see it browse. */}
          {dv.state === "awake" && (
            <div class="dev-try">
              <div class="small">{t("web.try.about")}</div>
              <Btn kind="secondary" size="sm" label={t("web.try")} about={t("web.title")} onClick={() => A.openLive(TRY_LIVE, "example.com", liveSize(), true)} />
            </div>
          )}
          <div class="dev-sub">{t("sites.title")}</div>
          {!sites.length && <div class="small">{t("sites.none")}</div>}
          {sites.map((s) => (
            <div class="dev-site" key={s.site}>
              <div class="dev-site-what">
                <div class="dev-site-name">{s.site}</div>
                <div class="small">{s.cookies ? t("sites.when", ago(A.L, s.signedInAt)) : t("sites.gone")}</div>
              </div>
              <Btn kind="text" size="sm" label={t("sites.signout")} about={s.site} onClick={() => A.send({ t: "browser_site_signout", site: s.site })} />
            </div>
          ))}
          {!!sites.length &&
            (clearing ? (
              <>
                <div class="small">{t("sites.clear.ask")}</div>
                <div class="btns">
                  <Btn kind="secondary" size="sm" label={t("sites.keep")} onClick={() => setClearing(false)} />
                  <Btn kind="primary" size="sm" label={t("sites.clear.go")} onClick={() => (setClearing(false), A.send({ t: "browser_sites_clear" }))} />
                </div>
              </>
            ) : (
              <Btn kind="text" size="sm" label={t("sites.clear")} onClick={() => setClearing(true)} />
            ))}
        </>
      ) : null}
    </div>
  );
}

/** A phone's, a window's or a lone command line's card in the D148 language (D155). */
function ClientCard({ cl, folded }: { cl: Client; folded: Client[] }) {
  const mine = A.me?.deviceId === cl.id;
  const name = clientName(cl);
  const computer = clientComputer(cl);
  const cli = isCli(cl);
  return (
    <div class="dev-card" role="group" aria-label={name}>
      <div class="dev-head">
        <CardName id={cl.id} name={name} renamable />
      </div>
      <div class="dev-kind">{clientKind(cl)}</div>
      {cli ? (
        <Folded list={[cl]} computer={computer} alone />
      ) : (
        <>
          <div class={`dev-state ${cl.connected ? "awake" : ""}`}>{mine ? t("device.client.this") : cl.connected ? t("device.client.now") : cl.lastSeen ? t("device.client.seen", ago(A.L, cl.lastSeen)) : t("device.client.notnow")}</div>
          <Folded list={folded} computer={computer} />
        </>
      )}
      <div class="dev-sub">{t("device.does")}</div>
      <div class="small">{clientDoes(cl)}</div>
      {!cli && (
        <div class="dev-actions">
          <Disconnect id={cl.id} name={name} client />
        </div>
      )}
    </div>
  );
}

/** 你的设备 / Your devices: a self-contained section, so the Settings page can place it. */
export function DevicesSection() {
  useEffect(() => {
    if (!A.devices && A.S.welcomed) A.send({ t: "devices" });
  }, []);
  const list = A.devices;
  if (!list?.length) return null;
  return (
    <section class="set devices">
      <h3>{t("devices.title")}</h3>
      {((f) => (
        <>
          {list.map((dv) => (
            <DeviceCard dv={dv} key={dv.id} folded={f.members.get(`dev:${dv.id}`) ?? []} />
          ))}
          {A.reach?.clients
            .filter((cl) => !f.hidden.has(cl.id))
            .map((cl) => (
              <ClientCard cl={cl} key={cl.id} folded={f.members.get(`cl:${cl.id}`) ?? []} />
            ))}
        </>
      ))(foldClients(list, A.reach?.clients ?? []))}
      {A.settings && (
        <>
          <Toggle label={t("settings.versions.night")} checked={!!A.settings.autoUpdate} onChange={(v) => A.setSettings({ autoUpdate: v })} />
          <div class="small sub">{t("settings.versions.night.note")}</div>
        </>
      )}
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
          <Toggle
            label={t("notify.done")}
            help={t("notify.enabled")}
            checked={push?.done ?? false}
            onChange={async (done) => {
              const r = await A.api.call<{ done: boolean }>("api/push/settings", { method: "POST", body: { done } });
              if (r.data) setPush(r.data);
            }}
          />
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
                const r = await A.api.call("api/push/test", { method: "POST" });
                A.toast(r.status === 200 ? t("notify.test.sent") : t("result.action.failed", String(r.status)));
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
              ‹
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
            </>
          )}
          {page === "notify" && <NotifySettings />}
          {page === "accounts" && <Accounts />}
          {page === "devices" && <DevicesSection />}
          {page === "phone" && <PhoneSettings />}
        </div>
      )}
    </Sheet>
  );
}

// ---------- 开一件事 / New task (D128) ----------

/** The New task sheet: Where (place chips; the chosen repo's chip names its base branch and
 *  opens the branches), Who does it (the agents' coins, the best fit chosen and tagged Suggested),
 *  What (the words, given as they are). Start opens the task; back returns. */
function NewTaskSheet() {
  const nt = A.nt;
  const close = () => ((A.sheet = null), A.changed());
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    // The words are focused where a keyboard is at hand; a phone's would cover the sheet.
    if (!coarse()) ref.current?.focus();
    return () => removeEventListener("keydown", k);
  }, []);
  const opts = A.newTaskOptions;
  const places = A.newTaskPlaces();
  const chosen = A.chosenPlace(places);
  const branch = nt.branch || chosen.defaultBranch || "";
  const { c: who, picked } = A.chosenCandidate();
  const pickable = (chosen.branches?.length ?? 0) > 1;
  // D157: the computer part of No folder, only when the choice is real.
  const { list: whoList, elsewhere } = A.ntCands();
  const multi = (opts?.candidates ?? []).some((c) => c.device) && manyComputers();
  const compId = multi ? A.ntComputer() : "";
  const comp = compId ? computerOf(compId) : undefined;
  const suggested = multi ? (opts?.candidates ?? []).find((c) => !c.blocked && !c.waits && c.device)?.device : undefined;
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet newtask" role="dialog" aria-modal="true" aria-label={t("newtask.title")}>
        <div class="grab" />
        <h2>{t("newtask.title")}</h2>
        <section class="nt-row" role="radiogroup" aria-label={t("newtask.where")}>
          <h3>{t("newtask.where")}</h3>
          <div class="chips">
            {places.map((p) => {
              const on = placeKey(p.place) === placeKey(chosen.place);
              const name = p.place.kind === "repo" ? p.name || p.place.repoPath.split("/").pop() : t("newtask.nowhere");
              return (
                <button
                  key={placeKey(p.place)}
                  class={`chip${on ? " on" : ""}`}
                  role="radio"
                  aria-checked={on}
                  aria-expanded={on && p.place.kind === "repo" && pickable ? nt.branchOpen : undefined}
                  title={p.place.kind === "repo" ? p.place.repoPath : undefined}
                  onClick={() =>
                    on
                      ? p.place.kind !== "repo" && comp
                        ? ((nt.computerOpen = !nt.computerOpen), A.changed())
                        : pickable && ((nt.branchOpen = !nt.branchOpen), A.changed())
                      : A.pickPlace(p)
                  }
                >
                  <b>{name}</b>
                  {on && p.place.kind !== "repo" && comp && (
                    <>
                      <span class="dot">·</span>
                      <span>{comp.name}</span>
                      <Chev />
                    </>
                  )}
                  {on && p.place.kind === "repo" && branch && (
                    <>
                      <span class="dot">·</span>
                      <code>{branch}</code>
                      {pickable && <Chev />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {nt.computerOpen && comp && (
            <div class="branches computers" role="radiogroup" aria-label={t("newtask.computer")}>
              <small>{t("newtask.computer")}</small>
              {computers().map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={d.id === compId}
                  disabled={d.state === "unreachable"}
                  class={d.id === compId ? "on" : ""}
                  onClick={() => ((nt.computer = d.id === suggested ? "" : d.id), (nt.computerOpen = false), (nt.pick = ""), A.changed())}
                >
                  <b>{d.name}</b>
                  <small>{computerApart(d)}</small>
                  {d.id === suggested && <small class="suggested">{t("newtask.suggested")}</small>}
                  {d.id === compId && <Check />}
                </button>
              ))}
            </div>
          )}
          {nt.branchOpen && pickable && (
            <div class="branches" role="radiogroup" aria-label={t("newtask.branch.title")}>
              <small>{t("newtask.branch.title")}</small>
              {chosen.branches!.map((b) => (
                <button
                  key={b}
                  role="radio"
                  aria-checked={b === branch}
                  class={b === branch ? "on" : ""}
                  onClick={() => ((nt.branch = b === chosen.defaultBranch ? "" : b), (nt.branchOpen = false), A.changed())}
                >
                  <code>{b}</code>
                  {b === chosen.defaultBranch && <small>{t("newtask.branch.default")}</small>}
                  {b === branch && <Check />}
                </button>
              ))}
            </div>
          )}
        </section>
        <section class="nt-row" role="radiogroup" aria-label={t("newtask.who")}>
          <h3>{t("newtask.who")}</h3>
          {!opts ? (
            <div class="small sub">{t("newtask.loading")}</div>
          ) : !who ? (
            <div class="small sub">{t("newtask.nobody")}</div>
          ) : (
            <div class="chips">
              {whoList.map((c) => {
                const off = !!c.blocked;
                const on = !off && candKey(c) === candKey(who);
                const top = whoList.find((x) => !x.blocked);
                const best = !!top && candKey(top) === candKey(c);
                const away = elsewhere.has(candKey(c)); // D157: lives only on another computer
                // The best fit carries 推荐 / Suggested; why is a tooltip, and so is "…，是你选的".
                const tip = off || best ? candReason(c) : on && picked ? t("newtask.picked", candName(c)) : undefined;
                return (
                  <button
                    key={candKey(c)}
                    class={`chip coin${on ? " on" : ""}${off ? " off" : ""}`}
                    role="radio"
                    aria-checked={on}
                    disabled={off}
                    title={tip || undefined}
                    onClick={() => ((nt.pick = best ? "" : candKey(c)), away && c.device && ((nt.computer = c.device), (nt.pick = candKey(c))), A.changed())}
                  >
                    <Coin harness={c.harness} size={26} off={off} />
                    <b>{candName(c)}</b>
                    {away && <small>{t("newtask.agent.elsewhere", c.deviceName ?? "")}</small>}
                    {best && <small class="suggested">{t("newtask.suggested")}</small>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <section class="nt-row">
          <h3>
            <label for="nt-words">{t("newtask.what")}</label>
          </h3>
          <textarea
            ref={ref}
            id="nt-words"
            rows={4}
            value={nt.words}
            placeholder={t("newtask.placeholder")}
            onInput={(e) => ((nt.words = (e.target as HTMLTextAreaElement).value), (nt.err = ""), A.changed())}
            onKeyDown={(e) => {
              // Return breaks the line; ⌘Return (Ctrl+Return) starts.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                A.startNewTask();
              }
            }}
          />
          <div class="small sub">{t("newtask.verbatim")}</div>
        </section>
        {A.newTaskError() && (
          <div class="nt-err" role="status">
            {A.newTaskError()}
          </div>
        )}
        <div class="btns">
          <Btn kind="text" label={t("newtask.cancel")} onClick={close} />
          <Btn kind="primary" grow label={nt.sending ? t("newtask.starting") : t("newtask.start")} disabled={!!nt.sending} onClick={() => A.startNewTask()} />
        </div>
      </div>
    </>
  );
}

export function Sheets() {
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
