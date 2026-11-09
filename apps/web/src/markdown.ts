// Markdown-lite for the partner's messages: paragraphs, line breaks, **bold**, *italic*,
// `code`, fenced code, - / 1. lists, ### headings and http(s) links. Everything is escaped first,
// so a message can never inject markup.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
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

export function markdown(src: string): string {
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
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
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
