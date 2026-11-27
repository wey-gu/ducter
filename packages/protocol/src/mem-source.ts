// D295, D304: who a memory in Nowledge Mem is from, by Mem's own `source`. Shared by the glance at
// Mem (core/src/mem-glance.ts), the partner's 想起了 / Remembered line and the task brief's other
// tools' memories (D304), so a source reads the same everywhere.

/** Mem's `source` for an AI tool, and the name the person knows it by. */
export const AI_TOOLS: Record<string, string> = {
  "claude-code": "Claude Code",
  claude_code: "Claude Code",
  claude: "Claude",
  "claude-desktop": "Claude",
  codex: "Codex",
  "codex-cli": "Codex",
  cursor: "Cursor",
  windsurf: "Windsurf",
  "gemini-cli": "Gemini CLI",
  gemini: "Gemini",
  chatgpt: "ChatGPT",
  openclaw: "OpenClaw",
  opencode: "OpenCode",
  dim: "Dim",
  pi: "pi",
  cline: "Cline",
  copilot: "GitHub Copilot",
  "github-copilot": "GitHub Copilot",
  zed: "Zed",
  raycast: "Raycast",
};

/** said: the person's own words to the partner (Ducter saved them); tool: another AI tool saved it; you: the person saved it themselves. */
export type RecallBy = "said" | "tool" | "you";

/** Who a memory is from, by its Mem `source`: Ducter's own, a known AI tool (with its name), else the person's. */
export function memSource(source: string | undefined): { by: RecallBy; from?: string } {
  const s = String(source ?? "").trim().toLowerCase();
  if (s === "ducter") return { by: "said" };
  const tool = AI_TOOLS[s];
  return tool ? { by: "tool", from: tool } : { by: "you" };
}

/** Mem's own distillers: what Nowledge Mem itself drew out of the person's conversations and notes. */
const MEM_SELF = new Set(["thread_distillation", "knowledge_agent", "feed_agent", "agent"]);
/** The person's own ways of saving into Mem: its command line, its app, a web clip. */
const PERSON = new Set(["cli", "app", "desktop", "web", "clip", "browser_exchange", "manual", "user", ""]);

/**
 * D321: who a memory is from on Settings › 记忆, or undefined when Mem's `source` is none of the known
 * ones (a team chat's message id, a pull request, a library document): such a memory is not shown as
 * something about the person.
 */
export function aboutSource(source: string | undefined): { by: "said" | "tool" | "you" | "mem"; from?: string } | undefined {
  const s = String(source ?? "").trim().toLowerCase();
  if (s === "ducter") return { by: "said" };
  const tool = AI_TOOLS[s];
  if (tool) return { by: "tool", from: tool };
  if (MEM_SELF.has(s)) return { by: "mem" };
  if (PERSON.has(s)) return { by: "you" };
  return undefined;
}
