// D425: the waiting line, alive. One small line where the reply will land: the clay partner acting
// out the step it is on (a loop of its own per step, packages/protocol/src/alive.ts), and one
// present-tense line in the person's terms that changes with a short cross-fade and a 3-px rise,
// never faster than the dwell. The figure is a slot, so any row that waits uses the same line: a
// task at work with its agent's coin, one of several asks under a message with its own words.
//
// Motion is CSS only (transform and opacity on one layer, `--t-alive-*` and `--ease` tokens), so
// a phone keeps 60 fps and the main thread does nothing between steps. It pauses while the page is
// hidden and after REST_MS with no input from the person; under reduced motion the figure holds
// the step's pose and the words only cross-fade.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ALIVE, aliveCadence, type AliveMotion } from "@ducter/protocol/src/alive.ts";

/** Whether the person has done anything lately (pointer, key, touch, scroll) and the page shows. */
let lastInput = Date.now();
const resting = new Set<() => void>();
if (typeof window !== "undefined") {
  const poke = () => {
    const was = Date.now() - lastInput >= ALIVE.REST_MS;
    lastInput = Date.now();
    if (was) for (const f of resting) f();
  };
  for (const e of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) addEventListener(e, poke, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poke();
    for (const f of resting) f();
  });
}

/** True while the figure should hold still: the page hidden, or no input for REST_MS. */
export function useResting(): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    resting.add(f);
    // Look again when the rest would begin.
    const h = setTimeout(f, Math.max(0, lastInput + ALIVE.REST_MS - Date.now()) + 50);
    return () => {
      resting.delete(f);
      clearTimeout(h);
    };
  });
  return (typeof document !== "undefined" && document.hidden) || Date.now() - lastInput >= ALIVE.REST_MS;
}

/** The line shown, held at least DWELL_MS before a newer one replaces it (only the newest waits). */
export function useDwell(wanted: string): string {
  const shown = useRef<{ line?: string; at: number }>({ at: 0 });
  const [, bump] = useState(0);
  const now = Date.now();
  const c = aliveCadence(shown.current.line, shown.current.at, wanted, now);
  if (c.changed) shown.current = { line: c.line, at: now };
  useEffect(() => {
    if (!c.waitMs) return;
    const h = setTimeout(() => bump((n) => n + 1), c.waitMs + 10);
    return () => clearTimeout(h);
  }, [wanted, c.waitMs]);
  return c.line;
}

/**
 * One alive line: `figure` (the clay partner, a coin, a small mark) moving by `motion`, the words
 * (dwelled), and an optional second, smaller line. `size` is the figure's box; 32 in the
 * conversation, 20–22 in a row.
 */
export function AliveLine({ figure, motion, words, sub, size = 32, class: cls }: { figure: ComponentChildren; motion: AliveMotion; words: string; sub?: string; size?: number; class?: string }) {
  const line = useDwell(words);
  const rest = useResting();
  const m = rest ? "still" : motion;
  // The words' entrance plays once per new line (keyed: a remount), never on its own.
  return (
    <div class={`alive${cls ? ` ${cls}` : ""}`} role="status" aria-live="polite" style={{ "--alive-size": `${size}px` }}>
      <span class="alive-fig" data-motion={m} aria-hidden="true">
        {figure}
      </span>
      <span class="alive-words">
        <span key={line} class="aw say">
          {line}
        </span>
        {sub && (
          <span key={sub} class="sub say">
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}
