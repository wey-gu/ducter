// D304: the 想起了 line's words, and 这周记下的's rows (mem-view.ts).
import { expect, test } from "bun:test";
import { recallLine, weekNoted } from "../src/mem-view.ts";
import { TABLES } from "../src/i18n.ts";

const say = (lang: "zh" | "en", r: Parameters<typeof recallLine>[0], date: string) => {
  const { key, args } = recallLine(r, date);
  let i = 0;
  return TABLES[lang][key]!.replace(/%\[(\d)\]s|%s/g, (_m, n) => String(n ? args[Number(n) - 1] : args[i++]));
};

test("who it is from, and the day when known", () => {
  expect(say("zh", { by: "said" }, "11 月 10 日")).toBe("想起了你 11 月 10 日 说的");
  expect(say("en", { by: "said" }, "Nov 10")).toBe("Remembered from what you said on Nov 10");
  expect(say("zh", { by: "tool", from: "Claude Code" }, "11 月 16 日")).toBe("想起了 11 月 16 日 Claude Code 记下的");
  expect(say("en", { by: "tool", from: "Claude Code" }, "Nov 16")).toBe("Remembered from what Claude Code saved on Nov 16");
  expect(say("en", { by: "tool", from: "Codex" }, "")).toBe("Remembered from what Codex saved");
  expect(say("zh", { by: "you" }, "")).toBe("想起了你记下的");
  expect(say("en", { by: "tool" }, "Nov 1")).toBe("Remembered from what you saved on Nov 1"); // a tool without a name is the person's
});

test("the week's rows: the last 7 days only", () => {
  const now = new Date(2026, 10, 17, 9);
  const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  expect(weekNoted([{ at: at(0.1), n: 1 }, { at: at(3), n: 2 }, { at: at(9), n: 3 }], now).map((x) => x.n)).toEqual([1, 2]);
});
