// D635: the opened task's secondary actions, in one ⋯ menu (D421) instead of a row of icons.
// A task beside the conversation or at the whole screen keeps one leading way up and one ⋯; the
// workbench (the old sidebar icon), the walk between tasks, the working copy, Share and end all
// live here. The phone's one-column header keeps its Share + 这个任务 sheet (D484); a split/fold
// pane and every width from 700 up use this menu.
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import type { Task } from "./store.ts";
import { attention, endable, finished } from "./store.ts";
import { A } from "./app.ts";
import { Menu, MenuHead, MenuItem, MenuSep } from "./menu.tsx";
import { MoreButton } from "./controls.tsx";
import { hasCopy, TaskInfo } from "./task-info.tsx";
import { benchable, benchShown, toggleBench } from "./workbench.tsx";
import { walk, walkOrder } from "./onhand.tsx";
import { ShareSheet, startShare } from "./task-sheet.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export function TaskMenu({ task, state }: { task: Task; state: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [share, setShare] = useState(false);
  const o = walkOrder(task.id);
  const i = o.indexOf(task.id);
  const walkable = i >= 0 && o.length > 1;
  const a = attention(task);
  const droppable = !finished(task) && !["dropped", "superseded", "done"].includes(a);
  const ends = endable(task);
  const bench = benchable(task);
  const on = benchShown.taskId === task.id;
  const close = () => setOpen(false);
  return (
    <span class="more-menu task-more">
      <MoreButton label={t("task.more")} open={open} onClick={() => setOpen(!open)} />
      {open && (
        <Menu class="menu task-menu" label={t("task.more")} onClose={close}>
          {walkable && (
            <>
              <MenuHead>{t("tv.pos", i + 1, o.length)}</MenuHead>
              <MenuItem disabled={i === 0} onClick={() => (close(), walk(-1))}>
                {t("tv.prev")}
              </MenuItem>
              <MenuItem disabled={i === o.length - 1} onClick={() => (close(), walk(1))}>
                {t("tv.next")}
              </MenuItem>
              <MenuSep />
            </>
          )}
          {hasCopy(task) && <MenuItem onClick={() => (close(), setInfo(true))}>{t("info.about")}</MenuItem>}
          {bench && (
            <MenuItem checked={on} onClick={() => (close(), toggleBench(task.id))}>
              {t("wb.toggle")}
            </MenuItem>
          )}
          <MenuItem onClick={() => (close(), void startShare(task, state, () => setShare(true)))}>{t("share.button")}</MenuItem>
          {(droppable || ends) && <MenuSep />}
          {droppable ? (
            <MenuItem danger onClick={() => (close(), A.drop(task.id))}>
              {t("task.action.drop")}
            </MenuItem>
          ) : ends ? (
            <MenuItem onClick={() => (close(), (A.ending = task.id), A.changed())}>{t("task.action.end")}</MenuItem>
          ) : null}
        </Menu>
      )}
      {info && <TaskInfo task={task} onClose={() => setInfo(false)} />}
      {share && createPortal(<ShareSheet task={task} state={state} onClose={() => setShare(false)} />, document.body)}
    </span>
  );
}
