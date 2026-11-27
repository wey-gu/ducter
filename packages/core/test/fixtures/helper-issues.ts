// A helper that triages issues (nothing here is about a PR): the non-PR shape beside the PR helper in
// fixtures/keeps-old.ts. Another agent hands it one issue, and helper-general.test.ts takes that
// through the same hand-off, Keep item, and round-line code the PR helper goes through.
import type { Bodies } from "@ducter/protocol";
import type { Core } from "../../src/core.ts";

export const ISSUE_HELPER = {
  name: "Issue Triage",
  about: "New issues my agents hand over: triage, labels, reproduction steps",
  brief: "Read the issue; add labels; ask the reporter for steps a report is missing; never close it.",
} as const;

export const ISSUE_REF = "acme/web#842";
export const ISSUE_URL = "https://github.com/acme/web/issues/842";
export const ISSUE_AGENT = "Codex";
export const ISSUE_HEAD = "Ducter 的任务「分诊新 issue」：";
export const ISSUE_WORK = `请接手 ${ISSUE_URL}：分诊、补标签，缺复现步骤就问。`;
export const ISSUE_TASK = "t-issue-triage";
export const ISSUE_TASK_TITLE = `分诊 ${ISSUE_REF}`;

/** One issue handed to the helper by another agent, as that agent's mail and as D609's record. */
export function seedIssueHelper(core: Core) {
  const made = core.helpers.make({ ...ISSUE_HELPER });
  if (!made.ok) throw new Error(`issue helper: ${made.error}`);
  core.keeps.sync();
  const keep = core.keeps.all().find((k) => k.from.kind === "helper" && k.from.helperId === made.helper.id);
  if (!keep) throw new Error("issue helper: no Keep");
  const body: Bodies["bridge_msg"] = {
    direction: "in",
    messageId: "bm-issue-842",
    from: ISSUE_AGENT,
    agent: ISSUE_AGENT,
    helper: made.helper.id,
    text: `${ISSUE_HEAD}\n${ISSUE_WORK}`,
  };
  core.log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body });
  const handoff = core.handoffs.givenAgent({ body, at: new Date("2026-11-27T10:00:00Z").toISOString() });
  if (!handoff) throw new Error("issue helper: no hand-off");
  return { helper: made.helper, keep, handoff, body };
}
