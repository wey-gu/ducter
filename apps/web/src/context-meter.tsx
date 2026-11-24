// D288: 上下文 / Context. A quiet ring by the task's composer that fills with the agent's context
// window (the compaction point a tick on it; butter, never red, once it is close), and the card it
// opens: the window used, the last turn and this task in all, how many times it was compacted,
// 现在压缩 / Compact now, and the agent account's limits when the agent shares them. A popover over
// the ring on every width, placed inside the screen and its safe area (D387, pop-place.ts); it
// scrolls inside when it is taller than the room. Read from the task's own Log (protocol/context-meter.ts).
import { contextMeter, limitSpan, tightest, tokensShort, type AccountUsage, type ContextMeter, type UsageWindow } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Facts } from "./controls.tsx";
import { harnessName, when } from "./format.ts";
import { usePlaced } from "./pop-place.ts";
import { attention, finished, harnessOf, type Task } from "./store.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** The ring's geometry: r 8 in a 20 box, its circumference. */
const R = 8;
const C = 2 * Math.PI * R;

/** The meter of a task, kept while its events don't change. */
const memo = new WeakMap<object, { n: number; m: ContextMeter }>();
export function meterOf(task: Task): ContextMeter {
  const had = memo.get(task.events);
  if (had && had.n === task.events.length) return had.m;
  const m = contextMeter(task.events);
  memo.set(task.events, { n: task.events.length, m });
  return m;
}

/** Whether the task has anything to show: a reading, a window, or a compaction. */
export const hasMeter = (m: ContextMeter) => m.tokens !== undefined || m.window !== undefined || m.compactions > 0;

export function Ring({ m, size = 20 }: { m: ContextMeter; size?: number }) {
  const f = m.tokens !== undefined && m.window ? Math.min(1, m.tokens / m.window) : 0;
  const tick = m.compactAt && m.window ? Math.min(1, m.compactAt / m.window) : undefined;
  const a = tick !== undefined ? -Math.PI / 2 + 2 * Math.PI * tick : 0;
  return (
    <svg class={`ctx-ring${m.level === "near" ? " near" : ""}`} viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <circle class="track" cx="10" cy="10" r={R} />
      {f > 0 && <circle class="fill" cx="10" cy="10" r={R} stroke-dasharray={`${(f * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 10 10)" />}
      {tick !== undefined && tick < 1 && <line class="tick" x1={10 + (R - 2.6) * Math.cos(a)} y1={10 + (R - 2.6) * Math.sin(a)} x2={10 + (R + 2.6) * Math.cos(a)} y2={10 + (R + 2.6) * Math.sin(a)} />}
    </svg>
  );
}

/** The ring by the composer, and its card. Nothing until the agent has said something of its context. */
export function ContextButton({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const m = meterOf(task);
  if (!hasMeter(m)) return null;
  const label = m.percent !== undefined ? t("ctx.ring", `${m.percent}%`) : t("ctx.ring.unknown");
  // D530: under the composer, the ring with its share in words beside it, so it reads as a meter
  // and never as something loading.
  return (
    <span class="ctx-anchor">
      <button ref={btn} type="button" class={`ctx-btn${open ? " on" : ""}`} aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <Ring m={m} size={14} />
        <span aria-hidden="true">{t("ctx.title")}</span>
        {m.percent !== undefined && <span class="pct" aria-hidden="true">{`${m.percent}%`}</span>}
      </button>
      {open && <ContextCard task={task} m={m} anchor={btn} onClose={() => (setOpen(false), btn.current?.focus())} />}
    </span>
  );
}

function Tokens({ x }: { x: { input: number; output: number; cached?: number } }) {
  return (
    <span class="ctx-tok">
      <span>{t("ctx.in", tokensShort(x.input))}</span>
      {x.cached ? <span class="sub">{t("ctx.cached", tokensShort(x.cached))}</span> : null}
      <span>{t("ctx.out", tokensShort(x.output))}</span>
    </span>
  );
}

/** A usage window in words: "7 天额度 · Opus". */
export function limitName(w: UsageWindow): string {
  const s = limitSpan(w);
  const base = s.span === "hours" ? t("ctx.limit.hours", s.n) : s.span === "days" ? t("ctx.limit.days", s.n) : s.span === "extra" ? t("ctx.limit.extra") : s.label;
  return (s.span === "hours" || s.span === "days") && s.model ? t("ctx.limit.model", base, s.model) : base;
}

function Limits({ harness }: { harness: string }) {
  const a = A.accountUsage.get(harness);
  const who = harnessName(harness);
  const u: AccountUsage | undefined = a?.usage;
  if (!u) {
    const why = a?.why;
    return <p class="ctx-why">{why ? t(`ctx.why.${why}`, who) : t("ctx.loading")}</p>;
  }
  const tight = tightest(u.windows);
  const rest = u.windows.filter((w) => w !== tight && w.id !== "extra_usage");
  const row = (w: UsageWindow, main: boolean) => {
    const left = Math.max(0, Math.round((1 - w.used) * 100));
    return (
      <li key={w.id ?? w.label} class={main ? "main" : ""}>
        <span class="nm">{limitName(w)}</span>
        <span class={`left${w.used >= 1 ? " out" : w.used >= 0.8 ? " low" : ""}`}>{w.used >= 1 ? t("ctx.limited") : t("ctx.left", `${left}%`)}</span>
        {w.resetsAt && <span class="at">{t("ctx.resets", when(A.L, w.resetsAt))}</span>}
      </li>
    );
  };
  return (
    <>
      <ul class="ctx-limits">
        {tight && row(tight, true)}
        {rest.map((w) => row(w, false))}
      </ul>
      {(u.plan || u.account) && <Facts class="ctx-acct" items={[u.plan && planWord(u.plan), u.account]} />}
    </>
  );
}

/** A plan as the agent names it, capitalised ("max" → "Max"). */
const planWord = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export function ContextCard({ task, m, anchor, onClose }: { task: Task; m: ContextMeter; anchor: { current: Element | null }; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [asked, setAsked] = useState(false);
  const harness = harnessOf(task);
  usePlaced(true, anchor, box, { align: "end", width: 340, gap: 10 });
  useEffect(() => {
    if (harness) A.askAccountUsage(harness);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const down = (e: PointerEvent) => {
      const el = box.current;
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".ctx-btn")) onClose();
    };
    addEventListener("keydown", key, true);
    addEventListener("pointerdown", down, true);
    box.current?.focus({ preventScroll: true });
    return () => (removeEventListener("keydown", key, true), removeEventListener("pointerdown", down, true));
  }, []);
  const working = attention(task) === "working";
  const canCompact = !finished(task) && !["dropped", "superseded"].includes(attention(task));
  const pct = m.tokens !== undefined && m.window ? Math.min(100, (m.tokens / m.window) * 100) : 0;
  const tick = m.compactAt && m.window ? Math.min(100, (m.compactAt / m.window) * 100) : undefined;
  // The person's /compact, as if typed (never with the composer's pictures): Claude Code runs its
  // own; every other agent gets Ducter's (OAR's manual compaction). Mid-turn it waits for the turn.
  const compact = () => {
    A.send({ t: "task_send", taskId: task.id, text: "/compact", clientId: `c${Date.now()}`, ...(working ? { mode: "queue" as const } : {}) });
    setAsked(true);
  };
  return (
    <div ref={box} tabIndex={-1} class="ctx-pop" role="dialog" aria-label={t("ctx.title")}>
      <div class="ctx-head">
        <span class="ttl">{t("ctx.title")}</span>
        {m.tokens !== undefined && m.window ? (
          <span class="num">
            {tokensShort(m.tokens)} / {tokensShort(m.window)}
          </span>
        ) : null}
      </div>
      <div class={`ctx-bar${m.level === "near" ? " near" : ""}`} role="presentation">
        <span class="fill" style={{ width: `${pct}%` }} />
        {tick !== undefined && tick < 100 && <span class="tick" style={{ left: `${tick}%` }} />}
      </div>
      <p class="ctx-line">
        {m.percent !== undefined ? t("ctx.used", `${m.percent}%`) : m.compactions ? t("ctx.unknown") : t("ctx.none")}
        {/* D291: when it compacts is its own line, as on the Mac. */}
        {m.compactAt ? <span class="sub ctx-sub">{m.level === "near" ? t("ctx.near") : t("ctx.auto", tokensShort(m.compactAt))}</span> : null}
      </p>
      <dl class="ctx-rows">
        {m.turn && (
          <div class="ctx-row">
            <dt>{t("ctx.turn")}</dt>
            <dd>
              <Tokens x={m.turn} />
            </dd>
          </div>
        )}
        {m.total && (
          <div class="ctx-row">
            <dt>{t("ctx.total")}</dt>
            <dd>
              <Tokens x={m.total} />
            </dd>
          </div>
        )}
        {m.compactions > 0 && (
          <div class="ctx-row">
            <dt>{m.compactions === 1 ? t("ctx.compacted.one") : t("ctx.compacted", m.compactions)}</dt>
            <dd class="sub">{m.last?.from && m.last.to ? t("ctx.last", tokensShort(m.last.from), tokensShort(m.last.to)) : m.last?.from ? t("ctx.last.from", tokensShort(m.last.from)) : ""}</dd>
          </div>
        )}
      </dl>
      {canCompact && (
        <div class="ctx-acts">
          <p class="sub">{asked ? (working ? t("ctx.compact.later") : t("ctx.compact.asked")) : t("ctx.compact.what")}</p>
          <Btn kind="secondary" size="sm" label={t("ctx.compact")} disabled={asked} onClick={compact} />
        </div>
      )}
      {harness && (
        <section class="ctx-acct-sec">
          <h3>{t("ctx.account", harnessName(harness))}</h3>
          <Limits harness={harness} />
        </section>
      )}
    </div>
  );
}
