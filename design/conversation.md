# Conversation Surface: Jobs and the Living Message

> Design note for principles 6, 7 · Evidence: `research/16`, `research/01`.

**One conversation per partner, listed as chats (D513).** The conversation is a messaging app's
chat with one partner. With more than one partner the person sees them listed as a messaging app
lists its chats (a column at the conversation's left on a computer, the level above it on a phone,
`personas.md` "Switching"); each conversation stays its partner's own (D24), and its bar speaks for
that partner only. Switching is instant (D541): each partner's conversation is held with its place
and draft, and comes back in the next frame. With one partner there is no list and nothing about partners shows.

## Turn protocol (principle 6)

**Language (D292, research/99).** The partner answers in the language of the person's latest
message, any language; each turn names it (`[language] … Korean (한국어)`), a message with none of
its own (OK, a number, an emoji, code) keeps the conversation's, and the conversation's is read
from the Log, so a restart keeps it. A fixed **Replies in** language wins. Tasks report in it (the
task's `language` tag), and a result said in another language is held back and said again once
(D154). Lines Ducter's code writes itself come from zh/en tables through the fallback chain.

**How the partner speaks (D491).** Written as behaviour, not adjectives, at the top of the
persona and held for every reply: the reply's size follows the question's weight (a status or a
yes/no is one sentence, a result or a choice one or two, more only for depth asked for); the
answer comes first, with no lead-in, recap or closing line; a question only when the person's
answer changes what happens and nothing in view settles it, then one; never an offer of what a
task, a wait, a card or Ducter is already doing; one subject per reply. The lines Ducter writes
for the partner say whose a thing is (a task's own wait that ended is the task's to redo), and a
line that is not a question never reads as one (the checkout's pay card asks for the person; a
blocked task asks nothing).

**Ducter's own traffic is not a line (research/244 rule 2).** A hand-over or a reply between
Ducter's own partner, tasks and helpers is never drawn in the conversation: no **已回复 / Replied to**
marker, no **从…来的 / From…** origin line, and no ack turn. The giver is the task or the partner by
name, never 你 / you. Agents Ducter didn't start keep their markers, with the peer's real name.

The human sees one conversation: text now, voice later. Focus Windows are hidden unless the
human opens them.

1. **Ack.** One sentence that names the *action* ("I'll check the CI"), never the outcome, and
   may say it will report back and, when something grounds it, how long it usually takes
   (D120). OpenAI documents that models invent results for calls still pending. The task starts
   with the ack, from the streamed head of its `task_open` call, not after the brief
   (`quiet-conversation.md`).
   **Lines around calls, and promises (D462, D490).** Where a line stands decides what it is, never
   its words: before `task_open` or `task_send` it is the ack; before any other call that does
   something it waits, and a line written after the call says it instead (Codex writes a preamble
   before nearly every call; the persona says so as a fact); before a lookup, or a call whose own
   card is what the person sees (ask, routine_propose), it goes out first. A turn's task opens share
   one ack (D512): opens made together (parallel calls) take the line before them, or the first one's
   title when there is none; a later open with no line of its own gets its job line and no words. A line that promises to come back later carries
   the partner's own **[[later]]** mark (hidden). With nothing in that turn that brings it back (a
   task opened or sent to, a wait, a routine, a card), it is held for one correction round that asks
   for the call (its line then goes out as that call's ack) or an "OK" (it goes out as it was).
   One turn never says the same line twice (D570): words already said this turn, as a message or
   an ack, are not said again (the correction's call took the held line, then the model wrote it again).
   Kept by tasks, the promise is recorded (state.json, five at most, three days) and shown as a fact
   (`[what you told them you'd come back to them with; still owed]`) on the turn one of its tasks ends
   in and whenever the person writes, until a turn after its tasks ended has said something. No code
   reads the words for a promise (D490 retired `PROMISE_RE`). Each of the
   agent's own messages stays its own line (the runner splits text by the agent's message id),
   and a ducter-ui block written as a message of its own, or bare, or after words on the same
   line, joins the line it belongs to.
2. **Job.** Kept as a status line by the control plane, shown inside the message's Details and
   on On hand (D104); while the user waits, the partner's step shows as the waiting line, acted
   out by the clay partner in the person's words (D425, `quiet-conversation.md`). A
   job's status line may be a cheap model's; the waiting line is written by code from the call,
   never a model (D425). The main AI sees each open job as an explicit pending
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
{t}后你没回，我就{action}，之后还能改回来。 · 你不回的话，我会先停着等你。 → 你没回之前，我先放着。 (D482: each default now starts 不回的话，…: 不回的话，我先放着，等你回。) ·
马上按默认做 → 这就照原计划做 · 已经说好 → 你说：{Go 的字} · 先等等了 → 你说：先等等（D482: 你说：先不用） · 已回复：{x} →
你说：{x} · 按默认做了 → 你没回，我照原计划做了 · 回复这件事… → 说说你的想法… · 在看那件事做到哪了… →
在看做到哪了… · 在跟那件事说… → 在把你的话带过去… · 不确定做成没有，看一下 → 不确定成没成，你看一眼 ·
说一句话就能开始。要做的事交给我，需要你的时候我会来问。 → 想做什么，跟我说一句就行。需要你的时候，我会来问你。 ·
手头没事。在对话里说一句，{name} 就会接着做。 → …{name} 就去做。 · 算到了：{x} → 等到这个就算：{x} ·
the Details setting's note and the first-result line, reworded. New: …我就接着做… (an ask with no
named action), 在看它想问你什么…, 它的原话：{x}.

**Asks (D67).** An ask about how to do the work (reversible) always carries a default and a
time, 10 min unless the work suggests otherwise; only effect-ladder asks (`flows/G-safety.md`
§0) may wait without one. **A card whose Go deletes, wipes or throws something away never has Go
as its default (D340):** whoever made it (the partner's ask or a task's question), its words
decide (`packages/protocol/src/destructive.ts`), it waits on Hold, with no time.

**Ask me later (D382, research/151).** An ask can be put off to a time: **晚点再问我 / Ask me
later** on the default's own line opens the times as chips (今晚 20:00 · 明早 {end of quiet hours} ·
下周一 · 选个时间…) and one line, **到时再问你。在那之前，什么都不做。** Put off, the card says
**{time} 再问你** with **现在就定 / Decide now**, leaves 待你处理 and the living message, and its
countdown stops; at its time it is back once (**你说晚点再问，现在来问你。**) and pushed by the usual rules (in
quiet hours with the morning's one notice). No default runs on it until it is seen: its countdown
starts, with its first length, at the first read past its return on any client.
No partner turn. Not on a card whose moment is the point (`laterable`).

**In a chat app (D276, `channels.md`).** Telegram and Slack are more windows on this one
conversation: a turn started there gets its ack, result and asks there, the job as one status
message edited in place, and anything new as a new message; what Ducter starts itself goes only
to where the person last spoke.

**Executors.** All three return the same report, so they look the same to the human.

*As built: the main AI in turn, a task (Focus Window), and one kind of fork, the quick web look
(D380). General forks and promotion are not built.*

| Executor | Use when (starting budget; logged and tuned) |
|---|---|
| Main AI, in turn | no environment, read-only, ≤3 calls, ~10s |
| Fork (side context sharing the cache) | read-only, ≤ ~2 min |
| Focus Window | needs an environment, writes, runs longer, or will take follow-ups |

- **As built: the in-turn executor is read-only** (`SessionSpec.readOnly`, set only by the
  partner; `packages/runner/src/oar.ts`). Claude Code: Bash, Edit, Write, MultiEdit,
  NotebookEdit and subagents are denied; Read, Grep, Glob and Ducter's tools stay, and a file
  read over 8k tokens is refused so it is read in parts. Codex: its read-only sandbox (shell
  still runs, read-only, no network); Ducter's tools are marked read-only for that session so
  Codex runs them. pi (D177): an allowlist, `--tools read,grep,find,ls,mcp__*`, with
  bash, edit and write also excluded by name. DeepSeek Harness (D177): the partner's
  Ducter-owned home carries a profile layer that drops every tool that runs, writes, delegates or
  plans (read, glob and grep stay), with DSH's read-only sandbox preset underneath. Both checked live: asked to write a file and to run a command, neither could
  (research/50 §2; before D177, DeepSeek Harness did both). Evals:
  `packages/partner/eval/results/2026-11-09-haiku-readonly-smoke.md`,
  `2026-11-10-codex-gpt-6-luna-readonly-smoke.md`, and the full runs on pi and DeepSeek Harness
  (research/50 §5).
- **No web in turn (D378).** The in-turn executor has none of its harness's own web tools on any
  harness (`SessionSpec.noWeb`: Claude Code denies WebFetch and WebSearch, Codex runs with
  `web_search="disabled"`, DeepSeek Harness's partner home drops `tool-web`, pi has none). What a
  site or the web says now never reaches the one that holds the conversation, and no turn waits on
  the network. Stable facts it knows, its own tools and the person's connected accounts stay in turn.
- **The quick web look (D380), the first fork.** ONE live fact (the weather, the latest version,
  one price or score) is `web_look`: the turn ends at once; beside it, a short session holding only
  the agent's own web tools (`SessionSpec.webOnly`, harness-facts `webLook`: Claude Code
  `--tools WebSearch,WebFetch`, no MCP, the clean setup; DeepSeek Harness a home with only
  `tool-web`; Codex and pi not offered) runs on the fast model (Claude Code: haiku) under a hard
  30 s budget and hands back one JSON line that Ducter checks and clips (an answer of at most 200
  characters, up to 3 http(s) sources, a confidence, or why it isn't settled). No memory, no
  accounts, no Go cards, nothing of the person's in its folder. The Log keeps `web_look` (looking,
  then found or unsettled), which wakes the partner with the answer fenced as data; it says it in
  one line naming the site. The waiting line **在网上查：{question} / Looking it up on the web: {question}** (D425) stays from
  the ask to the answer; no card, no row in On hand. A look that can't settle it (time, sources
  that disagree, a page to read, a sign-in, nothing found) is handed to a browsing task, whose
  ack says so. Everything more than one fact (a page or link, comparing, today's discussion, a
  sign-in, acting on a site) is a browsing task from the start. Measured on this Mac
  (research/149): 18–25 s a look on haiku, about $0.04–0.07 each.
- **Promotion.** A fork that outgrows its budget becomes a window seeded with a brief plus
  the fork's checkpoint. The fork itself does not continue, so a long job never carries the
  whole channel.
- **Follow-ups** while a job runs are steered in or queued, and the sender gets a receipt.
  After a job, continuity first (D373): a follow-up carries the task it follows on, done or
  failed, in its own session and place (the same errand or goal, building on what it found or
  changed, needing its sign-ins, files or branch); errands as well as code. Each user line names
  the task the talk was on just before it (`(just before this: task …)`, the last task opened,
  finished or continued in the conversation, within 12 h), and adds that a follow-up's line says
  the change itself, never the task (D581); `task_send`'s answer says the same for a line after
  the call, and that a widened task is retitled; the first `task_open` of a turn whose
  message follows a finished task is asked back once. Separate work, work after a merge, or a
  new one the user asks for ("开个新的") opens a new task; a task is retitled when its job
  widens (D67). A task taken up again goes back under the follow-up's own line (its ack and a
  `job_status` with the same task), so the conversation shows it under the newest ask and On
  hand keeps one card. A follow-up that needs another computer (D376: the person names it, or it
  asks for their own account and only another computer browses in their Chrome) moves the same
  task there first (`task_switch` with `device`; its brief, checkpoints and last report go with
  it), asked back once by code when the words want their account and the task's computer lacks
  it. Work the person did by hand in their own Claude Code, Codex or pi on the home ("接着我终端里
  那个 Claude 在做的") is found and carried on as a task (`own_session_find`,
  `own_session_continue`; `past.md`).
  "Never mind" cancels the job.
- **Models.** Text uses one model. Voice adds a realtime front-end limited to an allow-list,
  which escalates to the main AI and logs every utterance (OpenAI's chat-supervisor
  pattern). A fast decision model (e.g. Jev/Kev class) may run the gates: attention tagging,
  the recall precision gate, and the voice escalation gate.

## Several things in one message (D426)

*Who and how it starts (research/175):* anyone who writes the way people write to a colleague,
several things in one message ("看看我下周有什么预约，再把这三个记进日历"; "修了 #10559 #10560 #10571，再查下
main 的 CI"). Nothing to address or tick: the first time, they see their own words come back under their
message as a few lines, each with a mark that changes as it gets done. Before D426 one task took the
whole message and came back as one blob (「三项安排也都没写入」), or one errand was cut into four tasks.

- **No new object, no new word.** What the person asked, in their own short words, is a row of the
  task that does it (`task_open` / `task_send` `asks`). How many tasks run them is the partner's
  choice, by place, never by thing: things that share a browser, a sign-in, a phone or one repo change
  run in one task with all their lines; things elsewhere run in a task each, under one group (D360).
  One goal told in several clauses (a trip; one fix) is one task with no lines.
- **Under the message.** One small card hangs from the person's bubble, on its side: a row per thing,
  its drawn mark (the tick, working bars, flag and cross of On hand's groups), the person's words, one
  muted note under them (what came of it, from the task's report; else **等你定一下 / Needs you** or
  **没做成 / Didn't work**). From four lines, once something is done and something is left:
  **好了 {k} 个，还有 {m} 个 / {k} done, {m} to go** (a line that didn't work counts in neither). Shown
  from two lines; one thing asked looks as it always did. It changes in place, never posts; no heading,
  no numbers, no system lines. A row opens the task that does it.
- **How a line moves.** The brief lists the things, numbered; the task gives each one's state in its
  report's `asks` (a progress report ticks one while it goes on). A report without them, or the task's
  own state, moves all its open lines at once. Core logs `asks` `{msgSeq, lines}` whenever one changes
  (`core/src/asks.ts`); clients keep the latest per message. A second task opened for one message with
  none named puts each task's title under it (the floor).
- **When the partner speaks** (from the motivation and principle 7, research/175 §4). A line done
  while other lines of the same message still work is not told: its tick is the evidence, and a ping
  for one of several is the stream of pings Ducter exists to end. Core holds that report (no partner
  turn). A question or a failure is said at once, with its card. When the last line settles, the held
  reports wake the partner together and it says how each came out in one message (rule 5); one task
  for all the lines needs no hold. No timed release: a thing whose answer is information shows that
  answer as its line's note at once. D430: the hold is in the Log: each held report's seq rides in
  the message's own `asks` event (`holding`), cleared before the release wakes anyone, and core's
  projection rebuilds it at start, so a restart in the middle neither loses the close-out nor says it
  twice (one stopped between the last line settling and the release says it at start, once).
- **Follow-ups.** The partner sees the lines of a recent many-things message with their tasks,
  numbered as the person sees them, so "第二个改一下" or "the Hangzhou one" goes to that task
  (`task_send`), never to a new one (D373).
- **回复这一条 / Reply to this one (D430).** Any line can be replied to on its own, the same way as a
  message (D236, D256): with a mouse the reply pebble rests in the gutter left of the card, on the
  pointed line's bottom, and says **回复这一条 / Reply to this one** on itself; a right click (a long
  press on a touch screen, which never opens the task) gives the same word above Copy. The composer's
  imprint quotes the line's words. The client names the message and the line's index (`ReplyWant.ask`);
  core fills the `ReplyRef` from the latest `asks` (the line's words as the quote, `ask`, and only that
  line's task), so the partner reads "replying to one of the lines under their earlier message (line
  n)" with that one task and sends what was said to it (continuity first), never to the other lines'
  tasks. A row's own click still opens its task. A reply to a line that waits for the person
  (**needs_you**) is its task's answer when that task has exactly one plain question open (D443): core
  resolves it as a reply to that question's card would (D236 (4)), so the task hears it without the
  partner passing it on; with none or several open, it stays words to the partner.
- **Who does it** is never in the conversation (D129). On the Mac a hover on a line shows the agent at
  the row's end, in the muted ink; the web does the same on a fine pointer only. On hand and the opened
  task name it already; the opened task also shows its own lines under its head.

## Voice (D305)

Hold to talk in the composer and 朗读 / Read aloud on a partner's message: `voice.md`.

## Rich answers (D303)

*Who:* the consumer who asks "compare these two" or "how did last week go" and gets a paragraph of
numbers; the developer who asks which repo and answers by typing its name; the fresh user, who
should never meet a wall of markup. *Felt:* 好用 and 赏心悦目: a comparison reads at a glance; a
choice is one tap; nothing extra when a sentence will do.

- **When:** only when the person asked for a comparison (table), numbers over time or across a few
  items that came from a tool, a report or the person (chart, bar or line, one series), a list to
  tick (checklist), or when the partner asks a question with 2-5 short answers (choices). Never for
  one fact, a yes/no, a greeting, a task's result, or anything needing Go (that stays a decision
  card). At most one block in the usual reply; the words around it are one or two short lines and
  never restate it. The persona carries this ("Rich answers"); the eval's `rich-*` scenarios hold it.
- **The format the partner writes:** a fenced block with the info string `ducter-ui` holding one
  JSON object:
  - `{"type":"table","title"?,"columns":[...2-6],"rows":[[...]...1-12]}`: the first column is the
    row labels (its head may be blank); a cell at most 80 characters;
  - `{"type":"chart","kind":"bar"|"line","title"?,"unit"?,"summary","points":[{"label","value"}...2-14]}`:
    `summary` (one sentence, at most 200) is required; values are real numbers;
  - `{"type":"checklist","title"?,"items":[...1-12],"tell"?:true}`;
  - `{"type":"choices","options":[...2-5]}`, each at most 40 characters, no two alike.
  A block is at most 4000 characters; at most three in a message and one of them choices.
- **The home validates it** (`packages/protocol/src/rich.ts` `parseRich`, in the partner's
  `appendAiMsg`): each valid block is stored on the message (`ai_msg.ui`, the block and its `plain`
  text) and replaced in `text` by that plain text; an invalid one is left out and counted
  (`uiDropped`), which the partner reads in its history ("not valid and not shown"); a message that
  would be empty keeps its JSON as an ordinary code block. Acks and a task's question carry plain
  text only.
- **One text that always reads:** a table is one line per row (`- {label}: {head} {cell}, ...`), a
  chart its title, its sentence and its points on one line, a checklist or choices lines starting
  with `- `, with the reply language's punctuation (a `words()` table). Chat apps, pushes, Copy,
  memory and older clients get exactly this.
- **Drawing it:** a client splits `text` at each block's plain text (`splitRich`; a block whose text
  is missing goes last, a kind it doesn't know stays as its text) and draws the block there, from
  one model (`richModel` / Go `ModelOf`: a table's numeric columns, the chart's scale from zero to a
  round top in at most five steps, every number with at most two decimals and grouped thousands).
  `fixtures/rich.json` holds the cases the web and the Mac both pass.
- **The look (Pebble, tokens only, light and dark):** each block on the day card's white with its
  clay base; the table's head small and muted, row labels bold, numbers right-aligned in even
  figures; a wide table scrolls sideways in its card on a phone with the row labels kept; bars in
  the accent clay with a lighter top and a darker ledge, a line in the accent with hollow points,
  dashed lines at each step and the zero line solid, the value over each bar or point when there
  are eight or fewer; a checklist's boxes on a ledge, ticked ones in the done tint with the item
  struck through; choices as clay pills under the question.
- **Choices:** a tap sends the option's words as the person's message (no pictures, no reply-to),
  exactly as if typed. They work while nothing from the person came after the message; then they
  stay as a record, the one they said in the accent, the rest faded and not tappable.
- **Ticks** stay on the device (web `localStorage`, the Mac's `desktop.json`), keyed by the
  message and the block; a pinned list's live on the home (D381, below). Only `tell: true` adds **报一下进度 / Send progress**, which sends what is
  ticked and what is left as the person's reply, at any time.
- **Accessibility:** a table is a real table (web `<table>` with column and row headers; Mac roles
  table, row, column header, row header, cell); a chart is an image whose words are its sentence
  then each label and value (the web adds a hidden table of the values); a checklist item is a
  checkbox; choices are a labelled group of buttons.

## Pinned (D381)

*Who:* the consumer packing for a trip ("where was that list?", ticks on the phone not on the Mac,
"add the charger" answered with a second list); the developer's release checklist or the table of
PRs waiting, made once and remade every week; the fresh user, who pins the way every chat app pins.
*Felt:* 好用 one tap and it stays; 顺滑 the same ticks on every device, a change lands in the same
place; 赏心悦目 a quiet strip, a yellow pin; 放心 nothing pinned or changed unasked; 惊喜 "add the
charger" and the strip at the top settles with it. The first step of "your own small apps"
(`motivation.md`, research/150 #1): something the partner made that stays the person's.

- **What:** a table, chart or checklist from a partner message (never choices or the lend card,
  which belong to their moment), kept at the top of the default conversation. At most
  `PINS_MAX` = 6. A second partner (preview) has none yet.
- **Pinning:** the card's corner says **置顶 / Pin** (muted ink, a drawn pushpin); once pinned it
  says **已置顶 / Pinned** in the highlight tint and opens the sheet. Or the person asks in words
  ("置顶", "pin it"): the partner writes the block with `"pin": true`. Full: **最多置顶 6 个。先取消一个再置顶。**
- **The strip** (under the bar, conversation width): the newest pin's title, a list's ticked/total
  (in the done ink when all are ticked), **还有 {n} 个 / {n} more** as its own pill. It settles in
  (−6 px, overshoot 2 px, 420 ms) when its newest pin is new or changed; none with reduced motion.
- **The sheet 置顶 / Pinned:** each pin drawn whole, newest first; under it **{time} 置顶 / Pinned
  {time}** or **{time} 更新 / Updated {time}** and **取消置顶 / Unpin** (the web's toast offers
  **撤销 / Undo**, which pins the same block again); one line at the end: how to change one by
  saying it.
- **Ticks:** a pinned checklist's ticks live on the home (`pins.json`, by the items' words, so an
  item keeps its tick through a change); every device shows the same ones, in the sheet and on its
  newest message. Unpinned lists keep their ticks on the device, as before.
- **The partner keeps it current:** every turn while anything is pinned carries one `[pinned]` L4
  line (each pin's id, kind, title and what it holds now, a list's ticked and not yet), as data,
  never instructions. Asked to change one, the partner writes its whole new block with
  `"pin":"<id>"` (a checklist may carry `"ticked":[...]`); the home (`parseRich` → `pins.claim`
  before the message is written, `pins.put` after) puts it in place: same id, version + 1, the
  message it is in now. Older versions stay in the Log as they were and offer no corner of their own
  (`was`). An unknown id pins nothing; the block still shows. "What's left?" is answered from the
  line. Never changed or posted again unasked.
- **Protocol:** client `pin {seq, index}`, `unpin {id}`, `pin_tick {id, item, on}`; server
  `pins {pins, refused?}` after the welcome and on every change, to every socket on the default
  conversation (`packages/protocol/src/pins.ts`, `packages/core/src/pins.ts`).

## Replies: answering one message (D236)

Evidence: `research/72` (the look, and the gestures messaging apps already taught people). Context:
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
back gesture); long press opens the message menu (D254: its time, **回复 / Reply**, **拷贝 / Copy**, see "Keeping your place and copying"). Wide screen with a mouse (D256):
pointing at a message shows the reply pebble, a small clay pebble in the gutter beside it (left of
the user's bubble, right of the partner's, outside a note's card beside a find), resting on the
message's bottom line and never on a bubble's or a card's content. The pebble is the mark alone
(D495): pointing at it tints the mark, nothing else; no word appears on it or beside it, it never
grows, and the message's own words, colour and place never change on hover. Its name (**回复 /
Reply**) is its accessible label and the system's own tooltip after the usual delay. Right click opens the same menu, and a selected part of the partner's words
offers **回复这段 / Reply to this part**. The Mac: the same pebble. Touch has no pebble: the swipe
reveals it. Esc or the × puts a
reply away (**不回复了 / Cancel reply**).

**The look: the imprint (research/72).** The message replied to appears as a small copy of its
own bubble (its voice's colour, its tail corner) pressed into the reply like a pebble into clay:
in the composer while writing (with the drawn reply mark beside it and the placeholder **回复
{who}… / Reply to {who}…**; on the person's own line **接着说… / Add to this…**, never 回复你,
D434), inside the top of the sent bubble after. Its first line is literal:
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

## Keeping your place and copying (D254)

The conversation behaves as every messaging app does, on the Mac and the web alike (research/83;
the rules are pure functions in `apps/web/src/follow.ts` and `apps/desktop/internal/views/follow.go`).

- **At the end, it follows.** Within 80pt of the end the conversation follows what comes: a new
  row glides up; a picture loading, a card or a living message growing, the phone's keyboard opening
  keep the end. Only scrolling *up* lets go. Sending always goes to the end.
- **Scrolled up, it stays.** Nothing moves under the reader's eye. Over the composer a clay pebble
  is the way back: round with the drawn arrow when the reader is more than about a screen up
  (**回到最新 / Jump to latest**); when the partner said something meanwhile, it widens to
  **{n} 条新消息 / {n} new messages** (the person's own messages never count). A tap lands on the
  first new message (the end when what came fits on the screen). ⌘↓ goes to the newest.
- **Opening lands where the news starts.** A quiet accent line **新消息 / New messages** stands
  before the first of the partner's messages not yet read (not when the person wrote after it, nor
  where "你不在的时候" already says it). When what came is taller than the screen the conversation
  opens on that line; else at the end. On the phone the same happens when the app comes back to the
  front. Sending takes the line away.
- **Read means seen.** The conversation counts as read only while its end is in view.
- **The place is kept** while On hand or a task has the phone's screen.
- **The whole conversation scrolls back (D509).** Opening holds only its newest stretch (the
  home's last 200 events, about a tenth of them messages). As the reader nears the top (a screen and
  a half on the web, twelve rows on the Mac) the page before the oldest event held is asked for
  (`channel_history`, 300 events), one at a time, again while they stay near it, until the home says
  none remain: no button, no end of the road short of the first message. A page lands above the
  reader and the line they were reading does not move (the Mac's list keeps its rows by key; the web
  puts the first row in view back where it was, in every engine, WebKit included). While a page is on
  its way one quiet line floats over the top, **正在载入更早的消息 / Loading earlier messages**,
  taking no room and fading in only when the page takes longer than a blink. Days and the 15-minute
  time lines read as before; the row that stood on top while more could come keeps its time line, so
  nothing shifts when the page lands over it. A page is folded on its own and joined in front: what
  came later wins (a job's newest status, an answer, the latest lines of an ask), and a wait from back
  then is history, not news. Older messages of the person's own are never a send (the end is not
  taken back).
- **Copy (D492).** A whole message is one press away wherever it is read:
  - *With a mouse*, the pebbles beside a message (D256's gutter) carry **拷贝 / Copy** with the copy
    mark: on the web a column, Reply on the message's bottom line, Copy over it, **朗读 / Read
    aloud** over that on a partner's message; on the Mac a row, Reply, Copy, Read aloud. Every
    bubble that can be replied to has it; pictures alone have none.
  - *Long press (touch) or right click* opens the message menu: its time, **回复 / Reply**, **拷贝 /
    Copy**, on a link **拷贝链接 / Copy link**, and on a touch screen **选择文字 / Select text** (the
    words to read on a sheet where the system's own selection works, without styling marks or
    fences; **全部拷贝 / Copy all**, **完成 / Done**). With words selected (Mac, wide web) Copy is the
    selection's.
  - *In an opened task*, the quiet line under the agent's words (its time, how long its turn
    worked) ends in **拷贝** with the copy mark. A finished turn's last words, its answer, keep
    that line in view; earlier words show it on hover; a touch screen always. On the Mac its
    right-click has Copy too.
  - *What it copies:* the message's Markdown as written, and the same message formatted beside it
    (a rich editor keeps headings, lists, bold and code; an editor, a terminal or another agent
    gets the source). Each code block also has its own quiet **拷贝**.
  - *What it says:* the task's Copy button turns to the drawn check and **已拷贝 / Copied** for a
    moment, with a light tap; a conversation pebble turns to the drawn check alone in the done ink
    (D495: no word on a pebble; **已拷贝** is its label); a menu that closed says **已拷贝** in the
    toast; a copy that failed says so, with Select text.
- **Finding a place in an opened task (D526).** An opened task's conversation has the locator at its
  right edge on a wide window: the list of what happened drawn small, one mark per landmark (the
  person's words a dot in their orange, the partner's a dot in its clay, a task handed over a
  square, a result a ring, an ask that waits a ring round a dot in the needs-you orange), quiet at
  rest, its card in the one menu's clay when pointed at (`ui.md` "The locator's marks"). The partner's
  conversation has none: it is a messaging app, and Jump to latest and the new-messages line keep
  the place.
- **The draft is kept** when the app is closed, until it is sent.
- **Not here:** editing a sent message (the partner already acted on it; say a correction), read
  ticks, reactions. Find in the conversation is in `todo.md`.

## A task that didn't go (D473)

What wakes the partner about its own tasks: a report, and since D473 a `mend` hand-over for a task
that never started or stopped without a report, after Ducter's own retries and repairs
([self-repair.md](self-repair.md)). The hand-over carries the cause, the computer, the path, what
was tried and what is left. The partner finds another way first (the repository the person named,
another agent, another computer) and says nothing about the failure; a fix that worked needs no
word. Only when no way can work, or the task comes back a second time, it asks once, in one line,
with the one real fix. No error text and no list of what failed ever reach the conversation.

## A question answered anywhere is answered everywhere (D481)

**Who and what they feel.** The heavy developer has the Mac app, the phone and a chat app open on
the same home. Before: on hel (2026-11-23) a card answered on one window at 01:05 still showed open
on another, with 你没回之前，我先放着 under it; they read it as Ducter not listening. After: a tap or a
reply anywhere closes the card on every window at once; a window that was asleep closes it as it
wakes. Nothing to learn: it is how a messaging app already behaves.

**One source of truth.** The home's Decisions holds which questions are open. Every On hand
snapshot carries `openAsks` (their ids and the Log seq it is as of). Every surface on a client
derives from its one store: the card in the conversation (and its sheet), On hand's rows and the
待你处理 count (the Dock badge, the menu bar), a partner's own asks, the opened task's page. A client
closes any question it holds open that isn't in `openAsks` and was asked at or before its `asOf`
(shown 在别处答过了 / Answered somewhere else), and asks the home (`asks_get`) for the events of those
and of any open one it doesn't hold; the home's own resolution then replaces the stand-in. A
question asked after the snapshot is never closed by it.

**Ways a question closes.** Go, Hold or a reply (any window, a chat app, a reply quoting it), its
default by time, and by what happened (`by: "ended"`, 不用回了 / No answer needed now): its task
finished or was set aside for another, or a loop card's moment passed (D427's watchdog). Ended
closes are never forwarded and wake nobody.

**Reconnects.** A hello with a cursor replays every event since it, page after page; before D481
one page (5,000) was all a long-away client got, and its live events then moved its cursor past
the gap for good.

**Words are never lost.** A reply typed into a card answered elsewhere: sent, the home logs it as
a normal message quoting the card (never a second answer); still in the box, the card keeps it
under its answer with **作为消息发给我 / Send it to me as a message** and **不发了 / Discard**. Go
or Hold on such a card does nothing but bring this window the home's answer.

## The day after the first run (D623)

*Who:* the fresh user who set Ducter up yesterday and opens it today. *Feel:* before, a blank
conversation that could be any day, so yesterday's work is only a memory; after, 放心 (it remembers
what we did, and says only what is true) and 顺滑 (one tap settles how the mornings go). *First time:*
the first open on the day after the first run; nothing to set up.

1. **One honest return, once.** The first time the person reads the conversation (a read receipt,
   not a background reconnect) on the calendar day after the day Ducter first ran, and only if
   something was set up yesterday, code logs one `day_after` with at most three true facts, and
   the partner is woken to say it. It is in the Log, so every device sees the same message and a
   restart never repeats it; a home that first ran two days ago gets nothing. Nothing was set up:
   nothing at all. No push: it waits for the person to open Ducter. Why not the morning note's
   finds or the `first` starts: both are code's templates, and this one must be the partner's own
   words, so it is a partner message woken by code's facts at the first open.

2. **What counts as set up** (each from the Log or the home's own record, never a guess): a task
   that finished yesterday, a Keep that started looking after something, an account they
   connected, a chat app they linked, an app they made. At most three, newest first; an
   OpenConnector names its accounts (Gmail), never the connector itself. Each is a link to the
   task, the Keep's page, Accounts, Chat apps or the app.
3. **The words are the partner's.** Code gives the facts and one line of instruction; the
   partner's model says one or two sentences in its own voice about what they set up together,
   and the app shows the facts under its words as quiet links. Never a template, never a feature
   tour, never an invented fact.
4. **One offer, never a need.** Under the words, one quiet `finds` note asks **要不要我每天早上给
   你一句话？ / Want me to say one line each morning?** with two chips, **好，每天早上 / Yes,
   each morning** and **不用了 / No thanks** (the shape of D453's offers and the first-look offer,
   never a decision card). It has no needs count, no default and no timer: it never appears in
   待你处理, and an untouched offer changes nothing. Go keeps the morning note on (a home on 只有
   急事 turns it on; a home on 每天最多 3 条 keeps 3) and the partner says one short line; No
   changes nothing. The answer is the note's own `answered` revision in the Log: `yes`, `no`, or
   `ignored` when the person's next message arrives without a tap. The chips go once settled;
   only Go adds the partner's one line. Asked once in a home's life, never again.

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
- **A routine's round is silent (D584, `standing-work.md` "How it reports").** A round that went
  well or is under way is never a template line here; its lantern and its page carry it, and what it
  found worth saying the partner says in its own words. Rounds that didn't work are one line per
  routine, its newest. A routine the person asked to hear every time (a digest, `reports: "every"`)
  keeps its rounds.
- **One presence for words on their way (D584, D587).** While the partner is putting finished
  results into words (D124's two minutes) or a task's question (D129's minute), the conversation
  shows one waiting presence however many there are and in however many living messages: at the
  conversation's end, where its words will land, and none inside a message (a message that holds
  nothing else is not drawn until its words come). A reply being thought of is that one figure
  instead (D104): never two at once, never a stack of the same line.
- **One count, said once (D586).** The message shows one ask, the one whose default comes soonest;
  the others never get a line or a number of their own here (D104's 还有 n 个等你定 is retired: beside
  the bar's count and D535's line over the composer it read as a third number that disagreed). What
  stays is **n 个都按默认 / Go on all n defaults** when two or more of its asks have one. Everything
  else that waits goes through D535's one line, **有 n 个待你处理 › / n waiting on you ›**, whose n is
  the bar's n (both from the one needs-you list). Details in the conversation Shown still lists them
  all.
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
