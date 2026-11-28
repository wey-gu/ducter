// D674: `ducter proactive review [--week] [--label id=yes|no|stop]` reads and writes the same
// store as the morning note's review card (the home's Log): a label from the CLI shows on the card's
// list, a label from the card shows in the CLI, and `ducter proactive week` reads them.
import { afterEach, expect, test } from "bun:test";
import type { ClientFrame, ServerFrame, ShadowGate } from "@ducter/protocol";
import type { Conn } from "../src/client.ts";
import { cmdProactive, gateLines, reviewLines } from "../src/proactive-cmd.ts";
import { translator } from "../src/i18n.ts";
import { rig, type Rig } from "@ducter/core/test/proactive-rig.ts";

let r: Rig | undefined;
afterEach(() => {
  r?.stop();
  r = undefined;
});

const ref = (id: string) => ({ connectionId: "c", service: "gmail", id });

/** A socket that answers the two review frames from the rig's engine, as ws.ts does. */
function conn(rr: Rig): Conn {
  const queue: ServerFrame[] = [];
  return {
    send(f: ClientFrame) {
      if (f.t === "shadow_review") queue.push({ t: "shadow_review_result", review: rr.p.shadowReview(f.week === true) });
      if (f.t === "shadow_label") {
        const res = rr.p.shadowLabel(f.findingId, f.verdict);
        queue.push("review" in res ? { t: "shadow_review_result", review: res.review } : { t: "shadow_review_result", error: res.error });
      }
    },
    next: (async (match: (f: ServerFrame) => boolean) => {
      const i = queue.findIndex(match);
      return i < 0 ? undefined : queue.splice(i, 1)[0];
    }) as Conn["next"],
  } as unknown as Conn;
}

async function home(): Promise<Rig> {
  const rr = rig({ mode: "useful" });
  rr.p.ledger.add([
    { ref: ref("m1"), label: "MU 523", at: "2026-11-08T10:00:00+08:00", type: "booking", what: "flight", name: "MU 523", place: "Osaka", start: "2026-12-03T10:50:00+08:00", end: "2026-12-03T14:20:00+09:00" },
    { ref: ref("m2"), label: "Shibuya Stream", sender: "Hotels.com", at: "2026-11-08T10:00:00+08:00", type: "booking", what: "hotel", name: "Shibuya Stream", place: "Tokyo", start: "2026-12-03", end: "2026-12-07" },
  ] as never);
  rr.p.setModels({ cross: async (facts) => ({ findings: [{ facts: facts.filter((f) => f.label === "MU 523" || f.label === "Shibuya Stream").map((f) => f.id), text: "Lands in Osaka, sleeps in Tokyo.", why: "a night lost", next: "check the hotel", confidence: 0.9 }], tokens: 100 }) });
  await rr.p.cross("asked");
  return rr;
}

test("the CLI labels into the card's store, and lists what the card labelled", async () => {
  r = await home();
  const t = translator("en");
  const item = r.p.shadowReview().items.find((i) => i.source === "shadow")!;
  const lines: string[] = [];
  const code = await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: ["review"], labels: [`${item.id}=yes`], conn: conn(r), print: (l) => lines.push(l) });
  expect(code).toBe(0);
  expect(lines[0]).toBe(`Kept: ${item.id}, Should have said it.`);
  // The card's list (the engine's review) now carries the CLI's verdict.
  expect(r.p.shadowReview().items.find((i) => i.id === item.id)!.verdict).toBe("yes");
  const text = lines.join("\n");
  expect(text).toContain(`[${item.id}] Lands in Osaka, sleeps in Tokyo.`);
  expect(text).toContain("Mail  2026-11-08  Shibuya Stream  Hotels.com");
  expect(text).toContain("The gate is shut");
  // The card labels another item; the CLI shows it, in zh too.
  const other = r.p.shadowReview().items.find((i) => i.id !== item.id);
  if (other) r.p.shadowLabel(other.id, "no");
  const zh: string[] = [];
  expect(await cmdProactive({ t: translator("zh"), target: { kind: "local", port: 1 }, json: false, rest: ["review"], lang: "zh", conn: conn(r), print: (l) => zh.push(l) })).toBe(0);
  expect(zh.join("\n")).toContain("应该早说");
  if (other) expect(zh.join("\n")).toContain("不该说");
  // The same label twice is one event.
  await cmdProactive({ t, target: { kind: "local", port: 1 }, json: true, rest: ["review"], labels: [`${item.id}=yes`], conn: conn(r), print: () => {} });
  expect(r.log.read({ stream: "partner", kinds: ["shadow_labels"] })).toHaveLength(other ? 2 : 1);
});

test("a bad label is usage; an unknown id says so and fails", async () => {
  r = await home();
  const t = translator("en");
  const lines: string[] = [];
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: ["review"], labels: ["abc=maybe"], conn: conn(r), print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter proactive review");
  lines.length = 0;
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: ["review"], labels: ["deadbeef=no"], conn: conn(r), print: (l) => lines.push(l) })).toBe(1);
  expect(lines[0]).toBe("No item deadbeef in the review.");
});

test("the gate's lines name why it stands, with its counts", () => {
  const t = translator("en");
  const g: ShadowGate = { pass: true, why: "pass", weeks: 1, labelled: 6, mattered: 4, detectors: { flagged: 2, found: 1, precision: 0.5 }, shadow: { flagged: 5, found: 3, precision: 0.6 }, together: { found: 4 }, retire: [] };
  const lines = gateLines(t, g);
  expect(lines[0]).toContain("The gate is open");
  expect(lines[1]).toContain("detectors found 1 of 2 flagged (50%); the model 3 of 5 (60%); together 4");
  expect(reviewLines(t, { from: "2026-11-02", to: "2026-11-10", items: [], gate: { ...g, pass: false, why: "no_labels", labelled: 0 } }, "en")).toEqual(["What Ducter noticed and didn't say, Nov 2 – Nov 10: 0 in all, 0 waiting for your word", "  Nothing noticed in these days.", "", "The gate is shut: nothing labelled yet. Nothing the model notices is said."]);
});
