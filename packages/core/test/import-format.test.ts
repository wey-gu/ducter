// D651 (research/246): the `ducter-import/1` validator. Every record kind, every limit, an
// unknown record, a stream with no end, a future time, and a key hidden before anything exists.
import { describe, expect, test } from "bun:test";
import { HIDDEN } from "@ducter/protocol/src/redact.ts";
import { IMPORT_FORMAT, IMPORT_MESSAGES_MAX, IMPORT_TEXT_MAX, IMPORT_TITLE_MAX, parseImport } from "../src/imports/format.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const now = () => NOW;
const src = (over: Record<string, unknown> = {}) => ({ t: "source", format: IMPORT_FORMAT, app: "Lody", account: "workspace:my-team", reader: "lody-cli", readerVersion: "1", ...over });
const thread = (id: string, over: Record<string, unknown> = {}) => ({ t: "thread", id, title: `Thread ${id}`, folder: "/Users/me/src/hawdb", repo: "github.com/acme/hawdb", createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-02T05:40:12Z", ...over });
const msg = (threadId: string, id: string, over: Record<string, unknown> = {}) => ({ t: "msg", thread: threadId, id, role: "user", text: "The WAL test fails one run in five.", at: "2026-10-02T03:11:00Z", ...over });
const end = (threads: number, messages: number) => ({ t: "end", threads, messages });
const jsonl = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");

describe("ducter-import/1", () => {
  test("every record kind, and unknown fields are never stored", () => {
    const p = parseImport(
      jsonl(
        src({ unknownSourceField: "dropped" }),
        thread("s1", { unknownThreadField: { anything: true } }),
        msg("s1", "m1", { unknownMessageField: "dropped" }),
        msg("s1", "m2", { role: "assistant", text: "It races the checkpoint.", at: "2026-10-02T03:14:31Z" }),
        { t: "skipped", thread: "s1", what: "attachment", n: 2, unknown: true },
        end(1, 2),
      ),
      { now },
    );
    expect(p.ok).toBe(true);
    expect(p.stopped).toBeUndefined();
    expect(p.source).toEqual({ format: IMPORT_FORMAT, app: "Lody", account: "workspace:my-team", reader: "lody-cli", readerVersion: "1" });
    expect(p.threads).toHaveLength(1);
    expect(p.threads[0]!.messages.map((m) => [m.id, m.role, m.text, m.at])).toEqual([
      ["m1", "user", "The WAL test fails one run in five.", "2026-10-02T03:11:00.000Z"],
      ["m2", "assistant", "It races the checkpoint.", "2026-10-02T03:14:31.000Z"],
    ]);
    expect(p.threads[0]!.skipped).toEqual([{ what: "attachment", n: 2 }]);
    expect(p.counts).toEqual({ threads: 1, messages: 2, skipped: 2 });
    // Nothing the format doesn't name survives.
    expect(Object.keys(p.source!)).not.toContain("unknownSourceField");
    expect(Object.keys(p.threads[0]!)).not.toContain("unknownThreadField");
    expect(Object.keys(p.threads[0]!.messages[0]!)).not.toContain("unknownMessageField");
  });

  test("messages are stored in source time order", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "late", { at: "2026-10-02T05:00:00Z" }), msg("s1", "early", { at: "2026-10-02T04:00:00Z" }), end(1, 2)), { now });
    expect(p.ok).toBe(true);
    expect(p.threads[0]!.messages.map((m) => m.id)).toEqual(["early", "late"]);
  });

  test("the title limit is characters, the text limit is bytes", () => {
    expect(parseImport(jsonl(src(), thread("s1", { title: "汉".repeat(IMPORT_TITLE_MAX) }), msg("s1", "m1"), end(1, 1)), { now }).ok).toBe(true);
    const title = parseImport(jsonl(src(), thread("s1", { title: "汉".repeat(IMPORT_TITLE_MAX + 1) }), msg("s1", "m1"), end(1, 1)), { now });
    expect(title.ok).toBe(false);
    expect(title.stopped!.reason).toContain("title");
    expect(parseImport(jsonl(src(), thread("s1"), msg("s1", "m1", { text: "a".repeat(IMPORT_TEXT_MAX) }), end(1, 1)), { now }).ok).toBe(true);
    const text = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1", { text: "a".repeat(IMPORT_TEXT_MAX + 1) }), end(1, 1)), { now });
    expect(text.ok).toBe(false);
    expect(text.stopped!.reason).toContain("text");
  });

  test("at most 20,000 messages in one thread in one run", { timeout: 60_000 }, () => {
    const rows: unknown[] = [src(), thread("s1")];
    for (let i = 0; i < IMPORT_MESSAGES_MAX + 1; i++) rows.push(msg("s1", `m${i}`, { text: "x" }));
    const p = parseImport(jsonl(...rows), { now });
    expect(p.ok).toBe(false);
    expect(p.stopped!.reason).toContain("at most");
  });

  test("an unknown record type stops the stream; nothing after it is read", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1"), { t: "tool_call", thread: "s1" }, end(1, 1)), { now });
    expect(p.ok).toBe(false);
    expect(p.stopped!.line).toBe(4);
    expect(p.stopped!.reason).toContain("unknown record type");
    // The thread it broke in is partial: it is not brought in.
    expect(p.counts).toEqual({ threads: 0, messages: 0, skipped: 0 });
  });

  test("a stream with no end keeps every whole thread and drops the last, possibly cut-off one", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1"), thread("s2"), msg("s2", "m2")), { now });
    expect(p.ok).toBe(false);
    expect(p.stopped!.reason).toContain("without an end");
    expect(p.threads.map((x) => x.id)).toEqual(["s1"]);
    expect(p.counts).toEqual({ threads: 1, messages: 1, skipped: 0 });
  });

  test("a failure in a later thread keeps the ones before it whole", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1"), thread("s2"), { t: "msg", thread: "s2", id: "m2", role: "system", text: "x", at: "2026-10-02T03:11:00Z" }), { now });
    expect(p.ok).toBe(false);
    expect(p.threads.map((x) => x.id)).toEqual(["s1"]);
  });

  test("a time in the future, or not ISO, is refused", () => {
    const future = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1", { at: "2027-01-01T00:00:00Z" }), end(1, 1)), { now });
    expect(future.ok).toBe(false);
    expect(future.stopped!.reason).toContain("future");
    const bad = parseImport(jsonl(src(), thread("s1", { createdAt: "last Tuesday" }), msg("s1", "m1"), end(1, 1)), { now });
    expect(bad.ok).toBe(false);
    expect(bad.stopped!.reason).toContain("createdAt");
  });

  test("only user and assistant roles", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1", { role: "system" }), end(1, 1)), { now });
    expect(p.ok).toBe(false);
    expect(p.stopped!.reason).toContain("role");
  });

  test("a message needs a thread declared before it, and ids are unique", () => {
    expect(parseImport(jsonl(src(), msg("s1", "m1"), thread("s1"), end(1, 1)), { now }).stopped!.reason).toContain("thread declared before");
    expect(parseImport(jsonl(src(), thread("s1"), msg("s1", "m1"), msg("s1", "m1"), end(1, 2)), { now }).stopped!.reason).toContain("already declared");
  });

  test("the end's counts must match the stream", () => {
    const p = parseImport(jsonl(src(), thread("s1"), msg("s1", "m1"), end(1, 2)), { now });
    expect(p.ok).toBe(false);
    expect(p.stopped!.line).toBe(4);
    expect(p.stopped!.reason).toContain("end says");
  });

  test("no source, or a wrong format, is refused", () => {
    expect(parseImport("", { now }).stopped!.reason).toContain("source");
    expect(parseImport(jsonl(thread("s1"), end(0, 0)), { now }).stopped!.reason).toContain("source");
    expect(parseImport(jsonl(src({ format: "ducter-import/9" }), end(0, 0)), { now }).stopped!.reason).toContain("unknown format");
  });

  test("a key is hidden in a title, a message and what was skipped, before anything is stored", () => {
    const p = parseImport(
      jsonl(
        src({ app: "Acme sk-ant-api03-abcdefghijklmnop1" }),
        thread("s1", { title: "Fix ghp_abcdefghijklmnop1234", folder: "/Users/me/token=abcdefghijklmnop1" }),
        msg("s1", "m1", { text: "Use sk-ant-api03-abcdefghijklmnop1 and card 4111 1111 1111 1111 then Bearer abcdefghijklmnopqrst" }),
        { t: "skipped", thread: "s1", what: "attachment sk-ant-api03-abcdefghijklmnop1", n: 1 },
        end(1, 1),
      ),
      { now },
    );
    expect(p.ok).toBe(true);
    expect(p.source!.app).toContain(HIDDEN);
    expect(p.source!.app).not.toContain("abcdefghijklmnop");
    expect(p.threads[0]!.title).toContain(HIDDEN);
    expect(p.threads[0]!.folder).toContain(HIDDEN);
    expect(p.threads[0]!.messages[0]!.text).toContain(HIDDEN);
    expect(p.threads[0]!.messages[0]!.text).not.toContain("abcdefghijklmnop");
    expect(p.threads[0]!.messages[0]!.text).toContain("1111");
    expect(p.threads[0]!.skipped[0]!.what).toContain(HIDDEN);
  });

  test("CRLF and blank lines are fine", () => {
    const p = parseImport(`${jsonl(src(), thread("s1"), msg("s1", "m1"), end(1, 1))}\r\n\r\n`, { now });
    expect(p.ok).toBe(true);
  });
});
