// Work over time on the phone (D112–D115): what a wait waits for (a small clay thing in a
// bubble) and its deadline groove with Ducter sitting at now; the try pebbles of a keep-going
// loop; the routine shelf and a routine's proposal card, each with one strip of beads for its
// next runs. Time is drawn; words are its quiet caption. How a wait checks (the command, how
// often, who judges) is only in the opened task, folded under How it checks. Copy: i18n.ts.
import type { Bodies, CheckSpec, RoutineView, UntilView, WaiterView } from "@ducter/protocol";
import { describeCheck, describePredicate } from "@ducter/protocol/src/checks.ts";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { cjkPad, clock, day, md, when } from "./format.ts";

const pad = (s: string) => cjkPad(A.L, s);
/** t with a time padded from the Chinese around it, without stray spaces at the ends or before punctuation. */
const tp = (key: string, v: string) => t(key, pad(v)).trim().replace(/ ([，。；：])/g, "$1");
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
  let r = reason.trim();
  // "Waiting until the domain renewal email arrives": a capital that only starts the sentence goes.
  if (A.L.lang !== "zh" && /^[A-Z][a-z]/.test(r)) r = r[0]!.toLowerCase() + r.slice(1);
  return t("wait.line", A.L.lang === "zh" && /^[A-Za-z0-9#]/.test(r) ? ` ${r}` : r);
}

/** What a wait's card says under it, in words: its deadline, or when a timer is due. */
export function waitCaption(w: WaiterView): string {
  if (w.until) return tp("wait.until.cap", (when(A.L, w.until)));
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
  // Ducter moves only as time does: draw again after about a three-hundredth of the wait.
  const [, tick] = useState(0);
  const span = Date.parse(w.until ?? "") - Date.parse(w.armedAt ?? "");
  useEffect(() => {
    if (!(span > 0)) return;
    const h = setInterval(() => tick((n) => n + 1), Math.max(1000, span / 300));
    return () => clearInterval(h);
  }, [span]);
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
  const nowText = tp("wait.now", (clock(new Date().toISOString())));
  const start = f < 0.22 ? nowText : tp("wait.started", (clock(w.armedAt)));
  const middle = f >= 0.22 && f <= 0.62;
  return (
    <span class="tcap">
      <span>{start}</span>
      {middle && (
        <span class="tnow" style={{ left: `${Math.round(f * 1000) / 10}%` }}>
          {nowText}
        </span>
      )}
      <span class="tend">{tp("wait.until.ask", (when(A.L, w.until)))}</span>
    </span>
  );
}

/** A keep-going loop's goal, as everyone reads it (D115): when the goal can be counted, a row of
 *  clay lights for the checks that must pass, lit as they pass ("6 盏灯里亮了 4 盏"); when it
 *  can't, a clay flag with Ducter climbing one step per try, the flag green when it holds. The
 *  try count is a quiet caption. */
export function Goal({ u, big }: { u: UntilView; big?: boolean }) {
  const last = [...u.tries].reverse().find((x) => x.progress);
  const met = u.state === "met";
  const n = u.tries.length + (u.state === "on" ? 1 : 0);
  if (last?.progress && last.progress.total <= 12) {
    const { total } = last.progress;
    const done = met ? total : last.progress.done;
    return (
      <span class={`goal lights${big ? " big" : ""}`} role="img" aria-label={lightsWords(done, total)}>
        <span class="row-of">
          {Array.from({ length: total }, (_, i) => (
            <img key={i} src={`app/art/${i < done ? "goal_light_on" : "goal_light_off"}.webp`} alt="" draggable={false} />
          ))}
        </span>
        <span class="cap">{[lightsWords(done, total), t("until.n", n)].join(" · ")}</span>
      </span>
    );
  }
  // A staircase of six steps up to the flag; Ducter stands on the step of its latest try (the
  // steps behind it are solid, the ones ahead faint). At the flag it holds.
  const SLOTS = 6;
  const steps = met ? SLOTS : Math.min(Math.max(u.tries.length, 1), SLOTS - 1);
  return (
    <span class={`goal climb${big ? " big" : ""}`} role="img" aria-label={met ? t("until.met", u.tries.length) : t("until.n", n)}>
      <span class="hill">
        {Array.from({ length: SLOTS }, (_, i) => (
          <i key={i} class={i < steps ? "" : "ahead"} style={{ height: `${(i + 1) * (big ? 7 : 5)}px` }} />
        ))}
        {!met && (
          // Ducter stands on the top step: one step per try.
          <img
            class="climber"
            src="app/art/working.webp"
            alt=""
            draggable={false}
            style={{ left: `${(steps - 1) * ((big ? 22 : 14) + 2)}px`, bottom: `${steps * (big ? 7 : 5)}px` }}
          />
        )}
        <img class="flag" src={`app/art/${met ? "goal_flag_on" : "goal_flag_off"}.webp`} alt="" draggable={false} />
      </span>
      <span class="cap">{met ? t("until.met", u.tries.length) : t("until.try", n, u.maxTries)}</span>
    </span>
  );
}

/** "6 盏灯里亮了 4 盏" / "4 of 6 lights on". */
function lightsWords(done: number, total: number): string {
  return A.L.lang === "zh" ? t("until.lights", total, done) : t("until.lights", done, total);
}

export function untilLine(u: UntilView): string {
  const last = u.tries.at(-1);
  if (u.state === "met") return t("until.met", u.tries.length);
  if (u.state === "stopped") return t(`until.stop.${u.stop ?? "max"}`, u.tries.length);
  // A counted goal already shows in its lights; the check's own words stay in How it checks.
  if (last?.progress) return "";
  return last ? t("until.last", last.summary) : t("until.now");
}

/** The keep-going loop in an opened task: the goal first, then each try in a quiet line; how it
 *  judges, folded. */
export function TryStrip({ task }: { task: Task }) {
  const u = A.S.untilOf(task);
  if (!u) return null;
  return (
    <section class="section">
      <h2 class="sec-title">{t("until.title", u.condition)}</h2>
      <Goal u={u} big />
      <ol class="tries">
        {u.tries.map((x) => (
          <li key={x.n}>
            <b>{t("until.n", x.n)}</b> {x.progress ? lightsWords(x.progress.done, x.progress.total) : x.summary}
          </li>
        ))}
      </ol>
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
          <span class="v">{w.event ? t("wait.each_new") : t("wait.every", minutes(w.everyMs))}{w.lastLookAt ? ` · ${tp("wait.last", (when(A.L, w.lastLookAt)))}` : ""}</span>
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

/** A routine's next run on a clay tear-off desk calendar (D115): the date big, its weekday (or
 *  "1 号" for a monthly one) under it, a few pages behind to say it comes again. */
export function CalendarBadge({ r, big }: { r: RoutineView; big?: boolean }) {
  const next = r.nextAt ?? r.upcoming?.[0];
  if (!next) return null;
  const d = new Date(next);
  const monthly = r.trigger.kind === "time" && r.trigger.every === "month";
  const zh = A.L.lang === "zh";
  const sub = monthly ? (zh ? `${d.getMonth() + 1} 月` : d.toLocaleString("en", { month: "short" })) : zh ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()] : d.toLocaleString("en", { weekday: "short" });
  return (
    <span class={`cal-badge${big ? " big" : ""}`} role="img" aria-label={when(A.L, next)}>
      <img src="app/art/routine_calendar.webp" alt="" draggable={false} />
      <b>{monthly && zh ? `${d.getDate()} 号` : d.getDate()}</b>
      <em>{sub}</em>
    </span>
  );
}

/** The next few runs in words, for the proposal card: "11/16 · 11/23 · 11/30". */
function nextFew(r: RoutineView): string {
  return (r.upcoming ?? []).slice(0, 4).map((x) => md(x)).join(" · ");
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
  else if (r.nextAt) lines.push(tp("routine.next", (when(A.L, r.nextAt))));
  if (r.lastRun) lines.push(tp(`routine.last.${r.lastRun.state}`, (day(A.L, r.lastRun.at))));
  return (
    <div class={`row routine${paused ? " paused" : ""}`}>
      {r.trigger.kind === "time" ? (
        <CalendarBadge r={r} />
      ) : (
        <WaitBubble w={{ check: r.trigger.check, event: r.trigger.event }} />
      )}
      <span class="main">
        <span class="t">{r.name}</span>
        {/* A condition routine's name already says its condition. */}
        {r.trigger.kind === "time" && !r.name.includes(r.triggerWords) && <span class="m">{r.triggerWords}</span>}
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
        {r.trigger.kind === "time" ? (
          <span class="when-cal">
            <CalendarBadge r={r} big />
            <span>
              {r.triggerWords}
              {nextFew(r) && <span class="sub">{nextFew(r)}</span>}
            </span>
          </span>
        ) : (
          r.triggerWords
        )}
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
      <span class="v">{tp("routine.review.v", (day(A.L, r.reviewAt)))}</span>
    </div>
  );
}
