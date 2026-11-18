// D341: Obsidian Tasks lines in a vault on the home: `- [ ] words \u{1F4C5} 2026-11-20 \u{1F53C}`. Read only from
// the folder the person chose; written one line at a time, in place, and only after the file was
// read again and found unchanged (research/126 §2: the person may have the note open, and a sync
// may be bringing a copy). Never another line, never the file's endings, BOM or last newline.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { SourceItem, SourceOp } from "@ducter/protocol";
import type { AdapterStatus, SourceAdapter, WriteResult } from "./adapter.ts";

export interface ObsidianOpts {
  source: string;
  /** The vault's folder on the home. */
  vault: string;
  /** The folder inside it to read ("" = all of it). */
  folder?: () => string | undefined;
  /** Only lines with this tag ("#ducter"). */
  tag?: () => string | undefined;
  /** Today, YYYY-MM-DD in the person's zone (the \u2705 date). */
  today?: () => string;
  now?: () => number;
  /** A file changed this recently is being edited: not written now (ms). */
  quietMs?: number;
}

const MAX_FILES = 4000;
const MAX_BYTES = 2_000_000;
const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s+)(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const SIGNIFIERS = /\s*(?:[\u{1F4C5}\u23F3\u{1F6EB}\u2795\u2705\u274C]\uFE0F?\s*\d{4}-\d{2}-\d{2}|\u{1F501}\uFE0F?[^\u{1F4C5}\u23F3\u{1F6EB}\u2795\u2705\u274C\u23EB\u{1F53C}\u{1F53D}\u23EC\u{1F53A}\u{1F194}\u26D4^]*|[\u23EB\u{1F53C}\u{1F53D}\u23EC\u{1F53A}]\uFE0F?|\u{1F194}\s*[\w-]+|\u26D4\s*[\w,-]+|\[[a-z]+::[^\]]*\])/gu;
const BLOCK = /\s\^([\w-]+)\s*$/;

export interface TaskLine {
  index: number;
  status: string;
  words: string;
  key: string;
  due?: string;
  priority?: SourceItem["priority"];
  repeats?: boolean;
}

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

/** The to-do's own words: the line after the checkbox, without the Tasks signifiers and the block id. */
export function wordsOf(rest: string): string {
  return rest.replace(BLOCK, "").replace(SIGNIFIERS, "").replace(/\s+/g, " ").trim();
}

export function parseLine(line: string, index: number): TaskLine | undefined {
  const m = TASK.exec(line);
  if (!m) return undefined;
  const rest = m[4]!;
  const words = wordsOf(rest);
  if (!words) return undefined;
  const id = /\u{1F194}\s*([\w-]+)/u.exec(rest)?.[1];
  const block = BLOCK.exec(rest)?.[1];
  const due = new RegExp(`\u{1F4C5}\\uFE0F?\\s*${DATE}`, "u").exec(rest)?.[1] ?? new RegExp(`\\[due::\\s*${DATE}\\]`).exec(rest)?.[1];
  const pr = /[\u23EB\u{1F53A}]/u.test(rest) ? "highest" : /\u{1F53C}/u.test(rest) ? "high" : /\u23EC/u.test(rest) ? "lowest" : /\u{1F53D}/u.test(rest) ? "low" : undefined;
  return {
    index,
    status: m[2]!,
    words,
    key: id ? `id:${id}` : block ? `^${block}` : sha(words),
    ...(due ? { due } : {}),
    ...(pr ? { priority: pr as SourceItem["priority"] } : {}),
    ...(/\u{1F501}/u.test(rest) ? { repeats: true } : {}),
  };
}

/** The to-do lines of one note, outside front matter and fenced code (a ```tasks query is not a to-do). */
export function parseNote(text: string): TaskLine[] {
  const lines = text.split(/\r?\n/);
  const out: TaskLine[] = [];
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i]!.trim() !== "---"; i++);
    i++;
  }
  let fence: string | undefined;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const f = /^\s*(```+|~~~+)/.exec(l)?.[1];
    if (f) {
      if (!fence) fence = f[0]!.repeat(3);
      else if (f.startsWith(fence[0]!)) fence = undefined;
      continue;
    }
    if (fence) continue;
    const t = parseLine(l, i);
    if (t) out.push(t);
  }
  return out;
}

const isOpen = (status: string) => status === " " || status === "/";

/** A sync's conflict copy or a dot folder is never read. */
const skipName = (n: string) => n.startsWith(".") || /sync-conflict|\(conflict|conflicted copy/i.test(n);

export function createObsidian(o: ObsidianOpts): SourceAdapter & { vaultName(): string } {
  const vault = resolve(o.vault);
  const name = basename(vault);
  const now = o.now ?? (() => Date.now());
  const quietMs = o.quietMs ?? 3000;
  const today = o.today ?? (() => new Date(now()).toISOString().slice(0, 10));

  const root = () => {
    const f = (o.folder?.() ?? "").replace(/^[/\\]+|[/\\]+$/g, "");
    const r = resolve(vault, f);
    return r === vault || r.startsWith(vault + sep) ? r : vault;
  };
  const urlOf = (rel: string) => `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(rel.replace(/\.md$/i, ""))}`;
  const tagOk = (words: string, line: string) => {
    const tag = o.tag?.()?.trim();
    if (!tag) return true;
    const t = tag.startsWith("#") ? tag : `#${tag}`;
    return new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(line) || words.includes(t);
  };

  function notes(): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      if (out.length >= MAX_FILES) return;
      let ents: import("node:fs").Dirent[];
      try {
        ents = readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        if (skipName(e.name)) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && /\.md$/i.test(e.name)) out.push(p);
      }
    };
    walk(root());
    return out;
  }

  const itemOf = (rel: string, t: TaskLine, mtime: number, line?: string): SourceItem => {
    // D357: the line's #tags, for the fold's chips (without the #).
    const labels = [...new Set([...(line ?? "").matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]!).filter((x) => !/^\d+$/.test(x)))];
    return { ...itemBase(rel, t, mtime), ...(labels.length ? { labels } : {}) };
  };
  const itemBase = (rel: string, t: TaskLine, mtime: number): SourceItem => ({
    source: o.source,
    kind: "obsidian",
    ref: `${rel}::${t.key}`,
    label: basename(rel).replace(/\.md$/i, ""),
    where: rel,
    title: t.words,
    url: urlOf(rel),
    state: isOpen(t.status) ? "open" : "closed",
    updatedAt: new Date(mtime).toISOString(),
    ...(t.due ? { due: t.due } : {}),
    ...(t.priority ? { priority: t.priority } : {}),
    ...(t.repeats ? { repeats: true } : {}),
  });

  const split = (ref: string) => {
    const i = ref.lastIndexOf("::");
    if (i < 0) return undefined;
    const rel = ref.slice(0, i);
    const abs = resolve(vault, rel);
    if (!(abs.startsWith(vault + sep))) return undefined;
    return { rel, abs, key: ref.slice(i + 2) };
  };

  /** The file as bytes and lines, with what a write must keep: its BOM, line ending and last newline. */
  function readNote(abs: string) {
    const st = statSync(abs);
    // iCloud keeps an evicted ("dataless") file's size but no blocks on disk: reading it would wait for a download.
    if (st.size > 0 && st.blocks === 0) return { offline: true as const, st };
    const raw = readFileSync(abs, "utf8");
    const bom = raw.startsWith("﻿");
    const text = bom ? raw.slice(1) : raw;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    return { st, raw, bom, text, eol, lines: text.split(/\r?\n/) };
  }

  return {
    kind: "obsidian",
    ops: ["tick", "untick"] as const,
    vaultName: () => name,
    async status(): Promise<AdapterStatus> {
      try {
        if (!statSync(vault).isDirectory()) return { state: "missing", account: name };
      } catch {
        return { state: "missing", account: name };
      }
      return { state: "ok", account: name };
    },
    async list() {
      const items: SourceItem[] = [];
      for (const abs of notes()) {
        let st: import("node:fs").Stats;
        try {
          st = statSync(abs);
          if (st.size > MAX_BYTES || (st.size > 0 && st.blocks === 0)) continue;
        } catch {
          continue;
        }
        const text = readFileSync(abs, "utf8");
        const lines = text.split(/\r?\n/);
        const rel = relative(vault, abs).split(sep).join("/");
        for (const t of parseNote(text)) if (isOpen(t.status) && tagOk(t.words, lines[t.index]!)) items.push(itemOf(rel, t, st.mtimeMs, lines[t.index]!));
      }
      // Due first (soonest), then the notes changed last.
      return items.sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")));
    },
    async get(ref) {
      const s = split(ref);
      if (!s || !existsSync(s.abs)) return undefined;
      const n = readNote(s.abs);
      if ("offline" in n) return undefined;
      const t = parseNote(n.text).find((x) => x.key === s.key);
      return t ? itemOf(s.rel, t, n.st.mtimeMs, n.lines[t.index]!) : undefined;
    },
    async write(ref, op: SourceOp): Promise<WriteResult> {
      if (op !== "tick" && op !== "untick") return { ok: false, error: `Obsidian can't ${op}` };
      const s = split(ref);
      if (!s) return { ok: false, refused: "changed", error: "not a vault ref" };
      if (!existsSync(s.abs)) return { ok: false, refused: "changed", error: "the note is gone" };
      // A sync's conflict copy beside it: which one is right is the person's call.
      const stem = basename(s.abs).replace(/\.md$/i, "");
      try {
        if (readdirSync(dirname(s.abs)).some((f) => f !== basename(s.abs) && f.startsWith(stem) && /sync-conflict|conflict/i.test(f))) return { ok: false, refused: "busy", error: "a sync conflict copy is beside the note" };
      } catch {}
      const n = readNote(s.abs);
      if ("offline" in n) return { ok: false, refused: "offline", error: "the note isn't downloaded on this computer" };
      if (now() - n.st.mtimeMs < quietMs) return { ok: false, refused: "busy", error: "the note changed seconds ago" };
      const t = parseNote(n.text).find((x) => x.key === s.key);
      if (!t) return { ok: false, refused: "changed", error: "the line isn't in the note any more" };
      const line = n.lines[t.index]!;
      const m = TASK.exec(line)!;
      let next: string;
      if (op === "tick") {
        if (!isOpen(t.status)) return { ok: false, refused: "changed", error: "the line is already ticked or cancelled" };
        if (t.repeats) return { ok: false, refused: "repeats", error: "a repeating to-do" };
        let rest = m[4]!.replace(/\s+$/, "");
        const done = ` \u2705 ${today()}`;
        const b = BLOCK.exec(rest);
        rest = b ? `${rest.slice(0, b.index)}${done}${rest.slice(b.index)}` : `${rest}${done}`;
        next = `${m[1]}x${m[3]}${rest}`;
      } else {
        if (t.status !== "x" && t.status !== "X") return { ok: false, refused: "changed", error: "the line isn't ticked" };
        next = `${m[1]} ${m[3]}${m[4]!.replace(/\s\u2705\uFE0F?\s*\d{4}-\d{2}-\d{2}/u, "")}`;
      }
      // Compare and swap: the file is read again just before the write and must be what was read.
      const again = statSync(s.abs);
      if (again.mtimeMs !== n.st.mtimeMs || again.size !== n.st.size || readFileSync(s.abs, "utf8") !== n.raw) return { ok: false, refused: "busy", error: "the note changed while it was being written" };
      const lines = [...n.lines];
      lines[t.index] = next;
      const out = (n.bom ? "﻿" : "") + lines.join(n.eol);
      // In place (the same file, not a new one renamed over it): Obsidian and the syncs keep following it.
      writeFileSync(s.abs, out);
      const check = parseNote(readFileSync(s.abs, "utf8").replace(/^﻿/, "")).find((x) => x.key === s.key);
      if (!check || isOpen(check.status) !== (op === "untick")) return { ok: false, error: "the write didn't hold" };
      return { ok: true };
    },
  };
}

/** The vaults Obsidian itself lists on this computer (obsidian.json): names and folders only. */
export function obsidianVaults(home: string, platform: string = process.platform): { name: string; path: string }[] {
  const cfg = platform === "darwin" ? join(home, "Library", "Application Support", "obsidian", "obsidian.json") : platform === "win32" ? join(home, "AppData", "Roaming", "obsidian", "obsidian.json") : join(home, ".config", "obsidian", "obsidian.json");
  try {
    const j = JSON.parse(readFileSync(cfg, "utf8")) as { vaults?: Record<string, { path?: string; ts?: number }> };
    return Object.values(j.vaults ?? {})
      .filter((v): v is { path: string; ts?: number } => typeof v.path === "string" && existsSync(v.path))
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .map((v) => ({ name: basename(v.path), path: v.path }));
  } catch {
    return [];
  }
}
