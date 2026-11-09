# 40: How the best agent UIs draw one agent's live transcript

Asked (2026-11-10): how should Ducter's opened task show one coding or ops agent's live
transcript to a heavy multi-agent developer, on the Mac app and the phone web client? The
author pointed at **Lorca** (github.com/egoist/lorca). It is the main reference here because its
desktop app is written in Go on **MyGo**, the same UI framework `apps/desktop` uses, so its
patterns carry over almost as they are. Orca (stablyai/orca), Codex CLI's TUI and Claude Code
get shorter sections.

Tags: VERIFIED (read in source), DOCUMENTED (official docs or README), INFERRED. Repos were
read only and never built or run.

Snapshots, all shallow clones, so they may go stale:
- Lorca `bf1ab709` (2026-10-28). Its `desktop/go.mod` pins `github.com/egoist/mygo
  v0.6.4-0.20261024094029-23ac61d856d7`, which is **older** than Ducter's `v0.8.3`
  (`apps/desktop/go.mod`).
- Orca `6530fd17` (2026-11-09).
- Codex `27fcd7cb` (2026-11-09).

## 1. Lorca: the agent page

Lorca's main chat hides most tool calls. `buildRows` drops every tool row except sent-message
markers, coding-agent markers, and commands that are waiting on the user. What remains of the
work is one **working row** at the foot of the chat (VERIFIED `desktop/chat.go` `buildRows`,
`workingCell`). The full transcript of a coding agent (Claude Code, Codex, OpenCode, pi, fx) is
a separate page: a 680-wide sheet that the agent's marker opens (VERIFIED `desktop/agents.go`
`presentAgentPage`, `agentPage.view`). Its docs say the page "reads the way Cursor shows an
agent's run" (DOCUMENTED `docs/architecture/coding-agents.md`).

**One step model for every harness.** Each driver (`crates/cli/src/coding/claude.rs`,
`codex.rs`, `acp.rs`, `pi.rs`) maps its harness's events into one shared item type,
`transcript::Item`. Its kinds are `prompt | status | thought | text | tool | plan | error`. A
tool item carries `{kind: read|search|edit|execute|fetch|other, title, path?, added?, removed?,
status: running|done|failed|denied, output?}`. A later item with the same id replaces the
earlier one: a command first appears as running, then as done with its output (VERIFIED
`crates/cli/src/coding/transcript.rs`). The tool kinds are the same as the Agent Client
Protocol's (INFERRED from names and from `acp.rs`).

**How each step draws** (VERIFIED `desktop/agents.go` `step`, `stepLine`, `toolSpans`):

| Item | Drawn as |
|---|---|
| `text` (agent narration) | `markdownView(c, text, {Size: 13})`, full width, ordinary prose |
| `tool` | one line: a spinner while it runs, then the verb and the subject. The verb is in present tense while running and past tense when done: "Running bun test" → "Ran bun test", "Editing src/a.rs  +12 −3". The subject is in the label color and a command is in mono. A chevron appears only when there is output |
| reads and searches next to each other | folded into one line, "Explored 3 files 2 searches" ("Exploring…" while one runs), which opens to the member lines (`agentSteps`, `exploredText`) |
| `thought` | "Thought for 3s", collapsed; the text opens on click |
| `plan` | a checklist card (circle / dashed circle for in progress / green check) |
| `prompt` | a card naming who wrote it ("You" in an accent tint, or the bot). A long one (≥ 6 lines or > 480 characters) is clamped to 6 lines behind Show more |
| `error` | a red triangle plus selectable text |
| `status` | a quiet 11.5pt line from Lorca itself ("Working in ~/dev/shop on main") |

- **Density:** consecutive tool lines sit 2 pt apart; every other item is 12 pt from its
  neighbour (VERIFIED `transcript`). Tool lines are 12.5 pt and at least 22 pt tall.
- **Folding:** only reads and searches fold (`AgentToolStep.Explores()` in
  `desktop/model/models.go`). Commands, edits and fetches stay as their own lines.
- **Command label = the command, not Claude Code's `description`.** `"Bash" =>
  ("execute", field("command"))`; `description` is read only for `Task`/`Agent`
  (VERIFIED `claude.rs` `step`). The title is whitespace-folded and capped at 200 characters
  (`transcript::title`).
- **Codex probes are reclassified.** For Codex, the first entry of `commandActions` (read /
  search / listFiles) decides the kind, so `rg foo` lands in the Explored fold
  (VERIFIED `codex.rs` `steps`).
- **Errors.** Codex: any non-zero `exitCode` makes the step `failed`, and a failed step draws
  entirely in red (VERIFIED `codex.rs`, `toolSpans`). That means a `grep` that finds nothing
  turns red too. Lorca has no "expected non-zero" case. `denied` reads "Not allowed: git push".
- **Output** is kept to its first 12 non-empty lines of at most 300 characters each, plus
  "… +N lines" (VERIFIED `transcript.rs` `output`). It is drawn in `commandOutput`: a mono 11 pt
  scroll box that grows to N lines and then scrolls, and jumps to the newest line when the text
  changes (VERIFIED `desktop/cards.go`).
- **Header:** the agent's logo, its title (15/600, up to 2 lines), and a subtitle "Claude Code ·
  Working · fix-login" (plus the Runner when the agent is remote). On the right are the PR
  button and Stop (VERIFIED `agentPage.view`, `subtitle`).
- **Footer:** "+12 −3 in 4 files" in green and red, the branch in mono with the folder as its
  tooltip, and Done (VERIFIED `agentFooter`). The changes are counted against the start commit
  once the agent goes idle (DOCUMENTED coding-agents.md).
- **No elapsed clock** on the page (VERIFIED: no use of elapsed or started-at in `agents.go`).
  Status is a mark (`agentStatusMark`): a spinner while working, an orange "!" when it is
  asking, a green check, the PR's merge or close glyph, or a red "!" when it failed.
- **Live updates by polling:** `coding.transcript` is fetched every 2 s on the Runner and every
  5 s through the relay, last 400 steps (DOCUMENTED coding-agents.md; VERIFIED `agentPage` timer).
- **Secrets are redacted at the source.** `item_without_secrets` replaces the Runner's saved
  secret values with their placeholders in each step's text, title and output before anything
  is stored, shown or sent to the bot (VERIFIED `crates/cli/src/coding/mod.rs`).
- **Working line (main chat).** `toolActivity` maps the latest tool to friendly words. Bash
  *does* use the description there: "Running command: <description>", or "Running a few
  commands" when there is none. Reads are "Reading the file", searches "Searching files". When
  there is nothing specific to say, it picks one of five phrases, chosen by a hash of the step
  so the words hold still for a step. A model retry note wins over everything (VERIFIED
  `chat.go`). So Lorca uses the description for the *glance* layer and the raw command for the
  *detail* layer.
- **Phone:** the same rows in React Native (`mobile/src/ui/transcript.tsx`; the agent screen
  is `src/ui/AgentScreen.tsx` per DOCUMENTED coding-agents.md).

## 2. Lorca's MyGo patterns Ducter can adopt

Every API below exists in mygo v0.8.3 (VERIFIED by grep of
`~/go/pkg/mod/github.com/egoist/mygo@v0.8.3/ui`: `api_gen.go`, `element.go`, `paint.go`,
`list.go`, `scroll.go`, `richtext.go`, `collapsible.go`, `markdown/view.go`). Lorca is on the
older 0.6.4, so none of these is newer than what Ducter has. The last two rows are the reverse
case: 0.8.3 has APIs Lorca does not use.

| Pattern | Lorca path | Call shape |
|---|---|---|
| Step line | `desktop/agents.go` `stepLine` | `ui.ButtonBase(c).Cursor(ui.CursorPointer).FocusRing(false)` when expandable, else `ui.Row(c)`; `.Gap(6).MinHeight(22).Padding(2,6).Margin(0,-6).Radius(6).AlignSelf(ui.Start).Label(l).Tooltip(l)`; `line.Hovered()` → `.Background(p.RowHover)`; returns `line.Clicked()` |
| Mixed-style one-liner | `agents.go` `toolSpans` | `ui.RichText(c, ui.Span{Text, Color, Font: monoFont, Weight}...).FontSize(12.5).SingleLine().Shrink(1).MinWidth(0)`. Verb quiet, subject in label color, command in mono, `+N` green / `−N` red |
| Disclosure state | `agentPage.open map[string]bool` keyed by item id | plain state plus `if open { ui.Column(c).Padding(2,0,2,14).Children(...) }`. 0.8.3 also has `ui.Collapsible(c, label, &open, fn)` / `ui.CollapsibleBase(c,&open)` (`.Trigger`, `.Panel(fn)`, `.Progress()`), animated, as SwiftUI's DisclosureGroup |
| Fold of probes | `agents.go` `agentSteps`, `exploredText` | pure Go: append to the previous step's `explored` slice while `Explores()`; plural-aware `L("Explored %@ %@")` |
| Spinner | `desktop/controls.go` `spinner` | `ui.Spinner(c).Size(11,11)` (11 in lines, 13 for the status mark) |
| Shimmer text | `desktop/chat.go` `shimmerText` | `ui.Text(c,t).TextColor(col.Alpha(0.4))` + `.DrawOver(func(p *ui.Painter, r ui.Rect){ p.AnimationFrame(); at := p.Now()…; w,_ := p.MeasureText(0, ui.Span{…}); 8× p.Clip(strip, 0, func(){ p.RichText(x,y,0, ui.Span{Color: col.Alpha(a)}) }) })`. A 30%-wide band sweeps in 1.5 s and rests 0.25 s. Lorca's shimmer, not the framework's |
| Timed redraw | `codingagents.go`, `controls.go` `copyButton` | `c.After(2*time.Second)` re-builds for a ticking list; `c.After(remaining)` ends a transient "Copied" state |
| Element-local state | `cards.go` `commandOutput`, `chat.go` | `ui.Local(el, "scroll", func() T { … })` returns `*T` that lives with the element |
| Tail-following output | `cards.go` `commandOutput` | `ui.Scroll(c).MaxHeight(lines*15+10).Padding(5,8).Radius(6).Background(p.Code)`; `TrackScroll(&state.scroll)`; on new text `state.scroll.Y = 1<<30`; child `ui.Text(...).Font(monoFont).FontSize(11).FixedLineHeight(15).Selectable()` |
| Clamp + Show more | `agents.go` `agentPromptCard` | `ui.Text(c,t).MaxLines(6)` while folded; `linkButton(...).Clicked()` toggles |
| Virtualized transcript | `chat.go` `chatView` | `ui.List(c, &s.list, n, func(i int){…}).Fill().Padding(…).ScrollbarInsets(…)`; `s.list.Key = func(i) any`; `s.list.ScrollToEnd()`, `s.list.AtEnd()`, `s.list.Visible()` for "Scroll to latest" and paging older |
| Re-layout next frame | `chat.go` | `c.AnimationFrame()` when a measured `Bounds()` changed |
| Sheet + shortcuts | `agents.go` `view`, `overlay.go` `sheetPanel` | `panel.Focusable().FocusRing(false).AutoFocus()`; `panel.OverlayShortcut(0, ui.KeyEscape)` |
| Icons | `desktop/icons.go` `symbol` | SF-Symbol names mapped to Lucide paths → `ui.MustParseSVG`, cached → `ui.Icon(c, svg).Size(s,s)` |
| Markdown | `desktop/markdown_view.go` | Lorca's own renderer over goldmark (`model.MarkdownBlocks`). Ducter's 0.8.3 already ships `markdown.View` / `markdown.Stream` / `markdown.Revealed`, a streaming fade-in reveal that Lorca does not use. Ducter already uses `markdown.View` |

## 3. Orca (brief)

Orca's Native Chat is the most detailed open-source design of this view (React, Electron, and
mobile, all sharing `src/shared/native-chat`).
- Consecutive tool-only messages fold into one **run**, and agent prose ends the run (VERIFIED
  `src/shared/native-chat/tools/native-chat-tool-fold.ts`). So grouping happens per stretch
  between messages.
- The run's header is a sentence of categories in the order they were first used: "Read 3
  files, searched 2 times, and ran 1 command". It switches tense while live ("Reading…") without
  changing shape, and a lone settled shell call shows its command instead
  (VERIFIED `native-chat-tool-run-sentence.ts`).
- While live, the header pulses (`animate-pulse`, off under reduced motion) and shows the
  newest call's label beside it. Once settled it shows a check only for real success, plus
  separate failed and interrupted counts. Interrupted is neither a success nor a failure
  (VERIFIED `components/native-chat/tools/runs/NativeChatToolRun.tsx`,
  `native-chat-tool-run-outcome.ts`).
- A command row's label is the command with any login-shell wrapper stripped. The code comment
  says "prose `description` only as a last resort"; description is used for subagents (VERIFIED
  `native-chat-tool-summary.ts`, `native-chat-tool-line-label.ts`).
- Any non-zero exit shows "exit N" in red (VERIFIED `NativeChatToolAnnotations.tsx`). There is
  no expected-exit case.
- Output is a 16rem max-height box with on-demand loading of the full output. A long user prompt
  is clamped at `max-h-44` with a fade mask. Each turn ends with a diff rollup listing files with
  +/− counts (VERIFIED `NativeChatToolOutput.tsx`, `NativeChatUserMessageFold.tsx`,
  `NativeChatTurnDiffRollup.tsx`).
- No transcript redaction was found; redaction exists only for crash reports and diagnostics
  (INFERRED from grep).

## 4. Codex CLI TUI and Claude Code (brief)

- **Codex "Explored".** Consecutive calls whose parsed commands are all Read / ListFiles /
  Search join one cell headed "Exploring" or "Explored". It "stays open … even after a failed
  read/list/search". Within it, reads collapse to "Read a.rs, b.rs" (VERIFIED
  `codex-rs/tui/src/exec_cell/model.rs` `is_exploring_call`, `should_flush`;
  `exec_cell/render.rs`).
- **Codex "Ran".** Other commands draw "Running" / "Ran" with the command (bash -lc stripped,
  syntax-highlighted) and a bullet: green for exit 0, red for any non-zero, animated while
  running. Output is capped at 5 lines with "… +N lines" (VERIFIED `render.rs`,
  `TOOL_CALL_MAX_LINES = 5`).
- **Codex status row.** A single clock above the composer: shimmering header + compact elapsed
  time ("1m 05s") + the interrupt hint (VERIFIED `status_indicator_widget.rs`,
  `fmt_elapsed_compact`, `shimmer.rs`).
- **Claude Code's Bash input.** It carries a model-written `description` next to `command`,
  e.g. `{"command":"sleep 180","description":"Sleep for 180 seconds in background",
  "run_in_background":true}` (VERIFIED in a real transcript fixture,
  `orca/src/shared/__fixtures__/claude-helper-kill-2.1.310-parent.jsonl`). The tool schema asks
  for "5–10 words" saying what the command does (INFERRED from the Claude Code Bash tool schema
  as exposed to agents; not re-checked against public docs this session). Codex has no such
  field. Its `commandActions` / parsed commands do the classification instead (VERIFIED
  `codex.rs` in Lorca, `exec_cell` in Codex).

## 5. Principles that hold across all four

1. **Narration is the spine.** Every reference draws the agent's own words as full prose and
   shrinks tools to one-line rows between them. Lorca goes furthest: in its chat, tools vanish
   into one working line.
2. **Group per stretch, by meaning.** Orca folds every run between messages. Codex and Lorca
   fold only probes (reads, searches, lists). Edits and commands stay as their own lines because
   each one is a decision a reviewer may want to see.
3. **One line, tense-shifting, shape-stable.** Rows change verb tense in place
   ("Running" → "Ran"); the line keeps its shape.
4. **Two label layers.** At a glance: words (Lorca's working line uses `description`). In
   detail: the literal command, in mono. No reference uses `description` for the detail row.
5. **Red is overused.** All three treat every non-zero exit as failure. Nobody handles
   `grep`/`test -f` "not found" (exit 1) as neutral. That gap is Ducter's to close.
6. **Output is a bounded preview** (5 to 12 lines, "+N lines"), with the full text on request.
7. **Secrets are redacted before storage or display** only in Lorca, and it does it at the
   source, not in the view.

## Implications for Ducter

The author asked for Lorca as a reference for **how an agent's transcript is handled** and for
**MyGo technique**, not for its look. So the implications split in two. Ducter's clay/Pebble
language (`design/ui.md` tokens, the approved style artifacts, the coins and the mascot,
Bricolage and Ducter's type scale, the warm cream ground) stays as it is. What was built from
this is D152.

### Handling details we adopt

- **Agent narration is the primary layer.** Each agent message is Markdown prose at the reading
  measure; tool rows are quiet one-liners under it. Ducter also treats a saved checkpoint as the
  agent's own words, said once (no reference has checkpoints).
- **Group per stretch between agent messages** (Orca's rule, Lorca's and Codex's probe fold
  generalized): each stretch is one gist line with a count, folded when settled, open while it
  is the stretch under way. A stretch with one call shows the call. A real failure shows even
  when its stretch is folded (no reference does this; Orca only counts failures).
- **Description first, summarizer fallback, the literal command one click away**: Lorca's two
  label layers merged into one row. Ducter takes Claude Code's `description` and Codex's
  `justification`, else its own summarizer (`steps.ts`), and opens the literal command and a
  bounded output (24 lines) on a click.
- **Probes that find nothing are neutral**: the gap all four leave open. `command -v`,
  `which`, `test`, `ls`, `grep`/`rg` with a non-zero exit read "not found" in muted ink.
- **One elapsed clock** (Codex's status row), in the task's meta line, since the task started;
  no per-row times at a glance, no wall clock beside a step.
- **The brief collapsed** (Lorca's `agentPromptCard`, `MaxLines`): Ducter clamps to 3 lines,
  since the brief is the one thing the user already knows.
- **Only the live step moves**: a spinner on the stretch under way (`ui.Spinner` on the Mac, a
  CSS spinner slowed under Reduce Motion on the phone); settled rows never animate; `c.After`
  only for the clock.
- **Secrets hidden before display.** Lorca strips known secret values at the source
  (`item_without_secrets`). Ducter differs on purpose: the Log keeps the key (a task was given
  it to use it, and the Log never leaves the home), and the home hides keys by pattern in every
  frame and push it sends (the projection), with the clients hiding again at render. Lorca's
  approach would break a task that resumes from the Log needing the key it was given.
- **MyGo techniques used**: `ui.CollapsibleBase` with `Trigger`, `Progress()` (the chevron's
  turn) and `Panel` for a stretch (Lorca keeps its own `open` map; v0.8.3's collapsible animates
  the panel and is accessible as a disclosure); Lorca's `stepLine` hover row (`Padding(2,6)
  .Margin(0,-6)`, a background on hover) in Ducter's tokens; `ui.Spinner`; `c.After`.

### Visual choices we deliberately don't take

- Lorca's palette (its label/muted/green/red text colors, the green `+N` and red `−N`), its
  fonts and sizes (12.5 pt rows), its 2 pt tool-line rhythm, its radii, its icon set (SF
  Symbols mapped to Lucide paths). Ducter's rows use its own tokens: InkSoft and InkMuted, the
  Failed state's ink and surface, Sunken for code, its own drawn marks, Ducter's SM / XS sizes.
- Lorca's tense-shifting verbs ("Running" → "Ran") as the main label: Ducter's row is a
  sentence in the user's language, often the agent's own words, so tense comes from the words.
- Lorca's footer of `+N −N in M files` and the branch, and its header PR button: Ducter keeps
  its Changes section and result actions (D127, D73) and puts who and where in one meta line.
- Lorca's shimmer sweep on text: Ducter's motion tokens have no shimmer and the clay language
  moves only the mascot's face and the one spinner; a shimmer would be a new motion to design.
- Lorca's chat hiding tools behind one working line: Ducter's conversation already does that
  (D104, D129); the opened task is the place for the steps, so they are shown, folded.

## Summary

Lorca, written in Go on the same MyGo framework, is the closest model for handling: one step
type for every harness, narration as Markdown prose, reads and searches folded, each other step
one line with a bounded output on a click, the long brief collapsed, and secrets stripped at the
source. Orca adds grouping per stretch with honest failure counts; Codex adds the single elapsed
clock. None uses the harness's own description as the row's words and none treats a "not found"
exit as neutral; Ducter does both (D152). Ducter takes Lorca's handling and its MyGo techniques
(`CollapsibleBase`, the hover row, `ui.Spinner`, `c.After`) and none of its look: rows are drawn
in Pebble's tokens, and keys are hidden at the home's projection rather than stripped from the
Log.
