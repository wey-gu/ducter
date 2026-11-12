// L1 identity from Nowledge Mem (read-only `nmem context`), with a default that never blocks startup.
import type { CoreApi } from "@ducter/protocol/src/internal.ts";
import { nmemEnv } from "@ducter/protocol/src/tool-env.ts";

export type Persona = CoreApi["persona"];

export const DEFAULT_IDENTITY = [
  "You are Ducter, the user's personal AI partner.",
  "You are the only one the user talks to; your work runs as tasks on coding and browser harnesses.",
  "Report back plainly, ask for the user's attention only when it truly matters, and always offer a default.",
].join(" ");

/**
 * Bounds on the identity (principle 5: cap every read before it enters). It is L1 of every partner
 * session's cached prefix, read from data the user grows in Mem (a profile, a rule stack), so it
 * never grows with it: a field, a rule and the whole block each have a ceiling (research/48 F1).
 */
export const IDENTITY_FIELD_MAX = 2_000;
export const IDENTITY_RULE_MAX = 300;
export const IDENTITY_RULES_MAX = 30;
export const IDENTITY_MAX = 8_000;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

/** Builds identity text from an `nmem --json context` bundle; undefined if it carries nothing useful. */
export function identityFromBundle(b: any): { name?: string; identity?: string } {
  const owner = b?.owner_profile ?? {};
  const agent = b?.agent_profile ?? {};
  const field = (v: unknown) => clip(String(v).trim(), IDENTITY_FIELD_MAX);
  const lines: string[] = [];
  if (owner.name) lines.push(`The user is ${clip(String(owner.name), 120)}${owner.aliases ? ` (also: ${clip(String(owner.aliases), 200)})` : ""}.`);
  if (owner.context) lines.push(field(owner.context));
  if (owner.preferred_language) lines.push(`The user's preferred language: ${clip(String(owner.preferred_language), 40)}.`);
  if (owner.custom_instructions) lines.push(field(owner.custom_instructions));
  const rules = (Array.isArray(b?.rule_stack) ? b.rule_stack : []).map((r: any) => (typeof r === "string" ? r : r?.text ?? r?.content)).filter((t: unknown) => typeof t === "string" && t.trim());
  for (const text of rules.slice(0, IDENTITY_RULES_MAX)) lines.push(`- ${clip(text.trim(), IDENTITY_RULE_MAX)}`);
  if (rules.length > IDENTITY_RULES_MAX) lines.push(`(${rules.length - IDENTITY_RULES_MAX} more of the user's rules are not shown here)`);
  const identity = lines.length ? clip(lines.join("\n"), IDENTITY_MAX) : undefined;
  return { name: agent.display_name ? clip(String(agent.display_name), 60) : undefined, identity };
}

export async function loadPersona(opts: { timeoutMs?: number; bin?: string; off?: boolean; mem?: { agentId: string; space?: string } } = {}): Promise<Persona & { source: string }> {
  const fallback = { id: "default", name: process.env.DUCTER_PERSONA_NAME || "Ducter", identity: DEFAULT_IDENTITY, source: "default" };
  // Memory off means the partner neither recalls, saves, nor reads its identity from Mem.
  if ((opts.off ?? process.env.DUCTER_MEMORY === "off")) return { ...fallback, source: "off" };
  // D141: the persona's own identity's bundle once it is bound, never an ambient NMEM_AGENT_ID.
  const who = opts.mem ? ["--agent-id", opts.mem.agentId, ...(opts.mem.space ? ["--space", opts.mem.space] : [])] : [];
  try {
    const proc = Bun.spawn([opts.bin ?? process.env.NMEM_CLI_PATH ?? "nmem", "--json", "context", "--no-ensure", "--no-working-memory", "--source-app", "ducter", ...who], {
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      env: nmemEnv(), // D102: the basics and NMEM_*, never Ducter's keys
    });
    const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 4000);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    if ((await proc.exited) !== 0) return fallback;
    const { name, identity } = identityFromBundle(JSON.parse(out));
    const finalName = process.env.DUCTER_PERSONA_NAME || name || fallback.name;
    return {
      id: "default",
      name: finalName,
      identity: identity ? `${DEFAULT_IDENTITY.replace("Ducter", finalName)}\n\n${identity}` : DEFAULT_IDENTITY.replace("Ducter", finalName),
      source: "nowledge-mem",
    };
  } catch {
    return fallback;
  }
}
