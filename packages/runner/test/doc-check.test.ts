// D439: report_to_main hands a done report's document to the page check (core's doc-check.ts, a
// fake here): what it finds goes back to the task as the tool's answer and nothing is logged; the
// next report goes on with what is still so, and an Office file shown with its PDF as its pages.
// The task's brief carries the document bar only when the ask is a document to send.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, MediaRef } from "@ducter/protocol";
import { docAsk } from "@ducter/protocol";
import { registerTaskTools } from "../src/index.ts";
import { docBrief, taskBrief } from "../src/brief.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
let calls = 0;
const pptx: MediaRef = { id: "a".repeat(64), type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: 40_000, name: "Ducter 融资.pptx", k: "k1" };
const pdf: MediaRef = { id: "b".repeat(64), type: "application/pdf", bytes: 90_000, name: "Ducter 融资.pdf", k: "k2" };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-doc-test-"));
  core = createFakeCore(join(dir, "data"));
  calls = 0;
  registerTaskTools(core, {
    shown: async () => ({ media: [pptx, pdf], refused: [] }),
    docCheck: async (_id, body) => {
      calls++;
      const media = [{ ...pptx, pages: { id: pdf.id, k: pdf.k, bytes: pdf.bytes, n: 6 } }];
      if (body.state !== "done") return { media };
      if (calls === 1) return { again: "Not sent yet: before the user sees it, Ducter checked the document page by page and found:\n- the user asked for 5 slides and it has 6", media };
      return { doc: { pages: 6, found: [{ code: "count", n: 6, asked: 5 }], left: ["要的是 5 张，做出来 6 张"] }, media };
    },
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a done report's document goes back once with what was found, then goes on with what is still so", async () => {
  const first = String(await core.call("report_to_main", { state: "done", summary: "融资 deck 做好了。", evidence: [], show: ["deck.pptx", "deck.pdf"] }, "tsk1"));
  expect(first).toStartWith("Not sent yet");
  expect(first).toContain("5 slides");
  expect(core.log.read({ stream: "task:tsk1", kinds: ["report"] }).length).toBe(0);
  const second = String(await core.call("report_to_main", { state: "done", summary: "融资 deck 做好了，团队那页留着。", evidence: [], show: ["deck.pptx", "deck.pdf"] }, "tsk1"));
  expect(second).toStartWith("Reported.");
  const r = core.log.read({ stream: "task:tsk1", kinds: ["report"] }).map((e) => e.body as Bodies["report"]);
  expect(r.length).toBe(1);
  expect(r[0]!.doc?.left).toEqual(["要的是 5 张，做出来 6 张"]);
  // The Office file carries its PDF as pages; the PDF is not shown again on its own.
  expect(r[0]!.media?.map((m) => m.name)).toEqual(["Ducter 融资.pptx"]);
  expect(r[0]!.media?.[0]?.pages).toEqual({ id: pdf.id, k: pdf.k, bytes: pdf.bytes, n: 6 });
});

test("a progress report is never held, and still pairs the deck with its pages", async () => {
  const said = String(await core.call("report_to_main", { state: "progress", summary: "先给你看看第一版。", show: ["deck.pptx", "deck.pdf"] }, "tsk2"));
  expect(said).toStartWith("Reported.");
  const r = core.log.read({ stream: "task:tsk2", kinds: ["report"] }).map((e) => e.body as Bodies["report"]);
  expect(r[0]!.doc).toBeUndefined();
  expect(r[0]!.media?.length).toBe(1);
});

test("the brief carries the document bar only for a document to send", () => {
  const base = { partnerName: "Ducter", taskId: "t1", brief: "…", place: { kind: "none" as const }, cwd: "/tmp/x", mcpServerName: "ducter" };
  const ask = docAsk("帮我把这周的进展做成一页 PDF 发给老板")!;
  expect(ask).toEqual({ formats: ["pdf"], pages: 1 });
  const withBar = taskBrief({ ...base, title: "本周进展 PDF", doc: ask });
  expect(withBar).toContain("## A document the user will send");
  expect(withBar).toContain("It is 1 page, as asked.");
  expect(taskBrief({ ...base, title: "修 flaky 测试" })).not.toContain("A document the user will send");
  expect(docBrief({ formats: ["pptx"], pages: 5 })).toContain("It is 5 slides, as asked.");
  expect(docBrief({ formats: ["pdf"], maxPages: 3 })).toContain("At most 3 pages");
});

// D450: the document check and another AI's look on one report: one round, not two.
test("a document the look also reads: nothing goes back at once, the look takes it with the document's findings; its fix rides on the round", async () => {
  const c = createFakeCore(join(dir, "data2"));
  let n = 0;
  let waiting = false;
  const took: { body: Bodies["report"]; also?: { words: string; found: string } }[] = [];
  registerTaskTools(c, {
    shown: async () => ({ media: [pdf], refused: [] }),
    docCheck: async () => {
      n++;
      const left = { pages: 2, found: [{ code: "edge", page: 1 }], left: ["第 1 页的字超出了右边"] } as never;
      return n === 1 ? { again: "Not sent yet: … found:\n本周进展.pdf:\n- page 1: past the edge\n\nFix these…", againFound: "本周进展.pdf:\n- page 1: past the edge", doc: left, media: [pdf] } : { doc: left, media: [pdf] };
    },
    freshLook: {
      heldWords: "Reported. Another AI reads it once. End your turn now.",
      heldWithDocWords: "Not sent yet: both come to you in one message. End your turn now.",
      waiting: () => waiting,
      take(_id, body, also) {
        took.push({ body, ...(also ? { also } : {}) });
        waiting = true;
        return true;
      },
    },
  });
  const first = String(await c.call("report_to_main", { state: "done", summary: "进展 PDF 做好了。", evidence: [], show: ["p.pdf"] }, "tsk9"));
  expect(first).toStartWith("Not sent yet: both come to you in one message.");
  expect(took[0]!.also?.found).toBe("本周进展.pdf:\n- page 1: past the edge");
  expect(took[0]!.body.doc?.left).toEqual(["第 1 页的字超出了右边"]); // what is left if it is never fixed
  expect(c.log.read({ stream: "task:tsk9", kinds: ["report"] }).length).toBe(0);
  // The fix: checked by the round, the document's left riding on it, no second send-back.
  const second = String(await c.call("report_to_main", { state: "done", summary: "改好了。", evidence: [], show: ["p.pdf"] }, "tsk9"));
  expect(second).toStartWith("Reported.");
  expect(took[1]!.also).toBeUndefined();
  expect(took[1]!.body.doc?.left).toEqual(["第 1 页的字超出了右边"]);
});

test("the look won't read it: the document's words go back as the tool's answer, as before", async () => {
  const c = createFakeCore(join(dir, "data3"));
  registerTaskTools(c, {
    shown: async () => ({ media: [pdf], refused: [] }),
    docCheck: async () => ({ again: "Not sent yet: the document. Fix these…", againFound: "x", media: [pdf] }),
    freshLook: { heldWords: "held", waiting: () => false, take: () => false },
  });
  const said = String(await c.call("report_to_main", { state: "done", summary: "好了。", evidence: [], show: ["p.pdf"] }, "tsk8"));
  expect(said).toBe("Not sent yet: the document. Fix these…");
  expect(c.log.read({ stream: "task:tsk8", kinds: ["report"] }).length).toBe(0);
});

test("a document found wrong for the first time while a look waits for the fix: it rides on the round, never a second one", async () => {
  const c = createFakeCore(join(dir, "data4"));
  const took: { also?: unknown; doc?: unknown }[] = [];
  registerTaskTools(c, {
    shown: async () => ({ media: [pdf], refused: [] }),
    docCheck: async () => ({ again: "Not sent yet: the document. Fix these…", againFound: "x", doc: { found: [], left: ["少了一页"] } as never, media: [pdf] }),
    freshLook: { heldWords: "Reported. Checked once more.", heldWithDocWords: "both", waiting: () => true, take: (_id, body, also) => (took.push({ also, doc: body.doc?.left }), true) },
  });
  const said = String(await c.call("report_to_main", { state: "done", summary: "好了。", evidence: [], show: ["p.pdf"] }, "tsk7"));
  expect(said).toBe("Reported. Checked once more.");
  expect(took).toEqual([{ also: undefined, doc: ["少了一页"] }]);
});
