# Documents you'd send (拿去就能发 / Ready to send)

> Design note for D439 · Principles 5, 12 · Evidence: `research/188-docs-bar.md`, research/184 #8 ·
> Screens: `.shots/docs-bar/` (D75: never in git)

When the person asks for a document to send to someone, what comes back is ready to send as it is:
the task holds itself to a written bar and looks at every page, Ducter checks the pages before the
person sees them, what it finds goes back to the task once, and only what is still so is said. The
file is shown as pages to flip through (the viewer, D239/D242; Made for you, D383), and "改一下…"
is said in the conversation.

## Who and how it starts

| Who | Before | After |
|---|---|---|
| Consumer | Boxes where Chinese should be, a table cut off, "[公司名称]" left in, found on the phone | Taps the card, flips the pages, sends it |
| Fresh user | Doesn't know a PDF can be wrong until the boss says so | One plain line, only if something is still off |
| Heavy developer | Proofreads every page an agent made | Reads one line at most; "第 3 页改一下" by talking |

Nothing to set and nothing to learn: they ask as they would a person. North star: 好用 the file
itself · 顺滑 fixed before they see it · 赏心悦目 a deck reads as slides · 放心 every page was looked
at, and what is left is said plainly · 惊喜 a 5-page deck is 5 pages.

## Which asks (`docAsk`, `@ducter/protocol`)

Read by code from the task's title and brief, never by the partner: a format word (PDF; deck,
slides, 幻灯片, 演示文稿, 路演; Word, docx; 一页纸, one-pager, 简历, resume, 海报) and a verb of
making. Not a reading ("这个 PDF 里说了什么") and not work on code that makes documents ("修一下 PDF
导出的 bug"). The count asked for is read too: exactly ("一页", "5 页的 deck") or at most
("不超过 3 页"). Formats in order: PDF, then `.pptx`, then `.docx`; spreadsheets stay out.

## What the task is told (`docBrief`, runner/src/brief.ts)

Only for such an ask, as a section of its brief: make an HTML draft with print CSS (A4 portrait;
13.333 × 7.5 in a slide) and print it with headless Chrome; an Office file with what it has, then a
PDF of it (LibreOffice where installed) shown beside it under the same name. The bar: real content,
never placeholders; the person's language; fonts that carry their script named in the CSS or file;
one title, clear headings, body 10–12 pt on paper and 20 pt+ on a slide; margins of 15 mm or more;
nothing past a margin or a slide's edge; no table wider than the page; no blank pages; nothing
stranded; the count asked for. Before reporting: draw every page as a picture and look at each. A
change asked later changes the same file, shown again under the same name.

## What Ducter checks (`core/src/doc-check.ts`)

On a done report whose `show` holds a PDF, `.pptx` or `.docx`, for such an ask, on the home's own
copy (at most three documents a report, about 25 ms each):

- **A PDF**, with Poppler where the home has it (`pdftotext -bbox`, `pdffonts`, `pdftoppm`): text past
  an edge or past the margin the document keeps, a page drawn up to its right edge (cut off), blank
  pages (no words, no ink), a last page of one or two lines, body text under 7 pt (14 pt on a slide)
  from word widths, Chinese that can't render (mojibake, boxes, Latin-only fonts, no CJK-capable
  font), placeholders, not the person's language, the count. Without Poppler: the count, a file that
  doesn't open, Chinese in Latin fonts.
- **A deck**, from its XML: text longer than its box holds (an estimate: CJK one em, Latin about half,
  CJK lines 1.32 em), a shape off the slide, a blank slide, body under 14 pt, placeholders
  (单击此处添加标题), language, the count. **A Word file:** a table or picture wider than the text area,
  placeholders, language. With a PDF beside either (or LibreOffice on the home), its pages too.

**The round.** Something found, the first time for this task: `report_to_main` answers the task with
what was found and how to fix each (and the page pictures in its own evidence folder when it works on
the home); nothing is logged and the task fixes it in the same turn. The next done report goes on;
what is still so rides on it as `report.doc` (`found`, `left` in the person's language, at most four).
Nothing found: nothing said. Progress reports are never held. `DUCTER_DOC_CHECK=off` turns it off.

## What the person sees

- **An Office file and its PDF are one card** (`pairPages`: the same name): the deck's card shows the
  PDF's first page and **{n} 页**; it opens as its pages in the viewer; the foot has **存 PDF / Save
  the PDF** and **存一份 / Save a copy** (the file itself). The PDF is not shown again on its own.
  Web and Mac alike (`MediaRef.pages`).
- **Still so:** **看过每一页 / Every page checked**, a drawn page beside it in the needs-you ink, then
  each thing on its own line (D291), set in under the lead's words with no rule beside it, under the
  partner's result and in the opened task's report and outcome. Clean pages show nothing.
- **The partner** is told what is still so, that the app shows it, and never to call the document
  ready to send; it may offer to fix it in a few words.

## Not yet

Shipping Poppler (or a pure text-box reader) with the home; LibreOffice where the task works; the
real measure on the author's own documents; versions of a document in Made for you; a landscape
slide's glimpse on the card (it shows the top of the slide). `todo.md`.
