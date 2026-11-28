// D659 (#257): every staged connection write runs by itself on Go, once, in the partner's
// conversation; the outcome wakes that partner; a second identical card is refused while the
// first is open; a call after the fact only reads the recorded outcome back.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { actAs } from "../src/acting.ts";
import { fakeOoCalendar } from "./fake-oo-calendar.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const card = (decisionId: string, write: { connection: string; action: string }, question = "Send it?"): Bodies["decision"] => ({
  decisionId,
  question,
  goLabel: "Send",
  defaultOption: "hold",
  reversible: false,
  write,
});

async function boot(o: { partners?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), "ducter-staged257-"));
  const oo = fakeOoCalendar({ day: "2026-11-28" });
  core = startCore({ dataDir: dir, port: 0, push: false, ooSource: oo.source, ...(o.partners ? { partners: true } : {}) });
  const got: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void got.push(e) });
  expect((await core.connections.addFromOo()).ok).toBe(true);
  return { oo, got, conn: core.connections.view()[0]!.id };
}

const wait = async (fn: () => boolean, n = 80) => {
  for (let i = 0; i < n && !fn(); i++) await Bun.sleep(10);
};

test("Go on an email reply runs once in the default partner's conversation and wakes it with the outcome", async () => {
  const { oo, got, conn } = await boot();
  const c = core!;
  const staged = c.connections.stage(conn, "gmail.send_email", { to: "lina@example.com", thread_id: "t1", body: "Hi" }, "d_mail");
  expect(staged.ok).toBe(true);
  if (!staged.ok) return;
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: card("d_mail", staged.write) });
  c.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_mail", option: "go", by: "user", write: staged.write } });
  await wait(() => oo.runs.some((x) => x.action === "send_email"));
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
  const done = c.log.read({ stream: "channel", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).find((b) => b.decisionId === "d_mail" && b.state === "done");
  expect(done).toMatchObject({ staged: true, wake: "always" });
  await wait(() => got.some((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_mail"));
  const woke = got.find((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_mail")!;
  expect(woke.body).toMatchObject({ state: "done", staged: true, decisionId: "d_mail" });
  // A later call with only the decision id reads it back; it never runs a second time.
  const again = await c.connections.runApproved("d_mail");
  expect(again).toMatchObject({ ok: true, result: { recorded: true } });
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
});

test("a second partner's staged write runs and is recorded in its conversation; the outcome wakes it there", async () => {
  const { oo, conn } = await boot({ partners: true });
  const c = core!;
  expect(c.partners.add({ name: "多比" }).ok).toBe(true);
  const got: LogEvent[] = [];
  c.setPartnerFactory(() => ({ onTrigger: (e) => void got.push(e) }));
  c.log.append({ stream: "channel:p2", origin: "user", kind: "user_msg", body: { text: "你好" } });
  await wait(() => got.some((e) => e.kind === "user_msg"));
  const staged = actAs("p2", () => c.connections.stage(conn, "gmail.send_email", { to: "dobi@example.com", thread_id: "t2", body: "Hi" }, "d_p2_mail"));
  expect(staged.ok).toBe(true);
  if (!staged.ok) return;
  c.log.append({ stream: "channel:p2", origin: "partner", kind: "decision", body: card("d_p2_mail", staged.write) });
  c.log.append({ stream: "channel:p2", origin: "user", kind: "decision_resolved", body: { decisionId: "d_p2_mail", option: "go", by: "user", write: staged.write } });
  await wait(() => oo.runs.some((x) => x.action === "send_email"));
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
  const done = c.log.read({ stream: "channel:p2", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).find((b) => b.decisionId === "d_p2_mail" && b.state === "done");
  expect(done?.staged).toBe(true);
  await wait(() => got.some((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_p2_mail"));
  // Its view sees its own conversation as "channel", and the outcome is the fact.
  const woke = got.find((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_p2_mail")!;
  expect(woke.stream).toBe("channel");
  expect(woke.body).toMatchObject({ state: "done", decisionId: "d_p2_mail" });
  expect(c.log.read({ stream: "channel", kinds: ["connection_call"] }).some((e) => (e.body as Bodies["connection_call"]).decisionId === "d_p2_mail")).toBe(false);
});

test("Hold and Reply wake with nothing sent; an identical open staging is refused and names the earlier card", async () => {
  const { oo, got, conn } = await boot();
  const c = core!;
  const first = c.connections.stage(conn, "gmail.send_email", { to: "lina@example.com", thread_id: "t3", body: "Hi" }, "d_open");
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  // Same action, same target: refused while the earlier card is open.
  const dup = c.connections.stage(conn, "gmail.send_email", { to: "lina@example.com", thread_id: "t3", body: "A re-read draft" }, "d_dup");
  expect(dup.ok).toBe(false);
  if (dup.ok) return;
  expect(dup.error).toContain("d_open");
  expect(dup.error.toLowerCase()).toContain("end your turn");
  // A different action on the same target is a different write, not a duplicate (the issue's
  // second, unlike case: a Slack message vs an email reply).
  expect(c.connections.stage(conn, "gmail.reply_email", { to: "lina@example.com", thread_id: "t3", body: "Hi" }, "d_other_action").ok).toBe(true);
  expect(c.connections.stage(conn, "slack.postMessage", { channel: "#general", text: "hi" }, "d_slack").ok).toBe(true);
  // A different thread is a different target too.
  expect(c.connections.stage(conn, "gmail.send_email", { to: "lina@example.com", thread_id: "t4", body: "Hi" }, "d_other_target").ok).toBe(true);
  // Hold: the held call says nothing was sent and wakes the partner with that fact.
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: card("d_open", first.write) });
  c.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_open", option: "hold", by: "user", write: first.write } });
  await wait(() => got.some((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_open"));
  const held = got.find((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_open")!;
  expect(held.body).toMatchObject({ state: "held", answer: "hold", decisionId: "d_open" });
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(0);
  // Reply: the same, marked as the user's reply so the wake says to read it.
  const reply = c.connections.stage(conn, "gmail.send_email", { to: "a@example.com", thread_id: "t5", body: "Hi" }, "d_reply");
  if (!reply.ok) return;
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: card("d_reply", reply.write) });
  c.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_reply", option: "reply", text: "say hello instead", by: "user", write: reply.write } });
  await wait(() => got.some((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_reply"));
  expect(got.find((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === "d_reply")!.body).toMatchObject({ state: "held", answer: "reply" });
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(0);
});
