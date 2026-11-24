// D385: handing several over (design/handover.md). One sheet from every door (the pile's do row, a
// 讲的是 / Subjects chip, the conversation's set card, the find): what (the ticked set, found by words
// and by meaning across every sort group), 给{name}的话 / A note for {name} (and one per to-do), and
// how (a shape with one 建议 / Suggested, 在哪儿做 / Where, 谁来做 / Who does it). Wide: one screen in
// two columns; a phone: two screens (what, then the note and how). Go makes a group for two or more.
// Plan first's card (in the conversation and inside its group on On hand) and 一起过目 / Review
// together live here too. Core decides every default (pile_how); this file only draws and asks.
import type { FindSaid, FindSummary, FoundItem, GroupHandView, HandedItem, GroupReview, HandHow, HandShape, PileItem, SourcesServerFrame, SubjectOp, TaskGroupView, TodoSet } from "@ducter/protocol";
import { PILE_HAND_DEFAULT, sizeSaid } from "@ducter/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark } from "./brand.tsx";
import { Btn, Chev } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { TS } from "./todos.tsx";
import { foundLine, quietBecause, readingChips, handState, oneRepoOf, planSections, planTasks, refLabel, refsLabel, reviewKeep, sections, setTicks, shapeChoices, shapeLine, suggestedShape, type ShapeChoice } from "./handover-view.ts";
import type { DecisionState } from "./store.ts";
import { FirstMeetLine, meet } from "./first-meet.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const name = () => A.S.personaName;
/** One column and two screens at this width or below (a phone, a narrow window). */
const NARROW = 760;
const narrow = () => typeof window !== "undefined" && window.innerWidth <= NARROW;

// ---------- the sheet's state ----------

/** What this page holds of an open hand-over sheet. */
export const HS: {
  cid: string;
  findCid: string;
  howCid: string;
  items?: FoundItem[];
  found?: FindSummary;
  /** Every item seen in this sheet, by ref (a ticked one stays ticked when a find hides it). */
  known: Map<string, FoundItem>;
  /** D396: the person's words in the field (what to find, and maybe the note too). */
  words: string;
  /** The words a find was asked with (an answer for older words is dropped). */
  findWords?: string;
  /** How core split the words: what it looked for, and the note it heard. */
  heard?: FindSaid;
  /** D428: the reading's chips the person removed for these words (pile_find drop). */
  drop?: string[];
  /** D428: how many the last find ticked (先勾了最像的 n 个). */
  foundTicked?: number;
  /** The field's suggestions (recent subjects first). */
  suggest?: string[];
  /** The note as filled from the words (replaced while the person hasn't written their own). */
  noteAuto?: string;
  /** Picking one by one (the do group's list) instead of saying it. */
  browse: boolean;
  /** How many the do group holds (the 一个个挑 link's count). */
  doCount?: number;
  finding: boolean;
  subject?: string;
  bySubject: boolean;
  setId?: string;
  ticked?: Set<string>;
  carried?: string[];
  note: string;
  notes: Record<string, string>;
  noteOpen: Set<string>;
  how?: HandHow;
  shape?: ShapeChoice;
  device?: string;
  harness?: string;
  /** Which picker is open under its row. */
  picking?: "where" | "who";
  /** A phone's two screens. */
  step: 1 | 2;
  sending: boolean;
  said?: string;
  error?: boolean;
  /** D415: + 新的分类 / + New subject: the name being made (the ticked ones go in it). */
  make?: string;
  /** D415: opened from a subject chip: its bar (rename, remove) and each row's 移出. */
  door?: "do" | "subject" | "set" | "find" | "make";
  /** D415: 归到分类… / Put in a subject…, and 改名 / Rename: their open field. */
  putOpen?: boolean;
  putName: string;
  renaming?: boolean;
  renameTo: string;
  subjCid: string;
  /** D454: the found ones already handed over (their own group: what became of each, never ticked). */
  handed?: HandedItem[];
} = { cid: "", findCid: "", howCid: "", known: new Map(), words: "", browse: false, finding: false, bySubject: false, note: "", notes: {}, noteOpen: new Set(), step: 1, sending: false, putName: "", renameTo: "", subjCid: "" };

let findTimer: ReturnType<typeof setTimeout> | undefined;
let howTimer: ReturnType<typeof setTimeout> | undefined;

/** The conversation's set cards: the ticks each one holds (until it is handed over). */
const SETT = new Map<string, Set<string>>();

/**
 * Opens the hand-over sheet from a door (D396: words first). The do row and the subjects' "more" open
 * on the empty words field with its suggestions (one by one stays a link away); a subject chip and a
 * set card open with their words already in the field and their set found, ticked as they came.
 */
export function openHand(o: { door: "do" | "subject" | "set" | "find" | "make"; subject?: string; setId?: string; ticked?: string[]; query?: string; note?: string; doCount?: number; pick?: boolean }) {
  const now = Date.now();
  const words = o.door === "subject" ? o.subject ?? "" : o.door === "set" ? o.query ?? o.subject ?? "" : o.query ?? "";
  const note = o.note?.trim() ?? "";
  Object.assign(HS, { cid: `hand-${now}`, findCid: "", howCid: "", items: undefined, found: undefined, known: new Map(), words, findWords: undefined, heard: undefined, said: undefined, suggest: undefined, noteAuto: note || undefined, browse: false, doCount: o.doCount, finding: false, subject: o.subject, bySubject: o.door === "subject" || o.door === "set", setId: o.setId, ticked: o.door === "do" || (o.door === "find" && !o.query) ? new Set<string>() : undefined, carried: o.ticked, note, notes: {}, noteOpen: new Set(), how: undefined, shape: undefined, device: undefined, harness: undefined, picking: undefined, step: 1, sending: false, error: false, door: o.door, make: o.door === "make" ? "" : undefined, putOpen: false, putName: "", renaming: false, renameTo: "", subjCid: "" });
  if (o.door === "subject" || o.door === "set") {
    HS.finding = true;
    A.send({ t: "pile_find", ...(o.subject ? { subject: o.subject } : {}), ...(o.setId ? { setId: o.setId } : {}), clientId: HS.cid });
  } else if (o.query?.trim()) {
    A.send({ t: "pile_find", clientId: HS.cid });
    find(o.query, true);
  } else A.send({ t: "pile_find", clientId: HS.cid });
  // Where and who from the start: the right column is never a dead "looking" state.
  askHow(true);
  A.sheet = { kind: "hand" };
  // D498: from On hand's offer, the do group's list with the first few ticked (never all at once).
  if (o.pick) browse(true);
  A.changed();
}

/** 一个个挑 / Pick one by one: the do group's list, the first few ticked (the old door, now secondary). */
function browse(on: boolean) {
  HS.browse = on;
  HS.picking = undefined;
  if (on) {
    HS.items = undefined;
    HS.found = undefined;
    HS.findCid = `browse-${Date.now()}`;
    A.send({ t: "pile_items", group: "do", clientId: HS.findCid });
  } else {
    HS.items = undefined;
    HS.found = undefined;
    HS.ticked = new Set();
    if (HS.words.trim()) find(HS.words, true);
    askHow();
    setTimeout(() => (document.getElementById("ho-words") as HTMLInputElement | null)?.focus({ preventScroll: true }), 30);
  }
  A.changed();
}

/**
 * A link straight to the sheet: #hand?subject=记忆提炼 (a chip's door), #hand?make=1&name=…&words=… (D415: + 新的分类), #hand?words=… (the words said,
 * found as typed), #hand?door=do (the empty words field), #hand?browse=1 (one by one); &step=2: its
 * how; &note=…: the note written in, never sent. Opens the sheet once the home answered; nothing is
 * handed over without the person's Go on it. Used by the demo's shots, and by any link that names one.
 */
function handLink() {
  if (typeof location === "undefined" || !location.hash.startsWith("#hand?")) return;
  const q = new URLSearchParams(location.hash.slice("#hand?".length));
  const subject = q.get("subject")?.trim();
  const words = q.get("words")?.trim();
  if (!subject && !words && !q.get("door") && !q.get("browse") && !q.get("make")) return;
  const tick = setInterval(() => {
    if (!A?.S?.welcomed) return;
    clearInterval(tick);
    history.replaceState(null, "", location.pathname + location.search);
    if (q.get("make")) openHand({ door: "make" });
    else if (subject) openHand({ door: "subject", subject });
    else openHand({ door: "find", ...(words ? { query: words } : {}) });
    if (q.get("browse")) browse(true);
    if (q.get("make") && q.get("name")) HS.make = q.get("name")!.slice(0, 40);
    if (q.get("make") && words) find(words, true);
    const note = q.get("note");
    if (note) HS.note = note.slice(0, 2000);
    if (q.get("step") === "2") HS.step = 2;
    A.changed();
  }, 150);
  setTimeout(() => clearInterval(tick), 20_000);
}
setTimeout(handLink, 0);

function closeHand() {
  A.sheet = null;
  clearTimeout(findTimer);
  clearTimeout(howTimer);
  A.changed();
}

const ticked = () => HS.ticked ?? new Set<string>();
const tickedItems = () => [...ticked()].map((r) => HS.known.get(r)).filter((p): p is FoundItem => !!p);

/** Asks core for the sheet's how (shape, where, who) for the ticked set and the note so far; with none ticked, where and who alone. */
function askHow(now = false) {
  clearTimeout(howTimer);
  const go = () => {
    const refs = [...ticked()];
    HS.howCid = `how-${Date.now()}`;
    A.send({ t: "pile_how", refs, ...(HS.note.trim() ? { note: HS.note.trim() } : {}), ...(HS.bySubject ? { bySubject: true } : {}), ...(HS.subject ? { subject: HS.subject } : {}), clientId: HS.howCid });
  };
  if (now) go();
  else howTimer = setTimeout(go, 260);
}

/** The note the words carried: written in while the person hasn't written their own (theirs is never replaced). */
function fillNote(note: string | undefined) {
  const mine = HS.note.trim() && HS.note !== HS.noteAuto;
  if (mine) return;
  HS.note = note ?? "";
  HS.noteAuto = note || undefined;
}

/** D396: the words said (what to find, maybe the note too): found by meaning, the do ones ticked. */
function find(q: string, now = false, keepDrop = false) {
  // New words, a new reading: the chips removed for the old words come back.
  if (!keepDrop && q.trim() !== HS.words.trim()) HS.drop = undefined;
  HS.words = q;
  clearTimeout(findTimer);
  if (HS.browse) HS.browse = false;
  if (!q.trim()) {
    HS.items = HS.found = HS.heard = HS.findWords = undefined;
    HS.subject = undefined;
    HS.bySubject = false;
    HS.setId = undefined;
    HS.finding = false;
    HS.ticked = new Set();
    fillNote(undefined);
    askHow();
    return A.changed();
  }
  HS.finding = true;
  A.changed();
  findTimer = setTimeout(
    () => {
      HS.findCid = `find-${Date.now()}`;
      HS.findWords = q.trim();
      A.send({ t: "pile_find", words: q.trim(), ...(HS.drop?.length ? { drop: HS.drop } : {}), clientId: HS.findCid });
    },
    now ? 0 : 420,
  );
}

function toggle(ref: string) {
  const s = new Set(ticked());
  if (s.has(ref)) s.delete(ref);
  else s.add(ref);
  HS.ticked = s;
  askHow();
  A.changed();
}

const asFound = (p: PileItem): FoundItem => ({ ...p, by: "title" });

/** The home's answers about the sheet (routed here before the pile's own handler). */
export function onHandFrame(f: SourcesServerFrame): boolean {
  if (f.t === "pile_items_result" && f.clientId && f.clientId === HS.findCid && HS.browse) {
    const items = f.items.map(asFound);
    for (const p of items) HS.known.set(p.item.ref, p);
    HS.items = items;
    HS.found = undefined;
    HS.doCount = items.length;
    if (!ticked().size) HS.ticked = new Set(items.slice(0, PILE_HAND_DEFAULT).map((p) => p.item.ref));
    askHow(true);
    A.changed();
    return true;
  }
  if (f.t === "pile_find_result" && f.clientId && (f.clientId === HS.cid || f.clientId === HS.findCid)) {
    for (const p of f.items) HS.known.set(p.item.ref, p);
    HS.error = false;
    if (f.suggest) HS.suggest = f.suggest;
    // The door's own answer: a chip's or a set's set, ticked as it came; the bare door only its suggestions.
    if (f.clientId === HS.cid) {
      if (!HS.subject && !HS.setId) return A.changed(), true;
      HS.subject ??= f.subject;
      if (!HS.ticked) HS.ticked = new Set((HS.carried ?? f.ticked).filter((r) => HS.known.has(r)));
      HS.items = f.items;
      HS.found = f.found;
      HS.finding = false;
      askHow(true);
      return A.changed(), true;
    }
    // A find that came back after the words changed again is dropped (the newer one follows).
    if (HS.browse || !HS.words.trim() || HS.findWords !== HS.words.trim()) return true;
    HS.items = f.items;
    HS.found = f.found;
    HS.heard = f.said;
    HS.handed = f.handedOver;
    HS.finding = false;
    HS.setId = undefined;
    // New words, a new set: the sure ones ticked, as found (D428: at most TICK_MAX).
    HS.ticked = new Set(f.ticked);
    HS.foundTicked = f.ticked.length;
    HS.subject = f.subject ?? f.said?.about;
    HS.bySubject = f.items.some((p) => p.by === "meaning" || p.by === "subject") || !!f.subject;
    fillNote(f.said?.note);
    askHow(true);
    A.changed();
    return true;
  }
  if (f.t === "pile_how_result" && f.clientId && f.clientId === HS.howCid) {
    HS.how = f.how;
    A.changed();
    return true;
  }
  // D415: a subject the person changed: said in a toast; the sheet follows it.
  if (f.t === "pile_result" && f.op === "subject" && f.clientId && f.clientId === HS.subjCid) {
    HS.sending = false;
    if (!f.ok) return (HS.said = f.error ?? t("newtask.err.failed")), A.changed(), true;
    const what = subjAsk;
    subjAsk = undefined;
    if (what?.op === "remove") {
      closeHand();
      A.toast(t("ho.subject.removed", what.name), undefined, 3600);
      return true;
    }
    if (what?.op === "take") {
      for (const r of what.refs ?? []) HS.ticked?.delete(r);
      HS.items = HS.items?.filter((p) => !what.refs?.includes(p.item.ref));
      A.toast(t("ho.subject.taken", what.name), undefined, 2600);
      return A.changed(), true;
    }
    const now = f.name ?? what?.name ?? "";
    A.toast(what?.op === "rename" ? t("ho.subject.renamed", now) : t("ho.put.done", now, f.done ?? 0), undefined, 3200);
    // The sheet becomes that subject's set: hand it over now, or just close it.
    openHand({ door: "subject", subject: now });
    return true;
  }
  if (f.t === "pile_result" && f.clientId && f.clientId === HS.cid && f.op === "hand") {
    HS.sending = false;
    if (f.ok && f.asked) {
      closeHand();
      A.toast(t("ho.handed.asked"), undefined, 4200);
      return true;
    }
    if (f.ok) {
      const plan = HS.how && (HS.shape ?? suggestedShape(HS.how)) === "plan" && ticked().size > 1;
      closeHand();
      A.toast(plan ? t("ho.handed.plan", name()) : t("ho.handed", name()), undefined, 3600);
      if (HS.setId) SETT.delete(HS.setId);
      return true;
    }
    HS.said = f.error ?? t("newtask.err.failed");
    A.changed();
    return true;
  }
  if (f.t === "group_review_result" && f.clientId && f.clientId === HR.cid) {
    HR.loading = false;
    HR.review = f.review;
    HR.error = f.error;
    A.changed();
    return true;
  }
  if (f.t === "pile_result" && f.clientId && f.clientId === HR.cid && f.op === "group_review") {
    HR.sending = false;
    if ((f.done ?? 0) > 0) A.toast(t("ho.review.done", f.done), undefined, 3200);
    if (f.failed) HR.said = t("ho.review.failed", f.failed);
    else (A.sheet = null);
    A.changed();
    return true;
  }
  if (f.t === "pile_result" && f.op === "plan" && f.clientId && PN.pending.has(f.clientId)) {
    PN.pending.delete(f.clientId);
    if (!f.ok && f.error) A.toast(f.error);
    A.changed();
    return true;
  }
  return false;
}

/** D415: what the last subject change asked (its toast and what follows). */
let subjAsk: { op: SubjectOp; name: string; refs?: string[] } | undefined;
/** D415: the person's own subjects: put, take out, rename (into one that exists: merged), remove. */
function subjectDo(op: SubjectOp, name: string, o: { refs?: string[]; to?: string } = {}) {
  if (!name.trim() || HS.sending) return;
  HS.subjCid = `subj-${Date.now()}`;
  HS.sending = true;
  HS.said = undefined;
  subjAsk = { op, name: name.trim(), ...(o.refs ? { refs: o.refs } : {}) };
  A.send({ t: "pile_subject", op, name: name.trim(), ...(o.to ? { to: o.to.trim() } : {}), ...(o.refs ? { refs: o.refs } : {}), clientId: HS.subjCid });
  A.changed();
}
const ownSubjects = () => (TS.frame?.pile?.subjects ?? []).map((s) => s.name);

function go() {
  const refs = [...ticked()];
  if (HS.make !== undefined) return subjectDo("put", HS.make, { refs });
  if (!refs.length || HS.sending) return;
  const how = HS.how;
  const shape = HS.shape ?? suggestedShape(how);
  HS.sending = true;
  HS.said = undefined;
  // The per-to-do notes of the ticked ones only.
  const notes = Object.fromEntries(Object.entries(HS.notes).filter(([k, v]) => ticked().has(k) && v.trim()));
  A.send({
    t: "pile_hand",
    refs,
    clientId: HS.cid,
    ...(HS.note.trim() ? { note: HS.note.trim() } : {}),
    ...(Object.keys(notes).length ? { notes } : {}),
    ...(shape === "add" && how?.addTo ? { group: how.addTo.groupId } : shape && shape !== "add" && refs.length > 1 ? { shape: shape as HandShape } : {}),
    ...(HS.device ? { device: HS.device } : {}),
    ...(HS.harness ? { harness: HS.harness } : {}),
    ...(HS.subject ? { subject: HS.subject } : {}),
    ...(HS.bySubject ? { bySubject: true } : {}),
    ...(HS.setId ? { setId: HS.setId } : {}),
  });
  A.changed();
}

// ---------- drawn marks ----------

/** The tick: a clay box whose check draws itself in. */
const Tick = ({ on }: { on: boolean }) => (
  <span class={`ho-box${on ? " on" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 20 20" width="20" height="20">
      <path d="M5 10.4l3.2 3.2L15 6.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
);
const Lens = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
/** Three beads breathing in turn: something is being read right now. */
const Breath = () => (
  <span class="ho-breath" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);
const Radio = ({ on }: { on: boolean }) => <span class={`ho-dot${on ? " on" : ""}`} aria-hidden="true" />;

// ---------- the sheet ----------

/** A to-do's number: #10694 when every found one is in one repository (said once is enough), else mem#10694. */
function numOf(p: FoundItem): string {
  if (p.item.kind !== "github" || !p.item.where) return p.item.where ?? p.item.label;
  const all = [...(HS.items ?? []), ...(HS.handed ?? [])];
  const one = all.every((x) => x.item.where === p.item.where);
  return one ? p.item.label : `${p.item.where.split("/")[1]}${p.item.label}`;
}

/** D454: one found that is already handed over: what became of it, and the way to it (never a tick). */
function HandedRow({ p, i }: { p: HandedItem; i: number }) {
  const st = p.handed.state;
  const label = t(st === "failed" ? "ho.handed.why" : "ho.handed.open");
  const open = () => {
    if (!p.handed.taskId) return;
    closeHand();
    A.openTaskPage(p.handed.taskId);
  };
  return (
    <div class={`ho-item ho-handed s-${st}`} style={{ "--i": Math.min(i, 12) } as never} data-ref={p.item.ref}>
      <div class="ho-item-main">
        <span class={`ho-handed-dot s-${st}`} aria-hidden="true" />
        <span class="pile-item-body">
          <span class="pile-item-head">
            <span class="todo-mark small">
              <BrandMark name={p.item.kind} size={16} />
            </span>
            <span class="pile-item-title ho-title" dir="auto">
              {p.item.title}
            </span>
          </span>
          <span class="pile-item-facts">
            <span class="ho-num">{numOf(p)}</span>
            <span class={`ho-handed-state s-${st}`}>{t(`ho.handed.${st}`)}</span>
          </span>
        </span>
      </div>
      {p.handed.taskId && (
        <button class="ho-note-link corner ho-handed-open" aria-label={`${label}: ${p.item.title}`} onClick={open}>
          {label}
        </button>
      )}
    </div>
  );
}

/** D454: the found ones already handed over, under the rest: every match shown, none dropped silently. */
function HandedList() {
  const hs = HS.handed ?? [];
  if (!hs.length || HS.finding) return null;
  return (
    <div class="ho-list">
      <section class="ho-sec ho-handed-sec" aria-label={t("ho.g.handed")}>
        <h3 class="ho-gh">
          <span>{t("ho.g.handed")}</span>
          <span class="n">{A.L.num(hs.length)}</span>
        </h3>
        {hs.map((p, i) => (
          <HandedRow key={p.item.ref} p={p} i={i} />
        ))}
      </section>
    </div>
  );
}

function ItemRow({ p, i }: { p: FoundItem; i: number }) {
  const on = ticked().has(p.item.ref);
  const noteOpen = HS.noteOpen.has(p.item.ref) || !!HS.notes[p.item.ref];
  return (
    <div class={`ho-item${on ? " on" : ""}`} style={{ "--i": Math.min(i, 12) } as never} data-ref={p.item.ref}>
      <label class="ho-item-main">
        <input
          type="checkbox"
          class="ho-check"
          checked={on}
          onChange={() => toggle(p.item.ref)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), toggle(p.item.ref))}
          aria-label={p.item.title}
        />
        <Tick on={on} />
        <span class="pile-item-body">
          <span class="pile-item-head">
            <span class="todo-mark small">
              <BrandMark name={p.item.kind} size={16} />
            </span>
            <span class="pile-item-title ho-title" dir="auto">
              {p.item.title}
            </span>
          </span>
          {p.group === "decide" && p.ask ? (
            <span class="pile-ask ho-ask" dir="auto">
              <span>{p.ask}</span>
              <span class="ho-sug">{t("ho.suggested")}</span>
              {on && <span class="ho-carry">{t("ho.decide.carry")}</span>}
            </span>
          ) : (
            <span class="pile-why" dir="auto">
              {p.why}
            </span>
          )}
          <span class="pile-item-facts">
            <span class="ho-num">{numOf(p)}</span>
            {/* D443: the size once: no pill when the line above already says it (说得清楚，改动小). */}
            {p.size && !sizeSaid(p.group === "decide" && p.ask ? p.ask : p.why, p.size) && <span class="todo-label">{t(`pile.size.${p.size}`)}</span>}
            {/* D428: why it is here, in a few words; an unsure one says so (never ticked by itself). */}
            {p.because && !quietBecause(p.because, HS.heard) && (
              <span class="ho-because" dir="auto">
                {p.because}
              </span>
            )}
            {p.sure === "maybe" && <span class="ho-maybe">{t("ho.maybe")}</span>}
          </span>
        </span>
      </label>
      {/* D415: in a subject's own set, a to-do can leave the subject (not the pile). */}
      {HS.door === "subject" && HS.subject && p.subject && (
        <button class="ho-take" aria-label={t("ho.subject.take.label", p.item.title, HS.subject)} onClick={() => subjectDo("take", HS.subject!, { refs: [p.item.ref] })}>
          {t("ho.subject.take")}
        </button>
      )}
      {on &&
        (noteOpen ? (
          <textarea
            class="ho-itemnote"
            rows={2}
            value={HS.notes[p.item.ref] ?? ""}
            placeholder={t("ho.item.note")}
            aria-label={t("ho.item.note.label", p.item.title)}
            ref={(el) => void (el && HS.noteOpen.has(p.item.ref) && !HS.notes[p.item.ref] && document.activeElement !== el && el.focus())}
            onInput={(e) => (grow(e.target as HTMLTextAreaElement), (HS.notes[p.item.ref] = (e.target as HTMLTextAreaElement).value), A.changed())}
            onBlur={() => (HS.noteOpen.delete(p.item.ref), A.changed())}
          />
        ) : (
          <button class="ho-note-link corner" aria-label={t("ho.item.note.label", p.item.title)} onClick={() => (HS.noteOpen.add(p.item.ref), A.changed())}>
            {t("ho.item.note")}
          </button>
        ))}
    </div>
  );
}

function FoundHead() {
  const f = HS.found;
  if (HS.finding)
    return (
      <div class="ho-found finding" role="status">
        <Breath />
        <span>{t("ho.finding")}</span>
      </div>
    );
  // Nothing found says itself below (the empty state); the line would only repeat it.
  if (!f || (!f.n && !f.handed)) return null;
  const { head, facts } = foundLine(f, t, HS.foundTicked, readingChips(HS.heard));
  return (
    <div class="ho-found" role="status">
      <b>{head}</b>
      {facts.map((x) => (
        <span key={x}>{x}</span>
      ))}
    </div>
  );
}

/** D428: a chip of the reading removed: found again without it. */
function dropChip(key: string) {
  meet("find"); // D451: a chip dropped is the line understood
  HS.drop = [...new Set([...(HS.drop ?? []), key])];
  find(HS.words, true, true);
}
/** D428: a name the pile doesn't have, replaced by the login tapped. */
function useLogin(said: string, login: string) {
  const w = HS.words.replace(new RegExp(`@?${said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), login);
  find(w, true);
}

/**
 * How the words were read (D396, D428): one chip per fact (「100gle 提的」「分给你的」「关于 UI 走查」), each
 * removable; a name the pile doesn't have said plainly with the closest logins; the note taken out of
 * them said once (the note itself lives on the right).
 */
function Heard() {
  const h = HS.heard;
  if (!h || HS.finding) return null;
  const chips = readingChips(h);
  const unknown = h.unknown ?? [];
  if (!h.note && !chips.length && !unknown.length && !h.guessed?.length && !HS.drop?.length) return null;
  const moved = HS.note === HS.noteAuto && HS.note.trim();
  return (
    <div class="ho-heard" role="note">
      {(chips.length > 0 || !!HS.drop?.length) && (
        <div class="ho-reading" role="group" aria-label={t("ho.said.about")}>
          <small>{t("ho.said.about")}</small>
          {chips.map((c, i) => (
            <button key={c.key} class={`ho-fact k-${c.kind}`} style={{ "--i": i } as never} aria-label={t("ho.chip.drop", c.text)} title={t("ho.chip.drop", c.text)} onClick={() => dropChip(c.key)}>
              <span dir="auto">{c.text}</span>
              <span class="x" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
          {!!HS.drop?.length && (
            <button class="ho-fact-undo" onClick={() => ((HS.drop = undefined), find(HS.words, true, true))}>
              {t("ho.chip.undo")}
            </button>
          )}
        </div>
      )}
      {/* D451: the first time a sentence is read into chips, what they are and that a tap drops one. */}
      {chips.length > 0 && !HS.drop?.length && <FirstMeetLine name="find" at="handover" />}
      {/* D454: a name one edit from one login is read as it at once, said, with its undo. */}
      {(h.guessed ?? []).map((g) => (
        <div key={g.said} class="ho-guessed" role="status">
          <span dir="auto">{t("ho.guessed", g.login)}</span>
          <button class="ho-fact-undo" onClick={() => dropChip(`guess:${g.said.toLowerCase()}`)}>
            {t("ho.guessed.not", g.login)}
          </button>
        </div>
      ))}
      {unknown.map((u) => (
        <div key={u.said} class="ho-unknown" role="alert">
          <span dir="auto">{t("ho.unknown", u.said)}</span>
          {u.closest.length > 0 && <small>{t("ho.unknown.closest")}</small>}
          {u.closest.map((l) => (
            <button key={l} class="ho-chip" onClick={() => useLogin(u.said, l)}>
              <b>{l}</b>
            </button>
          ))}
          <small class="ho-unknown-held">{t("ho.unknown.held")}</small>
        </div>
      ))}
      {/* The note itself lives on the right: one quiet line says it went there (never the note twice). */}
      {moved && <span class="ho-heard-moved">{narrow() ? t("ho.said.moved.thin", name()) : t("ho.said.moved", name())}</span>}
    </div>
  );
}

/** The field's suggestions: a tap says it (found at once), recent subjects first. */
function Suggest() {
  const s = HS.suggest ?? [];
  if (!s.length) return null;
  return (
    <div class="ho-suggest" role="group" aria-label={t("ho.ask.recent")}>
      <small>{t("ho.ask.recent")}</small>
      {s.map((x, i) => (
        <button key={x} class="ho-chip" style={{ "--i": i } as never} onClick={() => (find(x, true), document.getElementById("ho-words")?.focus({ preventScroll: true }))}>
          <b dir="auto">{x}</b>
        </button>
      ))}
    </div>
  );
}

function BrowseLink() {
  const n = HS.doCount ?? TS.frame?.pile?.groups.do;
  return (
    <button class="ho-browse" onClick={() => browse(true)}>
      <span class="ho-browse-t">{t("ho.browse")}</span>
      {n ? <span class="ho-browse-n">{t("ho.browse.n", name(), n)}</span> : null}
      <Chev />
    </button>
  );
}

function List({ items }: { items: FoundItem[] }) {
  let k = 0;
  return (
    <div class={`ho-list${HS.finding ? " dim" : ""}`}>
      {sections(items).map((s) => (
        <section key={s.group} class="ho-sec" aria-label={s.group === "do" ? t("ho.g.do", name()) : t(`ho.g.${s.group}`)}>
          <h3 class="ho-gh">
            <span>{s.group === "do" ? t("ho.g.do", name()) : t(`ho.g.${s.group}`)}</span>
            <span class="n">{A.L.num(s.items.length)}</span>
          </h3>
          {s.items.map((p) => (
            <ItemRow key={p.item.ref} p={p} i={k++} />
          ))}
        </section>
      ))}
    </div>
  );
}

function What() {
  const items = HS.items;
  const said = HS.words.trim();
  const ask = (
    <div class="ho-say">
      <label class="ho-say-h" for="ho-words">
        {t("ho.ask", name())}
      </label>
      <div class="ho-words">
        <Lens />
        <textarea
          id="ho-words"
          value={HS.words}
          placeholder={t("ho.ask.ph")}
          autoComplete="off"
          enterkeyhint="search"
          rows={1}
          ref={grow}
          onInput={(e) => (grow(e.target as HTMLTextAreaElement), find((e.target as HTMLTextAreaElement).value.replace(/\n/g, " ")))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) e.preventDefault(), said && find(HS.words, true);
            if (e.key === "Escape" && HS.words) e.stopPropagation(), find("");
          }}
        />
        {HS.words && (
          <button class="ho-words-x" aria-label={t("ho.clear")} onClick={() => (find(""), document.getElementById("ho-words")?.focus())}>
            ×
          </button>
        )}
      </div>
      <Heard />
    </div>
  );
  if (HS.browse)
    return (
      <div class="ho-left">
        <div class="ho-say browse">
          <button class="ho-back-words" onClick={() => browse(false)}>
            <Chev back />
            <span>{t("ho.browse.back")}</span>
          </button>
        </div>
        {!items ? (
          <div class="ho-list">
            <div class="ho-skel" aria-label={t("ho.loading")} role="status">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : (
          <List items={items} />
        )}
      </div>
    );
  return (
    <div class="ho-left">
      {HS.make !== undefined && <MakeName />}
      {ask}
      {HS.door === "subject" && HS.subject && HS.make === undefined && <SubjectBar />}
      {!said && !HS.setId && !HS.subject ? (
        <div class="ho-start">
          <p class="ho-hint">{t("ho.ask.hint")}</p>
          <Suggest />
          <BrowseLink />
        </div>
      ) : (
        <>
          <FoundHead />
          {HS.found?.noMeaning && !HS.finding && <p class="ho-honest">{t(HS.found.noMeaning === "no_model" ? "ho.no_model" : "ho.find.error")}</p>}
          {!items ? (
            <div class="ho-list">
              <div class="ho-skel" aria-label={t("ho.loading")} role="status">
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : !items.length ? (
            <>
              {HS.handed?.length ? (
                <p class="ho-none-left" dir="auto">{t("ho.none.left")}</p>
              ) : (
                <div class="ho-none">
                  {!HS.heard?.unknown?.length && <p dir="auto">{t("ho.none.about", HS.heard?.about || said)}</p>}
                  <small>{t("ho.none.or")}</small>
                  <Suggest />
                  <BrowseLink />
                </div>
              )}
              <HandedList />
            </>
          ) : (
            <>
              <List items={items} />
              <HandedList />
            </>
          )}
        </>
      )}
    </div>
  );
}

function WhereWho() {
  const how = HS.how!;
  const where = (HS.device && how.wheres.find((w) => w.device === HS.device)) || how.where;
  const whereWhy = HS.device ? t("ho.where.picked") : how.where.why === "note" ? t("ho.where.note", how.where.said ?? how.where.name) : how.where.why === "rule" ? t("ho.where.rule") : how.where.why === "default" ? t("ho.where.default") : how.where.why === "repo" ? t("ho.where.repo", how.where.said ?? "") : t("ho.where.home");
  const who = HS.harness ?? how.who.harness;
  const whoWhy = HS.harness ? t("ho.who.picked") : how.who.why === "rule" ? t("ho.who.rule") : how.who.why === "default" ? t("ho.who.default") : "";
  const open = HS.picking;
  const pick = (k: "where" | "who") => ((HS.picking = open === k ? undefined : k), A.changed());
  return (
    <div class="ho-rows">
      {/* The computer's name wraps and its reason sits under it, whole: never "Hetzner Se…" beside "nowledge-co/mem 在…". */}
      <button class={`ho-row${open === "where" ? " open" : ""}`} aria-expanded={open === "where"} title={`${where.name}\n${whereWhy}`} onClick={() => pick("where")}>
        <small>{t("ho.where")}</small>
        <span class="ho-row-v">
          <b dir="auto">{where.name}</b>
          <span class="why" dir="auto">
            {whereWhy}
          </span>
        </span>
        <Chev open={open === "where"} />
      </button>
      {open === "where" && (
        <div class="ho-picks" role="listbox" aria-label={t("ho.where")}>
          {how.wheres.map((w) => (
            <button key={w.device} role="option" aria-selected={w.device === where.device} class={`ho-pick${w.device === where.device ? " on" : ""}`} onClick={() => ((HS.device = w.device === how.where.device ? undefined : w.device), (HS.picking = undefined), A.changed())}>
              <Radio on={w.device === where.device} />
              <b>{w.name}</b>
              <span>{w.hasRepo && how.repo ? t("ho.where.repo", how.repo) : how.repo ? t("ho.where.norepo") : ""}</span>
            </button>
          ))}
        </div>
      )}
      <button class={`ho-row${open === "who" ? " open" : ""}`} aria-expanded={open === "who"} onClick={() => pick("who")}>
        <small>{t("ho.who")}</small>
        <span class="ho-row-v">
          <b>{who ? harnessName(who) : t("ho.who.usual.v")}</b>
          {(who ? whoWhy : t("ho.who.usual", name())) && <span class="why">{who ? whoWhy : t("ho.who.usual", name())}</span>}
        </span>
        <Chev open={open === "who"} />
      </button>
      {open === "who" && (
        <div class="ho-picks" role="listbox" aria-label={t("ho.who")}>
          <button role="option" aria-selected={!who} class={`ho-pick${!who ? " on" : ""}`} onClick={() => ((HS.harness = undefined), (HS.picking = undefined), A.changed())}>
            <Radio on={!who} />
            <b>{t("ho.who.usual.v")}</b>
            <span>{t("ho.who.usual", name())}</span>
          </button>
          {how.whos.map((h) => (
            <button key={h} role="option" aria-selected={who === h} class={`ho-pick${who === h ? " on" : ""}`} onClick={() => ((HS.harness = h === how.who.harness ? undefined : h), (HS.picking = undefined), A.changed())}>
              <Radio on={who === h} />
              <b>{harnessName(h)}</b>
              <span>{h === how.who.harness ? t("ho.who.rule") : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function shapeTitle(s: ShapeChoice, how: HandHow | undefined): string {
  return s === "add" ? t("ho.shape.add", how?.addTo?.name ?? "") : t(`ho.shape.${s}`);
}

function How() {
  const how = HS.how;
  const n = ticked().size;
  const sug = suggestedShape(how);
  const cur = HS.shape ?? sug;
  const errands = tickedItems().every((p) => p.item.kind === "obsidian");
  const choices = shapeChoices(how);
  return (
    <div class="ho-right">
      <div class="ho-field">
        <label class="ho-h" for="ho-note">
          {t("ho.note", name())}
        </label>
        <textarea id="ho-note" class="ho-ta" rows={3} value={HS.note} placeholder={t("ho.note.ph")} ref={grow} onInput={(e) => (grow(e.target as HTMLTextAreaElement), (HS.note = (e.target as HTMLTextAreaElement).value), askHow(), A.changed())} />
      </div>
      {how ? (
        <WhereWho />
      ) : (
        <div class="ho-skel rows" role="status" aria-label={t("ho.loading")}>
          <i />
          <i />
        </div>
      )}
      {n > 1 && how && choices.length > 0 && (
        <div class="ho-field" role="radiogroup" aria-labelledby="ho-how-h">
          <h3 class="ho-h" id="ho-how-h">
            {t("ho.how")}
          </h3>
          <div class="ho-shapes">
            {choices.map((s) => {
              const on = s === cur;
              return (
                <button key={s} role="radio" aria-checked={on} class={`ho-shape${on ? " on" : ""}`} onClick={() => ((HS.shape = s), A.changed())}>
                  <Radio on={on} />
                  <span class="t">
                    <b>
                      <span>{shapeTitle(s, how)}</span>
                      {s === sug && <span class="ho-sug">{t("ho.suggested")}</span>}
                    </b>
                    <span>{shapeLine(s, how, t, errands)}</span>
                    {on && s === "plan" && s === sug && <em>{t("ho.shape.plan.why")}</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GoButton({ wide }: { wide?: boolean }) {
  const n = ticked().size;
  const how = HS.how;
  const shape = HS.shape ?? suggestedShape(how);
  if (HS.make !== undefined)
    return (
      <div class="ho-go">
        <Btn kind="primary" grow={wide} label={HS.make.trim() ? t("ho.make.go", HS.make.trim()) : t("ho.make.title")} disabled={!n || !HS.make.trim() || HS.sending} onClick={go} />
      </div>
    );
  return (
    <div class="ho-go">
      <Btn kind="primary" grow={wide} label={n > 1 ? t("ho.go", name(), n) : n === 1 ? t("ho.go.one", name()) : t("ho.title", name())} disabled={!n || HS.sending} onClick={go} />
      {n > 1 && shape && <span class="ho-go-sub">{shapeTitle(shape, how)}</span>}
    </div>
  );
}

export function HandSheet() {
  const [, redraw] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = () => redraw((x) => x + 1);
    window.addEventListener("resize", r);
    // The find field first on a wide screen (a phone keeps its keyboard down until asked).
    if (!narrow()) setTimeout(() => (document.getElementById("ho-words") as HTMLInputElement | null)?.focus({ preventScroll: true }), 60);
    void document.fonts?.ready.then(r);
    return () => window.removeEventListener("resize", r);
  }, []);
  // Every field fits its words after each draw, however they got there.
  useLayoutEffect(() => box.current?.querySelectorAll("textarea").forEach(grow));
  const n = ticked().size;
  const thin = narrow();
  const keys = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const typing = el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox" || el.tagName === "TEXTAREA";
    if (e.key === "Escape") {
      e.preventDefault(), e.stopPropagation();
      if (HS.picking) return void ((HS.picking = undefined), A.changed());
      if (thin && HS.step === 2) return void ((HS.step = 1), A.changed());
      return closeHand();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return void (e.preventDefault(), thin && HS.step === 1 ? n && ((HS.step = 2), A.changed()) : go());
    // "/" or a letter typed while not in a field goes to the find (the list's own keys stay).
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "/" || (e.key.length === 1 && /\S/.test(e.key) && e.key !== " "))) {
      const f = document.getElementById("ho-words") as HTMLInputElement | null;
      if (f && (!thin || HS.step === 1)) {
        if (e.key === "/") e.preventDefault();
        f.focus();
      }
    }
  };
  const title = HS.make !== undefined ? t("ho.make.title") : t("ho.title", name());
  return (
    <>
      <div class="scrim" onClick={closeHand} />
      <div ref={box} class={`past-sheet pile-sheet ho-sheet${thin ? " thin" : " wide"}${thin ? ` step-${HS.step}` : ""}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={keys}>
        <div class="past-head">
          {thin && HS.step === 2 ? (
            <button class="ho-back" onClick={() => ((HS.step = 1), A.changed())}>
              <Chev back />
              <span>{t("ho.back")}</span>
            </button>
          ) : (
            <h2>
              <span>{title}</span>
            </h2>
          )}
          <button class="past-x" aria-label={t("ho.x")} onClick={closeHand}>
            ×
          </button>
        </div>
        {thin ? (
          <div class="ho-cols one" key={HS.step}>
            {HS.step === 1 ? <What /> : <How />}
          </div>
        ) : (
          <div class="ho-cols">
            <What />
            <How />
          </div>
        )}
        <div class="ho-foot">
          {HS.said && <p class="small tone-bad">{HS.said}</p>}
          {HS.putOpen && <PutIn />}
          <div class="ho-foot-row">
            {/* D454: the count is said once: the Go button names it (交给小鸭这 4 个), so here it is only read aloud. */}
            <span class={`ho-count${n > 1 && !(thin && HS.step === 1) && HS.make === undefined ? " quiet" : ""}`} aria-live="polite">
              {n ? t("ho.picked", n) : t("ho.picked.none")}
            </span>
            {n > 0 && HS.make === undefined && !HS.putOpen && (
              <button class="ho-put-link" onClick={() => ((HS.putOpen = true), (HS.putName = ""), A.changed(), setTimeout(() => document.getElementById("ho-put")?.focus(), 30))}>
                {t("ho.put")}
              </button>
            )}
            {thin && HS.step === 1 ? <Btn kind="primary" label={t("ho.next")} disabled={!n} onClick={() => ((HS.step = 2), A.changed())} /> : <GoButton wide={!thin} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- 讲的是 / Subjects on the pile ----------

export function SubjectChips({ subjects, more }: { subjects: { name: string; n: number; own?: boolean }[]; more?: number }) {
  return (
    <div class="ho-subjects" role="group" aria-label={t("ho.subjects")}>
      <small>{t("ho.subjects")}</small>
      {subjects.map((s, i) => (
        <button key={s.name} class={`ho-chip${s.own ? " is-own" : ""}`} style={{ "--i": i } as never} aria-label={s.own ? t("ho.subject.open.own", s.name, s.n) : t("ho.subject.open", s.name, s.n)} onClick={() => openHand({ door: "subject", subject: s.name })}>
          <b>{s.name}</b>
          <span class="n">{A.L.num(s.n)}</span>
        </button>
      ))}
      {more ? (
        <button class="ho-chip is-more" onClick={() => openHand({ door: "find", query: "" })}>
          <span class="n">{t("ho.subjects.more", more)}</span>
        </button>
      ) : null}
      {/* D415: a subject of the person's own, made on the sheet: name it, find or pick, put the ticked ones in. */}
      <button class="ho-chip is-new" style={{ "--i": subjects.length } as never} onClick={() => openHand({ door: "make" })}>
        <span>{t("ho.subject.new")}</span>
      </button>
    </div>
  );
}

/** D415: + 新的分类: its name, over the words field that finds what goes in it. */
function MakeName() {
  return (
    <div class="ho-make">
      <label class="ho-say-h" for="ho-make">
        {t("ho.make.name")}
      </label>
      <input
        id="ho-make"
        class="field ho-make-f"
        value={HS.make}
        maxLength={40}
        placeholder={t("ho.make.ph")}
        autoComplete="off"
        ref={(el) => void (el && !HS.make && document.activeElement?.id !== "ho-words" && document.activeElement !== el && setTimeout(() => el.focus({ preventScroll: true }), 40))}
        onInput={(e) => ((HS.make = (e.target as HTMLInputElement).value), A.changed())}
      />
      <small class="ho-make-hint">{t("ho.make.hint")}</small>
    </div>
  );
}

/** D415: a subject's own set: 改名 (into an existing one merges), 去掉这个分类. */
function SubjectBar() {
  const s = HS.subject!;
  const others = ownSubjects().filter((x) => x !== s).slice(0, 6);
  if (HS.renaming)
    return (
      <div class="ho-subj-bar open" role="group" aria-label={t("ho.subject.rename")}>
        <input
          id="ho-rename"
          class="field"
          value={HS.renameTo}
          maxLength={40}
          aria-label={t("ho.subject.rename")}
          onInput={(e) => ((HS.renameTo = (e.target as HTMLInputElement).value), A.changed())}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(), HS.renameTo.trim() && subjectDo("rename", s, { to: HS.renameTo });
            if (e.key === "Escape") e.stopPropagation(), (HS.renaming = false), A.changed();
          }}
        />
        <Btn kind="primary" size="sm" label={t("ho.subject.rename.go")} disabled={!HS.renameTo.trim() || HS.renameTo.trim() === s} onClick={() => subjectDo("rename", s, { to: HS.renameTo })} />
        <Btn kind="text" size="sm" label={t("ho.cancel")} onClick={() => ((HS.renaming = false), A.changed())} />
        {others.length > 0 && (
          <div class="ho-subj-merge">
            {others.map((o) => (
              <button key={o} class="ho-chip" onClick={() => subjectDo("rename", s, { to: o })}>
                <span>{t("ho.subject.merge", o)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  return (
    <div class="ho-subj-bar" role="group" aria-label={t("ho.subject.this", s)}>
      <span class="ho-subj-name" dir="auto">
        {s}
      </span>
      <button class="ho-put-link" onClick={() => ((HS.renaming = true), (HS.renameTo = s), A.changed(), setTimeout(() => (document.getElementById("ho-rename") as HTMLInputElement | null)?.select(), 30))}>
        {t("ho.subject.rename")}
      </button>
      <button class="ho-put-link quiet" onClick={() => subjectDo("remove", s)}>
        {t("ho.subject.remove")}
      </button>
    </div>
  );
}

/** D415: 归到分类… / Put in a subject…: a name (new or one already there) for the ticked ones. */
function PutIn() {
  const names = ownSubjects().slice(0, 8);
  const refs = [...ticked()];
  return (
    <div class="ho-put" role="group" aria-label={t("ho.put")}>
      <input
        id="ho-put"
        class="field"
        value={HS.putName}
        maxLength={40}
        placeholder={t("ho.put.ph")}
        aria-label={t("ho.put.ph")}
        onInput={(e) => ((HS.putName = (e.target as HTMLInputElement).value), A.changed())}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault(), HS.putName.trim() && subjectDo("put", HS.putName, { refs });
          if (e.key === "Escape") e.stopPropagation(), (HS.putOpen = false), A.changed();
        }}
      />
      <Btn kind="primary" size="sm" label={t("ho.put.go", refs.length)} disabled={!HS.putName.trim() || !refs.length} onClick={() => subjectDo("put", HS.putName, { refs })} />
      <Btn kind="text" size="sm" label={t("ho.cancel")} onClick={() => ((HS.putOpen = false), A.changed())} />
      {names.length > 0 && (
        <div class="ho-subj-merge">
          {names.map((o) => (
            <button key={o} class="ho-chip" onClick={() => subjectDo("put", o, { refs })}>
              <b dir="auto">{o}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- the conversation's set card ----------

export function SetCard({ s, seq }: { s: TodoSet; seq: number }) {
  const ticks = setTicks(s.setId, s.ticked, SETT);
  const handed = !!s.groupId;
  const rest = s.refs.length - s.rows.length;
  const tick = (ref: string) => {
    const x = new Set(ticks);
    if (x.has(ref)) x.delete(ref);
    else x.add(ref);
    SETT.set(s.setId, x);
    A.changed();
  };
  const head = s.subject ?? s.query ?? "";
  return (
    <div class="partner ho-setwrap" data-seq={seq}>
      <div class={`ho-set${handed ? " handed" : ""}`} role="group" aria-label={t("ho.set.label", head)}>
        <div class="ho-set-h">
          <b dir="auto">{head}</b>
          <span class="n">{A.L.num(s.found.n)}</span>
        </div>
        {/* D428: how the words were read, one chip per fact (changed on the sheet). */}
        {!handed && readingChips({ about: "", by: "code", ...(s.facets ? { facets: s.facets } : {}) }).length > 0 && (
          <div class="ho-set-reading">
            {readingChips({ about: "", by: "code", ...(s.facets ? { facets: s.facets } : {}) }).map((c) => (
              <span key={c.key} class={`ho-fact static k-${c.kind}`} dir="auto">
                {c.text}
              </span>
            ))}
          </div>
        )}
        {/* D396: the how-to part of the words it was found by: the hand-over's note, shown as heard. */}
        {s.note && !handed && (
          <p class="ho-set-note">
            <small>{t("ho.said.note", name())}</small>
            <q dir="auto">{s.note}</q>
          </p>
        )}
        {!handed &&
          s.rows.map((p) => {
            const on = ticks.has(p.item.ref);
            return (
              <label key={p.item.ref} class={`ho-set-row${on ? " on" : ""}`}>
                <input type="checkbox" class="ho-check" checked={on} onChange={() => tick(p.item.ref)} aria-label={p.item.title} />
                <Tick on={on} />
                <span class="ho-num">{refLabel(p.item.ref, true)}</span>
                <span class="tt" dir="auto">
                  {p.item.title}
                </span>
                {p.group === "decide" && <span class="ho-sug">{t("pile.g.decide")}</span>}
              </label>
            );
          })}
        {!handed && rest > 0 && <span class="ho-set-more">{t("ho.set.more", rest)}</span>}
        {handed ? (
          <div class="ho-set-done">
            <span class="ho-donemark" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <path d="M5 10.4l3.2 3.2L15 6.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>{t("ho.set.handed", name())}</span>
            <Btn kind="text" size="sm" label={t("ho.set.see")} onClick={() => A.go({ name: "onhand" })} />
          </div>
        ) : (
          <div class="ho-set-foot">
            <Btn kind="primary" size="sm" label={t("ho.set.go", name(), ticks.size)} disabled={!ticks.size} onClick={() => openHand({ door: "set", setId: s.setId, ticked: [...ticks], ...(s.subject ? { subject: s.subject } : {}), ...(s.query ? { query: s.query } : {}), ...(s.note ? { note: s.note } : {}) })} />
            <span>{t("ho.set.or")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- plan first's card ----------

/** What this page holds of the plan cards: the notes said on parts, a reply being written, answers in flight. */
const PN: { notes: Map<string, Record<string, string>>; noteOpen: Set<string>; reply: Map<string, string>; replyOpen: Set<string>; pending: Map<string, string> } = { notes: new Map(), noteOpen: new Set(), reply: new Map(), replyOpen: new Set(), pending: new Map() };

const groupOf = (id: string | undefined): TaskGroupView | undefined => (id ? A.S.onHand?.groups?.find((g) => g.id === id) : undefined);

function answer(groupId: string, option: "go" | "hold" | "reply", text?: string) {
  const cid = `plan-${Date.now()}`;
  PN.pending.set(cid, groupId);
  const notes = PN.notes.get(groupId);
  A.send({ t: "plan_answer", groupId, option, clientId: cid, ...(text ? { text } : {}), ...(option === "go" && notes && Object.keys(notes).length ? { notes } : {}) });
  if (option === "reply") PN.replyOpen.delete(groupId), PN.reply.delete(groupId);
  A.changed();
}
const answering = (groupId: string) => [...PN.pending.values()].includes(groupId);

/** 给这个的话… on a plan's part: the quiet link in its head row, the field under it once opened. */
function PartNote({ groupId, partId, live, slot }: { groupId: string; partId: string; live: boolean; slot: "link" | "field" }) {
  const k = `${groupId}:${partId}`;
  const notes = PN.notes.get(groupId) ?? {};
  const v = notes[partId] ?? "";
  const closed = !PN.noteOpen.has(k) && !v;
  if (slot === "link")
    return live && closed ? (
      <button class="ho-note-link inline" onClick={() => (PN.noteOpen.add(k), A.changed())}>
        {t("ho.item.note")}
      </button>
    ) : null;
  if (!live) return v ? <span class="ho-itemnote said">{v}</span> : null;
  if (closed) return null;
  return (
    <textarea
      class="ho-itemnote"
      rows={2}
      value={v}
      placeholder={t("ho.item.note")}
      ref={(el) => void (el && PN.noteOpen.has(k) && !v && document.activeElement !== el && el.focus())}
      onInput={(e) => (grow(e.target as HTMLTextAreaElement), PN.notes.set(groupId, { ...notes, [partId]: (e.target as HTMLTextAreaElement).value }), A.changed())}
      onBlur={() => (PN.noteOpen.delete(k), A.changed())}
    />
  );
}

/**
 * {group}：方案 / {group}: the plan. In the conversation (seq), opened as a decision (bare), or inside
 * its group's card on On hand (inGroup). The card that isn't the group's current plan any more says so.
 */
export function PlanCard({ d, seq, bare, inGroup }: { d: DecisionState; seq?: number; bare?: boolean; inGroup?: boolean }) {
  const src = d.src!;
  const groupId = src.groupId ?? "";
  const g = groupOf(groupId);
  const h: GroupHandView | undefined = g?.hand;
  const plan = src.plan ?? (h?.plan?.decisionId === d.decisionId ? h.plan.plan : undefined);
  const current = !h || h.plan?.decisionId === d.decisionId;
  const state = h?.plan?.state;
  const resolved = d.resolved?.option;
  const live = current && (state === "ready" || state === "held" || (!h && !resolved)) && !answering(groupId);
  const titles = new Map((h?.items ?? []).map((i) => [i.ref, i.title]));
  const refs = plan ? [...plan.fixed.map((x) => x.ref), ...plan.one.flatMap((p) => p.refs), ...plan.line.flatMap((p) => p.refs), ...plan.side.flatMap((p) => p.refs), ...plan.later.map((x) => x.ref)] : (h?.items ?? []).map((i) => i.ref);
  const one = oneRepoOf(refs);
  const groupName = src.group ?? g?.name ?? "";
  const replying = PN.replyOpen.has(groupId);
  const draft = PN.reply.get(groupId) ?? "";
  const summary = !plan ? h?.plan?.summary : undefined;
  // On a touch screen the note link shows on the first part only (the rest open by a tap on the part).
  const firstPart = plan ? [...plan.one, ...plan.line, ...plan.side][0]?.id : undefined;
  const nNotes = Object.values(PN.notes.get(groupId) ?? {}).filter((x) => x.trim()).length;
  // An older plan, replaced after a reply: just its title and what happened.
  if (!current && !inGroup) {
    return (
      <div class={`${bare ? "" : "partner "}ho-planwrap old`} data-seq={seq}>
        <div class="ho-plan old">
          <div class="ho-plan-h">
            <b>{t("ho.plan.title", groupName)}</b>
            <span>{resolved === "reply" ? t("ho.plan.old") : resolved === "go" ? t("ho.plan.went") : t("ho.plan.old")}</span>
          </div>
        </div>
      </div>
    );
  }
  const body = (
    <div class={`ho-plan${live ? " asks" : ""}${inGroup ? " in-group" : ""}`} id={`d-${d.decisionId}`} role="group" aria-label={t("ho.plan.title", groupName)}>
      <div class="ho-plan-h">
        <b>{t("ho.plan.title", groupName)}</b>
        <span>{plan?.read.repo ? t("ho.plan.read", plan.read.n, plan.read.repo) : t("ho.plan.read.plain", plan?.read.n ?? h?.items.length ?? 0)}</span>
      </div>
      {plan ? (
        planSections(plan).map((s, si) => (
          <div key={s.kind} class="ho-plan-sec" style={{ "--i": si } as never}>
            <small>{t(`ho.plan.${s.kind}`)}</small>
            {s.kind === "fixed"
              ? s.rows.map((r) => (
                  <div key={r.ref} class="ho-plan-part fixed">
                    <span class="ho-part-h">
                      <b>{refLabel(r.ref, one)}</b>
                      {inGroup && <span class="tt">{t("ho.plan.fixed.where", r.where)}</span>}
                    </span>
                    {!inGroup && titles.get(r.ref) && (
                      <span class="tt" dir="auto">
                        {titles.get(r.ref)}
                      </span>
                    )}
                    {!inGroup && <span>{t("ho.plan.fixed.where", r.where)}</span>}
                  </div>
                ))
              : s.kind === "later"
                ? s.rows.map((r) => (
                    <div key={r.ref} class="ho-plan-part is-later">
                      <b>{refLabel(r.ref, one)}</b>
                      {r.why && <span dir="auto">{r.why}</span>}
                    </div>
                  ))
                : s.parts.map((p) => {
                    const tt = p.title || (p.refs.length === 1 ? titles.get(p.refs[0]!) : undefined);
                    return (
                      <div key={p.id} class={`ho-plan-part${p.id === firstPart ? " first" : ""}`} onClick={(e) => live && !inGroup && !(e.target as HTMLElement).closest("button, textarea, a") && (PN.noteOpen.add(`${groupId}:${p.id}`), A.changed())}>
                        <span class="ho-part-h">
                          {s.kind === "line" && p.step ? <span class="ho-step">{A.L.num(p.step)}</span> : null}
                          <b>{refsLabel(p.refs, one)}</b>
                          {inGroup && tt && (
                            <span class="tt" dir="auto">
                              {tt}
                            </span>
                          )}
                          {!inGroup && <PartNote groupId={groupId} partId={p.id} live={live} slot="link" />}
                        </span>
                        {!inGroup && tt && (
                          <span class="tt" dir="auto">
                            {tt}
                          </span>
                        )}
                        {!inGroup && p.why && <span dir="auto">{p.why}</span>}
                        {!inGroup && <PartNote groupId={groupId} partId={p.id} live={live} slot="field" />}
                      </div>
                    );
                  })}
          </div>
        ))
      ) : summary ? (
        <p class="ho-plan-summary" dir="auto">
          {summary}
        </p>
      ) : null}
      {plan && plan.limits.length > 0 && (
        <div class="ho-plan-facts" aria-label={t("ho.plan.limits")}>
          {plan.limits.map((x) => (
            <span key={x} dir="auto">
              {x}
            </span>
          ))}
        </div>
      )}
      {live ? (
        <>
          {replying && (
            <div class="ho-reply">
              <textarea class="ho-ta" rows={2} value={draft} placeholder={t("ho.plan.reply.ph")} aria-label={t("ho.plan.reply")} ref={(el) => void (el && !draft && document.activeElement !== el && el.focus())} onInput={(e) => (grow(e.target as HTMLTextAreaElement), PN.reply.set(groupId, (e.target as HTMLTextAreaElement).value), A.changed())} onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim() && answer(groupId, "reply", draft.trim())} />
              <Btn kind="primary" size="sm" label={t("ho.plan.reply.send")} disabled={!draft.trim()} onClick={() => answer(groupId, "reply", draft.trim())} />
            </div>
          )}
          <div class="ho-plan-btns">
            <Btn kind="primary" label={plan ? t("ho.plan.go") : t("ho.plan.summary.go")} about={groupName} onClick={() => answer(groupId, "go")} />
            {state !== "held" && <Btn kind="secondary" label={t("ho.plan.hold")} about={groupName} onClick={() => answer(groupId, "hold")} />}
            <Btn kind="text" label={t("ho.plan.reply")} about={groupName} expanded={replying} onClick={() => (replying ? PN.replyOpen.delete(groupId) : PN.replyOpen.add(groupId), A.changed())} />
            {nNotes > 0 && <span class="ho-plan-n">{A.L.n("ho.plan.notes", nNotes)}</span>}
          </div>
        </>
      ) : (
        <div class="ho-plan-said" role="status">
          <span class="ho-donemark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <path d="M5 10.4l3.2 3.2L15 6.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>{state === "planning" || resolved === "reply" ? t("ho.plan.replied") : state === "held" || resolved === "hold" ? t("ho.plan.held") : t("ho.plan.went")}</span>
          {plan && state === "going" && <span class="muted">{A.L.num(planTasks(plan))}</span>}
        </div>
      )}
    </div>
  );
  if (inGroup || bare) return body;
  return (
    <div class="partner ho-planwrap" data-seq={seq}>
      {body}
    </div>
  );
}

/** D385: what a hand-over group's card on On hand says under its name: the plan, its making, review together. */
/** 看方案 / See the plan: the conversation (on a phone, its pane), scrolled to the plan card, which glows once. */
export function seePlan(decisionId: string) {
  if (A.route.name !== "conv") A.go({ name: "conv" });
  const find = (n: number) => {
    const el = document.getElementById(`d-${decisionId}`);
    if (!el) return void (n > 0 && setTimeout(() => find(n - 1), 80));
    el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  };
  setTimeout(() => find(12), 60);
}

/** A field grows with what is written (no grip to drag); CSS field-sizing does it where the browser can.
 *  Elsewhere (an older iOS Safari) it is measured here: while empty by its placeholder, so the hint
 *  is never cut, and again on every draw (words put in by a chip, the note moved from the sentence) and
 *  on a resize, not only when typed into. */
const grow = (el: HTMLTextAreaElement | null) => {
  if (!el || !el.isConnected || CSS.supports?.("field-sizing", "content")) return;
  const hint = !el.value && el.placeholder ? el.placeholder : "";
  el.style.height = "auto";
  if (hint) el.value = hint;
  const h = el.scrollHeight;
  if (hint) el.value = "";
  const cs = getComputedStyle(el);
  el.style.height = `${h + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)}px`;
};

export function HandBlock({ g }: { g: TaskGroupView }) {
  const h = g.hand!;
  const s = handState(h);
  const d = h.plan?.decisionId ? A.S.decisions.get(h.plan.decisionId) : undefined;
  return (
    <div class={`ho-hand s-${s}`}>
      {(h.where || h.note) && (
        <span class="ho-hand-facts">
          {h.where && <span>{t("ho.group.on", h.where.name)}</span>}
          {h.note && (
            <q class="ho-hand-note" dir="auto">
              {h.note}
            </q>
          )}
        </span>
      )}
      {s === "planning" && (
        <div class="ho-making" role="status">
          <Breath />
          <b>{t("ho.plan.making")}</b>
          <span>{t("ho.plan.making.line", h.items.length)}</span>
        </div>
      )}
      {/* The plan itself lives in the conversation; here its state, the way to it, and Go. */}
      {(s === "ready" || s === "held") && (
        <div class={`ho-plan-ready${s === "held" ? " held" : ""}`} role="group" aria-label={t("ho.plan.title", g.name)}>
          <span class="ho-ready-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18">
              <rect x="4" y="2.8" width="12" height="14.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M7.4 7.2h5.2M7.4 10h5.2M7.4 12.8h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </span>
          <b>{s === "held" ? t("ho.plan.held") : t("ho.plan.ready")}</b>
          <span class="ho-ready-acts">
            {d && <Btn kind="text" size="sm" label={t("ho.plan.see")} about={g.name} onClick={() => seePlan(d.decisionId)} />}
            {h.plan?.plan || h.plan?.summary ? <Btn kind="primary" size="sm" label={t("ho.plan.go")} about={g.name} disabled={answering(g.id)} onClick={() => answer(g.id, "go")} /> : null}
          </span>
        </div>
      )}
      {s === "failed" && (
        <div class="ho-making failed">
          <b>{t("ho.plan.failed")}</b>
          <span>{t("ho.plan.failed.line")}</span>
        </div>
      )}
      {s === "review" && (
        <div class="ho-review-ready">
          <span class="ho-donemark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <path d="M5 10.4l3.2 3.2L15 6.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <b>{t("ho.review.ready")}</b>
          <span class="grow" />
          <Btn kind="primary" size="sm" label={t("ho.review")} about={g.name} onClick={() => openReview(g.id)} />
        </div>
      )}
      {s === "sent" && (
        <div class="ho-review-ready sent">
          <span class="ho-donemark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <path d="M5 10.4l3.2 3.2L15 6.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>{t("ho.review.sent")}</span>
        </div>
      )}
    </div>
  );
}

// ---------- 一起过目 / Review together ----------

const HR: { cid: string; groupId?: string; review?: GroupReview; loading: boolean; error?: string; dropped: Set<number>; sending: boolean; said?: string } = { cid: "", loading: false, dropped: new Set(), sending: false };

export function openReview(groupId: string) {
  Object.assign(HR, { cid: `review-${Date.now()}`, groupId, review: undefined, loading: true, error: undefined, dropped: new Set(), sending: false, said: undefined });
  A.send({ t: "group_review", groupId, clientId: HR.cid });
  A.sheet = { kind: "review", groupId };
  A.changed();
}

export function ReviewSheet({ groupId }: { groupId: string }) {
  const r = HR.groupId === groupId ? HR.review : undefined;
  const close = () => ((A.sheet = null), A.changed());
  const keep = r ? reviewKeep(r.rows, HR.dropped) : [];
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), close();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && keep.length) e.preventDefault(), send();
  };
  const send = () => {
    if (!keep.length || HR.sending) return;
    HR.sending = true;
    A.send({ t: "group_review_send", groupId, keep, clientId: HR.cid });
    A.changed();
  };
  const g = groupOf(groupId);
  const fixedKept = r ? r.rows.some((x, i) => x.close && !HR.dropped.has(i)) : false;
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet pile-sheet ho-review" role="dialog" aria-modal="true" aria-label={t("ho.review")} onKeyDown={keys}>
        <div class="past-head">
          <h2>
            <span>{t("ho.review")}</span>
            {r && <span class="n">{t("ho.review.sub", r.name, r.rows.length)}</span>}
          </h2>
          <button class="past-x" aria-label={t("ho.x")} onClick={close}>
            ×
          </button>
        </div>
        <div class="past-list pile-body">
          {HR.loading ? (
            <div class="ho-skel" role="status" aria-label={t("ho.review.loading")}>
              <i />
              <i />
              <i />
            </div>
          ) : !r ? (
            <p class="pile-lede">{HR.error ?? t("pile.empty")}</p>
          ) : (
            <>
              <p class="pile-lede ho-review-lede">{[r.prs > 0 && A.L.n("ho.review.lede.prs", r.prs), r.fixed > 0 && A.L.n("ho.review.lede.fixed", r.fixed), t("ho.review.lede.then")].filter(Boolean).join(t("ho.sentence.gap"))}</p>
              <div class="pile-list">
                {r.rows.map((row, i) => {
                  const off = HR.dropped.has(i);
                  const one = oneRepoOf(row.items.map((x) => x.ref));
                  return (
                    <div key={i} class={`pile-item ho-rv${off ? " kept" : ""}`} style={{ "--i": i } as never}>
                      <span class="pile-item-body">
                        <span class="pile-item-head">
                          <span class="todo-mark small">
                            <BrandMark name={row.items[0]!.kind} size={16} />
                          </span>
                          <span class="pile-item-title" dir="auto">
                            {row.items.length > 1 ? refsLabel(row.items.map((x) => x.ref), one) : row.items[0]!.title}
                          </span>
                        </span>
                        <span class="ho-rv-facts">
                          {row.pr ? (
                            <a class="pr" href={row.pr.url} target="_blank" rel="noreferrer">
                              {row.pr.label}
                            </a>
                          ) : row.fixedIn ? (
                            <span class="pr">{t("ho.review.fixedin", row.fixedIn)}</span>
                          ) : null}
                          {row.checks && <span class={row.checks.state === "passed" ? "ok" : row.checks.state === "failed" ? "bad" : ""}>{row.checks.state === "passed" ? t("ho.review.checks.ok") : row.checks.state === "failed" ? A.L.n("ho.review.checks.bad", row.checks.failed ?? 1) : t("ho.review.checks.running")}</span>}
                          {row.size && (
                            <span class="size">
                              <span class="add">+{A.L.num(row.size.added)}</span>
                              <span class="del">−{A.L.num(row.size.removed)}</span>
                            </span>
                          )}
                        </span>
                        {row.result && (
                          <span class="pile-why" dir="auto">
                            {row.result}
                          </span>
                        )}
                        {!off && (
                          <span class="pile-says">
                            <span class="pile-says-label">{t("ho.review.says")}</span>
                            <q class="pile-says-text" dir="auto">
                              {row.comment}
                            </q>
                          </span>
                        )}
                      </span>
                      <Btn kind={off ? "text" : "secondary"} size="sm" label={off ? t("ho.review.keep") : t("ho.review.drop")} about={row.items[0]!.title} onClick={() => (off ? HR.dropped.delete(i) : HR.dropped.add(i), A.changed())} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {r && (
          <div class="ho-foot">
            {HR.said && <p class="small tone-bad">{HR.said}</p>}
            <div class="ho-foot-row">
              <Btn kind="secondary" label={t("ho.review.hold")} onClick={close} />
              <Btn kind="primary" grow label={t("ho.review.go", keep.length)} disabled={!keep.length || HR.sending} onClick={send} />
            </div>
            <p class="ho-foot-note">{fixedKept ? t("ho.review.foot") : t("ho.review.foot.none")}</p>
          </div>
        )}
        {!r && g?.hand?.review === "sent" && <p class="ho-foot-note">{t("ho.review.sent")}</p>}
      </div>
    </>
  );
}
