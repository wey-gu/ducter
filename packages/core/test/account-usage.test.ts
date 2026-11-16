// D288: an agent's account usage limits on the home: read at most every few minutes (one read at
// a time), kept current by what its sessions say, and a failed read never erases what was known.
import { expect, test } from "bun:test";
import { createAccountUsage, USAGE_FRESH_MS, type UsageAnswer } from "../src/account-usage.ts";

const read = (answers: UsageAnswer[]) => {
  const calls: string[] = [];
  return { calls, read: async (h: string) => (calls.push(h), answers.shift() ?? { why: "unavailable" as const }) };
};
const codex = (used: number): UsageAnswer => ({ usage: { harness: "codex", plan: "plus", windows: [{ id: "codex:secondary", label: "Codex", used }], at: "2026-11-16T10:00:00.000Z" } });

test("a read stands for a few minutes; fresh reads again; one read at a time", async () => {
  let now = 1_000_000;
  const r = read([codex(0.4), codex(0.5), codex(0.6)]);
  const book = createAccountUsage({ read: r.read, now: () => now });
  const [a, b] = await Promise.all([book.get("codex"), book.get("codex")]);
  expect(a).toEqual(b);
  expect(r.calls).toHaveLength(1);
  now += USAGE_FRESH_MS - 1;
  expect((await book.get("codex")).usage!.windows[0]!.used).toBe(0.4);
  expect((await book.get("codex", true)).usage!.windows[0]!.used).toBe(0.5);
  now += USAGE_FRESH_MS;
  expect((await book.get("codex")).usage!.windows[0]!.used).toBe(0.6);
  expect(r.calls).toHaveLength(3);
});

test("what a session says merges by window id; a failed read keeps it", async () => {
  let now = 1_000_000;
  const r = read([codex(0.4), { why: "unavailable" }]);
  const book = createAccountUsage({ read: r.read, now: () => now });
  await book.get("codex");
  book.seen("codex", { windows: [{ id: "codex:secondary", label: "Codex", used: 0.45 }, { id: "codex:primary", label: "Codex", used: 0.1 }], limited: false });
  const u = (await book.get("codex")).usage!;
  expect(u.plan).toBe("plus");
  expect(u.windows.map((w) => [w.id, w.used])).toEqual([
    ["codex:secondary", 0.45],
    ["codex:primary", 0.1],
  ]);
  now += USAGE_FRESH_MS;
  expect((await book.get("codex")).usage!.windows).toHaveLength(2); // the failed read kept it
});

test("an agent that doesn't share its limits says so; a limit hit is said before any read", async () => {
  const book = createAccountUsage({ read: async () => ({ why: "unsupported" }) });
  expect(await book.get("pi")).toEqual({ why: "unsupported" });
  book.seen("claude-code", { windows: [{ id: "seven_day", label: "Current week (all models)", used: 1, resetsAt: "2026-11-20T07:55:00.000Z" }], limited: true });
  // A read is due; it says nothing, so what the session said stands.
  expect((await book.get("claude-code")).usage).toMatchObject({ limited: true, windows: [{ id: "seven_day", used: 1 }] });
});
