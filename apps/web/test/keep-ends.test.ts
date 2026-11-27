// D650 (research/245 §3.8): the Keep's head says its end, its rounds and how long it has run; with no
// testable end it says so; a system pause says its reason in words; and the stall ask offers Change the
// end beside End and Six more rounds.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const keepSrc = readFileSync(join(import.meta.dir, "..", "src", "keep.tsx"), "utf8");
const viewsSrc = readFileSync(join(import.meta.dir, "..", "src", "views.tsx"), "utf8");

test("the head's end is a testable sentence, or says no end was given", async () => {
  const { A } = await import("../src/app.ts");
  const { keepEndWords, keepAgeWords, keepFacts, keepLine } = await import("../src/keep.tsx");
  A.L = strings("zh");
  const since = new Date(Date.now() - 40 * 60_000).toISOString();
  const k = {
    id: "kp_1",
    title: "独立复审远程访问设置并跟进 #11230",
    life: "on" as const,
    run: "same" as const,
    wakes: [{ kind: "every" as const, everyMs: 10 * 60_000 }],
    end: { sentence: "#11230 合并时结束", look: { kind: "pr" as const, ref: "nowledge-co/mem#11230", what: "merged" as const } },
    roundsRun: 5,
    items: [],
    taskIds: [],
    asks: 0,
    week: 0,
    since,
  };
  expect(keepEndWords(k)).toBe("#11230 合并时结束");
  expect(keepAgeWords(k)).toBe("跑了 40 分钟");
  // The end is its own fact now, not a short "until" among the facts (it has a whole line).
  expect(keepFacts(k).map((f) => f.text)).not.toContain("#11230 合并时结束");
  // With no testable end the head says what is true, never an invented sentence.
  expect(keepEndWords({ ...k, end: undefined, noEnd: true })).toBe("没有说什么时候结束");
  // A system pause says its reason in words, never a reason code.
  expect(keepLine({ ...k, life: "paused", pausedWhy: "这个月的用量到了上限（20M），等你决定" })).toBe("这个月的用量到了上限（20M），等你决定");
  // D291: a clock and its zone are two facts, never one dot-joined string.
  const cad = keepFacts({ ...k, everyMs: undefined, cadence: "每天 09:00 · 跟着你的时区" }).map((f) => f.text);
  expect(cad).toContain("每天 09:00");
  expect(cad).toContain("跟着你的时区");
  expect(cad.every((x) => !x.includes(" · "))).toBe(true);
});

test("the sheet draws the tally and the stall card offers Change the end", () => {
  expect(keepSrc).toContain("kp-tally");
  expect(keepSrc).toContain('t("keep.rounds.n", k.roundsRun)');
  expect(keepSrc).toContain("keepAgeWords(k)");
  expect(viewsSrc).toContain('d.keep?.ask === "stall"');
  expect(viewsSrc).toContain('t("keep.ask.changeEnd")');
  expect(viewsSrc).toContain('openKeep(d.keep!.id, "until")');
  // The stall card names the Keep and links to its page.
  expect(viewsSrc).toContain('class="asker keep-ask"');
  expect(viewsSrc).toContain("<span>{d.keep.title}</span>");
  expect(viewsSrc).toContain("openKeep(d.keep!.id)");
});
