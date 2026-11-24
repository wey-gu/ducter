// D395, D415, D472: a task that couldn't start where it was to work. One source for its words and
// its fixes, so the opened task's page, each attempt in its steps and the brief on On hand say the
// same thing (the Mac: apps/desktop/internal/views/cant.go).
//
// The real reason first, in the person's words ("没能开始：Hetzner Server 上没有 mem 这个文件夹"),
// then the fix that is really the fix as the primary: the repository cloned onto that computer, or
// a folder already on it chosen there (D455's sheet), another computer the work named, its agent
// installed or signed in there. 再试一次 is the only action only when nothing more is known.
import { useState } from "preact/hooks";
import type { CantStart } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { harnessName } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The line, each why with the words it takes. */
export function cantLine(c: CantStart): string {
  if (c.why === "away") return t("cant.away", c.computer);
  if (c.why === "other") return c.computer && c.what ? t("cant.other", c.computer, c.what) : t("cant.other_bare");
  if (c.why === "not_installed" || c.why === "signed_out" || c.why === "old" || c.why === "agent" || c.why === "refuses_root") return t(`cant.${c.why}`, c.computer, c.what || harnessName(c.harness ?? ""));
  return t(`cant.${c.why}`, c.computer, c.what);
}

/** The line without its lead ("没能开始："), for a row that already shows it failed. */
export function cantClause(c: CantStart): string {
  const l = cantLine(c);
  const i = l.search(/[：:]/);
  return i > 0 ? l.slice(i + 1).trim() : l;
}

export type CantAct = "start_at" | "clone_here" | "clear_lock" | "reopen" | "pick" | "install" | "login" | "update" | "why";
export interface CantFix {
  act: CantAct;
  label: string;
  kind: "primary" | "secondary" | "text";
  device?: string;
}

const PLACE_WHY = new Set(["no_repo", "no_folder", "clone_failed"]);

/** The fixes, the real one first (it alone is primary); 再试一次 only when it is honest to offer. */
export function cantFixes(c: CantStart): CantFix[] {
  const out: Omit<CantFix, "kind">[] = [];
  const agent = harnessName(c.harness ?? "") || c.what;
  const place = PLACE_WHY.has(c.why);
  const on = c.elsewhere ? { act: "start_at" as const, label: t(place ? "cant.on" : "cant.move", c.elsewhere.name), device: c.elsewhere.device } : undefined;
  if (place) {
    if (c.cloneHere) out.push({ act: "clone_here", label: t("cant.clone_to", c.computer) });
    if (c.pickHere) out.push({ act: "pick", label: t("cant.pick", c.computer) });
    if (on) out.push(on);
  } else if (c.why === "busy") {
    if (c.clearLock) out.push({ act: "clear_lock", label: t("cant.clear_lock") });
    if (on) out.push(on);
  } else {
    if (c.why === "not_installed" && c.device) out.push({ act: "install", label: t("cant.install", agent, c.computer) });
    if (c.why === "signed_out" && c.device) out.push({ act: "login", label: t("cant.login", agent, c.computer) });
    if (c.why === "old") out.push({ act: "update", label: t("cant.update", c.computer) });
    if (on) out.push(on);
    if (c.cloneHere) out.push({ act: "clone_here", label: t("cant.clone_to", c.computer) });
  }
  // 再试一次: when nothing else is known, or after a fix done elsewhere (an install, a sign-in).
  // D549: never for an agent that refuses root there: the same start fails the same way.
  if ((!out.length || !place) && c.why !== "refuses_root") out.push({ act: "reopen", label: t("task.action.retry") });
  const fixes: CantFix[] = out.map((f, i) => ({ ...f, kind: i === 0 ? "primary" : "secondary" }));
  if (c.why === "other" && c.more) fixes.push({ act: "why", label: t("cant.why"), kind: "text" });
  return fixes;
}

/** What the primary fix does, muted under the reason (never a bare path, never a stack). */
export function cantHint(c: CantStart): string | undefined {
  if (c.why === "busy") return t("cant.busy.hint");
  if (PLACE_WHY.has(c.why) && c.cloneHere && c.pickHere) return t("cant.place.hint", c.what, c.computer);
  if (PLACE_WHY.has(c.why) && c.pickHere) return t("cant.pick.hint", c.computer);
  if (c.why === "not_installed" || c.why === "signed_out" || c.why === "old" || c.why === "refuses_root") return t(`cant.${c.why}.hint`);
  if ((c.why === "other" || c.why === "away") && !c.elsewhere) return t("cant.retry.hint");
  return undefined;
}

/** Do one fix (a tap on the page or in the brief). */
export function doCantFix(taskId: string, c: CantStart, f: CantFix, toggle?: () => void) {
  switch (f.act) {
    case "pick":
      return A.openFolderFor(taskId, c.device);
    case "install":
    case "login":
      return A.cantSetup(c.device, f.act, c.harness ?? "");
    case "update":
      return A.openSettings("devices");
    case "why":
      return toggle?.();
    default:
      return A.cantAction(taskId, f.act, f.device);
  }
}

/** The opened task's own block: the reason, what is known, the fixes, and 看看为什么 for the rest. */
export function CantStartView({ taskId, about, c }: { taskId: string; about: string; c: CantStart }) {
  const [open, setOpen] = useState(false);
  const hint = cantHint(c);
  const fixes = cantFixes(c);
  return (
    <div class="cant">
      <p class="cant-line">{cantLine(c)}</p>
      {c.detail && <p class="cant-hint">{c.detail}</p>}
      {hint && <p class="cant-hint">{hint}</p>}
      <div class="btns">
        {fixes.map((f) => (
          <Btn key={f.act} kind={f.kind} label={f.act === "why" && open ? t("cant.why.close") : f.label} about={about} onClick={() => doCantFix(taskId, c, f, () => setOpen(!open))} />
        ))}
      </div>
      {open && c.more && <pre class="cant-more">{c.more}</pre>}
    </div>
  );
}
