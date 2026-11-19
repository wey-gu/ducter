# 154. Devices, audited: who is there, what they came for, what can wait

2026-11-19, for D398. The author on the Mac app (0.0.90), Devices with the Pixel Fold chosen:
"这里的那些文字和整体的设计是不是太烂了？用户看到的就是一坨不想读的话". This note audits every
device kind, state, ability and line of copy on Devices (Mac app and web), then states what the
redesign keeps in view and what it folds.

**Labels.** VERIFIED: seen in code or in a render this session (`.shots/devices-pass/before-*`,
Go view tests and headless Chrome against `apps/web/demo-devices-pass.ts`). DOCUMENTED: a design
note says so. INFERRED: judgment.

## 1. What the author saw (VERIFIED, before shots)

| Where | What | Cause |
|---|---|---|
| Pixel Fold's card | Two paragraphs (what borrowing does; how to set up Smart Lock), a red **移除** after them, **怎么连着** with a card, **通过 app 连着 ⋯**, and **断开这台 Pixel Fold** under it all | `handsetCard` printed `handset.where` and `handset.smartlock` as body text; two destructive actions (the handset's and the device's) at the same weight |
| The map | MacBook's four agents stacked one per row with name tags, running into its name and the iPhone island; **Codex** on top of Ducter on home | `isleTokens` wrapped coins into rows between the ability badges and the mailboxes, one tag each, so a narrow island grew downward |
| The map | 26-point globes and hands on workers' rims; two tiny mailboxes on home's rim | D81's badges and D96's mailboxes, drawn below legibility at 1000–1400 points |
| The map | The three abilities floating in the sea | home's dock had nothing joining it to home |
| The list | **Ducter 在 Hetzner Server 上运行。** above a list whose first row says **Ducter 在这台上运行**; two workers both **帮 Ducter 做事** | a page subtitle kept from before the list; the list word repeated the card's role line |
| Web, desktop browser | the Pixel Fold's chip read **用这台电脑** | D330's rewrite of "this phone" for a desktop reader applied to another device's chip |

## 2. Who is here, what they came to do, what they must know, what can wait

| Moment | Who (D36's three) | Came to | Must know now | Can wait (folded or one tap away) |
|---|---|---|---|---|
| Opening Devices | developer: many devices; consumer: a Mac and a phone; fresh: one Mac | see that everything is all right | per device one fact: running here, free, doing N, asleep, can't reach, can be lent, last seen | the role sentence, versions, addresses |
| Home (server or Mac) | all three | what Ducter has and can do | it is home; its agents; its abilities as chips; an update if any | addresses (fold), the key row's why when an AI is already signed in |
| A lent Mac / Linux box | developer | is it working, is it current | free or doing N; its agents; its chips | how it's connected, its connections, disconnect (fold) |
| iPhone / iPad (a window) | consumer, fresh | is it connected | connected or last seen | how, disconnect (fold) |
| Android phone, lendable | consumer (Pixel), developer | what can a task do with my phone | it can be lent; three promises; turn it off on its chip | the lock setup (a step row), how, disconnect (fold) |
| Android phone, lent now | same | what is using it, stop it | the task's name, **停下** | the rest |
| Android phone, not added | same | how to add | it is added on the phone (the chip's ⓘ) | — |
| Android phone, can't reach | same | why | the chip's failed tint and why, in one line | — |
| Updating / needs a step | developer | progress | the version line, as before | release notes (a link) |
| Adding a device | all | add one | **加一台设备** row, D358's sheet | — |

Abilities (VERIFIED in `chipSpecs` / `chipsFor`): 上网, 用电脑, 从外面连, 打电话 (home only),
用手机 (a Mac), 用这台手机 (an Android phone). Each stays a chip with its ⓘ (D161); D398 adds the
Android phone's as a chip instead of prose.

## 3. Copy, sentence by sentence (VERIFIED in `i18n/handset.go`, `i18n-handset.ts`)

| Was | Now | Why |
|---|---|---|
| `handset.where`: 87 characters of rules | three lines with drawn marks: 只在借出去时看屏幕、点、打字 · 发送、付款、删除，先等你点 Go · 银行、钱包、密码、验证器都碰不到 | each rule is one scannable fact; "password fields never read" folds into 密码 |
| `handset.smartlock`: 107 characters | a row **锁屏时也能借给任务 ›**, opening to 3 numbered steps and one never line | instructions are a task, not reading; search beats a menu path that differs by vendor |
| **移除** | the chip turned off, asked in one line (**以后不借给任务了？** · 留着 · 不借了) | one destructive action per card |
| `handset.elsewhere` 37 characters | 在 {phone} 的 Ducter 里加上：安卓要你在手机上亲手开一个开关。 | shorter, same facts |
| list **帮 Ducter 做事** (idle worker) | **待命 / Ready** | the role is the card's; the list says the state |
| page subtitle | gone | said by the first row |

Settings path (DOCUMENTED, Android help; INFERRED for other vendors): Pixel on Android 14+
moved Smart Lock to **Extend Unlock** under Security & privacy › More security & privacy;
Samsung keeps **Extend Unlock** under Lock screen; older phones say **Smart Lock**. Every one
asks to confirm the screen lock before showing it. Searching Settings for the name works on all
of them, so step 1 says to search, not a path that is wrong on half the phones.

## 4. The map at 1000 / 1400 / 1700 points, zh and en (VERIFIED, `TestDevicesPassMapFits`)

- Coins: one row per island, no name tags (names are the coin's tooltip and spoken label; the
  card lists them), overlapping to 62% then **+N**; never under 28 points (D213).
- Worker rims carry no ability glyphs; home's rim no mailboxes (connections live in Settings ›
  Accounts).
- Home's abilities stand on a plank pier joined to home by a short walk (the bridges' planks and
  colors), inside the scene's framing.
- The test checks every word and coin row against every other island's words and clay, and
  against the stage's edge, at three widths in both languages.

## Implications for Ducter

- A card answers in a fixed order: now, actions, promises, an optional step, the fold. Prose in a
  card is a smell: either it is a promise (a short marked line) or a step (a row that opens).
- One destructive action per card, at the end of the fold.
- On the map, words are names only; everything else is clay or on the card.
- D330's reader-side rewrite must never touch another device's name for itself.

**Summary.** The Devices page said everything it knew. The pass keeps one fact per device in the
list, gives each card a fixed order, turns the phone's two paragraphs into three marked promises
and a step row, folds connection and disconnect, and makes the map's words never meet.
