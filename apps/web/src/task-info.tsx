// D220: 工作副本 / Working copy, in the opened task's header: one button (its branch, or its
// folder's name, with a drawn mark) that opens what a developer checks before acting on the work:
// the computer it is on, the folder (copy its path), the branch and the base it came off, the
// changes against that base (opening the workbench's Changes), Open draft PR / Merge into {base}
// as the result card has them, and who has worked on it when that changed (each switch, D89).
// Wide, a popover under the button; on a phone, a sheet. Only for a task with a working copy.
import type { Bodies } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A, effortWord } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, Chev } from "./controls.tsx";
import { harnessName, modelName } from "./format.ts";
import { attention, canIntegrate, finished, noRemote, placeOf, title, type Task } from "./store.ts";
import { computerName, taskWhere } from "./where.ts";
import { benchable, dataOf, openBenchAt } from "./workbench.tsx";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** The working copy's path as shown: under a home folder it reads ~/… (no user name on screen, D198). */
export const tildePath = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");

/** A long branch keeps its start and its end ("ducter/plano-teste…simulador"). */
export function midCut(s: string, n = 28): string {
  if (s.length <= n) return s;
  const head = Math.ceil((n - 1) * 0.55);
  return `${s.slice(0, head)}…${s.slice(s.length - (n - 1 - head))}`;
}

/** Who has done it, oldest first: each body_selected that changed who (the first is who started it). */
export function bodiesOf(task: Task): { harness: string; model?: string; effort?: string; ts: string }[] {
  const out: { harness: string; model?: string; effort?: string; ts: string }[] = [];
  for (const ev of task.events) {
    if (ev.kind !== "body_selected") continue;
    const b = ev.body as Bodies["body_selected"];
    const last = out.at(-1);
    if (last && last.harness === b.harness && (last.model ?? "") === (b.model ?? "")) continue;
    out.push({ harness: b.harness, ...(b.model ? { model: b.model } : {}), ...(b.effort ? { effort: b.effort } : {}), ts: ev.ts });
  }
  return out;
}

// ---------- drawn marks ----------

const Mk = ({ children }: { children: preact.ComponentChildren }) => (
  <svg class="info-mk" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
);
export const BranchMark = () => (
  <Mk>
    <circle cx="4.5" cy="3.6" r="1.6" />
    <circle cx="4.5" cy="12.4" r="1.6" />
    <circle cx="11.5" cy="5.4" r="1.6" />
    <path d="M4.5 5.2v5.6M11.5 7c0 2.6-2.4 3-5.4 4" />
  </Mk>
);
const FolderMark = () => (
  <Mk>
    <path d="M2 4.5c0-.8.6-1.5 1.5-1.5h3l1.5 1.6h4.5c.8 0 1.5.7 1.5 1.5v5.4c0 .8-.7 1.5-1.5 1.5h-9C2.6 13 2 12.3 2 11.5z" />
  </Mk>
);
const ComputerMark = () => (
  <Mk>
    <rect x="2.5" y="3" width="11" height="7.6" rx="1.4" />
    <path d="M1.2 13h13.6" />
  </Mk>
);
const DiffMark = () => (
  <Mk>
    <path d="M4 2.5h5.2L12 5.3v8.2H4z" />
    <path d="M8 6.3v3.4M6.3 8h3.4M6.3 11.3h3.4" />
  </Mk>
);
const WhoMark = () => (
  <Mk>
    <circle cx="5" cy="5.5" r="2" />
    <circle cx="11" cy="10.5" r="2" />
    <path d="M6.6 7.1l2.8 1.8" />
  </Mk>
);

// ---------- the button ----------

/** Whether the task has a working copy to say anything about. */
export const hasCopy = (task: Task) => ["repo", "folder"].includes(placeOf(task).kind);

export function TaskInfoButton({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!hasCopy(task)) return null;
  const p = placeOf(task) as { kind: string; branch?: string; path?: string; repoPath?: string };
  const label = p.kind === "repo" ? p.branch || lastPart(p.repoPath ?? "") : lastPart(p.path ?? "");
  return (
    <span class="info-anchor">
      <button ref={btn} class={`info-btn${open ? " on" : ""}`} aria-label={`${t("info.about")} · ${label}`} aria-expanded={open} aria-haspopup="dialog" title={label} onClick={() => setOpen(!open)}>
        {p.kind === "repo" ? <BranchMark /> : <FolderMark />}
        <span class="info-label">{midCut(label)}</span>
        <Chev />
      </button>
      {open && <TaskInfo task={task} onClose={() => (setOpen(false), btn.current?.focus())} />}
    </span>
  );
}

const lastPart = (s: string) => s.replace(/\/+$/, "").split("/").at(-1) ?? "";

// ---------- the popover / sheet ----------

function TaskInfo({ task, onClose }: { task: Task; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const narrow = typeof matchMedia === "function" && !matchMedia("(min-width: 700px)").matches;
  useEffect(() => {
    A.history(task.id);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const down = (e: PointerEvent) => {
      const el = box.current;
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".info-btn")) onClose();
    };
    addEventListener("keydown", key, true);
    addEventListener("pointerdown", down, true);
    box.current?.focus({ preventScroll: true });
    return () => (removeEventListener("keydown", key, true), removeEventListener("pointerdown", down, true));
  }, []);
  const p = placeOf(task) as { kind: string; device?: string; repoPath?: string; worktree?: string; branch?: string; baseBranch?: string; path?: string };
  const base = p.baseBranch || "main";
  const path = p.kind === "repo" ? p.worktree || p.repoPath || "" : p.path || "";
  const where = taskWhere(task);
  // Changes: the workbench's live list when it has one, else the count kept on the card.
  const live = dataOf(task.id).changes;
  const stat = live
    ? { files: live.files.length + live.more, adds: live.files.reduce((s, f) => s + (f.adds ?? 0), 0), dels: live.files.reduce((s, f) => s + (f.dels ?? 0), 0) }
    : p.kind === "repo"
      ? task.card?.changes
      : (() => {
          const f = task.folder ?? task.card?.folder;
          return f ? { files: f.added + f.changed + f.removed + f.moved + f.renamed, adds: 0, dels: 0 } : undefined;
        })();
  const who = bodiesOf(task);
  const integrated = task.card?.integrated;
  const pr = integrated?.act === "open_pr" ? integrated.ref : task.acted?.ok && task.acted.action === "open_pr" ? task.acted.ref : undefined;
  const merged = integrated?.act === "merge" || (task.acted?.ok && task.acted.action === "merge");
  const canAct = p.kind === "repo" && finished(task) && canIntegrate(task) && !merged && !task.acting && attention(task) !== "failed";
  const copy = () => {
    void navigator.clipboard?.writeText(path).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1600)));
  };
  const body = (
    <div ref={box} tabIndex={-1} class={`info-pop${narrow ? " as-sheet sheet" : ""}`} role="dialog" aria-label={t("info.about")}>
      {narrow && <div class="grab" />}
      <dl class="info-rows">
        <div class="info-row">
          <dt>
            <ComputerMark />
            <span>{t("info.computer")}</span>
          </dt>
          <dd>{where.line ? where.line : computerName(p.device)}</dd>
        </div>
        {path && (
          <div class="info-row">
            <dt>
              <FolderMark />
              <span>{t("info.folder")}</span>
            </dt>
            <dd class="info-path">
              <code title={path}>{tildePath(path)}</code>
              <button class="qlink" onClick={copy}>
                {copied ? t("info.copied") : t("info.copy")}
              </button>
            </dd>
          </div>
        )}
        {p.kind === "repo" && p.branch && (
          <div class="info-row">
            <dt>
              <BranchMark />
              <span>{t("info.branch")}</span>
            </dt>
            <dd>
              <code title={p.branch}>{p.branch}</code>
              <span class="info-sub">{t("info.branch.from", base)}</span>
            </dd>
          </div>
        )}
        <div class="info-row">
          <dt>
            <DiffMark />
            <span>{t("info.changes")}</span>
          </dt>
          <dd>
            {stat && stat.files ? (
              <button class="info-changes" aria-label={t("info.changes.open")} title={t("info.changes.open")} disabled={!benchable(task)} onClick={() => (onClose(), openBenchAt(task, "changes"))}>
                <span>{p.kind === "repo" ? t("info.changes.base", base) : t("info.changes.folder")}</span>
                <span class="info-n">{t("info.changes.files", stat.files)}</span>
                {stat.adds ? <span class="add">+{stat.adds}</span> : null}
                {stat.dels ? <span class="del">−{stat.dels}</span> : null}
                <Chev />
              </button>
            ) : (
              <span class="info-sub">{t("info.changes.none")}</span>
            )}
          </dd>
        </div>
      </dl>
      {p.kind === "repo" && (canAct || task.acting || pr || merged) && (
        <div class="info-acts">
          {task.acting ? (
            <span class="small">{t(`result.acting.${task.acting}`, base)}</span>
          ) : merged ? (
            <span class="small done-ink">{t("result.merged", base)}</span>
          ) : (
            <>
              {pr ? (
                <Btn kind="secondary" size="sm" label={t("info.pr.open")} onClick={() => window.open(pr, "_blank", "noopener")} />
              ) : (
                canAct && !noRemote(task) && <Btn kind="secondary" size="sm" label={t("result.pr")} about={title(task)} onClick={() => A.taskAction(task.id, "open_pr")} />
              )}
              {canAct && <Btn kind="primary" size="sm" label={t("result.merge", base)} about={title(task)} onClick={() => A.taskAction(task.id, "merge")} />}
            </>
          )}
        </div>
      )}
      {who.length > 1 && (
        <section class="info-who">
          <h3>
            <WhoMark />
            <span>{t("info.who")}</span>
          </h3>
          <ol>
            {who.map((b, i) => (
              <li key={b.ts + i}>
                <Coin harness={b.harness} size={18} />
                <span class="nm">{[harnessName(b.harness), b.model && modelName(b.model), b.effort && effortWord(A.L, b.effort)].filter(Boolean).join(" · ")}</span>
                <span class="when">{i === who.length - 1 ? t("info.who.now") : new Date(b.ts).toLocaleTimeString(A.L.lang === "zh" ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
  return narrow ? (
    <>
      <div class="scrim" onClick={onClose} />
      {body}
    </>
  ) : (
    body
  );
}
