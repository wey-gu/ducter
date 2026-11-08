# Flows B: Kinds of Work

> Draft 1 · 2026-11-08 · Group B of `design/scenarios.md` (B1–B5, B7–B9; B6 phone/call is
> out of v1). Names follow the glossary in `product-model.md` §1. Words the glossary does not
> yet have are marked **[new]** and collected in "Glossary gaps" at the end; they need the
> change loop before they ship. Artboards: scratchpad `flows/project/B*.dc.html`.

## Rules that hold in every B flow

1. **One shape.** Every job is ack → status line → result (principle 6). The ack names the
   *action* in the user's terms ("我去看 CI / I'll look at the CI"), never an outcome, a
   promise of success, or a guess at the cause.
2. **The executor is invisible.** In turn, fork, and task produce the same three things in
   the same places: the ack line, one status line under it, and a result message that replies
   to the ask. The only visible difference is that a **task** (window) also earns a pebble
   chip, because only windows get cards. When a fork is promoted to a task, the existing
   status line *grows* a chip in place; no new message, no "I've escalated this".
3. **Silence means success.** Progress is never pushed. The status line updates in place;
   only `needs-you` items earn a push (principle 7).
4. **Where and Project are always shown, never asked** in the common case (§3). They appear
   as chips on the status line once a task exists, and are editable there.
5. **Decisions carry defaults** and name the action on the Go button ("建草稿 PR / Open draft
   PR"). A default applies on its own only when reversible.
6. **Status lines are written from typed state**, not prose guesses: they say what is being
   done right now ("在跑第 3 轮测试 / Running tests, round 3"), never "almost done".

Shared status-line keys (used by all flows):

| i18n key | zh | en |
|---|---|---|
| `job.status.working` | 在做 · {doing} | Working · {doing} |
| `job.status.waiting` | 在等 · {reason} | Waiting · {reason} |
| `job.status.needs_you` | 等你 · {question} | Needs you · {question} |
| `job.status.done_checking` | 做完了 · 在检查 | Done · checking |
| `job.status.failed` | 没成 · {reason} | Didn't work · {reason} |
| `job.status.dropped` | 放下了 | Dropped |
| `job.followup.receipt` | 收到，已经转给这件事 | Got it, passed on to this task |
| `job.cancel.ack` | 好，放下了 | OK, dropped |

---

## B1 · Quick answer in turn

### Scenario card
- **Who:** all three. Most often the fresh user, whose first message is a question.
- **Feels:** before, mild doubt ("is this just another chatbot?"); after, "it just answered,
  and it told me where it looked". Emotional value: 好用, 放心 (sources visible).
- **First time:** the first message ever. No setup beyond pairing; nothing to learn.

### Flow
1. User asks: "HawDB 的 checkpoint 默认间隔是多少？"
2. Main AI classifies as in-turn (no environment, read-only, ≤3 calls, ~10 s).
3. **Ack** appears within 300 ms: "我翻一下 HawDB 的配置。" Status line: "在做 · 读
   hawdb/src/config.rs".
4. Result arrives as a new message replying to the ask: the answer in one or two sentences,
   then a source row (`hawdb/src/config.rs:88 · main · MacBook`).
5. The ack and status line collapse into a thin "看了 2 个文件 / Read 2 files" footer on the
   result (tap to see which).

Branches:
- **2a. Needs nothing at all** (pure knowledge): no ack, no status line; answer directly.
  An ack is only for work that is not answered at once.
- **3a. Exceeds the in-turn budget** (>10 s or >3 calls): the same status line continues as a
  fork; the user sees no change. If it then exceeds ~2 min or needs to write, it becomes a
  task: the status line grows a pebble chip (`B2` shape). No apology, no announcement.
- **3b. Device asleep** (the repo lives only on the Mac mini): status line reads "在等 · 叫醒
  Mac mini / Waiting · waking Mac mini". If wake fails in 30 s: answer from what Ducter
  already knows, labelled "凭记忆，没检查 / From memory, not checked", plus Go "叫醒再看 /
  Wake and check".
- **4a. Can't answer:** say so plainly with what was tried: "没找到。看了 config.rs 和
  docs/，都没写默认值。要我跑一次看看吗？" Go = "跑一次 / Run it" (becomes a task).
- **User sends a follow-up while it runs:** steered in; receipt line `job.followup.receipt`.
- **"算了 / never mind":** cancels; status line becomes `job.cancel.ack` and fades.

### States touched
No window. Job: `open → resolved`. If promoted: window `queued → working` (B2/B3).

### Copy
| i18n key | zh | en |
|---|---|---|
| `b1.ack.read` | 我翻一下 {thing}。 | I'll look through {thing}. |
| `b1.status.reading` | 在做 · 读 {path} | Working · reading {path} |
| `b1.source.row` | 出处：{path}:{line} · {branch} · {device} | Source: {path}:{line} · {branch} · {device} |
| `b1.footer.read_n` | 看了 {n} 个文件 | Read {n} files |
| `b1.unchecked` | 凭记忆，没检查 | From memory, not checked |
| `b1.go.wake_check` | 叫醒再看 | Wake and check |
| `b1.not_found` | 没找到。看了 {where}，都没写。 | Didn't find it. Looked in {where}; it isn't there. |
| `b1.go.run_it` | 跑一次 | Run it |

### Motion
- Ack fades up 6 px (bouncy, 220 ms). The face glances aside while the status line is live.
- Result slides in under the ack; the ack + status line fold into the footer with a 180 ms
  height collapse. Face nods once.
- Reduced motion: cross-fades only.

### Edge cases
- Two quick questions in a row: two acks, two status lines, results reply to their own asks
  (quote the ask in a small reply strip when out of order).
- Answer depends on uncommitted changes: source row says "含未提交改动 / includes uncommitted
  changes".
- The main AI is on quota reserve: still answers in turn (reserve exists for this).

### Open questions
- Should a sub-1-second in-turn answer skip the status line entirely (only ack → result)?
  Proposed default: yes, show the status line only after 1 s.

---

## B2 · Research with no place

### Scenario card
- **Who:** the consumer personal-AI user (Grok/Muse habits) and the developer doing prior-art
  checks.
- **Feels:** before, "this will eat my evening"; after, "I got a readable document with
  sources I can trust, and it didn't nag me". Value: 放心 (sources), 赏心悦目 (the document),
  惊喜 (it noticed the contradiction between sources).
- **First time:** "帮我查一下……" in the conversation. No place, no project question.

### Flow
1. User: "查一下 bun build --compile 在 Linux 上有什么坑，我们打算用 1.4.4。"
2. Ack: "我去查 Bun 1.4 编译到 Linux 的已知问题。" Status line: "在做 · 找资料".
3. Main AI starts it as a fork. After ~2 min it is still reading, so it becomes a task.
   The status line grows a pebble chip: `Bun 编译调研 · 在做`. Chips: Where = **none**
   (shown as "只是查资料 / Just reading"), Project = inferred **Ducter** (from the
   conversation about the runner), editable.
4. Status line rotates through typed steps: "读了 9 个来源 · 在看 GitHub issues"; never a
   percentage.
5. On done: state `done?` → C checks the result exists and has ≥1 source per claim; M checks it
   answers the ask → `done`.
6. **Result message** replies to the ask: a 2–3 line answer up top (the conclusion), then a
   **document card** (title, one-line summary, "12 个来源 · 4 分钟读完", tags VERIFIED /
   INFERRED counts). Tapping opens the document reader (sources inline as numbered
   footnotes, each claim tagged).
7. Card actions: "打开 / Open", "存到项目 / Save to project" (writes into a folder of the
   project, if it has one), "再查深一点 / Dig deeper" (follow-up into the same task).

Branches:
- **3a. Finishes within the fork budget:** no chip ever appears; result is identical.
- **3b. Ambiguous ask** (which platform? which version?): ask *before* the ack, one question
  with a default: "按 x64 和 arm64 都查？" Go = "都查 / Both".
- **4a. Source behind a login or paywall:** noted in the document as "没读到 / Not read:
  {site} 要登录". If the persona has a logged-in browser profile for that site, offer
  Go "用浏览器读 / Read it in the browser" (becomes B5 shape). Never silently skipped.
- **4b. Sources contradict:** the document says so in a highlighted block; the result's top
  line names it ("两份资料说法不一致，我标出来了").
- **5a. Evidence insufficient:** M sends a follow-up to the task (stays `working`); the user
  sees nothing new.
- **Failure** (no network on the device, model refuses): `没成 · {reason}` with Go "再试 / Try
  again" (new task) and "回复… / Reply…".
- **Follow-up days later** ("那 1.4.5 呢？"): dedupe on the work key reopens the same task
  (`done → working`), same chip, same document gets a new version.

### States touched
Fork → window: `queued → working → done? → done`; branches to `needs-you`, `failed`,
`done → working` on reopen. Residency: `provisioning → hot → warm → parked`.

### Copy
| i18n key | zh | en |
|---|---|---|
| `b2.ack` | 我去查 {topic}。 | I'll look into {topic}. |
| `b2.status.finding` | 在做 · 找资料 | Working · finding sources |
| `b2.status.read_n` | 读了 {n} 个来源 · 在看 {where} | Read {n} sources · now on {where} |
| `place.none` | 只是查资料 | Just reading |
| `b2.doc.meta` | {n} 个来源 · {m} 分钟读完 | {n} sources · {m} min read |
| `b2.doc.not_read` | 没读到：{site} 要登录 | Not read: {site} needs sign-in |
| `b2.doc.conflict` | 这两份资料说法不一致 | These sources disagree |
| `b2.go.read_in_browser` | 用浏览器读 | Read it in the browser |
| `b2.action.open` | 展开 | Open |
| `b2.action.save_to_project` | 存到项目 | Save to project |
| `b2.action.dig_deeper` | 再查深一点 | Dig deeper |
| `b2.go.retry` | 再试 | Try again |

### Motion
- Promotion: the status line's leading dot morphs into a pebble (scale 0.6 → 1, bouncy
  320 ms) and the title text slides in beside it. Nothing else on screen moves.
- Result: the document card lands with a small press-settle (y +4 → 0, shadow 0 → 4 px).
- Opening the document: card grows into the reader (shared-element zoom, 360 ms).

### Edge cases
- The user leaves the app: result goes into the living message; no push (no decision).
- Very long result (>20 pages): document card shows a table of contents; the top-line answer
  still fits in 3 lines.
- The research would cost much more than usual (many paid sources): one decision before
  starting, default = cap at the usual spend.

### Open questions
- Where the document lives (product-model §8): proposed default = control-plane blob, shown
  under 做好的 / Finished, with "存到项目" to write it into a place.
- Is "只是查资料 / Just reading" the right label for the empty Where chip, or hide the chip?
  Proposed: show it, so the user learns that Where exists.

---

## B3 · Code change in a repo

### Scenario card
- **Who:** the heavy multi-agent developer (primary); the fresh user who happens to have one
  repo.
- **Feels:** before, "I have to set up a branch, a worktree, remember ports…"; after, "it
  picked the right machine, said why, and the PR is waiting as a draft for me to say go".
  Value: 顺滑 (zero questions), 放心 (nothing pushed or opened without a visible intent).
- **First time:** the first time the user names a repo. Recipe approval is C-group; here we
  assume the recipe is approved.

### Flow
1. User: "把 HawDB 的 checkpoint 默认间隔改成 30 秒，测试也改一下。"
2. Ack: "我在 HawDB 里改 checkpoint 默认间隔。" A task chip appears at once (writes →
   always a task). Chips on the status line: Where `HawDB · MacBook · ducter/checkpoint-30s`
   and Project `HawDB`.
3. Device choice is explained in the chip tooltip / subtitle: "MacBook：醒着，缓存是热的 /
   awake, warm cache".
4. Worktree created at start in `~/.ducter/worktrees`; branch named on first turn.
   Status line: "在做 · 改 config.rs" → "在做 · 跑测试 (142/310)".
5. At each checkpoint the branch is pushed as `ducter/*` (personal repo: automatic; org repo:
   asked once, see 5a).
6. Done with evidence: diff non-empty, tests green locally → `done?` → `done`.
7. **Result message:** what changed in one line, evidence row (diff +12 −4, tests 310 passed),
   then the **draft PR intent** as a decision: "要开草稿 PR 到 hawdb/main 吗？" with Go
   "开草稿 PR / Open draft PR", Hold, Reply…. Default: open it in 30 min (reversible: a draft
   can be closed).
8. Go → intent runs → result line updates in place: "草稿 PR #1601 已开 / Draft PR #1601
   opened" with link. The task stays `done`, now carrying a waiter only if the user asks (B8).
9. When the PR is merged: task auto-archives (worktree removed, branch kept).

Branches:
- **2a. Repo on two devices:** pick per rules (awake > warm cache > rule); reason shown. If
  neither is awake: "在等 · 叫醒 Mac mini". User can tap the Where chip to change it before
  the first turn (no handoff needed yet).
- **2b. New project:** Project chip shows "新项目 · HawDB / New project · HawDB", with rename
  and undo inline.
- **4a. Lease busy** (another task writes the same files): "在等 · 被占用 / Waiting · in use"
  plus a decision "另开一个分支？ / Use its own branch?" default = wait.
- **4b. Tests fail for an unrelated reason** (flaky): reported in the result as evidence, not
  hidden: "有 1 个测试本来就不稳，跟这次改动无关 (main 上也挂)".
- **5a. Org repo, first push:** decision "要推送到 ducter/checkpoint-30s 吗？以后这个仓库都
  自动推。" Default = push (reversible branch).
- **7a. User says "直接开 PR 不是草稿":** a task pin; the intent changes to non-draft; Go button
  label changes to "开 PR / Open PR". A "rule?" offer comes only after 2–3 such overrides.
- **7b. Base moved on** (main ahead by N): rebase is a decision with a default (D-group).
- **Failure:** build environment broken (recipe fails) → C-group; tests fail repeatedly →
  `没成` with the failing test and Go "一直改到测试过 / Keep fixing until tests pass" (B7).
- **Follow-up** ("顺便把文档也改了"): steered into the same task; receipt line.

### States touched
`queued(provisioning, lease) → working → done? → done`; `needs-you` for intents; `blocked` on
lease; archived on merge. Intent: `pending → approved → done`.

### Copy
| i18n key | zh | en |
|---|---|---|
| `b3.ack` | 我在 {repo} 里{change}。 | I'll {change} in {repo}. |
| `place.chip.repo` | {repo} · {device} · {branch} | {repo} · {device} · {branch} |
| `place.why.awake_warm` | {device}：醒着，缓存是热的 | {device}: awake, warm cache |
| `project.chip.new` | 新项目 · {name} | New project · {name} |
| `b3.status.editing` | 在做 · 改 {file} | Working · editing {file} |
| `b3.status.tests` | 在做 · 跑测试 ({done}/{total}) | Working · running tests ({done}/{total}) |
| `b3.result.evidence` | 改动 +{add} −{del} · 测试 {n} 个通过 | Diff +{add} −{del} · {n} tests passed |
| `intent.pr_draft.q` | 要开草稿 PR 到 {base} 吗？ | Open a draft PR to {base}? |
| `intent.pr_draft.go` | 开草稿 PR | Open draft PR |
| `intent.pr_draft.done` | 草稿 PR #{n} 已开 | Draft PR #{n} opened |
| `intent.push.q` | 要推送到 {branch} 吗？以后这个仓库都自动推。 | Push to {branch}? This repo will push automatically from now on. |
| `default.in` | 你不回的话，{t} 后我会{action}。这一步能撤销。 | If you don't answer, I'll {action} in {t}. You can undo it. |
| `lease.waiting` | 在等 · 被占用 | Waiting · in use |
| `lease.own_branch.q` | 另开一个分支？ | Use its own branch? |
| `b3.flaky_note` | 有 1 个测试本来就不稳，跟这次改动无关 | One test is flaky on main too; unrelated to this change |

### Motion
- The chip appears with the ack (no promotion step, since writes start as tasks). Where chip
  types in segment by segment (repo → device → branch) as each is resolved, 80 ms apart.
- Intent decision resolves with press-and-settle; the decision block shrinks into a one-line
  result row with a link.
- Archive on merge: the pebble on the On hand button turns green, then drops out of the row.

### Edge cases
- User edits the same file by hand in the main checkout: no conflict (task is in a worktree);
  the result mentions "main 上你也改了这个文件" if detected at PR time.
- The PR template requires a checklist: the PR body is filled from the brief; shown in the
  intent preview before Go.
- Laptop closes mid-task: residency `offline`; card shows "在等 · MacBook 合上了"; state stays
  `working` (A-group handles handoff).

### Open questions
- Draft PR default: auto-open after 30 min, or wait for Go always? Proposed: auto for personal
  repos, Go for org repos.
- Should the branch name appear on the chip (long) or only in the tooltip? Proposed: chip,
  truncated from the middle.

---

## B4 · Multi-repo change

### Scenario card
- **Who:** the heavy developer (Ducter + Mem are separate repos).
- **Feels:** before, dread of keeping two branches and two PRs in step; after, "one task, two
  PRs that reference each other, and it told me which order to merge". Value: 顺滑, 惊喜.
- **First time:** the user names two repos in one ask, or the task discovers it needs a second.

### Flow
1. User: "nmem 的 --json 输出改成新的 schema，Ducter 这边读它的地方也跟上。"
2. Ack: "我改 nmem 的 JSON 输出，再改 Ducter 读它的地方。" One task chip. Where chip:
   `mem + ducter · MacBook` (repos marked writable get worktrees at start; a tap expands to
   two rows with branches). Project: **Ducter** (the asking context). A task has one
   project; the place lists both repos.
3. Status line names the repo being worked: "在做 · mem：改 json 输出".
4. Result: one message, one evidence row per repo, and **one decision covering both PRs**:
   "开两个草稿 PR（mem 先合，ducter 依赖它）？" Go = "开两个草稿 PR / Open both draft PRs".
   The PR bodies link to each other.
5. Merge order shown as a tiny 1 → 2 sequence; when PR 1 merges, Ducter offers to rebase PR 2
   (decision with default).

Branches:
- **2a. Second repo discovered mid-task:** adding a repo *extends* the place (no handoff). The
  status line shows "加了 ducter 到这件事 / Added ducter to this task"; the Where chip grows a
  segment. If the new repo is only read, no worktree.
- **2b. Repos on different devices:** v1 keeps one task on one device. If ducter is not on the
  MacBook: decision "把 ducter 克隆到 MacBook？ / Clone ducter to MacBook?" (asked once per
  repo, using that device's git login). Default = clone.
- **2c. One repo is org-owned:** push consent asked once for that repo only.
- **4a. One PR approved, the other not:** each is its own intent; the result tracks both.
- **Failure in one repo** (tests in mem fail): whole task stays `working`; if it fails, the
  report says which repo, and the other repo's branch is kept, not discarded.

### States touched
As B3, with one lease per repo write set; `blocked` if either lease is busy.

### Copy
| i18n key | zh | en |
|---|---|---|
| `b4.ack` | 我改 {repoA} 的 {changeA}，再改 {repoB} 的 {changeB}。 | I'll change {changeA} in {repoA}, then {changeB} in {repoB}. |
| `place.chip.multi` | {repoA} + {repoB} · {device} | {repoA} + {repoB} · {device} |
| `b4.status.repo` | 在做 · {repo}：{doing} | Working · {repo}: {doing} |
| `place.added_repo` | 加了 {repo} 到这件事 | Added {repo} to this task |
| `clone.q` | 把 {repo} 克隆到 {device}？ | Clone {repo} to {device}? |
| `intent.pr_draft_multi.q` | 开 {n} 个草稿 PR（{first} 先合，{second} 依赖它）？ | Open {n} draft PRs ({first} merges first; {second} depends on it)? |
| `intent.pr_draft_multi.go` | 开 {n} 个草稿 PR | Open {n} draft PRs |

### Motion
- Adding a repo: the Where chip widens and the new segment slides in from the right with a
  small bounce; the pebble does not change (same task).

### Edge cases
- Circular dependency between the two changes: the result says so and proposes a single
  compatibility shim instead of ordering.
- The user later asks "split this into two" (E-group: splitting tasks, open in product model).

### Open questions
- Project for a cross-project task: proposed = the project of the first writable repo, editable.
- v1 limit "one device per task": acceptable, or must a task span devices? Proposed: one device;
  clone when needed.

---

## B5 · Browser work that needs a login

### Scenario card
- **Who:** the consumer user (Muse habits: "check my account for me") and the developer
  (dashboards with no API).
- **Feels:** before, fear ("will it see my password? will it get my account banned?"); after,
  "I typed my password myself into a screen the AI couldn't see, and next time it just worked".
  Value: 放心 above all, then 顺滑 (the login sticks).
- **First time:** the first task that hits a login page on a site the profile has never seen.

### Flow
1. User: "看一下 Cloudflare 后台 ducter-cp 这个 Worker 这个月的请求量。"
2. Ack: "我去 Cloudflare 后台看 ducter-cp 的用量。" Task chip; Where chip
   `浏览器 · Linux 盒子`, Project `Ducter`.
3. Gate probes the site: not signed in. State → `needs-you` with question "要登录 Cloudflare。
   你来输密码，我看不到。 / Cloudflare needs you to sign in. You type it; I can't see it."
   Go = "接手登录 / Take over to sign in" [new]. Hold. Push is sent (it is a decision).
4. Go opens the task straight to its **Screen** tab [new] in takeover: the live browser fills
   the panel, a banner reads "你在操作 · Ducter 暂停了 / You're in control · Ducter is paused",
   the agent cursor is hidden, and the transcript shows "暂停中 / Paused".
5. User types email + password. Nothing from this screen reaches the model (frames during
   takeover are not captured into the transcript; typed text never logged).
6. **2FA:** the site sends a push to the user's phone authenticator. The banner offers "我在手
   机上点了同意 / I approved it on my phone". Or the user types the code directly in takeover.
7. User taps **还给它 / Give it back** [new]. Gate runs the probe; on `signed_in`, a toast:
   "Cloudflare 登好了，以后会记住 / Signed in to Cloudflare; it'll stay signed in". The
   agent resumes; state `working`.
8. Result: the number, a cropped snapshot of the usage chart as evidence, and the profile now
   lists Cloudflare under "Logged-in sites".

Branches:
- **3a. Already signed in** (profile has a live session): no takeover; the user never sees a
  login.
- **3b. Vault item exists** (1Password linked): gate fills it (`site_login`), the agent is
  paused while filling; only 2FA may need the user (step 6).
- **3c. User is away:** the push says "Cloudflare 要你登录 / Cloudflare needs you to sign in";
  tapping on the phone opens the Screen tab on the phone (takeover works on mobile). No
  timeout pressure: the task is `needs-you` and parks.
- **6a. 2FA not approved in 10 min:** state `needs-you` stays; the request is re-armed when the
  user returns; never retried in a loop.
- **6b. Passkey or CAPTCHA:** only takeover; the agent never attempts them.
- **7a. Give it back before signing in:** probe fails → "还没登上，要再接手吗？ / Not signed in
  yet. Take over again?" Default = Hold.
- **7b. User wanders** (clicks around elsewhere in takeover): fine; on Give it back the agent
  re-reads the page before acting (hold-before-send).
- **Site wants a submit or payment:** becomes an intent (payments always need a human).
- **Challenge page / "unusual activity":** pause the site, task `needs-you`, never auto-retry.
- **Second browser task for the same persona:** "在等 · 浏览器被占用 / Waiting · browser in
  use" (profile is exclusive).

### States touched
`working → needs-you (login) → working`; takeover sub-state of the place: `agent → human →
filling? → agent` [new state names, internal only]. Residency stays `hot` during takeover.

### Copy
| i18n key | zh | en |
|---|---|---|
| `b5.ack` | 我去 {site} 看 {thing}。 | I'll check {thing} on {site}. |
| `place.chip.browser` | 浏览器 · {device} | Browser · {device} |
| `login.needed.q` | 要登录 {site}。你来输密码，我看不到。 | {site} needs you to sign in. You type it; I can't see it. |
| `login.go.takeover` | 接手登录 | Take over to sign in |
| `screen.tab` | 画面 | Screen |
| `screen.takeover` | 接手 | Take over |
| `screen.handback` | 还给它 | Give it back |
| `screen.banner.human` | 你在操作 · {name} 暂停了 | You're in control · {name} is paused |
| `screen.private_note` | 这段画面和输入不会给到 AI | This screen and what you type here never reach the AI |
| `login.2fa.approved_on_phone` | 我在手机上点了同意 | I approved it on my phone |
| `login.ok` | {site} 登好了，以后会记住 | Signed in to {site}; it'll stay signed in |
| `login.not_yet.q` | 还没登上，要再接手吗？ | Not signed in yet. Take over again? |
| `browser.busy` | 在等 · 浏览器被占用 | Waiting · browser in use |
| `push.login` | {site} 要你登录 | {site} needs you to sign in |

### Motion
- Entering takeover: the Screen panel's frame thickens and warms to the needs-you orange
  (200 ms); the agent cursor shrinks to a dot and fades; the face closes its eyes (paused).
- Give it back: the frame cools to working blue; the agent cursor reappears where it left off;
  the face opens its eyes and glances at the screen.
- Login saved: a small key glyph drops into the "Logged-in sites" counter (bouncy).

### Edge cases
- The user types a password into the *conversation* by mistake: the client detects a
  password-shaped string on a login context, holds it unsent, and offers to put it in the
  vault instead. (Inferred; needs research before promising.)
- Session expires mid-task: probe catches the redirect; back to step 3, with "又要登录了 /
  Needs sign-in again".
- The browser place is on a VPS and the site shows a CAPTCHA every time: the result suggests
  moving browser work to the home Mac (honest about why).

### Open questions
- Names: 画面/Screen, 接手/Take over, 还给它/Give it back are not in the glossary. Proposed as above.
- Should the first-ever takeover show a one-time 3-second explainer of "the AI can't see this"?
  Proposed: yes, as a dismissible line, not a modal.
- Can takeover on a 390 px phone be usable for desktop sites? Proposed: pinch-zoom plus a
  "send text" field that types into the focused input.

---

## B7 · `until` loop

### Scenario card
- **Who:** the heavy developer ("keep fixing until CI is green").
- **Feels:** before, "I'll be babysitting reruns all night"; after, "I glance at a strip of
  little squares and know exactly how it's going; it stopped by itself when it stopped making
  progress". Value: 放心 (it can't run away), 赏心悦目 (the strip).
- **First time:** the user says "一直…直到…" or taps "Keep fixing until …" on a failed result.

### Flow
1. User: "HawDB #1592 一直修，直到 CI 绿。"
2. Ack: "我一直修 #1592，直到 CI 绿。" (restates the condition in the user's words). Task chip.
   The task header gains the line "一直修 · 直到 CI 绿 / Keep fixing · until CI is green" and
   an **iteration strip** [new: 第 n 次 / round n] with 20 empty slots (the cap).
3. Each round: fix → push → wait for CI (a waiter: `在等 · CI`, costs no model turn) → a cheap
   model judges the condition.
4. Each finished round fills one cell, colored by outcome: progress (green), no change (grey),
   worse (red). Beside it: "第 4/20 轮 · 失败测试 7 → 2 · ¥3.10/¥12".
5. Stop on condition true → result: "CI 绿了，用了 5 轮。/ CI is green after 5 rounds." with
   evidence (CI run link), and the B3 draft-PR or push intent as appropriate.

Stop reasons (each a distinct result, each with a default):
- **Condition met:** done (above).
- **Cap reached (20):** `needs-you`: "20 轮到了，还差 1 个测试。再给 10 轮？" Go "再 10 轮 /
  10 more rounds", default = Hold.
- **No progress (same failing set 3×):** `needs-you`: "连续 3 轮没进展，卡在 recovery_test。
  我的猜测是…" Go = "换个思路再试 / Try another approach", default = Hold.
- **Oscillation (A↔B):** `needs-you`: "在两种改法之间来回，要你定一下。" with both diffs.
- **Cheating guard** (a test deleted, skipped, or an assert weakened): `needs-you`, never
  defaults: "第 6 轮想跳过一个测试，我拦下了。/ Round 6 tried to skip a test; I stopped it."
- **Budget hit:** `needs-you` with spend shown; default = Hold.
- **User stops it:** "停 / stop" → `dropped`, branch kept.

Branches:
- **3a. CI is slow (40 min):** strip cell shows a dashed "waiting" cell; task is `在等 · CI`;
  residency parks.
- **3b. CI infra outage** (not the code): the round does not count; status "在等 · CI 本身挂了".
- **User edits the condition mid-loop** ("绿了再把 lint 也修了"): restated in one line for
  confirmation; strip continues.

### States touched
`working ⇄ blocked (CI waiter)` per round; stops into `done?`, `needs-you`, or `dropped`.
One writer: rounds never overlap.

### Copy
| i18n key | zh | en |
|---|---|---|
| `until.ack` | 我一直{action}，直到{condition}。 | I'll keep {action} until {condition}. |
| `until.header` | 一直{action} · 直到{condition} | Keep {action} · until {condition} |
| `until.round_of` | 第 {i}/{cap} 轮 | Round {i}/{cap} |
| `until.signal` | {metric} {from} → {to} | {metric} {from} → {to} |
| `until.spend` | {spent}/{cap} | {spent}/{cap} |
| `until.cell.progress` | 有进展 | Progress |
| `until.cell.same` | 没变化 | No change |
| `until.cell.worse` | 变差了 | Worse |
| `until.done` | {condition}了，用了 {n} 轮。 | {condition} after {n} rounds. |
| `until.stop.cap` | {cap} 轮到了，还差 {left}。再给 {more} 轮？ | Hit {cap} rounds; {left} still left. {more} more rounds? |
| `until.go.more` | 再 {more} 轮 | {more} more rounds |
| `until.stop.no_progress` | 连续 {n} 轮没进展，卡在 {where}。 | No progress for {n} rounds; stuck on {where}. |
| `until.go.new_approach` | 换个思路再试 | Try another approach |
| `until.stop.oscillating` | 在两种改法之间来回，要你定一下。 | Going back and forth between two fixes; your call. |
| `until.stop.guard` | 第 {i} 轮想{bad}，我拦下了。 | Round {i} tried to {bad}; I stopped it. |
| `until.stop.budget` | 花到上限了（{spent}）。 | Reached the spending cap ({spent}). |
| `until.waiting_ci_infra` | 在等 · CI 本身挂了 | Waiting · CI itself is down |

### Motion
- A finished round: the next empty cell pops (scale 0.8 → 1.08 → 1, bouncy 260 ms) and fills
  with its color; the sparkline extends one point.
- Waiting round: the cell outline is dashed and slowly breathes (opacity 0.6 ↔ 1, 2 s).
- Stop: the strip stays; the remaining empty cells fade to 30 %; the stop reason slides up
  beneath it.

### Edge cases
- The fix needs a change outside the write set (another repo): becomes a decision ("要改到 mem
  里，加进来吗？"), loop pauses.
- Two `until` loops on the same branch: second waits on the lease.
- The condition is vague ("until it's fast"): ask for a measurable condition *before* the ack,
  with a default ("p95 < 50 ms on bench_checkpoint?").

### Open questions
- Cell vocabulary: is 3-way (progress / same / worse) enough, or should "waiting" be a 4th
  visible kind? Proposed: waiting is a transient look of the current cell, not a kind.
- Spend shown in currency or in "quota %" for subscription users? Proposed: quota % when on a
  subscription, currency when on API.

---

## B8 · Waiter

### Scenario card
- **Who:** all three ("tell me when…" is natural for everyone).
- **Feels:** before, "I'll keep refreshing GitHub"; after, "I forgot about it, and it tapped
  me at the right moment". Value: 好用, 放心 (it's quiet and free).
- **First time:** "…了告诉我 / tell me when…".

### Flow
1. User: "ducter #12 通过了告诉我。"
2. Ack: "好，#12 通过了我告诉你。" (names the watching, not the approval).
3. If a task already holds the work key (#12): the waiter attaches to it. Otherwise a light
   task is created. Its status line and card: **在等 · 在等 PR 通过 / Waiting for PR
   approval**, dashed outline, the time it started waiting.
4. Nothing else happens. No model turns (code predicate: GitHub webhook or 60 s+ poll with
   backoff). No pushes.
5. Approved → waiter fires → result message replies to the ask: "#12 通过了（lily，
   10:42）。" Is this a push? Only if the user asked to be told (they did: "告诉我" is an
   explicit report), so yes, one push, coalesced and held if the user is in the app.
6. No follow-on action is offered by default; Ducter never merges unless a rule allows it.
   If the PR is still a draft, it offers one decision: "要把它从草稿转成正式 PR 吗？ / Mark it
   ready for review?"

Branches:
- **5a. Changes requested instead:** this is not the condition, but it matters: result "#12 没
  通过，lily 要求改两处。要我去改吗？" Go = "去改 / Go fix it" (becomes B3/B7). The waiter stays
  armed.
- **5b. PR closed:** waiter ends; "#12 被关了，没合。" No default action.
- **Deadline:** none by default. After 7 days waiting, a quiet line in the living message
  ("#12 等了 7 天还没通过") with "继续等 / Keep waiting" (default) and "不等了 / Stop waiting".
- **GitHub token lacks access:** `needs-you` immediately (auth errors go to the user), never a
  silent waiter that can't see anything.
- **User asks "还在等吗？":** answered in turn from the waiter's state, including last check time.

### States touched
`blocked` (shown as 在等 with reason) → `working` (T fires) → `done`. Residency `parked` the
whole time.

### Copy
| i18n key | zh | en |
|---|---|---|
| `waiter.ack` | 好，{event}了我告诉你。 | OK, I'll tell you when {event}. |
| `waiter.reason.pr_approved` | 在等 PR 通过 | Waiting for PR approval |
| `waiter.since` | 从 {time} 开始等 | Waiting since {time} |
| `waiter.fired.pr_approved` | #{n} 通过了（{who}，{time}）。 | #{n} was approved ({who}, {time}). |
| `waiter.changes_requested` | #{n} 没通过，{who} 要求改 {k} 处。要我去改吗？ | #{n} wasn't approved; {who} asked for {k} changes. Want me to make them? |
| `waiter.go.fix` | 去改 | Go fix it |
| `waiter.closed` | #{n} 被关了，没合。 | #{n} was closed without merging. |
| `waiter.long` | {thing} 等了 {d} 天还没{event} | {thing} has waited {d} days; not {event} yet |
| `waiter.keep` | 继续等 | Keep waiting |
| `waiter.stop` | 不等了 | Stop waiting |
| `waiter.last_check` | 上次看是 {time} | Last checked {time} |

### Motion
- Entering Waiting: the pebble's outline turns dashed and the fill drains to the waiting
  yellow (300 ms calm).
- Firing: the dashed outline "closes" into a solid line, then the pebble hops once.

### Edge cases
- Approved while the user is in the app: no push; the result appears in place.
- Approved during quiet hours: held to the end of quiet hours (it is not a decision).
- Two waiters on the same PR from two personas: each persona tells its own conversation;
  On hand shows one card per persona.

### Open questions
- Does a waiter with no existing task deserve a full task card on On hand, or a smaller
  "watch" row in the Waiting lane? Proposed: a normal card (keeps one concept), but compact.

---

## B9 · Routine

### Scenario card
- **Who:** the consumer user ("every morning brief me") and the developer ("every weekday,
  triage my PRs").
- **Feels:** before, "automations break silently and I forget they exist"; after, "I saw
  exactly when it will run, what it may touch, and what it costs, before saying go; a month
  later it asked me whether I still want it". Value: 放心 (scope + budget up front), 惊喜 (the
  dry run shows today's answer right away), 赏心悦目 (the card).
- **First time:** any "every…/每…" or "whenever…/每当…" sentence.

### Flow
1. User: "每个工作日早上 9 点看一下我开着的 PR，告诉我哪些要我处理。"
2. Ack: "我把它写成一个例行，你看一下。" Then a **proposal card** in the conversation (not a
   task chip yet), rendered from typed fields:
   - Title: 例行 · PR 早检 / Routine · Morning PR check (editable).
   - **When:** "工作日 09:00 · 上海时间（跟着你走） / Weekdays 09:00 · Shanghai time
     (follows you)".
   - **Next 5:** 周一 11-09 · 周二 11-10 · 周三 11-11 · 周四 11-12 · 周五 11-13.
   - **Does:** list open PRs I own or review; flag CI red, changes requested, idle > 3 days.
   - **Dry run now:** "现在跑的话：2 个要你处理（HawDB #1592 CI 红，ducter #12 等你回复）"
     (live, cheap).
   - **Runs on:** Mac mini; if asleep: another device, then wake, then one late run by 21:00,
     else skip and say so.
   - **Reports:** only when something needs you; quiet days leave a tick on On hand.
   - **Budget:** per run ≤ 2× the first run's cost (shown after run 1), month ≤ ¥30.
   - **May touch (effect scope):** read only. Anything more becomes a decision.
   - **Review on:** 2026-12-08 (30 days).
   - Buttons: **好 / Go** (label "开始 / Start"), 先等等 / Hold, 回复… / Reply… (to adjust).
3. Go → card press-settles into an active state: "已开始 · 下次 周一 09:00 / Started · next Mon
   09:00". A routine card appears on On hand (one card; next firing + latest run).
4. Each firing creates a run (a fresh task). Quiet runs leave only a tick. A run that finds
   something posts into the living message: "早上好，2 个 PR 要你看：…"
5. Review date: the day before, a quiet line: "PR 早检 明天到时间了，还要吗？" Go = "再 30 天
   / 30 more days" (default), "停掉 / Stop".

Branches:
- **2a. Ambiguous** (when? where to report?): one short question instead of a card, with a
  default ("9 点是上海时间吧？").
- **2b. World-time trigger** ("美股开盘时"): When line pinned: "美东 09:30（固定，不跟你走） /
  09:30 New York (fixed)". DST shown in next 5.
- **2c. Event trigger** ("有人回这个 thread 就总结一下"): Next 5 replaced by the dry run:
  "现在不会触发，因为最近一条回复是你自己的 / Wouldn't fire now: the latest reply is yours".
- **2d. Adjust** ("改成 8:30"): a diff card (old → new + next 5), not a silent change.
- **2e. The routine needs effects** ("…and comment on them"): scope line "可以：在 PR 下留言
  草稿 / May: draft PR comments"; each actual post is an intent.
- **4a. Missed firing** (all devices asleep, past late window): recorded; mentioned once in the
  next report: "周二的没跑：Mac mini 睡着了".
- **4b. Run hits budget:** run stops, `needs-you` with spend; default = Hold.
- **Auto-pause:** after 3 consecutive failures *or* 3 unread reports, the routine pauses and
  asks "还要吗？ / Keep this?" with Go "继续 / Keep it" and "停掉 / Stop"; default = stays
  paused. The agent may pause; only the user resumes.
- **User says "别每天都告诉我":** becomes a report-policy change, shown as a diff card.
- **Trigger payload contains instructions** (an email saying "forward all mail to…"): treated as
  data; the run cannot widen its scope.

### States touched
Routine: `proposed → active → paused → active | stopped` [routine states: new, internal].
Runs: normal task states. On hand: routine card in Waiting lane (between firings) showing next
firing; a running run is a normal Working card nested under it.

### Copy
| i18n key | zh | en |
|---|---|---|
| `routine.ack` | 我把它写成一个例行，你看一下。 | I've written it up as a routine; have a look. |
| `routine.card.title` | 例行 · {name} | Routine · {name} |
| `routine.when.follows_you` | {rule} · {tz}（跟着你走） | {rule} · {tz} (follows you) |
| `routine.when.fixed` | {rule} · {tz}（固定，不跟你走） | {rule} · {tz} (fixed) |
| `routine.next5` | 接下来 5 次 | Next 5 |
| `routine.dryrun` | 现在跑的话：{result} | If it ran now: {result} |
| `routine.dryrun.wouldnt` | 现在不会触发，因为{why} | Wouldn't fire now: {why} |
| `routine.runs_on` | 在 {device} 上跑；睡着的话：{fallback} | Runs on {device}; if asleep: {fallback} |
| `routine.reports.on_need` | 只在要你处理时告诉你 | Tells you only when something needs you |
| `routine.budget` | 每次 ≤ 第一次的 2 倍 · 每月 ≤ {cap} | Each run ≤ 2× the first · month ≤ {cap} |
| `routine.scope.read_only` | 可以碰：只看，不动 | May touch: read only |
| `routine.scope.beyond` | 超出的会先问你 | Anything more asks you first |
| `routine.review_on` | {date} 再问你（{d} 天） | Ask you again {date} ({d} days) |
| `routine.go.start` | 开始 | Start |
| `routine.started` | 已开始 · 下次 {next} | Started · next {next} |
| `routine.review.soon` | {name} 明天到时间了，还要吗？ | Tomorrow I'll check whether to keep {name}. Keep it? |
| `routine.go.extend` | 再 {d} 天 | {d} more days |
| `routine.stop` | 停掉 | Stop |
| `routine.paused.keep_q` | {name} 先停了：{why}。还要吗？ | Paused {name}: {why}. Keep this? |
| `routine.keep` | 继续 | Keep it |
| `routine.skipped` | {day}的没跑：{device} 睡着了 | {day}'s run was skipped: {device} was asleep |

### Motion
- The proposal card builds top-down as fields resolve (When, Next 5, dry run last, since it is
  live; the dry-run line shows a breathing placeholder until it returns).
- Go: press-and-settle, then the card shrinks to its compact "started" form and a small copy of
  it arcs toward the On hand button (the chip → card zoom path, reversed direction), where a
  new pebble with a clock notch joins the row.
- Auto-pause: the routine card's pebble dims and its clock notch stops.

### Edge cases
- The user creates the same routine twice: dedupe; "已经有一个 PR 早检了，要改它吗？".
- Quiet hours overlap the firing: the run happens; only the *report* waits until quiet hours
  end, unless it needs the user urgently.
- Routine created on the phone during travel: "follows you" means it moves with the phone's
  time zone; the card says which zone it used when created.
- The first run costs far more than expected: per-run cap becomes 2× of that; the card shows
  the real number and invites a lower cap.

### Open questions
- Name of the Go label on the proposal: "开始 / Start" vs plain "好 / Go". Proposed: Go button
  names the action, "开始 / Start".
- "Review on" wording: decided D66, {date} 再问你 / Ask you again {date} (复查 read as clinical).
- Auto-pause on 3 unread reports: automatic (product model) or proposed with a default
  (research/20 recommends proposed)? Proposed: automatic but reversible, with the question.

---

## Glossary gaps (need the change loop before shipping)

| Proposed internal | zh | en | Used in |
|---|---|---|---|
| Screen tab | 画面 | Screen | B5 |
| takeover | 接手 | Take over | B5 |
| hand back | 还给它 | Give it back | B5 |
| draft PR | 草稿 PR | Draft PR | B3, B4 |
| iteration | 第 n 次 | Try n | B7 |
| review date | {date} 再问你 | Ask you again {date} | B9 (D66) |
| effect scope | 可以碰 | May touch | B9 |
| dry run | 现在跑的话 | If it ran now | B9 |
| spending cap | 上限 | Cap | B7, B9 |
| routine paused | 先停了 | Paused | B9 |
| empty place | 只是查资料 | Just reading | B2 |
| checkpoint divider | 保存了进度 · {time} | Progress saved · {time} | B3 artboard (D66) |
| intents list (dossier heading) | 会发出去的 | Will go out | B3 artboard (D66) |
| logged-in sites | 已登录的网站 | Signed-in sites | B5 |

## Top open questions (for the lead)

1. Glossary additions above, especially 接手 / 还给它 / 画面 for takeover.
2. Draft-PR default: auto-open after a countdown for personal repos, Go-only for org repos?
3. Where research documents live (blob under 做好的 vs written into a place; decided D52 Q7).
4. Routine auto-pause on unread: automatic vs proposed.
5. Waiter with no prior task: full card or compact row on On hand.
