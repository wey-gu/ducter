// D239: which viewer a file a task showed opens in, and how much of it the viewer reads.
import { expect, test } from "bun:test";
import { docGlimpse, fileView, parseTable, tableSep, viewText } from "../src/media.ts";

test("each kind opens in the viewer that suits it; what can't be shown says so", () => {
  expect(fileView({ type: "text/markdown", name: "investigation.md" })).toBe("markdown");
  expect(fileView({ type: "text/plain", name: "notes.markdown" })).toBe("markdown");
  expect(fileView({ type: "text/csv", name: "sales.csv" })).toBe("table");
  expect(fileView({ type: "text/plain", name: "runs.tsv" })).toBe("table");
  expect(fileView({ type: "text/plain", name: "fix.ts" })).toBe("text");
  expect(fileView({ type: "application/json", name: "plan.json" })).toBe("text");
  // A page a task made is shown as its source, never run.
  expect(fileView({ type: "text/html", name: "report.html" })).toBe("text");
  expect(fileView({ type: "image/svg+xml", name: "logo.svg" })).toBe("picture");
  expect(fileView({ type: "video/mp4", name: "demo.mp4" })).toBe("video");
  // D242: a PDF is drawn page by page.
  expect(fileView({ type: "application/pdf", name: "album.pdf" })).toBe("pdf");
  expect(fileView({ type: "application/zip" })).toBe("none");
  expect(tableSep("runs.tsv")).toBe("\t");
  expect(tableSep("sales.csv")).toBe(",");
});

test("a long file is cut at its last whole line, never inside a character", () => {
  const all = new TextEncoder().encode("第一行\n第二行\n第三行很长");
  expect(viewText(all, all.length)).toEqual({ text: "第一行\n第二行\n第三行很长", cut: false });
  // 13 bytes end inside 二.
  expect(viewText(all.subarray(0, 13), all.length)).toEqual({ text: "第一行", cut: true });
  expect(viewText(new TextEncoder().encode("﻿a\r\nb"), 7).text).toBe("a\nb");
});

test("CSV: quotes, doubled quotes and line breaks inside a cell; rows past the cap are left out", () => {
  expect(parseTable('name,note\n"Wang, Lei","said ""yes""\nthen left"\n').rows).toEqual([
    ["name", "note"],
    ["Wang, Lei", 'said "yes"\nthen left'],
  ]);
  const many = Array.from({ length: 10 }, (_, i) => `r${i},${i}`).join("\n");
  expect(parseTable(many, ",", 4)).toEqual({ rows: [["r0", "0"], ["r1", "1"], ["r2", "2"], ["r3", "3"]], more: true });
  expect(parseTable("a\tb\n1\t2", "\t").rows).toEqual([["a", "b"], ["1", "2"]]);
});

// D567: a Markdown file's card shows its rendered start, never its marks. The cases are shared with
// the Mac's DocGlimpse (apps/desktop/internal/protocol/fileview_test.go).
test("a Markdown glimpse: the title as a heading, the first words with no marks", async () => {
  const cases = (await import("./doc-glimpse.json")).default as { about: string; text: string; title: string; lines: string[] }[];
  for (const c of cases) expect({ about: c.about, ...docGlimpse(c.text) }).toEqual({ about: c.about, title: c.title, lines: c.lines });
  // A long line is cut to 200 characters; at most `max` lines.
  const long = docGlimpse(`# T\n\n${"字".repeat(300)}\n\nb\n\nc\n\nd`);
  expect([...long.lines[0]!].length).toBe(200);
  expect(long.lines.length).toBe(3);
});
