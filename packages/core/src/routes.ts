// D503 (research/219): a usage limit is one account's, not the model's. When a task's agent runs
// out, the same agent and model may still be reachable another way: the same agent signed in to
// another account on another computer (a worker, the Mac beside a server home). This lists those
// routes from what Ducter already knows (each computer's agents and the fingerprint of the account
// each is signed in to, the limits each has said) and ranks them: most room left first, then the
// one whose limit resets soonest. Pure; core's limit waits (limits.ts) take the first at a hit.
//
// What is never a route here, and why:
//   - the same account on another computer (the same fingerprint): one account, one limit;
//   - an account Ducter can't name (an older worker, a sign-in by token): it may be the same one;
//   - an agent paid per use (an API key): it spends money, so it is the person's call, never automatic;
//   - a computer asleep or out of reach, or one where the task can't run (the ranking's own checks).
//
// The reserve (D503, research/218 item 5): the account the partner thinks with is kept for the
// partner. A new task that would use it while only its reserve is left (D89's PARTNER_RESERVE) goes to another route of
// the same agent and model instead, when one exists; with none, it runs where it was picked.
import { PARTNER_RESERVE, type AccountUsage, type Candidate } from "@ducter/protocol";
import type { AgentLimit } from "./agent-limits.ts";
import type { Computer } from "./candidates.ts";

/** D89: past this share of any window only the partner's reserve is left, and its account is left to the partner. */
export const RESERVE_AT = 1 - PARTNER_RESERVE;

export interface Route {
  /** The computer's id (Candidate.device), and its name. */
  device: string;
  deviceName: string;
  home: boolean;
  harness: string;
  model?: string;
  /** The account's fingerprint there. */
  account: string;
  /** Room left, 0..1, when that computer's agent said it. */
  left?: number;
  /** When its limit resets, when said. */
  resetsAt?: string;
}

export interface RouteAsk {
  harness: string;
  model?: string;
  /** Where the task runs now: the computer's id or name, "local" (or empty) for the home. */
  from?: string;
  computers: Computer[];
  /** The task's own candidates (loadout.candidates): who could take it where, with the ranking's checks. */
  candidates: Candidate[];
  /** Every agent's limit per computer, as last known (agent-limits.ts). */
  limits: AgentLimit[];
  now: number;
}

const isHere = (c: Computer, d: string | undefined) => (!d || d === "local" ? c.home : c.id === d || c.name === d);

/** The used-up accounts: a limit said on one computer holds wherever that account is signed in. */
function usedUp(ask: RouteAsk): Set<string> {
  const out = new Set<string>();
  for (const l of ask.limits) {
    if (l.harness !== ask.harness || l.state !== "used_up") continue;
    if (l.until && Date.parse(l.until) <= ask.now) continue;
    const c = ask.computers.find((x) => isHere(x, l.device));
    const a = c?.harnesses.find((h) => h.harness === ask.harness)?.account;
    if (a) out.add(a);
  }
  return out;
}

/** The other ways to the same agent and model, best first (empty when the account here is unknown). */
export function sameModelRoutes(ask: RouteAsk): Route[] {
  const here = ask.computers.find((c) => isHere(c, ask.from));
  const mine = here?.harnesses.find((h) => h.harness === ask.harness)?.account;
  if (!here || !mine) return [];
  const spent = usedUp(ask);
  spent.add(mine);
  const out: Route[] = [];
  for (const c of ask.computers) {
    if (c.id === here.id || c.state !== "awake") continue;
    const h = c.harnesses.find((x) => x.harness === ask.harness);
    if (!h?.installed || !h.loggedIn || !h.account || spent.has(h.account) || h.billing === "usage") continue;
    // The same model: on that computer's list when it lists its models (an id or its label).
    if (ask.model && h.models?.length && !h.models.some((m) => m.id === ask.model || m.label === ask.model)) continue;
    // The ranking's own checks for this task there (what it needs, the person's rules).
    const cand = ask.candidates.find((x) => x.device === c.id && x.harness === ask.harness && !x.blocked && !x.waits) ?? ask.candidates.find((x) => x.device === c.id && x.harness === ask.harness);
    if (!cand || cand.blocked || cand.waits || cand.billing === "usage") continue;
    const left = h.allowance?.left ?? cand.left;
    if (left !== undefined && left <= 0) continue;
    const resetsAt = h.allowance?.resetsAt ?? cand.resetsAt;
    out.push({ device: c.id, deviceName: c.name, home: c.home, harness: ask.harness, ...(ask.model ? { model: ask.model } : {}), account: h.account, ...(left !== undefined ? { left } : {}), ...(resetsAt ? { resetsAt } : {}) });
  }
  const reset = (r: Route) => Date.parse(r.resetsAt ?? "") || Number.POSITIVE_INFINITY;
  return out.sort((a, b) => (b.left ?? 0.5) - (a.left ?? 0.5) || reset(a) - reset(b) || Number(b.home) - Number(a.home));
}

/** How full the account is: its fullest window (0..1), or undefined when nothing was read. */
export function fullest(u: AccountUsage | undefined): number | undefined {
  if (!u?.windows.length) return u?.limited ? 1 : undefined;
  return u.limited ? 1 : Math.max(...u.windows.map((w) => w.used));
}

/** Whether a task on the partner's own account should go elsewhere: past the reserve, and another route exists. */
export function overReserve(o: { harness: string; partnerHarness: string; onHome: boolean; usage: AccountUsage | undefined }): boolean {
  if (!o.onHome || o.harness !== o.partnerHarness) return false;
  const f = fullest(o.usage);
  return f !== undefined && f >= RESERVE_AT;
}
