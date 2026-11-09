// Recall over the Log: CJK bigram index, rank fusion, the v0 → v1 migration, the frozen spine.
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { openLog } from "../src/log.ts";
import { bigramQuery, bigramTokens, fuseRanks } from "../src/search.ts";
import { tempDir } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());
const fresh = () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const path = join(t.dir, "ducter.db");
  return { path, log: openLog({ path, persona: "default" }) };
};

test("tokens: CJK runs become bigrams, words stay words", () => {
  expect(bigramTokens("修复 foo 仓库里不稳定的测试")).toEqual(["修复", "foo", "仓库", "库里", "里不", "不稳", "稳定", "定的", "的测", "测试"]);
  expect(bigramTokens("用 SQLite FTS5")).toEqual(["用", "sqlite", "fts5"]);
  expect(bigramTokens("packages/core/src/log.ts")).toEqual(["packages", "core", "src", "log", "ts"]);
  expect(bigramQuery("不稳定 digest")).toBe('"不稳 稳定" OR "digest"*');
  expect(bigramQuery("的")).toBeNull(); // a lone character is left to the substring list
  expect(bigramQuery('he said "x')).toBe('"he" OR "said"* OR "x"');
});

test("fusion: agreement wins, ties go to the newer event", () => {
  expect(fuseRanks([{ seqs: [5, 9], weight: 1 }, { seqs: [9, 5], weight: 1 }])).toEqual([9, 5]);
  expect(fuseRanks([{ seqs: [3, 7], weight: 1 }, { seqs: [7], weight: 1 }])).toEqual([7, 3]);
});

test("search ranks the event that matches more of the query first, in Chinese too", () => {
  const { log } = fresh();
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "先别上向量库，FTS 够用" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "好，搜索先用 FTS5。" } });
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "今天的预算表发我" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "向量库的事以后再说" } });
  // Not every term is in one event, so the exact list is empty; BM25 still finds both halves.
  const hits = log.search("向量库 FTS 预算").map((e) => e.seq);
  expect(hits[0]).toBe(1);
  expect(hits).toContain(3);
  // A quote: exact substring ranks first.
  expect(log.search("FTS 够用")[0]!.seq).toBe(1);
  // beforeSeq bounds the search (recall outside the verbatim window).
  expect(log.search("向量库", { beforeSeq: 4 }).map((e) => e.seq)).toEqual([1]);
});

test("an old database is migrated: the bigram index is back-filled and the spine appears", () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const path = join(t.dir, "ducter.db");
  // A v0 database, as written before this change: events + the trigram index only.
  const old = new Database(path, { create: true });
  old.exec(`CREATE TABLE events (seq INTEGER PRIMARY KEY, ts TEXT NOT NULL, persona TEXT NOT NULL, stream TEXT NOT NULL, origin TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, supersedes INTEGER);
    CREATE VIRTUAL TABLE events_fts USING fts5(text, tokenize = 'trigram');`);
  old.prepare("INSERT INTO events VALUES (1, '2026-11-01T00:00:00Z', 'default', 'channel', 'user', 'user_msg', ?, NULL)").run(JSON.stringify({ text: "数据库就用 SQLite，别上服务器" }));
  old.prepare("INSERT INTO events_fts (rowid, text) VALUES (1, ?)").run("数据库就用 SQLite，别上服务器");
  old.close();

  const log = openLog({ path, persona: "default" });
  expect(log.search("服务器 数据库").map((e) => e.seq)).toEqual([1]);
  expect(log.spine.list()).toEqual([]);
  log.close();
  const v = new Database(path);
  expect((v.query("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(1);
  v.close();
  // Reopening does not migrate (or back-fill) twice.
  const again = openLog({ path, persona: "default" });
  expect(again.search("服务器").length).toBe(1);
  again.close();
});

test("frozen digests survive a restart and can never change", () => {
  const { path, log } = fresh();
  log.spine.freeze({ id: "S0001", kind: "segment", fromSeq: 1, toSeq: 40, body: { narrative: "x" } });
  expect(() => log.spine.freeze({ id: "S0001", kind: "segment", fromSeq: 1, toSeq: 40, body: {} })).toThrow();
  log.spine.attempt({ fromSeq: 41, toSeq: 80, n: 1, ok: false, writer: "sonnet", reasons: ["anchor not in #50"] });
  log.close();
  const again = openLog({ path, persona: "default" });
  expect(again.spine.list().map((r) => [r.id, r.fromSeq, r.toSeq, r.body])).toEqual([["S0001", 1, 40, { narrative: "x" }]]);
  expect(again.spine.attempts()[0]).toMatchObject({ ok: false, reasons: ["anchor not in #50"] });
  again.close();
  const db = new Database(path);
  expect(() => db.exec("UPDATE spine SET body = '{}' WHERE id = 'S0001'")).toThrow(/frozen/);
  expect(() => db.exec("DELETE FROM spine")).toThrow(/frozen/);
  db.close();
});
