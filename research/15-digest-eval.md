# 15 — Digest strategies: an empirical probe evaluation

Date: 2026-11-08. Writer, answerer and grader: Claude Code CLI `-p --model sonnet` (records show `claude-sonnet-5-5`),
fixed cwd, `--tools "" --strict-mcp-config --setting-sources "" --no-session-persistence`. Token sizes measured with
haiku calls. Companion to [14] (design and literature). Feeds principles 2 and 5.

Question: which digest form, together with a verbatim tail and a pullable Log, lets the main AI keep answering
correctly about its own channel? The user added one more question: can a sliding window plus on-demand search replace
most of the digest?

Tags: **[V]** measured here · **[I]** inferred.

## Method

**Corpus.** The design conversation in this project, taken from the session JSONL. I kept user text, assistant text,
and delegated-window hand-backs. Hand-backs are cut to 900 characters and labeled `WINDOW_REPORT`, which stands in for
`report_to_main`. Tool calls, tool results, reminders and hook context are dropped. The result is 46 messages
(m0–m45) and **37.4K tokens** of mixed Chinese and English. It contains many topics, several reversals, 13 research
windows and user corrections. Raw data stays in the scratchpad (`.../scratchpad/exp-digest/`).

**Segments** (by topic):

| Seg | Msgs | Topic | Tokens |
|---|---|---|---|
| A | m0–m11 | kickoff, research 01–04, Draft 1 | 13.7K |
| B | m12–m21 | runner = TS + oar, 05–07, user corrections (Raft, oar, approvals), skills thinking | 7.0K |
| C | m22–m33 | HawDB, Mem identity, skills decision, "read before ask" (principles 3/9) | 6.7K |
| D | m34–m41 | tail folding, research 11–13, Draft 5 | 6.7K |
| T | m42–m45 | principle-by-principle review starts, Log option B, digest question (**held-out tail**) | 3.3K |

**Probes.** 34 questions with reference answers, written from the full transcript:
- (a) 7 on binding decisions and their rationale.
- (b) 6 on reversed decisions: ask vs. read windows, the skills source of truth, oar pinning, "never compact while
  warm", in-place fold vs. truncate-and-append, Tauri vs. MyGo.
- (c) 4 on open loops.
- (d) 4 on user preferences and corrections.
- (e) 5 "where would you find X" questions, scored on the file path or the `log.read(segment, range)` pointer.
- (f) 4 exact-wording questions that need the user's Chinese words verbatim.
- (g) 4 traps about things never discussed: embedding model, launch date, Windows runners, GenUI framework.

Answers are spread across segments: A 9, B 8, C 9, D 6, T 2, trap 4.

**Conditions.** Digests are written sequentially per strategy. For each segment the writer sees that strategy's
earlier digests plus the verbatim segment, and is told to mark anything the segment supersedes.

| Cond | Context given to the answerer |
|---|---|
| F | full verbatim transcript (upper bound) |
| T | tail T only (lower bound) |
| S1 | narrative compaction-style digest of A–D, plus T |
| S2 | "index + obligations" digest of A–D, plus T. Sections: TOC with [mN] ranges · binding decisions + rationale + ≤25-word verbatim user quote · superseded OLD→NEW · open commitments · window ledger · user prefs/corrections |
| S3 | S2 plus a one-paragraph narrative per segment, plus T |
| S4 | sliding window **D+T verbatim**, no digest, plus a `search(query)` tool |
| S5 | **tiny** digest of A–C (TOC + obligations + decisions + superseded only), D+T verbatim, auto top-3 BM25 snippets per question, plus `search` |

**Search** is local BM25 over 106 chunks of about 700 characters, with message and segment labels. Tokenization is
CJK-aware: Chinese character bigrams, Latin words. It runs in two steps. In step 1 the model either answers each
question or asks for 1–3 queries. The host returns the top-3 hits per query, at most 6 per question. In step 2 the
model gives its final answers.

All conditions get the same mock `log.read(segment, msg_range)` description. All 34 probes go in **one batched call**
per condition per run, with the instruction "say 'unknown' if not supported". Two runs per condition.

**Grading.** A separate sonnet call per answer set gets the full transcript, the reference and a rubric. Labels are
correct (1) · partial (0.5) · abstain (0) · wrong (0) · **false_memory** (0): invented specifics, a fabricated quote,
or any concrete answer to a trap. I spot-checked 12 random "correct" labels and every non-correct label. That led to
one change: probe e1, "where is Raft's 60 min/128K recycle rule?", also has a valid location in research/05 at B
m14–m15. My reference listed only research/02, so I changed the 4 S2/S3 answers that pointed there to correct.

Budget: **57 model calls** in total. That is 15 digest writes, 18 answering calls, 14 grading calls, 8 tiny haiku
calls to measure tokens, and 2 ablation calls. Total ≈ **$4.1**, 1.47M input tokens (mostly cache), 100K output.
`--no-session-persistence` meant no Claude project folders were created; I checked, and there is nothing to delete.

## Results [V]

### Sizes

| Strategy | Digest tokens (all older segments) | Per segment | Compression vs. raw | Answering prompt per run |
|---|---|---|---|---|
| F | — | — | 1× | 39.4K |
| T | — | — | — | 5.3K |
| S1 narrative | 11.0K (A–D) | 2.75K | 3.1× | 16.4K |
| S2 index+obligations | 10.6K (A–D) | 2.65K | 3.2× | 16.0K |
| S3 = S2 + narrative | 12.1K (A–D) | 3.0K | 2.8× | 17.5K |
| S4 window + search | 0 (window D+T = 10.0K verbatim) | — | — | 12.2K + 69K in step 2 (≈2.2K of snippets per searched question) |
| S5 tiny + window + auto + search | 3.3K (A–C) | 1.09K | 8.4× | 44K step 1 (≈0.95K of auto snippets per question) + 56–61K step 2 |

S1–S3 came out at about 2.7K per segment, above the ~1–2K target. S5 came out at about 1.1K per segment, above its
300–500 target. The writer runs long on dense segments. The S4/S5 per-run prompts are inflated because 34 questions'
snippets sit in one call. Per question, retrieval adds about 1–2K tokens.

### Accuracy (mean of 2 runs; partial = 0.5)

| Cond | (a) decisions | (b) reversals | (c) open loops | (d) prefs | (e) pointers | (f) verbatim | (g) traps | **All** | run1 / run2 | False memory |
|---|---|---|---|---|---|---|---|---|---|---|
| F | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **1.00** | 1.00 / 1.00 | 0 / 68 |
| T | 0.14 | 0.08 | 0.50 | 0.00 | 0.00 | 0.00 | 1.00 | **0.22** | 0.22 / 0.22 | 0 / 68 |
| S1 | 1.00 | 0.83 | 0.94 | 0.94 | 1.00 | **0.00** | 1.00 | **0.84** | 0.84 / 0.84 | 0 / 68 |
| S2 | 1.00 | 0.96 | 0.94 | 0.88 | 0.80 | 0.88 | 1.00 | **0.93** | 0.91 / 0.94 | 0 / 68 |
| S3 | 1.00 | **1.00** | 1.00 | 0.94 | 0.95 | **0.94** | 1.00 | **0.98** | 0.96 / 1.00 | 0 / 68 |
| S4 | 1.00 | 1.00 | 1.00 | 0.94 | 1.00 | 0.38 | 1.00 | **0.92** | 0.93 / 0.91 | 0 / 68 |
| S5 | 1.00 | 0.96 | 0.94 | 0.94 | 1.00 | 0.25 | 1.00 | **0.89** | 0.91 / 0.87 | 0 / 68 |

Label counts over 68 answers (correct / partial / abstain / wrong):

| Cond | Correct | Partial | Abstain | Wrong |
|---|---|---|---|---|
| S1 | 56 | 2 | 9 | 1 |
| S2 | 60 | 6 | 2 | 0 |
| S3 | 65 | 3 | 0 | 0 |
| S4 | 62 | 1 | 5 | 0 |
| S5 | 59 | 3 | 6 | 0 |
| T | 14 | 2 | 52 | 0 |

**False memory was 0 in every condition**, and all 4 traps were answered "unknown" every time.

Accuracy by the segment that holds the answer (non-trap):

| Cond | A (oldest) | B | C | D | T |
|---|---|---|---|---|---|
| S1 | 0.72 | 1.00 | 0.67 | 0.95 | 1.00 |
| S2 | 0.81 | 0.96 | 0.94 | 1.00 | 0.88 |
| S3 | 0.94 | 1.00 | 0.97 | 1.00 | 1.00 |
| S4 | 1.00 | 0.96 | 0.72 | 1.00 | 1.00 |
| S5 | 0.91 | 0.96 | 0.69 | 1.00 | 1.00 |

The weak C column for S1, S4 and S5 comes almost entirely from the verbatim-quote probes, three of which live in C.

### Search behaviour (S4, S5) [V]

| | Searched | Out-of-window probes searched | In-window probes searched | Missed-search failures* | Searched but not correct |
|---|---|---|---|---|---|
| S4 r1 / r2 | 26 / 26 of 34 | 22/23, 22/23 | 0, 0 | 0, 0 | 3 (f2, f4, d2), 3 (f1, f2, f4) |
| S5 r1 / r2 | 9 / 7 of 34 | 7/23, 5/23 | 0, 0 | 1 (b3, partial), 1 (d3, partial) | 3, 4 (mostly f-quotes) |

\*A missed-search failure is a probe whose answer lies outside the verbatim window, that the model did not search, and
that was not graded correct.

- **S4's search decisions were near-perfect.** It searched 22 of 23 out-of-window probes. The one it skipped (a2,
  context budget) is restated inside D/T, so it answered correctly. It never searched in-window probes. It searched all
  4 traps to confirm they were absent, then said unknown. The missed-search rate was **0**.
- **S5 searched far less** (7–9 probes). The tiny digest and the auto snippets already covered most questions. The
  missed-search rate was 1 of 23 out-of-window probes per run, and both misses were partials.
- **Search can fail even with good decisions**: 3–4 failures per run, nearly all on verbatim quotes.

## Per-category analysis

- **(a) Binding decisions: saturated.** Every digest strategy scores 1.00, and so does search. When decisions are
  this salient, any reasonable digest keeps them. This category cannot tell the strategies apart.
- **(b) Reversals.** S3 1.00 · S4 1.00 · S2/S5 0.96 · S1 0.83.
  - S1's misses are of one kind: the narrative keeps the current state and drops the losing option. One run denied
    that Tauri was ever recommended ("Not recommended as far as the context shows"). S1 also lost the earlier
    "pin oar precisely" position.
  - An explicit `Superseded: OLD -> NEW [mN]` section fixes this. Even the tiny S5 digest kept the Tauri→MyGo line.
  - No condition ever stated a superseded position as current.
- **(c) Open loops and (d) preferences: near-saturated** for every digest strategy. The remaining partials are cases
  where something was compressed away, not invented.
  - One example is worth noting. S2 rendered the user's request in m2 as "a small, polished principles doc *for
    blog*". The user actually said the core principles will be *mentioned* in a blog that the AI should *not* write.
    The answerer repeated this as "suitable for a blog". A one-line digest bullet blurred the meaning.
  - S3's narrative paragraph did not prevent the same partial.
- **(e) Pointers.** S1 1.00 · S4 1.00 · S5 1.00 · S3 0.95 · S2 0.80.
  - Surprisingly, narrative S1 did well, because it names research files inline.
  - S2 lost points on e5, "where is the dots 8.6%→19.7% data?". S2's TOC and ledger recorded *that* report 01 came back
    but dropped the evidence numbers, so the model could not link the figure to the file. It answered "unknown".
  - **Search is the best pointer mechanism**: every hit carries `[segment, mN]` for free.
- **(f) Exact wording: the sharpest split.** S3 0.94 · S2 0.88 · S4 0.38 · S5 0.25 · S1 0.00.
  - The narrative digest kept no user quotes. S1 correctly abstained instead of making quotes up, which is good, but
    the information was gone.
  - The quote slots in S2/S3 work. Their one miss was a truncated quote.
  - Search did badly here for two separate reasons:
    1. **Query formulation.** The model searched in paraphrase ("HawDB 用户 指示"), not with the user's actual words,
       and BM25 missed m30.
    2. **Batch dilution.** Often the right snippet *was* retrieved (m32 "无脑去打断是很昂贵的" was in S5's results) and
       the model still answered "unknown". I re-ran only the 4 quote probes with the identical snippets in 2 ablation
       calls. **S5 went from 0/4 to 4/4. S4 went to 2/4**; its remaining failures were the bad query plus one ignored
       hit.
  - So in a real per-turn setting, where one question comes with a few snippets, S5 would likely do much better on
    (f) than this batched table shows [V for the ablation, I for the generalisation].
- **(g) Traps: 0 false memories anywhere** (0/476 graded answers, 56 trap answers). With an explicit "say unknown"
  instruction, Sonnet abstains rather than invents, even with only the tail (T abstained on 52/68). In this setup the
  failure mode of a weak digest is **forgetting, not confabulating**.

## Notable failures (short)

| Cond | Probe | Failure |
|---|---|---|
| S1 r2 | b6 | Denies that a Tauri shell was ever proposed. The narrative dropped the superseded option. |
| S1 | f1–f4 | All "unknown". The narrative digest keeps no verbatim user words. |
| S2 | d3 | Says the principles doc should be "suitable for a blog". The digest bullet blurred "mentioned in our blog, you don't write it". |
| S2 | e5 | "probably 01 or 12 … unknown". The evidence figure is not indexed, so the pointer is lost. |
| S2/S3 (graded wrong, later overridden) | e1 | Pointed to research/05 rather than 02. That is valid, and it was a gap in my reference. |
| S4 | f4 | Searched with paraphrased Chinese ("HawDB 用户 指示") instead of the user's words, and missed the message. |
| S5 r1 | f2 | The correct snippet was in context and the model still said "unknown" (34-question batch). Unbatched, it answered verbatim. |
| T | b1 | Inferred "reads the window directly" from a hint in the tail. Partial, no fabrication. |

## Conclusions

1. **Structure beats narrative on what matters for acting correctly.** S1 → S2 is +0.09 overall. The gain comes from
   reversals (an explicit Superseded section) and verbatim quotes (0 → 0.88), at the same size (≈2.7K/segment). This
   supports the "index + obligations" hypothesis in [14].
2. **S3 (S2 + one narrative paragraph) is the best digest-only strategy: 0.98, close to full context (1.00).** It costs
   about 14% more digest tokens. The paragraph mainly helped linkage questions (pointers, reversals across segments)
   that a terse index leaves loose. Treat 0.93 vs. 0.98 as suggestive: it is 2 runs on one corpus.
3. **Search largely replaces the digest for recall, but not for exact wording yet.**
   - S4 (no digest, 10K verbatim window, plus search) scored **0.92**, equal to S2 and with perfect pointer and
     reversal scores.
   - It decided when to search almost perfectly (missed-search rate 0) and never fabricated.
   - Its weakness is verbatim recall, which depends on retrieval quality (query phrasing, CJK) and on how many
     snippets compete for attention.
4. **The tiny digest + auto-retrieval (S5, 0.89) is the cheapest way to keep decisions, obligations and reversals in
   view** (1.1K/segment, 8× compression), and it kept the search load low (7–9 searches vs. 26).
   - Its batched (f) score understates it: unbatched, 4/4 quotes were recovered.
   - Auto-retrieval on the question text is cross-lingual here (English question, Chinese source), so it is a weak
     signal on its own. Explicit model-written queries are still needed.
5. **Design implication for principle 2 [I]:**
   - Make the frozen digest a **small structured spine**: TOC with [mN] ranges · open obligations · binding decisions ·
     Superseded OLD→NEW · **short verbatim user quotes for anything the user stated as a decision or correction** · one
     narrative line.
   - Rely on `log.search` / `log.read` for everything else.
   - Quotes and Superseded entries are the two fields that measurably earn their tokens.
   - To make search reliable on wording, index user messages separately (or boost them) and let the model search with
     the user's likely original-language terms.
6. **False memory was not the risk here: forgetting was.** No condition confabulated in 476 graded answers. Under an
   explicit "unknown" policy, a weak digest makes the main AI ask or search, not lie. That is the safer failure, and it
   is cheap to recover from because the Log is the truth (principle 1).

## Limits

- **Single, small, self-referential corpus.** The channel is 37K tokens. Digests compressed only about 3× (S1–S3), so
  they keep much more than they would on a channel of months. Expect larger gaps at 20–50× compression. The
  conversation is also *about* digests and this experiment: the tail (m45) describes the experiment's design and gave
  T some answers.
- **Ceiling effects.** Categories (a), (c), (d) and (g) saturate. With 34 probes and 2 runs, differences under about
  0.05 are noise. The probes were written by the same agent that read the transcript, so they may favour salient,
  well-marked facts.
- **Same model family throughout.** Writer, answerer and grader are all Sonnet, so there is a risk of self-preference.
  The grader saw the full transcript. Spot-checks agreed with the grader except on e1 (overridden, documented above).
- **S4/S5 differ from S1–S3 in tail size** (D+T verbatim vs. T). Their total context is comparable (≈10–13K vs.
  ≈16K), but the conditions are not a pure digest ablation.
- **Batched probing** (34 questions per call) penalises retrieval strategies, as the ablation showed. A per-question
  harness would be more faithful but costs about 34× the calls.
- **Window reports were truncated** to 900 characters, which mimics `report_to_main`. Full research findings live in
  `research/`, outside the corpus.
- **The BM25 used here is a toy**: bigram CJK, no stemming, no user-message boost. A production `log.search` should do
  better.

## Artifacts (local only, not committed)

`<scratch>/exp-digest/`:
- `transcript.txt` and `seg_*.txt` (private data)
- `probes.json`
- `digests/`
- `answers/`
- `grades/`
- `logs/calls.jsonl` (per-call tokens and cost)
- scripts: `extract.py`, `seg.py`, `lib.py`, `write_digests.py`, `answer.py`, `grade.py`, `score.py`, `ablate.py`,
  `measure.py`
