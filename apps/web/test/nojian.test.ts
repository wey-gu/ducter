// D434: no counter noun 件 anywhere in the Chinese UI. A count says the thing's own noun (个任务,
// 个待办, 条) or just 个, or no count at all; 件 stays only inside words where it is not a counter
// (文件, 邮件, 附件, 条件, 软件, 事件, 组件, 插件, 证件…).
import { expect, test } from "bun:test";
import { TABLES } from "../src/i18n.ts";

const COUNTER = /(^|[^文邮附条软事组插证套收发原硬控取稿])件/u;

test("D434: no zh string counts with 件", () => {
  const bad = Object.entries(TABLES.zh).filter(([, s]) => COUNTER.test(s));
  expect(bad).toEqual([]);
});

test("D434: replying to one's own line says 接着说, never 回复你", () => {
  expect(TABLES.zh["reply.own"]).toBe("接着说");
  expect(TABLES.en["reply.own"]).toBe("Add to this");
});
