// D239: Markdown for a file a task made (a report like investigation.md), read as a document in
// the file viewer. Beyond the messages' Markdown-lite (markdown.ts, whose escaped inline pass it
// shares, so a file can never inject markup): every heading level, tables, quotes, rules, nested
// and task lists, front matter, and fenced code coloured by its language (hl.ts). Pictures are
// shown by their words: a file's relative paths point at a folder the viewer doesn't have, and
// the page loads nothing from elsewhere (CSP).
import { escHtml, hlLines } from "./hl.ts";
import { inline } from "./markdown.ts";

const esc = (s: string) => escHtml(s).replace(/"/g, "&quot;");

/** Pictures become their alt words (quiet), links stay links. */
const inlineDoc = (s: string) => inline(s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, (_m, alt: string) => (alt ? `⁣${alt}⁣` : ""))).replace(/⁣([^⁣]*)⁣/g, '<span class="md-pic">$1</span>');

const fenceLang = (info: string) => {
  const w = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const alias: Record<string, string> = { typescript: "ts", javascript: "js", golang: "go", python: "py", rust: "rs", ruby: "rb", bash: "sh", shell: "sh", console: "sh", zsh: "sh", yml: "yaml", markdown: "md", html: "html", json: "json" };
  return alias[w] ?? w;
};

function code(lines: string[], info: string): string {
  const lang = fenceLang(info);
  const html = lang ? hlLines(lines.join("\n"), `x.${lang}`) : lines.map(escHtml);
  return `<pre class="md-code"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${html.join("\n")}</code></pre>`;
}

const cells = (line: string) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
};
const isRule = (l: string) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const LIST = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;

/** A Markdown file as HTML, everything escaped. */
export function markdownDoc(src: string): string {
  let lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  // Front matter: shown as itself, quietly, above the document.
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      out.push(`<pre class="md-front"><code>${lines.slice(1, end).map(escHtml).join("\n")}</code></pre>`);
      lines = lines.slice(end + 1);
    }
  }
  out.push(blocks(lines));
  return out.join("");
}

function blocks(lines: string[]): string {
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => inlineDoc(l.trim())).join("<br>")}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      flush();
      const close = fence[1]!;
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.trim().startsWith(close); i++) body.push(lines[i]!);
      out.push(code(body, fence[2]!));
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const n = h[1]!.length;
      out.push(`<h${n}>${inlineDoc(h[2]!)}</h${n}>`);
      continue;
    }
    // Setext headings: a line underlined with === or ---.
    if (para.length === 1 && /^\s{0,3}(=+|-+)\s*$/.test(line) && !isRule(para[0]!)) {
      const n = line.trim()[0] === "=" ? 1 : 2;
      out.push(`<h${n}>${inlineDoc(para[0]!.trim())}</h${n}>`);
      para = [];
      continue;
    }
    if (isRule(line)) {
      flush();
      out.push("<hr>");
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i]!); i++) q.push(lines[i]!.replace(/^\s{0,3}>\s?/, ""));
      i--;
      out.push(`<blockquote>${blocks(q)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1]!)) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      const body: string[][] = [];
      for (i += 2; i < lines.length && lines[i]!.includes("|") && lines[i]!.trim(); i++) body.push(cells(lines[i]!));
      i--;
      const td = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inlineDoc(c)}</${tag}>`;
      out.push(
        `<div class="md-table"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${head.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (LIST.test(line)) {
      flush();
      const items: string[] = [];
      const head = LIST.exec(line)!;
      const ordered = /\d/.test(head[2]!);
      for (; i < lines.length; i++) {
        const l = lines[i]!;
        // An item of the other kind at the same depth starts a list of its own.
        const m = LIST.exec(l);
        if (m && items.length && m[1]!.length <= head[1]!.length + 1 && /\d/.test(m[2]!) !== ordered) break;
        if (!l.trim()) {
          // A blank line ends the list unless the next line carries on in it.
          const next = lines[i + 1];
          if (next !== undefined && (LIST.test(next) || /^\s{2,}\S/.test(next))) continue;
          break;
        }
        if (!LIST.test(l) && !/^\s{2,}\S/.test(l) && items.length) {
          if (/^\s*$/.test(lines[i - 1] ?? "")) break;
        }
        items.push(l);
      }
      i--;
      out.push(list(items));
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join("");
}

/** A list and the lists nested in it, by indent. */
function list(lines: string[]): string {
  const first = LIST.exec(lines[0]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const start = ordered ? Number.parseInt(first[2]!, 10) : 1;
  const items: { head: string; rest: string[] }[] = [];
  for (const l of lines) {
    const m = LIST.exec(l);
    if (m && m[1]!.length <= base + 1) items.push({ head: m[3]!, rest: [] });
    else items.at(-1)?.rest.push(l);
  }
  const li = ({ head, rest }: { head: string; rest: string[] }) => {
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(head);
    const words = task ? `<span class="md-check${task[1] !== " " ? " on" : ""}" aria-hidden="true"></span>${inlineDoc(task[2]!)}` : inlineDoc(head);
    const strip = Math.min(...rest.filter((r) => r.trim()).map((r) => r.match(/^\s*/)![0].length), 99);
    const inner = rest.length ? blocks(rest.map((r) => r.slice(Math.min(strip, r.length)))) : "";
    return `<li${task ? ` class="md-task${task[1] !== " " ? " done" : ""}"` : ""}>${words}${inner}</li>`;
  };
  const tag = ordered ? "ol" : "ul";
  return `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>${items.map(li).join("")}</${tag}>`;
}
