// D299: reading a session file without reading all of it. Sessions run from a few KB to over a
// GB (research/103 §4), so a listing reads only the head (until it has what it needs) and the
// tail; a history reads only the tail. Read only: nothing here ever writes, renames or locks.
import { closeSync, openSync, readSync } from "node:fs";

/** Parses one JSONL line; undefined for a blank, partial or broken one. */
export function parseLine(line: string): Record<string, unknown> | undefined {
  const s = line.trim();
  if (!s || s[0] !== "{") return undefined;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The file's records from the start, in chunks, until `enough` says so or `cap` bytes were read.
 * A line longer than the cap (a record carrying a whole prompt) is skipped, not split.
 */
export function eachHead(path: string, enough: (r: Record<string, unknown>) => boolean, cap = 1 << 20): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(64 * 1024);
    let rest = "";
    let read = 0;
    while (read < cap) {
      const n = readSync(fd, buf, 0, buf.length, read);
      if (n <= 0) break;
      read += n;
      const text = rest + buf.subarray(0, n).toString("utf8");
      const lines = text.split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) {
        const r = parseLine(l);
        if (r && enough(r)) return;
      }
      if (rest.length > cap) rest = "";
    }
    if (rest) {
      const r = parseLine(rest);
      if (r) enough(r);
    }
  } catch {
    /* unreadable: nothing */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** The complete records in the last `bytes` of the file, oldest first. */
export function tailRecords(path: string, size: number, bytes: number): Record<string, unknown>[] {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    const n = readSync(fd, buf, 0, buf.length, start);
    const lines = buf.subarray(0, n).toString("utf8").split("\n");
    if (start > 0) lines.shift(); // the first line is cut
    const out: Record<string, unknown>[] = [];
    for (const l of lines) {
      const r = parseLine(l);
      if (r) out.push(r);
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** The text of a message's content: a string, or the text blocks of an array (tool results left out). */
export function textOf(content: unknown, kinds = ["text", "input_text", "output_text"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    if (kinds.includes(String(o.type)) && str(o.text)) out.push(o.text as string);
  }
  return out.join("\n");
}

/** Words the agent or its harness put in the person's role, never the person's own. */
export function machineWords(text: string): boolean {
  const s = text.trimStart();
  return !s || s.startsWith("<") || s.startsWith("Caveat:") || s.startsWith("# AGENTS.md") || s.startsWith("[Request interrupted");
}

/** One line of a prompt for a title: the first non-empty line, cut at 120 characters. */
export function lineOf(text: string, max = 120): string {
  const l = text.split("\n").find((x) => x.trim())?.trim().replace(/\s+/g, " ") ?? "";
  return [...l].length > max ? `${[...l].slice(0, max - 1).join("")}…` : l;
}
