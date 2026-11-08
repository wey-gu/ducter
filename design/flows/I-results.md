# Flows I: Results (做好的 / Finished)

> Draft 1 · 2026-11-09 · Status: **drafted; its open questions were decided 2026-11-09 (D60, D61), words per D66**. Covers scenarios I1–I5
> (`product-model.md` §6 "I. Results"). Builds on principles 6, 7, 12, 18, 20,
> `conversation.md` (turn protocol, living message), `focus-window.md` (report, evidence),
> D4 in `D-decisions-attention.md` (done · checking, check didn't pass), B2/B3 in
> `B-kinds-of-work.md` (document card, draft PR intent), D52 Q7 (documents live in 做好的 on the
> control plane, with an optional "write it into a place"), and `G-safety.md` (outside
> effects, the day's record).
>
> Tags: **[doc]** already stated in a design note or decision; **[I]** this draft's proposal,
> not yet decided; **[ext]** outside evidence not yet in `research/`. Any [I] that adds a word,
> state, or object is repeated in "Proposed glossary additions" or "Open questions".
> Nothing here is a Dn decision.

## 0. Shared rules for all five scenarios

**What the user should feel.** A partner walking over and putting the finished thing on the
desk: "here it is, here's how I know it works, here's what I didn't do, nothing left your
machines". Not a log, not a recap of every step, not a victory lap.

**Rule 1. A result has one fixed anatomy** [I, refining principle 6 and B2/B3]. Every result
message, whoever did the work, is rendered in this order. Empty parts are left out, never
padded.

| # | Part | Rendered from | Rule |
|---|---|---|---|
| 1 | **Reply strip** | the ask, verbatim | Shown only when other messages came between the ask and the result |
| 2 | **Top line** | M, from the report summary | The outcome in the user's own terms, at most 2 lines. No "I'm happy to report", no step-by-step |
| 3 | **怎么知道的 / How I know** | `evidence[]` (typed) | Chips, machine-checked first: tests, CI, diff, commit, PR; then "I read it through"; then "you said so". M's own opinion is never a chip [doc D4] |
| 4 | **没包括 / Left out** | brief done-criteria vs report | Only when part of the ask was not done or was out of scope. One line each, with why |
| 5 | **发出去的 / Sent out** | the task's intents and the day's record (`G-safety.md` G5) | For every task that had a place: what left the user's devices. When nothing did, it says so ("发出去的：没有 / Sent out: nothing"). The empty line is the point |
| 6 | **Result card** | the `Result` object | When there is a durable thing: a document, a change, files, a capture |
| 7 | **One next step** | the report's questions or M | At most one: a decision with a default (e.g. open a draft PR) or a plain action (Open, Save to…) |

Why the empty "Sent out: nothing" line: in the first dogfood run (`apps/desktop/docs/live-
conversation-done.png`) the task wrote, unprompted, "没有 push，工作区是干净的 / nothing
pushed, the working tree is clean". Agents already know users care; Ducter should make it a
typed fact instead of prose the user has to hunt for [I, from one observation; thin].

**Rule 2. Words freeze, chips live** [I]. The message text never changes once sent
(principle 6; only the living message is revised, and only while unread). The chips on it
(state, evidence, outside, the result card's version) are live views of typed state and may
change: checking → done, a PR merged, a link turned off. If the *meaning* changes (a check
failed after "done"), that is a new message, never a quiet edit.

**Rule 3. Silence means success** [doc principle 7, D-group levels]. Done earns level 2 (a
message) at most, never a push.
- User in this conversation: a new message replying to the ask.
- User away: one done line in the living message (D2 order: Needs you · Went with the default
  · Stopped · Done).
- A routine run with nothing new: a tick on its On hand card, nothing in the conversation.
- Several tasks finishing within a few seconds of each other settle into **one** message
  (`research/16` settlement batch).

**Rule 4. A result outlives its task** [I]. Tasks archive and worktrees are reclaimed
(principle 10, D26). Results must stay openable:

| Result kind (internal `Result.kind`) | Example | Where it lives | Survives archive by |
|---|---|---|---|
| `answer` | "HawDB's default checkpoint interval is 60 s" | The message itself (the Log) | The Log is the truth [doc] |
| `document` | Bun 1.4 Linux compile pitfalls (B2) | Control-plane blob, versioned, Markdown [doc D52 Q7] | It never lived on a device |
| `change` | HawDB #1601 compaction fix | Git: branch `ducter/*` + PR; Ducter keeps a pointer **and a diff snapshot taken at done** | Snapshot blob, so the diff opens even after the branch is deleted |
| `files` | a cleaned-up `~/Notes/hawdb-bench/` folder | The place; Ducter keeps path + content hash, and a snapshot when small | Snapshot, or an honest "changed since" note |
| `capture` | Cloudflare usage chart screenshot (B5) | Control-plane blob | Blob |
| `app` | user-made apps | later (product-model §6) | — |

**Rule 5. Every result carries the ask, verbatim** [I]. The user's own words are what they
remember weeks later ("that Bun thing"), so the ask is stored on the Result, shown as a
subtitle in lists, and indexed for search (I4).

**Copy tone.** A peer handing over work: "改好了 / Done:", "我是这么确认的 / Here's how I
checked", "这次没包括 / Left out this time". Never "Task completed successfully", never
"As requested", never a percentage.

---

## I1 · Finished work comes back (the result message)

### 1. Scenario card

- **Who:** all three. Sharpest for the heavy developer with five tasks in flight, who has been
  burned by agents that say "done" and aren't. The consumer user needs the same honesty in
  plain words. The fresh user meets it after their very first task.
- **Feels before:** "Did it actually do it, or did it just say so? Now I have to go and check."
- **Feels after:** "It handed me the thing, showed me how it knows, told me what it skipped,
  and nothing left my machine." 放心 (evidence and the outside line), 好用 (no digging),
  赏心悦目 (a calm, short card instead of a wall of text).
- **First time:** the first task that finishes. No tutorial. The chips are labelled with
  what they literally are ("测试 310 个通过 / 310 tests passed"); tapping one opens the exact
  thing. The outside line reads "发出去的：没有 / Sent out: nothing" and needs no explanation.

### 2. Flow

Example from B3 (the author's HawDB): "把 HawDB 的 checkpoint 默认间隔改成 30 秒，测试也改一下。"

```
W reports done + evidence ──► C: task → 做完了 · 在检查 / Done · checking (done?)   [level 1: badge]
  │
  ├─ user is watching (this conversation focused, active in the last 2 min) AND
  │  the checks will take > 10 s (e.g. CI) [I]
  │     ──► M posts the result message now. State chip: "做完了 · 在检查".
  │         Evidence chips that C has not confirmed yet are drawn unfilled; each fills in
  │         as C confirms it.
  └─ otherwise ──► nothing yet (no message about an unverified claim)
  │
C checks refs mechanically ──► M judges against the brief's done-criteria   [doc D4]
  ├─ pass ──► 做完了 / Done
  │     ├─ no message posted yet:
  │     │     user in app ──► new result message replying to the ask (level 2)
  │     │     user away   ──► a done line in the living message (level 2), evidence chips on it
  │     └─ message already posted ──► its chips flip to done; the face nods; no new message
  ├─ fixable gap ──► back to 在做 / Working  [doc D4]
  │     └─ if a message was already posted: its state chip reads
  │        "检查没过：{reason}，它接着弄 / Check didn't pass: {reason}; it's back on it".
  │        When it is really done: a NEW message replying to the same ask, opening with
  │        "上次说做完了，检查时发现{reason}，现在补好了。/ I said it was done, but the check
  │        found {reason}. It's fixed now."
  └─ needs judgment ──► 等你 / Needs you "看着对吗？/ Does this look right?"  [doc D4]
  │
Next step (at most one): here, the draft PR intent from B3/C5 ──► see G1
```

The result message, as rendered (zh first, en below):

```
┌ 你：把 HawDB 的 checkpoint 默认间隔改成 30 秒，测试也改一下。          (reply strip, only if needed)
│
│ 改好了：默认间隔从 60 秒改成 30 秒，相关的 3 个测试也跟着改了。
│
│ 怎么知道的   [测试 310 个通过]  [改动 +12 −4 · 2 个文件]  [之前 2 个没过 → 之后都过了]
│ 这次没包括   文档里的旧数字没改（docs/ 不在这次的范围里）
│ 发出去的    没有 · 改动只在 ducter/checkpoint-30s 分支上，这台 MacBook 上
│
│ ┌ 改动 · HawDB ─────────────────────────────────────────┐
│ │ src/config.rs   +2 −2      tests/checkpoint.rs  +10 −2 │   (tap → diff at that file)
│ └───────────────────────────────────────────────────────┘
│ 要开草稿 PR 到 hawdb/main 吗？  这件不会自己动，等你定（组织仓库）
│ [开草稿 PR]  [先等等]  [回复…]
└ ● HawDB checkpoint 间隔 · 做完了
```

```
You: Change HawDB's default checkpoint interval to 30 s, and update the tests.

Done: the default interval is now 30 s (was 60 s), and the 3 related tests are updated.

How I know   [310 tests passed]  [+12 −4 · 2 files]  [2 failing before → all passing after]
Left out     The old number in the docs isn't changed (docs/ wasn't in scope)
Sent out     Nothing · changes stay on branch ducter/checkpoint-30s, on this MacBook
```

### 3. States

| Object | From → To | Actor | Trigger |
|---|---|---|---|
| Task | Working → Done · checking | W → C | report `done` with refs [doc] |
| Task | Done · checking → Done | C + M | refs pass, criteria met [doc] |
| Result message | (none) → posted | M | Done, user in app; or Done · checking while watching [I] |
| Result line in living message | (none) → shown | C | Done while the user is away [doc] |
| Result message chips | checking → done / check didn't pass | C | live view of task state [I] |
| Result | (none) → recorded | C | Done: a `result` Log event with kind, ask, refs, snapshot pointer [I] |
| Result | version n → n+1 | C | a follow-up changed it (I3) [I] |

New Log event (internal) [I]: `result {result_id, task_id, kind, title, ask_seq, ask_text,
refs[], snapshot?, version}`. The result message is rendered from it plus the report.

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `result.reply_strip` | 你：{ask} | You: {ask} |
| `result.top.done` | 改好了：{what} | Done: {what} |
| `result.how_i_know` | 怎么知道的 | How I know |
| `result.left_out` | 这次没包括 | Left out |
| `result.left_out.item` | {thing}（{why}） | {thing} ({why}) |
| `result.outside` | 发出去的 | Sent out |
| `result.outside.none` | 没有 | Nothing |
| `result.outside.none_repo` | 没有 · 改动只在 {branch} 分支上，这台 {device} 上 | Nothing · changes stay on branch {branch}, on {device} |
| `result.outside.list` | {effects} | {effects} |
| `result.checking_chip` | 做完了 · 在检查 | Done · checking |
| `result.check_failed_chip` | 检查没过：{reason}，它接着弄 | Check didn't pass: {reason}; it's back on it |
| `result.fixed_after_check` | 上次说做完了，检查时发现{reason}，现在补好了。 | I said it was done, but the check found {reason}. It's fixed now. |
| `result.batch_opening` | {n} 件刚做完： | {n} just finished: |
| `result.interpreted` | 我理解成了：{reading} | I took this to mean: {reading} |
| `result.new_below` | 新结果 ↓ | New result ↓ |
| `evidence.before_after` | 之前 {before} → 之后 {after} | {before} before → {after} after |
| `evidence.tests` | 测试 {n} 个通过 | {n} tests passed |
| `evidence.diff` | 改动 +{add} −{del} · {n} 个文件 | +{add} −{del} · {n} files |

Reused from D4/B3: `state.done`, `state.done_checking`, `done.check_failed`,
`evidence.ci`, `evidence.pr`, `evidence.read_through`, `evidence.result`, `intent.pr_draft.*`.

### 5. Motion

- **Arrival:** the message fades up 6 px (bouncy, 220 ms), as every partner message does. The
  result card lands last with a small press-settle (y +4 → 0, shadow 0 → 4 px, 260 ms). The
  face nods once, on Done only (never on checking).
- **Checking → done on a posted message:** unfilled evidence chips fill left to right (green
  rising from the bottom, 200 ms each, 60 ms stagger) as C confirms each; the state chip's
  pebble completes its green fill (D4 motion). No toast, no sound.
- **Check didn't pass:** the chip's green drains (300 ms) and the line cross-fades in. No red,
  no shake: it is not a failure.
- **Sent out line:** static. When something did go out, each effect shows the destination's
  small literal mark (GitHub, mail, X) with no animation; the motion for leaving belongs to G2.
- **Reduced motion:** cross-fades only; chips switch state without fills.

### 6. Edge cases

- **The user moved on to another topic:** the result still replies to its ask, with the reply
  strip. It never interrupts a reply the user is reading: if the user is scrolled up or
  typing, a "新结果 ↓ / New result ↓" pill appears instead of scrolling them.
- **Several tasks finish together** (e.g. the Monday dependency-bump routine plus a HawDB fix):
  one message opening with `result.batch_opening`, one block per task, each with its own
  How I know and Sent out lines.
- **The ask was ambiguous and the task chose a reading:** `result.interpreted` above How I
  know, with Reply… to redirect. Never buried in the body.
- **Partly done:** if the done-criteria are met but some of the ask was out of scope, the
  task is Done and Left out names the rest. If criteria are not met, it is not Done (D4).
- **Result of a dropped task:** suppressed unless it reveals something the user must know
  (`research/16`), such as an effect that already happened, which is then shown with its
  Sent out line.
- **Very long output** (a 300-line test log): never pasted into the message. A chip opens the
  excerpt (I2).
- **The evidence is only "I read it through"** (writing, research): the How I know row says
  so, and nothing pretends to be machine-checked [doc D4].
- **Two devices:** the message is the same everywhere; chips update everywhere.
- **The main AI is on quota reserve:** C can still post the done line in the living message
  from the typed report; M's top line arrives later. The line reads from the report summary
  until then [I].

### 7. v1 tonight vs later

- **Tonight:** under the partner's result message, show the task's state chip, the How I know
  chips from `task.Evidence` (machine kinds first), and an Sent out line built from what the
  transcript shows (see "Desktop changes" in the report and `G-safety.md` G5). The rest of the
  anatomy is the partner prompt's job (W3): top line ≤ 2 lines, Left out when relevant.
- **Next:** the `result` Log event, diff snapshot at done, posting at done? while watching,
  batch settlement, the reply strip and the New result pill.
- **Later:** before/after evidence as a typed pair, result versions (I3).

---

## I2 · Evidence: what each chip opens

### 1. Scenario card

- **Who:** the developer above all ("show me the test run, not a summary of it"); the consumer
  user for sources and screenshots.
- **Feels before:** "Proof" from AI tools is usually a paragraph that says it checked.
- **Feels after:** one tap lands on the exact thing at the exact spot: the passing test line,
  the changed file, the quoted sentence of a source. 放心, 顺滑.
- **First time:** the first chip they tap. It opens in place, at the right spot; Back returns
  to the same scroll position in the conversation.

### 2. The evidence kinds

Each `evidence[]` ref is typed. The chip says what it literally is; tapping opens the thing
itself, in-app when Ducter can show it well, else outside with the URL shown first.

| Kind (internal) | Chip (zh / en) | Opens | Checked by | Freshness |
|---|---|---|---|---|
| `test` | 测试 {n} 个通过 / {n} tests passed | In-app log excerpt, scrolled to the summary line; "完整日志 / Full log" below | C (exit code + parsed count) | Snapshot at done |
| `test_pair` [I] | 之前 2 个没过 → 之后都过了 / 2 failing before → all passing after | Two excerpts side by side | C | Snapshot |
| `ci` | CI 绿了 · 12/12 / CI green · 12/12 | The CI run page (outside) | C (API) | Live: if it turns red later, see edge cases |
| `diff` | +12 −4 · 2 个文件 / +12 −4 · 2 files | In-app diff at the first file (opened task's diff pane) | C (non-empty) | Snapshot at done [I] |
| `commit` | 提交 83dcc5b / Commit 83dcc5b | In-app commit view (message + diff) | C (exists on branch) | Snapshot |
| `pr` | 草稿 PR #1601 / Draft PR #1601 | The PR page (outside) | C (API) | Live: merged / closed shown on the chip |
| `url` / `source` | {n} 个来源 / {n} sources; per source: site name | The document reader at the quote; the page outside on second tap | M (read) | Retrieved date shown |
| `capture` | 截图 · {what} / Screenshot · {what} | In-app lightbox, with when and on which page | C (taken by the gate) | Fixed |
| `file` | {filename} | In-app preview for text, images, PDF; else reveal on its device | C (exists, hash) | "改过了 / Changed since" if the hash differs |
| `document` | {title} | Document reader (I3) | — | Versioned |
| `read_through` | 我通读过了 / I read it through | Nothing to open; tooltip: "这条是我读过后的判断，没有机器检查 / My read, not a machine check" | M | — |
| `user_said` | 你说可以了 / You said it's good | The message where the user said so | U | — |

Ordering on every surface: machine-checked kinds first (`test`, `test_pair`, `ci`, `diff`,
`commit`, `pr`, `capture`, `file`), then `url`/`source`, then `read_through`, then
`user_said` [I]. At most 4 chips inline; the rest fold into "+{n}".

### 3. Flow

```
tap chip ──► in-app kind? ── yes ──► opens over the conversation (sheet on phone, side panel on desktop),
  │                                   scrolled to the anchor (summary line / file / quote)
  │                                   Back ──► same scroll position
  └─ outside kind ──► URL shown in the chip's tooltip/press preview ──► opens in the browser
evidence snapshot missing (old task, device asleep) ──► opens the snapshot blob if any,
  labelled "{time} 的当时的样子 / As it was then from {time}"; else "{device} 睡着了，醒了就能看 / {device} is
  asleep; viewable once it wakes" with 叫醒 / Wake
```

### 4. States

Evidence refs are immutable once in a report. Live kinds (`ci`, `pr`) carry a derived status
C refreshes only while the task or its waiters are active, and once when the user opens it
[I]. No new task states.

### 5. Copy

| i18n key | zh | en |
|---|---|---|
| `evidence.more` | +{n} | +{n} |
| `evidence.full_log` | 完整日志 | Full log |
| `evidence.snapshot_from` | {time} 时的样子 | As it was at {time} |
| `evidence.device_asleep` | {device} 睡着了，醒了就能看 | {device} is asleep; viewable once it wakes |
| `evidence.changed_since` | 之后改过了 | Changed since |
| `evidence.read_through.tip` | 这条是我读过后的判断，没有机器检查 | My read, not a machine check |
| `evidence.capture` | 截图 · {what} | Screenshot · {what} |
| `evidence.commit` | 提交 {sha} | Commit {sha} |
| `evidence.retrieved` | {date} 读的 | Read on {date} |
| `evidence.pr_merged` | PR #{n} · 合进去了 | PR #{n} · merged |
| `evidence.now_red` | 之前绿的，现在红了 | Was green, now red |

### 6. Motion

- Chip press: press-and-settle (80 ms in, 180 ms out). The opened view grows from the chip
  (shared-element zoom, 300 ms); closing shrinks back into the same chip.
- Live chip changing status (PR merged): cross-fade 200 ms, no bounce, no badge.

### 7. Edge cases

- **CI re-runs red after Done** (D4): the chip turns to `evidence.now_red`; M posts a new item
  with a decision to reopen (default: reopen, reversible) [doc D4 edge case].
- **A screenshot shows something private** (a bank page during a browser task): captures are
  taken only by the gate during agent control, never during takeover [doc B5]; the lightbox has
  "删掉这张 / Delete this one" [I].
- **Evidence URL is on a private network** the phone can't reach (a local dev server): the chip
  says so on the phone and offers the capture if one exists.
- **A huge log** (>1 MB): excerpt only; the full log streams on demand from its blob.
- **Forged evidence** (the window cites a test run that didn't happen): C checks every
  machine kind against the runner's own record of what ran; a ref with no matching run is
  dropped and the claim goes back to checking [I; ties to the circuit breaker in D5].

### 8. v1 tonight vs later

- **Tonight:** chips from the existing `EvidenceRef` (kinds `ci | diff | file | url | log |
  test`), ordered machine-first, opening via the existing `openEvidence` (URL, file path,
  else copy).
- **Next:** in-app excerpt viewer for `test`/`log`, diff chip → the opened task's diff at that
  file, snapshot at done.
- **Later:** `test_pair`, `commit`, `capture`, `user_said` kinds (protocol change through the
  lead), forged-evidence check.

---

## I3 · Documents: research and writing live in 做好的

### 1. Scenario card

- **Who:** the consumer personal-AI user (Grok/Muse habits: "look into this for me"); the
  developer doing prior-art checks; anyone asking for writing (the weekly report).
- **Feels before:** "I'll get a wall of chat text I have to copy somewhere before it scrolls
  away."
- **Feels after:** "I got a real document, beautiful to read, with sources I can check, and it
  is kept for me. If I want it in my repo, one tap." 赏心悦目, 放心, 惊喜 (it noticed two
  sources disagree).
- **First time:** the first "帮我查一下… / look into…". The document card appears in the result
  message; tapping opens the reader. Nothing to set up; no folder to choose.

### 2. Flow

Example from B2: "查一下 bun build --compile 在 Linux 上有什么坑，我们打算用 1.4.4。"

```
B2 flow ──► Done ──► result message: top line (the conclusion) + document card
document card:  [Bun 1.4 编译到 Linux 的坑]
                一句话：1.4.4 能用；注意 getSystemErrorMap 和 glibc 版本
                12 个来源 · 4 分钟读完 · 核实 9 · 推断 3        (VERIFIED / INFERRED counts)
                [打开]  [存到…]  [再查深一点]
open ──► document reader (full width on desktop, sheet on phone):
         title · the ask (你问的：…) · date · version
         body in Markdown; claims tagged 核实 / 推断; sources as numbered footnotes;
         "这两份资料说法不一致 / These sources disagree" blocks; "没读到 / Not read" list
存到… / Save to… ──► picker, preselected to the task's project:
         {project} 的 {folder}/ on {device}   (e.g. ducter/research/ on MacBook)
         ├─ a non-git folder ──► writes the file; "存好了 · 7 天内可以撤销 / Saved · undo for 7 days"
         └─ a git repo ──► writes the file into the main checkout, uncommitted, and says so:
               "放进了 ducter/research/29-bun-compile.md，没提交 / Put in …, not committed".
               Offers once, as a separate decision: "要顺便开个草稿 PR 吗？" (default Hold)
follow-up days later ("那 1.4.5 呢？") ──► same task reopens [doc B2] ──► same document, v2
         card shows "第 2 版 · 比上一版多了 1.4.5 的变化 / Version 2 · adds the 1.4.5 changes"
         reader has a version switcher and a "改了什么 / What changed" view
```

Why the control plane by default and not the repo [doc D52 Q7, reasoning I]: a research
document has no natural place for a consumer user, and for a developer the right folder is a
judgment call; writing into a repo is a write that needs a lease and pollutes `git status`.
Keeping it in 做好的 is zero-question, survives every device sleeping, and "Save to…" is one
tap when the user does want it in a place.

### 3. States

| Object | Transition | Actor | Trigger |
|---|---|---|---|
| Result (document) | (none) → v1 | C | task Done with a document |
| Result (document) | vn → vn+1 | C | the reopened task reports a new version |
| Saved copy | (none) → written | U | Save to… [I] |
| Saved copy | written → removed | U | Undo within 7 days, if the file is unchanged since [I] |

Saving into a place is not a task and takes no lease when the target is a non-git folder or
a new file in a repo's main checkout. It is recorded in the day's record (`G-safety.md` G5) as
"在你设备上动过的 / Changed on your devices".

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `doc.card.meta` | {n} 个来源 · {m} 分钟读完 | {n} sources · {m} min read |
| `doc.card.tags` | 核实 {v} · 推断 {i} | Verified {v} · Inferred {i} |
| `doc.open` | 打开 | Open |
| `doc.save_to` | 存到… | Save to… |
| `doc.dig_deeper` | 再查深一点 | Dig deeper |
| `doc.you_asked` | 你问的：{ask} | You asked: {ask} |
| `doc.version` | 第 {n} 版 | Version {n} |
| `doc.version_delta` | 比上一版多了{what} | Adds {what} since the last version |
| `doc.what_changed` | 改了什么 | What changed |
| `doc.conflict` | 这两份资料说法不一致 | These sources disagree |
| `doc.not_read` | 没读到：{site} 要登录 | Not read: {site} needs sign-in |
| `doc.saved_folder` | 存好了 · 7 天内可以撤销 | Saved · you can undo for 7 days |
| `doc.saved_repo` | 放进了 {path}，没提交 | Put in {path}, not committed |
| `doc.offer_pr.q` | 要顺便开个草稿 PR 吗？ | Open a draft PR for it too? |
| `doc.save_to.where` | {project} 的 {folder} · {device} | {folder} in {project} · {device} |

`doc.save_to` generalizes B2's `b2.action.save_to_project` (存到项目), because the target
can be any place, not only a project folder [I].

### 5. Motion

- The document card lands with a press-settle; the VERIFIED/INFERRED counts count up once
  (300 ms) the first time it appears, never again.
- Open: the card grows into the reader (shared-element zoom, 360 ms) [doc B2].
- Save to…: after the write, a small copy of the card arcs toward the chosen place's chip
  (the place shown literally: folder name + device), 400 ms, then the card gains a
  "已存到 {folder} / Saved to {folder}" chip. Concepts shown, not explained (D43).
- New version: the version chip flips (cross-fade) and "改了什么" pulses once.

### 6. Edge cases

- **The target file already exists:** never overwrite silently; write `…-v2.md` or ask with
  default "存成新文件 / Save as a new file".
- **The device of the chosen place is asleep:** the save waits as "在等 · 叫醒 {device}" on the
  card; no task is created.
- **A very long document** (> 20 pages): the reader shows a table of contents; the card's top
  line still fits in 3 lines [doc B2].
- **The user edits the saved file, then asks for v2:** Ducter never overwrites their edits;
  v2 lives in 做好的, and Save to… asks again.
- **Writing (not research):** a weekly report draft is a document too; it carries
  `read_through` evidence and no source counts.
- **The document quotes private memory** (from Mem recall): marked in the reader as "来自你的
  记忆 / From your memory", and flagged by the share check (I5).

### 7. v1 tonight vs later

- **Tonight:** none beyond I1 (research results arrive as the partner's Markdown message).
- **Next:** document results as control-plane blobs, the card, the reader, Save to… for
  non-git folders.
- **Later:** versions and "What changed", Save to… into repos with the draft-PR offer,
  VERIFIED/INFERRED tagging enforced by the prompt and checked by C.

---

## I4 · Finding a result weeks later

### 1. Scenario card

- **Who:** the developer ("the Bun compile research from last month", "the HawDB load-test
  numbers we got in October"); the consumer user ("that comparison you made for me").
- **Feels before:** the dread of scrolling a month of chat, or of a file browser full of
  `untitled-3.md`.
- **Feels after:** "I asked in my own words and it handed me the thing itself, and told me
  what's new since." 好用, 惊喜.
- **First time:** the first time the user refers back to something old. Nothing to learn: they
  just ask.

**First principles.** People remember the moment and the topic, not the filename, the date, or
the folder. Prior art splits results into a gallery (artifact lists, Drive folders) that the
user must browse by name. Ducter's primary path is **asking**; the list is the fallback for
browsing, and every row in it leads with the user's own ask (Rule 5) [I].

### 2. Flow

**Ask (primary).**
```
"上个月那个 Bun 编译的调研发我一下"
  ──► M: log.search over the results index (title, ask verbatim, project, sources, body)
  ├─ one strong match ──► reply with the result card itself (not a link to a list):
  │     "10 月 8 日你问的：『查一下 bun build --compile 在 Linux 上有什么坑…』"
  │     + the card (version, sources, Open, Save to…, Share…)
  │     + at most one freshness note, only if cheap and relevant:
  │       "那之后 Bun 出了 1.4.6，要我看看有没有变化吗？" (default Hold, nothing happens)
  ├─ 2–4 candidates ──► one short pick list, each row = title + the ask quote + date
  │     default: the newest; tapping a row sends it
  └─ none ──► say so, with what was searched; if the thing was said in conversation but never
        became a result, answer from the Log (recall, F2) and offer
        "要我留一份吗？/ Shall I keep a copy?"
```

**Browse (fallback): the 做好的 / Finished list** [I].
- **Where:** opened from On hand, from the Done lane header: "做好的东西 → / All results". It
  is a view *inside* On hand, not a fourth zoom level, so the three-level model holds
  (conversation · On hand · opened task).
- **Rows:** grouped by project (then 其他 / Other), newest first. Each row: kind glyph,
  title, the ask (one line, muted), date, the best evidence chip, persona face when there are
  several personas (On hand aggregates per person [doc]).
- **Filters:** project chips and kind chips (文档 / Documents · 改动 / Changes · 文件 / Files ·
  截图 / Screenshots). A search box with the same index as the ask path (FTS5 with a CJK
  tokenizer [doc system.md]).
- **Open:** document → reader; change → the task opens read-only from the Log with the diff
  snapshot (even if archived); files → preview, with "在 {device} 上显示 / Show on
  {device}".

### 3. States

No new task states. Opening an archived task's result reads the Log and blobs and never wakes
a device unless the user asks for the live place ("叫醒 / Wake") [doc principle 10].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `results.all` | 做好的东西 → | All results → |
| `results.title` | 做好的东西 | Everything finished |
| `results.search` | 找做好的东西… | Find something finished… |
| `results.kind.document` | 文档 | Documents |
| `results.kind.change` | 改动 | Changes |
| `results.kind.files` | 文件 | Files |
| `results.kind.capture` | 截图 | Screenshots |
| `results.row.asked` | 你问的：{ask} | You asked: {ask} |
| `results.found_on` | {date} 你问的：『{ask}』 | On {date} you asked: "{ask}" |
| `results.pick` | 有几份可能是，你要哪份？ | A few could be it. Which one? |
| `results.none` | 没找到。我在做好的东西和对话里找了「{query}」。 | Didn't find it. I searched results and the conversation for "{query}". |
| `results.keep_offer` | 要我留一份吗？ | Shall I keep a copy? |
| `results.newer_since` | 那之后{what}，要我看看有没有变化吗？ | Since then {what}. Want me to check what changed? |
| `results.show_on` | 在 {device} 上显示 | Show on {device} |
| `results.other_persona` | 那份是 {persona} 做的，在做好的东西里能打开。 | {persona} made that one; you can open it under Everything finished. |

### 5. Motion

- Ask path: the card arrives like any result (I1). The ask quote above it fades in 80 ms
  before the card, so the user sees "yes, that one" first.
- Results list: opened from the Done lane header, the lane widens into the list (FLIP,
  320 ms), so it reads as "more of the same place", not a new screen.

### 6. Edge cases

- **The result belongs to another persona:** personas are isolated unless linked [doc]. The
  partner doesn't read it, but the user's own Results list shows it (attention and the list
  are per person), and the reply says `results.other_persona`.
- **The branch was deleted upstream and the device reclaimed the worktree:** the diff
  snapshot opens; the card says "分支已经删了，这是 {date} 时的样子 / The branch is gone; this
  is the snapshot from {date}".
- **The user deleted the saved file in the place:** 做好的 still has the document; the "Saved
  to" chip reads "那边已经删了 / Removed there".
- **Retention:** results are kept until the user deletes one (10 s Undo); diff snapshots are
  capped per task (Open question IQ5).
- **Many near-duplicates** (a routine producing a weekly report): the routine's runs group
  under one row with "第 n 次 / Run n" inside, newest first.

### 7. v1 tonight vs later

- **Tonight:** the Done lane rows on On hand show what each result *is* (the first line of
  the report and the best evidence chip) instead of a generic "Evidence" word. This is the
  seed of the list.
- **Next:** the results index (FTS5) and the ask path via `log.search`.
- **Later:** the Results list view with filters, persona faces, routine grouping.

---

## I5 · Sharing a result

### 1. Scenario card

- **Who:** the developer sending the Bun research to a Nowledge Mem colleague or pasting the
  HawDB load-test numbers into the weekly report; the consumer user sending a comparison to
  family.
- **Feels before:** "If I share this, what else goes with it? My paths, my notes, my
  memory?" And the hassle of reformatting chat text.
- **Feels after:** "One tap, it looked good, and it caught the internal path I would have
  leaked." 放心, 惊喜, 赏心悦目.
- **First time:** the first tap on 分享… / Share…. The sheet lists options from nearest to
  farthest; each says plainly who will be able to see it.

**First principles** [I]. Sharing is a question of *how far it goes*. Copying or saving a file
is the user's own act and needs no ask. Anything Ducter sends or publishes on the user's
behalf is an outside effect and follows `G-safety.md` (shown, recorded, undoable where
honest).

### 2. Flow

```
分享… / Share… (on the result card or in the reader)
  ──► share check runs first (cheap model + patterns) [I]:
        secrets, home-directory paths (/Users/<you>/…), private hostnames, Mem private memories,
        transcript excerpts
        ├─ clean ──► no line
        └─ found ──► "里面有 2 处像是内部路径，分享的版本里去掉？/ It has 2 things that look
              like internal paths. Remove them from the shared version?" default: remove
              (the original is untouched)
  ──► options, nearest first; each says who can see it:
        1. 复制 / Copy                       Markdown with sources            only you, until you paste
        2. 存成文件 / Save as file            .md or .pdf to this device       only you
        3. 存到… / Save to…                   a place (I3)                     whoever can read that place
        4. 存进 Mem / Save to Mem             your memory; a Team space if set the space's members
        5. 生成链接 / Make a link             via your Ducter Edge             anyone with the link
        6. 发给… / Send to…                   email or a chat                  the person you pick
  1–3 ──► done at once; a small receipt "复制好了 / Copied"
  4   ──► shows the space name before writing; provenance recorded [doc principle 17]
  5   ──► G1 card: "要生成一个链接吗？拿到链接的人都能看，7 天后失效。" Go "生成链接"
          ──► link copied; the card shows "已分享 · 7 天后失效 · 关掉链接"
  6   ──► G1 card with the message preview (no countdown: it reaches a person)
```

The shared page (option 5) [I]: read-only, Pebble-styled, no Ducter account needed; shows the
document, its sources, and the version; never the conversation, the transcript, or other
results; a footer "由 {persona} 整理 / Put together by {persona}" only if the user leaves
the toggle on.

### 3. States

| Object | Transition | Actor | Trigger |
|---|---|---|---|
| Share link | (none) → live | U | Go on the link card |
| Share link | live → off | U / C | 关掉链接 / Turn off the link, or expiry |
| Outbound send | as G1/G2 | | |

Every link and send is in the day's record (G5).

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `share.open` | 分享… | Share… |
| `share.check_found` | 里面有 {n} 处像是{what}，分享的版本里去掉？ | It has {n} things that look like {what}. Remove them from the shared version? |
| `share.check_remove` | 去掉 | Remove them |
| `share.copy` | 复制 | Copy |
| `share.copied` | 复制好了 | Copied |
| `share.save_file` | 存成文件 | Save as file |
| `share.save_mem` | 存进 Mem | Save to Mem |
| `share.save_mem.where` | 存进 {space} | Save to {space} |
| `share.link` | 生成链接 | Make a link |
| `share.link.q` | 要生成一个链接吗？拿到链接的人都能看，{d} 天后失效。 | Make a link? Anyone who has it can read this. It expires in {d} days. |
| `share.link.live` | 已分享 · {d} 天后失效 | Shared · expires in {d} days |
| `share.link.off` | 关掉链接 | Turn off the link |
| `share.link.offed` | 链接关掉了。已经打开过的人可能存了副本。 | The link is off. Anyone who opened it may have kept a copy. |
| `share.send` | 发给… | Send to… |
| `share.who.only_you` | 只有你 | Only you |
| `share.who.place` | 能读到那里的人 | Whoever can read that place |
| `share.who.space` | {space} 里的人 | Members of {space} |
| `share.who.anyone_link` | 拿到链接的任何人 | Anyone with the link |
| `share.footer_by` | 由 {persona} 整理 | Put together by {persona} |

### 5. Motion

- The share sheet lists options as a short ladder: each option's "who can see it" chip widens
  a little as the options go down (literal: the audience grows). This is a layout, not a
  metaphor; no icons of crowds or globes [I].
- Share check finding: the flagged spans highlight in the preview (soft underline, no red)
  and fade out when removed.
- Link made: the "Shared" chip pops onto the result card (bouncy, 220 ms); turning it off
  fades it to muted.

### 6. Edge cases

- **No Ducter Edge yet** (local-only setup): Make a link is shown disabled with "要先能在哪儿都能用
  / Needs Reach from anywhere first", linking to the 在哪儿都能用 ability (D43, A-group).
- **The document cites a source behind a login:** the shared page keeps the citation text and
  link, never the fetched content of a logged-in page [I].
- **The result is a code change:** sharing offers the PR link (if any) and "复制 diff / Copy
  diff"; Make a link is offered only for documents and captures.
- **Shared, then a new version appears:** the link keeps showing the version that was shared;
  the card asks once "链接还是第 1 版，要换成第 2 版吗？" default Hold.
- **Turning a link off can't un-share what was read:** `share.link.offed` says so plainly.

### 7. v1 tonight vs later

- **Tonight:** none (Copy works through text selection in the message).
- **Next:** Copy and Save as file on the result card; the share check for paths and secrets.
- **Later:** Save to Mem, Make a link via the Edge, Send to… via G1.

---

## Proposed glossary additions (not in the glossary; need the change loop)

| Concept (internal) | zh / en | Used in | Note |
|---|---|---|---|
| evidence row heading | 怎么知道的 / How I know | I1, I2 | In the glossary (D66), and the only evidence word |
| evidence (noun, lists and dossier) | no noun: 怎么知道的 / How I know | I2, desktop dossier | 证据 retired (D66) |
| scope not done | 这次没包括 / Left out | I1 | Not 没做 (too close to 没成 / Didn't work) |
| outside effects | 发出去的 / Sent out | I1, I5, all of G | Shared with `G-safety.md`; one word for "left your devices" |
| save into a place | 存到… / Save to… | I3, I5 | Generalizes B2's 存到项目 |
| version | 第 n 版 / Version n | I3, I5 | |
| what changed between versions | 改了什么 / What changed | I3 | |
| results list entry | 做好的东西 / Everything finished | I4 | 做好的 / Finished itself is in the glossary |
| the user's original ask | 你问的 / You asked | I3, I4 | |
| share sheet | 分享… / Share… | I5 | |
| copy, save as file | 复制 / Copy · 存成文件 / Save as file | I5 | Ordinary verbs, listed for completeness |
| save to memory | 存进 Mem / Save to Mem | I5 | "Mem" is the product name the user already knows |
| share link | 生成链接 / Make a link · 关掉链接 / Turn off the link | I5 | Not 撤销 / Undo: a read link can't be undone |
| snapshot | 当时的样子 / As it was then | I2, I4 | |

## Open questions (decided 2026-11-09: rule 1 as D60, the rest as D61; see `design/decisions.md` for the two changes)

| # | Question | Recommendation (default) | Why it matters |
|---|---|---|---|
| IQ1 | When does the result message appear: at Done · checking, or only at verified Done? | **At verified Done.** Exception: if the user is watching and the checks take > 10 s, post at Done · checking with unfilled chips that fill as checks pass | Honesty (principle 7) without making a watching user stare at nothing |
| IQ2 | Is the Sent out line always shown for tasks that had a place, even when nothing went out? | **Yes.** "发出去的：没有" is the trust signal. Omitted for in-turn answers and research with no place | The dogfood run shows the user wants this said; prose is easy to miss |
| IQ3 | Where does the Results list live? | **Inside On hand**, opened from the Done lane header ("做好的东西 →"). No fourth zoom level. Asking is the primary path | Keeps the three-level model (principle 20) |
| IQ4 | "Save to…" into a git repo: commit or not? | **Write the file, never commit; say so.** Offer a draft PR once, as a separate decision (default Hold). 7-day Undo for unchanged files in non-git folders | Writing into a repo is the user's territory; a commit is a choice |
| IQ5 | Diff snapshot at Done: size cap? | **Yes, snapshot at Done; cap 5 MB per task**, beyond that keep stat + the first 50 files | Evidence must outlive worktree reclaim and branch deletion |
| IQ6 | Share links: default expiry, and in v1? | **7 days, revocable, ships with Ducter Edge (not tonight)** | A link is the farthest a result can go |
| IQ7 | Pre-share check: on by default, and what does it flag? | **On.** Secrets, home-directory paths, private hostnames, Mem private memories, transcript excerpts. Default action: remove from the shared copy | 放心 at the exact moment of risk |
| IQ8 | Result retention | **Keep until the user deletes one** (10 s Undo). Documents are small | "Find it weeks later" depends on it |
| IQ9 | Save to Mem: when, and where? | **Only when the user taps it**, into the space they see named on the button, with provenance (principle 17). Never automatic | Mem is the user's; Ducter writes only its own persona otherwise [doc] |
| IQ10 | "Words freeze, chips live": promote to `conversation.md` after review? | **Yes, after the user reviews I1** | It resolves how a posted result can show checking → done honestly |
| IQ11 | New typed evidence kinds (`test_pair`, `commit`, `capture`, `user_said`) and a `result` Log event | **Yes, as one protocol change through the lead**, after tonight | Chips need types to open the right thing |

Evidence is thin on two points: (a) that users prefer asking over browsing for old results
rests on first principles and the B2 reasoning, not on a study; (b) the "Sent out: nothing"
line's value rests on one dogfood observation. Both are cheap to test in prototype review.

## Artboards (proposed, not built)

| File | Size | Shows |
|---|---|---|
| `IResultMessage.dc.html` | desktop 1440×900 | The HawDB result message: top line, How I know, Left out, Sent out: nothing, change card, draft PR decision |
| `IChecking.dc.html` | desktop 1440×900 | Same message while checking: unfilled chips filling; then check didn't pass |
| `IDocReader.dc.html` | desktop 1440×900 | Bun research document: tags, footnotes, a disagreement block, version switcher |
| `IFindLater.dc.html` | phone 390×844 | "上个月那个 Bun 编译的调研" → the card with the ask quote and a freshness note |
| `IResultsList.dc.html` | desktop 1440×900 | On hand Done lane widened into All results, grouped by project |
| `IShareSheet.dc.html` | phone 390×844 | Share ladder with the share check flagging two internal paths |
