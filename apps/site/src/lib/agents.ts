/**
 * The coding agents Ducter hands work to. This is the only place the site names them:
 * move a name from `soon` to `today` when it is verified end to end.
 */
export const agents = {
  today: ["Claude Code", "Codex"],
  soon: ["pi", "DeepSeek Harness"],
};

const join = (xs: string[], word: "and" | "or") =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;

/** "Claude Code or Codex": what you need installed today. */
export const agentsToday = join(agents.today, "or");

/** "Claude Code and Codex": the agents in a sentence about what works. */
export const agentsTodayAnd = join(agents.today, "and");

/** One line that says what works now and what comes next. */
export const agentsLine =
  `Works with ${agentsTodayAnd} today` +
  (agents.soon.length ? `; ${join(agents.soon, "and")} are coming soon, and more after that.` : ".");
