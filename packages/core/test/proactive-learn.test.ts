// D165 step 6: learning. 有用 / 这类不用告诉我 (a Rule, removable), Go/Hold/silence per kind, the
// 3-unread pause and 早上那条还要吗？, and the month's budget.
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
  expect(rule).toMatchObject({ text: "Cloudflare 的「快到期 · 要花钱」不用告诉我", notice: { kind: "deadline", sender: "Cloudflare" } });
  expect(r.states().at(-1)).toMatchObject({ findId: money.findId, state: "muted", ruleId: rule.id });
  // A new reminder from Cloudflare next week: not said. Removing the rule (不要这条) lets it through.
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "m_cf2" }, label: "Cloudflare · Final reminder", at: "2026-11-11T09:00:00+08:00", type: "renewal", name: "ducter.dev", due: "2026-11-16", amount: "$10.44" }]);
  await r.advance(DAY);
  expect(r.notes().flatMap((e) => e.body.finds).filter((f) => f.kind === "deadline")).toHaveLength(1);
  r.rules.remove(rule.id);
  await r.advance(DAY);
  expect(r.notes().flatMap((e) => e.body.finds).filter((f) => f.kind === "deadline")).toHaveLength(2);
});

test("有用 lowers that kind's bar; three ignored in 14 days raise it", async () => {
  const r = make({ mode: "useful" });
  const n = await firstMorning(r);
  const lina = n.finds.find((f) => f.kind === "waiting_on_you")!;
  r.p.react(lina.findId, "useful");
  expect(r.states().at(-1)).toMatchObject({ state: "useful" });
  const st = () => JSON.parse(require("node:fs").readFileSync(require("node:path").join(r.dir, "proactive.json"), "utf8")) as { bars: Record<string, number> };
  expect(st().bars.waiting_on_you).toBe(45);
  // Hold three money finds in a row: that kind's bar goes up.
  const holdMoney = async () => {
    for (const f of r.notes().flatMap((e) => e.body.finds).filter((x) => x.kind === "deadline" && x.decisionId && r.decisions.isPending(x.decisionId))) r.decisions.decide(f.decisionId!, "hold");
    await r.settle();
  };
  await holdMoney();
  for (let i = 0; i < 2; i++) {
    const id = `m_more${i}`;
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id }, label: `Shop ${i} · renews`, at: "2026-11-10T09:00:00+08:00", type: "renewal", name: `thing ${i}`, due: "2026-11-15", amount: "$5" }]);
  }
  await r.advance(DAY);
  expect(r.lastNote()!.finds.filter((f) => f.kind === "deadline")).toHaveLength(2);
  await holdMoney();
  expect(st().bars.deadline).toBe(60);
  expect(r.states().filter((s) => s.state === "held")).toHaveLength(3);
});

test("three unread morning notes pause them; the next time the person writes: 早上那条还要吗？; 不用了 = 只说急的", async () => {
  const r = make({ mode: "useful" });
  await r.p.lookNow(40);
  for (let d = 0; d < 3; d++) {
    // Something new each day, never read.
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: `r${d}` }, label: `Vendor ${d} · renews`, at: new Date(r.clock.now()).toISOString(), type: "renewal", name: `plan ${d}`, due: new Date(r.clock.now() + 5 * DAY).toISOString().slice(0, 10), amount: "$9" }]);
    await r.advance(d === 0 ? HOUR + 2 * 60_000 : DAY);
  }
  const mornings = r.notes().filter((e) => e.body.rung === "morning" && !e.body.quiet);
  expect(mornings).toHaveLength(3);
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "r9" }, label: "Vendor 9 · renews", at: new Date(r.clock.now()).toISOString(), type: "renewal", name: "plan 9", due: new Date(r.clock.now() + 5 * DAY).toISOString().slice(0, 10), amount: "$9" }]);
  await r.advance(DAY);
  expect(r.notes().filter((e) => e.body.rung === "morning" && !e.body.quiet)).toHaveLength(3); // paused
  r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我看看日程" } });
  await r.settle();
  const ask = r.lastNote()!;
  expect(ask).toMatchObject({ rung: "morning", ask: "keep_note", opening: "早上那条还要吗？", finds: [] });
  await r.p.answer(ask.noteId, "keep_note", false);
  expect(r.settings.get().proactive).toBe("urgent");
  expect(r.lastNote()).toMatchObject({ revises: ask.noteId, answered: "no" });
});

test("at the month's budget it drops to 只说急的 and says so once", async () => {
  const r = make({ mode: "three", monthTokens: 3000 });
  await r.p.lookNow(40);
  const said = r.log.read({ stream: "channel", kinds: ["ai_msg"] }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said).toEqual(["oo 里的账号 这个月的额度用完了，这个月剩下的日子我只说急的。"]);
  await r.advance(HOUR + 2 * 60_000);
  expect(r.notes().every((e) => e.body.rung !== "morning")).toBe(true);
  expect(r.p.look("conn_oo")!.budgetPct).toBe(100);
});
