// An opened task as a conversation with the agent, turn by turn (D210, after D152; D268): each
// turn opens with what someone said to the agent (the brief as a quiet folded card, your words, the
// partner's) and holds its answer in order: its words at the reading measure, and between them its
// steps, a run of them as one line in words ("Read 9 files, ran 2 commands"), a failure said in
// words, a subagent and thinking each their own line, each opening to what it holds. A finished
// turn folds under how long it worked; while it works, the working line ends the transcript.
// @ducter/protocol's transcript.ts builds the turns (keys hidden there too) and steps.ts names the
// steps, the same on every harness and on the Mac.
import type { Place } from "@ducter/protocol";
import { HIDDEN, redact } from "@ducter/protocol/src/redact.ts";
import { unwrapShell, type Step } from "@ducter/protocol/src/steps.ts";
import { blocksOf, inTurn, lastSeq, latestVoice, serviceName, turnsOf, type Block, type Line, type StepRow, type Tally, type Turn } from "@ducter/protocol/src/transcript.ts";
import { tokensShort } from "@ducter/protocol";
import type { MediaRef, WaiterView } from "@ducter/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import { WaitHow, waitLine } from "./work.tsx";
import { clock, shownDeviceName } from "./format.ts";
import { Component, type JSX } from "preact";
import { Btn, Chev, Facts } from "./controls.tsx";
import { escArmed } from "./esc.ts";
import { A, effortWord } from "./app.ts";
import { duration, harnessName, modelName } from "./format.ts";
import { markdown } from "./markdown.ts";
import { MediaBlock } from "./media.tsx";
import { attention, effortOf, finished, harnessOf, modelOf, placeOf, title, type Task } from "./store.ts";
import { manyComputers, taskWhere } from "./where.ts";

export { goRelay } from "@ducter/protocol/src/transcript.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const has = (key: string) => A.L.t(key) !== key;

// ---------- words ----------

/** The Go button's words: the action when it is a short verb ("好，继续" / "Continue"), else plain
 *  好 / Go; never a sentence with a full stop (D127). */
export function shortGo(label: string | undefined): string {
  const l = (label ?? "").trim().replace(/[.。!！]+$/, "").trim();
  if (!l || !shortVerb(l)) return t("decision.go");
  return t("decision.go.label", !A.L.style.cased ? l : l.charAt(0).toUpperCase() + l.slice(1));
}

/** At most 6 Chinese characters or 3 English words, and no sentence in it. */
export function shortVerb(l: string): boolean {
  if (/[，,；;：:。]/.test(l)) return false;
  const words = l.split(/\s+/).filter(Boolean).length;
  const han = [...l].filter((c) => c.codePointAt(0)! >= 0x2e80).length;
  return han > 0 ? han <= 6 && words <= 2 : words <= 3;
}

/** A task's title as a card says it: what it is, without the parenthetical details. */
export function shortTitle(title: string): string {
  let s = title.trim();
  for (const [o, c] of [["（", "）"], ["(", ")"], ["【", "】"], ["[", "]"]] as const) {
    for (;;) {
      const i = s.indexOf(o);
      if (i < 0) break;
      const j = s.indexOf(c, i);
      if (j < 0) break;
      const cut = `${s.slice(0, i)} ${s.slice(j + c.length)}`.trim();
      if (!cut) break;
      s = cut;
    }
  }
  s = s.split(/\s+/).join(" ").replace(/[ ,，:：\-—]+$/, "");
  return s || title.trim();
}

/** A step's summary in words: "在 Chrome 里打开 appstoreconnect.apple.com". */
export function stepWords(st: Step): string {
  if (st.kind === "edited" && st.more) return t("step.edited.more", st.target ?? "", st.more);
  const key = `step.${st.kind}${st.act ? `.${st.act}` : ""}`;
  const tr = (k: string): string | undefined => {
    const v = A.L.t(k);
    if (v === k) return undefined;
    return v.includes("%[") ? A.L.t(k, st.target ?? "", st.app ?? "") : v;
  };
  if (st.app) {
    const v = tr(`${key}.app`);
    if (v !== undefined) return v;
  }
  if (!st.target) {
    const v = tr(`${key}.bare`);
    if (v !== undefined) return v;
  }
  const v = tr(key);
  if (v !== undefined && (st.target || !A.L.t(key).includes("%[1]"))) return v;
  return st.target || t(`step.label.${st.kind}`);
}

/** An English step starts on a capital: a step is its own line (D210). */
const capFirst = (s: string) => (!A.L.style.cased || !s ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** A command, a path, a pattern: it reads in mono on the inline code tint. */
const codeLike = (st: Step) => !!st.target && !st.act && ["ran", "read", "edited", "searched"].includes(st.kind);

/** A step's sentence and, apart, the code it names (in mono): the agent's own words when its
 *  harness gave them; "没找到 nmem" for a probe that found nothing; "运行 nmem doctor". */
export function rowWords(r: StepRow): [string, string] {
  // A thought says its first heading (D291: never the label joined to it).
  if (!r.step) return [(r.thought ?? "").split("\n")[0] || t("step.label.thought"), ""];
  const st = r.step;
  if (r.outcome === "missing") {
    const base = `step.${st.kind}${st.act ? `.${st.act}` : ""}.missing`;
    const k = st.act === "cmd" && (st.target ?? "").includes(" ") ? `${base}.some` : base;
    return has(k) ? [t(k, st.target ?? ""), ""] : [t("step.missing"), st.target ?? ""];
  }
  // D210: its own words, and beside them what it ran.
  if (st.says) return [st.says, unwrapShell(r.command ?? "").split("\n")[0]!];
  if (codeLike(st)) return [t(`step.label.${st.kind}`), st.target!];
  return [capFirst(stepWords(st)), ""];
}

// ---------- marks ----------

const G = (p: { children: JSX.Element | JSX.Element[] }) => (
  <svg class="g" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    {p.children}
  </svg>
);
const GLYPHS: Record<string, () => JSX.Element> = {
  ran: () => <G><path d="M3 4.5 6.5 8 3 11.5M8.5 12h5" /></G>,
  read: () => <G><path d="M3.5 2h6.5l2.5 2.5V14h-9z M6 8h4M6 11h4" /></G>,
  edited: () => <G><path d="M3 13l.8-3.4 6.8-6.8 2.6 2.6-6.8 6.8z M8.8 4.6l2.6 2.6" /></G>,
  searched: () => <G><circle cx="7" cy="7" r="4.2" /><path d="M10.1 10.1 13 13" /></G>,
  browsed: () => <G><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2q-3.6 6 0 12M8 2q3.6 6 0 12" /></G>,
  computer: () => <G><rect x="1.5" y="3" width="13" height="8" rx="1.6" /><path d="M8 11v3M5 14h6" /></G>,
  waited: () => <G><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.8" /></G>,
  delegated: () => <G><path d="M2.5 8h11M9.5 4l4 4-4 4" /></G>,
  other: () => <G><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" /></G>,
  thought: () => <G><circle cx="3.5" cy="8" r="1.3" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" stroke="none" /></G>,
  error: () => <G><path d="M4 4l8 8M12 4l-8 8" /></G>,
  flag: () => <G><path d="M4.5 14V2.5l8 2.5-8 2.5" /></G>,
  key: () => <G><circle cx="5" cy="8" r="2.8" /><path d="M7.8 8H14M12 8v2.6M14 8v2" /></G>,
  chev: () => <G><path d="M6 3.5 10.5 8 6 12.5" /></G>,
  group: () => <G><path d="M3 4.5h10M3 8h10M3 11.5h6" /></G>,
};

/** A step's drawn mark by its kind (D216: On hand's latest line uses the transcript's marks). */
export const StepMark = ({ k }: { k: string }) => (GLYPHS[k] ?? GLYPHS.other)!();

/** An ask's default as a small kitchen timer: a rim, and the time still left as a wedge. */
export function TimerPie({ frac }: { frac: number }) {
  const f = Math.max(0, Math.min(1, frac));
  const r = 5.5;
  const a = -Math.PI / 2 + 2 * Math.PI * f;
  const x = 8 + r * Math.cos(a), y = 8 + r * Math.sin(a);
  return (
    <svg class="pie" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45" />
      {f >= 0.999 ? <circle cx="8" cy="8" r={r} class="left" /> : f > 0 && <path class="left" d={`M8 8V${8 - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} />}
    </svg>
  );
}

// ---------- the blocks ----------

const working = (task: Task) => ["working", "queued"].includes(attention(task));
// Blocks are made once per change of the task's events (D210): a frame that changes nothing in
// the task (the clock's tick, another task's event) reuses them, and so do the turns' memo.
const blockCache = new WeakMap<Task, { n: number; last: number; live: boolean; blocks: Block[]; turns: Turn[]; inTurn: boolean }>();
const memo = (task: Task) => {
  const live = working(task);
  const last = task.events.at(-1)?.seq ?? 0;
  const c = blockCache.get(task);
  if (c && c.n === task.events.length && c.last === last && c.live === live) return c;
  // D271: its last stretch is live only while a turn is under way.
  const now = inTurn(task.events);
  const blocks = blocksOf(harnessOf(task), task.events, live && now);
  const m = { n: task.events.length, last, live, blocks, turns: turnsOf(blocks), inTurn: now };
  blockCache.set(task, m);
  return m;
};
export const taskBlocks = (task: Task): Block[] => memo(task).blocks;
/** The task's turns, made with its blocks (D271). */
export const taskTurns = (task: Task): Turn[] => memo(task).turns;
/** Whether a turn is under way now: something since its last turn ended (D271). */
export const taskInTurn = (task: Task): boolean => working(task) && memo(task).inTurn;

/** The brief, or what the partner passed on: a quiet card under who said it, three lines until
 *  opened; a hidden key said so; its pictures small under the words. */
function PromptCard({ task, b, label }: { task: Task; b: Block & { text: string; media?: MediaRef[] }; label: string }) {
  const [open, setOpen] = useState(false);
  const long = b.text.split("\n").length > 3 || [...b.text].length > 180;
  const hidden = b.text.includes(HIDDEN);
  return (
    <section class={`brief${open ? " open" : ""}`} aria-label={label}>
      <small>{label}</small>
      <div class="brief-text">{b.text}</div>
      {b.media?.length ? <MediaBlock media={b.media} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
      {(hidden || long) && (
        <div class="brief-foot">
          {hidden && (
            <span class="hidden-key">
              {GLYPHS.key!()}
              {t("secret.hidden")}
            </span>
          )}
          <span class="grow" />
          {long && (
            <button class="qlink" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? t("task.asked.less") : t("task.asked.more")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** At most this many lines of a step's output show before "n more lines". */
const OUTPUT_LINES = 12;

/** What a step ran and printed: its first lines, the rest on a tap. */
function Output({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const lines = text.split("\n");
  const cut = !all && lines.length > OUTPUT_LINES;
  return (
    <div class="raw">
      <pre>{cut ? lines.slice(0, OUTPUT_LINES).join("\n") : text}</pre>
      {cut && (
        <button class="qlink more" onClick={() => setAll(true)}>
          {t("step.lines.more", lines.length - OUTPUT_LINES)}
        </button>
      )}
    </div>
  );
}

/** An edit's lines (D210): what it put in on the done tint, what it took out on the failed tint. */
function Diff({ r }: { r: StepRow }) {
  return (
    <div class="diff" role="group" aria-label={t("step.label.edited")}>
      {r.diff!.map((l, i) =>
        l.startsWith("@@ ") ? (
          <div key={i} class="dl head">
            {l.slice(3)}
          </div>
        ) : l === "@@" ? (
          <div key={i} class="dl gap" aria-hidden="true">
            ⋯
          </div>
        ) : (
          <div key={i} class={`dl${l[0] === "+" ? " add" : l[0] === "-" ? " del" : ""}`}>
            <span class="sign" aria-hidden="true">
              {l[0] === "-" ? "−" : l[0] === "+" ? "+" : " "}
            </span>
            {l.slice(1)}
          </div>
        ),
      )}
      {r.diffMore ? <div class="dl gap">{t("step.lines.more", r.diffMore)}</div> : null}
    </div>
  );
}

// ---------- D268: a run in words, a failure in words, how long ----------

/** A span of time as a person says it: "4 秒", "3 分 12 秒" / "4s", "3m 12s". */
export function dur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t("dur.s", s);
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? t("dur.ms", m, s % 60) : t("dur.m", m);
  return t("dur.hm", Math.floor(m / 60), m % 60);
}

/** A run of steps in one line (D268): at most two phrases, in the tally's priority, the rest counted. */
export function groupWords(tally: Tally[]): string {
  const one = (x: Tally) => (x.kind === "used" ? (x.n === 1 ? t("tally.used.one", x.name ?? "") : t("tally.used", x.name ?? "", x.n)) : x.n === 1 ? t(`tally.${x.kind}.one`) : t(`tally.${x.kind}`, x.n));
  const rest = tally.slice(2).reduce((a, x) => a + x.n, 0);
  const s = tally.slice(0, 2).map(one).join(t("tally.and")) + (rest ? (rest === 1 ? t("tally.rest.one") : t("tally.rest", rest)) : "");
  return capFirst(s);
}

/** What a step is doing now, present tense (D268): its words, and apart the subject it names (in mono). */
export function liveRow(r: StepRow): [string, string] {
  if (!r.step) return [t("live.thinking"), ""];
  const st = r.step;
  if (st.kind === "other" && st.via) return [t("live.used", serviceName(st.via)), ""];
  const subject = st.kind === "ran" ? unwrapShell(r.command ?? "").split("\n")[0]! || st.target || "" : st.target ?? "";
  if (subject && !st.act && ["ran", "read", "edited", "searched"].includes(st.kind)) return [t(`live.${st.kind}`, "\u0001").split("\u0001")[0]!.trimEnd(), subject];
  return rowWords(r);
}

/** A failure in words (D268): what the service said, with its HTTP status, never its raw JSON. */
export function failWords(r: StepRow): string {
  const st = r.step;
  const code = r.code;
  const via = st?.kind === "other" && st.via ? serviceName(st.via) : "";
  const file = /file|content|blob/i.test(st?.target ?? "");
  const say = (base: string, f = false) => {
    const k = `${base}${f ? ".file" : ""}${via ? ".via" : ""}`;
    return via ? t(k, via, code) : t(k, code);
  };
  if (code === 404) return say("fail.404", file);
  if (code === 401 || code === 403) return say("fail.403");
  if (code === 429) return say("fail.429");
  if (code && code >= 500) return say("fail.5xx");
  if (code) return t("fail.code", r.hint ?? "", code);
  return r.hint ?? "";
}

const HAN = /[⺀-⿿぀-ヿ㐀-䶿一-鿿豈-﫿]/;
/** Reading text is 1.75 high when it holds Chinese, else 1.6: per text, not per app language (D268). */
export const hanClass = (s: string) => (HAN.test(s) ? " han" : "");

const Check = () => (
  <svg class="g ok" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
  </svg>
);

/** One step (D268): its mark, its words, the subject it names in ink (a command in mono), an
 *  edit's counts; a failure keeps its words with a small × and says what went wrong in a line; it
 *  opens to its output or its diff when it has something to show. Live, it says what it is doing. */
function Row({ r, live }: { r: StepRow; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!r.step) return <Thought r={r} live={live} />;
  const st = r.step;
  const delegated = st.kind === "delegated";
  const [words, code] = live ? liveRow(r) : delegated ? [st.target ? t("step.delegated.to", st.target) : t("step.delegated.bare"), ""] : st.kind === "other" && st.via ? [r.outcome === "error" ? serviceName(st.via) : capFirst(r.n > 1 ? t("tally.used", serviceName(st.via), r.n) : t("tally.used.one", serviceName(st.via))), ""] : rowWords(r);
  const detail = !r.diff ? [r.command && `$ ${unwrapShell(r.command)}`, r.output].filter(Boolean).join("\n") : "";
  const opens = !!detail || !!r.diff;
  const bad = r.outcome === "error";
  const cls = `step${bad ? " bad" : ""}${r.outcome === "missing" ? " quiet" : ""}${open ? " open" : ""}${live ? " running" : ""}`;
  const mono = st.kind === "ran" || (live && !!code);
  const inner = (
    <>
      {live ? <span class="spin sm" aria-hidden="true" /> : (bad ? GLYPHS.error : GLYPHS[st.kind] ?? GLYPHS.other)!()}
      <span class="sum" title={st.kind === "other" ? st.target : words}>
        {words}
      </span>
      {code && (
        <code class={`subj${mono ? " mono" : ""}`} title={code}>
          {code}
        </code>
      )}
      {r.n > 1 && !st.via && <span class="times">×{r.n}</span>}
      {r.added ? <span class="plus">+{r.added}</span> : null}
      {r.removed ? <span class="minus">−{r.removed}</span> : null}
      {delegated && !live && (
        <span class="took">
          <Check />
          {r.ms !== undefined && r.ms >= 1000 ? dur(r.ms) : ""}
        </span>
      )}
      {bad && <span class="bad-tag">{t("step.label.error")}</span>}
      {opens && <span class="chev">{GLYPHS.chev!()}</span>}
    </>
  );
  const hint = bad ? failWords(r) : "";
  return (
    <div class="sline">
      {opens ? (
        <button class={cls} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class={cls}>{inner}</div>
      )}
      {hint && <div class={`failline${hanClass(hint)}`}>{hint}</div>}
      {open && (r.diff ? <Diff r={r} /> : <Output text={detail} />)}
    </div>
  );
}

/** A stretch of thinking (D268): how long it thought; open, its headings. Live, its first heading. */
function Thought({ r, live }: { r: StepRow; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const heads = (r.thought ?? "").split("\n").filter(Boolean);
  const words = live ? heads[0] || t("live.thinking") : r.ms !== undefined && r.ms >= 1000 ? t("think.took", dur(r.ms)) : t("think.brief");
  const opens = !live && heads.length > 0;
  const inner = (
    <>
      {live ? <span class="spin sm" aria-hidden="true" /> : GLYPHS.thought!()}
      <span class="sum">{words}</span>
      {opens && <span class="chev">{GLYPHS.chev!()}</span>}
    </>
  );
  return (
    <div class="sline">
      {opens ? (
        <button class={`step quiet${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class={`step quiet${live ? " running" : ""}`}>{inner}</div>
      )}
      {open && (
        <div class="thought-text">
          {heads.map((h, i) => (
            <p key={i}>{h}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** A run of steps between two things said, as one line (D268): what it did, in at most two phrases;
 *  open, each step. While it runs, only its latest step, in the present tense, with a small spinner. */
const GROUP_MAX = 60;
function Group({ l, live }: { l: Extract<Line, { k: "group" }>; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const latest = l.rows.at(-1)!;
  const [lw, lc] = live ? liveRow(latest) : ["", ""];
  const words = live ? lw : groupWords(l.tally);
  return (
    <div class="sline">
      <button class={`step steprun${open ? " open" : ""}${live ? " running" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {live ? <span class="spin sm" aria-hidden="true" /> : GLYPHS.group!()}
        <span class="sum" title={groupWords(l.tally)}>
          {words}
        </span>
        {live && lc && (
          <code class={`subj${latest.step?.kind === "ran" ? " mono" : ""}`} title={lc}>
            {lc}
          </code>
        )}
        <span class="chev">{GLYPHS.chev!()}</span>
      </button>
      {/* D271: it grows in place, never a scroller of its own; a long run shows its first steps. */}
      {open && (
        <div class="group-rows">
          {(all ? l.rows : l.rows.slice(0, GROUP_MAX)).map((r) => (
            <Row key={r.seq} r={r} />
          ))}
          {!all && l.rows.length > GROUP_MAX && (
            <button class="qlink more" onClick={() => setAll(true)}>
              {t("group.more", l.rows.length - GROUP_MAX)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The agent's plan (D268): its items, a ring to do, a dashed ring under way, a check once done. */
function PlanCard({ b }: { b: Extract<Block, { k: "plan" }> }) {
  const done = b.items.filter((i) => i.state === "done").length;
  return (
    <section class="plan" aria-label={t("plan.title")}>
      <header>
        <b>{t("plan.title")}</b>
        <span>{t("plan.progress", done, b.items.length)}</span>
      </header>
      <ul>
        {b.items.map((i, n) => (
          <li key={n} class={i.state}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              {i.state === "done" ? (
                <>
                  <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
                  <path d="M5 8.3 7 10.3 11 5.8" stroke="var(--surface)" stroke-width="1.7" />
                </>
              ) : (
                <circle cx="8" cy="8" r="6" stroke-dasharray={i.state === "doing" ? "2.4 2.2" : undefined} />
              )}
            </svg>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What fills a note's %s (D207): a computer, an agent, an effort; a computer it didn't name is said plainly. */
/** D282: a switch inside the task: another agent, another model or effort, another computer. Its
 *  time is drawn apart (D291); a model with its effort reads "Sonnet（高）". */
export function switchLine(b: Extract<Block, { k: "note" }>): string {
  if (b.say === "retuned") {
    const m = b.name && modelName(b.name), e = b.effort && effortWord(A.L, b.effort);
    return t("note.retuned", m && e ? t("who.name", m, e) : m || e || t("note.retuned.default"));
  }
  return t(`note.${b.say}`, b.name || t("note.computer"));
}

/** D299: where an outside session's earlier turns began: the agent and the day. */
export function earlierLine(b: Extract<Block, { k: "note" }>): string {
  const agent = b.name || t("note.earlier.agent");
  const ms = b.at ? Date.parse(b.at) : NaN;
  if (!Number.isFinite(ms)) return t("note.earlier.undated", agent);
  const day = new Date(ms).toLocaleDateString(A.L.lang, { month: "short", day: "numeric" });
  return t("note.earlier", agent, day);
}

function noteName(b: Extract<Block, { k: "note" }>): string {
  if (b.say === "effort_dropped") return b.name ? effortWord(A.L, b.name) : "";
  if (b.say === "offline" || b.say === "reconnecting" || b.say === "back" || b.say === "waiting_device") return b.name || t("note.computer");
  return b.name ?? "";
}

/** The agent's words (D271): then one quiet line, 保存了进度 when it saved them, and on hover its
 *  time, how long its turn worked and Copy. */
function Voice({ task, b, took }: { task: Task; b: Extract<Block, { k: "voice" }>; took?: string }) {
  const ms = tsOf(task, b.seq);
  const at = Number.isFinite(ms) ? clock(new Date(ms).toISOString()) : "";
  return (
    <div class="voice">
      <div class={`tx assistant md${hanClass(b.text)}`} dir="auto" dangerouslySetInnerHTML={{ __html: markdown(b.text, t("reply.copy")) }} />
      <small class={`vmeta${b.saved ? " kept" : ""}`}>
        {b.saved && <span class="saved">{t("task.saved")}</span>}
        <span class="hov">
          {at && <span>{at}</span>}
          {took && <span>{took}</span>}
          <button type="button" class="qlink" onClick={() => void navigator.clipboard?.writeText(b.text)}>
            {t("reply.copy")}
          </button>
        </span>
      </small>
    </div>
  );
}

function BlockView({ task, b, live, took }: { task: Task; b: Block; live?: boolean; took?: string }) {
  switch (b.k) {
    case "voice":
      return <Voice task={task} b={b} took={took} />;
    case "steps": {
      const n = b.lines.length - 1;
      return (
        <div class="lines">
          {b.lines.map((l, i) => (l.k === "group" ? <Group key={`g${l.seq}`} l={l} live={live && b.live && i === n} /> : <Row key={l.row.seq} r={l.row} live={live && b.live && i === n} />))}
        </div>
      );
    }
    case "plan":
      return <PlanCard b={b} />;
    case "report": {
      const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[b.state as string] ?? "task.report";
      return (
        <div class="tx said" dir="auto">
          <small>{t(k, A.S.personaName)}</small>
          {b.text}
          {b.media?.length ? <MediaBlock media={b.media} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
        </div>
      );
    }
    case "note": {
      // D268: a compaction or an interruption is a hairline with its word; a retry is said only by
      // the working line, while it is the latest thing.
      if (b.say === "retry") return null;
      if (b.say === "compacted" || b.say === "interrupted")
        return (
          <div class="tx-divider" role="separator">
            {/* D288: with its size before and after when known (上下文从 152k 压缩到了 31k). */}
            <span>{b.say === "compacted" && b.from && b.to ? t("note.compacted.size", tokensShort(b.from), tokensShort(b.to)) : b.say === "compacted" && b.from ? t("note.compacted.from", tokensShort(b.from)) : t(`note.${b.say}`)}</span>
          </div>
        );
      // D299: a session from outside Ducter: its earlier turns follow (在 Claude Code 里开始的，11月12日).
      if (b.say === "earlier")
        return (
          <div class="tx-divider earlier" role="separator">
            <span>{earlierLine(b)}</span>
          </div>
        );
      // D282: who does it changed inside the task: one hairline, its time apart (D291).
      if (b.say === "switched" || b.say === "retuned" || b.say === "moved")
        return (
          <div class="tx-divider wake" role="separator">
            <span>{switchLine(b)}</span>
            {seqClock(task, b.seq) && <span class="when">{seqClock(task, b.seq)}</span>}
          </div>
        );
      // D207: the runner's lines in the user's words; the line as logged only on hover, for an error.
      const line = t(`note.${b.say}`, noteName(b));
      return (
        <div class={`step note${b.bad ? " bad" : ""}`}>
          {b.bad ? GLYPHS.error!() : GLYPHS.other!()}
          {b.bad && <span class="bad-tag">{t("step.label.error")}</span>}
          <span class="sum" title={b.bad ? b.text : line}>
            {line}
          </span>
        </div>
      );
    }
  }
  return null;
}

/** Your words to the task, with what it waits for: 排队中 until it answers (D207, D210, D268). */
function YouBubble({ task, b, queued }: { task: Task; b: Extract<Block, { k: "you" }>; queued: boolean }) {
  const sd = task.sends.find((s) => s.seq === b.seq);
  const waits = queued && sd?.delivered === "queued";
  return (
    <div class={`tx you${waits ? " queued" : ""}`} dir="auto">
      {b.media?.length ? <MediaBlock media={b.media} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
      {waits && <small class="qtag">{t("delivery.queued.tag")}</small>}
      {b.text}
    </div>
  );
}

// Each event's time by seq, for how long a turn worked (made again when the task's events change).
const tsCache = new WeakMap<Task, { n: number; map: Map<number, string> }>();
function tsOf(task: Task, seq: number): number {
  let c = tsCache.get(task);
  if (!c || c.n !== task.events.length) tsCache.set(task, (c = { n: task.events.length, map: new Map(task.events.map((e) => [e.seq, e.ts])) }));
  return Date.parse(c.map.get(seq) ?? "");
}

/** D279: how many times a task's own wait came true (each wake in its transcript), and when the
 *  latest did: the rounds of a loop, for the watch card's tally. */
export function wakesOf(task: Task): { n: number; lastAt: number } {
  let n = 0, last = NaN;
  for (const b of taskBlocks(task)) if (b.k === "wake") (n++, (last = tsOf(task, b.seq)));
  return { n, lastAt: last };
}

/** A turn's body (D268): a finished turn folds its steps and interim words under "Worked for 3m
 *  12s", keeping its last words in view; the live turn never folds. */
function TurnBody({ task, turn, live }: { task: Task; turn: Turn; live: boolean }) {
  const [open, setOpen] = useState(false);
  const body = turn.body;
  let lastVoice = -1;
  for (let i = body.length - 1; i >= 0; i--)
    if (body[i]!.k === "voice") {
      lastVoice = i;
      break;
    }
  const head = lastVoice >= 0 ? body.slice(0, lastVoice) : body;
  const foldable = !live && head.some((b) => b.k === "steps");
  const from = body.length ? tsOf(task, turn.prompt?.seq ?? body[0]!.seq) : NaN;
  const to = body.length ? tsOf(task, lastSeq(body.at(-1)!)) : NaN;
  const took = dur(Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : 0);
  const worked = !live && Number.isFinite(from) && Number.isFinite(to) && to > from ? t("turn.worked", took) : "";
  const draw = (bs: Block[]) => bs.map((b) => <BlockView key={`${b.k}${b.seq}`} task={task} b={b} live={live} took={worked} />);
  if (!foldable) return <>{draw(body)}</>;
  return (
    <>
      <button class={`worked${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t("turn.worked", took)}</span>
        <span class="chev">{GLYPHS.chev!()}</span>
      </button>
      {open && <div class="worked-body">{draw(head)}</div>}
      {draw(body.slice(head.length))}
    </>
  );
}

/** A turn: what someone said to the agent, then its answer in order. Drawn again only when its
 *  own blocks changed (its key carries its last seq), or the language did. */
class TurnView extends Component<{ task: Task; turn: Turn; queued: boolean; live: boolean; version: string }> {
  shouldComponentUpdate(next: { version: string; queued: boolean; live: boolean }) {
    return next.version !== this.props.version || next.queued !== this.props.queued || next.live !== this.props.live;
  }
  render() {
    const { task, turn, queued, live } = this.props;
    const p = turn.prompt;
    return (
      <section class="turn" data-seq={turn.seq}>
        {(p?.k === "wake" || p?.k === "told") && (
          <div class="tx-divider wake" role="separator" title={p.text}>
            <span>{promptLine(p)}</span>
            {seqClock(task, p.seq) && <span class="when">{seqClock(task, p.seq)}</span>}
          </div>
        )}
        {p?.k === "brief" && <PromptCard task={task} b={p} label={p.by === "you" ? t("task.asked.you") : t("task.asked", A.S.personaName)} />}
        {p?.k === "partner" && <PromptCard task={task} b={p} label={t("task.from.partner", A.S.personaName)} />}
        {p?.k === "you" && <YouBubble task={task} b={p} queued={queued} />}
        {p?.k === "go" && (
          <div class="tx go-chip" title={p.text}>
            <span>{goWords(p)}</span>
            <time>{atOf(task, p.seq)}</time>
          </div>
        )}
        <TurnBody task={task} turn={turn} live={live} />
      </section>
    );
  }
}

const turnLast = (tu: Turn) => (tu.body.at(-1) ?? tu.prompt)?.seq ?? tu.seq;
const lastLive = (tu: Turn) => tu.body.at(-1)?.k === "steps" && !!(tu.body.at(-1) as { live?: boolean }).live;

/** The opened task's conversation with the agent (D210): its turns, then what you sent that the
 *  Log has yet to carry, then while it works the working line (D268). */
export function WhatItDid({ task, blocks }: { task: Task; blocks: Block[] }) {
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  // D271: every turn is drawn (a settled one off screen costs nothing: content-visibility); the
  // last is live only while a turn is under way.
  const turns = blocks === taskBlocks(task) ? taskTurns(task) : turnsOf(blocks);
  const moving = taskInTurn(task);
  const items = turns.map((tu, i, shown) => {
    const last = i === shown.length - 1;
    const live = last && moving;
    return <TurnView key={tu.seq} task={task} turn={tu} queued={last && !tu.body.length} live={live} version={`${A.L.lang}:${turnLast(tu)}:${tu.body.length}:${lastLive(tu)}:${task.sends.length}`} />;
  });
  // D207: a receipt only when it says something: sending, it waits its turn, or it failed.
  for (const sd of task.sends.filter((s) => !s.seq)) {
    const queued = sd.delivered === "queued";
    const receipt = sd.failed ? t("delivery.failed", sd.failed) : sd.delivered ? "" : t("delivery.sending");
    items.push(
      <div key={`s${sd.at}`} class={`tx you${queued ? " queued" : !sd.delivered ? " waits" : ""}`} dir="auto">
        {sd.pics?.length ? <MediaBlock pics={sd.pics} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
        {queued && <small class="qtag">{t("delivery.queued.tag")}</small>}
        {sd.text}
        {(receipt || (sd.failed && sd.retry)) && (
          <small>
            {receipt}
            {sd.failed && sd.retry && (
              <button type="button" class="btn text sm" onClick={sd.retry}>
                {t("media.retry")}
              </button>
            )}
          </small>
        )}
      </div>,
    );
  }
  return (
    <div class="turns">
      {items}
      <EndLine task={task} blocks={blocks} turns={turns} />
    </div>
  );
}

/** The transcript's last line (D271), from state, never a guess: a turn under way says what it
 *  does; a task resting on its wait says what it waits for and when it looks again, how it checks
 *  a click away; anything else, nothing (the head says the state). */
function EndLine({ task, blocks, turns }: { task: Task; blocks: Block[]; turns: Turn[] }) {
  if (taskInTurn(task)) return <WorkingLine task={task} blocks={blocks} turns={turns} />;
  const w = A.S.waiterFor(task.id);
  if (w && attention(task) !== "needs_you" && !finished(task)) return <WaitLine task={task} w={w} />;
  return null;
}

/** The end line of a task resting on its wait: what it waits for and when it looks next. */
function WaitLine({ task, w }: { task: Task; w: WaiterView }) {
  const [open, setOpen] = useState(false);
  const watches = !!(w.check || w.event);
  const next = watches ? w.nextLookAt : w.at;
  // D291: what it waits for, and apart, in muted tabular figures, when it comes back.
  const words = next ? waitLine(w.reason) : t("end.wait.bare", w.reason);
  const back = next ? t("end.wait", clock(next)) : "";
  const inner = (
    <>
      {GLYPHS.waited!()}
      <span class="sum" title={words}>
        {words}
      </span>
      {back && <span class="when">{back}</span>}
      {watches && <span class="chev">{GLYPHS.chev!()}</span>}
    </>
  );
  return (
    <div class="sline wait-end" role="status">
      {watches ? (
        <button class={`step${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class="step">{inner}</div>
      )}
      {open && (
        <div class="wait-how">
          <WaitHow task={task} />
        </div>
      )}
    </div>
  );
}

/** The working line at the transcript's end (D268): what it is on, shimmering, and the turn's
 *  clock at the right; a retry takes its words while it is the latest thing. D271: never
 *  "thinking" after its words, only that it works. */
function WorkingLine({ task, blocks, turns }: { task: Task; blocks: Block[]; turns: Turn[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, []);
  const last = blocks.at(-1);
  const words = last?.k === "note" && last.say === "retry" ? t("note.retry", last.name ?? "") : t(`state.${attention(task)}`);
  const tu = turns.at(-1);
  const start = tu ? tsOf(task, tu.seq) : NaN;
  return (
    <div class="working-line" role="status">
      <span class="shimmer">{words}</span>
      {Number.isFinite(start) && <span class="clock">{dur(Date.now() - start)}</span>}
    </div>
  );
}

/** When a turn's prompt came, as a clock ("21:59"), or "". */
function seqClock(task: Task, seq: number): string {
  const ms = tsOf(task, seq);
  return Number.isFinite(ms) ? clock(new Date(ms).toISOString()) : "";
}

/** A wake's or what Ducter told the agent, as a hairline's words (D271); its time is drawn apart (D291). */
function promptLine(p: Extract<Block, { k: "wake" } | { k: "told" }>): string {
  if (p.k === "wake") return t(p.timer ? "wake.timer" : "wake.over");
  if (p.say === "lent") return t("told.lent", p.name ?? "");
  // D280: the loan of the person's phone ended (taken back, given back, lost), named by the phone.
  if (p.say === "taken_back" || p.say === "given_back" || p.say === "loan_lost") return t(`told.${p.say}`, shownDeviceName(p.name ?? ""));
  if (p.say === "returned") return p.name ? t("told.returned.name", p.name) : t("told.returned");
  if (p.say === "other") return t("told.other", A.S.personaName);
  return t(`told.${p.say}`);
}

/** D284: a turn opened by what someone said (the brief, the person's own words, the partner's). */
const saidTurn = (tu: Turn) => tu.prompt?.k === "brief" || tu.prompt?.k === "you" || tu.prompt?.k === "partner";

/** D284: the person's Go on a card, said as they pressed it: 你点了「好，Done」. */
export function goWords(p: Extract<Block, { k: "go" }>): string {
  return t("turn.go", shortGo(p.label));
}

function atOf(task: Task, seq: number): string {
  const ms = tsOf(task, seq);
  return Number.isFinite(ms) ? clock(new Date(ms).toISOString()) : "";
}

type LocEntry = { seqs: number[]; line: string; tag?: string; at: string; quiet: boolean };

/** A turn's entry in the locator: the first line of what was said, or a quiet item's own words; the
 *  brief carries its own quiet label, and every entry its time apart (D291). */
function locatorEntry(task: Task, tu: Turn, quiet: boolean): LocEntry {
  const p = tu.prompt;
  const e: LocEntry = { seqs: [tu.seq], line: "", at: p ? atOf(task, p.seq) : "", quiet };
  if (!p) return e;
  if (p.k === "wake" || p.k === "told") return { ...e, line: promptLine(p) };
  if (p.k === "go") return { ...e, line: goWords(p) };
  const first = ("text" in p ? p.text : "").split("\n")[0]!;
  return p.k === "brief" ? { ...e, line: first, tag: t("locator.brief") } : { ...e, line: first };
}

/**
 * The locator's list (D284): each turn where someone said something, and between them each run of
 * quiet turns (a wake, Ducter's note, a Go relayed) said once in muted ink ("等到了 24 次" with
 * 1:51–19:06 apart, "3 条提示" with 9:02–9:40, or the one item's words), so only what people said
 * reads as said.
 */
export function locatorEntries(task: Task, turns: Turn[]): LocEntry[] {
  const out: LocEntry[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (saidTurn(turns[i]!)) {
      out.push(locatorEntry(task, turns[i]!, false));
      continue;
    }
    let j = i;
    while (j + 1 < turns.length && !saidTurn(turns[j + 1]!)) j++;
    const run = turns.slice(i, j + 1);
    // A history's first page may start mid-turn: a turn with nothing that opened it says nothing.
    const items = run.filter((tu) => tu.prompt);
    const wakes = items.every((tu) => tu.prompt!.k === "wake");
    if (items.length === 1) out.push(locatorEntry(task, items[0]!, true));
    else if (items.length > 1)
      out.push({ seqs: items.map((tu) => tu.seq), line: t(wakes ? "locator.wakes" : "locator.quiet", items.length), at: `${atOf(task, items[0]!.prompt!.seq)}–${atOf(task, items.at(-1)!.prompt!.seq)}`, quiet: true });
    i = j;
  }
  return out;
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * D284: the locator's jump, calm: an eased glide to the turn (280–640 ms by distance; from more
 * than three screens away it lands a screen short first, then glides), at once under reduced
 * motion; then the turn's soft clay tint fades (`.turn.flash`).
 */
export function glideTo(scroller: HTMLElement, target: HTMLElement) {
  const goal = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8));
  const flash = () => {
    target.classList.remove("flash");
    void target.offsetWidth; // the tint starts again on a second jump
    target.classList.add("flash");
    setTimeout(() => target.classList.remove("flash"), 1700);
  };
  if (reduced()) {
    scroller.scrollTop = goal;
    return flash();
  }
  const view = scroller.clientHeight;
  let from = scroller.scrollTop;
  if (Math.abs(goal - from) > 3 * view) from = scroller.scrollTop = goal - Math.sign(goal - from) * view;
  const span = goal - from;
  const ms = Math.min(640, Math.max(280, 200 + Math.abs(span) / 4));
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    scroller.scrollTop = from + span * easeInOut(k);
    if (k < 1) requestAnimationFrame(step);
    else flash();
  };
  requestAnimationFrame(step);
}

/** The locator (D271, wide only): a thin rail at the transcript's right edge, one small bar per
 *  turn (a quiet one's shorter), a soft clay thumb behind those in view that glides as the page
 *  moves; hovered, a clay card rises out of the rail listing what was said, newest at the bottom,
 *  those in view marked; a click glides there (D284). */
export function Locator({ task, scroller }: { task: Task; scroller: RefObject<HTMLElement> }) {
  const turns = taskTurns(task);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const frame = useRef(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const look = () => {
      frame.current = 0;
      const top = el.getBoundingClientRect().top, bottom = top + el.clientHeight;
      const s = new Set<number>();
      for (const n of el.querySelectorAll<HTMLElement>(".turns > .turn[data-seq]")) {
        const r = n.getBoundingClientRect();
        if (r.bottom > top && r.top < bottom) s.add(Number(n.dataset.seq));
      }
      setSeen((o) => (o.size === s.size && [...s].every((x) => o.has(x)) ? o : s));
    };
    const onScroll = () => void (frame.current ||= requestAnimationFrame(look));
    look();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => (el.removeEventListener("scroll", onScroll), cancelAnimationFrame(frame.current));
  }, [scroller.current, turns.length]);
  if (turns.length < 3) return null;
  const go = (seq: number) => {
    const el = scroller.current;
    const target = el?.querySelector<HTMLElement>(`.turns > .turn[data-seq="${seq}"]`);
    if (el && target) glideTo(el, target);
    setOpen(false);
  };
  const h = Math.min(Math.max(turns.length * 8, 64), 360);
  const pos = (i: number) => (turns.length > 1 ? (i / (turns.length - 1)) * 100 : 0);
  const lit = turns.map((tu, i) => (seen.has(tu.seq) ? i : -1)).filter((i) => i >= 0);
  return (
    <nav class={`locator${open ? " open" : ""}`} aria-label={t("locator.name")} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)} onBlurCapture={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setOpen(false)}>
      <div class="rail" style={{ height: `${h}px` }} tabIndex={0} aria-hidden="true">
        {lit.length > 0 && <b class="thumb" style={{ top: `${pos(lit[0]!)}%`, height: `${pos(lit.at(-1)!) - pos(lit[0]!)}%` }} />}
        {turns.map((tu, i) => (
          <i key={tu.seq} class={`${seen.has(tu.seq) ? "here" : ""}${saidTurn(tu) ? "" : " quiet"}`} style={{ top: `${pos(i)}%` }} />
        ))}
      </div>
      <ol class="loc-list" aria-hidden={!open} inert={!open}>
        {
          locatorEntries(task, turns).map((e) => (
            <li key={e.seqs[0]}>
              <button class={`${e.seqs.some((s) => seen.has(s)) ? "here" : ""}${e.quiet ? " quiet" : ""}`} onClick={() => go(e.seqs.at(-1)!)}>
                <i />
                {e.tag && <em class="tag">{e.tag}</em>}
                <span>{e.line}</span>
                {e.at && <small class="at">{e.at}</small>}
              </button>
            </li>
          ))}
      </ol>
    </nav>
  );
}

/** What the agent is on now, in a few words (On hand's row): its latest step, or "" when its latest is something it said. */
export function liveWords(blocks: Block[]): string {
  const b = blocks.at(-1);
  if (b?.k !== "steps") return "";
  const l = b.lines.at(-1);
  if (!l) return "";
  const r = l.k === "group" ? l.rows.at(-1)! : l.row;
  const [w, code] = b.live ? liveRow(r) : l.k === "group" ? [groupWords(l.tally), ""] : rowWords(r);
  return code ? `${w} ${code}` : w;
}

/** Over the composer (D210, D268): when it's over to you, saying so; Esc pressed once, the second
 *  that pauses it. Its clock and latest step are the working line's; Cancel task is in the header's
 *  More menu, Stop beside Send. */
export function TaskFoot({ task }: { task: Task; blocks?: Block[] }) {
  const a = attention(task);
  const yours = a === "needs_you" && !A.S.pendingDecision(task.id);
  const armed = a === "working" && escArmed(task.id);
  if (yours)
    return (
      <div class="task-foot st-needs_you" role="status">
        <b>{t("task.your.turn")}</b>
        <span class="now">{t("task.your.turn.hint")}</span>
      </div>
    );
  if (!armed) return null;
  return (
    <div class="task-foot st-working" role="status">
      <span class="esc">{t("foot.esc")}</span>
      <span class="grow" />
      <Btn kind="text" size="sm" label={t("foot.keep")} onClick={() => ((A.escAt = undefined), A.changed())} />
      <Btn kind="secondary" size="sm" label={t("task.action.pause")} onClick={() => ((A.escAt = undefined), A.taskAction(task.id, "interrupt"))} />
    </div>
  );
}

/** The task's More menu in its header (D268): Cancel task, while it can still be cancelled. */
export function TaskMore({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const a = attention(task);
  const droppable = !finished(task) && !["dropped", "superseded", "done"].includes(a);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !(e.target as Element)?.closest?.(".more-menu") && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    addEventListener("pointerdown", close, true);
    addEventListener("keydown", esc, true);
    return () => (removeEventListener("pointerdown", close, true), removeEventListener("keydown", esc, true));
  }, [open]);
  if (!droppable) return null;
  return (
    <span class="more-menu">
      <button class="plus more-btn" aria-label={t("task.more")} title={t("task.more")} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div class="menu" role="menu">
          <button role="menuitem" class="danger" onClick={() => (setOpen(false), A.drop(task.id))}>
            {t("task.action.drop")}
          </button>
        </div>
      )}
    </span>
  );
}


/** What the task said or saved after its latest report, its first line, or "" (keys hidden). */
export function saidSince(task: Task): string {
  return latestVoice(taskBlocks(task));
}

// ---------- the meta line ----------

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`;
}

/** Where it runs, as separate facts (D291): the repo and its branch, the folder, the machine when it isn't this one. */
export function whereParts(p: Place): string[] {
  const last = (s?: string) => (s ?? "").replace(/\/+$/, "").split("/").at(-1) ?? "";
  const parts: string[] = [];
  if (p.kind === "repo") parts.push(last(p.repoPath), p.branch ?? "");
  else if (p.kind === "folder") parts.push(last(p.path));
  else if (p.kind === "browser" && (p as { profile?: string }).profile !== "default") parts.push((p as { profile?: string }).profile ?? "");
  const d = (p as { device?: string }).device;
  // D157: with two or more computers the computer is said apart (taskWhere), on every task.
  if (d && d !== "local" && d !== "this" && !manyComputers()) parts.push(t("task.where.on", d));
  return parts.filter(Boolean);
}

/** One quiet line (D152): where it stands, how long it took once finished (while it works the clock
 *  is in the foot, D210), who does it, where, and Switch who does it. */
export function TaskMeta({ task, stateLabel, mark, onSwitch }: { task: Task; stateLabel: string; mark?: JSX.Element; onSwitch?: () => void }) {
  const a = attention(task);
  const done = finished(task);
  const [whyFor, setWhy] = useState(""); // the task whose why is open (a tap; one task at a time)
  const why = whyFor === task.id;
  const h = harnessOf(task);
  const m = modelOf(task);
  const e = effortOf(task);
  // D291: who does it and where, each fact its own small element.
  const facts = [harnessName(h), m && modelName(m), e && effortWord(A.L, e), ...whereParts(placeOf(task))].filter((x): x is string => !!x);
  const start = task.openedAt ? Date.parse(task.openedAt) : NaN;
  let when = "";
  if (!Number.isNaN(start)) {
    // D210: while it works the clock ticks in the foot over the composer; here, how long it took.
    if (done) {
      const end = Date.parse(task.events.at(-1)?.ts ?? "");
      if (!Number.isNaN(end) && end > start) when = t("task.footer.took", duration(A.L, end - start));
    }
  }
  const p = placeOf(task) as { repoPath?: string; path?: string };
  // D157: which computer, and what it uses there; why on hover (desktop) or a tap (phone).
  const on = taskWhere(task);
  return (
    <>
    <div class={`standing st-${a}`}>
      {mark}
      <b>{stateLabel}</b>
      {when && <span class="when">{when}</span>}
      {facts.length > 0 && (
        <span class="who" title={p.repoPath || p.path || undefined}>
          <Facts items={facts} />
        </span>
      )}
      {on.line && (
        <span class="who where">
          {on.why ? (
            <button class="where-on" title={on.why} aria-expanded={why} onClick={() => setWhy(why ? "" : task.id)}>
              {on.line}
            </button>
          ) : (
            <span>{on.line}</span>
          )}
        </span>
      )}
      {onSwitch && (
        <button class="inline-link" aria-expanded={A.switchFor === task.id} onClick={onSwitch}>
          {t("who.switch")}
          <Chev />
        </button>
      )}
    </div>
    {why && on.why && <div class="where-why small sub">{on.why}</div>}
    </>
  );
}

/** A task title or line with any key in it hidden (the home hides them already; this is the second wall). */
export const safe = (s: string) => redact(s);
