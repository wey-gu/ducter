// D353: the opened task's model and effort under its composer, always in sight while it can be
// switched: the model in plain words and 思考：低 / Effort: Low, each a quiet chip opening a short
// menu anchored to it (the agent's live models, D352; that model's levels, its default marked). A
// choice is D282's in-place switch: the running turn finishes as it was, the next one uses the new
// setting, said once in a quiet line. Switching the agent itself stays in 换谁来做. The Mac's
// composerTune (apps/desktop/internal/views/composertune.go).
import type { ModelChoice } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A, effortWord } from "./app.ts";
import { inPlaceTune, spoken } from "./format.ts";
import { attention, effortOf, harnessOf, modelOf, placeOf, type Task } from "./store.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** How long 下一轮起用 {model} / From its next turn… stays. */
export const SAID_MS = 8000;
/** What was said after the last choice, per task: kept here so it outlives a re-render. */
const said = new Map<string, { text: string; at: number }>();

/** The task can still move: not dropped or replaced, and someone is doing it (换谁来做's rule). */
export const tunable = (task: Task) => !!harnessOf(task) && !["dropped", "superseded"].includes(attention(task));

/** The chips' content, or undefined when there is nothing to switch in place (no live list). */
export function composerTune(task: Task): { models: ModelChoice[]; model: ModelChoice; effort: string } | undefined {
  if (!tunable(task)) return undefined;
  const device = (placeOf(task) as { device?: string }).device;
  const tu = inPlaceTune(A.newTaskOptions?.models ?? [], harnessOf(task), device, modelOf(task), effortOf(task));
  return tu?.model ? { models: tu.models, model: tu.model, effort: tu.effort } : undefined;
}

export function ComposerTune({ task }: { task: Task }) {
  const [open, setOpen] = useState<"" | "model" | "effort">("");
  const [, tick] = useState(0);
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
  const h = harnessOf(task);
  const pick = (m: string, e: string | undefined, words: string) => {
    said.set(task.id, { text: words, at: Date.now() });
    setOpen("");
    A.retuneTask(task.id, h, m, e);
  };
  const eWord = effort ? effortWord(A.L, effort) : t("newtask.effort.default");
  return (
    <span class="ctune">
      <TuneMenu
        id="model"
        open={open === "model"}
        setOpen={(o) => setOpen(o ? "model" : "")}
        about={spoken(A.L, t("newtask.model"), model.label)}
        words={model.label}
        title={t("newtask.model")}
        items={models.map((m) => ({ key: m.id, label: m.label, on: m.id === model.id }))}
        onPick={(id) => {
          const m = models.find((x) => x.id === id);
          if (m && m.id !== model.id) pick(m.id, undefined, t("tune.next.model", m.label));
        }}
      />
      {model.efforts?.length ? (
        <TuneMenu
          id="effort"
          open={open === "effort"}
          setOpen={(o) => setOpen(o ? "effort" : "")}
          about={spoken(A.L, t("newtask.effort"), eWord)}
          words={t("tune.effort", eWord)}
          title={t("newtask.effort")}
          items={model.efforts.map((e) => ({ key: e, label: effortWord(A.L, e), on: e === effort, tag: e === model.defaultEffort ? t("newtask.effort.default") : undefined }))}
          onPick={(e) => e !== effort && pick(model.id, e, t("tune.next.effort", effortWord(A.L, e)))}
        />
      ) : null}
      {s && left > 0 && (
        <span class="ctune-said" role="status">
          {s.text}
        </span>
      )}
    </span>
  );
}

type Item = { key: string; label: string; on: boolean; tag?: string | undefined };

/** One chip and its menu, over it (the composer is at the bottom): Tab reaches the chip; Enter,
 *  Space or ↓ opens it on the chosen row; ↑ ↓ Home End move; Enter picks; Esc or Tab closes,
 *  the focus back on the chip. */
function TuneMenu(p: { id: string; open: boolean; setOpen: (o: boolean) => void; about: string; words: string; title: string; items: Item[]; onPick: (key: string) => void }) {
  const chip = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.open) return;
    const rows = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    (rows().find((r) => r.getAttribute("aria-checked") === "true") ?? rows()[0])?.focus();
    const away = (e: Event) => !(e.target as Element)?.closest?.(`.ctune-m-${p.id}`) && p.setOpen(false);
    addEventListener("pointerdown", away, true);
    return () => removeEventListener("pointerdown", away, true);
  }, [p.open]);
  const keys = (e: KeyboardEvent) => {
    const rows = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => (e.preventDefault(), rows[(n + rows.length) % rows.length]?.focus());
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(rows.length - 1);
    else if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), p.setOpen(false), chip.current?.focus();
    else if (e.key === "Tab") p.setOpen(false);
  };
  return (
    <span class={`ctune-m ctune-m-${p.id}`}>
      <button
        ref={chip}
        type="button"
        class={`ctune-chip${p.open ? " open" : ""}`}
        aria-label={p.about}
        aria-haspopup="menu"
        aria-expanded={p.open}
        onClick={() => p.setOpen(!p.open)}
        onKeyDown={(e) => e.key === "ArrowDown" && !p.open && (e.preventDefault(), p.setOpen(true))}
      >
        <span class="w">{p.words}</span>
        <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
          <path d="M2 3.5 5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {p.open && (
        <div class="ctune-menu" role="menu" aria-label={p.title} ref={menu} onKeyDown={keys}>
          <small aria-hidden="true">{p.title}</small>
          {p.items.map((it) => (
            <button key={it.key} type="button" role="menuitemradio" aria-checked={it.on} class={it.on ? "on" : ""} tabIndex={-1} onClick={() => (it.on ? (p.setOpen(false), chip.current?.focus()) : p.onPick(it.key))}>
              <span class="w">{it.label}</span>
              {it.tag && <small class="tag">{it.tag}</small>}
              {it.on && (
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
