// D222 (design/calendar.md §6): calendar things in the conversation. The day card under the
// partner's words (a day or a week, every account merged), the facts of a change card and how it
// settles after Go, and the greeting's one quiet line about what is left today. Literal agenda,
// Pebble clay: each calendar's colour only as a dot or a thin rail; marks are drawn glyphs.
import type { CalChange, CalDay, CalEvent, CalGlance, CalToday } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { shortAccount } from "./accounts.tsx";
import { Btn, CalLeaf, Facts } from "./controls.tsx";
import { andList, dateRun, dayHead, daysBetween, hmOf, leafParts, minutesOf, nameList, nowMinutesIn, offsetOf, otherZoneLine, peopleWords, placeTimeLine, todayIn, whenWords, ymdOf, type CalLang } from "./cal-format.ts";
import type { DecisionState } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const lang = (): CalLang => A.L.lang;

/** Re-renders every minute (the now line and the faded past move with the clock). */
function useMinute() {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), 60_000);
    return () => clearInterval(h);
  }, []);
}

// ---------- drawn marks ----------

/** A small calendar page: the greeting's today line. */
export const CalGlyph = () => (
  <svg class="cal-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="3" width="12" height="11" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M2.8 6.6h10.4" stroke="currentColor" stroke-width="1.6" />
    <path d="M5.4 1.8v2.4M10.6 1.8v2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="10.4" cy="10.2" r="1.3" fill="currentColor" />
  </svg>
);
/** The move's drawn arrow (never a font's →). */
const MoveArrow = () => (
  <svg class="cal-arrow" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
    <path d="M1.5 6h12M9.2 1.8L13.5 6l-4.3 4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Tick = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.4l2.6 2.6L11 4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

/** A calendar's colour: data, drawn only as a dot or a rail (never a fill). */
const tint = (color?: string) => (color && /^#[0-9a-f]{3,8}$/i.test(color) ? { background: color } : undefined);

// ---------- 6.1 the day card ----------

/** The meta line's parts: whose, the people, the place or online, free, the other zone. */
function metaParts(e: CalEvent, accounts: string[], many: boolean): string[] {
  const L = lang();
  const out: string[] = [];
  if (many && e.account) out.push(shortAccount(e.account, accounts));
  const ppl = peopleWords(L, e.people, e.with);
  if (ppl) out.push(ppl);
  if (e.where) out.push(e.where);
  else if (e.online) out.push(t("cal.online"));
  if (e.free) out.push(t("cal.free"));
  if (e.zone && !e.allDay) {
    const z = otherZoneLine(L, e.zone, e.start);
    if (z) out.push(z);
  }
  return out;
}

interface RowLook {
  past: boolean;
  clashWith: string[];
  linkUp: boolean;
  linkDown: boolean;
}

function EventRow({ e, look, accounts, many }: { e: CalEvent; look: RowLook; accounts: string[]; many: boolean }) {
  const L = lang();
  const meta = metaParts(e, accounts, many);
  const chips: [string, string][] = [];
  if (look.clashWith.length) chips.push(["clash", t("cal.chip.clash")]);
  if (e.me === "needsAction") chips.push(["ask", t("cal.chip.unanswered")]);
  else if (e.me === "tentative") chips.push(["maybe", t("cal.chip.maybe")]);
  const time = e.allDay ? t("cal.a11y.allday") : t("cal.a11y.span", hmOf(e.start), hmOf(e.end));
  const label = [time, e.title, ...meta, ...chips.filter(([k]) => k !== "clash").map(([, w]) => w), ...(look.clashWith.length ? [t("cal.a11y.clash", nameList(L, look.clashWith))] : [])].join(t("cal.a11y.sep"));
  const cls = `cal-row${e.allDay ? " allday" : ""}${look.past ? " past" : ""}${e.free ? " free" : ""}${look.clashWith.length ? ` clash${look.linkUp ? "" : " ctop"}${look.linkDown ? "" : " cbot"}` : ""}`;
  const inner = (
    <>
      <span class="cal-t" aria-hidden="true">
        {e.allDay ? (
          <span class="s">{t("cal.allday")}</span>
        ) : (
          <>
            <span class="s">{hmOf(e.start)}</span>
            <span class="e">{hmOf(e.end)}</span>
          </>
        )}
      </span>
      <span class="cal-rail" style={tint(e.color)} aria-hidden="true" />
      <span class="cal-b" aria-hidden="true">
        <span class="cal-tl">
          <span class="cal-ti">{e.title}</span>
          {chips.map(([k, w]) => (
            <span key={k} class={`cal-chip ${k}`}>
              {w}
            </span>
          ))}
        </span>
        {/* Each part is its own element and keeps together; a long one (the other zone's time) moves
            to the next line whole (D291: spaced by a gap, never dotted). */}
        {meta.length > 0 && !e.allDay && <Facts class="cal-meta" items={meta} />}
      </span>
    </>
  );
  // Tap a row: the event in its own calendar, in a new tab (or the browser, in the apps).
  return e.link ? (
    <a class={cls} href={e.link} target="_blank" rel="noopener noreferrer" aria-label={label} title={t("cal.a11y.open")}>
      {inner}
    </a>
  ) : (
    <div class={cls} role="listitem" aria-label={label}>
      {inner}
    </div>
  );
}

function NowLine({ zone }: { zone: string }) {
  const m = nowMinutesIn(zone);
  const hm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <div class="cal-now" role="separator" aria-label={`${t("cal.now")} ${hm}`}>
      <span class="dot" />
    </div>
  );
}

function DayRows({ day, g, today, clashes, accounts }: { day: CalDay; g: CalGlance; today: string; clashes: Map<string, string[]>; accounts: string[] }) {
  const many = g.accounts > 1;
  const isToday = day.date === today;
  const before = daysBetween(day.date, today) > 0; // a day already gone
  const nowMin = isToday ? nowMinutesIn(g.zone) : 0;
  const allDay = day.events.filter((e) => e.allDay);
  const timed = day.events.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const pairs = new Set((g.clashes ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const linked = (i: number, j: number) => i >= 0 && j < timed.length && pairs.has(`${timed[i]!.ref}|${timed[j]!.ref}`);
  const pastOf = (e: CalEvent) => before || (isToday && !e.allDay && ymdOf(e.end) === day.date && minutesOf(e.end) <= nowMin);
  // The now line stands before the first event still to start (today only).
  const nowAt = isToday && timed.length ? timed.findIndex((e) => ymdOf(e.start) === day.date && minutesOf(e.start) > nowMin) : -2;
  const out: preact.JSX.Element[] = [];
  for (const e of allDay) out.push(<EventRow key={e.ref} e={e} accounts={accounts} many={many} look={{ past: before, clashWith: [], linkUp: false, linkDown: false }} />);
  timed.forEach((e, i) => {
    if (i === nowAt) out.push(<NowLine key="now" zone={g.zone} />);
    out.push(<EventRow key={e.ref} e={e} accounts={accounts} many={many} look={{ past: pastOf(e), clashWith: clashes.get(e.ref) ?? [], linkUp: linked(i - 1, i), linkDown: linked(i, i + 1) }} />);
  });
  if (nowAt === -1) out.push(<NowLine key="now" zone={g.zone} />);
  return (
    <div class="cal-rows" role="list">
      {out}
    </div>
  );
}

/** 日程 / A day's glance (or a week's): one card, every account merged, under the partner's words. */
export function DayCard({ g }: { g: CalGlance }) {
  useMinute();
  const L = lang();
  const today = todayIn(g.zone);
  const titles = new Map<string, string>();
  for (const d of g.days) for (const e of d.events) titles.set(e.ref, e.title);
  const clashes = new Map<string, string[]>();
  for (const [a, b] of g.clashes ?? []) {
    clashes.set(a, [...(clashes.get(a) ?? []), titles.get(b) ?? ""]);
    clashes.set(b, [...(clashes.get(b) ?? []), titles.get(a) ?? ""]);
  }
  const accounts = [...new Set(g.days.flatMap((d) => d.events.map((e) => e.account ?? "")).filter(Boolean))];
  const one = g.days.length === 1;
  // A week: an empty day says so under its head; a run of empty days is one line.
  const blocks: ({ day: CalDay } | { from: string; to: string })[] = [];
  for (const day of g.days) {
    const empty = !day.events.length && !day.marks?.length;
    const last = blocks[blocks.length - 1];
    if (!one && empty && last && "from" in last && daysBetween(last.to, day.date) === 1) last.to = day.date;
    else if (!one && empty) blocks.push({ from: day.date, to: day.date });
    else blocks.push({ day });
  }
  return (
    <section class={`cal-card${one ? "" : " week"}`} aria-label={t("cal.label")}>
      {blocks.map((b) => {
        if ("from" in b)
          return b.from === b.to ? (
            <div key={b.from} class="cal-day empty">
              <div class="cal-dh">
                <span>{dayHead(L, b.from, today)}</span>
                <span class="none">{t("cal.nothing")}</span>
              </div>
            </div>
          ) : (
            <div key={b.from} class="cal-day empty">
              <div class="cal-dh">
                <span>{dateRun(L, b.from, b.to)}</span>
                <span class="none">{t("cal.nothing")}</span>
              </div>
            </div>
          );
        const day = b.day;
        return (
          <div key={day.date} class="cal-day">
            <div class={one ? "cal-head" : "cal-dh"}>
              <span>{dayHead(L, day.date, today)}</span>
              {!one && !day.events.length && <span class="none">{t("cal.nothing")}</span>}
            </div>
            {day.marks?.length ? <Facts class="cal-marks" items={day.marks} /> : null}
            {day.events.length ? <DayRows day={day} g={g} today={today} clashes={clashes} accounts={accounts} /> : one ? <div class="cal-none">{t("cal.nothing")}</div> : null}
          </div>
        );
      })}
    </section>
  );
}

// ---------- 6.2 the change card ----------

const goWent = (d: DecisionState) => d.resolved?.option === "go" || (!d.resolved && d.pending === "go");

/** Hold, by what would change: a cancel's dismiss never reads 取消 (D212). */
export const calHold = (c: CalChange) => t(`cal.hold.${c.kind}`);

/** The bubble above the card: the ask in a few words, never the title again (D642). */
export function calAsk(c: CalChange): string {
  if (c.kind === "respond") return t(`cal.ask.respond.${c.response ?? "accepted"}`);
  return t(`cal.ask.${c.kind}`);
}

/** The person's date for a change: from the offset its times carry. */
const todayFor = (c: CalChange) => todayIn(undefined, Date.now(), offsetOf(c.start));

/** The leaf's own sign after Go: a check, a cross, a quiet strike for a cancel. */
export function calLeafState(d: DecisionState): "open" | "done" | "failed" | "cancel" {
  const opt = d.resolved?.option ?? d.pending;
  if (!d.cal) return "open";
  const run = A.S.calRuns.get(d.decisionId);
  if (run && (run.state === "failed" || run.state === "denied")) return "failed";
  if (d.cal.kind === "cancel") return "cancel";
  if (opt !== "go") return "open";
  if (run?.state === "done") return "done";
  return "open";
}

/** A change's notification line, only when someone actually hears: a change to someone else's event
 *  (an answer) or an event with people on it. Adding a quiet event to one's own day is silent. */
function notifyShown(c: CalChange): boolean {
  return c.kind === "respond" || c.notify.length > 0;
}

/** The drawn pin before a place. */
const Pin = () => (
  <svg class="cal-pin" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M6 10.8S2.3 7.4 2.3 5.1a3.7 3.7 0 0 1 7.4 0C9.7 7.4 6 10.8 6 10.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
    <circle cx="6" cy="5" r="1.3" fill="currentColor" />
  </svg>
);

/** What will change: the date leaf, its name, when, where, the calendar, the other side and who
 *  hears. One calendar entry, not a status stripe (D642). */
export function CalFacts({ d }: { d: DecisionState }) {
  const c = d.cal!;
  const L = lang();
  const today = todayFor(c);
  const allDayWord = t("cal.allday");
  const leaf = leafParts(L, c.start);
  const sameDay = !!c.was && ymdOf(c.was.start) === ymdOf(c.start) && !c.allDay;
  const their = c.theirZone && !c.allDay ? placeTimeLine(L, c.theirZone, c.start) : "";
  const cal = c.calendar || t("cal.main");
  const whose = c.account ? shortAccount(c.account, [c.account]) : "";
  const notify = !c.notify.length
    ? t("cal.notify.none")
    : c.kind === "respond"
      ? t("cal.notify.organizer", c.organizer || nameList(L, c.notify))
      : c.kind === "create"
        ? t("cal.notify.invite", nameList(L, c.notify))
        : t(c.notify.length === 1 ? "cal.notify.told.one" : "cal.notify.told", andList(L, c.notify));
  return (
    <div class={`cal-change ${c.kind}`}>
      <div class="cc-main">
        <CalLeaf month={leaf.month} day={leaf.day} weekday={leaf.weekday} color={c.color} state={calLeafState(d)} />
        <div class="cc-body">
          <div class="cc-title">{c.title}</div>
          {c.kind === "move" && c.was ? (
            <div class="cc-when move">
              <span class="cc-was">
                {t("cal.was")}{" "}
                <s>{sameDay ? `${hmOf(c.was.start)}–${hmOf(c.was.end)}` : whenWords(L, c.was.start, c.was.end, false, today, allDayWord)}</s>
              </span>
              <span class="cc-new">
                <MoveArrow />
                {sameDay ? `${hmOf(c.start)}–${hmOf(c.end)}` : whenWords(L, c.start, c.end, c.allDay, today, allDayWord)}
              </span>
            </div>
          ) : (
            <div class="cc-when">{whenWords(L, c.start, c.end, c.allDay, today, allDayWord)}</div>
          )}
          {their && <div class="cc-zone">{their}</div>}
          {c.where && (
            <div class="cc-where">
              <Pin />
              <span>{c.where}</span>
            </div>
          )}
          <div class="cc-line in">
            <span class="cal-dot" style={tint(c.color)} aria-hidden="true" />
            <span class="cc-cal">{cal}</span>
            {whose && <span class="cc-whose">{whose}</span>}
          </div>
          {notifyShown(c) && <div class="cc-line notify">{notify}</div>}
          {c.clash && <div class="cc-line clash">{t("cal.clash", c.clash)}</div>}
          {c.online && c.kind === "create" && <div class="cc-line online">{t("cal.online.add")}</div>}
        </div>
      </div>
    </div>
  );
}

/** How a change card settles, in place: under way (with the shared spinner, and words once it is
 *  taking long), done (its link), didn't go through, or held. */
export function CalSettle({ d }: { d: DecisionState }) {
  const c = d.cal!;
  const opt = d.resolved?.option ?? d.pending;
  const run = A.S.calRuns.get(d.decisionId);
  const going = goWent(d) && !run;
  const [mount] = useState(() => Date.now());
  const [, set] = useState(0);
  useEffect(() => {
    if (!going) return;
    const h = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [going]);
  if (opt === "reply") return <div class="cal-settle said">{t("decision.resolved.reply", d.resolved?.text ?? "")}</div>;
  if (!goWent(d) || run?.state === "held")
    return (
      <div class="cal-settle quiet" role="status">
        {t("cal.held")}
      </div>
    );
  const kind = c.kind;
  if (run?.state === "done")
    return (
      <div class="cal-settle done" role="status">
        <span>{t(kind === "respond" ? `cal.done.${c.response ?? "accepted"}` : `cal.done.${kind}`)}</span>
        {run.link && kind !== "cancel" && <Btn kind="text" size="sm" chev label={t("cal.open")} about={c.title} onClick={() => window.open(run.link, "_blank", "noopener")} />}
      </div>
    );
  if (run && (run.state === "failed" || run.state === "denied"))
    return (
      <div class="cal-settle failed" role="status">
        <span class="mark">
          <Cross />
        </span>
        <span>
          {t(`cal.fail.${kind}`)}
          {run.error && <span class="why">{shortReason(run.error)}</span>}
        </span>
        {d.reversible && <Btn kind="text" size="sm" label={t("cal.retry")} about={c.title} onClick={() => A.decide(d.decisionId, "go")} />}
      </div>
    );
  const started = d.answeredAt ?? mount;
  const takingLong = Date.now() - started >= 20_000;
  return (
    <div class={`cal-settle going${takingLong ? " long" : ""}`} role="status">
      <span class="spin" aria-hidden="true" />
      <span>{t(`cal.going.${kind}`)}</span>
      {takingLong && <span class="taking">{t("cal.going.long")}</span>}
    </div>
  );
}

/** One short reason: the first sentence, at most about 80 characters. */
function shortReason(s: string): string {
  const one = s.split(/(?<=[.。!！?？])\s|\n/)[0] ?? s;
  return one.length > 80 ? `${one.slice(0, 78)}…` : one;
}

// ---------- 6.3 the greeting ----------

/** 今天还有 3 个日程，下一个 14:00「Design sync」: one quiet row under the greeting; a tap fills the composer. */
export function TodayRow({ today }: { today: CalToday }) {
  if (!today.left) return null;
  const next = today.next;
  const words =
    (today.left === 1 && next ? t("cal.today.one", hmOf(next.start), next.title) : next ? t("cal.today.many", today.left, hmOf(next.start), next.title) : t("cal.today.count", today.left)) + (today.clash && today.left > 1 ? t("cal.today.clash") : "");
  return (
    <button class="hello-today" onClick={() => A.fillComposer(t("cal.today.ask"))}>
      <CalGlyph />
      <span>{words}</span>
    </button>
  );
}
