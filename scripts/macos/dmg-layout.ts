// Lays out the disk image's window without Finder or a GUI session (make-app.sh runs it on a
// mounted read-write image, also in CI): writes <volume>/.DS_Store with the window's size, no
// toolbar or sidebar, 128 pt icons, the background picture, and where each icon sits.
//
//   bun scripts/macos/dmg-layout.ts <mounted volume> <volume name> <app name>
//
// The background is <volume>/.background/background.tiff. The layout matches
// tools/art/dmg_background.py: the app at (160, 196), Applications at (480, 196), a 640×400
// window. Formats: the .DS_Store buddy allocator and B-tree as Mark Mentovai and Wim Lewis
// documented them; the background is an Alias record (version 2), as Finder writes it.
import { spawnSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [vol, volName, appName] = process.argv.slice(2);
if (!vol || !volName || !appName) {
  console.error("usage: dmg-layout.ts <mounted volume> <volume name> <app name>");
  process.exit(2);
}

// WindowBounds is the window's frame, title bar included (28 pt): the content is 640×400.
export const WINDOW = { x: 200, y: 120, w: 640, h: 400 + 28 };
export const ICONS: Record<string, [number, number]> = { [appName]: [160, 196], Applications: [480, 196] };
const BG = ".background/background.tiff";

// ---------- small binary helpers ----------

class Buf {
  parts: Uint8Array[] = [];
  u8(n: number) { this.parts.push(Uint8Array.of(n & 0xff)); return this; }
  u16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xffff); this.parts.push(b); return this; }
  i16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, n); this.parts.push(b); return this; }
  u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); this.parts.push(b); return this; }
  bytes(b: Uint8Array) { this.parts.push(b); return this; }
  ascii(s: string) { return this.bytes(new TextEncoder().encode(s)); }
  zeros(n: number) { return this.bytes(new Uint8Array(n)); }
  get length() { return this.parts.reduce((n, p) => n + p.length, 0); }
  out(): Uint8Array {
    const o = new Uint8Array(this.length);
    let i = 0;
    for (const p of this.parts) o.set(p, i), (i += p.length);
    return o;
  }
}
const utf16be = (s: string) => {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) b[2 * i] = s.charCodeAt(i) >> 8, (b[2 * i + 1] = s.charCodeAt(i) & 0xff);
  return b;
};
/** A Pascal string padded to `size` bytes (length byte included). Names here are ASCII. */
const pascal = (s: string, size: number) => {
  const b = new Uint8Array(size);
  const e = new TextEncoder().encode(s).slice(0, size - 1);
  b[0] = e.length;
  b.set(e, 1);
  return b;
};
const HFS_EPOCH = 2082844800; // seconds from 1904-01-01 to 1970-01-01
const hfsTime = (d: Date) => Math.floor(d.getTime() / 1000) + HFS_EPOCH;

// ---------- the background's Alias record ----------

/** Finder's alias to the background picture, from the mounted volume's own ids and dates
 *  (on HFS+ a file's inode number is its catalog node id), so it resolves on every Mac that
 *  mounts the image: the converted image keeps the volume's creation date and the ids. */
function backgroundAlias(): Uint8Array {
  const file = join(vol!, BG);
  const dir = join(vol!, ".background");
  const fs = statSync(file);
  const ds = statSync(dir);
  const vs = statSync(vol!);
  const name = "background.tiff";
  const body = new Buf()
    .u16(0) // kind: file
    .bytes(pascal(volName!, 28))
    .u32(hfsTime(vs.birthtime))
    .ascii("H+")
    .u16(5) // disk type: ejectable
    .u32(ds.ino) // parent's catalog node id
    .bytes(pascal(name, 64))
    .u32(fs.ino)
    .u32(hfsTime(fs.birthtime))
    .zeros(4) // creator
    .zeros(4) // type
    .i16(-1) // levels from
    .i16(-1) // levels to
    .u32(0) // volume attributes
    .zeros(2) // volume fs id
    .zeros(10);
  const tag = (t: number, data: Uint8Array) => {
    body.i16(t).u16(data.length).bytes(data);
    if (data.length % 2) body.u8(0);
  };
  const enc = (s: string) => new TextEncoder().encode(s);
  const uni = (s: string) => new Buf().u16(s.length).bytes(utf16be(s)).out();
  tag(0, enc(".background")); // the parent folder's name
  tag(1, new Buf().u32(ds.ino).out()); // the folders' ids, up to the volume
  tag(2, enc(`${volName}:.background:${name}`)); // the Carbon path
  tag(14, uni(name));
  tag(15, uni(volName!));
  tag(18, enc(`/${BG}`)); // the POSIX path inside the volume
  tag(19, enc(`/Volumes/${volName}`)); // where it mounts
  body.i16(-1).u16(0);
  const rec = body.out();
  return new Buf().zeros(4).u16(8 + rec.length).u16(2).bytes(rec).out();
}

// ---------- binary property lists (via plutil) ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function plistXml(v: unknown): string {
  if (typeof v === "boolean") return v ? "<true/>" : "<false/>";
  if (typeof v === "number") return Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`;
  if (typeof v === "string") return `<string>${esc(v)}</string>`;
  if (v instanceof Uint8Array) return `<data>${Buffer.from(v).toString("base64")}</data>`;
  const o = v as Record<string, unknown>;
  return `<dict>${Object.keys(o)
    .sort()
    .map((k) => `<key>${esc(k)}</key>${plistXml(o[k])}`)
    .join("")}</dict>`;
}
function binaryPlist(v: unknown): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${plistXml(v)}</plist>`;
  const r = spawnSync("plutil", ["-convert", "binary1", "-o", "-", "-"], { input: xml });
  if (r.status !== 0) throw new Error(`plutil: ${r.stderr}`);
  return new Uint8Array(r.stdout);
}

// ---------- records ----------

type Rec = { name: string; code: string; type: string; data: Uint8Array };
const blob = (name: string, code: string, data: Uint8Array): Rec => ({ name, code, type: "blob", data: new Buf().u32(data.length).bytes(data).out() });
const long = (name: string, code: string, n: number): Rec => ({ name, code, type: "long", data: new Buf().u32(n).out() });

const records: Rec[] = [
  blob(".", "bwsp", binaryPlist({
    ContainerShowSidebar: false,
    ShowPathbar: false,
    ShowSidebar: false,
    ShowStatusBar: false,
    ShowTabView: false,
    ShowToolbar: false,
    SidebarWidth: 0,
    WindowBounds: `{{${WINDOW.x}, ${WINDOW.y}}, {${WINDOW.w}, ${WINDOW.h}}}`,
  })),
  blob(".", "icvp", binaryPlist({
    arrangeBy: "none",
    backgroundColorBlue: 1.0,
    backgroundColorGreen: 1.0,
    backgroundColorRed: 1.0,
    backgroundImageAlias: backgroundAlias(),
    backgroundType: 2,
    gridOffsetX: 0.0,
    gridOffsetY: 0.0,
    gridSpacing: 100.0,
    iconSize: 128.0,
    labelOnBottom: true,
    showIconPreview: true,
    showItemInfo: false,
    textSize: 13.0,
    viewOptionsVersion: 1,
  })),
  long(".", "vSrn", 1),
  ...Object.entries(ICONS).map(([name, [x, y]]) =>
    blob(name, "Iloc", new Buf().u32(x).u32(y).bytes(Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0)).out()),
  ),
];
// Finder keeps records sorted by name (case-insensitively), then by code.
records.sort((a, b) => {
  const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
  return an < bn ? -1 : an > bn ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
});

// ---------- the file: buddy allocator, DSDB header, one leaf node ----------

const NODE = 4096;
const node = new Buf().u32(0).u32(records.length); // a leaf, its record count
for (const r of records) node.u32(r.name.length).bytes(utf16be(r.name)).ascii(r.code).ascii(r.type).bytes(r.data);
if (node.length > NODE) throw new Error("the layout records don't fit one node");

// Blocks (offsets relative to byte 4 of the file): the header [0, 32), the DSDB header
// [32, 64), the leaf node [4096, 8192), the allocator's own block [8192, 10240).
const blocks = [
  { off: 8192, log: 11 }, // 0: this allocator block
  { off: 32, log: 5 }, // 1: DSDB
  { off: 4096, log: 12 }, // 2: the leaf node
];
const used = [{ off: 0, size: 32 }, ...blocks.map((b) => ({ off: b.off, size: 1 << b.log }))];
// Free lists: every buddy of [0, 2^31) that nothing above overlaps.
const free: number[][] = Array.from({ length: 32 }, () => []);
(function split(off: number, log: number) {
  const size = 2 ** log;
  const hit = used.filter((u) => u.off < off + size && off < u.off + u.size);
  if (!hit.length) return void free[log]!.push(off);
  if (hit.some((u) => u.off === off && u.size === size)) return;
  split(off, log - 1);
  split(off + size / 2, log - 1);
})(0, 31);

const alloc = new Buf().u32(blocks.length).u32(0);
for (let i = 0; i < 256; i++) alloc.u32(i < blocks.length ? blocks[i]!.off | blocks[i]!.log : 0);
alloc.u32(1).u8(4).ascii("DSDB").u32(1); // the table of contents: DSDB is block 1
for (const list of free) {
  alloc.u32(list.length);
  for (const off of list) alloc.u32(off);
}
if (alloc.length > 2048) throw new Error("allocator block overflow");

const dsdb = new Buf().u32(2).u32(0).u32(records.length).u32(1).u32(0x1000); // root node, levels, records, nodes, page size

const file = new Uint8Array(4 + 10240);
const put = (off: number, b: Uint8Array) => file.set(b, 4 + off);
file.set(new Buf().u32(1).out(), 0);
put(0, new Buf().ascii("Bud1").u32(8192).u32(2048).u32(8192).zeros(16).out());
put(32, dsdb.out());
put(4096, node.out());
put(8192, alloc.out());
writeFileSync(join(vol, ".DS_Store"), file);
console.log(`laid out ${vol}: ${records.length} records`);
