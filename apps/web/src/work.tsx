// Work over time on the phone (D112–D115): what a wait waits for (a small clay thing in a
// bubble) and its deadline groove with Ducter sitting at now; the try pebbles of a keep-going
// loop; the routine shelf and a routine's proposal card, each with one strip of beads for its
// next runs. Time is drawn; words are its quiet caption. How a wait checks (the command, how
// often, who judges) is only in the opened task, folded under How it checks. Copy: i18n.ts.
import type { Bodies, CheckSpec, RoutineView, UntilView, WaiterView } from "@ducter/protocol";
import { words as byLang } from "@ducter/protocol/src/lang.ts";
import { DEFAULT_EVERY_MS, describeCheck, describePredicate } from "@ducter/protocol/src/checks.ts";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { cjkPad, clock, day, harnessName, md, when } from "./format.ts";
import { Btn, Toggle } from "./controls.tsx";

const pad = (s: string) => cjkPad(A.L, s);
/** t with a time padded from the Chinese around it, without stray spaces at the ends or before punctuation. */
const tp = (key: string, v: string) => t(key, pad(v)).trim().replace(/ ([，。；：])/g, "$1");
import { attention, type Task } from "./store.ts";
import { Facts } from "./controls.tsx";

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
  if (A.L.style.cased && /^[A-Z][a-z]/.test(r)) r = r[0]!.toLowerCase() + r.slice(1);
  return t("wait.line", !A.L.style.spaced && /^[A-Za-z0-9#]/.test(r) ? ` ${r}` : r);
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

/** A keep-going loop's goal, as everyone reads it (D115): when it can be counted (checks that
 *  must pass, or items a judge counted), a row of clay lights lit as they pass ("6 盏灯里亮了 4
 *  盏", "16 处里好了 12 处"); when nothing can be counted, no picture of progress at all: Ducter
 *  at work and the latest try in one line ("第 2 次 · 还在改"). */
export function Goal({ u, big }: { u: UntilView; big?: boolean }) {
  const last = [...u.tries].reverse().find((x) => x.progress);
  const met = u.state === "met";
  const n = u.tries.length + (u.state === "on" ? 1 : 0);
  if (last?.progress && last.progress.total > 0) {
    const { total, unit } = last.progress;
    const done = met ? total : last.progress.done;
    // More than twelve: ten lights, each a tenth.
    const slots = total <= 12 ? total : 10;
    const lit = total <= 12 ? done : Math.round((done / total) * 10);
    const words = countWords(done, total, unit);
    return (
      <span class={`goal lights${big ? " big" : ""}`} role="img" aria-label={words}>
        <span class="row-of">
          {Array.from({ length: slots }, (_, i) => (
            <img key={i} src={`app/art/${i < lit ? "goal_light_on" : "goal_light_off"}.webp`} alt="" draggable={false} />
          ))}
        </span>
        <Facts class="cap" items={[words, t("until.n", n)]} />
      </span>
    );
  }
  const latest = u.tries.at(-1);
  // D291: which try, and what the latest one says, each its own element.
  return (
    <span class={`goal plain${big ? " big" : ""}`}>
      {!met && <img class="worker" src="app/art/working.webp" alt="" draggable={false} />}
      {met ? <span class="cap">{t("until.met", u.tries.length)}</span> : <Facts class="cap" items={[t("until.n", n), latest ? latest.summary : t("until.now")]} />}
    </span>
  );
}

/** "6 盏灯里亮了 4 盏" / "4 of 6 lights on", or for items a judge counted "16 处里好了 12 处" / "12 of 16 done". */
function countWords(done: number, total: number, unit?: "checks" | "items"): string {
  const key = unit === "items" ? "until.items" : "until.lights";
  return t(key, done, total);
}

/** A keep-going loop's line under its goal: only how it ended (while it runs, the goal says it). */
export function untilLine(u: UntilView): string {
  if (u.state === "met") return t("until.met", u.tries.length);
  if (u.state === "stopped") return t(`until.stop.${u.stop ?? "max"}`, u.tries.length);
  return "";
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
            <b>{t("until.n", x.n)}</b> {x.progress ? countWords(x.progress.done, x.progress.total, x.progress.unit) : x.summary}
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

/** D279: when a wait comes back on its own, from the waiter's own times, never a model: the next
 *  look (a check, an event that is polled) or the time it wakes; how far along the stretch since
 *  the last look (or since it was armed) it is; "" when it only comes back when something happens. */
export function backOf(w: WaiterView | undefined, now = Date.now()): { at?: string; frac?: number; left?: number } {
  if (!w) return {};
  const watches = !!(w.check || w.event);
  const at = watches ? w.nextLookAt : w.at;
  const next = Date.parse(at ?? "");
  if (!Number.isFinite(next) || next <= now) return {};
  const from = Date.parse((watches ? (w.lastLookAt ?? w.armedAt) : w.armedAt) ?? "");
  const frac = Number.isFinite(from) && next > from ? Math.min(1, Math.max(0, (now - from) / (next - from))) : undefined;
  return { at, frac, left: next - now };
}

/** How long until then, in short words: "45 分" / "45 min", "2 小时" / "2 h". */
function leftWords(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m < 60 ? t("watch.left.min", m) : m < 48 * 60 ? t("watch.left.hour", Math.round(m / 60)) : t("watch.left.day", Math.round(m / 1440));
}

/** The clock's ring (D279): a sunken clay groove bent into a circle; the stretch since the last
 *  look fills it clockwise in the wait's ink as time passes (redrawn each half minute), a bead at
 *  its edge breathes slowly (still under reduced motion), and how long is left sits inside. When
 *  the wait comes true, it closes and pops once. Its words are its label. */
export function LookRing({ frac, inside, label, met }: { frac?: number; inside?: string; label: string; met?: boolean }) {
  const r = 22, c = 2 * Math.PI * r;
  const f = met ? 1 : Math.max(0, Math.min(1, frac ?? 0));
  const a = f * 2 * Math.PI;
  const bx = 28 + r * Math.sin(a), by = 28 - r * Math.cos(a);
  return (
    <span class={`lookring${met ? " met" : ""}${frac === undefined && !met ? " open" : ""}`} role="img" aria-label={label}>
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle class="track" cx="28" cy="28" r={r} />
        {f > 0 && <circle class="gone" cx="28" cy="28" r={r} stroke-dasharray={`${(f * c).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 28 28)" />}
        {!met && <circle class="bead" cx={bx.toFixed(2)} cy={by.toFixed(2)} r="4" />}
        {met && <path class="tick" d="M19 29l6 6 12-13" />}
      </svg>
      {inside && <b>{inside}</b>}
    </span>
  );
}

/** Every look so far as a small pebble (D279), the newest at the right: the ones that came true
 *  filled in the wait's ink, the ones that found nothing yet hollow. At most 12; the count is in
 *  the words beside them. */
function Pebbles({ came, empty }: { came: number; empty: number }) {
  const all = [...Array(came).fill(true), ...Array(empty).fill(false)].slice(-12);
  return (
    <span class="pebbles" aria-hidden="true">
      {all.map((x, i) => (
        <i key={i} class={x ? "came" : ""} />
      ))}
    </span>
  );
}

/** An opened task resting on its wait (D279): the ring and when it comes back, the looks so far,
 *  then 现在就去看 (with when it would have looked) and 不再等了. A deadline keeps its groove.
 *  When the wait comes true it shows the moment, then the task carries on. How it checks opens
 *  under the transcript's end line (D271). */
export function WatchCard({ task, wakes, wokeAt }: { task: Task; wakes: number; wokeAt: number }) {
  const w = A.S.waiterFor(task.id);
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(h);
  }, []);
  const met = !w && A.S.justArrived(task.id, Date.now(), 2600);
  useEffect(() => {
    if (!met) return;
    const h = setTimeout(() => tick((n) => n + 1), 2700);
    return () => clearTimeout(h);
  }, [met]);
  if (met)
    return (
      <section class="watch met" role="status">
        <div class="watch-main">
          <LookRing met label={t("watch.met")} />
          <div class="watch-words">
            <p class="back">{t("watch.met")}</p>
          </div>
        </div>
      </section>
    );
  if (!w || attention(task) !== "blocked") return null;
  if (w.limit) return <LimitCard w={w} />;
  const watches = !!(w.check || w.event);
  const b = backOf(w);
  const looks = wakes + (w.looks ?? 0);
  const lastLook = Date.parse(w.lastLookAt ?? "");
  const woke = Number.isFinite(wokeAt) ? wokeAt : 0;
  const last = Math.max(Number.isFinite(lastLook) ? lastLook : 0, woke);
  const notYet = Number.isFinite(lastLook) && lastLook >= woke;
  // D291: the count, the last look and what it found, each its own fact.
  const lastWords = last > 0 ? tp("watch.last", clock(new Date(last).toISOString())) : "";
  const nothing = last > 0 && notYet ? t("watch.nothing") : "";
  // How it comes back.
  const rhythm = w.check ? t("wait.every", minutes(w.everyMs ?? DEFAULT_EVERY_MS)) : w.event ? t("wait.each_new") : t("watch.timer");
  const count = looks > 0 ? (looks === 1 ? t("watch.tally.one") : t("watch.tally", looks)) : "";
  const tally = count || lastWords;
  // D355: one number. A watch says when it looks next in words, the ring only shows it filling; how
  // often is said apart, quieter. A timer keeps how long is left inside its ring.
  const head = b.left && watches ? nextWords(b.left) : rhythm;
  return (
    <section class="watch">
      <div class="watch-main">
        <LookRing frac={b.frac} inside={b.left && !watches ? leftWords(b.left) : undefined} label={backWords(w)} />
        <div class="watch-words">
          <p class="watch-next">
            <span class="rhythm">{head}</span>
            {head !== rhythm && <span class="often">{rhythm}</span>}
          </p>
          {tally && (
            <p class="tally">
              {looks > 0 && <Pebbles came={wakes} empty={w.looks ?? 0} />}
              <Facts items={[count, lastWords, nothing]} />
            </p>
          )}
        </div>
      </div>
      {w.until && <Groove w={w} big />}
      {watches && (
        <div class="btns">
          <Btn kind="secondary" size="sm" label={t("wait.look")} onClick={() => A.waiterAction(w.waiterId, "look")} />
          <Btn kind="text" size="sm" label={t("wait.cancel")} onClick={() => A.waiterAction(w.waiterId, "cancel")} />
        </div>
      )}
    </section>
  );
}

/** When a watch looks next, in a few words (D355): "20 分钟后再看" / "Next look in 20 min". */
function nextWords(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m < 60 ? t("watch.next.min", m) : m < 48 * 60 ? t("watch.next.hour", Math.round(m / 60)) : t("watch.next.day", Math.round(m / 1440));
}

/** When a wait comes back, as its state (D279): "21:59 回来" / "Back at 21:59", "有动静就回来" /
 *  "Back when it happens"; "" for a wait that doesn't come back on its own. */
export function backWords(w: WaiterView | undefined, now = Date.now()): string {
  if (!w) return "";
  if (w.limit) return limitState(w, now);
  const b = backOf(w, now);
  if (b.at) return tp("watch.back", soonish(b.at, now));
  return w.event ? t("watch.back.when") : "";
}

/** D297: when a limit wait comes back: the reset itself (its grace minute left out), or the next try. */
export function limitAt(w: WaiterView): string | undefined {
  const at = Date.parse(w.at ?? "");
  if (!Number.isFinite(at)) return undefined;
  return new Date(w.limit?.resetKnown ? at - LIMIT_GRACE_MS : at).toISOString();
}

/** D297: a task waiting on its agent's limit, as its state: 额度 3:12 恢复 / Limit resets 3:12. */
export function limitState(w: WaiterView, now = Date.now()): string {
  const at = limitAt(w);
  return w.limit?.resetKnown && at && Date.parse(at) > now ? t("limit.state", soonish(at, now)) : t("limit.state.unknown");
}

/** D297: the reset's grace minute (core/src/limits.ts RESET_GRACE_MS). */
const LIMIT_GRACE_MS = 60_000;

/** D297: a task resting on its agent's usage limit. The ring fills toward the reset; it says whose
 *  limit and when it carries on; Hand it to {agent} now when another signed-in agent can take it,
 *  Stop waiting, and under them the choice to hand off right away next time. */
export function LimitCard({ w }: { w: WaiterView }) {
  const l = w.limit!;
  const b = backOf(w);
  const at = limitAt(w);
  const to = l.handTo;
  return (
    <section class="watch limit">
      <div class="watch-main">
        <LookRing frac={b.frac} inside={b.left ? leftWords(b.left) : undefined} label={limitState(w)} />
        <div class="watch-words">
          <p class="rhythm">{t("limit.head", harnessName(l.harness))}</p>
          {at && <p class="back">{l.resetKnown ? t("limit.back", soonish(at)) : t("limit.back.unknown", soonish(at))}</p>}
        </div>
      </div>
      <div class="btns">
        {to && <button class="btn secondary" onClick={() => A.waiterAction(w.waiterId, "handoff")}>{t("limit.handoff", harnessName(to.harness))}</button>}
        <button class="btn text" onClick={() => A.waiterAction(w.waiterId, "cancel")}>{t("limit.cancel")}</button>
      </div>
      {(to || w.limitAuto) && <Toggle label={t("limit.auto")} checked={!!w.limitAuto} onChange={(v) => A.setSettings({ limitHandoff: v })} />}
    </section>
  );
}

/** A time of day, with its day only when it isn't today. */
function soonish(iso: string, now = Date.now()): string {
  return day(A.L, iso, now) === day(A.L, new Date(now).toISOString(), now) ? clock(iso) : when(A.L, iso, now);
}

/** How a wait checks (D271, under the end line): the check itself and its judge, how often and
 *  when it last looked, what it saw. */
export function WaitHow({ task }: { task: Task }) {
  const w = A.S.waiterFor(task.id);
  if (!w || (!w.check && !w.event)) return null;
  const looks = A.S.looksOf(task);
  return (
    <>
        <div class="kv">
          <span class="k">{t("wait.looks.at")}</span>
          <span class="v">
            {w.check ? <CheckLine spec={w.check} /> : t("wait.event", w.event!.connection, w.event!.trigger)}
            {w.judge && <span class="sub">{t("wait.judge", w.judge)}</span>}
          </span>
          <span class="k">{t("wait.often")}</span>
          <span class="v">
            {w.event ? t("wait.each_new") : t("wait.every", minutes(w.everyMs))}
            {w.lastLookAt && <span class="sub">{tp("wait.last", when(A.L, w.lastLookAt))}</span>}
          </span>
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
    </>
  );
}

/** The desk calendar's words: under the date, its month or weekday; a monthly date as "1 号" / 1. */
const BADGE: Record<"zh" | "en", { month(d: Date): string; weekday(d: Date): string; monthDay(d: Date): string | number }> = {
  zh: { month: (d) => `${d.getMonth() + 1} 月`, weekday: (d) => ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]!, monthDay: (d) => `${d.getDate()} 号` },
  en: { month: (d) => d.toLocaleString("en", { month: "short" }), weekday: (d) => d.toLocaleString("en", { weekday: "short" }), monthDay: (d) => d.getDate() },
};
/** A routine's next run on a clay tear-off desk calendar (D115): the date big, its weekday (or
 *  "1 号" for a monthly one) under it, a few pages behind to say it comes again. */
export function CalendarBadge({ r, big }: { r: RoutineView; big?: boolean }) {
  const next = r.nextAt ?? r.upcoming?.[0];
  if (!next) return null;
  const d = new Date(next);
  // A monthly one, and a one-time start (D185), say the month under the date.
  const monthly = r.trigger.kind === "time" && (r.trigger.every === "month" || r.trigger.every === "once");
  const w = byLang(BADGE, A.L.lang);
  const sub = monthly ? w.month(d) : w.weekday(d);
  return (
    <span class={`cal-badge${big ? " big" : ""}`} role="img" aria-label={when(A.L, next)}>
      <img src="app/art/routine_calendar.webp" alt="" draggable={false} />
      <b>{monthly ? w.monthDay(d) : d.getDate()}</b>
      <em>{sub}</em>
    </span>
  );
}

/** The next few runs, for the proposal card: each date its own fact (D291). */
function nextFew(r: RoutineView): string[] {
  return (r.upcoming ?? []).slice(0, 4).map((x) => md(x));
}

/** Why a routine is paused, in words: "已暂停：连着 3 次你没看", "已暂停：你停下的". */
export function pausedWhy(r: RoutineView): string {
  const why = r.pauseReason ?? "asked";
  if (why !== "asked") return t(`routine.paused.${why}`);
  return r.pausedBy === "user" ? t("routine.paused.by_you") : t("routine.paused.by_partner", A.S.personaName);
}

/** D245: how late a run started, said only when it was: "晚了 12 分钟 / 12 min late"; its own fact (D291). */
function lateWords(min: number | undefined): string {
  if (!min) return "";
  return min < 90 ? t("routine.late.m", min) : t("routine.late.h", Math.round(min / 60));
}

/** D245: what it costs, honestly: a watch or a check looks without the AI; only a run spends. */
function routineCost(r: RoutineView): string {
  if (r.trigger.kind !== "condition" || r.trigger.judge) return t("routine.cost");
  return t(r.trigger.watch ? "routine.cost.change" : "routine.cost.when");
}

/** One routine on the shelf: its name and when in words, its next runs as beads, then where it
 *  stands, with Pause / Resume. */
export function RoutineRow({ r }: { r: RoutineView }) {
  const paused = r.state === "paused";
  const once = r.trigger.kind === "time" && r.trigger.every === "once"; // D185: a start at a time
  const lines: string[] = [];
  if (paused) lines.push(pausedWhy(r));
  else if (r.running) lines.push(t("routine.running"));
  // D245: kept from running by an account error: why in words, and when it tries again by itself.
  else if (r.backoff) lines.push(t(`routine.cant.${r.backoff.trouble}`), tp("routine.retry", when(A.L, r.backoff.nextTryAt)));
  else if (once) lines.push(t("routine.once.starts"));
  else if (r.lastRun?.state === "failed" && r.lastRun.retryAt) lines.push(tp("routine.retry", when(A.L, r.lastRun.retryAt)));
  else if (r.nextAt) lines.push(tp("routine.next", (when(A.L, r.nextAt))));
  if (r.lastRun) lines.push(tp(`routine.last.${r.lastRun.state}`, (day(A.L, r.lastRun.at))), lateWords(r.lastRun.lateMin));
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
        {lines.some(Boolean) && (
          <span class="m cap">
            <Facts items={lines} />
          </span>
        )}
      </span>
      {once && !paused ? (
        <button class="btn text sm" onClick={() => A.routineAction(r.routineId, "end")}>{t("routine.cancel")}</button>
      ) : paused ? (
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
              {nextFew(r).length > 0 && (
                <span class="sub">
                  <Facts items={nextFew(r)} />
                </span>
              )}
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
      <span class="v">{routineCost(r)}</span>
      <span class="k">{t("routine.review")}</span>
      <span class="v">{tp("routine.review.v", (day(A.L, r.reviewAt)))}</span>
    </div>
  );
}
