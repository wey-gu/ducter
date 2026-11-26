// D484: the opened task's header on a phone. Its own actions only, each a 44-point target in the
// thumb's row: 分享 / Share, the workbench when it has something, and ⋯, which opens 这个任务 /
// This task as a sheet that fits the screen: the working copy (computer, folder, branch, changes,
// the PR), 打开工作台, 换谁来做 and 取消任务. The places are one Back away.
//
// Sharing a task: the person sends where it stands, in words anyone can read, to a person or an
// app. Where the browser has the system's share sheet (a phone, a secure page) that sheet opens
// with the words and the link; elsewhere Ducter's own sheet shows exactly what would be sent, with
// 复制 and 复制链接, and says that the link opens only on the person's own devices.
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Chev } from "./controls.tsx";
import { useSheetMotion } from "./sheetmotion.ts";
import { SheetFrame } from "./sheet-frame.tsx";
import { attention, endable, finished, harnessOf, reportOf, resultEvidence, title, type Task } from "./store.ts";
import { hasCopy, InfoContent } from "./task-info.tsx";
import { prNumber, prRef, shareText, taskLink } from "./task-words.ts";
import { benchable, openBenchAt, tabsOf } from "./workbench.tsx";
import { redact } from "@ducter/protocol/src/redact.ts";

const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

/** The task's pull request, wherever it was recorded. */
export function taskPr(task: Task): string | undefined {
  const r = reportOf(task);
  const links = [...(r?.evidence ?? []), ...resultEvidence(task)].map((e) => e.ref).filter((x): x is string => typeof x === "string");
  return prRef({ integrated: task.card?.integrated, acted: task.acted, links });
}

/** What a share sends, from what the page already says: the name, where it stands, its last words
 *  to the person (the report), the PR; keys hidden. */
export function shareOf(task: Task, state: string): { title: string; text: string; url: string } {
  const name = redact(title(task)) || t("task.unknown");
  const said = redact(reportOf(task)?.summary ?? "").trim();
  const pr = taskPr(task);
  const url = taskLink(location.origin, task.id);
  return { title: name, text: shareText({ name: t("share.name", name), state, said, pr }), url };
}

const canOsShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function" && (typeof isSecureContext === "undefined" || isSecureContext);

/** Copies, or says it couldn't: the Clipboard API needs a secure page; a selected field is the
 *  fallback a plain http home on the LAN still has. */
async function copy(text: string, field?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) return await navigator.clipboard.writeText(text).then(() => true);
  } catch {}
  try {
    const el = field ?? Object.assign(document.createElement("textarea"), { value: text });
    if (!field) (el.style.position = "fixed"), (el.style.opacity = "0"), document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    if (!field) el.remove();
    return ok;
  } catch {
    return false;
  }
}

const ShareMark = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 2.8v9.4M6.6 6 10 2.6 13.4 6" />
    <path d="M6.4 8.6H5.2c-.9 0-1.6.7-1.6 1.6v5.6c0 .9.7 1.6 1.6 1.6h9.6c.9 0 1.6-.7 1.6-1.6v-5.6c0-.9-.7-1.6-1.6-1.6h-1.2" />
  </svg>
);

/** 分享 / Share in the opened task's header (every width). */
export function ShareButton({ task, state }: { task: Task; state: string }) {
  const [open, setOpen] = useState(false);
  const go = async () => {
    const s = shareOf(task, state);
    // A phone: the system's own sheet, with the words and the link.
    if (canOsShare() && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: s.title, text: s.text, url: s.url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    setOpen(true);
  };
  return (
    <>
      <button class="tv-act share-btn" aria-label={t("share.button")} title={t("share.about")} aria-haspopup="dialog" onClick={() => void go()}>
        <ShareMark />
      </button>
      {open && createPortal(<ShareSheet task={task} state={state} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ShareSheet({ task, state, onClose }: { task: Task; state: string; onClose: () => void }) {
  const { sheet, body, scrim, close } = useSheetMotion(onClose);
  const s = shareOf(task, state);
  const all = `${s.text}\n${s.url}`;
  const field = useRef<HTMLTextAreaElement>(null);
  const [done, setDone] = useState<"" | "all" | "link" | "no">("");
  useEsc(close);
  const doCopy = async (what: "all" | "link") => {
    const ok = await copy(what === "all" ? all : s.url, what === "all" ? field.current : null);
    setDone(ok ? what : "no");
    if (ok) setTimeout(() => setDone(""), 1600);
  };
  return (
    <SheetFrame label={t("share.title")} class="share-sheet" frame={sheet} body={body} scrim={scrim} onScrim={close}>
      <h2>{t("share.title")}</h2>
      <small class="share-k">{t("share.sends")}</small>
      <textarea ref={field} class="share-text" readOnly rows={Math.min(8, all.split("\n").length + 1)} value={all} onFocus={(e) => e.currentTarget.select()} />
      <p class="share-note">{done === "no" ? t("share.fallback") : t("share.link.note")}</p>
      <div class="share-acts">
        <Btn kind="primary" label={done === "all" ? t("share.copied") : t("share.copy")} onClick={() => void doCopy("all")} />
        <Btn kind="secondary" label={done === "link" ? t("share.copied") : t("share.copy.link")} onClick={() => void doCopy("link")} />
        {canOsShare() && <Btn kind="text" label={t("share.os")} onClick={() => void navigator.share({ title: s.title, text: s.text, url: s.url }).then(close, () => {})} />}
      </div>
    </SheetFrame>
  );
}

function useEsc(close: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, []);
}

/** ⋯ on a phone: 这个任务 / This task, as a sheet. */
export function PhoneMore({ task, canSwitch }: { task: Task; canSwitch: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button class="tv-act more-btn" aria-label={t("task.more")} title={t("tsheet.title")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
      {open && createPortal(<TaskSheet task={task} canSwitch={canSwitch} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function TaskSheet({ task, canSwitch, onClose }: { task: Task; canSwitch: boolean; onClose: () => void }) {
  const { sheet, body, scrim, close } = useSheetMotion(onClose);
  useEsc(close);
  const a = attention(task);
  const droppable = !finished(task) && !["dropped", "superseded", "done"].includes(a);
  const pr = taskPr(task);
  const n = pr ? prNumber(pr) : "";
  // The working copy's rows say a PR opened from Ducter; one the agent opened is said here.
  const saidPr = hasCopy(task) && (task.card?.integrated?.act === "open_pr" || (task.acted?.ok && task.acted.action === "open_pr"));
  // Each row does one thing and closes the sheet first, so what it opens is in view.
  const then = (fn: () => void) => () => (onClose(), fn());
  return (
    <SheetFrame label={t("tsheet.title")} class="task-sheet" frame={sheet} body={body} scrim={scrim} onScrim={close}>
      <h2 class="ts-name">{redact(title(task)) || t("task.unknown")}</h2>
      {hasCopy(task) && (
        <div class="ts-copy">
          <InfoContent task={task} onClose={onClose} />
        </div>
      )}
      <div class="ts-rows" role="group">
        {pr && !saidPr && (
          <button class="ts-row" onClick={then(() => window.open(pr, "_blank", "noopener"))}>
            <span>{n ? t("pr.open", n) : t("pr.open.bare")}</span>
            <Chev />
          </button>
        )}
        {benchable(task) && tabsOf(task).length > 0 && (
          <button class="ts-row" onClick={then(() => openBenchAt(task, tabsOf(task)[0]!))}>
            <span>{t("tsheet.bench")}</span>
            <Chev />
          </button>
        )}
        {canSwitch && !!harnessOf(task) && (
          <button class="ts-row" onClick={then(() => A.openSwitch(task.id))}>
            <span>{t("who.switch")}</span>
            <Chev />
          </button>
        )}
        {droppable && (
          <button class="ts-row danger" onClick={then(() => A.drop(task.id))}>
            <span>{t("task.action.drop")}</span>
          </button>
        )}
        {/* D600: a finished task an open PR still holds: its one line asks under the head. */}
        {!droppable && endable(task) && (
          <button class="ts-row" onClick={then(() => ((A.ending = task.id), A.changed()))}>
            <span>{t("task.action.end")}</span>
          </button>
        )}
      </div>
      <Btn kind="secondary" class="sheet-close" label={t("sheet.close")} onClick={close} />
    </SheetFrame>
  );
}
