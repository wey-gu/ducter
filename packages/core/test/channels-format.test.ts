// D276: the partner's words in each chat app's own form, and split to its length.
import { expect, test } from "bun:test";
import { cutPoints, parseMarkdown, splitParsed, toSlack, toTelegram } from "../src/channels/format.ts";
import { cardPolicy } from "../src/channels/index.ts";

test("markdown to entities: bold, italic, code, a fenced block, a safe link; markers gone", () => {
  const p = parseMarkdown("# 结果\n**好了**，_顺利_。\n- 跑了 `bun test`\n```\nok 12\n```\n[看日志](https://ci.example.com/1) [坏](javascript:alert(1))");
  const t = toTelegram(p);
  expect(t.text).toBe("结果\n好了，顺利。\n• 跑了 bun test\nok 12\n看日志 [坏](javascript:alert(1))");
  expect(t.entities).toContainEqual({ type: "bold", offset: 0, length: 2 });
  expect(t.entities).toContainEqual({ type: "bold", offset: 3, length: 2 });
  expect(t.entities).toContainEqual({ type: "italic", offset: 6, length: 2 });
  expect(t.entities).toContainEqual({ type: "code", offset: 15, length: 8 });
  expect(t.entities).toContainEqual({ type: "pre", offset: 24, length: 5 });
  expect(t.entities).toContainEqual({ type: "text_link", offset: 30, length: 3, url: "https://ci.example.com/1" });
});

test("snake_case and arithmetic stay as they are; an unclosed marker stays literal", () => {
  expect(toTelegram(parseMarkdown("run_tests_now and 2 * 3 * 4 and **open")).text).toBe("run_tests_now and 2 * 3 * 4 and **open");
});

test("offsets count UTF-16 units: an emoji before a bold word", () => {
  const t = toTelegram(parseMarkdown("👍 **ok**"));
  expect(t.text).toBe("👍 ok");
  expect(t.entities).toEqual([{ type: "bold", offset: 3, length: 2 }]);
});

test("slack: mrkdwn marks, escaped words, links as <url|label>", () => {
  expect(toSlack(parseMarkdown("**a & b** <@U123> `x<y` [go](https://e.com/?a=1&b=2)"))).toBe("*a &amp; b* &lt;@U123&gt; `x&lt;y` <https://e.com/?a=1&b=2|go>");
});

test("splitting: at a paragraph, else a line, else a space; never inside a surrogate pair; spans follow", () => {
  const text = "a".repeat(60) + "\n\n" + "b".repeat(60);
  expect(cutPoints(text, 100).map(([s, e]) => text.slice(s, e))).toEqual(["a".repeat(60), "b".repeat(60)]);
  const emoji = "x".repeat(99) + "😀" + "y";
  const parts = cutPoints(emoji, 100).map(([s, e]) => emoji.slice(s, e));
  expect(parts.join("")).toBe(emoji);
  for (const p of parts) expect(p.length).toBeLessThanOrEqual(100);
  const p = splitParsed(parseMarkdown("**" + "粗".repeat(30) + "**" + "。".repeat(10)), 20);
  expect(p[0]!.spans).toEqual([{ kind: "bold", start: 0, end: 20 }]);
  expect(p[1]!.spans[0]).toMatchObject({ kind: "bold", start: 0, end: 10 });
});

test("the button policy: reversible asks only; people, devices, merges open in Ducter; money and keys never", () => {
  const base = { decisionId: "d", question: "q", goLabel: "Go", defaultOption: "go" as const, reversible: true };
  expect(cardPolicy(base)).toBe("buttons");
  expect(cardPolicy({ ...base, reversible: false })).toBe("open");
  expect(cardPolicy({ ...base, phone: { kind: "user" } as never })).toBe("open");
  expect(cardPolicy({ ...base, handset: {} as never })).toBe("open");
  expect(cardPolicy({ ...base, pay: {} as never })).toBe("never");
  expect(cardPolicy({ ...base, key: {} as never })).toBe("never");
  expect(cardPolicy({ ...base, signIn: { site: "github.com" } })).toBe("never");
});
