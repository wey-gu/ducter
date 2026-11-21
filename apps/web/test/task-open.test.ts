// D284: opening a long task feels instant. A fake home holds a 5,000-event task behind a
// simulated link (80 ms round trip, 4 Mbit/s); the page asks for the newest window first, and what
// it draws from (the store, the transcript's blocks and turns, the locator) is ready within the
// budget after the frame arrives. D320: older pages follow only for what is on screen and ahead of
// it (long-session.test.ts walks a 50,000-event session); a cached task opens from the store, and a
// reconnect asks for the newest window again.
import { describe, expect, test } from "bun:test";
import type { ClientFrame, LogEvent, ServerFrame } from "@ducter/protocol";
import { longTask } from "@ducter/protocol/fixtures/longtask.ts";
import { olderPage, Store, windowAsk } from "../src/store.ts";
import { indexOf, WINDOW } from "@ducter/protocol/src/session.ts";
import { taskBlocks, taskTurns } from "../src/transcript.tsx";
import { HISTORY_FIRST, HISTORY_LIMIT, HISTORY_PAGE } from "../src/app.ts";
import { budget } from "./slowness.ts";

type Req = Extract<ClientFrame, { t: "task_history" }>;

/** Answers task_history from one stream as core/src/ws.ts does; the link's time for its bytes. */
function home(evs: LogEvent[], rttMs = 80, bytesPerSec = 4e6 / 8) {
  return (r: Req): { json: string; linkMs: number } => {
    const end = r.beforeSeq ? evs.findIndex((e) => e.seq >= r.beforeSeq!) : evs.length;
    const to = end < 0 ? evs.length : end;
    const from = Math.max(0, to - (r.limit ?? 200));
    const f: ServerFrame = { t: "task_history", taskId: r.taskId, events: evs.slice(from, to), more: from > 0, ...(r.beforeSeq ? { beforeSeq: r.beforeSeq } : {}) };
    const json = JSON.stringify(f);
    return { json, linkMs: rttMs + (json.length / bytesPerSec) * 1000 };
  };
}

/** What the page does with a frame before it can draw: parse, store, the transcript. */
function paint(S: Store, json: string, id: string): number {
  const t0 = performance.now();
  S.apply(JSON.parse(json) as ServerFrame);
  const task = S.tasks.get(id)!;
  taskBlocks(task);
  taskTurns(task);
  return performance.now() - t0;
}

const welcome = (S: Store) => S.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as ServerFrame);

describe("opening a long task (D284)", () => {
  test("the newest window paints within the budget; older pages follow only ahead of what is on screen (D320)", () => {
    const evs = longTask(5000);
    const ask = home(evs);
    const S = new Store();
    welcome(S);
    S.historyAsked("long1", HISTORY_FIRST);
    const first = ask({ t: "task_history", taskId: "long1", limit: HISTORY_FIRST });
    const ms = paint(S, first.json, "long1");
    console.log(`web: newest window ${Math.round(first.json.length / 1024)} KB, link ${Math.round(first.linkMs)} ms, ready ${ms.toFixed(1)} ms after it arrived`);
    expect(ms).toBeLessThan(budget(300, ms));
    const task = S.tasks.get("long1")!;
    expect(taskTurns(task).slice(-2).some((tu) => tu.body.some((b) => b.k === "voice" && b.text.startsWith("Round")))).toBe(true);
    // D320: with its session index, pages come only for what is on screen and ahead of it: at the
    // end, enough to scroll up a little (WINDOW.ahead), then none until the reader moves.
    S.apply({ t: "task_index", taskId: "long1", index: indexOf(evs) } as ServerFrame);
    let pages = 0;
    for (let a = windowAsk(S, "long1", undefined); a; a = windowAsk(S, "long1", undefined)) {
      S.historyAsked("long1", a.limit);
      expect("beforeSeq" in a).toBe(true);
      const pageMs = paint(S, ask({ t: "task_history", taskId: "long1", ...(a as { beforeSeq: number; limit: number }) }).json, "long1");
      expect(pageMs).toBeLessThan(budget(300, pageMs));
      pages++;
    }
    expect(pages).toBe(Math.ceil(WINDOW.ahead / HISTORY_PAGE));
    expect(task.events.length).toBeLessThan(HISTORY_LIMIT);
    expect(task.events.map((e) => e.seq)).toEqual(evs.slice(-task.events.length).map((e) => e.seq));

    const before = home(evs)({ t: "task_history", taskId: "long1", limit: 2000 });
    const S2 = new Store();
    welcome(S2);
    const oldMs = paint(S2, before.json, "long1");
    console.log(`web: before (2,000 at once) ${Math.round(before.json.length / 1024)} KB, link ${Math.round(before.linkMs)} ms, ready ${oldMs.toFixed(1)} ms after it arrived`);
  });

  test.if(typeof DecompressionStream !== "undefined")("a large frame comes gzipped and unzips to the same frame", async () => {
    const { gunzip } = await import("../src/conn.ts");
    const json = home(longTask(400))({ t: "task_history", taskId: "long1", limit: HISTORY_FIRST }).json;
    const gz = Bun.gzipSync(Buffer.from(json));
    expect(await gunzip(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer)).toBe(json);
  });

  test("a reconnect marks the cache stale; a window that meets it keeps it whole", () => {
    const evs = longTask(400);
    const ask = home(evs, 0, 1e12);
    const S = new Store();
    welcome(S);
    S.historyAsked("long1", HISTORY_FIRST);
    paint(S, ask({ t: "task_history", taskId: "long1", limit: HISTORY_FIRST }).json, "long1");
    const task = S.tasks.get("long1")!;
    const older = olderPage(task)!;
    S.historyAsked("long1", HISTORY_PAGE);
    paint(S, ask({ t: "task_history", taskId: "long1", beforeSeq: older, limit: HISTORY_PAGE }).json, "long1");
    expect(task.histMore).toBe(false);
    expect(task.events).toHaveLength(400);
    welcome(S);
    expect(task.histStale).toBe(true);
    S.historyAsked("long1", HISTORY_FIRST);
    paint(S, ask({ t: "task_history", taskId: "long1", limit: HISTORY_FIRST }).json, "long1");
    expect(task).toMatchObject({ histStale: false, histMore: false, histFrom: evs[0]!.seq });
    expect(task.events).toHaveLength(400);
  });

  test("a home before D284 says nothing of more: a full page asks once more, an empty one stops", () => {
    const evs = longTask(250);
    const S = new Store();
    welcome(S);
    S.historyAsked("long1", HISTORY_FIRST);
    S.apply({ t: "task_history", taskId: "long1", events: evs.slice(-HISTORY_FIRST) } as ServerFrame);
    const task = S.tasks.get("long1")!;
    expect(olderPage(task)).toBe(evs[50]!.seq);
    S.historyAsked("long1", HISTORY_PAGE);
    S.apply({ t: "task_history", taskId: "long1", events: evs.slice(0, 50) } as ServerFrame);
    expect(olderPage(task)).toBeUndefined();
  });
});

// D456 (research/198 F1): an old task opened from ⌘K showed 在做 with a 144-hour clock and a Stop
// button: its newest window said done, then an older page (D320) brought its first "working" in.
test("an older page landing after the newest never turns a done task back to working", () => {
  const S = new Store();
  welcome(S);
  const ev = (seq: number, attention: string) => ({ seq, ts: new Date(1e12 + seq).toISOString(), persona: "default", stream: "task:old1", origin: "system", kind: "task_state", body: { taskId: "old1", attention, residency: "parked" } }) as unknown as LogEvent;
  S.apply({ t: "task_history", taskId: "old1", events: [ev(900, "done")], more: true } as ServerFrame);
  S.apply({ t: "task_history", taskId: "old1", events: [ev(10, "working")], beforeSeq: 900 } as ServerFrame);
  expect(S.tasks.get("old1")!.state?.attention).toBe("done");
  // A newer one still wins.
  S.apply({ t: "events", events: [ev(950, "working")] } as ServerFrame);
  expect(S.tasks.get("old1")!.state?.attention).toBe("working");
});
