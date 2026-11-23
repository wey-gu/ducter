// D496: what a task sent out, in plain words: "改了 PR #10847 的说明和标签" / "Edited PR #10847's
// description and labels", "推送到 ducter/… （2 次）". Worded from the act's facts (protocol
// outward.ts), never the command; the commands stay behind a hover for whoever wants them.
import { A } from "./app.ts";
import type { OutsideRow } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const FIELDS = ["title", "body", "labels", "reviewers", "assignees", "base", "milestone", "projects"];

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(t("out.sep"))}${t("out.and")}${xs.at(-1)}`;
}

/** One row of Sent out, as a sentence. `branch` is the task's own, for a push that names none. */
export function outsideSentence(row: OutsideRow, branch?: string): string {
  const a = row.act;
  const pr = a.n ? t("out.pr", a.n) : t("out.pr.this");
  const issue = a.n ? t("out.issue", a.n) : t("out.issue.this");
  let s: string;
  switch (a.kind) {
    case "push":
      s = a.target || branch ? t("out.push", a.target || branch) : t("out.push.bare");
      break;
    case "pr_create":
      s = t("out.pr_create", a.n ? pr : t("out.pr.new"));
      break;
    case "issue_create":
      s = t("out.issue_create", a.n ? issue : t("out.issue.new"));
      break;
    case "pr_edit":
    case "issue_edit": {
      const noun = a.kind === "pr_edit" ? pr : issue;
      const f = FIELDS.filter((x) => a.fields?.includes(x)).map((x) => t(`out.f.${x}`));
      s = f.length ? t("out.edit", noun, list(f)) : t("out.edit.bare", noun);
      break;
    }
    case "pr_review":
      s = t(`out.pr_review.${a.review ?? "comment"}`, pr);
      break;
    case "pr_comment":
    case "pr_merge":
    case "pr_close":
    case "pr_reopen":
    case "pr_ready":
      s = t(`out.${a.kind}`, pr);
      break;
    case "issue_comment":
    case "issue_close":
    case "issue_reopen":
    case "issue_delete":
      s = t(`out.${a.kind}`, issue);
      break;
    case "http":
      s = a.target ? t("out.http", a.target) : t("out.http.bare");
      break;
    default:
      s = t(`out.${a.kind}`, a.target ?? "");
  }
  return row.count > 1 ? t("out.times", s, row.count) : s;
}
