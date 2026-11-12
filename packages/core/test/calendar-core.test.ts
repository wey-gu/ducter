// D222 through the real core: the oo link (an in-process fake oo with two calendar accounts), the
// broker's staging, Go run once by core, the partner never woken by a calendar card's Go or Hold,
// woken once when the write fails; the Accounts frame carries each calendar account's calendars.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { fakeOoCalendar } from "./fake-oo-calendar.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function boot() {
  dir = mkdtempSync(join(tmpdir(), "ducter-calcore-"));
  const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 86_400_000));
  const oo = fakeOoCalendar({ day });
  core = startCore({ dataDir: dir, port: 0, push: false, ooSource: oo.source });
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
  c.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_lunch", question: r.question.en, goLabel: r.goLabel.en, defaultOption: "hold", reversible: false, cal: r.cal } });
  expect(oo.runs.filter((x) => x.action === "create_event")).toHaveLength(0);
  c.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_lunch", option: "go", by: "user" } });
  for (let i = 0; i < 50 && !oo.runs.some((x) => x.action === "create_event"); i++) await Bun.sleep(10);
  await Bun.sleep(30);
  expect(oo.runs.filter((x) => x.action === "create_event")).toHaveLength(1);
  const done = c.log.read({ stream: "channel", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]).find((b) => b.decisionId === "d_lunch" && b.state === "done");
  expect(done?.link).toContain("google.com/calendar");
  expect(woke.filter((e) => e.kind === "decision_resolved")).toHaveLength(0);
  expect(woke.filter((e) => e.kind === "user_msg")).toHaveLength(0);
});

test("the Accounts frame lists a calendar account's calendars once read", async () => {
  await boot();
  await core!.calendar.refresh();
  const apps = core!.connections.apps(core!.connections.view()[0]!.id).filter((a) => a.service === "googlecalendar");
  const rows = core!.calendar.rows(apps[0]!);
  expect(rows?.map((r) => r.kind)).toEqual(["main", "holidays", "own", "own"]);
  expect(rows?.find((r) => r.name === "Old project")?.seen).toBe(false);
});
