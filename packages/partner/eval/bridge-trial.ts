// D324: the Bridge live trial's own throwaway identity, made for one run and removed after it, so the
// trial never reads or writes the person's live partner's mailbox (and needs no D258 guard to keep
// real mail safe). bridge-live.ts uses it for `--real`; `--cleanup` removes what a crashed run left.
//
// Each run: a ledger file first (so a crash leaves a note of what to remove), then
//   nmem agents enroll ducter-trial-<stamp>-<hex> --name "Ducter trial" --source-app ducter-trial
//   nmem bridge connections connect --space-id <Only me> --agent-id <it> --context <it>
// and a read-only check that Mem lists exactly one active connection for it (this one). Afterwards:
//   nmem bridge connections revoke <its connection>
//   nmem agents context clear --name <it> --expected-revision <from context show>
//   nmem agents delete <it> --yes
// Only an id shaped like a trial's is ever removed: never `ducter`, never a partner's `ducter-<id>`.
// Commands as nmem 0.10.119's help prints them; their answers are INFERRED until the first real run.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mailboxError, mailboxStuck } from "../src/bridge.ts";

export type Nm = (args: string[]) => Promise<{ code: number; out: string; err: string; j: any }>;

export interface TrialIdentity {
  agentId: string;
  context: string;
  spaceId: string;
  enrolled?: boolean;
  connectionId?: string;
  at: string;
}

/**
 * D369: why the peer's own mailbox can't take part, from a read-only `bridge inbox` as the peer, or
 * undefined when it answered. 2026-11-18: Mem answered the author's native Claude Code mailbox 409
 * `cloud_mailbox_own_source_unreconciled` ("Mailbox source authority requires reconciliation before
 * browsing", not retryable; nmem 0.10.120 has no command for it), and the whole run failed around it.
 */
export function peerInboxBlocked(r: { code: number; out: string; err: string }): string | undefined {
  if (r.code === 0) return undefined;
  const e = mailboxError(`${r.out}\n${r.err}`);
  if (mailboxStuck(e)) return `Nowledge Mem says the peer's own mailbox (the native Claude Code session) needs sorting out on Mem's side before it can be read (${e.code}${e.http ? `, HTTP ${e.http}` : ""}); nmem has no command for that, so nothing was made and nothing ran. Ask Nowledge, then run this again.`;
  return `The peer's own mailbox didn't answer a read (${e.code ?? `exit ${r.code}`}${e.http ? `, HTTP ${e.http}` : ""}); nothing was made and nothing ran.`;
}

const TRIAL = /^ducter-trial-\d{12}-[0-9a-f]{4}$/;
/** Whether an id is a trial's own (the only kind removeTrial touches). */
export const isTrialId = (id: string) => TRIAL.test(id);

/** `ducter-trial-<yyyymmddhhmm>-<4 hex>`, UTC. */
export function trialId(now = new Date(), hex = crypto.getRandomValues(new Uint8Array(2))): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  return `ducter-trial-${stamp}-${[...hex].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const ledgerFile = (dir: string, id: string) => join(dir, `trial-${id}.json`);
const keep = (dir: string, t: TrialIdentity) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(ledgerFile(dir, t.agentId), JSON.stringify(t, null, 2) + "\n");
};
const codeOf = (r: { j: any; out: string; err: string }) => String(r.j?.error_code ?? r.j?.upstream?.error_code ?? r.j?.error ?? (/"error(?:_code)?":\s*"([^"]+)"/.exec(r.err)?.[1] ?? ""));

/** The trial ledgers a run (or a crashed one) left in dir. */
export function trialLedgers(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^trial-ducter-trial-.*\.json$/.test(f)).map((f) => join(dir, f));
}

/**
 * Makes the run's own identity and its connection in the person's own place. Every step is in the
 * ledger before the next; on a refusal what was made so far is removed again.
 */
export async function createTrial(nm: Nm, spaceId: string, ledgerDir: string, say: (s: string) => void = () => {}, now = new Date()): Promise<{ ok: true; trial: TrialIdentity } | { ok: false; why: string }> {
  const id = trialId(now);
  // enrolled false until Mem says it made it: a failed enroll never deletes an identity of that name.
  const t: TrialIdentity = { agentId: id, context: id, spaceId, enrolled: false, at: now.toISOString() };
  keep(ledgerDir, t);
  const fail = async (why: string) => {
    say(`  ✗ ${why}`);
    const r = await removeTrial(nm, ledgerFile(ledgerDir, id), say);
    if (r.left.length) say(`  (left behind, removed by \`bun run bridge:live -- --cleanup\`: ${r.left.join(", ")})`);
    return { ok: false as const, why };
  };
  const e = await nm(["agents", "enroll", id, "--name", "Ducter trial", "--source-app", "ducter-trial"]);
  if (e.code !== 0) return fail(`enroll ${id}: exit ${e.code}${codeOf(e) ? `, ${codeOf(e)}` : ""}`);
  t.enrolled = true;
  keep(ledgerDir, t);
  say(`  ✓ the trial's own identity ${id} (removed after the run)`);
  const c = await nm(["bridge", "connections", "connect", "--space-id", spaceId, "--agent-id", id, "--context", id]);
  const conn = c.j?.connection;
  if (c.code !== 0 || conn?.agent_id !== id || conn?.state !== "active" || typeof conn?.connection_id !== "string") return fail(`connect ${id}: exit ${c.code}${codeOf(c) ? `, ${codeOf(c)}` : ""}`);
  t.connectionId = conn.connection_id;
  keep(ledgerDir, t);
  // Read-only: Mem lists exactly this one active connection for the trial's identity.
  const l = await nm(["bridge", "connections", "list", "--space-id", spaceId, "--agent-id", id]);
  const active = (Array.isArray(l.j?.connections) ? l.j.connections : []).filter((x: any) => x?.state === "active");
  if (l.code !== 0 || active.length !== 1 || active[0].connection_id !== t.connectionId) return fail(`Mem lists ${active.length} active connection(s) for ${id}, not exactly this run's one`);
  say(`  ✓ connected as ${id} in the person's own place, the only reader of its mailbox`);
  return { ok: true, trial: t };
}

/** Removes one trial (from its ledger): its connection, its local context, its identity. The ledger goes when all three are gone. */
export async function removeTrial(nm: Nm, ledger: string, say: (s: string) => void = () => {}): Promise<{ removed: string[]; left: string[] }> {
  let t: TrialIdentity;
  try {
    t = JSON.parse(readFileSync(ledger, "utf8"));
  } catch {
    return { removed: [], left: [ledger] };
  }
  if (!isTrialId(t.agentId) || t.context !== t.agentId) {
    say(`  ✗ ${ledger} names ${t.agentId}, which is not a trial's own identity: left untouched`);
    return { removed: [], left: [t.agentId] };
  }
  const removed: string[] = [];
  const left: string[] = [];
  if (t.connectionId) {
    const r = await nm(["bridge", "connections", "revoke", t.connectionId]);
    if ((r.code === 0 && r.j?.connection?.state === "revoked") || codeOf(r) === "cloud_bridge_setup_connection_revoked") removed.push(`connection ${t.connectionId}`);
    else left.push(`connection ${t.connectionId}`);
  }
  const shown = await nm(["agents", "context", "show", "--name", t.context]);
  if (shown.code === 0 && shown.j?.configured !== false && typeof shown.j?.revision === "string") {
    const cl = await nm(["agents", "context", "clear", "--name", t.context, "--expected-revision", shown.j.revision]);
    (cl.code === 0 ? removed : left).push(`context ${t.context}`);
  } else if (shown.code === 0 && shown.j?.configured !== false) left.push(`context ${t.context}`); // no revision to clear it by
  if (t.enrolled !== false) {
    const d = await nm(["agents", "delete", t.agentId, "--yes"]);
    if (d.code === 0 || /not_found/.test(codeOf(d))) removed.push(`identity ${t.agentId}`);
    else left.push(`identity ${t.agentId}`);
  }
  if (!left.length) rmSync(ledger, { force: true });
  say(`  ${left.length ? "✗" : "✓"} trial ${t.agentId} removed${removed.length ? `: ${removed.join(", ")}` : ""}${left.length ? `; left: ${left.join(", ")}` : ""}`);
  return { removed, left };
}
