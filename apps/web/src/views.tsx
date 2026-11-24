// The phone's screens: the conversation (default), 手头的事 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import { openPhone, PhoneAskBody } from "./phone-use.tsx";
import { seeDraft } from "./finds.tsx";
import { AppUpdateRow } from "./app-update.tsx";
import { ComputerLine } from "./computer-use.tsx";
import { AutoText, ComposerBox, WordsWithRefs } from "./composer.tsx";
import { BgTray } from "./bg-tray.tsx";
import { scaledRow } from "./text-scale.ts";
import { HandsetAskBody, HandsetLine, handsetAskTitle } from "./handset.tsx";
import type { AgentUpdate, Attention, Bodies, Candidate, CantStart, DeviceHarness, DeviceUpdate, DeviceView, EvidenceRef, FolderChange, FolderSummary, LivingItem, OoDetect, Reach } from "@ducter/protocol";
import { Fragment, type ComponentChildren } from "preact";
import { PARTNER_RESERVE } from "@ducter/protocol/src/loadout.ts";
import { inTongue, proofLabel, sayable } from "@ducter/protocol/src/say.ts";
import { autonym, LANGUAGES, words as byLang } from "@ducter/protocol/src/lang.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useSheetMotion } from "./sheetmotion.ts";
import { outsideSentence } from "./outward.ts";
import { SheetFrame } from "./sheet-frame.tsx";
import { KeysSheet, TaskNav } from "./keymap.tsx";
import { last as lastMove } from "./nav.ts";
import type { JSX } from "preact";
import { AmbientLine } from "./ambient.tsx";
import { AliveLine } from "./alive.tsx";
import { aliveFace, aliveMotion, aliveSub, aliveWords } from "@ducter/protocol/src/alive.ts";
import { A, candKey, effortWord, HANDHELD, placeKey, type SettingsPage } from "./app.ts";
import { FirstMeetLine } from "./first-meet.tsx";
import { HARNESSES, isHarnessId, ownAgentSelf, splitRefs, TRY_LIVE, type HeldMsg } from "@ducter/protocol";
import type { PingGroup } from "./store.ts";
import { closingWords, computerApart, computerOf, computers, computerState, manyComputers, whereAsk, watchesBrowser, whereCandReason } from "./where.ts";
import { ago, behind, cjkPad, deviceLabel, duration, harnessName, inPlaceTune, modelName, padEnd, phaseLine as phaseWords, sameWords, splitOutcome, spoken, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { Coin } from "./coin.tsx";
import { EyeShut, liveSize } from "./live.tsx";
import { AddRow, AppsMark, Btn, Chev, Choice, CountDoor, DevicesMark, Facts, Gear, NavBtn, NeedsDoor, OnHandMark, PlaceSeg, PlacesMenu, PlusMark, Seg, Toggle, UpdatePebble } from "./controls.tsx";
import { deviceArt, deviceCardShown, DevicesSection } from "./devcard.tsx";
import { CallsSection, ProactiveChips, QuietDay, SourceCards } from "./accounts.tsx";
import { OwnPhoneCard } from "./own-phone.tsx";
import { GRow, Said, say, Waiting } from "./set-grid.tsx";
import { BackGlyph, DangerButton, Notice } from "./controls.tsx";
import { Select } from "./menu.tsx";
import { cheer, LookPreview, NotifyPreview, TalkSample } from "./settings-delight.tsx";
import { AskLines, TaskAsks } from "./asks.tsx";
import { CallDecision, CallRow, PhoneCard, PhoneOffer } from "./phone.tsx";
import { callEnded, cutAtWord } from "@ducter/protocol";
import { FindsNote } from "./finds.tsx";
import { LaterAway, LaterBack, LaterButton, LaterTimes } from "./later.tsx";
import { LearnedSheet, RecallLine, RecallSheet } from "./recall.tsx";
import { MicButton, ReadingLine, useReadback, voice, VoiceSettings, VoiceStrip } from "./voice.tsx";
import { TalkPanel, talkIfAny, useTalkFeed } from "./talk.tsx";
import { FirstAfter, firstOpening, KeyCard, keyJustAdded } from "./first-words.tsx";
import { CalFacts, calHold, CalSettle, DayCard, TodayRow } from "./calendar.tsx";
import { AddPictures, DropHint, MediaBlock, Tray, useDropPaste, Viewer } from "./media.tsx";
import { DocLine } from "./doc-line.tsx";
import { FileLinkSheet, FileViewer } from "./fileview.tsx";
import { NewTaskSheet } from "./newtask.tsx";
import { AddFolderSheet } from "./addfolder.tsx";
import { MemoryPage, Notebook, PeersInvite, PeersPage, peersPageShown } from "./memory.tsx";
import { homeThinks, PaneSays, PlacesMap, SetBrief } from "./settings-home.tsx";
import { memBadge, memUpdate, peerCalled } from "./mem-view.ts";
import { benchable, BenchToggle, openBenchAt } from "./workbench.tsx";
import { TaskInfoButton } from "./task-info.tsx";
import { PhoneMore, ShareButton, taskPr } from "./task-sheet.tsx";
import { NARROW, usePhone, useRoomy } from "./wide.ts";
import { prNumber } from "./task-words.ts";

/** A pull request's drawn mark (D484): two branches meeting, never a font glyph. */
const PrMark = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="4" cy="3.5" r="1.6" />
    <circle cx="4" cy="12.5" r="1.6" />
    <circle cx="12" cy="12.5" r="1.6" />
    <path d="M4 5.1v5.8M12 10.9V6.5c0-1.1-.9-2-2-2H7.5" />
  </svg>
);
import { PartnerMark, PartnersBack, PartnersSection, PassedFrom, RailToggle } from "./partners.tsx";
import { appPush, disablePush, enablePush } from "./push-client.ts";
import { inApp, unsupportedKey } from "./native.ts";
import { useSplit, useWide } from "./wide.ts";
import { AutofillSettings, CopyKeyBody, copyKeyTitle, FillBody, fillTitle, KeyBody, keyTask, PayBody } from "./autofill.tsx";
import { CheckoutBody, StepBody } from "./errand.tsx";

import { ChatAppsSettings } from "./channels.tsx";
import { SourceCardBody, TodoSourcesSettings, TS } from "./todos.tsx";
import { DensityRow, HandoffSettings, PaperRow, RecordsSettings } from "./settings-more.tsx";
import { AddSection, brainHeld, heldAt, NewTasksSection, noBrain, TasksSection, ThinksSection } from "./partner-story.tsx";
import { ComposerReply, HoverReply, Imprint, PartReply, ReplyMenu, replyKey, replyOf, SelectText, SentImprint, useReplyGestures, replyLabel } from "./reply.tsx";
import { dividerSeq, NewDivider, OlderWait, useFollow, useOlder, WayBack } from "./conv-follow.tsx";
import { isImage, plainWords, type MediaRef } from "@ducter/protocol";
import { FillButton, FullTop } from "./board.tsx";
import { barDoorPartner, centerIn, doorItems, L as OnHandState, OnHandList, storyOf, taskNext } from "./onhand.tsx";
import { dateOf, PastSheet } from "./past.tsx";
import { Palette } from "./palette.tsx";
import { PV, RedoSheet } from "./past-preview.tsx";
import { DidSheet } from "./did.tsx";
import { PinsSheet, PinStrip } from "./pins.tsx";
import { APP_GLYPH, AppCardView, AppSheet, BoardOfferFacts, openApp, openShelf, ShelfCard } from "./apps.tsx";
import { closeKeep, K, KeepReceipt } from "./keep.tsx";
import { AppsShelf, PinnedApps } from "./apps-shelf.tsx";
import { PileSheet } from "./pile.tsx";
import { HandSheet, PlanCard, ReviewSheet, SetCard } from "./handover.tsx";
import { RichBlock } from "./rich.tsx";
import { splitRich } from "@ducter/protocol/src/rich.ts";
import { ContextButton } from "./context-meter.tsx";
import { ComposerTune } from "./composer-tune.tsx";
import { LoopLine } from "./loop-line.tsx";
import { Goal, Groove, RoutineFacts, RoutineShelf, TryStrip, untilLine, backWords, WatchCard } from "./work.tsx";
import { CantStartView, cantClause, cantFixes } from "./cant.tsx";
import { Locator, safe, saidSince, shortGo, shortTitle, taskBlocks, TaskFoot, TaskMeta, TaskMore, TimerPie, wakesOf, WhatItDid } from "./transcript.tsx";
import {
  attention,
  browsing,
  cantOf,
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
  noRemote,
  countsChanges,
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
export function Avatar({ size, state, still, who }: { size: number; state?: Face; still?: boolean; /** D546: the owner's name when the face is a partner's object's (an opened task); else the shown partner. */ who?: string }) {
  const p = state ?? A.presence();
  const ref = useRef<HTMLSpanElement>(null);
  useBlink(ref, !still);
  return (
    <span ref={ref} class={`avatar${still ? "" : " breathe"}`} style={{ width: size, height: size }} role="img" aria-label={t(FACE_KEY[p], who ?? A.S.personaName)}>
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
/** D279: the rounds a task's own wait came true, for the watch card's tally. */
function wakeTally(task: Task): { wakes: number; wokeAt: number } {
  const w = wakesOf(task);
  return { wakes: w.n, wokeAt: w.lastAt };
}

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
const Back = BackGlyph;

// A finished task reads "Done": done_claimed means Ducter couldn't check its evidence and the
// partner hasn't confirmed it yet, usually for seconds (desktop: stateLabel).
export const stateLabel = (a: Attention) => t(`state.${a === "done_claimed" ? "done" : a}`);
/** D542: the opened task's state Tag, in D525's native register (进行中, 等待中, 已完成, 没完成). */
export const tagLabel = (a: Attention) => t(`task.tag.${a === "done_claimed" ? "done" : a}`);



// ---------- decisions ----------

export function defaultInfo(d: DecisionState, now: number): { line: string; frac?: number } {
  if (d.asker) return { line: t("peer.default") }; // silence never answers for the user (D164)
  if (d.saying) return { line: t("decision.saying.default") }; // D379: nothing waits on it; unanswered, it still goes by their words
  if (!d.reversible) return { line: t("decision.no_default") };
  const at = d.defaultAt ? Date.parse(d.defaultAt) : NaN;
  if (d.defaultOption !== "go" || Number.isNaN(at)) return { line: t("decision.default.hold") };
  const left = at - now;
  if (left <= 0) return { line: t("decision.default.due"), frac: 0 };
  // D493: the sentence quotes the Go button exactly as it reads (按「好，30 分钟后再试」办 / go with "Try
  // again in 30 minutes"), never splices the model's label in as a verb ("29 分钟后我就 30 分钟后再试");
  // a Go that names no action (好 / Go) has nothing to quote: 我就接着做 / I'll go ahead.
  // D315: only its own end mark goes ("等你登录后继续。，之后还能改回来。").
  const label = goLabel(d).trim().replace(/[。．.！!；;，,]+$/u, "");
  if (!label || label === t("decision.go")) return { line: t("decision.default.goon", duration(A.L, left)) };
  const asked = d.askedAt ? Date.parse(d.askedAt) : NaN;
  const frac = Number.isNaN(asked) || at <= asked ? undefined : Math.max(0, Math.min(1, left / (at - asked)));
  return { line: t("decision.default.go", duration(A.L, left), label), frac };
}

/** The Go button's words: the action itself when it is a short verb ("Rebase"; zh "好，rebase"),
 *  else Go / 好: never a sentence (D127). */
export function goLabel(d: DecisionState): string {
  if (d.checkout) return t("co.go"); // D436
  if (d.where) return whereAsk(d.where).go;
  if (d.asker) return d.goLabel; // X1: the asking agent's own option, as it named it
  if (d.sender) return d.goLabel; // D334: 答应 / Let it, as the card's code said it
  if (d.closing) return closingWords(d.closing).go;
  if (d.memPlugin) return t("memp.card.go");
  if (d.cal) return d.goLabel; // D222: the action itself (添加到日历 / Add to calendar)
  if (d.src) return d.goLabel; // D341: 留言 / Comment, 停下 / Stop, as the card's code said it
  if (d.loop?.move) return d.goLabel; // D429: 换到醒着的电脑上跑 / Run it on an awake computer, whole
  if (d.computer?.kind === "user") return t("computeruse.user.done"); // D235: their own turn in an app
  return shortGo(d.goLabel);
}

/** An ask's default (D127; D482: said once, the same sentence on every surface): what happens if
 *  the person doesn't answer, "不回的话，25 分钟后我就 rebase，之后还能改回来。", with a small timer of
 *  the time left when it goes by itself; a default that holds, or none, in words alone. */
function DefaultRow({ d, id, children }: { d: DecisionState; id?: string; children?: ComponentChildren }) {
  const { line, frac } = defaultInfo(d, Date.now());
  return (
    <div class={`dl dk-default${frac !== undefined ? " timer" : ""}`} id={id}>
      {frac !== undefined && <TimerPie frac={frac} />}
      <span class="dk-line">
        {d.asker?.suggests && <b class="sug">{t("peer.suggests", d.goLabel)}</b>}
        {line}
      </span>
      {children}
    </div>
  );
}

/** The hold's words: what declining means for this kind of ask (D157, D222, D334…), else 先不用 / Not now. */
function holdWords(d: DecisionState): string {
  const wa = d.where ? whereAsk(d.where) : undefined;
  return wa?.hold ?? d.holdLabel ?? (d.cal ? calHold(d.cal) : d.closing ? closingWords(d.closing).hold : d.memPlugin ? t("memp.card.hold") : d.trust ? t("peers.trust.hold") : t("decision.hold"));
}

/**
 * D482: an ask's one grammar, wherever a go/hold ask stands (the conversation's card, On hand, a
 * sheet, the opened task), on every client: the one action that says exactly what happens leads;
 * the other ways follow it as quiet text, each meaning one thing (先不用 / Not now declines, 回复… /
 * Reply… says something else, 晚点再问我 / Ask me later brings it back at a time); then the default,
 * once, as a sentence. Reply… opens its field in place of the row, with its own 发送 / Send where Go
 * stood and 取消 / Cancel (Enter sends, Esc closes): nothing else sends while it is open.
 */
function DecideRow({ d, about, sm, foot, dflt = true }: { d: DecisionState; about: string; sm?: boolean; foot?: ComponentChildren; dflt?: boolean }) {
  const id = d.decisionId;
  const replying = A.replyOpen.has(id);
  const draft = A.replyDraft.get(id) ?? "";
  const size = sm ? "sm" : undefined;
  const lineId = `dk-${id}`;
  const close = () => {
    A.replyOpen.delete(id);
    A.changed();
    // Back to the way in, so the keys go on from where they were.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-dk-reply="${id}"]`)?.focus());
  };
  const send = () => {
    const v = draft.trim();
    if (!v) return;
    A.decide(id, "reply", v);
    A.replyDraft.delete(id);
  };
  const toggleReply = () => {
    A.replyOpen.add(id);
    A.laterOpen.delete(id);
    A.changed();
  };
  return (
    <div class={`dk${replying ? " replying" : ""}`}>
      {replying ? (
        <div class="dk-reply">
          <AutoText
            value={draft}
            autoFocus
            label={t("decision.reply.placeholder")}
            placeholder={t("decision.reply.placeholder")}
            onInput={(v) => (A.replyDraft.set(id, v), A.changed())}
            onEnter={send}
            onEscape={close}
          />
          <div class="dk-acts">
            <Btn kind="primary" size={size} label={t("decision.reply.send")} about={about} disabled={!draft.trim()} onClick={send} />
            <Btn kind="text" size={size} label={t("decision.reply.cancel")} about={about} onClick={close} />
          </div>
        </div>
      ) : (
        <div class="dk-acts" role="group" aria-describedby={lineId}>
          <Btn kind="primary" size={size} label={d.asker ? d.goLabel : goLabel(d)} about={about} onClick={() => A.decide(id, "go")} />
          {/* D493: the quiet ways wrap as one group: beside the Go, or under it with the first word's
              letters at the card's edge (never one word alone on a line, indented by its padding). */}
          <span class="dk-quiet">
            {d.asker?.other ? (
              // X1: its second option, answered in its own words (a reply), never Hold.
              <Btn kind="text" size={size} label={d.asker.other} about={about} onClick={() => A.decide(id, "reply", d.asker!.other)} />
            ) : (
              <Btn kind="text" size={size} label={holdWords(d)} about={about} onClick={() => A.decide(id, "hold")} />
            )}
            <button class={`btn text${sm ? " sm" : ""}`} data-dk-reply={id} aria-expanded={false} aria-label={spoken(A.L, t("decision.reply"), about)} onClick={toggleReply}>
              <span class="lbl">{t("decision.reply")}</span>
            </button>
            <LaterButton d={d} about={about} size={size} />
          </span>
        </div>
      )}
      {dflt ? <DefaultRow d={d} id={lineId}>{foot}</DefaultRow> : foot && <div class="dl dk-default" id={lineId}>{foot}</div>}
      {!replying && <LaterTimes d={d} />}
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
  // D375: D169's offer closed by itself once the plugin was in.
  if (d.resolved?.settled && d.memPlugin) return t("memp.card.done");
  // D413: a review round's drafts went under what the person said.
  if (d.resolved?.posted) return t("standing.settled");
  // D481: closed while this page missed how (the home's word follows), or closed by what happened.
  if (d.elsewhere) return t("decision.resolved.elsewhere");
  if (d.resolved?.by === "ended") return t("decision.resolved.ended");
  if (d.resolved?.by === "default") return t("decision.resolved.default");
  // D499: Ducter said Go for them, under what they said.
  if (d.resolved?.by === "said") return t("decision.resolved.said");
  if (opt === "reply") return t("decision.resolved.reply", d.resolved?.text ?? "");
  if (opt === "hold") return d.where ? t("where.ask.waited", d.where.device) : t("decision.resolved.hold");
  return t("decision.resolved.go", goLabel(d));
}

/**
 * D481: words typed into this card's reply box while it was answered somewhere else: kept, and
 * offered as a message to the partner (quoting the card), never dropped with the box.
 */
function LeftDraft({ d, text }: { d: DecisionState; text: string }) {
  return (
    <div class="left-draft" role="status">
      <div class="dl">{t("decision.left.line")}</div>
      <div class="left-words">{text}</div>
      <div class="btns">
        <Btn kind="text" label={t("decision.left.drop")} about={text} onClick={() => (A.replyDraft.delete(d.decisionId), A.changed())} />
        <Btn kind="secondary" label={t("decision.left.send")} about={text} onClick={() => A.sendLeftDraft(d, text)} />
      </div>
    </div>
  );
}

function Resolved({ d }: { d: DecisionState }) {
  // D236: answered by a reply: its words are that bubble, not a line under the question.
  if (d.resolved?.msgSeq) return null;
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

/** D403: a 在等你回 find's ask away from its card: the question, the reply's first line (quiet, one line), 先等等 · 看草稿. */
function DraftAskBody({ d, about, open }: { d: DecisionState; about: string; open: boolean }) {
  return (
    <>
      <div class="q">{d.question}</div>
      <div class="dl draft-first">
        {d.draft!.first}
      </div>
      {open ? (
        // D482: the action first, declining as quiet text after it.
        <div class="dk-acts">
          <Btn kind="primary" label={t("draft.see")} about={about} onClick={() => seeDraft(d.findId!)} />
          <Btn kind="text" label={t("decision.hold")} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
        </div>
      ) : (
        <Resolved d={d} />
      )}
    </>
  );
}

export function DecisionBody({ d, taskId }: { d: DecisionState; taskId?: string }) {
  useTick(1000);
  const open = !d.resolved && !d.pending;
  const about = (() => {
    const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
    return task && title(task) ? title(task) : d.question.slice(0, 40);
  })();
  // D436: the errand's stop, and a step on a page that's the person's: both open the task's tab live.
  if (d.checkout) return <CheckoutBody d={d} />;
  if (d.signIn?.step) return <StepBody d={d} />;
  if (d.signIn) return <SignInBody d={d} />;
  // D385: a plan card opened as a sheet or on On hand: the plan, not a generic Go.
  if (d.src?.kind === "plan") return <PlanCard d={d} bare />;
  // D217: a phone task's Go for one tap, or the user's own turn on the phone.
  if (d.phone) return <PhoneAskBody d={d} />;
  if (d.handset) return <HandsetAskBody d={d} />; // D238
  // D191: a payment names merchant, amount and card and asks for the security code; a first use asks OK.
  if (d.pay) return <PayBody d={d} />;
  if (d.fill) return <FillBody d={d} />;
  // D233: a task asks for a key: the field is on the card itself, never a reply.
  if (d.key) return <KeyBody d={d} />;
  // D539: copy a key from another of the person's computers: what, from, to; Copy or Not now.
  if (d.copyKey) return <CopyKeyBody d={d} />;
  if (d.call) return <CallDecision d={d} />;
  // D403: a reply already written: its first line, 先等等 and 看草稿 (the card in the conversation); never Send here.
  if (d.draft && d.findId) return <DraftAskBody d={d} about={about} open={open} />;
  // D157: wait for a computer (the default) or do it now on another; built in the user's words.
  const wa = d.where ? whereAsk(d.where) : undefined;
  // D382: put off: the question, when it asks again, and Decide now; nothing else until it is back.
  if (open && d.later)
    return (
      <>
        <div class="q">{d.memPlugin ? t("memp.card.question", harnessName(d.memPlugin.harness), d.memPlugin.deviceName) : d.question}</div>
        <LaterAway d={d} about={about} />
      </>
    );
  return (
    <>
      {open && <LaterBack d={d} />}
      <div class="q">{wa?.question ?? (d.closing ? closingWords(d.closing).question : d.memPlugin ? t("memp.card.question", harnessName(d.memPlugin.harness), d.memPlugin.deviceName) : d.question)}</div>
      {open && <LookLine left={d.look?.left} at={`go:${d.decisionId}`} />}
      {d.routineId && <RoutineFacts routineId={d.routineId} />}
      {d.cal && <CalFacts c={d.cal} />}
      {d.src && <SourceCardBody src={d.src} />}
      {d.board && <BoardOfferFacts b={d.board} />}
      {/* D157: a where ask says its own lines (what waiting means, what moving does) in place of the default. */}
      {open && wa && wa.lines.map((l, i) => <div key={i} class={`dl${l.widen ? " widen" : ""}`}>{l.text}</div>)}
      {open ? (
        // D482: the one grammar: the action first, the other ways as quiet text, the default once.
        <DecideRow d={d} about={about} dflt={!wa && !d.cal} />
      ) : d.cal ? (
        <CalSettle d={d} />
      ) : (
        <Resolved d={d} />
      )}
      {/* D481: what was typed into an ask answered elsewhere stays, to send as a message or discard. */}
      {!open && (A.replyDraft.get(d.decisionId) ?? "").trim() && <LeftDraft d={d} text={(A.replyDraft.get(d.decisionId) ?? "").trim()} />}
    </>
  );
}

/** D170 (X1): asked for one of the user's own agents: its coin, who it is and where it works stand
 *  where a task's title would; the coin bobs while it waits on the user. */
function PeerAsker({ d }: { d: DecisionState }) {
  return (
    <div class="asker peer">
      <span>{askerText(d.asker!)}</span>
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
      if (ref.current) centerIn(ref.current); // D535: its own list only, never the page
      A.flash = undefined;
    }
  }, [flash]);
  const id = taskId || d.taskId;
  const task = id ? A.S.tasks.get(id) : undefined;
  return (
    <div ref={ref} class={`decision${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-look={task && !inTask ? A.lookOf(task.card?.persona) : undefined}>
      {d.asker && <PeerAsker d={d} />}
      {task && title(task) && !inTask && (
        // Who asks and about what (D127): the agent's coin and the task's short title, the way into it.
        <button class="asker" title={title(task)} onClick={() => ((A.sheet = null), A.go({ name: "task", id: task.id }))}>
          {/* D546: whose task asks, as its row says it (more than one partner). */}
          <PartnerMark persona={task.card?.persona} />
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
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t("signin.open")} about={site} onClick={() => A.openLive(d.decisionId, site, liveSize())} />
          <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("signin.later")} about={site} onClick={() => A.decide(d.decisionId, "hold")} />
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
  const d = (!sameWords(detail, title(task)) && detail) || stateLabel(a);
  // Who is doing it ends the line while it is under way, with why when it isn't the plain pick (D89).
  // D291: each its own small element, spaced by the gap.
  const [who, why] = whoLine(task);
  const live = who.length > 0 && !finished(task) && a !== "dropped";
  return (
    <button class="taskline" aria-label={spoken(A.L, title(task) || t("task.unknown"), d, ...who)} onClick={() => A.go({ name: "task", id: task.id })}>
      <span class="ic">
        <StateMark a={a} />
      </span>
      <span class="t">{title(task) || t("task.unknown")}</span>
      <span class="s">
        <Facts items={[d, ...(live ? who : []), live && why]} />
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
  A.toast(t("evidence.copied", ev.ref));
}

/** The changes in words: "2 files changed". A label that already counts them stands; else they
 *  are counted from the task's edits, else from the files it named; "See changes" when nothing
 *  counts them (a bare "commit" or a hash says nothing to a person). */
function changesLabel(task: Task, changed: EvidenceRef[]): string {
  const counted = changed.find((e) => e.kind === "diff" && /\d+\s*(files?\b|个文件)/i.test(e.label));
  if (counted && inTongue(counted.label, A.readerLang(task))) return counted.label;
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
            {proofLabel(ev, A.readerLang(task))}
            <Chev />
          </button>
        ) : (
          <span key={i} class="mk" title={ev.ref}>
            {/* A reproduction failed on purpose: a quiet ×, never a ✓ (the run after it carries the ✓). */}
            {failed ? <Cross /> : isRepro(ev) ? <span class="repro"><Cross /></span> : machineChecked(ev.kind) ? <span class="ok"><Check /></span> : null}
            {/* D154: the task's label when it is in the reader's language or a name, else neutral. */}
            {proofLabel(ev, A.readerLang(task))}
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
function outsideLine(task: Task): { line: string; more: number } {
  if (!task.historyLoaded) return { line: "", more: 0 };
  const acts = outsideActs(task);
  if (!acts.length) return { line: "", more: 0 };
  return { line: outsideSentence(acts[0]!, (placeOf(task) as { branch?: string }).branch), more: acts.length - 1 };
}

/** Why the last Open draft PR didn't work, in words, or "". It stays on the task until the next
 *  try or the next result, not a toast that is gone in 4 seconds. */
function prFailure(task: Task): string {
  const a = task.acted;
  if (!a || a.ok || a.action !== "open_pr") return "";
  return noRemote(task) ? t("result.pr.noremote") : t("result.pr.failed", a.message ?? "");
}


/**
 * D437: what another AI still found when it looked the result over (or what a Go would send), said
 * plainly where the person decides: its lead, then each thing on its own line (D291). Nothing when
 * the look was clean or the task fixed what it found.
 */
export function LookLine({ left, at }: { left?: string[]; at: string }) {
  if (!left?.length) return null;
  return (
    <>
      <div class="look-line" role="note">
        <span class="lead">{t("look.lead")}</span>
        {left.map((l, i) => (
          <span key={i} class="it" dir="auto">
            {l}
          </span>
        ))}
      </div>
      {/* D451: the first time, what it is and why only these are left. */}
      <FirstMeetLine name="look" at={at} />
    </>
  );
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
    {inTask && <LookLine left={reportOf(task)?.look?.left} at={`task:${task.id}`} />}
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
          {/* D484: a draft PR already opened is seen, never offered again. */}
          {taskPr(task) ? (
            <Btn kind="secondary" label={t("info.pr.open")} about={title(task)} onClick={() => window.open(taskPr(task), "_blank", "noopener")} />
          ) : (
            !noRemote(task) && <Btn kind="secondary" label={t("result.pr")} about={title(task)} onClick={() => A.taskAction(task.id, "open_pr")} />
          )}
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
  const { line, more } = outsideLine(task);
  if (!line) return null;
  // D291: how many more went out is its own muted count, not joined to the action.
  return (
    <div class="proof">
      <span class="mk">
        <Out />
        {line}
      </span>
      {more > 0 && <span class="n">{t("result.more", more)}</span>}
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
    <button class="tb" aria-expanded={open} aria-label={about ? spoken(A.L, t(open ? "details.hide" : "details.show"), about) : undefined} onClick={() => A.toggleDetails(k)}>
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
  return <button class="tb act" aria-label={spoken(A.L, t("result.merge", base), title(task))} onClick={() => A.taskAction(task.id, "merge")}>{t("result.merge", base)}</button>;
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

/**
 * D329: one Noted line. Taken back: "Not kept" alone. Otherwise what it noted, then (each its own
 * element, D291) the memory it took the place of, and that it waits for Nowledge Mem; Undo while the
 * person hasn't said anything since, then Forget (which asks).
 */
export function NotedLine({ n }: { n: { seq: number; title: string; replaced?: string; waiting?: true } }) {
  const st = A.notedState(n.seq);
  if (st.undone)
    return (
      <div class="proof noted-line undone">
        <span class="mk">{t("memory.undone", n.title)}</span>
      </div>
    );
  return (
    <div class="proof noted-line">
      <span class="mk">{t("memory.noted", n.title)}</span>
      {n.replaced && <span class="nq">{t("memory.replaced", n.replaced)}</span>}
      {st.waiting && <span class="nq">{t("memory.waiting")}</span>}
      {st.failed && <span class="nq failed">{t("memory.undo.failed")}</span>}
      {st.fresh ? (
        <button class="qlink" aria-label={spoken(A.L, t("memory.undo"), n.title)} onClick={() => A.undoNoted(n.seq)}>
          {t("memory.undo")}
        </button>
      ) : (
        <button class="qlink" onClick={() => A.forget(n.seq)}>
          {t("partner.memory.forget")}
        </button>
      )}
    </div>
  );
}

/** Under a partner message: one quiet row (Merge into main, Details), then Details when open. */
function Quiet({ k, tasks, detail, noted = [] }: { k: string; tasks: Task[]; detail?: string; noted?: { seq: number; title: string; replaced?: string; waiting?: true }[] }) {
  if (!tasks.length && !noted.length) return null;
  const open = A.detailsOpen(k);
  // D444: what it just noted shows once, quietly, under the reply, until the person says anything
  // next (then it folds into Details like the rest); 别记这个 is one tap while it shows.
  const shown = noted.filter((n) => A.notedState(n.seq).fresh);
  const folded = noted.filter((n) => !shown.includes(n));
  if (!tasks.length && !folded.length)
    return (
      <>
        {shown.map((n) => (
          <NotedLine key={n.seq} n={n} />
        ))}
      </>
    );
  return (
    <>
      {shown.map((n) => (
        <NotedLine key={n.seq} n={n} />
      ))}
      {/* What went out is never folded away (D104): the exception that matters to trust. */}
      {tasks.filter(finished).map((task) => (
        <SentLine key={task.id} task={task} />
      ))}
      {/* D437: what another AI still found is never folded away either: it is what to look at. */}
      {tasks.filter(finished).map((task) => (
        <LookLine key={`look-${task.id}`} left={reportOf(task)?.look?.left} at={`result:${task.id}`} />
      ))}
      {/* D439: what the page check still found in a document to send, likewise. */}
      {tasks.filter(finished).map((task) => (
        <DocLine key={`doc-${task.id}`} left={reportOf(task)?.doc?.left} at={`result:${task.id}`} />
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
          {folded.map((n) => (
            <NotedLine key={n.seq} n={n} />
          ))}
        </div>
      )}
    </>
  );
}

function JobRow({ e, chipOwner, noted, join, rk, ans }: { e: Entry; chipOwner: Map<string, number>; noted: { seq: number; title: string; replaced?: string; waiting?: true }[]; join?: boolean; rk?: string; ans?: { seq: number; quote: string } }) {
  const j = e.job!;
  const st = j.status;
  const task = st?.taskId ? A.S.tasks.get(st.taskId) : undefined;
  const own = task && title(task) && chipOwner.get(task.id) === e.firstSeq;
  return (
    <div class={`partner${join ? " join" : ""}`} data-reply={j.ack ? rk : undefined} data-seq={e.firstSeq}>
      {/* D256: the pebble rests beside the bubble itself, on its bottom line. */}
      {j.ack && (ans ? (
        <div class="bubble has-reply">
          <Imprint from="you" quote={ans.quote} seq={ans.seq} />
          <span class="words" dir="auto">{j.ack.text}</span>
          <HoverReply k={rk} />
        </div>
      ) : (
        <div class="bubble" dir="auto">
          {j.ack.text}
          <HoverReply k={rk} />
        </div>
      ))}
      {j.ack && <RecallLine seq={e.firstSeq} />}
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

/** D549: the task couldn't start and its own fixes hold 换谁来做: the meta line leaves its link out (shown once). */
function cantSwitches(task: Task): boolean {
  const c = attention(task) === "failed" ? cantOf(task) : undefined;
  return !!c && cantFixes(c).some((f) => f.act === "switch");
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
  if (wait > 0) return <Presence kind="result" />;
  // D154: the task's own sentence only when it is in the reader's language; else just what came
  // of it, by its title (the opened task keeps its words).
  // D549: a task that couldn't start says why without the card's own lead (没能开始：), which
  // "{title}没做成：" already says: never two leads in one sentence.
  const cant = it.kind === "failed" && task ? cantOf(task) : undefined;
  const said = cant ? cantClause(cant) : sayable(it.text, A.readerLang(task));
  const kind = it.kind === "failed" ? "living.failed" : "living.done";
  const text = said ? (it.title ? t(kind, it.title, said) : said) : t(`${kind}.short`, it.title || t("living.it"));
  return (
    <div class="partner">
      <div class="bubble" dir="auto">{text}</div>
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
  // D291: the task's name leads in its own weight, then what happened; never joined by a dot.
  return (
    <button class="line" onClick={() => it.taskId && A.go({ name: "task", id: it.taskId })}>
      <span class="ic">{it.kind === "done" ? <Check /> : it.kind === "blocked" ? <Clock /> : it.kind === "failed" ? <Cross /> : <Forward />}</span>
      <span class="tx">
        {it.title && <b class="lead">{it.title}</b>}
        {it.text}
      </span>
    </button>
  );
}

const openAsk = (d?: DecisionState) => !!d && !d.resolved && !d.pending;
const dueAt = (d: DecisionState) => (d.defaultAt ? Date.parse(d.defaultAt) : Infinity);

/** One ask in the partner's words (D104): the question as it speaks, its default in one muted
 *  line with Details, and, when it is the one being asked, Reply… · Hold · Go in one small row. */
function Ask({ d, taskId, buttons = true, rk, seq }: { d: DecisionState; taskId?: string; buttons?: boolean; rk?: string; seq?: number }) {
  useTick(1000);
  const ref = useRef<HTMLDivElement>(null);
  const flash = A.flash === d.decisionId;
  useEffect(() => {
    if (flash) {
      if (ref.current) centerIn(ref.current); // D535: its own list only, never the page
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
  if (wait > 0) return <Presence kind="relay" />;
  // D151: a sign-in ask opens the live view instead of Go.
  // D193: a call's Go card or a question from the line: the whole card, in the conversation too.
  if (d.call)
    return (
      <div ref={ref} class={`partner askq call${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="decision">
          <CallDecision d={d} />
        </div>
      </div>
    );
  // D238: may this task borrow the person's own phone (one card, no default).
  if (d.handset)
    return (
      <div ref={ref} class={`partner askq pay handset${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || handsetAskTitle(d)}</div>
        {(buttons || !open) && <HandsetAskBody d={d} compact />}
      </div>
    );
  if (d.phone)
    return (
      <div ref={ref} class={`partner askq ${d.phone.kind === "user" ? "signin" : "pay"}${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || d.question}</div>
        {(buttons || !open) && <PhoneAskBody d={d} compact />}
      </div>
    );
  // D436: 去付款 / Go to checkout, receipt-like, its picture on the card; a step that's theirs.
  if (d.checkout)
    return (
      <div ref={ref} class={`partner askq pay checkout${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || t("co.title", d.checkout.site)}</div>
        {(buttons || !open) && <CheckoutBody d={d} compact />}
      </div>
    );
  if (d.signIn?.step)
    return (
      <div ref={ref} class={`partner askq signin${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || t("step.title", d.signIn.site)}</div>
        {(buttons || !open) && <StepBody d={d} compact />}
      </div>
    );
  if (d.signIn)
    return (
      <div ref={ref} class={`partner askq signin${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || t("signin.title", d.signIn.site)}</div>
        {(buttons || !open) && <SignInBody d={d} compact />}
      </div>
    );
  // D191: 付款 / Pay and a first use: the facts and the code on the card itself, never in prose.
  if (d.pay || d.fill)
    return (
      <div ref={ref} class={`partner askq pay${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
        <div class="bubble" dir="auto">{d.said || (d.pay ? t("pay.title", d.pay.site) : fillTitle(d.fill!))}</div>
        {(buttons || !open) && (d.pay ? <PayBody d={d} compact /> : <FillBody d={d} compact />)}
      </div>
    );
  // D233: {task} 需要一个密钥 / {task} needs a key, receipt-like, the field on the card.
  if (d.key)
    return (
      <div ref={ref} class={`partner askq pay key${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="bubble" dir="auto">{t("key.title", keyTask(d))}</div>
        {(buttons || !open) && <KeyBody d={d} compact />}
      </div>
    );
  // D539: 复制密钥 / Copy a key, receipt-like: the facts and the two buttons on the card itself.
  if (d.copyKey)
    return (
      <div ref={ref} class={`partner askq pay key copykey${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
        <div class="bubble" dir="auto">{copyKeyTitle(d)}</div>
        {(buttons || !open) && <CopyKeyBody d={d} compact />}
      </div>
    );
  return (
    <div ref={ref} class={`partner askq${flash ? " flash" : ""}`} id={`d-${d.decisionId}`} data-reply={rk} data-seq={seq}>
      {d.asker && <PeerAsker d={d} />}
      <div class="bubble" dir="auto">{d.said || d.question}</div>
      {/* D222: a calendar change: what, when, where and who hears, before one Go. */}
      {d.cal && <CalFacts c={d.cal} />}
      {/* D341: a write-back to a to-do's app: the comment whole, as it goes out. */}
      {d.src && <SourceCardBody src={d.src} />}
      {d.board && <BoardOfferFacts b={d.board} />}
      {/* D437: what another AI still found in what this Go sends. */}
      {open && <LookLine left={d.look?.left} at={`go:${d.decisionId}`} />}
      {/* A routine's proposal card (D29, D114): what it would do, before one Go. */}
      {d.routineId && open && <RoutineFacts routineId={d.routineId} />}
      {open && d.later ? (
        // D382: put off: when it asks again, and Decide now.
        <LaterAway d={d} about={about} />
      ) : open ? (
        <>
          <LaterBack d={d} />
          {/* One compact card under the words (D129; D482: one grammar): the action first, named by
              what it does; 先不用 · 回复… · 晚点再问我 as quiet text after it; the default once, inside
              the card; Reply… opens its field in place of the row. */}
          {buttons ? (
            <div class="tray dk-card">
              <DecideRow d={d} about={about} sm dflt={!d.cal} foot={task && title(task) ? <DetailsToggle k={k} about={about} /> : undefined} />
            </div>
          ) : (
            !d.cal && (
              <div class="dflt">
                <span>{defaultInfo(d, Date.now()).line}</span>
                {task && title(task) && <DetailsToggle k={k} about={about} />}
              </div>
            )
          )}
          {task && A.detailsOpen(k) && (
            <div class="det">
              <TaskLine task={task} />
              {d.said && d.question && <div class="its">{t("decision.its_words", d.question)}</div>}
            </div>
          )}
        </>
      ) : d.cal ? (
        <CalSettle d={d} />
      ) : (
        // Answered: one tiny line on the user's side, in their own words.
        <>
          <div class="said" role="status">
            {answeredWords(d)}
          </div>
          {draft.trim() && <LeftDraft d={d} text={draft.trim()} />}
        </>
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
      {away && <div class="when"><Facts items={[t("living.away"), clockOf(e.ev.ts)]} /></div>}
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
  if (e.ai) return !replyTasks(e, chipOwner).length && !A.notedFor(e).length && !A.recalledUnder(e.firstSeq);
  if (e.job) {
    const st = e.job.status;
    if (!e.job.ack || A.notedFor(e).length || A.recalledUnder(e.firstSeq)) return false;
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

/** D256: a picture-only message's pebble stands left of its pictures: one picture's shape (as
 *  Pictures sizes it) for the CSS to place it by; a grid is --pics-w wide. */
function picsAspect(media: MediaRef[]): JSX.CSSProperties | undefined {
  const pics = media.filter(isImage);
  const one = pics.length === 1 ? pics[0] : undefined;
  return one?.w && one.h ? { "--pa": (one.h / one.w).toFixed(4) } as JSX.CSSProperties : undefined;
}

/** D236: the user's words, with the imprint of what they reply to pressed into the top of the bubble. */
export function UserWords({ text, reply, cls, rk, seq, peb, refs }: { text: string; reply?: Bodies["user_msg"]["reply"]; cls: string; rk?: string; seq?: number; peb?: string; refs?: Bodies["user_msg"]["refs"] }) {
  // D256: under pictures (peb), the words carry the whole message's pebble, on its last line.
  const k = rk ?? peb;
  // D534: what the words refer to with @ or /, drawn as chips where their names stand.
  if (!reply) return <div class={cls} dir="auto" data-reply={rk} data-seq={seq}><WordsWithRefs text={text} refs={refs} /><HoverReply k={k} /></div>;
  return (
    <div class={`${cls} has-reply`} data-reply={rk} data-seq={seq}>
      <SentImprint r={reply} />
      {text && <span class="words" dir="auto"><WordsWithRefs text={text} refs={refs} /></span>}
      <HoverReply k={k} />
    </div>
  );
}

/** D236: a partner answer that comes after other messages shows which reply it answers. */
function answerOf(e: Entry, prevUser: number | undefined) {
  const to = e.ai?.replyTo ?? e.job?.ack?.replyTo;
  if (!to || to === prevUser) return undefined;
  const u = A.S.channel.find((x) => x.firstSeq === to)?.user;
  return u?.reply ? { seq: to, quote: plainWords(u.text) } : undefined;
}

/**
 * D303: a message with blocks: its words in bubbles, each block drawn where its plain text stood.
 * The first bubble keeps the reply's imprint and the pebble; the words after a block stack under it.
 */
function RichWords({ e, ans, rk }: { e: Entry; ans?: { seq: number; quote: string }; rk?: string }) {
  const parts = splitRich(e.ai!.text, e.ai!.ui);
  const after = A.S.channel.slice(A.S.channel.indexOf(e) + 1);
  const next = after.find((x) => x.user);
  const live = !next;
  let first = true;
  return (
    <>
      {parts.map((p) => {
        if ("block" in p) return <RichBlock b={p.block} at={{ seq: e.firstSeq, index: p.index, live, ...(next?.user ? { picked: next.user.text.trim() } : {}) }} />;
        const head = first;
        first = false;
        const words = <div class="md" dir="auto" dangerouslySetInnerHTML={{ __html: markdown(p.words, t("reply.copy")) }} />;
        return head && ans ? (
          <div class="bubble has-reply">
            <Imprint from="you" quote={ans.quote} seq={ans.seq} />
            {words}
            <HoverReply k={rk} />
          </div>
        ) : (
          <div class={`bubble${head ? "" : " join"}`}>
            {words}
            {head && <HoverReply k={rk} />}
          </div>
        );
      })}
    </>
  );
}

function EntryView(p: { e: Entry; chipOwner: Map<string, number>; livingItems: (e: Entry) => LivingItem[]; join?: boolean; prevUser?: number }) {
  // D426: the several things a message asked for stand under its words, line by line.
  const a = p.e.user ? p.e.asks : undefined;
  if (a && a.lines.length >= 2)
    return (
      <>
        <EntryBody {...p} />
        <AskLines a={a} />
      </>
    );
  return <EntryBody {...p} />;
}

function EntryBody({ e, chipOwner, livingItems, join, prevUser }: { e: Entry; chipOwner: Map<string, number>; livingItems: (e: Entry) => LivingItem[]; join?: boolean; prevUser?: number }) {
  const rk = replyKey(replyOf(e));
  if (e.user) {
    // D405: an app's ask, or words typed in an app's sheet: a small line names the app (a tap opens it).
    if (e.user.app) {
      const a = e.user.app;
      // An app's own ask is not the person's words: a neutral bubble on the left, under the app's name.
      if (a.ask)
        return (
          <div class="app-asked" data-seq={e.firstSeq}>
            <button type="button" class="user-app-from" onClick={() => openApp(a.id)}>
              {APP_GLYPH(14)}
              <span>{t("app.asks", a.name)}</span>
            </button>
            <div class="app-asked-bubble" dir="auto">
              {e.user.text}
            </div>
          </div>
        );
      return (
        <div class={`user-m user-app${join ? " join" : ""}`} data-reply={rk} data-seq={e.firstSeq}>
          <button type="button" class="user-app-from" onClick={() => openApp(a.id)}>
            {APP_GLYPH(14)}
            <span>{t("app.about", a.name)}</span>
          </button>
          <UserWords text={e.user.text} reply={e.user.reply} refs={e.user.refs} cls="user" peb={rk} />
        </div>
      );
    }
    // D486: the person's words for this partner, said to another and passed on by it: a small line names who.
    if (e.user.passed)
      return (
        <div class={`user-m user-app${join ? " join" : ""}`} data-reply={rk} data-seq={e.firstSeq}>
          <PassedFrom from={e.user.passed.from} />
          <UserWords text={e.user.text} reply={e.user.reply} refs={e.user.refs} cls="user" peb={rk} />
        </div>
      );
    // D206: the pictures stand above the words, on their own, as in a messaging app.
    if (!e.user.media?.length) return <UserWords text={e.user.text} reply={e.user.reply} refs={e.user.refs} cls={`user${join ? " join" : ""}`} rk={rk} seq={e.firstSeq} />;
    return (
      <div class={`user-m${join ? " join" : ""}`} data-reply={rk} data-seq={e.firstSeq} style={picsAspect(e.user.media)}>
        <MediaBlock media={e.user.media} side="user" ctx={{ kind: "conv" }} />
        {e.user.text || e.user.reply ? <UserWords text={e.user.text} reply={e.user.reply} refs={e.user.refs} cls="user" peb={rk} /> : <HoverReply k={rk} copy={false} />}
      </div>
    );
  }
  if (e.ai) {
    const ans = answerOf(e, prevUser);
    const from = A.peerOrigin.get(e.ev.seq);
    return (
      <div class={`partner${join ? " join" : ""}${e.ai.cal ? " has-cal" : ""}${e.ai.ui?.length ? " has-rich" : ""}${e.ai.first ? " first" : ""}`} data-reply={rk} data-seq={e.firstSeq}>
        {/* D470: where the partner's words came from, one quiet line (its coin, the agent), opening the thread. */}
        {from && (
          <button type="button" class="peer-origin" onClick={() => A.openSettings("peers")}>
            <Coin harness={peerHarness(peerName(from))} size={18} />
            <span>{capFirst(t("peer.origin", peerName(from)))}</span>
          </button>
        )}
        {/* D298: the clay partner over its first words, while nothing else was said. */}
        {e.ai.first && !e.ai.first.look && firstOpening() && (
          <span class="first-face">
            <Avatar size={128} state="idle" />
          </span>
        )}
        {/* D256: the pebble rests beside the bubble itself, on its bottom line (a day card or
            pictures under the words never move it). */}
        {e.ai.ui?.length ? (
          <RichWords e={e} ans={ans} rk={rk} />
        ) : (e.ai.text || (!e.ai.cal && !e.ai.app && !e.ai.shelf)) && (ans ? (
          <div class="bubble has-reply">
            <Imprint from="you" quote={ans.quote} seq={ans.seq} />
            <div dir="auto" dangerouslySetInnerHTML={{ __html: markdown(e.ai.text, t("reply.copy")) }} />
            <HoverReply k={rk} />
          </div>
        ) : (
          <div class="bubble">
            <div class="md" dir="auto" dangerouslySetInnerHTML={{ __html: markdown(e.ai.text, t("reply.copy")) }} />
            <HoverReply k={rk} />
          </div>
        ))}
        {/* D222: the day card under the partner's words (or alone in its column). */}
        {e.ai.cal && <DayCard g={e.ai.cal} />}
        {/* D206: what a task showed, under the partner's words about it. */}
        {e.ai.media?.length ? <MediaBlock media={e.ai.media} side="partner" ctx={{ kind: "conv" }} /> : null}
        {/* D405: the app this message made or changed, under its words. */}
        {e.ai.app && <AppCardView c={e.ai.app} />}
        {/* D511: the Keep this turn made: its receipt card under the words. */}
        {e.ai.keep && <KeepReceipt card={e.ai.keep} />}
        {e.ai.shelf && <ShelfCard />}
        {e.ai.first && <FirstAfter fw={e.ai.first} />}
        <RecallLine seq={e.firstSeq} />
        <ReadingLine seq={e.firstSeq} />
        <Quiet k={`m${e.firstSeq}`} tasks={replyTasks(e, chipOwner)} noted={A.notedFor(e)} />
      </div>
    );
  }
  if (e.job) return <JobRow e={e} chipOwner={chipOwner} noted={A.notedFor(e)} join={join} rk={rk} ans={answerOf(e, prevUser)} />;
  if (e.living) return <Living e={e} items={livingItems(e)} chipOwner={chipOwner} />;
  if (e.finds) return <FindsNote n={e.finds} join={join} seq={e.ev.seq} seqs={`${e.firstSeq} ${e.ev.seq}`} />;
  // D385: a set of to-dos the partner found, tickable, opening the hand-over sheet.
  if (e.set) return <SetCard s={e.set} seq={e.firstSeq} />;
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    if (!d) return null;
    // D385: plan first's card: the plan itself, its parts and its three answers.
    if (d.src?.kind === "plan") return <PlanCard d={d} seq={e.firstSeq} />;
    return <Ask d={d} rk={rk} seq={e.firstSeq} />;
  }
  if (e.peer) {
    // A question it asked shows once, as its card (which already says who asks).
    const asked = e.peer.direction === "in" && [...A.S.decisions.values()].some((d) => d.asker?.messageId === e.peer!.messageId);
    // D321: the very first message from another agent explains itself once, under its line (or before its card).
    // D418: the partner marks that one (`first`); a window of the Log can't tell which is first.
    const first = e.peer.direction === "in" && !!e.peer.first;
    return (
      <>
        {/* D470: a request the partner's own next words say keeps no line of its own (its origin stands over them). */}
        {!asked && !A.peerSpoken.has(e.ev.seq) && !(e.peer.state === "ping" && A.S.pings.get(e.ev.seq)?.told) && <PeerLine b={e.peer} ts={e.ev.ts} seq={e.ev.seq} />}
        {first && <FirstPeerNote b={e.peer} />}
      </>
    );
  }
  return null;
}

/** D321: the first time another agent reaches the partner: who, how, and where the answers go. Shown once, by place. */
function FirstPeerNote({ b }: { b: Bodies["bridge_msg"] }) {
  const who = peerName(b);
  // D418: one of the person's own agents reads as theirs, connected, not a stranger that found Ducter.
  return (
    <div class="peer-first" role="note">
      <Coin harness={peerHarness(who)} size={28} />
      <p>{capFirst(t(b.mine ? "peer.first.own" : "peer.first.note", who, A.settings?.name ?? "Ducter"))}</p>
    </div>
  );
}

/** One quiet line about the user's other agents (D170, J-Q5): who, and what, never Bridge words. */
export function peerLineText(b: Bodies["bridge_msg"], ts: string, setAside?: number, ping?: PingGroup): string {
  // D273: an agent is named by what it is ("Claude Code"); D418: one of the person's own agents named
  // by its own words reads as theirs (你的 Codex（Mem 协作）); Mem may not say who sent it (nmem stores
  // "another agent"): then the tool it runs in, else 你自己的一个 agent when it is theirs, else 一个没留名字的 agent.
  const who = peerName(b);
  if (b.direction === "in" && b.state === "ping" && ping) return capFirst(pingText(who, ping, Date.parse(ts)));
  if (b.direction === "in" && b.state === "set_aside") return capFirst(t("peer.set_aside", who, String(setAside ?? 1)));
  if (b.direction === "in") {
    const gist = b.text.replace(/\s+/g, " ").trim();
    return capFirst(t("peer.in.other", who, gist.length > 40 ? gist.slice(0, 39) + "…" : gist));
  }
  void ts;
  return t(b.decisionId ? "peer.sent" : "peer.replied", who);
}

/** What an agent Ducter didn't start is called (D273): its own name, else the tool it runs in
 *  (Claude Code 里的 agent / an agent in Claude Code), else 一个没留名字的 agent / an unnamed agent. */
export function peerName(b: { agent?: string; from?: string; to?: string; host?: string; direction?: "in" | "out"; mine?: boolean; selfNamed?: boolean; role?: string; text?: string }): string {
  // D418: an own agent by its own words; a message logged before D418 is read the same way here.
  const self = b.mine && b.selfNamed && b.agent ? { agent: b.agent, ...(b.role ? { role: b.role } : {}) } : b.mine && !b.agent && !b.host && b.direction === "in" && b.text ? ownAgentSelf(b.text) : undefined;
  if (self) return self.role ? t("peer.yours.role", self.agent, self.role) : t("peer.yours", self.agent);
  const w = peerCalled(b, b.direction ?? (b.from ? "in" : "out"));
  return w.name ?? (w.host ? t("peer.in.host", w.host) : b.mine ? t("peer.own.someone") : t("peer.someone"));
}

/** D418: the folded line for an own agent's contact tests: how many, the earliest's age when late, and whether answered. */
export function pingText(who: string, g: PingGroup, at: number, now = Date.now()): string {
  const done = g.sent.size + g.failed.size;
  const status = g.failed.size ? (g.failed.size === g.n ? t("peer.ping.failed") : t("peer.ping.failed.some", g.failed.size)) : done < g.n ? t("peer.ping.answering") : t(g.n > 1 ? "peer.ping.answered.many" : "peer.ping.answered.one");
  const late = g.earliest !== undefined && at - g.earliest >= 60 * 60_000 ? ago(A.L, new Date(g.earliest).toISOString(), now) : "";
  if (g.n > 1) return late ? t("peer.ping.many.late", who, g.n, late, status) : t("peer.ping.many", who, g.n, status);
  return late ? t("peer.ping.one.late", who, late, status) : t("peer.ping.one", who, status);
}

/** "an unnamed agent asks you" starts a line as "An unnamed agent …" (D418: "your …", "one of your own …" too); an agent's own name stays as it is. */
const capFirst = (s: string) => (/^(an unnamed agent|an agent in |your |one of your own )/.test(s) ? s[0]!.toUpperCase() + s.slice(1) : s).replace(/） /g, "）");

/** Who asks on a card (D273): "Claude Code（~/dev/ducter）问你" / "Claude Code (~/dev/ducter) asks you". */
export function askerText(a: { agent: string; where?: string }): string {
  const who = a.agent === "another agent" ? peerName({}) : a.agent;
  return capFirst(a.where ? t("peer.asks.where", who, a.where) : t("peer.asks", who));
}

function PeerLine({ b, ts, seq }: { b: Bodies["bridge_msg"]; ts: string; seq?: number }) {
  const n = b.state === "set_aside" ? A.S.setAside.get(`${b.from}|${ts.slice(0, 10)}`)?.n : undefined;
  const ping = b.state === "ping" && seq !== undefined ? A.S.pings.get(seq) : undefined;
  // D444: what it handed over from Nowledge Mem, each its own element, by Mem's title.
  const refs = b.direction === "in" && !b.state ? (b.refs ?? []) : [];
  return (
    <div class={ping || refs.length ? "peerline wrap" : "peerline"} role="status">
      <span>{peerLineText(refs.length ? { ...b, text: withRefTitles(b.text, refs) } : b, ts, n, ping)}</span>
      {refs.filter((r) => !(r.uri && r.title && b.text.includes(r.uri))).map((r, i) => (
        <span key={i} class="peer-ref">
          {refWords(r)}
        </span>
      ))}
    </div>
  );
}

/** D444: a `nowledgemem://` address in the words reads as the thing's title (never the raw address). */
export function withRefTitles(text: string, refs: NonNullable<Bodies["bridge_msg"]["refs"]>): string {
  return text.replace(/nowledgemem:\/\/[^\s<>"'`)\]}，。；、]+/g, (u) => {
    const r = refs.find((x) => x.uri && u.replace(/[.,;:!?]+$/, "") === x.uri);
    return r?.title ? t("peers.ref.inline", r.title) : "";
  }).replace(/\s{2,}/g, " ");
}

/** D444: one thing a message handed over, by Mem's title (a shared plan says so), else by its kind. */
export function refWords(r: NonNullable<Bodies["bridge_msg"]["refs"]>[number]): string {
  if (!r.title) return t(`peers.ref.none.${r.kind}`);
  return r.kind === "plan" ? t("peers.ref.plan", r.title) : t("peers.ref", r.title);
}

/** While the user waits on a reply (D104): the clay partner where its words will appear, and
 *  one plain line of what it is doing, updated in place, gone when the reply lands. A step past
 *  15 s adds a reassuring line; past 45 s, that it will say when it's ready. */
function Presence({ kind }: { kind?: "result" | "relay" }) {
  useTick(1000);
  const a = A.S.activity;
  const lastUser = [...A.S.channel].reverse().find((e) => e.user);
  const since = a?.at ?? A.thinkingSince ?? (lastUser ? Date.parse(lastUser.ev.ts) : Date.now());
  const ms = Date.now() - since;
  // D425: the step acted out by the clay partner, its words in the person's terms.
  const step = kind ?? a?.step ?? "thinking";
  const w = kind ? { key: `activity.${kind}` } : aliveWords(a ?? { step: "thinking" });
  // A result being put into words has its own line and no "taking longer" (it ends in 2 minutes).
  const sub = kind ? "" : aliveSub(ms);
  const motion = aliveMotion(step, ms, stillMotion());
  return (
    <AliveLine
      class="presence"
      motion={motion}
      words={w.arg !== undefined ? t(w.key, w.arg) : t(w.key)}
      sub={sub ? t(sub) : undefined}
      figure={<Avatar size={32} state={aliveFace(step)} still={motion === "still"} />}
    />
  );
}

// ---------- header, composer ----------

/** D262: the way to the other places, at the end of every bar: 更新 while something waits to be
 *  updated, then the places (devices, On hand, Settings; on a phone's task and On hand without On
 *  hand). D270: always the drawn marks, at every width; here: the place shown, the knob. */
export function Places({ here, onHand = true }: { here?: "devices" | "onhand" | "apps" | "settings"; onHand?: boolean }) {
  const ua = A.updateAll;
  const running = !!ua?.plan && !ua.plan.finishedAt;
  const n = ua?.offer.length ?? 0;
  // D548: a narrow phone has one button for the places (the bar's middle keeps its one line).
  const narrow = useRoomy(NARROW);
  if (narrow) {
    const update = n > 0 || running ? [{ key: "update", label: running ? t("nav.updating") : n > 1 ? t("nav.update.n", n) : t("nav.update"), glyph: <UpdatePebble />, on: false, go: () => A.openSettings("devices") }] : [];
    return (
      <PlacesMenu
        dot={update.length > 0}
        segs={[
          ...update,
          ...(onHand || here === "onhand" ? [{ key: "onhand", label: t("nav.onhand"), glyph: <OnHandMark />, on: here === "onhand", go: () => A.go({ name: "onhand" }) }] : []),
          { key: "apps", label: t("apps.place"), glyph: <AppsMark />, on: here === "apps", go: () => openShelf() },
          { key: "devices", label: t("nav.devices"), glyph: <DevicesMark />, on: here === "devices", go: () => A.openSettings("devices") },
          { key: "settings", label: t("nav.settings"), glyph: <Gear />, on: here === "settings", go: () => A.openSettings() },
        ]}
      />
    );
  }
  return (
    <>
      {(n > 0 || running) && (
        <NavBtn
          label={running ? t("nav.updating") : n > 1 ? t("nav.update.n", n) : t("nav.update")}
          about={t("nav.update.about")}
          cls="update"
          short={!running && n > 1 ? String(n) : undefined}
          glyph={<UpdatePebble />}
          onClick={() => A.openSettings("devices")}
        />
      )}
      <PlaceSeg
        segs={[
          { key: "devices", label: t("nav.devices"), about: t("nav.devices.label"), glyph: <DevicesMark />, on: here === "devices", go: () => A.openSettings("devices") },
          ...(onHand ? [{ key: "onhand", label: t("nav.onhand"), about: t("nav.onhand"), glyph: <OnHandMark />, on: here === "onhand", go: () => A.go({ name: "onhand" }) }] : []),
          // D410: 你的小应用 / Your apps, one tap from every bar.
          { key: "apps", label: t("apps.place"), about: t("apps.place.about"), glyph: <AppsMark />, on: here === "apps", go: () => openShelf() },
          { key: "settings", label: t("nav.settings"), about: t("nav.settings"), glyph: <Gear />, on: here === "settings", go: () => A.openSettings() },
        ]}
      />
    </>
  );
}

function Top({ back, plus, level, extra, own, up }: { back?: string; plus?: boolean; level?: string; extra?: preact.ComponentChildren; /** D484: a phone's opened task: its own actions only, the places one Back away. */ own?: boolean; /** D535: a drill-in inside the place (a Keep's page): the bar's back goes up to the place's overview. */ up?: { label: string; go: () => void } }) {
  // D176: side by side, the conversation's own header carries the face and the places, and On hand
  // is already in view: its pane's header names it instead of going back to a conversation that is
  // there. D262: every bar is one anatomy: where you are, then the place's own actions, then the
  // way to the other places (one per screen: the conversation's, when the panes stand side by side).
  const wide = useWide();
  // D541: the others' faces in the bar on a phone, and on a fold (no list stands beside there).
  const phoneBar = usePhone();
  const fold = useSplit();
  // D548: up to 560 wide the bar is one line: the others, the name over its one count, the places.
  const narrow = useRoomy(NARROW);
  // D290: back at the conversation, the partner glances round at where you were (app.css .look).
  const face = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = face.current;
    if (!el || lastMove.kind !== "back" || Date.now() - lastMove.at > 1200) return;
    el.classList.add("look");
    const off = () => el.classList.remove("look");
    el.addEventListener("animationend", off, { once: true });
    const timer = setTimeout(off, 1200);
    return () => clearTimeout(timer);
  }, [!!(back || level)]);
  if (back || level)
    return (
      <header class="top">
        {wide && level && !up ? (
          <h1 class="level">{level}</h1>
        ) : (
          // Side by side, an opened task goes back to On hand: the conversation never left.
          // D262: the crumb is the place it goes back to, in one word, as on the Mac (‹ 对话).
          // D535: inside On hand (a Keep's page) it goes up one level, beside the conversation and
          // on a phone alike, as an opened task's does: ‹ 手头的事.
          <button class="back" aria-label={up ? up.label : wide ? t("nav.onhand") : back} onClick={() => (up ? up.go() : wide ? A.go({ name: "onhand" }) : history.length > 1 && location.hash ? history.back() : A.go({ name: "conv" }))}>
            <Back />
            {up ? up.label : wide ? t("nav.onhand") : t("nav.conversation")}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {/* 新建 / New task (D128): the place's own action, the bar's clay button, never a floating one. */}
        {plus && <NavBtn label={t("newtask.button")} about={`${t("newtask.button")} (⌘N)`} glyph={<PlusMark />} onClick={() => A.openNewTask()} />}
        {extra}
        {/* D184: wide, the level can take the whole screen; the same button brings it back. */}
        {wide && <FillButton level={level ? "onhand" : "task"} />}
        {/* D270: spacing alone parts this place's actions from the places. */}
        {!wide && !own && <Places onHand={false} />}
      </header>
    );
  return (
    <header class="top">
      {/* D270: two ways in. The face and the name open the partner's page (Settings is the visible
          way, D262); the counts under the name open On hand, narrowed to what they name when they
          name one thing. Each tints on its own under the pointer. */}
      {/* D513: on a phone with more than one partner, ‹ goes up to the list of them, with what waits elsewhere. */}
      {/* D545: beside the list (not a phone, not a fold), its toggle: narrower, hidden, back. */}
      {!phoneBar && !fold && <RailToggle />}
      {((!wide && phoneBar) || fold || (A.railMode === "hidden" && A.manyPartners())) && <PartnersBack />}
      <div class="who">
        {/* D497: with more than one partner, the figure is in its partner's own clay. D548: on a narrow
            phone with others beside, none (their stack holds the left; the composer says who); with one
            partner a small one (24) before its name. */}
        {!(narrow && A.manyPartners()) && (
          <button class="who-face" ref={face} tabIndex={-1} aria-hidden="true" data-look={A.shownPartner()?.look} title={t("nav.partner.about", A.S.personaName)} onClick={() => A.openSettings("partner")}>
            <Avatar size={narrow ? 24 : phoneBar && A.manyPartners() ? 34 : 44} />
          </button>
        )}
        <span class="who-words">
          <button class="name" onClick={() => A.openSettings("partner")} aria-label={t("nav.partner.about", A.S.personaName)} title={t("nav.partner.about", A.S.personaName)}>
            {A.S.personaName}
          </button>
          <Counts />
        </span>
      </div>
      <Places onHand={!wide} />
    </header>
  );
}

/** The conversation bar's counts line (D270): a quiet link to On hand while it says counts. */
function Counts() {
  const s = A.summaryParts();
  if (!s.link)
    return (
      <div class="sum" role="status">
        {s.words || " "}
      </div>
    );
  // D535: 「n 个等你」 is a door of its own (the next item that waits); the rest opens On hand.
  const rest = (s.parts ?? []).filter((p) => p !== s.needs);
  const toOnHand = () => ((OnHandState.filter = s.needs ? 0 : s.filter), (OnHandState.focus = ""), A.go({ name: "onhand" }));
  if (s.needs)
    return (
      <span class="sum-row" role="status">
        <CountDoor words={s.needs} about={t("door.line.about")} onClick={() => A.openDoor?.(barDoorPartner())} />
        {rest.length > 0 && (
          <button class="sum" title={t("nav.onhand")} aria-label={spoken(A.L, ...rest)} onClick={toOnHand}>
            <Facts items={rest} />
          </button>
        )}
      </span>
    );
  return (
    <button class={s.parts?.length ? "sum" : "sum none"} role="status" title={t("nav.onhand")} aria-label={s.words} onClick={toOnHand}>
      {s.parts?.length ? <Facts items={s.parts} /> : s.words}
    </button>
  );
}

/**
 * D532: the link lost for a while, said plainly above the composer (the Mac's linkLostNotice): what
 * is wrong, where to look, when it tries next, Try now; for a home elsewhere a quiet 再连一次 too.
 * The token and everything on screen stay; only the home's own word ends the pairing.
 */
export function LinkLost() {
  const lost = A.link() === "lost";
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lost) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [lost]);
  if (!lost) return null;
  const home = A.linkHome();
  const far = A.linkElsewhere();
  const left = Math.ceil(((A.conn?.nextAt ?? 0) - Date.now()) / 1000);
  return (
    <Notice
      class="link-lost"
      glyph="pebble"
      title={far ? t("conn.lost.title", home) : t("conn.lost.title.local")}
      body={far ? t("conn.lost.body", home) : t("conn.lost.body.local")}
      sub={left > 0 ? t("conn.retry.in", left) : t("conn.retrying")}
      actions={
        <>
          {far && A.onLinkAgain && <Btn kind="text" size="sm" label={t("conn.lost.again")} onClick={() => A.onLinkAgain?.()} />}
          <Btn kind="secondary" size="sm" label={t("conn.retry")} onClick={() => A.linkRetry()} />
        </>
      }
    />
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
    else (A.draft = v), voice().typed();
    A.changed();
  };
  const submit = (queue = false) => {
    // What is typed now, not this render's copy (Enter can come before the next render).
    const now = taskId ? (A.taskDrafts.get(taskId) ?? "") : A.draft;
    const ok = taskId ? A.sendToTask(taskId, now, false, queue) : A.sendMessage(now);
    if (ok) {
      // D305: words that came by voice went: their reply may be read aloud.
      if (!taskId) voice().sentDraft();
      set("");
    }
  };
  const label = taskId ? t("composer.task") : t("composer.label", A.S.personaName);
  // D268, D325, D530: while the task works, Return steers it (it reads it at its next step); ⌥↩, or
  // the send's own menu (right-click, a long press on a phone), holds it for after this turn; an
  // agent that can't steer holds it either way and says so. Stop (its pause) sits beside Send, one
  // family of clay buttons. Held words are chips over the composer.
  const task = taskId ? A.S.tasks.get(taskId) : undefined;
  const busy = !!task && attention(task) === "working";
  const canSend = !!value.trim() || !!pics.length;
  const agent = task ? harnessOf(task) : "";
  const steers = !isHarnessId(agent) || HARNESSES[agent].steer;
  // D542: an agent that can't steer says so in the words' place on every screen (no row under the box for it).
  // D547: longest first; the box shows the longest that fits its width, never a cut one.
  const name = A.S.personaName;
  const place: string[] = !taskId ? (A.replying ? [`${replyLabel(A.replying.from)}…`] : [t("composer.placeholder", name), t("composer.placeholder.short", name), t("composer.placeholder.bare")]) : !busy ? [t("composer.task")] : !steers ? [t("composer.nosteer.place", harnessName(agent)), t("composer.nosteer.place.short")] : coarse() ? [t("composer.task")] : [t("composer.steer.place"), t("composer.steer.place.short")];
  return (
    <div class="composer-wrap" ref={wrap}>
      <LinkLost />
      {(A.held?.taskId ?? "") === (taskId ?? "") && <Held />}
      <DropHint on={over} />
      {/* D305: hold to talk, over the conversation's composer. */}
      {!taskId && (talkIfAny()?.ui ?? "idle") === "idle" && !talkIfAny()?.note && <VoiceStrip />}
      {/* D442: 放手说 / Talk hands-free, over the composer (a sheet on a phone). */}
      {!taskId && <TalkPanel />}
      {task && <HeldChips task={task} busy={busy} steers={steers} agent={agent} />}
      <ComposerBox
        id={taskId ? "composer-task" : "composer"}
        mentions={{ where, task: !!taskId }}
        tiered={!!taskId}
        class={!taskId && A.replying ? "has-reply" : ""}
        value={value}
        onInput={set}
        onSend={() => submit()}
        canSend={canSend}
        label={label}
        placeholder={place}
        top={<Tray where={where} />}
        onKeyDownCapture={(ev) => {
          if (busy && ev.key === "Enter" && ev.altKey && !ev.isComposing) ev.preventDefault(), ev.stopPropagation(), submit(true);
        }}
        onKeyDown={(ev) => !taskId && ev.key === "Escape" && A.replying && (ev.preventDefault(), A.cancelReply())}
        before={
          <>
            {/* D236: what this replies to, pressed into the composer above the words. */}
            {!taskId && <ComposerReply />}
            <AddPictures where={where} />
          </>
        }
        {...(busy && steers ? { sendAlts: [{ words: t("send.steer"), onPick: () => submit() }, { words: t("send.after"), opt: true, onPick: () => submit(true) }] } : {})}
        tools={
          <>
            {/* D542: the model and effort, and the context ring (D288), in the composer's own row,
                before Stop and Send: no second row under the box. */}
            {task && <ComposerTune task={task} />}
            {task && <ContextButton task={task} />}
            {busy && (
              <button type="button" class="btn secondary icon stop" aria-label={t("task.action.pause")} title={`${t("task.action.pause")} (Esc Esc)`} onClick={() => A.taskAction(taskId!, "interrupt")}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="currentColor" />
                </svg>
              </button>
            )}
            {!taskId && <MicButton />}
          </>
        }
      />
      {/* D542: no row under the box, at rest or on focus (one that came with the focus moved the
          box under the finger): Return's two ways are in the words' place and the send's own menu. */}
    </div>
  );
}

/**
 * D325: what the person held for after this turn, in order, over the task's composer: each one
 * small, its words on one line; a tap edits it in place (Return saves, Esc cancels); 现在就说
 * steers it in now (only where its agent can steer), 不说了 takes it back. Read from the card, so
 * every window shows the same queue.
 */
export const heldHead = (busy: boolean, steers: boolean, agent: string): string => (!busy ? t("held.head.idle") : steers ? t("held.head") : t("held.head.nosteer", harnessName(agent)));

export function HeldChips({ task, busy, steers, agent }: { task: import("./store.ts").Task; busy: boolean; steers: boolean; agent: string }) {
  const held = task.card?.held ?? [];
  const [editing, setEditing] = useState<{ id: string; text: string } | undefined>();
  if (!held.length) return null;
  const save = (h: HeldMsg) => {
    if (editing && editing.id === h.id) A.heldOp(task.id, h.id, "edit", editing.text);
    setEditing(undefined);
  };
  // D348: nothing running (stopped, or the turn ended without taking them): "this turn" is gone;
  // they go first with the person's next message, so the head says that.
  const head = heldHead(busy, steers, agent);
  return (
    <div class="held-q" role="list" aria-label={head}>
      <div class="held-head">
        <span>{head}</span>
        {held.length > 1 && <span class="n">{held.length}</span>}
      </div>
      {held.map((h) =>
        editing?.id === h.id ? (
          <div key={h.id} class="hq editing" role="listitem">
            <textarea
              class="hq-edit"
              rows={1}
              value={editing.text}
              aria-label={t("held.edit")}
              ref={(el) => {
                if (!el || el.dataset.f) return;
                el.dataset.f = "1";
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
              }}
              onInput={(e) => setEditing({ id: h.id, text: (e.target as HTMLTextAreaElement).value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), setEditing(undefined);
                else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) e.preventDefault(), save(h);
              }}
            />
            <button type="button" class="btn text sm" onClick={() => setEditing(undefined)}>
              {t("held.cancel")}
            </button>
            <button type="button" class="btn secondary sm" disabled={!editing.text.trim()} onClick={() => save(h)}>
              {t("held.save")}
            </button>
          </div>
        ) : (
          <div key={h.id} class="hq" role="listitem">
            <button type="button" class="hq-words" title={t("held.edit")} dir="auto" onClick={() => setEditing({ id: h.id, text: h.text })}>
              {h.media?.length ? <span class="hq-pics">{h.media.length}</span> : null}
              <span class="w">{splitRefs(h.text).text}</span>
            </button>
            {(steers || !busy) && (
              <button type="button" class="btn text sm hq-now" onClick={() => A.heldOp(task.id, h.id, "now")}>
                {t("held.now")}
              </button>
            )}
            <button type="button" class="btn icon hq-drop" aria-label={t("held.drop")} title={t("held.drop")} onClick={() => A.heldOp(task.id, h.id, "drop")}>
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
              </svg>
            </button>
          </div>
        ),
      )}
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
  // D311: one ask at a time. While voice's own card is over the composer, this one steps out of
  // the way (its edge would peek out above it) and comes back when that card goes.
  const vp = voice().phase;
  if (vp === "ask" || vp === "denied" || vp === "off") return null;
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
        {/* Primary first, on the left (ui.md Buttons). */}
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
        <Btn kind="secondary" label={t("notify.later")} onClick={dismiss} />
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

/** D541: the bar and the composer stay mounted through a partner switch (they never move, and the
 *  composer keeps the keyboard); only the messages between them are the partner's own, made anew for
 *  each, landing where the reader was in it. */
export function Conversation() {
  return (
    <>
      {/* Offline is said once, in the header's line under the sleeping face (D73, D211). */}
      <Top />
      {/* D381: what is pinned, under the bar. */}
      <PinStrip />
      {/* D410: pinned apps, one tap each. */}
      <PinnedApps />
      <ConvBody key={A.S.persona || "shown"} />
      <Composer />
    </>
  );
}

function ConvBody() {
  const { rows, livingItems, chipOwner } = A.rows();
  const scroller = useRef<HTMLDivElement>(null);
  const dropping = useDropPaste(scroller, "");
  // D236: swipe right / long press / right click to reply; a selected part on a wide screen.
  const menu = useReplyGestures(scroller);
  const wide = useWide();
  let lastUser: number | undefined;
  // D254: keeping your place (conv-follow.tsx): following the end, the way back, the divider.
  const follow = useFollow(scroller, rows, A.pending.length);
  // D509: older messages page in as the reader nears the top, and the place is kept.
  const older = useOlder(scroller, rows);
  const divider = dividerSeq();
  const empty = rows.length === 0 && A.pending.length === 0 && A.S.welcomed;
  // D305: the reply to a message sent by voice, read aloud (with the setting on).
  const lastRow = rows.at(-1);
  useReadback(lastRow ? { seq: lastRow.firstSeq, ts: lastRow.ev.ts, text: lastRow.ai?.text ?? "", partner: !!lastRow.ai } : undefined);
  // D442: while talking hands-free, the partner's new messages and cards are said.
  useTalkFeed(rows);
  return (
    <>
      <main class="scroll" ref={scroller} role="log" aria-label={t("conv.log", A.S.personaName || "Ducter")} onScroll={(e) => (follow.onScroll(e.currentTarget as HTMLDivElement), older.onScroll(e.currentTarget as HTMLDivElement))}>
        <OlderWait />
        <div class="spacer" />
        <DropHint on={dropping} />
        {empty && <Hello />}
        {rows.map((e, i) => {
          const gap = timeGap(rows[i - 1], e);
          const prevUser = lastUser;
          if (e.user) lastUser = e.firstSeq;
          return (
            <Fragment key={e.firstSeq}>
              {e.firstSeq === divider && !e.ai?.first && <NewDivider />}
              {gap && !(e.living && A.livingAway.get(e.firstSeq)) && <div class="when">{when(A.L, e.ev.ts)}</div>}
              <EntryView e={e} chipOwner={chipOwner} livingItems={livingItems} join={!gap && stacks(rows[i - 1], e, chipOwner)} prevUser={prevUser} />
            </Fragment>
          );
        })}
        {A.pending.map((p, i) =>
          p.pics?.length ? (
            <div key={p.clientId} class={`user-m pending${i > 0 || rows.at(-1)?.user ? " join" : ""}`}>
              <MediaBlock pics={p.pics} side="user" ctx={{ kind: "conv" }} />
              {p.text && <div class="user"><WordsWithRefs text={p.text} refs={p.refs} /></div>}
              {/* Words are never lost (D206): they wait here with the picture until it goes. */}
              {p.failed && (
                <div class="unsent" role="alert">
                  <span>{t("media.failed")}</span>
                  <Btn kind="text" size="sm" label={t("media.retry")} onClick={() => A.retryPending(p.clientId)} />
                </div>
              )}
            </div>
          ) : (
            <div key={p.clientId} class={`user pending${p.reply ? " has-reply" : ""}${i > 0 || rows.at(-1)?.user ? " join" : ""}`}>
              {p.reply && <Imprint from={p.reply.from} quote={p.reply.part ?? p.reply.quote} pics={p.reply.pics} part={!!p.reply.part} still />}
              {p.reply ? <span class="words"><WordsWithRefs text={p.text} refs={p.refs} /></span> : <WordsWithRefs text={p.text} refs={p.refs} />}
            </div>
          ),
        )}
        {/* D543: with the link down, what waits says it goes once it's back (a clock, not an error). */}
        {A.pending.some((p) => !p.failed) && A.link() !== "up" && (
          <div class="queued" role="status">
            <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="7" cy="7" r="5.6" />
              <path d="M7 4.2V7l1.9 1.3" />
            </svg>
            <span>{t("conn.queued")}</span>
          </div>
        )}
        {A.thinking() && <Presence />}
        {/* D298: nothing can think and the first words aren't the opening: the key card here. */}
        {(A.S.first?.noBrain || keyJustAdded()) && !rows.some((r) => r.ai?.first) && <KeyCard />}
        <NotifyAsk />
      </main>
      <WayBack f={follow} />
      <ReplyMenu menu={menu} />
      <SelectText />
      {wide && <PartReply scroller={scroller} />}
      {/* D535's door reads this conversation's list; the composer stays outside, in Conversation (D541). */}
      <DoorLine scroller={scroller} />
    </>
  );
}

/** D535: 「有 n 个等你定 ›」, pinned over the composer while something the conversation's count
 *  counts is out of view (a task's item always is: it lives in On hand; the partner's own question
 *  while its card is scrolled away). A tap is the count's door. */
function DoorLine({ scroller }: { scroller: preact.RefObject<HTMLElement> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const f = () => tick((n) => n + 1);
    el.addEventListener("scroll", f, { passive: true });
    return () => el.removeEventListener("scroll", f);
  }, [scroller.current]);
  if (!A.S.welcomed) return null;
  const p = barDoorPartner();
  const items = doorItems(p);
  if (!items.length) return null;
  const box = scroller.current?.getBoundingClientRect();
  const inView = (id: string) => {
    const r = box && scroller.current?.querySelector(`#d-${CSS.escape(id)}`)?.getBoundingClientRect();
    return !!r && !!box && r.bottom > box.top && r.top < box.bottom;
  };
  if (items.every((i) => i.decisionId && inView(i.decisionId))) return null;
  return (
    <div class="door-line">
      <NeedsDoor words={t("door.line", items.length)} about={t("door.line.about")} onClick={() => A.openDoor?.(p)} />
    </div>
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
  const words = (w: { zh: string; en: string }) => byLang(w, A.L.lang);
  const visit = f?.visit === "returning" ? "back" : "first";
  const hi = t(`hello.${visit}.${dayPart(new Date().getHours())}`, A.S.personaName);
  // D501: never the same starter twice (a key on each button, and two alike read as a mistake).
  const starters = [...new Set(f?.starters.map((s) => words(s.words)).filter(Boolean) ?? [])];
  for (let i = 1; starters.length < 3 && i <= 3; i++) if (!starters.includes(t(`suggest.${i}`))) starters.push(t(`suggest.${i}`));
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
          <div class="bubble" dir="auto">{words(news.words)}</div>
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
      {/* D222: what is still on today, from the last look (never a new read); silent when nothing is. */}
      {f?.today && <TodayRow today={f.today} />}
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


export function OnHand() {
  const b = A.S.board();
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const routines = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  const calls = A.S.onHand?.calls ?? [];
  // D359: a pile with something in it (or cleared today) is something on hand too.
  const pile = TS.frame?.pile;
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "sources" });
  }, [A.S.welcomed]);
  const nothing = b.lanes.slice(0, 4).every((l) => !l.length) && !A.S.partnerDecisions().length && !loose.length && !A.S.missedToday().length && !routines.length && !calls.length && !(pile && (pile.open > 0 || pile.clearedToday > 0));
  const wide = useWide();
  // D216: the one list, as the phone or beside the conversation.
  return (
    <>
      <Top back={t("nav.back")} plus={!K.open} level={t("onhand.title")} up={K.open ? { label: t("onhand.title"), go: closeKeep } : undefined} />
      <main class="scroll" style={{ gap: 16 }}>
        {!wide && !K.open && <h1 class="page-title">{t("onhand.title")}</h1>}
        {nothing ? (
          <div class="calm">{t("onhand.empty", A.S.personaName)}</div>
        ) : (
          <>
            {/* D467 round 4: the brief's 接下来 says what comes back next; no line of its own. */}
            <OnHandList room={wide ? "side" : "phone"} />
            {!A.S.onHand?.keeps && <RoutineShelf />}
          </>
        )}
      </main>
    </>
  );
}

// ---------- an opened task ----------

/** A face that only shows a state holds still; the partner's own presence breathes. */
const stillFace = (a: Attention) => a === "dropped" || a === "superseded";

/** A quiet disclosure at the bottom: who is doing it, where (repo and branch), saved progress,
 *  what went out. A row with nothing to say is left out. */
/** Who does a task and why, as one sentence for Details (D89). */
function whoSentence(task: Task): string {
  const m = modelOf(task);
  const who = whoName(harnessOf(task), m);
  if (!who) return "";
  const w = whoOf(task)?.why;
  // D510: New tasks start named the agent (or named one that couldn't take it here).
  if (w?.ruleId === "new_tasks") return w.kind === "rule" ? t("who.sentence.newtasks", who) : t("who.sentence.newtasks.away", who, harnessName(w.from ?? ""));
  if (w?.kind === "rule" && w.text) return t("who.sentence.rule", who, w.text);
  if (w?.kind === "said" && w.text) return t("who.sentence.said", who, w.text);
  if ((w?.kind === "limit" || w?.kind === "unavailable") && w.ruleId) return t("who.sentence.limit.rule", who, harnessName(w.from ?? ""));
  if (w?.kind === "limit" && w.from) return t("who.sentence.limit", who, harnessName(w.from));
  if (w?.kind === "unavailable" && w.from) return t("who.sentence.unavailable", who, harnessName(w.from));
  if (w?.kind === "you") return t("who.sentence.you", who);
  if (w?.kind === "default") return t("who.sentence.default", who, A.nameOf(task.card?.persona));
  // D372: the kind of work put it on a faster one; or the faster one missed and it carries on here.
  if (w?.kind === "kind" && w.keeps) return t("who.sentence.kind", who, padEnd(A.L, whoName(w.keeps.harness, w.keeps.model)));
  if (w?.kind === "retry" && w.from) return t(w.stalled ? "who.sentence.retry.stalled" : "who.sentence.retry", who, padEnd(A.L, whoName(w.from, w.fromModel)));
  return t("who.sentence", who);
}

/** Who does it, as a name inside a sentence (D291): "Codex（gpt-5）" / "Codex (gpt-5)", never
 *  the harness and the model joined by a dot. */
export function whoName(harness: string | undefined, model: string | undefined): string {
  const h = harness ? harnessName(harness) : "";
  if (!h) return "";
  return model ? t("who.name", h, modelName(model)) : h;
}

/** Who does a task, as separate facts (harness, model, effort; D291), and why when it isn't
 *  Ducter's plain pick (D89). */
function whoLine(task: Task): [string[], string] {
  const m = modelOf(task);
  const e = effortOf(task);
  const who = [harnessName(harnessOf(task)), m && modelName(m), e && effortWord(A.L, e)].filter((x): x is string => !!x);
  const w = whoOf(task)?.why;
  if (!w) return [who, ""];
  if (w.ruleId === "new_tasks") return [who, w.kind === "rule" ? t("who.why.newtasks") : t("who.why.newtasks.away", harnessName(w.from ?? ""))];
  if (w.kind === "rule" && w.text) return [who, t("who.why.rule", w.text)];
  if (w.kind === "said" && w.text) return [who, t("who.why.said", w.text)];
  if (w.kind === "limit" || w.kind === "unavailable") {
    const plain = w.kind === "limit" ? "who.why.limit" : "who.why.unavailable";
    return [who, w.ruleId ? t("who.why.limit.rule", harnessName(w.from ?? "")) : w.from ? t(plain, harnessName(w.from)) : ""];
  }
  if (w.kind === "you") return [who, t("who.why.you")];
  if (w.kind === "kind") return [who, t("who.why.kind")];
  if (w.kind === "retry" && w.from) return [who, t(w.stalled ? "who.why.retry.stalled" : "who.why.retry", padEnd(A.L, whoName(w.from, w.fromModel)))];
  return [who, ""];
}

const pct = (f: number) => Math.round(f * 100);
/** A candidate's name inside a sentence ("换到 Codex（gpt-5.5）接着做"); a row draws the harness
 *  and the model apart (D291). */
export const candName = (c: Candidate) => whoName(c.harness, c.model);

/** A candidate's why, then its limit, as separate facts (D291); drawn with Facts. */
export function candFacts(c: Candidate): string[] {
  if (c.blocked === "reserve") return [t("cand.reserve", A.S.personaName), c.resetsAt ? t("cand.resets", when(A.L, c.resetsAt)) : ""].filter(Boolean);
  if (c.blocked) return [t(`cand.${c.blocked}`)];
  const why = { rule: t("cand.rule"), fit: t("cand.fit"), fast: t("cand.fast") }[c.reason.kind as string] ?? "";
  return [why, c.left != null ? t("cand.left", pct(c.left)) : "", c.billing === "usage" ? t("cand.paid") : ""].filter(Boolean);
}

/** A candidate's why as an accessible name or a tooltip: its facts read aloud. */
export const candReason = (c: Candidate): string => spoken(A.L, ...candFacts(c));

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
          <Facts class="nm" items={[<b>{harnessName(c.harness)}</b>, c.model && modelName(c.model)]} />
          <small>{whereCandReason(c) || <Facts items={candFacts(c)} />}</small>
        </span>
        {c.current && <small class="now">{t("who.now")}</small>}
      </button>
    );
  };
  const go = moving ? t("switch.move.go", chosen!.deviceName ?? "") : chosen ? t("who.go", candName(chosen)) : "";
  return (
    <div class="switch-list" role="radiogroup" aria-label={t("who.switch")}>
      {/* D282: the same agent, another model or effort, in place: its own session carries on. */}
      <TuneInPlace task={task} device={cur} />
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
                  {dv && (
                    <span class={`sw-state ${dv.state}`}>
                      <i class="sdot" aria-hidden="true" />
                      {computerState(dv)}
                    </span>
                  )}
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

/**
 * D282: the model and effort of the agent doing it, changed in place. A pick goes at once; the
 * agent's own session carries on with it from the next turn, nothing condensed. Only where the
 * agent lists its own models (live).
 */
function TuneInPlace({ task, device }: { task: Task; device?: string }) {
  const h = harnessOf(task);
  // D352: the agent's live list (a model newer than this Ducter included), the one it's on always a chip.
  const tune = inPlaceTune(A.newTaskOptions?.models ?? [], h, device, modelOf(task), effortOf(task));
  if (!tune) return null;
  const { models, model, effort } = tune;
  const pick = (m: string, e?: string) => A.retuneTask(task.id, h, m, e);
  return (
    <div class="nt-tune switch-tune">
      <div class="nt-chips">
        <small>{t("newtask.model")}</small>
        <div class="nt-chip-row" role="radiogroup" aria-label={t("newtask.model")}>
          {models.map((m) => (
            <Choice key={m.id} label={m.label} on={m.id === model?.id} onClick={() => m.id !== model?.id && pick(m.id)}>
              {m.label}
            </Choice>
          ))}
        </div>
      </div>
      {model?.efforts?.length ? (
        <div class="nt-chips">
          <small>{t("newtask.effort")}</small>
          <div class="nt-chip-row" role="radiogroup" aria-label={t("newtask.effort")}>
            {model.efforts.map((e) => (
              <Choice key={e} label={effortWord(A.L, e)} on={e === effort} onClick={() => e !== effort && pick(model.id, e)}>
                {effortWord(A.L, e)}
                {e === model.defaultEffort && <small class="nt-dflt">{t("newtask.effort.default")}</small>}
              </Choice>
            ))}
          </div>
        </div>
      ) : null}
      <div class="small sub">{t("switch.tune.note", harnessName(h))}</div>
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

/** What went out of the machine, in plain words (D496: "改了 PR #10847 的说明和标签", never the
 *  command; what stayed on the machine is not here). The commands are a hover away. */
function OutsideActs({ task }: { task: Task }) {
  const acts = task.historyLoaded ? outsideActs(task) : [];
  if (!acts.length) return null;
  const branch = (placeOf(task) as { branch?: string }).branch;
  return (
    <section class="outside">
      <small>{t("outside.title")}</small>
      {acts.map((x) => (
        <span key={x.seq} class="out-act" title={safe(x.commands.join("\n"))}>
          {outsideSentence(x, branch)}
        </span>
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
            <Btn kind="primary" label={t("folder.confirm.go")} onClick={() => A.folderAction(task.id, "undo", { force: true })} />
            <Btn kind="text" label={t("folder.confirm.no")} onClick={() => ((task.confirm = undefined), A.changed())} />
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
                    <button class="qlink" aria-label={spoken(A.L, t("folder.row.restore"), lastPart(x.path))} onClick={() => A.folderAction(task.id, "undo", { path: x.path })}>
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
  const phone = usePhone();
  const scroller = useRef<HTMLDivElement>(null);
  // D210: it opens at its latest while it works or waits on you, at its head once finished (the
  // outcome is there). While it works, a reader at the end follows the newest step; one who
  // scrolled up stays, with Jump to latest.
  const atEnd = useRef(false);
  const [away, setAway] = useState(false);
  const opened = useRef("");
  const moving = !!task && ["working", "queued"].includes(attention(task));
  // D271: a task resting on its wait opens at its end too, where its end line says what it waits for.
  const live = moving || (!!task && ["needs_you", "blocked"].includes(attention(task)));
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
  // D284: an older page lands above the reader: they stay on what they were reading (WebKit has
  // no scroll anchoring); at the end, the end stays.
  const held = useRef({ from: 0, height: 0 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const from = task?.histFrom ?? 0;
    // D320: with a session index the virtual list keeps the place itself.
    if (!task?.index && held.current.from && from && from < held.current.from) {
      if (atEnd.current) el.scrollTop = el.scrollHeight;
      else el.scrollTop += el.scrollHeight - held.current.height;
    }
    held.current = { from, height: el.scrollHeight };
  });
  useEffect(() => A.history(id), [id, A.S.welcomed]);
  // D320: an open task's window is kept by what is on screen; one nobody has open keeps its newest.
  useEffect(() => (A.S.open.add(id), () => void A.S.open.delete(id)), [id]);
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
  const watchable = watchesBrowser(task, finished(task));
  // D217: it is using Ducter's phone: watch it from here (D220: in the workbench's Phone page).
  const phoning = !finished(task) ? A.S.onHand?.tasks.find((c) => c.taskId === id)?.phoning : undefined;
  const [headline, lede] = finished(task) && r ? splitOutcome(safe(r.summary)) : ["", ""];
  const blocks = taskBlocks(task);
  // Waiting on you with nothing to answer (its turn ended on a question in its own words, or a
  // wait ran out): say so, never a mystery (D152).
  const yourTurn = a === "needs_you" && !d;
  const canSwitch = !!harnessOf(task) && !["dropped", "superseded"].includes(a);
  const stateWord = yourTurn ? t("task.your.turn") : (a === "blocked" && backWords(A.S.waiterFor(id))) || tagLabel(a);
  // D484: where it stands in one sentence, as Share sends it: what it waits for, else its state.
  const stateSentence = a === "blocked" ? storyOf(task).words || stateWord : stateWord;
  // D484: its pull request, one tap from the head while it is not finished (a finished one's
  // result has its own buttons).
  const pr = !finished(task) ? taskPr(task) : undefined;
  return (
    <>
      {full ? (
        // D184: the whole screen, as the Mac shows an opened task: the crumbs (Pause and Cancel
        // task are in the foot, D210, D213); D214: the workbench's toggle at the header's end.
        <FullTop task={task}>
          <TaskNav id={id} />
          <TaskInfoButton task={task} />
          <BenchToggle task={task} />
          <ShareButton task={task} state={stateSentence} />
          <TaskMore task={task} />
        </FullTop>
      ) : (
        <Top
          back={t("nav.back")}
          own={phone}
          extra={
            phone ? (
              // D484: a phone's bar holds the task's own actions, each 44 points: Share, the
              // workbench when it has something, and ⋯ (这个任务: the working copy, Switch, Cancel).
              <>
                <ShareButton task={task} state={stateSentence} />
                <BenchToggle task={task} />
                <PhoneMore task={task} canSwitch={canSwitch} />
              </>
            ) : (
              <>
                <TaskNav id={id} />
                <TaskInfoButton task={task} />
                <BenchToggle task={task} />
                <ShareButton task={task} state={stateSentence} />
                <TaskMore task={task} />
              </>
            )
          }
        />
      )}
      {/* D544: a task in rounds keeps who it is while its transcript is read. */}
      <LoopLine task={task} scroller={scroller} />
      <main class="scroll task-page" data-look={A.lookOf(task.card?.persona)} ref={scroller} onScroll={(e) => { const el = e.currentTarget; const gap = el.scrollHeight - el.scrollTop - el.clientHeight; atEnd.current = gap < 48; if (gap > 240 !== away) setAway(gap > 240); if (el.scrollTop < 400) A.moreAtHead(id); }}>
        <div class="task-head" data-hero={id}>
          {/* D542: the partner's mark at the title's size, inline before it, never a poster beside the
              page (what it waits for is the wait line's words). */}
          <span class="face">
            <Avatar size={28} state={faceOf(a)} still={stillFace(a)} who={A.nameOf(task.card?.persona)} />
          </span>
          <div class="head-words">
            <h1 title={safe(title(task))}>{safe(cutAtWord(shortTitle(title(task)), 90)) || t("task.unknown")}</h1>
            <TaskMeta task={task} stateLabel={stateWord} onSwitch={canSwitch && !cantSwitches(task) ? () => A.openSwitch(task.id) : undefined} />
            {/* D261: what it waits for, always (its waiter, its reason, what it last reported, or
                that it stopped without saying), then when it looks again or since when it's quiet. */}
            {a === "blocked" && <p class="waitline">{storyOf(task).words}</p>}
            {/* D279: a wait of its own says when it comes back in the state and the watch card. */}
            {a === "blocked" && !A.S.waiterFor(id) && taskNext(task) && <p class="waitnext">{taskNext(task)}</p>}
            {pr && (
              <a class="pr-link" href={pr} target="_blank" rel="noopener">
                <PrMark />
                <span>{prNumber(pr) ? t("pr.open", prNumber(pr)) : t("pr.open.bare")}</span>
              </a>
            )}
          </div>
          {headline && <p class="headline">{headline}</p>}
        </div>
        {/* D426: the things of a many-things message this task does, each with its mark. */}
        <TaskAsks id={id} />
        {(detail || watchable || phoning) && (
          <div class={`outcome${watchable || phoning ? " watch-row" : ""}`}>
            {detail && <div class="said">{safe(detail)}</div>}
            {/* D190: the page it is working on, live, from here. */}
            {watchable && <Btn kind="secondary" size="sm" label={t("live.watch.title")} about={safe(title(task))} onClick={() => A.watchLive(id, liveSize())} />}
            {/* D220: in the workbench's Phone page, beside the task (the full-screen sheet without one). */}
            {phoning && <Btn kind="secondary" size="sm" label={t("phoneuse.watch")} about={safe(title(task))} onClick={() => (benchable(task) ? openBenchAt(task, "phone") : openPhone({ device: phoning.device, taskId: id, mode: "watch" }))} />}
          </div>
        )}
        {/* D235: it is using the person's apps: where, and 停下 / Stop. */}
        <ComputerLine task={task} />
        <HandsetLine task={task} />
        {/* D306: keep it in sight on the Lock Screen or in the notification shade. */}
        <AmbientLine task={task} />
        {A.switchFor === id && <SwitchList task={task} />}
        {finished(task) && (
          <div class="outcome">
            {lede && <div class="said">{lede}</div>}
            {r?.media?.length ? <MediaBlock media={r.media} side="task" ctx={{ kind: "task", taskId: id }} /> : null}
            <ProofLine task={task} evs={resultEvidence(task)} />
            <SentLine task={task} />
            {a === "failed" && cantOf(task) ? (
              <CantStartView taskId={task.id} about={safe(title(task))} c={cantOf(task)!} />
            ) : a === "failed" ? (
              // Didn't work (D76): try the same again, or tell it how; that opens its composer.
              <div class="btns">
                <Btn kind="primary" label={t("task.action.tell")} onClick={() => document.getElementById("composer-task")?.focus()} />
                <Btn kind="secondary" label={t("task.action.retry")} onClick={() => A.taskAction(id, "reopen")} />
              </div>
            ) : (
              <ResultActions task={task} inTask />
            )}
          </div>
        )}
        <WatchCard task={task} {...wakeTally(task)} />
        <TryStrip task={task} />
        <FolderChangesView task={task} />
        <WhatItDid task={task} blocks={blocks} />
        <OutsideActs task={task} />
      </main>
      {full && <Locator task={task} scroller={scroller} />}
      {live && away && (
        <div class="jump-dock">
          <button class="jump" aria-label={t("jump.latest")} title={t("jump.latest")} onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
            </svg>
          </button>
        </div>
      )}
      {/* D521: its agent's background work, over the composer. */}
      <BgTray taskId={id} bg={task.card?.background} />
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
  // D290: it goes back down the way it came, and on a phone follows the finger down to close.
  const { sheet, body, scrim, close } = useSheetMotion(() => ((A.sheet = null), A.changed()));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  return (
    <SheetFrame label={label} frame={sheet} body={body} scrim={scrim} onScrim={close}>
      {children}
      <Btn kind="secondary" class="sheet-close" label={t("sheet.close")} onClick={close} />
    </SheetFrame>
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

/** D322: where it lives and what it thinks with, one line under the name (the Mac's header). The
 *  Settings list's hero says the same, never an agent when none can be used. */
function partnerLede(): string {
  const brain = A.brainNow ?? A.settings?.brain;
  // D435: its own agent held: who thinks meanwhile, or when it answers again.
  const held = brainHeld();
  if (A.homeName && held && brain) return held.waits ? (heldAt(held) ? t("partner.header.wait", A.homeName, heldAt(held)) : t("partner.header.wait.soon", A.homeName)) : t("partner.header.held", A.homeName, harnessName(brain.harness));
  return !A.homeName ? "" : noBrain() ? t("partner.header.none", A.homeName) : brain ? t("partner.header", A.homeName, harnessName(brain.harness)) : "";
}

/** D469 round 2: the Partner page's head in its own voice (partner.say): where it runs and what it thinks with; held or with nothing to think with, D435's and D322's lines. */
function partnerHead(): string {
  const brain = A.brainNow ?? A.settings?.brain;
  if (!A.homeName || !brain || brainHeld() || noBrain()) return partnerLede();
  return t("partner.say", A.homeName, homeThinks() || harnessName(brain.harness));
}

function NameRow() {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const save = () => {
    const n = draft.trim();
    // D404: a new name is a moment worth one line in the partner's voice, under the name.
    if (n && n !== A.defaultName()) A.setSettings({ name: n }), say("rename", t("said.rename", n));
    setEditing(false);
  };
  const lede = partnerHead();
  return (
    <>
      <div class="partner-head">
      <Avatar size={56} />
      {editing ? (
        <>
          <input
            class="name-input"
            value={draft}
            maxLength={24}
            aria-label={t("partner.rename")}
            autoFocus
            onFocus={(e) => (e.target as HTMLInputElement).select()}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) save();
              if (e.key === "Escape") e.stopPropagation(), setEditing(false);
            }}
          />
          <Btn kind="primary" label={t("partner.rename")} onClick={save} />
          <Btn kind="text" label={t("partner.rename.cancel")} onClick={() => setEditing(false)} />
        </>
      ) : (
        <>
          <span class="grow">
            <h2>{A.defaultName()}</h2>
            {lede && <small>{lede}</small>}
          </span>
          {A.settings && <Btn kind="text" label={t("partner.rename")} onClick={() => (setDraft(A.defaultName()), setEditing(true))} />}
        </>
      )}
      </div>
      <Said k="rename" />
    </>
  );
}

/** D292: 跟着我 / Follow me, the common languages by their own names, then 其他语言… / Other language… */
const TALK_OTHER = "other";
export function talkOptions(current: string): { v: string; label: string }[] {
  const common = LANGUAGES.filter((l) => l.common).map((l) => l.tag);
  const opts = [{ v: "auto", label: t("partner.talk.auto") }, ...common.map((tag) => ({ v: tag, label: autonym(tag) }))];
  // A language chosen under Other stays in the list, selected, by its own name.
  if (current !== "auto" && !common.includes(current)) opts.push({ v: current, label: autonym(current) });
  return [...opts, { v: TALK_OTHER, label: t("partner.talk.other") }];
}

function TalkSettings() {
  const s = A.settings;
  const [other, setOther] = useState(false);
  if (!s) return null;
  const pick = (language: string) => (setOther(false), A.setSettings({ language }));
  return (
    <section class="set">
      <h3>{t("partner.talk.title")}</h3>
      <div class="set-card">
        {/* research/118: one choice at the row's right edge, as the Mac's pop-up, not fourteen rows. */}
        <div class="set-item talk-row">
          <span class="grow">
            <b>{t("settings.talk.row")}</b>
            {/* D445: the picker says which language; its voice shows under the title. */}
            <TalkSample language={other ? "" : s.language} />
          </span>
          <span class="pick">
            <Select
              label={t("settings.talk.row")}
              value={other ? TALK_OTHER : s.language}
              options={talkOptions(s.language).map((o) => ({ v: o.v, label: o.label }))}
              onPick={(v) => (v === TALK_OTHER ? setOther(true) : pick(v))}
            />
          </span>
        </div>
        {other && (
          <div class="set-item talk-other">
            <div class="acct-field own-pick">
              <span class="small">{t("partner.talk.other.label")}</span>
              <Select
                label={t("partner.talk.other.label")}
                value=""
                placeholder={t("partner.talk.other.pick")}
                options={LANGUAGES.filter((l) => !l.common).map((l) => ({ v: l.tag, label: l.name }))}
                onPick={pick}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** D413: 不用问我的 / Without asking: what the person said may go without asking, each with 收回 / Take back. */
function StandingList() {
  const xs = A.standing;
  if (!xs.length) return null;
  const sep = t("standing.sep");
  // A third list in 要不要先问's card, in the done ink: the person's own word beside Ducter's two.
  return (
    <div class="trust own without" id="standing">
      <b>{t("standing.title")}</b>
      <ul>
        {xs.map((x) => (
          <li key={x.id}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 10.5l3.5 3.5L15 6.5" />
            </svg>
            <span class="grow">
              <span>{t(`standing.${x.action}`)}</span>
              {/* D424: "PRs that ask for your review" is what the title already means; the owners only when bounded. D499: one task's, by its name. */}
              {x.taskId ? <small>{t("standing.where.task", x.taskTitle ?? x.taskId)}</small> : x.orgs?.length ? <small>{t(x.action === "pr_review" ? "standing.where.orgs" : "standing.where.owners", x.orgs.join(sep))}</small> : null}
              <small>{t("standing.said", x.text)}</small>
            </span>
            <DangerButton quiet label={t("standing.revoke")} about={t(`standing.${x.action}`)} onClick={() => (A.send({ t: "standing_revoke", id: x.id }), say("trust", t("standing.revoked")))} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 要不要先问: the rules core keeps, in everyday words (read-only). */
function TrustSettings() {
  const list = (head: string, prefix: string, cls: string) => (
    <div class={`trust ${cls}`}>
      <b>{t(head)}</b>
      <ul>
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>
            {/* D365: the Mac's drawn marks (a check for what it does itself, a bubble for what it asks), not bullets. */}
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              {cls === "own" ? <path d="M5 10.5l3.5 3.5L15 6.5" /> : <path d="M7 4.5h6q3 0 3 3V10q0 3-3 3H9l-3 3.5.2-3.5H7q-3 0-3-3V7.5q0-3 3-3z" />}
            </svg>
            <span>{t(`${prefix}.${i}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section class="set">
      <h3>{t("partner.trust.title")}</h3>
      {/* D424: one clause on how a review stops asking, only until one does (the list then shows it). */}
      {!A.standing.length && <p class="g-note">{t("partner.trust.note")}</p>}
      <div class="set-card trust-card">
        {list("partner.trust.own", "partner.trust.own", "own")}
        {list("partner.trust.asks", "partner.trust.asks", "asks")}
        <StandingList />
      </div>
      <Said k="trust" />
    </section>
  );
}

/** D468: the day's half hours, 24-hour, as the Mac's quiet-hours pills; an odd time someone set elsewhere stays listed. */
export function halfHours(cur: string): { v: string; label: string }[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (cur && !out.includes(cur)) out.push(cur), out.sort();
  return out.map((v) => ({ v, label: v }));
}

function NotifySettings() {
  const s = A.settings;
  // D445: the page's shape while it reads, as To-do sources and Chat apps (D432), never a bare line.
  if (!s) return <Waiting text={t("conn.connecting")} />;
  const quiet = s.quiet;
  const setQuiet = (start: string, end: string) => (A.setSettings({ quiet: { start, end, tz: quiet?.tz ?? tz() } }), say("notify", t("said.quiet", start, end)), cheer());
  return (
    <>
      {/* D445: the notification itself, live with every choice below (D43: shown, not explained). */}
      <NotifyPreview />
      <section class="set">
        <h3>{t("partner.notify.title")}</h3>
        <div class="set-card">
        <Toggle label={t("partner.notify.on")} help={t(s.notify ? "partner.notify.on.note" : "partner.notify.off.note")} checked={s.notify} onChange={(notify) => (A.setSettings({ notify }), cheer())} />
        {s.notify && <Toggle label={t("partner.quiet")} help={t("partner.quiet.note")} checked={!!quiet} onChange={(on) => (A.setSettings({ quiet: on ? { start: "23:00", end: "08:00", tz: tz() } : null }), say("notify", on ? t("said.quiet", "23:00", "08:00") : t("said.quiet.off")), cheer())} />}
        {s.notify && quiet && (
          // D468: the hours as the Mac's (D445): a row titled 时间段, two pills of the half hours at its right edge,
          // 24-hour in every language; never the browser's own time field.
          <div class="quiet-range">
            <b>{t("partner.quiet.hours")}</b>
            <span class="pick">
              <Select label={t("partner.quiet")} value={quiet.start} options={halfHours(quiet.start)} onPick={(v) => setQuiet(v, quiet.end)} />
            </span>
            <span class="to">{t("partner.quiet.to")}</span>
            <span class="pick">
              <Select label={`${t("partner.quiet")} ${t("partner.quiet.to")}`} value={quiet.end} options={halfHours(quiet.end)} onPick={(v) => setQuiet(quiet.start, v)} />
            </span>
          </div>
        )}
        </div>
        <Said k="notify" />
      </section>
      {/* D165: the chips, once there is something to watch; said here only (D432). */}
      {((s.proactive && s.proactiveBy !== "default") || !!A.connections?.length) && (
        <ProactiveChips>
          <QuietDay />
        </ProactiveChips>
      )}
      <section class="set">
        <h3>{t("partner.default.title")}</h3>
        <div class="set-card">
          <GRow cls="flat" title={t("partner.default.line")} line={t("partner.default.note")}>
            <Seg
              label={t("partner.default.line")}
              value={s.defaultAfterMin}
              options={[10, 30, 60, 120].map((v) => ({ v, label: v < 60 ? t("partner.default.min", v) : t("partner.default.hour", v / 60) }))}
              onPick={(defaultAfterMin) => (A.setSettings({ defaultAfterMin }), say("default", t("said.default", defaultAfterMin < 60 ? t("partner.default.min", defaultAfterMin) : t("partner.default.hour", defaultAfterMin / 60))), cheer())}
            />
          </GRow>
        </div>
        <Said k="default" />
      </section>
      {s.notify && <PhonePush />}
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
              <span>{a.accounts.join(t("acct.sep"))}</span>
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
  // D289: with a source, 发现了就说, a group per source and the add row at the end of them, then
  // 打电话 / Phone calls; every group in the same flow.
  if (list?.some((c) => !c.phone) && !adding && !offer)
    return (
      <SourceCards
        list={list}
        add={
          <>
            <div class="set-card">
              <AddRow label={t("acct.add.title")} help={t("acct.add.line")} onClick={() => setAdding(true)} />
            </div>
            {refusal && <AcctRefusal reason={refusal} hosted={false} />}
          </>
        }
      />
    );
  return (
    <section class="set accounts">
      <h3>{t("acct.title")}</h3>
      <div class="small sub">{t("acct.lede")}</div>
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
          <div class="set-card">
            <AddRow label={t("acct.add")} help={list && !list.length ? t("acct.none") : undefined} onClick={() => setAdding(true)} />
          </div>
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
            <button type="submit" class="btn primary" disabled={A.connecting || (!hosted && !url.trim())}>
              <span class="lbl">{A.connecting ? t("acct.checking") : t("acct.check")}</span>
            </button>
            <Btn kind="text" label={t("acct.cancel")} onClick={() => (setAdding(false), setToken(""), setNoKey(false), (A.connRefusal = undefined))} />
          </div>
        </form>
      )}
      {!adding && refusal && <AcctRefusal reason={refusal} hosted={false} />}
      <div class="small sub">{t("acct.honest")}</div>
      <Said k="acct-stop" />
      <Said k="acct-added" />
      {/* D193, D289: calls are their own section, in the same flow. */}
      {list && <CallsSection list={list} />}
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
        // D273: a row like every other (title, one line, the button at the right edge), not a bar.
        <div class="set-card">
          <div class="set-row">
            <span class="grow">
              <b>{t("notify.here")}</b>
              <small>{t("notify.here.note")}</small>
            </span>
            <Btn
              kind="primary"
              size="sm"
              label={t("notify.here.on")}
              onClick={async () => {
                A.push = await turnOnPush();
                A.changed();
              }}
            />
          </div>
        </div>
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
    <>
    {/* D445: Look and sound's preview stage, as the Mac's: a choice here shows at once. */}
    <LookPreview />
    <section class="set">
      <div class="set-card">
        <PaperRow />
        <DensityRow />
        <GRow cls="flat" title={t("settings.lang.title")} line={t("settings.lang.help")}>
          <Seg label={t("settings.lang.title")} value={A.uiLang} options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`settings.lang.${v}`) }))} onPick={(v) => (A.setUiLang(v), cheer())} />
        </GRow>
        <GRow cls="flat" title={t("settings.details.title")} line={t("settings.details.note")}>
          <Seg label={t("settings.details.title")} value={A.details} options={(["folded", "shown"] as const).map((v) => ({ v, label: t(`settings.details.${v}`) }))} onPick={(v) => (A.setDetails(v), cheer())} />
        </GRow>
        <VoiceSettings />
        {/* D342: inside the Android app, its own version and 检查更新. */}
        <AppUpdateRow />
      </div>
      {/* D432: the page's title (这台手机 / 这台电脑) already says whose look this is: no note under the card. */}
    </section>
    </>
  );
}

const SECTIONS: { page: Exclude<SettingsPage, "">; art: string; title: string }[] = [
  { page: "partner", art: "idle", title: "settings.tab.partner" },
  // D257: the partner's own notebook (the one it always carries), and two of the person's agents' coins.
  { page: "memory", art: "notebook", title: "settings.tab.memory" },
  { page: "peers", art: "coins", title: "settings.tab.peers" },
  { page: "notify", art: "wait_clock", title: "settings.tab.notify" },
  { page: "accounts", art: "wait_mail", title: "settings.tab.accounts" },
  // D341: 待办来源 / To-do sources (todos.tsx); D348: its own clay, a note page with a ticked box.
  { page: "todos", art: "set_todos", title: "settings.tab.todos" },
  // D276: 聊天软件 / Chat apps (channels.tsx); D283: two clay speech bubbles.
  { page: "chats", art: "set_chats", title: "settings.tab.chats" },
  { page: "autofill", art: "set_autofill", title: "settings.tab.autofill" },
  { page: "devices", art: "mini_awake", title: "settings.tab.devices" },
  // D330: in a browser on a computer it is 这台电脑 / This computer, with the clay laptop.
  { page: "phone", art: HANDHELD === "computer" ? "dev_laptop_awake" : "phone", title: "settings.phone" },
];

/** A section's art: its clay picture, or for 和你的其他 agent 通信 two of the person's agents' coins (D257). */
function SectionArt({ art, size }: { art: string; size: number }) {
  if (art === "notebook") return <Notebook size={size} />;
  if (art === "coins")
    return (
      <span class="set-coins" style={{ width: size, height: size }} aria-hidden="true">
        <Coin harness="claude-code" size={Math.round(size * 0.68)} />
        <Coin harness="codex" size={Math.round(size * 0.68)} />
      </span>
    );
  return <img src={`app/art/${art}.webp`} alt="" width={size} height={size} />;
}

/** D257: the Memory row says a Nowledge Mem update in the highlight's ink, as 你的设备 does (D224). */
function memWaiting(): string {
  const k = memBadge(memUpdate(A.bridge));
  return k ? t(k) : "";
}

/** D224: the Settings list's 你的设备 row says how many updates wait, in the highlight's ink (D213), or what is under way. */
function updatesWaiting(): string {
  const v = A.updateAll;
  if (v?.plan && !v.plan.finishedAt) return t(v.plan.items.length === 1 ? "upall.running.one" : "upall.running");
  const n = v?.offer.length ?? 0;
  return n ? t(n === 1 ? "upall.title.one" : "upall.title", n) : "";
}

/** Settings (D150): the same sections as the Mac's rail, as a list; a tap pushes its page. */
function SettingsSheet() {
  useEffect(() => {
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  const page = (A.sheet?.kind === "settings" && A.sheet.page) || "";
  const go = (p: SettingsPage) => ((A.sheet = { kind: "settings", page: p }), A.changed());
  // D290: the list comes back from the leading side, as a pushed page's way back.
  const was = useRef(page);
  const popped = !page && was.current !== "";
  useEffect(() => void (was.current = page), [page]);
  const sec = SECTIONS.find((x) => x.page === page);
  // D311: a device's card pushed inside 你的设备 brings its own ‹ 你的设备, the one way back shown.
  const [dev, setDev] = useState<string | null>(null);
  useEffect(() => setDev(null), [page]);
  const devPushed = page === "devices" && deviceCardShown(dev);
  return (
    <Sheet label={t("settings.title")}>
      {!sec ? (
        <div class={`set-page${popped ? " popped" : ""}`} key="list">
          <h2>{t("settings.title")}</h2>
          {/* D469: the partner's brief on its own world, then where things live; the pages after. */}
          <SetBrief go={go} />
          <PlacesMap go={go} />
          <div class="set-card set-list">
            {/* D469: the brief replaced the partner's hero, so the partner is a row of the list again. */}
            {SECTIONS.filter((x) => x.page !== "peers" || peersPageShown()).map((x) => (
              <button class="set-row" key={x.page} onClick={() => go(x.page)}>
                <SectionArt art={x.art} size={40} />
                <span class="grow">
                  <b>{t(x.page === "peers" ? "settings.short.peers" : x.title)}</b>
                  {x.page === "partner" ? <small>{partnerLede() || t("settings.list.partner")}</small> : x.page === "devices" && updatesWaiting() ? <small class="update">{updatesWaiting()}</small> : x.page === "memory" && memWaiting() ? <small class="update">{memWaiting()}</small> : <small>{t(`settings.list.${x.page}`)}</small>}
                </span>
                <Chev />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div class="set-page pushed" key={page}>
          {!devPushed && (
            <>
              <button class="set-back" onClick={() => go("")} aria-label={t("settings.back")}>
                <span class="back-chev" aria-hidden="true">
                  <Chev back />
                </span>
                {t("settings.back")}
              </button>
              <h2 class="set-title">
                {/* D322: the partner's face lives in its header only; the title doesn't repeat it. */}
                {page !== "partner" && <SectionArt art={sec.art} size={32} />}
                {t(sec.title)}
              </h2>
              {/* D459: every pane's lede under its title, in one place, as on the Mac (memory, notifications and
                  accounts had none on the web; Agent messaging drew its own). */}
              {/* D469: the partner says what is true here, in its voice; what needs you here follows. */}
              {page !== "partner" && <PaneSays page={page} />}
            </>
          )}
          {page === "partner" && (
            <>
              <NameRow />
              {/* D309: 伙伴们 / Your partners, on a home that offers more than one; first when there are several (D500). */}
              <PartnersSection at="top" />
              {/* D322: one story: what it thinks with, who does the tasks, adding another AI (a key too), then the hand-off (D297). */}
              <ThinksSection />
              <TasksSection />
              <NewTasksSection />
              <AddSection />
              <HandoffSettings />
              <TalkSettings />
              <RecordsSettings />
              <TrustSettings />
              {/* D500: with one partner, adding another is the page's last group. */}
              <PartnersSection at="foot" />
              {/* D332: one quiet line for someone Ducter hasn't seen run AI agents of their own. */}
              <PeersInvite />
            </>
          )}
          {page === "memory" && <MemoryPage />}
          {page === "peers" && <PeersPage />}
          {page === "notify" && <NotifySettings />}
          {page === "accounts" && <Accounts />}
          {page === "todos" && <TodoSourcesSettings />}
          {page === "chats" && <ChatAppsSettings />}
          {page === "autofill" && <AutofillSettings />}
          {page === "devices" && <DevicesSection open={dev} setOpen={setDev} />}
          {page === "phone" && <PhoneSettings />}
        </div>
      )}
    </Sheet>
  );
}

// ---------- 开一个任务 / New task (D128, D185): the sheet is in newtask.tsx ----------

export function Sheets() {
  const main = SheetsMain();
  // D391: 从这一步开新任务 / New task from this step stands over whatever opened it (Past tasks, the find-anything field).
  if (!PV.redo) return main;
  return (
    <>
      {main}
      <RedoSheet dateOf={(iso) => dateOf(iso)} />
    </>
  );
}

function SheetsMain() {
  if (A.viewer) return <Viewer />;
  if (A.fileView) return <FileViewer />;
  if (A.fileLink) return <FileLinkSheet />;
  if (!A.sheet) return null;
  if (A.sheet.kind === "newtask") return <NewTaskSheet />;
  if (A.sheet.kind === "addfolder") return <AddFolderSheet />;
  if (A.sheet.kind === "switch") return <Palette />;
  if (A.sheet.kind === "keys") return <KeysSheet />;
  if (A.sheet.kind === "past") return <PastSheet />;
  if (A.sheet.kind === "did") return <DidSheet />;
  if (A.sheet.kind === "pins") return <PinsSheet />;
  if (A.sheet.kind === "app") return <AppSheet id={A.sheet.id} />;
  if (A.sheet.kind === "apps") return <AppsShelf />;
  if (A.sheet.kind === "recall") return <RecallSheet seq={A.sheet.seq} />;
  if (A.sheet.kind === "learned") return <LearnedSheet />;
  if (A.sheet.kind === "pile") return <PileSheet />;
  // D385: handing several over, and review together.
  if (A.sheet.kind === "hand") return <HandSheet />;
  if (A.sheet.kind === "review") return <ReviewSheet groupId={A.sheet.groupId} />;
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
