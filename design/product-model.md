# Product Model: Objects, Vocabulary, Scenarios

> Draft 1 · 2026-11-08 · The single source of truth for *what exists in the product and what it
> is called*. Principles say *why*, design notes say *how*, prototypes show *what it looks like*.
> Decisions and superseded drafts live in `design/decisions.md`. Evidence: `research/19`, `research/20`.

## 1. Vocabulary

**Rules**
- **Partners, not hierarchy.** No court, throne, approve/reject, seal, or boss language.
- **Every user-facing word translates cleanly**, with no puns and no culture-bound images.
  English and Chinese are designed together.
- **No concept to learn.** Seeing the word should be enough to guess what it means.
- **i18n keys from day one** (`decision.go`, `state.needs_you`, …). No hard-coded copy.

**Glossary.** "Internal" is what docs and code say; "shown" is what users see.

| Internal | Shown (中 / EN) | Meaning |
|---|---|---|
| persona, main AI | its **name** (default "Ducter"); as a category 伙伴 / Partner | Whoever you're talking to |
| Log, channel | (hidden) "对话 / the conversation" | |
| job | (no card; just an ack and a status line) | Any work not answered at once. Executed in turn, in a fork, or in a window (principle 6) |
| Focus Window, window | **事 / Task** | A job big enough to need its own session and place. **Only windows get cards** |
| workspace view | "展开 / Open" (no name of its own) | A task opened to full depth |
| overview board | **手头的事 / On hand** | Every task across all personas |
| attention states | 等你 / Needs you · 在做 / Working · 在等 / Waiting · 做完了 / Done · 没成 / Didn't work · 放下了 / Dropped | `done?` shows as "做完了 · 在检查 / Done · checking" only while a check runs, else as Done (D68); `queued` shows as "还没开始 / Not started yet" |
| decision actions | **好 / Go** · **先等等 / Hold** · **回复… / Reply…** · **看细节 / Details** | The Go button may name the action: en says the action alone in sentence case ("Rebase"), zh keeps 好 in front ("好，rebase") (D73). An ask's small heading is the asking task's title; the count is said once, "2 件等你 / 2 need you" |
| Project | **项目 / Project**; no project = **其他 / Other** | An editable grouping label |
| Place | **在哪儿做 / Where** | Where a task works |
| Device (machine, runner) | **设备 / Devices** | |
| Routine | **例行 / Routine** | Recurring or triggered work |
| Waiter | (shown as the reason for Waiting: "在等 PR 通过 / Waiting for the PR to be approved") | |
| `until` loop | "一直…直到… / Keep … until …" on the task | |
| Rule | **规则 / Rule** | A standing preference stated in words |
| device states | **醒着 / Awake · 睡着了 / Asleep · 连不上 / Can't reach** · wake = **叫醒 / Wake** | Never "broken" or "offline" wording for sleep |
| quota | **额度 / limit** ("额度还剩 80% / 80% of the limit left") | One per AI account, shared across its devices |
| screen place controls | **画面 / Screen** tab · **接手 / Take over** · **还给它 / Give it back** | |
| loop iteration | **第 n 次 / Try n** | |
| checkpoint | **保存了进度 · {time} / Progress saved · {time}**; in the dossier **保存的进度 / Saved progress** | Describes what happened; no noun to learn |
| handoff | **换到 X 接着做 / Continue on X** | Never "superseded" in UI |
| pause | **先停 / Pause** | Shown as a waiting reason |
| Recipe | **准备步骤 / Setup steps** | |
| non-git draft copy | **草稿副本 / Draft copy** | |
| routine fields | **{date} 再问你 / Ask you again {date}** (review date) · **可以碰 / May touch** (also on every task, D61) | |
| default outcomes | **按默认做了 / Went with the default** · **都按默认 / Go on all defaults** | |
| outcomes | **停下了 / Stopped** · **撤销 / Undo** · **再试一次 / Try again** · **告诉它怎么做… / Tell it what to do** · **检查没过 / Check didn't pass** | 告诉它怎么做… sits beside 再试一次 on a task that didn't work and opens the task's composer (D76) |
| a merge / draft PR whose result was lost with the connection | **不确定做成没有，看一下 / Not sure it went through — check** · **再试一次 / Try again** | Only when the Log doesn't show it done after reconnecting. Never "failed" wording: it may have happened |
| quiet hours | **免打扰 / Quiet hours** ("免打扰 23:00–08:00") | The word the user's phone already uses |
| remote access ability | **在哪儿都能用 / Reach from anywhere** | Done: "MacBook 现在在哪儿都能用了" |
| pairing a client with a server (D54) | **连接到你的 Ducter / Connect to your Ducter** · **地址 / Address** · **连接码 / Code** · **连上 / Connect** · **断开 / Disconnect** · again: **再连一次 / Connect it again** | The desktop card, the phone and the CLI (`ducter pair`, `ducter devices disconnect`). Sentences say "这个码只能用一次 / The code works once". Never "token", "配对 / pair", "授权 / authorize" or "绑定" in UI |
| a device that runs tasks for a main elsewhere (worker) | (a **设备 / Device**; in the CLI "让这台电脑替另一个 Ducter 干活 / lend this machine to another Ducter"; the main is "Ducter 住的那台电脑 / the computer Ducter lives on") | Shown with the device states (醒着 / Awake …). "Worker" stays internal |
| server keeps running (systemd service) | **一直开着 / Stays on** (doctor row) | |
| capability (browser, computer use, phone, calls, remote access) | **no noun on screen** (D66). Headings: **你的设备，和它们会做的事 / Your devices and what they can do** · **还能装上的 / You can also add** | Equip = **装上 / Add to <device>**; remove = **取下 / Remove**; result = "MacBook 现在会上网了 / MacBook can now browse the web"; device detail "MacBook 会：… / can: …". Item names are ability phrases (上网, 用电脑, 在哪儿都能用). Never 学会/教会/赋予/授权 (they read as ordering a subordinate). Never 装备/Gear (reads as armour; rhymes with 设备). Claude Code skills stay **技能 / Skills** on their own page, never on the rack |
| the partner saved something to long-term memory (Mem) | **记下了 · <title> / Noted · <title>** | One quiet line under the reply, no card, no action. Never "已存入记忆 / saved to memory" in the partner's words; recall is never shown at all |
| a request from another agent through Nowledge Bridge (`bridge_msg` in) | **<X> 发来请求 · <gist> / Request from <X> · <gist>** (pending user OK, J-Q5) | One quiet line, then the partner's own Go/Hold question if it would act. Never 交接 / hand-off (that is a task changing body). Never "Bridge", "mailbox", "contact", "Space" in UI |
| the partner answered that agent | **已回复 <X> / Replied to <X>** (pending user OK) | "Replied" is not "done"; nothing promises the other side has seen it |
| Intent | (shown as a decision or a policy line: "要推送到 ducter/fix-ci / Will push to …") | |
| a task message to the partner (report) | **告诉 {name} / Told {name}** (· 要你定 · 做完了 · 在等 · 没成); freshness "{time}更新 / updated {time}" | Never 汇报 or 交回给 (reporting up) |
| task brief · transcript | **{name} 交代的 / What {name} asked for** · **过程 / What it did** | Tool calls fold into one line per stretch: **跑了 n 条命令 / Ran n commands**, **改了 n 个文件 / edited n files**, **看了 n 个文件 / read n files**, **用了 n 次工具 / used n tools**; a step that didn't work: **{command} 没成 / {command} didn't work** (D74) |
| an opened task's sections | **改动 / Changes** (**n 个文件 / n files**) · **细节 / Details** (谁在做 / Who's doing it · 在哪儿做 / Where · 保存的进度 / Saved progress · 发出去的 / Sent out · 用量 / Usage) · **{time}开始的 / started {time}** | D74 |
| harness turn ended | **先做到这儿 / Stopped here for now** | Never "turn", "step", 这一轮, 这一步 |
| a message to a task | **它正在做，已经告诉它了 / Told it while it works** · **它收到了，接着做 / Got it; it's on it** · **等它忙完手上的就告诉它 / It'll get this once it finishes what it's doing** · **没送到 / Didn't get through** | |
| the result anatomy (D60) | **怎么知道的 / How I know** (also the evidence heading everywhere; no 证据) · **发出去的 / Sent out** (empty: 没有 / Nothing) · **这次没包括 / Left out** · **合进 {branch} / Merge into {branch}** · **开草稿 PR / Open draft PR** · **改了 n 个文件 / n files changed ›** (the changes link; the task's own diff evidence) | Under a result: one quiet line of proof, a ↗ line only when something went out, then the actions; See changes is not repeated (D73) |
| effects seen but not gated | **它的记录里看到的 / Seen in its log** | |
| the day's record | **今天发出去的 / Sent out today** | |
| place `none` | **不用特定的地方 / Nowhere in particular** | |
| devices, by the user's own words | **这台 Mac / This Mac** · **这台手机 / This phone** · **另一台电脑 / another computer** | Never 机器 / machine in UI copy |
| presence | **{name} 在呢 / is here** · **在做事 / is working** · **有事找你 / needs you** · **刚做完一件事 / just finished something** · **还没醒 / isn't up yet** | Never 待命 |
| stopping Ducter on a Mac (D56) | **让 Ducter 歇着 / Stop Ducter** (menu) · **{name} 歇着了 / {name} is resting** · **叫醒 {name} / Wake {name}** | Closing the window or ⌘Q never stops Ducter; this is the one explicit stop. 叫醒 is the same verb as for a device, on purpose |
| updating the app (D72) | **检查更新… / Check for Updates…** · **有新版本 {v} · 重启时更新 / Update {v} ready · restart to finish** · **有新版本 {v} · 去下载 / Version {v} is out · Download** · **现在重启 / Restart Now** · **退出时自动更新 / Update automatically when quitting** | One quiet line in the app menu and Settings; never a pop-up the person didn't ask for |
| removing Ducter (D72) | **彻底移除 Ducter / Remove Ducter** · **会删掉 / Removes** · **会留着 / Keeps** · **只停下并移除后台项 / Only stop and remove the background item** · **全部移除 / Remove everything** · **任务的工作副本 / tasks' working copies** (the worktrees) | The page names each path; never "uninstall" in copy. 后台项 matches macOS's own "后台项目 / background items" |
| help (D72) | **Ducter 使用指南 / Ducter docs** · **报告问题… / Report a problem…** · **也带上最近的对话 / Include the last conversation** (off by default) | Nothing is uploaded; the person attaches the .zip themselves |
| the partner's page (D71) | **伙伴 / Partner** (nav, ⌘4; also the partner's own face and name in the conversation's bar) · **改名字 / Rename** · faces **在呢 / Here · 在做事 / Working · 有事找你 / Needs you · 刚做完 / Just done · 歇着了 / Resting** · **住在{device} 上 / Lives on {device}** | A character sheet, not a form. Never "profile", "persona", "agent settings" |
| how the partner talks | **怎么说话 / How it talks**: **跟着我 / Follow me** · 中文 · English | Follow me = the language of the user's message |
| notifications and the default wait | **什么时候找你 / When it comes to you**: **通知 / Notifications** · **免打扰 / Quiet hours** ({start} 到 {end} / to) · **你没回的时候 / If you don't answer** · "等多久再按默认做 / How long before it goes with the default" | Only reversible decisions wait; irreversible ones always wait for the user |
| memory, as the user controls it | **记得什么 / What it remembers** · **记住事情 / Remember things** (switch) · **最近记下的 / Noted lately** · **忘掉 / Forget** ("忘掉了：{title} / Forgotten: {title}"; when Mem can't: "这里不再显示…；Nowledge Mem 里那条还在 / … is hidden here; it's still in Nowledge Mem") · **装上 Nowledge Mem / Get Nowledge Mem** | Never "delete memory", "knowledge base", "记忆库" |
| what runs without asking | **自己就做，还是先问你 / On its own, or asks you first** · **自己就做 / On its own** · **先问你 / Asks you first** | Read-only today; the items say the property (发给别人的 / reaches other people, 收不回的 / can't be taken back) |
| the app's own settings (D71) | **设置 / Settings** (⌘,; Settings… in the menus) · **外观 / Look** · **界面语言 / Language** (**跟着系统 / Follow the system**) · **关窗以后 / When you close the window** · **更新 / Updates** · **数据和记录 / Data and logs** (打开数据文件夹 · 打开记录 · **检查一遍 / Run checks** · 都好 / All good) · **关于 / About** | What the partner is like lives on Partner, not here |
| AI accounts on Devices | **登录 / Sign in** · **退出登录 / Sign out** · **装上 / Install** (an account card on this Mac) | The tool's own sign-in, in the browser; Ducter never sees the password |
| the first-wave harnesses (D85) | **Claude Code** · **Codex** · **pi** · **DeepSeek Harness**, each product's own name, the same in zh and en | Never "harness", "runtime" or "adapter" on screen. pi is written lower-case, as its makers write it |
| an account that runs on an API key (pi, DeepSeek Harness) | **需要一个 DeepSeek 密钥 / Needs a DeepSeek key** · **有 DeepSeek 密钥 / Has a DeepSeek key** · pi: **有能用的模型 / Has a model it can use** | The key is typed into a masked field and kept on this machine only (D85 proposal); never shown again, never in the conversation |
| adding a device | **连上手机或另一台电脑 / Connect a phone or computer** (opens the one-time code) | Same words as D54's Connect |
| the menu bar extra | the clay partner in the macOS menu bar; its menu: **等你 · {n} / Needs you · {n}** or **没有要你定的事 / Nothing needs you**, each question with **好：{action} / Go: {action}** · **先等等 / Hold** · **回复… / Reply…**, then **打开 Ducter / Open Ducter** | |
| a sandboxed place | **no noun**: the property, **碰不到你的文件 / Can't touch your files** | 沙盒 retired (D66, GQ8) |
| Artifact | **做好的 / Finished**; the list **做好的东西 / Everything finished** | 成果 retired (report-speak) |

## 2. Objects and ownership

| Object | Owned by | What it is |
|---|---|---|
| **User** | | The person. Attention, quiet hours, devices, subscriptions, skills, projects, and global rules are theirs |
| **Persona** | user | A named partner with one conversation and one Mem identity |
| **Device** | user | An enrolled Mac/Linux box or an ephemeral sandbox; shared by all personas |
| **Project** | user | A grouping label that remembers its places and rules; shared across personas |
| **Repo** | project | A git repository, identified by its remote |
| **Checkout** | repo × device | Where that repo lives on that device; discovered automatically |
| **Folder** | project | A non-git directory on a device |
| **Recipe** | repo | Setup / run / cleanup commands, approved once |
| **Task** (window) | persona | One delegated job with its own session, place, project label, and states |
| **Routine** | persona | A template (trigger, brief, report policy, budget, effect scope, review date) whose firings create runs |
| **Waiter** | task | A one-shot predicate that wakes its task |
| **Rule** | user, persona, or project | A binding preference |
| **Intent** | task | A pending external effect |
| **Result** | task | A file, document, diff/PR, report, or app it produced |
| **Partner settings** | persona | Its name, how it talks, notifications and quiet hours, the default wait, whether it remembers (D71). On the server; the same on every client |
| **App settings** | each client | Look, the window's language (D71). On that device only |

**Rule precedence**, most specific wins: task pin > project rule > persona rule > user rule >
Ducter default. A rule that can't be honored is never skipped silently (principle 14).

## 3. Place and project

Every task shows two editable things on its card and header.

**Where / 在哪儿做**, shown as chips such as `HawDB · MacBook · ducter/fix-ci`. It is one of:
- nothing: thinking or writing;
- a folder on a device;
- one or more repos on a device;
- a browser profile;
- a phone or call.

**Project / 项目** is a short title shared by related tasks. It is a label, not a container.

**Smooth by default.** In the common case Ducter asks no questions:
- **Place:** inferred from what you said (a repo name, a path, a URL, "on the Linux box")
  plus what Ducter knows.
- **Device:** if a repo lives on several devices, Ducter picks one that is awake, has a warm
  cache, or matches a rule. The card says why.
- **Project:** inferred from the place (a repo's project) or from the conversation. It is
  created implicitly the first time and shown as a "new project" chip you can rename or undo.

**Controllable always:**
- **Projects:** rename one inline (every task carrying it follows), move a task to another
  project, or merge two projects.
- **Changing a task's device, base branch, or repo** is a handoff (principle 13). The old task
  becomes superseded. Adding a repo just extends the place.
- **+ New task** in On hand opens a picker: project → repo(s)/folder → device → base branch
  → model. It is the power path, never required.

**Repos and worktrees**

*Discovery and cloning*
- A runner discovers the checkouts on its device.
- A repo can be cloned onto another device using that device's own git login. Ducter asks
  once per repo.

*Worktrees*
- A task whose brief says it will **write** gets a worktree **at start**, in
  `~/.ducter/worktrees`. The agent names the branch `ducter/<slug>` on its first turn.
- A **read-only** task reads the main checkout, including uncommitted changes, and never
  gets a worktree.
- In a **multi-repo** task, the repos marked writable get worktrees at start; the others are
  read on demand.

*Recipes*
- The first time a repo is used, Ducter proposes a Recipe and the user approves it once.
- Recipes are stored in Ducter, with an offer to commit them to the repo.

*Caches and files*
- Dependency caches are shared: pnpm, bun, uv, sccache.
- Build output directories are never shared or symlinked.
- `.env`-style files are copied per `.worktreeinclude`.

*Ports and leases*
- Each task gets a 10-port block.
- Exclusive resources, like a database port, make the second task **wait** instead of
  crashing.
- One writer per write set. A second task wanting the same files shows "在等 · 被占用 /
  Waiting · in use", or proposes its own branch.

*History*
- Checkpoints are private git refs.
- The branch is pushed as `ducter/*` at each checkpoint:
  - personal repos automatically;
  - org repos after asking once per repo.
- This push is what makes moving a task to another device possible.
- A revert appends to the Log; history is never deleted.

*PRs*
- Draft by default, created as an intent.
- Rebase is a decision with a default.
- A merged PR auto-archives its task.
- Ducter never merges unless a rule allows it.

*Archive and disk*
- Archiving commits leftovers, removes the worktree, and keeps the branch. The device's own
  runner does this when it next wakes.
- Each device has a disk budget. Reclaiming archived worktrees is automatic; deleting
  anything else needs Go.

*Folders that aren't git*
- Writes go to a **draft copy** and are applied with one Go at the end, unless you mark the
  folder trusted. Either way, writes stay reversible.

## 4. Work over time

Two primitives plus one property cover every case.

- **Waiter** on a task: "tell me when the PR is approved". It is code where possible; a quiet
  check costs no model turn. While waiting, the task shows **在等 / Waiting** with the reason.
- **`until` on a task**: "keep fixing until CI is green". A cheap model judges the condition
  after each turn. The loop stops on any of:
  - the condition holding;
  - 20 iterations (the default cap);
  - no progress;
  - oscillation.

  The card shows a per-iteration strip.
- **Routine / 例行**: "every Monday at 9, draft the weekly report", "when someone replies to
  this thread, summarize it".
  - Each firing creates a **run**: a fresh task by default. A "babysit one thing" routine
    continues a single task across runs.
  - On On hand a routine is **one card**, showing its next firing and its latest run. Runs are
    nested inside it. Only runs that will need the user appear on the attention forecast.
  - **Creation:** always through a proposal card in the conversation, showing:
    - the trigger in words, with the time zone;
    - the next 5 firings, or a live dry run of the condition;
    - the budget;
    - how it reports;
    - its effect scope.

    One Go activates it. The agent may pause it; only the user resumes it.
  - **Time zone:** personal-time routines follow the user ("every morning at 9, brief me");
    world-time routines are pinned ("at market open", "team standup"). Ducter infers which
    and states it on the card.
  - **Budget:** each run is capped at 2× the first run's actual cost, plus a monthly cap.
    Both are shown and editable.
  - **Reporting:** report on change, or when it needs you. Digests the user asked for are
    always delivered.
  - **Missed firings** (devices asleep) coalesce. Ducter tries, in order: another device, then
    waking the device, then one late run, then recording the skip. The cloud fallback is off
    unless enabled per routine.
  - **Lifespan:** each routine has a review date, 30 days by default. It auto-pauses after 3
    consecutive failures or 3 unread reports, then asks "还要吗？ / Keep this?".
  - **Visibility:** the condition is always shown in plain words; the compiled code is
    visible once the task is opened.
  - **Safety:** each routine has a fixed effect scope, and anything beyond it becomes an
    intent. Trigger payloads (emails, webhooks) are untrusted data. Harness-native cron and
    loops stay disabled.

## 5. Personas

- Each persona has its own conversation and Mem identity. Its tasks run under that identity.
- **Attention is the person's.** On hand aggregates every persona, and each card carries its
  persona's face and color. Conversations stay separate.
- **Isolated by default.** A persona reads or asks another only after the user links them.
- **Recognizable at a glance:** its own face, accent color, and optionally theme.
- **Creating one is light:** a name plus one sentence. Mem's birth-draft flow does the rest.
- **Quota:** subscriptions belong to the user. The main-AI reserve is kept per subscription,
  shared by all personas' main turns.

## 6. Scenario catalog

Each scenario needs a flow, states, copy (zh + en), and motion. Status is tracked in
`design/scenarios.md` once flow work starts.

- **A. Setup and devices.** First run; pairing a device; a device sleeping or waking; going
  offline mid-task; the same repo on two devices; a harness not logged in; quota running out;
  a second persona.
- **B. Kinds of work.**
  - Quick answer done in turn.
  - Research with no place.
  - A code change in one or several repos.
  - Browser work that needs a login.
  - A phone or call task.
  - Writing.
  - A `until` loop; a waiter; a one-off scheduled run; a recurring routine; an always-on
    monitor.
- **C. Places and projects.** First mention of a new repo; discovering repos; a project with
  no repo; a non-git folder; the recipe failing; a port clash; a busy lease; PR, rebase,
  merge, archive; running low on disk.
- **D. Decisions and attention.** A decision with a default and countdown; batch harvest;
  quiet hours; escalation (badge → message → push → call); done with evidence; failed
  verification; failure; stall.
- **E. Steering.** A follow-up in the conversation vs. inside the task; adding scope; switching
  model or harness; handoff; pause or cancel; merging or splitting tasks; reopening days
  later.
- **F. Memory and identity.** A rule created, edited, or forgotten; recalling something from
  weeks ago; Mem unavailable; switching or linking personas.
- **G. Safety.** An intent that needs policy (push, send, pay, call); a credential request;
  honesty about isolation.
- **H. Across devices.** Starting on the phone and continuing on the desktop; voice; acting
  on a lock-screen notification.
- **I. Results.** Where results live; sharing; user-made apps (later).

## 7. Motion

The zoom metaphor:
- A task chip in the conversation **grows** into its On hand card, which **unfolds** into the
  open task. Going back reverses the path.
- The living message **re-settles** in place when revised.
- A decision resolves with a soft **press-and-settle**.
- The face reacts to state: blinks while idle, glances aside while working, nods on done,
  raises its brows when it needs you.

Timing and springs come from the theme's `motion.personality`. The spec lives in
`design/ui.md`.

## 8. Open questions

- Results: where finished documents live is decided (D52 Q7: in 做好的 (Finished) on the control plane,
  with an optional "write it into a place"). The results view and the result anatomy are open
  (`flows/I-results.md`, IQ1–IQ11).
- Merging and splitting tasks: the cheap version is decided (D52 Q5); full semantics for the
  Log, leases, and branches stay open.
- Linking personas: scope (read-only? ask-only?) and how it is shown.
