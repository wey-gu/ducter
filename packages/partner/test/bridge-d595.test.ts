// D595: what Mem shipped for nowledge-co/mem#11262 in nmem 0.10.124, read the way Mem says it is
// (shapes VERIFIED read-only on 2026-11-26; ids and bodies made up; nothing here reaches Mem):
//   - a receipt's fields sit at the top of an outbox op and of inspect, its counts integers; the
//     nested `read_receipt` is an older nmem's, read only as a fallback;
//   - the inbox's `spaces[].outgoing` counts readers as an integer; "unread" is never a read;
//   - `open` returns the same scoped reply argv as the inbox entry (#11277 via #11288): the opened
//     message's own is taken first, the entry's when an older nmem's open has none.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNmemBridge, outgoingReads, receiptOf } from "../src/bridge.ts";

const AT_US = Date.parse("2026-11-26T02:00:00Z") * 1000;

describe("D595: read receipts as Mem's contract says (nmem 0.10.124)", () => {
  test("an outbox op's top-level fields", () => {
    // The 0.10.124 outbox row as seen live (field names and types; values made up).
    const op = { operation: "bo1:a", phase: "settled", delivery_state: "delivered", status: "read", message: "m-1", reply_to: "m-1", body_sha256: "x", receipt_available: true, read_state: "read", read_recipients: 1, recipients: 1, receipt_observed_at_us: AT_US };
    expect(receiptOf(op)).toEqual({ state: "read", count: 1, at: Math.floor(AT_US / 1000) });
    expect(receiptOf({ ...op, read_state: "partially_read", read_recipients: 1, recipients: 3 })).toEqual({ state: "partly", count: 1, at: Math.floor(AT_US / 1000) });
    expect(receiptOf({ ...op, read_state: "unread", read_recipients: 0 })).toEqual({ state: "unread", count: 0, at: Math.floor(AT_US / 1000) });
  });

  test("no receipt: unknown, never a zero", () => {
    expect(receiptOf({ operation: "bo1:b", receipt_available: false, read_state: "unknown" })).toBeUndefined();
    // The top level says there is none: an inner guess never overrides it.
    expect(receiptOf({ receipt_available: false, read_state: "unknown", read_receipt: { receipt_available: true, read_state: "read", read_recipients: 1 } })).toBeUndefined();
  });

  test("an older nmem's nested shape still reads", () => {
    expect(receiptOf({ read_receipt: { receipt_available: true, read_state: "read", read_recipients: 2 } })).toEqual({ state: "read", count: 2 });
  });

  test("the inbox's outgoing snapshot: the integer first, words whole", () => {
    const j = {
      spaces: [
        { status: "observed", outgoing: [{ message: "a", status: "read", read_recipients: 1, recipients: 1 }, { message: "b", status: "delivered", read_recipients: 0, recipients: 1 }] },
        { status: "observed", outgoing: [{ message: "c", status: "unread" }, { message: "d", status: "partially_read" }, { message: "e", status: "read", read_recipients: 0 }] },
      ],
    };
    // e: the count says no one opened it, whatever the word.
    expect(outgoingReads(j)).toEqual({ a: true, b: false, c: false, d: true, e: false });
  });
});

/** A stub nmem: one identity-inbox entry with Mem's argv; `open` with or without its own reply argv. */
function stub(openHasReply: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "ducter-bridge-d595-"));
  const argv = (verb: string, ctx: string) => ["nmem", "--api-url=https://cloud.example/remote-api", `--agent-context=${ctx}`, "bridge", verb, "bm1:ref"];
  const entry = { message: "m-1", reference: "bm1:ref", space_id: "all", state: "pending", eligible: true, mine: true, read: false, in_reply_to: null, created_at_us: AT_US, open_args: argv("open", "ducter"), reply_args_prefix: argv("reply", "ducter-listed"), sender: { actor_id: "a", member: "Member m", agent: "Wey Codex Bridge", agent_id: "wey-codex-bridge" } };
  const opened = { message: "m-1", body: "Could you check the release notes?", reply_to: "m-1", in_reply_to: null, sender: entry.sender, space_id: "all", created_at_us: AT_US, outgoing: [], ...(openHasReply ? { reply_args_prefix: argv("reply", "ducter-opened") } : {}) };
  const data = join(dir, "data.json");
  writeFileSync(data, JSON.stringify({ inbox: { identity: "ducter", spaces: [{ space_id: "all", status: "observed", next_cursor: null, outgoing: [] }], messages: [entry], next: null }, opened }));
  const bin = join(dir, "nmem");
  writeFileSync(
    bin,
    `#!/usr/bin/env bun
const d = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(data)}, "utf8"));
const a = process.argv.slice(2);
if (a.includes("--version")) { console.log("nmem 0.10.124"); process.exit(0); }
if (a.includes("--help")) { console.log("List incoming identity mail across currently authorized Spaces\\n  --wait <WAIT>  Wait up to five seconds"); process.exit(0); }
const v = a.indexOf("bridge");
const verb = v >= 0 ? a.slice(v + 1).find((x) => !x.startsWith("-")) : undefined;
if (verb === "inbox") { console.log(JSON.stringify(d.inbox)); process.exit(0); }
if (verb === "open") { console.log(JSON.stringify(d.opened)); process.exit(0); }
console.log("{}");
`,
  );
  chmodSync(bin, 0o755);
  return createNmemBridge({ context: "ducter", places: [{ context: "ducter", spaceId: "personal-m", spaceLabel: "Only me", kind: "personal" }], bin, me: "m", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" }, retryDelaysMs: [] });
}

describe("D595: a reply goes Mem's way from the opened message (nmem 0.10.124)", () => {
  test("open's own reply argv is the route", async () => {
    const r = await stub(true).check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.messages[0]?.route).toContain("--agent-context=ducter-opened");
  }, 20_000);

  test("an older nmem's open without one: the entry's", async () => {
    const r = await stub(false).check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.messages[0]?.route).toContain("--agent-context=ducter-listed");
  }, 20_000);
});
