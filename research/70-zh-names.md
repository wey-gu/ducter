# 70: Chinese names for features, places and sections: an audit, and a better name for From anywhere

**Question.** The author finds the Chinese name of D228's feature too long and wants an elegant
one, and suspects many sibling names are too long too. Which zh labels that name a feature, place
or section are long, clumsy, translated-sounding or inconsistent with their siblings, and what
should they be?

**A correction first.** The feature is not shipped as「从任何地方访问」. Everywhere in the product
(desktop `ability.remote`, web `chip.remote`, the glossary, D228) it is **在哪儿都能用** (6 Han
characters), en **From anywhere** on the chip and **Reach from anywhere** as the ability. The only
「从任何地方」 in the code is a sentence in `packages/cli/src/i18n.ts` (`pair.noPhone`:
「一个从任何地方都能打开的地址」). VERIFIED (grep, 2026-11-12). The finding below holds either way:
the shipped name is the one that fails the test (§3).

**Method.** (1) A script pulled every `"key": "value"` pair from the zh string tables: `apps/web/src/i18n*.ts`,
`apps/desktop/internal/i18n/*.go` (tests excluded), `packages/cli/src/i18n.ts`, iOS
`zh-Hans.lproj/Localizable.strings`, Android `values-zh/strings.xml`; plus the `**zh / en**` pairs of
`design/product-model.md`. (2) For seven labels, a candidate set with a mapping note and a 1–5
rubric. (3) Naive raters: `claude -p --model haiku` with no tools, no session saved, a system
prompt "an ordinary Chinese phone user seeing this app for the first time", shown only the label
(and, in round 1, its siblings), asked "what do you think this does? one sentence". 3 runs per
candidate, 153 runs in all, in the session scratchpad (`scratchpad/naming/`, outputs in `a/`,
`a2/`, `a3/`). Graded by hand against the real meaning: 1 match, 0.5 near (right area, wrong core
or a strong false implication), 0 miss. Date: 2026-11-12.

Tags: VERIFIED (measured or read here), DOCUMENTED (the vendor or a published page says so),
INFERRED (reasoned, not measured).

## 1. Inventory

VERIFIED (the script, 2026-11-12):

| | count |
|---|---|
| zh strings (unique keys across all tables) | 3,200 |
| label-like (no sentence punctuation, ≤ 30 chars) | 1,953 |
| … of which name-like (key is a title, tab, chip, ability, row, card, header, group…; no `%s`) | 351 |
| name-like with ≥ 5 Han characters | 112 |
| name-like with ≥ 6 | 73 |
| name-like with ≥ 8 | 32 |

Most of the ≥ 6 are deliberate warm sentences used as titles (「你不在的时候」「今天看了什么」
「你没回的时候」) or state lines (「已经是最新的」), and read well: a plain spoken phrase is the house
style, not a defect. The defects are the names that sit beside short siblings, or that fail when
read cold. The top 15:

| # | zh (Han chars) | en | where | problem |
|---|---|---|---|---|
| 1 | 在哪儿都能用 (6) | From anywhere / Reach from anywhere | device-card chip and ability (`chip.remote`, `ability.remote`; web, desktop), glossary, D228 | Siblings are 2–3 chars (上网 · 用电脑 · 用手机 · 打电话 · 通知); read cold it means "usable in any app / on any platform" (§3: 0/3) |
| 2 | 在哪儿都能找到 Ducter (7) | Reaches Ducter from anywhere | phone device row (glossary) | Same word, same ambiguity |
| 3 | 连接手机或另一台电脑 (10) | Connect a phone or computer | `pair.title` (desktop) | Longest sheet title; 「另一台」 is filler |
| 4 | 自己发现了事，怎么告诉你 (10) | When it notices something | `proactive.title` (desktop, web) | A sentence with a comma as a section title; en and zh say different things |
| 5 | 自己就做，还是先问你 (9) | On its own, or asks you first | `partner.trust.title` | A comma-split question as a title |
| 6 | 你的设备，和它们会做的事 (11) | Your devices and what they can do | `devices.title` (desktop) | The web says 「你的设备」 for the same page: drift |
| 7 | 它用什么想事情 (7) | What it thinks with | `loadout.brain.title` | Siblings 怎么说话 · 记得什么 are 4; the list row already says 用什么想事情 |
| 8 | 更新与关于 (5) | Updates and about | `settings.tab.about` | 「与」 reads translated; siblings 语言和对话, 数据和记录 use 「和」 |
| 9 | 外观与声音 (5) | Look and sound | `settings.tab.look` | Same 与/和 split |
| 10 | 素材与致谢 (5) | Credits | `settings.credits` | Same; en is one word |
| 11 | 在哪儿运行 (5) vs 住在哪儿 (4) | Where it runs / Where it lives | `settings.tab.run`, `settings.where.group` | Two names for one place, tab and its first group (kept, §3 B) |
| 12 | 用你自己的号码打 (8) | Call from your own number | `own.title` (phone) | Long but literal and clear; low priority |
| 13 | 让这台 Mac 能上网 (6) | Set up browsing | `web.title` (desktop) | The web says 上网 / Browse the web: drift |
| 14 | 各台电脑上的 Ducter (5) | Ducter on each computer | `settings.versions.title` | 「各台」 is written-register |
| 15 | 用电脑 (3) | Use apps | `chip.computer`, `ability.computer` | Not long: zh "use the computer" vs en "use apps" is not a clean pair (AGENTS.md) |

The glossary has the same items: 在哪儿都能用 appears in three rows (remote ability, D228, ability
chips). VERIFIED (`design/product-model.md` lines 75, 76, 144).

## 2. How strong products name the same idea

| product | name (zh) | tag | note |
|---|---|---|---|
| Synology DSM 7 | Control Panel › **外部访问** › QuickConnect / DDNS | DOCUMENTED [1][2] | A section name for admins; 「外部」 is IT register |
| fnOS (飞牛) | 系统设置 › **远程访问** › FN Connect | DOCUMENTED (third-party walkthrough) [3] | NAS users also say 「外网访问」「远程回家」 (INFERRED, forum usage) |
| Apple Home (apple.com.cn) | the hub lets you check home **「外出时」**; the support page calls it 远程连线 | DOCUMENTED [4][5] | Apple's marketing says it as a situation (when you're out), not a noun |
| Apple Continuity | **接力**, **随航**, **隔空投送** | DOCUMENTED [6] | Short coinages; they work because Apple teaches them with a system UI and years of marketing |
| Back to My Mac | 「回到我的 Mac」 | INFERRED (memory; Apple's page is gone, the service shut 2019 [7]) | A homing metaphor for this exact job |
| 向日葵 / ToDesk (remote-desktop apps) | **远程控制**, 远程访问 | DOCUMENTED [8] | Why 远程 primes "control the screen from afar" |

Reading: Chinese products that name this job either use the IT noun (外部访问, 远程访问) or
describe the situation (外出时). Ducter's siblings are spoken verb phrases (上网, 用手机, 打电话),
so the situation form fits. INFERRED.

## 3. Candidates and the test

Rubric 1–5: **L** legible cold · **F** fidelity · **B** brevity · **T** fits siblings and tone (warm,
plain, no jargon; 好用 顺滑 赏心悦目 放心 惊喜) · **D** distinct from other labels. Test = matches out
of runs (VERIFIED, raw answers in the scratchpad). "Ctx" = shown with siblings; "cold" = shown
alone as "a switch in the settings".

### A. 在哪儿都能用 / From anywhere (the device-card chip)

Real meaning: away from home, on another network, a phone or another computer still reaches the
Ducter that lives on this computer.

| zh (chars) | en pair | false implications | L | F | B | T | D | test ctx | test cold |
|---|---|---|---|---|---|---|---|---|---|
| 在哪儿都能用 (6) current | From anywhere | "works in any app / any platform"; "syncs across devices" | 2 | 3 | 2 | 3 | 2 | 3/3 | **0/3** |
| **从外面连 (4)** | From outside | 「外面」 is relative to the home's network, true even for a server; none found | 5 | 5 | 4 | 5 | 5 | – | **3/3** |
| 在外也能连 (5) | Connect while out | 「在外」 slightly written-register | 5 | 5 | 3 | 4 | 5 | – | 3/3 |
| 外面也能用 (5) | Works outside too | 「用」 could be any use, not reaching home | 5 | 4 | 3 | 4 | 4 | – | 3/3 |
| 在外面也能用 (6) literal | Works when you're out | none found; long | 5 | 5 | 2 | 4 | 4 | 3/3 | 3/3 |
| 不在家也能用 (6) | Works away from home | "home" wrong for a server or office box | 5 | 4 | 2 | 4 | 4 | – | 3/3 |
| 出门也能用 (5) | Works when you go out | "offline mode / caches content" (2/3 cold) | 3 | 3 | 3 | 4 | 3 | 3/3 | 1.5/3 |
| 连回家 (3) | Back home | "the AI reads your home devices"; 「远程回家」 is NAS jargon | 4 | 4 | 5 | 4 | 4 | 3/3 | 2.5/3 |
| 远程访问 (4) | Remote access | "remote-control the computer" (2/3 ctx said 操作它; 3/3 for 远程 alone); IT noun | 4 | 3 | 4 | 2 | 3 | 3/3 | 3/3 |
| 远程 (2) | Remote | "remote control" (3/3) | 3 | 2 | 5 | 2 | 3 | – | 2/3 |
| 外网访问 (4) | Internet access | jargon (外网/内网); "lets it go online" for non-technical users (INFERRED: Haiku is not naive about networks) | 4 | 4 | 4 | 1 | 3 | – | 3/3 |
| 随处可用 (4) | Available everywhere | "a floating button in other apps" (3/3) | 2 | 2 | 4 | 3 | 2 | 3/3 | **0/3** |
| 随行 (2) | With you | "follows you across devices, same context" | 2 | 2 | 5 | 3 | 3 | – | 1.5/3 |
| 外出 (2) | Away | "an away mode", an out-of-office status | 2 | 2 | 5 | 3 | 2 | 2/3 | – |
| 出门在外 (4) | Out and about | "it keeps doing things for you while you're out" | 3 | 2 | 4 | 4 | 3 | 1.5/3 | – |
| 在外面 (3) | Outside | "an outing mode: location, trip reminders" | 2 | 2 | 5 | 4 | 3 | – | 1.5/3 |

**Recommendation: 从外面连 / From outside.** Four characters, a spoken verb phrase like its
siblings (上网 · 用手机 · 打电话 · 从外面连), says the literal thing, and the only short candidate
that went 3/3 cold with no false implication. It also matches the copy already in the product:
the setup's last steps 「从外面打开试试」 and the D228 ⓘ. Runner-up: **在外也能连** (5, 3/3).
The en "From anywhere" overpromises (it is from outside this network, through one address), and
"From outside" pairs cleanly. The phone row follows: **在外面也能找到 Ducter / Reaches Ducter from
outside** (INFERRED, not tested).

### B. 在哪儿运行 / Where it runs (settings tab)

Real meaning: which computer Ducter itself runs on, whether it keeps running with the window
closed, its data folder, switching to another computer's Ducter.

| zh (chars) | en | false implications | L | F | B | T | D | test ctx |
|---|---|---|---|---|---|---|---|---|
| **在哪儿运行 (5)** current | Where it runs | "phone vs cloud" (1/3) | 4 | 4 | 3 | 4 | 4 | **2.5/3** |
| 住在哪儿 (4) | Where it lives | "where data is stored, local or cloud" | 3 | 3 | 4 | 5 | 3 | 2/3 |
| 这台电脑 (4) | This computer | "the computer's files and permissions" | 3 | 3 | 4 | 4 | 3 | 2/3 |
| 住处 (2) | Home | "a virtual room", data location | 2 | 3 | 5 | 4 | 3 | 1.5/3 |
| 运行 (2) | Running | "autostart, background, task logs" | 3 | 2 | 5 | 3 | 3 | 1.5/3 |

**Keep 在哪儿运行.** It tested best; the long-name worry doesn't apply at five plain characters.
The 住在哪儿 group inside it stays (the house metaphor, 「住这儿」, is used on the card).

### C. 它用什么想事情 / What it thinks with (partner section)

| zh (chars) | en | false implications | L | F | B | T | D | test ctx |
|---|---|---|---|---|---|---|---|---|
| 它用什么想事情 (7) current | What it thinks with | none; long beside 4-char siblings | 5 | 5 | 2 | 4 | 5 | 3/3 |
| **用什么想 (4)** | What it thinks with | slightly clipped as a phrase | 5 | 5 | 4 | 5 | 5 | **3/3** |
| 脑子 (2) | Brain | a little flippant; "its intelligence level" | 5 | 4 | 5 | 4 | 4 | 3/3 |
| 大脑 (2) | Brain | "how it understands me" (1 of 3 vague) | 4 | 4 | 5 | 3 | 4 | 3/3 |
| 用哪个 AI (3) | Which AI | the plainest; "AI" inside a partner that is itself the AI | 5 | 5 | 4 | 3 | 5 | 3/3 |

**Recommendation: 用什么想 / What it thinks with.** Same rhythm as 怎么说话 · 记得什么; the en is
already this. Runner-up: 脑子 / Brain (warm, but a body metaphor the rest of Ducter doesn't use).

### D. 连接手机或另一台电脑 / Connect a phone or computer (pairing sheet title)

| zh (chars) | en | false implications | L | F | B | T | D | test ctx |
|---|---|---|---|---|---|---|---|---|
| 连接手机或另一台电脑 (10) current | Connect a phone or computer | none | 5 | 5 | 1 | 3 | 5 | 3/3 |
| **连上手机或电脑 (7)** | Connect a phone or computer | none | 5 | 5 | 3 | 4 | 5 | **3/3** |
| 再连一台 (4) | Connect another | none; echoes the card's own button 再连一台 | 5 | 4 | 5 | 5 | 4 | 3/3 |
| 连一台设备 (5) | Connect a device | "a smart speaker or wearable" (3/3 named hardware) | 3 | 3 | 4 | 4 | 3 | 1.5/3 |
| 添加设备 (4) | Add a device | "pair a speaker, earbuds or a watch" (3/3) | 2 | 2 | 4 | 3 | 2 | **0/3** |

**Recommendation: 连上手机或电脑.** Literal, three characters shorter, same en. Runner-up:
**再连一台**, where the sheet is opened from that button. 添加设备 is the industry default and
fails: Chinese readers hear IoT pairing (米家-style).

### E. 自己发现了事，怎么告诉你 / When it notices something (proactive section)

Real meaning: when it notices something worth your attention in your mail, calendar and accounts,
whether and how often it tells you (options 只说急的 · 每天最多 3 件 · 有用就说 · 不用主动找我).

| zh (chars) | en | false implications | L | F | B | T | D | test ctx |
|---|---|---|---|---|---|---|---|---|
| 自己发现了事，怎么告诉你 (10) current | When it notices something | "how it notifies: push or in-app" (1/3) | 5 | 4 | 1 | 3 | 4 | 3/3 |
| **发现了就说 (5)** | When it notices something | reads like an option, near 有用就说 | 5 | 5 | 3 | 5 | 3 | **6/6** (two rounds) |
| 发现了事 (4) | When it notices something | colloquial, a little clipped | 4 | 5 | 4 | 4 | 4 | 3/3 |
| 主动找你 (4) | Comes to you first | "greetings and chat"; 2 of 6 said "the same as 通知 › 什么时候找你" | 5 | 3 | 4 | 4 | **2** | 6/6 |
| 主动说 (3) | Speaks up | same collision (2/3) | 4 | 3 | 5 | 4 | 2 | 3/3 |
| 主动提醒 (4) | Reminders | "to-do and calendar reminders" | 4 | 2 | 4 | 3 | 3 | 1.5/3 |
| 它发现的事 / 它发现了什么 (5/6) | What it noticed | "a page of insights about your habits" (6/6) | 2 | 2 | 3 | 4 | 3 | 0–2/3 |

**Recommendation: 发现了就说.** The only short one that keeps the core (it noticed something, it
tells you) without colliding with the Notifications tab's 什么时候找你. Its cost is the echo of the
option 有用就说; if that grates, rename that option (out of scope here). Runner-up: 发现了事.

### F. 自己就做，还是先问你 / On its own, or asks you first (trust section)

| zh (chars) | en | false implications | L | F | B | T | D | test ctx |
|---|---|---|---|---|---|---|---|---|
| 自己就做，还是先问你 (9) current | On its own, or asks you first | none; a sentence as a title | 5 | 5 | 1 | 4 | 5 | 3/3 |
| **要不要先问 (5)** | Asks first, or not | none | 5 | 5 | 3 | 5 | 5 | **3/3** |
| 先问再做 (4) | Asks first | states one answer as the rule (it always asks) | 5 | 3 | 4 | 4 | 4 | 3/3 |
| 放手多少 (4) | How much on its own | "a slider, higher = more autonomy" (3/3 said 数值越高) | 5 | 4 | 4 | 4 | 4 | 3/3 |
| 分寸 (2) | Judgement | "how it talks, which topics to avoid" | 1 | 1 | 5 | 4 | 2 | **0/3** |

**Recommendation: 要不要先问.** Asks the question the section answers, neutral between the two
answers. Runner-up: 放手多少 (warm; implies a scale the section doesn't have). The elegant 分寸
failed completely: a one-word poetic name with no literal anchor.

### G. The 与/和 split (no test; a consistency fix)

外观与声音 · 更新与关于 · 素材与致谢 against 语言和对话 · 数据和记录. Ducter's voice is spoken
Chinese, where 「和」 is the word; 「与」 is written and reads translated. Recommend **外观和声音 ·
更新和关于 · 素材和致谢** (en unchanged). INFERRED. Two drifts to fix at the same time: desktop
`devices.title` 「你的设备，和它们会做的事」 vs web 「你的设备」 (take the web's), and desktop
`web.title` 「让这台 Mac 能上网」 vs web 「上网」. And 用电脑 / Use apps should pair cleanly (either
用应用 / Use apps or 用电脑 / Use the computer), a call for whoever owns D-numbers on that ability.

## 4. Limits

- Raters are one small model in 153 runs, not people. Haiku knows networking words a typical
  user doesn't, so jargon (外网访问, 远程访问) scored better than it would with people. The
  comprehension bar in AGENTS.md wants humans later.
- Round 1 showed siblings and said "your home computer hel"; that context did most of the work
  (every A candidate scored ≥ 1.5). Round 2 (cold) is what separated them.
- Grading is by hand, by one grader, against a one-line meaning; raw answers are kept in the
  scratchpad for re-grading.
- Not tested: the en side, the phone row wording, the 与/和 change, and the labels ranked 12–15.

## Implications for Ducter

1. **Rename the chip and ability 在哪儿都能用 → 从外面连, en From anywhere → From outside**, and
   the phone row → 在外面也能找到 Ducter. This is a user-facing name change: a `Dn`, the glossary
   (three rows), desktop and web i18n, the device-card prototype, `docs/devices.md`,
   `docs/phone.md`, `docs/troubleshooting.md`, in one change loop.
2. **Shorten four titles:** 用什么想 · 连上手机或电脑 · 发现了就说 · 要不要先问. en unchanged.
3. **Keep 在哪儿运行.** It tested best.
4. **Spoken 和, not written 与,** in tab names; fix the two desktop/web drifts.
5. A rule worth recording with the decision: a name for a feature or place is a short spoken verb
   or noun phrase that says the literal thing and passes a cold read. "Anywhere / everywhere"
   words (在哪儿都能, 随处) and one-word poetic coinages (分寸, 随行) failed cold here; Apple's
   coinages (接力, 随航) work only with a teaching UI Ducter doesn't have.

## Summary

The shipped name is 在哪儿都能用 (6), not 从任何地方访问; read without context it means "works in
any app", 0/3. **从外面连 / From outside** (4) went 3/3 cold, fits its 2–3-character verb siblings,
and echoes the setup's own 「从外面打开试试」; runner-up 在外也能连. Of 351 name-like zh strings,
73 are ≥ 6 characters; most are deliberate warm phrases. The real offenders are comma sentences
used as titles and names longer than their siblings: shorten to 用什么想, 连上手机或电脑,
发现了就说, 要不要先问; keep 在哪儿运行; use 和 not 与. 添加设备 (0/3, heard as IoT) and 分寸
(0/3) are the cautionary results.

## Sources

1. Synology, "Network and External Access", DSM 7.4 software spec: https://www.synology.com/en-global/dsm/7.4/software_spec/network_external_access
2. Synology Knowledge Center, QuickConnect (DSM 7: Control Panel › External Access › QuickConnect): https://kb.synology.cn/zh-cn/DSM/help/DSM/AdminCenter/connection_quickconnect and https://kb.synology.com/en-global/DSM/tutorial/What_are_the_differences_between_QuickConnect_and_DDNS
3. 「远程访问飞牛 NAS 的两种方式与对比」 (系统设置 › 远程访问 › FN Connect): https://knightli.com/2026/04/04/fnos-remote-access-public-ip-vs-fn-connect/ ; IT之家 on FN Connect: https://www.ithome.com/0/865/931.htm
4. Apple (China), 家庭 app: https://www.apple.com.cn/home-app/
5. Apple Support (zh-hk), iPad 使用手册, home hub and remote connection: https://support.apple.com/zh-hk/guide/ipad/ipad76474c82/18.0/ipados/18.0
6. Apple Support (zh-cn), macOS 使用手册 (接力, 随航, 隔空投送): https://support.apple.com/zh-cn/guide/mac-help-cn/mchl732d3c0a/mac
7. AppleInsider, "Apple switches off Back to My Mac remote access for all users" (2019-07-02): https://appleinsider.com/articles/19/07/02/apple-switches-off-back-to-my-mac-remote-access-for-all-users
8. Oray (向日葵 / 蒲公英), 异地组网 and remote control articles: https://www.oray.com/news/47240.html
9. Raw rater answers (VERIFIED, not in git): session scratchpad `naming/a/`, `naming/a2/`, `naming/a3/`.
