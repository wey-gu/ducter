// D456 (design/sessions.md "Keys"): every key in one place, and the opened task's place among what
// is on hand. 键盘 / Keyboard (⌘/) lists the keys by where they work; the task's header carries
// 3 / 9 with the steps to the task before and after (⌘⇧[ ⌘⇧]); ⌃1–⌃9 open the nth (onhand.tsx).
// The Mac draws the same list from the same rows (apps/desktop/internal/views/keymap.go).
import { useEffect } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { walk, walkOrder } from "./onhand.tsx";
import { SheetFrame } from "./sheet-frame.tsx";
import { useSheetMotion } from "./sheetmotion.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The keys by where they work: [group, [words, keys][]]. "enter" is the Return key, drawn. */
export const KEYMAP: [string, [string, string][]][] = [
  [
    "keys.g.any",
    [
      ["keys.find", "⌘K"],
      ["keys.new", "⌘N"],
      ["keys.conv", "⌘1"],
      ["keys.onhand", "⌘2"],
      ["keys.devices", "⌘3"],
      ["keys.past", "⌘Y"],
      ["keys.settings", "⌘,"],
      ["keys.nth", "⌃1–⌃9"],
      ["keys.up", "esc"],
      ["keys.this", "⌘/"],
    ],
  ],
  [
    "keys.g.task",
    [
      ["keys.walk", "⌘⇧[ ⌘⇧]"],
      ["keys.bench", "⌥⌘B"],
    ],
  ],
  [
    "keys.g.find",
    [
      ["keys.rows", "⌃N ⌃P"],
      ["keys.open", "enter"],
      ["keys.continue", "⌘enter"],
      ["keys.redo", "⌥enter"],
      ["keys.seed", "⇧⌘enter"],
    ],
  ],
];

/** ⌘/ (Ctrl+/ elsewhere) shows or hides the list, from anywhere. */
export function keysKey(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.code !== "Slash" || A.live) return;
  if (A.sheet && A.sheet.kind !== "keys") return;
  e.preventDefault();
  A.sheet = A.sheet?.kind === "keys" ? null : { kind: "keys" };
  A.changed();
}

/** A key or keys as the keyboard shows them; Return drawn (D211: no symbol that may turn emoji). */
export function Keys({ keys }: { keys: string }) {
  return (
    <span class="keys-caps">
      {keys.split(" ").map((k) => {
        const ret = k.endsWith("enter");
        const mods = ret ? k.slice(0, -5) : k;
        return (
          <kbd key={k}>
            {mods}
            {ret && (
              <svg class="k-ret" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M10 2.5v4H3M5 4.5 3 6.5l2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            )}
          </kbd>
        );
      })}
    </span>
  );
}

export function KeysSheet() {
  const { sheet, body, scrim, close } = useSheetMotion(() => ((A.sheet = null), A.changed()));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, []);
  return (
    <SheetFrame label={t("keys.title")} class="keys-sheet" frame={sheet} body={body} scrim={scrim} onScrim={close}>
      <h2>{t("keys.title")}</h2>
      {KEYMAP.map(([g, rows]) => (
        <section key={g} class="keys-group">
          <h3>{t(g)}</h3>
          <ul>
            {rows.map(([w, k]) => (
              <li key={w}>
                <span>{t(w)}</span>
                <Keys keys={k} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p class="keys-note">{t("keys.loose")}</p>
      <Btn kind="secondary" class="sheet-close" label={t("sheet.close")} onClick={close} />
    </SheetFrame>
  );
}

/** The opened task's place among what is on hand, and the steps to the one before and after. */
export function TaskNav({ id }: { id: string }) {
  const o = walkOrder(id);
  const i = o.indexOf(id);
  if (i < 0 || o.length < 2) return null;
  return (
    <span class="tv-nav" role="group" aria-label={t("tv.pos", i + 1, o.length)}>
      <button class="tv-step" disabled={i === 0} aria-label={t("tv.prev")} title={`${t("tv.prev")} (⌘⇧[)`} onClick={() => walk(-1)}>
        <StepMark by={-1} />
      </button>
      <span class="tv-pos" aria-hidden="true">
        <b>{i + 1}</b>
        <span>/</span>
        <span>{o.length}</span>
      </span>
      <button class="tv-step" disabled={i === o.length - 1} aria-label={t("tv.next")} title={`${t("tv.next")} (⌘⇧])`} onClick={() => walk(1)}>
        <StepMark by={1} />
      </button>
    </span>
  );
}

/** The step's own drawn chevron (a font's or a shared glyph's would turn with its context). */
const StepMark = ({ by }: { by: 1 | -1 }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d={by > 0 ? "M4.5 2.5 8 6l-3.5 3.5" : "M7.5 2.5 4 6l3.5 3.5"} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
