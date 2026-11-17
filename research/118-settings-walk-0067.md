# 118 · Settings, walked on 0.0.67 (the real Mac app and the web)

**Date:** 2026-11-17. **Build:** v0.0.67 (`15f3572e`) from source with `scripts/make-app.sh`, ad-hoc
signed, bundle id `co.nowledge.ducter.settingswalk`, into the session scratchpad; never installed.
**Brief:** every Settings pane should be loved (D36: easy, smooth, delightful, trustworthy, with
emotional value), in the clay Pebble character, the Mac and the web matching.

## How it was walked

- **The Mac app** was opened with `open -n --env` as in research/109: `HOME` a scratch folder,
  `DUCTER_URL=ws://127.0.0.1:7990/ws` (no core of its own, no LaunchAgent), `DUCTER_DATA_DIR`
  scratch, `DUCTER_IMESSAGE=off`, `DUCTER_UPDATE_FEED` a dead address, `DUCTER_LOCALE=zh`. Driven
  with `cua-driver` 0.44 by accessibility (the rail's tabs are `AXRadioButton`s by name), window
  captures, wheel scrolls and the static-text rows read back as the pane's words. The person's
  installed Ducter, its `:7777` core, `~/.ducter`, Messages and accounts were never touched. **No
  macOS permission prompt appeared** (no microphone, Full Disk Access or Automation was asked for:
  iMessage was off, voice never pressed).
- **The web** in headless Chrome over CDP (a scratch profile, killed by PID): 1400×900 and 390×844
  (an iPhone user agent at 390, so the page knows it is a phone), zh and en (`ducter.lang`), light
  and dark (`prefers-color-scheme`), every page by `#settings=<page>`, each page's scroller stepped
  and shot, and its words read back.
- **The three users,** each a demo core on port 7990 with a fresh data folder:
  **H** the heavy developer, `demo.ts` (Claude Code, Codex and pi doing tasks, Past and Done for you,
  Mem in the cloud, own-number calls half set up); **C** the consumer, `demo-accounts.ts`
  (`DEMO_ACCOUNTS=morning`: Gmail ×2, a calendar, Discord and GitHub through oo, the morning note);
  **F** the fresh user, `demo-first.ts` (`DEMO_STAGE=nobrain`: nothing signed in).

Shots: `.shots/settings-0067/before` (Mac `mac-1280-light-zh-*`, web `web-{1400,390}-{light,dark}-{zh,en}-*`,
the users' `web-{H,C,F}-…`) and `.shots/settings-0067/after`; each web run's words in `…-text.json`.

## What was found, pane by pane (ranked within each pane: trust first, then stranding, then looks)

| # | Pane | Who | What | Rank | Done |
|---|---|---|---|---|---|
| 1 | Settings list (web) | F | The hero said **住在 Ada's MacBook Air 上，用 Claude Code 想事情** with no AI agent signed in, while the Partner page under it said **还没有能用的 AI agent**: the first screen of Settings contradicted the page it opens | high (trust) | Fixed: one `partnerLede()` for both |
| 2 | This phone, Notifications (web) | everyone on a laptop | A desktop browser at 1400 called itself **这台手机 / This phone** (section, notifications row, "这台手机会响一下"), with a phone's clay | high (literal) | D330 (1): **这台电脑 / This computer** and the clay laptop in a browser on a computer |
| 3 | Partner › 怎么说话 (web) | all | **回你用的语言** drew every language as a row of a segmented control: 14 rows, ~1200 px at 1400, on the Mac a single pop-up | high (looks, Mac ≠ web) | Fixed: one pop-up at the row's right edge (a native `select`, the phone's own picker), drops under the words at 390 |
| 4 | Partner › 添加 (both) | F | With nothing signed in the group was **再添一个 AI agent / Add another AI agent**: "another" with none | medium | D330 (2): **添一个 AI agent / Add an AI agent** while none is ready |
| 5 | Partner (web) | all | The partner's face twice: in the page title and in the header under it (D322 keeps its art in the header only; the Mac has no title art there) | medium | Fixed |
| 6 | Partner › 要不要先问 (web) | C, F | The note **这两张单子就是 Ducter 守的规矩，不能在这里改** came after the lists on the web, before them on the Mac | low | Fixed: under the heading |
| 7 | Partner › 你的 AI agent 留下的记录 (both) | all | The switch's line spoke as the partner (**你让我看看时 … / when you ask me to look … what I saw**) while every other Settings line says 它 / it | low | Fixed: 它 / it |
| 8 | Accounts › 打电话 (both) | C | The section **打电话** and its first row **打电话** one above the other | medium | D330 (2): the row is **用 Tuwa 打 / Call through Tuwa**, beside 用你自己的号码打 |
| 9 | Accounts › 打电话 (Mac ≠ web) | C | The web said **在手机上登录一下 Tuwa 就好。每通电话都先问你。** under the offer; the Mac didn't | medium (trust: "asks first") | Fixed: the Mac's group has the same last line |
| 10 | Accounts › 它能看的账号, empty (Mac ≠ web) | C, F | The Mac said **还没有。…** as a row of its own, then a row holding only a dark 添加 at its right edge (an empty row); the web had one add row with the line under it | medium | Fixed: the Mac's add row says it, as the web's |
| 11 | Accounts › 用你自己的号码打 (both) | H | A bare **13:47** after **Siwei's MacBook Pro 上还没看到手机**: a clock with no word | low | Fixed: **13:47 找的 / at 13:47** |
| 12 | Accounts › 用你自己的号码打 (both) | H | The foot joined two sentences with a space (**…这台电脑上打。 只拨号…**, a D291-style join) and said **手机插在 X 上** and **这台电脑** when no phone is plugged in and the reader may be on a phone | low | Fixed: one sentence pair, **手机要插在 X 上，电话就在那台电脑上打。只拨号…** |
| 13 | Accounts (both) | C, F | The own-number setup (five numbered USB and SIM steps, step 1 open, the computer's real speakers named) shows to everyone who came to add mail | medium (strands C and F) | D337 (1): one row with 设置 / Set up until opened or started |
| 14 | Your devices (web) | H | The version line said **已经是最新的** and **3 分钟前检查过** as two facts; D296 made it one phrase on the Mac | medium | Fixed: **3 分钟前看过，已经是最新的** |
| 15 | Your devices, Updates and about (both) | H | The night-update note said **按同样的顺序更新 / in the same order** (a phrase from the update-all card, where an order is shown) on the web; the Mac said 一台一台地 without the 3–5 am default | low | Fixed: one note on both, with the default |
| 16 | Updates and about (Mac) | H | The versions group's note was the card's first line, unlike every group's (D289) | low | Fixed: under the title |
| 17 | Updates and about (Mac) | H | **这次没能检查** at the top and **7 分钟前看过，已经是最新的** below, and two 检查更新, for what is one Ducter on a Mac home | medium | D337 (2): one check (the latest of the two), one button |
| 18 | Autofill (web ≠ Mac) | C | What it sees and what it only fills (**名字、邮箱…它看得到…护照…它看不到**) was under 你的资料 on the Mac, and on the web only inside the form | medium (trust) | Fixed: under the heading on the web too |
| 19 | Autofill (both) | C | **锁着存在 X 上，密钥在这台 Mac 的钥匙串里** sat under the 密钥 group (API and deploy keys): 密钥 read as those keys; and "这台 Mac" on a phone | low | Fixed: **解锁用的密钥在 Mac 的钥匙串里** (D212's word kept) |
| 20 | This phone (web, en) | C | The list line **Light and dark, language, Details in the conversation, voice** capitalised mid-list | low | Fixed |
| 21 | Notifications, Accounts (web) | C | **When it notices something** shows on both pages | low | Left: both are D289's (the control belongs to what is read and to when it speaks) |
| 22 | Chat apps (Mac) | all | iMessage's group (D323's steps) not shown: the app ran with `DUCTER_IMESSAGE=off` so as never to touch the person's Messages | — | Not checked live; D323's test-renderer shots stand |
| 23 | Memory (demo) | — | `demo-first.ts` and `demo-accounts.ts` read the machine's own Nowledge Mem (its memories, "update available") and the own-number step reads the machine's audio devices | high for shots (privacy) | D337 (3): every demo starts from `demo-core.ts` (pretend nmem, plugin check, sound, adb, sessions, computer name) |

Looked at and fine: the Look and sound pane (preview, Pebble, light and dark, voice keys), Where it
runs, Notifications on the Mac, Chat apps on the web (marks from D314, steps as rows), Connected AI
agents, Memory on the H demo, dark on the web (no hard-coded light surfaces seen), and the 390 phone
layout (controls drop under their words). No emoji, no " · " joins in the panes walked (item 12 was a
space join).

## Matching the Mac and the web, after

Partner, Accounts (empty and with oo), Autofill, Your devices / Updates and about now say the same
words in the same places; the remaining differences are by design: the Mac's panes carry a lede under
the title and the rail's art, the web's pushed pages carry the section's art in the title (not on
Partner); the web has no Look and sound or Where it runs (This phone / This computer holds its own).

## Couldn't check

- The Mac's fixes in the real app: the after build was made and opened, but its walk was stopped
  before any shot; the Mac's after state rests on the Go tests. The web's after shots are in
  `.shots/settings-0067/after`.
- iMessage's group and pairing (off on purpose), the voice card and the microphone prompt (never
  pressed), the Mac's English and dark Settings after the fixes (the real-app pass was zh light;
  the Go tests and the test renderer cover the rest), motion between panes (captures too slow, as 109).

## Implications for Ducter

- The two clients drift where one gets a later decision's rewording (D296's one phrase reached the
  Mac's About, not the web's devices page). A word that changes in one client's i18n should be
  checked against the other's key in the same change.
- The fresh user meets the most mistakes: a first-run pass of Settings belongs in every Settings
  change, not only the busiest board.
- A browser on a computer is not a phone: the web's words for "this device" now follow what it runs on.

**Summary:** every Settings pane walked in the real 0.0.67 Mac app and the web, zh and en, light and
dark, as the three users. Twenty-three findings; eighteen fixed (the list's false "thinks with Claude
Code" with nothing signed in, a laptop's browser calling itself a phone (D330), fourteen language
rows, "another" with none, 打电话 twice, Mac and web mismatches in Accounts, Autofill, Updates and the
trust lists, small copy and joins); open: the own-number steps open for everyone, two update checks
on a Mac home, and the demos reading the real Mem.

**Follow-up (2026-11-17, D337):** the three open items are closed: the own-number setup rests as one row
until opened or started, a Mac home's Updates and about says one check with one button, and every demo
core starts from `apps/web/demo-core.ts` (which also stopped the demos naming the machine itself, found
while re-shooting). Shots: `.shots/settings-0068`.
