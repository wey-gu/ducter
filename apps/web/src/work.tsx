// Work over time on the phone (D112–D115): what a wait waits for (a small clay thing in a
// bubble) and its deadline groove with Ducter sitting at now; the try pebbles of a keep-going
// loop; the routine shelf and a routine's proposal card, each with one strip of beads for its
// next runs. Time is drawn; words are its quiet caption. How a wait checks (the command, how
// often, who judges) is only in the opened task, folded under How it checks. Copy: i18n.ts.
import type { Bodies, CheckSpec, RoutineView, UntilView, WaiterView } from "@ducter/protocol";
import { describeCheck, describePredicate } from "@ducter/protocol/src/checks.ts";
import { A } from "./app.ts";
import { cjkPad, clock, day, md, when } from "./format.ts";

const pad = (s: string) => cjkPad(A.L, s);
import type { Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Which clay thing a wait shows: a PR, a cloud (CI, anything online), an envelope, a clock, a file. */
export function glyphOf(w: Pick<WaiterView, "check" | "event"> | undefined): "wait_pr" | "wait_ci" | "wait_mail" | "wait_clock" | "wait_file" {
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
export function WaitBubble({ w, size = "sm" }: { w?: Pick<WaiterView, "check" | "event">; size?: "sm" | "lg" }) {
  return (
    <span class={`wait-bub ${size}`} aria-hidden="true">
      <img src={`app/art/${glyphOf(w)}.webp`} alt="" draggable={false} />
    </span>
  );
}

/** What it waits for, named as awaited: "等 PR #1592 通过" / "Waiting until PR #1592 passes". */
export function waitLine(reason: string): string {
  const r = reason.trim();
  return t("wait.line", A.L.lang === "zh" && /^[A-Za-z0-9#]/.test(r) ? ` ${r}` : r);
}

/** What a wait's card says under it, in words: its deadline, or when a timer is due. */
export function waitCaption(w: WaiterView): string {
  if (w.until) return t("wait.until.cap", pad(when(A.L, w.until)));
  if (w.at && !w.check && !w.event) return t("waiter.at", when(A.L, w.at));
  return "";
}

const frac = (from: string | undefined, to: string | undefined) => {
  const a = Date.parse(from ?? ""), b = Date.parse(to ?? "");
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return undefined;
  return Math.min(1, Math.max(0, (Date.now() - a) / (b - a)));
};

/** The deadline groove: a sunken clay groove from when it started to its deadline, the little
 *  Ducter on its bench sitting at now. Only for a wait with a deadline. */
export function Groove({ w, big }: { w: WaiterView; big?: boolean }) {
  const f = frac(w.armedAt, w.until);
  if (f === undefined) return null;
  const pct = `${Math.round(f * 1000) / 10}%`;
  return (
    <>
      <span class={`groove-track${big ? " big" : ""}`} role="img" aria-label={waitCaption(w)}>
        <span class="groove" />
        <span class="gone" style={{ width: pct }} />
        <span class="who" style={{ left: pct }}>
          <img src="app/art/waiting.webp" alt="" draggable={false} />
        </span>
        <span class="end" />
      </span>
      {big && <GrooveCaptions w={w} f={f} />}
    </>
  );
}

/** The groove's captions, placed by time: when it started at the left, its deadline at the
 *  right, and "now" under Ducter. Near either end "now" gives way: by the start it takes the start's
 *  place (the head already says when it started); by the deadline it is left out. */
function GrooveCaptions({ w, f }: { w: WaiterView; f: number }) {
  const nowText = t("wait.now", pad(clock(new Date().toISOString())));
  const start = f < 0.22 ? nowText : t("wait.started", pad(clock(w.armedAt)));
  const middle = f >= 0.22 && f <= 0.62;
  return (
    <span class="tcap">
      <span>{start}</span>
      {middle && (
        <span class="tnow" style={{ left: `${Math.round(f * 1000) / 10}%` }}>
          {nowText}
        </span>
      )}
      <span class="tend">{t("wait.until.ask", pad(when(A.L, w.until)))}</span>
    </span>
  );
}

/** A try's mark: ✓ it holds, → better, × not yet (in the failed ink only when worse). */
export const beadMark = (v: Bodies["until_try"]["verdict"]) => (v === "met" ? "✓" : v === "better" ? "→" : "×");

/** The try pebbles: one per try, the current one hollow. */
export function Beads({ u }: { u: UntilView }) {
  const running = u.state === "on";
  return (
    <span class="beads" role="img" aria-label={t("until.tries", u.tries.length + (running ? 1 : 0), u.maxTries)}>
      {u.tries.map((x) => (
        <i key={x.n} class={`bd v-${x.verdict}`}>{beadMark(x.verdict)}</i>
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

/** The keep-going loop in an opened task: each try with its own words; how it judges, folded. */
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
      <div class="small">{t("until.rule", u.maxTries)}</div>
      <details class="how">
        <summary>{t("wait.how.title")}</summary>
        <div class="kv">
          <span class="k">{t("wait.looks.at")}</span>
          <span class="v">{u.check ? <CheckLine spec={u.check} /> : t("until.judge.report")}</span>
          <span class="k">{t("until.stops")}</span>
          <span class="v">{t("until.stops.v", u.maxTries)}</span>
        </div>
      </details>
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

const minutes = (ms?: number) => Math.max(1, Math.round((ms ?? 0) / 60_000));

/** An opened task that waits: the groove, then How it checks folded (the check itself, how
 *  often, what it saw, who does it), then Stop waiting and Look now. */
export function WaitDetails({ task }: { task: Task }) {
  const w = A.S.waiterFor(task.id);
  if (!w || (!w.check && !w.event)) return null;
  const looks = A.S.looksOf(task);
  return (
    <section class="section">
      <Groove w={w} big />
      <details class="how">
        <summary>{t("wait.how.title")}</summary>
        <div class="kv">
          <span class="k">{t("wait.looks.at")}</span>
          <span class="v">
            {w.check ? <CheckLine spec={w.check} /> : t("wait.event", w.event!.connection, w.event!.trigger)}
            {w.judge && <span class="sub">{t("wait.judge", w.judge)}</span>}
          </span>
          <span class="k">{t("wait.often")}</span>
          <span class="v">{w.event ? t("wait.each_new") : t("wait.every", minutes(w.everyMs))}{w.lastLookAt ? ` · ${t("wait.last", pad(when(A.L, w.lastLookAt)))}` : ""}</span>
          {looks.length > 0 && (
            <>
              <span class="k">{t("wait.looks")}</span>
              <span class="v">
                <span>{t("wait.looks.v", w.looks ?? looks.length, looks.length)}</span>
                {looks.slice(-6).map((l, i) => (
                  <span class="sub" key={i}>{l.summary}</span>
                ))}
              </span>
            </>
          )}
        </div>
      </details>
      <div class="btns">
        <button class="btn text" onClick={() => A.waiterAction(w.waiterId, "cancel")}>{t("wait.cancel")}</button>
        <button class="btn secondary" onClick={() => A.waiterAction(w.waiterId, "look")}>{t("wait.look")}</button>
      </div>
    </section>
  );
}

/** One strip for every routine: a line, today an ink mark at its left, a clay bead per run with
 *  its date under it, spaced by time. */
export function RunStrip({ r, n = 5 }: { r: RoutineView; n?: number }) {
  const runs = (r.upcoming ?? (r.nextAt ? [r.nextAt] : [])).slice(0, n);
  if (!runs.length) return null;
  const now = Date.now();
  const last = Date.parse(runs.at(-1)!);
  const span = Math.max(1, last - now);
  return (
    <span class="runstrip" role="img" aria-label={runs.map((x) => when(A.L, x)).join(", ")}>
      <span class="line" />
      <span class="nowmark" />
      {runs.map((x) => {
        const left = 8 + ((Date.parse(x) - now) / span) * 88;
        return (
          <span class="rb" key={x} style={{ left: `${Math.min(96, Math.max(8, left))}%` }}>
            <i />
            <em>{md(x)}</em>
          </span>
        );
      })}
    </span>
  );
}

/** Why a routine is paused, in words: "停着：连着 3 次你没看", "停着：你暂停的". */
export function pausedWhy(r: RoutineView): string {
  const why = r.pauseReason ?? "asked";
  if (why !== "asked") return t(`routine.paused.${why}`);
  return r.pausedBy === "user" ? t("routine.paused.by_you") : t("routine.paused.by_partner", A.S.personaName);
}

/** One routine on the shelf: its name and when in words, its next runs as beads, then where it
 *  stands, with Pause / Resume. */
export function RoutineRow({ r }: { r: RoutineView }) {
  const paused = r.state === "paused";
  const lines: string[] = [];
  if (paused) lines.push(pausedWhy(r));
  else if (r.running) lines.push(t("routine.running"));
  else if (r.nextAt) lines.push(t("routine.next", pad(when(A.L, r.nextAt))));
  if (r.lastRun) lines.push(t(`routine.last.${r.lastRun.state}`, pad(day(A.L, r.lastRun.at))));
  return (
    <div class={`row routine${paused ? " paused" : ""}`}>
      {r.trigger.kind === "time" ? (
        <span class="clk" aria-hidden="true">
          <img src="app/art/wait_clock.webp" alt="" draggable={false} />
        </span>
      ) : (
        <WaitBubble w={{ check: r.trigger.check, event: r.trigger.event }} />
      )}
      <span class="main">
        <span class="t">{r.name}</span>
        {!r.name.includes(r.triggerWords) && <span class="m">{r.triggerWords}</span>}
        {!paused && r.trigger.kind === "time" && <RunStrip r={r} n={3} />}
        {lines.length > 0 && <span class="m cap">{lines.join(" · ")}</span>}
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

/** A routine's proposal card body (D29): when (words and its next runs as beads), what it
 *  does, how it reports, what it may touch, what it costs in plain words, its review date. */
export function RoutineFacts({ routineId }: { routineId: string }) {
  const r = A.S.routine(routineId);
  if (!r) return null;
  return (
    <div class="kv routine-facts">
      <span class="k">{t("routine.when")}</span>
      <span class="v">
        {r.triggerWords}
        {r.trigger.kind === "time" && <RunStrip r={r} />}
      </span>
      <span class="k">{t("routine.does")}</span>
      <span class="v">{r.brief.split("\n")[0]}</span>
      <span class="k">{t("routine.reports")}</span>
      <span class="v">{t(`routine.reports.${r.reports}`)}</span>
      <span class="k">{t("routine.touch")}</span>
      <span class="v">{t(`routine.effect.${r.effect}`)}</span>
      <span class="k">{t("routine.budget")}</span>
      <span class="v">{t("routine.cost")}</span>
      <span class="k">{t("routine.review")}</span>
      <span class="v">{t("routine.review.v", pad(day(A.L, r.reviewAt)))}</span>
    </div>
  );
}
