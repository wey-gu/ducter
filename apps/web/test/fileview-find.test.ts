// D242: find in a long file, and the client's side of expiring media keys.
import { expect, test } from "bun:test";
import { keyExpires, keyStale } from "@ducter/protocol";
import { FIND_MAX, findAll } from "../src/fileview-find.ts";

test("find: every match, case set aside, in order; none for an empty query; bounded", () => {
  expect(findAll("Ref ref REF", "ref")).toEqual([
    [0, 3],
    [4, 7],
    [8, 11],
  ]);
  expect(findAll("钥匙只能取这一个文件；钥匙不会过期", "钥匙")).toEqual([
    [0, 2],
    [11, 13],
  ]);
  expect(findAll("aaaa", "aa")).toEqual([
    [0, 2],
    [2, 4],
  ]);
  expect(findAll("anything", "")).toEqual([]);
  expect(findAll("x".repeat(FIND_MAX * 2), "x")).toHaveLength(FIND_MAX);
  // A lowering that changes lengths falls back to the exact case, never to wrong offsets.
  expect(findAll("İstanbul istanbul", "istanbul")).toEqual([[9, 17]]);
});

test("a key says when it ends; a pre-D242 key names no time", () => {
  const end = Date.UTC(2026, 10, 14, 12);
  const k = `${Math.floor(end / 1000).toString(36)}.abcdefghijklmnopqrstuv`;
  expect(keyExpires(k)).toBe(end);
  expect(keyStale(k, end - 120_000)).toBe(false);
  expect(keyStale(k, end - 30_000)).toBe(true);
  expect(keyExpires("abcdefghijklmnopqrstuv")).toBeUndefined();
  expect(keyStale("abcdefghijklmnopqrstuv", end)).toBe(false);
});
