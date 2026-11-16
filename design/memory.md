# Main AI Memory: Digest, Window, Recall

> Design note for principle 3 · 2026-11-08 · Evidence: `research/14`, `research/15`.

## Shape of the spine (L2)

```
[epoch digests …] [segment digests …] [obligation ledger] [verbatim window ~8–24K]
```

The spine is rendered as a few large blocks (principle 2). The ledger is recomputed only
at cut points, and changes between cuts arrive as L4 deltas.

## Segment digest schema (~1–3K tokens, fixed order)

1. **TOC**: one row per topic, giving its gist, fact-style keywords, and Log range `[seg:msg–msg]`.
2. **Binding decisions**: the decision, a one-line rationale, and a pointer.
3. **Superseded**: `OLD → NEW` with the pointer to where it changed. Neither search nor
   narrative can recover these. In [15], S1 lost them; one run denied Tauri was ever
   proposed.
4. **User anchors**: short verbatim quotes of the user's own binding words. Search
   paraphrases and misses these: verbatim-quote accuracy was S4 0.38 and S5 0.25 vs 0.88–0.94
   with anchors.
5. **Obligations opened / closed**: these are the inputs to the ledger.
6. **Window snapshot at close**: which Focus Windows were opened or closed, with outcomes.
   Live state stays in L4.
7. **Narrative**: one short paragraph. It turned 0.93 into 0.98 in [15].

## Lifecycle

- **Close a segment** when any one of these happens: the verbatim size budget is reached, the
  channel goes quiet past a gap, or the main AI marks a topic as finished.
- **Write it** in the background with a mid-tier model, off the critical path. It is used from
  the next cut onward.
- **Audit it** mechanically before freezing. Anchors must be exact substrings of the cited
  events. Pointers must resolve. Identifiers must appear in the source. Every unanswered ask
  must map to an obligation. A failed audit causes a rewrite, never a freeze.
- **Freeze it.** It is never regenerated; later changes are expressed as Superseded entries.
- **Roll up** into epoch digests mechanically: concatenate TOCs, carry decisions and IDs,
  drop narratives. Never re-summarize.

## Recall

- **Automatic**: before each turn, hybrid retrieval on the incoming message, admitted only if
  it clears a precision gate. It enters as an L4 delta, gets folded after use (principle 5),
  and is logged.
- **Model-initiated**: `log.search` / `log.read`, over channel, windows, and memory. In [15]
  the model searched 22 of 23 times when it needed to and never searched needlessly.
- **Index**: SQLite FTS5 with a CJK-aware tokenizer (jieba or bigram) plus vectors, fused by
  rank. It indexes raw turns, including the assistant's own words, not only extracted facts.
  *As built:* CJK bigrams, exact substrings and recency, fused by rank; **no vectors yet**.
  Automatic recall is built and off by default (D123, "as built" below).
- **Quotes**: a search for "what exactly did the user say" runs lexically on distinctive
  terms, not on paraphrase.

## Digest, window and recall: as built (D123)

Code: `packages/partner/src/spine/` (partner side), `packages/core/src/{log,spine}.ts` and
`packages/protocol/src/search.ts` (store and index). Everything below is derived from the Log
and the store, so a restart picks up where it was; a digest being written when Ducter stopped
is written again.

- **Store.** Frozen digests live in the Log's own SQLite file, table `spine`, append-only:
  triggers refuse `UPDATE` and `DELETE`. They are not channel events, so clients never receive
  them. Every write attempt (ok or not, with the audit's reasons) goes to `spine_attempts`;
  automatic recall goes to `spine_recall`. Migration 1 (`PRAGMA user_version`) adds these and
  back-fills the new search index.
- **Closing** (`segment.ts`). Over the unsummarized tail: past `T_hi` 24K the cut falls where
  the segment is 16–24K, at a turn boundary (after a partner-side event, before the user's next
  message), best first: no unanswered ask straddling it, a 30-minute pause, a task result.
  Below the budget: a part of at least 4K closes after the user merges a task's work or opens
  its PR (a finished topic), or once the channel has been quiet for 2 hours. A trailing user
  message never closes. On first use the spine starts at most 10 segments' worth before the
  end; older history is reached by search.
- **Writing** (`writer.ts`). One tool-less session on the partner's harness, mid-tier model
  (`sonnet` on Claude Code; `DUCTER_DIGEST_MODEL` overrides; `DUCTER_DIGEST=off` turns the spine
  off), after a turn and on a 15-minute timer, never awaited by a turn. The model writes TOC,
  decisions (with `supersedes`), Superseded, anchors, soft obligations and the narrative as one
  JSON object. **Code** writes what it can see: the obligations it tracks by ref (a task still
  running, a question still open, a timer still armed), opened and closed only by code; the
  task snapshot; the global ids `D-n` and `O-n`.
- **Audit** (`audit.ts`), before every freeze: anchors exact substrings of the cited user
  message (≤ 200 chars, ≤ 6); every pointer a channel seq inside the segment; every `closed` id
  open; every `supersedes` a decision in force; identifiers in the digest present in the source;
  the source's salient identifiers (the user's, or repeated; ≤ 12) present in the digest; every
  unanswered user ask mapped to an obligation; a TOC and a narrative; ≤ 3K tokens. A failure is
  **rewritten** with the reasons. A second failure is **repaired by removal** (inexact anchors,
  dangling pointers and bad `supersedes` dropped; the open asks code can see added in the user's
  words; the dropped items recorded in `repaired`), and frozen only if that passes. Otherwise,
  or after 4 writer errors on one segment, a **mechanical index** freezes, marked `degraded`.
  Nothing freezes that failed the audit.
- **Ledger** (`digest.ts computeLedger`): set arithmetic over the digests in order; the model
  never touches it. **Epochs**: past 16 standalone segments, the oldest 8 roll up by
  concatenation: TOC rows one per segment (gists joined, keys unioned, ≤ 24), decisions in force
  copied, Superseded carried, anchors the newest two per segment, open obligations and every
  task's last state carried, narratives dropped. Level-2 epochs are not built.
- **Projection** (`render.ts`), for a fresh session: `<earlier_conversation>` (epochs, then
  segments) · `<open_items>` (the ledger) · `<conversation_so_far>` (the window, each line with
  its `#seq`) · `<tasks>`, then the turn's deltas. The window is everything after the newest
  digest, at least 8K (overlapping the newest digest when the tail is short), at most 24K; when
  the writer is behind, the lines between are named as not shown, with how to read them. The
  live session is never edited: a new digest is used from the next cut. A warm session whose
  context passes 120K, by the harness's own count, re-cuts from the spine. It re-cuts with or
  without a digest (principle 4, between turns; `context.md`, "Session size and re-cut").
- **Search** (`log_search`): a second FTS5 index over CJK bigrams and words (`unicode61` over
  text tokenized in code: Chinese runs become overlapping bigrams), BM25-ranked, fused by
  reciprocal rank with the exact-substring list and recency, the user's own words boosted
  ×1.15. Best match first; each hit capped at 1,200 characters. No vectors yet.
- **Automatic recall** (`recall.ts`): off by default (`DUCTER_AUTO_RECALL=1`). It fires only on
  recall intent (上次, 我说过, we decided, remember, …), searches outside the window, and admits a
  hit only if it shares at least two and half of the message's live terms; at most 3, as an L4
  delta, logged in `spine_recall`, absent from the next re-cut.
- **Measured.** `bun test` runs the eval with fakes (`packages/partner/test/memory-eval.test.ts`):
  an oracle writer over a week-long zh/en corpus, reachability instead of a model. The real
  run is `bun packages/partner/eval/memory/run.ts` (11 question types, rule-graded, false-memory
  and stale-assertion rates); results in `packages/partner/eval/results/*-memory-*.md`.
  Sonnet writer, Haiku answerer, two final runs: full transcript 1.00, the spine 0.97, the
  verbatim window alone 0.87 / 0.77; 0 false memories, 0 stale assertions; one rewrite per run
  (a reply that wasn't JSON), no degraded digest.

## Long-term memory across days (Nowledge Mem): first slice, as built

The Log is this conversation's memory; Mem holds the distilled, durable things across days
and tools (principle 17). The slice gives the partner two tools, both through the user's
`nmem` CLI (`packages/partner/src/memory.ts`):

- **`memory_search(query, limit≤8)`**, model-initiated. Use it when the user points at
  something the conversation doesn't show ("像上次那样", a person, a past choice), or before
  asking something Mem may know. **One per turn** unless the user asks to look again. Hits
  come back compact (title, ≤280 chars, date, kind; no ids or Spaces). They are background:
  never pasted, never "I searched". Recall is invisible in the UI.
- **`memory_add(title, content, importance?)`** for a stated preference, a decision, or a
  durable fact about the user's work or people. Secret-shaped text and task plumbing (task
  ids, branches, worktrees, commit hashes) are refused by the tool. At most two per turn.
  Provenance as in `system.md`. Each save appends `memory_noted {title, memoryId?, replyTo?}`
  on the channel after the turn's text. Clients show it as one quiet line, 记下了 · <title>
  / Noted · <title>, and the partner's words never announce it.
- **Mem missing or down**: both tools answer "not available"; the partner asks like a
  colleague who forgot and never mentions memory. A cold session sees its own saves as
  `[you remembered] <title>` in the projection.
- **Who writes (D141):** the persona's own Mem AI Identity, bound once and named on every call
  (`system.md`, "Identity and Mem boundary"); its tasks run as the same identity, and inside
  them the user's Nowledge Mem plugin runs as that identity ("Mem and tasks" below, D168).
- **Where recall reads (D229):** an identity carries its own lane (its profile's default
  Space, `agents show` → `defaultSpaceId`, read again on each start). With no Space the user
  chose, `memory_search` reads where saves land (no Space named: Mem's default, Only me in a
  team workspace) and the lane (`--space-id`), in parallel, merged by id and Mem's score, as
  Mem's plugin reads the lane for an `NMEM_AGENT_ID`. A chosen Space is read alone. Writes
  name the identity and let Mem place them (research/69: on the author's workspace the two
  reads shared no hit, so reading one alone missed the other).
- **Live check (D63): done 2026-11-09** (`bun packages/partner/eval/mem-live.ts --real`, Cloud,
  7/7). One `memory_add` through the real partner tool and nmem client, as the scratch identity
  `ducter-scratch`; the stored record read back with `metadata.agent_id = ducter-scratch`,
  `metadata.source_app = ducter`, `source = ducter` and `metadata.source_message_id =
  ducter;persona=…;log=1`; then deleted. The key in use may create neither Spaces nor Agent
  profiles (403), so the write went to the user's private Personal zone instead of a
  `ducter-scratch` Space. `nmem m show` (0.10.116) omits metadata; the record was read from the
  same REST endpoint nmem calls.
- **Measured** (`packages/partner/eval`, category `memory`, fake Mem): recall on
  "像上次那样" (the brief carries the recalled specifics), recall about a person, remembering
  a stated preference (zh and en), no save of a task result or a pasted key, no recall for a
  general question, Mem down.

## Settings › 记忆 / Memory and › 连上的 AI agent (D295, built 2026-11-17; was D257)

### Who, what they feel, how it starts

- **A fresh user without Mem.** Before: they never thought about "memory"; repeating themselves is a
  quiet tax they accept. After: a small partner holding its notebook says **让 {name} 记住你 / Let
  {name} remember you** and one sentence of what it gives (never repeating yourself; it knows what
  Claude Code or Codex saved too). How it starts: two steps on one card, **装上 Nowledge Mem** (one
  tap on the home) and **登录你的 Nowledge Mem** (a one-time link), and the app's way as its note
  (already have the Nowledge Mem app? open it). No concept to learn: no "CLI", "Space", "identity".
- **A Mem user (Cloud, or the local app / Vault).** Before: Mem is theirs, and they want to see that
  Ducter treats it as theirs, not as a private store. After: the page leads with what it learned
  this week, then **你别的 AI 记下的 / Saved by your other AI tools** (Claude Code, Codex, Cursor…
  by their own names and coins), then where it's kept in their words (**Nowledge Mem Cloud，换哪台电脑都是同一份**,
  or **{home} 上的 Nowledge Mem 应用里，不离开那台电脑**) and the name it signs with. How it starts: nothing
  to do; it is already connected, and it shows the count Mem holds (**一共有 1,284 条记忆**).
- **The heavy multi-agent developer.** Before: a raw `ducter · Only me · personal-…` line and a loud
  断开 made the link feel fragile. After: **你的 AI agent 能找到 {name}** in the done ink, its identity and
  place as two plain rows, who may reach it as one choice, the raw ids behind a quiet **详情 / Details**
  for support, 断开 quiet until reached for and asking in place. How it starts: **连接 / Connect** once.

North star: 好用 (one switch, one tap to forget, two setup steps); 顺滑 (asks in place, no dialogs);
赏心悦目 (the clay grid, small marks in the tile column, no hero card); 放心 (forget asks first and says
whether Mem forgets or the line only leaves the list; nothing another tool saved can be deleted here);
惊喜 (the memory is shared: what Claude Code saved shows up, by name).

### The panes (both clients, wide and phone; D289's grid)

**Memory, on:** (1) one group: the notebook in the tile column, **{name} 记得你**, **这周新记了 N 条** in
the done ink (or **这周还没有新记的**), the switch at the right edge; its foot says what the switch does.
(2) **这周记下的** and **更早记下的** as sections, one group each: an accent pebble in the tile column,
the title, its age; **忘掉** quiet at the right edge; tapped, the row asks in place (**忘掉「…」？它以后
不会再想起。** or, without a Mem id, **从这里拿掉「…」？Nowledge Mem 里那条还在。**) with **留着** and **忘掉**.
The last group's foot: Mem's count and **去 Nowledge Mem 看**. (3) **你别的 AI 记下的**, with its note
(**…{name} 也想得起来。**): one row per memory another AI tool saved, its coin (or its letter), the
title, **{tool} 记的**, its age at the right; read-only (another tool's memory is forgotten in Mem).
(4) **Nowledge Mem** as one group: Mem's letter on a notebook-blue pebble, **已连上**; **记在哪儿**,
**它的名字**, the one update worth a tap as a row (D229's words), the raw facts behind **详情**, the
version as the foot's note. **Off:** only the first group, its foot what stays. **Before Mem:** the
partner at 84–96 on the paper (an empty state, never inside a group), then one group: Mem's faded
letter, how it stands (**还没接上 / {home} 上还没装 / 装好了，还差登录**), the two steps (D283's step
marks) with D225's words, and the app's way as the foot.

**Connected AI agents:** one group: two agents' coins in the tile column; connected: **你的 AI agent
能找到 {name}** · **已连上**, **它的身份** (**「ducter」，你的 agent 按这个名字找它**), **在哪儿** (**你自己的空间，
只有你的 agent 在里面**; a named place: **「{label}」空间**), **谁能找到 {name}** with its choice under its
words, the foot **断开后它不再收，也不再发。** with **详情** and a quiet **断开** that asks in place
(**断开？你的 AI agent 就找不到它了；…**). Other states keep D205/D225's words in the first row (ready:
**连接** at its right edge). **它记住的规矩 / What it has learned** is a section of its own, a row per
agent with its coin.

### The glance at Mem (core, `mem-glance.ts`)

`MemView.glance` carries `{ total, others[] }` from one read-only `nmem --json m list -n 40`, at most every
2 minutes, in the background (a fresh settings frame follows), only while memory is on and Mem answers,
never on a test without a fake nmem. `others` holds at most 6 memories whose `source` is a known AI tool
(`AI_TOOLS`: claude-code → Claude Code, codex → Codex, cursor, gemini-cli, openclaw, …); Ducter's own
(`ducter`) and the person's own (`cli`, the app, a clip) are left out. Titles, sources and dates only;
contents never leave Mem. `BridgeView.where` (cloud / local / server) comes from `nmem status`.backend.

### Deep integration: the plan (D295)

Built now: the glance, the panes, where-it's-kept, forget that asks. Next, each behind its own trigger
(`todo.md`): (a) **recall said quietly in the conversation**: when a reply leans on a memory, the reply's
Details carry **想起了 · {title} / Recalled · {title}** with its source tool, tappable to forget (a partner
tool change: D175's eval applies); (b) **a weekly digest you can correct**: once a week, inside the morning
note, "这周记下了 5 条" with each line's 忘掉; (c) **Mem's health on the first row**: a link Mem refuses or a
sign-in that expired says so on the Memory head row in the failed ink, with the one step; (d) **other tools'
memories as task context**: tasks already use the real Mem plugin (D168); the brief names that what Claude
Code saved is there to recall; (e) **Cloud or local chosen in one calm flow** when both exist.

## Mem and tasks (D168, D169; built 2026-11-10)

Who: the developer whose Claude Code task on the Mac mini should keep their conventions like
their own sessions do; the consumer whose "book it the way I like" task should know how they
like it; the fresh user who never installed a plugin and still gets a task that knows them.
Nowledge Mem is the memory of Ducter's tasks, the same Mem the user's own agents share.

**Never a reason to buy anything (D169, the author).** Ducter is whole without Mem: the
partner's own digest and window (D123) remember the conversation, and tasks run the same
without the plugin. Everything below shows only to someone who already has Mem connected (its
identity bound, D141, and Mem not answering "missing"). Without Mem there is one mention, in
Settings › 记忆 / Memory (D257): what Mem adds and a link, said as "free to download, runs on your own
computer" (DOCUMENTED, research/47 §4); never in the conversation, never a card, never a
blocked feature. Copy never implies payment.

**A task runs with the user's own Nowledge Mem plugin, as the partner (D168).**

- **Mem on** (the default when Mem is connected): the task keeps the user's setup, the plugin
  included, with `NMEM_AGENT_ID` (and `NMEM_SPACE` when bound) set to the persona's identity,
  and `NMEM_CLI_PATH` when Ducter has one (D229; the plugin reads the identity's lane itself).
  The plugin's own hooks then do what they do in the user's sessions (VERIFIED in its
  `hooks.json`, community repo 2026-11-10): SessionStart injects the Context Bundle (Working
  Memory as fallback) and restores it after compaction; UserPromptSubmit nudges one targeted
  search for prior-decision work; Stop / SessionEnd capture the session as a thread with
  `nmem t save --from <agent> --session-id <native id>`.
- **Provenance:** the plugin's writes carry the persona's identity and the agent's own
  `source_app` (DOCUMENTED); it takes no other provenance from the environment (VERIFIED: the
  NMEM_* names its scripts read). The link to the Log is the native session id, which the Log
  keeps per task. `NMEM_NO_MAILBOX_NOTICE=1` keeps the persona's Bridge mailbox out of tasks.
- **Where the plugin isn't there** for that agent on that computer (Mem's own check, D169,
  says absent, or has nothing to say yet: no nmem there, an older worker), Ducter fills in: before the first turn the runner asks the partner's Mem client once
  with the title and brief (≤ 300 chars, 4 hits, 6 s cap) and puts `<what_i_know>` (ids, "the
  brief wins") in front of the first turn, logged by id; a read-only task `memory_search`
  (≤ 5 results, 6 per task, each read logged by query and ids) is answered by the home, so a
  worker holds no Mem key. `<what_i_know>` is capped at the render too (4 notes, 220 chars
  each; `KNOWN_MAX`, guarded in `prompt-budget.test.ts`). Where the plugin is there **in any
  form** (installed, review, update: D174 (6); the author's own Codex is a review), neither: it
  already gives that context, and a second recall would double it. The plugin's own Context
  Bundle size is not measured yet (harness-facts `memPlugin.contextCost: "unknown"`, todo).
- **Writing:** the plugin keeps the thread; memories come only from the partner. A task
  proposes `remember` (≤ 3) in its report; the partner keeps what is durable with
  `memory_add` and the task's provenance. The brief says not to save or distill memories
  from inside the task. Open: whether Mem distills captured threads into memories by itself,
  which could duplicate a `remember` (todo).
- **Browser places get none** (the clean setup leaves every user plugin out): the plugin would
  put the user's Context Bundle into the session unasked, and a page could steer the agent to
  type it into a form or a URL.
- **Mem off** in Ducter: no recall, no tool, no words about memory in the brief, no NMEM
  identity, and the plugin turned off in the session the way harness-facts `memPlugin.off` says
  for each agent (D174 (7)): Claude Code `--settings enabledPlugins`, Codex
  `-c plugins.<id>.enabled=false`, pi `--no-extensions` (all of the user's pi extensions, as pi
  has no per-package switch), DeepSeek Harness under a Ducter-owned home (INFERRED). Open: whether
  Codex's Mem hooks script sits outside the plugin (todo).

**Where it is, per computer (D169).** Tasks depend on the plugin, so Ducter keeps track of it
on every computer, without owning it (D17):

- **The check** is Mem's own `nmem --json plugins inspect` (local, read-only): on the home
  directly, on a worker through its `mem_plugins` op; at start, daily, when a computer comes
  online, after a sign-in or an agent update, and when a setup task ends
  (`packages/core/src/mem-plugins.ts`, parsing in `packages/protocol/src/mem-plugins.ts`).
- **The line** per installed agent in its coin detail (copy in the glossary). Installed is
  only what the check knows: every answer carries "runtime loading is not verified", which
  alone never makes a review; the check's own `review`, several copies, or an install it
  can't call enabled does. `update` shows only when the check says so.
- **安装 / Install** asks in place what it changes, then opens one task on that computer with
  that agent (else any agent signed in there), with the user's own setup, origin "you": it
  follows https://mem.nowledge.co/SKILL.md for that host only, never guesses a URL or key,
  asks for a connect link when Mem isn't connected there, verifies with the check, and says
  the agent must be restarted.
- **Ducter recommends it once** per computer and agent, ever, wherever the check finds a
  signed-in agent without it: one card, Go 装上 suggested, no timer (it changes the agent's
  own settings, so it waits for the tap).
- **Memory off:** no line, no card, no install.

## Open (measure in the prototype)

- Roll-up loss over months: unmeasured anywhere. Confidence is low.
- Window size and the auto-recall gate threshold: confidence is medium.
- Whether the TOC improves search decisions on long channels. [15] was only about 3×
  compression on a single corpus that refers to itself.
- The eval suite over 11 question types, with false-memory and stale-assertion rates, is
  built (D123) and runs on every change to the digest prompt; its corpus is small (~2K tokens)
  and self-written, so it checks what is kept, not compression. A real-channel replay is owed
  (`todo.md`).
- The auto-recall gate: built and off; on the eval corpus 5 of 8 admitted hits carried the
  evidence. Turn it on only past 0.8 on a real channel.
