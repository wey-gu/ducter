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

## Mem and tasks (D168, D169; built 2026-11-10)

Who: the developer whose Claude Code task on the Mac mini should keep their conventions like
their own sessions do; the consumer whose "book it the way I like" task should know how they
like it; the fresh user who never installed a plugin and still gets a task that knows them.
Nowledge Mem is the memory of Ducter's tasks, the same Mem the user's own agents share.

**Never a reason to buy anything (D169, the author).** Ducter is whole without Mem: the
partner's own digest and window (D123) remember the conversation, and tasks run the same
without the plugin. Everything below shows only to someone who already has Mem connected (its
identity bound, D141, and Mem not answering "missing"). Without Mem there is one mention, in
Settings › 记得什么: what Mem adds and a link, said as "free to download, runs on your own
computer" (DOCUMENTED, research/47 §4); never in the conversation, never a card, never a
blocked feature. Copy never implies payment.

**A task runs with the user's own Nowledge Mem plugin, as the partner (D168).**

- **Mem on** (the default when Mem is connected): the task keeps the user's setup, the plugin
  included, with `NMEM_AGENT_ID` (and `NMEM_SPACE` when bound) set to the persona's identity.
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
- **装上 / Install** asks in place what it changes, then opens one task on that computer with
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
