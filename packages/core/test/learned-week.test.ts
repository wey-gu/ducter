// D304: 这周记下的 / What it learned this week. The week's first morning note offers, once, to show
// what it noted in the last 7 days; corrections and confirmations are kept, and a correction goes
// to Mem through the partner's corrector (a fake here; never the real nmem).
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { rig, type Rig } from "./proactive-rig.ts";

let r: Rig | undefined;
afterEach(() => r?.stop());
const DAY = 86_400_000;

const note = (rr: Rig, title: string, memoryId?: string) => rr.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title, ...(memoryId ? { memoryId } : {}) } });

describe("the week's offer in the morning note", () => {
  test("first morning of the week: offered with the count; not again that week; again the next week", async () => {
    r = rig({ mode: "three" });
    note(r, "周报每周五下午发", "m1");
    note(r, "开会前一天提醒", "m2");
    await r.p.morning();
    expect(r.lastNote()?.learned).toEqual({ count: 2 });
    // The notification never carries it.
    for (const s of r.sent) expect(JSON.stringify(s)).not.toContain("记下");
    await r.advance(DAY);
    await r.p.morning();
    expect(r.notes().filter((e) => (e.body as Bodies["finds"]).learned).length).toBe(1);
    note(r, "报销单每月 25 号前交", "m3");
    await r.advance(6 * DAY); // Monday came: its morning note offers the new week (the three lines are within 7 days)
    const offers = r.notes().map((e) => (e.body as Bodies["finds"]).learned).filter(Boolean);
    expect(offers).toEqual([{ count: 2 }, { count: 3 }]);
  }, 60_000); // a week of the fake clock, a minute at a time: past 5 s on a busy machine

  test("nothing noted, or memory off: no offer", async () => {
    r = rig({ mode: "three" });
    await r.p.morning();
    expect(r.notes().some((e) => (e.body as Bodies["finds"]).learned)).toBe(false);
    r.stop();
    r = rig({ mode: "three" });
    note(r, "x", "m1");
    r.settings.set({ memory: false });
    await r.p.morning();
    expect(r.notes().some((e) => (e.body as Bodies["finds"]).learned)).toBe(false);
  });
});

describe("confirm, correct, forget", () => {
  test("a correction reaches Mem and the line reads the person's words; a confirmation is kept", async () => {
    r = rig({ mode: "off" });
    const a = note(r, "周报每周四发", "m1");
    const b = note(r, "开会前一天提醒", "m2");
    const c = note(r, "没有 id 的一条");
    const asked: [string, string][] = [];
    r.settings.setCorrector((id, t) => (asked.push([id, t]), Promise.resolve(true)));
    expect(await r.settings.correct(a.seq, "  周报每周五下午发 \n")).toBe("mem");
    expect(asked).toEqual([["m1", "周报每周五下午发"]]);
    expect(await r.settings.correct(c.seq, "改过的")).toBe("here");
    expect(r.settings.confirm(b.seq)).toBe(true);
    expect(await r.settings.correct(b.seq, "   ")).toBeUndefined();
    const noted = (await r.settings.view()).mem.noted;
    expect(noted.find((n) => n.seq === a.seq)).toMatchObject({ title: "周报每周五下午发", corrected: true, confirmed: true });
    expect(noted.find((n) => n.seq === b.seq)).toMatchObject({ title: "开会前一天提醒", confirmed: true });
    expect(noted.find((n) => n.seq === c.seq)).toMatchObject({ title: "改过的", corrected: true });
  });

  test("forgetting a 想起了 line forgets its memory in Mem and the view lists it as forgotten", async () => {
    r = rig({ mode: "off" });
    const ai = r.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "周五下午。" } });
    const line = r.log.append({ stream: "channel", origin: "partner", kind: "memory_recalled", body: { memoryId: "m_cc", title: "t", by: "tool", from: "Claude Code", aboutSeq: ai.seq } });
    const forgot: string[] = [];
    r.settings.setForgetter((id) => (forgot.push(id), Promise.resolve({ ok: true })));
    expect(await r.settings.forget(line.seq)).toBe("mem");
    expect(forgot).toEqual(["m_cc"]);
    expect((await r.settings.view()).mem.forgotten).toEqual([line.seq]);
  });
});
