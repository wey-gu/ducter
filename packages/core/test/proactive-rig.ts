// A whole proactive engine on fakes: the real Log, settings, rules and decisions; a fake accounts
// source; a fake clock; recorded triage; a fake push and a fake runner. No model, no network.
import type { Bodies, LogEvent, ProactiveMode, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { createProactive, type ProactiveOptions } from "../src/proactive/engine.ts";
import type { FindJudge } from "../src/proactive/judge.ts";
import { recordedTriage } from "../src/proactive/triage.ts";
import { openPushStore, type PushMessage, type Pusher } from "../src/push.ts";
import { createRegistry } from "../src/registry.ts";
import { openRules } from "../src/rules.ts";
import { openSettings } from "../src/settings.ts";
import { fakeAccounts } from "./fake-accounts.ts";
import { busyWeek, MORNING, ZONE, type Fixture } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";
import { join } from "node:path";

export interface RigOptions {
  fx?: Fixture;
  mode?: ProactiveMode;
  start?: number;
  present?: boolean;
  judge?: FindJudge;
  monthTokens?: number;
  language?: "zh" | "en";
}

export function rig(o: RigOptions = {}) {
  const t = tempDir();
  const clock = new FakeClock(o.start ?? MORNING);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const decisions = createDecisions({ log, tasks, clock });
  const push = openPushStore(t.dir, { tz: ZONE });
  const persona = { id: "default", name: "Ducter", identity: "" };
  const settings = openSettings({ dataDir: t.dir, log, push, persona });
  settings.set({ language: o.language ?? "zh", quiet: { start: "23:00", end: "08:00", tz: ZONE }, ...(o.mode ? { proactive: o.mode } : {}) });
  const rules = openRules(t.dir);
  const fx = o.fx ?? busyWeek();
  const acc = fakeAccounts(fx);
  const sent: PushMessage[] = [];
  const pusher: Pusher = {
    pending: () => [],
    idle: async () => {},
    sendNow: async (make) => {
      sent.push(make({ endpoint: "x", keys: { p256dh: "", auth: "" }, locale: "zh", platform: "ios", deviceId: "local", createdAt: "" } as never));
      return [];
    },
    stop() {},
  };
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  const runner = {
    openTask: async (i: Parameters<Runner["openTask"]>[0]) => {
      opened.push(i);
      return { taskId: `t_${opened.length}`, title: i.title } as unknown as TaskCard;
    },
  } as unknown as Runner;
  let present = o.present ?? false;
  const triage = recordedTriage(fx.triage);
  const opts: ProactiveOptions = {
    dataDir: t.dir,
    log,
    clock,
    persona,
    connections: acc.store,
    settings,
    push,
    pusher,
    rules,
    decisions,
    runner: () => runner,
    triage,
    ...(o.judge ? { judge: o.judge } : {}),
    ...(o.monthTokens ? { monthTokens: o.monthTokens } : {}),
    present: () => present,
    zone: () => ZONE,
  };
  const p = createProactive(opts);
  const notes = () => log.read({ stream: "channel", kinds: ["finds"] }).map((e) => e as LogEvent<"finds">);
  const lastNote = () => notes().at(-1)?.body as Bodies["finds"] | undefined;
  const states = () => log.read({ stream: "channel", kinds: ["find_state"] }).map((e) => e.body as Bodies["find_state"]);
  /** Lets queued work (looks, triage, the note) finish. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await p.tick();
      await new Promise((r) => setTimeout(r, 1));
    }
  };
  /** Moves the fake clock, letting each due timer's async work finish before the next. */
  const advance = async (ms: number, step = 60_000) => {
    for (let left = ms; left > 0; left -= step) {
      clock.advance(Math.min(step, left));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    await settle();
  };
  return {
    p,
    clock,
    log,
    tasks,
    decisions,
    settings,
    rules,
    acc,
    sent,
    opened,
    triage,
    notes,
    lastNote,
    states,
    settle,
    advance,
    setPresent: (v: boolean) => void (present = v),
    dir: t.dir,
    stop() {
      p.stop();
      decisions.stop();
      log.close();
      t.cleanup();
    },
  };
}

export type Rig = ReturnType<typeof rig>;
