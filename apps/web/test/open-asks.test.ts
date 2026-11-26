// D-PENDING: the web client's count and every list read the same open predicate as the home
// (protocol's open-asks.ts). A picks offer past its time was counted while the note hid it; now
// neither counts it. The shared fixture is also read by the protocol and the Mac.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askOpen } from "@ducter/protocol/src/open-asks.ts";
import { Store } from "../src/store.ts";

interface Fixture {
  now: string;
  cases: { name: string; decision: Parameters<typeof askOpen>[0]; state?: Parameters<typeof askOpen>[1]; open: boolean }[];
}
const f = JSON.parse(readFileSync(join(import.meta.dir, "../../../packages/protocol/fixtures/open-asks.json"), "utf8")) as Fixture;
const now = Date.parse(f.now);

let seq = 0;
const ev = (kind: string, body: unknown) => ({ seq: ++seq, ts: new Date(now).toISOString(), persona: "default", stream: "channel", origin: "partner", kind, body }) as never;
const store = () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as never);
  return s;
};

test("the shared predicate's cases, as the protocol and the Mac read them", () => {
  for (const c of f.cases) expect({ name: c.name, open: askOpen(c.decision, { ...c.state, now }) }).toEqual({ name: c.name, open: c.open });
});

test("a picks offer past its defaultAt is not an open decision: the count is 0 and the list has nothing", () => {
  const s = store();
  s.apply({ t: "events", events: [ev("decision", { decisionId: "d_picks", question: "今天能替你清掉这 3 个。", goLabel: "交给Ducter", defaultOption: "hold", defaultAt: "2026-11-23T09:00:00.000Z", reversible: false, findId: "find_1", offer: true, src: { kind: "picks" } })] });
  expect(s.openDecisions()).toEqual([]);
  expect(s.partnerDecisions()).toEqual([]);
  // The very same shape without the offer flag (an older home's picks): its time passed, so it is
  // settled, not a count for a question no list can answer.
  s.apply({ t: "events", events: [ev("decision", { decisionId: "d_picks_old", question: "昨天替你清掉了 1 个。今天能替你清掉这 3 个。", goLabel: "交给Ducter", defaultOption: "hold", defaultAt: "2026-11-24T09:00:00.000Z", reversible: false, findId: "find_0", src: { kind: "picks" } })] });
  expect(s.openDecisions()).toEqual([]);
  expect(s.partnerDecisions()).toEqual([]);
});

test("the count and the visible list are one list: every open partner question is drawn and counted", () => {
  const s = store();
  s.apply({
    t: "events",
    events: [
      ev("decision", { decisionId: "d_open", question: "要现在再跑一轮吗？", goLabel: "现在跑一次", defaultOption: "hold", reversible: true, loop: { taskId: "b7gw6r2e" } }),
      ev("decision", { decisionId: "d_offer", question: "今天能替你清掉这 3 个。", goLabel: "交给Ducter", defaultOption: "hold", defaultAt: "2026-11-23T09:00:00.000Z", reversible: false, findId: "f1", offer: true, src: { kind: "picks" } }),
    ],
  });
  const list = s.openDecisions();
  expect(list.map((d) => d.decisionId)).toEqual(["d_open"]);
  // The count in app.ts is needsYouItems: the task lanes (none) plus this same partner list.
  expect(s.partnerDecisions().length).toBe(list.length);
});

test("the header's count is the visible list's length, with a picks offer and one open question", async () => {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const { strings } = await import("../src/i18n.ts");
  A.L = strings("zh");
  A.S = store();
  A.S.welcomed = true;
  A.S.apply({
    t: "events",
    events: [
      ev("decision", { decisionId: "d_open2", question: "要现在再跑一轮吗？", goLabel: "现在跑一次", defaultOption: "hold", reversible: true, loop: { taskId: "b7gw6r2e" } }),
      ev("decision", { decisionId: "d_offer2", question: "今天能替你清掉这 3 个。", goLabel: "交给Ducter", defaultOption: "hold", defaultAt: "2026-11-23T09:00:00.000Z", reversible: false, findId: "f2", offer: true, src: { kind: "picks" } }),
    ],
  });
  expect(A.needsCount()).toBe(1);
  expect(A.needsCount()).toBe(o.doorItems("").length); // the list the header opens
});
