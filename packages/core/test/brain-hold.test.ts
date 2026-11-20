// D435: core's hold on the partner's own agent (brain-hold.ts), on a fake clock and a real Log:
// who answers meanwhile (the person's rules and the agents' own limits respected), said once per
// time out, the reset from the account when the agent named none, kept across a restart, ended by
// a good turn; and what every client is told (brain.ts brainNow).
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { RuleView } from "@ducter/protocol";
import type { AccountUsageBook } from "../src/account-usage.ts";
import { brainNow } from "../src/brain.ts";
import { createBrainHold, ERROR_RETRY_MS } from "../src/brain-hold.ts";
import { FakeClock } from "../src/clock.ts";
import { RESET_GRACE_MS, THROTTLE_RETRY_MS } from "../src/limits.ts";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

const START = Date.parse("2026-11-21T11:30:00Z");
const RESET = "2026-11-21T12:53:00.000Z";
let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

function setup(o: { home?: string[]; rules?: RuleView[]; usage?: AccountUsageBook; dir?: string; waits?: () => { harness: string; at?: string; resetKnown: boolean }[] } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const clock = new FakeClock(START);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const home = (o.home ?? ["claude-code", "codex", "pi"]).map((h) => ({ harness: h, loggedIn: true }));
  const changes: number[] = [];
  const mk = () => {
    const hold = createBrainHold({ log, clock, base: () => "claude-code", home: () => home, rules: () => o.rules ?? [], ...(o.usage ? { usage: o.usage } : {}), ...(o.waits ? { waits: o.waits } : {}) });
    hold.onChange(() => changes.push(clock.now()));
    stops.push(() => hold.stop());
    return hold;
  };
  stops.push(() => log.close?.());
  return { clock, log, mk, changes, dir: t.dir };
}

test("a limit with its reset: the next agent answers, said once, a hit again soon after says nothing new", async () => {
  const s = setup();
  const hold = s.mk();
  const r = await hold.hit({ harness: "claude-code", failure: "quota", resetsAt: RESET, source: "event" });
  expect(r).toEqual({ tell: true, now: { from: "claude-code", why: "quota", until: RESET, resetKnown: true, to: "codex" } });
  // Codex fails too: pi answers; shown (Settings, the header), not said again.
  const r2 = await hold.hit({ harness: "codex", failure: "rate_limited" });
  expect(r2.now?.to).toBe("pi");
  expect(r2.tell).toBe(false);
  // The reset passes (with its slack): Claude Code is tried again; it is still out, a few minutes on.
  s.clock.advance(Date.parse(RESET) - START + RESET_GRACE_MS);
  expect(hold.now()).toBeUndefined();
  expect(s.changes.at(-1)).toBe(Date.parse(RESET) + RESET_GRACE_MS); // the clients hear its time came
  const again = await hold.hit({ harness: "claude-code", failure: "quota", resetsAt: "2026-11-21T13:30:00.000Z" });
  // Codex's own throttle wait has passed too, so Codex answers again: the same time out, nothing new to say.
  expect(again.now?.to).toBe("codex");
  expect(again.tell).toBe(false);
  // A good turn ends it.
  hold.ok("claude-code");
  expect(hold.now()).toBeUndefined();
  const evs = s.log.read({ stream: "partner", kinds: ["partner_session"], limit: 50 }).map((e) => (e.body as { event: string; harness: string }).event + ":" + (e.body as { harness: string }).harness);
  expect(evs.at(-1)).toBe("brain_back:claude-code");
});

test("never one the person ruled out, never one whose own limit is used up; none left: it waits", async () => {
  const never: RuleView = { id: "r1", text: "别用 Codex", harness: "codex", match: [], never: true, createdAt: "2026-11-20T00:00:00Z" };
  const usage: AccountUsageBook = {
    get: async (h) => (h === "pi" ? { usage: { windows: [{ id: "5h", used: 1, resetsAt: "2026-11-21T14:00:00.000Z" }], limited: true } } : h === "claude-code" ? { usage: { windows: [{ id: "5h", used: 1, resetsAt: RESET }], limited: true } } : {}),
    seen: () => {},
  } as AccountUsageBook;
  const s = setup({ rules: [never], usage });
  const hold = s.mk();
  // The agent named no reset: the account's used-up window says when.
  const r = await hold.hit({ harness: "claude-code", failure: "quota", source: "none" });
  expect(r.now).toEqual({ from: "claude-code", why: "quota", until: RESET, resetKnown: true, waits: true });
  expect(r.tell).toBe(true);
});

test("an error or a throttle with no time: a short wait of Ducter's own", async () => {
  const s = setup({ home: ["claude-code"] });
  const hold = s.mk();
  const e = await hold.hit({ harness: "claude-code", failure: "error", said: "spawn failed" });
  expect(e.now).toMatchObject({ why: "error", resetKnown: false, waits: true, until: new Date(START + ERROR_RETRY_MS).toISOString() });
  s.clock.advance(ERROR_RETRY_MS);
  expect(hold.now()).toBeUndefined();
  const t = await hold.hit({ harness: "claude-code", failure: "rate_limited" });
  expect(t.now?.until).toBe(new Date(START + ERROR_RETRY_MS + THROTTLE_RETRY_MS).toISOString());
  // Hit again within the half hour: the same time out, already said ("none" both times).
  expect(t.tell).toBe(false);
});

test("a restart keeps the hold (the Log has it) and its time still comes", async () => {
  const s = setup({ home: ["claude-code"] });
  const hold = s.mk();
  await hold.hit({ harness: "claude-code", failure: "quota", resetsAt: RESET });
  hold.stop();
  const back = s.mk();
  expect(back.now()).toEqual({ from: "claude-code", why: "quota", until: RESET, resetKnown: true, waits: true });
  const before = s.changes.length;
  s.clock.advance(Date.parse(RESET) - START + RESET_GRACE_MS);
  expect(s.changes.length).toBe(before + 1);
  expect(back.now()).toBeUndefined();
});

test("what every client is told: the agent answering meanwhile, or the held one with when it's back", async () => {
  const s = setup();
  const hold = s.mk();
  await hold.hit({ harness: "claude-code", failure: "quota", resetsAt: RESET });
  const cc = { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true };
  const cx = { harness: "codex", installed: true, loggedIn: true, canBePartner: true };
  const now = brainNow({ harness: "claude-code", model: "opus" }, true, [cc, cx], undefined, hold.now());
  expect(now).toMatchObject({ harness: "codex", why: "held", held: { from: "claude-code", why: "quota", until: RESET, resetKnown: true } });
  expect(now.model).toBeUndefined();
  // The person chose Codex meanwhile: Claude Code's hold isn't about what it thinks with.
  expect(brainNow({ harness: "codex" }, true, [cc, cx], undefined, { from: "claude-code", why: "quota", until: RESET, resetKnown: true, waits: true })).toMatchObject({ harness: "codex" });
  expect(brainNow({ harness: "codex" }, true, [cc, cx], undefined, { from: "claude-code", why: "quota", until: RESET, resetKnown: true, waits: true }).held).toBeUndefined();
  const waits = brainNow({ harness: "claude-code", model: "opus" }, true, [cc], undefined, { from: "claude-code", why: "quota", until: RESET, resetKnown: true, waits: true });
  expect(waits).toMatchObject({ harness: "claude-code", model: "opus", held: { waits: true } });
});

// D446: a task on the home already waits for Claude Code's reset (D297). Before the partner's next
// turn the account is read, so its turn never fails first: held now, Codex answers, said once.
test("a task waits for the same account's reset: the account is read before the turn and the agent held at once", async () => {
  let reads = 0;
  const usage = {
    get: async (h: string) => (h === "claude-code" ? (reads++, { usage: { windows: [{ id: "5h", used: 1, resetsAt: RESET }], limited: true } }) : {}),
    seen: () => {},
  } as unknown as AccountUsageBook;
  const waits: { harness: string; at?: string; resetKnown: boolean }[] = [];
  const s = setup({ usage, waits: () => waits });
  const hold = s.mk();
  // No task waiting: nothing read, nothing held.
  expect(await hold.ahead()).toEqual({ tell: false, held: false });
  expect(reads).toBe(0);
  // A task waits on another agent's account: still nothing.
  waits.push({ harness: "codex", at: "2026-11-21T12:00:00.000Z", resetKnown: true });
  expect((await hold.ahead()).held).toBe(false);
  expect(reads).toBe(0);
  // A task waits on Claude Code's, and the account says it is used up: held now, until its reset.
  waits.push({ harness: "claude-code", at: new Date(Date.parse(RESET) + RESET_GRACE_MS).toISOString(), resetKnown: true });
  const r = await hold.ahead();
  expect(r).toEqual({ held: true, tell: true, now: { from: "claude-code", why: "quota", until: RESET, resetKnown: true, to: "codex" } });
  expect(reads).toBeGreaterThan(0);
  // Held already: the next turn reads nothing again and says nothing again.
  const n = reads;
  expect(await hold.ahead()).toEqual({ tell: false, held: false });
  expect(reads).toBe(n);
});

test("the account says there is room (another window): the turn goes on its own agent; unread with no reset known: it tries", async () => {
  const roomy = { get: async () => ({ usage: { windows: [{ id: "5h", used: 0.3, resetsAt: RESET }], limited: false } }), seen: () => {} } as unknown as AccountUsageBook;
  const later = new Date(Date.parse(RESET) + RESET_GRACE_MS).toISOString();
  const a = setup({ usage: roomy, waits: () => [{ harness: "claude-code", at: later, resetKnown: true }] });
  expect((await a.mk().ahead()).held).toBe(false);
  // No reading at all (no usage book): the task's known reset is enough to hold.
  const b = setup({ waits: () => [{ harness: "claude-code", at: later, resetKnown: true }] });
  const rb = await b.mk().ahead();
  expect(rb.held).toBe(true);
  expect(rb.now?.until).toBe(RESET);
  // No reading and only a retry time (no reset known): a guess, so the turn tries.
  const c = setup({ waits: () => [{ harness: "claude-code", at: later, resetKnown: false }] });
  expect((await c.mk().ahead()).held).toBe(false);
});
