# Conversation Surface: Jobs and the Living Message

> Design note for principles 6, 7 · Evidence: `research/16`, `research/01`.

## Turn protocol (principle 6)

The human sees one conversation: text now, voice later. Focus Windows are hidden unless the
human opens them.

1. **Ack.** One sentence that names the *action* ("I'll check the CI"), never the outcome, and
   may say it will report back and, when something grounds it, how long it usually takes
   (D120). OpenAI documents that models invent results for calls still pending. The task starts
   with the ack, from the streamed head of its `task_open` call, not after the brief
   (`quiet-conversation.md`).
2. **Job.** Kept as a status line by the control plane, shown inside the message's Details and
   on On hand (D104); while the user waits, the partner's step shows as the waiting line. A
   cheap model may write the line. The main AI sees each open job as an explicit pending
   marker.
3. **Result.** A new message replying to the ask, rendered from the job's typed report.

**The result's anatomy (D60, D104).** The partner's words are the outcome only, in the user's
terms, plus what was left out and what is unverified. Everything else is rendered by the client
from the typed report and sits behind one quiet row under the words (D104): what went out (↗,
only when something did, never folded), then 合进 main / Merge into main as a text button and
看细节 / Details, which opens 怎么知道的 / How I know, the changes, 开草稿 PR / Open draft PR and the
reply's 记下了 / Noted lines in place. The partner never restates them in prose. **Words freeze,
details live:** the message text never changes once sent; what Details shows is a live view of
typed state (checking → done, a PR merged); a change of *meaning* is a new message. Full
anatomy: `flows/I-results.md` §0; the conversation's look: `quiet-conversation.md`.

**The partner's voice (D129).** Everyone reads the conversation as messaging a partner, including
people who never wrote code: short, plain, warm, one idea per message. No file or repo paths,
bundle or app ids, branch or commit ids, tool or agent names in what the user sees, unless the
user used them first or asked; a number or a name only when it helps them decide or act. An
ask's question is the choice in one everyday sentence, plus one only to say what can't be
undone; its Go button is the action ("好，创建"). A result leads with the outcome, then at most
one line of what's next; what is left for the user is a count and a place, never a list of terms.
A task's question reaches the user only through the partner, in its own words (`ai_msg` with
`decisionId`); the task's wording is in Details. The brief to a task keeps every detail. Look:
`quiet-conversation.md`.

**The zh copy, read against the humanizer standard (D129)** (old → new):
这件不会自己动，等你定 → 你说好，我再做。 · 你不回的话，{t}后我会{action}，之后也能撤销。 →
{t}后你没回，我就{action}，之后还能改回来。 · 你不回的话，我会先停着等你。 → 你没回之前，我先放着。 ·
马上按默认做 → 这就照原计划做 · 已经说好 → 你说：{Go 的字} · 先等等了 → 你说：先等等 · 已回复：{x} →
你说：{x} · 按默认做了 → 你没回，我照原计划做了 · 回复这件事… → 说说你的想法… · 在看那件事做到哪了… →
在看做到哪了… · 在跟那件事说… → 在把你的话带过去… · 不确定做成没有，看一下 → 不确定成没成，你看一眼 ·
说一句话就能开始。要做的事交给我，需要你的时候我会来问。 → 想做什么，跟我说一句就行。需要你的时候，我会来问你。 ·
手头没事。在对话里说一句，{name} 就会接着做。 → …{name} 就去做。 · 算到了：{x} → 等到这个就算：{x} ·
the Details setting's note and the first-result line, reworded. New: …我就接着做… (an ask with no
named action), 在看它想问你什么…, 它的原话：{x}.

**Asks (D67).** An ask about how to do the work (reversible) always carries a default and a
time, 10 min unless the work suggests otherwise; only effect-ladder asks (`flows/G-safety.md`
§0) may wait without one.

**Executors.** All three return the same report, so they look the same to the human.

*As built, only two executors run: the main AI in turn, and a task (Focus Window). Forks and
promotion are not built.*

| Executor | Use when (starting budget; logged and tuned) |
|---|---|
| Main AI, in turn | no environment, read-only, ≤3 calls, ~10s |
| Fork (side context sharing the cache) | read-only, ≤ ~2 min |
| Focus Window | needs an environment, writes, runs longer, or will take follow-ups |

- **As built: the in-turn executor is read-only** (`SessionSpec.readOnly`, set only by the
  partner; `packages/runner/src/oar.ts`). Claude Code: Bash, Edit, Write, MultiEdit,
  NotebookEdit and subagents are denied; Read, Grep, Glob, WebFetch, WebSearch and Ducter's tools
  stay, and a file read over 8k tokens is refused so it is read in parts. Codex: its read-only
  sandbox (shell still runs, read-only, no network); Ducter's tools are marked read-only for that
  session so Codex runs them. pi (D177): an allowlist, `--tools read,grep,find,ls,mcp__*`, with
  bash, edit and write also excluded by name. DeepSeek Harness (D177): the partner's
  Ducter-owned home carries a profile layer that drops every tool that runs, writes, delegates or
  plans (read, glob, grep, web search and fetch stay), with DSH's read-only sandbox preset
  underneath. Both checked live: asked to write a file and to run a command, neither could
  (research/50 §2; before D177, DeepSeek Harness did both). Evals:
  `packages/partner/eval/results/2026-11-09-haiku-readonly-smoke.md`,
  `2026-11-10-codex-gpt-6-luna-readonly-smoke.md`, and the full runs on pi and DeepSeek Harness
  (research/50 §5).
- **Promotion.** A fork that outgrows its budget becomes a window seeded with a brief plus
  the fork's checkpoint. The fork itself does not continue, so a long job never carries the
  whole channel.
- **Follow-ups** while a job runs are steered in or queued, and the sender gets a receipt.
  After a job, a follow-up goes to the same task only when it builds on that task's unmerged
  change; anything else opens a new task, and a task is retitled when its job changes (D67).
  "Never mind" cancels the job.
- **Models.** Text uses one model. Voice adds a realtime front-end limited to an allow-list,
  which escalates to the main AI and logs every utterance (OpenAI's chat-supervisor
  pattern). A fast decision model (e.g. Jev/Kev class) may run the gates: attention tagging,
  the recall precision gate, and the voice escalation gate.

## Replies: answering one message (D236)

Evidence: `research/71` (T3 Code, Lorca, messaging apps), `research/72` (the look). Context:
`context.md` "Replies".

**The moment.** Three things came back at once, or the user wants to answer something from this
morning, not the latest line. They point at that message and say one line; it goes where it
belongs. Two or three replies in a row each keep their own subject. A fresh user needs nothing to
learn: the gesture is the one their thumb already knows.

**What can be replied to.** Any bubble in the conversation: the partner's words (a result, an
ack, a task's question in its words), the user's own message, a message with pictures, and each
find of a note (D165) on its own. Not a card's buttons, not a status line.

**Gestures.** Phone: swipe the bubble right (it starts at 14pt, arms at 56pt with a light haptic,
gives way to a scroll on 10pt up, down or left, and never starts within 28pt of the left edge, the
back gesture); long press opens **回复 / Reply · 复制 / Copy**. Wide screen with a mouse: a round
Reply beside the bubble on hover, right click for the same menu, and a selected part of the
partner's words offers **回复这段 / Reply to this part**. Mac: hover Reply. Esc or the × puts a
reply away (**不回复了 / Cancel reply**).

**The look: the imprint (research/72).** The message replied to appears as a small copy of its
own bubble (its voice's colour, its tail corner) pressed into the reply like a pebble into clay:
in the composer while writing (with the drawn reply mark beside it and the placeholder **回复
{who}… / Reply to {who}…**), inside the top of the sent bubble after. Its first line is literal:
**Ducter** (the persona's name) or **你 / You**; then at most two lines of the quote; a part the
user picked is in quotation marks. Tapping it brings the original into view and finds it: its own
tint deepens once and settles (never a glow ring). One no longer on this screen says **那条在更早的
对话里，这里翻不到了。/ That message is further back than this screen goes.**; the reply's own quote
still reads. A partner answer that lands after other messages carries, as a tab above its bubble,
the imprint of the user's reply it answers, pressed into the top of its bubble, so two answers in a row never look swapped; an answer right after its reply carries none (adjacency already says it). The imprint is debossed (shadow under its top and left rims, a lit lower edge, its floor a little below the bubble's colour, no border line): the pressed twin of a raised clay button. Its quote is one step smaller (12) and quieter than the words, its who-line 11.

**Routing (core decides what code can; the partner the rest).**
- A reply to a task's question (or the partner's own ask) that is still open **is its answer**:
  core resolves it as Reply with the words, exactly as the card's 回复… does, and the task hears it
  (decision_resolved carries the reply's seq; the card shows it answered, the words stay in the
  bubble). The partner is told it was already passed on and sends nothing.
- A reply to a message about a task (its ack, its result, its question once answered): the
  partner reads which task and where it stands; more of that work goes to that task (task_send)
  even when another task spoke last, unless its work was merged (D67's rule 2d: a new task).
- A reply to a find: about that find only; doing it is work like any other (a task).
- A reply to the user's own message or any plain message: conversation about that message.
- **No cross-talk.** Replies to different messages are separate partner turns, each answering its
  own; a turn never sees the next reply as history. Each answer replies to its own message.
- **A reply never branches.** No fork, no new session, no side thread; it is one message in the
  one conversation (principle 6).

**Voice.** The partner never repeats the quote and never says the user replied ("关于你回复的那
条"): it just answers. Its one line for a follow-up names the action, as any follow-up does.

## The living message (principle 7)

| State | Meaning |
|---|---|
| `open` | Unread and always the last message; at most one exists. Revised in place. |
| `seen` | A read receipt arrived. Frozen; anything new starts a fresh message. |
| `superseded` | Replaced by a newer version (a Log event). |

**Content and order** (shown per D104, `quiet-conversation.md`)
- Rendered from typed reports, never paraphrased by a model.
- The typed items keep this order: `needs-you` items first, each with its default; then
  blocked items with their reasons; then successes, one line each with evidence links.
- Shown: what didn't work (and successes the partner didn't report) as sentences first, then
  the asks, one at a time with the soonest default leading; blocked and progress items are not
  shown unless Details in the conversation is Shown.
- A default applies on its own only if the action is reversible.

**Honesty rules**
- Edits never re-notify.
- An item already shown in a push preview can be marked resolved, but never reworded or
  removed.

**Push**
- Only `needs-you` or urgent items get a push.
- Pushes are coalesced and held while the human is in the app.
- Escalation goes badge → message → push → call. Each level has an explicit trigger.
- The human can say "don't tell me about this kind of thing". That becomes a ledger
  constraint.

**Mechanics (as built)**
- The core renders the living message (`packages/core/src/living.ts`) from task cards,
  reports and decisions; each revision is a superseding `living_msg` Log event, and a read
  receipt freezes it.
- The partner's own words are never revised: an `ai_msg` is immutable once logged. Only the
  core-rendered living message changes in place.
- Not built: revising inside the partner's session (truncate to before the message, then
  append the new version).
