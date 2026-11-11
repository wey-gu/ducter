// Every model-visible string the runner produces lives in this file (snapshot-tested).
import type { Place } from "@ducter/protocol";

export interface BriefInput {
  partnerName: string; // e.g. "Ducter"
  taskId: string;
  title: string;
  brief: string | null; // verbatim from the partner; null: it arrives as the first turn (D120)
  place: Place;
  cwd: string;
  project?: string;
  mcpServerName: string; // the Ducter MCP server name, e.g. "ducter"
  /** The language the user reads reports in; absent: the brief's own words decide. */
  language?: "zh" | "en";
  /** D168: plugin = the user's Nowledge Mem plugin is on in this session; ducter = Ducter's own read-only memory stands in. Absent: none (off, or a browser). */
  memory?: "plugin" | "ducter";
}

/** D168: what the user's memory gives this task. Absent: nothing at all about memory. */
function memorySection(b: BriefInput): string {
  if (!b.memory) return "";
  const s = b.mcpServerName;
  const write = `You never save memories yourself (no "save" or "distill" command, no \`nmem m add\`): if you learned something durable about the user (a stated preference, a convention they keep, a lasting fact about their work or people), put it in \`remember\` on your final report; ${b.partnerName} decides what to keep. Never secrets, never task plumbing (branches, commits, ids, progress).`;
  if (b.memory === "plugin")
    return `
## What ${b.partnerName} remembers about the user

- Nowledge Mem is on in this session as ${b.partnerName}'s own memory: what it gives you at the start, and what you find with its search, is what the user and ${b.partnerName} know. Search it when the work turns on something the user decided or prefers that you can't see. Follow what fits; the brief wins.
- It keeps this session's thread by itself; leave that to it.
- ${write}
`;
  return `
## What ${b.partnerName} remembers about the user

- Your first message may start with \`<what_i_know>\`: the few things the user's long-term memory holds that matter here (their preferences, conventions, people), each with its id. Follow them unless the brief says otherwise; the brief wins.
- To look closer, \`memory_search\` on the \`${s}\` server reads the user's memory (a few short results, read-only). Use it when the work turns on something the user decided or prefers that you can't see; not for facts in the repo or on the web.
- ${write}
`;
}

/** At most this many memories, each clipped, in front of a task's first turn (the recall asks for 4 × 200; research/48 M1). */
export const KNOWN_MAX = { notes: 4, title: 80, content: 220, id: 40 } as const;
const clipTo = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

/** D168: the memories in front of a task's first turn (ids so it can look closer; the brief wins). */
export function knownTurn(notes: { id?: string; title: string; content: string; date?: string }[], partnerName: string): string {
  const lines = notes.slice(0, KNOWN_MAX.notes).map((n) => `- ${n.id ? `[${clipTo(n.id, KNOWN_MAX.id)}] ` : ""}${clipTo(n.title, KNOWN_MAX.title)}: ${clipTo(n.content, KNOWN_MAX.content)}${n.date ? ` (${n.date.slice(0, 10)})` : ""}`);
  return `<what_i_know>\nFrom the user's memory, what ${partnerName} thinks matters for this task (background; the brief wins):\n${lines.join("\n")}\n</what_i_know>\n\n`;
}

/** The report-language rule. Named when known: a haiku task with an English brief reported in
 *  Chinese, and its evidence label became the On hand card's subtitle (fresh-user QA). */
function languageLine(lang: BriefInput["language"]): string {
  const what = "write `summary`, question `text` and `default`, and evidence `label`s";
  if (lang === "en") return `- **Language: English.** The user reads English: ${what} in English, whatever language the code, files or tool output are in. They may read them as they are.`;
  if (lang === "zh") return `- **Language: Chinese (简体中文).** The user reads Chinese: ${what} in Chinese, whatever language the code, files or tool output are in. Code, commands and names stay as they are. They may read them as they are.`;
  return `- **Language:** ${what} in the language of the user's own words in the brief (Chinese words → Chinese). The user may read them as they are.`;
}

function placeLine(p: Place, cwd: string): string {
  switch (p.kind) {
    case "repo":
      return `a git worktree of ${p.repoPath} at ${cwd}, on branch ${p.branch ?? "(current)"}${p.baseBranch ? ` (based on ${p.baseBranch})` : ""}. Commit your work on this branch.`;
    case "folder":
      // D142: the user's own folder, not a repo. Ducter copies it before the first change, so
      // the user can undo everything with one tap; what can't be undone is asked first.
      return `the folder ${cwd}. It is the user's own folder, not a git repo: your changes land in it directly and they see them at once. Ducter keeps a copy of the folder from before your first change, so the user can undo everything you change with one tap; you don't make backups or commits. Write only inside this folder. Ask first (report_to_main, state "needs_input", with no default) before deleting more than 10 files at once, and before writing anything outside this folder.`;
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

${b.brief === null ? `It is your first message, between <brief> tags: ${b.partnerName} opened you while still writing it.` : `<brief>\n${b.brief}\n</brief>`}

## Where you work

You work in ${placeLine(b.place, b.cwd)}${b.project ? ` Project: ${b.project}.` : ""}

## Done-criteria

- The brief's own done-criteria, if it states any, are met.
- Otherwise: the ask is fully done and you can point to evidence (test output, a diff or commit, a file path, a URL).
- Attach that evidence to your final report.
- In a repo: your work is committed on your own branch, in small meaningful commits. That branch lives only in your worktree, so a commit there is private and reversible: always commit, even if the brief says "no commits" (read that as "don't merge or push"). Never leave finished work uncommitted.
- Your done report carries each commit as {kind:"diff", label:"commit", ref:"<sha>"}, so the user can merge it with one tap. Ducter already knows your branch; the summary doesn't need it.

## Out of scope

- Anything the brief does not ask for. Note follow-ups in your report instead of doing them.
- Files outside your working place, pushing to remotes, merging into the base branch, opening a PR, publishing, deleting user data, or spending money, unless the brief says so explicitly. Integrating your branch is the user's call; offer it in your report, don't ask before committing.

## How you report (required)

Use the \`report_to_main\` tool on the \`${s}\` MCP server. It is the only way ${b.partnerName} hears from you.
- Call it when you are **done** (state "done"), **failed** (state "failed"), **blocked** (state "blocked"), or **need a decision** (state "needs_input").
${languageLine(b.language)}
- \`summary\`: at most 600 characters, plain and specific. Open with the outcome in one sentence anyone could follow (what is now true for the user), then what stands. Branch names, commit hashes and tool names go in \`evidence\`, not at the start.
- \`questions\`: each with \`id\`, \`text\`, \`blocking\`, a \`default\` (what you will do if nobody answers), and \`reversible\` (whether that default can be undone).
  The user answers with three buttons: **Go** = do your \`default\`; **Hold** = pause and wait (it never means "no"); **Reply** = their own words. So phrase each question so that Go is the default action, and do not mention the buttons in the text.
- \`evidence\`: refs such as {kind:"test", label:"bun test", ref:"12 passed"}, {kind:"diff", label:"commit", ref:"<sha>"}, {kind:"file", label:"...", ref:"<path>"}.
- \`show\`: paths of what the user should see with the report, shown to them in the conversation: a picture you generated or drew (your image tool says where it saved it), a screenshot that shows the result, a file you made for them. Only what shows the outcome or what they asked for, never everything you looked at. Pictures the user sent you came with your messages; you don't need to show them back.
- After reporting needs_input or blocked, end your turn and wait; the answer will arrive as a message.
- Call \`checkpoint\` (same server) after each meaningful step with where the work stands and what comes next. Your context is small and is compacted when it fills up; your last checkpoint is what you carry on from afterwards.
- Never ask the user questions in plain text, and never wait for a reply in text. Put every question in \`report_to_main\` with a default.
- If you lack context, use \`log_search\` / \`log_read\` on the same server before asking.
${memorySection(b)}`;
}

/** First user turn of a fresh task session. */
/** The first turn of a task opened before its brief was written (D120): the brief, then the kickoff. */
export function briefTurn(brief: string, title: string): string {
  return `<brief>\n${brief}\n</brief>\n\n${kickoff(title)}`;
}

export function kickoff(title: string): string {
  return `Start the task "${title}" now, following your task brief. Report via report_to_main when done, blocked, or needing a decision.`;
}

/** First turn of a task resumed after the main process restarted mid-turn. */
export const RESUME_AFTER_RESTART =
  "Your previous turn was cut off (the host restarted). Check where the work stands, then continue the task. Report via report_to_main when done, blocked, or needing a decision.";

/** Turn sent when the user reopens a finished or dropped task. */
export const REOPENED =
  "The user reopened this task. Check where the work stands, then carry on with the brief. Report via report_to_main when done, blocked, or needing a decision.";

/**
 * D135: what the harness keeps when it compacts a task's context. Claude Code's PreCompact hook
 * prints it, and Claude Code appends it to its compact instructions. No single quotes needed.
 */
export const PRECOMPACT_NOTE =
  "This is a Ducter task. Keep in the summary: the brief's ask and done-criteria as written, the latest checkpoint (where the work stands, what is done, what comes next), every file changed and commit made, open questions, and the very next step. Ducter sends the brief and the latest saved progress again right after this compaction.";

/** D135: sent once the context nears the compaction point, so the progress is saved before it. */
export const SAVE_BEFORE_COMPACT =
  "Your context is nearly full and will be compacted soon. Call `checkpoint` now with where the work stands, what is done and what comes next (files, commits, open questions), then carry on with the task.";

/** D135: the next input after a compaction: the brief again and the latest saved progress. */
export function afterCompaction(brief: string | null, progress: string | undefined): string {
  const b = brief?.trim() ? `<brief>\n${brief.trim()}\n</brief>` : "(The brief is in your instructions.)";
  const p = progress?.trim()
    ? `Latest saved progress (your last checkpoint):\n${progress.trim()}`
    : "No progress was saved before it: check git status, git log and the files to see where the work stands.";
  return `Your context was just compacted: what came before is now a summary. Here again are the task and where it stood, so nothing is lost.\n\n${b}\n\n${p}\n\nCarry on with the brief from there; don't start over. Keep calling checkpoint after each meaningful step.`;
}

/** D142: appended to the held first turn once the user answered whether the task may change a
 *  folder Ducter couldn't copy (Go, or their own words). */
export function noCopyAnswer(answer: string): string {
  if (/^User says Go\b/.test(answer.trim()))
    return "Ducter couldn't keep a copy of this folder, so nothing you change here can be undone. The user said you may change it anyway. Change only what the brief asks.";
  return `Ducter couldn't keep a copy of this folder, so nothing you change here can be undone. Asked whether you may change it anyway, the user said: "${answer.trim()}". Change nothing in the folder unless that clearly means yes; otherwise only read, and report.`;
}

/** D214: put before the next turn after the user changed the task's files in its workbench. */
export function userEditsNote(edits: { path: string; how: "edited" | "reverted" }[]): string {
  const list = (how: "edited" | "reverted") => edits.filter((e) => e.how === how).map((e) => e.path).slice(0, 20).join(", ");
  const parts = [list("edited") && `edited ${list("edited")}`, list("reverted") && `put ${list("reverted")} back as it was before this task`].filter(Boolean);
  return `(Since your last turn the user ${parts.join(", and ")} themselves, in Ducter. Read those files again before you change them; keep their changes unless they ask otherwise.)`;
}

/** The one nudge after a turn ends with no report (stall rule). */
export const NUDGE = "Report status via report_to_main.";

/**
 * First turn of a task handed to another AI agent (D89, 换到 X 接着做 / Continue on X): the new
 * session has the same brief and worktree; this says where the work stood.
 */
export function handedOver(from: string, progress: string[]): string {
  const where = progress.length ? `\n\nWhere it stood (saved progress, oldest first):\n${progress.map((p) => `- ${p}`).join("\n")}` : "";
  return `This task was started by ${from}; the user moved it to you to carry on. The worktree has its changes so far. Check where the work stands (git status, git log, the files), then continue with the brief from there. Don't start over.${where}\n\nReport via report_to_main when done, blocked, or needing a decision.`;
}

/**
 * First turn of a new session in the same task when the old one can't be resumed (the harness
 * rejected the resume, or it was archived and its session is gone): focus-window-states
 * parked -> hot, "start a new session in the same window from brief + checkpoint".
 */
export function startedAfresh(progress: string[]): string {
  const where = progress.length ? `\n\nWhere it stood (saved progress, oldest first):\n${progress.map((p) => `- ${p}`).join("\n")}` : "";
  return `Your earlier session on this task couldn't be resumed, so this is a new session on the same task and place. Check where the work stands (git status, git log, the files), then continue with the brief from there. Don't start over.${where}\n\nReport via report_to_main when done, blocked, or needing a decision.`;
}

/**
 * D157: the first turn on another computer after the user moved the task there (E3): the same
 * task, from its saved progress; a repo comes as a fresh worktree of the pushed branch.
 */
export function movedOver(from: string, to: string, progress: string[], repo: boolean): string {
  const where = progress.length ? `\n\nWhere it stood (saved progress, oldest first):\n${progress.map((p) => `- ${p}`).join("\n")}` : "";
  const files = repo ? " The worktree here is a fresh checkout of the task branch as it was pushed: committed work is all here; check git log and git status." : " Files you made there are not here; anything you need again, make again.";
  return `The user moved this task from ${from} to ${to}, to carry on here.${files} Check where the work stands, then continue with the brief from there. Don't start over.${where}\n\nReport via report_to_main when done, blocked, or needing a decision.`;
}

/** A new session's seed (handedOver / startedAfresh) followed by the message that woke it. */
export function seedThen(seed: string, text: string): string {
  return `${seed}\n\nThe latest message for you:\n${text}`;
}
