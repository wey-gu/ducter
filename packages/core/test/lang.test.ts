// D292: languages beyond Chinese and English on the server. The conversation's language is any
// tag; the server's own words exist in zh and en and fall back through the chain (ko → en,
// zh-Hant → zh); a prompt tells the model the language by name.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, RoutineTrigger } from "@ducter/protocol";
import type { SettingsApi } from "@ducter/protocol/src/internal.ts";
import { intlLocale, langOfText, talkLang } from "../src/lang.ts";
import { openLog } from "../src/log.ts";
import { languageOf, waitFirstBrief } from "../src/newtask.ts";
import { followBrief } from "../src/proactive/engine.ts";
import type { Candidate } from "../src/proactive/candidate.ts";
import { barJudge, fitsBudget, judgePrompt } from "../src/proactive/judge.ts";
import { W } from "../src/proactive/words.ts";
import { decisionMessage, doneMessage, pushLocale, testMessage } from "../src/push.ts";
import { describeTrigger } from "../src/schedule.ts";
import { nextTryText } from "../src/until.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));

const auto = { get: () => ({ language: "auto" }) } as unknown as SettingsApi;
const set = (language: string) => ({ get: () => ({ language }) }) as unknown as SettingsApi;

test("a task's language: the words' own language when the setting follows the person", () => {
  expect(languageOf("이번 주 회의록을 정리해 줘", auto)).toBe("ko");
  expect(languageOf("来週の会議の議事録をまとめてください", auto)).toBe("ja");
  expect(languageOf("Resume las notas de la reunión de esta semana, por favor", auto)).toBe("es");
  expect(languageOf("整理一下这周的会议记录", auto)).toBe("zh");
  expect(languageOf("Tidy up this week's meeting notes", auto)).toBe("en");
  expect(languageOf("123", auto)).toBe("en"); // no language of its own: English
  // A chosen language wins over the words.
  expect(languageOf("Tidy up this week's meeting notes", set("ko"))).toBe("ko");
  expect(languageOf("이번 주 회의록을 정리해 줘", set("zh-Hant"))).toBe("zh-Hant");
});

test("the conversation's language comes from the Log after a restart; a neutral line keeps it", () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  const log = openLog({ path: `${t.dir}/log.db`, persona: "default" });
  expect(talkLang(auto, log)).toBeUndefined(); // nothing said yet
  for (const text of ["안녕하세요, 내일 일정 알려줘", "OK", "👍"]) log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } as Bodies["user_msg"] });
  expect(talkLang(auto, log)).toBe("ko");
  expect(talkLang(set("en"), log)).toBe("en"); // a chosen language wins
  log.close?.();
});

test("server-made words for a Korean conversation are English, for zh-Hant Chinese", () => {
  expect(waitFirstBrief("CI is green", "merge it", "ko")).toStartWith("First wait until: CI is green\nThen: merge it");
  expect(waitFirstBrief("CI 绿了", "合进去", "zh-Hant")).toStartWith("先等到：CI 绿了\n然后：合进去");
  expect(nextTryText(2, "테스트 통과", "1 failing", "ko")).toBe('Try 2: "테스트 통과" isn\'t true yet (1 failing). Keep going toward it, and report when this try is done.');
  const monday9: RoutineTrigger = { kind: "time", every: "week", days: [1], time: "09:00", zone: "personal", tz: "Asia/Seoul" };
  expect(describeTrigger(monday9, "ko")).toBe("Mondays 9:00 (follows your time zone)");
  expect(describeTrigger(monday9, "zh-Hant")).toBe("每周一 9:00（跟着你的时区）");
  expect(W.keepNote("ko")).toBe("Keep the morning note?");
  expect(W.keepNote("zh-Hant")).toBe("早上那条还要吗？");
  expect(W.muteRule("ko", "deadline", "Cloudflare")).toBe('Don\'t tell me "Deadlines and money" from Cloudflare');
  expect(langOfText("오늘 회의 몇 시야?")).toBe("ko");
  expect(langOfText("")).toBe("en");
  expect(intlLocale("zh")).toBe("zh-CN");
  expect(intlLocale("ko")).toBe("ko");
});

test("a push to a Korean phone is in English, to a zh-Hant one in Chinese; junk is English", () => {
  const d: Bodies["decision"] = { decisionId: "d1", taskId: "t1", question: "rebase?", goLabel: "rebase", defaultOption: "go", reversible: true, defaultAt: "2026-11-09T00:30:00Z" };
  const now = Date.parse("2026-11-09T00:00:00Z");
  expect(decisionMessage(d, { persona: "Ducter", locale: "ko", platform: "android", now })).toMatchObject({
    body: "rebase? If you don't answer, in 30 min I'll go with “Go: rebase”. It can be undone.",
    actions: [{ action: "go", title: "Go: rebase" }, { action: "hold", title: "Hold" }],
  });
  expect(decisionMessage(d, { persona: "Ducter", locale: "zh-Hant", platform: "android", now })).toMatchObject({
    body: "rebase? 30 分钟后你没回，我就按「好，rebase」办，之后还能改回来。",
    actions: [{ action: "go", title: "好，rebase" }, { action: "hold", title: "先等等" }],
  });
  expect(doneMessage({ taskId: "t1", title: "회의록" }, { persona: "Ducter", locale: "ko" }).body).toBe("Done: 회의록");
  expect(testMessage({ persona: "Ducter", locale: "zh-Hant" }).body).toBe("通知设好了。需要你的时候，我会这样告诉你。");
  expect(pushLocale("ko_kr")).toBe("ko-KR");
  expect(pushLocale("zh_TW")).toBe("zh-Hant");
  expect(pushLocale("xx-invalid!!")).toBe("en");
  expect(pushLocale(undefined)).toBe("en");
});

const cand: Candidate = {
  key: "k",
  kind: "deadline",
  cost: 70,
  urgent: false,
  people: [],
  how: [{ what: "Cloudflare · renews", at: "2026-10-17T01:12:00Z" }],
  words: { zh: "ducter.dev 11/16 到期（$10.44）。", en: "ducter.dev is due 11/16 ($10.44)." },
  step: { kind: "lookup", goLabel: { zh: "打开续费页", en: "Open the renewal page" }, brief: "…" },
  facts: ["f1"],
} as Candidate;

test("a proactive find for a Korean conversation: the model rewrites it in Korean by name; the fallback draft is English", async () => {
  const p = judgePrompt([cand], { lang: "ko", today: "2026-11-10", bars: {} });
  expect(p).toContain("Rewrite each kept one in Korean (한국어), at most two short sentences and about 60 characters");
  expect(p).toContain('"draft":"ducter.dev is due 11/16 ($10.44)."');
  expect(judgePrompt([cand], { lang: "es", today: "2026-11-10", bars: {} })).toContain("Rewrite each kept one in Spanish (Español), at most two short sentences:");
  expect((await barJudge([cand], { lang: "ko", today: "2026-11-10", bars: {} })).verdicts[0]!.text).toBe("ducter.dev is due 11/16 ($10.44).");
  expect((await barJudge([cand], { lang: "zh-Hant", today: "2026-11-10", bars: {} })).verdicts[0]!.text).toBe("ducter.dev 11/16 到期（$10.44）。");
  // Korean counts characters like Chinese (the phone-screen budget).
  expect(fitsBudget("ducter.dev 도메인이 11/16에 만료돼요. 등록된 카드가 만료됐어요.", "ko")).toBe(true);
  expect(fitsBudget("가".repeat(80), "ko")).toBe(false);
  expect(followBrief({ text: "x", how: [], step: cand.step }, "ko")).toContain("Report in Korean (한국어), in a few lines.");
});
