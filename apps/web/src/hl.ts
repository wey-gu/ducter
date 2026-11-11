// D214: a small syntax highlighter for the workbench's file view and diffs. One pass per line with
// a fixed set of token kinds (keyword, string, comment, number, tag), drawn with theme tokens
// (--code-*). Deliberately small: no grammar files, nothing loaded from elsewhere, and a file
// over HL_CAP is shown plain. Block comments and template strings that span lines carry over.
import { langOf } from "@ducter/protocol/src/workbench.ts";

export const HL_CAP = 300 * 1024;

const KW: Record<string, string> = {
  ts: "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface is keyof let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield",
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota",
  rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while None Some Ok Err",
  py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self",
  rb: "alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield",
  swift: "as break case catch class continue default defer do else enum extension false for func guard if import in init inout internal is let nil private protocol public return self static struct super switch throw throws true try var where while async await",
  kotlin: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while",
  java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true false try void volatile while",
  c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace public private protected template typename using virtual nullptr true false",
  shell: "if then else elif fi for while do done case esac in function return export local set unset echo exit",
  sql: "select from where and or not insert into values update set delete create table index drop alter join left right inner outer on as group by order limit offset having null is in like distinct union primary key",
  css: "",
  json: "true false null",
  yaml: "true false null yes no",
  toml: "true false",
};
const sets = new Map<string, Set<string>>();
const kw = (lang: string) => {
  let s = sets.get(lang);
  if (!s) sets.set(lang, (s = new Set((KW[lang] ?? "").split(" ").filter(Boolean))));
  return s;
};

/** Languages where a capitalised word is a type (not prose in markup). */
const CODE = new Set(["ts", "go", "rust", "swift", "kotlin", "java", "c", "py", "rb"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (k: string, s: string) => `<span class="tk-${k}">${esc(s)}</span>`;

const LINE_COMMENT: Record<string, string> = { ts: "//", go: "//", rust: "//", swift: "//", kotlin: "//", java: "//", c: "//", css: "", py: "#", rb: "#", shell: "#", yaml: "#", toml: "#", sql: "--", make: "#" };
const BLOCK: Record<string, [string, string]> = { ts: ["/*", "*/"], go: ["/*", "*/"], rust: ["/*", "*/"], swift: ["/*", "*/"], kotlin: ["/*", "*/"], java: ["/*", "*/"], c: ["/*", "*/"], css: ["/*", "*/"], html: ["<!--", "-->"], md: ["<!--", "-->"] };

export interface HlState {
  /** Inside a block comment, or a string that spans lines (its closing quote). */
  open?: { kind: "c" | "s"; close: string };
}

/** One line as HTML, and the state the next line starts in. */
export function hlLine(line: string, lang: string, st: HlState = {}): [string, HlState] {
  if (lang === "plain") return [esc(line), {}];
  let out = "";
  let i = 0;
  if (st.open) {
    const end = line.indexOf(st.open.close);
    if (end < 0) return [span(st.open.kind, line), st];
    out += span(st.open.kind, line.slice(0, end + st.open.close.length));
    i = end + st.open.close.length;
  }
  if (lang === "md") {
    if (/^\s{0,3}#{1,6}\s/.test(line)) return [span("k", line), {}];
    if (/^\s*```/.test(line)) return [span("c", line), {}];
  }
  const lc = LINE_COMMENT[lang];
  const block = BLOCK[lang];
  const words = kw(lang);
  let plain = "";
  const flush = () => {
    if (plain) out += esc(plain), (plain = "");
  };
  while (i < line.length) {
    const rest = line.slice(i);
    if (block && rest.startsWith(block[0])) {
      flush();
      const end = line.indexOf(block[1], i + block[0].length);
      if (end < 0) return [out + span("c", rest), { open: { kind: "c", close: block[1] } }];
      out += span("c", line.slice(i, end + block[1].length));
      i = end + block[1].length;
      continue;
    }
    if (lc && rest.startsWith(lc) && !(lang === "shell" && i > 0 && /\S/.test(line[i - 1]!))) {
      flush();
      return [out + span("c", rest), {}];
    }
    const ch = line[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      if (lang === "html" && ch !== '"' && ch !== "'") {
        plain += ch;
        i++;
        continue;
      }
      flush();
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      if (j >= line.length && ch === "`" && (lang === "ts" || lang === "go")) return [out + span("s", rest), { open: { kind: "s", close: "`" } }];
      out += span("s", line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (lang === "html" && ch === "<") {
      const m = /^<\/?[A-Za-z][\w:-]*/.exec(rest);
      if (m) {
        flush();
        out += span("t", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (lang === "css" && ch === "#") {
      const m = /^#[0-9a-fA-F]{3,8}\b/.exec(rest);
      if (m) {
        flush();
        out += span("n", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] ?? "")) {
      const m = /^(0x[\da-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(rest)!;
      flush();
      out += span("n", m[0]);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$@]/.test(ch)) {
      const m = /^[@$]?[A-Za-z_$][\w$-]*/.exec(rest)!;
      const w = lang === "css" || lang === "html" ? m[0] : m[0].replace(/-.*/, "");
      flush();
      if (words.has(lang === "sql" ? w.toLowerCase() : w)) out += span("k", w);
      else if (lang === "css" && /^[a-z-]+$/.test(w) && line.slice(i + w.length).trimStart().startsWith(":")) out += span("k", w);
      else if (/^[A-Z][A-Za-z0-9]*$/.test(w) && w.length > 1 && CODE.has(lang)) out += span("y", w);
      else out += esc(w);
      i += w.length;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return [out, {}];
}

/** Every line of a text as HTML (plain past the cap). */
export function hlLines(text: string, path: string): string[] {
  const lines = text.split("\n");
  if (text.length > HL_CAP) return lines.map(esc);
  const lang = langOf(path);
  let st: HlState = {};
  return lines.map((l) => {
    const [h, next] = hlLine(l, lang, st);
    st = next;
    return h;
  });
}

export { esc as escHtml };
