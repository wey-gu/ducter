// D367: a mailbox longer than one inbox page. nmem 0.10.120 against Mem Cloud (VERIFIED in the
// 2026-11-18 live trial, research/137) answers `bridge inbox` 20 messages at a time, oldest first,
// opened ones included, with `next` a cursor for `--cursor`. Ducter read only the first page, so new
// mail behind 20 older messages was never seen. Fakes only (fake-bridge-nmem.ts pages like the real
// CLI): nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createNmemBridge, createPartner } from "../src/index.ts";
import { inboxNext, mergeInboxPages } from "../src/bridge.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-pages-test-"));

type M = { id: string; from: string; to: string; body: string; in_reply_to?: string; op?: string; created_at?: string; read_at?: string };
function world(old: number) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "../eval/fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "state.json");
  const log = join(dir, "argv.log");
  const ident = (agent: string) => ({ agent, member: "Weyl", member_id: "m-weyl", description: agent });
  const at = new Date().toISOString();
  // Older mail from days before, opened long ago: Mem still lists it, first.
  const messages: M[] = Array.from({ length: old }, (_, i) => ({ id: `old-${String(i).padStart(3, "0")}`, op: `op-old-${i}`, from: "terminal", to: "ducter", body: `older note ${i}`, created_at: at, read_at: at }));
  writeFileSync(state, JSON.stringify({ seq: 100, identities: { ducter: ident("ducter"), terminal: ident("Bridge agent") }, messages }));
  const env = (extra: Record<string, string> = {}) => ({ PATH: process.env.PATH ?? "", NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_VERSION: "0.10.120", NMEM_FAKE_ARGV_LOG: log, ...extra }) as Record<string, string>;
  const bridge = (extra: Record<string, string> = {}, inboxPages?: number) => createNmemBridge({ context: "ducter", bin, env: env(extra), retryDelaysMs: [0, 0], ...(inboxPages ? { inboxPages } : {}) });
  const add = (m: M) => {
    const s = JSON.parse(readFileSync(state, "utf8"));
    s.messages.push({ op: `op-${m.id}`, created_at: new Date().toISOString(), ...m });
    writeFileSync(state, JSON.stringify(s));
  };
  const calls = () => readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
  return { bin, env, bridge, add, calls, oldIds: messages.map((m) => m.id) };
}

describe("D367: the inbox's pages", () => {
  test("next is the cursor; an empty one or none is the last page", () => {
    expect(inboxNext({ messages: [], next: "abc" })).toBe("abc");
    expect(inboxNext({ messages: [], next: "" })).toBeUndefined();
    expect(inboxNext({ messages: [], next_cursor: "c2" })).toBe("c2");
    expect(inboxNext({ messages: [] })).toBeUndefined();
  });

  test("two pages merge: each message once, in order; the later page's read status wins", () => {
    const a = { messages: [{ message: "m1" }, { message: "m2" }], next: "x", outgoing: [{ message: "o1", status: "delivered" }] };
    const b = { messages: [{ message: "m2" }, { message: "m3" }], next: "", outgoing: [{ message: "o1", status: "read" }] };
    expect(mergeInboxPages(a, b)).toEqual({ messages: [{ message: "m1" }, { message: "m2" }, { message: "m3" }], next: "", outgoing: [{ message: "o1", status: "read" }] });
  });

  test("the fake pages like the real CLI: 20, oldest first, a fresh cursor each call", async () => {
    const w = world(25);
    const run = async (...a: string[]) => JSON.parse(await new Response(Bun.spawn([w.bin, "--json", "--agent-context", "ducter", "bridge", "inbox", ...a], { env: w.env(), stdout: "pipe" }).stdout).text());
    const p1 = await run();
    expect(p1.messages).toHaveLength(20);
    expect(p1.messages[0].message).toBe("old-000");
    expect(p1.next).toBeTruthy();
    const p2 = await run("--cursor", p1.next);
    expect(p2.messages.map((m: { message: string }) => m.message)).toEqual(["old-020", "old-021", "old-022", "old-023", "old-024"]);
    expect(p2.next).toBe("");
    expect((await run()).next).not.toBe(p1.next);
  });

  test("a new message behind 25 older ones is seen, and only it is opened", async () => {
    const w = world(25);
    w.add({ id: "new-1", from: "terminal", to: "ducter", body: "Done: the Linux runner test passes." });
    const r = await w.bridge().check(new Set(w.oldIds));
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "new-1", text: "Done: the Linux runner test passes." }] });
    const opens = w.calls().filter((a) => a.includes("open"));
    expect(opens.map((a) => a.at(-1))).toEqual(["new-1"]);
    expect(w.calls().some((a) => a.includes("--cursor"))).toBe(true);
  });

  test("the start mark covers every page, so older mail never wakes the partner", async () => {
    const w = world(25);
    expect(await w.bridge().inboxIds!()).toEqual({ ok: true, ids: w.oldIds });
  });

  test("an answer to ours, behind older mail, comes back linked to ours", async () => {
    const w = world(25);
    const b = w.bridge();
    const sent = await b.send!("ct-terminal", "Where is the bridge work at? A PR tonight?");
    expect(sent).toMatchObject({ ok: true });
    const asked = (sent as { messageId: string }).messageId;
    w.add({ id: "ans-1", from: "terminal", to: "ducter", body: "contacts and send are in; PR around 22:00.", in_reply_to: asked });
    const r = await b.check(new Set(w.oldIds));
    expect(r).toMatchObject({ ok: true, messages: [{ messageId: "ans-1", inReplyTo: asked }] });
  });

  test("pages are bounded", async () => {
    const w = world(65);
    w.add({ id: "new-1", from: "terminal", to: "ducter", body: "past the bound" });
    const r = await w.bridge({}, 2).check(new Set(w.oldIds));
    expect(r).toEqual({ ok: true, messages: [], reads: {} });
    expect(w.calls().filter((a) => a.includes("inbox") && !a.includes("--help"))).toHaveLength(2);
  });

  test("a long-poll's first page is followed to the last, where the new mail is", async () => {
    const w = world(25);
    w.add({ id: "new-1", from: "terminal", to: "ducter", body: "fresh" });
    const r = await w.bridge({ NMEM_FAKE_INBOX_WAIT: "1" }).waitInbox!(1);
    expect(r).toMatchObject({ ok: true });
    expect((r as { ids: string[] }).ids).toContain("new-1");
  });

  test("the partner: older mail is marked at the start, the new message behind it wakes one turn", async () => {
    const w = world(25);
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    const inputs: string[] = [];
    const fr = fakeRunner((input, s) => {
      inputs.push(input);
      s.end();
    });
    fr.bindCards(fc.cards);
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge: w.bridge(), bridgeIntervalMs: 0, bridgeRecoverMs: 0 });
    expect(await partner.checkBridge()).toBe(0); // the start mark: 25 older messages, none opened
    w.add({ id: "new-1", from: "terminal", to: "ducter", body: "Should I push fix-linux-ci now, or wait for macOS?" });
    expect(await partner.checkBridge()).toBe(1);
    await partner.idle();
    const inbound = fc.events.filter((e) => e.kind === "bridge_msg" && (e.body as Bodies["bridge_msg"]).direction === "in");
    expect(inbound.map((e) => (e.body as Bodies["bridge_msg"]).messageId)).toEqual(["new-1"]);
    expect(inputs.some((t) => t.includes("Should I push fix-linux-ci now"))).toBe(true);
    await partner.close();
  }, 30_000);
});
