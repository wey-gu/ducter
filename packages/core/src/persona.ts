// L1 identity from Nowledge Mem (read-only `nmem context`), with a default that never blocks startup.
import type { CoreApi } from "@ducter/protocol/src/internal.ts";

export type Persona = CoreApi["persona"];

export const DEFAULT_IDENTITY = [
  "You are Ducter, the user's personal AI partner.",
  "You are the only one the user talks to; your work runs as tasks on coding and browser harnesses.",
  "Report back plainly, ask for the user's attention only when it truly matters, and always offer a default.",
].join(" ");

/** Builds identity text from an `nmem --json context` bundle; undefined if it carries nothing useful. */
export function identityFromBundle(b: any): { name?: string; identity?: string } {
  const owner = b?.owner_profile ?? {};
  const agent = b?.agent_profile ?? {};
  const lines: string[] = [];
  if (owner.name) lines.push(`The user is ${owner.name}${owner.aliases ? ` (also: ${owner.aliases})` : ""}.`);
  if (owner.context) lines.push(String(owner.context));
  if (owner.preferred_language) lines.push(`The user's preferred language: ${owner.preferred_language}.`);
  if (owner.custom_instructions) lines.push(String(owner.custom_instructions));
  for (const r of Array.isArray(b?.rule_stack) ? b.rule_stack : []) {
    const text = typeof r === "string" ? r : r?.text ?? r?.content;
    if (text) lines.push(`- ${text}`);
  }
  return { name: agent.display_name || undefined, identity: lines.length ? lines.join("\n") : undefined };
}

export async function loadPersona(opts: { timeoutMs?: number; bin?: string; off?: boolean; mem?: { agentId: string; space?: string } } = {}): Promise<Persona & { source: string }> {
  const fallback = { id: "default", name: process.env.DUCTER_PERSONA_NAME || "Ducter", identity: DEFAULT_IDENTITY, source: "default" };
  // Memory off means the partner neither recalls, saves, nor reads its identity from Mem.
  if ((opts.off ?? process.env.DUCTER_MEMORY === "off")) return { ...fallback, source: "off" };
  // D141: the persona's own identity's bundle once it is bound, never an ambient NMEM_AGENT_ID.
  const who = opts.mem ? ["--agent-id", opts.mem.agentId, ...(opts.mem.space ? ["--space", opts.mem.space] : [])] : [];
  try {
    const proc = Bun.spawn([opts.bin ?? "nmem", "--json", "context", "--no-ensure", "--no-working-memory", ...who], {
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
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
