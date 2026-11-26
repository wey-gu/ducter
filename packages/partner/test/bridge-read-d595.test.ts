// D-PENDING: a sent message's read state, read on the inbox check Ducter already runs and logged as
// one `bridge_read` per change, never once per check. No receipt is unknown: nothing is logged, and
// no count is invented. Fakes only; nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { createPartner, type BridgeClient, type OpRead } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-read-test-"));

function setup() {
  const ctl: { receipts?: Record<string, OpRead> } = {};
  const bridge: BridgeClient = {
    async check() {
      return { ok: true, messages: [], ...(ctl.receipts ? { receipts: ctl.receipts } : {}) };
    },
  };
  const clock = new FakeClock();
  const fc = fakeCore(clock, tmp());
  const partner = createPartner(fc.core, fakeRunner(async (_i, s) => s.end()).runner, {
    now: clock.now,
    persistState: false,
    settleMs: 0,
    onError: (e: unknown) => console.error(e),
    memory: fakeMemory([]).memory,
    bridge,
    bridgeIntervalMs: 0,
    bridgeRecoverMs: 0,
  });
  const sent = (messageId: string, opId: string) =>
    fc.core.log.append({
      stream: "channel",
      origin: "partner",
      kind: "bridge_msg",
      body: { direction: "out", messageId, opId, to: "Codex", text: "look at this", state: "sent" },
    });
  const reads = () => fc.events.filter((e) => e.kind === "bridge_read").map((e) => (e as LogEvent<"bridge_read">).body);
  return { ctl, fc, partner, sent, reads };
}

describe("D-PENDING: a sent message's receipt, on the check that is already running", () => {
  test("delivered, then read: one quiet event per change, never a duplicate", async () => {
    const { ctl, partner, sent, reads } = setup();
    sent("m-1", "bo1");
    ctl.receipts = { "m-1": { state: "unread", count: 0, total: 1 } };
    await partner.checkBridge();
    expect(reads()).toEqual([{ opId: "bo1", messageId: "m-1", receipt: { state: "unread", count: 0, total: 1 } }]);
    await partner.checkBridge();
    expect(reads()).toHaveLength(1);
    ctl.receipts = { "m-1": { state: "read", count: 1, total: 1 } };
    await partner.checkBridge();
    expect(reads()).toEqual([
      { opId: "bo1", messageId: "m-1", receipt: { state: "unread", count: 0, total: 1 } },
      { opId: "bo1", messageId: "m-1", receipt: { state: "read", count: 1, total: 1 } },
    ]);
  });

  test("several readers keep both counts; a message Mem says nothing about logs nothing", async () => {
    const { ctl, partner, sent, reads } = setup();
    sent("m-2", "bo2");
    sent("m-3", "bo3");
    ctl.receipts = { "m-2": { state: "partly", count: 2, total: 5 }, "m-nobody-knows": { state: "read", count: 1 } };
    await partner.checkBridge();
    expect(reads()).toEqual([{ opId: "bo2", messageId: "m-2", receipt: { state: "partly", count: 2, total: 5 } }]);
    ctl.receipts = {};
    await partner.checkBridge();
    expect(reads()).toHaveLength(1);
  });

  test("a receipt for a message this window never sent (a helper's own, or an old one) changes nothing", async () => {
    const { ctl, partner, reads } = setup();
    ctl.receipts = { "m-elsewhere": { state: "read", count: 1, total: 1 } };
    await partner.checkBridge();
    expect(reads()).toEqual([]);
  });
});
