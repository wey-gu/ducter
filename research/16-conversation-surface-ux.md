# 16 — The conversation surface: respond-first turns, inline vs delegated work, and the living summary

Date: 2026-11-08. Question: the user sees **only a conversation** (text now, voice later). Focus Windows are hidden
unless the user opens "show focus windows". A typical exchange is ask → instant "I'll check that" → work → answer.
Whether the main AI did the work itself or delegated it must feel **identical**. Main-AI turns stay short
(principle 7), and that constraint must not show. How do shipping systems keep a fast conversational surface coherent
with slow work, when should the main AI work itself, is a separate fast "talker" model worth it, and how should the
batch "while you were away" summary (principle 8) behave?

Tags: **[V]** verified (read the source, doc page, or paper page today), **[S]** secondary (search summary, third-party
article, or memory; not re-read), **[I]** my inference. `R/` = `<scratch>/repos/`.
Builds on `01` (dots, Muse, Grok Bot, OpenClaw; not repeated) and principles 3, 4, 6, 7, 8, 12.

---

## 0. Answer in one screen

- **Every request that is not answered at once becomes a *job*.** There are two kinds of executor. A **fork** is a
  side context that shares the main prefix cache (principle 6's read-fold). A **Focus Window** is the other. The user
  sees one shape either way: an ack message, an ephemeral status line, and the result as a **new message that replies
  to the ask**. Both executors return the same typed report (principle 12), so the main AI writes the result in the same
  voice either way. The two paths look identical because they share one code path, not because the UI covers up a
  difference. This is what OpenClaw does: one progress draft carries on across `sessions_yield`, and the subagent
  registry owns completion [V].
- **The main AI does work in-turn only when the answer will land in about 10s or less**: no environment, read-only,
  ≤3 cheap tool calls, ≤2K tokens into context. Everything else is a job. A fork whose run outgrows its budget is
  **promoted** to a window without restarting. The user sees nothing change, because the status line was already
  showing.
- **No separate talker model for text.** The main AI already is the talker. A typing indicator covers the first second.
  A second model adds a second prefix, a second voice, and the stale-belief problem the Talker-Reasoner paper itself
  admits to (§1: "the Talker operates with a more outdated view of the world") [V]. A cheap utility model may
  *narrate* progress, as OpenClaw does with bounded input [V], because narration is ephemeral and claims nothing.
- **For voice, yes: use a realtime front-end constrained to an allow-list** (OpenAI's chat-supervisor pattern [V]).
  The ~800ms voice-to-voice target [S] and ~200ms human turn gaps [S] can't be met by a frontier model behind a
  100K+ prefix. The front-end talks; the main AI decides. Everything the front-end says is logged as channel messages.
- **The ack states the action, never the outcome.** The model must see a pending marker for each open job, or it will
  make up results (OpenAI: "the model sometimes hallucinates the content of a nonexistent function response") [V].
- **The living summary works because no one has read it yet.** Editing in place is honest only while nobody has
  seen the earlier text. The rules: mutable while unread, frozen once seen, and anything already shown in a push
  preview can be resolved but never removed. Edits don't notify anyone [S], so push is a separate channel that is
  coalesced and delayed, and it fires only for needs-you items.
- **"jev":** this matches **Jev**, a non-autoregressive *decision* model ("System One" API, TypeSafe). An open drop-in
  called **Kev** reports 18.1ms of model time to answer 6 questions on an H100 [V for Kev README; S for Jev itself].
  It is a router or classifier, not a conversational front-end. It could fit Ducter's cheap semantic checks
  (principle 16), the voice front-end's escalate gate, and attention classification. It should not make the
  inline-vs-delegate call (§6.5).

---

## 1. Dual-process and fast/slow architectures

| System | Fast part | Slow part | How they stay coherent | How the slow result merges | Tag |
|---|---|---|---|---|---|
| DeepMind **Talker-Reasoner** (arXiv 2410.08328, NeurIPS'24 workshop) | Talker: conversational reply | Reasoner: plans, tools, belief updates | **Shared memory** only: "the main way the Talker (System 1) and Reasoner (System 2) interact is through memory" (§3.2) | The Talker reads the latest belief. It "might operate with a delayed view of the world" (§3.2). A belief field decides when the Talker **waits** ("in the planning coaching phase the Talker waits, otherwise it does not", §4.2) | V |
| OpenAI **Realtime** async function calling | Realtime speech model | Your function, possibly a reasoning model | The session continues while the call is pending. GA models emit tuned **placeholder** responses ("I'm still waiting on that") because the model otherwise "hallucinates the content of a nonexistent function response" | `function_call_output` plus a new response | V (developers.openai.com/blog/realtime-api) |
| OpenAI **chat-supervisor** (openai-realtime-agents) | gpt-4o-realtime-mini: greetings, collecting info | gpt-4.1 via a `getNextResponseFromSupervisor` tool | An allow-list of "Permitted Actions" sets the decision boundary. The chat agent says "give me a moment to check on that" | The supervisor's text is read out. About 2s between the end of the filler and the answer | V (README) |
| **Pipecat** | LLM in the voice pipeline | `cancel_on_interruption=False` makes the call async: "the conversation is not held while the function runs" | Intermediate results (`is_final=False`) are "injected into the LLM context as async-tool developer messages" and don't close the call. A `cancel_<name>` tool is generated automatically | A result that arrives before the conversation has moved on "settles in place as an ordinary tool result". Otherwise it is "injected back into the context as a developer message" and starts a new inference | V (docs.pipecat.ai function-calling) |
| **LiveKit Agents** 1.6 async tools | Agent LLM | The tool becomes non-blocking at its first `ctx.update()` | `ctx.update` "adds a status to the chat context, the LLM reads it, voices something natural". `with_filler` plays only after `delay` seconds of idle, "so they don't talk over the user or pile up". Duplicate policy is `allow/reject/replace/confirm`, matched "by tool name only" | "The final return is voiced as a follow-up reply when the agent is next idle." Cancellation is opt-in because "most tools (orders, writes, payments) aren't safe to interrupt partway through" | V (docs.livekit.io/agents/logic/tools/async) |
| LiveKit **preemptive generation** | The LLM starts before end-of-turn is confirmed | — | The result is discarded if context or tools change in `on_user_turn_completed`. Issue #4219: two full requests per turn, double the cost | — | S |
| **Gemini Live** | Live model | Function declared `NON_BLOCKING` | The response's `scheduling` field: **INTERRUPT** ("tell you about the response it got right away"), **WHEN_IDLE** ("wait until it's finished with what it's currently doing"), **SILENT** ("use that knowledge later on") | Per-result delivery policy | V (aistudio.google.com/docs/live-api/tools). S: NON_BLOCKING is the default on the 3.8 Live model |
| **ElevenLabs** agents | Agent | Tool | `tool_call_sound`. In the default "with pre-speech" mode, "the agent must speak before the tool executes", so the ack line goes in the system prompt | — | S (docs page via search) |
| **Moshi** (Kyutai, arXiv 2410.00037) | One full-duplex model, 160ms theoretical / ~200ms practical | none (single model) | "Inner monologue": time-aligned text tokens come before the audio | n/a: no slow worker | S |
| **Sesame CSM** | Expressive TTS conditioned on context | none | Own open problems: "turn-taking and pacing" | n/a | S |
| OpenClaw (local docs) | Utility model (`claude-haiku-4-5`, `gpt-5.6-luna`) writes **narration** after ~20s of quiet | Primary agent | Narration input is bounded: "inbound request text plus the same compact tool summaries ... never raw command output". It "never falls back to the primary model". "Ending or replacing that turn cancels its pending utility-model request and prevents late results from updating the draft" | Final answer, see §2 | V (`R/openclaw/docs/concepts/progress-drafts.md:316-360`) |

**Lessons.** (a) Every working stack merges the slow result as **context plus a new generation** by the conversational
model: Pipecat's developer message, LiveKit's follow-up reply, Gemini's scheduling, the realtime
`function_call_output`. None of them splices the raw worker output into the user's view. So the voice that delivers
the result always belongs to the conversational model. For Ducter that voice is the main AI. (b) The failures are the
same everywhere: hallucinated pending results (OpenAI), fillers arriving *after* the answer or being repeated because
the filler text entered history (protoVoice notes; LiveKit closed a related issue as "filler belongs in prompt") [S],
duplicate calls, and unsafe cancellation. (c) Talker-Reasoner is a position paper with a qualitative case study. Its
one real mechanism is "the talker reads belief state; a flag forces it to wait", and that is exactly the pending
marker plus the inline budget below. It shows no quantitative coherence evidence [V].

**"jev / JEV".** Search found: **Jev**, a TypeSafe decision model served behind a "System One" API. It is
non-autoregressive: a transformer backbone with fixed decision heads that scores the options you supply instead of
generating text [S: kunalganglani.com blog, LinkedIn posts; TDS article 403'd]. **Kev** (github.com/jaredpalmer/kev)
is an open "drop-in for Jev: the TypeSafe Python SDK works against a Kev server unchanged", built on Qwen3.5/3.8.
"Kev-4B answers six questions about a new short text in 18.1 ms of model time on an H100", excluding HTTP [V, README].
Two unrelated products share the name: "Jev Router" (an AI/ML API gateway) and a `jev-model-router` plugin
(Hermes) [S]. Assessment: Jev is a **System-1 classifier for programs**, not a conversational talker. A
practitioner warning matters for Ducter: probabilities sum to 1, so a schema without a "none/other" option will
confidently choose wrong [S].

---

## 2. Respond-first in shipping products

| Product | Said immediately | Progress | Result arrives as | Sub-work visibility | Tag |
|---|---|---|---|---|---|
| **OpenAI dots** | Chat continues ("while you keep chatting") | Profile shows **In progress / Scheduled / Completed**. Proactive updates appear in the conversation. Routing by update type (routine → ChatGPT, decisions → Slack, urgent → text) | Into the conversation. Per-task completion notifications | Delegated Codex threads "appear as separate conversations" that the user can steer. "A completed run doesn't by itself confirm" success | V (`01` §dots; help article 20001530 via search) |
| **ChatGPT deep research** | Clarifying questions *before* starting | Side panel with sources and activity log. **"Update"** lets the user add context mid-run without losing progress (Nov 2025) | Report in thread plus a notification ("leave and get a notification") | Panel can be shown or hidden | S |
| ChatGPT / Gemini thinking | — | Thinking summary. Gemini **"Answer now"** skips the extended reasoning (it replaced "Skip") | Same message | Collapsible reasoning | S (no official ChatGPT "answer now" found) |
| **Grok Bot** | — | "Shows each step as the Bot works". Unread badge | "A summary of everything it did". Notification when it "finishes or is waiting for you". Suppressed while the app is focused. Phone notified ~3 min later unless you open it first | Peer Bots, DMs | V for steps/summary/finish notification (`01`); S for the 3-min delay and focus suppression (docs page 404'd today) |
| **Meta Muse** | — | Milestone-gated | "Comes back when something changes or when it needs approval" | Hidden VM | V/S (`01`) |
| **Claude.ai Research** | — | "Researching…" indicator | In thread. A browser notification on completion appears only as a *requested* feature (GitHub issue "Browser notification when task completes in Claude.ai web version"); none confirmed shipped | — | S |
| **Manus** | Plan first | Plan/progress panel, live "Manus's Computer", `todo.md`. Leaked prompt separates non-blocking **notify** from blocking **ask** | In thread | Computer view on demand | S |
| **Devin (Slack)** | Replies in-thread when tagged | Status chip **working / blocked / done**. Emoji reactions mark runs "completed or failed" | Thread replies. Notifications by DM | Bidirectional thread↔webapp sync. `sleep` / `archive` keywords | V (docs.devin.ai/integrations/slack) |
| Cursor Slack agent | ⏳ reaction | — | ✅ reaction plus reply. Users complain that ✅ reads as "issue solved" | — | S (forum) |
| **OpenClaw** | Status headline (model preamble or utility filler) after a 1.5s start delay | **One edited draft**: headline, plan steps, approvals; an optional tool log. Tool failures stay out of the default draft | Discord: **a fresh message, then the draft is deleted**. Error finals keep the draft. Slack: new message, drafts deleted after confirmed delivery. Edit-in-place only in `partial/block` modes | The draft carries on across subagent yield. Typing indicator during the settlement continuation | V (`progress-drafts.md:57-61, 462-490`; `subagent-yield-handoff.md:305-319`) |

**Convergent shape** [I]: (1) an immediate, cheap, *non-committal* signal: typing, a reaction, a status chip, or a
preamble. (2) **ephemeral** progress, kept as one mutable artifact rather than a stack of messages (OpenClaw is
explicit: "instead of a stack of temporary 'still working' replies"). (3) the final result as a **new** message,
because new messages notify and edits don't, and because a failed edit loses text (OpenClaw's stated reason:
"sending a fresh final answer beats losing text, mis-threading a reply, or overwriting a draft"). (4) sub-work is
reachable but not pushed (dots threads, the Manus computer, Devin's webapp).

Two product details are worth copying. OpenClaw's draft "is not proof that a child finished": progress text and
completion are owned separately [V]. Devin's three-state chip matches Ducter's attention axis (principle 10) [V].

---

## 3. The inline-vs-delegated decision

### 3.1 Latency perception (what the budget must respect)

- Nielsen: 0.1s feels instantaneous, 1s keeps the train of thought, 10s holds attention. Past 10s, users "need to
  reorient". Past 1s, show feedback [S, nngroup; from Miller 1968].
- Conversational turn-taking: Stivers et al. 2009 (PNAS 106:10587) covered 10 languages. All avoid overlap and keep
  gaps short. Cross-language mean gaps stay within ~250ms of each other, and the modal transition is 0–200ms [S].
- Voice agents: Daily/Pipecat recommends a **800ms voice-to-voice** target. Vendor blogs: <500ms feels natural and
  >1s feels broken [S]. Moshi reaches ~200ms only as a single full-duplex model [S]. OpenAI's chat-supervisor accepts
  ~2s *after the filler*, and the filler is what makes that tolerable [V].
- Text chat has no hard turn-gap norm, but 1s and 10s still apply [I]. A typing indicator meets the 1s limit without
  any model output.

### 3.2 What systems actually use as criteria

No surveyed product publishes a numeric rule [I]. The criteria they reveal:
expected wall time (Pipecat and LiveKit make a call async based on whether it is "long-running" [V]); **safety of
interruption** (LiveKit: writes and payments aren't cancellable [V]); **needs an environment** (dots → Codex/Work
tasks; Grok → the VM [V]); **needs user steering or follow-ups** (dots threads are user-steerable [V]); **output
size** (principle 6 read-fold, ≤2K into the main session); and **decision boundary by allow-list** (chat-supervisor
[V]). Claude Code's subagent/background split and its `run_in_background` for shell commands are the in-harness
version of the same idea [S].

### 3.3 Making both paths render identically

The user's premise forbids two UX paths. Three mechanisms get there [I]:

1. **One job abstraction.** `job{id, ask_ref, executor: fork|window, state, ack_msg, status_line}`. The ack, the
   status line, and the result message are written from job state, never from executor type.
2. **The status line is owned by the control plane, not the model.** It lives in the ack message's metadata. It is
   ephemeral, so it is not part of the Log's message text, though its transitions are logged as events. Its content
   comes from job state plus optional utility narration. Fork and window both feed it the same events (OAR
   normalized stream, principle 1).
3. **Promotion without restart.** A fork *is* a harness session (Claude Code `--fork-session`, measured in `13`).
   When it passes its budget, the control plane registers it as a window: it gets a card and a residency state, and
   attention moves to `working`. Nothing is re-run. The status line was already showing, so the user sees no change.
   **Caveat:** a promoted fork carries the whole channel prefix, which principle 11 forbids for windows ("never fork
   the whole channel"; scope violations go 8.6% → 19.7% [1]). Options: (a) allow it, because the fork's task is
   narrow and it ends soon; (b) on promotion, start a clean window from brief + the fork's checkpoint and let the fork
   finish its current step. Recommend (b) when the remaining work is long or writes, (a) when it is a few more reads.
   *Uncertain; measure.* On Codex, fork means `thread/sample` (ephemeral, can't be continued, `13`), so promotion
   there is always (b).

---

## 4. Coherence risks and the rule for each

| Risk | Evidence | Rule for Ducter |
|---|---|---|
| **The ack over-promises** ("Sure, it's fixed!") | Realtime models invent pending results [V]. The Cursor ✅ gets read as "solved" [S] | The ack names the *action and the scope*, never the outcome: "I'll check the CI logs for PR 412." No answer content in the ack unless it is labeled provisional. The prompt rule is enforced by a cheap post-check (no claims about job results in an ack) [I] |
| **The model fills in a pending result** | OpenAI placeholder responses [V] | Each open job appears in L4 as `pending: J7 "CI logs for #412", started 14:02, no result yet`. Ducter's equivalent of the placeholder: if asked, say "still checking" [I] |
| **The fast answer contradicts the slow result** | Talker stale beliefs (§3.2) [V] | Provisional statements are tagged in the Log (`provisional_for: J7`). When the result lands, the main AI must reconcile: "Earlier I guessed X; it's actually Y." Never correct silently by editing the old message (principle 6 forbids editing anyway) [I] |
| **Duplicate answers** | LiveKit duplicates by tool name; OpenClaw "individual announcements must not start a competing continuation"; settlement "does not repeat results the requester already consumed" [V] | One delivery receipt per job. A result turn checks `job.delivered`. Several completions that arrive together settle in **one** successor turn (OpenClaw settlement batch, grok-build `NotificationDrain`, `01`) |
| **Follow-up while work runs** | OpenClaw `steer` default: messages are appended after the current tool batch, unstarted calls get "Skipped to process an incoming message", and "each steered user input gets its own delivered answer in order" [V]. ChatGPT deep-research "Update" [S]. Grok: your DM takes priority and can redirect [S] | The main AI is never blocked (principle 7), so a follow-up is simply the next main turn. It classifies the message: **steer** an open job (window: mid-run injection if the adapter supports it, otherwise queue to its next boundary; fork: cancel and re-fork if it's cheap, otherwise let it finish and re-ask), **new** work, or **chit-chat**. Default when it can't tell: treat it as new and mention the open job ("still checking #412; meanwhile…") [I] |
| **"Never mind"** | LiveKit: cancellation opt-in, writes unsafe [V]. Grok: "Stop now" doesn't undo completed actions [S]. dots: Pause ≠ stop delegations [V] | Cancel maps to job → `dropped`. If effects already ran (intents log, principle 18), say which ones. Don't push a "cancelled" notice. The result of a cancelled job is suppressed unless it reveals something the user must know [I] |
| **Late filler / filler echo** | protoVoice: the tool beat the filler; TTSSpeakFrame entered history and was repeated [S] | Text: the ack is part of the same main turn that dispatched, so it can't arrive late. Voice: fillers come from the front-end, are logged as utterances, and are never re-read as instructions [I] |
| **Result lands while the user is typing or mid-conversation about something else** | Gemini INTERRUPT / WHEN_IDLE / SILENT [V]. Iqbal & Bailey: deferring to breakpoints reduces frustration and reaction time [S] | Each report carries a delivery class that maps onto principle 8: `silent` (L4 only, mentioned when relevant), `when_idle` (default: after the current exchange settles), `interrupt` (needs-you / urgent only) [I] |

---

## 5. Notifications and batch harvesting

### 5.1 Evidence

- **Interruption cost.** Mark et al.: interrupted work resumed after ~23 min on average, and only ~82% was resumed the
  same day. Interrupted people work faster with more stress (Mark, Gonzalez & Harris CHI'05; Mark, Gudith & Klocke
  CHI'08) [S; the exact figures differ between the papers and interviews]. Iqbal & Bailey: workload dips at subtask
  boundaries, and delivering at breakpoints lowers frustration (CHI'08, TOCHI'08/'10, OASIS) [S].
- **Batching summaries.** iOS Scheduled Summary batches non-urgent notifications at chosen times, and Time-Sensitive
  ones break through [S]. Apple Intelligence's AI summaries put **false headlines** under BBC's logo, and Apple
  paused news summaries in iOS 18.3. The interim fixes were a beta warning, **italics for AI-generated summary text**,
  and per-app opt-out [S]. Lesson: an AI summary that *rewrites* someone else's words loses trust fast. Summarize
  your own work, and link to the source rather than paraphrasing the stakes.
- **Inboxes.** Linear: read/unread, snooze; a snoozed item "reappears as a new, unread notification", and new activity
  cancels the snooze [S, linear.app/docs]. GitHub and Superhuman use a "done" triage state separate from read [S].
  dots separates In progress / Scheduled / Completed [V].
- **Edit-in-place pitfalls.** Editing a sent Slack message doesn't re-notify (Pylon broadcasts) [S]. Adding a mention
  by editing never notifies on Discord [S]. Slack keeps no recoverable edit history [S]. The general rule: **an edit
  is invisible to anyone who already looked, and silent to anyone who didn't** [I].
- **Approvals with defaults.** Grok: approvals from unattended work "expire after about 30 minutes"; approvals in a
  live chat wait [V]. Principle 12 already gives every question a default.

### 5.2 The living summary: why the user's design is right, and what makes it safe

The "edit my last Slack message to my boss" instinct works because the boss **hasn't read it yet**. So the safety
property is about *what has been seen*, not about editing as such [I]:

- **States.** `open` (unread, mutable) → `seen` (frozen) → optionally `superseded` (a newer summary exists; the
  frozen one stays as history). There is at most one `open` summary, and it is always the **last** message in the
  channel. If anything else is posted after it (the user replies, a result goes out), it freezes and the next batch
  starts a new one.
- **What counts as "seen"** (read-receipt semantics): rendered in a focused viewport on any of the user's devices for
  ≥1.5s, or any user message after it. A push preview counts as *partially* seen: the items it showed are now
  **pinned**. They can later be marked resolved ("✓ resolved itself"), but they are never deleted or reworded.
  That stops the "the notification said X but the message says Y" trust failure [I].
- **What may change while open:** append items, update an item's state (working → done), re-order by priority,
  collapse routine successes into a count ("3 tasks finished quietly"). Don't change the wording of decisions the
  user may have been pushed about.
- **Layout** (principle 8, "silence means success"):
  1. **Needs you**, numbered, each with the question, the **default**, and when the default applies:
     "1. Merge PR 412 after CI is green? → default: yes at 18:00 (reversible)".
  2. **Done (with evidence)**: one line each, plus a pointer to the window card. Unverified items say so.
  3. **Quietly finished / dropped**: a count, expandable.
  Reply grammar: "ok" accepts all defaults; "1 no, 2 b" answers individually. Defaults apply automatically only when
  they are **reversible and pass the intent policy** (principle 18). Irreversible items wait, and say they are waiting.
- **Generated, not narrated.** The summary is rendered from typed reports (principle 12: state, ≤600-char summary,
  questions with defaults). A model writes only the one-line gists. This keeps Apple's failure mode, a model
  paraphrasing stakes, out of the decision rows [I].
- **Log semantics (principle 1).** Each edit is an appended `summary_revision` event, and the visible message is a
  projection. The Log never mutates. For the main AI's spine, only the **frozen** version enters L2. While it is
  open, the summary is an L4 delta, so edits don't churn the cache [I].

### 5.3 Push vs in-app

- **In-app only (badge):** routine progress and done items. This is the default.
- **Push:** only when the open summary gains a *needs-you* item or an urgent result, **coalesced** (one push per
  window of N minutes) and **delayed** while the user is active in the app. Grok's pattern is to suppress while
  focused and push ~3 min later if still unseen [S]. The push text quotes the needs-you lines exactly, because those
  lines get pinned.
- **Escalation ladder** (principle 8): badge → message → push → call. "Call" belongs to the voice surface and is
  reserved for deadlines the user set.
- Approvals carry an expiry like Grok's. When one lapses without a safe default, it turns into a `blocked` row, not
  a second push [I].

---

## 6. Synthesis for Ducter

### 6.1 Turn protocol (identical for inline and delegated)

```
user msg ─► control plane: receipt + typing indicator (≤100ms, no model)
         ─► main turn (warm prefix, L4 = pending jobs + summary state)
              ├─ A. answerable now (≤ inline budget) → stream answer. Done. No ack.
              └─ B. needs work → first output: ack sentence (action + scope, no outcome)
                     then tool: job.open{ask_ref, brief, executor_hint}
                     turn ends (target ≤ ~5s wall)
control plane: status line on ack (job state + optional utility narration after ~20s quiet)
executor (fork | window) ─► typed report ─► waiter wakes main AI (principle 7, coalesced)
main result turn: reconcile provisional claims → result as NEW message replying to the ask
                  → job.delivered=true → status line cleared (kept on failure, OpenClaw rule)
if user is away: the result folds into the open living summary instead of a standalone message
```

- In A, the main AI may make ≤3 cheap read-only calls inside the turn (card reads, `log.search`). If a watchdog sees
  the turn pass **~3s** with no output, the control plane shows the same status line as for jobs, so a slow inline
  answer looks just like a job [I].
- In B, the ack and the result are always **two messages**, even when a fork finishes in 4s. This keeps the shape
  identical. If a job finishes before the ack has rendered (under about 1s), the ack may be dropped and the result
  posted alone. That is the only allowed collapse [I].
- Several reports that land together give one result turn. That turn may produce several messages, one per ask, in
  ask order (OpenClaw's ordering rule [V]).

### 6.2 The budget: do it myself, fork, or window

| Route | When (all must hold) | Why this bound |
|---|---|---|
| **In-turn** | No environment. Read-only. ≤3 tool calls. Expected ≤~10s. ≤2K tokens into context | 10s is Nielsen's attention limit, and also the longest a user follow-up waits behind a main turn (principle 7 coalesces mid-turn events) |
| **Fork job** | No environment beyond reads. Read-only. Expected ≤~2 min. The result folds to ≤2K | Shares the prefix cache (`13`), and fits principle 6's read-fold. Cheap enough to cancel and re-run on a steer |
| **Window job** | Any of: needs an environment (worktree, browser, phone, machine). Has effects or writes. >~2 min or >~10 tool calls. Likely follow-ups or user steering. A matching work key already has a window (principle 11) | Gets checkpoints, residency, and handoff (principles 10, 13), and is user-steerable through "show focus windows" |
| **Promotion** | A fork passes 2 min or 10 calls, or reaches an effect | §3.3 options a/b. Invisible to the user |

These numbers are *starting* values [I]. Log `(route, predicted, actual wall, tool count, promoted?)` for every job,
then tune. The ask is to keep promotions under ~10% and to rarely exceed the in-turn budget.

### 6.3 A separate fast talker model?

- **Text: no.** Cost: a second prefix (identity plus tail, rebuilt on every cut), a second voice, and the stale-belief
  problem. Benefit: perhaps 1–2s earlier first words, which the typing indicator and a warm-prefix main AI mostly
  cover already (cache reads at 0.05×, `12`). The only extra model worth having is a **utility narrator** for the
  ephemeral status line. Its input is bounded to job events, and it never writes into the Log as an assertion
  (OpenClaw pattern [V]) [I].
- **Voice: yes, as a constrained front-end.** A realtime speech model whose small prefix holds a persona voice card,
  the last ~20 turns, open-job states, and the open summary. Its allow-list: greet, acknowledge, clarify slots, read
  back results and summaries the main AI has written, report status, take "never mind". Anything substantive goes to
  the main AI as an ordinary user message, and the front-end fills the gap with an ack. Every front-end utterance is
  logged as a channel message (`author: persona/voice`), so the main AI sees it as L4 and the Log stays the truth.
  Cache: the front-end prefix is small (≤10K) and separate, so the main prefix is untouched. The cost is the realtime
  per-minute price, not cache misses. The escalate/handle gate is where a Jev/Kev-style classifier earns its place
  (~20–150ms, with an explicit "other → escalate" option) [I; Jev numbers S]. *Uncertain:* whether any realtime
  model holds persona voice consistently against the main AI's text style. Test before committing.

### 6.4 Living-summary notification design (summary)

`open` (unread, mutable, tail-only, at most one) → `seen` (frozen; push-previewed items pinned) → `superseded`.
Content: needs-you with defaults → done with evidence → quiet count. Push only for needs-you or urgent items,
coalesced, delayed while the app is active, quoting the pinned lines exactly. Rendered from typed reports, with a
model writing only the gists. Revisions are Log events, and only the frozen version enters the spine.

### 6.5 Where a Jev-like decision model fits (and doesn't)

Fits: principle 16's "cheapest capable model" checks (has this waiter's condition semantically happened?);
precision-gated retrieval in principle 3 (is this recall relevant: yes/no); attention-class tagging of reports
(silent / when_idle / interrupt); the voice escalate gate. Doesn't fit: the inline-vs-delegate route. That needs the
main AI's understanding of the ask, and it already comes out for free in the main turn's first tokens. Principle 14
also prefers curated rules plus judgment over a learned router. Unverified: Jev's own accuracy and latency. Only
Kev's README numbers were read.

### 6.6 Open questions / uncertainty

1. Promotion option (a) vs (b): how much does a whole-channel fork drift on a 10-minute task? Measure with `01`'s
   scope-violation style probe.
2. The "seen" threshold (1.5s focused viewport) is a guess, and multi-device read sync needs the control plane to
   hold receipts.
3. Whether to show the ack at all for fork jobs that usually finish in under 5s. That gives up shape-identity for
   less noise. Recommend: keep the ack and A/B test.
4. Steering a fork mid-run isn't supported on most harnesses (cancel and re-fork is the fallback). Check the OAR
   adapter capability `mid-run injection` (principle 15).
5. Voice: barge-in on a front-end that is reading back a result. LiveKit and Pipecat cancel speech on interruption by
   default [V]. The main AI must learn which part of the result was actually heard (truncate the logged utterance at
   the barge-in point, which the OpenAI Realtime `conversation.item.truncate` supports [S]).

## Sources

- Talker-Reasoner: https://arxiv.org/abs/2410.08328 (html v1 read) · Moshi: https://arxiv.org/abs/2410.00037
- OpenAI Realtime notes: https://developers.openai.com/blog/realtime-api · chat-supervisor:
  https://github.com/openai/openai-realtime-agents
- Pipecat: https://docs.pipecat.ai/pipecat/learn/function-calling.md · LiveKit async tools:
  https://docs.livekit.io/agents/logic/tools/async.md · LiveKit preemptive: https://github.com/livekit/agents/issues/4219
- Gemini Live tools: https://aistudio.google.com/docs/live-api/tools · ElevenLabs tool sounds:
  https://elevenlabs.io/docs/eleven-agents/customization/tools/tool-configuration/tool-call-sounds.md
- protoVoice fillers: https://protolabsai.github.io/protoVoice/explanation/natural-fillers.html
- Jev/Kev: https://github.com/jaredpalmer/kev · https://www.kunalganglani.com/blog/jev-models-explained-routing.md
- Devin Slack: https://docs.devin.ai/integrations/slack · Cursor reactions:
  https://forum.cursor.com/t/ability-to-adjust-slack-integration-emoji-reactions/155299
- Grok Bot: https://docs.x.ai/grok-bot/faq · dots help: https://help.openai.com/articles/20001530
- Deep research update: https://alternativeto.net/news/2025/11/chatgpt-now-lets-users-add-context-to-live-queries-without-restarting
- Nielsen: https://www.nngroup.com/videos/3-response-time-limits-interaction-design/ · Stivers 2009:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4586330 (search only) · Daily 800ms:
  https://ai.engineer/talks/pipecat-cloud-enterprise-voice-agents-built-on-open-source
- Mark: https://isr.uci.edu/events/KM-Forum-2008/presentations/Mark-KM-Forum08.pdf · Iqbal & Bailey:
  https://www.interruptions.net/literature/Iqbal-CHI08.pdf
- Apple summaries pause: https://www.macrumors.com/2025/01/16/ios-18-3-news-notifications-removed/ · Linear inbox:
  https://linear.app/docs/inbox · Pylon edits: https://support.usepylon.com/articles/7752069374-do-broadcast-edits-re-notify-slack-channels
- Local: `R/openclaw/docs/concepts/progress-drafts.md:11-61,316-360,462-490`;
  `R/openclaw/docs/concepts/queue-steering.md:19-49`; `R/openclaw/docs/concepts/subagent-yield-handoff.md:12-36,305-319`
