// D555 (research/226): nmem 0.10.123 shows a read receipt on `bridge outbox` and `inspect` "where the
// server provides read receipts". Its JSON place is INFERRED from the binary (`read_receipt` with
// `receipt_available`, `read_state`, `read_recipients`, `receipt_observed_at_us`), so Ducter reads one
// only when Mem says a receipt is available: a shape that differs reads as nothing, never as "read".
// A stub nmem answers outbox in that shape; nothing reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNmemBridge } from "../src/index.ts";
import { opOf, receiptOf } from "../src/bridge.ts";

describe("a sent message's read receipt (nmem 0.10.123)", () => {
  test("read only where Mem says one is available", () => {
    expect(receiptOf({ read_receipt: { receipt_available: true, read_state: "read", read_recipients: 1, receipt_observed_at_us: 1_764_000_000_000_000 } })).toEqual({ state: "read", count: 1, at: 1_764_000_000_000 });
    expect(receiptOf({ read_receipt: { receipt_available: true, read_state: "unread", read_recipients: 0 } })).toEqual({ state: "unread", count: 0 });
    expect(receiptOf({ read_receipt: { receipt_available: true, read_state: "partially_read", read_recipients: ["m1"] } })).toEqual({ state: "partly", count: 1 });
    // A count alone says it.
    expect(receiptOf({ receipt_available: true, read_recipients: 2 })).toEqual({ state: "read", count: 2 });
    // "Read receipt: unknown": nothing is said.
    expect(receiptOf({ read_receipt: { receipt_available: false, read_state: "not_observed" } })).toBeUndefined();
    expect(receiptOf({ read_receipt: { read_state: "read" } })).toBeUndefined();
    expect(receiptOf({ receipt_available: true, read_state: "not_observed" })).toBeUndefined();
    // nmem 0.10.121's bare outbox entry (VERIFIED on hel): no receipt, as before.
    expect(opOf({ operation: "bo1:a", phase: "settled" })).toEqual({ operation: "bo1:a", state: "unknown", bare: true });
  });

  test("an outbox op carries it, beside what it already said", () => {
    expect(opOf({ operation: "bo1:b", phase: "delivered", message: "bm1:x", read_receipt: { receipt_available: true, read_state: "read", read_recipients: 1 } })).toEqual({ operation: "bo1:b", state: "sent", messageId: "bm1:x", read: { state: "read", count: 1 } });
  });

  test("the client's outbox keeps it (a stub nmem answering in that shape)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "d555-"));
    const bin = join(dir, "nmem");
    const ops = { operations: [{ operation: "bo1:c", phase: "delivered", message: "bm1:y", read_receipt: { receipt_available: true, read_state: "read", read_recipients: 1 } }, { operation: "bo1:d", phase: "delivered", message: "bm1:z", read_receipt: { receipt_available: false } }] };
    writeFileSync(bin, `#!/bin/sh\ncat >/dev/null 2>&1\ncase "$*" in\n  *" outbox"*) echo '${JSON.stringify(ops)}' ;;\n  *) echo '{}' ;;\nesac\n`);
    chmodSync(bin, 0o755);
    const r = await createNmemBridge({ context: "ducter", bin, env: {} }).outbox!();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ops.map((o) => [o.operation, o.read?.state ?? ""])).toEqual([
      ["bo1:c", "read"],
      ["bo1:d", ""],
    ]);
  });
});
