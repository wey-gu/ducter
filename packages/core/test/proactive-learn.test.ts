// D165 step 6, D453: learning with no effort of the person's. 有用 / 这类不用告诉我 (a Rule, removable),
// Go / 有用 / a reply raise a kind's weight, Hold and silence lower it a little (never to silence),
// nothing pauses for unread notes, and the month's budget.
import { afterEach, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const HOUR = 3_600_000;
const DAY = 86_400_000;

async function firstMorning(r: Rig) {
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  return r.lastNote()!;
}

test("这类不用告诉我 becomes a Rule worded in the kind and the sender; that kind from them is never said again", async () => {
  const r = make({ mode: "useful" });
  const n = await firstMorning(r);
  const money = n.finds.find((f) => f.kind === "deadline")!;
  expect(r.p.react(money.findId, "mute")).toBe(true);
  expect(r.p.react(money.findId, "mute")).toBe(false); // once
  const rule = r.rules.list().find((x) => x.notice)!;
  expect(rule).toMatchObject({ text: "Cloudflare 的「到期和花钱的事」不用告诉我", notice: { kind: "deadline", sender: "Cloudflare" } });
  expect(r.states().at(-1)).toMatchObject({ findId: money.findId, state: "muted", ruleId: rule.id });
  // A new reminder from Cloudflare next week: not said. Removing the rule (不要这条) lets it through.
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "m_cf2" }, label: "Cloudflare · Final reminder", at: "2026-11-11T09:00:00+08:00", type: "renewal", name: "ducter.dev", due: "2026-11-16", amount: "$10.44" }]);
  await r.advance(DAY, 5 * 60_000);
  expect(r.notes().flatMap((e) => e.body.finds).filter((f) => f.kind === "deadline")).toHaveLength(1);
  r.rules.remove(rule.id);
  await r.advance(DAY, 5 * 60_000);
  expect(r.notes().flatMap((e) => e.body.finds).filter((f) => f.kind === "deadline")).toHaveLength(2);
});

type Learned = { bars: Record<string, number>; weights?: { kind: Record<string, number>; sender: Record<string, number> }; paused?: boolean };

test("D453: Go, 有用 and a reply raise a kind's weight; Hold on an offer lowers it a little; nothing gates an offer by what was learned", async () => {
  const r = make({ mode: "useful" });
  const n = await firstMorning(r);
  const st = () => JSON.parse(require("node:fs").readFileSync(require("node:path").join(r.dir, "proactive.json"), "utf8")) as Learned;
  const lina = n.finds.find((f) => f.kind === "waiting_on_you")!;
  r.p.react(lina.findId, "useful");
  expect(r.states().at(-1)).toMatchObject({ state: "useful" });
  expect(st().weights!.kind.waiting_on_you).toBe(1.5);
  // Hold the money offers (a chat app's Hold, an old client): its weight drops a little, never its floor.
  const holdMoney = async () => {
    for (const f of r.notes().flatMap((e) => e.body.finds).filter((x) => x.kind === "deadline" && x.decisionId && r.decisions.isPending(x.decisionId))) r.decisions.decide(f.decisionId!, "hold");
    await r.settle();
  };
  await holdMoney();
  expect(st().weights!.kind.deadline).toBeCloseTo(0.85, 5);
  for (let i = 0; i < 2; i++) {
    const id = `m_more${i}`;
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id }, label: `Shop ${i} · renews`, at: "2026-11-10T09:00:00+08:00", type: "renewal", name: `thing ${i}`, due: "2026-11-15", amount: "$5" }]);
  }
  await r.advance(DAY, 5 * 60_000);
  // Still offered: held is not "never".
  expect(r.lastNote()!.finds.filter((f) => f.kind === "deadline")).toHaveLength(2);
  await holdMoney();
  expect(st().weights!.kind.deadline).toBeGreaterThanOrEqual(0.5);
  // An offer's Hold never touches the interrupt bar (only a "now" find's does).
  expect(st().bars.deadline).toBeUndefined();
  expect(r.states().filter((s) => s.state === "held")).toHaveLength(3);
});

test("D453: unread mornings never pause the note and nothing asks about them; an offer let be fades at the next morning", async () => {
  const r = make({ mode: "useful" });
  const st = () => JSON.parse(require("node:fs").readFileSync(require("node:path").join(r.dir, "proactive.json"), "utf8")) as Learned;
  await r.p.lookNow(40);
  for (let d = 0; d < 4; d++) {
    // Something new each day, never read, never answered.
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: `r${d}` }, label: `Vendor ${d} · renews`, at: new Date(r.clock.now()).toISOString(), type: "renewal", name: `plan ${d}`, due: new Date(r.clock.now() + 5 * DAY).toISOString().slice(0, 10), amount: "$9" }]);
    await r.advance(d === 0 ? HOUR + 2 * 60_000 : DAY, 5 * 60_000);
  }
  const mornings = r.notes().filter((e) => e.body.rung === "morning" && !e.body.quiet && !e.body.revises);
  expect(mornings).toHaveLength(4);
  expect(st().paused).toBeFalsy();
  // The first morning's offers faded on their own: resolved by default, passed, no "missed" word.
  const first = mornings[0]!.body.finds.filter((f) => f.decisionId);
  expect(first.length).toBeGreaterThan(0);
  for (const f of first) expect(r.decisions.isPending(f.decisionId!)).toBe(false);
  const faded = r.states().filter((s) => s.state === "passed").map((s) => s.findId);
  for (const f of first) expect(faded).toContain(f.findId);
  // Silence lowers a kind's weight a little, never below the floor, never to silence.
  const w = st().weights!.kind.deadline!;
  expect(w).toBeLessThan(1);
  expect(w).toBeGreaterThanOrEqual(0.5);
  // The person writes: the partner's answer is all; no 早上那条还要吗？, no "you didn't reply".
  r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我看看日程" } });
  await r.settle();
  r.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "在看。" } });
  await r.settle();
  expect(r.notes().some((e) => e.body.ask === "keep_note")).toBe(false);
  expect(r.settings.get().proactive).toBe("useful");
  const said = r.log.read({ stream: "channel", kinds: ["ai_msg"] }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said.filter((t) => /还没(回|看)|没回(复)?我|didn't (reply|answer)|haven't (replied|answered)/.test(t))).toEqual([]);
}, 120_000);

test("D453: a home the old rule paused resumes on load, and its morning note comes", async () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const t = (await import("./helpers.ts")).tempDir();
  fs.writeFileSync(path.join(t.dir, "proactive.json"), JSON.stringify({ paused: true, keepAsk: "pending" }));
  const r = make({ dir: t.dir, mode: "useful" });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  expect(r.notes().filter((e) => e.body.rung === "morning" && !e.body.quiet)).toHaveLength(1);
  const now = JSON.parse(fs.readFileSync(path.join(t.dir, "proactive.json"), "utf8"));
  expect(now.paused).toBe(false);
  expect(now.keepAsk).toBeUndefined();
  r.stop();
  rigs.splice(rigs.indexOf(r), 1);
  t.cleanup();
});

test("at the month's budget it drops to 只说急的 and says so once", async () => {
  const r = make({ mode: "three", monthTokens: 3000 });
  await r.p.lookNow(40);
  const said = r.log.read({ stream: "channel", kinds: ["ai_msg"] }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said).toEqual(["oo 里的账号 这个月的额度用完了，这个月剩下的日子我只说急的。"]);
  await r.advance(HOUR + 2 * 60_000);
  // Per source (research/48 P4): the source over its budget says only what is urgent; the
  // morning note still comes (another source may have something) and has only urgent finds from
  // it (D232: a person who asked again is urgent).
  const urgentKinds = new Set(["deadline", "plan_changed", "mismatch", "waiting_on_you"]);
  expect(r.notes().filter((e) => e.body.rung === "morning").flatMap((e) => e.body.finds).every((f) => urgentKinds.has(f.kind))).toBe(true);
  expect(r.p.look("conn_oo")!.budgetPct).toBe(100);
});

test("D258: a reply to a find (or a message that answered it) never quiets its kind", async () => {
  const r = make({ mode: "useful" });
  const n = await firstMorning(r);
  const st = () => JSON.parse(require("node:fs").readFileSync(require("node:path").join(r.dir, "proactive.json"), "utf8")) as { bars: Record<string, number>; ignored: unknown[] };
  for (const f of n.finds.filter((x) => x.decisionId)) r.decisions.decide(f.decisionId!, "reply", "这个我回过了");
  await r.settle();
  expect(r.states().filter((s) => s.state === "held")).toHaveLength(0);
  expect(r.states().filter((s) => s.state === "passed").length).toBeGreaterThan(0);
  expect(st().ignored).toHaveLength(0);
  expect(Object.values(st().bars).every((b) => b <= 50)).toBe(true);
});

test("D258: bars learned before BARS_REV are relearned once from the Log: only Go and Not now count", async () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const t = (await import("./helpers.ts")).tempDir();
  let r = make({ dir: t.dir, mode: "useful" });
  const n = await firstMorning(r);
  const cards = n.finds.filter((x) => x.decisionId);
  expect(cards.length).toBeGreaterThan(0);
  r.decisions.decide(cards[0]!.decisionId!, "reply", "回过了");
  await r.settle();
  r.stop();
  rigs.splice(rigs.indexOf(r), 1);
  // As the old rules left it: the reply held the find and the bar was raised.
  const pp = path.join(r.dir, "proactive.json");
  const old = JSON.parse(fs.readFileSync(pp, "utf8"));
  old.bars = { waiting_on_you: 60 };
  old.ignored = [{ kind: "waiting_on_you", at: r.clock.now() }];
  delete old.barsRev;
  for (const f of Object.values(old.finds) as { state?: string }[]) if (f.state === "passed") f.state = "held";
  fs.writeFileSync(pp, JSON.stringify(old));
  r = make({ dir: r.dir, mode: "useful" });
  const now = JSON.parse(fs.readFileSync(pp, "utf8"));
  expect(now.bars).toEqual({});
  expect(now.ignored).toEqual([]);
  expect(now.barsRev).toBe(1);
  expect((Object.values(now.finds) as { state?: string }[]).some((f) => f.state === "held")).toBe(false);
  r.stop();
  rigs.splice(rigs.indexOf(r), 1);
  t.cleanup();
});
