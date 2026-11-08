// The phone's screens: the conversation (default), 手头 / On hand, an opened task, and the
// sheets (a decision opened from a notification; this phone's settings). Behavior follows the
// desktop client (apps/desktop/internal/views); copy comes only from i18n.ts.
import type { Attention, Bodies, EvidenceRef, LivingItem } from "@ducter/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { A } from "./app.ts";
import { ago, cjkPad, deviceLabel, duration, harnessName, placeLine, sameWords, when } from "./format.ts";
import { markdown } from "./markdown.ts";
import { disablePush, enablePush } from "./push-client.ts";
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

const Pebble = ({ att, size = 10 }: { att: string; size?: number }) => (
  <i class={`pebble dot-${att}${att === "blocked" ? " waiting" : ""}`} style={{ width: size, height: size * 1.2 }} aria-hidden="true" />
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
const Back = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// A finished task reads "Done": done_claimed means nothing checked it yet, and no check runs
// today, so "Done · checking" would promise one that never comes (desktop: stateLabel).
const stateLabel = (a: Attention) => t(`state.${a === "done_claimed" ? "done" : a}`);

function Btn(p: { kind: "primary" | "quiet" | "text" | "accent"; onClick: () => void; label: string; about?: string; disabled?: boolean; grow?: boolean }) {
  return (
    <button class={`btn ${p.kind}${p.grow ? " grow" : ""}`} onClick={p.onClick} aria-label={p.about ? `${p.label} · ${p.about}` : undefined} disabled={p.disabled}>
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
  const goText = d.goLabel ? t("decision.go.label", d.goLabel) : t("decision.go");
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

function DecisionCard({ d, eyebrow, taskId }: { d: DecisionState; eyebrow: string; taskId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const flash = A.flash === d.decisionId;
  useEffect(() => {
    if (flash) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      A.flash = undefined;
    }
  }, [flash]);
  return (
    <div ref={ref} class={`decision${flash ? " flash" : ""}`} id={`d-${d.decisionId}`}>
      <div class="eyebrow-row">
        <div class="eyebrow">{eyebrow}</div>
        {(taskId || d.taskId) && (
          <button class="details" onClick={() => ((A.sheet = null), A.go({ name: "task", id: (taskId || d.taskId)! }))}>
            {t("living.details")} ›
          </button>
        )}
      </div>
      <DecisionBody d={d} taskId={taskId} />
    </div>
  );
}

// ---------- tasks in the conversation ----------

function TaskChip({ task, detail }: { task: Task; detail?: string }) {
  const a = attention(task);
  return (
    <button class={`chip st-${a}`} onClick={() => A.go({ name: "task", id: task.id })}>
      <Pebble att={a} />
      <span class="t">{title(task) || t("task.unknown")}</span>
      <span class="s">{(!sameWords(detail, title(task)) && detail) || stateLabel(a)}</span>
    </button>
  );
}

function openEvidence(ev: EvidenceRef, task?: Task) {
  if (ev.kind === "diff" && task) return A.go({ name: "task", id: task.id });
  if (/^https?:/.test(ev.ref)) return void window.open(ev.ref, "_blank", "noopener");
  navigator.clipboard?.writeText(ev.ref).catch(() => {});
  A.toast(`${ev.label} · ${ev.ref}`);
}

function EvidenceChips({ task, evs, max = 4 }: { task?: Task; evs: EvidenceRef[]; max?: number }) {
  const list = sortEvidence(latestByLabel(evs));
  return (
    <div>
      {list.slice(0, max).map((ev, i) => (
        <button key={i} class={`ev${machineChecked(ev.kind) ? " checked" : ""}`} title={ev.ref} onClick={() => openEvidence(ev, task)}>
          {machineChecked(ev.kind) && <Check />}
          <span>{ev.label}</span>
        </button>
      ))}
      {list.length > max && task && (
        <button class="more" onClick={() => A.go({ name: "task", id: task.id })}>
          {t("result.more", list.length - max)}
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
  return `${acts[0]!.command}${acts.length > 1 ? " · " + t("result.more", acts.length - 1) : ""} · ${t("outside.seen")}`;
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
      {!inTask && <Btn kind="text" label={t("result.changes")} onClick={() => A.go({ name: "task", id: task.id })} />}
    </div>
  );
}

function ResultProof({ task }: { task: Task }) {
  const line = outsideLine(task);
  const evs = resultEvidence(task);
  if (!evs.length && !line) return null;
  return (
    <div class="sheet-proof">
      {evs.length > 0 && (
        <>
          <div class="k">{t("result.howknow")}</div>
          <div class="v">
            <EvidenceChips task={task} evs={evs} />
          </div>
        </>
      )}
      {line && (
        <>
          <div class="k">{t("outside.title")}</div>
          <div class="v">{line}</div>
        </>
      )}
    </div>
  );
}

function TaskFooter({ task, detail }: { task: Task; detail?: string }) {
  if (!finished(task))
    return (
      <div class="chips">
        <TaskChip task={task} detail={detail} />
      </div>
    );
  A.history(task.id);
  return (
    <div class="footer">
      <div class="chips">
        <TaskChip task={task} />
      </div>
      <ResultProof task={task} />
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
          <div class="status-line" style={{ marginTop: 8 }}>
            <Pebble att={st.state === "done" ? "done" : st.state === "failed" ? "failed" : "working"} />
            {st.text}
          </div>
        ))}
    </div>
  );
}

function LivingLine({ it }: { it: LivingItem }) {
  const text = it.title ? `${it.title} · ${it.text}` : it.text;
  return (
    <button class={`line k-${it.kind}`} onClick={() => it.taskId && A.go({ name: "task", id: it.taskId })}>
      <span class="ic">{it.kind === "done" ? <Check /> : it.kind === "blocked" ? <Clock /> : <Pebble att={it.kind === "failed" ? "failed" : "working"} />}</span>
      <span class="tx">{text}</span>
    </button>
  );
}

function Living({ e, items }: { e: Entry; items: LivingItem[] }) {
  const away = A.livingAway.get(e.firstSeq) ?? e.firstSeq <= A.S.headSeq;
  const decisions = items.filter((it) => it.kind === "decision");
  const open = decisions.filter((it) => {
    const d = it.decisionId ? A.S.decisions.get(it.decisionId) : undefined;
    return d && !d.resolved && !d.pending && d.reversible;
  }).length;
  return (
    <section class="living" key={`${e.firstSeq}:${e.revision}`} aria-label={t("living.title")}>
      {away && (
        <div class="head">
          <h2>{t("living.title")}</h2>
          {A.S.unread(e) && <span class="badge">{t("living.unread")}</span>}
        </div>
      )}
      {decisions.map((it, i) => {
        const d = it.decisionId ? A.S.decisions.get(it.decisionId) : undefined;
        return d ? (
          <DecisionCard key={i} d={d} eyebrow={t("living.needsyou", decisions.length)} taskId={it.taskId} />
        ) : (
          <div class="decision" key={i}>
            <div class="eyebrow">{t("living.needsyou", decisions.length)}</div>
            <div class="q">{it.text}</div>
          </div>
        );
      })}
      {open >= 2 && (
        <div class="btns" style={{ justifyContent: "flex-end" }}>
          <Btn kind="quiet" label={t("decision.goall", A.defaultable().length)} onClick={() => A.goOnAllDefaults()} />
        </div>
      )}
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
    const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
    return <DecisionCard d={d} eyebrow={stateLabel("needs_you") + (task && title(task) ? ` · ${title(task)}` : "")} />;
  }
  return null;
}

// ---------- header, composer ----------

function OnHandButton() {
  const b = A.S.board();
  const pebbles: Task[] = [];
  for (const lane of [LANE.needs, LANE.working, LANE.waiting]) for (const task of b.lanes[lane]!) if (pebbles.length < 5) pebbles.push(task);
  return (
    <button class="onhand-btn" onClick={() => A.go({ name: "onhand" })}>
      {pebbles.length > 0 && (
        <span class="pebbles">
          {pebbles.map((p) => (
            <Pebble key={p.id} att={attention(p)} />
          ))}
        </span>
      )}
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
      <button class="who" onClick={() => ((A.sheet = { kind: "settings" }), A.changed())} aria-label={t("settings.title")}>
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
    if (s === "unsupported") A.toast(t("notify.unsupported"));
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
  if (A.push !== "off" || !A.me.push.publicKey) return null;
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
            <Pebble att={["", "working", "done", "blocked"][i]!} />
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
      <Pebble att={attention(task)} size={12} />
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
        <h1 style={{ margin: "0 2px", fontSize: 26, fontWeight: 800 }}>{t("onhand.title")}</h1>
        <div class="counts">
          {(["needs_you", "working", "waiting", "done_today"] as const).map((k) => (
            <div class="count" key={k}>
              <b>{k === "done_today" ? A.doneToday() : k === "needs_you" ? needs.length + partnerDs.length : k === "waiting" ? waiting.length + loose.length : b.counts[k]}</b>
              <span>{t(`lane.${k === "done_today" ? "done" : k}`)}</span>
            </div>
          ))}
        </div>
        {nothing ? (
          <div class="calm">{t("onhand.empty", A.S.personaName)}</div>
        ) : (
          <>
            <section class="section">
              <h3>
                <Pebble att="needs_you" /> {t("lane.needs_you")} <span class="n">{needs.length + partnerDs.length || ""}</span>
                {openCount >= 2 && (
                  <span style={{ marginLeft: "auto" }}>
                    <Btn kind="quiet" label={t("decision.goall", openCount)} onClick={() => A.goOnAllDefaults()} />
                  </span>
                )}
              </h3>
              {!needs.length && !partnerDs.length && (
                <div class="calm">{working.length ? t("onhand.calm.working", A.S.personaName, working.length) : t("onhand.calm")}</div>
              )}
              {partnerDs.map((d) => (
                <DecisionCard key={d.decisionId} d={d} eyebrow={A.S.personaName} />
              ))}
              {needs.map((task) => {
                const d = A.S.pendingDecision(task.id);
                return d ? <DecisionCard key={task.id} d={d} eyebrow={title(task)} taskId={task.id} /> : <Row key={task.id} task={task} meta={metaLine(task)} />;
              })}
            </section>
            {working.length > 0 && (
              <section class="section">
                <h3>
                  <Pebble att="working" /> {t("lane.working")} <span class="n">{working.length}</span>
                </h3>
                {working.map((task) => (
                  <Row key={task.id} task={task} meta={metaLine(task)} />
                ))}
              </section>
            )}
            {(waiting.length > 0 || loose.length > 0) && (
              <section class="section">
                <h3>
                  <Pebble att="blocked" /> {t("lane.waiting")} <span class="n">{waiting.length + loose.length}</span>
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
                  <Pebble att="done" /> {t("lane.done")} <span class="n">{done.length}</span>
                </h3>
                {done.map((task) => {
                  const r = reportOf(task);
                  const ev = headlineEvidence(task.evidence.length ? task.evidence : (r?.evidence ?? []));
                  return <Row key={task.id} task={task} meta={[stateLabel(attention(task)), ev?.label ?? (r?.summary.split("\n")[0] || "")].filter(Boolean).join(" · ")} />;
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

function Transcript({ task }: { task: Task }) {
  if (!task.historyLoaded && !task.events.length) return <div class="small">{t("task.loading")}</div>;
  const items: JSX.Element[] = [];
  for (const ev of task.events) {
    if (ev.kind === "task_open") items.push(<div key={ev.seq} class="tx report"><b>{t("task.brief", A.S.personaName)}</b>{(ev.body as Bodies["task_open"]).brief}</div>);
    else if (ev.kind === "checkpoint") items.push(<div key={ev.seq} class="tx divider">{t("task.checkpoint", (ev.body as Bodies["checkpoint"]).text)}</div>);
    else if (ev.kind === "report") {
      const r = ev.body as Bodies["report"];
      items.push(<div key={ev.seq} class="tx report"><b>{reportLabel(r)}</b>{r.summary}</div>);
    } else if (ev.kind === "task_event") {
      const b = ev.body as Bodies["task_event"];
      if (b.tool) {
        const input = b.tool.input as Record<string, unknown> | string | undefined;
        const arg = typeof input === "string" ? input : input ? String(input.command ?? input.file_path ?? input.path ?? input.url ?? input.pattern ?? "") : "";
        items.push(<div key={ev.seq} class={`tx tool${b.tool.ok === false ? " fail" : ""}`}>{`${b.tool.name}${arg ? " · " + arg.split("\n")[0] : ""}`}</div>);
      } else if (b.role === "user" && b.text) {
        const sd = task.sends.find((s) => s.seq === ev.seq);
        items.push(
          <div key={ev.seq} class="tx you">
            {b.text}
            <small>{b.from === "partner" ? t("task.from.partner", A.S.personaName) : sd?.delivered ? t(`delivery.${sd.delivered}`) : t("task.you")}</small>
          </div>,
        );
      } else if (b.role === "assistant" && b.text) items.push(<div key={ev.seq} class="tx assistant">{b.text}</div>);
      else if (b.role === "system" && b.usage) items.push(<div key={ev.seq} class="tx divider">{t("task.turn.done")}</div>);
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
  const why = bodyReasonOf(task);
  const meta = [placeLine(A.L, placeOf(task)), [harnessName(harnessOf(task)), modelOf(task)].filter(Boolean).join(" · ")].filter(Boolean).join(" · ");
  return (
    <>
      <Top back={t("nav.back")} />
      <main class="scroll" ref={scroller} style={{ gap: 14 }}>
        <div class="task-head">
          <span class={`state st-${a}`}>
            <Pebble att={a} size={9} /> {stateLabel(a)}
          </span>
          <h1>{title(task) || t("task.unknown")}</h1>
          <div class="meta">
            {meta}
            {task.openedAt ? ` · ${ago(A.L, task.openedAt)}` : ""}
          </div>
        </div>
        {d && !d.resolved && <DecisionCard d={d} eyebrow={stateLabel("needs_you")} taskId={id} />}
        {r && (
          <div class="card">
            <h4>{reportLabel(r)}</h4>
            <div class="body">{r.summary}</div>
          </div>
        )}
        {finished(task) && (
          <>
            <ResultProof task={task} />
            <ResultActions task={task} inTask />
          </>
        )}
        {!finished(task) && task.evidence.length > 0 && (
          <div class="card">
            <h4>{t("task.dossier.evidence")}</h4>
            <EvidenceChips task={task} evs={task.evidence} max={8} />
          </div>
        )}
        {why && (
          <div class="card">
            <h4>{t("task.dossier.why", harnessName(harnessOf(task)))}</h4>
            <div class="body">{why}</div>
          </div>
        )}
        <div class="btns">
          {(a === "working" || a === "queued") && <Btn kind="quiet" label={t("task.action.pause")} onClick={() => A.taskAction(id, "interrupt")} />}
          {a === "failed" && <Btn kind="quiet" label={t("task.action.retry")} onClick={() => A.taskAction(id, "reopen")} />}
          {!["dropped", "superseded", "done"].includes(a) && <Btn kind="text" label={t("task.action.drop")} onClick={() => A.drop(id)} />}
        </div>
        <section class="section">
          <h3>
            {t("task.transcript")} · <span style={{ fontWeight: 600 }}>{t("task.transcript.hint")}</span>
          </h3>
          <Transcript task={task} />
        </section>
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
        <Btn kind="quiet" label={t("sheet.close")} onClick={close} />
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
      <DecisionCard d={d} eyebrow={task && title(task) ? title(task) : A.S.personaName} taskId={d.taskId} />
    </Sheet>
  );
}

function SettingsSheet() {
  const [settings, setSettings] = useState<{ done: boolean; quiet: { start: string; end: string } | null } | null>(null);
  useEffect(() => {
    void A.api.call<{ done: boolean; quiet: { start: string; end: string } | null }>("api/push/settings").then((r) => r.data && setSettings(r.data));
  }, [A.push]);
  const quiet = settings?.quiet ?? { start: "23:00", end: "08:00" };
  return (
    <Sheet label={t("settings.title")}>
      <h2>{t("settings.title")}</h2>
      <div class="small">{A.me?.via === "device" ? `${A.me.deviceName ?? ""}` : deviceLabel(A.L, "local")}</div>
      <h3 style={{ margin: "6px 2px 0", fontSize: 12, color: "var(--ink-muted)" }}>{t("notify.title")}</h3>
      {A.push === "ios-install" && <div class="hint">{t("notify.ios")}</div>}
      {A.push === "unsupported" && <div class="hint">{t("notify.unsupported")}</div>}
      {A.push === "denied" && <div class="hint">{t("notify.denied")}</div>}
      {A.push === "off" && A.me?.push.publicKey && (
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
          <label class="switch">
            <span>{t("notify.done")}</span>
            <input
              type="checkbox"
              checked={settings?.done ?? false}
              onChange={async (e) => {
                const r = await A.api.call<typeof settings>("api/push/settings", { method: "POST", body: { done: (e.target as HTMLInputElement).checked } });
                if (r.data) setSettings(r.data);
              }}
            />
          </label>
          <div class="small">{t("quiet.band_label", quiet.start, quiet.end)}</div>
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
