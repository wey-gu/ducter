// D425: several things in one message. task_open's `asks` puts the lines under the person's
// message (core's asks) and in the task's brief, numbered, with how to report each; a follow-up
// sees the lines with their tasks, so "第二个改一下" lands on the right one; a report renders the
// message's lines with their states, so the result says which came out how.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AsksBody } from "../../protocol/src/index.ts";
import { createAsks } from "../../core/src/asks.ts";
import { createPartner } from "../src/partner.ts";
import { asksLines } from "../src/render.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const MSG = "我下周有什么预约么 帮我在 gmail 日历记录我 20 号要去北京 agibar 参加一个分享，这个周日要去杭州 coscon 参加 bof，下周四要参加 Tabs 上海和组织者见面";
const LINES = ["我下周有什么预约", "20 号北京 agibar 分享", "周日杭州 coscon BoF", "下周四 Tabs 上海见组织者"];

function setup(script: Script) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-asks-")));
  const asks = createAsks({ log: fc.core.log, tasks: fc.core.tasks });
  fc.core.log.subscribe((e) => asks.onEvent(e));
  (fc.core as { asks?: unknown }).asks = asks;
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, fr, partner, user, asks };
}

test("one task with four asks: the lines go under the message and into the brief, numbered", async () => {
  const { fc, fr, partner, user } = setup(async (_i, s) => {
    s.say("好，我去看下周的安排，再把这三项记进日历，弄好了告诉你。");
    await fc.callTool("task_open", { title: "下周预约和三项日历", place: { kind: "browser", profile: "default" }, needs: { browse: true, signedIn: true, site: "calendar.google.com" }, asks: LINES, brief: MSG });
    s.end();
  });
  user(MSG);
  await partner.idle();
  expect(fr.opened).toHaveLength(1);
  const brief = fr.opened[0]!.brief;
  expect(brief).toContain("1. 我下周有什么预约");
  expect(brief).toContain("4. 下周四 Tabs 上海见组织者");
  expect(brief).toContain("`asks`, in this order");
  const ev = fc.events.filter((e) => e.kind === "asks").at(-1)!;
  const b = ev.body as AsksBody;
  const msg = fc.events.find((e) => e.kind === "user_msg")!;
  expect(b.msgSeq).toBe(msg.seq);
  expect(b.lines.map((l) => l.words)).toEqual(LINES);
  expect(new Set(b.lines.map((l) => l.taskId)).size).toBe(1);
});

test("a follow-up sees the lines with their tasks; a report says each line's state", async () => {
  const { fc, fr, partner, user, asks } = setup((_i, s) => {
    s.say("好。");
    s.end();
  });
  const m = fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "check the pricing page, write the release notes, update the status page" } });
  asks.add(m.seq, "t_price", ["check the pricing page"]);
  asks.add(m.seq, "t_notes", ["write the release notes"]);
  asks.add(m.seq, "t_status", ["update the status page"]);
  user("第二个改一下，加上迁移说明");
  await partner.idle();
  const input = fr.sessions[0]!.inputs.at(-1)!;
  expect(input).toContain('2. "write the release notes" task t_notes: still at work');
  expect(input).toContain("goes to its task with task_send");
});

test("the lines as the partner reads them", () => {
  const s = asksLines(
    {
      lines: [
        { words: "我下周有什么预约", taskId: "t1", state: "done", note: "下周三 10:00 看牙" },
        { words: "20 号北京 agibar 分享", taskId: "t1", state: "failed" },
        { words: "第三件", taskId: "", held: "k", state: "working" },
      ],
    },
    { taskTitle: () => undefined },
  );
  expect(s).toBe('1. "我下周有什么预约" task t1: done (下周三 10:00 看牙); 2. "20 号北京 agibar 分享" task t1: didn\'t work; 3. "第三件" held in line: still at work');
});
