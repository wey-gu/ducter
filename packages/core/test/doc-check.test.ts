// D439: the page check on a document to send. What the ask's words say (docAsk), what code reads
// from a deck, a Word file and a PDF (with this computer's Poppler where it has it, and without),
// an Office file paired with its PDF, and the round on a done report: found once back to the task,
// then what is still so rides on the report in the person's language; clean pages say nothing.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { docAsk, docFindingWords, type Bodies, type MediaRef } from "@ducter/protocol";
import { checkDocument, createDocCheck, emWidth, inksOfPgms, linesFor, pairPages, parseBbox, parsePdffonts, placeholdersIn, readsIn, tool } from "../src/doc-check.ts";
import { openLog } from "../src/log.ts";
import { docx, latinPdf, pptx } from "../eval/doc-bar/make.ts";
import { tempDir } from "./helpers.ts";

describe("what the ask says (docAsk)", () => {
  test.each([
    ["帮我把这周的进展做成一页 PDF 发给老板", { formats: ["pdf"], pages: 1 }],
    ["做个 5 页的融资 deck", { formats: ["pptx"], pages: 5 }],
    ["把签证材料整理成一个 PDF", { formats: ["pdf"] }],
    ["把这周进展写成 Word 文档发给老板", { formats: ["docx"] }],
    ["Make my resume into a one-page PDF", { formats: ["pdf"], pages: 1 }],
    ["做一份不超过 3 页的项目介绍 PDF", { formats: ["pdf"], maxPages: 3 }],
    ["做个十页的路演幻灯片", { formats: ["pptx"], pages: 10 }],
  ])("%s", (ask, want) => expect(docAsk(ask)).toEqual(want as never));
  test.each(["这个 PDF 里说了什么", "summarize the attached deck", "修一下 PDF 导出的 bug", "fix the slides endpoint", "看看第 3 页"])("not a document to send: %s", (ask) => expect(docAsk(ask)).toBeUndefined());
});

describe("reading", () => {
  test("pdftotext's boxes and pdffonts' table", () => {
    const pages = parseBbox(`<page width="595" height="842">\n<word xMin="50" yMin="40" xMax="120" yMax="60">本周&amp;进展</word>\n</page>`);
    expect(pages).toEqual([{ w: 595, h: 842, words: [{ x0: 50, y0: 40, x1: 120, y1: 60, t: "本周&进展" }] }]);
    const fonts = parsePdffonts("name                                 type              encoding         emb sub uni object ID\n------------------------------------ ----------------- ---------------- --- --- --- ---------\nAAAAAA+PingFangSC-Regular            Type 3            Custom           yes yes yes      4  0\nHelvetica                            Type 1            WinAnsi          no  no  no       5  0\n");
    expect(fonts).toEqual([{ name: "AAAAAA+PingFangSC-Regular", embedded: true }, { name: "Helvetica", embedded: false }]);
  });
  test("a page's ink and its edges, from a PGM", () => {
    const w = 100, h = 10;
    const px = new Uint8Array(w * h).fill(255);
    for (let y = 0; y < h; y++) px[y * w + 99] = 0; // ink down the right edge only
    const head = new TextEncoder().encode(`P5\n${w} ${h}\n255\n`);
    const b = new Uint8Array(head.length + px.length);
    b.set(head), b.set(px, head.length);
    const [ink] = inksOfPgms(b);
    expect(ink!.right).toBeGreaterThan(0.4);
    expect(ink!.left).toBe(0);
  });
  test("ems and lines", () => {
    expect(emWidth("本周进展")).toBe(4);
    expect(linesFor("本周进展".repeat(10), 20, 400).lines).toBe(2);
    expect(linesFor("Supercalifragilisticexpialidocious", 40, 200).tooLong).toBe(true);
  });
  test("placeholders, and the word in a sentence", () => {
    expect(placeholdersIn("Dear [Hiring Manager Name],")).toBe("[Hiring Manager Name]");
    expect(placeholdersIn("负责人：TODO:")).toBe("TODO:");
    expect(placeholdersIn("单击此处添加标题")).toBe("单击此处添加标题");
    expect(placeholdersIn("TODO 列表搬到待办来源")).toBeUndefined();
  });
  test("whose language", () => {
    expect(readsIn("zh-CN", "")).toBe("han");
    expect(readsIn(undefined, "帮我把这周的进展做成一页 PDF")).toBe("han");
    expect(readsIn(undefined, "Make my resume into a one-page PDF")).toBe("latin");
    expect(readsIn("ja", "…")).toBeUndefined();
  });
});

describe("a deck, a Word file, a PDF", () => {
  let td: ReturnType<typeof tempDir>;
  beforeEach(() => (td = tempDir()));
  afterEach(() => td.cleanup());
  const at = (name: string, bytes: Uint8Array) => {
    const p = join(td.dir, name);
    writeFileSync(p, bytes);
    return p;
  };
  const slide = (t: string) => [{ x: 0.9, y: 0.6, w: 11.5, h: 1.2, paras: [{ text: t, size: 40 }] }, { x: 0.9, y: 2, w: 11.5, h: 4.6, paras: [{ text: "种子轮 150 万美元。", size: 22 }] }];

  test("a deck: a title too long for its box, a picture off the slide, a blank slide, the count", async () => {
    const p = at("d.pptx", pptx([slide("Ducter：一个你自己部署、只跟一个伙伴说话、活儿交给现成智能体去做的个人 AI"), [...slide("进展"), { x: 9.5, y: 3, w: 5.2, h: 3, picture: true }], [], slide("要多少钱")]));
    const r = await checkDocument(p, "pptx", { formats: ["pptx"], pages: 5 }, "han", { tools: {} });
    expect(r.pages).toBe(4);
    expect(r.findings.map((f) => `${f.code}${f.page ?? ""}`)).toEqual(["box1", "off2", "blank3", "count"]);
    expect(docFindingWords(r.findings[0]!, "zh", true)).toBe("第 1 张幻灯片的字超出了文本框");
    expect(docFindingWords(r.findings[3]!, "en", true)).toBe("You asked for 5; it has 4 slides");
  });
  test("a clean deck says nothing", async () => {
    const p = at("ok.pptx", pptx([slide("问题"), slide("我们的做法"), slide("进展")]));
    expect((await checkDocument(p, "pptx", { formats: ["pptx"], pages: 3 }, "han", { tools: {} })).findings).toEqual([]);
  });
  test("a Word file: a table wider than the page, and English for a Chinese reader", async () => {
    const p = at("w.docx", docx([{ p: "This week the errand to the checkout shipped, and a second look reads results before they go out to the user." }, { table: [["a", "b"]], cols: [4, 4] }]));
    const r = await checkDocument(p, "docx", { formats: ["docx"] }, "han", { tools: {} });
    expect(r.findings.map((f) => f.code)).toEqual(["wide", "language"]);
  });
  test("a PDF in Helvetica can't show Chinese, read with Poppler or without", async () => {
    const p = at("v.pdf", latinPdf([["日本旅游签证材料", "申请人：王", "1. 护照原件"]]));
    const bare = await checkDocument(p, "pdf", { formats: ["pdf"] }, "han", { tools: {} });
    expect(bare.pages).toBe(1);
    expect(bare.findings.map((f) => f.code)).toEqual(["cjk"]);
    if (tool("pdftotext")) {
      const full = await checkDocument(p, "pdf", { formats: ["pdf"] }, "han", {});
      expect(full.findings.map((f) => f.code)).toContain("cjk");
    }
    const en = at("e.pdf", latinPdf([["This week (Nov 16-21)", "The errand to the checkout shipped."]]));
    expect((await checkDocument(en, "pdf", { formats: ["pdf"], pages: 1 }, "latin", {})).findings).toEqual([]);
  });
  test("a file that isn't one", async () => {
    const p = at("x.pdf", new TextEncoder().encode("not a pdf"));
    expect((await checkDocument(p, "pdf", { formats: ["pdf"] }, "han", {})).findings).toEqual([{ code: "unreadable" }]);
  });
});

describe("an Office file and its PDF", () => {
  const ref = (id: string, name: string, type: string): MediaRef => ({ id: id.repeat(64), type, bytes: 10, name, k: "k" });
  test("pair by name; the PDF rides on the deck and is not shown on its own", () => {
    const deck = ref("a", "Ducter 融资.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const pdf = ref("b", "ducter 融资.PDF", "application/pdf");
    const other = ref("c", "notes.pdf", "application/pdf");
    const out = pairPages([deck, pdf, other]);
    expect(out.map((m) => m.name)).toEqual(["Ducter 融资.pptx", "notes.pdf"]);
    expect(out[0]!.pages).toEqual({ id: pdf.id, k: "k", bytes: 10 });
  });
});

describe("the round on a done report", () => {
  let td: ReturnType<typeof tempDir>;
  beforeEach(() => (td = tempDir()));
  afterEach(() => td.cleanup());

  test("found goes back once; then what is still so rides on the report, in the person's words", async () => {
    const log = openLog({ path: join(td.dir, "log.db"), persona: "p1" });
    log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "融资 deck", project: "", place: { kind: "none" }, harness: "claude-code", brief: "做个 5 页的融资 deck", language: "zh-CN" } });
    const file = join(td.dir, "deck.pptx");
    const slides = [1, 2, 3, 4, 5, 6].map((i) => [{ x: 0.9, y: 0.6, w: 11.5, h: 1.2, paras: [{ text: `第 ${i} 页`, size: 40 }] }]);
    writeFileSync(file, pptx(slides));
    const m: MediaRef = { id: "d".repeat(64), type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: 1, name: "融资.pptx", k: "k" };
    const dc = createDocCheck({ log, path: (id) => (id === m.id ? file : undefined), read: { tools: {} } });
    const body = (): Bodies["report"] => ({ taskId: "t1", state: "done", summary: "做好了", questions: [], evidence: [], media: [m] });
    const first = await dc.check("t1", body());
    expect(first?.again).toStartWith("Not sent yet");
    expect(first?.again).toContain("asked for 5 slides and it has 6");
    const second = await dc.check("t1", body());
    expect(second?.again).toBeUndefined();
    expect(second?.doc?.left).toEqual(["要的是 5 张，做出来 6 张"]);
    log.close?.();
  });

  test("clean pages say nothing; not a document ask, or switched off: not read at all", async () => {
    const log = openLog({ path: join(td.dir, "log.db"), persona: "p1" });
    log.append({ stream: "task:t2", origin: "partner", kind: "task_open", body: { taskId: "t2", title: "修 flaky 测试", project: "", place: { kind: "none" }, harness: "claude-code", brief: "把 CI 里那个测试修好" } });
    log.append({ stream: "task:t3", origin: "partner", kind: "task_open", body: { taskId: "t3", title: "融资 deck", project: "", place: { kind: "none" }, harness: "claude-code", brief: "做个 1 页的融资 deck" } });
    const file = join(td.dir, "deck.pptx");
    writeFileSync(file, pptx([[{ x: 0.9, y: 0.6, w: 11.5, h: 1.2, paras: [{ text: "Ducter", size: 40 }] }]]));
    const m: MediaRef = { id: "e".repeat(64), type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: 1, name: "a.pptx", k: "k" };
    let off = false;
    const dc = createDocCheck({ log, path: () => file, read: { tools: {} }, off: () => off });
    const body = (taskId: string): Bodies["report"] => ({ taskId, state: "done", summary: "好了", questions: [], evidence: [], media: [m] });
    expect(await dc.check("t2", body("t2"))).toBeUndefined();
    expect(await dc.check("t3", body("t3"))).toEqual({ media: [m] });
    off = true;
    expect(await dc.check("t3", body("t3"))).toBeUndefined();
    log.close?.();
  });
});
