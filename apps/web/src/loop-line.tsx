// D544: a task that keeps going on its own (a Keep's rounds, a task in rounds) keeps who it is while
// its long transcript is read. Its head says it at the top; once the head is out of view (and a
// task in rounds opens at its end, so it is out at once), a slim line under the bar holds what the
// person needs at a glance while reading round 302's words: that it is a Keep (its lantern and
// 看守中), when the next round comes or that one runs now (live), and which round this is. Each fact
// its own element (D291). A tap opens the Keep's page, where every round and its rules are; a task in
// rounds without a Keep goes back to its head. Ordinary tasks get nothing.
import { useEffect, useState } from "preact/hooks";
import type { RefObject } from "preact";
import { A } from "./app.ts";
import { K, keepFacts, KeepMark, keepBeatWords, keepOfTask, openKeep } from "./keep.tsx";
import { rhythm, RepeatGlyph } from "./past.tsx";
import { spoken } from "./format.ts";
import { FactPill } from "./controls.tsx";
import { soon } from "./onhand.tsx";
import type { Task } from "./store.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** What the line says for a task, or nothing for an ordinary one. */
export function loopFacts(task: Task, now = Date.now()): { keep?: string; words: string[]; round?: number; needs?: string } | undefined {
  const keepId = keepOfTask(task.id);
  const sheet = keepId ? (A.S.onHand?.keeps ?? []).find((k) => k.id === keepId) : undefined;
  if (sheet) {
    const page = K.pages.get(sheet.id);
    const beat = keepBeatWords(sheet, now);
    // What waits for the person, in the needs ink, before when it wakes next (keepFacts' own words).
    const needs = keepFacts(sheet).find((x) => x.tone === "needs")?.text;
    return { keep: sheet.id, words: [t("keep.section"), ...(beat ? [beat] : [])], ...(page?.rounds.length ? { round: page.rounds.length } : {}), ...(needs ? { needs } : {}) };
  }
  const r = task.card?.rounds;
  if (!r) return;
  const words = [r.everyMs ? t("og.round.every", rhythm(r.everyMs)) : "", r.paused ? t("keep.beat.paused") : r.nextAt ? t("keep.beat.next", soon(r.nextAt, now)) : t("keep.beat.running")].filter(Boolean);
  return { words };
}

/** Whether the task's head is out of view in its scroller (or not drawn at all: a long task's
 *  window starts far below it). */
function useHeadGone(scroller: RefObject<HTMLElement>, id: string): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => {
      const head = el.querySelector(".task-head");
      if (!head) return setGone(true);
      const h = head.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      setGone(h.bottom < s.top + 8);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(check) : undefined;
    ro?.observe(el);
    return () => (el.removeEventListener("scroll", check), ro?.disconnect());
  }, [id, scroller.current]);
  return gone;
}

export function LoopLine({ task, scroller }: { task: Task; scroller: RefObject<HTMLElement> }) {
  const [, tick] = useState(0);
  // The next round's time and whether one runs, kept current while it stands here.
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(h);
  }, []);
  const f = loopFacts(task);
  const gone = useHeadGone(scroller, task.id);
  // Which round this is comes from the Keep's page: asked once.
  useEffect(() => {
    if (f?.keep && !K.pages.has(f.keep) && A.S.welcomed) A.send({ t: "keep", id: f.keep });
  }, [f?.keep, A.S.welcomed]);
  if (!f) return null;
  const sheet = f.keep ? (A.S.onHand?.keeps ?? []).find((k) => k.id === f.keep) : undefined;
  const round = f.round ? t("loop.round", f.round) : "";
  const words = [...f.words, ...(round ? [round] : [])];
  const said = f.needs ? [words[0]!, f.needs, ...words.slice(1)] : words;
  const open = () => (f.keep ? openKeep(f.keep) : scroller.current?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  return (
    <div class="loop-dock">
      <FactPill
        on={gone}
        onClick={open}
        label={spoken(A.L, ...said, f.keep ? t("keep.open", sheet?.title ?? "") : t("loop.top"))}
        mark={sheet ? <KeepMark life={sheet.life} size={20} /> : <RepeatGlyph task={false} />}
        facts={said.map((w, i) => ({ text: w, lead: i === 0, needs: w === f.needs }))}
      />
    </div>
  );
}
