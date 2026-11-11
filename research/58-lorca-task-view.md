# 58: Lorca's agent page again, for the opened task as a coding-agent chat

Asked (2026-11-11): the author on the opened task: "你看我们这个 focus window 对话框的 ai 聊天实现（这里
应该像 coding agent 那样了）非常不优雅，我建议你参考 lorca 的设计和实现". Research/40 read the same
repo two days earlier for the *handling of steps* and fed D152. This note reads it again for what
research/40 left out: the page as a **conversation** (turns, who said what, queued messages, the
composer, interruption), its rhythm and density, how output and edits open, scrolling while the
agent works, and how it is built (state, live updates, virtualization, markdown). It ends with what
Ducter takes and what it doesn't.

Tags: VERIFIED (read in source), DOCUMENTED (its own docs), INFERRED. Read only; nothing was built
or run.

Snapshot: `egoist/lorca` `bf1ab709` (2026-10-28), a shallow clone; upstream had not moved when
fetched again on 2026-11-11, so research/40 and this note read the same tree. Desktop in Go on
MyGo (v0.6.4 pin, older than Ducter's v0.8.3); phone in React Native (`mobile/`).

## 1. Layout: a run as a conversation

- **The page is a transcript of items in order**, `prompt | status | thought | text | tool | plan |
  error`, one list for every harness (VERIFIED `crates/cli/src/coding/transcript.rs` `Item`). A
  later item with the same id replaces the earlier one (a tool goes from running to done with its
  output), so the list grows and settles in place (VERIFIED, ibid.).
- **Turns are implicit.** There is no turn object: a `prompt` item is drawn as a card naming who
  wrote it ("You" in an accent tint, else the bot), and everything after it until the next prompt
  is the agent's answer (VERIFIED `desktop/agents.go` `transcript`, `agentPromptCard`;
  `mobile/src/ui/AgentScreen.tsx` `Prompt`). The first prompt (the brief) folds past 6 lines or
  480 characters behind Show more (VERIFIED).
- **The agent's words** are full-width Markdown at 13 pt (desktop) / 15 pt (phone) (VERIFIED
  `markdownView(c, item.Text, {Size: 13})`, `Said`).
- **Tool steps are one line each**: a spinner while running, then "Ran `bun test`", "Edited
  src/a.rs +12 −3", "Not allowed: git push"; a chevron only when there is output (VERIFIED
  `stepLine`, `toolSpans`, `agentToolText`). **Only reads and searches in a row fold** into
  "Explored 3 files 2 searches" (VERIFIED `agentSteps`, `exploredText`; mobile
  `codingAgents.ts` `transcriptBlocks`). Commands and edits always stay as their own lines.
- **Edits show counts, not diffs.** The row carries `+added −removed` from the harness's diff
  (`diff_stats`), and the page has no inline diff view; the footer sums the whole run's changes
  against the start commit, "+12 −3 in 4 files" (VERIFIED `toolSpans`, `agentFooter`,
  `transcript.rs` `diff_stats`; DOCUMENTED `docs/architecture/coding-agents.md` "When it is done").
- **Output** opens under a step in a mono box, kept to its first 12 non-empty lines of ≤ 300
  characters plus "… +N lines" (VERIFIED `transcript.rs` `output`, `OUTPUT_LINES`), a scroll box
  that grows and then scrolls (VERIFIED `desktop/cards.go` `commandOutput`).
- **Thinking** is "Thought for 3s", folded (VERIFIED). **Plans** are a checklist card (VERIFIED).
  **Errors** are a red triangle and selectable text in place (VERIFIED). **Status** lines are
  Lorca's own quiet 11.5 pt lines ("Working in ~/dev/shop on main") (VERIFIED).
- **A failed command is red as a whole line**; there is no excerpt of the error under it, only the
  output on a click (VERIFIED `toolSpans`: `quiet, subject = p.Red, p.Red`).
- **Queued messages.** What the user sent that the agent has not taken up yet is drawn at the end,
  after the steps, as a prompt card marked "Queued" with "It takes this up at its next step" as its
  tooltip (desktop) or as a chat bubble on the user's side with "Queued" under it (phone)
  (VERIFIED `transcript`'s queued loop, mobile `Queued`). The runner keeps the queue
  (`Agent.queued`) until the agent reports the message as a `prompt` step (DOCUMENTED
  coding-agents.md "The user writes to it").
- **The composer** writes to the agent itself: placeholder "Message Claude Code"; a line under it
  says when the agent takes the message ("Claude Code takes it up at its next step.", "Sending
  starts Claude Code again on its session."); disabled while it starts or once it can't take one;
  a message that did not go comes back into the field with why ("Not sent: …") (VERIFIED
  `composerState`, `composer`, `send`).
- **Interruption.** Stop is a header button while it runs; a message never interrupts (sent
  without `interrupt`, taken up at the next step). Stop then a message is how the user cuts in
  (DOCUMENTED coding-agents.md). On the page, Esc and Enter close the sheet (VERIFIED `view`'s
  `OverlayShortcut`); there is no Esc-to-interrupt.
- **Header and footer.** Logo, title (15/600, two lines), "Claude Code · Working · fix-login"
  (+ Runner when remote), PR and Stop; footer "+12 −3 in 4 files", the branch, Done (VERIFIED
  `view`, `subtitle`, `agentFooter`). Status as a mark: spinner / orange ! / check / PR glyph
  (VERIFIED `agentStatusMark`). No elapsed clock (VERIFIED).
- **There is no "working" line at the foot of the page**: the live state is the spinner on the
  running step itself and the subtitle's word "Working" (VERIFIED `transcript`, `subtitle`). Lorca's
  *chat* has one working row with friendly words for the latest tool (research/40 §1), the agent
  page does not.

## 2. Visual language

- **Density.** Consecutive tool lines sit 2 pt apart; every other item 12 pt (VERIFIED
  `transcript`: `top = 2` between tools, else 12). Tool lines are ≥ 22 pt, 12.5 pt type, padding
  2/6 with a −6 margin so the hover background bleeds past the text column (VERIFIED `stepLine`).
  The phone uses 6 pt gaps and 14 pt step text (VERIFIED `styles.content.gap`, `stepText`).
- **Typography.** Words in the label colour, the subject (command, path) in the primary label colour
  and in mono for commands; counts green/red at weight 500 (VERIFIED `toolSpans`). One size step
  between prose (13) and steps (12.5); prompts 12.5 in a tinted card (VERIFIED).
- **Folding.** A chevron right/down; hover background only on expandable rows (VERIFIED). The
  fold's state lives in a map keyed by item id on the page (`open map[string]bool`) (VERIFIED).
- **Code and output.** Mono 11 pt at a fixed 15 pt line height on the code background, radius 6
  (VERIFIED `commandOutput`). No syntax highlighting of output or commands (VERIFIED: plain
  `ui.Text`).

## 3. Interaction

- **Scroll anchoring while it works.** On each poll, if the reader is within 24 pt of the end (or
  it is the first load) and the items changed, the scroll goes to the end; a reader who scrolled up
  stays (VERIFIED desktop `load`: `atEnd := !t.loaded || t.scroll.Y >= t.scroll.MaxY-24`; phone
  `onScroll` / `onContentSizeChange` with the same 24 pt). Sending scrolls to the end
  (VERIFIED `send`).
- **Jump to latest** exists in the *chat*, not on the agent page: a button when the list is not at
  its end, ⌘J, `ScrollToEnd` (VERIFIED `desktop/chat.go` `s.list.AtEnd()`, "Scroll to latest").
- **Keyboard.** Return sends (or ⌘Return when the user turned "send on Return" off), IME
  composition respected (VERIFIED `composer`'s `HandleInput`, `input.Composing()`).
- **Open where?** The agent page opens with the scroll at the end on first load (VERIFIED
  `atEnd := !t.loaded …`).

## 4. Implementation

- **State model.** One `agentPage` struct per open page: items, queued, reachable, draft, sending,
  error, the scroll state and the open map (VERIFIED). The transcript is fetched whole (its last
  400 steps) every 2 s on the Runner and every 5 s through the relay, one request at a time; a
  send asks again at once (VERIFIED `load`, `schedule`; DOCUMENTED "every two seconds on the Runner
  and five elsewhere"). It compares with `reflect.DeepEqual` to decide whether to follow the end
  (VERIFIED). There is no streaming of text deltas into the page: an item appears whole once the
  driver reports it (INFERRED from the item model and the poll; no delta type exists).
- **Rendering.** The desktop draws every step of the (≤ 400-step) list each frame in a plain
  `ui.Scroll`, with no virtualization on the agent page; the chat uses `ui.List` (virtualized,
  keyed rows) (VERIFIED `agentPage.view` vs `chatView`). The phone maps blocks into a
  `ScrollView`, not a `FlatList` (VERIFIED `AgentScreen`).
- **Bounded data at the source.** Output kept to 12 lines × 300 chars, titles to 200 chars, 4000
  items in memory, 400 per fetch (VERIFIED `transcript.rs` constants). This is what keeps an
  unvirtualized page cheap.
- **Markdown.** Its own renderer over goldmark on desktop (`desktop/markdown_view.go`), a native
  module on the phone (`modules/lorca-core/MarkdownView.tsx`) (VERIFIED). No code highlighting
  in steps (VERIFIED).
- **Secrets** stripped at the source before storage (research/40, VERIFIED `item_without_secrets`).

## 5. What fits Ducter, and what doesn't

Fits:
- **Every step on its own line, only looks folded.** D152 folded every stretch between two things
  the agent said under one gist ("在浏览器里操作 · 15 步 › 运行 pwd 出错"); the author's screenshots
  show the gist hides exactly what a reader of a coding agent wants (which commands ran, which
  files changed) and can be wrong (D207's 在浏览器里操作). Lorca's rule is the right one.
- **Turns from prompts**, a queued message at the end until taken up, the composer's line about
  when the agent will read it (Ducter already has D207's 它忙完手上的就看).
- **Bounded output with "+N lines"**, chevrons only on rows that open, the hover row bleeding
  past the text column, 2 pt between consecutive steps and 12 pt between other items.
- **Follow the end within a small threshold; a reader who scrolled up stays.**
- **Bounding data at the source** rather than virtualizing (Ducter's model already clips output to
  40 lines; it adds a 60-line cap on an edit's diff).

Ducter goes further, on purpose:
- **An edit's own diff, inline.** Lorca shows only counts; a fresh user and a developer both read
  "what did it change" faster from the lines. Ducter reads them from the edit tool's input (old /
  new strings, a patch), so it needs no git and works for a folder or a remote computer.
- **A failure's telling line in place**, not just a red row: the first output line that names the
  error (`✗ …`, `error TS2339 …`), else the last.
- **The command beside the agent's words.** Lorca shows the raw command; D152 showed only the
  agent's own description. A coding agent's reader wants both; the words lead, the command follows
  in mono and muted ink, truncated first.
- **A foot over the composer** that says where it stands while it works (spinner, clock, latest
  step) or that it's over to you; Lorca's agent page has none, its chat does. Esc twice to pause
  (Claude Code's Esc, with a confirm because Ducter's Esc also goes up a level).
- **Jump to latest** on the task page (Lorca has it only in its chat), and opening a finished task
  at its head (the outcome is there), a working one at its end.
- **Older turns behind one link** past a budget, and memo per turn plus `content-visibility` on
  the web, because Ducter's Log has no 400-step cap and the phone's WebKit draws everything.

Doesn't fit (not taken):
- Lorca's look: SF Symbols mapped to Lucide, green/red label colours, 12.5 pt rows, its tinted
  prompt cards, its sheet with a Done button. Ducter keeps Pebble's tokens, its own drawn marks,
  Bricolage and its type scale, the clay character and the sunken brief card.
- Tense-shifting verbs ("Running" → "Ran"): Ducter's steps arrive done; its sentence is the
  agent's own words or a summary in the user's language.
- Polling the whole transcript: Ducter's home pushes events.
- "Thought for 3s" with a duration Ducter doesn't have; plans as a checklist (Ducter hides the
  harness's plan bookkeeping, D124).
- Red for every non-zero exit: Ducter keeps D152's neutral probes.

## Implications for Ducter

- Replace D152's per-stretch gist with Lorca's rule: one line per step, only consecutive looks
  folded ("看了 3 个文件，搜了 2 次 / Read 3 files, 2 searches"); keep D152's sentences, neutral
  probes and hidden keys.
- Model the opened task as turns (the brief, your words, the partner's open one) in the shared
  transcript model and its Go port, with the edit's diff and the failure's line computed there so
  both clients and the fixture agree.
- Add the foot (working / over to you), Esc twice to pause, ⌘↩, Jump to latest, opening at the
  end while it works.
- Keep long tasks cheap: data bounded at the model, blocks built once per change, turns memoized,
  older turns behind a link.
- Decided as D210.

## Summary

Lorca's agent page is a conversation of items: prompt cards naming who wrote them, the agent's
Markdown, one line per tool step with only reads and searches folded, bounded output on a click,
queued messages at the end, a composer that says when the agent will read it, follow-the-end
scrolling, and data bounded at the source instead of virtualization. Ducter takes that structure
and its handling, adds inline diffs, error lines in place, the command beside the agent's words, a
foot that says where it stands, Esc-twice to pause and Jump to latest, and keeps none of Lorca's
look.
