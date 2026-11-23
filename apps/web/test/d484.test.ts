// D484: the opened task on a phone. On the author's phone, the header's branch mark (three linked
// circles, read as the share glyph) opened a bare `.sheet` without research/123's frame, which drew
// as a 50-point sliver in the header under a grey scrim; a provider's raw error was the agent's
// words, twice; the PR was nowhere to tap. These check the pieces that are computed.
import { describe, expect, test } from "bun:test";
import type { Block } from "@ducter/protocol/src/transcript.ts";
import { prNumber, prRef, providerError, providerErrorKey, shareText, taskLink } from "../src/task-words.ts";
import { strings } from "../src/i18n.ts";

const AGY = "⚠ INVALID_ARGUMENT (code 400): * GenerateContentRequest.tools[0].function_declarations[18].parameters.properties[check].properties[succeedWhen].properties[oneOf].items: missing field.";

describe("D484 a provider's raw error", () => {
  test("Gemini's error as agy printed it is read with its code; ordinary words are not", () => {
    expect(providerError(AGY)).toMatchObject({ status: "INVALID_ARGUMENT", code: 400 });
    expect(providerError("RESOURCE_EXHAUSTED (code 429): quota")?.code).toBe(429);
    expect(providerError("改完了，开了草稿 PR #212。")).toBeUndefined();
    expect(providerError("The API (code 400) docs say so")).toBeUndefined();
  });
  test("each code family has its line in both languages", () => {
    expect(providerErrorKey(400)).toBe("perr.refused");
    expect(providerErrorKey(403)).toBe("perr.auth");
    expect(providerErrorKey(429)).toBe("perr.limit");
    expect(providerErrorKey(503)).toBe("perr.down");
    for (const lang of ["zh", "en"] as const) {
      const L = strings(lang);
      for (const k of ["perr.refused", "perr.auth", "perr.limit", "perr.down", "perr.other", "perr.why", "perr.times", "share.button", "share.title", "share.copy", "share.copy.link", "share.link.note", "tsheet.title", "tsheet.bench", "pr.open"]) expect(L.t(k, "Antigravity")).not.toBe(k);
    }
  });
  test("the same error again in a turn is one line with how many times; the runner's own error line goes", async () => {
    const { foldErrors } = await import("../src/transcript.tsx");
    const body: Block[] = [
      { k: "voice", seq: 2, text: AGY },
      { k: "note", seq: 3, say: "error", text: "turn failed", bad: true },
      { k: "voice", seq: 4, text: AGY },
      { k: "note", seq: 5, say: "stalled", text: "no report" },
      { k: "note", seq: 6, say: "mend_stall", text: "mend" },
    ];
    const out = foldErrors(body);
    expect(out.map((x) => [x.b.seq, x.times])).toEqual([
      [2, 2],
      [6, 1],
    ]);
  });
});

describe("D484 the task's PR and what Share sends", () => {
  test("the PR: opened from Ducter first, else the newest PR link in its reports", () => {
    expect(prRef({ integrated: { act: "open_pr", ref: "https://github.com/a/b/pull/7" }, links: ["https://github.com/a/b/pull/1"] })).toBe("https://github.com/a/b/pull/7");
    expect(prRef({ acted: { action: "open_pr", ok: true, ref: "https://github.com/a/b/pull/8" }, links: [] })).toBe("https://github.com/a/b/pull/8");
    expect(prRef({ links: ["https://ducter.ai", "https://github.com/nowledge-co/mem/pull/212"] })).toBe("https://github.com/nowledge-co/mem/pull/212");
    expect(prRef({ links: ["https://github.com/a/b/issues/3"] })).toBeUndefined();
    expect(prNumber("https://github.com/nowledge-co/mem/pull/212")).toBe("212");
  });
  test("one fact a line: the name, where it stands, its words to the person, the PR", () => {
    const zh = shareText({ name: strings("zh").t("share.name", "用 Gemini 审改 Mem 长文案并开 PR"), state: "等 PR #212 的 CI 跑完", said: "41 段改完，开了草稿 PR #212。", pr: "https://github.com/nowledge-co/mem/pull/212" });
    expect(zh.split("\n")).toEqual(["「用 Gemini 审改 Mem 长文案并开 PR」", "等 PR #212 的 CI 跑完", "41 段改完，开了草稿 PR #212。", "https://github.com/nowledge-co/mem/pull/212"]);
    expect(zh).not.toContain(" · ");
    const en = shareText({ name: strings("en").t("share.name", "Fix the flaky test"), state: "Done" });
    expect(en).toBe('"Fix the flaky test"\nDone');
    expect(taskLink("https://hel.example/", "t_agy")).toBe("https://hel.example/app#task=t_agy");
  });
});
