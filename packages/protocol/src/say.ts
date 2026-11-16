// Words a task wrote, in front of a user who reads another language (D154, D124, D292). A task
// reports in its own words, often English whatever the user speaks (a Codex run on a Linux home
// relayed "Installed standalone CLI 0.10.116 and native Codex plugin…" to a Chinese user). The
// partner says the outcome in the user's language; what a client shows on its own (the living
// message's fallback line, the proof line's labels) must not paste the task's sentences either:
//   - inTongue: is this text in the reader's language, any language (lang.ts inLanguage: by
//     script where scripts tell, never wrongly held back where they don't);
//   - proofLabel: an evidence label as is when it is in the reader's language or reads as a name
//     (a file, a command, "PR #12", a host), else a neutral label from what it is (the page's
//     host, the file's name, 测试结果 / Test results).
// The reader's language is the report's (the task's `language`), not the interface's (D292).
// The opened task keeps the agent's own words (D152). The Go port (apps/desktop/internal/say)
// passes the same cases (fixtures/say.json).

import type { EvidenceRef } from "./index.ts";
import { inLanguage, words, type LangTag } from "./lang.ts";

/** Is this text in the reader's language (lang.ts inLanguage). */
export function inTongue(text: string, lang: LangTag): boolean {
  return inLanguage(text, lang);
}

/**
 * A label that reads the same in any language: one token ("README.md", "example.com"), or code
 * (a command in lower case, a path, a number sign, a version): "bun test", "PR #12", "src/a.ts".
 */
export function readsAsName(label: string): boolean {
  const s = label.trim();
  if (!s) return true;
  if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s)) return false; // words, in CJK
  if (!/\s/.test(s)) return true;
  if (/[/\\#`=]|\.[a-z0-9]{1,5}\b|\bv?\d+(\.\d+)+/i.test(s)) return true;
  // A command: every word lower case and at most three of them ("nmem doctor", "npm run test").
  return s.split(/\s+/).length <= 3 && s === s.toLowerCase() && /^[\x00-\x7f]*$/.test(s);
}

type KindWords = Record<EvidenceRef["kind"], string>;
const KIND_WORDS: { en: KindWords; zh: KindWords } = {
  zh: { test: "测试结果", ci: "CI 结果", log: "运行记录", diff: "改动", file: "文件", url: "网页" },
  en: { test: "Test results", ci: "CI results", log: "Output", diff: "Changes", file: "File", url: "Web page" },
};

function hostOf(ref: string): string | undefined {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(ref.trim());
  return m ? m[1]!.replace(/^www\./, "") : undefined;
}

function baseName(ref: string): string | undefined {
  const s = ref.trim().replace(/^file:\/\//, "").replace(/[/\\]+$/, "");
  if (!s || /\s/.test(s)) return undefined;
  const b = s.split(/[/\\]/).pop();
  return b || undefined;
}

/** What a proof line shows for this evidence to a reader of `lang`. */
export function proofLabel(ev: Pick<EvidenceRef, "kind" | "label" | "ref">, lang: LangTag): string {
  const label = (ev.label ?? "").trim();
  if (label && (inTongue(label, lang) || readsAsName(label))) return label;
  const host = hostOf(ev.ref);
  if (host) return host;
  if (ev.kind === "file") {
    const b = baseName(ev.ref);
    if (b) return b;
  }
  return words(KIND_WORDS, lang)[ev.kind] ?? label;
}

/** The text a client may show as is to a reader of `lang`, or undefined (say the short form). */
export function sayable(text: string | undefined, lang: LangTag): string | undefined {
  const t = (text ?? "").trim();
  return t && inTongue(t, lang) ? t : undefined;
}
