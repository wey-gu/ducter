// D226: why nothing ever reached the author, end to end, on fakes shaped like his home (a Linux
// server whose partner thinks with Codex, Claude Code not installed; Gmail and two calendars
// through oo; 只说急的 chosen from Settings, so no first look ever ran). Each stage is proved:
// triage runs on the agent the partner really uses; a failing read is counted and said once; a
// source turned on from Settings is caught up; 只说急的 still says the urgent ones and 开会前; the
// calendar and a confirmation that disagree are one find; and 今天看了什么 says why it was quiet.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { HARNESSES, type Bodies, type DeviceHarness, type ServerFrame } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, Runner, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { startCore } from "../src/core.ts";
import { ooSource } from "../src/connections.ts";
import { ooCli, ooEnv, ooExec } from "../src/oo-link.ts";
import { detect } from "../src/proactive/detect.ts";
import { readProblemOf } from "../src/proactive/engine.ts";
import { recordedTriage, type Triage } from "../src/proactive/triage.ts";
import { lookFor } from "../src/proactive/watch.ts";
import { fakeOo } from "./fake-oo.ts";
import { ME, MORNING, ZONE, type Fixture, type Triaged } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  rigs.splice(0).forEach((r) => r.stop());
  for (const s of stops.reverse()) await s();
  stops = [];
});
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const MIN = 60_000;
const T = (s: string) => new Date(Date.parse(s)).toISOString();

/**
 * The author's kind of day, made up: a flight moved to tomorrow, an invoice due tomorrow, a talk
 * the calendar has on the 18th while the organizer confirmed the 19th, and two meetings tomorrow
 * in two calendars at the same time, among a pile of notices and receipts.
 */
function helDay(): Fixture {
  const noise = Array.from({ length: 24 }, (_, i) => ({
    id: `m_n${i}`,
    from: `Service ${i} <notifications@svc${i}.example.com>`,
    to: [ME],
    subject: `Your weekly summary #${i}`,
    snippet: "Here is what happened this week.",
    date: T(`2026-11-09T${String(8 + (i % 12)).padStart(2, "0")}:00:00+08:00`),
    labelIds: ["CATEGORY_UPDATES"],
  }));
  const triage: Record<string, Triaged> = {
    m_nh: { person: false, needsAnswer: false, facts: [{ type: "change", what: "flight_changed", name: "NH920", on: "2026-11-11T09:40:00+08:00" }] },
    m_inv: { person: false, needsAnswer: false, facts: [{ type: "renewal", name: "Vercel Pro", due: "2026-11-11", amount: "$20.00" }] },
    m_talk: { person: true, needsAnswer: false, facts: [{ type: "booking", what: "other", name: "AI Builders Meetup talk", start: "2026-11-19T19:00:00+08:00" }] },
  };
  return {
    mail: [
      ...noise,
      { id: "m_nh", threadId: "t_nh", from: "ANA <info@ana.example.co.jp>", to: [ME], subject: "Schedule change: NH920 on 11 Nov", snippet: "Your flight NH920 now departs at 09:40.", date: T("2026-11-09T21:00:00+08:00") },
      { id: "m_inv", threadId: "t_inv", from: "Vercel <billing@vercel.example.com>", to: [ME], subject: "Invoice INV-2207 is due Nov 11", snippet: "Your invoice of $20.00 is due on November 11.", date: T("2026-11-09T18:00:00+08:00") },
      { id: "m_talk", threadId: "t_talk", from: "Mia Chen <mia@meetup.example.org>", to: [ME], subject: "Confirmed: your talk at AI Builders Meetup", snippet: "See you on Thursday, November 19 at 19:00.", date: T("2026-11-08T12:00:00+08:00") },
    ],
    events: [
      { id: "e_meetup", summary: "AI Builders Meetup", start: { dateTime: "2026-11-18T19:00:00+08:00" }, end: { dateTime: "2026-11-18T21:00:00+08:00" }, attendees: [{ email: ME, self: true }, { email: "mia@meetup.example.org" }], updated: T("2026-11-01T10:00:00+08:00") },
      { id: "e_review", summary: "Design review", start: { dateTime: "2026-11-11T10:00:00+08:00" }, end: { dateTime: "2026-11-11T11:00:00+08:00" }, attendees: [{ email: ME, self: true }, { email: "lina@example.org" }], updated: T("2026-11-01T10:00:00+08:00") },
      { id: "e_dentist", summary: "Dentist", start: { dateTime: "2026-11-11T10:30:00+08:00" }, end: { dateTime: "2026-11-11T11:30:00+08:00" }, updated: T("2026-11-02T10:00:00+08:00") },
    ],
    github: [],
    chat: [],
    triage,
  };
}

const notInstalled: Triage = async () => {
  throw new Error("harness claude-code is not installed");
};

test("hel as it was: every read fails, the day view says why, the partner says so once", async () => {
  const fx = helDay();
  const r = make({ mode: "urgent", fx, triage: notInstalled, agentName: "Claude Code" });
  await r.settle();
  // The catch-up look back ran (the mode came from Settings; no first look ever did).
  let d = r.p.day();
  expect(d.problem).toMatchObject({ why: "not_installed", agent: "Claude Code" });
  expect(d.read).toBe(0);
  expect(d.noted).toBeGreaterThanOrEqual(3); // the calendars' meetings need no model
  // Nothing from mail is in the ledger: only the calendars' clash tomorrow, held (not urgent today).
  expect(d.held).toEqual([{ reason: "not_urgent", n: 1 }]);
  // Three failing looks over 30 minutes: said once, in plain words, and never again.
  for (let i = 0; i < 4; i++) {
    await r.p.lookNow(1);
    await r.advance(12 * MIN);
  }
  const said = r.log.read({ stream: "channel", kinds: ["ai_msg"] }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said).toEqual(["我没法细读你的信：这台电脑上没装 Claude Code。现在只看得到标题，所以什么都没跟你说。"]);
  d = r.p.day();
  expect(d.problem!.waiting).toBeGreaterThan(0);
  expect(d.catchingUp).toBe(true); // the look back read nothing, so it is not marked done
  // The agent is back (the release's fix: the one it really thinks with): the look back runs now,
  // the problem line goes without a word, and the flight change reaches the ledger.
  r.p.setModels({ triage: recordedTriage(fx.triage) });
  await r.settle();
  d = r.p.day();
  expect(d.problem).toBeUndefined();
  expect(d.catchingUp).toBeUndefined();
  expect(r.p.ledger.of("change").map((f) => f.name)).toEqual(["NH920"]);
  expect(r.log.read({ stream: "channel", kinds: ["ai_msg"] })).toHaveLength(1);
  expect(readProblemOf("no AI agent to ask yet")).toBe("no_agent");
  expect(readProblemOf("codex: not logged in")).toBe("signed_out");
});

test("fixed: 只说急的 says the flight change and the invoice now; the rest is held, and the day view says why", async () => {
  const fx = helDay();
  const r = make({ mode: "urgent", fx });
  await r.settle();
  await r.advance(70 * MIN); // past 08:00: 只说急的 has no note, the urgent ones go
  const now = r.notes().map((n) => n.body).filter((b) => b.rung === "now");
  expect(now.flatMap((b) => b.finds.map((f) => f.kind)).sort()).toEqual(["deadline", "plan_changed"]);
  const d = r.p.day();
  expect(d.problem).toBeUndefined();
  expect(d.read).toBeGreaterThan(0);
  expect(d.said).toBe(2);
  // Held: tomorrow's clash and the talk's two dates (not urgent), with the reason.
  expect(d.held).toEqual([{ reason: "not_urgent", n: 2 }]);
  expect(d.nextNote).toBeUndefined(); // 只说急的 has no morning note
});

test("每天最多 3 件: the morning note leads with what costs most; the talk's two dates are one find", async () => {
  const r = make({ mode: "three", fx: helDay() });
  await r.settle();
  expect(r.p.day().held.find((h) => h.reason === "for_morning")?.n).toBeGreaterThanOrEqual(3);
  expect(r.p.day().nextNote).toBe(new Date(Date.parse("2026-11-10T08:00:00+08:00")).toISOString());
  await r.advance(70 * MIN);
  const note = r.notes().map((n) => n.body).find((b) => b.rung === "morning")!;
  expect(note.finds).toHaveLength(3);
  expect(note.finds.map((f) => f.kind)).toContain("plan_changed");
  const all = detect(r.p.ledger, { now: r.clock.now(), zone: ZONE });
  const talk = all.find((c) => c.kind === "mismatch" && c.key.startsWith("mismatch:") && c.words.zh.includes("确认信"))!;
  expect(talk.words.zh).toBe("日历上「AI Builders Meetup」是 11/18，Mia Chen 的确认信写的是 11/19。");
  expect(talk.step?.kind).toBe("read");
  expect(r.p.day().held.find((h) => h.reason === "cap")?.n).toBeGreaterThanOrEqual(1);
});

test("开会前 under 只说急的: 10 minutes before a meeting with something open", async () => {
  const r = make({ mode: "urgent", fx: helDay() });
  // Lina asked twice and is in tomorrow's design review.
  r.p.ledger.add([
    { ref: { connectionId: "conn_oo", service: "gmail", account: ME, id: "q1", thread: "tq" }, label: "Lina · #2141", at: "2026-11-06T10:00:00+08:00", type: "ask_in", from: "lina@example.org", name: "Lina", what: "review #2141", again: true, person: true },
  ]);
  await r.settle();
  await r.advance(Date.parse("2026-11-11T09:49:00+08:00") - r.clock.now(), 5 * MIN);
  const kinds = r.notes().map((n) => n.body).filter((b) => b.rung === "meeting").flatMap((b) => b.finds.map((f) => f.kind));
  expect(kinds).toEqual(["meeting"]);
});

test("the long look back asks only for subjects that may hold a fact, in a few short searches", () => {
  const qs = lookFor("gmail")!.inputs(0, 0, { long: true, action: "gmail.fetch_emails" });
  expect(qs.length).toBeGreaterThan(1);
  for (const i of qs) {
    expect(String(i.query)).toStartWith("after:0 subject:(");
    expect(String(i.query).length).toBeLessThan(260);
    expect(i).toMatchObject({ detail: "summary", maxResults: 100 });
  }
  const all = qs.map((i) => String(i.query)).join(" ");
  expect(all).toContain("flight OR");
  expect(all).toContain("invoice");
  expect(lookFor("gmail")!.inputs(0, 0, { action: "gmail.search_threads" })).toEqual([{ query: "after:0", maxResults: 50 }]);
});

// ---------- the real core: a Codex-only home reads with Codex ----------

function answering() {
  const specs: SessionSpec[] = [];
  const port: HarnessPort = {
    async start(spec) {
      specs.push(spec);
      let sent = false;
      return {
        id: "s",
        canSteer: false,
        busy: () => false,
        send: async () => void (sent = true),
        interrupt: async () => {},
        close: async () => {},
        async *events() {
          while (!sent) await new Promise((r) => setTimeout(r, 1));
          yield { role: "assistant", text: "[]", usage: { inputTokens: 100, outputTokens: 10 }, turnEnd: true } as HarnessEvent;
        },
      };
    },
    available: async () => [],
  };
  return { port, specs };
}

test("a Codex-only home: triage and the bar run on Codex, never on the Claude Code that isn't there", async () => {
  const t = tempDir();
  const fx = helDay();
  const bin = join(t.dir, "bin");
  mkdirSync(bin);
  const oo = fakeOo(bin, {
    signedIn: true,
    apps: [{ service: "gmail", connectionName: "work", accountLabel: ME, authType: "oauth2", isDefault: true }],
    actions: [{ service: "gmail", name: "search_threads" }],
    results: { "gmail.search_threads": { threads: fx.mail } },
  });
  const env = { ...process.env, ...oo.env, PATH: `${bin}:${process.env.PATH}` };
  const cli = ooCli({ exec: ooExec(oo.bin, ooEnv(env, oo.bin)) });
  const homeAgents: DeviceHarness[] = [
    { harness: "claude-code", installed: false, loggedIn: false, canBePartner: false },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
  ];
  const started = Date.now();
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    push: false,
    ooSource: ooSource({ env, dir: join(t.dir, "oo-config"), which: () => oo.bin, cli }),
    proactive: { zone: ZONE },
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => homeAgents, kind: async () => "laptop" },
    clock: { now: () => MORNING + (Date.now() - started), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const a = answering();
  core.setRunner({ harness: a.port, openTask: async () => ({ taskId: "t", title: "x" }), send: async () => ({ delivered: "prompted" }) } as unknown as Runner);
  for (let i = 0; i < 100 && !core.devicesView.harnessesNow(); i++) await Bun.sleep(10);
  expect(core.brainInUse()).toEqual({ harness: "codex" });

  const ws = new WebSocket(core.url);
  const frames: ServerFrame[] = [];
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", client: "web" }));
  ws.send(JSON.stringify({ t: "connection_oo" }));
  for (let i = 0; i < 300 && !core.connections.view().length; i++) await Bun.sleep(10);
  // 只说急的 from Settings: no first look; the catch-up reads, on Codex's cheap model.
  core.settings.set({ proactive: "urgent" });
  for (let i = 0; i < 500 && !a.specs.length; i++) await Bun.sleep(10);
  expect(a.specs.length).toBeGreaterThan(0);
  expect(a.specs.every((s) => s.harness === "codex")).toBe(true);
  expect(a.specs[0]!.model).toBe(HARNESSES.codex.cheapModel!);
  // 今天看了什么 over the socket.
  for (let i = 0; i < 300 && core.proactive.day().read === 0; i++) await Bun.sleep(10);
  ws.send(JSON.stringify({ t: "proactive_day" }));
  let day: Extract<ServerFrame, { t: "proactive_day" }> | undefined;
  for (let i = 0; i < 300 && !day; i++) {
    day = frames.find((f): f is Extract<ServerFrame, { t: "proactive_day" }> => f.t === "proactive_day");
    await Bun.sleep(10);
  }
  expect(day!.day.read).toBeGreaterThan(0);
  expect(day!.day.problem).toBeUndefined();
  expect(day!.day.pushOff).toBe(true); // no phone has notifications on in this test
});
