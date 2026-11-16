// D284: opening a long task feels instant. A fake home holds a 5,000-event task behind a
// simulated link (80 ms round trip, 4 Mbit/s); the page asks for the newest window first, and what
// it draws from (the store, the transcript's blocks and turns, the locator) is ready within the
// budget after the frame arrives. Older pages follow one at a time up to HISTORY_LIMIT, then only
// at the head; a cached task opens from the store, and a reconnect asks for the newest window again.
import { describe, expect, test } from "bun:test";
import type { ClientFrame, LogEvent, ServerFrame } from "@ducter/protocol";
import { longTask } from "@ducter/protocol/fixtures/longtask.ts";
import { olderPage, Store } from "../src/store.ts";
import { taskBlocks, taskTurns } from "../src/transcript.tsx";
import { HISTORY_FIRST, HISTORY_LIMIT, HISTORY_PAGE } from "../src/app.ts";

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
  test("the newest window paints within the budget; older pages follow, then stop at the limit", () => {
    const evs = longTask(5000);
    const ask = home(evs);
    const S = new Store();
    welcome(S);
    S.historyAsked("long1", HISTORY_FIRST);
    const first = ask({ t: "task_history", taskId: "long1", limit: HISTORY_FIRST });
    const ms = paint(S, first.json, "long1");
    console.log(`web: newest window ${Math.round(first.json.length / 1024)} KB, link ${Math.round(first.linkMs)} ms, ready ${ms.toFixed(1)} ms after it arrived`);
    expect(ms).toBeLessThan(300);
    const task = S.tasks.get("long1")!;
    expect(taskTurns(task).slice(-2).some((tu) => tu.body.some((b) => b.k === "voice" && b.text.startsWith("Round")))).toBe(true);
    let pages = 0;
    for (let before = olderPage(task, HISTORY_LIMIT); before; before = olderPage(task, HISTORY_LIMIT)) {
      S.historyAsked("long1", HISTORY_PAGE);
      expect(paint(S, ask({ t: "task_history", taskId: "long1", beforeSeq: before, limit: HISTORY_PAGE }).json, "long1")).toBeLessThan(300);
      pages++;
    }
    expect(task.events.length).toBeGreaterThanOrEqual(HISTORY_LIMIT);
    expect(task.events.length).toBeLessThan(HISTORY_LIMIT + HISTORY_PAGE);
    expect(pages).toBe(Math.ceil((HISTORY_LIMIT - HISTORY_FIRST) / HISTORY_PAGE));
    // At the head the reader gets more: no limit there.
    expect(olderPage(task)).toBe(task.histFrom);
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
