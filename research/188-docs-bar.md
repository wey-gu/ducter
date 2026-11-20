# 188: Things you'd send: documents with a quality bar (D439)

Feeds D439 and `design/documents.md`; research/184 item 8. The reference product that has a
"document workshop" is named only in `private/184-gaps-named.md` (R6). Date: 2026-11-21.

## The question

When the person asks for a document to send to someone ("帮我把这周的进展做成一页 PDF 发给老板",
"做个 5 页的融资 deck", "把签证材料整理成一个 PDF"), can what comes back be sent as it is? What is
the task told, what can code check before the person sees it, and how does the person see it?

## Who, what they feel, the first time

| Who | Before | After | First time |
|---|---|---|---|
| Consumer (Grok bot, Muse user) | Gets a file, opens it on the phone, finds boxes where Chinese should be, a table cut off, "[公司名称]" left in; fixes it by hand or gives up (INFERRED, research/184 R6) | Taps the card, flips through the pages inside Ducter, sends it | Nothing to set: they ask as they would a person |
| Fresh user | Doesn't know a PDF can be "wrong" until the boss says so | Same; when something is still off, one plain line under the result says what | Same |
| Heavy developer | Writes the deck themselves, or proofreads every page the agent made | Asks once, reads one line if anything is left; "改一下第 3 页" by talking | Same |

North star: 好用 the file is the thing, not a path · 顺滑 no extra step, the fix happens before they
see it · 赏心悦目 the deck reads as slides in the viewer · 放心 Ducter looked at every page, and says
plainly what is still off · 惊喜 a 5-page deck is 5 pages.

## What existed (VERIFIED, this checkout at 2112dcc7)

- A task shows files with `report_to_main.show` (D206); they are copied into the home's media store
  and reach the person as file cards; a PDF's first page is the card's glimpse and the viewer draws
  every page (pdf.js on the web, Core Graphics on the Mac, D242). Made for you finds them again (D383).
- An Office file (`.pptx`, `.docx`) is a plain card: "这种文件在 Ducter 里还打不开" (web), 在 Mac 上打开
  (Mac). Nothing reads its pages.
- No task is told any bar for a deliverable; nothing checks one. D437's second look reads code
  diffs and outward drafts, never a document's pages.

## The toolchain on hand (VERIFIED, this Mac; nothing installed)

- **Poppler** (Homebrew): `pdfinfo`, `pdffonts`, `pdftotext -bbox`, `pdftoppm`. Not something
  Ducter ships; many homes will have it (Homebrew, most Linux distributions), some won't.
- **Chrome** (the person's app) prints an HTML draft with `--headless=new --print-to-pdf`, with a
  throwaway profile, in about 1.3 s. A Chrome for Testing in the Playwright cache hung on print with
  no output (not investigated; the eval uses the app with a throwaway profile).
- **No LibreOffice** (`soffice`), no python-pptx / python-docx / reportlab. So a `.pptx` or `.docx` is
  read here from its XML, and turned into pages only where LibreOffice exists (the code path is
  there, untested on this Mac).

## Decisions taken (see D439)

1. **Which asks:** read by code from the task's title and brief (`docAsk`): a format word (PDF,
   deck/slides/幻灯片/路演, Word/docx, 一页纸, 简历, 海报) and a verb of making; never "看看这个 PDF"
   or work on code that makes documents ("修一下 PDF 导出的 bug"). The count asked for is read too
   ("一页", "5 页", "不超过 3 页"). No partner tool or persona changed (no `needs.doc`): the words
   are already in the brief, and a code reading keeps the partner eval untouched.
2. **Formats, in order:** PDF first (what people send; HTML → headless Chrome is the most reliable
   path for CJK and layout), then slides (`.pptx`, with its PDF beside it), then Word (`.docx`, the
   same). Excel stays out (a table, not pages).
3. **What the task is told** (`docBrief`, appended to its brief only for such an ask): make an HTML
   draft with print CSS and print it with headless Chrome; an Office file with what it has, plus a
   PDF of it shown under the same name; the bar (real content, the person's language, fonts that
   carry their script named in the CSS, hierarchy, body size, margins, nothing past an edge, no
   table wider than the page, no blank pages, nothing stranded, the count asked for); draw every page
   as a picture and look at each before reporting; "改一下…" changes the same file.
4. **What code checks** (`core/src/doc-check.ts`, on a done report that shows a PDF/PPTX/DOCX, for
   such an ask): see the table below. What it finds goes back to the task once as the tool's answer
   (the task fixes it in the same turn: no new turn, nothing logged), with the pages drawn as
   pictures into the task's own evidence folder when it works on the home. The next done report goes
   on; what is still so rides on it as `doc.left`, in the person's language.
5. **What the person sees:** the file card. An Office file shown with its PDF is one card that reads
   as its pages (glimpse, page count, the viewer's pages; 存一份 saves the file, 存 PDF the PDF). Clean
   pages: nothing else. Something still so: **看过每一页 / Every page checked**, then each thing on
   its own line, under the partner's result and in the opened task (no rule beside it).

## What code reads

| Finding | PDF (Poppler) | PDF (no Poppler) | .pptx | .docx |
|---|---|---|---|---|
| doesn't open | yes | yes | yes | yes |
| CJK can't render (mojibake, boxes, Latin-only fonts, no CJK-capable font) | yes | fonts only | — | — |
| text past an edge or the margin; cut at the right edge (ink) | yes | — | box too small (estimated), shape off the slide | table or picture wider than the text area |
| blank page | words + ink | — | no text, no picture | empty |
| a last page of one or two lines | yes | — | — | — |
| body text too small | from word widths in ems | — | median run size | — |
| placeholders | yes | — | yes | yes |
| not the person's language | yes | — | yes | yes |
| page/slide count asked for | yes | yes | yes | with its PDF |

## The eval (`packages/core/eval/doc-bar/`)

31 documents for real asks (the author's week, a pitch deck for Ducter, a Japan visa pack, a resume,
a cover letter), each made as a task would make it: 14 HTML drafts printed by headless Chrome, 4 PDFs
written the way a library with a Latin default font writes Chinese (Helvetica, WinAnsi), 8 decks
and 5 Word files as Office XML (the parts the check reads, not files an Office app is promised to
open). 23 carry one seeded defect, 8 are clean, and 6 more clean ones were written after the check
was tuned (held out, for false alarms). Run: `bun packages/core/eval/doc-bar/run.ts`
(results in `results/`, about 25 ms a document).

| Pass | Caught | False alarms | PDF | PPTX | DOCX |
|---|---|---|---|---|---|
| with Poppler | **22/23** | **0/14** (6 held out) | 12/13 | 6/6 | 4/4 |
| without Poppler | 15/23 | 0/14 | 5/13 | 6/6 | 4/4 |

- **The miss:** a one-page weekly whose title is set not to wrap. Chrome's print shrinks the whole
  page until the widest line nearly fits, so the title's last words are cut at the margin and drop
  out of the text, the right edge stays white, and the body ends at about 6 pt, just above the 7 pt
  floor. Neither a word, the ink nor the size says it. The task's own look at the page picture is
  what catches this one; a size floor near 7.5 pt would, at the price of false alarms on footnotes.
- **Without Poppler** only what the file's dictionaries say is read (pages, fonts): the count, an
  unreadable file and Chinese in Latin fonts. The other 8 PDF defects pass unseen; the brief's own
  look still applies. Shipping Poppler is in `todo.md`.
- **Tuned on the cases:** the thresholds (margin mirror, 7 pt, CJK line height 1.32, the box's 5%)
  were set while the first 25 were run; the 6 held-out clean ones were all quiet, but 14 clean
  documents is a small base for a false-alarm rate. The real measure is owed (`todo.md`).
- **Not measured:** whether the task's own look at its page pictures (the brief) catches what code
  can't, and how often a real agent's document needs the bounce at all.

## Implications for Ducter

- A document to send is checked by code where code is certain, and the task looks at its own pages
  for the rest; the person sees only what is still so.
- Poppler on the home matters (22 vs 15 of 23): worth shipping, or a pure reader for text boxes.
- Office files become readable in Ducter through their PDF, with no Office engine on the home.
- The partner and its tools are unchanged; the eval:partner is not run for this (D175 untouched).

**Summary.** For a document to send, the task gets a written bar and draws and looks at every page;
Ducter's check (Poppler where present, the Office XML always) catches 22 of 23 seeded defects with
no false alarm on 14 clean documents, sends what it finds back once, and says what is still so under
the result; a deck shown with its PDF reads as its slides in the viewer.
