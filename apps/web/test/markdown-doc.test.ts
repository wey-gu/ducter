// D239: a Markdown file a task made, rendered as a document in the file viewer.
import { expect, test } from "bun:test";
import { markdownDoc } from "../src/markdown-doc.ts";

const REPORT = `---
task: ttl-flake
---
# Investigation: the flaky TTL test

The test **waited on real time** for a 1 s expiry. See \`cache.test.ts\`.

## What I found

| Run | Result | Time |
|---|:---:|--:|
| 1 | pass | 1.02 s |
| 2 | fail | 0.98 s |

> The machine was busy,
> so the timer fired early.

- [x] Reproduced it
- [ ] Fixed upstream
  - nested note

1. Fake clock
2. Retry

\`\`\`ts
const ttl = 1000; // ms
\`\`\`

---

![a chart](chart.png) and <script>alert(1)</script>
`;

test("a report renders as a document: headings, tables, quotes, task lists, nested lists, coloured code", () => {
  const h = markdownDoc(REPORT);
  expect(h).toContain('<pre class="md-front"><code>task: ttl-flake</code></pre>');
  expect(h).toContain("<h1>Investigation: the flaky TTL test</h1>");
  expect(h).toContain("<h2>What I found</h2>");
  expect(h).toContain("<strong>waited on real time</strong>");
  expect(h).toContain('<th style="text-align:center">Result</th>');
  expect(h).toContain('<td style="text-align:right">0.98 s</td>');
  expect(h).toContain("<blockquote><p>The machine was busy,<br>so the timer fired early.</p></blockquote>");
  expect(h).toContain('<li class="md-task done"><span class="md-check on" aria-hidden="true"></span>Reproduced it</li>');
  expect(h).toMatch(/Fixed upstream<ul><li>nested note<\/li><\/ul><\/li>/);
  expect(h).toContain("<ol><li>Fake clock</li><li>Retry</li></ol>");
  expect(h).toContain('<pre class="md-code" data-lang="ts">');
  expect(h).toContain('<span class="tk-k">const</span>');
  expect(h).toContain("<hr>");
  // A picture is its words; markup in the file is text.
  expect(h).toContain('<span class="md-pic">a chart</span>');
  expect(h).not.toContain("<script>");
  expect(h).toContain("&lt;script&gt;");
});

test("a setext heading, an ordered list that starts later, and a link", () => {
  const h = markdownDoc("Summary\n=======\n\n3. third\n4. fourth\n\n[docs](https://ducter.dev/docs)");
  expect(h).toContain("<h1>Summary</h1>");
  expect(h).toContain('<ol start="3">');
  expect(h).toContain('<a href="https://ducter.dev/docs" target="_blank" rel="noopener noreferrer">docs</a>');
});
