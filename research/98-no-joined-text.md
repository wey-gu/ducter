# 98 — No joined text: every "·" a person read, and what each became (D291)

The author, on the Mac's Devices page (cards titled "iPhone · Ducter" and "iPad · Ducter", "14 小时前" under them):
"我认为这种用文字 · 去表达的设计非常烂（我记得手机端也有很多），能仔细反思一下么，不能有这样的文本拼接的 UI 设计".

This is an inventory of the clients' own code and words, not a survey of other products. All counts are VERIFIED by
`scripts/check-joins.ts` and by grep in the repo (2026-11-17).

## What was wrong

A middle dot between strings is a database row printed for a person. "连不上 · 最后在线 3 小时前" makes the reader
take the string apart again: which part is the state, which is a time, which is a name. On the phone it is worse.
A narrow line wraps in the middle of a dotted list, and nothing tells the eye where one fact ends. The dot also let
any view add one more fact to a line without deciding whether the fact belonged there. That is how a device came
to be *named* "iPad · Ducter", with the brand glued into its title although the clay art already shows the app.

## Counts

| | Before | After |
|---|---|---|
| "·" anywhere in the four trees the author named (comments and tests included) | ~1,300 | — |
| "·", "•", "・" in non-comment, non-test client and engine code (`scripts/check-joins.ts`) | 841 (811 lines) | 0 outside the allowlist |
| Allowlisted lines that are not joins (parsing, masks, model-only, the old-name matchers) | — | 23 entries |
| Allowlisted Settings lines, owned by the settings pass (TODO D296) | — | 24 entries, ~70 lines |

## Pattern → treatment

Grouped by pattern, not by site. "Mac" is `apps/desktop/internal`; "web" is `apps/web/src`, wide and phone.

| Pattern | Treatment | Before → after (zh / en) | Where |
|---|---|---|---|
| A name with a kind or brand appended | The name alone. The kind is shown by the art, and the platform carries it in data | iPad · Ducter → iPad; iPhone · Safari → iPhone (platform `ios-safari`) | pairing (`conn.ts`), the core's one-time rename (`auth.ts`), both clients' display normaliser |
| A second copy of a name, numbered with a dot | A number, the way people tell two things apart | iPhone · 2 → iPhone 2 | `auth.ts numbered` |
| A list row: name · time | The name, then one phrase under it, or a state word with its dot | iPhone / 14 小时前 → iPhone / 14 小时前在线 · Online 14 hours ago; 住这儿 · 有更新 → 住这儿 + 有更新 as its own element | `ListRow` / `listRow` |
| A state plus when it was last seen | The state word in its ink with its dot; when, as its own muted line | 连不上 · 最后在线 3 小时前 → 连不上 (dot) / 最后在线 3 小时前 | device sheet (`statusLine`, `sheetStatus`) |
| A role plus a count | One sentence | 小鸭住这儿 · 在做 3 件事 → 小鸭在这儿做着 3 件事 / Ducter is here working on 3 tasks | `card.status.home.working` |
| harness · model · effort; repo · branch; project · computer | Separate small facts (`Facts` / `a.facts`, gap S3, free to wrap) | Codex · gpt-5 · hawdb · ducter/fix-ci → Codex  gpt-5  hawdb  ducter/fix-ci | task head, task info, New task's pill, On hand cards and rows, past tasks, the switcher |
| A name inside a sentence (harness and model) | `who.name`: Codex（gpt-5.5）/ Codex (gpt-5.5) | 换到 Codex · gpt-5.5 接着做 → 换到 Codex（gpt-5.5）接着做 | candidates, switch hairlines, retuned notes |
| Hairline words · time | The words; the time apart in muted tabular figures | 等到了 · 12:25 → 等到了 + 12:25; 换成 Codex 接着做 · 21:40 → 换成 Codex 接着做 + 21:40 | transcript dividers, wake/told/switch lines, the go chip |
| A wait's reason · when it comes back | The reason; "21:59 回来 / Back at 21:59" as its own element | 等 CI 跑完 · 21:59 回来 → 等 CI 跑完 + 21:59 回来 | the end line, On hand's waiting rows |
| Locator entries (label · first line; run · time range) | A quiet tag for the brief, the line, the time or range right-aligned (an en dash is typography) | 交给它的事 · 帮我看… → [交给它的事] 帮我看… 12:03; 等到了 24 次 · 1:51–19:06 → 等到了 24 次 1:51–19:06; 3 条提示 · 9:02–9:40 → 3 条提示 9:02–9:40 | locator (Mac, web) |
| A label · a count | The count as its own muted element | 都按默认 · 2 → 2 件都按默认; 改动 · 3 个文件 → 改动 + 3 个文件; git push · +2 → git push + +2 | decision tray, task changes, sent lines |
| The header's counts | Each count its own element; read aloud as a list | 1 件等你 · 在做 2 件 → 1 件等你  在做 2 件 | conversation header (Mac, web) |
| Two clauses in one i18n value | One natural sentence, or the second clause dropped when a state already says it | 试了 %d 次还没做到 · 要你看看 → 试了 %d 次还没做到; 只读 · 不发出任何东西 → 只看，不改也不往外发 | `until.*`, `routine.effect.*`, `task.report.*`, `state.done_claimed` → 在检查做得对不对 / Checking the work |
| A version and how it was installed; up to date and when it checked | Two facts | 版本 2.1.322 · 用 npm 装的 → 版本 2.1.322  用 npm 装的 | agents' coins, device updates |
| A call row: state · name (· timer) | One sentence per state; the talk timer as its own tabular element | 通话中 · 鼎泰丰 01:23 → 正在和 鼎泰丰 通话 + 1:23; 没打通 · X → 打给 X，没打通 | phone call rows (Mac, web) |
| Count · spend; duration · cost | One sentence | 今天 3 通 · 花了 $1.20 → 今天打了 3 通，花了 $1.20; 4 分钟 · 约 $1.60 → 约 4 分钟，花 $1.60 左右 | the call card, the call sheet |
| A look: looked · time · what it saw | What it saw, with the time apart | 看过了 · 20:14 · MacBook 上还没看到手机 → MacBook 上还没看到手机 + 20:14 | your own number's setup |
| An ongoing thing's line: cadence · next | Two facts | 每 45 分钟看一次 · 下次 15:32 → 每 45 分钟看一次  下次 15:32 | 一直在跑的 / Ongoing (Mac, web) |
| A search's range | The words and the dates apart | 上周 · 11月9日 – 11月15日 → 上周  11月9日–11月15日 | 做过的事 / Past tasks |
| File facts (kind · size · pages) | Facts | PDF · 9 KB · 3 页 → PDF  9 KB  3 页 | file viewer, file cards |
| The context meter's words | Sentences; when it compacts is its own line | 上下文 · 已用 48% → 上下文已用 48%; 压缩了上下文 · 152k → 31k → 上下文从 152k 压缩到了 31k; 7 天额度 · Opus → 7 天额度（Opus） | context ring, meter, compaction hairline |
| The calendar's day head and row meta | One date phrase; meta as facts; the account apart | 今天 · 11月18日 周三 → 今天 11月18日 周三 / Today, Wed, Nov 18 | calendar day card and change cards |
| Find evidence: sender · subject | The sender as its own field and element | — | proactive finds (ledger, triage, finds views) |
| Push titles, toasts, copied text, chat-app notes | One natural sentence | Ducter · 修 CI → 修 CI; 「x」已合进 · abc123 → 已把「x」合进去了（abc123）; label · ref → 已复制 %s / Copied %s | `push.ts`, toasts, evidence copy, the chat-app morning note |
| Android notifications and release notes | Plain lines; recording as the notification's sub text | 要问的：· 要预约吗？ → 要问的：\n要预约吗？ | `Dial.kt`, `Notify.kt`, `Screens.kt` |
| Accessible names (aria-label, title, a Mac control's Label) | `spoken`: the facts read aloud with "，" / ", " | 打开 · iPhone → 打开，iPhone | every shared control, coins, chips, rows, buttons |
| A core summary that reaches a screen | One sentence | 2 of 3 match · 2 SUCCESS → 2 of 3 match (2 SUCCESS, 1 PENDING); 3 new · first → 3 new, the first: … | checks, watches, waiters, routine titles |
| Phone control labels "title · subtitle" the views split again | The core joins title and subtitle with " \| ". Only the model reads that string; people see the title alone | (no change on screen) | `phone-use.ts LABEL_PARTS / labelHead` |

## Allowed, deliberately (the guard's allowlist, each with its comment)

- Typography, not joiners: an en dash in a range (23:03–23:04). This was never flagged.
- Parsing someone's Markdown list bullet (`markdown.ts`, `markdown-doc.ts`, `follow.go`, a provider's marker in `phone.go`). The partner's own list, written out as plain text with a marker at each line's start (`channels/format.ts`, `imessage/words.go`).
- Masks: the secret mask "••••••" and its no-double-mask rule (`redact.ts`, `redact.go`); a card's "•• 4242"; a masked code (`saved/*`).
- Matchers for the old device name: they strip it, never show it (`format.ts`, `store.go`, `auth.ts`, `candidates.ts`). Splitting facts saved before D291 (`ledger.ts`).
- Words only a model reads: a watcher item for the partner (`connections.ts`).

Out of scope, stated in design/ui.md: the CLI's terminal output (`packages/cli`), logs and exported debug text, the site's page titles, the partner's own messages, and tool results and briefs only a model reads.

## Open

- **`packages/core/src/work.ts:376`**: a partner tool's parameter description gives the example
  "每周一 9:00 · 跟着你的时区". The model may copy the dot into `triggerWords`, which shows on screen; the
  engine's own `triggerWords` already says "每周一 9:00（跟着你的时区）". Changing the description needs the D175
  partner eval run. It is allowlisted with a TODO.
- **Settings (handled by the settings pass: D289 merged, D296 in flight).** These remain and are allowlisted with
  "TODO D296":
  - Mac `views/{accounts,autofill,keys,loadout,settings,settings_panels,settings_rows}.go`:
    - `loadout.go`'s `candName` / `candReason` / `brainLine` and its `"· "+state`;
    - the autofill placeholders "•••• 4242 · 留着不改";
    - `settings_rows` labels.
  - Mac `i18n/{accounts,autofill,channels,imessage,loadout}.go` and `ia.go`'s `acct.src.*`:
    - `card.oo_out`, `card.key_bad`, `card.empty`;
    - `kind.deadline`;
    - `imessage.on*` / `imessage.state.*`, `chats.state.linked`;
    - `af.use.approved`;
    - `loadout.left.reserve`, `loadout.pi`, `cand.reserve`.
  - Web `accounts.tsx`, `autofill.tsx`, `i18n-autofill.ts`, `i18n-channels.ts`:
    - the loadout functions in `views.tsx`;
    - the `acct.src.*`, `loadout.*` and `card.*` keys in `i18n.ts`.
  - The Mac loadout should draw who does it with the new `who.name` and `stateWord`, to match the web.
- The CLI keeps its "·" in terminal output (out of scope).

## Implications for Ducter

- One rule, three tools.
  - `Facts` / `a.facts` for a group of facts.
  - `spoken` for an accessible name.
  - A sentence key for plain text.
  - A view reaching for "·" now has a named alternative on both clients.
- The guard (`scripts/joins.test.ts`) runs in every test run. A new joined line fails CI unless it earns a commented allowlist entry.
- Names are data the person owns. Ducter never writes its own brand or the browser into one again; the platform field carries it.

**Summary.** 841 joined strings in client and engine code became separate elements, single sentences or spoken
names. Devices are named by their model. A guard keeps it so. What is left is Settings (owned by D296) and one
partner tool example that waits for its eval.
