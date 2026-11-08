# Open Questions: Consolidated

Each item has the lead's recommendation. Once the user answers, record it in
`docs/decisions.md` and propagate per AGENTS.md. The sections after the first one are the
record of what was already decided (D51, D52).

Canvas: https://claude.ai/artifact/LKuVp3knPDJ4EdoyWBGSWN

## Decisions waiting for you (2026-11-09 morning)

Collected from every overnight workstream and deduplicated. Each item gives one line of
context, the recommendation, and **the default if you answer "按建议"**. Nothing here is decided
yet; D54 is the only one that already has a `Dn` number (marked *proposed*).

### 1. Server, remote access, trust

**1.1 D54: server mode + code pairing (proposed overnight).** The main process runs on a Linux
VPS as a systemd user service on 127.0.0.1; clients pair once with an 8-character code for a
revocable device token; Caddy on your own domain or an SSH tunnel; workers dial out to
`/worker`. Built and verified in VMs (`research/29`).
- *Recommendation:* accept D54 as written. It is the code half of D40; the passkey and the
  Ducter Edge stay the phone/no-domain target.
- *Default:* D54 becomes accepted; "pending review" is removed from `decisions.md`.
- Links: `../../decisions.md` D54 · `../system.md` "Server mode", "Workers" · `../../../research/29-vps-logins.md`

**1.2 Local trust on a shared VPS.** Any process on the machine counts as local and needs no
token, including other human accounts on a shared host. `DUCTER_LOCAL_TRUST=off` exists but
cuts the main's own tasks off `/mcp`.
- *Recommendation:* keep loopback token-free on single-user machines; build a 0600 **local
  token** next (CLI, same-machine desktop and the tasks' MCP config present it), then make
  `off` the default whenever doctor sees other human users. Until then, don't recommend a
  shared host.
- *Default:* as recommended; the todo item stays with its trigger.
- Links: `../system.md` "Who counts as local, and what that allows" · `../../todo.md` "Server mode"

**1.3 The phone client is Preact, not MyGo WASM.** D20 says desktop and web use MyGo native
UI. The phone client built tonight (`apps/web`) is a ~79 KB Preact bundle served by the main
process, sharing the desktop's i18n keys and Pebble tokens. This departs from D20 for the phone.
- *Recommendation:* accept Preact for the phone web client in v1 (small, works as an iOS Home
  Screen app with Web Push); MyGo WASM stays the plan for a desktop-class web client; Expo
  stays the native-app plan.
- *Default:* record a decision that amends D20 for phone web only.
- Links: `../../decisions.md` D20, D34 · `../ui.md` "Prototype canvases" (Phone web row)

### 2. Ducter.app

**2.1 Lifecycle: tied to the app, or keeps running.** Today Ducter lives as long as the app:
⌘Q, closing the window, or a force quit stops it, and tasks stop with it. A Ducter that was
already running from a terminal is attached to and left alone.
- *Recommendation:* keep "the window closes, Ducter stops" for v1 (one thing to understand),
  and add one opt-in, "Keep Ducter running when the window is closed", which installs a
  LaunchAgent. Offer it the first time a task is still running at quit. Alternative: a
  LaunchAgent or menu-bar presence by default (closer to "silence means success", but a
  background process the user didn't ask for).
- *Default:* as recommended.
- Links: `../onboarding.md` "What ships today: the app path" · `../../../README.md` "The app"

### 3. Phone notifications (push)

**3.1 Push defaults.** Built in `packages/core/src/push.ts` and `apps/web`.
- *Recommendation (as built):*
  - a decision nobody has read for **30 s** earns one push; at most one push per 15 min, the
    rest coalesce;
  - **done results do not push** unless the user turns on 做完了也告诉我 / Also tell me when
    something's done (done is level 2, I-results rule 3);
  - **quiet hours 23:00–08:00** in the phone's time zone, brought by the first phone that turns
    notifications on; nothing breaks through (D52 Q12); at most one push when they end;
  - iOS gets tap-to-open only, Android also gets Go / Hold (D52 Q11).
- *Default:* keep all four as built.
- Links: `D-decisions-attention.md` · `I-results.md` rule 3 · `../ui.md` Phone web row

### 4. Results (group I) and safety (group G)

**4.1 The result-shape rule (I-results rule 1, measured in `research/30`).** The partner's
prose is the outcome only (plus what was left out and what is unverified). The client renders
怎么知道的 / How I know, 对外 / Outside and the actions (Merge, Draft PR, See changes) from the
typed report. Asking the prose for those rows produced branch and "合回 main？" talk; dropping
them took the eval from 55% to 94%.
- *Recommendation:* adopt rule 1 as written, and promote it with "words freeze, chips live"
  (IQ10) into `conversation.md`.
- *Default:* a `Dn` for the result anatomy; `conversation.md` gets the rule.
- Links: `I-results.md` §0 · `../../../research/30-partner-eval.md`

**4.2 IQ1–IQ11 and GQ1–GQ13.** Full tables with reasons: `I-results.md` and `G-safety.md`.
Defaults in bold; "按建议" takes all.
- **IQ1** Result message appears **at verified Done**; if the user is watching and checks take
  > 10 s, at Done · checking with chips that fill as checks pass.
- **IQ2** Always show the **对外 / Outside** line for tasks with a place, **including "没有"**
  (built this way in desktop and phone).
- **IQ3** The Results list lives **inside On hand** (from the Done lane header); asking is the
  primary path. No fourth zoom level.
- **IQ4** Save to… a repo **writes, never commits**; offers a draft PR separately (default Hold).
- **IQ5** **Diff snapshot at Done**, 5 MB cap per task.
- **IQ6** Share links: **7 days, revocable, with Ducter Edge** (not in v1 yet).
- **IQ7** **Pre-share check on** (secrets, home paths, private hosts, Mem private memories).
- **IQ8** **Keep results until deleted** (10 s Undo).
- **IQ9** Save to Mem **only on tap**, into the named space, with provenance.
- **IQ10** Promote **"words freeze, chips live"** to `conversation.md` (see 4.1).
- **IQ11** New evidence kinds and a `result` Log event as **one protocol change**.
- **GQ1** Adopt the **effect ladder** (`G-safety.md` §0 Rule 3) as v1 policy.
- **GQ2** People-facing sends **wait until quiet end + 30 min** unless Go'd in the moment.
- **GQ3** **30 s** undo window for emails and posts, held on the control plane.
- **GQ4** Offer "don't ask next time" **after 3 identical Go's in 14 days**, never for the floor.
- **GQ5** Floor: **payments, passwords, untrusted-requested effects, no-default decisions**.
- **GQ6** **Redact** a secret that reached the Log (superseding event + blob delete) and advise
  rotation: a narrow exception to "never delete".
- **GQ7** Until the gate covers harness commands, list **"Seen in transcripts"** effects
  (the client already shows 从对话记录里看到的 / Seen in the transcript).
- **GQ8** **沙盒 / Sandbox** + its plain meaning; comprehension proxy before final.
- **GQ9** On hand record line **always shown, muted** ("今天对外：没有").
- **GQ10** PR comments / ready / request review: **ask, no countdown**.
- **GQ11** Sending-row slide: **motion, not metaphor**; check in prototype review.
- **GQ12** **可以碰 / May touch** on every task, not only routines.
- **GQ13** Write a short research report on approval fatigue and undo-send before review.
  It was drafted as `research/29`, a number now taken by the VPS-logins report; it becomes
  the next free number (`research/31`).

### 5. Browser places (W5)

**5.1 W5-1: the Ducter browser's identity.** The Ducter browser is a second, identical Google
Chrome. Built as a draft and on by default so it can be reviewed live.
- *Recommendation:* Dock tile = the clay avatar; window parked bottom-right at ~60% size behind
  the user's work; status line 在 Ducter 的浏览器里看 {host} / Looking at {host} in Ducter's
  browser, with a Show action. Alternative: minimise the window while it works.
- *Default:* as recommended (the client still has to render Show; the Dock tile was never seen
  with the Dock visible).
- Links: `../system.md` "Proposed: the Ducter browser's identity" · `../onboarding.md` "The browser, first time"

**5.2 W5-2: browser tasks run without the user's own Claude config.** No user MCP servers,
skills or CLAUDE.md: input tokens on one lookup went from 332k to 140k, and the user's real
Chrome is out of reach. This departs from "windows inherit skills" (principle 17) for this
place kind only.
- *Recommendation:* accept, and in the same change scope browser tasks' `log_search` /
  `log_read` to their own stream, so a hostile page can't talk a task into reading the
  conversation.
- *Default:* as recommended.
- Links: `../system.md` "The user's own harness config" · `../../todo.md` "Browser places"

### 6. Memory

**6.1 One live write into Nowledge Mem.** The memory slice is measured only against a fake Mem
(eval 16/16). Your Mem is Cloud, so a test write would land in a real Space.
- *Recommendation:* allow one write into a scratch Space you name, check that provenance lands
  in `metadata.source_message_id`, then archive it.
- *Default:* a scratch Space named `ducter-scratch`, archived after the check.
- Links: `../memory.md` "Long-term memory across days" · `../../todo.md` "Long-term memory"

### 7. Repository

**7.1 Art assets in git or LFS.** `docs/art/assets` (17 MB: raw generations plus 22 alpha
cutouts) is already in plain git history, and `docs/art/concepts` adds 3.8 MB.
- *Recommendation:* stay on plain git (LFS adds a setup step for every contributor and
  bandwidth quotas, and moving now rewrites history). From here on, commit only the final
  exports the client uses (WebP 1×/2×/3×, alpha PNG); keep raw generations in the concept-art
  canvas. Before the repo goes public, decide whether to squash the raw images out of history.
- *Default:* as recommended.
- Links: `../ui.md` "Art direction" · `../../todo.md` "Art assets"

### 8. Carried over (still waiting from 2026-11-08)

- **本事 / Abilities** as the name for capabilities (`research/27`; runner-up 能力). Default:
  本事.
- **Capability map metaphor (D43):** the literal playset with the loadout's equip snap
  (`../ui.md` "Capability map"; `research/24`, `26`, `28`). Default: the hybrid, pending a
  human comprehension test.
- **记下了 · <title> / Noted · <title>** for a memory save (glossary row marked pending).
  Default: keep.

### 9. Glossary additions (one batch)

Every user-facing word below appears in a client or CLI string table (`apps/desktop/internal/
i18n/i18n.go`, `packages/cli/src/i18n.ts`, `apps/web/src/i18n.ts`) or in a drafted flow, and is
**not yet** in `product-model.md` §1. Words already in the glossary (连接到你的 Ducter, 配对码,
地址, 连上, 断开, 保持运行, 在等 · <device> 连不上, 按默认做了, 都按默认, 安静时段, 存档, 先停,
再试一次, 撤销, 随手, 展开 …) are left out. *Default:* add them all as shown; the notes flag the
ones worth a second look.

**In the clients today**

| Concept (internal) | zh / en | Where | Note |
|---|---|---|---|
| outside effects line | **对外 / Outside**; empty value **没有 / Nothing**; none yet 还没有对外动过 / Hasn't touched anything outside | result, dossier | Anchor word for groups I and G |
| detected, not gated, effects | 从对话记录里看到的 / Seen in the transcript | result | G-safety says "Seen in transcripts"; pick one |
| evidence row heading | **怎么知道的 / How I know** | result | |
| evidence (noun) | 证据 / Evidence | living message, dossier | |
| merge action | **合回 {branch} / Merge into {branch}** · 已经合回 {branch} / Merged into {branch} | result | e.g. 合回 main |
| draft PR action | **开草稿 PR / Open draft PR** · 草稿 PR 开好了 / Draft PR is open | result | |
| see the diff | **看改动 / See changes** · tab 改动 / Changes | result, opened task | |
| task details | 细节 / Details (tab) · 看细节 / Details (link) | opened task, living message | Two zh words for one en word |
| task age | 刚开 / just opened · 开了 {time} / open {time} | On hand cards | |
| browser status line | **在 Ducter 的浏览器里看 {host} / Looking at {host} in Ducter's browser** | task status | W5-1 |
| living message title | 你不在的时候 / While you were away | conversation | |
| attention forecast | 接下来什么时候需要你 / When you'll be needed next | On hand | |
| Done lane | 今天做完 / Done today · 今天交回 {n} 件 / {n} handed back today | On hand, header | |
| attention state `queued` | 排队中 / Queued | cards | Missing from the glossary's state list |
| `superseded` | 换到别处接着做了 / Continued elsewhere | cards | Past form of 换到 X 接着做 |
| a decision once answered | 已经说好 / Agreed · 先等等了 / On hold · 已回复 / Replied · 默认：/ Default: | decisions | |
| drop (action) | 放下 / Drop | opened task | The state 放下了 is in the glossary |
| delivery labels for a message to a task | 正在送过去… / Sending… · 插进了这一轮 / Steered into this turn · 送到了，开始新一轮 / Delivered as the next turn · 排在这一轮之后 / Queued after this turn · 没送到 / Not delivered | opened task | "这一轮 / turn" clashes with 第 n 轮 / Round n |
| task transcript | 对话记录 / Transcript · 工具调用已折叠 / Tool calls collapsed | opened task | |
| brief | 任务书 / Brief | opened task | |
| report | 向 {name} 汇报 / Report to {name} | opened task, On hand | 汇报 leans "reporting up"; check against "partners, not hierarchy" |
| dossier rows | 谁在做 / Who's doing it · 为什么是 {x} / Why {x} · 用量 / Usage | opened task | 用量 ≠ 额度 / Allowance |
| place `none` | 不需要环境 / No environment | dossier | "环境" is internal vocabulary |
| devices | **这台 Mac / This Mac** · **这台手机 / This phone** · 别的设备 / Other devices · 已连接的设备 / Connected devices | everywhere, CLI | |
| remote main | 我的 Ducter 在另一台机器上 / My Ducter is on another machine | desktop first run | |
| a key pasted in chat | 密钥 / Key · 照样发送 / Send anyway · 不发了 / Don't send | composer | G-safety proposes 密钥 / Key too |
| memory status (CLI) | 记忆 / Memory · 默认身份 / default identity | `ducter up` banner, doctor | |
| where Ducter lives (CLI) | 住在 / Lives on · 数据文件夹 / Data folder | `ducter up`, doctor | |
| the name question | **想叫我什么？ / What should I be called?** · 就叫这个 / Use this name | CLI, app | |
| ready line | **这台 Mac 准备好了 / This Mac is ready** | CLI, app | |
| setup screens | 还差一步 / One thing first · 在终端里运行 / Run in Terminal · 再检查一次 / Check again · 正在叫醒 {name}… / Waking {name} up… | app | 叫醒 / Wake is the glossary verb for devices |
| first result | **第一件事做完了。以后做完的事，我都会这样带着证据交回给你。/ Your first task is done. Everything I finish comes back to you like this, with proof.** | desktop | |
| CLI offer | 在终端里也能用 ducter？/ Use ducter in Terminal too? | app | |
| presence lines | {name} 正在待命 / is standing by · 还没醒 / isn't up yet · 刚交回一件事 / just handed something back | header | |
| notifications | **通知 / Notifications** · 好，通知我 / Yes, notify me · 先不用 / Not now · 做完了也告诉我 / Also tell me when something's done · 发一条试试 / Send a test · 不再通知 / Stop notifications | phone | |
| iOS install step | 添加到主屏幕 / Add to Home Screen | phone | Apple's own label, quoted as the system shows it |

**Proposed in flow drafts, not in code yet** (from `I-results.md`, `G-safety.md`,
`A-setup-devices.md`): 这次没包括 / Left out · 存到… / Save to… · 第 n 版 / Version n · 改了什么 /
What changed · 全部成果 / All results · 你问的 / You asked · 分享… / Share… · 存进 Mem / Save to Mem ·
生成链接 / Make a link · 关掉链接 / Turn off the link · 快照 / Snapshot · 会发出去 / Will go out ·
改一改 / Edit · 发出去 / Send · 推送 / Push · 发布 / Post · 提交 / Submit · 收不回 / Can't be taken
back · 补一封更正 / Send a correction · 删掉这条 / Delete the post · 关掉 PR / Close the PR · 账号 /
Account (能用的账号 / Accounts {name} can use) · 放进去 / Add it · 不让用了 / Stop using it · 接手付款 /
Take over to pay · 今天对外 / Outside today · 沙盒 / Sandbox · 登录 · 登录过期 / Sign in · Signed
out · 新伙伴 / New partner · 显示 / Show (W5-1).

## Glossary additions (decided as D51, 2026-11-08)

| Concept | zh / en |
|---|---|
| Take over / Hand back (screen) | 接手 / Take over · 交还 / Hand back |
| Screen tab | 画面 / Screen |
| Loop iteration | 第 n 轮 / Round n |
| Routine review date | 复查 / Review on |
| Routine effect scope | 可以碰 / May touch |
| Checkpoint | 存档 / Checkpoint |
| Device states | 醒着 / Awake · 睡着了 / Asleep · 连不上 / Can't reach |
| Quota | 额度 / Allowance |
| Wake a device | 叫醒 / Wake |
| Remote access ability | 远程打开 / Reach from anywhere |
| Handoff to another body or device | 换到 X 接着做 / Continue on X |
| Pause | 先停 / Pause (shown as a waiting reason, not a new state) |
| Recipe | 准备方法 / Setup steps |
| Draft copy (non-git) | 草稿副本 / Draft copy |
| Default applied | 按默认做了 / Went with the default |
| Stopped / Undo / Try again | 停下了 / Stopped · 撤销 / Undo · 再试一次 / Try again |
| Batch defaults | 都按默认 / Go on all defaults |
| Quiet hours | 安静时段 / Quiet hours |
| Verification failed | 核对没过 / Check didn't pass |

## Semantics (decided as D52, 2026-11-08; the bold recommendation was taken)

1. **A device sleeps:** after a 2-minute grace, its tasks show 在等 · 设备睡着了. **Yes.**
   This changes invariant 1 in `focus-window-states.md`: residency may set attention
   `blocked`, with the reason shown.
2. **Model switch within the same harness:** **a switch at a cut inside the same task**, not
   a handoff.
3. **Pause:** **a waiting reason, not a new state.** The file lease is released after 2 h.
4. **Drop:** **10 s Undo.** After that, reopening creates a new task linked to the old one.
5. **Merge / split:** **cheap version first.** Drop B and tell A about it; splitting opens a
   new task with a brief.
6. **Draft PR:** **auto-opens after the countdown on personal repos; org repos wait for Go.**
7. **Where research documents live:** **in 成果 / Results on the control plane**, with an
   optional "write it into a place".
8. **A routine with 3 unread reports:** **auto-pause and ask "还要吗？"**, per the product
   model.
9. **A waiter without a task:** **a compact row on On hand**, not a full card.
10. **Multi-repo in v1:** **one device**; missing repos are cloned there.
11. **iOS web push:** **tap-to-open only** (verify that it has no action buttons). Action
    buttons only on Android until the native app.
12. **Quiet hours:** **nothing breaks through** unless the user set a deadline and said "even
    at night". In v1 the escalation ladder stops at push.
13. **Default fires while the user is typing:** **one 2-minute grace.**
14. **Thresholds:** **circuit breaker after 3 identical errors; stall after 20 min with no
    events; no auto-retry** unless a rule says so.
15. **Second partner without Mem:** **allow it**, with a minimal identity stored by Ducter
    that migrates to Mem later.
16. **Home Mac asleep means the partner is unreachable:** **show a tip suggesting the main
    process run on a VPS.** Wake-on-LAN comes in v1.x.
17. **VPS install:** **finish setup in the browser via a temporary 15-minute link.** Needs a
    spike for relaying Claude Code and Codex logins.
18. **CN users' remote access default:** **their own domain.** Tailscale stays a community
    contribution.
