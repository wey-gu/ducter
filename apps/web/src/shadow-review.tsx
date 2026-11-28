// D674 (research/247 Brief B): the shadow gets a verdict.
//   - ShadowLine: once a week, one quiet link at the morning note's foot (D482's row, beside 替你做过的
//     and 这周记下的): 这周我注意到 {n} 处没跟你说 / {n} things I noticed this week and didn't say. It
//     fades at the next morning; never in the notification, never needs-you.
//   - ShadowSheet: 我注意到、没说的 / Noticed, not said: each thing the week's passes noticed, with what
//     it would have said, the facts it joined (where each was read, its header, who it came from) and
//     when; the person answers 应该早说 / 不该说, or 这类以后都别标. Nothing is sent from here; the
//     home keeps each verdict once and decides from them alone what Ducter may say next time.
// A sheet like 这周记下的 (recall.tsx): a centred panel when wide, the whole screen on a phone.
// The Mac's: apps/desktop/internal/views/shadow.go.
import type { ServerFrame, ShadowItem, ShadowReview } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Facts } from "./controls.tsx";
import { day } from "./format.ts";
import { Check } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
type Result = Extract<ServerFrame, { t: "shadow_review_result" }>;
type Answer = "yes" | "no" | "stop";

/** What the sheet holds between renders. */
export const SR = {
  review: undefined as ShadowReview | undefined,
  error: "",
  /** Items whose verdict the person reopened with 改 / Change. */
  changing: new Set<string>(),
  /** The answer each item got here, until the home's list says it too. */
  got: new Map<string, Answer>(),
};

/** Opens the review (the morning note's line). */
export function openShadowReview() {
  SR.review = undefined;
  SR.error = "";
  SR.changing.clear();
  SR.got.clear();
  A.sheet = { kind: "shadow" };
  A.send({ t: "shadow_review" });
  A.changed();
}

/** shadow_review_result from the home (app.ts hands it here). */
export function onShadowFrame(f: Result) {
  // While the sheet is open its rows keep their places: an answered row never jumps away.
  const was = new Map((SR.review?.items ?? []).map((x, n) => [x.id, n]));
  if (f.review) (SR.review = { ...f.review, items: [...f.review.items].sort((a, b) => (was.get(a.id) ?? 1e9) - (was.get(b.id) ?? 1e9)) }), (SR.error = "");
  else SR.error = f.error ?? "failed";
  A.changed();
}

// app.ts is still building its one A as this file loads (views.tsx imports it).
queueMicrotask(() => {
  A.onShadowFrame = onShadowFrame;
});

function answer(i: ShadowItem, a: Answer) {
  SR.got.set(i.id, a);
  SR.changing.delete(i.id);
  A.send({ t: "shadow_label", findingId: i.id, verdict: a });
  A.changed();
}

/** The line at the note's foot, while it hasn't faded. */
export function ShadowLine({ count, until }: { count: number; until: string }) {
  if (!(Date.parse(until) > Date.now())) return null;
  return <Btn kind="text" size="sm" chev class="shadow-open" label={count === 1 ? t("shadow.link.one") : t("shadow.link", String(count))} onClick={openShadowReview} />;
}

/** The answer that shows on a row: given here just now, else the home's. */
function settled(i: ShadowItem): Answer | "stopped" | undefined {
  const here = SR.got.get(i.id);
  if (here) return here;
  if (i.verdict === "no" && i.stopped) return "stop";
  if (i.verdict) return i.verdict;
  // Another row's 这类以后都别标 stopped this one's kind.
  const stoppedHere = [...SR.got.entries()].some(([id, a]) => a === "stop" && SR.review?.items.find((x) => x.id === id)?.sort === i.sort);
  return i.stopped || stoppedHere ? "stopped" : undefined;
}

function ShadowRow({ i }: { i: ShadowItem }) {
  const s = SR.changing.has(i.id) ? undefined : settled(i);
  return (
    <div class={`shadow-row${s ? " settled" : ""}`}>
      <p class="shadow-t" dir="auto">
        {i.text}
      </p>
      {i.next && !s && (
        <p class="shadow-next" dir="auto">
          {t("shadow.next", i.next)}
        </p>
      )}
      {i.facts.length > 0 && (
        <ul class="shadow-facts">
          {i.facts.map((f) => (
            <li key={f.id} class="shadow-fact">
              <span class="shadow-src">{t(`find.src.${f.src}`)}</span>
              <Facts class="shadow-fact-words" items={[<span dir="auto">{f.label}</span>, f.from && <span dir="auto">{f.from}</span>]} />
            </li>
          ))}
        </ul>
      )}
      <div class="shadow-foot">
        <Facts class="shadow-when" items={[day(A.L, i.at), i.said && t("shadow.said")]} />
        {s ? (
          <div class="shadow-acts done">
            <span class="shadow-got" role="status">
              <Check />
              {t(s === "stopped" ? "shadow.stopped" : `shadow.got.${s}`)}
            </span>
            {s !== "stopped" && <Btn kind="text" size="sm" label={t("shadow.change")} about={i.text} onClick={() => (SR.changing.add(i.id), A.changed())} />}
          </div>
        ) : (
          <div class="shadow-acts">
            {/* Read order: the answer first; wide, the row runs right to left (app.css). */}
            <Btn kind="secondary" size="sm" label={t("shadow.yes")} about={i.text} onClick={() => answer(i, "yes")} />
            <Btn kind="text" size="sm" label={t("shadow.no")} about={i.text} onClick={() => answer(i, "no")} />
            <Btn kind="text" size="sm" class="shadow-stop" label={t("shadow.stop")} about={i.text} onClick={() => answer(i, "stop")} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 我注意到、没说的 / Noticed, not said. */
export function ShadowSheet() {
  const panel = useRef<HTMLDivElement>(null);
  const close = () => ((A.sheet = null), A.changed());
  useEffect(() => panel.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const r = SR.review;
  return (
    <>
      <div class="scrim" onClick={close} />
      <div ref={panel} tabIndex={-1} class="learned-sheet shadow-sheet" role="dialog" aria-modal="true" aria-label={t("shadow.title")}>
        <div class="past-head">
          <h2>{t("shadow.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        <p class="learned-lede">{t("shadow.lede")}</p>
        <div class="learned-list shadow-list">
          {!r && !SR.error && (
            <p class="past-none" role="status">
              <span class="spin sm" aria-hidden="true" />
              {t("shadow.loading")}
            </p>
          )}
          {!r && SR.error && (
            <div class="past-none shadow-error" role="alert">
              <p>{t("shadow.error")}</p>
              <Btn kind="secondary" size="sm" label={t("shadow.retry")} onClick={openShadowReview} />
            </div>
          )}
          {r && !r.items.length && <p class="past-none">{t("shadow.none")}</p>}
          {r?.items.map((i) => (
            <ShadowRow key={i.id} i={i} />
          ))}
        </div>
      </div>
    </>
  );
}
