# 169 · A home for your apps: why a place now, what to call it, and why the author's first app fell flat

Date: 2026-11-20, on main at `eca42d00` (0.0.99). Feeds D410 (`design/apps.md`). Follows
research/166 (D405, which kept apps as a lens of Made for you, no place of their own). Number 169:
167 and 168 may be taken by branches in flight; renumber at merge if they are free.

Tags: **VERIFIED** = read in Ducter's code at this commit or run here; **REPORTED** = what the author
said or showed; **INFERRED** = judgment. LLM proxy raters only (no people yet): they show how a
careful naive reader parses a label, not how people feel.

## 1. What the author did and saw (REPORTED, 2026-11-20, his screenshot)

He typed 「给我做个小应用，记一下出差花销」 on 0.0.99. The partner made 「出差花销」, which opened in its
own Mac window:

- **A generic form, nothing in it.** 记一笔 / 出差名称 (empty, "如：北京出差") / 日期 / 分类 (a native
  grey `<select>` with the system's steppers) / 金额 (a native number stepper) / 币种 CNY / 备注 / a small
  保存; then 花销明细 with another native select 「全部出差」 and a bold 「暂无花销」. No total on top.
- **It ignored what Ducter knew.** That morning's note said 「今天 09:00 agibar 分享（北京）」; the
  conversation had booked his train and hotel. The app could have opened as 北京出差 11/20–21 with
  both costs in it, marked as from his bookings.
- **The Mac window was bare:** no line to change it, no 改回去 (D405 had listed both as a v1 gap).
- **The digest doubled the place:** 「今天 09:00 agibar 分享（北京）（北京）。」 (VERIFIED below, §5).

His question: Muse has a "Spaces" tab for things like mini apps; should Ducter have a dedicated place
to look after them, and did this test meet the user and emotional value we expect? Measured against
D36: **好用** half (one sentence made it, but the person must now type what Ducter already knew);
**顺滑** no (a form to fill before anything shows); **赏心悦目** no (system grey controls inside Pebble);
**放心** yes (sandbox, nothing outward); **惊喜** no (nothing it couldn't have made for anyone).

## 2. Why the code produced it (VERIFIED)

- The `app` tool's description told the model only the rules of the sandbox and the `--d-*` colours
  (`packages/partner/src/partner.ts`, D405). Nothing about shape: no controls, no layout, no "total
  first". A small model's default for "记花销" is a form, so it wrote one, with the browser's own
  `<select>` and `type=number`, which the theme can't reach.
- The tool had no way to fill an app as it made it: `data` worked only with an existing `id`. Nothing
  in the description or the persona said to use what the conversation already knew.
- The lint (`appLint`) caught only what the sandbox blocks (CDN, fetch, storage, alert, popups), never
  what breaks the look.
- The Mac window (`apps/desktop/appwindow.go`) was a page window: the app's document and nothing
  around it.

## 3. Why a place now, not only a lens (INFERRED, from D405's own evidence and the author's use)

D71 says no new place unless clearly better. D405 applied it: an app is something made, so it lives
in Made for you. What a day of real use showed:

| | A made thing (a file, a table, a link) | An app |
|---|---|---|
| Life | made once, read or sent | kept, reopened, written into, renamed, changed again |
| What you want to see | when and for what it was made | what's in it now (the total, the streak, the 9 PRs) |
| Who changes it | nobody | the person, the partner, a routine every round (D407) |
| Actions on it | open, show again | open, change by talking, undo a change, pin, stop a routine, delete |
| Order | newest made | pinned, then recently used |

Made for you is a chronological search of outputs; an app needs a shelf of living things with their
state on the tile and their care in reach. The reference products in research/166 §3 all did the same:
born in a chat, then a home of their own (a gallery or sidebar list, a stable link, versions). The
author asked for one in words. Clearly better: yes. Made for you keeps listing apps (it is still a
made thing), so nothing is lost there.

## 4. The name: naive raters (haiku, one candidate per call, n = 6)

`claude -p --model haiku --no-session-persistence` from a scratch folder (its `~/.claude/projects`
folder deleted after). Stimulus: a personal AI app; last week the person said 「给我做个小应用，记一下出差
花销」 and it made one; they also use Nowledge Mem, which keeps memories in Spaces (one only for them,
one shared with their team); now the bar has a button with a drawn icon and the label (zh / en). Three
personas (the heavy developer, the consumer, the fresh user), two runs each. Asked: what's inside; is
the expense app there; shared with others; from a store; confused with Mem; clarity 1–5; one false
implication.

| Label | Expense app there | Shared | From a store | Confused with Mem | Clarity | False implications raised |
|---|---|---|---|---|---|---|
| 小应用 / Apps | 6/6 | 0 | 0 | 2 | 3.33 | an app store to download from (6) |
| **我的小应用 / My apps** | **6/6** | **0** | **0** | **0** | **4.00** | published for others, or store downloads (6, weakly) |
| 空间 / Spaces | **1/6** | 1 | 0 | **6** | 2.00 | "the same Spaces as Nowledge Mem", a team-shared space |
| 工具箱 / Toolbox | 4/6 | 0 | 0 | 0 | 3.17 | built-in tools, a store |
| 书架 / Shelf | 5/6 | 0 | 0 | 6 | 2.50 | a bookshelf of reading, a shop, a memory library |
| 做的东西 / Things made | 6/6 | 0 | 0 | 0 | 3.17 | that the person built them themselves |
| 工作台 / Workbench | 6/6 | 0 | 0 | 1 | 2.83 | a shared team workspace (6); also Ducter's own D214 workbench |

- **空间 / Space is out, and not by taste.** Every rater read it as Nowledge Mem's Spaces; five of six
  didn't expect their expense app there. Ducter's own users meet Mem's Spaces (D334 reads a persona's
  mailbox in both), so the collision is real for exactly our people. research/166 had already seen
  空间 read as "shared" in every rating.
- **The possessive wins.** 我的小应用 / My apps was the clearest (4.00) with no Mem confusion; the bare
  小应用 / Apps read as a store. Ducter's places speak to the person in the second person (你的设备 /
  Your devices, D262), so the place is **你的小应用 / Your apps**; its bar mark's short name stays
  **小应用 / Apps** like 设备 beside 你的设备. The kind of thing stays **小应用 / App** (D405).
- Metaphors (书架 / Shelf, 工具箱 / Toolbox, 工作台 / Workbench) each brought a wrong world with them
  and Workbench collides with D214. Literal wins, as AGENTS.md's metaphor rule expects.
- The thin part: LLM proxies, n = 6 per label, one stimulus. A people test is owed (`todo.md`).

## 5. The doubled place in the morning note (VERIFIED)

`packages/core/src/proactive/detect.ts` (`comingUp`, the "other" booking branch) wrote
`${when} ${name}（${place}）`; the triage model gives an event both the name 「agibar 分享（北京）」 and the
place 「北京」, so the line said 北京 twice. Now the place is left out when the name already holds it
(compared as letters and digits only); a place the name doesn't hold is still said once. Test:
`proactive-detect.test.ts` "a title that already says where gets no second place".

## 6. What made the generated app good, run here (VERIFIED)

The same sentence, with the bookings in the conversation, on haiku with the D410 tool (the eval's
`app-trip-known-zh`; files kept with `DUCTER_EVAL_APPS_DIR`, never committed). Before the tool
answered an empty make, one of two tries made a generic 「出差花销」 with nothing in it; after it
("If you already know things for it … call again with this id: data … and a name for that"), every
try (two `--only` runs and both full runs) named it for Beijing and put the train (¥662) and the hotel
(¥1,036) in its data with `from: "你的预订"`, drawn with the kit, the total first, no native select or
number input. One file, run as a client runs it: `web-eval-haiku-trip-app-390-light-zh.png` (its
first-open line is the demo's note; the file and data are haiku's). The name was 「北京出差 11/20–21」 in
some runs and 「北京出差花销」 in others: both specific, the dates not always. Two full evals: 168/212 and
174/212 (D407's: 167/208 and 160/208); the four new scenarios 7/8 (`app-generic-en` once listed the
app's features in its line).

## 7. Implications for Ducter

1. **A place: 你的小应用 / Your apps**, one tap from every bar (a drawn mark beside On hand), in ⌘K,
   on the Mac's menu, and shown by the partner when asked where they are. Supersedes D405's "lens only".
2. **A shelf of living tiles:** each app's mark and clay tint, its name, the one line it says of
   itself (`ducter.summary`), when it changed, which routine keeps it current; pinned first. Its 「⋯」:
   rename, change by talking, undo a change, pin, stop a routine, delete (asked, its data goes, undo
   for 30 days).
3. **The kit:** Pebble's clay for the few shapes small apps need, in every app's document; the tool
   lists its class names; the lint turns away native selects and number steppers and an app without it.
4. **Context first:** an app about something Ducter knows opens named for it and filled with it,
   each item saying where it came from; the partner's line says what it filled in, and so does the
   app the first time it opens.
5. **The empty shelf invites** with what the home noted (a trip coming up), then everyday ideas.
6. Never 空间 / Space (Mem's), 工作台 / Workbench (D214's), or a metaphor.

**Summary.** The author's first app was a blank generic form in system grey because the tool taught
the model the sandbox but not the shape, and gave it no way or reason to use what Ducter knew. Apps are
lived with, not just made, so they get their own place: 你的小应用 / Your apps (raters: the possessive
reads clearest; 空间 / Space reads as Nowledge Mem's every time). The kit, the context prefill and the
first-open line make the same sentence open a finished, already-filled trip app.
