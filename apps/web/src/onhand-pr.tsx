// D508: a task whose result is an open pull request is not done. Its work goes on in the PR (CI,
// reviews, the merge), so On hand stands it under where that PR is: ready to merge waits for you
// (等你, with the one thing to do, 到 GitHub 合并); every other open phase waits (在等); merged or closed
// is done. Its row says the phase in plain words with its facts, each its own element, and never
// offers a local merge or a new draft PR. The Mac reads the same (views/onhandpr.go); the phase is
// the protocol's prSaid, over its shared fixture.
import { prGoesOn, type PrSaid, type TaskPR } from "@ducter/protocol/src/pr-state.ts";
import { A } from "./app.ts";
import { attention, placeOf, type Task } from "./store.ts";
import { outcomeOf } from "./onhand-brief.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The open PR a finished task's work goes on in, where it stands and where the board stands it. */
export function prRowOf(task: Task): { pr: TaskPR; said: PrSaid; stands: "needs" | "waiting" } | undefined {
  const a = attention(task);
  if (a !== "done" && a !== "done_claimed") return undefined;
  return prGoesOn(task.card?.prs);
}

/** The task made or holds a pull request: then its branch lives there (no local merge, no new draft PR). */
export function hasPR(task: Task): boolean {
  return !!task.card?.prs?.length || !!outcomeOf(task);
}

/** A PR's phase in the person's words. */
export function prWords(task: Task, s: PrSaid): string {
  const sep = t("onhand.prs.sep");
  if (s.phase === "changes") return t("onhand.prs.changes", (s.by ?? []).join(sep));
  if (s.phase === "conflict") {
    const p = placeOf(task);
    return t("onhand.prs.conflict", (p.kind === "repo" && p.baseBranch) || "main");
  }
  return t(`onhand.prs.${s.phase}`);
}

/** What a row says beside the phase, each its own element: who it waits on or who signed off, what
 *  failed, how CI stands. */
export function prFacts(s: PrSaid): string[] {
  const sep = t("onhand.prs.sep");
  const out: string[] = [];
  if (s.phase === "review" && s.by?.length) out.push(t("onhand.prs.awaiting", s.by.join(sep)));
  if (s.phase === "ready" && s.by?.length) out.push(t("onhand.prs.approved", s.by.join(sep)));
  if (s.phase === "failing" && s.failed?.length) out.push(t("onhand.prs.failed", s.failed.join(sep)));
  const c = s.checks;
  if (c && s.phase !== "failing" && s.phase !== "ready") out.push(c.passed === c.total ? t("onhand.prs.allpassed") : t("onhand.prs.passed", c.passed, c.total));
  return out;
}

/** A PR row's one quiet line: the phase in the state's ink, then its facts, each its own element. */
export function PrLine({ task, said, stands }: { task: Task; said: PrSaid; stands: "needs" | "waiting" }) {
  return (
    <span class={`o2 prl ${stands}`}>
      <span class="ph">{prWords(task, said)}</span>
      {prFacts(said).map((f) => (
        <span key={f} class="pf">
          {f}
        </span>
      ))}
    </span>
  );
}
