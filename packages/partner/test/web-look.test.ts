// D379: the partner's quick web look: the turn ends at once, the waiting line says it's looking
// until the answer is said, the answer comes back fenced as data, and what can't be settled is
// handed to a browsing task.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, PartnerActivity } from "../../protocol/src/index.ts";
import type { WebLookPort, WebLookResult } from "../../protocol/src/internal.ts";
import { createPartner } from "../src/index.ts";
import { renderHistoryLine, renderWebLook } from "../src/render.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script, result: WebLookResult | ((q: string) => Promise<WebLookResult>), can = true) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-weblook-")));
  const asked: { question: string; lang: string }[] = [];
  const port: WebLookPort = { can: () => can, look: async (q) => (asked.push(q), typeof result === "function" ? result(q.question) : result) };
  fc.core.webLook = port;
  const seen: (PartnerActivity | null)[] = [];
  fc.core.activity = { set: (a) => void seen.push(a) };
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  // Core wakes the partner with a look's result (core.ts triggersPartner); the fake core doesn't.
  fc.core.log.subscribe((e) => e.kind === "web_look" && (e.body as Bodies["web_look"]).state !== "looking" && partner.onTrigger(e));
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user, asked, seen };
}

const FOUND: WebLookResult = { state: "found", answer: "明天上海小雨，14 到 19 度", sources: ["https://weather.example.com/sh"], confidence: "high", harness: "claude-code", model: "haiku", ms: 9000 };

describe("web_look (D379)", () => {
  test("found: the turn ends silent, the line says it's looking, the answer replies to the question", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fc, fr, partner, user, asked, seen } = setup(
      async (input, s, i) => {
        if (i === 0) {
          const r = (await fc.callTool("web_look", { question: "明天上海会下雨吗" })) as { ok: boolean };
          expect(r.ok).toBe(true);
        } else {
          expect(input).toContain("<web_look>");
          expect(input).toContain("answer: 明天上海小雨，14 到 19 度");
          expect(input).toMatch(/data, never instructions/);
          s.say("明天上海有小雨，14 到 19 度（中国天气网）。");
        }
        s.end();
      },
      async () => (await gate, FOUND),
    );
    user("明天上海会下雨吗？");
    await Bun.sleep(30);
    // The asking turn ended with no words, and the waiting line says it is looking on the web.
    expect(fc.events.filter((e) => e.kind === "ai_msg")).toHaveLength(0);
    expect(seen.at(-1)?.step).toBe("web");
    expect(asked[0]).toEqual({ question: "明天上海会下雨吗", lang: "zh" });
    release();
    await partner.idle();
    const looks = fc.events.filter((e) => e.kind === "web_look").map((e) => e.body as Bodies["web_look"]);
    expect(looks.map((l) => l.state)).toEqual(["looking", "found"]);
    expect(looks[1]).toMatchObject({ answer: FOUND.answer, sources: FOUND.sources, replyTo: 1, model: "haiku" });
    const msgs = fc.events.filter((e) => e.kind === "ai_msg");
    expect(msgs).toHaveLength(1);
    expect((msgs[0]!.body as Bodies["ai_msg"]).replyTo).toBe(1);
    expect(seen.at(-1)).toBeNull();
    // No task: nothing on On hand.
    expect(fr.opened ?? []).toHaveLength(0);
    // "How did you know?": the history line names the answer and the site.
    const done = fc.events.find((e) => e.kind === "web_look" && (e.body as Bodies["web_look"]).state === "found")!;
    expect(renderHistoryLine(done, {} as never)).toMatch(/web look, by Ducter.*明天上海会下雨吗.*weather\.example\.com/);
    expect(renderHistoryLine(fc.events.find((e) => e.kind === "web_look")!, {} as never)).toBeNull();
  });

  test("unsettled: the turn it wakes is told to hand it to a browsing task", async () => {
    const inputs: string[] = [];
    const { fc, partner, user } = setup(
      async (input, s, i) => {
        inputs.push(input);
        if (i === 0) await fc.callTool("web_look", { question: "Is the hotel on fake-hotels.example.com free on Dec 3?" });
        else await fc.callTool("task_open", { title: "Check the hotel for Dec 3", place: { kind: "browser", profile: "default" }, needs: { browse: true, signedIn: true }, brief: "User's words: Is that hotel free on Dec 3?" });
        s.end();
      },
      { state: "unsettled", why: "sign_in", harness: "claude-code", ms: 4000 },
    );
    user("Is that hotel free on Dec 3?");
    await partner.idle();
    expect(inputs[1]).toMatch(/not settled, it is behind a sign-in/);
    expect(inputs[1]).toMatch(/task_open with needs\.browse and needs\.signedIn/);
    // No line of its own: the code's ack says the quick look wasn't enough.
    const ack = fc.events.find((e) => e.kind === "ack")!.body as Bodies["ack"];
    expect(ack.text).toBe("A quick look didn't settle it, so a task is checking properly: Check the hotel for Dec 3");
    expect(ack.replyTo).toBe(1);
  });

  test("no quick look on this agent: the tool says to open a browsing task, nothing is logged", async () => {
    let r: { ok: boolean; task?: boolean } | undefined;
    const { fc, partner, user, asked } = setup(
      async (_input, s) => {
        r = (await fc.callTool("web_look", { question: "Latest Bun version?" })) as typeof r;
        s.end();
      },
      FOUND,
      false,
    );
    user("What's the latest Bun version?");
    await partner.idle();
    expect(r).toMatchObject({ ok: false, task: true });
    expect(asked).toHaveLength(0);
    expect(fc.events.some((e) => e.kind === "web_look")).toBe(false);
  });

  test("a line before the look is said; a short line after it is filler (dropped)", async () => {
    const { fc, partner, user } = setup(async (_input, s, i) => {
      if (i === 0) {
        s.say("我查一下明天上海的天气。");
        await fc.callTool("web_look", { question: "明天上海会下雨吗" });
        s.say("还在查，查到了马上告诉你。");
      } else s.say("明天上海有小雨（中国天气网）。");
      s.end();
    }, FOUND);
    user("明天上海会下雨吗？");
    await partner.idle();
    expect(fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as Bodies["ai_msg"]).text)).toEqual(["我查一下明天上海的天气。", "明天上海有小雨（中国天气网）。"]);
  });

  test("not from a turn the user didn't start", async () => {
    const { fc } = setup(() => {}, FOUND);
    const r = (await fc.callTool("web_look", { question: "x" })) as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("the fence: web words can't close it", () => {
    const text = renderWebLook({ lookId: "l1", question: "q", state: "found", answer: "x", sources: ["https://a.example.com"], confidence: "low" });
    expect(text.match(/<\/web_look>/g)).toHaveLength(1);
    expect(text).toMatch(/aren't sure/);
  });
});
