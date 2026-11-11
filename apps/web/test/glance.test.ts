// D206: the app opens onto its last screen at once and catches up from the home's delta; the
// full-screen change never waits on a frame WebKit holds.
import { describe, expect, test } from "bun:test";
import type { LogEvent, OnHand } from "@ducter/protocol";
import { GLANCE_KEY, keepEvents, loadGlance, saveGlance, type Glance } from "../src/glance.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let seq = 0;
const msg = (text: string, kind: "user_msg" | "ai_msg" = "user_msg", extra: Partial<LogEvent> = {}): LogEvent =>
  ({ seq: ++seq, ts: new Date(1_762_000_000_000 + seq * 1000).toISOString(), stream: "channel", origin: kind === "user_msg" ? "user" : "partner", kind, body: { text }, ...extra }) as LogEvent;
const onHand: OnHand = { tasks: [] } as unknown as OnHand;
const glance = (events: LogEvent[], device = "dev1"): Glance => ({ v: 1, device, persona: "default", personaName: "小鸭", headSeq: events.at(-1)?.seq ?? 0, events, onHand, savedAt: 1 });

describe("the last screen, kept on the device", () => {
  test("kept for the device it was saved for only", () => {
    const s = mem();
    const evs = [msg("帮我看看 CI"), msg("好，我去看。", "ai_msg")];
    expect(saveGlance(glance(evs), s)).toBe(true);
    expect(loadGlance("dev1", s)?.events.map((e) => e.seq)).toEqual(evs.map((e) => e.seq));
    expect(loadGlance("dev2", s)).toBeUndefined(); // another pairing starts clean
    s.setItem(GLANCE_KEY, "{not json");
    expect(loadGlance("dev1", s)).toBeUndefined();
  });

  test("channel events only, in order, superseded revisions dropped, the newest kept", () => {
    const a = msg("living 1", "ai_msg", { kind: "living_msg" } as Partial<LogEvent>);
    const b = msg("living 2", "ai_msg", { kind: "living_msg", supersedes: a.seq } as Partial<LogEvent>);
    const task = { ...msg("tool"), stream: "task:t1" } as LogEvent;
    const many = Array.from({ length: 10 }, (_, i) => msg(`m${i}`));
    const kept = keepEvents([b, task, a, ...many], 5);
    expect(kept.map((e) => e.seq)).toEqual(many.slice(-5).map((e) => e.seq));
    expect(keepEvents([b, task, a]).map((e) => e.seq)).toEqual([b.seq]);
  });

  test("too big for the storage: the newer half stays; nothing at all when even that fails", () => {
    const s = mem();
    let fail = 2;
    const tight = { ...s, setItem: (k: string, v: string) => (fail-- > 0 ? (() => { throw new Error("QuotaExceeded"); })() : s.setItem(k, v)) };
    const evs = Array.from({ length: 200 }, (_, i) => msg(`消息 ${i}`));
    expect(saveGlance(glance(evs), tight)).toBe(true);
    const back = loadGlance("dev1", s)!;
    expect(back.events.length).toBe(50);
    expect(back.events.at(-1)!.seq).toBe(evs.at(-1)!.seq);
    const never = { ...s, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(saveGlance(glance(evs), never)).toBe(false);
    expect(s.m.has(GLANCE_KEY)).toBe(false);
  });

  test("restored, the page shows the conversation, says hello with its cursor, and is not yet welcomed", async () => {
    const { A } = await import("../src/app.ts");
    const evs = [msg("今天的 CI 怎么样？"), msg("全绿。", "ai_msg")];
    A.restore(glance(evs));
    expect(A.S.welcomed).toBe(false); // nothing is sent before the home answers
    expect(A.S.cursor).toBe(evs.at(-1)!.seq); // hello asks only for what is newer
    expect(A.S.channel.length).toBe(2);
    expect(A.fromGlance).toBe(true);
    expect(A.summary()).not.toBe(A.L.t("conn.connecting")); // the last line, not "connecting"
    A.send = () => {};
    // The home's delta, then on_hand: caught up.
    A.receive({ t: "welcome", persona: "default", personaName: "小鸭", headSeq: seq + 1 } as never);
    A.receive({ t: "events", events: [msg("还有别的吗？")] } as never);
    A.receive({ t: "on_hand", onHand } as never);
    expect(A.fromGlance).toBe(false);
    expect(A.S.channel.length).toBe(3);
  });
});

describe("taking the whole screen", () => {
  test("the change's update callback never waits on a frame (WebKit holds them: a 4 s stall)", async () => {
    const { morph } = await import("../src/app.ts");
    const g = globalThis as any;
    const had = { document: g.document, matchMedia: g.matchMedia, raf: g.requestAnimationFrame };
    let done: Promise<void> | undefined;
    let applied = 0;
    g.document = { startViewTransition: (cb: () => Promise<void>) => void (done = cb()) };
    g.matchMedia = () => ({ matches: false });
    g.requestAnimationFrame = () => 0; // a frame that never comes, as inside WebKit's callback
    try {
      morph(() => void applied++);
      expect(applied).toBe(1);
      const settled = await Promise.race([done!.then(() => "done"), new Promise((r) => setTimeout(() => r("stalled"), 200))]);
      expect(settled).toBe("done");
    } finally {
      g.document = had.document;
      g.matchMedia = had.matchMedia;
      g.requestAnimationFrame = had.raf;
    }
  });
});
