// D388: `ducter proactive replay`: the last days of the accounts through a dry engine. It reports
// what would have been said (with its sources), and leaves the person's home exactly as it was: no
// line in their Log, no notification, no task, no facts or state written to their data folder, its
// own scratch folder gone after. Fake accounts, recorded triage, code's bar, a fake web look.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { realClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { barJudge } from "../src/proactive/judge.ts";
import { replayProactive } from "../src/proactive/replay.ts";
import { recordedTriage } from "../src/proactive/triage.ts";
import { openPushStore } from "../src/push.ts";
import { openRules } from "../src/rules.ts";
import { openSettings } from "../src/settings.ts";
import { fakeLook } from "./aha-run.ts";
import { fakeAccounts } from "./fake-accounts.ts";
import { ME, type FakeEvent, type Fixture } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));

const ZONE = "Asia/Shanghai";
const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

test("the replay says the contradiction and fills the time, from fresh scratch, and leaves the home as it was", async () => {
  const now = Date.now();
  const D = 86_400_000;
  const sat = day(now + 2 * D);
  const fri = day(now + D);
  const fx: Fixture = {
    mail: [
      { id: "m_weekly", threadId: "t_w", from: "Lina Zhou <lina@example.org>", to: [ME], subject: "本周周报 W47", snippet: "周五 AGI Bar 分享", date: new Date(now - 3 * 3_600_000).toISOString() },
      { id: "m_quota", from: "Lumen Cloud <noreply@lumen.example.net>", to: [ME], subject: "流量包使用已达 95%", snippet: "已使用 95%", date: new Date(now - 2 * 3_600_000).toISOString(), labelIds: ["CATEGORY_UPDATES"] },
    ],
    events: [{ id: "ev_agibar", summary: "AGI Bar 北京分享", start: { date: sat }, end: { date: day(now + 3 * D) }, updated: new Date(now - 7 * D).toISOString() } as unknown as FakeEvent],
    github: [],
    chat: [],
    triage: {
      m_weekly: { person: true, needsAnswer: false, facts: [{ type: "plan", name: "AGI Bar 北京分享", day: fri }] },
      m_quota: { person: false, needsAnswer: false, facts: [{ type: "billing", what: "near_limit", name: "Lumen Cloud 流量包", used: "95%" }] },
    },
  };
  const home = tempDir();
  cleanups.push(home.cleanup);
  const log = openLog({ path: join(home.dir, "ducter.db"), persona: "default", clock: realClock });
  cleanups.push(() => log.close());
  const push = openPushStore(home.dir, { tz: ZONE });
  const persona = { id: "default", name: "Ducter" };
  const settings = openSettings({ dataDir: home.dir, log, push, persona: { ...persona, identity: "" } });
  // The replay runs on the real clock and keeps the home's quiet hours, so quiet hours that hold
  // the moment the test runs (23:00–08:00 there; 15:00–24:00 UTC in CI) would keep the find
  // unsaid. Quiet hours set to begin three hours from now keep the test the same at any hour.
  const hourThere = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const at = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  settings.set({ language: "zh", quiet: { start: at(hourThere + 3), end: at(hourThere + 4), tz: ZONE } });
  const rules = openRules(home.dir);
  const acc = fakeAccounts(fx);
  const look = fakeLook();
  const before = readdirSync(home.dir).sort();
  const headBefore = log.read({ stream: "channel" }).length;
  const r = await replayProactive({ connections: acc.store, settings, rules, log, persona, zone: () => ZONE, harness: () => undefined, pick: () => ({ harness: "claude-code" }), webLook: () => look, triage: recordedTriage(fx.triage), judge: barJudge }, { days: 3 });

  expect(r.days).toBe(3);
  expect(r.mode).toBe("three");
  const contra = r.said.find((s) => s.kind === "mismatch")!;
  expect(contra.text).toContain("AGI Bar");
  expect(contra.how.map((h) => h.src)).toEqual(["calendar", "mail"]);
  expect(r.said.some((s) => s.kind === "deadline" && s.text.includes("95%"))).toBe(true);
  // The open question went to the (fake) web at once and was filled.
  expect(look.asked).toHaveLength(1);
  expect(r.said.some((s) => s.kind === "update" && s.text.includes("19:00"))).toBe(true);
  expect(r.open).toEqual([{ name: "AGI Bar 北京分享", fields: ["day", "time"], state: "filled" }]);
  expect(r.noticed.find((n) => n.kind === "mismatch")?.why).toContain("日历");

  // Nothing on the home moved: no line in its Log, no new file in its data folder (no facts, no state).
  expect(log.read({ stream: "channel" }).length).toBe(headBefore);
  expect(readdirSync(home.dir).sort()).toEqual(before);
  expect(existsSync(join(home.dir, "findings.json"))).toBe(false);
}, 60_000);

test("a home with no agent to read with gets a plain error, not a silent nothing", async () => {
  const home = tempDir();
  cleanups.push(home.cleanup);
  const log = openLog({ path: join(home.dir, "ducter.db"), persona: "default", clock: realClock });
  cleanups.push(() => log.close());
  const push = openPushStore(home.dir, { tz: ZONE });
  const settings = openSettings({ dataDir: home.dir, log, push, persona: { id: "default", name: "Ducter", identity: "" } });
  const acc = fakeAccounts({ mail: [], events: [], github: [], chat: [], triage: {} });
  await expect(replayProactive({ connections: acc.store, settings, rules: openRules(home.dir), log, persona: { id: "default", name: "Ducter" }, zone: () => ZONE, harness: () => undefined, pick: () => ({ harness: "claude-code" }) })).rejects.toThrow(/no AI agent/);
});
