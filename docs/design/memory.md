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
- **Quotes**: a search for "what exactly did the user say" runs lexically on distinctive
  terms, not on paraphrase.

## Open (measure in the prototype)

- Roll-up loss over months: unmeasured anywhere. Confidence is low.
- Window size and the auto-recall gate threshold: confidence is medium.
- Whether the TOC improves search decisions on long channels. [15] was only about 3×
  compression on a single corpus that refers to itself.
- An eval suite over 11 question types, with false-memory and stale-assertion rates
  (`research/14`). It runs on every change to the digest prompt.
