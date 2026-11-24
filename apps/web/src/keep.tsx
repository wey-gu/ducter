// D511: 照看 / Looking after (design/standing-work.md §6, the prototype apps/web/demo-standing-work.html).
// A Keep on On hand is one sheet under 看守中: its mark, its title, its facts each its own element
// (D291), its last change, when it wakes next at the right, and the tasks at work on it set in under
// it. What waits for the person stands in 等你 once; the sheet only says how many. A tap opens the
// Keep's own page in the board's place (never Settings, never Bridge): its life, 你说的, 在等你,
// 手上的, 每一轮 (silent rounds folded), a talk box, and 怎么做 with 暂停 and 停下. The receipt
// card under the partner's words when one is made is here too.
import { cutAtWord, foldRounds, keepBeat, type KeepCard, type KeepItem, type KeepPage, type KeepRound, type KeepSheet, type ServerFrame } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { BackRow, Btn, SectionHead, Tag, TimeCol } from "./controls.tsx";
import { ComposerBox, echoed } from "./composer.tsx";
import { clock, colTime, harnessName, spoken, when } from "./format.ts";
import { prFacts, prPhaseWords } from "./onhand-pr.tsx";
import { soon } from "./onhand.tsx";
import { healthLine, interval } from "./past.tsx";
import { DecisionCard } from "./views.tsx";
import { Menu, MenuItem } from "./menu.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** RAIL_COLS: a title in the rail, two lines at its width (Han counts two), cut at a word's end past them. */
const RAIL_COLS = 38;

/** The Keep whose page is open (absent: On hand's list), the pages read, and the page's own state (talk: the words being typed, the clientId in flight, the Keep last told). */
export const K = { open: "", pages: new Map<string, KeepPage>(), pause: false, stop: false, undone: new Set<string>(), sig: "", askedAt: 0, talk: { text: "", sending: "", at: 0, sent: "" } };

/** Opens a Keep's page in the board's place, and asks the home for it. */
export function openKeep(id: string) {
  K.open = id;
  K.pause = K.stop = false;
  K.talk = { text: "", sending: "", at: 0, sent: "" };
  A.send({ t: "keep", id });
  if (A.route.name !== "onhand") A.go({ name: "onhand" });
  else A.changed();
}

export function closeKeep() {
  K.open = "";
  K.pause = K.stop = false;
  A.changed();
}

export function onKeepFrame(f: Extract<ServerFrame, { t: "keep_result" }>) {
  if (f.keep) K.pages.set(f.id, f.keep);
  else K.pages.delete(f.id);
  A.changed();
}

// ---------- the mark ----------

/**
 * The mark (§8): a lantern, lit while on, a beat when a round did something, dim when paused, out
 * with a tick when done, out when stopped. A flat placeholder until the clay art is rated: the one
 * place a Keep's mark is drawn, so the art (or the track) takes its place here alone.
 */
export const MARK: "lantern" = "lantern";
export function KeepMark({ life, size = 40, beat }: { life: KeepSheet["life"]; size?: number; beat?: boolean }) {
  const out = life === "done" || life === "stopped";
  const glow = life === "on" ? 1 : life === "paused" ? 0.32 : 0;
  return (
    <span class={`kp-mark${beat && life === "on" ? " beat" : ""}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <path d="M15 7.5a5 5 0 0 1 10 0" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-linecap="round" />
        <path d="M12.5 12h15l-2-4h-11z" fill="var(--ink-soft)" />
        <rect x="11" y="12" width="18" height="21" rx="5" fill={out ? "var(--sunken)" : "var(--waiting-surface)"} stroke="var(--ink-soft)" stroke-width="2" />
        <circle class="kp-glow" cx="20" cy="23" r="8" fill="var(--waiting-dot)" opacity={glow * 0.55} />
        <path d="M17.5 25.5c0-3 2.5-4 2.5-7 1.6 2 2.5 3.6 2.5 6a2.5 2.5 0 0 1-5 1z" fill={out ? "var(--faint)" : "var(--accent)"} opacity={out ? 0.5 : glow || 0.35} />
        <path d="M10 33h20" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round" />
        {life === "done" && (
          <>
            <circle cx="31" cy="31" r="7" fill="var(--done-dot)" stroke="var(--surface)" stroke-width="2" />
            <path d="M27.8 31.2l2.2 2.1 4-4.3" fill="none" stroke="var(--done-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}

// ---------- the words of a Keep ----------

/** A round counts as a beat for an hour after it did something (told or asked). */
const beatNow = (k: KeepSheet, now = Date.now()) => !!k.line && now - Date.parse(k.line.at) < 60 * 60_000;

/** Its facts, each its own element: what it holds, what waits, its rhythm, a short goal. */
export function keepFacts(k: KeepSheet): { text: string; tone?: "needs" }[] {
  const out: { text: string; tone?: "needs" }[] = [];
  const work = k.items.filter((x) => x.at !== "you" && x.at !== "ready");
  if (k.run === "perItem" && k.items.length) out.push({ text: k.items.every((x) => x.pr) ? t("keep.holds.pr", k.items.length) : t("keep.holds", k.items.length) });
  else if (k.run === "fresh" && work.length > 1) out.push({ text: t("keep.holds", work.length) });
  if (k.asks) out.push({ text: t("keep.asks", k.asks), tone: "needs" });
  if (k.everyMs) out.push({ text: t("keep.every", interval(k.everyMs)) });
  else if (k.cadence) out.push({ text: k.cadence });
  if (k.reviews?.waiting) out.push({ text: t("keep.reviews", k.reviews.waiting) });
  if (k.until && [...k.until].length <= 24) out.push({ text: k.until });
  return out;
}

/** Its line: how it keeps time when it doesn't; else its last change. */
export function keepLine(k: KeepSheet): string {
  if (k.health) return healthLine(k.health).join("");
  if (k.line) return t("keep.line", clock(k.line.at), k.line.text);
  return "";
}

/** At its right edge: when it wakes next, or why it doesn't. */
export function keepBeatWords(k: KeepSheet, now = Date.now()): string {
  switch (keepBeat(k)) {
    case "arrives":
      return t("keep.beat.arrives");
    case "next":
      return t("keep.beat.next", soon(k.nextAt!, now));
    case "running":
      return t("keep.beat.running");
    case "paused":
      return k.pausedUntil ? t("keep.beat.pausedUntil", soon(k.pausedUntil, now)) : t("keep.beat.paused");
    case "ended":
      return t(`keep.life.${k.life}`);
    default:
      return "";
  }
}

const itemWords = (x: KeepItem): { text: string; tone: "needs" | "ok" | "work" | "" } =>
  x.at === "ready" ? { text: t("keep.item.ready"), tone: "ok" } : x.at === "you" ? { text: x.yours || t("keep.item.you"), tone: "needs" } : x.said ? { text: prPhaseWords(x.said), tone: "work" } : { text: t(`keep.item.${x.at}`), tone: x.at === "work" ? "work" : "" };

const prNum = (pr?: string) => (pr ? pr.replace(/^.*#/, "#") : "");

// ---------- On hand: one sheet ----------

/** One Keep under 看守中: its head opens its page; its tasks at work nest under it (up to three). */
export function KeepSheetCard({ k, stacked }: { k: KeepSheet; stacked: boolean }) {
  const facts = keepFacts(k);
  const line = k.run === "perItem" && !k.health ? "" : keepLine(k);
  const beat = keepBeatWords(k);
  const nested = k.run === "perItem" ? k.items.filter((x) => x.at !== "you" && x.at !== "ready") : [];
  const shown = nested.slice(0, 3);
  return (
    <div class={`kp-sheet${k.life === "paused" ? " paused" : ""}`} data-keep={k.id}>
      <button class="kp-head" onClick={() => openKeep(k.id)} aria-label={spoken(A.L, t("keep.open", k.title), ...facts.map((f) => f.text), beat)}>
        <KeepMark life={k.life} beat={beatNow(k)} />
        <span class="kp-tx">
          <span class="kp-title">{k.title}</span>
          {facts.length > 0 && (
            <span class="kp-facts">
              {facts.map((f) => (
                <span key={f.text} class={f.tone ? `f ${f.tone}` : "f"}>
                  {f.text}
                </span>
              ))}
            </span>
          )}
          {line && <span class={`kp-line${k.health ? " late" : ""}`}>{line}</span>}
          {stacked && beat && <span class="kp-beat">{beat}</span>}
        </span>
        {!stacked && beat && <span class="kp-beat">{beat}</span>}
      </button>
      {shown.length > 0 && (
        <div class="kp-held">
          {shown.map((x) => {
            const w = itemWords(x);
            return (
              <button key={x.pr ?? x.taskId} class="kp-h" onClick={() => A.go({ name: "task", id: x.taskId })} title={x.title}>
                <i class={`kp-dot ${x.at}`} aria-hidden="true" />
                <span class="n">
                  {x.pr && !x.title.includes(prNum(x.pr)) && <b>{prNum(x.pr)}</b>}
                  <span>{x.title}</span>
                </span>
                <span class={`s ${w.tone}`}>{w.text}</span>
              </button>
            );
          })}
          {nested.length > shown.length && (
            <button class="kp-more" onClick={() => openKeep(k.id)}>
              {t("keep.more", nested.length - shown.length)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- its page ----------

const PAUSES: { key: string; until: (now: number) => string | undefined }[] = [
  { key: "keep.pause.hour", until: (now) => new Date(now + 60 * 60_000).toISOString() },
  {
    key: "keep.pause.morning",
    until: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    },
  },
  { key: "keep.pause.week", until: (now) => new Date(now + 7 * 86_400_000).toISOString() },
  { key: "keep.pause.resume", until: () => undefined },
];

const act = (id: string, a: { action: "pause"; until?: string } | { action: "resume" } | { action: "look_now" } | { action: "stop" }) => {
  K.pause = K.stop = false;
  A.send({ t: "keep_action", id, ...a });
  A.changed();
};

function wokeWords(r: KeepRound, k: KeepPage): string {
  switch (r.woke) {
    case "arrival":
      return r.wokeWhat ? t("keep.woke.arrival", r.wokeWhat) : t("keep.woke.arrival.bare");
    case "change":
      return r.wokeWhat ? t("keep.woke.change", r.wokeWhat) : t("keep.woke.change.bare");
    case "now":
      return t("keep.woke.now");
    case "first":
      return t("keep.woke.first");
    default:
      return k.everyMs ? t("keep.woke.every", interval(k.everyMs)) : t("keep.woke.time");
  }
}

const outWords = (r: KeepRound) => (r.state === "running" ? t("keep.round.running") : r.state === "failed" ? t("keep.round.failed") : r.state === "skipped" ? t("keep.round.skipped") : t(`keep.round.${r.spoke}`));

/** D519: one round: its time in the column, what woke it, what happened in one line to the person
 *  (the model's, once it has read the report), how it ended; the report as the task wrote it to
 *  Ducter only behind 看细节, with the way to its task. */
function Round({ r, k, open, onToggle }: { r: KeepRound; k: KeepPage; open: boolean; onToggle: () => void }) {
  const more = !!r.report;
  return (
    <div class={`kp-rd${open ? " open" : ""}`}>
      <TimeCol at={r.at} text={colTime(A.L, r.at)} />
      <span class="body">
        <span class="why">{wokeWords(r, k)}</span>
        {r.did && <span class="did">{r.did}</span>}
        {open && (
          <span class="kp-detail">
            {r.report && <span class="rep">{r.report}</span>}
            {r.taskId && <Btn kind="text" size="sm" chev label={t("keep.item.task")} onClick={() => A.go({ name: "task", id: r.taskId! })} />}
          </span>
        )}
      </span>
      <span class="end">
        <span class={`out o-${r.spoke}${r.state === "failed" ? " failed" : ""}`}>{outWords(r)}</span>
        {more && <Btn kind="text" size="sm" chev expanded={open} label={t("keep.round.details")} onClick={onToggle} />}
      </span>
    </div>
  );
}

function Rounds({ k }: { k: KeepPage }) {
  const [open, setOpen] = useState("");
  if (!k.rounds.length) return <p class="kp-empty">{t("keep.rounds.none")}</p>;
  return (
    <div class="kp-card kp-rounds">
      {foldRounds(k.rounds).map((x, i) => {
        if ("fold" in x)
          return (
            <div key={`f${i}`} class="kp-quiet">
              <span class="pips" aria-hidden="true">
                {Array.from({ length: Math.min(6, x.fold) }, (_, j) => (
                  <i key={j} />
                ))}
              </span>
              <span>{t("keep.rounds.fold", x.fold)}</span>
            </div>
          );
        const id = `${x.round.at}|${x.round.taskId ?? ""}`;
        return <Round key={id} r={x.round} k={k} open={open === id} onToggle={() => setOpen(open === id ? "" : id)} />;
      })}
    </div>
  );
}

function Items({ k }: { k: KeepPage }) {
  if (!k.items.length) return <p class="kp-empty">{t("keep.holding.none")}</p>;
  return (
    <div class="kp-card">
      {k.items.map((x) => {
        const w = itemWords(x);
        const facts = x.said ? prFacts(x.said) : [];
        const checks = x.said?.checks;
        return (
          <div key={x.pr ?? x.taskId} class="kp-item">
            <i class={`kp-dot big ${x.at}`} aria-hidden="true" />
            <span class="body">
              <span class="t">
                {x.pr && !x.title.includes(prNum(x.pr)) && <b>{prNum(x.pr)}</b>}
                <span>{x.title}</span>
              </span>
              <span class={`st ${w.tone}`}>{w.text}</span>
              {checks && checks.total > 0 && (
                <span class="kp-checks" aria-label={facts.join(" ")}>
                  {Array.from({ length: Math.min(checks.total, 24) }, (_, j) => (
                    <i key={j} class={j < checks.passed ? "" : j < checks.passed + checks.pending ? "p" : "f"} />
                  ))}
                </span>
              )}
              {x.said?.by && x.said.phase === "ready" && <span class="by">{t("onhand.prs.approved", x.said.by.join(t("onhand.prs.sep")))}</span>}
            </span>
            <span class="acts">
              {x.pr && <Btn kind="text" size="sm" label={t("keep.item.pr")} onClick={() => window.open(`https://github.com/${x.pr!.replace("#", "/pull/")}`, "_blank", "noopener")} />}
              <Btn kind="text" size="sm" label={t("keep.item.task")} onClick={() => A.go({ name: "task", id: x.taskId })} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function wakeLines(k: KeepPage): string[] {
  return k.wakes.map((w) =>
    w.kind === "arrives" ? t("keep.wake.arrives") : w.kind === "every" ? t("keep.every", interval(w.everyMs)) : w.kind === "at" ? w.words : w.words ? t("keep.wake.changes", w.words) : t("keep.wake.changes.prs"),
  );
}

function HowItRuns({ k }: { k: KeepPage }) {
  const ended = k.life === "done" || k.life === "stopped";
  const where = [k.where?.deviceName ?? (k.where ? t("keep.where.home") : ""), k.where?.harness ? harnessName(k.where.harness) : ""].filter(Boolean);
  const rules: { k: string; v: string[]; muted?: string }[] = [
    { k: "keep.rule.wakes", v: wakeLines(k) },
    // Its end as the person gave it, or as the model read it from their words; nothing until it has (never a guess).
    ...(k.until || k.noEnd ? [{ k: "keep.rule.until", v: [k.until ?? t("keep.until.none")] }] : []),
    { k: "keep.rule.speaks", v: [k.speaks ?? t("keep.speaks.default")], muted: t("keep.speaks.quiet") },
    ...(k.limits || k.run === "perItem" ? [{ k: "keep.rule.limits", v: [k.limits ?? t("keep.limits.helper")] }] : []),
    ...(where.length ? [{ k: "keep.rule.where", v: [where.join(t("keep.where.sep"))] }] : []),
    ...(k.address ? [{ k: "keep.rule.address", v: [t("keep.address.name", k.address.name)], muted: t(`keep.address.${k.address.mem}`) }] : []),
  ];
  return (
    <div class="kp-card kp-rules">
      {rules.map((r) => (
        <div key={r.k} class="ru">
          <span class="k">{t(r.k)}</span>
          {r.v.map((v) => (
            <span key={v} class="v">
              {v}
            </span>
          ))}
          {r.muted && <span class="v m">{r.muted}</span>}
        </div>
      ))}
      {!ended && (
        <div class="acts">
          {k.life === "paused" ? (
            <Btn kind="secondary" size="sm" grow label={t("keep.resume")} onClick={() => act(k.id, { action: "resume" })} />
          ) : (
            <Btn kind="secondary" size="sm" grow chev expanded={K.pause} label={t("keep.pause")} onClick={() => ((K.pause = !K.pause), (K.stop = false), A.changed())} />
          )}
          {k.life === "on" && !k.wakes.every((w) => w.kind === "arrives" || (w.kind === "changes" && !w.words)) && <Btn kind="secondary" size="sm" grow label={t("keep.look")} onClick={() => act(k.id, { action: "look_now" })} />}
          <Btn kind="secondary" size="sm" grow class="stop" label={t("keep.stop")} onClick={() => ((K.stop = !K.stop), (K.pause = false), A.changed())} />
        </div>
      )}
      {K.pause && (
        <Menu class="kp-menu" label={t("keep.pause")} focusFirst onClose={() => ((K.pause = false), A.changed())}>
          {PAUSES.map((p) => (
            <MenuItem key={p.key} onClick={() => act(k.id, { action: "pause", ...((u) => (u ? { until: u } : {}))(p.until(Date.now())) })}>
              {t(p.key)}
            </MenuItem>
          ))}
        </Menu>
      )}
      {K.stop && (
        <div class="kp-stop">
          <p>{t("keep.stop.ask")}</p>
          <span class="acts">
            <Btn kind="primary" size="sm" class="stop" label={t("keep.stop.go")} onClick={() => act(k.id, { action: "stop" })} />
            <Btn kind="secondary" size="sm" label={t("keep.stop.keep")} onClick={() => ((K.stop = false), A.changed())} />
          </span>
        </div>
      )}
    </div>
  );
}

/** How long the talk box waits for the home to have the words before it gives them back. */
const SEND_WAIT_MS = 10_000;

/** D519: the talk box is the conversation's composer (composer.tsx): the same card, the same round
 *  send. Sending: the words wait greyed and the send is pressed in until the home has them; then the
 *  box empties and one line says the partner has it. */
function Talk({ k }: { k: KeepPage }) {
  const tk = K.talk;
  const example = k.run === "perItem" ? t("keep.talk.helper") : k.everyMs ? t("keep.talk.every") : t("keep.talk.at");
  if (tk.sending && (echoed(tk.sending) || Date.now() - tk.at > SEND_WAIT_MS)) {
    const got = echoed(tk.sending);
    tk.sending = "";
    if (got) (tk.text = ""), (tk.sent = k.id);
  }
  const send = () => {
    const v = tk.text.trim();
    if (!v || tk.sending) return;
    tk.sending = `p${Date.now().toString(36)}keep`;
    tk.at = Date.now();
    tk.sent = "";
    A.send({ t: "send", text: v, clientId: tk.sending, keep: k.id });
    setTimeout(() => A.changed(), SEND_WAIT_MS + 50);
    A.changed();
  };
  const place = t("keep.talk", example);
  return (
    <div class="kp-talk">
      <ComposerBox id="keep-talk" value={tk.text} onInput={(v) => ((tk.text = v), (tk.sent = ""), A.changed())} onSend={send} sending={!!tk.sending} label={place} placeholder={place} />
      {tk.sent === k.id && !tk.text && (
        <p class="kp-sent" role="status">
          {t("keep.talk.sent", A.S.personaName)}
        </p>
      )}
    </div>
  );
}

/** The other Keeps beside an opened one (the rail beside an opened task, D244), wide only: each its
 *  mark, its title in two lines cut at a word's end, and one line; every row the same height, the
 *  open one raised as the knob. */
export function KeepRail() {
  const ks = A.S.onHand?.keeps ?? [];
  return (
    <aside class="kp-rail" aria-label={t("keep.section")}>
      <BackRow label={t("keep.back")} onClick={closeKeep} />
      <SectionHead label={t("keep.section")} />
      {ks.map((k) => {
        const facts = keepFacts(k).filter((f) => f.tone === "needs");
        return (
          <button key={k.id} class={`k${k.id === K.open ? " on" : ""}`} onClick={() => openKeep(k.id)} aria-current={k.id === K.open ? "page" : undefined} title={k.title}>
            <KeepMark life={k.life} size={32} />
            <span class="kp-rtx">
              <span class="t">{cutAtWord(k.title, RAIL_COLS)}</span>
              <span class={facts.length ? "l needs" : "l"}>{facts[0]?.text ?? keepBeatWords(k)}</span>
            </span>
          </button>
        );
      })}
    </aside>
  );
}

/** A Keep's own page, in the board's place. */
export function KeepPageView({ room }: { room: string }) {
  const k = K.pages.get(K.open);
  const sheet = (A.S.onHand?.keeps ?? []).find((x) => x.id === K.open);
  // The page follows On hand: asked again when its sheet changed, or when the first ask went before the home was there.
  const sig = `${K.open}|${JSON.stringify(sheet ?? null)}`;
  if (sig !== K.sig || (!k && Date.now() - K.askedAt > 1500)) {
    K.sig = sig;
    K.askedAt = Date.now();
    queueMicrotask(() => A.send({ t: "keep", id: K.open }));
  }
  if (!k) return <div class="kp-page loading">{sheet ? t("keep.loading") : t("keep.gone")}</div>;
  const wide = room === "full";
  // Its tasks' questions (its items', and its own loop's: D519), each once.
  const decisions = k.decisions.flatMap((id) => {
    const taskId = [...new Set([...k.taskIds, ...k.items.map((x) => x.taskId)])].find((x) => A.S.pendingDecision(x)?.decisionId === id);
    const d = taskId ? A.S.pendingDecision(taskId) : undefined;
    return d && taskId ? [{ d, taskId }] : [];
  });
  const chips: { text: string; tone: "on" | "needs" | "" }[] = [
    { text: t(`keep.life.${k.life}`), tone: k.life === "on" ? "on" : "" },
    ...(k.asks ? [{ text: t("keep.asks", k.asks), tone: "needs" as const }] : []),
    { text: t("keep.since", when(A.L, k.since)), tone: "" },
    ...(k.run === "perItem" && k.week ? [{ text: t("keep.week", k.week), tone: "" as const }] : []),
  ];
  return (
    <div class={`kp-page${wide ? " wide" : ""}`}>
      {!wide && <BackRow label={t("keep.back")} onClick={closeKeep} />}
      <div class="kp-main">
        <header class="kp-ph">
          <KeepMark life={k.life} size={64} beat={beatNow(k)} />
          <div>
            <p class="kick">{t("keep.kicker", A.S.personaName)}</p>
            <h1>{k.title}</h1>
            <p class="kp-life">
              {chips.map((c) => (
                <Tag key={c.text} text={c.text} tone={c.tone} />
              ))}
            </p>
          </div>
        </header>
        <div class="kp-said">
          <b>{t("keep.said")}</b>
          <span>{k.said}</span>
        </div>
        {decisions.length > 0 && (
          <>
            <SectionHead label={t("keep.waiting")} />
            {decisions.map(({ d, taskId }) => (
              <DecisionCard key={d.decisionId} d={d} taskId={taskId} />
            ))}
          </>
        )}
        {/* A Keep in rounds is its one task, never an item: it holds something only when that task keeps a PR open (D519). */}
        {(k.run !== "same" || k.items.length > 0) && <SectionHead label={t("keep.holding")} />}
        {(k.run !== "same" || k.items.length > 0) && <Items k={k} />}
        <SectionHead label={t("keep.rounds")} />
        <Rounds k={k} />
        {k.life !== "done" && k.life !== "stopped" && <Talk k={k} />}
      </div>
      <div class="kp-side">
        <SectionHead label={t("keep.how")} />
        <HowItRuns k={k} />
      </div>
    </div>
  );
}

// ---------- the receipt card under the partner's words ----------

/** D511: the first-made moment: the lantern lighting up once, its four lines, the first round's
 *  result, and 打开 · 改一下 · 撤销 (each its own button). */
export function KeepReceipt({ card }: { card: KeepCard }) {
  const undone = card.undone || K.undone.has(card.id);
  const rows = [
    { k: "keep.card.when", v: card.when },
    ...(card.speaks ? [{ k: "keep.card.speaks", v: card.speaks }] : []),
    ...(card.until ? [{ k: "keep.card.until", v: card.until }] : []),
    ...(card.where ? [{ k: "keep.card.where", v: card.where }] : []),
  ];
  return (
    <div class={`kp-receipt${undone ? " undone" : ""}`}>
      <div class="hd">
        <span class="lit-up">
          <KeepMark life={undone ? "stopped" : "on"} />
        </span>
        <span class="kp-rtx">
          <span class="kick">{t(undone ? "keep.life.stopped" : "keep.life.on")}</span>
          <span class="t">{card.title}</span>
        </span>
      </div>
      <div class="kp-rrows">
        {rows.map((r) => (
          <div key={r.k} class="kp-rrow">
            <span class="k">{t(r.k)}</span>
            <span class="v">{r.v}</span>
          </div>
        ))}
      </div>
      {card.first && !undone && <p class="first">{t("keep.card.first", card.first)}</p>}
      {undone ? (
        <p class="first">{t("keep.card.undone")}</p>
      ) : (
        <div class="acts">
          <Btn kind="secondary" size="sm" label={t("keep.card.open")} onClick={() => openKeep(card.id)} />
          <Btn kind="text" size="sm" label={t("keep.card.change")} onClick={() => A.fillComposer(t("keep.card.change.fill", card.title))} />
          <Btn kind="text" size="sm" label={t("keep.card.undo")} onClick={() => (K.undone.add(card.id), A.send({ t: "keep_action", id: card.id, action: "stop" }), A.changed())} />
        </div>
      )}
      {card.firstEver && !undone && <p class="ever">{t("keep.card.firstEver")}</p>}
    </div>
  );
}

A.openKeep = openKeep;
A.onKeepFrame = onKeepFrame;
