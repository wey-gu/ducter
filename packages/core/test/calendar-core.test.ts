// D222 through the real core: the oo link (an in-process fake oo with two calendar accounts), the
// broker's staging, Go run once by core, the partner never woken by a calendar card's Go or Hold,
// woken once when the write fails; the Accounts frame carries each calendar account's calendars.
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

async function boot(o: { partners?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), "ducter-calcore-"));
  const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));
  const oo = fakeOoCalendar({ day });
  core = startCore({ dataDir: dir, port: 0, push: false, ooSource: oo.source, ...(o.partners ? { partners: true } : {}) });
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  expect((await core.connections.addFromOo()).ok).toBe(true);
  return { oo, woke, day };
}

test("a change card: staged, run once on Go by core, the partner not woken; Hold runs nothing", async () => {
  const { oo, woke, day } = await boot();
  const c = core!;
  expect(c.calendar.accounts()).toHaveLength(2);
  const r = await c.calendar.propose({ change: "create", title: "Lunch with Ana", start: `${day}T12:30`, minutes: 60 }, "d_lunch");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_lunch", question: r.question.en, goLabel: r.goLabel.en, defaultOption: "hold", reversible: false, cal: r.cal, write: r.write } });
  expect(oo.runs.filter((x) => x.action === "create_event")).toHaveLength(0);
  c.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_lunch", option: "go", by: "user", write: r.write } });
  for (let i = 0; i < 50 && !oo.runs.some((x) => x.action === "create_event"); i++) await Bun.sleep(10);
  await Bun.sleep(30);
  expect(oo.runs.filter((x) => x.action === "create_event")).toHaveLength(1);
  const done = c.log.read({ stream: "channel", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).find((b) => b.decisionId === "d_lunch" && b.state === "done");
  expect(done?.link).toContain("google.com/calendar");
  expect(woke.filter((e) => e.kind === "decision_resolved")).toHaveLength(0);
  expect(woke.filter((e) => e.kind === "user_msg")).toHaveLength(0);
});

test("a second partner's staged write runs when a subscriber answers Go, and is recorded in its own conversation", async () => {
  const { oo, day } = await boot({ partners: true });
  const c = core!;
  expect(c.partners.add({ name: "多比" }).ok).toBe(true);
  // The card was staged in 多比's conversation (its own tool call, actAs p2).
  const r = await actAs("p2", () =>
    c.calendar.propose({ change: "create", title: "Rust × AI Meetup", start: day, note: "周六下午，新加坡时间，几点待定" }, "d_p2_cal"),
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_p2_cal", question: r.question.zh, goLabel: r.goLabel.zh, defaultOption: "hold", reversible: false, cal: r.cal, write: r.write } });
  expect(c.log.read({ stream: "channel:p2", kinds: ["decision"] }).map((e) => (e.body as Bodies["decision"]).decisionId)).toEqual(["d_p2_cal"]);
  expect(c.log.read({ stream: "channel", kinds: ["decision"] })).toHaveLength(0);

  // The person says Go in 多比's conversation: the calendar's Log subscriber runs it by itself.
  c.log.append({ stream: "channel:p2", origin: "user", kind: "decision_resolved", body: { decisionId: "d_p2_cal", option: "go", by: "user", write: r.write } });
  for (let i = 0; i < 50 && !oo.runs.some((x) => x.action === "create_event"); i++) await Bun.sleep(10);
  await Bun.sleep(30);
  expect(oo.runs.filter((x) => x.action === "create_event")).toHaveLength(1);
  const calls = (stream: string) => c.log.read({ stream, kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]);
  const done = calls("channel:p2").find((b) => b.decisionId === "d_p2_cal" && b.state === "done");
  expect(done?.link).toContain("google.com/calendar");
  // The run was recorded where it was staged, never in the default partner's conversation.
  expect(calls("channel").some((b) => b.decisionId === "d_p2_cal" && (b.state === "done" || b.state === "failed"))).toBe(false);
});

test("a failure after Go is recorded in the partner's own conversation, never silent", async () => {
  const { day } = await boot({ partners: true });
  const c = core!;
  expect(c.partners.add({ name: "多比" }).ok).toBe(true);
  const r = await actAs("p2", () => c.calendar.propose({ change: "create", title: "Rust × AI Meetup", start: day }, "d_p2_gone"));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_p2_gone", question: r.question.zh, goLabel: r.goLabel.zh, defaultOption: "hold", reversible: false, cal: r.cal, write: r.write } });
  // The account goes away between the card and Go: the write can't run.
  expect(c.connections.remove(c.connections.view()[0]!.id)).toBe(true);
  c.log.append({ stream: "channel:p2", origin: "user", kind: "decision_resolved", body: { decisionId: "d_p2_gone", option: "go", by: "user", write: r.write } });
  for (let i = 0; i < 50 && !c.log.read({ stream: "channel:p2", kinds: ["connection_call"], limit: 100 }).some((e) => { const b = e.body as Bodies["connection_call"]; return b.decisionId === "d_p2_gone" && b.state === "failed"; }); i++) await Bun.sleep(10);
  const failed = c.log.read({ stream: "channel:p2", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).find((b) => b.decisionId === "d_p2_gone" && b.state === "failed");
  expect(failed?.error).toContain("connection removed");
  expect(c.log.read({ stream: "channel", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).some((b) => b.decisionId === "d_p2_gone")).toBe(false);
});

test("a non-calendar write a second partner staged is found by its decision, runs once, and is recorded in its conversation", async () => {
  const { oo } = await boot({ partners: true });
  const c = core!;
  expect(c.partners.add({ name: "多比" }).ok).toBe(true);
  const conn = c.connections.view()[0]!.id;
  const staged = actAs("p2", () => c.connections.stage(conn, "gmail.send_email", { to: "dobi@example.com", body: "Hi" }, "d_p2_mail"));
  expect(staged.ok).toBe(true);
  c.log.append({ stream: "channel:p2", origin: "user", kind: "decision_resolved", body: { decisionId: "d_p2_mail", option: "go", by: "user", write: staged.write } });
  // The Go wakes core's general runner, in the conversation it was staged in.
  for (let i = 0; i < 50 && !oo.runs.some((x) => x.action === "send_email"); i++) await Bun.sleep(10);
  await Bun.sleep(30);
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
  const ran = await c.connections.runApproved("d_p2_mail");
  expect(ran).toMatchObject({ ok: true, result: { recorded: true } });
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
  const calls = (stream: string) => c.log.read({ stream, kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]);
  expect(calls("channel:p2").find((b) => b.decisionId === "d_p2_mail" && b.state === "done")).toBeTruthy();
  expect(calls("channel").some((b) => b.decisionId === "d_p2_mail")).toBe(false);
  expect(await c.connections.runApproved("d_p2_mail")).toMatchObject({ ok: true, result: { recorded: true } });
  expect(oo.runs.filter((x) => x.action === "send_email")).toHaveLength(1);
});

test("the person's zone is where their newest app says, not the quiet hours' stale zone", async () => {
  await boot();
  const c = core!;
  c.push.setSettings({ quiet: { start: "23:00", end: "08:00", tz: "Asia/Tokyo" } });
  expect(c.calendar.zone()).toBe("Asia/Tokyo");
  // The Mac says Singapore: that is where they are now (the quiet-hours zone is where the night was set).
  c.proactive.hello("Asia/Singapore");
  expect(c.calendar.zone()).toBe("Asia/Singapore");
});

test("the Accounts frame lists a calendar account's calendars once read", async () => {
  await boot();
  await core!.calendar.refresh();
  const apps = core!.connections.apps(core!.connections.view()[0]!.id).filter((a) => a.service === "googlecalendar");
  const rows = core!.calendar.rows(apps[0]!);
  expect(rows?.map((r) => r.kind)).toEqual(["main", "holidays", "own", "own"]);
  expect(rows?.find((r) => r.name === "Old project")?.seen).toBe(false);
});
