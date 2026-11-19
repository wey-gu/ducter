// D387 (was D354's two chips): the opened task's model and effort under its composer, always in
// sight while it can be switched, as ONE chip that reads like a phrase: the model in ink, then the
// effort in a muted voice with a small level mark (GPT-6.2-Sol, then 中). It opens one clay card:
// the effort as its title, a stepped control with a dot for each level that model takes (the agent's
// live list, D349/D352: a level it doesn't take is not there), 回到默认 / Back to default when it is
// off the model's default, and the model as a line with › that turns the card to the agent's live
// models. A choice is D282's in-place switch: the running turn finishes as it was, the next one uses
// the new setting, said once in a quiet line. Switching the agent itself stays in 换谁来做. The
// Mac's composerTune (apps/desktop/internal/views/composertune.go).
import type { ModelChoice } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A, effortWord } from "./app.ts";
import { inPlaceTune, spoken } from "./format.ts";
import { usePlaced } from "./pop-place.ts";
import { attention, effortOf, harnessOf, modelOf, placeOf, type Task } from "./store.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** How long 下一轮起用 {model} / From its next turn… stays. */
export const SAID_MS = 8000;
/** How long the stepped control waits after the last key before it switches (a drag switches on release). */
export const SETTLE_MS = 700;
/** What was said after the last choice, per task: kept here so it outlives a re-render. */
const said = new Map<string, { text: string; at: number }>();

/** The task can still move: not dropped or replaced, and someone is doing it (换谁来做's rule). */
export const tunable = (task: Task) => !!harnessOf(task) && !["dropped", "superseded"].includes(attention(task));

/** The chip's content, or undefined when there is nothing to switch in place (no live list). */
export function composerTune(task: Task): { models: ModelChoice[]; model: ModelChoice; effort: string } | undefined {
  if (!tunable(task)) return undefined;
  const device = (placeOf(task) as { device?: string }).device;
  const tu = inPlaceTune(A.newTaskOptions?.models ?? [], harnessOf(task), device, modelOf(task), effortOf(task));
  return tu?.model ? { models: tu.models, model: tu.model, effort: tu.effort } : undefined;
}

/** The levels the control shows: the ones this model takes, in the agent's order; none, no control. */
export const effortSteps = (model: ModelChoice): string[] => model.efforts ?? [];

/** Where the effort sits among the levels; -1 for the agent's own unnamed default. */
export const stepOf = (levels: string[], effort: string) => levels.indexOf(effort);

/** The level a key moves to (a slider's keys: ← ↓ one down, → ↑ one up, Home, End), else undefined. */
export function stepKey(key: string, i: number, n: number): number | undefined {
  if (n <= 0) return undefined;
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(n - 1, i < 0 ? 0 : i + 1);
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, i < 0 ? 0 : i - 1);
  if (key === "Home" || key === "PageDown") return 0;
  if (key === "End" || key === "PageUp") return n - 1;
  return undefined;
}

/** The level under a point along the track: x from its start, w its length (the dots' span). */
export const stepAt = (x: number, w: number, n: number) => (n <= 1 || w <= 0 ? 0 : Math.max(0, Math.min(n - 1, Math.round((x / w) * (n - 1)))));

/** 回到默认 / Back to default: the model's own default level, when the agent names one and the task is off it. */
export const resetTo = (model: ModelChoice, effort: string): string | undefined => (model.defaultEffort && effortSteps(model).includes(model.defaultEffort) && effort !== model.defaultEffort ? model.defaultEffort : undefined);

/** How full the chip's level mark is: 1 to 3 bars for the level's place among the model's. */
export const markBars = (i: number, n: number) => (i < 0 || n <= 0 ? 0 : Math.max(1, Math.round(((i + 1) / n) * 3)));

export function ComposerTune({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  // Opened from the keyboard, the card takes the focus on its first control; by a tap, on itself (no ring).
  const [byKey, setByKey] = useState(false);
  const [, tick] = useState(0);
  const chip = useRef<HTMLButtonElement>(null);
  useEffect(() => A.askTaskModels(task.id), [task.id, A.S.welcomed]);
  const tu = composerTune(task);
  const s = said.get(task.id);
  const left = s ? SAID_MS - (Date.now() - s.at) : 0;
  useEffect(() => {
    if (left <= 0) return;
    const h = setTimeout(() => tick((n) => n + 1), left + 20);
    return () => clearTimeout(h);
  }, [s?.at]);
  if (!tu) return null;
  const { models, model, effort } = tu;
  const levels = effortSteps(model);
  const i = stepOf(levels, effort);
  const eWord = effort ? effortWord(A.L, effort) : t("newtask.effort.default");
  const close = (focus: boolean) => (setOpen(false), focus && chip.current?.focus());
  const sayLine = s && left > 0 ? s.text : "";
  return (
    <span class="ctune">
      <span class="ctune-m">
        <button
          ref={chip}
          type="button"
          class={`ctune-chip${open ? " open" : ""}`}
          aria-label={levels.length ? spoken(A.L, t("newtask.model"), model.label, t("newtask.effort"), eWord) : spoken(A.L, t("newtask.model"), model.label)}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => (setByKey((e as MouseEvent).detail === 0), setOpen(!open))}
          onKeyDown={(e) => e.key === "ArrowDown" && !open && (e.preventDefault(), setByKey(true), setOpen(true))}
        >
          <span class="m">{model.label}</span>
          {levels.length ? (
            <span class="e">
              {i >= 0 && <LevelMark bars={markBars(i, levels.length)} />}
              <span>{eWord}</span>
            </span>
          ) : null}
          <svg class="caret" viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
            <path d="M2 3.5 5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        {open && <TuneCard task={task} models={models} model={model} effort={effort} anchor={chip} said={sayLine} byKey={byKey} onClose={close} />}
      </span>
      {!open && sayLine && (
        <span class="ctune-said" role="status">
          {sayLine}
        </span>
      )}
    </span>
  );
}

/** Three small ascending bars, as many filled as the level is high: the chip's hint of the control. */
function LevelMark({ bars }: { bars: number }) {
  return (
    <svg class="lvl" viewBox="0 0 12 10" width="12" height="10" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <rect key={k} x={k * 4.5} y={6 - k * 3} width="3" height={4 + k * 3} rx="1.2" class={k < bars ? "on" : ""} />
      ))}
    </svg>
  );
}

/** The one card: the effort big, its stepped control, Back to default, the model line; or the model list. */
function TuneCard(p: { task: Task; models: ModelChoice[]; model: ModelChoice; effort: string; anchor: { current: Element | null }; said: string; byKey: boolean; onClose: (focus: boolean) => void }) {
  const { task, models, model, effort } = p;
  const levels = effortSteps(model);
  const [view, setView] = useState<"effort" | "models">(levels.length ? "effort" : "models");
  const [pend, setPend] = useState<number | undefined>();
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const pendRef = useRef<number | undefined>();
  /** The level last switched to from this card (the task's own effort says so a moment later). */
  const sent = useRef<string | undefined>();
  pendRef.current = pend;
  usePlaced(true, p.anchor, box, { align: "start", width: 300 }, [view]);
  const h = harnessOf(task);
  const pick = (m: string, e: string | undefined, words: string) => {
    said.set(task.id, { text: words, at: Date.now() });
    A.retuneTask(task.id, h, m, e);
  };
  const commit = (k: number | undefined) => {
    clearTimeout(settle.current);
    if (k === undefined) return;
    const lv = levels[k];
    // The level stays shown as picked until the task's own effort catches up.
    if (lv && lv !== (sent.current ?? effort)) (sent.current = lv), pick(model.id, lv, t("tune.next.effort", effortWord(A.L, lv)));
  };
  const closeAll = (focus: boolean) => (commit(pendRef.current), p.onClose(focus));
  useEffect(() => {
    const away = (e: Event) => {
      const el = e.target as Element;
      if (box.current?.contains(el) || (p.anchor.current as Element | null)?.contains(el)) return;
      closeAll(false);
    };
    addEventListener("pointerdown", away, true);
    // The first thing in it takes the focus: the control, or the model on.
    const first = box.current?.querySelector<HTMLElement>(view === "effort" ? "[role=slider]" : "[role=menuitemradio][aria-checked=true], [role=menuitemradio]");
    (p.byKey || view === "models" ? first : box.current)?.focus({ preventScroll: true });
    return () => removeEventListener("pointerdown", away, true);
  }, [view]);
  useEffect(() => () => clearTimeout(settle.current), []);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault(), e.stopPropagation();
      if (view === "models" && levels.length) setView("effort");
      else closeAll(true);
      return;
    }
    if (view !== "models") return;
    const rows = [...(box.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    const k = rows.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => (e.preventDefault(), rows[(n + rows.length) % rows.length]?.focus());
    if (k < 0) return;
    if (e.key === "ArrowDown") go(k + 1);
    else if (e.key === "ArrowUp") go(k - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(rows.length - 1);
  };
  const shown = pend ?? stepOf(levels, effort);
  const shownWord = shown >= 0 ? effortWord(A.L, levels[shown]!) : t("newtask.effort.default");
  const isDefault = shown >= 0 && levels[shown] === model.defaultEffort;
  const back = resetTo(model, shown >= 0 ? levels[shown]! : effort);
  return (
    <div
      ref={box}
      class="ctune-pop"
      tabIndex={-1}
      role="dialog"
      aria-label={view === "effort" ? t("newtask.effort") : t("newtask.model")}
      onKeyDown={keys}
      onFocusOut={(e) => {
        const to = (e as FocusEvent).relatedTarget as Node | null;
        if (to && !box.current?.contains(to) && !(p.anchor.current as Element | null)?.contains(to)) closeAll(false);
      }}
    >
      {view === "effort" ? (
        <>
          <div class="tp-head">
            <div class="tp-ttl">
              <small>{t("newtask.effort")}</small>
              <span class="big">{shownWord}</span>
              {isDefault && <small class="tag">{t("newtask.effort.default")}</small>}
            </div>
            {back && (
              <button type="button" class="tp-reset" aria-label={t("tune.reset")} title={t("tune.reset")} onClick={() => (commit(undefined), setPend(stepOf(levels, back)), (sent.current = back), pick(model.id, back, t("tune.next.effort", effortWord(A.L, back))))}>
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                  <path d="M4.4 1.9v2.9h2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            )}
          </div>
          <Steps
            levels={levels}
            at={shown}
            def={model.defaultEffort}
            label={t("newtask.effort")}
            valueText={isDefault ? spoken(A.L, shownWord, t("newtask.effort.default")) : shownWord}
            onMove={(k, now) => {
              setPend(k);
              clearTimeout(settle.current);
              if (now) commit(k);
              else settle.current = setTimeout(() => commit(k), SETTLE_MS);
            }}
          />
          <div class="tp-ends" aria-hidden="true">
            <span>{effortWord(A.L, levels[0]!)}</span>
            <span>{effortWord(A.L, levels[levels.length - 1]!)}</span>
          </div>
          <button type="button" class="tp-model" aria-label={spoken(A.L, t("tune.change.model"), model.label)} onClick={() => (commit(pendRef.current), setView("models"))}>
            <small>{t("newtask.model")}</small>
            <span class="w">{model.label}</span>
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path d="M3.5 2 6.5 5l-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <div class="tp-list-head">
            {levels.length ? (
              <button type="button" class="tp-back" aria-label={t("tune.back")} title={t("tune.back")} onClick={() => setView("effort")}>
                <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                  <path d="M6.5 2 3.5 5l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            ) : null}
            <small>{t("newtask.model")}</small>
          </div>
          <div class="tp-list" role="menu" aria-label={t("newtask.model")}>
            {models.map((m) => {
              const on = m.id === model.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  class={on ? "on" : ""}
                  tabIndex={-1}
                  onClick={() => {
                    if (!on) pick(m.id, undefined, t("tune.next.model", m.label));
                    p.onClose(true);
                  }}
                >
                  <span class="w">{m.label}</span>
                  {on && (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
      {p.said && (
        <p class="tp-said" role="status">
          {p.said}
        </p>
      )}
    </div>
  );
}

/** The stepped control: a sunk clay groove with a dot per level, filled to the thumb, a raised clay
 *  thumb. A real slider: ← → ↑ ↓ Home End move it (it switches once the keys rest), a drag or a tap
 *  on the groove moves it and switches on release; its value is spoken as the level's word. */
function Steps(p: { levels: string[]; at: number; def?: string | undefined; label: string; valueText: string; onMove: (k: number, now: boolean) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const n = p.levels.length;
  const f = p.at < 0 || n <= 1 ? 0 : p.at / (n - 1);
  const at = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const pad = 12; // the thumb's half width: the dots span the track less it
    return stepAt(e.clientX - r.left - pad, r.width - 2 * pad, n);
  };
  return (
    <div
      ref={track}
      class={`tp-steps${p.at < 0 ? " none" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={p.label}
      aria-valuemin={0}
      aria-valuemax={n - 1}
      {...(p.at >= 0 ? { "aria-valuenow": p.at } : {})}
      aria-valuetext={p.valueText}
      style={{ "--f": f }}
      onKeyDown={(e) => {
        if (e.key === "Enter") return e.preventDefault(), p.at >= 0 && p.onMove(p.at, true);
        const k = stepKey(e.key, p.at, n);
        if (k === undefined) return;
        e.preventDefault();
        if (k !== p.at) p.onMove(k, false);
      }}
      onPointerDown={(e) => {
        drag.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        p.onMove(at(e), false);
      }}
      onPointerMove={(e) => drag.current && p.onMove(at(e), false)}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = false;
        p.onMove(at(e), true);
      }}
      onPointerCancel={() => (drag.current = false)}
    >
      <span class="groove" aria-hidden="true">
        <span class="fill" />
        {p.levels.map((lv, k) => (
          <span key={lv} class={`dot${k <= p.at ? " in" : ""}${lv === p.def ? " def" : ""}`} style={{ "--k": n <= 1 ? 0 : k / (n - 1) }} />
        ))}
      </span>
      <span class="thumb" aria-hidden="true" />
    </div>
  );
}
