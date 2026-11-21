// D453: an offer never needs the person. Its decision lives in its note only: no On hand row, no
// needs-you face or count, no talk card; it has no Hold, folds past the first three under
// 还有几条 / A few more, and fades (its words stay, muted, no "missed" word) when nothing came of it.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

let n = 0;
const ev = (kind: string, body: unknown): LogEvent => ({ seq: ++n, ts: new Date(1_763_000_000_000 + n * 1000).toISOString(), persona: "default", stream: "channel", origin: "partner", kind, body }) as LogEvent;

test("an offer's decision is not an open decision; an ask from a find that is not an offer still is", () => {
  const s = new Store();
  s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
  s.apply({
    t: "events",
    events: [
      ev("decision", { decisionId: "d_offer", question: "Lina asked you twice about the report.", goLabel: "Draft a reply", defaultOption: "hold", reversible: false, findId: "f1", offer: true }),
      ev("decision", { decisionId: "d_now", question: "CA930 moved to 10:40.", goLabel: "Look up options", defaultOption: "hold", reversible: false, findId: "f2" }),
    ],
  });
  expect(s.openDecisions().map((d) => d.decisionId)).toEqual(["d_now"]);
  expect(s.partnerDecisions().map((d) => d.decisionId)).toEqual(["d_now"]);
});

test("the words: a few more and show fewer, both languages, never a count", () => {
  const zh = { "find.more": strings("zh").t("find.more"), "find.fewer": strings("zh").t("find.fewer"), "proactive.note.default": strings("zh").t("proactive.note.default") };
  const en = { "find.more": strings("en").t("find.more"), "find.fewer": strings("en").t("find.fewer"), "proactive.note.default": strings("en").t("proactive.note.default") };
  expect([zh["find.more"], zh["find.fewer"], en["find.more"], en["find.fewer"]]).toEqual(["还有几条", "收起", "A few more", "Show fewer"]);
  for (const s of [zh["find.more"], en["find.more"], zh["proactive.note.default"], en["proactive.note.default"]]) expect(s).not.toMatch(/\d+ ?[件条个]/);
});

test("the note: no Hold on an offer, the fold after three, a faded offer keeps its words and says nothing about it", () => {
  const src = readFileSync(join(import.meta.dir, "../src/finds.tsx"), "utf8");
  expect(src).toContain('{!f.offer && <Btn kind="text" size="sm" label={t("decision.hold")}');
  expect(src).toContain("OFFER_SHOWN");
  expect(src).toContain('faded ? null : <div class="small sub">{t("find.passed")}</div>');
});

test("D458: the kinds from past the accounts and their sources have words in both languages; the origin line is shown under the words", () => {
  const zh = strings("zh");
  const en = strings("en");
  expect(["next_step", "remembered", "loose_end"].map((k) => zh.t(`kind.${k}`))).toEqual(["接着可以做的", "记得的", "你提过的"]);
  expect(["next_step", "remembered", "loose_end"].map((k) => en.t(`kind.${k}`))).toEqual(["A next step", "Remembered", "You mentioned"]);
  expect([zh.t("find.src.task"), zh.t("find.src.mem"), en.t("find.src.task"), en.t("find.src.mem")]).toEqual(["任务", "记忆", "Task", "Memory"]);
  const src = readFileSync(join(import.meta.dir, "../src/finds.tsx"), "utf8");
  expect(src).toContain('{f.origin && <div class="small sub forigin">{f.origin}</div>}');
});

test("D464: opening 怎么知道的, or 还有几条, tells the home which finds were opened (counted once there, never learned from)", () => {
  const src = readFileSync(join(import.meta.dir, "../src/finds.tsx"), "utf8");
  expect(src).toContain('if (!how) A.openFinds([f.findId], "how");');
  expect(src).toContain('if (!more) A.openFinds(n.finds.filter((f) => f.offer).slice(OFFER_SHOWN).map((f) => f.findId), "more");');
  const app = readFileSync(join(import.meta.dir, "../src/app.ts"), "utf8");
  expect(app).toContain('if (findIds.length) this.send({ t: "find_open", findIds, what });');
});
