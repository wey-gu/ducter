// D388: `ducter proactive replay [--days N] [--no-web]`, for the person on their own home. The last
// N days of their real accounts go through a second proactive engine in a dry mode, and only what
// it would have said comes back, with its sources and why it held the rest: so they can hold
// Ducter up against another app's morning, or against what they expected.
//
// Dry means: its own scratch folder (a Log, the facts, the state, harness scratch) made fresh and
// deleted after; no pusher (no notification), no runner (no task, no Go card that does anything),
// nothing appended to the person's Log or conversation; the live engine's state and facts are
// never touched. It reads the accounts through the same broker as the live watchers, read-only
// (the broker refuses every write for the watch caller), and those reads are logged in 看了哪些 as
// any look is. The person's own lines of those days are copied in as text (their word on a plan).
// Reading closely uses the agent the partner thinks with (the cheapest model for triage, the
// partner's for the bar): a few cents to a few dimes for three days of a busy inbox.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessId, ProactiveMode, ReplayReport } from "@ducter/protocol";
import type { HarnessPort, LogStore, WebLookPort } from "@ducter/protocol/src/internal.ts";
import { realClock } from "../clock.ts";
import type { ConnectionsStore } from "../connections.ts";
import { createDecisions } from "../decisions.ts";
import { createHarnessAsk } from "../judge.ts";
import { openLog } from "../log.ts";
import { openPushStore } from "../push.ts";
import { createRegistry } from "../registry.ts";
import { openRules, type RulesStore } from "../rules.ts";
import { openSettings, type SettingsStore } from "../settings.ts";
import { BARS_REV, createProactive, LOOK_BACK_REV, NOTES_REV, PROACTIVE_FILE } from "./engine.ts";
import { modelJudge, type FindJudge } from "./judge.ts";
import { modelTriage, type Triage } from "./triage.ts";

export const REPLAY_MAX_DAYS = 7;

export interface ReplayDeps {
  connections: ConnectionsStore;
  settings: SettingsStore;
  rules: RulesStore;
  /** The person's Log, read only: their own lines of those days. */
  log: LogStore;
  persona: { id: string; name: string };
  zone: () => string;
  harness: () => HarnessPort | undefined;
  pick: () => { harness: HarnessId; model?: string };
  webLook?: () => WebLookPort | undefined;
  calendarIds?: Parameters<typeof createProactive>[0]["calendarIds"];
  /** Tests: a recorded triage and code's bar instead of the agent. */
  triage?: Triage;
  judge?: FindJudge;
}

export async function replayProactive(d: ReplayDeps, o: { days?: number; web?: boolean } = {}): Promise<ReplayReport> {
  const days = Math.max(1, Math.min(REPLAY_MAX_DAYS, Math.round(o.days ?? 3)));
  if (!d.harness() && !d.triage) throw new Error("no AI agent to read with yet");
  const dir = mkdtempSync(join(tmpdir(), "ducter-replay-"));
  chmodSync(dir, 0o700);
  const clock = realClock;
  const log = openLog({ path: join(dir, "ducter.db"), persona: d.persona.id, clock });
  const tasks = createRegistry(log, clock);
  const decisions = createDecisions({ log, tasks, clock });
  const live = d.settings.get();
  const mode: ProactiveMode = !live.proactive || live.proactive === "off" ? "three" : live.proactive;
  const push = openPushStore(dir, { tz: d.zone() });
  const settings = openSettings({ dataDir: dir, log, push, persona: { ...d.persona, identity: "" } });
  settings.set({ ...(live.language ? { language: live.language } : {}), ...(live.quiet ? { quiet: live.quiet } : {}), proactive: mode });
  // What they said not to be told about (and what may wake them) holds in the replay too.
  const rules = openRules(dir);
  for (const r of d.rules.list()) if (r.notice) rules.addNotice({ text: r.text, kind: r.notice.kind, ...(r.notice.sender ? { sender: r.notice.sender } : {}), ...(r.notice.wake ? { wake: true } : {}) });
  // Every source counts as looked back already: the replay reads exactly the days asked, in full.
  const backfill = Object.fromEntries(d.connections.view().map((c) => [c.id, "done"]));
  writeFileSync(join(dir, PROACTIVE_FILE), JSON.stringify({ backfill, lookBackRev: LOOK_BACK_REV, cadenceAsked: true, notesRev: NOTES_REV, barsRev: BARS_REV, clientZone: d.zone() }), { mode: 0o600 });
  const web = o.web !== false && Boolean(d.webLook?.()?.can());
  const p = createProactive({
    dataDir: dir,
    log,
    clock,
    persona: d.persona,
    connections: d.connections,
    settings,
    push,
    rules,
    decisions,
    runner: () => undefined,
    triage: d.triage ?? modelTriage(createHarnessAsk({ harness: d.harness, pick: d.pick, dataDir: dir, cheap: true, dir: "triage" })),
    judge: d.judge ?? modelJudge(createHarnessAsk({ harness: d.harness, pick: d.pick, dataDir: dir, cheap: false, dir: "judge" })),
    present: () => false,
    zone: d.zone,
    ...(d.calendarIds ? { calendarIds: d.calendarIds } : {}),
    ...(web && d.webLook ? { webLook: d.webLook } : {}),
    // A replay has no half hour to wait: an open question is looked up at once.
    openLookAfterMs: 0,
  });
  try {
    // Their own words of those days, as text only (said.ts reads a plan's day from them).
    const since = Date.now() - days * 86_400_000;
    for (const e of d.log.read({ stream: "channel", kinds: ["user_msg"], limit: 2000 })) {
      const text = (e.body as { text?: string }).text;
      if (e.origin === "user" && text && Date.parse(e.ts) >= since) log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: text.slice(0, 300) } });
    }
    await p.lookNow(days);
    await p.morning();
    await p.tick();
    const said: ReplayReport["said"] = [];
    for (const e of log.read({ stream: "channel", kinds: ["finds"] })) {
      const b = e.body as import("@ducter/protocol").Bodies["finds"];
      const fresh = b.revises ? (b.added ? b.finds.slice(-b.added) : []) : b.finds;
      for (const f of fresh) said.push({ rung: b.rung, kind: f.kind, text: f.text, how: f.how, ...(f.unknown ? { unknown: f.unknown } : {}), ...(f.untouched ? { untouched: f.untouched } : {}) });
    }
    const day = p.day();
    const n = p.noticed();
    return {
      days,
      mode,
      zone: d.zone(),
      web,
      looked: day.looked,
      read: day.read,
      noted: day.noted,
      said,
      held: day.held,
      noticed: n.items.map((i) => ({ kind: i.kind, text: i.text, said: i.said, ...(i.why ? { why: i.why } : {}), ...(i.unknown ? { unknown: i.unknown } : {}) })),
      open: p.opens().map((r) => ({ name: r.name, fields: r.fields, state: r.state })),
      looks: p.opens().reduce((s, r) => s + r.looks, 0),
      ...(day.problem ? { problem: day.problem } : {}),
    };
  } finally {
    p.stop();
    decisions.stop();
    log.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
