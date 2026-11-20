# 182 · The Settings polish: every pane, both clients, after D424 (D432)

**Date:** 2026-11-20. **Build:** main at `f268fd34` (0.1.2) plus this branch. **Brief (the author):**
every Settings pane must be something people love to use: warm, effortless, smooth and elegant, on the
Mac app and the web (wide and phone). D424 trimmed the words, D420 the device card, D421 the menus. This
pass walks each pane for what is still clumsy once the words are short: places a person has to think,
controls that behave differently from one pane to the next, states with no shape, things said twice.

## How it was walked

- **Mac** (VERIFIED, the test renderer): `TestSettingsPolishShots` (`apps/desktop/internal/views/
  settings_polish_shots_test.go`) renders every pane in the rail's order at 1400 and 760 (the window's
  narrowest), zh and en, light and dark, against `apps/web/demo-settings-real.ts` (the author's real
  counts on fakes: two Gmail, two calendars, Slack, 557 GitHub to-dos, an Obsidian vault with a long
  name, Telegram and WeChat linked, three sign-ins, two cards, two keys; never the network, never an
  account). The first run caught To-do sources and Passwords & cards still on their loading line: the
  harness waited for frames, not for the pane's own answer; it now waits for `sources` and `saved`.
- **Web** (VERIFIED): headless Chrome over CDP, `#settings=<pane>` for all ten pages at 1400 and 390,
  zh and en, light and dark (`prefers-color-scheme` emulated), reduced motion on, the full scroll height
  captured. At 1400 the settings sheet is a centred card of fixed height, so a long page's shot shows
  its top (the phone shots show every page whole).
- Shots: `.shots/settings-polish/{before,after}` (gitignored, D75): `mac-<w>-<paper>-<lang>-<pane>.png`,
  `web-<w>-<paper>-<lang>-<pane>.png`.

## The three questions, per pane

| Pane | Who is here | Before → after (what they feel) | The first time |
|---|---|---|---|
| 伙伴 / Partner | H (which agent, which model), C renames | "is it on the smart one?" → sure, in one look | the face, its name and one phrase where it lives |
| 记忆 / Memory | C and F, once | "what do I do with this sentence?" → one line to copy, one button | the clay partner, one line, Mem's two steps |
| Agent 通信 / Agent messaging | H | same as Memory (the same steps) | the picture of the two ways, then the steps |
| 通知 / Notifications | C, F: "will it bother me at night?" | unsure → quiet hours set and said back | notifications on, quiet hours one switch |
| 账号 / Accounts | C most | the same choice met twice → what it can read, only | the add row; nothing read until yes |
| 待办来源 / To-do sources | H (GitHub), C (Obsidian) | two controls stacked under labels, unlike every other pane → the rows every pane has | GitHub offered, one tap to sign in |
| 聊天软件 / Chat apps | C, H | a stray link off the text edge → one edge | each app resting with Set up |
| 密码和银行卡 / Passwords & cards | C booking travel | a bare "Connecting…" on the paper → the page's shape while it reads | three add rows |
| 外观和声音 / Look and sound (Mac), 这台手机·这台电脑 / This phone·computer (web) | everyone, briefly | a note under the card repeating the title; a privacy paragraph always open → the controls, the reason one tap away | the preview / the three choices |
| 在哪儿运行 / Where it runs | H, F once | unchanged: it already reads in a look | |
| 更新和关于 / About | H, C reads Help | unchanged | |

## What was clumsy, and what changed

1. **To-do sources' choices were a different control from every other pane** (VERIFIED, Mac 1400 and web
   390). 新的来了 and 做完以后 were small soft labels with a segmented choice stacked under each, inside one
   block; everywhere else (等多久再按默认做, 每天最多, 浅色和深色) a choice is a row: its title on the text
   column, the choice at the right edge. On the phone the choice then dropped under the words as a short
   pill hanging at the right edge. *Now:* each is a row (Mac `tileRow`; the web already was), a standing go
   is the row's line, and on a phone a choice that drops under its words takes the text column's width
   (`.chat-row > .seg`), as the default wait's does. One shape for "pick one of three" everywhere.
2. **Memory's missing tool asked the person to find a command inside a sentence** (VERIFIED, Mac and web).
   "在那台电脑的终端里运行 sudo apt install pipx（Mac 上：brew install pipx）。" behind 怎么装 on the web,
   inline on the Mac: two systems' commands in prose, to be selected by hand. *Now:* the core says the one
   command for the home's own system (`cmd` on the bridge view: `brew install pipx` on a Mac, else
   `sudo apt install pipx`; shown, never run), and the step reads **{home} 上还缺一个小工具。在它的终端里运行这一行，
   再点「再试一次」。** over the line itself with **复制 / Copy** (it says **已复制 / Copied**). The same steps
   serve Agent messaging. An older core without `cmd` keeps the old words.
3. **发现了就说 was on two panes** (VERIFIED). Accounts opened with the same choice Notifications holds
   (D289 put it on both). It is about when the partner finds the person, so it is Notifications' (with
   今天看了什么 under it); Accounts now starts with what it can read. Said once (D424's rule, applied to a
   control). The conversation's first-time chips (D165) are unchanged.
4. **A pane still reading was a bare grey line on the paper** (VERIFIED, Mac 待办来源 「正在读…」 indented
   oddly, 密码和银行卡 「正在连接…」; web the same small line on To-do sources, Chat apps, Passwords & cards).
   The page then jumped from one line to its cards. *Now:* the shape of the first group, a soft sunken
   square in the tile column and the word on the text column (Mac `paneWait`, web `Waiting`; the web's
   square breathes, still under reduced motion). Partner and Notifications' first frame too, on the Mac.
5. **Under a pushed page's lede, 怎么做到的 sat on the page's edge, left of the words it explains** (VERIFIED,
   web 390, Chat apps and Passwords & cards). It now keeps the lede's text edge.
6. **This phone / This computer said its title again under its card** (**只改这台手机上的样子。**, glued to the
   card) and kept the browser's speech privacy paragraph open under a **语音** heading inside the card
   (VERIFIED, web). The note is gone (the title says whose look this is); the heading is gone (the switch's
   words name it); where the voice goes is behind 怎么做到的 while it works, and said plainly only when it
   can't (no speech in this browser, the language).

## Looked at and left

- **The quiet hours on the Mac read 11:00 PM in Chinese in the shots.** The field follows the region's
  hour cycle (`ui.TimeInput`, Context.Region); the test renderer runs with an en-US region. A person's Mac
  in a 24-hour region shows 23:00. Not a bug (INFERRED from MyGo's documented behaviour; not seen on a
  real zh Mac in this pass).
- **The model choice on Partner wraps to two lines at six models** (Codex's six) inside its tray. Readable,
  and each model is one tap; a menu would hide the choice. Left.
- **Where it runs and About** already read in a look; nothing found worth a change.
- **The shots show `brew install pipx` under "Hetzner Server"**: the demo core runs on this Mac and only
  names its home a server, so it answers for the Mac it runs on. A real home answers for itself.
- **The web at 1400** shows Settings as a centred sheet of fixed height: the shots show each page's top.

## Implications for Ducter

- A choice of a few is one shape everywhere: a row with the choice at its right edge, the choice under the
  words at the text column's width on a phone. A new pane uses `tileRow` / `chat-row` with `Seg`.
- A step a person must do outside Ducter is the one line to copy, for their system, never two systems in a
  sentence.
- A setting lives on one pane. A second place for it is a link, not a copy.
- A pane that waits shows its shape (`paneWait` / `Waiting`), never a bare line.

**Summary:** six things a person would trip on after D424's trim, fixed on both clients: To-do sources'
choices as rows like every pane; Memory's missing tool as one line to copy for the home's system;
发现了就说 only on Notifications; a waiting pane shows its shape; the lede's 怎么做到的 on the text edge;
This phone without its repeated note, the speech privacy behind a tap.
