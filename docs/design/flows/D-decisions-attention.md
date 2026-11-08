# Flows D: Decisions and Attention

> Draft 1 · 2026-11-08 · Status: **drafted, not reviewed**. Covers scenarios D1–D5
> (`product-model.md` §6). Builds on principles 6, 7, 8, 10, 11, 12, 18, `conversation.md`
> (living message, honesty, push), `focus-window-states.md` (actors, `done?`, stall rule),
> `ui.md` (On hand forecast, lanes), and `research/16` §5. Artboards: `D*.dc.html` in the
> flows canvas (listed at the end).
>
> Tags: **[doc]** already stated in a design note; **[I]** this draft's proposal, not yet
> decided. Every [I] that adds a state, object, or word is repeated in the open questions,
> because it must go through the change loop before it becomes real.

## 0. Shared rules for all five scenarios

**What a decision is** (from the typed report, principle 12 [doc]):
`{question, options, default?, deadline?, reversible: bool, go_label?, evidence[], task_ref}`.
- W proposes the question, the default and the deadline in its report. M keeps them, edits them,
  or answers from the Log (and then the user never sees it). C fires the deadline [doc].
- A default fires on its own **only if reversible and allowed by intent policy** [doc]. An
  irreversible item has no countdown at all. It says "不会自己动 / Won't go ahead without you"
  instead [I].
- The Go button names the action when there is one ("好，rebase / Rebase") [doc].

**Five attention levels, lowest first** [I, refining the doc's ladder badge → message → push → call]:

| Level | What the user notices | Earned by | Never used for |
|---|---|---|---|
| 0 Silent | Nothing; it is in the Log and on the card | Progress, steering, a routine run with nothing new | — |
| 1 Badge | The pebble row on the On hand button changes | Any attention change of a task | — |
| 2 Message | An item in the living message (in-app, no sound) | `done`, `failed`, a default that fired, a wait past its deadline, `needs-you` while the user is in the app | Progress narration |
| 3 Push | A notification on the phone or desktop | `needs-you` that is unseen after the hold, **or** a failure that breaks a deadline the user set | Done, progress, anything already seen |
| 4 Call | The phone rings | Only a deadline the user set *and* asked to be called about ("没修好的话 9 点打给我 / Call me if it isn't fixed by 9") | Anything Ducter decided on its own. **Roadmap (D35), not v1** |

Push hold and coalescing: no push while the user is active in the app; push after 3 min
unseen; at most one push per 15 min per person (across personas); quiet hours hold level 3
completely [I; 3 min and coalescing from `research/16` §5.3].

**Copy tone.** The partner speaks as a peer who did the legwork: "我替你…了 / I went ahead
and…", "你看着办 / Your call". Never approval, sign-off, or "awaiting instructions"
language, and never "boss" or "task assigned".

---

## D1. A decision with a default and countdown

### 1. Scenario card

- **Who:** all three. Most sharply the heavy developer (five tasks running, one needs a
  rebase call) and the fresh user (first time Ducter asks them anything).
- **Feels before:** mid-something else. Mild dread that an AI tool will either nag or do
  something behind their back.
- **Feels after:** "it asked me one clear thing, told me what it would do if I said nothing,
  and I could answer in one tap or not at all." 放心 (trust: nothing irreversible happens
  silently) and 顺滑 (one tap).
- **First time:** inside the conversation, as part of a reply the user was already reading.
  The first decision a fresh user sees always has a reversible default, so ignoring it is
  safe. One small line under it, shown once: "不回也没关系，到点我按这个来，还能撤销。/ No
  need to answer. At that time I'll go with this, and you can undo it." No tutorial [I].

### 2. Flow

```
W reports question (+ default, deadline, reversible) ──► M
  ├─ M can answer from the Log / a Rule ──► steers answer in; task stays Working; user sees nothing
  └─ M can't ──► task → 等你 / Needs you (actor M)
        ├─ user in the conversation ──► item appears in the living message (level 2)
        │     └─ unseen 3 min ──► push (level 3) unless quiet hours / coalesced
        ├─ user away ──► badge + push after hold; held during quiet hours (D3)
        └─ resolution, first of:
             ├─ 好 / Go (or named action) ──► Working; press-and-settle; resolved row with 撤销 / Undo if reversible
             ├─ 先等等 / Hold ──► stays Needs you, countdown removed, default cancelled;
             │                   asks nothing more; card says "你说先等等 / You said hold" [I]
             ├─ 回复… / Reply… ──► free text to M; M turns it into an answer, a new
             │                   question, or a steer; countdown pauses while the reply is open
             ├─ deadline passes, reversible ──► C applies default ("按默认 / By default"), Working;
             │                   item becomes a "went with the default" row with Undo
             └─ deadline passes, irreversible ──► (no deadline exists) stays Needs you;
                                 after 24 h M may re-ask once in the next living message [I]
Undo (reversible only) ──► M runs the inverse action as a new step; task back to Needs you
                            with the same question, no countdown [I]
```

Surfaces (same decision object, four renderings):
- **Conversation:** a white card inside the partner's message (question · default line ·
  Go / Hold / Reply).
- **On hand:** a wide card in the 等你 / Needs you lane, plus a tick on the forecast timeline
  at the deadline.
- **Opened task:** the decision banner pinned on top [doc], with the evidence tabs below.
- **Phone lock screen:** a push quoting the question and default line *exactly*. Tap opens
  the decision sheet (artboard `DDecisionSheet`). See open question Q1 on lock-screen
  buttons.

### 3. States and transitions

| From | To | Actor | Trigger |
|---|---|---|---|
| Working | Needs you | M | W's blocking question M can't answer [doc] |
| Needs you | Working | U | Go, or a Reply that M resolves into an answer |
| Needs you | Needs you (held) | U | Hold. Default and deadline cleared |
| Needs you | Working | C | Deadline passes, default is reversible and policy-allowed [doc] |
| Working (after default) | Needs you | U → M | Undo; M runs the inverse, re-asks without a deadline [I] |
| Needs you | Dropped | U / M | "算了 / never mind" [doc] |

Decision object lifecycle (Log events, [I]): `asked → shown(surface, device) → pushed(text
snapshot) → answered(by, device, answer, version) | defaulted(at) → undone?`. Each answer
carries the version it was answered against (for two-device races).

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `decision.go` | 好 | Go |
| `decision.go_named` | 好，{action} | {Action} |
| `decision.hold` | 先等等 | Hold |
| `decision.reply` | 回复… | Reply… |
| `decision.default_line` | 不回的话 {time} {action} · 可撤销 | If I don't hear back, I'll {action} at {time} · undoable |
| `decision.no_default_line` | 这件不会自己动，等你定 | I won't go ahead on this without you |
| `decision.first_time_hint` | 不回也没关系，到点我按这个来，还能撤销。 | No need to answer. At that time I'll go with this, and you can undo it. |
| `decision.minutes_left` | 还有 {n} 分钟 | {n} min left |
| `decision.waiting_for_typing` | 你在打字，我先等你说完 | You're typing, so I'll wait for you |
| `decision.resolved_go` | 好的，{action}了 · {time} | Done: {action} · {time} |
| `decision.resolved_default` | 到点了，按默认 {action} · {time} | Time was up, so I went with {action} · {time} |
| `decision.resolved_hold` | 你说先等等，我先放着 | You said hold, so it's on pause |
| `decision.undo` | 撤销 | Undo |
| `decision.undone` | 撤回了，还按原来问你 | Undone. Same question, your call |
| `decision.answered_elsewhere` | 你在 {device} 上已经选了「{answer}」 | You already chose "{answer}" on {device} |
| `decision.change_answer` | 改成「{answer}」 | Change to "{answer}" |
| `push.decision.title` | {persona} · {task} | {persona} · {task} |
| `push.decision.body` | {question} {default_line} | {question} {default_line} |

### 5. Motion

- **Press-and-settle on decide** (Pebble `bouncy`): the button sinks 3 px and its press shadow
  collapses (80 ms) → releases with a small overshoot (180 ms) → the card's height springs down
  into a one-line resolved row (320 ms) → the task pebble in the chip changes orange → blue
  (cross-fade 200 ms) → the face gives one nod. On the phone, a light haptic on press.
- **Countdown, calm by design:** no ticking seconds anywhere. The default line shows an
  absolute time. Only in the last 10 minutes does a thin ring appear around the *default*
  button, filling clockwise once per minute step (not continuous). At 0 the default button
  presses itself, slower than a human press (480 ms), so the user sees which option was taken.
  The resolved row then reads "按默认 / By default".
- **Reduced motion:** no ring; the line switches to `decision.minutes_left`; resolution is a
  cross-fade.

### 6. Edge cases

- **Two devices answer the same decision.** C does compare-and-set on the decision version;
  the first answer to arrive wins. The other device's card settles into
  `decision.answered_elsewhere`. If its answer differed and the winner is reversible, it
  offers `decision.change_answer` (one tap) instead of an error [I].
- **The default fires while the user is typing.** If the composer has a draft or the decision
  sheet is open, C extends the deadline once by up to 2 min and shows
  `decision.waiting_for_typing` [I]. If the reply lands after the default fired, M treats it
  as an answer to the same decision: reversible → it undoes and applies the reply; it never
  says "too late".
- **Offline phone.** An answer tapped offline is queued with its version and local time. On
  reconnect: still open at that version → accepted; already defaulted → the card shows what
  happened, with Undo; answered elsewhere → as above. The phone never shows a decision as
  resolved before C confirms; it shows a small "发送中 / Sending" under the pressed button [I].
- **Push already sent, then M or W resolves it.** The pushed text is pinned: the item is
  marked resolved ("它自己好了 / It sorted itself out"), never reworded or removed [doc].
- **Deadline inside quiet hours** (D3): reversible defaults still fire; the push does not.
- **Default would breach a Rule or a policy** (e.g. pushing to an org repo): there is no
  default. W's proposed default is dropped by M and the item reads `decision.no_default_line`.
- **Reply is ambiguous** ("嗯…再说吧"): M treats it as Hold and says so in one line.

### 7. Open questions

See Q1–Q4 at the end (lock-screen buttons, typing grace, Hold semantics, re-ask after 24 h).

---

## D2. Batch harvest after being away

### 1. Scenario card

- **Who:** the heavy developer back from sleep or a meeting, with 6+ tasks in flight; the
  consumer user back from a day out.
- **Feels before:** "what did I miss, and what's on fire?" A small fear of a wall of
  notifications.
- **Feels after:** read one message top to bottom in under a minute, answer two things, go.
  惊喜 at how short it is; 放心 because everything done says how Ducter knows.
- **First time:** the first time the user returns to more than 3 items. No intro; the
  message itself opens with one plain sentence: "你不在的时候：3 件等你，其余都有着落。/
  While you were away: 3 need you, the rest are handled." [I]

### 2. Flow and order

The living message is the last message, `open`, revised in place [doc]. While the user is
away, every typed report folds into it instead of posting a new message.

Order inside the message (refines `conversation.md` [I], adding the default-fired group):
1. **等你 / Needs you**, numbered, each with its default line or `no_default_line`.
2. **按默认做了 / Went with the default**: defaults that fired while away, each with Undo.
   They are not decisions anymore, but the user would want to know first.
3. **停下了 / Stopped**: 没成 / Didn't work, and 在等 / Waiting past its deadline, each with
   its reason in plain words.
4. **做完了 / Done**, one line each with evidence chips; `done?` shows "核对中 / checking".
   More than 3 done items compress into "还有 {n} 件也做完了 / {n} more finished" (expand
   in place).

The example in artboard `DHarvest` (8 items, the user's real work):

| # | Group | Item |
|---|---|---|
| 1 | Needs you | HawDB #1601: push `ducter/compaction-fix` to the org repo and open a draft PR? No default (org repo, ask once) |
| 2 | Needs you | Weekly report draft: lead with the HawDB load-test numbers or the Ducter design progress? Default: load-test numbers at 09:30 · undoable (it's a draft) |
| 3 | Needs you | Competitor research: add the Grok Bot Android app? Default: leave it out at 10:00 · undoable |
| 4 | Went with default | HawDB #1597 rebased onto main at 01:40; CI green after (12/12) · Undo |
| 5 | Stopped | HawDB load test 没成: the same out-of-memory error 3 times on the MacBook. Try again on the Linux box? |
| 6 | Done · checking | English translation of the design notes: finished; checking terms against the glossary |
| 7 | Done | Competitor research report: 14 sources, 2 pages · Open |
| 8 | Done | Routine: Monday dependency bumps: 3 bumps, CI green |

**"Go on all defaults" (都按默认 / Go on all defaults).** In the message header and in the On
hand header [doc]. It applies only items that have a reversible default (here #2, #3). The
button states the count and what it skips: "都按默认（2）· #1 要你亲自定 / Go on all
defaults (2) · #1 needs you". It is disabled when no item qualifies. Typed equivalents: "都好
/ ok to all" = Go on all defaults; "1 好，3 加上 / 1 go, 3 add it" answers per number [doc
grammar, I wording]. A typed "好" alone with several open items is read as Go on all defaults
**only** after M echoes back which items it applied, inline in the message [I].

**Items already seen in a push preview.** Overnight pushes are held (D3), so at 08:00 one
coalesced push may go out (D3 rule). Its text quotes #1's and #2's question lines exactly;
those two lines are now **pinned** [doc]. If #2's default fires at 09:30 before the user
opens the app, #2 is not removed or rewritten. Its line stays word-for-word and gains a
resolved row under it ("到点了，按默认用了压测数据 / Time was up, so I went with the
load-test numbers"). Unpinned items may still be reordered, merged into counts, or updated.

**Seen and frozen.** The message freezes (`seen`) when it has been in a focused viewport on
any device for ≥ 1.5 s, or the user sends anything [doc, `research/16`]. After that, answers
still work on it (buttons are live), but new reports start a fresh message [doc].

### 3. States

| Object | From → To | Actor | Trigger |
|---|---|---|---|
| Living message | (none) → open | C | the first report while no open message exists |
| Living message | open → open (revision) | C | a new or changed typed report; each revision is a superseding Log event [doc] |
| Living message | open → seen | C | read receipt from any device [doc] |
| Item | unpinned → pinned | C | its text was included in a push [doc] |
| Item | open → resolved | U / C / M | answered, default fired, or resolved by the task itself |
| Task (per item) | as in D1, D4, D5 | | |

M writes only the one-line gists; questions, defaults, and evidence come from the typed
report verbatim [doc].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `harvest.opening` | 你不在的时候：{n} 件等你，其余都有着落。 | While you were away: {n} need you, the rest are handled. |
| `harvest.opening_none` | 你不在的时候都顺利，没有要你定的。 | All went fine while you were away. Nothing needs you. |
| `harvest.group.needs_you` | 等你 | Needs you |
| `harvest.group.defaulted` | 按默认做了 | Went with the default |
| `harvest.group.stopped` | 停下了 | Stopped |
| `harvest.group.done` | 做完了 | Done |
| `harvest.more_done` | 还有 {n} 件也做完了 | {n} more finished |
| `harvest.go_all` | 都按默认（{n}） | Go on all defaults ({n}) |
| `harvest.go_all_skips` | #{list} 要你亲自定 | #{list} needs you |
| `harvest.go_all_echo` | 按默认定了 #{list}。#{rest} 还等你。 | Went with the defaults for #{list}. #{rest} still needs you. |
| `item.resolved_itself` | 它自己好了 | It sorted itself out |
| `state.done_checking` | 做完了 · 核对中 | Done · checking |

### 5. Motion

- **Re-settle on revision:** a changed item cross-fades its text (160 ms); an item that moves
  slides to its new place (FLIP, 240 ms, bouncy); a new item grows from zero height (220 ms);
  a compressed group folds into its count line. Nothing flashes or highlights: edits never
  re-notify [doc].
- **Never move a target under a finger:** while a pointer or finger is over the message, or
  within 600 ms of a touch, revisions queue and apply when it leaves [I]. This prevents a
  revision from turning a tap on #2 into a tap on #3.
- **Go on all defaults:** the qualifying cards press in sequence, 70 ms apart, top to bottom,
  then the whole Needs you group compresses into resolved rows. The skipped item stays,
  gently nudged (one 4 px bounce).

### 6. Edge cases

- **Two devices:** the phone shows the message while the desktop also has it open. Receipts
  are per person, so the first focused view freezes it for both [doc].
- **A report lands while the user is reading** (already `seen`): it starts a new open
  message below; the frozen one is untouched.
- **The default for #2 fires while the user is reading #1:** the D1 typing/reading grace
  applies only to the decision being edited, not the whole message. #2 gets its resolved row
  in place without moving #1 [I].
- **Undo on a default that fired overnight but others built on it** (e.g. after the rebase,
  a later task used the branch): Undo becomes a decision itself: "撤销会让 #1604 也要重做，
  还撤吗？/ Undoing means #1604 has to be redone too. Still undo?" [I].
- **Phone offline overnight:** the message is assembled on the control plane; the phone
  fetches it on foreground from its `seq` cursor (`research/21` §5.3).
- **More than ~12 items:** Needs you stays full; every other group collapses to counts with
  "展开 / Open" [I].
- **Two personas:** each persona's conversation has its own living message; On hand
  aggregates [doc]. A single coalesced push may cover both, naming each persona.

### 7. Open questions

See Q5 (item-level vs message-level "seen"), Q6 (the "按默认做了" and "停下了" group names
are new words).

---

## D3. Quiet hours and the escalation ladder

### 1. Scenario card

- **Who:** everyone; most of all the consumer user whose phone is also their alarm clock, and
  the developer who runs overnight tasks on purpose.
- **Feels before:** "if I leave things running overnight, will it buzz me at 3 a.m.? Or will
  it sit stuck all night waiting for me?"
- **Feels after:** work kept moving where it safely could; nothing woke them; one calm
  morning message. And when they said "don't tell me about this", it listened and said
  exactly what it would still tell them. 放心 + 惊喜.
- **First time:** no setup screen. On the first evening the user has a task running past
  23:00 (or after the user's last message of the day, whichever comes first), the partner
  offers a proposal card: "晚上我先替你攒着，早上 8 点一起给你？能自己往下走的照常走。/
  Shall I hold things overnight and give you everything at 8? Anything that can safely carry
  on will." Go creates the user's quiet hours Rule (23:00–08:00 local, editable on the card)
  [I]. Before that, Ducter uses no quiet hours but still coalesces pushes.

### 2. Flow

**What happens to each level during quiet hours** [I]:

| Level | During quiet hours |
|---|---|
| 0–2 | Unchanged (they make no sound) |
| 3 Push | Held. Released at the end as **at most one** coalesced push, and only if a held item is still unanswered and has a deadline within 2 h of the end; otherwise badge only |
| 4 Call | Only if the user-set deadline rule explicitly said "even at night" |
| Reversible defaults | Fire on time; reported in the morning group "按默认做了" |
| Irreversible items | Wait. M never schedules a deadline that falls inside quiet hours for something that would need a push to be fair; it moves the deadline to quiet end + 30 min and says so on the card |

**Climbing the ladder for one item** (example: rebase decision, deadline 21:40, user away
from 20:00):
```
20:05 W asks → M: Needs you ──► level 1 badge + level 2 item (immediately)
20:08 unseen 3 min, not in app, not quiet ──► level 3 push (coalesced with anything in 15 min)
21:40 deadline, reversible ──► default fires; level 2 row "按默认做了"; no second push
(if irreversible: no countdown, no second push; it waits in the morning message)
level 4 only if the user said "call me if …" for this deadline (roadmap)
```
Escalation never repeats a level for the same item: one push per item, ever, unless the
user asked for reminders [I]. A lapsed approval with no safe default becomes a Stopped row,
not a second push [doc, `research/16`].

**"别再告诉我这类事 / Don't tell me about this kind of thing."** It can be said in the
conversation, by long-press (or right-click) on an item → "这类别告诉我了 / Don't tell me
about these", or as a reply to a push.
```
user says it ──► M infers the kind (routine? project? state? task type?) and the narrowest scope
  ──► proposal card: what will change, what still reaches them, scope chips
        ├─ 好 / Go ──► Rule saved with the user's words verbatim; future items of that kind
        │              drop to level 1 (badge) or 0, never below what a decision needs
        ├─ change scope chip (this routine / this project / everything like this) then Go
        └─ 先等等 / Hold ──► nothing changes
```
The floor that no rule can lower: a decision with no reversible default always appears in
the conversation (level 2). A rule can stop its push, never hide it. If a rule asks for that,
the card says so plainly (principle 14: never skip silently) [I].

### 3. States

| Object | Transition | Actor | Trigger |
|---|---|---|---|
| Quiet hours Rule | (none) → active | U | Go on the proposal card, or saying "晚上别吵我" |
| Push | queued → held | C | quiet hours, user active in app, or coalescing window |
| Push | held → sent | C | hold ends and the release condition holds |
| Push | held → dropped | C | item resolved before release (no push for resolved things) |
| Item level | n → n+1 | C | the level's trigger (table above); M may lower, never raise beyond what the report earns |
| Kind rule | (none) → active | U | Go on the "don't tell me" proposal |

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `quiet.propose` | 晚上我先替你攒着，早上 {time} 一起给你？能自己往下走的照常走。 | Shall I hold things overnight and give you everything at {time}? Anything that can safely carry on will. |
| `quiet.band_label` | 安静时段 {start}–{end} | Quiet hours {start}–{end} |
| `quiet.held_count` | 攒着 {n} 件，{time} 给你 | {n} held until {time} |
| `quiet.moved_deadline` | 那时你在休息，我改到 {time} 再定 | You'll be resting then, so I moved it to {time} |
| `push.morning` | 早上好。{n} 件等你，最早的 {time} 到点。 | Morning. {n} need you; the first is due at {time}. |
| `mute.menu` | 这类别告诉我了 | Don't tell me about these |
| `mute.propose` | 以后{kind}做完了我不单独说，只记在手头里。需要你定的时候照样找你。 | From now on I won't mention it when {kind} finishes; it'll just be in On hand. I'll still come to you when you need to decide something. |
| `mute.scope.this` | 只这个{thing} | Just this {thing} |
| `mute.scope.project` | {project} 里的 | In {project} |
| `mute.scope.all` | 所有类似的 | Everything like this |
| `mute.floor` | 要你亲自定的事，我还是会放在对话里，只是不推送。 | Things only you can decide will still show up in the conversation, just without a notification. |
| `rule.saved` | 记下了。规则在这儿，随时改。 | Got it. The rule is here; change it anytime. |

### 5. Motion

- **Forecast band** (On hand, artboard `DQuietForecast`): quiet hours are a soft striped
  band on the timeline. Items whose next "needs you" falls inside it are drawn as pebbles
  **stacked at the band's right edge** (held). Reversible defaults inside it are small ticks
  on the band with their action. At quiet end, held pebbles slide left to "now" (400 ms,
  staggered 60 ms) rather than popping, and the badge updates once.
- **Mute proposal:** after Go, the muted item's row shrinks into a tiny pebble that drops into
  the On hand button (300 ms), showing *where* it will live from now on (concepts shown, not
  explained).

### 6. Edge cases

- **The user opens the app at 03:00:** quiet hours end for that session; everything held is
  shown in the conversation, no pushes. Held pushes for items they saw are dropped.
- **Travel / time zone change:** quiet hours follow the user's current local time
  (personal-time, like routines [doc]); the band redraws and the card says so once.
- **Two personas:** quiet hours belong to the user, not the persona [doc: user owns quiet
  hours].
- **A routine set to report at a time inside quiet hours** ("every morning at 7"): a digest
  the user asked for is always delivered [doc] but silently (level 2), unless the user set
  that time knowingly inside quiet hours, in which case the routine card asks once.
- **Mute too broad:** "别再告诉我 CI 的事" would also hide CI failures that block a decision.
  The proposal card lists what will still reach them (`mute.floor`) before Go.
- **Desktop and phone both online:** a push goes to the device most recently active; never
  both within the coalescing window [I].

### 7. Open questions

See Q7 (v1 top level is push; what may break quiet hours), Q8 (quiet hours proposal timing).

---

## D4. Done with evidence vs done · checking vs failed verification

### 1. Scenario card

- **Who:** the heavy developer most (has been burned by agents that say "done" and aren't);
  the consumer user needs the same honesty in plain words.
- **Feels before:** suspicion. "Done" from an AI is a claim, not a fact.
- **Feels after:** they can see *how* Ducter knows (CI green, the PR, the diff, the file) in
  one glance, and "checking" visibly means "not yet claimed". 放心.
- **First time:** the first finished task. Its row shows evidence chips; tapping one opens the
  exact thing (CI run, diff, file). No explanation needed.

### 2. Flow

```
W reports done + evidence refs ──► C: task → 做完了 · 核对中 / Done · checking (done?)  [badge only]
  C checks refs mechanically (CI green, PR exists, diff non-empty, file exists)
    ├─ a ref fails ──► M: back to 在做 / Working with a follow-up (done? → working, actor M)
    │      card line: "核对没过：{reason}，它接着弄 / Check didn't pass: {reason}; it's back on it"
    │      level 1 only; no message unless the user was told "done?" in a message already [I]
    │      ├─ passes next time ──► done
    │      └─ fails verification 3 times ──► M: Needs you (or Didn't work if hopeless) [I]
    └─ refs ok ──► M judges against the brief's done-criteria
           ├─ meets them ──► 做完了 / Done (level 2 row, evidence chips; face nods)
           ├─ fixable gap ──► back to Working (as above)
           └─ needs human judgment (taste, product call) ──► Needs you:
                  "看着对吗？/ Does this look right?" + the result, default "就这样 / Keep it"
                  reversible (marking done is reversible), deadline next morning [I]
```

What counts as evidence [I, from the typed report's `evidence[]`]: a CI run, a PR or diff
link, a file or Result, a test output excerpt, a screenshot, a source list. M's own judgment
is never shown as evidence. When the only check is M reading it (research, writing), the row
says so: "我通读过了 / I read it through" next to the source chips, so the user sees the
difference between "the CI says so" and "I think so".

### 3. States

| From | To | Actor | Trigger |
|---|---|---|---|
| Working | Done · checking (`done?`) | W → C | W reports done with refs [doc] |
| `done?` | Done | C + M | refs pass and M judges criteria met [doc] |
| `done?` | Working | M | insufficient but fixable [doc] |
| `done?` | Needs you | M | needs human judgment [doc] |
| `done?` loop ×3 | Needs you / Didn't work | M | verification keeps failing [I] |
| Done | Working | U / M | a follow-up, even days later; same task reopens [doc] |

C never guesses done: no report → nudge → stall rule [doc].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `state.done` | 做完了 | Done |
| `state.done_checking` | 做完了 · 核对中 | Done · checking |
| `done.check_failed` | 核对没过：{reason}，它接着弄 | Check didn't pass: {reason}; it's back on it |
| `done.check_failed_again` | 核对 {n} 次都没过。{reason}。你看怎么办？ | It didn't pass {n} checks. {reason}. What would you like to do? |
| `done.judge_ask` | 看着对吗？ | Does this look right? |
| `done.judge_keep` | 就这样 | Keep it |
| `evidence.ci` | CI 绿了 · {passed}/{total} | CI green · {passed}/{total} |
| `evidence.pr` | PR #{n}（草稿） | PR #{n} (draft) |
| `evidence.diff` | 改了 {n} 个文件 | {n} files changed |
| `evidence.sources` | {n} 个来源 | {n} sources |
| `evidence.read_through` | 我通读过了 | I read it through |
| `evidence.result` | 成果：{name} | Result: {name} |

### 5. Motion

- **Working → checking:** the pebble keeps its blue but gains a slow green fill rising from the
  bottom (the "not yet" look), no nod.
- **Checking → done:** the fill completes, the pebble turns done-green, the face nods once,
  evidence chips pop in left to right (60 ms stagger).
- **Checking → back to working:** the green fill drains (300 ms) and the line
  `done.check_failed` fades in. No shake, no red: it is not a failure.

### 6. Edge cases

- **CI passes but the PR is closed by someone else meanwhile:** the ref check fails → M
  reports what changed, not "done".
- **Evidence goes stale later** (CI re-runs red after a dependency bump): Done does not
  silently revert. M posts a new item "{task} 之前绿的，现在红了 / {task} was green, now it's
  red" with a decision to reopen (default: reopen, reversible) [I].
- **Two devices:** the done row is the same everywhere; nothing to answer.
- **Pushed "done"?** Never. Done is level 2 at most [doc: only decisions earn a push].
- **User marks done themselves** ("这个就算好了 / call this done"): M sets Done with evidence
  `user said so`, shown as "你说可以了 / You said it's good".

### 7. Open questions

See Q9 (verification loop cap, and whether "checking" is shown in the conversation at all or
only on cards).

---

## D5. Failure (didn't work) and stall

### 1. Scenario card

- **Who:** the heavy developer whose overnight build OOMs; the consumer user whose browser
  task hit a wall.
- **Feels before:** frustration, and the worse feeling of not knowing whether it is still
  trying or quietly died.
- **Feels after:** it stopped wasting effort, said plainly what went wrong in their words, kept
  what was done, and offered one sensible next step. For a stall: "it noticed before I did,
  looked into it, and only asked me what it couldn't decide." 放心.
- **First time:** the first failure arrives as a Stopped item with a "try again on …" offer;
  the first stall is usually invisible (the partner fixes it), so the first visible one is a
  stall the partner couldn't resolve.

### 2. Flow: failure

```
C: same normalized error N=3 times (circuit breaker) | environment unrecoverable | W reports failed
  ──► task → 没成 / Didn't work (terminal; actor C or W) [doc]
  ──► M writes the item: what it tried · the error in plain words + exact excerpt (mono) ·
      what is kept (branch, checkpoint, partial results) · one recommended next step
  level 2 (message); level 3 only if it breaks a deadline the user set
  user:
    ├─ 再试一次 / Try again (or named: "换 Linux 那台再试 / Try again on the Linux box")
    │     ──► M opens a NEW task from the old checkpoint + a brief that names the failure;
    │         old card stays 没成 with "再试的那件 → / The retry →"; new card says
    │         "接着 {old} 再试 / Retrying {old}" [doc: a retry is a new window]
    ├─ 放下 / Drop ──► old task stays 没成 (already terminal); archived lazily
    └─ 回复… / Reply… ──► M steers the retry brief or answers
```
No automatic retry by default: retries cost quota and can repeat an effect. A Rule can allow
it ("没成就换台设备自动再试一次 / If it doesn't work, try once more on another device") [I].

### 2b. Flow: stall

```
C: task Working, no events for T_stall (default 20 min [I]) and no waiter ──► notifies M [doc]
  task state does NOT change; card shows a quiet line "我去看看 / Looking into it" (level 0–1)
  M climbs the ladder: card → last report → transcript slices → ask the task → open it [doc]
    ├─ it's fine (long build still printing to its log, not as events) ──► M registers a
    │     waiter on the build; card: "在等全量编译跑完，约 40 分钟 / Waiting for the full build, ~40 min"
    ├─ stuck on something M can answer (a prompt the harness is waiting on) ──► M steers;
    │     user sees one line on the card afterwards, nothing in the message [I]
    ├─ unrecoverable (session dead, machine gone) ──► handoff to a new task (superseded) or Didn't work
    └─ needs the user (the fix touches their stuff) ──► Needs you, as a message that shows
          what it checked, what it found, and one decision (artboard DStall)
```

### 3. States

| From | To | Actor | Trigger |
|---|---|---|---|
| active | Didn't work | C / W | circuit breaker, unrecoverable env, or W reports failed [doc] |
| Didn't work | (new task) Queued | U → M | Try again: a new task, linked both ways [doc] |
| Working | Working (stall noted) | C → M | no events for T_stall, no waiter [doc] |
| Working | Waiting | M | investigation finds a legitimate wait; M registers a waiter [I] |
| Working | Needs you | M | investigation needs the user |
| Working | Superseded | C | handoff to a successor [doc] |

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `state.failed` | 没成 | Didn't work |
| `failed.summary` | 没成：{reason} | Didn't work: {reason} |
| `failed.breaker` | 同一个错误连着出了 {n} 次，我先让它停下，免得白费。 | The same error came up {n} times in a row, so I stopped it rather than waste effort. |
| `failed.kept` | 做到一半的都留着：{refs} | Everything so far is kept: {refs} |
| `failed.retry` | 再试一次 | Try again |
| `failed.retry_named` | 换{device}再试 | Try again on {device} |
| `failed.retry_link` | 再试的那件 | The retry |
| `failed.retry_of` | 接着「{task}」再试 | Retrying "{task}" |
| `failed.drop` | 放下 | Drop |
| `stall.looking` | 我去看看 | Looking into it |
| `stall.opening` | {task} {n} 分钟没动静了，我去看了一下。 | {task} went quiet for {n} min, so I took a look. |
| `stall.checked` | 我看了 | What I checked |
| `stall.fine_waiting` | 没卡住，在等{thing}，大概 {n} 分钟 | Not stuck: waiting for {thing}, about {n} min |
| `stall.unstuck` | 它刚才卡在{thing}，我替它答了，又动起来了 | It was stuck on {thing}; I answered for it and it's moving again |

### 5. Motion

- **Breaker trip:** the working pebble's glance-aside stops; it settles flat (200 ms) and turns
  failed-rose. No shake, no alarm red flash.
- **Try again:** a new pebble splits off the failed one and rolls into the Working lane
  (400 ms); a thin dashed thread links them for 2 s, then the link stays as a chip.
- **Stall investigation:** the face looks toward the stalled task's pebble while M climbs the
  ladder; the pebble gets a soft dotted halo ("looking"). No progress bar.

### 6. Edge cases

- **Flaky error, not the same each time:** the breaker counts normalized signatures; different
  errors don't trip it, but `until`'s no-progress rule may [doc §4].
- **Failure while a decision is open on the same task:** the decision is resolved as "没用了
  / No longer needed" (pinned text untouched if pushed) and the failure item replaces it.
- **Retry tapped on two devices:** compare-and-set on the failed task; only one retry task is
  created; the other device shows "已经在 {device} 上重试了 / Already retrying from {device}".
- **Offline device caused the stall:** residency `offline` is not a stall; C's offline path
  applies (A3), the card says the device is unreachable [doc invariant 1].
- **Stall during quiet hours:** M investigates as usual; a Needs-you outcome is held per D3.
- **Main AI itself unavailable (quota):** C still marks the stall in the Log; the card shows
  "{persona} 一会儿去看 / {persona} will look shortly" and the investigation resumes when the
  main AI reserve allows (`product-model.md` §5 quota reserve) [I].

### 7. Open questions

See Q10 (breaker N and T_stall values), Q11 (retry default).

---

## Open questions (all need the user; proposed default first)

| # | Question | Proposed default | Why it matters |
|---|---|---|---|
| Q1 | iOS Home-Screen web push most likely shows **no action buttons** on the lock screen [I, not verified]; Android Chrome can. Accept tap-to-open-sheet on iOS for v1? | Yes. Push body quotes the question + default line; tap opens `DDecisionSheet`; Go/Hold buttons on Android only. Native app (D35) adds lock-screen actions | Decides whether "act on a lock-screen notification" (H3) is v1 |
| Q2 | Typing grace before a default fires | One extension of up to 2 min, shown in words | Prevents "it fired while I was answering" |
| Q3 | Hold = cancel default and wait indefinitely, or snooze to a new time? | Cancel and wait; Reply can set a time ("明早再说") | Hold must never silently turn into Go later |
| Q4 | Re-ask an irreversible open item after 24 h? | Once, inside the next living message, never as a push | Avoids forgotten items without nagging |
| Q5 | "Seen" per message or per item (an 8-item message only half scrolled)? | Per message for freezing; per item for pinning only via push | Simpler; revisit if users miss bottom items |
| Q6 | New user-facing words not yet in the glossary: 按默认做了 / Went with the default · 停下了 / Stopped · 都按默认 / Go on all defaults · 撤销 / Undo · 安静时段 / Quiet hours · 核对没过 / Check didn't pass · 再试一次 / Try again · 放下 / Drop · 证据 chips | Add all via the change loop (D-entry + glossary) before any artboard is reviewed | AGENTS rule: every user-facing word in the glossary |
| Q7 | v1 has no calls (D35). What may break quiet hours in v1? | Nothing by default. Only a user-set deadline rule that says "even at night" sends a push inside quiet hours | Keeps "it never woke me" absolute |
| Q8 | Quiet hours: offered on the first late evening vs a fixed default from day one | Offer on the first evening; coalescing only until then | Zero setup, but the first night is covered |
| Q9 | Verification loop cap; show "checking" in the conversation? | Cap 3; "checking" appears in the conversation only inside a living message (never as its own message) | Honesty without noise |
| Q10 | Breaker N and T_stall | N = 3 same signature; T_stall = 20 min, longer when the task declared a long step | Tune from logs |
| Q11 | Should a failure with an obvious fix (other device free) carry a reversible default to retry? | No default in v1; a Rule can opt in | Retries spend quota and may repeat effects |
| Q12 | "Go on all defaults" via a bare typed "好" when several items are open | Allowed, but M echoes exactly which items it applied, with Undo | Fast path vs. misread risk |

## Artboards (flows canvas, prefix D)

| File | Size | Shows |
|---|---|---|
| `DLockPush.dc.html` | phone 390×844 | Lock-screen-style coalesced push quoting the decision line exactly |
| `DDecisionSheet.dc.html` | phone 390×844 | The in-app decision sheet opened from that push, countdown ring in the last 10 min |
| `DHarvest.dc.html` | desktop 1440×900 | Morning living message with 8 items, groups, Go on all defaults, a pinned item resolved by default |
| `DQuietForecast.dc.html` | desktop 1440×900 | On hand forecast band with quiet hours, held pebbles, defaults inside the band, a "don't tell me" rule card |
| `DDoneCards.dc.html` | desktop 1440×900 | Done with evidence · Done checking · Check didn't pass · Didn't work, side by side |
| `DStall.dc.html` | phone 390×844 | Stall investigation message: what was checked, what was found, one decision |
