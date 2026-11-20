# 173 · Task-aware: one message, many pieces of work, and the to-dos that come from elsewhere

Date: 2026-11-20, on main at `53c60669` (0.1.1; hel runs the same build). Proposal stage: nothing
here is decided or built, and no `Dn` is recorded. Asked by the author after watching a reference
product's demo whose pitch is: *you don't create tasks any more; you say what you need, agents split
it, take it and close it out, each task with its own conversation, all under your one message.*

Sources: the demo video, read frame by frame (the frame-by-frame analysis, which names the product,
is in `research/private/173-task-aware-reference.md`); Ducter's design notes and code at this commit;
the author's home (hel) Log, read only (`file:/root/.ducter/ducter.db?mode=ro`, 31,472 events from
2026-11-09 to 2026-11-20, plus the key names and member counts of `~/.ducter/task-groups.json`; no
values that could be secrets were printed); one Nowledge Mem search ("task abstraction hand-over").

Tags: **VERIFIED** = seen in a video frame (timestamp given), in Ducter's code or docs at this commit,
or in hel's Log; **INFERRED** = judgment.

## 1. The reference flow, in short

All VERIFIED from the frames unless marked; the full table is in the private note.

1. **0–3 s.** A team chat channel. The person types an ordinary message: "Friday launch: check the
   pricing page, write the release notes, update the status page. *{Coordinator}, can you split
   this up?*" The split is asked for by addressing a coordinator agent by name. The composer also has
   an **As task** checkbox (left unchecked), the manual way.
2. **4–7 s.** Under the message, attached to it, a three-row list appears: `#1 Check the pricing page`,
   `#2 Write the release notes`, `#3 Update the status page`, each **Todo**. The titles are the
   person's own clauses. A system reply under it says the coordinator created them. No plan, no
   confirmation, no "I read this as three things" in between (INFERRED that none exists).
3. **8–9 s.** Each row gains an owner, an agent persona with a role (design QA, docs, …), and
   **In progress**.
4. **10–12 s.** Opening #1 shows a task with its own fields (Status, Assignee, **Source** linking back
   to the message, Created by the coordinator, Created at, History) and its own conversation with a
   composer, **Message this task**.
5. **13–18 s.** The agent posts findings in the task ("Found 2 issues on the pricing page: …") and
   stops. The person replies in the task ("Fix both, please."). The agent: "Both fixed and live.
   Marking this done." A system line records the move to Done. No evidence (diff, link, check) shown.
6. **19–22 s.** Back in the channel, the same message now shows #1 **Done** (3 replies), #2 and #3
   **In progress**. "Still one message."
7. **Not shown:** any outside tracker (tasks live in the chat product itself); how the person was told
   a part had findings waiting (only a reply count and a channel badge are visible); a close-out of the
   whole ask (the video ends at 1 of 3); order or dependencies between parts; where or on what anything
   ran.

**What is strong in it (INFERRED):** the split is visible *at the message the person wrote*, within a
second, in the person's own words, so they know at once they were understood; each part is a
conversation, not a ticket; the message stays the one place the ask's state is read.
**What is weak (INFERRED):** a split needs the coordinator's name; things that need the person sit
inside a task they must think to open; done is a claim; no single close-out; a team product's
"owner" field, which a personal AI with one partner does not need.

## 2. Ducter today, when one sentence implies several pieces of work

### 2.1 What the design and code do (VERIFIED)

- **The partner's rule is one task per ask.** `persona.ts` rule 2: "Anything that needs a place …
  becomes a task" (singular): one ack sentence, then `task_open`. Rule 2d puts continuity first: a
  follow-up carries on the task it follows (D373).
- **A split exists, but only for an ordered list.** `task_open` takes `group` (D360), whose description
  reads: "When the user lists separate parts to do in turn ("先…然后…最后…", "一件做完再做下一件"): one
  task per part …". The eval covers exactly that (`group-split-zh`: a sign-in page in three ordered
  parts, one repo) and grouping by words (`group-words-zh`). Nothing tells the partner to split an ask
  whose parts are independent ("check the pricing page, write the release notes, update the status
  page").
- **A group is one card on On hand,** not in the conversation: the name, beads, **{n} 件里做完 {k} 件**,
  the parts on a thread, a stopped line's choices (`on-hand.md` §Groups). The person's message in the
  conversation carries nothing of it.
- **Results come back per part.** Each part's report wakes the partner; its task line names "group X
  part n of m; held in line: …" (`render.ts`). Rule 5: "Several tasks reporting together get one
  message", i.e. only when they happen to coincide. There is no close-out of a conversational group;
  **一起过目 / Review together** (one sheet, each part's PR, checks, the comment it will leave) exists only
  for hand-over groups (`handover.md` §6, `task-groups.ts`).
- **The living message** (principle 7) is per task: items rendered from typed reports and decisions,
  needs-you first. It knows nothing of which ask a task came from.
- **The link from an ask to its tasks exists in the Log** but is not shown: the `ack` carries
  `replyTo` (the person's message) and a `jobId`; `job_status` carries the `taskId`. Nothing renders it
  under the person's message.

### 2.2 To-dos from GitHub and Obsidian (VERIFIED)

- **Sources, not the place work lives** (D341): the outside app owns what a to-do is and whether it is
  open; Ducter owns how it gets done; no field is synced both ways. A task is *bound* to a to-do; a
  write back (a comment, a close, a tick) goes behind a Go or a standing go, and is listed in **替你做过的 /
  Done for you**.
- **The pile** (D359) sorts open to-dos (do / decide / later / close); **handing several over** (D385,
  D396, D415) is one sheet: words first ("想交给{name}哪些？"), a note carried into every brief, four
  shapes (**先出个方案 / Plan first**, **合成一件做 / As one task**, **一件做完接下一件**, **同时做**), where
  and who resolved by one shared resolver, a plan card before a fan-out, **一起过目** at the end, the
  person's own **分类 / Subjects**, and a comment first when the note asks for it.
- **The seam:** two doors make groups, and they behave differently. A group from the pile has a note,
  a shape, a plan, a review and write-back held to one Go. A group from a sentence in the conversation
  has none of that, and its parts' results arrive one by one. A sentence that names a to-do ("接 #12")
  binds; a sentence whose part *is* an open to-do without naming it ("fix the settings page") does not
  find it, though the pile's find (code plus meaning) could.

### 2.3 What happened on hel (VERIFIED from the Log, 11 days)

- 91 messages from the author, 36 `task_open`s (12 opened by him, the rest by the partner).
- **The partner never split an ask.** `task-groups.json` holds one group, **通用设置**, made by the
  pile's hand-over with shape *As one task* and a single member (finished groups are pruned, so
  earlier hand-over groups may have existed: INFERRED). No `task_open` in the Log carried a group.
- **Multi-part asks became one task, and the parts vanished.**
  - 11-12 00:31: "我下周有什么预约么 帮我在 gmail 日历记录我 20 号要去北京 agibar 参加一个分享，这个周日要去杭州
    coscon 参加 bof，下周四要参加 Tabs 上海和组织者见面" (one look-up and three calendar entries) → one task,
    "查看下周预约并整理三项日历安排". It blocked on the browser; the partner said "还没读到下周的预约，三项安排也都
    没写入". The three entries never had a state of their own; nothing later shows which were made.
  - 11-16 02:51: a five-item phone test list ("借出后打开 Chrome … 录屏 30 秒 … 锁屏 … 飞行模式 … 划掉 Ducter")
    → continued the existing test task (continuity was right) and came back as "这次五项都没测成".
  - 11-13 22:25: four things in one message (two notes about people, one "don't bother", one re-test)
    → one task for the re-test; the notes were acknowledged in prose only.
- **Errands split the other way:** the 11-18 Beijing trip (hotel, the price gap, flights, the total)
  opened four tasks across four messages, losing the signed-in browser; the author booked it himself.
  This is research/162's continuity gap (D373), the opposite failure: one piece of work cut into
  several tasks.
- **The hand-over's close-out works when used:** 11-18 13:07, seven issues commented on and closed
  under one Go (the pile's close sheet); 11-19 and 11-20 hand-overs bound tasks, and comments went out
  by Go or by the standing rule.

**Reading (INFERRED):** the problem is not that Ducter cannot split. It is that the thing the person
asked for, part by part, is not an object anywhere. A task is the only unit, so a four-part ask either
hides three parts inside one task or scatters into tasks that lose each other's sign-ins.

## 3. First principles: what a "task" is, for whom

| | The heavy multi-agent developer | The consumer personal-AI user | The fresh user |
|---|---|---|---|
| A task is… | a session on a place: a harness, a branch, a PR; something to watch, fork, continue | an errand with an outcome ("the hotel is booked") | "the thing I asked for" |
| What they count | PRs and their checks; what runs in what order | what still needs them | whether it got done |
| What they fear | collisions in one repo; work done twice; a fan-out before a plan | five browsers, five sign-ins, five pings | not knowing it understood |
| What delights | the split already ordered, the plan says "this one is already fixed" | one message back: "all three done, one needs you" | seeing their own sentence come back as a list being ticked |

The three meet on one distinction the reference blurs: **what the person asked for** and **where the
work runs** are different things.

- A **part** is one outcome the person asked for, in their words: the unit of *attention and
  accounting*. "Check the pricing page." "Put the agibar talk on the 20th in my calendar."
- A **task** is a session on a place (principle 9): the unit of *execution*. Parts that share a
  place, a sign-in or a browser belong in one task (the trip, the three calendar entries); parts that
  don't, in several (a pricing page check in a browser, release notes in a repo).
- The reference makes every part a task with an owner because it is a team chat: accountability among
  many people and agents is its job. Ducter has one partner; the "owner" is the partner, always, and
  the harness is a body (principle 17), shown on On hand, never in the conversation (D129).

So the one-message-to-many experience should be: **the ask's parts appear under the person's own
message, in their words, and each part's state lives there; how many tasks run them is the partner's
choice and nobody's concern unless they open it.**

Against the north star (D36):
- **好用 easy:** say it in one sentence; nobody addresses a coordinator, ticks "as task", or files
  anything. The partner splits by meaning, as it already acks by meaning.
- **顺滑 smooth:** the parts appear with the ack, before any result; parts sharing a place run in one
  task with one sign-in; parts in one repo run in order (D360's line).
- **赏心悦目 delightful to look at:** a small strip under the message, each part a row with its mark (the
  same tick, working bars, flag, ring, cross the group card uses), no labels, no IDs, no system lines.
- **放心 trustworthy:** done is shown with how it was checked (principle 7, D60's How I know), not
  claimed; a part that needs the person shows its question in the row *and* reaches them through the
  living message and a push (principle 7), so nobody has to think to open a task; anything outward
  still waits for a Go.
- **惊喜 pleasantly surprising:** one close-out for the whole ask ("三件都好了…"), and parts that turn out
  to be open to-dos are recognised, bound, and ticked off in their app when done.

What stays deliberately different from the reference:
- **Silence means success** (principle 7). The reference's channel collects system lines ("X created
  …", "X moved … to Done"). Ducter's strip changes in place without new messages, and the partner speaks
  again only with the close-out, a failure, or a question.
- **Conversation, On hand, opened task** keep their jobs: the strip is the conversation's view of one
  ask; the group card is On hand's view of the same parts; the opened task is the full depth. One part,
  three views, one state.
- **Outside trackers stay sources** (D341). The reference keeps its own task list; Ducter does not
  mirror parts into GitHub or Obsidian, and does not become a tracker. What it adds: a part that *is*
  an open to-do is bound to it, so the write back comes for free.
- **A plan before a fan-out** for big sets (D385). The reference starts at once; for three small parts
  so should Ducter, but a subject set of nine issues still gets a plan first.

## 4. What we already do better (VERIFIED in design and code)

1. **Evidence, not claims.** A result carries How I know; a ref Ducter checked and found missing sends
   the task back before the person hears "done" (persona rule 5). The reference's "Both fixed and live"
   has nothing under it.
2. **Order and dependency.** Parts in one folder run one after another from the last one's branch; a
   failed part stops the line with plain choices (D360). The reference shows three parts racing.
3. **External to-dos with one owner per field** and write-back behind a Go, a learned standing go, and
   Done for you (D341). The reference has no outside tracker at all.
4. **Plan first, review together** for a set of to-dos (D385): one decision before the fan-out, one
   review with every PR's checks after.
5. **Continuity.** A follow-up goes to the task it follows, and an old task is found, continued or
   forked from any step (D373, D391). The reference's per-task composer is the only route.
6. **Any harness, any computer, the person's own config** (D282, D157). The reference's agents are its
   own.
7. **Attention.** Questions reach the person through one living message and a push only for decisions;
   in the reference a finding waits inside a task until someone opens it.

## 5. Where the reference is ahead (VERIFIED in its frames, against §2)

1. The split is **visible at the ask**, in the person's words, in a second. In Ducter the ask gets one
   sentence and the parts exist only as cards on On hand, or not at all (§2.3).
2. **Independent parts are split at all.** Ducter splits only an ordered list, and never did on hel.
3. **The ask's state stays on the ask.** In Ducter a part's result arrives as its own message, and a
   four-part ask can come back as "四项都没测成" with no part-by-part account.
4. **A part's conversation is one tap from the ask.** In Ducter the task is reachable from On hand, from
   ⌘K, or from the result's Details, but not from the message that started it.

## 6. Implications for Ducter

Ranked by pain × breadth × feasibility. None is decided; each needs the change loop (a `Dn`, the
glossary, the design notes, prototypes, the eval for any persona or tool change, D175).

### 1. The ask's parts, under the person's message
- **Who benefits:** all three; most the fresh user (proof it understood) and the consumer (what still
  needs them, in one place).
- **What changes:** when the partner reads an ask as two or more outcomes, a strip appears under the
  person's message with the ack: one row per part in the person's words, its mark, its right-hand
  words (the card's heartbeat words), and when 2+ are done **{n} 件里做完 {k} 件 / {k} of {n} done**.
  A row opens its task (several parts in one task open the same task at that part). A part that needs
  the person shows its question in its row; a failed one says **没做成 / Didn't work**. The strip
  changes in place, never posts. No heading; no IDs; no agent names.
- **Model / glossary:** new internal object **part** (an outcome of one ask: `askId`, words, state,
  `taskId`). Shown with no name of its own; the glossary gains a row "the parts of one ask" with the
  copy above. A group (D360) becomes "the tasks of one ask" when it has 2+ tasks; its name is the ask's
  short subject. The ask → task link that already exists in the Log (`ack.replyTo`, `job_status`) is
  rendered.
- **Cost:** medium. Protocol (a `parts` event under the user message, revised in place like the living
  message), core (state from task cards and typed reports), web and Mac rendering. ~3–4 days.
- **Default:** on, shown only for 2+ parts. One-part asks look exactly as today.

### 2. Split by outcome, run by place
- **Who:** the consumer (three calendar entries, one browser) and the developer (independent fixes in
  parallel, ordered ones in line).
- **What changes:** the partner names the parts of an ask (its own words in the ack are unchanged: one
  sentence naming the action), then opens tasks by place: parts that share a place, a sign-in or a
  browser go in one task whose brief lists them as parts to report one by one; parts in different
  places get their own tasks, grouped. The task's typed report gains `parts: [{words, state, evidence}]`
  so a four-part task reports four states (the 11-12 calendar ask would have said which entries were
  made).
- **Model / glossary:** `task_open` gains `parts?: string[]`; `group` is no longer only for ordered
  lists. Persona rule 2 and the tool descriptions change: an eval run (D175) with new scenarios: three
  independent parts across places (zh and en), three errands on one site (one task, three parts), one
  repo change described in three clauses (one task, one PR), a follow-up to one part.
- **Cost:** medium (persona, tool, report schema, the task-side report tool, eval ~$1 per run).
- **Default:** the partner decides; code guards the floor: never more tasks than parts, never two tasks
  on one browser profile's sign-in for one ask, at most `HAND_CAP` (3) running at once for one ask.

### 3. One close-out per ask
- **Who:** everyone; it is principle 6's ack → job → result made true for a split.
- **What changes:** successes of single parts are silent (the strip ticks); failures and questions are
  said at once. When every part is back, one result replying to the ask: the partner's outcome in one or
  two lines (**三件都好了：价格页两处改好了，发布说明写好了，状态页更新了。 / All three are done: two fixes on the
  pricing page, the release notes, the status page.**), then core's rows per part with How I know.
  Any part with a PR or an outward write offers D385's **一起过目 / Review together** (generalised from
  hand-over groups to every ask with 2+ parts that touch a repository or a tracker).
- **Model / glossary:** none new; `group_review` loses its hand-over-only condition; the partner is woken
  once per ask rather than per part (`taskGroup` context already says part n of m and what is held).
- **Cost:** low to medium (core wake rule, partner rule 5 wording, eval).
- **Default:** hold part successes until the ask is complete, or until 30 minutes after the first part
  is done, whichever comes first (so a slow part does not mute fast news forever); failures and needs-you
  never held.

### 4. Follow-ups land in the right part
- **Who:** the developer (Conductor-style continuity, `conductor-superset`) and the consumer ("the
  second one, make it cheaper").
- **What changes:** replying to a strip row (D236's reply) goes to that part's task; words that name a
  part ("第二件…", "the release notes…") are routed by the partner with the ask's parts in its context;
  a follow-up about the whole ask goes to the group. "再加一件：…" adds a part to the same ask (and the
  same task when it shares the place).
- **Model / glossary:** the partner's `<tasks>` block lists the open ask's parts with their tasks; reply
  routing by part. No new words.
- **Cost:** low (render context, persona rule 2d, two eval scenarios).
- **Default:** a follow-up within the ask's life goes to the part it names; unclear → the most recent
  part still open, said in the ack ("我接着改价格页那件。").

### 5. One door for groups: a sentence's parts meet the to-dos
- **Who:** the developer with 500+ open issues; the consumer with an Obsidian list.
- **What changes:** when a part matches an open to-do (an exact ref, or the pile's find by meaning with
  high confidence), the part is bound to it, its chip shows on the row, and when done its write back
  follows D341's rules (a comment behind Go or the standing go; Obsidian ticked). A part found only by
  meaning is offered, not bound: **这件像是 #10559，算它的吗？ / Is this #10559?** with **算 / Yes** and
  **不是 / No** (default: not bound). Conversely, a hand-over from the pile and a split from a sentence
  make the same kind of group, with the same note, shape and close-out.
- **Model / glossary:** a part may carry a bound to-do (D341's "bound to-do" unchanged, now per part
  not only per task); the glossary row for the ask's parts names the chip.
- **Cost:** medium (pile find on each part, the offer card, group unification in `task-groups.ts`).
- **Default:** bind on an exact ref; ask once on a meaning match; never write to a tracker at bind.

### 6. Do not add (deliberate differences)
- **No coordinator to address, no "as task" checkbox.** The partner reads every message; New task
  (D128) stays the manual door.
- **No owner persona per part.** One partner; the harness is shown on On hand and in the opened task.
- **No system lines in the conversation.** The strip changes in place.
- **No mirror of parts into GitHub, Obsidian or a Ducter task list.** Sources stay sources (D341);
  Past tasks and ⌘K (D391) already find every task.

### Open questions for the author
1. **Is "part" worth a new internal object**, or should a one-task ask with parts be shown only inside
   the task (cheaper, but the 11-12 calendar ask would still read as one blob in the conversation)?
   Recommended: the object; the alternative is to stop at #2's report schema.
2. **The hold rule in #3.** Hold every success until the ask is complete (calmest), or say each as it
   lands (today)? Recommended: hold, with the 30-minute release.
3. **Who sees the harness on a row.** Recommended: nobody in the conversation (D129); the developer
   sees it on hover on the Mac and in On hand.

## 7. Summary

The reference shows one move worth taking: the ask's parts appear under the person's own message and
their state lives there. Ducter has the harder pieces already: groups and ordered lines (D360),
hand-over with a plan and a review (D385), sources with one owner per field and gated write-back
(D341), continuity (D373, D391), and evidence for done. What it lacks is the ask as an object. On
hel the partner never split an ask in 11 days; a four-part calendar ask and a five-part test list each
came back as one blob, and a trip was cut into four tasks the other way. The fix is to separate
*parts* (what the person asked, the unit of attention) from *tasks* (where it runs, the unit of
execution), show the parts under the message, report them part by part, close the ask out once, route
follow-ups to the right part, and let a part that is an open to-do bind to it. Everything else in the
reference (a coordinator to address, owner personas, an as-task toggle, system lines, its own task
list) Ducter should deliberately not copy.
