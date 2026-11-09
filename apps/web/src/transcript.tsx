// What a task did, as a compact transcript (D127), and the pieces the On hand card and the opened
// task share with it: the agent's own sentences as normal text; between them each step one quiet
// line (a small drawn mark, a verb, a one-line summary, truncated); thinking as its headings; an
// error as one red-tinted line whose raw text opens on a tap; saved progress as a tiny mark. The
// steps are named by @ducter/protocol's steps.ts, the same on every harness and on the desktop.
import type { Bodies, LogEvent } from "@ducter/protocol";
import { stepOf, type Step } from "@ducter/protocol/src/steps.ts";
import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A } from "./app.ts";
import { clock, duration, harnessName, modelName } from "./format.ts";
import { markdown } from "./markdown.ts";
import { attention, finished, harnessOf, modelOf, type Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

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

/** The user's Go as Ducter relays it to the task ("User says Go: …."), or undefined. */
export function goRelay(text: string): string | undefined {
  return text.startsWith("User says Go: ") ? text.slice("User says Go: ".length).trim().replace(/[.。]+$/, "") : undefined;
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
  const v = tr(key);
  if (v !== undefined && (st.target || !A.L.t(key).includes("%[1]"))) return v;
  return st.target ?? "";
}

/** A command, a path, a pattern: it reads in mono on the inline code tint. */
const codeLike = (st: Step) => !!st.target && !st.act && ["ran", "read", "edited", "searched"].includes(st.kind);

const QUIET_SYSTEM = /^(session started|turn completed|turn complete|turn ended|turn aborted|looking at |compaction )/i;
const FAILED_SYSTEM = /^(turn failed|delivery failed|failed to|event stream error)/;

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
};

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

// ---------- the transcript ----------

type Line = { ev: LogEvent; step?: Step; tool?: NonNullable<Bodies["task_event"]["tool"]>; failed?: boolean; n: number; thought?: string };

function lines(task: Task): Line[] {
  const out: Line[] = [];
  const lastReport = task.events.filter((ev) => ev.kind === "report").at(-1)?.seq;
  const harness = harnessOf(task);
  let app = "";
  for (const ev of task.events) {
    if (ev.kind === "task_event") {
      const b = ev.body as Bodies["task_event"];
      if (b.thinking?.length) {
        out.push({ ev, n: 1, thought: b.thinking.join(" · ") });
        continue;
      }
      if (b.tool) {
        const st = stepOf(harness, b.tool);
        if (st.hidden) continue;
        // The app a run of browser and computer steps works in carries over to the steps that don't name it.
        if (st.kind === "browsed" || st.kind === "computer") {
          if (!st.app && app) st.app = app;
          else if (st.app) app = st.app;
        }
        const failed = b.tool.ok === false;
        const prev = out.at(-1);
        if (prev?.step && !failed && !prev.failed && JSON.stringify(prev.step) === JSON.stringify(st)) {
          prev.n++;
          continue;
        }
        out.push({ ev, step: st, tool: b.tool, failed, n: 1 });
        continue;
      }
      if (b.role === "system" && (!b.text || QUIET_SYSTEM.test(b.text.trim()))) continue;
      // The runner's kickoff (the brief again in tags) is not what anyone said.
      if (b.role === "user" && (b.from === "runner" || (!b.from && /^(<brief>|Start the task ")/.test(b.text ?? "")))) continue;
    } else if (ev.kind === "report") {
      if (ev.seq === lastReport) continue; // said above: the outcome, or where it stands
    } else if (ev.kind !== "task_open" && ev.kind !== "checkpoint") continue;
    out.push({ ev, n: 1 });
  }
  return out;
}

const isStep = (l: Line) => !!l.step || !!l.thought;

function StepLine({ l }: { l: Line }) {
  const [open, setOpen] = useState(false);
  if (l.thought)
    return (
      <div class="step">
        {GLYPHS.thought!()}
        <b>{t("step.label.thought")}</b>
        <span class="sum" title={l.thought}>
          {l.thought}
        </span>
      </div>
    );
  const st = l.step!;
  const words = stepWords(st);
  const tool = l.tool!;
  let raw = (tool.output ?? "").trimEnd();
  if (st.kind === "ran" || l.failed) {
    const input = tool.input as Record<string, unknown> | string | undefined;
    const full = typeof input === "string" ? input : String(input?.command ?? input?.cmd ?? input?.code ?? "");
    if (full && !raw.startsWith(full)) raw = `${full}\n\n${raw}`.trim();
  }
  const label = l.failed ? t("step.label.error") : t(`step.label.${st.kind}`);
  const inner = (
    <>
      {(l.failed ? GLYPHS.error : (GLYPHS[st.kind] ?? GLYPHS.other))!()}
      <b>{label}</b>
      {words && (
        <span class={`sum${codeLike(st) ? " code" : ""}`} title={words}>
          {words}
        </span>
      )}
      {l.n > 1 && <span class="times">×{l.n}</span>}
      {raw && (
        <span class="chev" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  return (
    <>
      {raw ? (
        <button class={`step${l.failed ? " bad" : ""}${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class={`step${l.failed ? " bad" : ""}`}>{inner}</div>
      )}
      {open && raw && <pre class="raw">{raw.split("\n").slice(0, 24).join("\n")}</pre>}
    </>
  );
}

function Run({ run }: { run: Line[] }) {
  const [all, setAll] = useState(false);
  const hidden = run.length > 6 && !all ? run.length - 4 : 0;
  return (
    <div class="steps">
      {hidden > 0 && (
        <button class="step more" onClick={() => setAll(true)}>
          <span class="g" />
          {t("step.more", hidden)}
          <span class="chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      {run.slice(hidden).map((l) => (
        <StepLine key={l.ev.seq} l={l} />
      ))}
    </div>
  );
}

function Event({ task, ev }: { task: Task; ev: LogEvent }) {
  if (ev.kind === "task_open") {
    const brief = (ev.body as Bodies["task_open"]).brief;
    // A task opened before its brief was written (D120) logs an empty one first: the briefed one follows.
    return brief.trim() ? (
      <div class="tx said">
        <small>{(ev.body as Bodies["task_open"]).origin === "you" ? t("task.brief.you") : t("task.brief", A.S.personaName)}</small>
        {brief}
      </div>
    ) : null;
  }
  if (ev.kind === "checkpoint")
    return (
      <div class="step saved">
        {GLYPHS.flag!()}
        <span class="sum">{t("task.checkpoint", (ev.body as Bodies["checkpoint"]).text)}</span>
        <span class="times">{clock(ev.ts)}</span>
      </div>
    );
  if (ev.kind === "report") {
    const r = ev.body as Bodies["report"];
    const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[r.state as string] ?? "task.report";
    return (
      <div class="tx said">
        <small>{t(k, A.S.personaName)}</small>
        {r.summary}
      </div>
    );
  }
  const b = ev.body as Bodies["task_event"];
  if (b.role === "system") {
    const text = (b.text ?? "").trim();
    const failed = FAILED_SYSTEM.test(text);
    return (
      <div class={`step note${failed ? " bad" : ""}`}>
        {failed ? GLYPHS.error!() : GLYPHS.other!()}
        {failed && <b>{t("step.label.error")}</b>}
        <span class="sum" title={text}>
          {text}
        </span>
      </div>
    );
  }
  if (b.role === "user" && b.text) {
    if (b.from === "partner")
      return (
        <div class="tx said">
          <small>{t("task.from.partner", A.S.personaName)}</small>
          {b.text}
        </div>
      );
    const go = goRelay(b.text);
    const sd = task.sends.find((s) => s.seq === ev.seq);
    return (
      <div class="tx you">
        {go !== undefined ? shortGo(go) : b.text}
        {sd?.delivered && <small>{t(`delivery.${sd.delivered}`)}</small>}
      </div>
    );
  }
  if (b.role === "assistant" && b.text) return <div class="tx assistant md" dangerouslySetInnerHTML={{ __html: markdown(b.text) }} />;
  return null;
}

/** What the task did (D127): its words, its steps one quiet line each, a long run of steps
 *  showing its latest four behind "n earlier steps ›". */
export function WhatItDid({ task }: { task: Task }) {
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  const ls = lines(task);
  const items: JSX.Element[] = [];
  for (let i = 0; i < ls.length; ) {
    if (!isStep(ls[i]!)) {
      items.push(<Event key={ls[i]!.ev.seq} task={task} ev={ls[i]!.ev} />);
      i++;
      continue;
    }
    let j = i;
    while (j < ls.length && isStep(ls[j]!)) j++;
    items.push(<Run key={`r${ls[i]!.ev.seq}`} run={ls.slice(i, j)} />);
    i = j;
  }
  for (const sd of task.sends.filter((s) => !s.seq))
    items.push(
      <div key={`s${sd.at}`} class="tx you">
        {sd.text}
        <small>{sd.failed ? t("delivery.failed", sd.failed) : sd.delivered ? t(`delivery.${sd.delivered}`) : t("delivery.sending")}</small>
      </div>,
    );
  return <div class="tx-list">{items.slice(-80)}</div>;
}

/** What the task said or saved after its latest report, newest first, or "". */
export function saidSince(task: Task): string {
  for (let i = task.events.length - 1; i >= 0; i--) {
    const ev = task.events[i]!;
    if (ev.kind === "report") return "";
    if (ev.kind === "checkpoint") return (ev.body as Bodies["checkpoint"]).text;
    if (ev.kind === "task_event") {
      const b = ev.body as Bodies["task_event"];
      if (b.role === "assistant" && b.text?.trim() && !b.tool) return b.text.trim().split("\n")[0]!;
    }
  }
  return "";
}

// ---------- the bar over the composer ----------

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`;
}

/** Who is doing it (its coin, the agent and the model), then where it stands and for how long. */
export function TaskBar({ task, stateLabel, opened }: { task: Task; stateLabel: string; opened: string }) {
  const a = attention(task);
  const working = a === "working";
  const [, tick] = useState(0);
  useEffect(() => {
    if (!working) return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [working]);
  const h = harnessOf(task);
  const m = modelOf(task);
  const who = [harnessName(h), m && modelName(m)].filter(Boolean).join(" · ");
  const start = task.openedAt ? Date.parse(task.openedAt) : NaN;
  let when = "";
  if (!Number.isNaN(start)) {
    if (working) when = elapsed(Date.now() - start);
    else if (finished(task)) {
      const end = Date.parse(task.events.at(-1)?.ts ?? "");
      if (!Number.isNaN(end) && end > start) when = t("task.footer.took", duration(A.L, end - start));
    } else when = opened;
  }
  return (
    <div class={`task-bar st-${a}`}>
      {h && <img src={`app/art/${h === "claude-code" ? "token_orange" : "token_ink"}.webp`} alt="" width="20" height="20" />}
      <span class="who">{who}</span>
      <span class="grow" />
      <b>{stateLabel}</b>
      {when && <span class="when">· {when}</span>}
    </div>
  );
}
