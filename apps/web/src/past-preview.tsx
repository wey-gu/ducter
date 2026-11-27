// D391: every task fully open (design/sessions.md). Past tasks' 停在哪儿 / Where it stopped: how a
// task ended (its last report in full, its last words, what it asks you, its changes) and its steps
// (its brief, then each later message to it, with what came of it and the commit it started from);
// and 从这一步开新任务 / New task from this step: a new task from that step, the original left as it is.
import type { PastItem, PastStep, ServerFrame } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Facts } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { tidyWords } from "@ducter/protocol/src/tidy.ts";
import { Menu, MenuHead, MenuItem } from "./menu.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Steps = Extract<ServerFrame, { t: "past_steps_result" }>;
type Forked = Extract<ServerFrame, { t: "past_forked" }>;

/** Agents a redo or a switch can pick (the same list Continue with another agent offers). */
export const AGENTS = ["claude-code", "codex", "pi", "deepseek-harness", "antigravity", "cursor", "devin", "kimi", "opencode", "dim"];

/** What the preview and the redo sheet hold between renders. */
export const PV = {
  steps: new Map<string, Steps>(),
  asked: new Map<string, string>(),
  n: 0,
  /** On a phone: the task whose preview fills the screen. */
  sheet: "",
  /** Steps opened in full (taskId:n). */
  full: new Set<string>(),
  /** The redo sheet: which task, which step (absent: pick one first), the words, the agent. */
  redo: undefined as undefined | { taskId: string; title: string; harness: string; step?: number; words: string; agent?: string; busy?: boolean; error?: string },
};

/** Asks the home for a task's steps once (kept until Past tasks opens again). */
/** The field grows with its words, no resize grip (as the hand-over note, D385). */
const grow = (el: HTMLTextAreaElement | null) => {
  if (!el || CSS.supports?.("field-sizing", "content")) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
};

export function askSteps(taskId: string, again = false) {
  if (!taskId || (!again && (PV.steps.has(taskId) || PV.asked.has(taskId)))) return;
  const id = `s${++PV.n}`;
  PV.asked.set(taskId, id);
  A.send({ t: "past_steps", id, taskId });
}

export function forgetSteps() {
  PV.steps.clear();
  PV.asked.clear();
  PV.full.clear();
}

export function onStepsFrame(f: Steps | Forked) {
  if (f.t === "past_steps_result") {
    if (f.id && PV.asked.get(f.taskId) !== f.id) return;
    PV.steps.set(f.taskId, f);
    PV.asked.delete(f.taskId);
    // A redo waiting for its step's words: take them now.
    const r = PV.redo;
    if (r && r.taskId === f.taskId && r.step && !r.words) r.words = f.steps.find((s) => s.n === r.step)?.text ?? "";
    return A.changed();
  }
  const r = PV.redo;
  if (!r || r.taskId !== f.from) return;
  if (!f.ok || !f.taskId) {
    r.busy = false;
    r.error = f.message || "";
    return A.changed();
  }
  PV.redo = undefined;
  PV.sheet = "";
  A.sheet = null;
  A.go({ name: "task", id: f.taskId });
  A.changed();
}

/** Opens the redo sheet: at a step, or (no step) to pick one first. */
export function startRedo(it: Pick<PastItem, "taskId" | "title" | "harness">, step?: number) {
  askSteps(it.taskId);
  const s = step ? PV.steps.get(it.taskId)?.steps.find((x) => x.n === step) : undefined;
  PV.redo = { taskId: it.taskId, title: it.title, harness: it.harness, ...(step ? { step } : {}), words: s?.text ?? "" };
  A.changed();
}

// ---------- the preview ----------

export type PreviewActs = {
  open: () => void;
  carryOn: (harness?: string) => void;
  seed: () => void;
  dateOf: (iso: string) => string;
  /** The words searched, to mark in the hit. */
  active: boolean;
};

function stepWho(s: PastStep): string {
  return s.who === "you" ? t("pv.you") : t("pv.for", A.S.personaName || "Ducter");
}

function Step({ it, s }: { it: PastItem; s: PastStep }) {
  const key = `${it.taskId}:${s.n}`;
  const full = PV.full.has(key);
  const long = s.text.length > 120 || s.text.includes("\n");
  return (
    <li class="pv-step">
      <span class="pv-n" aria-hidden="true">
        {s.n}
      </span>
      <div class="pv-sbody">
        <div class="pv-shead">
          <b>{t("pv.step", s.n)}</b>
          <span class="pv-who">{stepWho(s)}</span>
          {s.commit && <span class="pv-commit">{s.commit}</span>}
        </div>
        <p class={`pv-said${full ? " pv-open" : ""}`}>{s.text}</p>
        {long && (
          <button class="linkish pv-more" onClick={() => (full ? PV.full.delete(key) : PV.full.add(key), A.changed())}>
            {t(full ? "pv.less" : "pv.more")}
          </button>
        )}
        {s.came && <p class="pv-came">{s.came}</p>}
        <button class="pv-redo" onClick={() => startRedo(it, s.n)}>
          <RedoMark />
          <span>{t("pv.redo")}</span>
        </button>
      </div>
    </li>
  );
}

export const RedoMark = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M6.5 3.5v13M6.5 9c0 3.2 2.4 4.5 5.2 4.5h3M12.6 11l2.6 2.5-2.6 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** 停在哪儿 / Where it stopped: one task's end state and its steps. */
export function Preview({ it, acts }: { it: PastItem | undefined; acts: PreviewActs | undefined }) {
  useEffect(() => {
    if (it) askSteps(it.taskId);
  }, [it?.taskId]);
  if (!it || !acts) {
    return (
      <aside class="pv empty" aria-label={t("pv.title")}>
        <p>{t("pv.pick")}</p>
      </aside>
    );
  }
  const st = PV.steps.get(it.taskId);
  const ch = it.changes;
  const report = st?.report || it.outcome || "";
  const last = it.lastWords && it.lastWords.trim() !== (it.outcome ?? "").trim() && !report.includes(it.lastWords.trim()) ? it.lastWords : "";
  const facts = [
    it.project || t("past.other"),
    it.branch ? <span class="pv-mono">{it.branch}</span> : null,
    it.computer,
    it.model ? `${harnessName(it.harness)} ${it.model}` : harnessName(it.harness),
    it.imported ? <span class="pint">{t("past.imp.from", it.imported.app)}</span> : null,
    it.imported?.gone ? <span class="pint">{t("past.out.gone")}</span> : null,
    acts.dateOf(it.updatedAt),
  ];
  return (
    <aside class="pv" aria-label={t("pv.title")}>
      <div class="pv-scroll">
        <p class="pv-kicker">{t("pv.title")}</p>
        <h3 class="pv-name">{it.title}</h3>
        <Facts class="pv-facts" items={facts} />
        {it.asking && (
          <section class="pv-sec pv-ask">
            <h4>{t("pv.asking")}</h4>
            <p>{it.asking}</p>
          </section>
        )}
        <section class="pv-sec">
          <h4>{t("pv.result")}</h4>
          <p class={`pv-report${it.attention === "failed" ? " failed" : ""}`}>{report || (it.imported ? t("past.imp.note", it.imported.app) : t("pv.noreport"))}</p>
        </section>
        {last && (
          <section class="pv-sec">
            <h4>{t("pv.last")}</h4>
            <p class="pv-last">{last}</p>
          </section>
        )}
        {((ch && (ch.adds || ch.dels)) || it.integrated) && (
          <section class="pv-sec pv-row">
            <h4>{t("pv.changes")}</h4>
            <span class="pv-ch">
              {ch && (ch.adds || ch.dels) ? (
                <span class="pdiff">
                  <span class="add">+{ch.adds}</span> <span class="del">−{ch.dels}</span>
                </span>
              ) : null}
              {it.integrated && <span class="pint">{t(it.integrated.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft")}</span>}
            </span>
          </section>
        )}
        {/* D514: its working copy was tidied away; Continue makes a fresh one from its branch. */}
        {it.tidied && <p class="pv-last pv-tidied">{tidyWords(A.uiLang).past}</p>}
        <section class="pv-sec">
          <h4>{t("pv.steps")}</h4>
          {!st ? (
            <p class="pv-wait">{t("pv.reading")}</p>
          ) : (
            <ol class="pv-steps">
              {st.steps.map((s) => (
                <Step key={s.n} it={it} s={s} />
              ))}
            </ol>
          )}
        </section>
      </div>
      <div class="pv-foot">
        <Btn kind="primary" size="sm" label={t("pv.open")} onClick={acts.open} />
        {!acts.active && !it.imported && <Btn kind="secondary" size="sm" label={t("past.continue")} onClick={() => acts.carryOn()} />}
        {it.imported && <Btn kind="secondary" size="sm" label={t("past.seed")} onClick={() => acts.seed()} />}
        {!it.imported && <Btn kind="secondary" size="sm" label={t("pv.redo.any")} onClick={() => startRedo(it)} />}
        {!it.imported && <AgentMenu it={it} acts={acts} />}
      </div>
    </aside>
  );
}

function AgentMenu({ it, acts }: { it: PastItem; acts: PreviewActs }) {
  const [open, setOpen] = useState(false);
  return (
    <span class="pv-menu-wrap">
      <button class={`more-btn${open ? " open" : ""}`} aria-label={t("past.other.agent")} aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <Menu class="pmenu up" onClose={() => setOpen(false)}>
          <MenuItem onClick={() => (setOpen(false), acts.seed())}>
            {t("past.seed")}
          </MenuItem>
          <MenuHead>{t("past.other.agent")}</MenuHead>
          {AGENTS.filter((h) => h !== it.harness).map((h) => (
            <MenuItem class="sub" key={h} onClick={() => (setOpen(false), acts.carryOn(h))}>
              {t("past.with", harnessName(h))}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  );
}

// ---------- 从这一步开新任务 / New task from this step ----------

export function RedoSheet({ dateOf }: { dateOf: (iso: string) => string }) {
  const r = PV.redo;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (r?.step) ref.current?.focus();
    grow(ref.current);
  }, [r?.step]);
  if (!r) return null;
  const st = PV.steps.get(r.taskId);
  const s = r.step ? st?.steps.find((x) => x.n === r.step) : undefined;
  const close = () => ((PV.redo = undefined), A.changed());
  const agent = r.agent ?? r.harness;
  const go = () => {
    if (!r.step || r.busy) return;
    r.busy = true;
    r.error = "";
    const words = r.words.trim();
    A.send({ t: "past_fork", taskId: r.taskId, step: r.step, ...(agent !== r.harness ? { harness: agent } : {}), ...(words && words !== s?.text.trim() ? { words } : {}) });
    A.changed();
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") return e.preventDefault(), e.stopPropagation(), close();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) return e.preventDefault(), go();
  };
  return (
    <>
      <div class="scrim redo-scrim" onClick={close} />
      <div class="redo-sheet" role="dialog" aria-modal="true" aria-label={r.step ? t("redo.title", r.step) : t("redo.pick")} onKeyDown={keys}>
        <div class="redo-head">
          <span class="redo-mark" aria-hidden="true">
            <RedoMark />
          </span>
          <div class="grow">
            <h2>{r.step ? t("redo.title", r.step) : t("redo.pick")}</h2>
            <p class="redo-of">{r.title}</p>
          </div>
          <button class="past-x" aria-label={t("redo.cancel")} onClick={close}>
            ×
          </button>
        </div>
        {!r.step ? (
          <div class="redo-pick">
            {!st ? (
              <p class="pv-wait">{t("pv.reading")}</p>
            ) : (
              <ol class="pv-steps pick">
                {st.steps.map((x) => (
                  <li key={x.n}>
                    <button class="redo-step" onClick={() => ((r.step = x.n), (r.words = x.text), A.changed())} autoFocus={x.n === st.steps.length}>
                      <span class="pv-n" aria-hidden="true">
                        {x.n}
                      </span>
                      <span class="grow">
                        <span class="pv-shead">
                          <b>{t("pv.step", x.n)}</b>
                          <span class="pv-who">{stepWho(x)}</span>
                          {x.commit && <span class="pv-commit">{x.commit}</span>}
                        </span>
                        <span class="pv-said">{x.text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <div class="redo-body">
            <label class="redo-k" for="redo-words">
              {t("redo.words")}
            </label>
            <textarea id="redo-words" ref={ref} class="redo-words" rows={4} value={r.words} onInput={(e) => (grow(e.currentTarget), (r.words = e.currentTarget.value), A.changed())} />
            <p class="redo-k">{t("redo.agent")}</p>
            <div class="pchips redo-agents" role="radiogroup" aria-label={t("redo.agent")}>
              {[r.harness, ...AGENTS.filter((h) => h !== r.harness)].map((h) => (
                <button key={h} role="radio" aria-checked={agent === h} class={`pchip${agent === h ? " on" : ""}`} onClick={() => ((r.agent = h), A.changed())}>
                  {h === r.harness ? t("redo.same", harnessName(h)) : harnessName(h)}
                </button>
              ))}
            </div>
            <div class="redo-notes">
              {st?.repo && <p>{s?.commit ? t("redo.code.at", s.commit, dateOf(s.at)) : t(st.elsewhere ? "redo.code.elsewhere" : "redo.code.none")}</p>}
              <p>{t("redo.keep")}</p>
            </div>
            {r.error !== undefined && r.error !== "" && <p class="redo-err">{t("redo.failed", r.error)}</p>}
          </div>
        )}
        <div class="redo-foot">
          {r.step && <Btn kind="primary" size="sm" label={t(r.busy ? "redo.busy" : "redo.go")} about="⌘ Enter" disabled={!!r.busy || !r.words.trim()} onClick={go} />}
          <Btn kind="text" size="sm" label={t("redo.cancel")} onClick={close} />
        </div>
      </div>
    </>
  );
}
