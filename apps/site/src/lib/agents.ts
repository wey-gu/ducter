/**
 * The AI agents Ducter hands work to. This is the only place the site names them; the docs name
 * them too, with the same groups. Move a name from `soon` to the group it works in when it is
 * verified end to end.
 */
export const agents = {
  /** Can be the partner itself, so one of these must be installed and signed in. */
  today: ["Claude Code", "Codex", "pi", "DeepSeek Harness"],
  /** Take any task, never the partner: Devin CLI over its own sign-in; Cursor through its own SDK,
   *  which cannot carry the partner's prompt. */
  tasks: ["Devin CLI", "Cursor"],
  /** Take a task only when the person names them (offered last; their terms keep those sign-ins
   *  interactive), so the site says them apart: "when you ask for them by name". */
  byName: ["Antigravity", "Kimi Code CLI", "OpenCode"],
  /** Built into a coming Ducter, not today: its tools aren't in this build yet. */
  soon: ["Dim"],
};

const join = (xs: string[], word: "and" | "or") =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;

/** "Claude Code, Codex, pi or DeepSeek Harness": what can be your partner today. */
export const agentsToday = join(agents.today, "or");

/** "Claude Code, Codex, pi and DeepSeek Harness": the partner-capable agents in a sentence. */
export const agentsTodayAnd = join(agents.today, "and");

/** "Devin CLI": the agent that takes any task but never the partner. */
export const agentsTasksAnd = join(agents.tasks, "and");

/** "Antigravity, Kimi Code CLI and OpenCode": the agents that work only when asked by name. */
export const agentsByNameAnd = join(agents.byName, "and");

/** "Cursor and Dim": what is coming, never what works today. */
export const agentsSoonAnd = join(agents.soon, "and");

/** Every agent that can take a task today, in the order the site says them. */
export const agentsWorkingAnd = join([...agents.today, ...agents.tasks, ...agents.byName], "and");

/** One line that says what works now and what comes next. */
export const agentsLine =
  `Works with ${agentsWorkingAnd} today. ${agentsSoonAnd} are coming soon.`;
