// D371: what the second live trial on nmem 0.10.120 (2026-11-18 14:41 UTC, research/139) showed.
// (1) The trial's peer guard refused a right send: the peer used the card's own `send_args_prefix`
// (`--agent-context=<ctx>`, `--to=bc1:…`), the guard asked contacts with no context, and Mem answered
// "choose a Space". (2) Mem answered the peer's own mailbox 409 `cloud_mailbox_own_source_unreconciled`
// (not retryable). The shapes below are the real ones from that run's raw calls, ids shortened.
// Stubs and fakes only: nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNmemBridge, createPartner } from "../src/index.ts";
import { peerInboxBlocked } from "../eval/bridge-trial.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-stuck-test-"));
const GUARD = resolve(import.meta.dir, "../eval/bridge-peer-guard.ts");
const TRIAL = "ducter-trial-202611181441-4af9";
const PEER = "bridge-a2f13672-c770-4ecd-8561-b3e21bc12143";
const CARD = "bc1:eyJzY29wZSI6eyJzcGFjZV9pZCI6InBlcnNvbmFsLW0tMSJ9LCJzZWxlY3Rpb24iOnsicmVjaXBpZW50X2hhbmRsZSI6InIxOnRyaWFsIn19";
// `bridge contacts --query <trial>` as the peer's context (raw 008): one card, Mem's own send prefix.
const CONTACTS = JSON.stringify({
  contacts: [
    {
      contact: CARD,
      member: "Member m-1",
      agent: "Ducter trial",
      agent_id: TRIAL,
      description: "",
      mailbox_available: true,
      send_args_prefix: ["nmem", "--api-url=https://cloud.nowledge.co/remote-api", `--agent-context=${PEER}`, "bridge", "--resolved-space-id=personal-m-1", "send", `--to=${CARD}`],
    },
  ],
});
// The same with no context (raw 012): Mem asks which Space, and lists no card.
const NO_SPACE = JSON.stringify({ state: "selection_needed", detail: "Bridge talks inside one Space. Choose it; nothing was sent and no Space was chosen for you.", candidates: [{ id: "personal-m-1", label: "Only me", kind: "personal" }] });
// Mem's side for a moment (raw 010).
const BUSY = JSON.stringify({ stage: "upstream", upstream: { error_code: "feature_policy_unavailable", detail: "Feature policy is unavailable", retryable: true, outcome_unknown: true, http_status: 503 }, operation: null });
// The peer's inbox (raw 014): Mem's own state, not retryable.
const STUCK = JSON.stringify({ stage: "upstream", upstream: { error_code: "cloud_mailbox_own_source_unreconciled", detail: "Mailbox source authority requires reconciliation before browsing.", retryable: false, outcome_unknown: true, request_id: "r-1", http_status: 409 }, operation: null, detail: "The IM operation could not be confirmed. Check the input or reported cause." });

/** A stand-in for the real CLI: answers by verb, counts calls, and remembers every argv. */
function realStub(opts: { busyFirst?: number } = {}) {
  const dir = tmp();
  const log = join(dir, "calls.log");
  const bin = join(dir, "nmem");
  writeFileSync(join(dir, "contacts.json"), CONTACTS);
  writeFileSync(join(dir, "nospace.json"), NO_SPACE);
  writeFileSync(join(dir, "busy.json"), BUSY);
  writeFileSync(
    bin,
    `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
case "$*" in
  *"bridge contacts"*)
    n=$(grep -c "bridge contacts" "${log}")
    if [ "$n" -le ${opts.busyFirst ?? 0} ]; then cat "${dir}/busy.json"; exit 1; fi
    case "$*" in *"--agent-context ${PEER}"*) cat "${dir}/contacts.json" ;; *) cat "${dir}/nospace.json" ;; esac ;;
  *" send "*) echo '{"message":"m-sent","status":"delivered","operation":"bo1:x"}' ;;
  *) echo '{}' ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
  const guard = (args: string[]) => {
    const p = Bun.spawnSync(["bun", GUARD, ...args], { env: { PATH: process.env.PATH ?? "", BRIDGE_GUARD_REAL: bin, BRIDGE_GUARD_TO: TRIAL, BRIDGE_GUARD_ALLOW: join(dir, "allow.txt"), BRIDGE_GUARD_LOG: join(dir, "guard.log") } });
    return { code: p.exitCode, out: p.stdout.toString() };
  };
  return { calls, guard };
}
// The peer's send as it really ran: the card's own send_args_prefix, `=` forms throughout.
const sendAs = (to: string) => ["--json", "--api-url=https://cloud.nowledge.co/remote-api", `--agent-context=${PEER}`, "bridge", "--resolved-space-id=personal-m-1", "send", `--to=${to}`, "--body", "Task: fix the Linux runner test"];

describe("D371: the trial's peer guard and the card's own send prefix", () => {
  test("a send to the one card contacts gave passes, asked as the peer's own context", () => {
    const s = realStub();
    const r = s.guard(sendAs(CARD));
    expect(r.code).toBe(0);
    expect(r.out).toContain("m-sent");
    const contacts = s.calls().filter((c) => c.includes("bridge contacts"));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toContain(`--agent-context ${PEER}`);
  });

  test("the `--flag value` form passes too", () => {
    const s = realStub();
    expect(s.guard(["--json", "--agent-context", PEER, "bridge", "send", "--to", CARD, "--body", "hi"]).code).toBe(0);
  });

  test("any other card is refused, and nothing is sent", () => {
    const s = realStub();
    const r = s.guard(sendAs("bc1:someone-else"));
    expect(r.code).toBe(1);
    expect(r.out).toContain("trial_guard_refused");
    expect(s.calls().some((c) => c.includes(" send "))).toBe(false);
  });

  test("Mem busy for a moment on contacts: asked again, and the right send goes", () => {
    const s = realStub({ busyFirst: 1 });
    expect(s.guard(sendAs(CARD)).code).toBe(0);
    expect(s.calls().filter((c) => c.includes("bridge contacts"))).toHaveLength(2);
  });
});

describe("D371: a mailbox Mem must sort out on its side", () => {
  test("the trial's preflight says so in one line, naming Mem's code", () => {
    const line = peerInboxBlocked({ code: 1, out: STUCK, err: "" });
    expect(line).toContain("cloud_mailbox_own_source_unreconciled");
    expect(line).toContain("HTTP 409");
    expect(line).toContain("nothing was made");
    expect(peerInboxBlocked({ code: 0, out: JSON.stringify({ messages: [], next: "" }), err: "" })).toBeUndefined();
  });

  function stuckInbox() {
    const dir = tmp();
    const flag = join(dir, "fixed");
    const log = join(dir, "calls.log");
    writeFileSync(join(dir, "stuck.json"), STUCK);
    const bin = join(dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in\n  *"agents context show"*) echo '{}' ;;\n  *"bridge inbox"*) if [ -f "${flag}" ]; then echo '{"messages":[],"next":"","outgoing":[]}'; else cat "${dir}/stuck.json"; exit 1; fi ;;\n  *) echo '{}' ;;\nesac\n`);
    chmodSync(bin, 0o755);
    const inboxCalls = () => readFileSync(log, "utf8").split("\n").filter((l) => l.includes("bridge inbox")).length;
    return { bin, fix: () => writeFileSync(flag, "1"), inboxCalls };
  }

  test("Ducter's read: stuck with Mem's code, never retried, never 'didn't say whether it went out'", async () => {
    const w = stuckInbox();
    const r = await createNmemBridge({ context: "ducter", bin: w.bin, env: {}, retryDelaysMs: [0, 0] }).check(new Set());
    expect(r).toMatchObject({ ok: false, reason: "refused", stuck: true, code: "cloud_mailbox_own_source_unreconciled" });
    expect((r as { message: string }).message).not.toMatch(/went out/);
    expect(w.inboxCalls()).toBe(1);
  });

  test("the partner tells Settings once, and clears it when a read works again", async () => {
    const w = stuckInbox();
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    const said: ({ code: string } | undefined)[] = [];
    (fc.core as { settings?: unknown }).settings = { get: () => ({}), setForgetter() {}, setMemState() {}, setBridgeTrouble: (t: { code: string } | undefined) => said.push(t) };
    const fr = fakeRunner((_i, s) => s.end());
    fr.bindCards(fc.cards);
    const bridge = createNmemBridge({ context: "ducter", bin: w.bin, env: {}, retryDelaysMs: [0, 0] });
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: () => {}, memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0, bridgeStartMark: false });
    await partner.checkBridge();
    await partner.checkBridge();
    expect(said).toEqual([{ code: "cloud_mailbox_own_source_unreconciled" }]);
    w.fix();
    await partner.checkBridge();
    expect(said).toEqual([{ code: "cloud_mailbox_own_source_unreconciled" }, undefined]);
    await partner.close();
  }, 30_000);
});
