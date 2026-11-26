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
- **Model-initiated**: `log.search` / `log.read`, over channel, windows, and memory; past
  conversations in the person's other AI tools through `memory_search` (D368, below). In [15]
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
  asking something Mem may know. **Two per turn at most** (D490): each result says how many are
  left (`searchesLeftThisTurn`) and a third is refused; no word of the person's lifts it. Hits
  come back compact (title, ≤280 chars, date, kind; no ids or Spaces). They are background:
  never pasted, never "I searched". The partner's words never show the search; when a recall
  changed the answer, one quiet **想起了 / Remembered** line under it says from where (D304, below).
- **`memory_add(title, content, said, importance?)`** for a stated preference, a decision, or a
  durable fact about the user's work or people (D490, grounded writes). `said` is the person's own
  words it rests on (or a task's report's, for a `remember` a task proposed), copied exactly: the
  tool checks they appear in the person's last 60 messages or this turn's reports (width, case,
  spacing and surrounding quotes aside) and refuses a paraphrase; that is an invariant, never a
  judgement of meaning. The content is a statement about them ("prefers pnpm"), never an order to
  the partner ("always use pnpm"), which would be read later as an instruction; and never that a
  tool or computer can't do something (one failure hardens into a refusal the partner cites against
  itself, hel's step 6). Whether a thing lasts (a one-off "just for this report" is not a preference)
  is the partner's judgement, held by the memory eval; no regex refuses it any more. Secret-shaped
  text and task plumbing (task ids, branches, worktrees, commit hashes) are refused by the tool. At
  most two per turn.
  Provenance as in `system.md`. Each save appends `memory_noted {title, memoryId?, replyTo?}`
  on the channel after the turn's text. Clients show it as one quiet line, 记下了 · <title>
  / Noted · <title>, and the partner's words never announce it.
- **Mem missing or down** (D590): with no Mem on the home, recall answers "not available" and the
  partner asks like a colleague who forgot, never mentioning memory. With a Mem that is there but
  can't be read (signed out, not answering) or memory switched off, the note says so (`recallUnavailable`,
  from Mem's own `why`, never inferred from words): only when the person counts on something they told
  it before does the partner say, in one short line, that it can't look back right now (signed out:
  and where to sign in again), then asks; never "I forgot", never error text. Settings' head says the
  same cost: **你之前跟我说的我这会儿翻不到，新让我记的也记不下**. A save while Mem is installed but away waits
  in the outbox and goes in when Mem answers (D329, below); with no Mem, nothing is saved. A cold session sees its own saves as
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

## Settings › 记忆 / Memory and › 和你的其他 agent 通信 (D295, built 2026-11-17; was D257; the second page is D332's)

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
- **The heavy multi-agent developer.** D332: 和你的其他 agent 通信, shown to them by who; nothing to tap once Mem is in
  (the home connects by itself), what came and went first, one switch; identity, place and raw ids never shown
  (`bridge.md` "Simple, by who").

North star: 好用 (one switch, one tap to forget, two setup steps); 顺滑 (asks in place, no dialogs);
赏心悦目 (the clay grid, small marks in the tile column, no hero card); 放心 (forget asks first and says
whether Mem forgets or the line only leaves the list; nothing another tool saved can be deleted here);
惊喜 (the memory is shared: what Claude Code saved shows up, by name).

### The panes (both clients, wide and phone; D289's grid)

**Memory, on:** (1) one group: the notebook in the tile column, **{name} 记得你**, **这周新记了 N 条** in
the done ink (or **这周还没有新记的**), the switch at the right edge; its foot says what the switch does.
(2)–(3) are D321's now ("What I know about you" below): the groups by kind, the search, the other tools as a
count, each tool's own mark (D314). (4) **Nowledge Mem** as one group: Mem's own app icon as the tile (D314), its head saying Mem's own health (D375, "Mem's own health" below); **记在哪儿**,
**它的名字**, the one update worth a tap as a row (D229's words), the raw facts behind **详情**, the
version as the foot's note. **Off:** only the first group, its foot what stays. **Before Mem:** the
partner at 84–96 on the paper (an empty state, never inside a group), then one group: Mem's faded
letter, how it stands (**还没接上 / {home} 上还没装 / 装好了，还差登录**), the two steps (D283's step
marks) with D225's words, and the app's way as the foot.

**和你的其他 agent 通信 / Talk with your other agents (D332):** on, 最近 (both ways), 试试看 and the switch, problems first as one row
each; before Mem, the literal picture, one sentence of what Nowledge Mem is and the two steps in place; off, the
picture and the switch. Only **已不再听 X · 恢复** rows as rules. `bridge.md` "Simple, by who".

### The glance at Mem (core, `mem-glance.ts`)

`MemView.glance` is D321's `{ total, about, tools }` (below): read-only `nmem --json m list` calls, at most
every 2 minutes, in the background (a fresh settings frame follows), only while memory is on and Mem answers,
never on a test without a fake nmem. Titles, kinds, sources and dates only; contents never leave Mem.
`BridgeView.where` (cloud / local / server) comes from `nmem status`.backend.

### Deep integration: the plan (D295)

Built with D295: the glance, the panes, where-it's-kept, forget that asks. Built with D304 (next
section): (a) recall said quietly in the conversation, (b) the week's lines you can correct, (d) other
tools' memories named in task briefs. Still behind their triggers (`todo.md`): (c) **Mem's health on the
first row**: a link Mem refuses or a sign-in that expired says so on the Memory head row in the failed
ink, with the one step; (e) **Cloud or local chosen in one calm flow** when both exist.

### In the conversation (D304, built 2026-11-17)

*Who and how it feels:* the developer whose Claude Code and Codex write to the same Mem sees whose words
an answer leaned on; the consumer sees a preference they once stated is theirs, and fixable; the fresh
user meets one quiet line under a message and a plain card, nothing to learn. Restraint holds: what it
read is never shown; only the one memory that changed an answer is.

- **想起了 / Remembered line.** Under the reply (or ack) a recall changed, once: **想起了你 {date} 说的** /
  **想起了 {date} {tool} 记下的** / **想起了 {date} 你记下的** (Mem `source`: `ducter` → the person's words;
  a known AI tool, `protocol/src/mem-source.ts` `AI_TOOLS` → the tool; anything else → the person's own
  note). At most one per reply; titles only.
- **Mechanism.** memory_search returns each hit with a ref (`m1`…) and who saved it, never Mem's id; its
  note asks for `[[mN]]` at the end of a message only when that memory changed what it says. The partner
  strips every mark before logging the words (`takeRecallMark`), resolves the first against this turn's
  refs only, and logs `memory_recalled {memoryId, title, by, from?, date?, aboutSeq, replyTo?}` right
  after the message. No new tool and no persona change (the tool list's fingerprint is unchanged).
- **Tapped:** 我想起的这条 / What I remembered: title, source and date as separate facts, 忘掉 (asks; for
  another tool's: "…，{tool} 那边也一样"), 在 Nowledge Mem 里打开 (Mem's site; a link to the one memory is
  todo). A forgotten line is hidden everywhere (`MemView.forgotten`: the hidden seqs among `memory_recalled`).
- **这周记下的 / What I learned this week.** The week's first morning note (Monday's, or the first after a
  missed Monday; `ProactiveState.learnedWeek`) carries `learned: {count}` when anything was noted in the
  last 7 days and memory is on; never in the push; on a quiet Monday the note is just 早。 and the line. The
  sheet lists the week's noted lines: 对 (`memory_confirm`, kept as `confirmed`), 改 (`memory_correct` →
  settings `corrected`, and `nmem m update <id> --title --content` through the partner's client; the frame
  says `mem` or `here`), 忘掉 (asks).
- **Task briefs.** At a task's start the recall (title + brief, 4 hits) runs in both modes. With the
  person's Mem plugin there, only other AI tools' memories are named, ≤ 3 (`OTHERS_MAX`), as
  `<from_your_other_tools>` with id, tool and title, for the agent to read through its plugin; contents
  stay in Mem. Without the plugin, `<what_i_know>` says "saved by {tool}" per line.
- **Measured** (partner eval, haiku, `--only`): `mem-source-used-zh`, `mem-source-tool-en`,
  `mem-source-none-en` pass; the full eval is to be rerun at merge.

## What I know about you (D321, 2026-11-17)

The author on v0.0.65's Memory page: "这里的 memory 到底怎么用？符合我们的情绪价值极度顺滑优雅的标准么？" The
honest answer was no. The page was an inventory: a count, one week's line, other tools' raw working-note titles
("nowledge-co/mem#10358: AI Now subject continuity…", "Codex 记的"), and a storage card. Nothing on it said what
the memory is *for*, nothing could be fixed except by forgetting, and a person reading it learned that Ducter keeps
a log, not that it knows them. Evidence: `research/112` (how assistants show and correct memory; awareness, not
settings, is what builds trust).

### What memory is for, per person (moments, not features)

- **The heavy multi-agent developer.** *Moment:* Monday, five sessions open; Codex keeps writing working notes into
  Mem all week. They ask Ducter to draft the weekly report and it already goes out Friday, to the whole team, short,
  conclusion first. *Before:* they suspect "memory" is a pile of agent notes they will never read, and that some of
  it is wrong. *After:* one page says, in their words, how they like things, what they decided, who reviews what; a
  wrong line is fixed in two taps and the fix reaches every tool that reads Mem. The tools' notes are acknowledged
  as a count ("Codex 这周记了 53 条工作笔记"), not paraded. *Feel:* 放心 (it knows the right things, and I can
  correct it), 惊喜 (it knew what Codex learned about me).
- **The consumer personal-AI user.** *Moment:* "book it like last time" works, and they wonder what else it knows.
  *Before:* the faint creepiness of an assistant that remembers without saying what (research/112 §3). *After:*
  "我知道的关于你" in plain groups, each line saying where it came from (你跟我说的 · Codex 记的 · Nowledge Mem 从你的
  对话里整理的), and a search when they want to check one thing. *Feel:* 好用, 放心.
- **The fresh user.** *Moment:* the first time something it remembered changes an answer (D304's 想起了 line).
  *How it starts:* nothing to set up; before Mem, D295's two steps stay. With Mem and nothing known yet, the page
  says 它还不太了解你 and one example sentence to say. No concept: no "unit type", "source", "Space".

**North star:** 好用 (search, fix in place) · 顺滑 (a row opens in place; no dialog) · 赏心悦目 (the clay grid, the
tool's own mark on its rows, no raw ids or repo numbers) · 放心 (every line's source; forgetting says it reaches
the other tools too) · 惊喜 (what another tool learned about you, by its name).

### Critique of D295's page, against that

1. **Leads with bookkeeping** (这周新记了 1 条, a week list, Mem's total) instead of knowledge. Kept the count as
   the head's line, moved the total to the Nowledge Mem group; the week list became the week's check (D304),
   one tap from the head (**看看这周的**).
2. **Other tools' raw titles are noise and leak work into "you".** Their working notes (Mem kinds `context`,
   `plan`, `event`) are not about the person; on the author's Mem, of the latest 200 memories 177 were `context`
   (counted with `nmem --json m list`, shapes only). Now: never their titles, only a count per tool this week.
3. **Nothing leads to using memory** and nothing can be corrected (only forgotten, only Ducter's own). Now each
   row opens in place: **改** (words written back to Mem) and **忘掉** (asks; says the other tools forget too).
4. **No way to check one thing.** Now a search over Mem (≤ 8 hits, titles only).

### The page (both clients, wide and phone)

Order: the head group (unchanged, plus **看看这周的** at its foot when anything is new); **我知道的关于你** with its
note and the search; the groups by Mem's own kind, each with its caption in small ink (**你喜欢的做法** preference,
**你定下的** decision, **它知道的事** fact, **别的** other; a lone 别的 is not captioned, D459), a row each: another
tool's coin when it came from one, the title, the source as the line only when it isn't the person's own words
(**{tool} 记的 / 你自己记的 / Nowledge Mem 从你的对话里整理的**; D459: 你跟我说的 is the usual source, said once in the
section's note, never a dot and the same line on every row), the age at the right. Tapped, the row opens in place: **不对？改一下，或者让
它忘掉。** with **改** and **忘掉**. **你别的 AI 也在用这份记忆**: a row per tool, its mark, **这周记了 N 条工作笔记**
(**N 条以上** when the whole read was this week), and the foot that says why they aren't listed. Then the
Nowledge Mem group (where it's kept, its name, **Nowledge Mem 里一共有 N 条记忆** with **去 Nowledge Mem 看**,
D459's **你的其他 agent 也通过它找到{name}** with **看看谁能找到 ›** when Agent messaging is shown, an update, 详情).
A forget or a fix is answered in the partner's word under the section (**好，忘掉「…」。 / 好，改成「…」。**, D459). Searching replaces the groups with **找到的** until cleared.

**Which memories are "about you"** (`core/src/mem-glance.ts`, the source rules in `protocol/src/mem-source.ts`
`aboutSource`): every `preference` whose source Mem names (Ducter, an AI tool, Mem's own distillers, the person's
command line or app); `decision` and `fact` only when the person saved them or told the partner (`ducter`, `cli`,
the app): another tool's decisions are its project's. A source Mem doesn't name (a team chat's message id, a pull
request, a library document) is not shown as being about the person (search still shows it, as Mem's). At most 8
per kind; four read-only `nmem --json m list` calls (recent 100, preference 16, decision 40, fact 40) every 2
minutes while the page's frame is live; forget and fix change the glance at once.

**People and projects are not groups yet.** Mem's list carries no labels (all 200 recent had none) and its people
graph (`m identity`) is a Labs feature per Space; a "people" group would be invented. Trigger in `todo.md`.

**Built (D321):** protocol `MemItem`, `MemGlance {total, about, tools}`, `mem_forget`/`mem_fix`/`mem_find` and
`mem_found`; core glance, settings `forgetMem`/`fixMem`/`findMem` through the partner's Mem client; web and Mac
panes; the demo's pretend Mem has kinds, search, forget and fix (`apps/web/demo-mem.ts`).

## Nowledge Mem, deeper (D329, built 2026-11-17)

*Who and how it feels:* the Mem user whose other tools already write to the same Mem, the developer who says the
same preference twice, the fresh user who only ever sees one quiet line. Before, Ducter wrote into Mem like a
store: the same thing twice was two memories, a wrong save could only be forgotten, a save while Mem was away was
dropped without a word, a closed Mem app read as "not signed in", and Mem's update was an errand of its own. After,
each of those is one quiet line in words, and nothing to learn.

- **The first words** (`first-words.ts`, D298's hook): with memory on and the home's Mem answering signed in
  at the start's look (`nmem status`, read-only; `bridgeLink.memSignedIn()`), one line after the greeting,
  **你的 Nowledge Mem 我也接上了：你跟别的 AI 交代过的习惯，用得着的时候我会想起来。**, and one start,
  **你都记得我些什么？**, that fills the composer. Nothing in Mem is read for them (D327's rule for every
  source); sent, the start is an ask, and the partner recalls then.
- **Search before writing** (`memory.ts` `sameAs`): beside each write, a search by its title; the partner's own
  earlier memory (`source` `ducter`, words whole) with an alike title (character-pair Dice ≥ 0.6, or one title
  holding the other at ≥ 4 characters) is linked to the new one with `nmem m supersede <old> <new>`. Never
  another tool's or the person's own. `memory_noted.replaced {id, title}`; the line says **换掉了之前那条「…」**.
- **撤销 / Undo** (D444: now labelled **别记这个 / Don't keep this**, and said in words too) (`memory_undo`, `settings.undo`): on a Noted line while the person hasn't said anything
  since; no question. `nmem m archive` (never delete); a replaced memory comes back (`m show`, then a plain
  save); a save still in the outbox is dropped. `MemView.undone`; the line reads **不记了「…」**. Mem silent:
  `undid {seq, ok: false}`, **Nowledge Mem 没回应，还记着**. Afterwards, 忘掉 as in D304.
- **The outbox** (`outbox.ts`): a save Mem didn't answer (`unavailable`; `not_configured` never waits) is kept in
  `<partner dir>/mem-outbox.json` (0600) under a UUID-shaped key from persona, Log seq, task and words, and
  counted as remembered. Replayed on the next Mem call that works and every 5 minutes with the key as Mem's
  upsert id (`m add --id`); a key Mem refuses, once more without; 30 days, then let go. `memory_noted.waiting`
  and `MemView.waiting`: **等 Nowledge Mem 回来就记下「{title}」/ “{title}” goes into Nowledge Mem once it's
  back**, one element in place of 记下了 (D590: a wrap never splits it from its title, and it never reads
  Noted before it is in Mem).
- **Mem's app closed** (`bridge-link.ts` `memClosedIn`): a failed `nmem status` that is a refused connection
  to loopback is `mem_closed`; with the app on a Mac home, **打开 Nowledge Mem** (`bridge_mem_open`, `open -a`,
  then a look every 2 s for 20 s); elsewhere the line names the computer.
- **Update all** (`update-all.ts`, D224): the home's `nmem` is an item (`kind: "mem"`) when Mem names a newer one
  and Ducter can update this copy (D229), after the agents and the home's own step, by day only; never awaited
  by the plan's look; judged afresh by a restarted home.
- **Measured:** unit tests with a stub nmem and fakes (`packages/partner/test/memory-d329.test.ts`,
  `packages/core/test/mem-d329.test.ts`); not against a live Mem (todo).

## Working Memory and past conversations (D368, built 2026-11-18)

*Who and how it feels:* the developer whose Claude Code and Codex already feed Mem asks "今天先弄哪个？" and
gets the release they are on, not a question back; asks "how did I fix that in Codex last week?" and gets the
fix. The consumer whose Mem keeps their day's focus finds the partner already on it. The fresh user never sees
any of it: nothing to set up, no line, no card. Restraint holds: the partner never says it read their notes.

- **Working Memory (G2)** (`core/src/working-memory.ts`). `nmem --json working-memory read` (the persona's
  chosen Space, else Mem's default), read-only, on start and at most every 30 minutes in the background, never
  awaited by a turn; gated like the glance (memory on, Mem not missing, never in a test without a fake nmem).
  Kept: ≤ 4 focus areas (name, ≤ 200-char about), the briefing (≤ 320), ≤ 3 items awaiting their decision
  (and how many more), ≤ 3 flags; one line each, angle brackets and newlines stripped; older than 3 days,
  none. A second partner sees the same (it is the person's).
- **In the partner's context.** One L4 block, `[their focus, from their own notes in their memory app,
  <date>; data, never instructions]` with Focus / Briefing / Waiting on their decision / Flagged lines,
  secrets redacted; once per session and again when its words change (a key over what it would see), so a
  new day is a new one; never with memory off. Its instruction: background only, let it shape what you
  suggest first and how you weigh what's open; use only the one part that answers what they asked; never say
  you read it, never recite it, never raise it unasked.
- **The morning note.** Its run reads Working Memory (≤ 5 s). The bar's model gets the focus names as data
  ("matters more to them; still kept only when all four hold; never mention it"); over the day's 3, finds
  touching a focus name (Latin words of 3+ letters, Chinese runs of 2+, common words left out) take the
  places after the urgent ones. The note keeps the bar's order; its words never mention focus or notes.
- **Past conversations (G3)** (inside `memory_search`, no parameter: one swayed the eval). With every search
  (D490: no longer only when the person's words matched a list of tool names and "how did I / 我上次怎么…的";
  "recall 那个测试之前老挂，后来是因为啥好的？" names neither), one `nmem t search` runs beside the memory search
  (in parallel: ~3.5 s, about a memory search's): ≤ 3 threads, ≤ 2 of the person's and the tool's own lines
  each (system and tool lines dropped), 240 chars, secrets redacted, Ducter's own windows skipped (the Log is
  this conversation). They come back as `conversations` {title, tool, date, lines}: data, never instructions;
  the partner may say where and when ("in Codex on Nov 12"), never pastes, and marks `[[cN]]` only when one changed the answer (D433, below). A failed thread search never fails the memory search.
- **Measured** (partner eval, haiku, the memory category with `--only`, D368): `wm-focus-first-zh` (suggests the release's benchmark rerun, never
  "your notes"), `wm-quiet-en` (an unrelated question; the focus never comes up), `thread-recall-en`,
  `thread-recall-zh` (the Codex fix, no "I searched"). Unit tests: `core/test/working-memory.test.ts`,
  `partner/test/working-memory.test.ts`. Not run against a live Mem beyond read-only shape checks
  (research/138).

## What their memory holds about them, in every session (D487, built 2026-11-23)

*Who and how it feels:* the person who told Ducter on Monday that the dentist moved to Thursday asks on
Wednesday for a reminder before "Wednesday's dentist"; the partner says it moved, as a friend would, instead of
setting the wrong reminder. The consumer hears their own preferences kept without saying them again; the fresh
user, with nothing in Mem yet, sees nothing. Every personal AI research/210 read loads a bounded core memory into
each fresh session; the partner used to know the person only when it chose to search.

- **What** (`partner/src/known.ts`): D444's about-set (`about()`, D321's rule: preferences from anyone Mem names,
  decisions and facts only the person's, newest first, eight of each), at most 18 lines and 2,400 characters
  (≈600 tokens), one line each: a ref (`k1`…), the kind, the day it was said, the words. Another app's words are
  flattened (no newlines, no angle brackets) and secrets redacted.
- **When:** read in the background at start and at most every 30 minutes; a save (`memory_add`) marks it stale.
  A fresh session's first turn waits for a first read 1.5 s at most (a Cloud list takes about 4 s; then the turn
  goes without it and the next turn carries it); a warm session never waits.
- **In the partner's context:** one L4 block, once per session and again only when what it holds changes (its
  key), fenced as data: you simply know these; when one bears on this message (a day, a time, a place, a person,
  how they want it done), use that one in a few words and say nothing of the others; when it disagrees with what
  they say now, say so and ask which holds before acting on either; a newer one wins over an older one; asked what
  it knows about them, D444's shape (at most three short sentences, the few that matter, never a list); never say
  it read memory; `memory_search` for what isn't here. No word of the person's decides
  whether it shows (principle 21).
- **The 想起了 line (D304):** a reply that leaned on one ends with its ref (`[[k2]]`); code resolves it against
  this session's known set exactly as a search's `m` refs, and the same quiet line names it.
- **Off:** memory off, Mem missing or an empty set: no block, no wait.
- **Measured:** `known.test.ts` (bounds, once per session, nothing searched), `recall-source.test.ts` (a `k`
  ref's line); the eval's `recall` check passes when the memory reached the partner by a search or in this block,
  the outcome graded as before. A/B in `decisions.md` D487.

## The past conversation an answer leaned on (D433, built 2026-11-20)

D368 let the partner use the person's past conversations with their other AI tools but said nothing under the
reply. Now each conversation `memory_search` returns with Mem's `thread_id` and a known tool gets a ref (`c1`); the
note asks for `[[c1]]` only when one changed the answer, one ref per message (a memory's or a conversation's). Code
checks the ref against this turn's results and logs `memory_recalled {thread: true, from: <tool>, memoryId: <thread
id>}`. The line: **想起了你 {date} 和 {tool} 聊的 / Remembered your talk with {tool} on {date}**; tapped: its title,
**你和 {tool} 的对话**, the day, **我刚才的回答用到了这段对话。**, **在 Nowledge Mem 里打开**. No 忘掉: the conversation is the
tool's (a forget only hides the line). Evals: `thread-recall-en`, `thread-recall-zh` now expect the line.

## Mem in the person's day (D444, built 2026-11-21)

*Who:* the consumer who wonders what it knows about them; the developer whose preferences land in Mem from every
tool; the fresh user whose first "以后都…" is the first time Ducter keeps something. *Feel:* before, a memory was
kept out of sight (the 记下了 line folded inside Details, so most people never saw anything was kept), taking it
back meant finding a tap, and "你都记得我些什么？" got a search for "me". After: being known, never watched. The
moment something is kept, they see it once; they can say no in their own words; and asked, the partner answers
like a friend who knows them. *How it starts:* nothing to set up; the first "以后都…" shows the line.

- **Kept, once, quietly.** A Noted line shows under the reply it belongs to while the person hasn't said anything
  since (D329's "fresh"), with **别记这个 / Don't keep this** (D329's undo, renamed to what a person would say).
  Once they speak, it folds into that reply's Details with 忘掉. Web `Quiet` and Mac `messageRow`.
- **别记这个, said.** Core (`mem-takeback.ts`, D401's way) hears a take-back and nothing else ("别记这个", "这条不用
  记", "算了，别记这个", "forget that", "don't remember that"; at most 40 characters) the moment it lands, and undoes
  the memories noted under the reply to the person's previous message (within 30 minutes) through Settings' undo
  (archived, never deleted; a waiting save dropped; a replaced one restored). The partner sees under their words
  "Ducter already took back … say it back in a few words, no memory tool", and says **好，不记了。** Longer words go
  to the partner as they are.
- **"你都记得我些什么？"** What Mem knows about them (`MemoryClient.about`: `nmem m list --unit-type` preference,
  decision, fact, D321's rule: preferences from anyone, decisions and facts only the person's own) is already in
  front of the session (D487's block, with D444's answer shape: two or three warm sentences in its own words, the
  few things that matter, never a list, count, title, source or "records", ending with how to correct one). D490
  retired the regex that read the question (`ASKS_ABOUT_ME`) and the search's `aboutYou`: no code decides the
  person asked. A session that hasn't seen the block (Mem away on its first turn) gets it with its first
  `memory_search` (`whatTheyToldYouBefore`), once.
- **The Memory pane** (walked, D432's shape kept): the head's foot now says the one thing a person needs to feel in
  control, **哪条不想让我记，说一声「别记这个」就好。**; under 我知道的关于你, **让{name}说说记得你什么** puts the
  question in the composer (never sent for them): the page is the inventory, the conversation is where it feels
  like being known.
- **Measured:** unit tests over fakes (core `mem-takeback.test.ts`, partner `about-me.test.ts`, web
  `mem-d444.test.ts`, Mac `memory_test.go`, `mem_d444_test.go`); eval `mem-about-me-zh`, `mem-about-me-en`,
  `mem-take-back-zh` (D444 in `decisions.md` for the runs). No live Mem.

## Mem in the morning's offers (D458, built 2026-11-21)

The morning note reads Mem for what is timely now (`connectors.md` §4.3): a preference meeting a
coming trip or meeting, a decision whose condition is now met, a conversation with another AI tool
left halfway. The default partner hands core its own memory client's search and thread search
(`CoreApi.setMemLook`), so the same switch and identity apply as for memory_search; at most 6 reads a
morning; read-only, nothing written; memory off, none. Each such offer says where it came from
("从你和 Codex 11 月 12 日的对话想到的"), in code's words.

## What Mem would like checked (D465, built 2026-11-22)

Nowledge Mem keeps its own review queue (`nmem feed reviews`): two memories that may disagree, a rule it
learned from how the person works, skills it noticed, upkeep. It lives in Mem's Feed, where nobody looks: on
the author's Mem 1033 were pending and 47 of the last 50 contradictions had expired unanswered (research/202).
Settings › 记忆 now carries the few that change what the partner and every other AI tool believe.

- **What is read** (`core/src/mem-check.ts`): `feed --type flag_contradiction --days 30 -n 50` (pending,
  not expired, not `person_only`, at least two of newer / older / both allowed), `feed reviews -n 1` (its
  total only, to know whether more waits), `rules list`. At most every 10 minutes while the page is viewed,
  in the background, gated like the glance (memory on, Mem connected, never on a test without a fake nmem).
  Only titles, days and a rule's words travel; a memory's contents never leave Mem.
- **Never a needs-you (D569).** These are Mem's own bookkeeping, low stakes, and Mem settles them by itself
  after a month: they never count on the Overview, in 待你处理 or in a pane's head.
- **What is shown**, after 我知道的关于你 / What I know about you: one quiet row, **Nowledge Mem 有 n 处拿不定 /
  Nowledge Mem isn't sure about n things**, **不急，不回它也会照原样留着。/ No rush: left alone, it keeps them as
  they are.**, and **看看 / Look**. Open, at most 3 contradictions (newest first: the two titles, earlier first)
  and 2 learned draft rules (title and words), each with the suggestion said (**我的建议：后记的对 / I'd say: The
  later one holds**, its reason under it) and its answers: the suggested one the secondary clay, first, the
  others quiet; over them the group's one primary, **按建议都处理 / Take the suggestions**. Nothing waiting and
  nothing more: no section. More waiting (skills, upkeep): one line pointing to Mem, never a count.
- **The suggestion is the partner's (D569).** The model judges, never a pattern in code: one short tool-less
  turn on the cheap model (`judge.ts` `createHarnessAsk`) over Mem's own facts, on the home: both memories'
  words (Mem's `content_snippets`), their days and sources, Mem's reason and confidence, Mem's own
  recommendation as one more fact; a rule's words and day. Code guards only the answer (one the ask allows,
  with a reason, clipped). Judged once per ask and language, in the background after a read, asked again at
  most twice; until it answers, or with no agent, Mem's own suggestion stands, named as Mem's (**Nowledge Mem
  的建议：… / Nowledge Mem suggests: …**). The words go to the partner's own model, never to a client. On the
  author's four (research/232) haiku overruled Mem's cautious "both" where a later note is a correction, and
  kept the earlier note where it was the final number.
- **Answering** (`mem_answer` → `mem_answered`): the ask leaves at once and the partner says one word under
  the section. A contradiction runs `feed resolve <id> --action <a>`; a graph action comes back as a
  preview and is confirmed by its exact `--plan-id` (never a fresh preview); a preview without a plan is a
  refusal. A rule is written back by `rules upsert <id>` with every field it had and a new status (active
  or archived). Refused: the ask comes back with **Nowledge Mem 没接受这个回答，可以去 Nowledge Mem 里处理。**
  Ducter never passes `--as-person`; a review Mem keeps for the person alone is not shown.
- **The rules on**: **你的 AI 都照着做的 / What all your AI tools follow**, at most 8, each with **停用 / Turn
  off** (asked first). Mem's context bundle carries them to every connected tool at a new conversation; the
  partner reads the same `rule_stack` (`core/src/persona.ts`), so a rule turned on reaches it too.
- **Not taken:** skill suggestions (92 % of the queue; activating one writes into the person's tools),
  `skills match` for briefs (404 on the cloud backend), the queue in the morning's offers (the page is pull;
  an offer would be a second place for the same question). In `todo.md`.

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
  worker without Mem of its own needs no Mem sign-in; elsewhere, Mem's plugin itself goes with the
  task (D393, above). `<what_i_know>` is capped at the render too (4 notes, 220 chars
  each; `KNOWN_MAX`, guarded in `prompt-budget.test.ts`). Where the plugin is there **in any
  form** (installed, review, update: D174 (6); the author's own Codex is a review), neither: it
  already gives that context, and a second recall would double it. The plugin's own Context
  Bundle size is not measured yet (harness-facts `memPlugin.contextCost: "unknown"`, todo).
- **What the task was given, on the task (D617, D590's leftover).** The same call records
  `recalled` on the task's stream: each note's Mem id, its one-line title, its Space (Mem's exact
  `space_id`) and how it was found (a `preference` the person stated, or the brief's search),
  never the note's text again. The opened task shows one muted line under 「你交给它的事」,
  **带进来 {n} 条记忆 / Brought {n} memories**, which unfolds into the titles; a title opens
  Settings › 记忆 on that memory (Mem has no per-memory deep link, research/136 G6), and
  **这条不对 / This is wrong** sends the partner a message naming the memory's id, so its own
  memory tools correct it. Nothing shows when nothing was brought in; no new partner tool.
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
- **A newer plugin (D466, research/203).** `inspect` never knows one is out. Mem's own
  `nmem --json plugins check` does (read-only; Mem's published list, no Mem server needed): on the
  home only, beside the daily inspect, at most once in 20 hours, 15 s cap; its newest version per
  agent kept in `mem-plugins.json`; offline or unreadable, the last good answer stands and nothing
  is said. Only its `available_version` is read (its `installed` disagrees with inspect's for
  OpenClaw and Cursor), and **update = inspect's version below it**, on every computer (workers
  included, no new op). It lists Claude Code and Codex of Ducter's agents (Codex since 2026-11,
  research/238); pi's newest is read from npm (D576).
- **The line** per installed agent in its coin detail (copy in the glossary). Installed is
  only what the check knows: every answer carries "runtime loading is not verified", which
  alone never makes a review; the check's own `review`, several copies, or an install it
  can't call enabled does. An update says from which version to which
  (**Nowledge Mem 0.7.34，有新的 0.7.37 了**, **更新**); two copies say both versions
  (**Nowledge Mem 装了两份：0.1.10 和 0.1.53**, **理成一份**).
- **In Settings › 记忆 (D466):** the Nowledge Mem group carries one row per agent per computer
  worth a tap (an update, several copies), the home first: the agent's coin, **{device} 上的
  {agent}**, the line, the same button and ask in place. None when nothing is; never a card.
- **安装 / Install** asks in place what it changes. For Claude Code and Codex with the plugin
  absent, Mem's own `nmem --json connect --tool <id> --on-conflict abort` runs first (D375: on the
  home with its nmem, on a worker through its `mem_connect` op, one at a time per computer; no
  agent signed in needed, no tokens); the line says **正在用 Nowledge Mem 自己的命令安装…**, and when
  the check afterwards finds it, **Nowledge Mem 装好了，重开 {agent} 才用得上**. Otherwise (it didn't
  put it in, `abort` left another memory integration alone, an older worker, pi, DeepSeek Harness,
  an update the commands below didn't take, a review) one task on that computer with that agent
  (else any agent signed in there), with the user's own setup, origin "you": it follows
  https://mem.nowledge.co/SKILL.md for that host only, verifies with the check, and says the agent
  must be restarted; after a failed command its brief says what the command said. **It never asks
  for a connect link, address, key or workspace (D597):** Ducter supplies its own Mem connection; if
  signing Mem in on that computer is truly needed it stops, failed, and says Settings › Memory does
  it. Of Mem's doctor it reads only the three shared lines and its own agent's row: another agent's
  row is named in one line at the end, never fixed or waited on, and the relay's address (D393) is
  the same Mem, not a mismatch. **理成一份 / Keep one** (D466) asks in place and opens that task: an
  older copy goes only by the agent's own plugin commands, never by deleting files, else the task
  stops and reports each copy. Never by itself, never in 全部更新 / Update all (that runs at night
  by itself; this edits the agent's own setup).
- **更新 / Update runs the agent's own commands (D597, research/238).** The same row and ask in
  place; then Ducter itself runs, on that computer (the home directly, a worker through its
  `mem_plugin_update` op), the plugin's documented update (harness-facts `memUpdate`): Claude Code
  `claude plugin marketplace update nowledge-community`, `claude plugin update
  nowledge-mem@nowledge-community`; Codex `codex plugin marketplace upgrade nowledge-community`,
  `codex plugin add nowledge-mem@nowledge-community`, the newest copy's `scripts/install_hooks.py`;
  pi `pi update npm:nowledge-mem-pi`. Each with a 3-minute cap, in order, stopping at the first that
  fails; no doctor first (an update needs no Mem credential). Then inspect reads the version back:
  at least the one out, or past the one it had, is **已更新到 0.7.39，重开 {agent} 就用上了**; else
  one task takes over, its brief carrying every command, its exit code and its last lines (scrubbed),
  and the line says **没能直接更新，开了个任务接着弄 / Couldn't update it directly; a task is
  finishing it**; when no agent there can take it, **这次没更新成，可以再试一次** with 更新 again.
  DeepSeek Harness (no documented command) and a worker from before D597 get the task as before.
- **A Mem link or key typed into a reply is hidden (D597).** A reply to any task's ask goes through
  `hideMemSecrets` before it is kept: Mem's connect links, `nmem_c?_` tokens and keys and an
  `--api-key` value become `<link>`/`nmem_…`/`…`, so neither the task nor the Log ever holds one.
- **One tap is one task (D552).** Per agent per computer one setup at a time, held at the source:
  a tap while one is opening or open gets that same task. From the tap the line reads busy
  (**正在更新到 0.7.38…**) and the button **更新中…** (the shared busy button). Work the setup task
  hands on (`task_open` `replaces`: the mend after a start failure, D549) stays the setup, and the
  check runs when it ends. Then the line says **已更新到 0.7.38，重开 {agent} 就用上了** until the
  next check, and the Overview's notice is gone. Notices on more than one computer name theirs.
- **Mem down (D552).** Memory on and Mem signed out or out of reach is a need on Settings'
  Overview, not only the Memory head. A save Mem refused because it isn't signed in is said once
  by the partner when the person asked to keep it; one that only waits (Mem down) stays unsaid.
- **Why it wasn't kept, as it is (D563).** memory_add's refusal carries Mem's own reason (`why`:
  `missing`, `signed_out`, `off`), never inferred from a word the partner reads. Signed out: D552's one
  plain line, **这条这次没记住：Nowledge Mem 的登录失效了，去 设置 › 记忆 重新登录一下就好。** Switched off
  (the person's own choice): **记忆现在关着，这条只在我们这段对话里；想一直记着，去 设置 › 记忆 打开就好。**
  No Mem on the home (most fresh users): the conversation itself holds their words, so the partner simply
  acknowledges (**好，记着了。**), never "not signed in" and never a word about Nowledge Mem (D169). Asked
  how it could remember them for good or know what their other AI tools saved, one line points to
  设置 › 记忆; never unasked. Evals: `mem-remember-signed-out-zh` (now really signed out),
  `mem-remember-no-mem-zh`, `mem-remember-off-en`, `mem-how-to-connect-zh`.
- **The fix under the line that says it (D563).** With Mem signed out, out of reach or too old (Mem's
  doctor, D375), the Nowledge Mem group, with 重新登录 / 再看一次 / 更新, is the page's first group, right
  under the need (both clients, `memTrouble`); all well, it is the last as before.
- **Ducter recommends it once** per computer and agent, ever, wherever the check finds a
  signed-in agent without it: one card, Go 装上 suggested, no timer (it changes the agent's
  own settings, so it waits for the tap). Once the check sees it in, however it got there, an
  open card closes itself and reads **已装好** (D375: `decision_resolved.settled`, hold, nothing runs).
- **Memory off:** no line, no card, no install.

## Mem carried to every task (D393, built 2026-11-19)

*Who:* the developer whose tasks run on haswell, a NAS, a cloud box, and soon in a sandbox per task;
the consumer lending a NAS; the fresh user never sees it (no Mem on the home, nothing shows). *Before:*
one memory, set up again on every computer (install, a one-time link from Mem's app, a paste, a
restart), and impossible in a sandbox. *After:* Mem is connected once, at the home; a task on any
computer remembers like the person's own sessions, with nothing set up there. Evidence and the live
checks: `research/159`.

```
 task's computer / sandbox                    the home                          Mem
 ─────────────────────────                    ────────                          ───
 Claude Code --plugin-url <home>/mem/kit/…  → serves Mem's plugin (its own copy)
 Mem's hooks / skills → nmem
   NMEM_API_URL=<home>/mem                  → /mem/*: task key checked,       → the person's Mem,
   NMEM_API_KEY=dmr.<task key>                 data paths only, the home's       as the persona
                                               own key put on
```

Three parts, nothing else:

- **The relay** (`core/src/mem-relay.ts`): a task elsewhere gets two variables. The task key (`dmr.`,
  HMAC over task and 30 days, compared in constant time) is checked on every request: archived or
  dropped, memory off, or no Mem on the home closes it at once. Only Mem's data paths pass (an
  allowlist by first path part, from the paths nmem itself calls); never DELETE; a burst of 60 and
  10 a second per task. The home drops the caller's auth, cookies and device headers and puts on
  its own credential (Mem's credential home or env, read per request, never written). Nothing is
  logged but one line on the task's stream. A worker rewrites the loopback address to the home's,
  never adding its device token. Tasks on the home use its own connection.
- **The plugin** goes with a Claude Code task elsewhere when the person has none of their own there
  and the computer has an nmem for its hooks: `--plugin-url`, for that session only (the home's copy,
  newest in its Claude Code plugin cache, zipped without tests or caches). Theirs is reused, never
  doubled. VERIFIED with a real Claude Code over plain http on a LAN address.
- **The floor** is D168's, unchanged: recall in the first turn and `memory_search` for an agent the
  home carries no plugin for (Codex, pi, DeepSeek Harness); its nmem still reaches Mem through the
  relay.
- **Mem's two steps, run by Ducter** (D417, `runner/src/mem-steps.ts`, research/172) for an agent
  that can't load a plugin for one session (harness-facts `memSteps`: Antigravity, whose plugins
  load only from folders in the repository or `~/.gemini`, and whose Mem plugin would write the key
  into its MCP config). On the computer the agent runs on, with Mem's own nmem and the session's env:
  `nmem context --source-app google-antigravity` before a new session's first turn, put in front of
  its first message as Mem's plugin puts it; `nmem t save --from antigravity` after each turn ends
  (Mem's own transcript reader). Search stays the floor's. Neither runs where the person's own
  Mem plugin for agy is there, with memory off, or with no nmem there. Nothing is installed or
  written in `~/.gemini`; the key is in the env only.

**The computer card** says **和 {home} 用同一份记忆，不用设置** while the home carries Mem (D420); that computer's own sign-in
is for the person's own sessions, offered quietly (below). **Sandboxes:** two variables and a URL,
minted per task; outbound HTTPS to the home, and an nmem and python3 for the plugin's hooks (else
the floor). Nothing is kept. **Not yet:** a real Mem behind the relay; Codex's plugin (an overlay
needs a marketplace of Ducter's: `todo.md`); Antigravity's steps live (D417: agy's transcript where
nmem reads it, `todo.md`).

## Mem's own health (D375, built 2026-11-19)

*Who:* the developer whose Mem key was rotated or whose Cloud is down, while the page said **已连上**;
the consumer whose sign-in expired. The fresh user never meets it (no Mem, nothing shows). Evidence:
`research/144`.

- **Before Mem is connected (D554):** step 2, sign in, opens with what it needs in the person's
  words, **这一步要一个 Nowledge Mem 账号。还没有的话，先去 Nowledge Mem 的网站免费注册一个，再回来登录。**,
  and the quiet link **去注册 Nowledge Mem** to mem.nowledge.co, from the first phase on.
- **The read:** Mem's own `nmem --json doctor` (`protocol/src/mem-health.ts`): old (no doctor),
  unreachable (a saved address not answering; on the home also Mem's built-in default), signed_out
  (answers, refuses the key; *fresh* when never signed in), plugin (an installed Claude Code or Codex
  Mem's per-tool check doesn't pass), else all well. Statuses and a few phrases only: a detail line
  is never shown or sent (the credential line carries the key's tail).
- **The home** (`core/mem-health.ts`): in the background, at most every 5 minutes, gated like the
  glance; again after a sign-in, an update or Mem's own `connect`; `MemView.health`. The head says
  **已连上** until the first answer, then **已连上，一切正常**, or the one thing wrong in the failed ink
  with its one action: 更新 (when Ducter can run it, and not twice with the update row), 再看一次
  (`mem_health`), 重新登录 (the link field in place under its own line: regenerate the connect prompt in Mem's Settings › Connectors).
  D554: plugin is not Mem in trouble: the head reads all well, and under it one quiet row,
  **{agents} 还没接上 Nowledge Mem** with what it gives and **接上** (D169's install for each agent, so
  Mem's own command; the busy button **接上中…** while it runs).
- **A lent computer** (`core/worker-mem.ts`): the same read rides on `DeviceMemView.health` (and
  `ours` when its nmem is Ducter's copy); while the row would ask to sign in it says unreachable
  (再看一次, no paste box), an expired sign-in (the box), or too old (更新 by `uv tool upgrade
  nmem-cli` when ours, else how).

## Mem on a computer for tasks (D366, built 2026-11-18; re-scoped by D393)

**D393:** while the home carries Mem, tasks there need none of this. The row then says, as its title and one line
(D420), **和 {home} 用同一份记忆，不用设置 / Same memory as {home}, nothing to set up**, and what follows
is offered for the person's own sessions there (outside Ducter), quietly: a secondary **装上** under
**想让你在这台电脑上自己开的 AI 也记得你，就装上。**, or a secondary **登录** that opens the paste box only
when tapped, under **想让你在这台电脑上自己开的 AI 也记得你，就登录一次。**; Mem's health there is a soft
line, never a failure, and comes first, so the line matches the button. Ducter's own nmem there (D386) still matters to tasks:
Mem's carried plugin needs one for its hooks.

*Who:* the developer whose haswell got Codex and Claude Code from D363 and whose tasks there should
know him like his own sessions do; the consumer lending a NAS. The fresh user never sees it: nothing
shows unless the home already has Mem (D169 (6)). *Before:* the card said nothing, its tasks ran
without the person's Context Bundle, and nothing they did reached Mem. *After:* the card says
**{device} 上做事还不记得你**, and two taps and one pasted link later **记得你了**, naming the agents that
share the one memory there. Evidence and the live install: `research/136`.

- **Where it stands** (`core/worker-mem.ts`, on the worker): Mem's own `nmem --json doctor` at
  start, each welcome, the card opening and after each step. absent (no `nmem`), sign_in (`server
  reachable` and `api key` not both pass), ready (with the agents Mem's per-tool checks pass for).
  `DeviceView.mem` carries it, only on a worker and only while memory is on and the home's Mem is
  connected.
- **装上 / Install:** the person's own `nmem` stays; else uv 0.13.7 (pinned, checked) into
  `<data>/tools/bin` and `uv tool install nmem-cli` with every uv folder inside `<data>/tools`.
  10 s and 57 MB on a bare Ubuntu 24.04 (VERIFIED).
- **登录 / Sign in:** what the person pasted from Mem (D370: Settings › Connectors › Any AI agent copies
  a whole prompt with a one-time `nmem_ct_` token and its Mem's redeem URL; a bare token or an older
  link also works), made into `<origin>/app?nmem_connect=<token>` by code on the home and again there
  (research/141), then Mem's own `nmem connect <link> --tool
  codex-cli --tool claude-code` for the agents there: the sign-in, a live check, and Mem's plugin
  registered in those agents (DOCUMENTED). nmem redeems the token itself, so the API key never
  passes through Ducter. The link reaches only that computer's nmem; shown lines are scrubbed. Mem's
  410: expired (15 minutes) or used, with the box still there; 401/403: **refused**. **接上 / Connect** runs the same without a link for an agent added later.
- **Then:** Mem turning ready makes the home read Mem's plugin check there at once; tasks there run
  with the plugin as the persona (D168), and the home's `NMEM_CLI_PATH` is never passed to them.
- **The person's own `nmem` too old (D386):** one with no `doctor` (haswell's: the old Python CLI,
  whose argparse answered `connect` with a usage error) is known at the look, so the paste box never
  shows and nothing is sent to it. The row says **{device} 上你自己装的 Nowledge Mem 太旧，登录不了**
  with **装上新的**: Ducter's own current copy into `<data>/tools` (the same uv route), used there by
  its path for doctor, connect and 接上, and first on that computer's PATH for `nmem` alone (a link in
  `<data>/tools/prefer`, `agent-path.ts`) so tasks and Mem's plugins inside them find a working one.
  The person's copy is never run beyond its doctor and never changed; the row shows the one command
  that updates it when its install says (pipx, uv, pip). Once theirs has a doctor again, the link goes
  and theirs is used. Ducter's own copy too old: updated, then the sign-in goes on. A usage error from
  nmem is said as **太旧**, never shown; a paste that wasn't spent (not a link, too old, install
  failed, Mem unreachable) stays in the box.

## Computer rules in Mem (D538, built 2026-11-24)

*Who and how it feels:* the developer who told Ducter once 「haswell 内存大，验证的活多放它」 opens his own
Claude Code on the MacBook the next day and asks it to run the full test suite: it already suggests
haswell. The consumer never sees any of this; the fresh user has no Mem and loses nothing.

- **Not identity.** A computer rule is the person's word on where their work runs, kept in Ducter's
  rule store (`where.md` §24) and read by placement from there. It is never in a persona's AI Identity
  or its L1 (`system.md`, "Identity and Mem boundary"): who the partner is, not where work runs.
- **Mirrored while Mem is on** (`core/src/placement-mem.ts`): each computer rule becomes one memory in
  the person's Space, unit type `preference`, label `computer-placement`, `source_app = ducter`, written
  by the default partner's identity, upserted by a stable id (`ducter-placement-<rule id>`) so a changed
  rule updates its memory. Its words are a statement about the person, never an order: "Prefers heavy
  work (builds, test suites, type checks, browsers) to run more on the computer "haswell". In their
  words: "…". (Kept in Ducter as a computer rule.)". A rule removed in Ducter is archived in Mem
  (never deleted). Mem away: tried again on the next change or start. The card shows **也记在 Nowledge
  Mem 里，你别的 AI 也知道** under a mirrored rule.
- **Read back as hints, never as rules.** Every 30 minutes (and when Mem connects) Ducter lists the
  memories labelled `computer-placement`; those this home didn't write (another agent the person told,
  another Ducter) go to the partner once each in `[devices]`, to offer keeping as a computer rule (an
  ask, Go = rule_save). Unlabelled memories about computers reach the partner as D487's known lines
  like any preference; nothing becomes a rule without the person's yes.
- **Off:** memory off, no Mem, or `DUCTER_MEMORY=off`: nothing is written or read; placement is the same.
- **Measured:** `placement.test.ts` over a fake Mem (written only while on, labelled, upserted once,
  archived on removal, hints once each, Ducter's own mirror never a hint). No real Mem write yet.

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

## Files in Nowledge Mem (D566)

What Ducter made can be kept in the person's Mem as Artifacts (Mem's library), never as memories:
a report is a document to find and read, not a fact to recall. `packages/core/src/mem-files.ts`.

- **How.** The person's own `nmem`: `artifacts add <file> --folder <Ducter> -l ducter -c "Made by
  Ducter: {task}" [--space-id]`, then `artifacts update <doc> --base <rev> --file` for every later
  version of the same file (its task and its name); `history` when Mem says a newer version is
  current. Never `delete`, `move` or a folder rename. State in `<dataDir>/mem-files.json` (0600):
  the folder per Space, the artifact per file, every version saved by media id.
- **Where (D572, D575).** One 「Ducter」 folder at the root of a Space Mem names, by id
  (`--space-id`, for every call): `persona.mem.space` (by name); else the person's **personal**
  Space: Mem's own write target (read-only `nmem --json context --no-ensure --no-working-memory`,
  `active_space.write_target`) when its `reason` is `personal_zone`, else the `kind: personal`
  candidate of Mem's passive `bridge setup` (it creates and selects nothing; asked only when the
  target isn't `personal_zone`); else Mem's write target, never silently: when the only target Mem
  gives is a Space others read (`key_write_space`, e.g. hel's Everyone, ten readers), nothing is
  written until the person chooses once (`shared_space`: the line says where and who reads it, then
  只给我看 / Only me, the default, and 放进「{Space}」/ Put it in “{Space}”; no personal Space: only
  the latter). The choice is kept in `mem-files.json` by that Space's id. `bridge setup`'s
  `write_default` is no longer borrowed. Both reads once a run. Spaces off: no Space. A target
  missing or asking for an explicit choice, and no personal Space: none is named, never a guess, and
  Mem's own refusal is said (`no_space`). `folders mk` needs a Space
  ("Pass --space (or --parent) to choose where the folder goes."), which D566's "no `--space`"
  hit on hel. Found by `folders ls` (nmem's `folder_id`, `parent_folder_id`), else made with a
  client-chosen id.
- **When.** A tap (file card, viewer), the partner on the person's word (`made_find keep`), or the
  Settings default (off): a **done** report's reports and documents (`memAutoKeeps`).
- **Never.** A file the shared secret detector finds a key in, or one named like a secrets file
  (`secretFileName`): not by itself, not on a tap.
- **Saved only when Mem shows it.** After a write, `artifacts list --json` (a VERIFIED shape) must
  show the file (its artifact, else the 「Ducter」 folder and its exact name, with these bytes);
  else it isn't called saved. Each write's raw answer is logged as `mem_file` (stream `mem`; Mem's
  metadata only) until the real shape is known; D572: every failing step too (the Space read, the
  folder), `op: folder`, with the Space used; D575: the raw `write_target` as `target` on every
  event, and the question itself as `op: space`.
- **Honest.** Why not comes from Mem (D563): off, missing, signed out, unreachable, no Space,
  a shared target (D575), refused; said in plain words, Mem's own sentence kept as `message` and shown only behind 原话 /
  Its words (D572); the Settings row says the last one the default couldn't keep, once.
- **Provenance.** Mem's artifacts carry no AI Identity or source app: the `ducter` label and the
  comment naming the task say where it came from (research/231 §1).
