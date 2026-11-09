// An opened task, as the agent tells it (D148, after D127): what you asked as a quiet folded card
// (a key in it hidden, and said so); the agent's own words as the readable layer, saved progress
// marked once; each stretch of steps between two things it said folded under one gist line, the
// stretch under way open and live; a step in one sentence (the agent's own words for it when its
// harness gives them), a probe that found nothing in neutral words, a real failure red and shown
// even folded. @ducter/protocol's transcript.ts builds the blocks (keys hidden there too) and
// steps.ts names the steps, the same on every harness and on the desktop.
import type { Place } from "@ducter/protocol";
import { HIDDEN, redact } from "@ducter/protocol/src/redact.ts";
import type { Step } from "@ducter/protocol/src/steps.ts";
import { blocksOf, latestVoice, type Block, type StepRow } from "@ducter/protocol/src/transcript.ts";
import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { duration, harnessName, modelName } from "./format.ts";
import { markdown } from "./markdown.ts";
import { attention, finished, harnessOf, modelOf, placeOf, type Task } from "./store.ts";

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
  if (st.says) return [st.says, ""];
  if (codeLike(st)) return [t(`step.label.${st.kind}`), st.target!];
  return [stepWords(st), ""];
}

function gistWords(b: Extract<Block, { k: "steps" }>): string {
  const g = b.gist;
  switch (g.kind) {
    case "look":
      return t("gist.look");
    case "edit":
      return g.files === 1 ? t("gist.edit.one") : t("gist.edit", g.files);
    case "browse":
      return g.app ? t("gist.browse", g.app) : t("gist.browse.any");
    case "think":
      return t("gist.think");
  }
  return t("gist.run");
}
const stepsCount = (n: number) => (n === 1 ? t("gist.steps.one") : t("gist.steps", n));

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
const GIST_GLYPH: Record<string, string> = { look: "searched", edit: "edited", browse: "browsed", think: "thought", run: "ran" };

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
export const taskBlocks = (task: Task): Block[] => blocksOf(harnessOf(task), task.events, working(task));

/** What you (or the partner) asked: quiet, three lines until opened; a hidden key said so. */
export function BriefCard({ task, blocks }: { task: Task; blocks: Block[] }) {
  const [open, setOpen] = useState(false);
  const b = blocks.find((x) => x.k === "brief") as Extract<Block, { k: "brief" }> | undefined;
  if (!b) return null;
  const long = b.text.split("\n").length > 3 || [...b.text].length > 180;
  const hidden = b.text.includes(HIDDEN);
  return (
    <section class={`brief${open ? " open" : ""}`} aria-label={b.by === "you" ? t("task.asked.you") : t("task.asked", A.S.personaName)}>
      <small>{b.by === "you" ? t("task.asked.you") : t("task.asked", A.S.personaName)}</small>
      <div class="brief-text">{b.text}</div>
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

function Row({ r }: { r: StepRow }) {
  const [open, setOpen] = useState(false);
  const [words, code] = rowWords(r);
  const detail = r.step ? [r.command && `$ ${r.command}`, r.output].filter(Boolean).join("\n") : "";
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
      {bad && <b class="bad-tag">{t("step.label.error")}</b>}
      {detail && <span class="chev">{GLYPHS.chev!()}</span>}
    </>
  );
  return (
    <>
      {detail ? (
        <button class={cls} aria-expanded={open} onClick={() => setOpen(!open)}>
          {inner}
        </button>
      ) : (
        <div class={cls}>{inner}</div>
      )}
      {open && detail && <pre class="raw">{detail.split("\n").slice(0, 24).join("\n")}</pre>}
    </>
  );
}

/** A stretch of steps between two things the agent said: one step is its own line; more fold
 *  under the gist, open while live. */
function Stretch({ b }: { b: Extract<Block, { k: "steps" }> }) {
  const [picked, setPicked] = useState<boolean | undefined>(undefined);
  const open = picked ?? !!b.live;
  if (b.rows.length === 1 && !b.live) return <Row r={b.rows[0]!} />;
  const last = b.rows.at(-1)!;
  const label = b.live ? rowWords(last).filter(Boolean).join(" ") : gistWords(b);
  return (
    <div class={`stretch${b.live ? " live" : ""}`}>
      <button class={`gist${open ? " open" : ""}`} aria-expanded={open} onClick={() => setPicked(!open)}>
        {b.live ? <span class="spin" aria-hidden="true" /> : GLYPHS[GIST_GLYPH[b.gist.kind]!]!()}
        <span class="sum">{label}</span>
        <span class="n">· {stepsCount(b.gist.steps)}</span>
        {b.gist.errors > 0 && <span class="errs">· {t("gist.errors", b.gist.errors)}</span>}
        <span class="chev">{GLYPHS.chev!()}</span>
      </button>
      <div class="rows">
        {b.rows.filter((r) => open || r.outcome === "error").map((r) => (
          <Row key={r.seq} r={r} />
        ))}
      </div>
    </div>
  );
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
      return <Stretch b={b} />;
    case "you": {
      const sd = task.sends.find((s) => s.seq === b.seq);
      return (
        <div class="tx you">
          {b.go !== undefined ? shortGo(b.go) : b.text}
          {sd?.delivered && <small>{t(`delivery.${sd.delivered}`)}</small>}
        </div>
      );
    }
    case "partner":
      return (
        <div class="tx said">
          <small>{t("task.from.partner", A.S.personaName)}</small>
          {b.text}
        </div>
      );
    case "report": {
      const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[b.state as string] ?? "task.report";
      return (
        <div class="tx said">
          <small>{t(k, A.S.personaName)}</small>
          {b.text}
        </div>
      );
    }
    case "note":
      return (
        <div class={`step note${b.bad ? " bad" : ""}`}>
          {b.bad ? GLYPHS.error!() : GLYPHS.other!()}
          {b.bad && <b>{t("step.label.error")}</b>}
          <span class="sum" title={b.text}>
            {b.text}
          </span>
        </div>
      );
  }
  return null;
}

/** What the task did (D148): the agent's voice, its steps folded per stretch, your words. */
export function WhatItDid({ task, blocks }: { task: Task; blocks: Block[] }) {
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  const items = blocks.filter((b) => b.k !== "brief").slice(-80).map((b) => <BlockView key={`${b.k}${b.seq}`} task={task} b={b} />);
  for (const sd of task.sends.filter((s) => !s.seq))
    items.push(
      <div key={`s${sd.at}`} class="tx you">
        {sd.text}
        <small>{sd.failed ? t("delivery.failed", sd.failed) : sd.delivered ? t(`delivery.${sd.delivered}`) : t("delivery.sending")}</small>
      </div>,
    );
  return <div class="tx-list">{items}</div>;
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
  else if (p.kind === "browser") parts.push((p as { profile?: string }).profile ?? "");
  const d = (p as { device?: string }).device;
  if (d && d !== "local" && d !== "this") parts.push(t("task.where.on", d));
  return parts.filter(Boolean).join(" · ");
}

/** One quiet line (D148): where it stands and its one clock (since it started, ticking until it
 *  finishes; then how long it took), who does it, where, and Switch who does it. */
export function TaskMeta({ task, stateLabel, mark, onSwitch }: { task: Task; stateLabel: string; mark?: JSX.Element; onSwitch?: () => void }) {
  const a = attention(task);
  const done = finished(task);
  const [, tick] = useState(0);
  useEffect(() => {
    if (done) return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [done]);
  const h = harnessOf(task);
  const m = modelOf(task);
  const who = [harnessName(h), m && modelName(m)].filter(Boolean).join(" · ");
  const where = whereLine(placeOf(task));
  const start = task.openedAt ? Date.parse(task.openedAt) : NaN;
  let when = "";
  if (!Number.isNaN(start)) {
    if (!done) when = elapsed(Date.now() - start);
    else {
      const end = Date.parse(task.events.at(-1)?.ts ?? "");
      if (!Number.isNaN(end) && end > start) when = t("task.footer.took", duration(A.L, end - start));
    }
  }
  const p = placeOf(task) as { repoPath?: string; path?: string };
  return (
    <div class={`standing st-${a}`}>
      {mark}
      <b>{stateLabel}</b>
      {when && <span class="when">· {when}</span>}
      {(who || where) && (
        <span class="who">
          <span class="sep">·</span>
          {h && <Coin harness={h} size={16} motion={done ? "still" : a === "needs_you" ? "needs_you" : a === "working" ? "working" : "still"} />}
          <span title={p.repoPath || p.path || undefined}>{[who, where].filter(Boolean).join(" · ")}</span>
        </span>
      )}
      {onSwitch && (
        <button class="inline-link" aria-expanded={A.switchFor === task.id} onClick={onSwitch}>
          {t("who.switch")} ›
        </button>
      )}
    </div>
  );
}

/** A task title or line with any key in it hidden (the home hides them already; this is the second wall). */
export const safe = (s: string) => redact(s);
