// research/188: how often Ducter's page check (D439) catches a document's seeded defect, and how
// often it says something about a clean one.
//   bun packages/core/eval/doc-bar/run.ts [--only <id>] [--pictures <dir>] [--bare]
// Each case's document is made as a task would make it (an HTML draft printed by a real headless
// Chrome with a throwaway profile; a PDF in a Latin font; Office XML), then checked by exactly what
// Ducter runs on a done report (checkDocument with the ask read by docAsk). Two passes: with this
// computer's Poppler, and with none (what a home without it reads). Scored: defects caught (every
// expected code found), false alarms (any finding on a clean case), and other findings on a defect.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docAsk, docFormat, type DocFindingCode } from "@ducter/protocol";
import { checkDocument, readsIn, tool } from "../../src/doc-check.ts";
import { CASES } from "./cases.ts";
import { chromePath, printPdf } from "./make.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ONLY = arg("only");
const PICS = arg("pictures");
const chrome = chromePath();
const scratch = mkdtempSync(join(tmpdir(), "ducter-docbar-"));
const poppler = { pdftotext: tool("pdftotext"), pdffonts: tool("pdffonts"), pdfinfo: tool("pdfinfo"), pdftoppm: tool("pdftoppm") };

interface Row {
  id: string;
  pass: "poppler" | "bare";
  expect: DocFindingCode[];
  found: string[];
  pages?: number;
  caught?: boolean;
  falseAlarm?: boolean;
  others?: string[];
  skipped?: string;
  ms: number;
}

const rows: Row[] = [];
const cases = CASES.filter((c) => !ONLY || c.id === ONLY);
const passes: ("poppler" | "bare")[] = process.argv.includes("--bare") ? ["bare"] : poppler.pdftotext ? ["poppler", "bare"] : ["bare"];
for (const c of cases) {
  const file = join(scratch, `${c.id}-${c.make.name}`);
  if ("html" in c.make) {
    if (!chrome) {
      for (const pass of passes) rows.push({ id: c.id, pass, expect: c.expect, found: [], skipped: "no Chrome", ms: 0 });
      continue;
    }
    if (!(await printPdf(chrome, c.make.html, file))) {
      for (const pass of passes) rows.push({ id: c.id, pass, expect: c.expect, found: [], skipped: "Chrome didn't print", ms: 0 });
      continue;
    }
  } else writeFileSync(file, c.make.bytes());
  const ask = docAsk(c.ask);
  for (const pass of passes) {
    const t0 = performance.now();
    const pics = PICS && pass === "poppler" ? join(PICS, c.id) : undefined;
    const r = await checkDocument(file, docFormat({ type: "", name: c.make.name })!, ask ?? { formats: [] }, readsIn(c.lang, c.ask), { tools: pass === "poppler" ? poppler : {}, ...(pics ? { picturesTo: pics } : {}) });
    const found = r.findings.map((f) => f.code);
    const row: Row = { id: c.id, pass, expect: c.expect, found: r.findings.map((f) => `${f.code}${f.page ? `@${f.page}` : ""}${f.n !== undefined ? `=${f.n}` : ""}${f.text ? `:${f.text}` : ""}`), ...(r.pages ? { pages: r.pages } : {}), ms: Math.round(performance.now() - t0) };
    if (!ask) row.skipped = "docAsk read no document ask";
    if (c.expect.length) {
      row.caught = c.expect.every((e) => found.includes(e));
      row.others = row.found.filter((f) => !c.expect.some((e) => f.startsWith(e)));
    } else row.falseAlarm = found.length > 0;
    rows.push(row);
    if (pics && PICS) mkdirSync(pics, { recursive: true }), copyFileSync(file, join(pics, c.make.name.replace(/[/\\]/g, "-")));
    const mark = c.expect.length ? (row.caught ? "caught" : "MISSED") : row.falseAlarm ? "FALSE ALARM" : "quiet";
    console.log(`${pass.padEnd(7)} ${c.id.padEnd(26)} ${mark.padEnd(12)} pages ${String(r.pages ?? "?").padEnd(3)} ${JSON.stringify(row.found)}${row.skipped ? `  (${row.skipped})` : ""}`);
  }
}

const tally = (pass: "poppler" | "bare") => {
  const rs = rows.filter((r) => r.pass === pass && !r.skipped);
  const d = rs.filter((r) => r.expect.length);
  const c = rs.filter((r) => !r.expect.length);
  const byFormat = (f: string) => {
    const of = (r: Row) => docFormat({ type: "", name: CASES.find((x) => x.id === r.id)!.make.name }) === f;
    return { caught: d.filter((r) => of(r) && r.caught).length, defects: d.filter(of).length, falseAlarms: c.filter((r) => of(r) && r.falseAlarm).length, clean: c.filter(of).length };
  };
  return {
    caught: d.filter((r) => r.caught).length,
    defects: d.length,
    falseAlarms: c.filter((r) => r.falseAlarm).length,
    clean: c.length,
    otherFindingsOnDefects: d.reduce((n, r) => n + (r.others?.length ?? 0), 0),
    pdf: byFormat("pdf"),
    pptx: byFormat("pptx"),
    docx: byFormat("docx"),
    msPerDoc: rs.length ? Math.round(rs.reduce((n, r) => n + r.ms, 0) / rs.length) : 0,
  };
};
const summary = {
  at: new Date().toISOString(),
  chrome: chrome ? "yes" : "no",
  poppler: poppler.pdftotext ? "yes" : "no",
  soffice: tool("soffice") ? "yes" : "no",
  cases: cases.length,
  skipped: rows.filter((r) => r.skipped).length,
  ...Object.fromEntries(passes.map((p) => [p === "poppler" ? "withPoppler" : "withoutPoppler", tally(p)])),
};
console.log(JSON.stringify(summary, null, 2));
const dir = join(import.meta.dir, "results");
mkdirSync(dir, { recursive: true });
if (!ONLY) writeFileSync(join(dir, `${summary.at.slice(0, 16).replace(/[:T]/g, "-")}.json`), JSON.stringify({ summary, rows }, null, 2) + "\n");
rmSync(scratch, { recursive: true, force: true });
