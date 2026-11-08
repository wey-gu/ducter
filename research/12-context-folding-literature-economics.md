# 12 — Context folding: literature (2024–2026) and the economics of keep / fold / re-cut

Researched 2026-11-08. Scope: (A) what the long-horizon context-management literature actually measured, and which
ideas survive the constraint that Ducter **cannot train harness models** (prompt/harness level only); (B) current
prompt-cache prices and a cost model for the main AI's tail. Builds on `01` (OpenClaw cache-ttl pruning, grok-build
compaction), `03` (Claude Code 1h TTL on subscription, Codex thread affinity) and `06`; those are not repeated.

Tags: **V** = I read the paper/page (PDF pages, HTML, or official docs) this session. **S** = secondary (abstract via
search snippet, third-party summary, or my prior knowledge not re-checked). **I** = my inference.

---

## 0. Answer in one paragraph

Every 2025–26 method that wins does the same thing: it **removes completed sub-task detail at a semantic boundary and
keeps a short outcome**, and the best ones do it *structurally* (branch → return, KV rollback) rather than by
summarising a full window when it overflows. But the big headline gains (Context-Folding +20pt, AgentFold, MEM1, SUPO,
ReSum-GRPO) come from **RL/SFT on the folding policy**. The prompt-only versions are positive but modest, and one
careful paper shows prompt-only folding *loses* to simply keeping everything when the window is large enough
(0.420 vs 0.478 on BrowseComp-Plus). Economically, cache reads are now so cheap (0.05–0.1×) that **keeping a 20K read
costs only 1–2K base-token-equivalents per turn**, while re-fetching it after a wrong fold costs 20–40K. So for Ducter,
folding is justified mainly by **quality (cross-topic distractors, context rot) and budget**, not by price. Its cost
is minimised by (1) bounding reads *at entry* or doing them in a branch that shares the cached prefix, (2) folding
exactly at topic boundaries, in batches, and (3) deferring destructive rewrites to cold moments. On thread-affinity
caches (Codex) tail rewrites are expensive (≈ full prefix), so branch-or-keep is the only cheap choice there.

---

## A. Literature

### A1. Summary table

| Work (ID) | Mechanism | When it folds | What is kept | Measured | Training? | Tag |
|---|---|---|---|---|---|---|
| **Context-Folding / FoldGRPO** (arXiv 2510.11967, ByteDance Seed/CMU/Stanford, Oct 2025) | `branch(description,prompt)` opens a sub-trajectory; `return(message)` folds it. On return the **KV cache is rolled back to the branch point** | When the agent calls `return` (sub-task done). No nesting | Main thread + branch call + return message; branch steps deleted | Seed-OSS-36B, 32K active ×≤10 branches. **BC-Plus pass@1**: ReAct-32K 0.286, ReAct-327K 0.478, Summary-agent 0.386, **Fold (no RL) 0.420**, Fold+FoldGRPO **0.620**. **SWE-B-V**: 0.436 / 0.552 / 0.488 / **0.492** / **0.580**. Main thread ~8K while processing >100K (>90% compression); one case 107K→6K with 4 branches | RL for headline; **no-RL numbers exist** | **V** (pp.1–9) |
| **AgentFold** (2510.24699, Tongyi, ICLR'26) | Each step emits a fold directive: *granular condensation* (latest step → one summary block) or *deep consolidation* (fuse a run of blocks when a sub-task ends) | Every step; deep fold at sub-task end | Question, tools, multi-scale state summaries, latest full interaction | 30B-A3B: BrowseComp 36.2, BC-ZH 47.3, WideSearch F1 62.1, GAIA-text 67.0. Context ~3.5K→~7K over 100 turns, >84K (92%) smaller than ReAct at turn 100 | SFT. Claims prompting can't produce reliable folds, **no experiment** | **V** (HTML) |
| **ACON** (2510.00615, KAIST/MSR, ICML'26) | LLM compressor for history (when > T_hist) and observations (when > T_obs); **compression guideline optimised in natural language** from contrastive failures (o3 as optimiser) | Thresholds: history 4096 (AppWorld/OfficeBench), 2048 (QA); obs 1024/512/400 | Compressed history + compressed latest observation | gpt-4.1: AppWorld 56.0→56.5 acc, peak 9.93K→7.33K; OfficeBench 76.84→74.74, 7.27K→4.93K; QA EM .366→.373, −54.5% peak. Baselines on AppWorld: FIFO 45.8, retrieval 27.4, LLMLingua 39.3, naive summary 43.5, ACON 56.5. Up to +46% for small models. **"History compression breaks the KV-cache… rarely helps API cost"; observation compression reduces cost more reliably** | **Prompt-only** (gradient-free); optional distillation | **V** (HTML, first 100K chars) |
| **ReSum** (2509.13313, Tongyi) | Periodically replace history with a structured summary, continue from it | Periodic / near limit | Summary (+ question) | +4.5% avg over ReAct training-free; +8.2% more with ReSum-GRPO; WebResummer-30B BC-zh 33.3, BC-en 18.3 | Plug-in works untrained; RL adds | S |
| **SUPO** (2510.06727, ByteDance/Stanford/CMU, ACL'26) | Agent writes its own summary of tool history; RL gradient decomposed over summarised segments | When working context nears limit | Agent-written summary | Higher success at same or lower working context on CodeGym, BrowseComp-Plus; scales test-time summary rounds beyond training | RL | S |
| **MEM1** (2506.15841, NeurIPS'25 oral) | One internal state rewritten every turn; previous turns discarded | Every turn | Only the consolidated state | MEM1-7B vs Qwen2.5-14B on 16-objective multi-hop QA: 3.5× perf, 3.7× less memory | RL | S |
| **HiAgent** (2408.09559, ACL'25) | Subgoals as working-memory chunks: when a subgoal completes, its action/observation pairs are replaced by a summary | Subgoal completion (LLM decides) | Current subgoal's raw pairs + summaries of finished subgoals | 5 AgentBoard tasks: success 21→42 (2×), −3.8 steps avg; removing observation summarisation hurts | Prompting (S: abstract implies no training) | S |
| **MemGPT / Letta** (2310.08560) | OS-style virtual context: queue + recall/archival storage; recursive summary of evicted messages; agent can page back via search | Memory-pressure warning ≈70% of window, flush at 100% (S) | Recursive summary + searchable full history | Original paper: better doc-QA/multi-session chat vs fixed window (S). Letta today: auto-compaction into recursive summary, full history in recall (S). `01` notes Letta's memory-in-system-prompt recompiles break prefixes | Prompt/harness | S |
| **InfiAgent** (2601.03204, Findings ACL'26) | File system is the state of record; context rebuilt every step from a **workspace snapshot + last k=10 actions**; "external attention" reads big docs outside main context | Every step (rebuild) | Snapshot files + k recent actions | 80-paper lit review coverage avg: InfiAgent+Claude-4.5-Sonnet **80.0**, Claude Code 29.1, Cursor 1.0; no-file-state ablation (compressed context) with Sonnet 27.7, gpt-oss-20b 3.2. DeepResearch bench 41.45 (gpt-oss-20b) vs 45–52 for big proprietary systems | **Training-free** | **V** (HTML) |
| **TokenPilot** (2606.17016v2, ZJU et al., Aug 2026) | Lifecycle-aware eviction (active→completed→evictable, utility estimated by a small model every **B=3** turns, one structural purge), **prefix canonicalisation** (placeholders for cwd/time/session id; tools moved to end of system prompt), rule-based observation reduction + recovery tool | Batched, every B turns, only "evictable" segments | Active + still-useful segments; full payloads in an artifact registry | vs OpenClaw (compaction at 0.5): PinchBench cost −61% (score +0.5/+2.1); Claw-Eval −56% (−1.4) and continuous −87% ($81.52→$10.58, −2.6) | **Training-free, harness-level** | **V** (HTML) |
| **Anthropic context editing + memory tool** (claude.com/blog/context-management, 2025-09-29) | `clear_tool_uses`: oldest tool results replaced by placeholders once prompt > trigger (default 100K), keep last 3, `clear_at_least` "to determine whether clearing is worth breaking your prompt cache" | Threshold | Recent 3 tool pairs + placeholders; notes in memory files | Internal agentic search: context editing alone **+29%**, + memory tool **+39%**; 100-turn web search: **−84% tokens**, finishes tasks that otherwise exhaust context | API feature, untrained use | **V** (blog + docs) |
| **Anthropic "Effective context engineering"** (2025-09-29) | Context is a finite attention budget (n² pairs); compaction keeps "architectural decisions, unresolved bugs, implementation details" + **5 most recently accessed files**; tool-result clearing = "safest, lightest touch"; sub-agents return **1,000–2,000-token** summaries | — | — | Guidance, no numbers | — | **V** |

### A2. Degradation evidence (why fold at all)

- **Chroma "Context Rot"** (trychroma.com/research/context-rot, 2025-07-14, 18 models incl. Claude Opus 4/Sonnet 4,
  GPT-4.1, o3, Gemini 2.5, Qwen3) **V**: performance falls with input length even on trivial tasks; worse when
  needle–question similarity is low; **one distractor hurts, four hurt more**, with non-uniform effects; coherent
  haystacks are *worse* than shuffled ones; **LongMemEval focused (~300 tok) beats full (~113K tok) for every model**,
  with the largest gap for Claude (mostly abstentions); thinking narrows but does not close the gap. The authors say
  real tasks probably degrade more.
- **Du et al., "Context Length Alone Hurts…"** (arXiv 2510.05381) S: 5 models, math/QA/code: **−13.9% to −85%** as
  input grows within the claimed window, *even with perfect retrieval*, and even when filler is whitespace or masked.
  Llama-3.1-8B −24.2% on MMLU at 30K. Mitigation: recite evidence first, then answer (+4% GPT-4o on RULER).
- **Lost in the Middle** (Liu et al., arXiv 2307.03172, TACL 2024) S: U-shaped accuracy over position; middle is
  worst. Chroma found no notable position effect in its setup, so treat position as secondary to length and distractors.
- **Context-Folding's own ablation** V: with no RL, folding beat bounded baselines (ReAct-32K, summary agent) but
  **lost to ReAct with a 327K window** (0.420 vs 0.478 BC-Plus; 0.492 vs 0.552 SWE). Within **one task**, an untrained
  model gains more from having the detail than it loses to length. Note FoldGRPO's "unfolded-token penalty" triggers
  when the main thread passes **50% of the working limit**, and its "out-of-scope penalty" punishes branches that
  wander.
- `01` [dots]: scope violations 8.6%→19.7% going from 5 to 10 unrelated tasks in context. This is cross-topic
  contamination: the Chroma distractor effect in an agent.

**Synthesis (I):** detail from the *current* topic is mostly signal, so untrained models do better keeping it
(Context-Folding no-RL, ACON's OfficeBench drop, AgentFold's claim). Detail from a *finished* topic is a distractor
for every later turn (Chroma distractors, dots, LongMemEval focused ≫ full, Anthropic +29%). That is why the fold
boundary should be the topic boundary, not a token threshold.

### A3. What transfers to an off-the-shelf harness (no training)

| Idea | Transfers? | How in Ducter |
|---|---|---|
| Branch/return with KV rollback (Context-Folding) | **Yes, structurally.** Anthropic's prefix cache gives "rollback" for free: a fresh call with identical L0–L2 bytes is a cache hit (`03`: 100% prefix hit) | Do bulky reads in a **side call that forks the main prefix**; only the conclusion is appended to main. Branch prompt = scoped question (out-of-scope penalty → explicit scope in the prompt) |
| Fold at sub-task end (HiAgent, AgentFold deep consolidation) | Yes, as a prompt-level decision + harness action | Topic boundary = fold point; the main AI already writes the conclusion (principle 3) |
| Learned fold policy (FoldGRPO, AgentFold SFT, MEM1, SUPO) | **No** | Substitute rules + a cheap judge (TokenPilot's zero-shot estimator) |
| Observation compression at entry (ACON T_obs; TokenPilot obs reduction; principle 3 "bounded tool results") | **Yes; cheapest kind** (doesn't break any cache) | Hard cap on read results; page/slice instead of dump; recovery handle to the full payload |
| Guideline optimisation from contrastive failures (ACON) | **Yes** (prompt-only, offline) | Tune Ducter's fold/digest prompt from cases where a fold later forced a re-read |
| Batched eviction + prefix canonicalisation (TokenPilot, `clear_at_least`) | **Yes** | Fold several stale reads in one rewrite; never put volatile fields above L4 (already principle 2) |
| File/Log as state of record, rebuild from snapshot + recent k (InfiAgent) | **Yes**, it *is* Ducter's re-cut | L2 digests + verbatim tail = snapshot + k; the Log = the file system |
| Periodic whole-history summarisation (ReSum, Claude Code/SDK compaction at 100K) | Partly. Worse than structural folding in every head-to-head (Summary agent 0.386 < Fold 0.420; ACON naive summary 43.5 < 56.5) | Only as a fallback inside Focus Windows, never for the main AI |
| Recite-then-answer (Du et al.) | Yes, cheap | When a turn depends on an earlier read, quote the relevant lines into L4 rather than relying on far-back attention |

---

## B. Economics

### B1. Current cache prices (all verified 2026-11-08 unless tagged)

**Anthropic** (platform.claude.com/docs/en/about-claude/pricing; …/build-with-claude/prompt-caching) **V**
- Write 5-min = **1.25×** base input; write 1-h = **2×**; read ("hits and refreshes") = **0.1×** by default,
  **0.05× for Opus 5.5 and Sonnet 5.5**, **0.025× for Fable 5.1 / Mythos 5.1**. A read refreshes the TTL at no cost.
- Examples ($/MTok, in/5m-w/1h-w/read/out): Opus 5.5 4 / 5 / 8 / 0.20 / 20; Sonnet 5.5 2 / 2.5 / 4 / 0.10 / 10;
  Opus 4.8 5 / 6.25 / 10 / 0.50 / 25; Haiku 5.5 0.10 / … / 0.01 (≤100K prompt; >100K ×5 on all categories).
- 1M context at standard price for 4.6+ (except Haiku 5.5). Min cacheable: 512 tok (5.x), 1,024–4,096 older.
  ≤4 breakpoints, **20-block lookback** per breakpoint; top-level `cache_control` = automatic moving breakpoint.
  Invalidation hierarchy tools → system → messages; images, `tool_choice`, thinking/effort params break message cache.
- API rate limits: "cache hits are not deducted against your rate limit" (ITPM) **V**.

**OpenAI** (developers.openai.com/api/docs/guides/prompt-caching) **V**
- **GPT-5.6+**: breakpoints implicit (end of latest eligible message) or explicit; default lifetime **30 min**
  (read refreshes to ≥30 min), `ttl:"12h"` in Responses API; **write 1.25× (30m) / 2.5× (12h)**, read **0.1×**
  (0.05× GPT-6.1 Sol/Terra); min 1,024 tokens.
- **Earlier models** (gpt-5.5 … gpt-4.1): automatic, **no write charge**; `in_memory` ≈5–10 min idle, up to 1 h;
  `prompt_cache_retention:"24h"` (default `24h` for non-ZDR orgs); `prompt_cache_key` influences routing, keep
  ≲15 req/min per key; "maintaining a session doesn't guarantee a cache hit"; whole rendered prefix must match.
- **Codex credits** (learn.chatgpt.com/docs/pricing) **V**: cached input = **0.1×** input (e.g. GPT-5.6 Sol
  100/10/500 credits per MTok in/cached/out; 0.05× on GPT-6.1 Sol 50/2.5/250), **"no separate cache-write charge."**

**Google Gemini** (aistudio.google.com/docs/caching, /docs/pricing) **V**
- Implicit caching on by default for 2.5+ (min 2,048 tok on 2.5, 4,096 on 3.x/4). Cached price = **0.1×** input
  (3.1 Pro $2.00→$0.20; 3.8 Flash $0.75→$0.075; Gemini 4 Argon $2.00→$0.10 = 0.05×, implicit only).
  Explicit caches: storage **$4.50/MTok/h** (Pro), **$0.50/MTok/h** (3.6/3.8 Flash); not available on Gemini 4 Argon
  or the Interactions API. Explicit default TTL not stated on the fetched page (S: 1 h).

**DeepSeek** (api-docs.deepseek.com/quick_start/pricing) **V**: per MTok peak, hit / miss / out:
deepseek-flash (V4.1) **0.006 / 0.30 / 1.20** (hit = **0.02×**); deepseek-v4-pro **0.044 / 1.32 / 3.96** (0.033×);
off-peak half price. No write premium; TTL not documented on page (S: best-effort disk cache, hours).

**Subscriptions (how plans meter caching)**
- **Codex/ChatGPT plans**: credit rate card weights cached input at 0.1× and has no write charge **V**. The pricing
  page lists "caching" among factors for included-limit usage; that included limits use the same weights is
  **probable, not stated (UNCERTAIN)**.
- **Claude Pro/Max**: Anthropic publishes **no** rule for how cache reads/writes count against plan limits
  (**UNCERTAIN**). Evidence: Claude Code on subscription writes **1h** TTL (`03`, observed `ephemeral_1h_input_tokens`);
  Mar 2026 limit-drain episodes were attributed by users to cache-breaking bugs ("10–20×") and fixed by downgrading
  (The Register 2026-03-31, S); the Morph blog reports a weekly-limit reset after a Feb 2026 caching bug (S). These
  only make sense if **cache misses cost far more quota than hits**. Working assumption: plan quota ≈ API cost weights.

### B2. Cost model for the main AI's tail

Units: **base-input-token equivalents (BITE)**. Cost is `w` per written (missed) token and `ρ` per cached read. Output
tokens are the same under every option and are omitted.

Symbols: `P` stable prefix (L0–L2), `R` bulky read (e.g. a Focus Window transcript slice), `r` the conclusion drawn
from it, `t` tail bytes after R's position at fold time (≈ r + stub, ~1K if folded at the boundary), `N` turns before
the next re-cut, `p` probability R (or part of it) is needed again, `f` fraction re-fetched if so (1 = whole read;
≈0.25 = a paged slice from the Log), `H` current history, `B` rebuild size from a cut point.

**KEEP**: extra cost `N·ρ·R` (R re-read from cache every turn). No re-need penalty. Quality cost: R acts as a
distractor for every later, unrelated turn.

**FOLD by tail rewrite** (replace R with a stub after the conclusion is written):
- prefix cache (Anthropic): `w·t` once; P stays a hit.
- thread cache (Codex harness: new thread ⇒ new routing key, assume miss) **I**: `w·(P+t) − ρ·P`.
- plus re-need: `p·(w·f·R + ρ·P)`.

**FOLD by branch** (read R in a side call that shares the main prefix and return only r):
- prefix cache: `k·ρ·P + w·r` (k side calls reading the shared prefix; R is written in the branch, as KEEP would have
  written it in main, so it cancels).
- thread cache: the side call runs in a separate utility thread with its own small prefix `P_s`: `k·ρ·P_s + w·r`.
- same re-need term.

**Decision rule (cost only):**
`fold  ⇔  N·ρ·R  >  C_fold + p·w·f·R`  ⇒  roughly `N > C_fold/(ρR) + p·f·(w/ρ)`.
The ratio **w/ρ** is the crux: 40 for Opus/Sonnet 5.5 with 1h writes, 25 with 5m writes, 12.5 for older Claude
(5m), 10 for Codex and OpenAI ≤5.5. A wrong fold costs as much as keeping R for `w/ρ` turns.

**Worked numbers** (P=30K, R=20K, r=0.5K, t=1K, k=2, P_s=10K; extra BITE over the next N turns):

| Setting | keep N=5 / 10 / 20 / 30 | rewrite (p=0) | branch (p=0) | re-need add-on p=0.2,f=1 / p=0.2,f=.25 / p=0.5,f=.25 | break-even N (p=0) rewrite / branch |
|---|---|---|---|---|---|
| Claude sub, Opus 5.5, 1h (w=2, ρ=.05) | 5 / 10 / 20 / 30K | 2.0K | 4.0K | +8.3K / +2.3K / +5.8K | 2 / 4 |
| Claude API, 5m, ρ=.1 model (w=1.25) | 10 / 20 / 40 / 60K | 1.25K | 6.6K | +5.6K / +1.9K / +4.6K | 0.6 / 3.3 |
| Codex thread (w=1, ρ=.1) | 10 / 20 / 40 / 60K | **28.0K** | 2.5K | +4.6K / +1.6K / +4.0K | **14** / 1.2 |

Readings:
1. **Anthropic, p≈0** (finished topic, unlikely to be revisited): fold pays back after **2–4 turns**. With p=0.2 and a
   whole-R re-fetch (f=1), the break-even moves to N≈10 (1h) / ≈3.5 (5m). With **paged re-fetch (f=0.25)** it drops to
   ≈4 (1h) / ≈2 (5m). ⇒ Folding is only safe economically if a re-need can be served **by a bounded slice from the Log, not by
   re-reading R whole**.
2. **Codex**: a tail rewrite costs about the whole prefix (28K), which only pays after ~14 turns. Branch is ~10× cheaper.
   ⇒ On thread-affinity caches, **decide ex ante**: branch bulky reads, or keep them. Fold by rewrite only when cold.
3. **Branch vs rewrite on Anthropic**: rewrite is cheaper *if it happens at the boundary* (t small). Its cost grows
   linearly with every turn of delay (`w·t`, t = all bytes after R). Branch also needs no harness history synthesis,
   and the main context never holds R, so it is never distracted by it. Prefer branch whenever the read's bulk is
   predictable (transcripts, logs, search dumps). Use rewrite for surprises.
4. Price alone rarely forces a fold within N≤5 (keep costs only 5–10K BITE ≈ $0.02–0.04 on Opus 5.5).
   **The binding reasons are quality and the 128–256K budget** (A2).

### B3. Re-cut decision when cold (or of unknown warmth)

Resume costs `w·H` cold, `ρ·H` warm. Re-cut costs `w·B` cold. When warm, a prefix cache still hits on the shared
L0–L1 bytes: `ρ·P + w·(B−P)`. After that, each turn costs `ρ·H` vs `ρ·B`.
With unknown warmth (probability q warm), re-cut wins when
`q·ρH + (1−q)·wH  >  q·C_recut,warm + (1−q)·wB`.

Worked (H=150K, B=45K = P 30K + 10K digests + 5K verbatim tail):

| Setting | resume warm / cold | re-cut warm / cold | re-cut better if P(warm) < | warm re-cut pays back after |
|---|---|---|---|---|
| Claude sub Opus 5.5 1h | 7.5K / 300K | 31.5K / 90K | **0.90** | 4.6 turns |
| Claude API 5m ρ=.1 | 15K / 188K | 21.8K / 56K | **0.95** | 0.6 turns |
| Codex thread | 15K / 150K | 45K / 45K | **0.78** | 2.9 turns |

Consequences (I): (a) When cold, re-cut whenever B < H. It is strictly cheaper and a cleaner context, which matches
principle 4. (b) **"If warmth is unknown, resume" is wrong when H/B ≳ 2.** Unless warmth is ≥78–95% likely, re-cut
is cheaper in expectation. In practice the control plane knows `last_request_at` and the TTL (1h on Claude
subscription), so "unknown" should be rare. Make the rule `q`-based, not a default. (c) Even **warm**, re-cutting a
bloated session (H/B≈3) pays back within ~1–5 turns on prefix caches, *provided L0–L1 bytes are identical*. So
"never compact a warm session" should become "never rewrite warm **unless H−B is large and ≥k* more turns are
expected**", where `k* = (C_recut,warm − ρH)/(ρ(H−B))`. Human-paced main-AI turns are often > 1h apart, so most
re-cuts will be cold anyway.

### B4. Quality cost (qualitative model)

Treat the quality cost of keeping R as `N_after · D(R, topic_next) · g(H)`. D is the distractor weight: high for a
finished, unrelated topic (Chroma distractors; dots 8.6→19.7%) and ≈0 or *negative* for the current topic
(Context-Folding no-RL loses to 327K keep). g rises with total length even at perfect retrieval (Du: −13.9…−85%;
LongMemEval 300 vs 113K). The fold side has its own quality cost: summary loss
(ACON OfficeBench −2.1pt; TokenPilot −1.4…−2.6pt; naive summaries far below structured folds). Net (I): fold
**finished-topic** bulk aggressively, keep **current-topic** detail until its topic ends, and never fold by token
threshold alone.

---

## Design rules for Ducter

1. **Fold at topic boundaries, not at token thresholds.** Within a topic, keep the detail. Evidence: Context-Folding
   no-RL 0.420 < keep-327K 0.478 (same task); Chroma distractor and LongMemEval focused-vs-full results; dots
   cross-task 8.6→19.7%; HiAgent and AgentFold fold at sub-goal completion; ACON's threshold folding cost
   OfficeBench 2.1pt.
2. **Bound reads at entry. It is the only compression that breaks no cache.** Cap tool results; return slices with a
   handle to the full payload. Evidence: ACON ("history compression breaks the KV-cache… rarely helps API cost;
   observation compression reduces cost more reliably"); TokenPilot observation reduction + recovery tool; principle 3.
3. **Predictably bulky reads go in a branch that shares the main prefix. Main receives only the conclusion
   (≤1–2K).** Evidence: Context-Folding branch/return with KV rollback (>90% main-thread compression); Anthropic
   sub-agent guidance (1,000–2,000-token returns); cost table B2 (branch 2.5–6.6K vs keep 10–60K). Give the branch an
   explicit scope (FoldGRPO out-of-scope penalty).
4. **On thread-affinity adapters (Codex), never tail-rewrite while warm: branch or keep.** Evidence: B2, where a
   rewrite costs ≈28K and breaks even only at N≈14, versus a 2.5K branch. Codex credits have no write premium, so the
   loss is the whole re-read prefix. Declare cache scope in the adapter (principle 13), and let the fold planner read it.
5. **Make a fold safe to undo cheaply: every fold leaves a stub with a Log pointer, and a re-need is served by a
   paged slice, not a full re-read.** Evidence: B2 re-need term. f=1 vs f=0.25 moves break-even from N≈10 to ≈4 at
   p=0.2. MemGPT/Letta recall search and TokenPilot artifact registry show the pattern works without training.
6. **Batch rewrites and require a minimum payoff.** Fold several stale reads in one rewrite, only if
   `N·ρ·R_total > w·t + p·w·f·R_total`, and only if ≥ a `clear_at_least`-style floor. Evidence: Anthropic
   `clear_at_least` ("whether clearing is worth breaking your prompt cache"); TokenPilot B=3 batched purge (−56…−87%
   cost at ±2.6pt).
7. **Defer non-urgent destructive edits to cold moments, where they cost nothing extra.** Evidence: B3, where a cold
   resume pays w·H regardless; OpenClaw cache-ttl pruning (`01`).
8. **Replace "if warmth unknown, resume" with an expected-cost test on q = P(warm).** Re-cut when
   `q·ρH + (1−q)wH > q·C_recut,warm + (1−q)wB`. Track `last_request_at` and the TTL per adapter so q is usually 0 or 1.
   Evidence: B3 thresholds q* = 0.78–0.95 at H/B≈3.
9. **Allow a warm re-cut only when H−B is large and enough turns are expected** (`N > k*`, ~1–5 turns at H/B≈3), and
   only when L0–L1 bytes are identical, so the shared prefix still hits. Evidence: B3 payback; Anthropic prefix
   matching is exact and content-based (20-block lookback).
10. **Rebuild = snapshot + recent k, from the Log.** This is the validated form of a re-cut. Evidence: InfiAgent
    (training-free, file state + k=10) 80/80 coverage vs Claude Code 29.1 and compressed-context ablation 27.7;
    principle 1.
11. **Never use whole-history summarisation for the main AI.** At most it is a Focus-Window fallback. Evidence: summary
    agent 0.386 < fold 0.420 (Context-Folding); ACON naive summary 43.5 vs 56.5; AgentFold's critique of full-history
    summarisers.
12. **Tune fold and digest prompts offline from contrastive failures**, i.e. cases where a fold forced a re-read or
    changed an answer. Do not try to learn a policy. Evidence: ACON gradient-free guideline optimisation (AppWorld
    51.2→56.5 with compression step, +46% small models); all learned folders (FoldGRPO, AgentFold, MEM1, SUPO) need
    weights we do not control.
13. **When a later turn depends on an old read, recite the needed lines into L4 instead of relying on long-range
    attention.** Evidence: Du et al. recite-then-answer; Chroma "how information is presented matters".
14. **Budget by quality: keep the main AI's working tail well under the window, with unfolded bulk ≤50% of budget
    as a fold trigger *at the next boundary*.** Evidence: FoldGRPO's unfolded-token penalty at 50% of the working
    limit; Chroma and Du degradation within claimed windows; principle on the 128–256K budget.
15. **Treat subscription quota as if it used API cache weights, and verify per adapter from telemetry.** Evidence: Codex
    credits cached = 0.1×, no write charge (V); Claude plan weighting undocumented (UNCERTAIN), but cache-bug
    quota drains (S) imply misses ≫ hits; 1h writes (2×) on Claude subscription mean a careless rewrite costs
    40 cached turns' worth of reads on Opus 5.5.

---

### Sources

- Context-Folding: https://arxiv.org/abs/2510.11967 (PDF pp.1–9 read) · AgentFold: https://arxiv.org/abs/2510.24699 ·
  ACON: https://arxiv.org/abs/2510.00615 · ReSum: https://arxiv.org/abs/2509.13313 · SUPO:
  https://arxiv.org/abs/2510.06727 · MEM1: https://arxiv.org/abs/2506.15841 · HiAgent: https://arxiv.org/abs/2408.09559 ·
  MemGPT: https://arxiv.org/abs/2310.08560 · InfiAgent: https://arxiv.org/abs/2601.03204 · TokenPilot:
  https://arxiv.org/abs/2606.17016 · Du et al.: https://arxiv.org/abs/2510.05381 · Lost in the Middle:
  https://arxiv.org/abs/2307.03172 · Chroma: https://www.trychroma.com/research/context-rot
- Anthropic: https://claude.com/blog/context-management · https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents ·
  https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/build-with-claude/prompt-caching ·
  https://platform.claude.com/docs/en/build-with-claude/context-editing
- OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching · https://learn.chatgpt.com/docs/pricing
- Google: https://aistudio.google.com/docs/caching · https://aistudio.google.com/docs/pricing
- DeepSeek: https://api-docs.deepseek.com/quick_start/pricing/
- Subscription anecdotes (S): https://theregister.com/2026/03/31/anthropic_claude_code_limits ·
  https://www.morphllm.com/claude-code-usage-limits
- Cost model script: `<scratch>`
