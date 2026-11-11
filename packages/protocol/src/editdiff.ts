// What an edit changed, from the edit tool's own input (D210): the lines it took out and put in,
// as an opened task shows under an edit's row. Read from the call, not from git: Claude Code's
// Edit / MultiEdit / Write, Codex's apply_patch and fileChange, any tool with old/new strings or
// a patch. Lines are "+…", "-…", " …" (context), and "@@" between hunks ("@@ path" before each
// file when the call touched several). Pure; the Go port (apps/desktop/internal/views/editdiff.go)
// passes the same cases through fixtures/transcript.json.

/** At most this many lines travel with a row; the rest is a count. */
export const DIFF_MAX = 60;
/** Unchanged lines kept around an old/new edit. */
const CONTEXT = 2;

export interface EditDiff {
  lines: string[];
  added: number;
  removed: number;
  /** Lines past DIFF_MAX, not carried. */
  more: number;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isStr = (v: unknown): v is string => typeof v === "string";

/** A text's lines; a final newline ends the last line rather than starting an empty one. */
function splitLines(s: string): string[] {
  if (s === "") return [];
  const t = s.replace(/\r\n/g, "\n");
  return (t.endsWith("\n") ? t.slice(0, -1) : t).split("\n");
}

/** old → new as one hunk: the common head and tail trimmed to CONTEXT lines of context. */
export function linesDiff(a: string, b: string): string[] {
  const A = splitLines(a);
  const B = splitLines(b);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  return [
    ...A.slice(Math.max(0, p - CONTEXT), p).map((l) => ` ${l}`),
    ...A.slice(p, A.length - s).map((l) => `-${l}`),
    ...B.slice(p, B.length - s).map((l) => `+${l}`),
    ...A.slice(A.length - s, Math.min(A.length, A.length - s + CONTEXT)).map((l) => ` ${l}`),
  ];
}

/** A patch (apply_patch's envelope or a unified diff) as lines; `path` heads it when given. */
function patchLines(patch: string, path?: string): string[] {
  const out: string[] = path ? [`@@ ${path}`] : [];
  const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].length;
  for (const l of splitLines(patch)) {
    const f = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(l);
    if (f) {
      if (files > 1) out.push(`@@ ${f[1]!.trim()}`);
      continue;
    }
    if (l.startsWith("***") || l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ") || l.startsWith("index ")) continue;
    if (l.startsWith("@@")) {
      if (out.length && !out.at(-1)!.startsWith("@@")) out.push("@@");
      continue;
    }
    if (l.startsWith("+") || l.startsWith("-") || l.startsWith(" ")) out.push(l);
    else if (l === "") out.push(" ");
  }
  return out;
}

const looksLikePatch = (s: string) => /^\*\*\* Begin Patch|^@@|^\+\+\+ /m.test(s);

/** The lines of an edit call, or undefined when its input says nothing about what changed. */
export function editDiff(input: unknown): EditDiff | undefined {
  let lines: string[] = [];
  const o = obj(input);
  if (isStr(input)) lines = looksLikePatch(input) ? patchLines(input) : [];
  else if (isStr(o.old_string) || isStr(o.new_string) || isStr(o.old_str) || isStr(o.new_str))
    lines = linesDiff(String(o.old_string ?? o.old_str ?? ""), String(o.new_string ?? o.new_str ?? ""));
  else if (Array.isArray(o.edits)) {
    for (const e of o.edits) {
      const x = obj(e);
      const d = linesDiff(String(x.old_string ?? x.old_str ?? x.oldText ?? ""), String(x.new_string ?? x.new_str ?? x.newText ?? ""));
      if (!d.length) continue;
      if (lines.length) lines.push("@@");
      lines.push(...d);
    }
  } else if (isStr(o.content) || isStr(o.file_text)) lines = splitLines(String(o.content ?? o.file_text)).map((l) => `+${l}`);
  else if (Array.isArray(o.changes)) {
    const cs = o.changes.map(obj).filter((c) => isStr(c.diff) || isStr(c.unified_diff));
    for (const c of cs) lines.push(...patchLines(String(c.diff ?? c.unified_diff), cs.length > 1 && isStr(c.path) ? c.path : undefined));
  } else {
    const p = [o.patch, o.input, o.diff].find((v): v is string => isStr(v) && looksLikePatch(v));
    if (p) lines = patchLines(p);
  }
  if (!lines.some((l) => l.startsWith("+") || l.startsWith("-"))) return undefined;
  const added = lines.filter((l) => l.startsWith("+")).length;
  const removed = lines.filter((l) => l.startsWith("-")).length;
  const more = Math.max(0, lines.length - DIFF_MAX);
  return { lines: lines.slice(0, DIFF_MAX), added, removed, more };
}
