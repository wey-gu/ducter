/**
 * The AI agents Ducter hands work to. This is the only place the site names them:
 * move a name from `soon` to `today` when it is verified end to end.
 */
export const agents = {
  /** Can be the partner itself, so one of these must be installed and signed in. */
  today: ["Claude Code", "Codex", "pi", "DeepSeek Harness"],
  /** Carry tasks but not yet the partner (none since D177: all four can be the partner). */
  tasks: [] as string[],
  soon: [] as string[],
};

const join = (xs: string[], word: "and" | "or") =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;

/** "Claude Code, Codex, pi or DeepSeek Harness": what you need installed today. */
export const agentsToday = join(agents.today, "or");

/** "Claude Code, Codex, pi and DeepSeek Harness": the agents in a sentence about what works. */
export const agentsTodayAnd = join(agents.today, "and");

/** One line that says what works now and what comes next. */
export const agentsLine =
  `Works with ${join([...agents.today, ...agents.tasks], "and")} today, and more AI agents after that.`;
