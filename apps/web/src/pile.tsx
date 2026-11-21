// D359: the pile on On hand (design/task-sources.md §9, research/130). The person's open to-dos as
// one clay object: the partner beside a stack of pages whose height is the count's bucket, the count
// itself literal beside it (还有 557 个 / 557 still open), what was cleared today, and the sort's few
// honest groups, each its own row with its own count and one action:
//   可以交给{name}做的 → a sheet: tick what to hand over (six by default), three run at a time;
//   要你拿主意的       → a sheet: one question each, the suggested answer picked already;
//   也许可以关掉的     → a sheet: every one with the line it leaves; the sheet's button is the Go.
// A done one ticks the count down with a page lifting off (reduced motion: the number changes in place).
// A PR waiting for review that the partner read says so on its card (我看过了), and opens its comments.
import type { PileGroup, PileItem, PileView, PreRead, SourceGlance, SourcesServerFrame } from "@ducter/protocol";
import { PILE_CAP, PILE_HAND_DEFAULT, sizeSaid } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark } from "./brand.tsx";
import { Btn } from "./controls.tsx";
import { ago } from "./format.ts";
import { SourceChip } from "./todos.tsx";
import { openHand, SubjectChips } from "./handover.tsx";
import { appHooks } from "./apps.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What this page holds of the pile beyond the sources frame: the open sheet, its items, choices in flight. */
export const PL: {
  group?: PileGroup;
  items: Partial<Record<PileGroup, PileItem[]>>;
  cid: string;
  /** The do sheet's ticks; the close sheet's kept-open ones. */
  picked: Set<string>;
  kept: Set<string>;
  chosen: Record<string, "hand" | "close" | "later">;
  sending: boolean;
  said?: string;
  /** The PR whose pre-read is open, and its notes dropped (by index). */
  review?: string;
  read?: PreRead;
  reading?: boolean;
  dropped: Set<number>;
  /** The count as last drawn, and a tick in flight (557 → 556). */
  shown?: number;
  tick?: { from: number; to: number; at: number };
  /** D407: opened from a small app's 看草稿: closing the sheet goes back to that app. */
  back?: () => void;
} = { items: {}, cid: "", picked: new Set(), kept: new Set(), chosen: {}, sending: false, dropped: new Set() };

/** The art's bucket: the stack's height says roughly how much; the number says exactly. */
export function pileArt(open: number): "big" | "mid" | "small" | "clear" {
  return open >= 100 ? "big" : open >= 20 ? "mid" : open >= 1 ? "small" : "clear";
}

export function openPile(group: PileGroup) {
  PL.group = group;
  PL.said = undefined;
  PL.picked = new Set();
  PL.kept = new Set();
  PL.chosen = {};
  PL.cid = `pile-${Date.now()}`;
  A.send({ t: "pile_items", group, clientId: PL.cid });
  A.sheet = { kind: "pile" };
  A.changed();
}

export function openRead(ref: string) {
  PL.back = undefined;
  PL.group = undefined;
  PL.review = ref;
  PL.read = undefined;
  PL.reading = true;
  PL.dropped = new Set();
  PL.said = undefined;
  PL.cid = `read-${Date.now()}`;
  A.send({ t: "pre_read", ref, clientId: PL.cid });
  A.sheet = { kind: "pile" };
  A.changed();
}

// D407: a small app's 看草稿 (ducter.open): this PR's draft sheet; closing it goes back to the app.
appHooks.showDraft = (ref, back) => {
  openRead(ref);
  PL.back = back;
};

function closeSheet() {
  A.sheet = null;
  PL.review = undefined;
  const back = PL.back;
  PL.back = undefined;
  if (back) return back();
  A.changed();
}

/** The home's answers about the pile (routed here by todos.tsx's frame handler). */
export function onPileFrame(f: SourcesServerFrame): boolean {
  if (f.t === "pile_items_result") {
    if (f.clientId !== PL.cid) return true;
    PL.items[f.group] = f.items;
    // 交给{name}: the first six ticked (small ones first; the home ordered them).
    if (f.group === "do" && !PL.picked.size) PL.picked = new Set(f.items.slice(0, PILE_HAND_DEFAULT).map((p) => p.item.ref));
    A.changed();
    return true;
  }
  if (f.t === "pile_result") {
    if (f.clientId !== PL.cid) return true;
    PL.sending = false;
    if (f.op === "pre_read") {
      PL.reading = false;
      PL.read = f.read;
    } else if (f.op === "hand") {
      if (f.ok) return closeSheet(), toast(t("pile.handed", A.S.personaName)), true;
      PL.said = f.error ?? t("newtask.err.failed");
    } else if (f.op === "close") {
      if ((f.done ?? 0) > 0) toast(t("pile.closed", f.done));
      if (f.failed) toast((PL.said = t("pile.close.failed", f.failed)));
      else closeSheet();
    } else if (f.op === "review") {
      if (f.ok) closeSheet(), toast(t("pile.read.sent"));
      else PL.said = f.error ?? t("newtask.err.failed");
    }
    A.changed();
    return true;
  }
  return false;
}

const toast = (text: string) => A.toast(text, undefined, 3200);

/** The count, rolled down by one digit when a to-do is cleared; the page lifts off the partner's arms. */
function Count({ n, atLeast }: { n: number; atLeast?: boolean }) {
  if (PL.shown !== undefined && n < PL.shown) PL.tick = { from: PL.shown, to: n, at: Date.now() };
  PL.shown = n;
  const tick = PL.tick && Date.now() - PL.tick.at < 900 ? PL.tick : undefined;
  return (
    <span class="pile-count" aria-live="polite">
      {t("pile.left.before") && <span class="pile-unit">{t("pile.left.before")}</span>}
      <span class={`pile-n${tick ? " ticking" : ""}`} key={tick ? `t${tick.at}` : "n"}>
        {tick && (
          <span class="pile-was" aria-hidden="true">
            {A.L.num(tick.from)}
          </span>
        )}
        <span class="pile-now">
          {A.L.num(n)}
          {atLeast ? "+" : ""}
        </span>
      </span>
      <span class="pile-unit">{t("pile.left.after")}</span>
    </span>
  );
}

function Art({ open }: { open: number }) {
  const b = pileArt(open);
  const tick = PL.tick && Date.now() - PL.tick.at < 900;
  return (
    <span class={`pile-art art-${b}`} aria-hidden="false">
      <img src={`app/art/pile_${b}.webp`} width={160} height={128} alt={t(`pile.art.${b}`, A.S.personaName)} />
      {tick && <span class="pile-leaf" key={PL.tick!.at} aria-hidden="true" />}
    </span>
  );
}

/** D467: the open ones the sort's groups don't hold: already handed over or bound to a task (their
 *  own row, so the rows add up to the count). */
export function pileTaken(pile: PileView): number {
  if (!pile.sortedAt || !pile.read || pile.sorting) return 0;
  const g = pile.groups;
  return Math.max(0, pile.open - (g.do + g.decide + g.close + g.later + pile.unread));
}

function Row({ g, n, act, note, onAct }: { g: PileGroup | "unread" | "taken"; n: number; act?: string; note?: string; onAct?: () => void }) {
  const label = g === "do" ? t("pile.g.do", A.S.personaName) : g === "taken" ? t("onhand.src.taken.row") : t(`pile.g.${g}`);
  return (
    <div class={`pile-row g-${g}`}>
      <span class="pile-row-text">
        <span class="pile-row-label">{label}</span>
        {note && <span class="pile-row-note">{note}</span>}
      </span>
      <span class="pile-row-n">{A.L.num(n)}</span>
      {act && onAct ? <Btn kind={g === "do" ? "primary" : "secondary"} size="sm" label={act} about={label} onClick={onAct} /> : <span class="pile-row-gap" />}
    </div>
  );
}

/**
 * D359: the pile, at the head of the to-dos group: the clay, the count and the day's line, the
 * queue, then the sort's groups (or its progress, or the one way to start it).
 */
export function PileBlock({ pile }: { pile: PileView }) {
  // Re-draw once the tick's motion is over (the number keeps its place).
  const tickAt = PL.tick?.at;
  useEffect(() => {
    if (!tickAt) return;
    const h = setTimeout(() => A.changed(), 950);
    return () => clearTimeout(h);
  }, [tickAt]);
  const name = A.S.personaName;
  const g = pile.groups;
  const sorted = !!pile.sortedAt && pile.read > 0;
  return (
    <div class="pile" data-pile={pileArt(pile.open)}>
      <div class="pile-head">
        <Art open={pile.open} />
        <div class="pile-facts">
          {pile.open > 0 ? <Count n={pile.open} atLeast={pile.atLeast} /> : <span class="pile-count clear">{t("pile.clear")}</span>}
          {pile.clearedToday > 0 && <span class="pile-day">{t("pile.today", pile.clearedToday)}</span>}
          {(pile.queue.running > 0 || pile.queue.waiting > 0) && (
            <span class="pile-queue">
              {pile.queue.running > 0 && <span class="pile-q run">{t("pile.running", pile.queue.running)}</span>}
              {pile.queue.waiting > 0 && <span class="pile-q wait">{t("pile.waiting", pile.queue.waiting)}</span>}
            </span>
          )}
        </div>
      </div>
      {/* D385: 讲的是 / Subjects: what the open ones are about, each a way into the hand-over sheet. */}
      {!pile.sorting && (pile.subjects?.length || pile.read) ? <SubjectChips subjects={pile.subjects ?? []} more={pile.subjectsMore} /> : null}
      {pile.sorting ? (
        <div class="pile-sorting" role="status">
          <span class="pile-sorting-line">{t("pile.sorting")}</span>
          <span class="pile-bar" aria-hidden="true">
            <span style={{ width: `${Math.round((100 * pile.sorting.read) / Math.max(1, pile.sorting.of))}%` }} />
          </span>
          <span class="pile-sorting-facts">
            <span>{t("pile.sorting.read", pile.sorting.read)}</span>
            <span>{t("pile.sorting.of", pile.sorting.of)}</span>
          </span>
        </div>
      ) : sorted ? (
        <div class="pile-rows">
          {g.do > 0 && <Row g="do" n={g.do} act={t("pile.act.do", name)} onAct={() => openHand({ door: "do", doCount: g.do })} />}
          {g.decide > 0 && <Row g="decide" n={g.decide} act={t("pile.act.decide")} onAct={() => openPile("decide")} />}
          {g.close > 0 && <Row g="close" n={g.close} note={t("pile.g.close.note")} act={t("pile.act.close")} onAct={() => openPile("close")} />}
          {g.later > 0 && <Row g="later" n={g.later} />}
          {pile.unread > 0 && <Row g="unread" n={pile.unread} />}
          {pileTaken(pile) > 0 && <Row g="taken" n={pileTaken(pile)} />}
        </div>
      ) : (
        pile.open > 0 && (
          <div class="pile-first">
            <p>{t("pile.first.lede", name)}</p>
            <Btn kind="primary" size="sm" label={t("pile.first")} onClick={() => A.send({ t: "pile_sort" })} />
          </div>
        )
      )}
      {pile.failed && !pile.sorting && <p class="pile-failed small">{t(`pile.failed.${pile.failed}`)}</p>}
      {sorted && !pile.sorting && (
        <div class="pile-foot">
          <span class="pile-when">{t("pile.sorted", ago(A.L, pile.sortedAt))}</span>
          <Btn kind="text" size="sm" label={t("pile.again")} onClick={() => A.send({ t: "pile_sort" })} />
        </div>
      )}
    </div>
  );
}

/** D359: a review request the partner read: 我看过了 with its counts as separate facts, and 看看. */
export function ReadLine({ g }: { g: SourceGlance }) {
  if (!g.read) return null;
  const r = g.read;
  return (
    <button class="pile-read" onClick={(e) => (e.preventDefault(), e.stopPropagation(), openRead(g.ref))}>
      <span class="pile-read-who">{t("pile.read.line")}</span>
      {r.state === "sent" ? (
        <span class="pile-read-fact">{t("pile.read.sent")}</span>
      ) : r.problems + r.suggestions === 0 ? (
        <span class="pile-read-fact">{t("pile.read.clean")}</span>
      ) : (
        <>
          {r.problems > 0 && <span class="pile-read-fact bad">{A.L.n("pile.read.problems", r.problems)}</span>}
          {r.suggestions > 0 && <span class="pile-read-fact">{A.L.n("pile.read.suggestions", r.suggestions)}</span>}
        </>
      )}
      <span class="pile-read-see">{t("pile.read.see")}</span>
    </button>
  );
}

function ItemHead({ p }: { p: PileItem }) {
  return (
    <span class="pile-item-head">
      <span class="todo-mark small">
        <BrandMark name={p.item.kind} size={16} />
      </span>
      <a class="pile-item-title" href={p.item.url} target="_blank" rel="noreferrer">
        {p.item.title}
      </a>
    </span>
  );
}

/** D443: `line` is the one line shown with the to-do; when it already says the size, no pill repeats it. */
function ItemFacts({ p, line }: { p: PileItem; line?: string }) {
  return (
    <span class="pile-item-facts">
      <SourceChip src={p.item} small states={false} plain />
      {p.size && !sizeSaid(line, p.size) && <span class="todo-label">{t(`pile.size.${p.size}`)}</span>}
      {(p.item.labels ?? []).slice(0, 2).map((l) => (
        <span key={l} class="todo-label">
          {l}
        </span>
      ))}
    </span>
  );
}

function DoSheet({ items }: { items: PileItem[] }) {
  const name = A.S.personaName;
  const n = PL.picked.size;
  return (
    <>
      <p class="pile-lede">{t("pile.do.lede", PILE_CAP)}</p>
      <div class="pile-list">
        {items.map((p) => {
          const on = PL.picked.has(p.item.ref);
          return (
            <label key={p.item.ref} class={`pile-item pick${on ? " on" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => (on ? PL.picked.delete(p.item.ref) : PL.picked.add(p.item.ref), A.changed())} />
              <span class="pile-item-body">
                <ItemHead p={p} />
                <span class="pile-why">{p.why}</span>
                <ItemFacts p={p} line={p.why} />
              </span>
            </label>
          );
        })}
      </div>
      <div class="pile-go">
        {PL.said && <p class="small tone-bad">{PL.said}</p>}
        <Btn kind="primary" grow label={n ? t("pile.do.go", name, n) : t("pile.do.none")} disabled={!n || PL.sending} onClick={() => ((PL.sending = true), (PL.cid = `hand-${Date.now()}`), A.send({ t: "pile_hand", refs: items.filter((p) => PL.picked.has(p.item.ref)).map((p) => p.item.ref), clientId: PL.cid }), A.changed())} />
      </div>
    </>
  );
}

function DecideSheet({ items }: { items: PileItem[] }) {
  const name = A.S.personaName;
  const choose = (p: PileItem, pick: "hand" | "close" | "later") => {
    PL.chosen[p.item.ref] = pick;
    A.send({ t: "pile_choose", ref: p.item.ref, pick });
    A.changed();
  };
  return (
    <>
      <p class="pile-lede">{t("pile.decide.lede")}</p>
      <div class="pile-list">
        {items.map((p) => {
          const done = PL.chosen[p.item.ref];
          return (
            <div key={p.item.ref} class={`pile-item decide${done ? " done" : ""}`}>
              <span class="pile-item-body">
                <ItemHead p={p} />
                <ItemFacts p={p} line={p.ask ?? p.why} />
                <span class="pile-ask">{p.ask ?? p.why}</span>
                {done ? (
                  <span class="pile-picked">{t(`pile.picked.${done}`, name)}</span>
                ) : (
                  <span class="pile-picks" role="group" aria-label={p.ask ?? p.why}>
                    {(["hand", "close", "later"] as const).map((k) => (
                      <button key={k} class={`btn ${p.pick === k ? "primary" : "secondary"} sm pile-pick`} onClick={() => choose(p, k)}>
                        <span class="lbl">{t(`pile.pick.${k}`, name)}</span>
                        {p.pick === k && <span class="pile-suggested">{t("pile.decide.suggested")}</span>}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CloseSheet({ items }: { items: PileItem[] }) {
  const going = items.filter((p) => !PL.kept.has(p.item.ref));
  const keep = (p: PileItem) => {
    const was = PL.kept.has(p.item.ref);
    if (was) PL.kept.delete(p.item.ref);
    else PL.kept.add(p.item.ref);
    // Kept open is the person's answer: the home leaves it out of the group (a tap again puts it back).
    A.send({ t: "pile_choose", ref: p.item.ref, pick: was ? "close" : "keep" });
    A.changed();
  };
  return (
    <>
      <p class="pile-lede">{t("pile.close.lede")}</p>
      <div class="pile-list">
        {items.map((p) => {
          const kept = PL.kept.has(p.item.ref);
          return (
            <div key={p.item.ref} class={`pile-item close${kept ? " kept" : ""}`}>
              <span class="pile-item-body">
                <ItemHead p={p} />
                <span class="pile-why">{p.why}</span>
                <ItemFacts p={p} line={p.why} />
                {!kept && p.comment && (
                  <span class="pile-says">
                    <span class="pile-says-label">{t("pile.close.says")}</span>
                    <q class="pile-says-text" dir="auto">
                      {p.comment}
                    </q>
                  </span>
                )}
              </span>
              <Btn kind={kept ? "text" : "secondary"} size="sm" label={kept ? t("pile.close.kept") : t("pile.close.keep")} about={p.item.title} onClick={() => keep(p)} />
            </div>
          );
        })}
      </div>
      <div class="pile-go">
        {PL.said && <p class="small tone-bad">{PL.said}</p>}
        <div class="pile-go-row">
          <Btn kind="secondary" label={t("pile.close.hold")} onClick={closeSheet} />
          {/* The sheet goes on Go: the pile is watched ticking down underneath. */}
          <Btn kind="primary" grow label={t("pile.close.go", going.length)} disabled={!going.length || PL.sending} onClick={() => ((PL.sending = true), (PL.cid = `close-${Date.now()}`), A.send({ t: "pile_close", refs: going.map((p) => p.item.ref), clientId: PL.cid }), closeSheet())} />
        </div>
        <p class="pile-foot-note">{t("pile.close.foot")}</p>
      </div>
    </>
  );
}

function ReadSheet() {
  const r = PL.read;
  if (PL.reading) return <p class="pile-lede">{t("pile.read.reading")}</p>;
  if (!r) return <p class="pile-lede">{t("pile.read.none")}</p>;
  const kept = r.notes.map((_, i) => i).filter((i) => !PL.dropped.has(i));
  return (
    <>
      <div class="pile-pr">
        <a class="pile-item-title" href={r.url} target="_blank" rel="noreferrer">
          {r.title}
        </a>
        {r.gist && <p class="pile-lede">{r.gist}</p>}
      </div>
      <div class="pile-list">
        {r.notes.map((note, i) => {
          const off = PL.dropped.has(i);
          return (
            <div key={i} class={`pile-item note ${note.kind}${off ? " kept" : ""}`}>
              <span class="pile-item-body">
                <span class="pile-note-head">
                  <span class={`pile-note-kind ${note.kind}`}>{t(`pile.read.${note.kind}`)}</span>
                  {note.path && <code class="pile-note-where">{note.line ? `${note.path}:${note.line}` : note.path}</code>}
                </span>
                <span class="pile-note-text" dir="auto">
                  {note.text}
                </span>
              </span>
              {r.state === "drafted" && <Btn kind={off ? "text" : "secondary"} size="sm" label={off ? t("pile.read.dropped") : t("pile.read.drop")} about={note.text} onClick={() => (off ? PL.dropped.delete(i) : PL.dropped.add(i), A.changed())} />}
            </div>
          );
        })}
      </div>
      <div class="pile-go">
        {PL.said && <p class="small tone-bad">{PL.said}</p>}
        {r.state === "drafted" && r.notes.length > 0 ? (
          <>
            <div class="pile-go-row">
              <Btn kind="secondary" label={t("pile.read.hold")} onClick={closeSheet} />
              <Btn kind="primary" grow label={t("pile.read.go", kept.length)} disabled={!kept.length || PL.sending} onClick={() => ((PL.sending = true), (PL.cid = `send-${Date.now()}`), A.send({ t: "pre_read_send", ref: r.ref, keep: kept, clientId: PL.cid }), A.changed())} />
            </div>
            <p class="pile-foot-note">{t("pile.read.foot")}</p>
          </>
        ) : (
          r.url && <Btn kind="secondary" grow label={t("pile.read.open")} onClick={() => window.open(r.url, "_blank", "noreferrer")} />
        )}
      </div>
    </>
  );
}

/** D359: the pile's sheet: one group's to-dos (or a PR's pre-read), its one action at the foot. */
export function PileSheet() {
  const body = useRef<HTMLDivElement>(null);
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(), e.stopPropagation();
    closeSheet();
  };
  const g = PL.group;
  const items = g ? (PL.items[g] ?? undefined) : undefined;
  const title = PL.review ? t("pile.read.title") : g === "do" ? t("pile.g.do", A.S.personaName) : g ? t(`pile.g.${g}`) : "";
  // A decided one leaves its group at the next answer; keep the ones answered here on screen.
  const shown = items?.filter((p) => g !== "decide" || !p.chosen || PL.chosen[p.item.ref]) ?? [];
  return (
    <>
      <div class="scrim" onClick={closeSheet} />
      <div class="past-sheet pile-sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={keys}>
        <div class="past-head">
          <h2>
            <span>{title}</span>
            {items && !PL.review && <span class="n">{A.L.num(items.length)}</span>}
          </h2>
          <button class="past-x" aria-label={t("pile.close.x")} onClick={closeSheet}>
            ×
          </button>
        </div>
        <div class="past-list pile-body" ref={body}>
          {PL.review ? <ReadSheet /> : !items ? <p class="pile-lede">{t("todos.looking")}</p> : !shown.length ? <p class="pile-lede">{t("pile.empty")}</p> : g === "do" ? <DoSheet items={shown} /> : g === "decide" ? <DecideSheet items={shown} /> : <CloseSheet items={shown} />}
        </div>
      </div>
    </>
  );
}
