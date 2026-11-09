// The phone's screens: the conversation (default), 手头的事 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import type { Attention, Bodies, EvidenceRef, LivingItem } from "@ducter/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A } from "./app.ts";
import { ago, cjkPad, deviceLabel, duration, harnessName, placeLine, sameWords, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { disablePush, enablePush } from "./push-client.ts";
import { inApp } from "./native.ts";
import {
  attention,
  bodyReasonOf,
  finished,
  harnessOf,
  LANE,
  latestByLabel,
  machineChecked,
  modelOf,
  outsideActs,
  placeOf,
  reasonOf,
  reportOf,
  sortEvidence,
  headlineEvidence,
  resultEvidence,
  title,
  type DecisionState,
  type Entry,
  type Task,
} from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const coarse = () => matchMedia("(pointer: coarse)").matches;

// ---------- small pieces ----------

const ART = ["idle", "working", "needsyou", "done", "napping"] as const;
const FACE_KEY = { idle: "face.idle", working: "face.working", needsyou: "face.needs_you", done: "face.done", napping: "face.napping" };

export function Avatar({ size, state, big }: { size: number; state?: (typeof ART)[number]; big?: boolean }) {
  const p = state ?? A.presence();
  return (
    <span class="avatar" style={{ width: size, height: size }} role="img" aria-label={t(FACE_KEY[p], A.S.personaName)}>
      {ART.map((n) => (
        <img key={n} class={n === p ? "on" : ""} src={big && n === "idle" ? "app/art/idle-lg.png" : `app/art/${n}.png`} alt="" draggable={false} />
      ))}
    </span>
  );
}

// No status dots (ui.md, "Shown, not dotted"): state is the thing itself, its words, or a
// drawn mark for an exception.
const Forward = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 7h9M8 3.5L11.5 7 8 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.4l2.6 2.6L11 4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Clock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
    <path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>
);
const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Out = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.5 10.5l7-7M5.5 3.5h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Bang = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 2.8v5.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="7" cy="11" r="1.3" fill="currentColor" />
  </svg>
);
/** The drawn mark of an attention state: → under way, clock waiting, ! needs you, ✓ done, × didn't work. */
function StateMark({ a }: { a: Attention }) {
  if (a === "blocked" || a === "queued") return <Clock />;
  if (a === "needs_you") return <Bang />;
  if (a === "done" || a === "done_claimed") return <Check />;
  if (a === "failed" || a === "dropped" || a === "superseded") return <Cross />;
  return <Forward />;
}
const Back = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// A finished task reads "Done": done_claimed means nothing checked it yet, and no check runs
// today, so "Done · checking" would promise one that never comes (desktop: stateLabel).
const stateLabel = (a: Attention) => t(`state.${a === "done_claimed" ? "done" : a}`);

function Btn(p: { kind: "primary" | "quiet" | "text" | "accent"; onClick: () => void; label: string; about?: string; disabled?: boolean; grow?: boolean; class?: string }) {
  return (
    <button class={`btn ${p.kind}${p.grow ? " grow" : ""}${p.class ? ` ${p.class}` : ""}`} onClick={p.onClick} aria-label={p.about ? `${p.label} · ${p.about}` : undefined} disabled={p.disabled}>
      {p.label}
    </button>
  );
}

function AutoText(p: { value: string; onInput: (v: string) => void; placeholder: string; label: string; onEnter?: () => void; autoFocus?: boolean; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [p.value]);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      id={p.id}
      rows={1}
      value={p.value}
      placeholder={p.placeholder}
      aria-label={p.label}
      enterkeyhint="send"
      onInput={(e) => p.onInput((e.target as HTMLTextAreaElement).value)}
      onKeyDown={(e) => {
        // On a phone Return breaks the line and the button sends; with a keyboard Enter sends.
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !coarse() && p.onEnter) {
          e.preventDefault();
          p.onEnter();
        }
      }}
    />
  );
}

// ---------- decisions ----------

function defaultInfo(d: DecisionState, now: number): { line: string; frac?: number } {
  if (!d.reversible) return { line: t("decision.no_default") };
  const at = d.defaultAt ? Date.parse(d.defaultAt) : NaN;
  if (d.defaultOption !== "go" || Number.isNaN(at)) return { line: t("decision.default.hold") };
  const left = at - now;
  if (left <= 0) return { line: t("decision.default.due"), frac: 0 };
  let label = d.goLabel || t("decision.go");
  if (A.L.lang === "zh" && label.charCodeAt(0) < 0x80) label = " " + label;
  const asked = d.askedAt ? Date.parse(d.askedAt) : NaN;
  const frac = Number.isNaN(asked) || at <= asked ? undefined : Math.max(0, Math.min(1, left / (at - asked)));
  return { line: t("decision.default.go", duration(A.L, left), label), frac };
}

/** The Go button's words: the action itself when the decision names one ("Rebase"; zh "好，rebase"). */
export function goLabel(d: DecisionState): string {
  if (!d.goLabel) return t("decision.go");
  const l = A.L.lang === "zh" ? d.goLabel : d.goLabel.charAt(0).toUpperCase() + d.goLabel.slice(1);
  return t("decision.go.label", l);
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}

function Resolved({ d }: { d: DecisionState }) {
  const opt = d.resolved?.option ?? d.pending ?? "go";
  let msg = opt === "reply" ? t("decision.resolved.reply", d.resolved?.text ?? "") : t(`decision.resolved.${opt}`);
  if (d.resolved?.by === "default") msg = t("decision.resolved.default");
  return (
    <div class="resolved" role="status">
      <span class="tick">
        <Check />
      </span>
      {msg}
    </div>
  );
}

export function DecisionBody({ d, taskId }: { d: DecisionState; taskId?: string }) {
  useTick(1000);
  const open = !d.resolved && !d.pending;
  const info = defaultInfo(d, Date.now());
  const about = (() => {
    const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
    return task && title(task) ? title(task) : d.question.slice(0, 40);
  })();
  const goText = goLabel(d);
  const draft = A.replyDraft.get(d.decisionId) ?? "";
  return (
    <>
      <div class="q">{d.question}</div>
      {open && <div class="dl">{info.line}</div>}
      {open && info.frac !== undefined && (
        <div class="countdown" aria-hidden="true">
          <i style={{ width: `${info.frac * 100}%` }} />
        </div>
      )}
      {open ? (
        <div class="btns">
          <Btn kind="primary" label={goText} about={about} onClick={() => A.decide(d.decisionId, "go")} />
          <Btn kind="quiet" label={t("decision.hold")} about={about} onClick={() => A.decide(d.decisionId, "hold")} />
          <Btn
            kind="text"
            label={t("decision.reply")}
            about={about}
            onClick={() => {
              A.replyOpen.has(d.decisionId) ? A.replyOpen.delete(d.decisionId) : A.replyOpen.add(d.decisionId);
              A.changed();
            }}
          />
        </div>
      ) : (
        <Resolved d={d} />
      )}
      {open && A.replyOpen.has(d.decisionId) && (
        <div class="reply">
          <AutoText
            value={draft}
            autoFocus
            label={t("decision.reply.placeholder")}
            placeholder={t("decision.reply.placeholder")}
            onInput={(v) => (A.replyDraft.set(d.decisionId, v), A.changed())}
            onEnter={() => draft.trim() && (A.decide(d.decisionId, "reply", draft.trim()), A.replyDraft.delete(d.decisionId))}
          />
          <button
            class="send"
            aria-label={t("composer.send")}
            disabled={!draft.trim()}
            onClick={() => {
              A.decide(d.decisionId, "reply", draft.trim());
              A.replyDraft.delete(d.decisionId);
            }}
          >
            <Arrow />
          </button>
        </div>
      )}
    </>
  );
}

/** One ask: the asking task's title as a quiet link (nothing for the partner's own asks, or
 *  inside its own task), the question, its default, and Go / Hold / Reply…. */
function DecisionCard({ d, taskId, inTask }: { d: DecisionState; taskId?: string; inTask?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const flash = A.flash === d.decisionId;
  useEffect(() => {
    if (flash) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      A.flash = undefined;
    }
  }, [flash]);
  const id = taskId || d.taskId;
  const task = id ? A.S.tasks.get(id) : undefined;
  return (
    <div ref={ref} class={`decision${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
      {task && title(task) && !inTask && (
        // On the phone the asking task's title is the way into it (no Details button to wrap).
        <button class="asker" onClick={() => ((A.sheet = null), A.go({ name: "task", id: task.id }))}>
          {title(task)} ›
        </button>
      )}
      <DecisionBody d={d} taskId={taskId} />
    </div>
  );
}

// ---------- tasks in the conversation ----------

/** A task in the partner's words: its drawn mark, its title as a link, its status in muted
 *  words. No fill, no capsule (D73). */
function TaskLine({ task, detail }: { task: Task; detail?: string }) {
  const a = attention(task);
  const d = (!sameWords(detail, title(task)) && detail) || stateLabel(a);
  return (
    <button class="taskline" onClick={() => A.go({ name: "task", id: task.id })}>
      <span class="ic">
        <StateMark a={a} />
      </span>
      <span class="t">{title(task) || t("task.unknown")}</span>
      <span class="s">· {d} ›</span>
    </button>
  );
}

function openEvidence(ev: EvidenceRef, task?: Task) {
  if (ev.kind === "diff" && task) return A.go({ name: "task", id: task.id });
  if (/^https?:/.test(ev.ref)) return void window.open(ev.ref, "_blank", "noopener");
  navigator.clipboard?.writeText(ev.ref).catch(() => {});
  A.toast(`${ev.label} · ${ev.ref}`);
}

/** How the task knows, as one quiet line that wraps: a drawn ✓ (× for a task that didn't work)
 *  and plain words per check, the changes as "2 files changed ›", and, withTitle, the task's
 *  title as a link at its end. */
function ProofLine({ task, evs, withTitle, max = 4 }: { task: Task; evs: EvidenceRef[]; withTitle?: boolean; max?: number }) {
  const list = sortEvidence(latestByLabel(evs));
  const failed = attention(task) === "failed";
  const changes = list.find((e) => e.kind === "diff");
  const rest = list.filter((e) => e.kind !== "diff");
  if (!rest.length && !changes && !withTitle) return null;
  return (
    <div class="proof">
      {rest.slice(0, max).map((ev, i) =>
        /^https?:/.test(ev.ref) ? (
          <button key={i} class="qlink" onClick={() => openEvidence(ev, task)}>
            {ev.label} ›
          </button>
        ) : (
          <span key={i} class="mk" title={ev.ref}>
            {failed ? <Cross /> : machineChecked(ev.kind) ? <Check /> : null}
            {ev.label}
          </span>
        ),
      )}
      {rest.length > max && (
        <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
          {t("result.more", rest.length - max)}
        </button>
      )}
      {changes &&
        (withTitle ? (
          <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
            {changes.label} ›
          </button>
        ) : (
          <span class="mk">{changes.label}</span>
        ))}
      {withTitle && (
        <button class="qlink" onClick={() => A.go({ name: "task", id: task.id })}>
          {title(task) || t("task.unknown")} ›
        </button>
      )}
    </div>
  );
}

/** What the task sent out, in one line, from its log. Empty when nothing went out (a row
 * with nothing to say is left out; the task's Sent out card still says so), or until the log
 * is loaded. */
function outsideLine(task: Task): string {
  if (!task.historyLoaded) return "";
  const acts = outsideActs(task);
  if (!acts.length) return "";
  return `${acts[0]!.command}${acts.length > 1 ? " · " + t("result.more", acts.length - 1) : ""}`;
}

function ResultActions({ task, inTask }: { task: Task; inTask?: boolean }) {
  const p = placeOf(task);
  if (attention(task) === "failed" || p.kind !== "repo" || !p.branch) return null;
  const base = p.baseBranch || "main";
  return (
    <div class="btns">
      {task.acting ? (
        <span class="small">{t(`result.acting.${task.acting}`, base)}</span>
      ) : task.unsure ? (
        // The result was lost with the connection and the Log doesn't show it done: say so,
        // offer to try again, never claim a failure.
        <>
          <span class="small">{t("result.unsure")}</span>
          <Btn kind="quiet" label={t("task.action.retry")} about={title(task)} onClick={() => A.retryAction(task.id)} />
        </>
      ) : task.acted?.ok && task.acted.action === "merge" ? (
        <span class="small" style={{ color: "var(--done-ink)", fontWeight: 700 }}>
          {t("result.merged", base)}
        </span>
      ) : (
        <>
          <Btn kind="primary" label={t("result.merge", base)} about={title(task)} onClick={() => A.taskAction(task.id, "merge")} />
          <Btn kind="quiet" label={t("result.pr")} about={title(task)} onClick={() => A.taskAction(task.id, "open_pr")} />
        </>
      )}
    </div>
  );
}

/** What went out, only when something did: a drawn ↗ and the literal action. */
function SentLine({ task }: { task: Task }) {
  const line = outsideLine(task);
  if (!line) return null;
  return (
    <div class="proof">
      <span class="mk">
        <Out />
        {line}
      </span>
    </div>
  );
}

/** Under a message about a task. Under way: one quiet line. Finished: the result message
 *  already says the outcome, so no state is restated: one line of proof, what went out, then
 *  Merge / Open draft PR (D73). */
function TaskFooter({ task, detail }: { task: Task; detail?: string }) {
  if (!finished(task)) return <TaskLine task={task} detail={detail} />;
  A.history(task.id);
  return (
    <div class="footer">
      <ProofLine task={task} evs={resultEvidence(task)} withTitle />
      <SentLine task={task} />
      <ResultActions task={task} />
    </div>
  );
}

function JobRow({ e, chipOwner }: { e: Entry; chipOwner: Map<string, number> }) {
  const j = e.job!;
  const st = j.status;
  const task = st?.taskId ? A.S.tasks.get(st.taskId) : undefined;
  return (
    <div class="partner">
      {j.ack && <div>{j.ack.text}</div>}
      {st &&
        (task && title(task) ? (
          chipOwner.get(task.id) === e.firstSeq && (
            <div class="footer">
              <TaskFooter task={task} detail={st.text} />
            </div>
          )
        ) : (
          <div class={`status-line${st.state === "failed" ? " failed" : ""}`} style={{ marginTop: 8 }}>
            {st.text}
          </div>
        ))}
    </div>
  );
}

function LivingLine({ it }: { it: LivingItem }) {
  const text = it.title ? `${it.title} · ${it.text}` : it.text;
  return (
    <button class="line" onClick={() => it.taskId && A.go({ name: "task", id: it.taskId })}>
      <span class="ic">{it.kind === "done" ? <Check /> : it.kind === "blocked" ? <Clock /> : it.kind === "failed" ? <Cross /> : <Forward />}</span>
      <span class="tx">{text}</span>
    </button>
  );
}

function Living({ e, items }: { e: Entry; items: LivingItem[] }) {
  // "While you were away" only when the user was: it came before this page loaded and they
  // hadn't read it, or it came while the page was hidden (app.ts records that as it lands).
  // Latched the first time it shows: reading it must not take the title away.
  if (!A.livingAway.has(e.firstSeq)) A.livingAway.set(e.firstSeq, e.firstSeq <= A.S.headSeq && A.S.unread(e));
  const away = A.livingAway.get(e.firstSeq)!;
  const decisions = items.filter((it) => it.kind === "decision");
  const open = decisions.filter((it) => {
    const d = it.decisionId ? A.S.decisions.get(it.decisionId) : undefined;
    return d && !d.resolved && !d.pending && d.reversible;
  }).length;
  return (
    <section class="living" key={`${e.firstSeq}:${e.revision}`} aria-label={t("living.title")}>
      {away && <h2>{t("living.title")}</h2>}
      {decisions.length > 0 && (
        <div class="needs-head">
          <span>{t("header.needs", decisions.length)}</span>
          {open >= 2 && <Btn kind="text" label={t("decision.goall", A.defaultable().length)} onClick={() => A.goOnAllDefaults()} />}
        </div>
      )}
      {decisions.map((it, i) => {
        const d = it.decisionId ? A.S.decisions.get(it.decisionId) : undefined;
        return d ? (
          <DecisionCard key={i} d={d} taskId={it.taskId} />
        ) : (
          <div class="decision" key={i}>
            <div class="q">{it.text}</div>
          </div>
        );
      })}
      {items
        .filter((it) => it.kind !== "decision")
        .map((it, i) => (
          <LivingLine key={i} it={it} />
        ))}
    </section>
  );
}

function EntryView({ e, chipOwner, livingItems }: { e: Entry; chipOwner: Map<string, number>; livingItems: (e: Entry) => LivingItem[] }) {
  if (e.user) return <div class="user">{e.user.text}</div>;
  if (e.ai) {
    const ids = e.ai.replyTo ? A.S.tasksOfReply(e.ai.replyTo).filter((id) => chipOwner.get(id) === e.firstSeq) : [];
    return (
      <div class="partner">
        <div dangerouslySetInnerHTML={{ __html: markdown(e.ai.text) }} />
        {ids.map((id) => {
          const task = A.S.tasks.get(id);
          return task ? (
            <div class="footer" key={id}>
              <TaskFooter task={task} />
            </div>
          ) : null;
        })}
      </div>
    );
  }
  if (e.job) return <JobRow e={e} chipOwner={chipOwner} />;
  if (e.living) return <Living e={e} items={livingItems(e)} />;
  if (e.decision) {
    const d = A.S.decisions.get(e.decision.decisionId);
    if (!d) return null;
    return <DecisionCard d={d} />;
  }
  return null;
}

// ---------- header, composer ----------

function OnHandButton() {
  // Just the word: the header line says what needs you, in words; no row of colored dots.
  return (
    <button class="onhand-btn" onClick={() => A.go({ name: "onhand" })}>
      {t("nav.onhand")}
    </button>
  );
}

function Top({ back }: { back?: string }) {
  if (back)
    return (
      <header class="top">
        <button class="back" onClick={() => (history.length > 1 && location.hash ? history.back() : A.go({ name: "conv" }))}>
          <Back />
          {back}
        </button>
        <span style={{ flex: 1 }} />
        <Avatar size={36} />
      </header>
    );
  return (
    <header class="top">
      <button class="who" onClick={() => A.openSettings()} aria-label={t("settings.title")}>
        <Avatar size={46} />
        <span style={{ minWidth: 0 }}>
          <div class="name">{A.S.personaName}</div>
          <div class="sum" role="status">
            {A.summary()}
          </div>
        </span>
      </button>
      <OnHandButton />
    </header>
  );
}

function Held() {
  if (!A.held) return null;
  return (
    <div class="held" role="alert">
      <span>{t("secret.held")}</span>
      <Btn kind="quiet" label={t("secret.cancel")} onClick={() => ((A.held = undefined), A.changed())} />
      <Btn kind="text" label={t("secret.send")} onClick={() => A.sendHeld()} />
    </div>
  );
}

function Composer({ taskId }: { taskId?: string }) {
  const value = taskId ? (A.taskDrafts.get(taskId) ?? "") : A.draft;
  const set = (v: string) => {
    if (taskId) A.taskDrafts.set(taskId, v);
    else A.draft = v;
    A.changed();
  };
  const submit = () => {
    const ok = taskId ? A.sendToTask(taskId, value) : A.sendMessage(value);
    if (ok) set("");
  };
  const label = taskId ? t("composer.task") : t("composer.label", A.S.personaName);
  return (
    <div class="composer-wrap">
      {(A.held?.taskId ?? "") === (taskId ?? "") && <Held />}
      <div class="composer">
        <AutoText id="composer" value={value} onInput={set} onEnter={submit} label={label} placeholder={taskId ? t("composer.task") : t("composer.placeholder", A.S.personaName)} />
        <button class="send" aria-label={t("composer.send")} disabled={!value.trim()} onClick={submit}>
          <Arrow />
        </button>
      </div>
    </div>
  );
}

// ---------- notifications ask (in the partner's voice, with a default) ----------

/** Asks the browser, subscribes, tells core; says so if the browser can't. */
async function turnOnPush() {
  try {
    const s = await Promise.race([
      enablePush(A.api, A.base, A.L.lang, A.me!.push.publicKey!),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 20_000)),
    ]);
    if (s === "denied") A.toast(t("notify.denied"));
    if (s === "unsupported") A.toast(t(inApp() ? "notify.app.unavailable" : "notify.unsupported"));
    return s;
  } catch (err) {
    A.toast(t("result.action.failed", (err as Error).message));
    return "off" as const;
  }
}

const ASKED = "ducter.notify.asked";
const asked = () => {
  try {
    return localStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
};

function NotifyAsk() {
  const [busy, setBusy] = useState(false);
  if (asked() || !A.me) return null;
  const hasWork = A.S.board().lanes.some((l) => l.length > 0) || A.S.openDecisions().length > 0;
  if (!hasWork) return null; // asked at the moment it means something: once there's work out
  const dismiss = () => {
    try {
      localStorage.setItem(ASKED, "1");
    } catch {}
    A.changed();
  };
  if (A.push === "ios-install")
    return (
      <div class="hint" role="note">
        {t("notify.ios")}{" "}
        <button class="more" onClick={dismiss}>
          {t("sheet.close")}
        </button>
      </div>
    );
  if (A.push !== "off" || !A.me.push.publicKey || (inApp() && !A.me.push.apns)) return null;
  return (
    <div class="ask">
      <div class="q">{t("notify.ask")}</div>
      <div class="note">{t("notify.ask.note", "23:00", "08:00")}</div>
      <div class="btns">
        <Btn
          kind="primary"
          label={t("notify.on")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            A.push = await turnOnPush();
            setBusy(false);
            dismiss();
            if (A.push === "on") A.toast(t("notify.enabled"));
          }}
        />
        <Btn kind="quiet" label={t("notify.later")} onClick={dismiss} />
      </div>
    </div>
  );
}

// ---------- the conversation ----------

export function Conversation() {
  const { rows, livingItems, chipOwner } = A.rows();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  });
  const empty = rows.length === 0 && A.pending.length === 0 && A.S.welcomed;
  return (
    <>
      <Top />
      {A.status === "offline" && (
        <div class="conn" role="status">
          {t("conn.offline")}
        </div>
      )}
      <main
        class="scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div class="spacer" />
        {empty && <Hello />}
        {rows.map((e) => (
          <EntryView key={e.firstSeq} e={e} chipOwner={chipOwner} livingItems={livingItems} />
        ))}
        {A.pending.map((p) => (
          <div key={p.clientId} class="user pending">
            {p.text}
          </div>
        ))}
        <NotifyAsk />
      </main>
      <Composer />
    </>
  );
}

function Hello() {
  return (
    <div class="hello">
      <Avatar size={150} state="idle" big />
      <h1>{t("empty.conversation.title", A.S.personaName)}</h1>
      <p>{t("empty.conversation")}</p>
      <div class="try">
        <div class="label">{t("empty.try")}</div>
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            class="suggest press"
            onClick={() => {
              A.draft = t(`suggest.${i}`); // fills the composer; never sends
              A.changed();
              document.getElementById("composer")?.focus();
            }}
          >
            {t(`suggest.${i}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- On hand ----------

function metaLine(task: Task): string {
  const project = task.open?.project ?? task.card?.project ?? "";
  return [project || t("onhand.loose"), placeLine(A.L, placeOf(task))].filter(Boolean).join(" · ");
}

function waitReason(task: Task): string {
  const w = A.S.waiterFor(task.id);
  if (w) return t("onhand.waiting.for", w.at ? `${w.reason} · ${t("waiter.at", when(A.L, w.at))}` : w.reason);
  const r = reasonOf(task);
  return r ? t("onhand.waiting.for", r) : metaLine(task);
}

function Row({ task, meta, waiting }: { task: Task; meta: string; waiting?: boolean }) {
  return (
    <button class={`row${waiting ? " waiting" : ""}`} onClick={() => A.go({ name: "task", id: task.id })}>
      <span class="main">
        <span class="t">{title(task) || t("task.unknown")}</span>
        <span class="m">{meta}</span>
      </span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function OnHand() {
  const b = A.S.board();
  const needs = b.lanes[LANE.needs]!;
  const partnerDs = A.S.partnerDecisions();
  const working = b.lanes[LANE.working]!;
  const waiting = b.lanes[LANE.waiting]!;
  const done = b.lanes[LANE.done]!;
  const loose = A.S.armedWaiters().filter((w) => !w.taskId);
  const nothing = !needs.length && !partnerDs.length && !working.length && !waiting.length && !done.length && !loose.length;
  const openCount = A.defaultable().length;
  return (
    <>
      <Top back={t("nav.back")} />
      <main class="scroll" style={{ gap: 16 }}>
        <h1 class="page-title">{t("onhand.title")}</h1>
        {nothing ? (
          <div class="calm">{t("onhand.empty", A.S.personaName)}</div>
        ) : (
          <>
            <section class="section">
              <h3>
                {t("lane.needs_you")} <span class="n">{needs.length + partnerDs.length || ""}</span>
                {openCount >= 2 && (
                  <span style={{ marginLeft: "auto" }}>
                    <Btn kind="text" label={t("decision.goall", openCount)} onClick={() => A.goOnAllDefaults()} />
                  </span>
                )}
              </h3>
              {!needs.length && !partnerDs.length && (
                <div class="calm">{working.length ? t("onhand.calm.working", A.S.personaName, working.length) : t("onhand.calm")}</div>
              )}
              {partnerDs.map((d) => (
                <DecisionCard key={d.decisionId} d={d} />
              ))}
              {needs.map((task) => {
                const d = A.S.pendingDecision(task.id);
                return d ? <DecisionCard key={task.id} d={d} taskId={task.id} /> : <Row key={task.id} task={task} meta={metaLine(task)} />;
              })}
            </section>
            {working.length > 0 && (
              <section class="section">
                <h3>
                  {t("lane.working")} <span class="n">{working.length}</span>
                </h3>
                {working.map((task) => (
                  <Row key={task.id} task={task} meta={metaLine(task)} />
                ))}
              </section>
            )}
            {(waiting.length > 0 || loose.length > 0) && (
              <section class="section">
                <h3>
                  {t("lane.waiting")} <span class="n">{waiting.length + loose.length}</span>
                </h3>
                {waiting.map((task) => (
                  <Row key={task.id} task={task} meta={waitReason(task)} waiting />
                ))}
                {loose.map((w) => (
                  <div class="row waiting" key={w.waiterId}>
                    <Clock />
                    <span class="main">
                      <span class="t">{w.reason}</span>
                      {w.at && <span class="m">{t("waiter.at", when(A.L, w.at))}</span>}
                    </span>
                  </div>
                ))}
              </section>
            )}
            {done.length > 0 && (
              <section class="section">
                <h3>
                  {t("lane.done")} <span class="n">{done.length}</span>
                </h3>
                {done.map((task) => {
                  const r = reportOf(task);
                  const ev = headlineEvidence(task.evidence.length ? task.evidence : (r?.evidence ?? []));
                  // The lane says Done; only the exception (Didn't work) is said, in words.
                  const failed = attention(task) === "failed";
                  return <Row key={task.id} task={task} meta={[failed ? stateLabel("failed") : "", (!failed && ev?.label) || (r?.summary.split("\n")[0] ?? "")].filter(Boolean).join(" · ")} />;
                })}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

// ---------- an opened task ----------

function reportLabel(r: Bodies["report"]) {
  const k = { needs_input: "task.report.needs_input", done: "task.report.done", blocked: "task.report.blocked", failed: "task.report.failed" }[r.state as string] ?? "task.report";
  return t(k, A.S.personaName);
}

type Tool = NonNullable<Bodies["task_event"]["tool"]>;

function toolArg(tool: Tool): string {
  const input = tool.input as Record<string, unknown> | string | undefined;
  const arg = typeof input === "string" ? input : input ? String(input.command ?? input.file_path ?? input.path ?? input.url ?? input.pattern ?? "") : "";
  return arg.split("\n")[0] ?? "";
}

/** A stretch of tool calls counted in words: "Ran 2 commands, edited 1 file". */
function foldLine(tools: Tool[]): string {
  let ran = 0, other = 0;
  const edited = new Set<string>(), read = new Set<string>();
  for (const tool of tools) {
    const name = tool.name.startsWith("mcp__") ? tool.name.slice(tool.name.lastIndexOf("__") + 2) : tool.name;
    const input = tool.input as Record<string, unknown> | undefined;
    const path = String((typeof input === "object" && input && (input.file_path ?? input.path)) || "");
    if (["Bash", "shell", "exec_command"].includes(name)) ran++;
    else if (["Edit", "Write", "MultiEdit", "apply_patch"].includes(name)) edited.add(path);
    else if (name === "Read") read.add(path);
    else other++;
  }
  const parts: string[] = [];
  const count = (key: string, n: number) => n === 1 ? parts.push(t(`${key}.one`)) : n > 1 && parts.push(t(key, n));
  count("task.fold.ran", ran);
  count("task.fold.edited", edited.size);
  count("task.fold.read", read.size);
  count("task.fold.other", other);
  const s = parts.join(t("task.fold.and"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Fold({ tools }: { tools: Tool[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="fold">
      <button class={`fold-line${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="chev">›</span>
        {foldLine(tools)}
      </button>
      {open && tools.map((tool, i) => <div key={i} class="tool">{`${tool.name}${toolArg(tool) ? " · " + toolArg(tool) : ""}`}</div>)}
    </div>
  );
}

/** What the task did, as a short narrative: its own words; tool calls that went fine folded
 *  into one line per stretch; a step that didn't work in words. The latest report is said
 *  above (the outcome, or where it stands). */
function WhatItDid({ task }: { task: Task }) {
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  const items: JSX.Element[] = [];
  const lastReport = task.events.filter((ev) => ev.kind === "report").at(-1)?.seq;
  let fold: Tool[] | undefined;
  for (const ev of task.events) {
    if (ev.kind === "task_event") {
      const b = ev.body as Bodies["task_event"];
      if (b.tool && b.tool.ok !== false) {
        if (fold) fold.push(b.tool);
        else items.push(<Fold key={ev.seq} tools={(fold = [b.tool])} />);
        continue;
      }
    }
    fold = undefined;
    if (ev.kind === "task_open") items.push(<div key={ev.seq} class="tx said"><small>{t("task.brief", A.S.personaName)}</small>{(ev.body as Bodies["task_open"]).brief}</div>);
    else if (ev.kind === "checkpoint") items.push(<div key={ev.seq} class="tx note">{t("task.checkpoint", (ev.body as Bodies["checkpoint"]).text)}</div>);
    else if (ev.kind === "report" && ev.seq !== lastReport) {
      const r = ev.body as Bodies["report"];
      items.push(<div key={ev.seq} class="tx said"><small>{reportLabel(r)}</small>{r.summary}</div>);
    } else if (ev.kind === "task_event") {
      const b = ev.body as Bodies["task_event"];
      if (b.tool) {
        items.push(
          <div key={ev.seq} class="tx failed">
            <span class="mk">
              <Cross />
              {t("task.step.failed", toolArg(b.tool) || b.tool.name)}
            </span>
            {b.tool.output && <code>{b.tool.output.split("\n")[0]}</code>}
          </div>,
        );
      } else if (b.role === "user" && b.text) {
        const sd = task.sends.find((s) => s.seq === ev.seq);
        items.push(
          <div key={ev.seq} class="tx you">
            {b.text}
            <small>{b.from === "partner" ? t("task.from.partner", A.S.personaName) : sd?.delivered ? t(`delivery.${sd.delivered}`) : t("task.you")}</small>
          </div>,
        );
      } else if (b.role === "assistant" && b.text) items.push(<div key={ev.seq} class="tx assistant">{b.text}</div>);
    }
  }
  const tail = items.slice(-40); // a read-only tail; the full transcript is the desktop's job
  for (const sd of task.sends.filter((s) => !s.seq))
    tail.push(
      <div key={`s${sd.at}`} class="tx you">
        {sd.text}
        <small>{sd.failed ? t("delivery.failed", sd.failed) : sd.delivered ? t(`delivery.${sd.delivered}`) : t("delivery.sending")}</small>
      </div>,
    );
  return <div class="tx-list">{tail}</div>;
}

/** A quiet disclosure at the bottom: who is doing it, where (repo and branch), saved progress,
 *  what went out. A row with nothing to say is left out. */
function TaskDetails({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const who = [harnessName(harnessOf(task)), modelOf(task)].filter(Boolean).join(" · ");
  const why = bodyReasonOf(task);
  const where = placeLine(A.L, placeOf(task));
  const acts = task.historyLoaded ? outsideActs(task) : [];
  const cps = task.events.filter((ev) => ev.kind === "checkpoint");
  return (
    <section class="details-box">
      <button class={`fold-line${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("task.details")} <span class="chev">›</span>
      </button>
      {open && (
        <dl class="kv">
          {who && (
            <>
              <dt>{t("task.dossier.body")}</dt>
              <dd>
                {who}
                {why && <div>{why}</div>}
              </dd>
            </>
          )}
          {where && (
            <>
              <dt>{t("task.dossier.where")}</dt>
              <dd>{where}</dd>
            </>
          )}
          {cps.length > 0 && (
            <>
              <dt>{t("task.dossier.checkpoints")}</dt>
              <dd>
                {cps.map((ev) => (
                  <div key={ev.seq}>{(ev.body as Bodies["checkpoint"]).text}</div>
                ))}
              </dd>
            </>
          )}
          {acts.length > 0 && (
            <>
              <dt>{t("outside.title")}</dt>
              <dd>
                {acts.map((x) => (
                  <code key={x.seq}>{x.command}</code>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

/** An opened task: one column, read top to bottom (D74). Where it stands in words; a pending
 *  ask; the outcome said once with how it knows and what to do next; what it did; Details.
 *  The phone shows no diffs: the changes are named in the proof line. */
export function TaskView({ id }: { id: string }) {
  const task = A.S.tasks.get(id);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => A.history(id), [id, A.S.welcomed]);
  if (!task)
    return (
      <>
        <Top back={t("nav.back")} />
        <main class="scroll">
          <div class="small">{t("task.loading")}</div>
        </main>
      </>
    );
  const a = attention(task);
  const d = A.S.pendingDecision(id);
  const r = reportOf(task);
  const detail = !finished(task) && r ? r.summary.split("\n")[0] : "";
  return (
    <>
      <Top back={t("nav.back")} />
      <main class="scroll task-page" ref={scroller}>
        <div class="task-head">
          <h1>{title(task) || t("task.unknown")}</h1>
          <div class={`standing st-${a}`}>
            <StateMark a={a} />
            <b>{stateLabel(a)}</b>
            {detail && <span>· {detail}</span>}
            {task.openedAt && <span class="when">· {t("task.opened", ago(A.L, task.openedAt))}</span>}
          </div>
        </div>
        {d && !d.resolved && <DecisionCard d={d} taskId={id} inTask />}
        {finished(task) && (
          <div class="outcome">
            {r && <div class="said">{r.summary}</div>}
            <ProofLine task={task} evs={resultEvidence(task)} />
            <SentLine task={task} />
            {a === "failed" ? (
              <div class="btns">
                <Btn kind="quiet" label={t("task.action.retry")} onClick={() => A.taskAction(id, "reopen")} />
              </div>
            ) : (
              <ResultActions task={task} inTask />
            )}
          </div>
        )}
        {!finished(task) && (
          <div class="btns">
            {(a === "working" || a === "queued") && <Btn kind="text" label={t("task.action.pause")} onClick={() => A.taskAction(id, "interrupt")} />}
            {!["dropped", "superseded", "done"].includes(a) && <Btn kind="text" label={t("task.action.drop")} onClick={() => A.drop(id)} />}
          </div>
        )}
        <section class="section">
          <h2 class="sec-title">{t("task.transcript")}</h2>
          <WhatItDid task={task} />
        </section>
        <TaskDetails task={task} />
      </main>
      <Composer taskId={id} />
    </>
  );
}

// ---------- sheets ----------

function Sheet({ children, label }: { children: preact.ComponentChildren; label: string }) {
  const close = () => ((A.sheet = null), A.changed());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div class="grab" />
        {children}
        <Btn kind="quiet" class="sheet-close" label={t("sheet.close")} onClick={close} />
      </div>
    </>
  );
}

function DecisionSheet({ id }: { id: string }) {
  const d = A.S.decisions.get(id);
  const answered = !!(d?.resolved || d?.pending);
  useEffect(() => {
    // Decided with one thumb: let the card settle, then get out of the way.
    if (!answered) return;
    const h = setTimeout(() => ((A.sheet = null), A.changed()), 1400);
    return () => clearTimeout(h);
  }, [answered]);
  if (!d) return <Sheet label={t("state.needs_you")}>{<div class="small">{t("conn.connecting")}</div>}</Sheet>;
  const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  return (
    <Sheet label={t("state.needs_you")}>
      <DecisionCard d={d} taskId={d.taskId} />
    </Sheet>
  );
}

// A segmented choice: flat, the chosen one on the surface with an ink hairline (no ledge, no pill).
function Seg<V extends string | number>(p: { label: string; value: V | undefined; options: { v: V; label: string }[]; onPick: (v: V) => void }) {
  return (
    <div class="seg" role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === p.value} class={o.v === p.value ? "on" : ""} onClick={() => o.v !== p.value && p.onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch">
      <span>{p.label}</span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function NameRow() {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const save = () => {
    const n = draft.trim();
    if (n && n !== A.S.personaName) A.setSettings({ name: n });
    setEditing(false);
  };
  return (
    <div class="partner-head">
      <Avatar size={64} />
      {editing ? (
        <>
          <input
            class="name-input"
            value={draft}
            maxLength={24}
            aria-label={t("partner.rename")}
            autoFocus
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) save();
              if (e.key === "Escape") e.stopPropagation(), setEditing(false);
            }}
          />
          <Btn kind="text" label={t("partner.rename.cancel")} onClick={() => setEditing(false)} />
          <Btn kind="primary" label={t("partner.rename")} onClick={save} />
        </>
      ) : (
        <>
          <h2 class="grow">{A.S.personaName}</h2>
          {A.settings && <Btn kind="text" label={t("partner.rename")} onClick={() => (setDraft(A.S.personaName), setEditing(true))} />}
        </>
      )}
    </div>
  );
}

function PartnerSettings() {
  const s = A.settings;
  const mem = A.mem;
  if (!s) return <div class="small">{t("conn.connecting")}</div>;
  const quiet = s.quiet;
  const setQuiet = (start: string, end: string) => A.setSettings({ quiet: { start, end, tz: quiet?.tz ?? tz() } });
  return (
    <>
      <section class="set">
        <h3>{t("partner.talk.title")}</h3>
        <Seg
          label={t("partner.talk.title")}
          value={s.language}
          options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`partner.talk.${v}`) }))}
          onPick={(language) => A.setSettings({ language })}
        />
        <div class="small sub">{s.language === "auto" ? t("partner.talk.auto.note") : t("partner.talk.fixed.note", t(`partner.talk.${s.language}`))}</div>
      </section>
      <section class="set">
        <h3>{t("partner.notify.title")}</h3>
        <Toggle label={t("partner.notify.on")} checked={s.notify} onChange={(notify) => A.setSettings({ notify })} />
        <div class="small sub">{t(s.notify ? "partner.notify.on.note" : "partner.notify.off.note")}</div>
        <Toggle label={t("partner.quiet")} checked={!!quiet} onChange={(on) => A.setSettings({ quiet: on ? { start: "23:00", end: "08:00", tz: tz() } : null })} />
        {quiet && (
          <div class="quiet-range">
            <input type="time" aria-label={t("partner.quiet")} value={quiet.start} onChange={(e) => setQuiet((e.target as HTMLInputElement).value || quiet.start, quiet.end)} />
            <span>{t("partner.quiet.to")}</span>
            <input type="time" aria-label={`${t("partner.quiet")} ${t("partner.quiet.to")}`} value={quiet.end} onChange={(e) => setQuiet(quiet.start, (e.target as HTMLInputElement).value || quiet.end)} />
          </div>
        )}
        {quiet && <div class="small sub">{t("partner.quiet.note")}</div>}
      </section>
      <section class="set">
        <h3>{t("partner.default.title")}</h3>
        <div class="small sub">{t("partner.default.line")}</div>
        <Seg
          label={t("partner.default.line")}
          value={s.defaultAfterMin}
          options={[10, 30, 60, 120].map((v) => ({ v, label: v < 60 ? t("partner.default.min", v) : t("partner.default.hour", v / 60) }))}
          onPick={(defaultAfterMin) => A.setSettings({ defaultAfterMin })}
        />
        <div class="small sub">{t("partner.default.note")}</div>
      </section>
      <section class="set">
        <h3>{t("partner.memory.title")}</h3>
        {mem && <div class="small sub">{t(`partner.memory.${mem.state}`)}</div>}
        {mem?.state === "missing" && (
          <a class="more" href="https://mem.nowledge.co" target="_blank" rel="noopener">
            {t("partner.memory.connect")}
          </a>
        )}
        <Toggle label={t("partner.memory.switch")} checked={s.memory} onChange={(memory) => A.setSettings({ memory })} />
        {s.memory && !!mem?.noted.length && (
          <div class="noted" aria-label={t("partner.memory.recent")}>
            {mem.noted.map((n) => (
              <div class="noted-row" key={n.seq}>
                <span>{n.title}</span>
                <Btn kind="text" label={t("partner.memory.forget")} about={n.title} onClick={() => A.forget(n.seq)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function PhoneSettings() {
  const [push, setPush] = useState<{ done: boolean } | null>(null);
  useEffect(() => {
    void A.api.call<{ done: boolean }>("api/push/settings").then((r) => r.data && setPush(r.data));
  }, [A.push]);
  return (
    <section class="set">
      <h3>{t("settings.phone")}</h3>
      <div class="small">{A.me?.via === "device" ? `${A.me.deviceName ?? ""}` : deviceLabel(A.L, "local")}</div>
      <div class="small sub">{t("settings.lang.title")}</div>
      <Seg label={t("settings.lang.title")} value={A.uiLang} options={(["auto", "zh", "en"] as const).map((v) => ({ v, label: t(`settings.lang.${v}`) }))} onPick={(v) => A.setUiLang(v)} />
      {A.settings?.notify !== false && (
        <>
          {A.push === "ios-install" && <div class="hint">{t("notify.ios")}</div>}
          {A.push === "unsupported" && <div class="hint">{t(inApp() ? "notify.app.unavailable" : "notify.unsupported")}</div>}
          {inApp() && A.push === "off" && !A.me?.push.apns && <div class="hint">{t("notify.app.nokey")}</div>}
          {A.push === "denied" && <div class="hint">{t("notify.denied")}</div>}
          {A.push === "off" && A.me?.push.publicKey && (!inApp() || A.me.push.apns) && (
            <Btn
              kind="primary"
              label={t("notify.on")}
              onClick={async () => {
                A.push = await turnOnPush();
                A.changed();
              }}
            />
          )}
          {A.push === "on" && (
            <>
              <div class="small">{t("notify.enabled")}</div>
              <Toggle
                label={t("notify.done")}
                checked={push?.done ?? false}
                onChange={async (done) => {
                  const r = await A.api.call<{ done: boolean }>("api/push/settings", { method: "POST", body: { done } });
                  if (r.data) setPush(r.data);
                }}
              />
              <div class="btns">
                <Btn
                  kind="quiet"
                  label={t("notify.test")}
                  onClick={async () => {
                    const r = await A.api.call("api/push/test", { method: "POST" });
                    A.toast(r.status === 200 ? t("notify.test.sent") : t("result.action.failed", String(r.status)));
                  }}
                />
                <Btn
                  kind="text"
                  label={t("notify.off")}
                  onClick={async () => {
                    A.push = await disablePush(A.api);
                    A.changed();
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function SettingsSheet() {
  useEffect(() => {
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  return (
    <Sheet label={t("settings.title")}>
      <NameRow />
      <PartnerSettings />
      <PhoneSettings />
    </Sheet>
  );
}

export function Sheets() {
  if (!A.sheet) return null;
  return A.sheet.kind === "decision" ? <DecisionSheet id={A.sheet.id} /> : <SettingsSheet />;
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {A.toasts.map((x) => (
        <div class="toast" key={x.id}>
          <span>{x.text}</span>
          {x.action && (
            <button
              onClick={() => {
                x.action!.run();
                A.toasts = A.toasts.filter((y) => y.id !== x.id);
                A.changed();
              }}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
