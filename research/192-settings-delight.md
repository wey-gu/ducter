# 192 · Settings, round two: delight and flow, pane by pane (D445)

**Date:** 2026-11-21. **Build:** main at `e4b243c6` (0.1.6) plus this branch. **Brief (the author):**
每一个设置页面的打磨和 flow/视觉设计，我们要让人爱不释手，充满情绪价值，无比好用顺滑优雅. D432 (research/182)
fixed shapes and loading; this round is about how each pane feels while a person uses it: friction in the
flows, and whether a pane *shows* what a setting does for them (D43) rather than saying it.

## How it was walked

- **Mac** (VERIFIED, the test renderer): `TestSettingsPolishShots` against `apps/web/demo-settings-real.ts`
  (the author's real counts on fakes, never the network or an account), every pane at 1400 (zh, light) and
  760, the window's narrowest (en, dark). Flows were driven in Go view tests (`settings_delight_test.go`):
  change the default wait, quiet hours off, notifications off, pick a quiet-hours end from its list, pick a
  reply language, open Codex's model list.
- **Web** (VERIFIED): headless Chrome over CDP (mock keychain, basic password store), every page at 1400 and
  390 (zh, light) and 390 (en, dark), the full scroll height.
- Shots: `.shots/settings-delight/{before,after}` (gitignored, D75): `mac-<w>-<paper>-<lang>-<pane>.png`,
  `web-<w>-<paper>-<lang>-<b|a>-<page>.png`.
- The three people (AGENTS.md): **H** heavy developer, **C** consumer, **F** fresh user.

## What each pane felt like, and what changed (ranked by how much it improves the feel)

| # | Pane | Who | Friction or flat moment (before) | Now |
|---|---|---|---|---|
| 1 | To-do sources, and every row with a wide control (Mac 760) | H, C | VERIFIED in the before shots: at the window's narrowest in English, **When a new one comes** was squeezed to one letter a line beside its three choices, the GitHub head's line to four letters; Notifications' default-wait title the same. A dead end for reading. D432's 760 pass had not caught it | A row's words keep 160; narrower, its control drops under them on the text edge (`wordsThenControl` in `row`, `tileRow`, `headRow`). On the web a `Seg` whose own words overflow stacks (390 en: **Take it directly** ran into **Don't tell me**) |
| 2 | Notifications | C, F ("will it bother me?") | Three switches and two segmented choices, each with a sentence; the person had to imagine what a notification would be, when, and what happens if they don't answer | The notification itself at the top: the partner's face and name, **现在**, a real ask, **30 分钟内没回，我就先试它。** in their own wait, and under it their quiet hours. Every change shows at once; off, the card sinks and says where the ask waits. The partner smiles for a moment after a change |
| 3 | This phone / This computer (web) | everyone | Three segmented choices and a switch, no picture; the Mac had a preview stage since D150 | Look and sound's stage: the partner, your message, its reply, the details as set; light and dark, language and details show the moment they're picked, and the partner smiles |
| 4 | Partner › Replies in | C, F | A pop-up naming a language; what the partner would sound like was left to imagine | The partner's reply in that language as a small bubble under the title (12 common languages, `languages.json` `samples`), changing with the pick |
| 5 | Partner › Which model (Codex's six) | H | Mac: a tray of six wrapping to a second line with one model alone; web: six chips under the row | One pill at the row's right edge with the chosen model, its list on a tap, as the reply language |
| 6 | Notifications › quiet hours (Mac) | C, F | The region's 12-hour field said **11:00 PM** in Chinese while every line Ducter says reads 23:00; arrow keys only | Two pills of half hours, 24-hour in every language and region, the chosen time brought into sight when the list opens |
| 7 | To-do sources › the two choices | C (Obsidian), F | A choice of three words with no consequence said (**留言** what? **勾掉** can I undo?) | The row's line says what the chosen one does in the source's terms and changes on the pick (**做完在笔记里勾掉；想撤回，把勾点掉就行。**); a standing go still speaks for itself |
| 8 | Waiting panes (Mac), Notifications (web) | everyone, a moment | The Mac's waiting square stood still (looked stuck); the web's Notifications was a bare grey line | The square breathes as the web's (1.6 s, still under reduced motion); the web's Notifications waits in its shape |
| 9 | Memory / Agent messaging's missing tool | H on a server | `sudo apt install pipx` shown on any Linux home | The home's own package manager: `dnf` (Fedora), `pacman` (Arch), `zypper` (openSUSE), else `apt` |
| 10 | Every pane (Mac) | everyone | `row` stood 68 tall, `tileRow` 64: rows of one pane in two rhythms | 64 for both |

## Looked at and left

- **Accounts, Chat apps, Passwords & cards, Where it runs, About** (VERIFIED in shots): their flows already end
  in the said line (D296, D404) and read in a look. A preview of what a read or a message there would look
  like was weighed: it would show the person's own mail or chats as an example, which is more than a settings
  page should put on screen (放心). Left.
- **A segmented choice of three long English words at the Mac's narrowest** now sits under its row and wraps
  inside its tray (**Don't tell me** on the second line). Readable; a stacked shape for the Mac's `choices`
  would need MyGo's measuring. Left for `todo.md`.
- **The partner's said line after a language pick** was weighed: the sample bubble already changes, so a line
  would say it twice (D296: never what the control shows). Not added.
- **The preview's ask is a fixed example** (a CI fix with two ways), not the person's latest real ask: a real
  ask would put a live decision inside Settings where no Go belongs. INFERRED to read as an example; a
  comprehension pass with people is owed.

## Implications for Ducter

- Where a setting's consequence is a thing a person can picture, draw it and let it follow the pick
  (`notifyPreview`, `LookPreview`, `talkSample`); the said line stays for consequences a picture can't show.
- A choice of many is one pill at the row's right edge (D421 menus), never a tray that wraps.
- A row's words have a floor; under it the control drops under them, on every client.
- Times are 24-hour everywhere Ducter writes them, controls included.

**Summary:** ten changes, both clients: the Mac's narrow rows no longer crush their words (the worst found),
Notifications shows the notification itself, This phone gets Look's preview, Replies in shows the voice,
Codex's models and the quiet hours are pills, To-do sources says what each choice does, waiting breathes,
and the missing-tool line names Fedora's and Arch's package managers.
