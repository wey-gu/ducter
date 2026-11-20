// D300: 替你做过的 / Done for you. The record read from the Log and Autofill's uses: each kind of
// outward action, who asked, the Go, where, Undo only where it exists, reads as counts, nothing
// that didn't go out; over the home's socket and from the partner's did_list tool.
import { afterEach, expect, test } from "bun:test";
import type { DidItem, ServerFrame } from "@ducter/protocol";
import { realClock } from "../src/clock.ts";
import { startCore } from "../src/core.ts";
import { createDid, rangeOf, writeKind } from "../src/did.ts";
import { tempDir } from "./helpers.ts";
import { seedDidDay } from "./did-day.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

// A fixed afternoon, so "today" holds the whole seeded day whatever time the test runs.
const NOW = (() => {
  const d = new Date();
  d.setHours(17, 30, 0, 0);
  return d.getTime();
})();

function boot() {
  const t = tempDir();
  let skew = 0;
  const clock = { ...realClock, now: () => NOW + skew };
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, clock });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  seedDidDay(core, { zh: false, setSkew: (ms) => (skew = ms), yesterday: true, now: NOW });
  const did = createDid({ log: core.log, tasks: core.tasks, uses: () => core.autofill.store.view().uses, deviceName: (d) => (d === "local" ? "Wey's MacBook Pro" : d), now: () => NOW });
  return { core, did };
}

const today = () => rangeOf("today", NOW);
const by = (items: DidItem[], kind: string, sub?: string) => items.filter((i) => i.kind === kind && (!sub || i.sub === sub));

test("a seeded day: every kind, newest first, with who asked, the Go and where", () => {
  const { did } = boot();
  const r = did.query(today());
  const times = r.items.map((i) => Date.parse(i.at));
  expect([...times].sort((a, b) => b - a)).toEqual(times);

  const mail = by(r.items, "sent", "mail")[0]!;
  expect(mail).toMatchObject({ to: "zhang.wei@hawdb.io", via: "Gmail", who: { by: "task", title: "Prepare the Q4 budget" }, go: { by: "you" }, where: { kind: "home", name: "Gmail" } });
  expect(mail.line).toBe("Q4 budget draft, sheet attached");

  const pay = by(r.items, "paid", "card")[0]!;
  expect(pay).toMatchObject({ to: "hotelokura.co.jp", amount: "USD 312.00", via: "Visa ••4242", go: { by: "you" }, where: { kind: "browser", name: "Wey's MacBook Pro" }, taskId: "t_hotel" });

  const call = by(r.items, "called")[0]!;
  expect(call).toMatchObject({ to: "Sushi Saito", where: { kind: "line", name: "Tuwa" }, go: { by: "you" } });
  expect(call.unsure).toBeUndefined();

  // A sign-in first OK'd on the site is Go'd by you; one allowed there before says so.
  const fills = by(r.items, "filled", "signin");
  expect(fills.find((f) => f.to === "hotelokura.co.jp")?.go?.by).toBe("you");
  expect(fills.find((f) => f.to === "github.com")?.go?.by).toBe("before");

  const cal = r.items.find((i) => i.sub === "calendar")!;
  expect(cal).toMatchObject({ kind: "changed", cal: "create", line: "Dentist", to: "Personal", link: "https://calendar.google.com/calendar/event?eid=demo", who: { by: "you" } });

  const merge = by(r.items, "changed", "merge")[0]!;
  expect(merge).toMatchObject({ to: "ducter/fix-flaky-ci", who: { by: "you", taskId: "t_ci" }, go: { by: "you" } });

  // The folder task's files, with Undo while its copy is kept.
  const files = by(r.items, "changed", "files")[0]!;
  expect(files.count).toBe(14);
  expect(files.files).toEqual({ added: 2, changed: 9, removed: 3 });
  expect(files.undo?.taskId).toBe("t_invoices");

  // The Bridge message counts once (sending, then sent), as sent to your Claude Code.
  expect(by(r.items, "sent", "agent")).toHaveLength(1);

  // Reads are one row per account and task with a count, never what was read.
  const reads = by(r.items, "read");
  expect(reads.map((x) => [x.via, x.count, x.who.by]).sort()).toEqual([
    ["Gmail", 23, "routine"],
    ["Google Calendar", 4, "you"],
  ]);
  expect(reads.find((x) => x.via === "Gmail")!.who.routine).toBe("Morning inbox");
  for (const x of reads) expect(x.line).toBeUndefined();

  // Only Undo where one truly exists.
  expect(r.items.filter((i) => i.undo).map((i) => i.sub)).toEqual(["files"]);
  expect(r.counts).toMatchObject({ sent: 2, paid: 1, called: 1, filled: 2, changed: 3, read: 2 });
  expect(r.counts.deleted).toBeUndefined();
});

test("yesterday: a phone tap, a Mac click, a deleted page and an unanswered call from the person's own number", () => {
  const { did } = boot();
  const r = did.query(rangeOf("yesterday", NOW));
  const mom = r.items.find((i) => i.taskId === "t_mom")!;
  expect(mom).toMatchObject({ kind: "sent", sub: "message", via: "Messages", where: { kind: "ducter_phone" }, line: "To Mom: see you Saturday" });
  const mac = r.items.find((i) => i.taskId === "t_mail_mac")!;
  expect(mac).toMatchObject({ kind: "sent", sub: "message", via: "Mail", where: { kind: "computer", name: "Wey's MacBook Pro" } });
  expect(r.items.find((i) => i.kind === "deleted")).toMatchObject({ sub: "item", via: "Notion", line: "Old roadmap draft" });
  expect(r.items.find((i) => i.kind === "called")).toMatchObject({ to: "Bright Smile Dental", unsure: "no_answer", where: { kind: "own_number" } });
  // Nothing from today leaks into yesterday.
  expect(r.items.some((i) => i.taskId === "t_hotel")).toBe(false);
});

test("filters by kind and words; counts stay the range's", () => {
  const { did } = boot();
  const paid = did.query({ ...today(), kinds: ["paid"] });
  expect(paid.items.map((i) => i.kind)).toEqual(["paid"]);
  expect(paid.counts.sent).toBe(2);
  expect(did.query({ ...today(), q: "okura" }).items.map((i) => i.sub).sort()).toEqual(["card", "signin"]);
  expect(did.query({ ...today(), q: "morning inbox" }).items.map((i) => i.via)).toEqual(["Gmail"]);
  expect(did.query({ ...today(), q: "nothing like this" }).items).toEqual([]);
});

test("what didn't go out isn't there: a held card, a failed write, a refused send, a call sheet", () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  const log = core.log;
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d1", question: "Pay?", goLabel: "Pay", defaultOption: "hold", reversible: false, pay: { site: "x.com", amount: "9", currency: "USD", handle: "card:a", card: "Visa ••1111", last4: "1111", needsCvc: false, firstHere: true } } });
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "hold", by: "user" } });
  log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: "c1", connectionId: "g", connection: "Gmail", action: "gmail.send_message", op: "write", state: "failed" } });
  log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: "c2", connectionId: "g", connection: "Gmail", action: "gmail.send_message", op: "write", state: "needs_go", decisionId: "d2" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m", text: "hi", state: "held", opId: "o1", to: "x" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "in", messageId: "m2", text: "hello", from: "x" } });
  const did = createDid({ log, tasks: core.tasks, uses: () => [{ at: new Date().toISOString(), handle: "key:OPENAI", label: "OpenAI", site: "", what: "refused" }] });
  expect(did.query({}).items).toEqual([]);
  expect(did.query({}).counts).toEqual({});
});

test("a Bridge send whose answer never came is listed, not confirmed", () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  for (const state of ["sending", "unknown"] as const) core.log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m", text: "the numbers", state, opId: "o1", to: "Alex" } });
  const [it] = createDid({ log: core.log, tasks: core.tasks }).query({}).items;
  expect(it).toMatchObject({ kind: "sent", sub: "agent", to: "Alex", unsure: "unconfirmed" });
});

test("writes are named by their action, never their content", () => {
  expect(writeKind("gmail.send_message", "Gmail")).toEqual({ kind: "sent", sub: "mail" });
  expect(writeKind("slack.chat_post_message", "Slack")).toEqual({ kind: "sent", sub: "message" });
  expect(writeKind("notion.delete_page", "Notion")).toEqual({ kind: "deleted", sub: "item" });
  expect(writeKind("gmail.trash_thread", "Gmail")).toEqual({ kind: "deleted", sub: "item" });
  expect(writeKind("notion.update_page", "Notion")).toEqual({ kind: "changed", sub: "write" });
});

test("over the socket: did answers with did_result, the id echoed", async () => {
  const { core } = boot();
  const ws = new WebSocket(core.url);
  const got: ServerFrame[] = [];
  ws.onmessage = (m) => got.push(JSON.parse(String(m.data)));
  await new Promise<void>((res) => (ws.onopen = () => res()));
  ws.send(JSON.stringify({ t: "hello", client: "cli" }));
  ws.send(JSON.stringify({ t: "did", id: "q1", query: { ...today(), kinds: ["called"] } }));
  for (let i = 0; i < 50 && !got.some((f) => f.t === "did_result"); i++) await Bun.sleep(20);
  ws.close();
  const r = got.find((f) => f.t === "did_result") as Extract<ServerFrame, { t: "did_result" }>;
  expect(r.id).toBe("q1");
  expect(r.items.map((i) => i.to)).toEqual(["Sushi Saito"]);
  expect(r.counts.paid).toBe(1);
});

test("the partner's did_list: today's items in short form, and an empty day said plainly", async () => {
  const { core } = boot();
  const call = async (args: object) => {
    const cfg = core.mcp.configFor("partner");
    const req = new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "did_list", arguments: args } }),
    });
    const j = (await (await core.mcp.handle(req)).json()) as { result: { content: { text: string }[] } };
    return JSON.parse(j.result.content[0]!.text);
  };
  const r = await call({ kind: "sent" });
  expect(r.ok).toBe(true);
  expect(r.items.map((i: { kind: string }) => i.kind).sort()).toEqual(["sent.agent", "sent.mail"]);
  expect(r.items.find((i: { kind: string }) => i.kind === "sent.mail")).toMatchObject({ to: "zhang.wei@hawdb.io", asked: "task Prepare the Q4 budget", allowed: "the user agreed", at: "09:12" });
  const none = await call({ kind: "deleted" });
  expect(none.items).toEqual([]);
  expect(none.note).toContain("nothing");
});

test("D443: a filled detail carries its key, so each client names it in its own language", () => {
  const { core, did } = boot();
  core.autofill.store.record({ at: new Date(NOW - 60_000).toISOString(), handle: "me.phone", label: "Phone", site: "shop.example", what: "filled", taskId: "t_hotel" });
  core.autofill.store.record({ at: new Date(NOW - 50_000).toISOString(), handle: "me.unknown", label: "Odd", site: "shop.example", what: "filled", taskId: "t_hotel" });
  const details = by(did.query(today()).items, "filled", "detail").filter((i) => i.to === "shop.example");
  expect(details.find((i) => i.line === "Phone")).toMatchObject({ detail: "phone" });
  expect(details.find((i) => i.line === "Odd")?.detail).toBeUndefined();
});
