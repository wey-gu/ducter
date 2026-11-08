# Flows E (Steering) and C (Places & projects)

> Draft 1 · 2026-11-08 · **Status: drafted, not reviewed by the user.** Proposes flows, copy and
> motion for scenarios E1–E5 and C1–C6 (`scenarios.md`). Nothing here is decided until it goes
> through the change loop. Sources: `product-model.md` §2–3, principles 8–14,
> `focus-window.md`, `focus-window-states.md`, `conversation.md`, `ui.md`, `research/19`.
> Artboards: scratchpad `flows/project/E*.dc.html`, `C*.dc.html` (listed at the end).

**Conventions**
- *States* use internal names (`working`, `blocked`, …); the card shows the glossary word.
- *Copy* uses glossary words only. A word marked **†** is not in the glossary yet; all of them
  are collected in "Glossary gaps" at the end and need the change loop before build.
- Names in examples come from the author's real work: HawDB, ducter, tuwa.
- North-star check per scenario: 好用 easy · 顺滑 smooth · 赏心悦目 delightful · 放心
  trustworthy · 惊喜 surprising.

---

## E1 · A follow-up in the conversation vs. talking inside the task

### Scenario card
| | |
|---|---|
| **Who** | All three. The developer types inside an opened task when deep in it; the consumer and the fresh user only ever talk in the conversation and must never need to know which "place" they are talking to |
| **Feels before → after** | "Did it hear me? Will it mix this up with the other thing?" → "It got it, and it said exactly where it went and when it takes effect" |
| **Emotional value** | 放心: every message gets a receipt that names the task and the moment it applies. No message is ever silently lost or silently applied to the wrong task |
| **First time** | The first follow-up while a task runs. No setup. The receipt itself teaches the model: "passed to «Fix CI»" — the user learns tasks exist by seeing one named |

### Flow
1. **In the conversation** the user writes a follow-up ("CI 那个别动 release 流程").
2. The partner resolves the target (deterministic first, judgment second):
   1. explicit reference (task name, PR, repo, a reply-quote on a task chip) → that task;
   2. one active task whose brief/place matches → that task;
   3. several plausible → ask one line with a default (the most recently mentioned):
      "是说「修 CI」吗？" `Go` / pick the other / `Reply…`. Default applies after 2 min
      only because routing is reversible (it can be re-routed with no effect done yet).
   4. none → the partner treats it as a new ask (B-flows) or answers in turn.
3. The partner decides **steer vs. queue**:
   - **Steer** when it changes what the task is doing *now* (a constraint, a correction, a
     stop on a path). Delivered at the next tool boundary if the adapter declares mid-turn
     input; otherwise at the end of the current turn. Receipt says which.
   - **Queue** when it is for later (a next step, a nice-to-have). Appended to the brief as a
     verbatim amendment; the task reads it when the current step ends.
   - **Answer itself** when the partner can answer from the Log (principle 8: the cost
     ladder). Nothing reaches the task.
4. **Receipt** appears as a small line under the user's bubble, then the task chip pulses once.
5. The task's next report (or the living message) confirms the effect in words ("没碰 release
   流程").
6. **Inside an opened task** the user types in the task composer. That message goes to the
   task directly (principle 8). The partner does not relay it, but it is in the Log, so the
   partner knows it without waking anyone. A receipt appears in the task transcript only.
7. If the in-task message changes the scope or the done-criteria, the task says so in its next
   report, and the partner reflects it in the conversation as one line ("你在「修 CI」里说了
   不碰 release，记下了"), so the conversation stays the full story.

**Who hears what**

| Said where | Partner | That task | Other tasks | Shows up in the conversation |
|---|---|---|---|---|
| Conversation, about a task | yes, routes it | steered or queued | no | user bubble + receipt |
| Conversation, partner can answer | yes, answers | no | no | answer |
| Inside the task | reads it from the Log (no wake) | yes, directly | no | only if it changes scope (one line) |
| Inside the task, mentions another task | reads it | yes | no; the partner offers to pass it on | one line with `Go` |

### States touched
`working` (stays), `needs-you → working` when the follow-up answers the open question,
`done → working` when the follow-up reopens. Residency `warm/parked → hot` on delivery.

### Copy
| Key | zh | en |
|---|---|---|
| `steer.receipt.now` | 已转给「{task}」，马上用上 | Passed to "{task}", applies now |
| `steer.receipt.next_step` | 已转给「{task}」，这一步做完就用上 | Passed to "{task}", applies after this step |
| `steer.receipt.queued` | 记下了，「{task}」做到那儿再办 | Noted. "{task}" will get to it |
| `steer.receipt.answered` | 这个我直接答了，没打扰「{task}」 | I answered this myself; "{task}" wasn't interrupted |
| `steer.which_task` | 是说「{a}」还是「{b}」？ | Do you mean "{a}" or "{b}"? |
| `steer.which_task.default` | 不回的话按「{a}」 | If you don't reply: "{a}" |
| `steer.reroute` | 改给「{b}」 | Send to "{b}" instead |
| `steer.in_task.receipt` | 事收到了 | The task got it |
| `steer.in_task.mirror` | 你在「{task}」里说了：{quote}。记下了 | In "{task}" you said: {quote}. Noted |
| `steer.cross_task.offer` | 这条也跟「{other}」有关，转过去？ | This concerns "{other}" too. Pass it on? |

### Motion
- Receipt line fades up under the bubble (120 ms), then a thin dotted path draws from the
  bubble to the task chip, and the chip's pebble does one squash-and-settle (bouncy).
- Queued: the chip gets a small stacked-paper notch instead of a pulse.
- Reduced motion: the receipt appears; the chip outline flashes once.

### Edge cases
- The task is `parked` on a sleeping device: receipt says "MacBook 醒了就转过去 / Passes on
  when MacBook wakes"; the device is woken if the follow-up is a steer.
- The follow-up contradicts the brief's binding decision: the partner asks with a default
  ("改成这样？之前说的是 X"), never silently overrides.
- The task is `done?` (checking): treated as a reopen; verification is cancelled.
- The user sends three quick follow-ups: coalesced into one delivery with one receipt.
- The user re-routes after delivery: the wrong task gets a "ignore the last message" steer;
  the Log keeps both events.

### Open questions
- Should "answered myself" be visible at all, or silent? Proposal: visible, because it
  explains why the task chip didn't pulse.
- Mid-turn steer depends on adapter capability (Claude Code queue vs. Codex). Needs a
  capability row in `system.md`.

---

## E2 · Adding scope mid-way ("also do X")

### Scenario card
| | |
|---|---|
| **Who** | Mostly the developer ("顺便把 changelog 也更新了"); the consumer does it too ("also book the hotel") |
| **Feels before → after** | "Will this derail the thing that's almost done?" → "It slotted in where it belongs, and I can see the new finish line" |
| **Emotional value** | 顺滑 (no form, no new task unless needed) and 放心 (the done-criteria visibly grow) |
| **First time** | The first "also". The receipt shows "加进去了" plus the updated finish line on the card |

### Flow
1. User: "顺便把 changelog 也更新一下".
2. Target resolution as E1 step 2.
3. The partner classifies the addition:
   - **Same place, same finish line family** (same repo, same PR) → **extend** the brief:
     append a verbatim amendment and a new done-criterion. No question.
   - **Needs another repo** → extend the place ("adding a repo just extends the place",
     §3). The repo is added read or write; a writable addition gets its worktree on demand
     through the task's own `repo_checkout` tool.
   - **Different device, base branch, or replaces the repo** → that is a handoff (E3).
   - **Unrelated, or would roughly double the task** → a **new task**, linked as a sibling.
   - **Unclear** → one line with a default: "放进「修 CI」还是另开一件？" default: 另开
     (cheaper to merge later than to untangle, see E5).
4. If the task is `done` → it reopens (`done → working`), same task, same branch.
5. If the task is `done?` → verification stops; the new criterion is added; work resumes.
6. If a PR is already open → the change lands on the same branch; the PR description is
   updated by the task (no new intent needed unless the PR was already marked ready).
7. The card's finish line updates and the receipt says so.

### States touched
`working` (stays), `done → working`, `done? → working`, new task `queued` for the split-off
case. Lease may extend to new path globs (may hit C4).

### Copy
| Key | zh | en |
|---|---|---|
| `scope.added` | 加进「{task}」了 | Added to "{task}" |
| `scope.finish_line` | 现在算做完：{criteria} | Done now means: {criteria} |
| `scope.added_repo` | 「{task}」现在也会用到 {repo} | "{task}" will now use {repo} too |
| `scope.ask_fold_or_new` | 放进「{task}」，还是另开一件事？ | Add to "{task}", or start a new task? |
| `scope.ask.default_new` | 不回的话另开一件 | If you don't reply: a new task |
| `scope.new_sibling` | 另开了「{new}」，和「{task}」挨着 | Started "{new}", next to "{task}" |
| `scope.reopened` | 「{task}」重新做起来了 | "{task}" is back in progress |
| `scope.pr_updated` | 同一个 PR 里接着改 | Continuing in the same PR |

### Motion
- The card's finish-line row grows one line with a soft spring; the new criterion's checkbox
  pops in empty.
- New sibling: a second pebble splits off the first chip and rolls beside it (300 ms).

### Edge cases
- The addition conflicts with "out of scope" in the brief: ask with default (keep it out).
- The addition requires a path another task holds: C4 applies to the extension only; the
  rest of the task continues.
- The task is on a model whose budget the addition would exceed: the receipt says so and
  offers a switch (E3) rather than failing later.
- Additions to a routine's run go to the run, never silently to the routine template; the
  partner offers "以后每次都这样？" (rule).

### Open questions
- The "double the task" threshold: by estimated turns? Proposal: the partner's judgment, logged
  with reason, tuned from overrides.

---

## E3 · Switching model or harness, handoff, moving to another device

### Scenario card
| | |
|---|---|
| **Who** | Developer (taps the model chip, "这个换 Codex 做"); consumer when quota runs out or a device goes to sleep ("I'm closing my laptop") |
| **Feels before → after** | "Switching will lose everything it figured out" → "It picked up exactly where it was, on the new body, and told me why" |
| **Emotional value** | 放心 (nothing lost, nothing silent) and 惊喜 (closing the laptop doesn't stop the work) |
| **First time** | Usually forced: quota runs out mid-task. The partner posts one line with a default (wait vs. switch). Choosing is the lesson |

### Flow — switch from the task header chip
1. In an opened task, the user taps the model chip ("Codex · gpt-6 — 你的规则：后端重构").
2. A sheet opens:
   - **Why this one** (the `body_selected` reason, plain words).
   - **Candidates** (top 3 from `fw_candidates`) with one-line reasons: quota pace, warm
     cache, history, cost. Unavailable ones are shown greyed with the reason ("没登录 /
     Not signed in").
   - **Scope of the choice:** `只这件 / Just this task` (pin) or `以后这类都用 / For tasks
     like this` (rule, restated in one line for confirmation).
   - **What happens:** "从最近的检查点接着做，还在同一个副本里 / Continues from the latest
     checkpoint, in the same copy" — the handoff explained in one sentence.
3. `Go`. If the task is running:
   1. the current turn finishes or is cut at the next tool boundary;
   2. a fresh checkpoint is written (if the old body is healthy; otherwise the last one);
   3. a successor task is seeded from brief + checkpoint + Log on the **same environment**;
   4. the old task becomes `superseded`, pointing to the successor.
4. On the card nothing jumps: the same card continues with a new subtitle, and the dossier
   shows the chain ("接力：Codex → Claude").
5. If a rule was chosen, the confirmation line appears in the conversation too.

### Flow — switch from the conversation
- "这个换 Claude 做" → same as above without the sheet; the partner restates and does it.
- After 2–3 overrides in the same direction → "以后后端重构都用 Claude？" (rule proposal).

### Flow — forced (quota, failure)
1. Quota hits: the order is wait (reset soon) → another model in the same harness → another
   harness (`focus-window.md`).
2. If a pin or rule blocks the fallback: one line with a default, never silent.
3. Failure circuit breaker → handoff to a different body only if the failure looks
   body-specific; otherwise `failed` and a new task is offered.

### Flow — moving to another device
1. Trigger: user ("我要合电脑了"), device going offline past its limit, or the user picks
   another device in the Where chip.
2. Preconditions: the branch is pushed (`ducter/*`). Personal repos push at every checkpoint;
   org repos need the one-time ask. If not allowed yet → ask now: "要把分支推到 GitHub 才能
   换设备。推吗？" `Go`.
3. Source awake: backup commit → push → target recreates the worktree from the branch →
   reruns the recipe (C3) → successor continues. Old task `superseded`.
4. Source already asleep: honest choice with a default:
   "MacBook 睡着了，最后 2 步还没推上去。等它醒（默认），还是从上次推送的地方在 Linux 上接着做？"
5. The repo isn't on the target → clone ask (C1 step), once per repo.
6. Uncommitted work never moves except through the branch (research/19 §4 Q2). Said plainly.

### States touched
`working → superseded` (old), successor `queued → working`; `blocked` (quota wait);
residency `offline`, `provisioning` on the target; intents in flight carry over in the
checkpoint.

### Copy
| Key | zh | en |
|---|---|---|
| `body.why` | 为什么用它：{reason} | Why this one: {reason} |
| `body.candidates` | 也可以用 | Could also use |
| `body.unavailable.signed_out` | 没登录 | Not signed in |
| `body.unavailable.quota` | 额度 {time} 后恢复 | Quota back in {time} |
| `body.scope.pin` | 只这件 | Just this task |
| `body.scope.rule` | 以后这类都用 | For tasks like this |
| `body.rule.restate` | 规则：{kind} 都用 {model}。对吗？ | Rule: {kind} uses {model}. Right? |
| `body.handoff.explain` | 从最近的检查点接着做，还在同一个副本里 | Continues from the latest checkpoint, in the same copy |
| `body.handoff.go` | 换成 {model} | Switch to {model} |
| `task.continued_by` † | 已由 {model} 接着做 | Continued by {model} |
| `task.chain` † | 接力：{a} → {b} | Relay: {a} → {b} |
| `body.rule_blocked` | 你的规则说用 {a}，但它的额度 {time} 后才恢复。等着，还是先用 {b}？ | Your rule says {a}, but its quota is back in {time}. Wait, or use {b}? |
| `move.need_push` | 要把分支推到 {remote}，才能换到 {device} 上做。推吗？ | The branch needs pushing to {remote} to move to {device}. Push it? |
| `move.source_asleep` | {src} 睡着了，最后 {n} 步还没推上去。等它醒，还是从上次推送的地方在 {dst} 上接着做？ | {src} is asleep and the last {n} steps aren't pushed. Wait for it, or continue on {dst} from the last push? |
| `move.default_wait` | 不回的话等 {src} 醒 | If you don't reply: wait for {src} |
| `move.done` | 搬到 {dst} 上接着做了 | Now continuing on {dst} |

### Motion
- Sheet rises from the chip (the chip morphs into the sheet's header).
- On Go: the chip's harness glyph flips like a card (Codex → Claude), a checkpoint tick
  stamps the transcript, the card keeps its position. No reshuffle on On hand.
- Device move: the task pebble hops from one device chip to the other along an arc
  (playset/isles direction pending D43); reduced motion: cross-fade.

### Edge cases
- Switching while `needs-you`: the pending question carries over unchanged; its countdown
  doesn't reset.
- Switching mid-intent (a push in flight): the intent completes or is cancelled before the
  cut; the sheet says which.
- The old body is wedged and cannot checkpoint: use the last checkpoint and say how many
  steps are redone.
- The new harness can't resume the old session (always true across harnesses): fine by
  design (principle 13); the user is never told "reset".
- A pin conflicts with a project rule: the pin wins and the card subtitle says so.

### Open questions
- Is a same-harness model change (e.g. Claude Code `/model`) a handoff, or a setting change at
  a cut (principle 4)? Proposal: a cut inside the same task, not a successor, so no
  `superseded`. *Decided: D52 Q2, as proposed.*
- Shown words for handoff and superseded (†). Proposal: 接着做 / Continue, 接力 / Relay.
- Successor reuses the old card visually: does On hand show the chain, or only the dossier?
  Proposal: dossier only.

---

## E4 · Pause, cancel ("算了"), reopen days later

### Scenario card
| | |
|---|---|
| **Who** | Everyone. "算了" is the most natural sentence in the product; reopening a week later is common for developers (principle 10) |
| **Feels before → after** | Pause: "I need it to stop touching things right now" → "It stopped, and it'll wait." Cancel: "Did it actually stop? What did it leave behind?" → "Stopped; here is exactly what's left and I can undo." Reopen: "It's forgotten all of it" → "It picked up last week's work as if no time passed" |
| **Emotional value** | 放心 and 顺滑. Cancel is instant and undoable; reopen needs no re-explaining |
| **First time** | The first "算了". The receipt names the task, offers Undo, and lists leftovers only if any exist |

### Flow — pause
1. "先停一下" / tap 先停 † on the card.
2. The current turn is cut at the next tool boundary; a checkpoint is written.
3. Proposal: pause is a **waiter of kind `user`** — no new state. Attention `blocked`, shown as
   **在等 · 你说先停 / Waiting · you paused it**. Residency parks.
4. Lease: held for 2 h, then released so other tasks aren't blocked; re-taken on resume (may
   hit C4).
5. Countdown defaults on open questions are frozen while paused.
6. Resume: "接着做" or tap → the waiter fires → `working`.

### Flow — cancel ("算了")
1. Target resolution as E1 (the most recently mentioned active job if bare "算了").
2. The task becomes `dropped` immediately; the reason is the user's words.
3. In-flight intents are cancelled if not yet executed. Executed effects are listed.
4. Receipt with **Undo** for 10 s (in-conversation) and "接着做" afterwards from the card
   until archive.
5. Leftovers, only if any: "PR 草稿 #1601 还开着。要关掉吗？" default: 留着 (reversible either
   way, so no countdown pressure).
6. Archive after a grace period (24 h): leftover changes committed to the branch, worktree
   removed, branch kept.

### Flow — reopen days later
1. "上周那个修登录的，再加个测试".
2. Dedupe on the work key (branch, PR, task name) → the old task, not a new one.
3. `done → working` (same task). If residency is `archived`: rebuild from the branch, rerun
   the recipe, resume from brief + checkpoint. Shown as one status line, not a wall of setup.
4. If base moved: rebase decision (C5) before work starts, default rebase.
5. If the old task was `dropped` (terminal): a new task seeded from the old brief + last
   checkpoint, linked ("接着「修登录」/ Continues "Fix login""). The user sees it as the same
   work continuing.

### States touched
`working → blocked` (pause, waiter `user`), `blocked → working`; any non-terminal →
`dropped`; `done → working`; residency `parked`, `archived → provisioning`.

### Copy
| Key | zh | en |
|---|---|---|
| `task.pause` † | 先停 | Pause |
| `task.paused.reason` | 在等 · 你说先停 | Waiting · you paused it |
| `task.resume` | 接着做 | Continue |
| `task.dropped.receipt` | 「{task}」放下了 | Dropped "{task}" |
| `task.undo` | 撤销 | Undo |
| `task.dropped.leftover_pr` | PR 草稿 {pr} 还开着。要关掉吗？ | Draft PR {pr} is still open. Close it? |
| `task.dropped.leftover.default` | 不回的话留着 | If you don't reply: keep it |
| `task.dropped.effects_done` | 已经做了的：{effects} | Already done: {effects} |
| `task.reopen.receipt` | 接着上次的「{task}」做 | Picking up "{task}" where it left off |
| `task.reopen.rebuilding` | 正在 {device} 上把它摆回来 | Setting it back up on {device} |
| `task.continues_from` | 接着「{task}」 | Continues "{task}" |

### Motion
- Pause: the pebble stops wobbling and gets a dashed outline (Waiting style).
- Cancel: the pebble rolls off the chip row into a small tray and greys (Dropped); Undo rolls
  it back.
- Reopen: the archived pebble lifts out of the Done lane and re-colors to Working.

### Edge cases
- "算了" with several active tasks and no clear referent → ask with default: the last one
  mentioned.
- "算了" for something already `done`: nothing to stop; offer to revert the result if
  reversible.
- Pausing a routine run vs. the routine: "先停" on a run pauses the run; the routine itself
  needs "这个例行先停" (the agent may pause routines; only the user resumes).
- Reopen on a device that no longer has the repo: clone ask (C1).
- The branch was deleted upstream: rebuild from Ducter's private checkpoint refs if they
  still exist on any device; otherwise say what is lost.

### Open questions
- Should a dropped task be un-droppable within the grace period (violates "terminal")?
  Proposal: allow Undo within 10 s as a Log reversal; after that, reopen = new linked task.
- Pause as `blocked` + user waiter vs. a new `paused` state. Proposal: waiter (no new state).
- Lease release time for paused tasks (2 h proposed).

---

## E5 · Merging or splitting tasks (open question: proposed semantics)

### Scenario card
| | |
|---|---|
| **Who** | Developer, after the partner split work they think is one thing ("这俩其实是一件事"), or a task that grew too big ("把文档那部分拆出来") |
| **Feels before → after** | "Now I have to babysit two half-done things" → "It's one thing again, nothing lost" / "Two clean things, each with its own finish line" |
| **Emotional value** | 好用: the user describes the shape they want; Ducter rearranges the work |
| **First time** | Rare. Triggered by the user's words, or by the partner when two tasks touch the same files (C4) |

### Proposed semantics (compose existing primitives, no new state)
**Merge B into A** (A survives):
- Survivor: the one with more progress, or the one holding the write lease.
- A's brief gets an amendment quoting both original asks verbatim, plus B's latest
  checkpoint as "work already done elsewhere".
- **Log:** not merged. B becomes `superseded` → A. A's dossier links B's transcript; A pulls
  from it with read tools (principle 11).
- **Branches:** if B wrote, A is asked to bring B's commits in (cherry-pick or merge) as its
  first step; conflicts → a decision with a default. B's branch is kept until A's PR merges.
- **Leases:** B releases; A extends its path globs.
- **Different devices:** A's device wins; B's branch must be pushed (E3 preconditions).
- **Results and PRs:** move to A; B's PR is closed with a link to A's (an intent).

**Split part of A into C**:
- C's brief = the quoted part of the ask + relevant checkpoint excerpt. A's brief gets that
  part added to "out of scope".
- **Branches:** C branches from A's current checkpoint (`ducter/<slug>`), so neither waits.
- **Leases:** the write set is partitioned by path globs; overlap → C waits on A (C4) or the
  partner proposes a cleaner cut.
- **Log:** C is new; it links "拆自「A」/ Split from A".
- **PRs:** separate.

### Flow
1. User says it, or the partner proposes it (two tasks with overlapping write sets).
2. The partner restates the plan in one card: survivor, what moves, what happens to branches
   and PRs. `Go` / `Hold` / `Reply…`.
3. Go → the steps above run as ordinary events; the cards animate.

### States touched
B `→ superseded`; A stays; C `queued → working`. No new states.

### Copy
| Key | zh | en |
|---|---|---|
| `task.merge.propose` | 把「{b}」并进「{a}」？{b} 做过的会带过去 | Merge "{b}" into "{a}"? What {b} did comes along |
| `task.merge.branches` | {b} 的改动会先合到 {a} 的分支上 | {b}'s changes go onto {a}'s branch first |
| `task.merge.done` | 现在是一件事了：「{a}」 | It's one task now: "{a}" |
| `task.split.propose` | 把「{part}」拆成一件新事？ | Split "{part}" into a new task? |
| `task.split.done` | 拆出了「{c}」 | Split off "{c}" |
| `task.split_from` | 拆自「{a}」 | Split from "{a}" |
| `task.merged_into` † | 已并进「{a}」 | Merged into "{a}" |

### Motion
Merge: two pebbles roll together and become one slightly bigger pebble. Split: one pebble
pinches into two. Reduced motion: cross-fade.

### Edge cases
- Merging tasks of different personas: not allowed (conversations are isolated); offer to
  link personas first (F).
- Merging a task with a routine run: the run is absorbed; the routine is untouched.
- Splitting a task that has an open PR: C gets a new PR; A's PR description is updated.

### Open questions
- Is merge worth building in the first slice, or is "drop B, tell A about B" enough?
  Proposal: ship that cheap version first (it's E2 + E4), add true merge later.
- Survivor choice: user picks, or the partner picks with a reason? Proposal: partner picks,
  shown in the card.

---

## C1 · First mention of a new repo or path

### Scenario card
| | |
|---|---|
| **Who** | Developer ("看下 ~/dev/tuwa 启动为啥报错"); consumer naming a folder ("我桌面那个简历文件夹") |
| **Feels before → after** | "Do I have to set up a project first?" → "It just started, and it even named the project; I can fix the name in one tap" |
| **Emotional value** | 顺滑 (zero forms) + 惊喜 (it already knows the repo is on two devices) + 放心 (one-tap undo) |
| **First time** | This *is* the first time: the very first task about any repo |

### Flow
1. User mentions a repo by name, path, or URL.
2. Resolution: runners' discovered checkouts (by remote identity) → path on a device → a
   GitHub URL.
3. Cases:
   - **Found on one device** → use it.
   - **Found on several** → pick awake / warm cache / rule; the card says why
     ("在 MacBook 上，它醒着").
   - **Not on any device but a remote exists** → "没在你的设备上找到 tuwa。克隆到 MacBook
     上？" `Go` (asks once per repo; uses that device's own git login).
   - **Ambiguous name** (two repos called `web`) → ask with the most recent as default.
4. Project: no project contains this repo →
   - if it plausibly belongs to an existing project (same org, shared name prefix) → offer
     "放进 HawDB？" as the chip instead;
   - otherwise create a project implicitly, titled from the repo ("Tuwa").
5. The ack shows the task chip plus a **新项目 · Tuwa** chip with `改名` and `撤销`.
   - 改名: inline text field in the chip; Enter commits; every task with the label follows.
   - 撤销: the task becomes 随手 / Loose; the project is deleted (it had one task).
6. The chip quiets after the user's next message (it becomes a plain project label).
7. For org repos, the push question (E3) is asked at the first checkpoint, not now.

### States touched
Task `queued` (reason: machine waking / cloning) → `working`. Clone is a visible job line,
not a separate task.

### Copy
| Key | zh | en |
|---|---|---|
| `project.new_chip` | 新项目 · {name} | New project · {name} |
| `project.rename` | 改名 | Rename |
| `project.undo` | 撤销 | Undo |
| `project.undone` | 不放进项目了，先算随手 | No project; it's Loose for now |
| `project.suggest_existing` | 放进 {project}？ | Put it in {project}? |
| `place.device_reason.awake` | 在 {device} 上，它醒着 | On {device}; it's awake |
| `place.device_reason.warm` | 在 {device} 上，上次就在这儿做的 | On {device}; it worked there last time |
| `repo.clone_ask` | 没在你的设备上找到 {repo}。克隆到 {device} 上？ | {repo} isn't on your devices. Clone it to {device}? |
| `repo.cloning` | 正在克隆 {repo} 到 {device} | Cloning {repo} to {device} |
| `repo.which` | 是哪个 {name}？ | Which {name}? |

### Motion
- The new-project chip lands next to the task chip with a small bounce and a one-time
  sparkle on its left edge (惊喜, once per project ever).
- Rename: the chip widens into a field in place; on commit it re-settles and every visible
  chip with the old name ripples to the new one.
- Undo: the chip shrinks into the task chip's "随手" tag.

### Edge cases
- A path that's inside a repo (`~/dev/ducter/docs`) → repo `ducter`, scope narrowed to that
  path.
- A path to a non-git folder → C2.
- A private repo the device can't clone (no login) → "MacBook 上 git 没登录 GitHub" with a
  fix link (A-flows), task `queued`.
- The user renames the project to an existing project's name → offer to merge projects.
- Mentioning a repo the user deliberately keeps out ("别碰 work 仓库" rule) → refuse with the
  rule named.

### Open questions
- How long does the chip stay editable-looking? Proposal: until the next user message.
- Project title source: repo name vs. a nicer human title the partner writes. Proposal: repo
  name, capitalised; partner never invents.

---

## C2 · A non-git folder (draft copy, apply with one Go, mark trusted)

### Scenario card
| | |
|---|---|
| **Who** | Consumer and fresh user mostly ("把下载文件夹里的发票按月份整理"); developer for loose script dirs |
| **Feels before → after** | "What if it messes up my files?" → "I saw every change before it touched anything, and I can undo it" |
| **Emotional value** | 放心 above all; 赏心悦目 in a clear before/after list |
| **First time** | The first write task on a non-git folder. The card says, once, "改动先放在草稿副本里" |

### Flow
1. The task starts; the card's Where chip reads "~/Downloads/发票 · MacBook · 草稿副本".
2. Ducter makes a draft copy (APFS clone where possible, so it's instant and cheap).
3. The task works only in the copy. Reads of the original are allowed.
4. Done → the task reports `done?`; C checks the copy differs; the partner posts the **apply
   card**:
   - counts (moved 23, renamed 23, new 2 folders, deleted 0), each expandable to a file list;
   - a highlighted row for anything destructive (deletes, overwrites);
   - `应用 / Apply` (Go), `先等等 / Hold`, `回复… / Reply…`;
   - a checkbox: "以后这个文件夹直接改 / Edit this folder directly from now on" (mark trusted).
5. Apply → changes land; a snapshot of the touched originals is kept; "撤销 / Undo" stays on
   the result for 7 days.
6. Hold → the draft stays; the card waits in Needs you (no countdown: applying is not
   reversible by default policy, so no auto-apply).
7. **Trusted folder:** later tasks write in place; a snapshot of each touched file is still
   kept so writes stay reversible. The Where chip reads "直接改 / Edits directly".

### States touched
`working → done? → needs-you` (apply decision) `→ done`. Read-only tasks: no copy, no card.

### Copy
| Key | zh | en |
|---|---|---|
| `folder.draft.where` † | 草稿副本 | Draft copy |
| `folder.draft.explain` | 改动先放在草稿副本里，最后你说好了再应用 | Changes go to a draft copy; they apply when you say Go |
| `folder.apply.title` | 要把这些改动应用到 {folder} 吗？ | Apply these changes to {folder}? |
| `folder.apply.go` | 应用 | Apply |
| `folder.apply.counts` | 移动 {m} · 改名 {r} · 新建 {n} · 删除 {d} | Moved {m} · renamed {r} · new {n} · deleted {d} |
| `folder.apply.destructive` | 会覆盖 {n} 个文件 | Overwrites {n} files |
| `folder.trust` | 以后这个文件夹直接改 | Edit this folder directly from now on |
| `folder.trusted.where` † | 直接改 | Edits directly |
| `folder.applied` | 应用好了。7 天内可以撤销 | Applied. You can undo for 7 days |
| `folder.conflict` | 你这期间改过 {n} 个文件，这些先不动 | You changed {n} files meanwhile; those stay as you left them |

### Motion
- Apply: the file-list rows slide from the "copy" side into the folder icon in a short
  stagger (40 ms each, capped at 8 visible), then the card presses-and-settles to Done.
- Undo: rows slide back out.

### Edge cases
- The user edited originals meanwhile → per-file conflict; default: keep the user's version.
- The folder is huge (> disk budget for copies) → ask: copy only the files it will touch
  (default) or mark trusted.
- The folder is on an external drive that's unplugged at apply time → Waiting · reason.
- The folder becomes a git repo later → treated as a repo from then on.
- Trusted folder plus a destructive op (delete > 10 files) → still a decision (intent policy).

### Open questions
- Is "草稿副本 / Draft copy" plain enough for the fresh user? Alternatives: 副本 / A copy.
- Undo window (7 days proposed) vs. disk budget (C6).

---

## C3 · Recipe setup proposal and failure

### Scenario card
| | |
|---|---|
| **Who** | Developer (first write task on a repo). Consumer never sees commands unless they open it |
| **Feels before → after** | "Ugh, now I configure environments" → "It figured out the setup, proved it works, and asked me once" |
| **Emotional value** | 惊喜 (it already ran it) and 放心 (shown, proved, approved once) |
| **First time** | The first write task on any repo without a recipe |

### Flow — proposal
1. A write task on a repo with no recipe starts. A visible setup job runs first (status line:
   "先看看 HawDB 怎么跑起来").
2. It imports existing configs (`.conductor`, `.cursor/worktrees.json`, `.codex/…`,
   `.openhands/setup.sh`) as a starting point.
3. It writes setup / run / cleanup, `.worktreeinclude` files, port needs, exclusive
   resources, and **proves** them on a fresh copy (10-minute cap).
4. **Proposal card** (needs-you, but the main task already waits behind it):
   - title "HawDB 这样准备可以吗？";
   - plain-language steps first ("装依赖 · 起数据库 · 复制 .env"), commands collapsed;
   - proof: "在新副本上跑通了 · 2 分 10 秒";
   - needs: "占用端口 5432（一次一件事）";
   - a checkbox: "也提交到仓库里 / Also commit to the repo" (off by default, D26);
   - `好 / Go`, `先等等 / Hold`, `回复… / Reply…`.
   - Default if no reply in 10 min: **use it for this task only** (reversible), ask again
     next time.
5. Go → stored in Ducter for this repo; the task proceeds.

### Flow — failure
1. Setup fails or times out.
2. The task becomes `needs-you` with the reason in plain words and a default:
   "装依赖失败：需要 Node 22，MacBook 上是 Node 20。" Options:
   - `先不准备，直接做 / Continue without setup` (default, reversible);
   - `让它修 / Let it fix` (the setup job tries nvm/volta; it's within the repo scope);
   - `回复…`.
3. Never fails silently, never falls back silently (research/19 §5.5).
4. An approved recipe that later breaks (lockfile changed) → same decision, plus "更新准备
   方法 †".

### States touched
Setup job inside the task; task `queued` (reason: setup) → `needs-you` (proposal or failure)
→ `working`.

### Copy
| Key | zh | en |
|---|---|---|
| `recipe.job` | 先看看 {repo} 怎么跑起来 | Figuring out how to run {repo} |
| `recipe.propose.title` | {repo} 这样准备可以吗？ | Set up {repo} like this? |
| `recipe.word` † | 准备方法 | Setup |
| `recipe.proved` | 在新副本上跑通了 · {time} | Ran clean on a fresh copy · {time} |
| `recipe.imported` | 照着 {file} 改的 | Based on {file} |
| `recipe.exclusive` | 占用 {resource}（一次只给一件事用） | Uses {resource} (one task at a time) |
| `recipe.commit_offer` | 也提交到仓库里 | Also commit to the repo |
| `recipe.default` | 不回的话这次先这样用 | If you don't reply: use it for this task |
| `recipe.failed` | 准备失败：{reason} | Setup failed: {reason} |
| `recipe.skip` | 先不准备，直接做 | Continue without setup |
| `recipe.let_fix` | 让它修 | Let it fix |
| `recipe.show_commands` | 看命令 | Show commands |

### Motion
- The proof line ticks in like a checklist (each step gets a green check in sequence).
- Go: the card presses, folds into a small "准备好了" tag on the project chip.

### Edge cases
- Monorepo with several apps: recipe per app path; asked once per app actually used.
- The recipe needs secrets not in `.env` → the setup job never asks for them in chat; it
  hands off to the credential flow (G).
- Two tasks start on the same new repo at once: one setup job; the second waits on it.
- A read-only task never triggers a recipe.

### Open questions
- Shown name for Recipe (†). Proposal: 准备方法 / Setup.
- Should the proposal block the task, or let the task start in parallel without services?
  Proposal: block only if the brief needs to run/test; otherwise run in parallel.

---

## C4 · Busy lease or port clash

### Scenario card
| | |
|---|---|
| **Who** | Developer running parallel tasks on one repo |
| **Feels before → after** | "Two agents will trample each other / something will crash on port 5432" → "The second one is politely waiting, and I can see why" |
| **Emotional value** | 放心: nothing crashes, nothing collides; 顺滑: it resumes on its own |
| **First time** | The first time two tasks want the same files or the same database |

### Flow
1. Task B is about to start (or extend, E2) and its write set overlaps task A's lease, or its
   recipe needs an exclusive resource A holds.
2. **Files overlap:**
   - default: B shows **在等 · 被占用 / Waiting · in use**, with "「修 CI」在改
     `src/storage/*`";
   - offered: `自己开分支 / Use its own branch` (B branches from main and proceeds; merging
     later is a C5 rebase decision);
   - if A is done-resting, the lease is already free (invariant 4).
3. **Exclusive resource** (port 5432, Docker stack, iOS simulator): B waits on the lease;
   card: "在等 · 数据库被「修 CI」占着". No "own branch" option, since that doesn't help.
4. **Plain port block clash** (10-port blocks): never shown; C allocates another block.
5. When A releases → B's waiter fires → `working`. One line in the living message only if
   the user asked about B.
6. A is `needs-you` or paused for a long time while B waits → after 30 min the partner
   surfaces it: "「加索引」在等「修 CI」，而「修 CI」在等你" (attention aggregates).

### States touched
B `queued` with reason `lease` → `working`. B never `failed` because of a lease.

### Copy
| Key | zh | en |
|---|---|---|
| `lease.waiting` | 在等 · 被占用 | Waiting · in use |
| `lease.files_by` | 「{task}」在改 {paths} | "{task}" is changing {paths} |
| `lease.resource_by` | 在等 · {resource}被「{task}」占着 | Waiting · {resource} is used by "{task}" |
| `lease.own_branch` | 自己开分支 | Use its own branch |
| `lease.own_branch.note` | 之后合的时候可能要处理冲突 | May need conflicts sorted out when merging |
| `lease.chain_needs_you` | 「{b}」在等「{a}」，而「{a}」在等你 | "{b}" is waiting on "{a}", and "{a}" is waiting on you |

### Motion
B's pebble sits dashed behind A's on the Waiting lane with a thin tether to A; on release
the tether snaps loose and B rolls to Working.

### Edge cases
- Circular wait (A wants B's files): the later-queued task yields; the partner proposes a
  merge (E5).
- The holder is on a sleeping device: the lease stays (the work is real); the card says
  "MacBook 睡着".
- A stale lease (holder crashed, no heartbeat): C reclaims after the stall rule, logs it.
- Read-only tasks never wait.

### Open questions
- Path-glob granularity: per directory or per file? Proposal: the brief's declared globs.

---

## C5 · PR (draft intent), rebase decision, merge → auto-archive

### Scenario card
| | |
|---|---|
| **Who** | Developer |
| **Feels before → after** | "Now the babysitting starts: CI, rebase, review, cleanup" → "It opened a draft, kept it green, asked me only about the rebase, and tidied up when it merged" |
| **Emotional value** | 顺滑 (the tail of the work is handled) and 放心 (never merges without a rule) |
| **First time** | The first code task that finishes |

### Flow
1. Work done with evidence → the task proposes a PR as an **intent**:
   "要开 PR（草稿）到 hawdb/main". Under the default policy draft PRs to the user's own repo
   go ahead; org repos ask once per repo.
2. The PR exists → waiters on CI and review (code, no model turns). Card: **在等 · CI**.
3. CI red → the task fixes (`until` CI green, capped) or `needs-you` after the cap.
4. Base moved → **rebase decision**: "落后 main 23 个提交，先 rebase 再合吗？"
   `好，rebase` (default, reversible thanks to the pre-rebase checkpoint) / `先等等` /
   `回复…`. Countdown shown. Conflicts the task can't judge → `needs-you` with both sides.
5. Review comments → the task addresses them (steered in like E1), re-pushes.
6. Merge: the human merges, or a rule allows Ducter (shown on the card: "规则：绿了就合").
7. Merged → the task is `done` and **auto-archives** (worktree removed by its runner on next
   wake, branch kept). One success line: "PR #1601 合进去了，「修 CI」收好了".
8. Closed without merge → "PR 关掉了。这件也放下？" default: 放下.

### States touched
`working → blocked` (CI / review waiters) `→ needs-you` (rebase) `→ working → done`;
residency `→ archived`. Intents: open PR, (merge under rule), close PR.

### Copy
| Key | zh | en |
|---|---|---|
| `pr.intent.open` | 要开 PR（草稿）到 {repo}/{base} | Will open a draft PR to {repo}/{base} |
| `pr.waiting.ci` | 在等 CI | Waiting for CI |
| `pr.waiting.review` | 在等 PR 被批 | Waiting for PR approval |
| `pr.rebase.ask` | 落后 {base} {n} 个提交，先 rebase 再合吗？ | {n} commits behind {base}. Rebase first? |
| `pr.rebase.go` | 好，rebase | Rebase |
| `pr.rebase.default` | 不回的话 {time} 自动 rebase · 可撤销 | If you don't reply: rebase at {time} · undoable |
| `pr.merge.rule` | 规则：{rule} | Rule: {rule} |
| `pr.merged` | {pr} 合进去了，「{task}」收好了 | {pr} merged; "{task}" is put away |
| `pr.closed.ask` | PR 关掉了。这件也放下？ | The PR was closed. Drop this task too? |
| `pr.never_merge` | 不会自己合，等你来 | Won't merge on its own; that's yours |

### Motion
Merged: the card does the "nod" (face on done), then slides down into Done and dims to
archived after 1.5 s. Rebase Go: press-and-settle, a checkpoint tick appears on the strip.

### Edge cases
- Multi-repo task: linked PRs, one intent; merge in dependency order; archive only when all
  merged.
- The user pushes to the branch by hand: the task notices on next wake and rebases its
  checkpoint onto it, no force-push without a decision.
- Branch protection blocks even draft PRs: say so; propose a fork remote.
- The user merges days later while the device sleeps: archive happens on wake; the card
  shows done immediately.

### Open questions
- Should merged tasks show "收好了 / put away" or no line at all (silence means success)?
  Proposal: one compressed line in the living message.

---

## C6 · Low disk

### Scenario card
| | |
|---|---|
| **Who** | Developer with many parallel tasks (research/19 §3: 113 worktrees / 3 GB, 13.8 GB) |
| **Feels before → after** | "These tools fill my disk and never clean up — or they delete my work" → "It cleans what's safe on its own and asks before anything else" |
| **Emotional value** | 放心 in both directions |
| **First time** | Usually silent: the first automatic reclaim. The user only meets it as a decision when safe reclaim isn't enough |

### Flow
1. The runner reports per-task bytes and the reclaimable share.
2. **Automatic, silent:** regenerable dirs of done tasks after 12 h; archived worktrees.
3. Over budget after that → a decision in the living message:
   "MacBook 只剩 6 GB。删掉 3 件已放下的事留下的副本，能腾出 9 GB" `Go` / `先等等` /
   `看是哪些`. Never removes dirty work without a backup commit; never touches the user's
   own checkouts.
4. A task can't start because of disk → `queued`, **在等 · 磁盘不够 / Waiting · low disk**,
   offering another device if one has the repo.
5. Devices page shows "HawDB 在 Mac mini 上用了 14 GB，9 GB 可以腾出来".

### States touched
`queued` (reason disk); residency `parked → archived` for reclaimed tasks.

### Copy
| Key | zh | en |
|---|---|---|
| `disk.low.ask` | {device} 只剩 {free}。删掉 {n} 件已放下的事留下的副本，能腾出 {gain} | {device} has {free} left. Removing copies from {n} dropped tasks frees {gain} |
| `disk.show_which` | 看是哪些 | Show which |
| `disk.waiting` | 在等 · 磁盘不够 | Waiting · low disk |
| `disk.other_device` | 换到 {device} 上做？ | Do it on {device} instead? |
| `disk.usage` | {project} 在 {device} 上用了 {used}，{gain} 可以腾出来 | {project} uses {used} on {device}; {gain} can be freed |
| `disk.safe_note` | 没提交的改动会先存好，不会丢 | Uncommitted changes are saved first; nothing is lost |

### Motion
A small disk gauge on the decision card drains down as Go is pressed (the freed amount).

### Edge cases
- The disk is full mid-task (write fails) → the task pauses itself (E4 waiter) and the
  decision is posted; never `failed` for disk alone.
- The user's own `node_modules` etc. are out of scope; Ducter may only *say* they're big.

### Open questions
- Default disk budget per device (fraction of free space vs. fixed GB).

---

## Glossary gaps (need the change loop before build)

| Concept | Proposed shown (中 / EN) | Used in |
|---|---|---|
| handoff (successor) | 接着做 / Continue · 接力 / Relay | E3, E4 |
| superseded | 已由 {x} 接着做 / Continued by {x} | E3 |
| pause | 先停 / Pause (as Waiting reason, not a state) | E4 |
| merged task | 已并进 / Merged into | E5 |
| Recipe | 准备方法 / Setup | C3 |
| draft copy / trusted | 草稿副本 / Draft copy · 直接改 / Edits directly | C2 |

## Artboards (scratchpad `flows/project/`)

| File | Size | Shows |
|---|---|---|
| `ESwitchModel.dc.html` | desktop 1440×900 | Opened task, model chip open as a sheet: why, candidates, pin vs rule, handoff line |
| `CNewTaskPicker.dc.html` | desktop 1440×900 | On hand with + 新事 picker: project → repo/folder → device → base branch → model, each prefilled with a reason |
| `CNewProjectChip.dc.html` | phone 390×844 | First mention of tuwa: task chip + 新项目 · Tuwa with 改名 (editing) / 撤销 |
| `CDraftCopyApply.dc.html` | phone 390×844 | Non-git folder apply card with counts, file list, trust checkbox |
| `CRecipeProposal.dc.html` | phone 390×844 | Recipe proposal card with proof, exclusive port, commit offer, default |
