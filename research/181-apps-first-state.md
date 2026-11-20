# 181 · An app's first state, its things in its data, and the loop walked

Date: 2026-11-20, on main at `a1e259f8` (D422 and D428 merged). Feeds D431 (`design/apps.md`).
Follows research/174 (D422).

Tags: **VERIFIED** = read in Ducter's code or run here; **INFERRED** = judgment. No people rated
anything; the apps are the ones haiku wrote in D422's two eval runs (`2026-11-20-haiku-d422-run{1,2}`,
kept from that work) and in this change's two runs.

Shots (`.shots/apps-2/`, gitignored, D75): before `before-{make-zh,generic-en,prs-en}-{1400,390}-{light,dark}.png`
(main's kit, haiku's own files); the same files on the new kit `after-oldfile-*`; the walk
`walk-{1-made,2-first,3-added,4-asked,5a-changing,5b-changed,5c-conversation,6a-where,6b-shelf,7-removed,8-undone}-{zh,en}-{390,1400}[-dark].png`;
the real Mac app built from this branch, its window and page `mac-real/mac-app-{window,page}-{spend-zh,spend-en,make-zh,generic-en,prs-en}.png`;
the Mac's test renderer `mac/mac-states-*.png`. All against demo cores on scratch data
(`apps/web/demo-apps-walk.ts`, `apps/web/demo-apps-home.ts` with `DEMO_EVAL_APP`); the Mac binary ran
with a scratch `HOME` and `DUCTER_URL` at the demo core. Never `~/.ducter` or :7777.

## 1. What an empty app looked like (VERIFIED)

haiku's `app-generic-en` ("make me a little app to keep track of what I spend", nothing known),
D422 run 1, on main's kit (`before-generic-en-*.png`):

- The answer: **0.00**, big and black, over "No expenses this month yet". True, and bleak: it reads
  as a balance, not as a place to start.
- **An empty white bar** under "Recent": the app's `<div class="k-card"><div class="k-list"></div></div>`
  with nothing in it; the kit drew the card anyway.
- **"Remove this one"**, a full-width clay button: the app had hidden it (`<div class="k-field"
  hidden>`), and the kit's `.k-field{display:flex}` beat the browser's `[hidden]` rule. The app looked
  broken before the person did anything.
- The empty line and a folded orange **Add an expense** at the very bottom: the first thing to do is
  the last thing on the page.

`app-make-zh` (北京出差花销, nothing known yet) is the same in Chinese (`before-make-zh-*.png`): **¥0**,
「还没有花销，点下面「记一笔」开始。」, a folded 记一笔. D422's raters scored empty apps 1–3 of 5 for
first-open value (research/174 §2).

**Why:** nothing in the kit or the bridge knew an app was empty; each app drew its own empty state,
and small models draw a zero and a sentence. The kit's own classes could unhide what an app hid.

## 2. The first state (VERIFIED in shots, INFERRED for feeling)

What an empty app can truthfully show without inventing anything: what it will show (the answer's
label), where things will go (the list's place), and the one thing to do (the add). Candidates weighed:

| | Shows | Against |
|---|---|---|
| A: keep the zero, better words | ¥0 + a line | still reads as a balance; the add stays last |
| B: an example row, greyed | "Lunch ¥36" | an invented number, however grey (the rule: no invented numbers) |
| C: something true from elsewhere | this month's payments from Done for you | right when it exists; most people have none; behind a confirm (owed, todo) |
| **D: a promise** (chosen) | the label, **还没记 / Nothing yet**, a line of what shows there; two drawn ghost rows where items will list; the add open right under them | needs the kit to know "empty" |

D is built in the kit, so it reaches apps made before it with no rewrite:

- The bridge knows the data the app opened with. While none of it is the person's (a number other than
  0; a list with an item; a map holding one; not the app's settings, words or day lists, and not what
  the app writes while it starts, as `app-make-zh` does with its `days`), `<html data-empty>`.
- `[data-empty]`: the answer muted; `.k-empty` becomes a dashed outline with two ghost rows (pills in
  the line colour, a long one and a short one, twice) over its line; the first `details.k-add` opens
  by itself as a card (`data-first`), its summary a heading. After the first save it folds back into
  the accent button and the answer turns to the number.
- Always: `[hidden]` hides; a card round an empty list, an empty sub or next line fold away; a
  `k-row-sub` beside `k-row-main` shares the row (haiku's PR page squeezed its title to a column).
- The partner is told (the app tool, +0.2K): the k-sum still says what it will show, `k-none` in place
  of a number, never a 0. `app-generic-en` checks for `k-none` and against a bare 0.

`after-oldfile-generic-en-390-light.png` is the same haiku file on the new kit: no white bar, no
stray button, the ghost rows, the form open. `walk-2-first-*` is a file written to the new rule:
**这个月花了 / 还没记 / 记下第一笔，这里就是这个月的合计**, the outline, **记一笔** open. The real Mac app's
web view draws the same (`mac-real/mac-app-page-spend-zh.png`).

## 3. Known items written into the file (VERIFIED)

In D422's runs, `app-prs-known-en` wrote the four PRs into the file both times, as
`const items = [{ id: "ducter-412", … }, …]` and `const PRS = [{ id: "wey-gu/ducter#412", … }, …]`;
only the ticks went to `ducter.set("done")`. Across the 33 app files of both runs and the two
generation runs before D422 (research/174 §2), a literal list of the person's items appears in 4 files (`prs-known` ×3, `habit-en`
×1: its three habits); none wrote rows into the markup. The consequences: the partner's `[apps]` line
showed only `done` (it couldn't see or fill the PRs), a routine couldn't keep them, and every change
by talking had to rewrite them in code.

**Lifted, not asked for again** (`appLiftItems`): a pure literal (no names, calls or templates with
values) of two or more objects, not named like the app's own settings, under a key the file doesn't
name and the data doesn't have, moves to the data; the declaration becomes `ducter.get("prs") || []`.
The values are the same, so the page is the same (`after-oldfile-prs-en-*` against `before-prs-en-*`).
A literal fallback (`ducter.get("feeds") || […]`) only seeds the data. It runs when the app is made or
changed (the tool returns the keys so the partner fills them from then on) and when an app made
before opens (its own version, so 改回去 restores the file byte for byte; the shelf order is kept).
Over the four files above it lifted all four and nothing else (`items`, `prs`, `habits`); the
categories (`CATS`), colours and day lists stayed.

**Rows written into the markup** can't be moved by code without understanding the app: the lint says
so as the partner writes it, and `[apps]` names the count for an existing app so its next change moves
them. No line of its own for the person (it isn't something they did, and nothing looks wrong).

## 4. The loop, walked (VERIFIED)

`demo-apps-walk.ts`: a demo core with a stand-in partner that does what the app tool does (no model),
driven through the real web client in headless Chrome, zh and en, 1400 and 390, light and dark; the
app's inside driven over CDP in the frame's own world (its buttons clicked, its inputs filled).

1. Made from a sentence: one line, the card with **打开** (`walk-1-made`).
2. First state (`walk-2-first`).
3. Two costs added inside: the answer ¥94, 2 笔, 最大的一笔, the rows, the form folded (`walk-3-added`).
4. The app's ask (**问问 Ducter：这样花正常吗？**) in the conversation under 「这个月的花销」问, the
   answer back in the app (`walk-4-asked`).
5. Changed by talking from its line: **Ducter 正在弄你说的…** while the partner works (`walk-5a`), then
   **改好了** with the note, the budget line, **改回去** (`walk-5b`).
6. "我之前的小应用都在哪？": the shelf's card; the shelf with the tile's own line (`walk-6a`, `walk-6b`).
7. Deleted by asking, its card with **撤销** (`walk-7`); 撤销 brings it back (`walk-8`).

**What didn't close, fixed:** after 5 the foot kept saying **发给 Ducter 了，改好会在这里刷新。** with the
change already in (web: the `sent` flag only cleared on typing; Mac: the same in its window). Both now
clear it when a new version lands or the partner's answer ends "being changed" (`TestAppWindowSentLineEnds`).
The first-state form stayed open as a card after the first save; it folds back now.

**The Mac:** the binary built from this branch, pointed at the demo core, opened each app's window
(`DUCTER_OPEN_APP`) and captured its page (`DUCTER_APP_SHOT_DIR`): the first state, haiku's empty file
on the new kit and the lifted PR page draw as on the web. Not driven inside on the Mac (no clicks into
its web view); only light (the system's appearance). The window chrome's states are the test
renderer's (`mac/`).

## 5. The partner eval (VERIFIED)

Two full haiku runs with the changed app tool (`2026-11-20-haiku-d431-run{1,2}.md`): 167/232 and
173/232 (D427's last, 179/232; the machine ran other evals at the same time), apps 12/16 both.
haiku's empty spending app drew `k-none` with no 0 in both runs (`after-haiku-gen431-{en,zh}-*.png`:
**Spent this month / Nothing yet**, ghost rows, the add open); run 2 failed it on the reply, which listed
features (D422's known failure). `app-prs-known-en` passed both: in run 1 haiku again wrote the four PRs
as a literal and the lift moved them into `prs`. The other failures are D422's (a generic name, items
without `from`, two messages, the board offers).

## Implications for Ducter

- An app's empty state is the kit's job, not each app's: it can't invent, but it can promise, and it
  reaches every app already made.
- The person's things belong in data. Code can move them out of a file only where nothing changes;
  the rest the partner moves on its next change, told by `[apps]`.
- Owed (`todo.md`): something true for the first state (Done for you's payments), moving markup rows
  on open, the walk inside the Mac's web view and on a real phone, people as raters.

## Summary

Empty apps opened on a black zero, an empty white bar and a button the app had hidden; now every app,
old ones included, opens on a promise: what it will show, where things will list, the add already open.
Lists of the person's items written into an app's file move into its data when made, changed or opened,
with the same values, so the partner and every device can read them. The whole loop (made, first
state, added, asked, changed, shelf, deleted, undone) walked through the web client in both languages,
sizes and themes, and the Mac's real window; two lines that never cleared were fixed.
