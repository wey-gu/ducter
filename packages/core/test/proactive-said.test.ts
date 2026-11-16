// D281: the person's own words, read by code (said.ts).
import { describe, expect, test } from "bun:test";
import { ownWords } from "../src/proactive/said.ts";

const Z = "Asia/Shanghai";
const NOW = Date.parse("2026-11-16T10:00:00+08:00"); // a Monday
const local = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: Z, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "-";
const r = (t: string, who: "user" | "partner" = "user") => {
  const x = ownWords(t, NOW, Z, who);
  return x ? `${x.asked ? "ask" : "self"} ${x.what} @ ${local(x.dueAt)}${x.timed ? "" : " (day)"}` : "none";
};

describe("ownWords", () => {
  test("asked reminders, with a day, a time, both, or neither", () => {
    expect(r("周五下午提醒我交水电费")).toBe("ask 交水电费 @ Fri 15:00");
    expect(r("明早 9 点提醒我回邮件")).toBe("ask 回邮件 @ Tue 09:00");
    expect(r("下午 3 点提醒我开会")).toBe("ask 开会 @ Mon 15:00");
    expect(r("今晚提醒我倒垃圾")).toBe("ask 倒垃圾 @ Mon 20:00");
    expect(r("半小时后提醒我关火")).toBe("ask 关火 @ Mon 10:30");
    expect(r("8点提醒我吃药")).toBe("ask 吃药 @ Tue 08:00");
    expect(r("下周三提醒我续签证")).toBe("ask 续签证 @ Wed 00:00 (day)");
    expect(r("提醒我给妈妈打电话")).toBe("ask 给妈妈打电话 @ - (day)");
    expect(r("remind me tomorrow to call Leo")).toBe("ask call Leo @ Tue 00:00 (day)");
    expect(r("Remind me at 3pm to stretch")).toBe("ask stretch @ Mon 15:00");
  });
  test("things they said they would do, only with a day", () => {
    expect(r("我明天要给张三回邮件")).toBe("self 给张三回邮件 @ Tue 00:00 (day)");
    expect(r("I need to renew the passport on Friday")).toBe("self renew the passport @ Fri 00:00 (day)");
    expect(r("我明天要给张三回那封合同的邮件，今天太累了")).toBe("self 给张三回那封合同的邮件 @ Tue 00:00 (day)");
    expect(r("我回头看看")).toBe("none");
    expect(r("I'll take a look")).toBe("none");
    expect(r("明天看看合同")).toBe("none");
  });
  test("the partner's promise to remind", () => {
    expect(r("好，明天上午 10 点提醒你交水电费。", "partner")).toBe("ask 交水电费 @ Tue 10:00");
    expect(r("OK, I'll remind you on Thursday about the dentist.", "partner")).toBe("ask the dentist @ Thu 00:00 (day)");
    expect(r("周五下午提醒我交水电费", "partner")).toBe("none");
  });
  test("never: recurring, the past, questions", () => {
    expect(r("每周一早上提醒我写周报")).toBe("none");
    expect(r("提醒我一下上次那个是什么")).toBe("none");
    expect(r("remind me what we decided")).toBe("none");
  });
});

// Lines from an ordinary day with the partner (the author's kind of work and a consumer's): none of
// them is a thing to bring back later. Precision first: a wrong "you said…" costs more trust than a miss.
export const ORDINARY = [
  "帮我看看这个 PR 为什么挂了",
  "明天的会议几点开始？",
  "我今天要发版，先把 CI 修好",
  "我明天在东京，帮我查一下天气",
  "I'll be in Tokyo tomorrow, what's the weather like?",
  "我觉得明天可能会下雨",
  "提醒我一下我们上次定的方案是什么",
  "Remind me what the deploy command is",
  "我昨天已经回了张三的邮件",
  "周五的航班改到几点了？",
  "我得想想",
  "我要一杯咖啡",
  "明天再说吧",
  "每天早上 8 点提醒我喝水",
  "Every Monday remind me to send the report",
  "我刚才提醒你的那件事做了吗",
  "你明天能帮我订个餐厅吗",
  "I need to think about it",
  "We should ship it on Friday",
  "下周三是我妈生日",
  "I have to say this looks great",
  "明天下午 3 点的会能挪一下吗",
  "我明天要不要去公司？",
];

test("ordinary lines are never kept", () => {
  expect(ORDINARY.filter((t) => ownWords(t, NOW, Z, "user"))).toEqual([]);
});
