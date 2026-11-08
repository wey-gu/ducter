# Glossary Review (2026-11-09)

> Asked by the author: "词汇表你要仔细反思，不能有非人类感觉和无关的新概念". Decided as D66. The
> glossary in `product-model.md` §1 is updated from this table, and the three string tables
> (`apps/desktop/internal/i18n/i18n.go`, `apps/web/src/i18n.ts`, `packages/cli/src/i18n.ts`)
> follow it (commit `fe5afe4`).

## The test applied to every word

1. **Would a person say it to a friend?** "我把改动合进 main 了" yes; "对外：没有" no.
2. **Is it a new concept, or a plain description of something the user already knows?** A
   label that names a mechanism (checkpoint, pairing, turn, queue) teaches a concept; a
   description of what happened ("保存了进度", "还没开始") doesn't.
3. **Machine feel?** System words (对外, 存档, 待命, 排队中, 环境, 配对), report-up words (汇报,
   交回给), and step counters (这一步, 这一轮) all fail.
4. **Is a label needed at all?** Often the UI can show the thing and say what it is in a short
   sentence, with no noun.
5. **Fewer words.** One word per concept across all surfaces; prefer the one the user already
   uses elsewhere on their phone (免打扰, 未读, 登录).

Labels still state the literal thing (AGENTS.md). Where a choice was genuinely close, the
alternative is in the last column.

## Changed

| Concept | Current (zh / en) | Proposed (zh / en) | Why | Alternative considered |
|---|---|---|---|---|
| outside effects line | 对外 / Outside | **发出去的 / Sent out**; empty: 没有 / Nothing; none yet: 还没发出去任何东西 / Nothing sent out yet | 对外 is office-speak ("对外发布"). What the user wants to know is whether anything *left*: "发出去了吗？" is how they'd ask | 离开这台电脑的 / Left this computer (longer, and wrong for a VPS) |
| the day's record | 今天对外 / Outside today | **今天发出去的 / Sent out today** | Same word as the line | |
| effects seen but not gated | 从对话记录里看到的 / Seen in the transcript | **它的记录里看到的 / Seen in its log** | 对话记录 is a chat log; a task's record is what it did | |
| evidence heading | 怎么知道的 / How I know | kept | Spoken, first person | |
| evidence (noun) | 证据 / Evidence | **no noun**: the heading 怎么知道的 / How I know everywhere (living message, dossier) | 证据 is courtroom; one heading for one thing | 依据 (still formal) |
| merge action | 合回 {branch} / Merge into {branch} | **合进 {branch}** / Merge into {branch} | Developers say 合进 main / 合到 main; 合回 implies it came from there | 合到 main |
| checkpoint | 存档 / Checkpoint | **保存了进度 · {time} / Progress saved · {time}**; dossier: 保存的进度 / Saved progress | 存档 is a game save and a new concept; "progress saved" describes what happened | 进度 alone |
| a task's report card | 向 X 汇报 → 交回给 X / Handed back to X | **告诉 X / Told X** (· 要你定 · 做完了 · 在等 · 没成) | 汇报 is reporting up; 交回给 is a hand-in. Partners tell each other | 跟 X 说了 |
| last report time | %s汇报 → %s交回 | **%s更新 / updated %s** | Same reason; the card only needs "how fresh" | |
| done today, header | 今天交回 n 件 / n handed back today | **今天做完 n 件 / n done today** | Matches the lane 今天做完 / Done today | |
| presence after a result | X 刚交回一件事 | **X 刚做完一件事 / X just finished something** | | |
| presence when idle | X 正在待命 / X is standing by | **X 在呢 / X is here** | 待命 is military | X 有空 / X is free |
| the harness turn ended | 这一轮做完了 → 这一步做完了 / Turn done, Step done | **先做到这儿 / Stopped here for now** | "Turn" and "step" are machine counters, and 轮 collided with loop rounds | no label (a thin divider); kept a line because the transcript needs to say the task is waiting for input |
| a message to a busy task | 插进了这一轮 / 已经插进它手上这一步 | **它正在做，已经告诉它了 / Told it while it works** | Says what the user cares about: it heard | |
| a message to an idle task | 送到了，开始新一轮 / 送到了，它接着做 | **它收到了，接着做 / Got it; it's on it** | | |
| a message queued behind work | 排在这一轮之后 / 排在手上这一步之后 | **等它忙完手上的就告诉它 / It'll get this once it finishes what it's doing** | | |
| not delivered | 没送到 / Not delivered | 没送到 / **Didn't get through** | en reads like a parcel tracker | |
| the decision's undo note | …这一步能撤销。 | **…，之后也能撤销。/ It can be undone.** | 这一步 again | |
| default fires now | 默认马上生效 / The default applies now | **马上按默认做 / Going with the default now** | 生效 is legal-speak | |
| state `queued` | 排队中 / Queued | **还没开始 / Not started yet** | A queue is a mechanism; the user only needs "not yet" | |
| `done?` | 做完了 · 核对中 / Done · checking | **做完了 · 在检查** / Done · checking | 核对 is accounting; 检查 is everyday | |
| verification failed | 核对没过 / Check didn't pass | **检查没过** / Check didn't pass | Same | |
| no project | 随手 / Loose | **其他 / Other** | 随手 and "Loose" are cute but unclear as a group header; Other is what every list says | 没归类 / Ungrouped |
| place `none` | 不需要环境 → 不需要在哪儿做 / No environment, Doesn't need a place | **不用特定的地方 / Nowhere in particular** | 环境 is internal; the second was awkward | 哪儿都行 / Anywhere |
| task brief | 任务书 · 来自 X / Brief · from X | **X 交代的 / What X asked for** | 任务书 is bureaucratic | |
| task transcript | 对话记录 / Transcript | **过程 / What it did** | It's work, not a chat | 做了什么 |
| folded tool calls | 工具调用已折叠 / Tool calls collapsed | **细节收起来了 / Details folded away** | "Tool call" is a harness concept | |
| kickoff line | 交代给它了，开始做 / Handed the brief over; starting | zh kept; en **Told it what to do; starting** | "brief" is jargon in en | |
| session started | 开工了 / Session started | zh kept; en **Started** | | |
| task age | 刚开 · 开了 {d} / just opened · open {d} | **刚开始 · 开始 {d} 了 / just started · started {d} ago** | "open" read as a door | |
| pairing code | 配对码 / Pairing code | **连接码 / Code** (field label; sentences say "这个码 / the code") | Pairing is Bluetooth jargon; the action is already 连上 / Connect, so the code is the connect code | 验证码 (reads as SMS login) |
| re-pair | 重新配对 / Pair it again | **再连一次 / Connect it again** | One verb for the whole flow | |
| machine | 另一台机器 / another machine | **另一台电脑 / another computer** | People say 电脑 | |
| server stays up (doctor row) | 保持运行 / Keeps running | **一直开着 / Stays on** | Spoken | |
| capabilities | 本事 / Abilities (pending) | **no noun on screen.** Headings say what they mean: 你的设备，和它们会做的事 / Your devices and what they can do; 还能装上的 / You can also add; device detail "MacBook 会：上网 … / can: …" | 本事 still names a category the user must learn; the verb phrase already carries it (D43: shown, not explained) | 能力 / Abilities (research/27 runner-up) |
| remote-access ability | 远程打开 / Reach from anywhere | **在哪儿都能用 / Reach from anywhere**; done: "X 现在在哪儿都能用了" | 远程 is IT-speak; item names are plain ability phrases like 上网 | 出门也能用 / Use it when you're out |
| quiet hours | 安静时段 / Quiet hours | **免打扰 / Quiet hours** (band: 免打扰 23:00–08:00) | The word the user's phone already uses | |
| allowance | 额度 / Allowance | zh kept; en **limit** ("80% of the limit left") | 额度 is everyday zh; "allowance" is pocket money | usage left |
| take over / hand back (screen) | 接手 / Take over · 交还 / Hand back | 接手 kept; **还给它 / Give it back** | 交还 is formal | |
| loop iteration | 第 n 轮 / Round n | **第 n 次 / Try n** | Each iteration is another try; frees 轮 | |
| recipe | 准备方法 / Setup steps | **准备步骤** / Setup steps | 方法 reads as "method" | |
| routine review date | 复查 / Review on | **{date} 再问你 / Ask you again {date}** | 复查 is medical; say what will happen | |
| results | 成果 / Results | **做好的 / Finished**; list: 做好的东西 / Everything finished | 成果 is report-speak ("工作成果") | 结果 (reads as "outcome") |
| snapshot (I-results) | 快照 / Snapshot | **当时的样子 / As it was then** | | |
| sandbox (G-safety, GQ8) | 沙盒 / Sandbox | **no noun.** Say the property: 碰不到你的文件 / Can't touch your files | A technical word for consumers; the property is what matters | 单独的电脑 / A separate computer |
| take over to pay (G4) | 接手付款 / Take over to pay | **你来付 / You pay** | It's the user's money; say so | |
| waiter example | 在等 PR 被批 / Waiting for PR approval | **在等 PR 通过 / Waiting for the PR to be approved** | 批 belongs to the retired approve vocabulary | |
| memory status (CLI) | 默认身份 / default identity | **还不认识你 / starts fresh**; doctor: 伙伴先从零开始认识你 | "Identity" is a Mem concept | |
| optional items (CLI) | 可选项会增加能力 / 多装上一些本事 | **可选项能让 Ducter 多会几件事 / Optional items let Ducter do more** | | |
| worker (CLI help) | 作为干活的设备加入另一个 Ducter / a worker | **让这台电脑替另一个 Ducter 干活 / lend this machine to another Ducter** | "worker" stays internal (glossary) | |
| main machine (CLI) | 主机器 / main machine | **Ducter 住的那台电脑 / the computer Ducter lives on** | Matches 住在 / Lives on | |
| first result line | 第一件事做完了。以后做完的事，我都会这样带着证据交回给你。 | **第一件事做完了。以后做完的事都会这样回到你这儿，还会告诉你我怎么确认的。/ Your first task is done. Everything I finish comes back to you like this, with how I checked it.** | 证据 and 交回给 | |

## Kept (they pass the test)

事 / Task · 手头 / On hand · 等你 / 在做 / 在等 / 做完了 / 没成 / 放下了 · 好 / 先等等 / 回复… ·
项目 / Project · 在哪儿做 / Where · 设备 / Devices · 例行 / Routine (formal but known; "每周都做的事"
is too long for a label) · 规则 / Rule · 醒着 / 睡着了 / 连不上 · 叫醒 / Wake · 换到 X 接着做 /
Continue on X · 先停 / Pause · 草稿副本 / Draft copy · 可以碰 / May touch · 按默认做了 / 都按默认 ·
停下了 / 撤销 / 再试一次 · 连接到你的 Ducter · 地址 · 连上 / 断开 · 记下了 · <title> / Noted ·
怎么知道的 / How I know · 看改动 / See changes · 改动 / Changes · 细节 / Details · 开草稿 PR (the user
in this moment is a developer; "draft PR" is their word) · 在 Ducter 的浏览器里看 {host} · 你不在的时候
/ While you were away · 接下来什么时候需要你 · 今天做完 / Done today · 这台 Mac / 这台手机 · 别的设备 ·
住在 / Lives on · 数据文件夹 · 想叫我什么？· 这台 Mac 准备好了 · 还差一步 · 在终端里运行 · 通知 /
Notifications and its buttons · 添加到主屏幕 (Apple's own label, quoted) · 密钥 / Key · 照样发送 /
不发了 · 已经说好 / 先等等了 / 已回复 · 放下 / Drop · 谁在做 / 为什么是它 · 用量 / Usage (dossier
depth, for developers) · 未读 / unread (every chat app says it) · 会发出去 / Will go out · 收不回 ·
账号 · 不让用了 · 这次没包括 / Left out · 存到… · 第 n 版 · 改了什么 · 你问的 · 分享… · 关掉链接 ·
登录 · 登录过期了 / Sign in · Signed out · 新伙伴 / New partner · 显示 / Show.

## Code strings changed

All in commit `fe5afe4`; keys unchanged, zh/en parity kept, tests updated, `apps/web` rebuilt.
Desktop and phone share keys: `outside.title`, `outside.seen`, `outside.none`,
`outside.nothing.merged`, `result.merge`, `result.ask.merge`, `result.acting.merge`,
`result.merged`, `result.merged.toast`, `living.evidence`, `task.dossier.evidence(.none)`,
`task.checkpoint`, `task.dossier.checkpoints(.none)`, `task.report(.needs_input|.done|.blocked|
.failed)`, `onhand.reported`, `header.done`, `face.idle`, `face.done`, `task.turn.done`,
`delivery.steered|prompted|queued|failed`, `decision.default.go`, `decision.default.due`,
`state.queued`, `state.done_claimed`, `onhand.checking`, `onhand.loose`, `place.none`,
`task.brief`, `task.transcript(.hint)`, `task.kickoff` (en), `task.session.started` (en),
`time.opened(.now)`, `firstresult.line`, `firstrun.elsewhere`, `connect.*` (code, body, safe,
revoked, err.code, err.nocode, phone.body, phone.safe), `pair.title|code|noaddress|expired|
again|scan`, `nav.devices.label`, `devices.title|subtitle|grid`, `ability.remote(.done|.about)`,
`token.allowance` (en), `quiet.band_label`, `notify.ask.note`. CLI: `doctor.optionalNote`,
`check.nmem.down|missing`, `up.memory.default`, `check.service`, `pair.title|code`,
`help.pair|worker|pairWorker`, `worker.usage|refused|err.code`, `devices.revoked`. Core:
the zh push line for a decision's default (`packages/core/src/push.ts`).

## Not changed yet (no string in code, or outside the three tables)

- Flow drafts in `design/flows/` are updated to the new words in the same change.
- The partner's own prose is steered by its persona, not by these tables. Its persona and the
  task brief use none of the replaced words (grep); the filter that keeps result plumbing out of
  its prose (`packages/partner/src/partner.ts`, `RESULT_PLUMBING`) now also catches 合进.
