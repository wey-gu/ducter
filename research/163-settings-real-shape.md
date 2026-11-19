# 161 · The third Settings pass: every pane at the author's real counts (D399)

**Date:** 2026-11-19. **Build:** main at `04249066` (0.0.93) plus this branch. **Brief (the author):**
"每一个设置页面的打磨和 flow/视觉设计，我们要让人爱不释手，充满情绪价值，无比好用顺滑优雅". What slipped
through before was what tidy fixtures never show: on 0.0.91 Settings › Partner squeezed **用哪个模型**
to one character a line with Codex's real six models (fixed in 0.0.93, D390), and Devices was a wall of
text (D398). So this pass walks every pane with the person's real shape, not three tidy rows.

## The real shape (VERIFIED, hel read only)

Read off the author's home with `sqlite3 file:…?mode=ro` and the key names of its JSON files, counts
and kinds only, never a value:

| What | On hel | In the demo core |
|---|---|---|
| Devices | 9 (a server home, two computers for tasks, an iPhone and an iPad on the app, a Pixel Fold, two old Safari clients, a CLI) | Hetzner Server home, Macbook Pro M3 (four AI agents, DeepSeek Harness among them), haswell, Siweis-MacBook-Pro, iPhone, iPad, Pixel Fold lent to tasks |
| Accounts | OOMOL (two Gmail, two Google Calendar, Slack, the Slack bot, a Discord bot left out) and Tuwa | the same seven and Tuwa, on look-alikes |
| To-do sources | GitHub (97 seen, the author's queue is 500+) | GitHub with 557 open plus a PR to review; an Obsidian vault with a long name |
| Chat apps | WeChat linked | WeChat and Telegram linked (stub adapters), Slack not set up |
| Notifications | quiet hours set, two push subscriptions | 23:00 to 08:00, three a day |
| The partner | Codex, whose list is six models | Codex with six models, Claude Code beside it |

`apps/web/demo-settings-real.ts` is that core (fakes only: no network, no account, keys that look
fake). The Mac's renderer recorded the frames it got into `apps/desktop/internal/views/testdata/
settings-real-{zh,en}.jsonl`, which `TestSettingsRealShapeFits` replays.

## How it was walked

- **Mac** (VERIFIED, test renderer): `TestSettingsPass3Shots` against the core, every pane at 1000 and
  1400, zh and en, light and dark, each frame checked by `paneGeometry` (a text off the window, a text
  squeezed under 36 pt wide and over two lines tall, two texts drawn over each other).
- **Web** (VERIFIED): headless Chrome, every page at 1400 and 390 (iPhone agent), zh and en, light and
  dark, the same three checks run in the page (plus a page that scrolls sideways and a clipped text).
- Shots: `.shots/settings-pass3/{before,after}` (`mac-{1000,1400}-{light,dark}-{zh,en}-<tab>.png`,
  `web-{1400,390}-{light,dark}-{zh,en}-<phase>-<page>.png` with `.txt` words and `.geo.txt` findings).
  Before has the Mac in dark only.

## Findings

| # | Pane | Where | What the person meets | D36 | Fix |
|---|---|---|---|---|---|
| 1 | Agent messaging (web 390, en) | `apps/web/static/app.css` `.pp-end` | The picture's two ways read **Hand / Ducter / work** and **Ducter / asks / for / you**, a word a line: the left label (**Agents connected to Nowledge Mem**) could not shrink | 赏心悦目 | The ends may shrink (at most 38% each) and the ways keep 112 px: the long label wraps, the ways read in two lines at most |
| 2 | Passwords & cards (both) | `autofill.go` `afUsed`, `autofill.tsx` `usedLine` | **还没用过 / Not used yet** on all seven rows: the same grey word as a wall, saying nothing (every new row's state) | 好用 | A row speaks only when it differs (D296): the time it was last used, or nothing |
| 3 | Passwords & cards (Mac) | `autofill.go` card row | **Wey Gu 的银行卡，08/29 到期** for both of the author's cards: which card is which only by its label; the web's tile shows the last four, the Mac's a card glyph | 放心 | **Wey Gu 的银行卡，尾号 0002，08/29 到期** (`af.card.line4`) |
| 4 | Passwords & cards (both) | the kept line | **锁着存在 Hetzner Server 上…** a stray paragraph under the last group, after the empty uses' note: the one sentence that answers "where is this kept" is found last | 放心 | Under the lede, as To-do sources' who-owns-what line (`ledeNote`, `.lede-note`) |
| 5 | Chat apps (both) | `chats.go`, `channels.tsx` | **它自己来找你的事…** a paragraph under every card, true of all of them | 好用 | Under the lede (`ledeNote`) |
| 6 | Chat apps (web) | `channels.tsx` | **断开 Telegram / 断开微信** threw the key away on one tap; the Mac asks in place (D289) | 放心 | Asks in place (`GConfirm` with **断开以后，%s 里就找不到它了；你们的对话还在这里。**); quiet until hovered |
| 7 | Updates and about (Mac) | `devupdate.go` `versionRow` | **刚看过，已经是最新的** three times, once per computer | 好用 | Said once, on the home's row; a computer that does tasks shows only an update's news |
| 8 | Updates and about, Devices (both) | `settings.versions.night.note` | **在免打扰时段里（没设就是夜里 3 点到 5 点）** to someone who set 23:00 to 08:00: a rule about a case that isn't theirs | 好用 | **在你的免打扰时段（23:00 到 08:00）里…** when set; **夜里 3 点到 5 点…** when not |
| 9 | Memory (Mac) | `memory_pane.go` | **照「怎么装」做一步** points at a fold the Mac doesn't have (its step is printed right below) | 顺滑 | **做完下面这一步，再点「再试一次」。** (`bridge.mem.install.need.below`); the web keeps its **怎么装** fold |
| 10 | Settings list (web) | `views.tsx` `SettingsSheet` | The partner twice at the top: the hero (face, name, where it runs) and the **伙伴** row under it, same face, same page | 赏心悦目 | The hero is the partner's row; its line falls back to the row's when the partner has nothing to say yet |
| — | Partner (both) | — | Six Codex models wrap below **用哪个模型**; nothing squeezed at 1000 or 1400 in either language (D390 holds) | | Kept |
| — | Accounts (both) | — | Seven accounts, one line each, no state word where the switch says it (D296 holds); the left-out Discord bot says **不看** | | Kept |
| — | To-do sources (both) | — | 557 open read **558 件没做完 ›** beside **1 个 PR 等你 review ›**; a long vault name wraps to two lines at 390 and stays one at 1400 | | Kept |
| — | Notifications (Mac) | — | The renderer drew **11:00 PM** in zh: the time field follows the person's own regional hour cycle (mygo `TimeInput`), not the window's language; a 24-hour Mac shows 23:00 | | Kept (system setting) |
| — | Chat apps (both) | — | **解除连接 / Unlink** on the linked row stays one tap: the bot stays and a new code links again (D276) | | Kept |
| — | Where it runs (Mac) | — | The renderer reaches the core on loopback, so it says 这台 Mac; with the author's hel URL the row is Hetzner Server | | Renderer only |

Every pane at real counts passes the geometry check after the fixes (`TestSettingsRealShapeFits`: 11
panes × zh/en × 1000/1400); the web's 390 and 1400 pages have no finding left in their `.geo.txt`.

## Implications for Ducter

- A fixture is real-shaped or it hides the defects people meet: counts from the person's own home
  (read only), the longest names, both languages, the narrowest width each client takes.
- One grammar across panes: what is true of a whole pane is one small line under its lede; a row
  speaks only when it differs; a destructive action asks in place on every client.

**Summary:** ten defects found by walking Settings at the author's real counts (a squeezed picture on
the phone, a wall of "Not used yet", a card with no last four, stray paragraphs under the last card, a
web Disconnect that didn't ask, the same version words three times, a rule about quiet hours the
person didn't have, a pointer to a fold the Mac lacks, the partner twice on the list); all fixed on the
Mac and the web, and a geometry test now replays the real shape at 1000 and 1400 in both languages.
