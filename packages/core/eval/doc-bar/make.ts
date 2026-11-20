// research/188: making the documents the check is measured on. A PDF from an HTML draft printed
// by a real headless Chrome (what the task is told to do), a PDF written the way a script library
// with a Latin default font writes one (Chinese in Helvetica), and minimal Office XML for decks and
// Word files (the parts the check reads; not files an Office app is promised to open).
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------- a zip, stored ----------

export function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let off = 0;
  for (const [name, v] of Object.entries(files)) {
    const data = typeof v === "string" ? enc.encode(v) : v;
    const nb = enc.encode(name);
    const crc = Bun.hash.crc32(data) >>> 0;
    const lh = new Uint8Array(30 + nb.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, nb.length, true);
    lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true);
    c.setUint32(42, off, true);
    ch.set(nb, 46);
    locals.push(lh, data);
    centrals.push(ch);
    off += lh.length + data.length;
  }
  const cdSize = centrals.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, centrals.length, true);
  e.setUint16(10, centrals.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, off, true);
  const all = [...locals, ...centrals, end];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of all) out.set(x, p), (p += x.length);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- a deck ----------

/** A text box (inches, points) or a picture on a slide. */
export type Shape = { x: number; y: number; w: number; h: number; paras?: { text: string; size?: number }[]; fit?: "shrink" | "grow"; picture?: boolean };

const IN = 914400;
export function pptx(slides: Shape[][], size: { w: number; h: number } = { w: 13.333, h: 7.5 }): Uint8Array {
  const sp = (s: Shape, i: number) => {
    const xfrm = `<a:xfrm><a:off x="${Math.round(s.x * IN)}" y="${Math.round(s.y * IN)}"/><a:ext cx="${Math.round(s.w * IN)}" cy="${Math.round(s.h * IN)}"/></a:xfrm>`;
    if (s.picture) return `<p:pic><p:nvPicPr><p:cNvPr id="${i + 2}" name="Picture ${i}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr>${xfrm}</p:spPr></p:pic>`;
    const fit = s.fit === "shrink" ? "<a:normAutofit/>" : s.fit === "grow" ? "<a:spAutoFit/>" : "";
    const ps = (s.paras ?? []).map((p) => `<a:p><a:r><a:rPr lang="zh-CN" sz="${Math.round((p.size ?? 18) * 100)}"/><a:t>${esc(p.text)}</a:t></a:r></a:p>`).join("");
    return `<p:sp><p:nvSpPr><p:cNvPr id="${i + 2}" name="TextBox ${i}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr wrap="square">${fit}</a:bodyPr><a:lstStyle/>${ps}</p:txBody></p:sp>`;
  };
  const ns = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${ns}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${Math.round(size.w * IN)}" cy="${Math.round(size.h * IN)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`,
  };
  slides.forEach((shapes, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.map(sp).join("")}</p:spTree></p:cSld></p:sld>`;
  });
  return zip(files);
}

// ---------- a Word file ----------

export type Block = { p: string } | { table: string[][]; cols: number[] /* inches */ } | { picture: number /* inches wide */ };

export function docx(blocks: Block[], page: { w: number; h: number; margin: number } = { w: 8.27, h: 11.69, margin: 1 }): Uint8Array {
  const tw = (inch: number) => Math.round(inch * 1440);
  const body = blocks
    .map((b) => {
      if ("p" in b) return `<w:p><w:r><w:rPr><w:rFonts w:eastAsia="PingFang SC"/></w:rPr><w:t xml:space="preserve">${esc(b.p)}</w:t></w:r></w:p>`;
      if ("table" in b)
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${b.cols.map((c) => `<w:gridCol w:w="${tw(c)}"/>`).join("")}</w:tblGrid>${b.table.map((r) => `<w:tr>${r.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${tw(b.cols[i] ?? 1)}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
      return `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${Math.round(b.picture * IN)}" cy="${Math.round(3 * IN)}"/></wp:inline></w:drawing></w:r></w:p>`;
    })
    .join("");
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="${tw(page.w)}" w:h="${tw(page.h)}"/><w:pgMar w:top="${tw(page.margin)}" w:right="${tw(page.margin)}" w:bottom="${tw(page.margin)}" w:left="${tw(page.margin)}"/></w:sectPr></w:body></w:document>`;
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": doc,
  });
}

// ---------- a PDF the way a script library with a Latin default font writes one ----------

/** Lines of text in Helvetica (WinAnsi): any Chinese in them is bytes the font can't show. */
export function latinPdf(pages: string[][], o: { boxes?: boolean } = {}): Uint8Array {
  const enc = (s: string) => {
    // As a library that can't encode the characters writes them: their UTF-8 bytes, or a box each.
    const raw = o.boxes ? s.replace(/[^\x00-\x7f]/g, "\x7f") : Buffer.from(s, "utf8").toString("latin1");
    return raw.replace(/[\\()]/g, (c) => `\\${c}`);
  };
  const objs: string[] = [];
  const add = (s: string) => (objs.push(s), objs.length);
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const content = `BT /F1 12 Tf 72 770 Td 16 TL ${lines.map((l) => `(${enc(l)}) '`).join(" ")} ET`;
    const c = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

// ---------- a PDF printed by a real headless Chrome ----------

/** A Chrome to print with: DUCTER_TEST_CHROME, else Google Chrome's app on a Mac (a throwaway profile either way). */
export function chromePath(): string | undefined {
  const env = process.env.DUCTER_TEST_CHROME;
  if (env && existsSync(env)) return env;
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/chromium", "/usr/bin/google-chrome"]) if (existsSync(p)) return p;
  return undefined;
}

export async function printPdf(chrome: string, html: string, out: string): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), "ducter-print-"));
  try {
    const src = join(dir, "draft.html");
    writeFileSync(src, html);
    const p = Bun.spawn([chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--no-pdf-header-footer", `--user-data-dir=${join(dir, "profile")}`, `--print-to-pdf=${out}`, `file://${src}`], { stdout: "ignore", stderr: "ignore" });
    // Chrome sometimes lingers after writing: the file, once its size holds still, is the print.
    let last = -1;
    for (let i = 0; i < 300; i++) {
      await Bun.sleep(100);
      const size = existsSync(out) ? Bun.file(out).size : -1;
      if (size > 0 && size === last) break;
      last = size;
      if (p.exitCode !== null && size <= 0) break;
    }
    p.kill();
    await p.exited;
    return existsSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
