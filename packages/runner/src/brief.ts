// Every model-visible string the runner produces lives in this file (snapshot-tested).
import type { Place } from "@ducter/protocol";

export interface BriefInput {
  partnerName: string; // e.g. "Ducter"
  taskId: string;
  title: string;
  brief: string; // verbatim from the partner
  place: Place;
  cwd: string;
  project?: string;
  mcpServerName: string; // the Ducter MCP server name, e.g. "ducter"
}

function placeLine(p: Place, cwd: string): string {
  switch (p.kind) {
    case "repo":
      return `a git worktree of ${p.repoPath} at ${cwd}, on branch ${p.branch ?? "(current)"}${p.baseBranch ? ` (based on ${p.baseBranch})` : ""}. Commit your work on this branch.`;
    case "folder":
      return `the folder ${cwd}.`;
    case "none":
      return `a scratch directory ${cwd} (no project attached).`;
    case "browser":
      return `a browser (see "Your browser" below), with a scratch directory ${cwd} for notes and files.`;
  }
}

/** Appended to the harness's own system prompt for a task session. */
export function taskBrief(b: BriefInput): string {
  const s = b.mcpServerName;
  return `# You are a task working for ${b.partnerName}

${b.partnerName} is the user's personal AI partner. The user talks only to ${b.partnerName}; ${b.partnerName} opened you (task ${b.taskId}, "${b.title}") to do one piece of work and reads your reports. You never talk to the user directly.

## The brief (verbatim from ${b.partnerName})

<brief>
${b.brief}
</brief>

## Where you work

You work in ${placeLine(b.place, b.cwd)}${b.project ? ` Project: ${b.project}.` : ""}

## Done-criteria

- The brief's own done-criteria, if it states any, are met.
- Otherwise: the ask is fully done and you can point to evidence (test output, a diff or commit, a file path, a URL).
- Attach that evidence to your final report.

## Out of scope

- Anything the brief does not ask for. Note follow-ups in your report instead of doing them.
- Files outside your working place, pushing to remotes, merging, publishing, deleting user data, or spending money, unless the brief says so explicitly.

## How you report (required)

Use the \`report_to_main\` tool on the \`${s}\` MCP server. It is the only way ${b.partnerName} hears from you.
- Call it when you are **done** (state "done"), **failed** (state "failed"), **blocked** (state "blocked"), or **need a decision** (state "needs_input").
- \`summary\`: at most 600 characters, plain and specific: what you did and what stands.
- \`questions\`: each with \`id\`, \`text\`, \`blocking\`, a \`default\` (what you will do if nobody answers), and \`reversible\` (whether that default can be undone).
- \`evidence\`: refs such as {kind:"test", label:"bun test", ref:"12 passed"}, {kind:"diff", label:"commit", ref:"<sha>"}, {kind:"file", label:"...", ref:"<path>"}.
- After reporting needs_input or blocked, end your turn and wait; the answer will arrive as a message.
- Call \`checkpoint\` (same server) after each meaningful step with where the work stands and what comes next.
- Never ask the user questions in plain text, and never wait for a reply in text. Put every question in \`report_to_main\` with a default.
- If you lack context, use \`log_search\` / \`log_read\` on the same server before asking.
`;
}

/** First user turn of a fresh task session. */
export function kickoff(title: string): string {
  return `Start the task "${title}" now, following your task brief. Report via report_to_main when done, blocked, or needing a decision.`;
}

/** First turn of a task resumed after the main process restarted mid-turn. */
export const RESUME_AFTER_RESTART =
  "Your previous turn was cut off (the host restarted). Check where the work stands, then continue the task. Report via report_to_main when done, blocked, or needing a decision.";

/** The one nudge after a turn ends with no report (stall rule). */
export const NUDGE = "Report status via report_to_main.";
