// D511: 照看 / Looking after (design/standing-work.md §6, the prototype apps/web/demo-standing-work.html).
// A Keep on On hand is one sheet under 看守中: its mark, its title, its facts each its own element
// (D291), its last change, when it wakes next at the right, and the tasks at work on it set in under
// it. What waits for the person stands in 等你 once; the sheet only says how many. A tap opens the
// Keep's own page in the board's place (never Settings, never Bridge): its life, 你说的, 在等你,
// 手上的, 每一轮 (silent rounds folded), a talk box, and 怎么做 with 暂停 and 停下. The receipt
// card under the partner's words when one is made is here too.
import { cutAtWord, foldRounds, noOrphan, keepBeat, type HandoffLine, type KeepCard, type KeepChange, type KeepEdit, type KeepField, type KeepItem, type KeepPage, type KeepProposal, type KeepRound, type KeepSheet, type ServerFrame } from "@ducter/protocol";
import { Fragment, type ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { A } from "./app.ts";
import { Btn, Chev, DangerButton, EditRow, Facts, Field, MoreButton, NumberField, SectionHead, Seg, Tag, TextBox, TimeCol, WorkHead } from "./controls.tsx";
import { ComposerBox, echoed } from "./composer.tsx";
import { CopyLine } from "./lend.tsx";
import { clock, colTime, harnessName, receiptWords, spoken, when } from "./format.ts";
import { prFacts, prPhaseWords } from "./onhand-pr.tsx";
import { soon } from "./onhand.tsx";
import { healthLine, rhythm } from "./past.tsx";
import { DecisionCard } from "./views.tsx";
import { GConfirm } from "./set-grid.tsx";
import { handoffGroups } from "./handoff.ts";
import { finished } from "./store.ts";
import { Menu, MenuItem, Select } from "./menu.tsx";
import { PartnerMark } from "./partners.tsx";
import { SEG_MAX, taskAgents, taskComputers } from "./partner-story.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** RAIL_COLS: a title in the rail, two lines at its width (Han counts two), cut at a word's end past them. */
const RAIL_COLS = 38;

/** The Keep whose page is open (absent: On hand's list), the pages read, and the page's own state (talk: the words being typed, the clientId in flight, the Keep last told). */
export const K = {
  open: "",
  pages: new Map<string, KeepPage>(),
  pause: false,
  stop: false,
  /** D602: the held item whose 不用跟了 asks in place (its PR, else its task), or "". */
  release: "",
  undone: new Set<string>(),
  sig: "",
  askedAt: 0,
  talk: { text: "", sending: "", at: 0, sent: "" },
  // D533: the rule row open for a change (its drafts, on its way, its error), the person's words being
  // changed (reading them, the rules read from them), and the last change with its Undo.
  edit: { field: "" as KeepField | "", draft: {} as Record<string, string>, busy: false, error: "" },
  words: { open: false, draft: "", phase: "" as "" | "reading" | "read" | "saving", proposal: undefined as KeepProposal | undefined },
  done: undefined as { id: string; edits: KeepEdit[]; undo?: KeepChange; undone?: boolean } | undefined,
  // D620: the doorbell row's own state, and the URL only this page may show (once).
  bell: undefined as { id: string; url: string } | undefined,
  bellOpen: false,
  bellBusy: false,
  bellError: "",
  bellSending: "" as "" | "on" | "off" | "new",
};

const freshEdit = () => ({ field: "" as KeepField | "", draft: {} as Record<string, string>, busy: false, error: "" });
const freshWords = () => ({ open: false, draft: "", phase: "" as const, proposal: undefined });

/** Whether the route stands at the whole screen now (a Keep's page and its tasks keep it, D542). */
const fullNow = () => A.route.name !== "conv" && !!A.route.full;

/** Opens a Keep's page in the board's place, and asks the home for it. D542: from a task at the
 *  whole screen (its rail) it stays at the whole screen. */
export function openKeep(id: string) {
  K.open = id;
  K.pause = K.stop = false;
  K.talk = { text: "", sending: "", at: 0, sent: "" };
  K.edit = freshEdit();
  K.words = freshWords();
  K.done = undefined;
  K.bell = undefined;
  K.bellOpen = false;
  K.bellBusy = false;
  K.bellError = "";
  K.bellSending = "";
  A.send({ t: "keep", id });
  if (A.route.name !== "onhand") A.go(fullNow() ? { name: "onhand", full: true } : { name: "onhand" });
  else A.changed();
}

/** D542: the Keep whose own work a task is (a Keep in rounds: its rounds' task), so a row of it
 *  opens the Keep's page, never the round's task; a Keep's item (one PR it babysits) is its own task. */
export function keepOfTask(taskId: string): string | undefined {
  return (A.S.onHand?.keeps ?? []).find((k) => k.run !== "perItem" && k.taskIds.includes(taskId))?.id;
}

/** D542: a task opened from a Keep's page stays at the width the page stood at. */
const goTask = (id: string) => A.go({ name: "task", id, full: fullNow() });

export function closeKeep() {
  K.open = "";
  K.pause = K.stop = false;
  K.bell = undefined;
  K.bellOpen = false;
  A.changed();
}

/** D620: the home may hand the URL to the page once (a partner turned it on). */
const bellHref = (url: string) => (url.startsWith("/") ? `${location.origin}${url}` : url);

export function onKeepFrame(f: Extract<ServerFrame, { t: "keep_result" }>) {
  if (f.keep) K.pages.set(f.id, f.keep);
  else K.pages.delete(f.id);
  if (f.keep?.bell?.url) K.bell = { id: f.id, url: bellHref(f.keep.bell.url) };
  A.changed();
}

/** D533: an edit came back (closed with its line and Undo, or its error at the row), or the rules read from edited words. */
export function onKeepEdit(f: Extract<ServerFrame, { t: "keep_changed" | "keep_proposal" }>) {
  if (f.id !== K.open) return;
  if (f.t === "keep_proposal") {
    if (K.words.phase === "reading") (K.words.phase = "read"), (K.words.proposal = f.proposal);
  } else if (K.bellSending && f.id === K.open) {
    // D620: the doorbell row's answer: on/new keep the row open with the URL, off closes it.
    const was = K.bellSending;
    K.bellSending = "";
    K.bellBusy = false;
    if (f.ok) {
      K.bellError = "";
      if (was === "off") K.bell = undefined;
      if (f.bell) K.bell = { id: f.id, url: bellHref(f.bell.url) };
    } else {
      K.bellError = t("keep.edit.failed", f.error ?? "");
    }
  } else if (f.ok) {
    K.edit = freshEdit();
    if (K.words.phase === "saving") K.words = freshWords();
    K.done = f.undone ? { id: f.id, edits: f.edits ?? [], undone: true } : (f.edits ?? []).length ? { id: f.id, edits: f.edits!, ...(f.undo ? { undo: f.undo } : {}) } : undefined;
  } else {
    const err = t("keep.edit.failed", f.error ?? "");
    if (K.words.phase === "saving") (K.words.phase = "read"), (K.edit.error = err);
    else (K.edit.busy = false), (K.edit.error = err);
  }
  A.changed();
}

/** Sends a change on the one path the partner's keep_change takes (core checks it again). */
const sendChange = (id: string, change: KeepChange, undo?: boolean) => {
  A.send({ t: "keep_change", id, change, ...(undo ? { undo: true } : {}) });
  A.changed();
};

// ---------- D533: a change's words ----------

const SPEAKS = ["keep.speaks.news", "keep.speaks.default", "keep.speaks.every"] as const;

/** A field's value as the page says it (an absent one: what having none means). */
export function fieldWords(field: KeepField, v?: string): string {
  if (field === "every") return v ? t("keep.every", rhythm(Number(v) * 60_000)) : "";
  if (field === "agent") return !v || v === "auto" ? t("newtasks.auto") : harnessName(v);
  if (field === "where") return !v || v === "auto" ? t("newtasks.auto") : v;
  if (field === "cap") return v ? t("keep.cap", Number(v)) : "";
  if (field === "speaks") return v || t("keep.speaks.default");
  if (field === "until") return v || t("keep.until.none");
  if (field === "limits") return v || t("keep.limits.none");
  return v ?? "";
}

/** A value inside a sentence (D533): a rhythm as people say it (每 45 分钟一轮, every 45 minutes); a rule's
 *  words start lower case there, a name (a computer, an agent, an address) as it is. No language branch:
 *  Chinese has no case. */
function inSentence(field: KeepField, v?: string): string {
  if (field === "every") return v ? t("keep.edit.every", rhythm(Number(v) * 60_000)) : "";
  const w = fieldWords(field, v);
  if (field === "where" || field === "agent" || field === "address" || field === "title") return w;
  return /^[A-Z][^A-Z]/.test(w) ? w[0]!.toLowerCase() + w.slice(1) : w;
}

/** One change said in words, never an arrow (D533): 你把每 45 分钟一轮改成了每小时一轮 / You changed every 45 minutes to every hour. */
export function editSentence(by: "you" | "partner", e: KeepEdit, persona?: string): string {
  const who = by === "you" ? t("keep.edit.you") : A.nameOf(persona);
  // D593: words added from now on are said as what was added; any other change to the words as a change.
  if (e.field === "said") return e.to ? t("keep.edit.added", who, e.to) : t("keep.edit.said", who);
  const shown = ["speaks", "until", "limits", "where", "agent"].includes(e.field);
  if ((e.from || shown) && (e.to || shown)) return t("keep.edit.line", who, inSentence(e.field, e.from), inSentence(e.field, e.to));
  return e.to ? t("keep.edit.set", who, inSentence(e.field, e.to)) : t("keep.edit.cleared", who, inSentence(e.field, e.from));
}

/** A change as lines among its rounds (core already took undone ones away and folded close ones together). */
export function editLines(r: KeepRound, persona?: string): string[] {
  const ed = r.edit;
  return ed ? ed.edits.map((e) => editSentence(ed.by, e, persona)) : [];
}

/** The rule a field stands under on the page. */
const RULE_OF: Record<KeepField, string> = { every: "keep.rule.wakes", at: "keep.rule.wakes", until: "keep.rule.until", speaks: "keep.rule.speaks", limits: "keep.rule.limits", cap: "keep.rule.limits", where: "keep.rule.where", agent: "keep.rule.where", address: "keep.rule.address", said: "keep.said", title: "keep.said" };

// ---------- the mark ----------

/**
 * The mark (§8): a lantern, lit while on, a beat when a round did something, dim when paused, out
 * with a tick when done, out when stopped. A flat placeholder until the clay art is rated: the one
 * place a Keep's mark is drawn, so the art (or the track) takes its place here alone.
 */
export const MARK: "lantern" = "lantern";
export function KeepMark({ life, size = 40, beat }: { life: KeepSheet["life"]; size?: number; beat?: boolean }) {
  const out = life === "done" || life === "stopped";
  const glow = life === "on" ? 1 : life === "paused" ? 0.32 : 0;
  return (
    <span class={`kp-mark${beat && life === "on" ? " beat" : ""}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <path d="M15 7.5a5 5 0 0 1 10 0" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-linecap="round" />
        <path d="M12.5 12h15l-2-4h-11z" fill="var(--ink-soft)" />
        <rect x="11" y="12" width="18" height="21" rx="5" fill={out ? "var(--sunken)" : "var(--waiting-surface)"} stroke="var(--ink-soft)" stroke-width="2" />
        <circle class="kp-glow" cx="20" cy="23" r="8" fill="var(--waiting-dot)" opacity={glow * 0.55} />
        <path d="M17.5 25.5c0-3 2.5-4 2.5-7 1.6 2 2.5 3.6 2.5 6a2.5 2.5 0 0 1-5 1z" fill={out ? "var(--faint)" : "var(--accent)"} opacity={out ? 0.5 : glow || 0.35} />
        <path d="M10 33h20" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round" />
        {life === "done" && (
          <>
            <circle cx="31" cy="31" r="7" fill="var(--done-dot)" stroke="var(--surface)" stroke-width="2" />
            <path d="M27.8 31.2l2.2 2.1 4-4.3" fill="none" stroke="var(--done-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}

// ---------- the words of a Keep ----------

/** A round counts as a beat for an hour after it did something (told or asked). */
const beatNow = (k: KeepSheet, now = Date.now()) => !!k.line && now - Date.parse(k.line.at) < 60 * 60_000;

/** Its facts, each its own element: what it holds, what waits, its rhythm, a short goal. */
export function keepFacts(k: KeepSheet): { text: string; tone?: "needs" }[] {
  const out: { text: string; tone?: "needs" }[] = [];
  const work = k.items.filter((x) => x.at !== "you" && x.at !== "ready");
  if (k.run === "perItem" && k.items.length) out.push({ text: k.items.every((x) => x.pr) ? t("keep.holds.pr", k.items.length) : t("keep.holds", k.items.length) });
  else if (k.run === "fresh" && work.length > 1) out.push({ text: t("keep.holds", work.length) });
  if (k.asks) out.push({ text: t("keep.asks", k.asks), tone: "needs" });
  if (k.everyMs) out.push({ text: t("keep.every", rhythm(k.everyMs)) });
  else if (k.cadence) out.push({ text: k.cadence });
  if (k.reviews?.waiting) out.push({ text: t("keep.reviews", k.reviews.waiting) });
  if (k.until && [...k.until].length <= 24) out.push({ text: k.until });
  return out;
}

/** Its line: how it keeps time when it doesn't; else its last change. */
export function keepLine(k: KeepSheet): string {
  if (k.health) return healthLine(k.health).join("");
  if (k.line) return t("keep.line", clock(k.line.at), k.line.text);
  return "";
}

/** At its right edge: when it wakes next, or why it doesn't. */
export function keepBeatWords(k: KeepSheet, now = Date.now()): string {
  switch (keepBeat(k)) {
    case "arrives":
      return t("keep.beat.arrives");
    case "next":
      return t("keep.beat.next", soon(k.nextAt!, now));
    case "running":
      return t("keep.beat.running");
    case "paused":
      return k.pausedUntil ? t("keep.beat.pausedUntil", soon(k.pausedUntil, now)) : t("keep.beat.paused");
    case "ended":
      return t(`keep.life.${k.life}`);
    default:
      return "";
  }
}

const itemWords = (x: KeepItem): { text: string; tone: "needs" | "ok" | "work" | "" } =>
  x.at === "ready" ? { text: t("keep.item.ready"), tone: "ok" } : x.at === "you" ? { text: x.yours || t("keep.item.you"), tone: "needs" } : x.said ? { text: prPhaseWords(x.said), tone: "work" } : { text: t(`keep.item.${x.at}`), tone: x.at === "work" ? "work" : "" };

const prNum = (pr?: string) => (pr ? pr.replace(/^.*#/, "#") : "");

// ---------- On hand: one sheet ----------

/** One Keep under 看守中: its head opens its page; its tasks at work nest under it (up to three). */
/** D602: a held item's quiet ⋯ on On hand's sheet: 不用跟了 / Stop following asks in place on the
 *  Keep's page; 打开任务 opens its task. */
function ItemMore({ keepId, x }: { keepId: string; x: KeepItem }) {
  const [open, setOpen] = useState(false);
  const at = useRef<HTMLSpanElement>(null);
  return (
    <span class={`kp-hmore${open ? " open" : ""}`} ref={at}>
      <MoreButton label={t("away.more", x.title)} open={open} onClick={() => setOpen(!open)} />
      {open &&
        createPortal(
          <Menu class="pmenu" label={x.title} anchor={at} onClose={() => setOpen(false)}>
            <MenuItem onClick={() => (setOpen(false), openKeep(keepId), (K.release = x.pr ?? x.taskId), A.changed())}>{t("keep.item.release")}</MenuItem>
            <MenuItem onClick={() => (setOpen(false), goTask(x.taskId))}>{t("keep.item.task")}</MenuItem>
          </Menu>,
          document.body,
        )}
    </span>
  );
}

export function KeepSheetCard({ k, stacked }: { k: KeepSheet; stacked: boolean }) {
  const facts = keepFacts(k);
  const line = k.run === "perItem" && !k.health ? "" : keepLine(k);
  const beat = keepBeatWords(k);
  const nested = k.run === "perItem" ? k.items.filter((x) => x.at !== "you" && x.at !== "ready") : [];
  const shown = nested.slice(0, 3);
  return (
    <div class={`kp-sheet${k.life === "paused" ? " paused" : ""}`} data-keep={k.id} data-look={A.lookOf(k.persona)}>
      <button class="kp-head" onClick={() => openKeep(k.id)} aria-label={spoken(A.L, t("keep.open", k.title), ...facts.map((f) => f.text), beat)}>
        <KeepMark life={k.life} beat={beatNow(k)} />
        <span class="kp-tx">
          <span class="kp-title">
            <PartnerMark persona={k.persona} />
            {k.title}
          </span>
          {facts.length > 0 && (
            <span class="kp-facts">
              {facts.map((f) => (
                <span key={f.text} class={f.tone ? `f ${f.tone}` : "f"}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
          {line && <span class={`kp-line${k.health ? " late" : ""}`}>{line}</span>}
          {stacked && beat && <span class="kp-beat">{beat}</span>}
        </span>
        {!stacked && beat && <span class="kp-beat">{beat}</span>}
      </button>
      {shown.length > 0 && (
        <div class="kp-held">
          {shown.map((x) => {
            const w = itemWords(x);
            return (
              <div key={x.pr ?? x.taskId} class="kp-hrow">
                <button class="kp-h" onClick={() => goTask(x.taskId)} title={x.title}>
                  <i class={`kp-dot ${x.at}`} aria-hidden="true" />
                  <span class="n">
                    {x.pr && !x.title.includes(prNum(x.pr)) && <b>{prNum(x.pr)}</b>}
                    <span>{x.title}</span>
                  </span>
                  <span class={`s ${w.tone}`}>{w.text}</span>
                </button>
                <ItemMore keepId={k.id} x={x} />
              </div>
            );
          })}
          {nested.length > shown.length && (
            <button class="kp-more" onClick={() => openKeep(k.id)}>
              {t("keep.more", nested.length - shown.length)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- its page ----------

const PAUSES: { key: string; until: (now: number) => string | undefined }[] = [
  { key: "keep.pause.hour", until: (now) => new Date(now + 60 * 60_000).toISOString() },
  {
    key: "keep.pause.morning",
    until: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    },
  },
  { key: "keep.pause.week", until: (now) => new Date(now + 7 * 86_400_000).toISOString() },
  { key: "keep.pause.resume", until: () => undefined },
];

const act = (id: string, a: { action: "pause"; until?: string } | { action: "resume" } | { action: "look_now" } | { action: "stop" }) => {
  K.pause = K.stop = false;
  A.send({ t: "keep_action", id, ...a });
  A.changed();
};

function wokeWords(r: KeepRound, k: KeepPage): string {
  switch (r.woke) {
    case "arrival":
      return r.wokeWhat ? t("keep.woke.arrival", r.wokeWhat) : t("keep.woke.arrival.bare");
    case "change":
      // D560: what changed, as a sentence: a pull request's own change (from its wait's command), a
      // condition that came true in its own words, or new activity on what it watches.
      if (r.wokePr) return t(`keep.woke.pr.${r.wokePr.what}`, r.wokePr.pr);
      if (r.wokeWhat && r.wokeMet) return t("keep.woke.met", r.wokeWhat);
      return r.wokeWhat ? t("keep.woke.change", r.wokeWhat) : t("keep.woke.change.bare");
    case "now":
      return t("keep.woke.now");
    case "ring":
      // D620: the caller's label is shown here, as their words, never as an instruction.
      return r.wokeWhat ? t("keep.woke.ring.about", r.wokeWhat) : t("keep.woke.ring");
    case "first":
      return t("keep.woke.first");
    default:
      return k.everyMs ? t("keep.woke.every", rhythm(k.everyMs)) : t("keep.woke.time");
  }
}

const outWords = (r: KeepRound) => (r.state === "running" ? t("keep.round.running") : r.state === "failed" ? t("keep.round.failed") : r.state === "skipped" ? t("keep.round.skipped") : t(`keep.round.${r.spoke}`));

/** D519: one round: its time in the column, what woke it, what happened in one line to the person
 *  (the model's, once it has read the report), how it ended; the report as the task wrote it to
 *  Ducter only behind 看细节, with the way to its task. */
function Round({ r, k, open, onToggle }: { r: KeepRound; k: KeepPage; open: boolean; onToggle: () => void }) {
  // D533: a change the person or the partner made stands among the rounds as who changed what.
  if (r.woke === "edit")
    return (
      <div class="kp-rd edit">
        <TimeCol at={r.at} text={colTime(A.L, r.at)} />
        <span class="body">
          {editLines(r, k.persona).map((l, i) => (
            <span key={i} class="did">
              {l}
            </span>
          ))}
        </span>
      </div>
    );
  const more = !!r.report;
  // D619: a round whose task answered a sender over Bridge says quietly who has read it; nothing when Mem has no receipt.
  const receipt = receiptWords(A.S.receiptOfTask(r.taskId), A.L);
  return (
    <div class={`kp-rd${open ? " open" : ""}`}>
      <TimeCol at={r.at} text={colTime(A.L, r.at)} />
      <span class="body">
        <span class="why">{wokeWords(r, k)}</span>
        {r.did && <span class="did">{r.did}</span>}
        {open && (
          <span class="kp-detail">
            {r.report && <span class="rep">{r.report}</span>}
            {r.taskId && <Btn kind="text" size="sm" chev label={t("keep.item.task")} onClick={() => goTask(r.taskId!)} />}
          </span>
        )}
      </span>
      <span class="end">
        <span class={`out o-${r.spoke}${r.state === "failed" ? " failed" : ""}`}>{outWords(r)}</span>
        {receipt && <small class="receipt">{receipt}</small>}
        {more && <Btn kind="text" size="sm" chev expanded={open} label={t("keep.round.details")} onClick={onToggle} />}
      </span>
    </div>
  );
}

/** D550: a quiet run's span, each end its clock, with its day when not today (the end's only when
 *  the day changed): 20:55 到 22:25, 昨天 16:39 到 21:09, 昨天 23:24 到 0:54. */
function spanWords(from: string, to: string): [string, string] {
  const today = new Date().toDateString();
  const at = (iso: string) => (new Date(iso).toDateString() === today ? clock(iso) : `${colTime(A.L, iso)} ${clock(iso)}`);
  return [at(from), new Date(from).toDateString() === new Date(to).toDateString() ? clock(to) : at(to)];
}

/** D550: every run of quiet rounds is one row, the shared work head (D530) the opened task folds
 *  them with; a click opens it in place, its rounds under it. */
export function Rounds({ k }: { k: KeepPage }) {
  const [open, setOpen] = useState("");
  const [runs, setRuns] = useState<Set<string>>(new Set());
  if (!k.rounds.length) return <p class="kp-empty">{t("keep.rounds.none")}</p>;
  const round = (r: KeepRound) => {
    const id = `${r.at}|${r.taskId ?? ""}|${r.woke}`;
    return <Round key={id} r={r} k={k} open={open === id} onToggle={() => setOpen(open === id ? "" : id)} />;
  };
  return (
    <div class="kp-card kp-rounds">
      {foldRounds(k.rounds).map((x) => {
        if (!("fold" in x)) return round(x.round);
        const id = `q${x.to}`;
        const shown = runs.has(id);
        const [from, to] = spanWords(x.from, x.to);
        return [
          <div key={id} class={`kp-quiet${shown ? " open" : ""}`}>
            <WorkHead
              words={t("loop.quiet", x.fold.length, from, to)}
              failed={0}
              open={shown}
              onClick={() => {
                const next = new Set(runs);
                if (shown) next.delete(id);
                else next.add(id);
                setRuns(next);
              }}
            />
          </div>,
          ...(shown ? x.fold.map(round) : []),
        ];
      })}
    </div>
  );
}

/** D602: 不用跟了's one line under a held item: a finished task lets its PR go (it stays open on GitHub);
 *  one still at work is put down with it. Core's `end` does either. */
function ReleaseAsk({ x }: { x: KeepItem }) {
  const task = A.S.tasks.get(x.taskId);
  const done = !!task && finished(task);
  const ask = done ? t("keep.item.release.done", x.pr ? prNum(x.pr) : x.title) : t("keep.item.release.open", x.title.length > 40 ? cutAtWord(x.title, 40) : x.title);
  return (
    <div class="kp-release">
      <GConfirm ask={ask} keep={t("task.end.keep")} go={t("keep.item.release")} about={x.title} onKeep={() => ((K.release = ""), A.changed())} onGo={() => ((K.release = ""), A.send({ t: "task_action", taskId: x.taskId, action: "end" }), A.changed())} />
    </div>
  );
}

function ItemRow({ x }: { x: KeepItem }) {
  const w = itemWords(x);
  // D624: the facts a board used to show (CI, draft, a conflict or changes, the head) stand on
  // the row through the same words On hand uses, each its own element.
  const facts = x.said ? prFacts(x.said) : [];
  return (
    <div class="kp-item">
      <i class={`kp-dot big ${x.at}`} aria-hidden="true" />
      <span class="body">
        <span class="t">
          {x.pr && !x.title.includes(prNum(x.pr)) && <b>{prNum(x.pr)}</b>}
          <span>{noOrphan(x.title)}</span>
        </span>
        <span class={`st ${w.tone}`}>{w.text}</span>
        {facts.length > 0 && <Facts class="kp-item-facts" items={facts} />}
      </span>
      <span class="acts">
        {x.pr && <Btn kind="text" size="sm" label={t("keep.item.pr")} onClick={() => window.open(`https://github.com/${x.pr!.replace("#", "/pull/")}`, "_blank", "noopener")} />}
        <Btn kind="text" size="sm" label={t("keep.item.task")} onClick={() => goTask(x.taskId)} />
        {/* D602: 不用跟了 / Stop following, asked in place under the row. */}
        <Btn kind="text" size="sm" label={t("keep.item.release")} about={x.title} onClick={() => ((K.release = x.pr ?? x.taskId), A.changed())} />
      </span>
      {K.release === (x.pr ?? x.taskId) && <ReleaseAsk x={x} />}
    </div>
  );
}

/** D616: 不用跟了 on a hand-off nobody took: the same confirm line as D602, and the record is
 *  withdrawn; the sender hears it once. */
function WithdrawAsk({ h, title }: { h: HandoffLine; title: string }) {
  const ask = t("keep.handoff.release", h.to, title.length > 40 ? cutAtWord(title, 40) : title);
  return (
    <div class="kp-release">
      <GConfirm ask={ask} keep={t("task.end.keep")} go={t("keep.item.release")} about={title} onKeep={() => ((K.release = ""), A.changed())} onGo={() => ((K.release = ""), A.send({ t: "handoff_withdraw", id: h.id }), A.changed())} />
    </div>
  );
}

/** D609: a hand-off's row in 手上的事. It is the task's own row once one has it; before that it
 *  is the item and who gave it, and a returned or declined one carries why it came back. */
function HandoffRow({ h, k }: { h: HandoffLine; k: KeepPage }) {
  const item = h.taskId ? k.items.find((x) => x.taskId === h.taskId) : undefined;
  if (item && h.state === "taken") return <ItemRow x={item} />;
  const title = h.item.title?.trim() || h.item.ref;
  const pr = h.item.kind === "pr" ? h.item.ref : "";
  const rel: KeepItem = { taskId: h.taskId ?? h.id, title, at: "work", ...(pr ? { pr } : {}) };
  const key = pr || h.taskId || h.id;
  const waiting = h.state === "given" || h.state === "unclaimed";
  const why = (h.why || h.outcome || "").trim();
  return (
    <div class="kp-item">
      <i class={`kp-dot big ${waiting ? "rest" : "work"}`} aria-hidden="true" />
      <span class="body">
        <span class="t">
          {pr && !title.includes(prNum(pr)) && <b>{prNum(pr)}</b>}
          <span>{noOrphan(title)}</span>
        </span>
        {waiting ? (
          <Facts items={[h.sender, when(A.L, h.givenAt)]} class="kp-handoff-facts" />
        ) : (
          why && <span class="st">{why}</span>
        )}
      </span>
      <span class="acts">
        {waiting && <Btn kind="text" size="sm" label={t("keep.handoff.take")} about={title} onClick={() => (A.send({ t: "handoff_take", id: h.id }), A.changed())} />}
        {waiting && <Btn kind="text" size="sm" label={t("keep.item.release")} about={title} onClick={() => ((K.release = key), A.changed())} />}
        {h.taskId && !waiting && <Btn kind="text" size="sm" label={t("keep.item.task")} onClick={() => goTask(h.taskId!)} />}
        {h.taskId && !waiting && (
          <Btn kind="text" size="sm" label={t("keep.item.release")} about={title} onClick={() => ((K.release = key), A.changed())} />
        )}
      </span>
      {waiting && K.release === key && <WithdrawAsk h={h} title={title} />}
      {h.taskId && !waiting && K.release === key && <ReleaseAsk x={rel} />}
    </div>
  );
}

/** D609: 手上的事 grouped by state: 等接手 first (who gave it and when), then 在做, then 退回了
 *  and 没接. One card holds every group, each group's head inside it; the card's hairline runs
 *  between rows and before a group's head. Nothing is drawn for an empty group. */
function HandoffGroups({ k }: { k: KeepPage }) {
  const groups = handoffGroups(k.handoffs ?? [], k.items);
  const any = groups.some((g) => g.rows.length || g.legacy.length);
  if (!any) return <p class="kp-empty">{t("keep.holding.none")}</p>;
  return (
    <div class="kp-card kp-handoffs">
      {groups.map((g) =>
        g.rows.length || g.legacy.length ? (
          <Fragment key={g.key}>
            <SectionHead label={t(`keep.holding.${g.key}`)} />
            {g.rows.map((h) => (
              <HandoffRow key={h.id} h={h} k={k} />
            ))}
            {g.legacy.map((x) => <ItemRow key={x.pr ?? x.taskId} x={x} />)}
          </Fragment>
        ) : null,
      )}
    </div>
  );
}

function Items({ k }: { k: KeepPage }) {
  if (!k.items.length) return <p class="kp-empty">{t("keep.holding.none")}</p>;
  return (
    <div class="kp-card">
      {k.items.map((x) => (
        <ItemRow key={x.pr ?? x.taskId} x={x} />
      ))}
    </div>
  );
}

function wakeLines(k: KeepPage): string[] {
  return k.wakes.map((w) =>
    w.kind === "arrives" ? t("keep.wake.arrives") : w.kind === "every" ? t("keep.every", rhythm(w.everyMs)) : w.kind === "at" ? w.words : w.words ? t("keep.wake.changes", w.words) : t("keep.wake.changes.prs"),
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * D533: each rule changes in place with its own control, through the one path the partner's
 * keep_change takes: what is checked here (a range, an empty field) is said at once in the person's
 * words; core checks it all again. A change applies at once; its line and Undo stand under the card.
 */
function HowItRuns({ k }: { k: KeepPage }) {
  const ended = k.life === "done" || k.life === "stopped";
  const ed = new Set(k.editable ?? []);
  const e = K.edit;
  const d = e.draft;
  const open = (field: KeepField, draft: Record<string, string>) => {
    K.edit = { field, draft, busy: false, error: "" };
    K.words = freshWords();
    K.done = undefined;
    A.changed();
  };
  const cancel = () => ((K.edit = freshEdit()), A.changed());
  const fail = (key: string) => ((K.edit.error = t(key)), A.changed());
  const set = (key: string) => (v: string) => ((K.edit.draft[key] = v), (K.edit.error = ""), A.changed());
  const save = () => {
    if (e.busy) return;
    const f = e.field;
    let change: KeepChange | undefined;
    if (f === "every") {
      const n = Number(d.every);
      if (!d.every || n < 5 || n > 10_080) return fail("keep.edit.every.range");
      change = { everyMinutes: n };
    } else if (f === "at") {
      if (!TIME.test(d.time ?? "")) return fail("keep.edit.at.bad");
      change = { at: { ...(k.at ?? {}), every: (d.every || k.at?.every || "day") as "day", time: d.time! } as KeepChange["at"] };
    } else if (f === "until" || f === "limits") change = { [f]: (d[f] ?? "").trim() };
    else if (f === "speaks") change = { speaks: d.speaks === "keep.speaks.default" ? "" : d.speaks === "custom" ? (k.speaks ?? "") : t(d.speaks ?? "") };
    else if (f === "cap") {
      const n = Number(d.cap);
      if (!d.cap || n < 1 || n > 30) return fail("keep.edit.cap.range");
      change = { cap: n };
    } else if (f === "where") change = { ...(d.where !== undefined ? { where: d.where } : {}), ...(d.agent !== undefined ? { agent: d.agent } : {}) };
    else if (f === "address") {
      if (!(d.address ?? "").trim()) return fail("keep.edit.empty");
      change = { address: d.address!.trim() };
    }
    if (!change || !Object.keys(change).length) return cancel();
    K.edit.busy = true;
    sendChange(k.id, change);
  };
  const row = (p: { field?: KeepField; label: string; values: string[]; muted?: string; draft?: () => Record<string, string>; editor?: () => ComponentChildren }) => (
    <EditRow
      key={p.label}
      label={t(p.label)}
      values={p.values}
      muted={p.muted}
      editable={!!p.field && ed.has(p.field) && !ended}
      open={!!p.field && e.field === p.field}
      busy={e.busy}
      error={e.error}
      onOpen={() => p.field && p.draft && open(p.field, p.draft())}
      onSave={save}
      onCancel={cancel}
    >
      {p.editor?.()}
    </EditRow>
  );
  // 在哪儿做 / 谁来做: the pickers of D510, each only where there is a choice; a task in rounds names one (no 自动).
  const comps = taskComputers();
  const agents = taskAgents();
  const idOf = (c: { home: boolean; id: string }) => (c.home ? "local" : c.id);
  const auto = k.run !== "same";
  const whereOpts = [...(auto ? [{ v: "auto", label: t("newtasks.auto") }] : []), ...comps.map((c) => ({ v: idOf(c), label: c.name }))];
  const whoOpts = [...(auto ? [{ v: "auto", label: t("newtasks.auto") }] : []), ...agents.map((h) => ({ v: h, label: harnessName(h) }))];
  const pick = (label: string, value: string, options: { v: string; label: string }[], on: (v: string) => void) =>
    options.length <= SEG_MAX ? <Seg label={label} value={value} options={options} onPick={on} /> : <Select label={label} value={value} options={options} onPick={on} />;
  const whereWords = [k.where?.deviceName ?? (k.where || k.device ? t("keep.where.home") : ""), k.where?.harness ? harnessName(k.where.harness) : k.agent ? harnessName(k.agent) : ""].filter(Boolean);
  const canWhere = ed.has("where") && whereOpts.length > 1;
  const canWho = ed.has("agent") && whoOpts.length > 1;
  const speaksKey = SPEAKS.find((s) => (s === "keep.speaks.default" ? !k.speaks : t(s) === k.speaks)) ?? "custom";
  const everyMin = k.everyMs ? String(Math.round(k.everyMs / 60_000)) : "";
  const wakeField: KeepField | undefined = ed.has("every") ? "every" : ed.has("at") ? "at" : undefined;
  const helper = k.run === "perItem";
  const rows = [
    row({
      field: wakeField,
      label: "keep.rule.wakes",
      values: wakeLines(k),
      draft: (): Record<string, string> => (wakeField === "every" ? { every: everyMin } : { every: k.at?.every ?? "day", time: k.at?.time ?? "" }),
      editor: () =>
        e.field === "every" ? (
          <NumberField value={d.every ?? ""} label={t("keep.rule.wakes")} unit={t("keep.edit.every.unit")} autoFocus onInput={set("every")} />
        ) : (
          <span class="er-two">
            <Seg
              label={t("keep.rule.wakes")}
              value={d.every}
              options={[{ v: "day", label: t("keep.edit.at.day") }, { v: "weekday", label: t("keep.edit.at.weekday") }, ...(k.at && k.at.every !== "day" && k.at.every !== "weekday" ? [{ v: k.at.every, label: wakeLines(k)[0] ?? k.at.every }] : [])]}
              onPick={set("every")}
            />
            <Field value={d.time ?? ""} label={t("keep.edit.at.time")} placeholder="08:00" maxLength={5} autoFocus onInput={set("time")} />
          </span>
        ),
    }),
    ...(k.until || k.noEnd
      ? [row({ field: "until", label: "keep.rule.until", values: [k.until ?? t("keep.until.none")], draft: () => ({ until: k.until ?? "" }), editor: () => <Field value={d.until ?? ""} label={t("keep.rule.until")} placeholder={t("keep.edit.until.ph")} autoFocus onInput={set("until")} /> })]
      : []),
    row({
      field: "speaks",
      label: "keep.rule.speaks",
      values: [k.speaks ?? t("keep.speaks.default")],
      muted: t("keep.speaks.quiet"),
      draft: () => ({ speaks: speaksKey }),
      editor: () => <Seg label={t("keep.rule.speaks")} value={d.speaks} options={[...SPEAKS.map((s) => ({ v: s as string, label: t(s) })), ...(speaksKey === "custom" ? [{ v: "custom", label: k.speaks ?? "" }] : [])]} onPick={set("speaks")} />,
    }),
    ...(helper
      ? [row({ field: "cap", label: "keep.rule.limits", values: [t("keep.cap", k.cap ?? 10)], draft: () => ({ cap: String(k.cap ?? 10) }), editor: () => <NumberField value={d.cap ?? ""} label={t("keep.rule.limits")} unit={t("keep.edit.cap.unit")} autoFocus onInput={set("cap")} /> })]
      : k.limits || ed.has("limits")
        ? [row({ field: "limits", label: "keep.rule.limits", values: [k.limits ?? t("keep.limits.none")], draft: () => ({ limits: k.limits ?? "" }), editor: () => <Field value={d.limits ?? ""} label={t("keep.rule.limits")} placeholder={t("keep.edit.limits.ph")} autoFocus onInput={set("limits")} /> })]
        : []),
    ...(whereWords.length || canWhere || canWho
      ? [
          row({
            field: canWhere || canWho ? "where" : undefined,
            label: "keep.rule.where",
            values: [whereWords.length ? whereWords.join(t("keep.where.sep")) : t("newtasks.auto")],
            draft: () => ({}),
            editor: () => (
              <span class="er-two">
                {canWhere && (
                  <span class="er-pick">
                    <span class="lb">{t("keep.where.label")}</span>
                    {pick(t("keep.where.label"), d.where ?? k.device ?? "auto", whereOpts, set("where"))}
                  </span>
                )}
                {canWho && (
                  <span class="er-pick">
                    <span class="lb">{t("keep.who.label")}</span>
                    {pick(t("keep.who.label"), d.agent ?? k.agent ?? "auto", whoOpts, set("agent"))}
                  </span>
                )}
              </span>
            ),
          }),
        ]
      : []),
    ...(k.address
      ? [row({ field: "address", label: "keep.rule.address", values: [t("keep.address.name", k.address.name), ...(k.address.spaces?.length ? [t("keep.address.spaces", k.address.spaces.map((s) => s.replace(/ /g, "\u00a0")).join(t("keep.address.sep")))] : [])], muted: t(`keep.address.${k.address.mem}`), draft: () => ({ address: k.address!.name }), editor: () => <Field value={d.address ?? ""} label={t("keep.rule.address")} placeholder={t("keep.edit.address.ph")} autoFocus onInput={set("address")} /> })]
      : []),
  ];
  const done = K.done?.id === k.id ? K.done : undefined;
  // D620: 门铃 / Doorbell: off by default; on, the URL is shown once with Copy and curl;
  // Regenerate and Turn off. A helper takes work at its address, so it has no rounds to ring.
  const bellUrl = K.bell?.id === k.id ? K.bell.url : "";
  const bellCurl = bellUrl ? `curl -X POST -H 'X-Ducter-About: CI #42' '${bellUrl}'` : "";
  const sendBell = (action: "on" | "off" | "new") => {
    if (K.bellBusy) return;
    K.bellSending = action;
    K.bellBusy = true;
    K.bellError = "";
    A.send({ t: "keep_change", id: k.id, change: { bell: action } });
    A.changed();
  };
  // D620: Done folds the block, never a Cancel: the URL is already there, nothing to undo.
  const foldBell = () => ((K.bellOpen = false), (K.bellError = ""), A.changed());
  const bellFoot = (
    <>
      {k.bell ? (
        <>
          <Btn kind="text" size="sm" label={t("keep.bell.new")} disabled={K.bellBusy} onClick={() => sendBell("new")} />
          <DangerButton quiet label={t("keep.bell.on.act")} about={k.title} onClick={() => sendBell("off")} />
        </>
      ) : (
        <Btn kind="secondary" size="sm" label={t("keep.bell.off.act")} disabled={K.bellBusy} onClick={() => sendBell("on")} />
      )}
      <span class="end">
        <Btn kind="primary" size="sm" label={t("keep.bell.done")} onClick={foldBell} />
      </span>
    </>
  );
  const bellRow = (
    <EditRow
      label={t("keep.rule.bell")}
      values={[k.bell ? t("keep.bell.on") : t("keep.bell.off")]}
      editable={!ended}
      open={K.bellOpen}
      busy={K.bellBusy}
      error={K.bellError}
      saveLabel={t("keep.bell.done")}
      onOpen={() => ((K.bellOpen = true), (K.bellError = ""), A.changed())}
      onSave={foldBell}
      onCancel={foldBell}
      foot={bellFoot}
    >
      {!k.bell && <span class="later-note">{t("keep.bell.off.what")}</span>}
      {k.bell && bellUrl && (
        <>
          <CopyLine text={bellUrl} kind="check" />
          <span class="later-note">{t("keep.bell.curl")}</span>
          <CopyLine text={bellCurl} kind="line" />
          <span class="later-note">{t("keep.bell.note.once")}</span>
          <span class="later-note">{t("keep.bell.note.where")}</span>
        </>
      )}
      {k.bell && !bellUrl && <span class="later-note">{t("keep.bell.hidden")}</span>}
    </EditRow>
  );
  return (
    <>
      <div class="kp-card kp-rules">
        {rows}
        {!helper && bellRow}
        {!ended && (
          <div class="acts">
            {k.life === "paused" ? (
              <Btn kind="secondary" size="sm" grow label={t("keep.resume")} onClick={() => act(k.id, { action: "resume" })} />
            ) : (
              <Btn kind="secondary" size="sm" grow chev expanded={K.pause} label={t("keep.pause")} onClick={() => ((K.pause = !K.pause), (K.stop = false), A.changed())} />
            )}
            {k.life === "on" && !k.wakes.every((w) => w.kind === "arrives" || (w.kind === "changes" && !w.words)) && <Btn kind="secondary" size="sm" grow label={t("keep.look")} onClick={() => act(k.id, { action: "look_now" })} />}
            {/* D592: 结束看守 ends it for good: the destructive one, last, apart, asking in place (D289, D583). */}
            {!K.stop && (
              <span class="end">
                <DangerButton quiet label={t("keep.stop")} about={k.title} onClick={() => ((K.stop = true), (K.pause = false), A.changed())} />
              </span>
            )}
          </div>
        )}
        {K.pause && (
          <Menu class="kp-menu" label={t("keep.pause")} focusFirst onClose={() => ((K.pause = false), A.changed())}>
            {PAUSES.map((p) => (
              <MenuItem key={p.key} onClick={() => act(k.id, { action: "pause", ...((u) => (u ? { until: u } : {}))(p.until(Date.now())) })}>
                {t(p.key)}
              </MenuItem>
            ))}
          </Menu>
        )}
        {K.stop && (
          <div class="kp-stop">
            <p>{t("keep.stop.ask")}</p>
            <span class="acts">
              <DangerButton label={t("keep.stop.go")} about={k.title} onClick={() => act(k.id, { action: "stop" })} />
              <Btn kind="text" size="sm" label={t("keep.stop.keep")} onClick={() => ((K.stop = false), A.changed())} />
            </span>
          </div>
        )}
      </div>
      {done && <Changed done={done} id={k.id} />}
    </>
  );
}

/** D533: the last change in one line under the card, with its Undo (once undone, one line says so). */
function Changed({ done, id }: { done: NonNullable<typeof K.done>; id: string }) {
  // D592: two lines at most until 展开, on the card's text edge; its actions under it on that edge.
  const [full, setFull] = useState(false);
  const text = done.undone ? t("keep.edit.undone") : t("keep.edit.done", done.edits.map((e) => editSentence("you", e)).join(t("keep.where.sep")));
  const long = [...text].length > 56;
  return (
    <div class="kp-changed" role="status">
      <p class={`w${long && !full ? " clamp" : ""}`}>{text}</p>
      {(long || (!done.undone && done.undo)) && (
        <span class="acts">
          {long && <Btn kind="text" size="sm" label={t(full ? "keep.edit.less" : "keep.edit.more")} expanded={full} onClick={() => setFull(!full)} />}
          {!done.undone && done.undo && <Btn kind="text" size="sm" label={t("keep.edit.undo")} onClick={() => sendChange(id, done.undo!, true)} />}
        </span>
      )}
    </div>
  );
}

/**
 * D533: 你说的 / You said, changed as words: saving them asks the cheap model once which rules the new
 * words change (principle 21), shown as a small diff for one Go; 只改说的话 keeps the rules as they are.
 */
function Said({ k }: { k: KeepPage }) {
  const w = K.words;
  const can = (k.editable ?? []).includes("said");
  if (!w.open && !can)
    return (
      <div class="kp-said">
        <span class="er-head">
          <b>{t("keep.said")}</b>
        </span>
        <span>{k.said}</span>
      </div>
    );
  // D592: the whole well is the button, its chevron on the label line, as a rule row is; never a lone 改.
  if (!w.open)
    return (
      <button type="button" class="kp-said er-well" aria-label={spoken(A.L, t("keep.said.edit.about"), k.said)} onClick={() => ((K.words = { open: true, draft: k.said, phase: "", proposal: undefined }), (K.edit = freshEdit()), (K.done = undefined), A.changed())}>
        <span class="er-head" aria-hidden="true">
          <b>{t("keep.said")}</b>
          <Chev />
        </span>
        <span aria-hidden="true">{k.said}</span>
      </button>
    );
  const cancel = () => ((K.words = freshWords()), A.changed());
  const read = () => {
    const v = w.draft.trim();
    if (!v) return;
    if (v === k.said.trim()) return cancel();
    K.words.phase = "reading";
    K.edit.error = "";
    A.send({ t: "keep_words", id: k.id, said: v });
    A.changed();
  };
  const apply = (change: KeepChange) => ((K.words.phase = "saving"), (K.edit.error = ""), sendChange(k.id, change));
  const p = w.phase === "read" || w.phase === "saving" ? w.proposal : undefined;
  const rules = p?.ok ? p.edits.filter((x) => x.field !== "said") : [];
  return (
    <div class="kp-said open">
      <b>{t("keep.said")}</b>
      <TextBox value={w.draft} label={t("keep.said")} onInput={(v) => ((K.words.draft = v), w.phase === "read" && ((K.words.phase = ""), (K.words.proposal = undefined)), A.changed())} />
      {w.phase === "reading" && (
        <p class="kp-reading" role="status">
          <i class="breath" aria-hidden="true" />
          {t("keep.said.edit.read")}
        </p>
      )}
      {p && (
        <div class="kp-diff">
          {p.ok && rules.length > 0 ? (
            <>
              <p class="hd">{t("keep.said.edit.diff")}</p>
              {rules.map((x) => (
                <div key={x.field} class="kp-drow">
                  <span class="k">{t(RULE_OF[x.field])}</span>
                  <span class="ch">
                    <span class="from">{fieldWords(x.field, x.from)}</span>
                    <span class="to">{fieldWords(x.field, x.to)}</span>
                  </span>
                </div>
              ))}
            </>
          ) : (
            <p class="hd">{p.ok ? t("keep.said.edit.same") : t("keep.said.edit.unread")}</p>
          )}
        </div>
      )}
      {K.edit.error && (
        <p class="er-err" role="alert">
          {K.edit.error}
        </p>
      )}
      <span class="er-acts">
        {p?.ok && <Btn kind="primary" size="sm" label={rules.length ? t("keep.said.edit.go") : t("keep.edit.save")} disabled={w.phase === "saving"} onClick={() => apply(p.change)} />}
        {p && !p.ok && <Btn kind="primary" size="sm" label={t("keep.said.edit.only")} disabled={w.phase === "saving"} onClick={() => apply({ said: p.said })} />}
        {!p && <Btn kind="primary" size="sm" label={w.phase === "reading" ? t("keep.edit.saving") : t("keep.edit.save")} disabled={w.phase === "reading" || !w.draft.trim()} onClick={read} />}
        {p && rules.length > 0 && <Btn kind="secondary" size="sm" label={t("keep.said.edit.only")} disabled={w.phase === "saving"} onClick={() => apply({ said: p.said })} />}
        <Btn kind="text" size="sm" label={t("keep.edit.cancel")} onClick={cancel} />
      </span>
    </div>
  );
}

/** How long the talk box waits for the home to have the words before it gives them back. */
const SEND_WAIT_MS = 10_000;

/** D519: the talk box is the conversation's composer (composer.tsx): the same card, the same round
 *  send. Sending: the words wait greyed and the send is pressed in until the home has them; then the
 *  box empties and one line says the partner has it. */
function Talk({ k }: { k: KeepPage }) {
  const tk = K.talk;
  const example = k.run === "perItem" ? t("keep.talk.helper") : k.everyMs ? t("keep.talk.every") : t("keep.talk.at");
  if (tk.sending && (echoed(tk.sending) || Date.now() - tk.at > SEND_WAIT_MS)) {
    const got = echoed(tk.sending);
    tk.sending = "";
    if (got) (tk.text = ""), (tk.sent = k.id);
  }
  const send = () => {
    const v = tk.text.trim();
    if (!v || tk.sending) return;
    tk.sending = `p${Date.now().toString(36)}keep`;
    tk.at = Date.now();
    tk.sent = "";
    A.send({ t: "send", text: v, clientId: tk.sending, keep: k.id });
    setTimeout(() => A.changed(), SEND_WAIT_MS + 50);
    A.changed();
  };
  const place = t("keep.talk", example);
  return (
    <div class="kp-talk">
      <ComposerBox id="keep-talk" value={tk.text} onInput={(v) => ((tk.text = v), (tk.sent = ""), A.changed())} onSend={send} sending={!!tk.sending} label={place} placeholder={place} />
      {tk.sent === k.id && !tk.text && (
        <p class="kp-sent" role="status">
          {t("keep.talk.sent", A.nameOf(k.persona))}
        </p>
      )}
    </div>
  );
}

/** The other Keeps beside an opened one (the rail beside an opened task, D244), wide only: each its
 *  mark, its title in two lines cut at a word's end, and one line; every row the same height, the
 *  open one raised as the knob. */
export function KeepRail() {
  const ks = A.S.onHand?.keeps ?? [];
  return (
    <aside class="kp-rail" aria-label={t("keep.section")}>
      {/* D535: no back link here: the way back is the header's breadcrumb (对话 / 任务 / the Keep). */}
      <SectionHead label={t("keep.section")} />
      {ks.map((k) => {
        const facts = keepFacts(k).filter((f) => f.tone === "needs");
        return (
          <button key={k.id} class={`k${k.id === K.open ? " on" : ""}`} onClick={() => openKeep(k.id)} aria-current={k.id === K.open ? "page" : undefined} title={k.title}>
            <KeepMark life={k.life} size={32} />
            <span class="kp-rtx">
              <span class="t">{noOrphan(cutAtWord(k.title, RAIL_COLS))}</span>
              <span class={facts.length ? "l needs" : "l"}>{facts[0]?.text ?? keepBeatWords(k)}</span>
            </span>
          </button>
        );
      })}
    </aside>
  );
}

/** A Keep's own page, in the board's place. */
export function KeepPageView({ room }: { room: string }) {
  const k = K.pages.get(K.open);
  const sheet = (A.S.onHand?.keeps ?? []).find((x) => x.id === K.open);
  // The page follows On hand: asked again when its sheet changed, or when the first ask went before the home was there.
  const sig = `${K.open}|${JSON.stringify(sheet ?? null)}`;
  if (sig !== K.sig || (!k && Date.now() - K.askedAt > 1500)) {
    K.sig = sig;
    K.askedAt = Date.now();
    queueMicrotask(() => A.send({ t: "keep", id: K.open }));
  }
  if (!k) return <div class="kp-page loading">{sheet ? t("keep.loading") : t("keep.gone")}</div>;
  const wide = room === "full";
  // Its tasks' questions (its items', and its own loop's: D519), each once.
  const decisions = k.decisions.flatMap((id) => {
    const taskId = [...new Set([...k.taskIds, ...k.items.map((x) => x.taskId)])].find((x) => A.S.pendingDecision(x)?.decisionId === id);
    const d = taskId ? A.S.pendingDecision(taskId) : undefined;
    return d && taskId ? [{ d, taskId }] : [];
  });
  const chips: { text: string; tone: "on" | "needs" | "" }[] = [
    { text: t(`keep.life.${k.life}`), tone: k.life === "on" ? "on" : "" },
    ...(k.asks ? [{ text: t("keep.asks", k.asks), tone: "needs" as const }] : []),
    { text: t("keep.since", when(A.L, k.since)), tone: "" },
    ...(k.run === "perItem" && k.week ? [{ text: t("keep.week", k.week), tone: "" as const }] : []),
  ];
  return (
    <div class={`kp-page${wide ? " wide" : ""}`}>
      {/* D535: the way back is the header's (‹ 任务 beside the conversation and on a phone). */}
      <div class="kp-main">
        <header class="kp-ph">
          <KeepMark life={k.life} size={64} beat={beatNow(k)} />
          <div>
            <p class="kick">{t("keep.kicker", A.nameOf(k.persona))}</p>
            <h1>{noOrphan(k.title)}</h1>
            <p class="kp-life">
              {chips.map((c) => (
                <Tag key={c.text} text={c.text} tone={c.tone} />
              ))}
            </p>
          </div>
        </header>
        <Said k={k} />
        {decisions.length > 0 && (
          <>
            <SectionHead label={t("keep.waiting")} />
            {decisions.map(({ d, taskId }) => (
              <DecisionCard key={d.decisionId} d={d} taskId={taskId} />
            ))}
          </>
        )}
        {/* A Keep in rounds is its one task, never an item: it holds something only when that task keeps a PR open (D519). */}
        {(k.run !== "same" || k.items.length > 0 || k.handoffs !== undefined) && <SectionHead label={t("keep.holding")} />}
        {(k.run !== "same" || k.items.length > 0 || k.handoffs !== undefined) && (k.handoffs !== undefined ? <HandoffGroups k={k} /> : <Items k={k} />)}
        <SectionHead label={t("keep.rounds")} />
        <Rounds k={k} />
        {k.life !== "done" && k.life !== "stopped" && <Talk k={k} />}
      </div>
      <div class="kp-side">
        <SectionHead label={t("keep.how")} />
        <HowItRuns k={k} />
      </div>
    </div>
  );
}

// ---------- the receipt card under the partner's words ----------

/** D511: the first-made moment: the lantern lighting up once, its four lines, the first round's
 *  result, and 打开 · 改一下 · 撤销 (each its own button). */
export function KeepReceipt({ card }: { card: KeepCard }) {
  const undone = card.undone || K.undone.has(card.id);
  const rows = [
    { k: "keep.card.when", v: card.when },
    ...(card.speaks ? [{ k: "keep.card.speaks", v: card.speaks }] : []),
    ...(card.until ? [{ k: "keep.card.until", v: card.until }] : []),
    ...(card.where ? [{ k: "keep.card.where", v: card.where }] : []),
  ];
  return (
    <div class={`kp-receipt${undone ? " undone" : ""}`}>
      <div class="hd">
        <span class="lit-up">
          <KeepMark life={undone ? "stopped" : "on"} />
        </span>
        <span class="kp-rtx">
          <span class="kick">{t(undone ? "keep.life.stopped" : "keep.life.on")}</span>
          <span class="t">{card.title}</span>
        </span>
      </div>
      <div class="kp-rrows">
        {rows.map((r) => (
          <div key={r.k} class="kp-rrow">
            <span class="k">{t(r.k)}</span>
            <span class="v">{r.v}</span>
          </div>
        ))}
      </div>
      {card.first && !undone && <p class="first">{t("keep.card.first", card.first)}</p>}
      {undone ? (
        <p class="first">{t("keep.card.undone")}</p>
      ) : (
        <div class="acts">
          <Btn kind="secondary" size="sm" label={t("keep.card.open")} onClick={() => openKeep(card.id)} />
          <Btn kind="text" size="sm" label={t("keep.card.change")} onClick={() => A.fillComposer(t("keep.card.change.fill", card.title))} />
          <Btn kind="text" size="sm" label={t("keep.card.undo")} onClick={() => (K.undone.add(card.id), A.send({ t: "keep_action", id: card.id, action: "stop" }), A.changed())} />
        </div>
      )}
      {card.firstEver && !undone && <p class="ever">{t("keep.card.firstEver")}</p>}
    </div>
  );
}

A.openKeep = openKeep;
A.upInPlace = () => (K.open ? (closeKeep(), true) : false);
A.leftOnHand = () => {
  K.open = "";
  K.pause = K.stop = false;
};
A.onKeepFrame = onKeepFrame;
A.onKeepEdit = onKeepEdit;
