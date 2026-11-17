// D324: the live trial's own throwaway identity, over the FAKE nmem: made for the run (a ledger
// first), the only reader of its mailbox, and removed after; never the person's live `ducter`.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTrial, isTrialId, removeTrial, trialId, trialLedgers, type Nm } from "../eval/bridge-trial.ts";

setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function rig(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ducter-trial-test-"));
  dirs.push(dir);
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  // The person's live partner is already connected: the trial must never touch it.
  writeFileSync(state, JSON.stringify({ identities: { ducter: { agent: "ducter", member: "Weyl", member_id: "member-weyl", description: "" } }, messages: [], seq: 0, connections: [{ connection_id: "live", agent_id: "ducter", identity_birth: "b", client_label: "ducter-on-hel-1a2b3c", state: "active", space_id: "fake-space" }] }));
  const argv = join(dir, "argv.log");
  const env = { PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argv, ...extra };
  const nm: Nm = async (args) => {
    const p = Bun.spawn([bin, "--json", ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    const code = await p.exited;
    let j: any;
    try {
      j = JSON.parse(out);
    } catch {
      /* not JSON */
    }
    return { code, out, err, j };
  };
  const st = () => JSON.parse(readFileSync(state, "utf8"));
  const calls = (): string[][] => (existsSync(argv) ? readFileSync(argv, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { dir, nm, st, calls, ledgers: join(dir, "evidence") };
}

describe("D324: the trial's own identity", () => {
  test("its id: a trial's shape, never the live one's", () => {
    const id = trialId(new Date(Date.UTC(2026, 10, 17, 9, 5)), new Uint8Array([0xab, 0x01]));
    expect(id).toBe("ducter-trial-202611170905-ab01");
    expect(isTrialId(id)).toBe(true);
    for (const live of ["ducter", "ducter-work", "ducter-trial", "ducter-trial-x"]) expect(isTrialId(live)).toBe(false);
  });

  test("made for the run, the only reader of its mailbox, then removed; the live connection untouched", async () => {
    const r = rig();
    const lines: string[] = [];
    const made = await createTrial(r.nm, "fake-space", r.ledgers, (s) => lines.push(s));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const t = made.trial;
    expect(isTrialId(t.agentId)).toBe(true);
    expect(r.st().agents[t.agentId]).toMatchObject({ name: "Ducter trial", source_app: "ducter-trial" });
    expect(r.st().connections.find((c: any) => c.agent_id === t.agentId)).toMatchObject({ state: "active", client_label: t.agentId });
    expect(trialLedgers(r.ledgers).length).toBe(1);

    const gone = await removeTrial(r.nm, trialLedgers(r.ledgers)[0]!, (s) => lines.push(s));
    expect(gone.left).toEqual([]);
    expect(r.st().agents[t.agentId]).toBeUndefined();
    expect(r.st().identities[t.agentId]).toBeUndefined();
    expect(r.st().connections.find((c: any) => c.agent_id === t.agentId).state).toBe("revoked");
    expect(trialLedgers(r.ledgers)).toEqual([]);
    // The person's live partner: never named in any call, its connection as it was.
    expect(r.calls().some((c) => c.includes("ducter") || c.includes("live"))).toBe(false);
    expect(r.st().connections.find((c: any) => c.connection_id === "live").state).toBe("active");
  });

  test("a ledger that names the live identity is refused, untouched", async () => {
    const r = rig();
    const f = join(r.dir, "trial-ducter-trial-forged.json");
    writeFileSync(f, JSON.stringify({ agentId: "ducter", context: "ducter", spaceId: "fake-space", enrolled: true, connectionId: "live", at: "" }));
    const res = await removeTrial(r.nm, f);
    expect(res.left).toEqual(["ducter"]);
    expect(r.calls()).toEqual([]);
    expect(existsSync(f)).toBe(true);
  });

  test("Mem refuses the connection: what was made is removed again, and nothing is left", async () => {
    const r = rig({ NMEM_FAKE_REFUSE: "cloud_bridge_setup_role_custody_birth_missing" });
    const made = await createTrial(r.nm, "fake-space", r.ledgers);
    expect(made.ok).toBe(false);
    expect(Object.keys(r.st().agents ?? {})).toEqual([]);
    expect(trialLedgers(r.ledgers)).toEqual([]);
  });
});
