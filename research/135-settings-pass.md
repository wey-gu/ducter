# 134 · The Settings pass: every pane scored, the weakest fixed (D365)

**Date:** 2026-11-18. **Build:** main at `441bdf70` (0.0.79) plus this branch. **Brief (the author):**
"每一个设置页面的打磨和 flow/视觉设计，我们要让人爱不释手，充满情绪价值，无比好用顺滑优雅". Every pane
against the north star (D36: 好用 easy · 顺滑 smooth · 赏心悦目 delightful to look at · 放心 trustworthy ·
惊喜 pleasantly surprising) and the clay Pebble bar, then the weakest fixed. Settings › Memory and
Settings › Agent messaging belong to two branches in flight and were only looked at; Your devices was
just reworked (D358, D362, D363) and only a clear defect was touched.

## How it was walked

- **Web** (VERIFIED): headless Chrome over CDP, a scratch profile killed by PID, every page by
  `#settings=<page>`, the sheet frame unclamped so each page is shot whole, its words read back as text.
  1400 and 390 (an iPhone user agent at 390), zh and en (`ducter.lang`, then a reload), light and dark.
  Three demo cores on port 7943 with fresh data folders: **H** the heavy developer (`demo.ts`,
  `DEMO_PAST=1`: three agents doing tasks, Past tasks, Mem), **C** the consumer (`demo-accounts.ts`,
  `DEMO_ACCOUNTS=morning`: two Gmail, a calendar, Discord, GitHub through oo), **F** the fresh user
  (`demo-first.ts`, `DEMO_STAGE=nobrain`: nothing signed in). C and F at 390 zh/en light.
- **Mac** (VERIFIED, test renderer, not the running app): `TestSettingsPassShots`
  (`apps/desktop/internal/views/settings_pass_shots_test.go`) against `demo.ts` on port 7944 with the
  author's accounts laid over it (`accountsSeed`), every pane in the rail's order at 1280, full length,
  zh and en, light and dark. The renderer has no iMessage bridge and no app updater, so Chat apps shows
  no iMessage group and About shows the server-home versions card.
- Shots: `.shots/settings-pass/before` and `.shots/settings-pass/after` (`web-{1400,390}-{light,dark}-{zh,en}-{H,C,F}-<page>.png`
  with `.txt` words, `mac-1280-{light,dark}-{zh,en}-<tab>.png`).

## Scores, before (1 weak … 5 loved)

Hierarchy, alignment, contrast, states (empty, loading, error), words (glossary, zh/en parity), the flow
of the pane's main job, delight. The total is out of 35.

| Pane | Hier. | Align. | Contr. | States | Words | Flow | Delight | Total | Weakest point |
|---|---|---|---|---|---|---|---|---|---|
| Settings list (web) | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 33 | — |
| Partner (both) | 4 | 4 | 5 | 5 | 4 | 4 | 4 | 30 | Records' note stray under its card; the web's trust lists as plain bullets beside the Mac's drawn marks |
| Memory (both) | — | — | — | — | — | — | — | — | Another branch's; not scored |
| Agent messaging (both) | — | — | — | — | — | — | — | — | Another branch's; not scored |
| Notifications (both) | 5 | 4 | 5 | 4 | 5 | 5 | 4 | 32 | Fine; the master switch's helper already says where decisions wait, so no said word is owed |
| Accounts (both) | 4 | 4 | 3 | 5 | 4 | 4 | 4 | 28 | The resting own-number and Tuwa handsets faint on white (by design: not set up); straight-looking quotes in zh |
| To-do sources (both) | 3 | 2 | 4 | 2 | 4 | 4 | 3 | 22 | Empty state a raised card holding one line (Mac); web add rows set as group heads (18/800) with the vault row's words off the text edge; the ownership line under the lede on the Mac, after the card on the web |
| Chat apps (both) | 2 | 4 | 4 | 2 | 4 | 2 | 3 | 21 | **Every app never connected showed its whole setup at once**: Telegram's 3 steps, Slack's 5 with two fields, WeChat's 2, about 1,900 px before anything is chosen. F and C came to look and met a form |
| Passwords & cards (both) | 4 | 3 | 4 | 4 | 5 | 4 | 3 | 27 | Toggle rows and add rows on different text edges in one card (the grid's convention, systemic) |
| Look and sound (Mac) | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 35 | — (the preview smiles back, D150) |
| This computer / This phone (web) | 3 | 4 | 4 | 4 | 3 | 4 | 3 | 25 | Three choices with no line of what they do (the Mac says each); no preview |
| Where it runs (Mac) | 3 | 2 | 5 | 5 | 3 | 4 | 3 | 25 | The group titled 在哪儿运行 under the page titled 在哪儿运行; 加一台做事的电脑 with no tile, so its words sat left of the row above's |
| Updates and about (Mac) | 4 | 3 | 5 | 4 | 4 | 4 | 4 | 28 | The server home's versions row stacks version, status and 检查更新 in a narrow right column; no hairline between it and 自动更新 (the update work's slot, D148) |
| Your devices (web) | 4 | 3 | 5 | 4 | 4 | 4 | 4 | 28 | The night-update note a stray line under the card instead of the switch's own line |

## Defects found (file:line at `441bdf70`)

| # | Pane | Defect | Where | Done |
|---|---|---|---|---|
| 1 | Chat apps | Every never-connected app's steps and fields open at once; nothing to choose before a form | `apps/desktop/internal/views/chats.go:256`, `wechat.go:57`, `apps/web/src/channels.tsx:150,294` | Fixed: rests as its row with **设置 / Set up** and its one privacy line until pressed (as D337's own number); a refused key or a connect on its way keeps the steps open |
| 2 | To-do sources (Mac) | Empty state a raised card holding one muted line and a faded tile | `apps/desktop/internal/views/todos.go:133` | Fixed: the add group's note under its heading (**还没有加上的。在下面挑一个。**) |
| 3 | To-do sources (web) | The add rows' names at the group-head size (18/800); the vault path a text button off the text edge with a faded Obsidian tile; the empty line a bare small paragraph; who owns what after the card | `apps/web/src/todos.tsx:370-433` | Fixed: rows at 15/700, the vault path the shared `AddRow` (plus in the tile column) as on the Mac, the empty line the add group's note, who owns what under the lede as on the Mac |
| 4 | Where it runs (Mac) | Group title repeats the page title | `apps/desktop/internal/views/settings_panels.go:208` | Fixed: no group title; the computer is the first row |
| 5 | Where it runs (Mac) | 加一台做事的电脑 had no tile: its words left of the row above's | `settings_panels.go:279` | Fixed: a clay server tile, on the shared text edge |
| 6 | Partner (both) | 它们的对话在「做过的事」里… a stray line under the records card (every group's note is under its heading, D289) | `apps/desktop/internal/views/settings_more.go:144`, `apps/web/src/settings-more.tsx:121` | Fixed |
| 7 | Partner (web) | 要不要先问's two lists as browser bullets; the Mac draws a check and an ask bubble in each list's ink | `apps/web/src/views.tsx:2522` | Fixed: the same drawn marks (inline SVG on theme tokens) |
| 8 | This computer (web) | Light and dark, Language, Details in the conversation with no line of what they do | `apps/web/src/views.tsx:2916`, `settings-more.tsx:171` | Fixed: one line each, as the Mac's (zh and en) |
| 9 | Your devices (web) | The night-update note under the card, not the switch's line | `apps/web/src/devcard.tsx:174-176` | Fixed |
| 10 | Accounts (both) | **日历已连接：可以问它“今天有什么安排”** in curly quotes where every other line quotes with 「」 | `apps/desktop/internal/i18n/calendar.go:81`, `apps/web/src/i18n-calendar.ts:66` | Fixed: 「今天有什么安排」 |
| 11 | Updates and about (Mac) | The server home's versions row cramped (version, state, 检查更新 stacked in the right column) and no hairline above 自动更新 | `apps/desktop/internal/views/devupdate.go:511` | Left then; done in D375: a row like every other (name, line and state left, version and 检查更新 right), a hairline above 自动更新; the web's line a row too |
| 12 | Accounts, own number (both) | The resting handset faint on white | `apps/web/src/own-phone.tsx:325`, Mac's own group | Left then; done in D375: faded is grey, never see-through, with a 3:1 floor (tested) |
| 13 | To-do sources (Mac, dark) | Jira's faded mark dark blue on the dark tile | the brand tile's faded state | Left then; done in D375: a faded drawn mark is its shape in the muted ink |
| 14 | Look and sound (Mac) | 按住说话的键 is the only row there with no line | `voice` rows | Left then; done in D375: one line of what the key does |
| 15 | Passwords & cards (both) | A toggle row's words on the card edge and add rows' on the tile column's text edge, in one card | the grid's convention | Left: systemic, D273's |

Looked at and fine: the Settings list (web), Notifications (the master switch's line already says where
decisions wait, so a said word would repeat the control, D296), Look and sound, dark mode on every Mac
pane, zh/en parity of the words read back.

## Implications for Ducter

- **A page of things you might connect should rest until you choose one.** D337 decided it for one
  group (the own number); the same strand was on Chat apps three times over. Now one rule for Settings:
  something never set up rests as its first row with **设置 / Set up** and its one honest line; the
  steps open where it stands.
- **One text edge per row kind, the same on both clients.** Four of the defects were the web and the Mac
  drawing the same row two ways (add rows, notes after cards). The shared pieces in `settings.md` now
  name the resting row.
- **Faded tiles need a contrast floor.** Two "not set up" marks nearly vanish (white on white, navy on
  dark). Decided in D375: grey and the muted ink, never transparency, 3:1 at the least.

## Summary

Thirteen panes walked on the Mac (test renderer) and the web (1400 and 390, zh and en, light and dark,
three users). Chat apps (21/35) and To-do sources (22/35) were weakest: a wall of setup steps before any
choice, and an empty state and add rows drawn differently on each client. Fixed with ten small changes
(D365); the versions row (update work's) and faded-tile contrast are left with reasons.
