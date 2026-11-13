// Markdown-lite for the partner's messages: paragraphs, line breaks, **bold**, *italic*,
// `code`, fenced code, - / 1. lists, ### headings and http(s) links. Everything is escaped first,
// so a message can never inject markup.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(s: string): string {
  const codes: string[] = [];
  // NUL marks code spans below: one in the text itself would point at a span that isn't there.
  s = s.replace(/\u0000/g, "");
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre: string, u: string) => `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, "$1<em>$2</em>");
  // A short code token never breaks mid-word ("ducter/fix-ci"); only a long path may wrap.
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
    const c = codes[Number(i)]!;
    return c.length > 28 ? `<code class="long">${esc(c)}</code>` : `<code>${esc(c)}</code>`;
  });
}

// Every render of the conversation turns each message into HTML; a message's text doesn't change,
// so each is turned once (D209: a long conversation re-rendered on every frame from the home).
// D254: given `copy` (the word for 拷贝 / Copy), a fenced block carries its own Copy button; a
// listener in conv-copy.ts copies the block's text. Without it a block is plain (the tests' form).
const memo = new Map<string, string>();
export function markdown(src: string, copy?: string): string {
  const key = copy ? `${copy}\u0001${src}` : src;
  let html = memo.get(key);
  if (html === undefined) {
    html = render(src, copy);
    if (memo.size >= 2000) memo.delete(memo.keys().next().value!);
    memo.set(key, html);
  }
  return html;
}

/** The drawn copy mark (two sheets), never a text glyph. */
export const COPY_GLYPH =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="3"/><path d="M5 15V7a3 3 0 0 1 3-3h7"/></svg>';

/**
 * A message as it goes to the clipboard (D254): the words as written, without the marks that only
 * style them (bold, italic, headings), a link as "words (address)", code and its fences kept (a
 * developer pastes them into a chat or a terminal, and plain words read the same either way).
 */
export function copyText(src: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of src.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      out.push(line);
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    out.push(
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^(\s*)[*•]\s+/, "$1- ")
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t: string, u: string) => (t === u ? u : `${t} (${u})`))
        .replace(/\*\*([^*\n]+)\*\*/g, "$1")
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, "$1$2"),
    );
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The same words to read and pick from (选择文字 / Select text): the fences go too. */
export const forReading = (copied: string) =>
  copied
    .replace(/^\s*```.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function render(src: string, copy?: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | undefined;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*```/.exec(line);
    if (fence) {
      flushPara(), flushList();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!);
      const pre = `<pre><code>${esc(code.join("\n"))}</code></pre>`;
      out.push(copy ? `<div class="codeblock">${pre}<button type="button" class="code-copy" data-copy-code aria-label="${esc(copy)}">${COPY_GLYPH}<span>${esc(copy)}</span></button></div>` : pre);
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flushPara(), flushList();
      out.push(`<h4>${inline(h[1]!)}</h4>`);
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    if (!line.trim()) {
      flushPara(), flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(), flushList();
  return out.join("");
}
