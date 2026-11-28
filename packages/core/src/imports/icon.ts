// D670 (the author's 2026-11-28 plugin repository): an app's own icon travels with its
// plugin. The manifest names a PNG or SVG inside the plugin (`app.icon`); this module checks it
// and turns it into one data URL, the same bytes the web and the Mac draw in the shared clay
// tile (D622). A missing, oversized or odd icon is not an error: the letter tile stays the
// fallback, the way every app without a faithful mark keeps its initial.
//
// Only a file inside the plugin folder can be an icon: an absolute path, `..`, a URL or anything
// that isn't a PNG or SVG is refused. Size is capped so a settings frame stays small.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, normalize, relative, resolve } from "node:path";

/** The largest icon Ducter carries into a row: a 256 px PNG is far below this. */
export const ICON_MAX_BYTES = 256 * 1024;
const MIME: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml" };

/** Whether a manifest may name this path as its app icon. */
export function iconPathOk(rel: string): boolean {
  const p = rel.trim();
  if (!p || p.includes("\0") || p.includes("\\")) return false;
  if (isAbsolute(p) || /^[a-z]+:/i.test(p)) return false;
  if (p.split("/").includes("..")) return false;
  return extname(p).toLowerCase() in MIME;
}

/** A PNG's first bytes, or an SVG with a root element and no script. */
function looksRight(bytes: Buffer, ext: string): boolean {
  if (ext === ".png") return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (!/^<\?xml[\s\S]*?\?>\s*<svg[\s>]/i.test(text) && !/^<svg[\s>]/i.test(text)) return false;
  return !/<script[\s>]/i.test(text) && !/on[a-z]+\s*=/i.test(text);
}

/**
 * The icon at `rel` inside `dir` as a data URL, or undefined when it is missing, too big, or not
 * the picture the name promises. Never throws: a bad icon is a letter tile, not a broken pane.
 */
export function iconDataUrl(dir: string, rel: string | undefined): string | undefined {
  if (!rel || !iconPathOk(rel)) return undefined;
  const root = resolve(dir);
  const file = normalize(resolve(root, rel));
  const inside = relative(root, file);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return undefined;
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return undefined;
    const size = statSync(file).size;
    if (size <= 0 || size > ICON_MAX_BYTES) return undefined;
    const bytes = readFileSync(file);
    const ext = extname(file).toLowerCase();
    if (!looksRight(bytes, ext)) return undefined;
    return `data:${MIME[ext]};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** The manifest's own icon path, checked but not read: parse-time validation uses this. */
export function iconRefOk(rel: string): boolean {
  return iconPathOk(rel);
}
