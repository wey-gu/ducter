// Work over time on the phone (D112–D115): what a wait waits for (a small clay thing in a
// bubble), the try strip of a keep-going loop, the routine shelf and a routine's proposal card,
// and the waiting part of an opened task. Copy comes only from i18n.ts.
import type { Bodies, CheckSpec, RoutineView, UntilView, WaiterView } from "@ducter/protocol";
import { describeCheck, describePredicate } from "@ducter/protocol/src/checks.ts";
import { A } from "./app.ts";
import { when } from "./format.ts";
import type { Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Which clay thing a wait shows: a PR, a cloud (CI, anything online), an envelope, a clock, a file. */
export function glyphOf(w: Pick<WaiterView, "check" | "event" | "at" | "kind"> | undefined): "wait_pr" | "wait_ci" | "wait_mail" | "wait_clock" | "wait_file" {
  if (!w) return "wait_ci";
  if (w.event) return w.event.service === "gmail" || /mail|message/.test(w.event.trigger) ? "wait_mail" : "wait_ci";
  const argv = w.check?.argv ?? [];
  if (!argv.length) return "wait_clock";
  const cmd = argv[0]!.split("/").pop();
  if (cmd === "gh" && argv[1] === "pr" && argv[2] !== "checks") return "wait_pr";
  if (["test", "stat", "ls", "cat", "head", "tail", "wc", "grep"].includes(cmd ?? "")) return "wait_file";
  return "wait_ci";
}

/** The bubble with what it waits for. Still: it never moves on its own (D77). */
export function WaitBubble({ w, size = "sm" }: { w?: Pick<WaiterView, "check" | "event" | "at" | "kind">; size?: "sm" | "lg" }) {
  return (
    <span class={`wait-bub ${size}`} aria-hidden="true">
      <img src={`app/art/${glyphOf(w)}.webp`} alt="" draggable={false} />
    </span>
  );
}

/** A try's mark: ✓ it holds, → better, × not yet (in the failed ink only when worse). */
export const beadMark = (v: Bodies["until_try"]["verdict"]) => (v === "met" ? "✓" : v === "better" ? "→" : "×");

const minutes = (ms?: number) => Math.max(1, Math.round((ms ?? 0) / 60_000));

/** "每 5 分钟看一次 · 上次 11:40 · 最多等到今天 18:00" / "Looks every 5 min · last 11:40 · until today 18:00". */
export function waitCadence(w: WaiterView): string {
  const parts: string[] = [];
  if (w.event) parts.push(t("wait.each_new"));
  else if (w.check) parts.push(t("wait.every", minutes(w.everyMs)));
  else if (w.at) parts.push(t("waiter.at", when(A.L, w.at)));
  if (w.lastLookAt) parts.push(t("wait.last", when(A.L, w.lastLookAt)));
  if (w.until) parts.push(t("wait.until", when(A.L, w.until)));
  return parts.join(" · ");
}

/** The try strip: one small pebble per try (✓ met, × worse or no way forward, → better), the
 *  current try hollow, then "第 n 次 · 最多 20". */
export function Beads({ u, big }: { u: UntilView; big?: boolean }) {
  const running = u.state === "on";
  const mark = beadMark;
  return (
    <span class={`beads${big ? " big" : ""}`} role="img" aria-label={t("until.tries", u.tries.length + (running ? 1 : 0), u.maxTries)}>
      {u.tries.map((x) => (
        <i key={x.n} class={`bd v-${x.verdict}`}>{mark(x.verdict)}</i>
      ))}
      {running && <i class="bd cur" />}
    </span>
  );
}

export function untilLine(u: UntilView): string {
  const n = u.tries.length + (u.state === "on" ? 1 : 0);
  const last = u.tries.at(-1);
  if (u.state === "met") return t("until.met", u.tries.length);
  if (u.state === "stopped") return t(`until.stop.${u.stop ?? "max"}`, u.tries.length);
  return [t("until.try", n, u.maxTries), last ? t("until.last", last.summary) : ""].filter(Boolean).join(" · ");
}

/** The try strip in an opened task, each try with its own words under it. */
export function TryStrip({ task }: { task: Task }) {
  const u = A.S.untilOf(task);
  if (!u) return null;
  return (
    <section class="section">
      <h2 class="sec-title">{t("until.title", u.condition)}</h2>
      <div class="trystrip" role="list">
        {u.tries.map((x) => (
          <div class={`try v-${x.verdict}`} role="listitem" key={x.n}>
            <i class={`bd v-${x.verdict}`}>{beadMark(x.verdict)}</i>
            <b>{t("until.n", x.n)}</b>
            <span>{x.summary}</span>
          </div>
        ))}
        {u.state === "on" && (
          <div class="try" role="listitem">
            <i class="bd cur" />
            <b>{t("until.n", u.tries.length + 1)}</b>
            <span>{t("until.now")}</span>
          </div>
        )}
      </div>
      <div class="kv">
        <span class="k">{t("until.used")}</span>
        <span class="v">{t("until.used.v", u.tries.length, u.maxTries)}</span>
        <span class="k">{t("until.judge")}</span>
        <span class="v">{u.check ? t("until.judge.check") : t("until.judge.model")}</span>
        <span class="k">{t("until.stops")}</span>
        <span class="v">{t("until.stops.v", u.maxTries)}</span>
      </div>
      {u.state === "on" && (
        <div class="btns">
          <button class="btn text" onClick={() => A.untilAction(task.id)}>{t("until.stop")}</button>
        </div>
      )}
    </section>
  );
}

function CheckLine({ spec }: { spec: CheckSpec }) {
  return (
    <>
      <code class="check">{describeCheck(spec)}</code>
      <span class="sub">{t("wait.met_when", describePredicate(spec.succeedWhen))}</span>
    </>
  );
}

/** An opened task that waits: what it waits for in words, and in Details the check itself and
 *  what it saw. */
export function WaitDetails({ task }: { task: Task }) {
  const w = A.S.waiterFor(task.id);
  if (!w || (!w.check && !w.event)) return null;
  const looks = A.S.looksOf(task);
  return (
    <section class="section">
      <h2 class="sec-title">{t("wait.details")}</h2>
      <div class="kv">
        <span class="k">{t("wait.for")}</span>
        <span class="v">{w.reason}</span>
        <span class="k">{t("wait.how")}</span>
        <span class="v">{w.check ? <CheckLine spec={w.check} /> : t("wait.event", w.event!.connection, w.event!.trigger)}{w.judge && <span class="sub">{t("wait.judge", w.judge)}</span>}</span>
        <span class="k">{t("wait.often")}</span>
        <span class="v">{waitCadence(w)}</span>
        {looks.length > 0 && (
          <>
            <span class="k">{t("wait.looks")}</span>
            <span class="v">
              <details>
                <summary>{t("wait.looks.v", w.looks ?? looks.length, looks.length)}</summary>
                <ol>
                  {looks.slice(-8).map((l, i) => (
                    <li key={i}>{l.summary}</li>
                  ))}
                </ol>
              </details>
            </span>
          </>
        )}
      </div>
      <div class="btns">
        <button class="btn text" onClick={() => A.waiterAction(w.waiterId, "cancel")}>{t("wait.cancel")}</button>
        <button class="btn secondary" onClick={() => A.waiterAction(w.waiterId, "look")}>{t("wait.look")}</button>
      </div>
    </section>
  );
}

/** One routine on the shelf: its trigger in words, the next firing, the latest run. */
export function RoutineRow({ r }: { r: RoutineView }) {
  const time = r.trigger.kind === "time";
  const paused = r.state === "paused";
  const lines = [r.triggerWords];
  if (paused) lines.push(t(`routine.paused.${r.pauseReason ?? "asked"}`));
  else if (r.running) lines.push(t("routine.running"));
  else if (r.nextAt) lines.push(t("routine.next", when(A.L, r.nextAt)));
  if (r.lastRun) lines.push(t(`routine.last.${r.lastRun.state}`, when(A.L, r.lastRun.at)));
  return (
    <div class={`row routine${paused ? " paused" : ""}`}>
      {time ? (
        <span class="clockface" aria-hidden="true">
          <img src="app/art/wait_clock.webp" alt="" draggable={false} />
          <b>{(r.trigger as { time: string }).time.replace(/^0/, "")}</b>
        </span>
      ) : (
        <WaitBubble w={r.trigger.kind === "condition" ? { check: r.trigger.check, event: r.trigger.event } : undefined} />
      )}
      <span class="main">
        <span class="t">{r.name}</span>
        {lines.map((l, i) => (
          <span class="m" key={i}>{l}</span>
        ))}
      </span>
      {paused ? (
        <button class="btn secondary sm" onClick={() => A.routineAction(r.routineId, "resume")}>{t("routine.resume")}</button>
      ) : (
        <button class="btn text sm" onClick={() => A.routineAction(r.routineId, "pause")}>{t("routine.pause")}</button>
      )}
    </div>
  );
}

/** The shelf at the bottom of On hand: every routine that is on or paused. */
export function RoutineShelf() {
  const list = A.S.routines().filter((r) => r.state === "active" || r.state === "paused");
  if (!list.length) return null;
  return (
    <section class="section shelf">
      <h3>
        {t("lane.routines")} <span class="n">{list.length}</span>
      </h3>
      {list.map((r) => (
        <RoutineRow key={r.routineId} r={r} />
      ))}
    </section>
  );
}

/** A routine's proposal card body: the trigger in words with its next firings or what the
 *  condition sees now, what it does, how it reports, what it may touch, budget, review date. */
export function RoutineFacts({ routineId }: { routineId: string }) {
  const r = A.S.routine(routineId);
  if (!r) return null;
  return (
    <div class="kv routine-facts">
      <span class="k">{t("routine.when")}</span>
      <span class="v">
        {r.triggerWords}
        {r.upcoming && <span class="sub">{r.upcoming.map((x) => when(A.L, x)).join(" · ")}</span>}
        {r.dryRun && <span class="sub">{t("routine.now", r.dryRun.summary)}</span>}
      </span>
      <span class="k">{t("routine.does")}</span>
      <span class="v">{r.brief.split("\n")[0]}</span>
      <span class="k">{t("routine.reports")}</span>
      <span class="v">{t(`routine.reports.${r.reports}`)}</span>
      <span class="k">{t("routine.touch")}</span>
      <span class="v">{t(`routine.effect.${r.effect}`)}</span>
      <span class="k">{t("routine.budget")}</span>
      <span class="v">{t("routine.budget.run")} · {t("routine.budget.month")}</span>
      <span class="k">{t("routine.review")}</span>
      <span class="v">{t("routine.review.v", when(A.L, r.reviewAt))}</span>
    </div>
  );
}
