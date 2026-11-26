// D281: the person's own words kept and said at their moment, the morning that always comes (or
// catches up), and the morning's one line about Ducter's own side. Fake clock, quiet fixture.
import { afterEach, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { quietDay } from "./fixtures/inbox.ts";
import { rig, type Rig } from "./proactive-rig.ts";
import { tempDir } from "./helpers.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const MIN = 60_000;
const HOUR = 60 * MIN;
// Mon 2026-11-16 10:00 in Shanghai (quiet hours 23:00–08:00).
const MON10 = Date.parse("2026-11-16T10:00:00+08:00");
const say = (r: Rig, text: string) => r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const partner = (r: Rig, text: string) => r.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text } });
const finds = (r: Rig) => r.notes().flatMap((e) => e.body.finds.map((f) => ({ rung: e.body.rung, at: e.ts, ...f })));

test("an ask the partner kept no wait for is still kept: said at its minute, once, in their words", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  say(r, "下午 3 点提醒我给房东转账");
  partner(r, "好。");
  await r.advance(5 * HOUR - 2 * MIN, 5 * MIN);
  expect(finds(r)).toHaveLength(0);
  await r.advance(4 * MIN, MIN);
  const f = finds(r);
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ rung: "now", kind: "said", text: "提醒你：给房东转账。" });
  expect(Date.parse(f[0]!.at) - Date.parse("2026-11-16T15:00:00+08:00")).toBeLessThan(MIN + 1);
  // How I know: their own line, never anything else.
  expect(f[0]!.how[0]!.what).toBe("你说的：「下午 3 点提醒我给房东转账」");
  expect(r.sent.map((m) => m.level)).toEqual(["time-sensitive"]);
  await r.advance(3 * HOUR, 10 * MIN);
  expect(finds(r)).toHaveLength(1);
});

test("a wait the partner armed in that turn keeps it instead: never two reminders", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  say(r, "下午 3 点提醒我给房东转账");
  r.log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: "w1", at: "2026-11-16T07:00:00.000Z", reason: "提醒你给房东转账", state: "armed" } });
  partner(r, "好，3 点提醒你。");
  await r.advance(6 * HOUR, 10 * MIN);
  expect(finds(r)).toHaveLength(0);
});

test("the partner's own promise with no wait is kept too, and gives an undated ask its day", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  say(r, "提醒我续一下护照");
  partner(r, "好，明天早上 9 点提醒你续护照。");
  await r.advance(24 * HOUR, 10 * MIN);
  const f = finds(r).filter((x) => x.kind === "said");
  expect(f).toHaveLength(1);
  expect(f[0]!.text).toBe("提醒你：续护照。");
  expect(new Date(f[0]!.at).getTime()).toBeGreaterThanOrEqual(Date.parse("2026-11-17T09:00:00+08:00"));
});

test("something they said they'd do on a day opens that day's morning note, outside its 3", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  say(r, "我明天要给张三回那封合同的邮件");
  await r.advance(23 * HOUR, 10 * MIN); // Tue 09:00
  const n = r.notes().find((e) => e.body.rung === "morning" && e.body.finds.length);
  expect(n).toBeDefined();
  expect(n!.body.opening).toBe("早。");
  expect(n!.body.finds[0]).toMatchObject({ kind: "said", text: "你昨天说今天要给张三回那封合同的邮件。" });
  expect(finds(r)).toHaveLength(1);
});

test("in English, a weekday", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10, language: "en" });
  say(r, "I need to renew the passport on Wednesday");
  await r.advance(47 * HOUR, 10 * MIN); // Wed 09:00
  expect(finds(r)[0]).toMatchObject({ kind: "said", text: "On Monday you said you'd renew the passport today." });
});

test("不用主动找我: an ask is still kept (they asked); what they said they'd do is not", async () => {
  const r = make({ mode: "off", fx: quietDay(), start: MON10 });
  say(r, "我明天要交房租");
  say(r, "明天提醒我取快递");
  await r.advance(23 * HOUR, 10 * MIN);
  const f = finds(r);
  expect(f.map((x) => x.text)).toEqual(["提醒你：取快递。昨天你让我提醒的。"]);
});

test("the morning comes once even when the home was down at its hour; too late, it waits for tomorrow", async () => {
  const t = tempDir();
  try {
    const r1 = make({ mode: "three", fx: quietDay(), start: Date.parse("2026-11-16T07:00:00+08:00"), dir: t.dir });
    say(r1, "我明天要去银行");
    await r1.advance(2 * HOUR, 10 * MIN); // Mon's morning ran (a quiet one)
    r1.stop();
    rigs.splice(rigs.indexOf(r1), 1);
    // Back on Tue at 09:40 (asleep through 08:00): the note goes at the next tick, once.
    const r2 = make({ mode: "three", fx: quietDay(), start: Date.parse("2026-11-17T09:40:00+08:00"), dir: t.dir });
    await r2.advance(30 * MIN, 5 * MIN);
    const tue = r2.notes().filter((e) => e.body.rung === "morning" && Date.parse(e.ts) > Date.parse("2026-11-17T00:00:00+08:00"));
    expect(tue).toHaveLength(1);
    expect(tue[0]!.body.finds.map((f) => f.text)).toEqual(["你昨天说今天要去银行。"]);
    r2.stop();
    rigs.splice(rigs.indexOf(r2), 1);
    // Back on Wed at 15:00: too late for a morning note; nothing is made up.
    const r3 = make({ mode: "three", fx: quietDay(), start: Date.parse("2026-11-18T15:00:00+08:00"), dir: t.dir });
    await r3.advance(30 * MIN, 5 * MIN);
    expect(r3.notes().filter((e) => Date.parse(e.ts) > Date.parse("2026-11-18T00:00:00+08:00"))).toHaveLength(0);
  } finally {
    t.cleanup();
  }
});

test("the morning's line: a reminder it set for today, and decisions waiting over half a day, each named once", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: Date.parse("2026-11-16T20:00:00+08:00") });
  r.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_old", question: "合并 PR #88？", goLabel: "合并", defaultOption: "hold", reversible: false } as Bodies["decision"] });
  r.log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: "w9", at: "2026-11-17T07:00:00.000Z", reason: "提醒你交水电费", state: "armed" } });
  await r.advance(12 * HOUR + 10 * MIN, 10 * MIN); // Tue 08:10
  const tue = r.notes().filter((e) => e.body.rung === "morning");
  expect(tue).toHaveLength(1);
  expect(tue[0]!.body).toMatchObject({ finds: [], opening: "早。今天 15:00：提醒你交水电费。还有 1 个待你处理，最早的是昨天的。" });
  expect(tue[0]!.body.quiet).toBeUndefined();
  expect(r.sent.map((m) => m.level)).toEqual(["passive"]);
  // Wed: the card still waits, but it was named once; no reminder today: a quiet morning.
  await r.advance(24 * HOUR, 10 * MIN);
  const wed = r.notes().filter((e) => e.body.rung === "morning").at(-1)!;
  expect(wed.body.quiet).toBe(true);
});

test("a line the partner says on its own (a reminder firing, a heads-up) promises nothing", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  partner(r, "提醒你：明天下午 3 点和 Leo 开会。");
  await r.advance(30 * HOUR, 10 * MIN);
  expect(finds(r)).toHaveLength(0);
});

test("a forwarded line is someone else's words: never kept", async () => {
  const r = make({ mode: "three", fx: quietDay(), start: MON10 });
  r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "明天提醒我开会", forwarded: { from: "Leo" } } });
  await r.advance(24 * HOUR, 10 * MIN);
  expect(finds(r)).toHaveLength(0);
});
