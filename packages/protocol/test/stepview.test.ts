// D525: an opened task's steps as the rows it draws. The desktop
// (apps/desktop/internal/views/stepview_test.go) passes the same cases (fixtures/stepview.json).
import { expect, test } from "bun:test";
import cases from "../fixtures/stepview.json";
import { chipText, fileKind, fileName, itemsOf, toolAct, workOf } from "../src/stepview.ts";
import type { Block, Line } from "../src/transcript.ts";

for (const c of cases.toolAct) test(`toolAct ${c.in}`, () => expect(toolAct(c.in)).toEqual(c.want as never));
for (const c of cases.chipText) test(`chipText ${c.in.slice(0, 40)}`, () => expect(chipText(c.in)).toBe(c.want));
for (const c of cases.fileKind) test(`fileKind ${c.in}`, () => expect(fileKind(c.in)).toBe(c.want as never));
for (const c of cases.itemsOf) test(`itemsOf: ${c.name}`, () => expect(itemsOf(c.lines as Line[])).toEqual(c.want as never));
for (const c of cases.workOf) test(`workOf: ${c.name}`, () => expect(workOf(c.blocks as Block[])).toEqual(c.want));

test("a file chip says the file's name", () => {
  expect(fileName("/h/crates/storage/src/flush.rs")).toBe("flush.rs");
  expect(fileName("src/")).toBe("src");
});
