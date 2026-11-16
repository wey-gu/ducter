// D292 (issue #5): the partner follows any language, not "Chinese or else English". Korean,
// Japanese, Traditional Chinese, Spanish, Russian, Arabic, mixed text; a message with no language
// of its own keeps the conversation's, and a restart reads it back from the Log.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { claimText, fixedOutcome, peerAnswer } from "../src/bridge-out.ts";
import { said } from "../src/words.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script, o: { settings?: Record<string, unknown>; fc?: ReturnType<typeof fakeCore>; clock?: FakeClock } = {}) {
  const clock = o.clock ?? new FakeClock();
  const base = o.fc ?? fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-lang-")));
  const core = o.settings ? { ...base.core, settings: { get: () => o.settings, setForgetter() {}, setMemState() {} } as any } : base.core;
  const fr = fakeRunner(script);
  fr.bindCards(base.cards);
  const partner = createPartner(core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, settleMs: 0 });
  const user = (text: string) => partner.onTrigger(base.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { clock, fc: base, fr, partner, user };
}
const ok: Script = (_i, s) => {
  s.say("ok");
  s.end();
};
const lastInput = (fr: ReturnType<typeof fakeRunner>) => {
  const ins = fr.sessions[fr.sessions.length - 1]!.inputs;
  return ins[ins.length - 1]!;
};

describe("D292: the language of each message, by name", () => {
  const cases: [string, string][] = [
    ["안녕하세요. 오늘 어떤 일을 도와줄 수 있나요?", "Korean (한국어)"],
    ["이 PR 리뷰해줘 please", "Korean (한국어)"],
    ["今日の会議のメモをまとめてください", "Japanese (日本語)"],
    ["幫我看一下這個測試為什麼掛了", "Traditional Chinese (繁體中文)"],
    ["¿Puedes revisar el informe de hoy?", "Spanish (Español)"],
    ["Привет, можешь проверить отчёт?", "Russian (Русский)"],
    ["مرحبا، هل يمكنك مساعدتي اليوم؟", "Arabic (العربية)"],
  ];
  for (const [text, name] of cases)
    test(`${name}: ${text}`, async () => {
      const { fr, partner, user } = setup(ok);
      user(text);
      await partner.idle();
      expect(lastInput(fr)).toContain(`[language] The user wrote this in ${name}: reply in ${name}, including the first line.`);
      expect(lastInput(fr)).not.toContain("in English");
    });

  test("OK, a number, an emoji and code keep the language before them", async () => {
    const { fr, partner, user } = setup(ok);
    user("안녕하세요");
    await partner.idle();
    for (const t of ["OK", "123", "👍", "```\nbun test\n```"]) {
      user(t);
      await partner.idle();
      expect(lastInput(fr)).toContain("the user writes in Korean (한국어): reply in Korean (한국어).");
    }
  });

  test("a first message with no language names none", async () => {
    const { fr, partner, user } = setup(ok);
    user("👍");
    await partner.idle();
    expect(lastInput(fr)).not.toContain("[language]");
  });

  test("after a restart the conversation's language is read back from the Log", async () => {
    const clock = new FakeClock();
    const first = setup(ok, { clock });
    first.user("회의록 정리해 줘");
    await first.partner.idle();
    first.user("OK");
    await first.partner.idle();
    await first.partner.close?.();
    // A new partner over the same Log (Ducter restarted): "👍" is still Korean.
    const second = setup(ok, { clock, fc: first.fc });
    second.user("👍");
    await second.partner.idle();
    expect(lastInput(second.fr)).toContain("the user writes in Korean (한국어): reply in Korean (한국어).");
  });

  test("a fixed reply language: any language, by name", async () => {
    const { fr, partner, user } = setup(ok, { settings: { language: "ja" } });
    user("Can you check the tests?");
    await partner.idle();
    expect(lastInput(fr)).toContain("[language] The user asked you to always reply in Japanese (日本語).");
  });

  test("a Korean user's task reports in Korean; the code's own ack falls back to English words", async () => {
    let fc!: ReturnType<typeof fakeCore>;
    const s = setup(async (_i, sess) => {
      await fc.callTool("task_open", { title: "회의록 정리", brief: "b" });
      sess.end();
    });
    fc = s.fc;
    s.user("오늘 회의록 정리해 줘");
    await s.partner.idle();
    expect(s.fr.opened[0]!.language).toBe("ko");
    const ack = s.fc.events.find((e) => e.kind === "ack")?.body as Bodies["ack"] | undefined;
    expect(ack?.text).toBe("On it: 회의록 정리");
  });

  test("a report turn for a Korean user names Korean, and an English result is held back and asked again in Korean", async () => {
    const REPORT = "Installed standalone CLI 0.10.116 and native Codex plugin 0.1.49 with hooks enabled; all doctor checks pass.";
    let turn = 0;
    let fc!: ReturnType<typeof fakeCore>;
    const s = setup(async (_i, sess) => {
      turn++;
      if (turn === 1) await fc.callTool("task_open", { title: "Mem 연결", brief: "b" });
      else if (turn === 2) sess.say(REPORT);
      else sess.say("Mem 연결됐어요. 검사도 모두 통과했어요.");
      sess.end();
    });
    fc = s.fc;
    s.user("Nowledge Mem 을 Codex 에 연결해 줘");
    await s.partner.idle();
    s.partner.onTrigger(fc.core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: REPORT, questions: [], evidence: [] } }));
    await s.partner.idle();
    const inputs = s.fr.sessions[0]!.inputs;
    expect(inputs[1]).toContain("[language] The user speaks Korean (한국어): reply in Korean (한국어). A task's report above is its own words");
    expect(inputs[2]).toContain("The user reads Korean (한국어). Say it again now in Korean (한국어)");
    const msgs = s.fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text);
    expect(msgs).toEqual(["Mem 연결됐어요. 검사도 모두 통과했어요."]);
  });
});

describe("D292: what the code says to other agents and on its own", () => {
  test("another agent's request: its language when there is a table, English otherwise", () => {
    expect(claimText("帮我修测试", "Fix runner tests")).toBe("接了：「Fix runner tests」。做完把结果回你。");
    expect(claimText("幫我修測試", "Fix")).toBe("接了：「Fix」。做完把结果回你。"); // zh-Hant → zh
    expect(claimText("테스트 고쳐 줘", "Fix")).toBe('Taken: "Fix". I\'ll send you the result when it\'s done.');
    expect(fixedOutcome("¿Puedes arreglarlo?", "Fix", true)).toBe('"Fix": done.');
    expect(peerAnswer("ko", "hold")).toBe("The user says not now. Don't act on this; ask again later.");
    expect(peerAnswer("zh", "go", "改签名")).toBe("用户选了：「改签名」");
  });

  test("said: zh joins a Latin name with a space, other languages fill", () => {
    expect(said("zh", "trustQuestion", { agent: "Codex" })).toBe("以后 Codex 发来的事，直接接下？");
    expect(said("zh", "trustQuestion", { agent: "小鸭" })).toBe("以后小鸭发来的事，直接接下？");
    expect(said("en", "ack", { title: "x" })).toBe("On it: x");
    expect(said("ko", "sendGo")).toBe("Send");
  });
});
