// D623: the day after the first run. The first open on the day after Ducter was first used
// says one short recap of what was set up yesterday (at most three true facts, each a link) and
// carries one offer of a morning line as two quiet chips. Nothing set up: nothing. Never twice.
import { afterEach, describe, expect, test } from "bun:test";
import type { AppMeta, Bodies, ChannelView, ConnectionView, LogEvent, TaskCard } from "@ducter/protocol";
import { DAY_AFTER_MAX } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore } from "../src/core.ts";
import { dayAfterFacts, dayIn } from "../src/day-after.ts";
import { openTask, tempDir, tick } from "./helpers.ts";

const YESTERDAY = Date.parse("2026-11-27T23:00:00Z");
const TODAY = Date.parse("2026-11-28T00:30:00Z");
const flush = async () => {
  for (let i = 0; i < 40; i++) await tick();
};

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A home that first ran yesterday at 23:00 UTC; its first open today is the day after. */
function boot(seed?: (core: ReturnType<typeof startCore>) => void) {
  const t = tempDir();
  const clock = new FakeClock(YESTERDAY);
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    push: false,
    clock,
    defaultDelayMs: 60_000,
    keeps: { endAsk: async () => ({}) },
    deviceProbes: { cua: async () => null, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" },
  });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.settings.set({ language: "zh", brain: { harness: "codex" } });
  seed?.(core);
  clock.advance(TODAY - YESTERDAY);
  return { core, clock };
}

const factsIn = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["day_after"], limit: 10 }).map((e) => e.body as Bodies["day_after"]);
const offers = (core: ReturnType<typeof startCore>) =>
  core.log
    .read({ stream: "channel", kinds: ["finds"], limit: 200 })
    .map((e) => e.body as Bodies["finds"])
    .filter((n) => n.ask === "day_after");
const latest = (core: ReturnType<typeof startCore>) => offers(core).at(-1);

/** A finished task yesterday, and the partner's own recap today (the turn itself is faked here). */
async function withOffer(b: ReturnType<typeof boot>) {
  b.core.settings.set({ proactive: "urgent" });
  b.core.proactive.hello("UTC", true);
  await flush();
  const items = factsIn(b.core)[0]!.items;
  b.core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "昨天我们把登录页的跳转修好了。", dayAfter: { items } } });
  await flush();
  return latest(b.core)!;
}

describe("day after the first run", () => {
  test("nothing set up: no recap and no offer", async () => {
    const b = boot();
    b.core.proactive.hello("UTC", true);
    await flush();
    expect(factsIn(b.core)).toHaveLength(0);
    expect(offers(b.core)).toHaveLength(0);
  });

  test("once ever: one recap and one offer, never a second", async () => {
    const b = boot((core) => {
      openTask(core.log, "t_login", "修好登录页的跳转");
      core.tasks.setState("t_login", "done", "warm");
    });
    b.core.proactive.hello("UTC", true);
    await flush();
    const facts = factsIn(b.core);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.items).toEqual([{ kind: "task", id: "t_login", title: "修好登录页的跳转" }]);
    const items = facts[0]!.items;
    b.core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "昨天我们把登录页的跳转修好了。", dayAfter: { items } } });
    await flush();
    expect(offers(b.core)).toHaveLength(1);
    // The same day's later opens, and a restart's: never a second.
    b.core.proactive.hello("UTC", true);
    b.clock.advance(9 * 60_000);
    b.core.proactive.hello("UTC", true);
    await flush();
    expect(factsIn(b.core)).toHaveLength(1);
    expect(offers(b.core)).toHaveLength(1);
  });

  test("not the day after, or no first run: nothing", async () => {
    const b = boot((core) => {
      openTask(core.log, "t_login", "修好登录页的跳转");
      core.tasks.setState("t_login", "done", "warm");
    });
    // A home that first ran two days ago: its second-day chance is gone.
    b.clock.advance(24 * 3_600_000);
    b.core.proactive.hello("UTC", true);
    await flush();
    expect(factsIn(b.core)).toHaveLength(0);
  });

  test("at most three facts, each one thing the person set up", () => {
    const first = { seq: 1, ts: new Date(YESTERDAY).toISOString(), stream: "channel", origin: "system", kind: "user_msg", body: { text: "hi" } } as LogEvent;
    const done = (id: string, at: number): LogEvent => ({ seq: 2, ts: new Date(at).toISOString(), stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "done", residency: "warm" } }) as LogEvent;
    const kept = (id: string, title: string, at: number): LogEvent => ({ seq: 3, ts: new Date(at).toISOString(), stream: `keep:${id}`, origin: "system", kind: "keep", body: { keepId: id, title, said: "x", from: { kind: "routine", routineId: "r" }, run: "fresh", wakes: [], life: "on", createdAt: new Date(at).toISOString(), made: "keep_make" } }) as LogEvent;
    const all = [first, done("a", YESTERDAY + 1000), done("b", YESTERDAY + 2000), kept("k", "看 CI", YESTERDAY + 3000)];
    const tasks: Record<string, TaskCard> = {
      a: { taskId: "a", title: "A" } as TaskCard,
      b: { taskId: "b", title: "B" } as TaskCard,
    };
    const log = { read: ({ kinds }: { kinds?: readonly string[] } = {}) => all.filter((e) => !kinds || kinds.includes(e.kind)) } as never;
    const at = TODAY;
    const out = dayAfterFacts(
      {
        log,
        task: (id) => tasks[id],
        keeps: [],
        connections: [{ id: "c", name: "Gmail", addedAt: new Date(YESTERDAY + 4000).toISOString() } as ConnectionView],
        channels: [{ kind: "telegram", state: "linked", linked: { name: "Ada", at: new Date(YESTERDAY + 5000).toISOString() } } as ChannelView],
        apps: [{ id: "x", name: "Trip", persona: "default", made: new Date(YESTERDAY + 6000).toISOString() } as AppMeta],
        persona: "default",
      },
      at,
      "UTC",
    );
    expect(out).toHaveLength(DAY_AFTER_MAX);
    expect(out!.map((i) => i.kind)).toEqual(["app", "chat", "account"]);
    // The next day is not the first day after any more.
    expect(dayAfterFacts({ log, task: (id) => tasks[id], keeps: [], connections: [], channels: [], apps: [], persona: "default" }, at + 86_400_000, "UTC")).toBeUndefined();
    expect(dayIn(YESTERDAY, "UTC")).toBe(dayIn(TODAY, "UTC") - 1);
  });

  test("the offer is an offer: no needs count, no default, no timer; Go turns the morning line on and the partner says one line", async () => {
    const b = boot((core) => {
      openTask(core.log, "t_login", "修好登录页的跳转");
      core.tasks.setState("t_login", "done", "warm");
    });
    const note = await withOffer(b);
    // Not a decision: nothing waits on it in any count.
    expect(b.core.decisions.openIds()).toHaveLength(0);
    expect(note.answered).toBeUndefined();
    // No timer: a day later, untouched, it has still changed nothing.
    b.clock.advance(24 * 3_600_000);
    await flush();
    expect(latest(b.core)!.answered).toBeUndefined();
    expect(b.core.settings.get().proactive).toBe("urgent");
    // One tap: the morning note is on, and the partner says one short line.
    await b.core.proactive.answer(note.noteId, "day_after", true);
    await flush();
    expect(b.core.settings.get().proactive).toBe("useful");
    expect(b.core.settings.get().proactiveBy).toBe("chosen");
    expect(latest(b.core)!.answered).toBe("yes");
    expect(b.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => (e.body as Bodies["ai_msg"]).text)).toContain("好，每天早上给你一句话。");
  });

  test("declined: nothing changes, recorded as no", async () => {
    const b = boot((core) => {
      openTask(core.log, "t_login", "修好登录页的跳转");
      core.tasks.setState("t_login", "done", "warm");
    });
    const note = await withOffer(b);
    const before = b.core.settings.get();
    await b.core.proactive.answer(note.noteId, "day_after", false);
    await flush();
    expect(b.core.settings.get().proactive).toBe(before.proactive);
    expect(b.core.settings.get().proactiveBy).toBe(before.proactiveBy);
    expect(latest(b.core)!.answered).toBe("no");
  });

  test("ignored: the next message settles it as ignored, nothing changes, never asked again", async () => {
    const b = boot((core) => {
      openTask(core.log, "t_login", "修好登录页的跳转");
      core.tasks.setState("t_login", "done", "warm");
    });
    const note = await withOffer(b);
    const before = b.core.settings.get().proactive;
    b.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我把桌面理一理" } });
    await flush();
    expect(latest(b.core)!.answered).toBe("ignored");
    expect(b.core.settings.get().proactive).toBe(before);
    // One root offer, revised to ignored; never a second question.
    expect(offers(b.core).filter((n) => !n.revises)).toHaveLength(1);
    expect(offers(b.core).at(-1)!.noteId).not.toBe(note.noteId);
    // A later open does not ask again.
    b.core.proactive.hello("UTC", true);
    await flush();
    expect(offers(b.core).filter((n) => !n.revises)).toHaveLength(1);
  });
});
