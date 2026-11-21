// D451: 第一次 / The first time. One line under a thing the person meets for the first time and
// can't read from the thing itself, in the partner's own words, led by its small clay face (still:
// it is not a chat). Never a tour, a modal, a pill or a button: the line is read, then it is met.
//
// Once: the first such thing on the screen claims the line for this page's life (so it never
// vanishes under the reader's eyes, and never shows twice on one screen); after it has been in
// view for a moment it is met on the home (Settings' `met`), so no other device shows it again.
// A home too old to keep `met` shows none.
import { useEffect, useRef } from "preact/hooks";
import { firstMeetDue, type FirstMeet } from "@ducter/protocol";
import { A } from "./app.ts";

// The face is drawn here (not views.tsx's Avatar): doc-line.tsx loads early, and views.tsx with it
// would run ambient.tsx before the app exists.
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** How long the line must be on screen before it counts as read. */
export const SEEN_MS = 1500;

/** The thing that claimed each line on this page, by its key. */
const owner = new Map<FirstMeet, string>();
/** Lines sent as met from this page (the home's frame may still be on its way). */
const sent = new Set<FirstMeet>();

/** Whether this thing carries the first-time line: the first one shown while the moment isn't met. */
export function firstMeetHere(name: FirstMeet, key: string): boolean {
  const o = owner.get(name);
  if (o !== undefined) return o === key;
  if (sent.has(name) || !firstMeetDue(A.settings?.met, name)) return false;
  owner.set(name, key);
  return true;
}

/** Marks the line met on the home (once per page). */
export function meet(name: FirstMeet) {
  if (sent.has(name)) return;
  sent.add(name);
  A.send({ t: "settings_set", patch: { met: [name] } });
}

/** For tests: forget what this page claimed. */
export function resetFirstMeet() {
  owner.clear();
  sent.clear();
}

/**
 * The line itself. `name` picks the words (`first.<name>`, with the partner's name for %s);
 * `key` names the thing it sits under (a task id, a message seq), so only the first one carries it.
 */
export function FirstMeetLine({ name, at }: { name: FirstMeet; at: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const show = firstMeetHere(name, at);
  useEffect(() => {
    const el = ref.current;
    if (!show || !el || sent.has(name)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = () => (timer ??= setTimeout(() => meet(name), SEEN_MS));
    if (typeof IntersectionObserver !== "function") return seen(), () => clearTimeout(timer);
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) seen();
      else clearTimeout(timer), (timer = undefined);
    });
    io.observe(el);
    return () => (io.disconnect(), clearTimeout(timer));
  }, [show, name]);
  if (!show) return null;
  return (
    <p ref={ref} class="first-meet" data-first={name}>
      <span class="avatar fm-face" style={{ width: 18, height: 18 }} aria-hidden="true"><img class="on" src="app/art/idle.webp" alt="" draggable={false} /></span>
      <span dir="auto">{t(`first.${name}`)}</span>
    </p>
  );
}
