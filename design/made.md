# Made for you (给你做的): finding what Ducter made, without remembering which task made it

How a person gets back a file, a picture, a table or a link the partner or one of its tasks made
for them: by asking in the conversation, or by browsing one tab in Past tasks. Decided in D383;
the evidence (what is recorded where, the name test) is `research/152-made-for-you.md`. Words are
the glossary's (`product-model.md`); visuals are Pebble's (`ui.md`).

## Who and how it starts

- **The consumer** asks "上周那个行程表发我一下", "the PDF you made for the visa". They remember
  the moment and the topic, never the file's name or the task. The partner hands back the thing
  itself, under one line saying what it is and when.
- **The heavy developer** comes back weeks later to "the load-test CSV", "the Bun compile note",
  "the PR for the flaky test". Asking works the same; browsing is a search field with kind chips.
- **The fresh user** meets it with no setup: they ask, or they see a third tab in Past tasks
  whose one line says what is in it.

**First principles.** Asking is the main path (people remember meaning and time); the list is
the fallback for browsing (D71: a lens on an existing place, not a new one). Nothing new is
stored: every thing is already in the Log or the media store, and each opens with what already
opens it.

## What counts as made

Read from the Log on first use and kept live (`packages/core/src/made.ts`), per persona:

| Kind | From | Opens with |
|---|---|---|
| file, picture | what a task showed (`report.media`, D206), and the pictures a reply relayed | the file viewer (D239) |
| file, picture (on a computer) | a file a task wrote with a kind a person keeps (a document, a sheet, a PDF, a picture, a calendar file…), a file its evidence points at, a path its report or a reply links to (D356) | `file_open` (D356): read where the task works, then the viewer |
| table, chart, list | the partner's blocks (D303); a pinned one as it is now (D381), older versions left out | the block drawn again in place |
| link | a page a done report names as evidence, a PR opened from Ducter | the browser |
| app | an app the partner made (D405, `apps.md`), one card per app as it is now; a deleted one is left out | its sheet (web, phone) or its window (Mac) |

Not counted: the person's own pictures and files, source files a coding task edited (they are its
changes, in the workbench, D214), a project's machinery (`node_modules`, `.git`, the agents' own
folders), choices and the lend card.

## In the conversation

`made_find` (a partner tool, only when the person asks in this turn): their words, time words and
kind words ("PDF", "表格", "截图") narrow it, the same matching as Past tasks (D285). Then
`made_find show [id]` puts it under the partner's next words: a file as a file card, a block drawn
again (its plain form after the words for every other reader), a link in the line. The line says
what it is and when, as something the partner made ("这是上周排的京都三日行程。"), never "the task",
never a retelling. Honest edges:

- **Nothing matches:** one line saying so (what it looked for) and at most an offer to make it
  now; never another thing passed off as it, never a list of what else there is.
- **Nothing in that time, but the words match another day:** said as another day.
- **Only the kind matched** ("that Mac table" for an "M4 Pro 对 M4 Max" table): the newest of that
  kind, shown only if it plainly is what they mean.
- **A file gone from where its task wrote it, or its computer away:** said why, with an offer to
  make it again; nothing pretends to be shown.

## The place: 给你做的 / Made for you, Past tasks' middle tab

Tabs: **做过的事 / Past** · **给你做的 / Made for you** · **一直在跑的 / Ongoing**. Under the tabs,
always, the literal line **{name} 给你做的小应用、文件、图片、表格和链接，聊天里做的也在这里。/ The apps,
files, pictures, tables and links {name} made for you, including the ones in your chats.** (D405 added apps) (raters found
chat tables only with it, research/152 §4).

- **Field:** **名字、PDF、表格、截图、哪天… / A name, a PDF, a table, a day…**, the words shared
  with the Past tab; time words said under it (**上周 · 11月9日–15日**).
- **Chips:** **全部 / All** and each kind present: **小应用 / Apps** (D405; an app also lives in its own place, 你的小应用 / Your apps, D410), **文件 / Files**, **图片 / Pictures**,
  **表格 / Tables**, **图表 / Charts**, **清单 / Lists**, **链接 / Links**.
- **List:** by date (Past's own groups) without words; one ranked list with words
  (**找到 n 个 / n found**).
- **A card:** its face on the left (a picture's own thumbnail, a file's badge (D286), a drawn table,
  chart, list or link on the sunken ground; never emoji), its name (and **已置顶 / Pinned**), one
  line why: where the words matched, else **你问的：{ask} / You asked: {ask}**, else
  **来自「{task}」 / From “{task}”**, else **在对话里 / In the conversation**; then its facts, each
  its own element (D291): the file's own letters (PDF, MD) or the kind, its size, its day. At the
  right **看那个任务 / See the task** when a task made it.
- **Empty:** **还没有给你做的东西。让{name}查点什么、做个表格，做好的会在这里。/ Nothing made for you
  yet. Ask {name} to look something up or make a table, and it shows up here.** None for the
  words: **没找到。换几个字，或者直接问{name}。/ Nothing found. Try other words, or just ask {name}.**

Mac: the same tab in the Past tasks window. Web: the same tab in the Past tasks sheet (920 wide,
the whole screen on a phone).

## Not yet

A document a task made to send (D439, `documents.md`) is listed once: an Office file with its PDF is one thing that opens as its pages. Saving a made thing into a folder or a repo (I3's 存到… / Save to…), versions of a document,
sharing a link (I5), deleting one from the list, and finding by what is inside a file the home
didn't read (only names, the report around it and a block's own cells are searched). `todo.md`.
