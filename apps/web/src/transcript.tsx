// An opened task as a conversation with the agent, turn by turn (D210, after D152; handling after
// egoist/lorca's agent page, research/58): each turn opens with what someone said to the agent
// (the brief as a quiet folded card, your words, the partner's) and holds its answer in order: its
// words at the reading measure, and its steps between them as compact lines (its words, the
// command in mono, an edit's +n −n; a run of reads and searches folded into one; a failure red with
// its error line in place), each opening to its output or its diff. The foot over the composer
// says where it stands; Esc twice pauses it. @ducter/protocol's transcript.ts builds the turns
// (keys hidden there too) and steps.ts names the steps, the same on every harness and on the Mac.
import type { Place } from "@ducter/protocol";
import { HIDDEN, redact } from "@ducter/protocol/src/redact.ts";
import { unwrapShell, type Step } from "@ducter/protocol/src/steps.ts";
import { blocksOf, latestVoice, turnsOf, type Block, type Line, type StepRow, type Turn } from "@ducter/protocol/src/transcript.ts";
import type { MediaRef } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { Component, type JSX } from "preact";
import { Btn, Chev } from "./controls.tsx";
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
  return t("decision.go.label", A.L.lang === "zh" ? l : l.charAt(0).toUpperCase() + l.slice(1));
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
  s = s.split(/\s+/).join(" ").replace(/[ ,，:：\-—·]+$/, "");
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
const capFirst = (s: string) => (A.L.lang === "zh" || !s ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** A command, a path, a pattern: it reads in mono on the inline code tint. */
const codeLike = (st: Step) => !!st.target && !st.act && ["ran", "read", "edited", "searched"].includes(st.kind);

/** A step's sentence and, apart, the code it names (in mono): the agent's own words when its
 *  harness gave them; "没找到 nmem" for a probe that found nothing; "运行 nmem doctor". */
export function rowWords(r: StepRow): [string, string] {
  if (!r.step) return [`${t("step.label.thought")} · ${r.thought ?? ""}`, ""];
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
const blockCache = new WeakMap<Task, { n: number; last: number; live: boolean; blocks: Block[] }>();
export const taskBlocks = (task: Task): Block[] => {
  const live = working(task);
  const last = task.events.at(-1)?.seq ?? 0;
  const c = blockCache.get(task);
  if (c && c.n === task.events.length && c.last === last && c.live === live) return c.blocks;
  const blocks = blocksOf(harnessOf(task), task.events, live);
  blockCache.set(task, { n: task.events.length, last, live, blocks });
  return blocks;
};

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

/** One step: its mark, its words, the code it names in mono, an edit's counts, a failure's error
 *  line in place; it opens to its output or its diff. */
function Row({ r }: { r: StepRow }) {
  const [open, setOpen] = useState(false);
  const [words, code] = rowWords(r);
  const detail = r.step && !r.diff ? [r.command && `$ ${unwrapShell(r.command)}`, r.output].filter(Boolean).join("\n") : "";
  const opens = !!detail || !!r.diff;
  const bad = r.outcome === "error";
  const cls = `step${bad ? " bad" : ""}${r.outcome === "missing" || !r.step ? " quiet" : ""}${open ? " open" : ""}`;
  const inner = (
    <>
      {(bad ? GLYPHS.error : GLYPHS[r.step?.kind ?? "thought"] ?? GLYPHS.other)!()}
      <span class="sum" title={words}>
        {words}
      </span>
      {code && (
        <span class="sum code" title={code}>
          {code}
        </span>
      )}
      {r.n > 1 && <span class="times">×{r.n}</span>}
      {r.added ? <span class="plus">+{r.added}</span> : null}
      {r.removed ? <span class="minus">−{r.removed}</span> : null}
      {bad && <b class="bad-tag">{t("step.label.error")}</b>}
      {opens && <span class="chev">{GLYPHS.chev!()}</span>}
    </>
  );
  return (
    <div class="sline">
      {opens ? (
        <button class={cls} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class={cls}>{inner}</div>
      )}
      {bad && r.hint && !open && (
        <div class="errline" title={r.hint}>
          {r.hint}
        </div>
      )}
      {open && (r.diff ? <Diff r={r} /> : <Output text={detail} />)}
    </div>
  );
}

/** A fold of looks in words: "看了 3 个文件，搜了 2 次". */
export function looksWords(reads: number, searches: number): string {
  const parts: string[] = [];
  if (reads) parts.push(reads === 1 ? t("look.files.one") : t("look.files", reads));
  if (searches) parts.push(searches === 1 ? t("look.searches.one") : t("look.searches", searches));
  return parts.join(t("look.and"));
}

/** A run of reads and searches as one line; open, each one. */
function Looks({ l }: { l: Extract<Line, { k: "looks" }> }) {
  const [open, setOpen] = useState(false);
  const words = looksWords(l.reads, l.searches);
  return (
    <div class="sline">
      <button class={`step${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {GLYPHS.searched!()}
        <span class="sum">{words}</span>
        <span class="chev">{GLYPHS.chev!()}</span>
      </button>
      {open && (
        <div class="looks">
          {l.rows.map((r) => (
            <Row key={r.seq} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/** What fills a note's %s (D207): a computer, an agent, an effort; a computer it didn't name is said plainly. */
function noteName(b: Extract<Block, { k: "note" }>): string {
  if (b.say === "effort_dropped") return b.name ? effortWord(A.L, b.name) : "";
  if (b.say === "offline" || b.say === "back" || b.say === "waiting_device") return b.name || t("note.computer");
  return b.name ?? "";
}

function BlockView({ task, b }: { task: Task; b: Block }) {
  switch (b.k) {
    case "voice":
      return (
        <div class="voice">
          <div class="tx assistant md" dangerouslySetInnerHTML={{ __html: markdown(b.text) }} />
          {b.saved && (
            <small class="saved">
              {GLYPHS.flag!()}
              {t("task.saved")}
            </small>
          )}
        </div>
      );
    case "steps":
      return (
        <div class="lines">
          {b.lines.map((l) => (l.k === "looks" ? <Looks key={`l${l.seq}`} l={l} /> : <Row key={l.row.seq} r={l.row} />))}
        </div>
      );
    case "report": {
      const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[b.state as string] ?? "task.report";
      return (
        <div class="tx said">
          <small>{t(k, A.S.personaName)}</small>
          {b.text}
          {b.media?.length ? <MediaBlock media={b.media} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
        </div>
      );
    }
    case "note": {
      // D207: the runner's lines in the user's words; the line as logged only on hover, for an error.
      const line = t(`note.${b.say}`, noteName(b));
      return (
        <div class={`step note${b.bad ? " bad" : ""}`}>
          {b.bad ? GLYPHS.error!() : GLYPHS.other!()}
          {b.bad && <b>{t("step.label.error")}</b>}
          <span class="sum" title={b.bad ? b.text : line}>
            {line}
          </span>
        </div>
      );
    }
  }
  return null;
}

/** Your words to the task, with what it waits for: 排队中 until it answers (D207, D210). */
function YouBubble({ task, b, queued }: { task: Task; b: Extract<Block, { k: "you" }>; queued: boolean }) {
  const sd = task.sends.find((s) => s.seq === b.seq);
  const waits = queued && sd?.delivered === "queued";
  return (
    <div class={`tx you${waits ? " waits" : ""}`}>
      {b.media?.length ? <MediaBlock media={b.media} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
      {b.go !== undefined ? shortGo(b.go) : b.text}
      {waits && <small>{`${t("delivery.queued.tag")} · ${t("delivery.queued")}`}</small>}
    </div>
  );
}

/** A turn: what someone said to the agent, then its answer in order. Drawn again only when its
 *  own blocks changed (its key carries its last seq), or the language did. */
class TurnView extends Component<{ task: Task; turn: Turn; queued: boolean; version: string }> {
  shouldComponentUpdate(next: { version: string; queued: boolean }) {
    return next.version !== this.props.version || next.queued !== this.props.queued;
  }
  render() {
    const { task, turn, queued } = this.props;
    const p = turn.prompt;
    return (
      <section class="turn">
        {p?.k === "brief" && <PromptCard task={task} b={p} label={p.by === "you" ? t("task.asked.you") : t("task.asked", A.S.personaName)} />}
        {p?.k === "partner" && <PromptCard task={task} b={p} label={t("task.from.partner", A.S.personaName)} />}
        {p?.k === "you" && <YouBubble task={task} b={p} queued={queued} />}
        {turn.body.map((b) => (
          <BlockView key={`${b.k}${b.seq}`} task={task} b={b} />
        ))}
      </section>
    );
  }
}

/** How many lines of the latest turns are drawn before older turns wait behind one link (the Mac's is the same). */
const TURN_BUDGET = 240;
const turnLines = (tu: Turn) => (tu.prompt ? 1 : 0) + tu.body.reduce((n, b) => n + (b.k === "steps" ? b.lines.length : 1), 0);
const turnSteps = (tu: Turn) =>
  tu.body.reduce((n, b) => n + (b.k === "steps" ? b.lines.reduce((m, l) => m + (l.k === "looks" ? l.rows.reduce((a, r) => a + r.n, 0) : l.row.step ? l.row.n : 0), 0) : 0), 0);

/** The first turn drawn and the steps the turns before it hold: the latest up to TURN_BUDGET lines. */
export function turnWindow(turns: Turn[], all: boolean): [number, number] {
  if (all) return [0, 0];
  let n = 0;
  let from = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    n += turnLines(turns[i]!);
    if (n > TURN_BUDGET && i < turns.length - 1) {
      from = i + 1;
      break;
    }
  }
  const hidden = turns.slice(0, from).reduce((a, tu) => a + turnSteps(tu), 0);
  return hidden ? [from, hidden] : [0, 0];
}

const lastSeq = (tu: Turn) => (tu.body.at(-1) ?? tu.prompt)?.seq ?? tu.seq;
const lastLive = (tu: Turn) => tu.body.at(-1)?.k === "steps" && !!(tu.body.at(-1) as { live?: boolean }).live;

/** The opened task's conversation with the agent (D210): its turns, then what you sent that the
 *  Log has yet to carry. */
export function WhatItDid({ task, blocks }: { task: Task; blocks: Block[] }) {
  const [all, setAll] = useState(false);
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  const turns = turnsOf(blocks);
  const [from, hidden] = turnWindow(turns, all);
  const items = turns.slice(from).map((tu, i, shown) => {
    const last = i === shown.length - 1;
    return <TurnView key={tu.seq} task={task} turn={tu} queued={last && !tu.body.length} version={`${A.L.lang}:${lastSeq(tu)}:${tu.body.length}:${lastLive(tu)}:${task.sends.length}`} />;
  });
  // D207: a receipt only when it says something: sending, it waits its turn, or it failed.
  for (const sd of task.sends.filter((s) => !s.seq)) {
    const receipt = sd.failed ? t("delivery.failed", sd.failed) : sd.delivered ? (sd.delivered === "queued" ? `${t("delivery.queued.tag")} · ${t("delivery.queued")}` : "") : t("delivery.sending");
    items.push(
      <div key={`s${sd.at}`} class={`tx you${sd.delivered === "queued" || !sd.delivered ? " waits" : ""}`}>
        {sd.pics?.length ? <MediaBlock pics={sd.pics} side="task" ctx={{ kind: "task", taskId: task.id }} /> : null}
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
      {from > 0 && (
        <button class="qlink earlier" onClick={() => setAll(true)}>
          {t("turn.earlier", hidden)}
        </button>
      )}
      {items}
    </div>
  );
}

/** What the agent is on now, for the foot: its latest step in words, or "" when its latest is something it said. */
export function liveWords(blocks: Block[]): string {
  const b = blocks.at(-1);
  if (b?.k !== "steps") return "";
  const l = b.lines.at(-1);
  if (!l) return "";
  if (l.k === "looks") return looksWords(l.reads, l.searches);
  const [w, code] = rowWords(l.row);
  return l.row.step && !l.row.step.says && code ? `${w} ${code}` : w;
}

/** Where the task stands, over the composer (D210): while it works, its clock and latest step, and
 *  Pause (Esc twice); when it's over to you, saying so. Cancel task sits at its end, beside Pause,
 *  while the task can still be cancelled (D213); with nothing else to say the foot holds only that.
 *  Gone once the task is over: the outcome is at the head. */
export function TaskFoot({ task, blocks }: { task: Task; blocks: Block[] }) {
  const a = attention(task);
  const droppable = !finished(task) && !["dropped", "superseded", "done"].includes(a);
  // Cancel task: undone from the toast it leaves (A.drop), as before.
  const drop = droppable && <Btn kind="text" size="sm" label={t("task.action.drop")} about={title(task)} onClick={() => A.drop(task.id)} />;
  const [, tick] = useState(0);
  const moving = a === "working" || a === "queued";
  useEffect(() => {
    if (!moving) return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [moving]);
  const yours = a === "needs_you" && !A.S.pendingDecision(task.id);
  if (!moving && !yours)
    return droppable ? (
      <div class="task-foot only-end">
        <span class="grow" />
        {drop}
      </div>
    ) : null;
  if (yours)
    return (
      <div class="task-foot st-needs_you" role="status">
        <b>{t("task.your.turn")}</b>
        <span class="now">{t("task.your.turn.hint")}</span>
        <span class="grow" />
        {drop}
      </div>
    );
  const start = task.openedAt ? Date.parse(task.openedAt) : NaN;
  const now = liveWords(blocks);
  const armed = escArmed(task.id);
  return (
    <div class="task-foot st-working" role="status">
      <span class="spin" aria-hidden="true" />
      <b>{t(`state.${a}`)}</b>
      {!Number.isNaN(start) && <span class="clock">· {elapsed(Date.now() - start)}</span>}
      {now && (
        <span class="now" title={now}>
          · {now}
        </span>
      )}
      <span class="grow" />
      {a === "working" &&
        (armed ? (
          <>
            <span class="esc">{t("foot.esc")}</span>
            <Btn kind="text" size="sm" label={t("foot.keep")} onClick={() => ((A.escAt = undefined), A.changed())} />
            <Btn kind="secondary" size="sm" label={t("task.action.pause")} onClick={() => ((A.escAt = undefined), A.taskAction(task.id, "interrupt"))} />
          </>
        ) : (
          <>
            {drop}
            <Btn kind="text" size="sm" label={t("task.action.pause")} onClick={() => A.taskAction(task.id, "interrupt")} />
          </>
        ))}
      {a !== "working" && drop}
    </div>
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

/** Where it runs, in a few words: the repo and branch, the folder, the machine when it isn't this one. */
export function whereLine(p: Place): string {
  const last = (s?: string) => (s ?? "").replace(/\/+$/, "").split("/").at(-1) ?? "";
  const parts: string[] = [];
  if (p.kind === "repo") parts.push(last(p.repoPath), p.branch ?? "");
  else if (p.kind === "folder") parts.push(last(p.path));
  else if (p.kind === "browser" && (p as { profile?: string }).profile !== "default") parts.push((p as { profile?: string }).profile ?? "");
  const d = (p as { device?: string }).device;
  // D157: with two or more computers the computer is said apart (taskWhere), on every task.
  if (d && d !== "local" && d !== "this" && !manyComputers()) parts.push(t("task.where.on", d));
  return parts.filter(Boolean).join(" · ");
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
  const who = [harnessName(h), m && modelName(m), e && effortWord(A.L, e)].filter(Boolean).join(" · ");
  const where = whereLine(placeOf(task));
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
      {when && <span class="when">· {when}</span>}
      {(who || where) && (
        <span class="who">
          <span class="sep">·</span>
          <span title={p.repoPath || p.path || undefined}>{[who, where].filter(Boolean).join(" · ")}</span>
        </span>
      )}
      {on.line && (
        <span class="who where">
          <span class="sep">·</span>
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
