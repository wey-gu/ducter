# 07 — Choosing harness, model, effort and machine for a Focus Window

Date: 2026-11-08. Scope: how the main AI should pick the "body" for each new Focus Window (FW): harness,
model, reasoning effort and machine. Covers prior art, reading quota, routing research, task-to-model fit,
personalization, and a first-principles proposal. Marks: **[V]** verified (source read, local binary/schema
inspected), **[D]** vendor docs read, **[I]** inferred or secondary. Repo paths are relative to
`scratchpad/repos/` (`<scratch>/repos/`).
Local installs checked read-only: Claude Code 2.1.319, codex-cli 0.167.0, plus pi, cursor-agent, gemini,
opencode, kimi, grok present on PATH. No model calls were made.

---

## 0. TL;DR

1. **Nobody in the prior art routes automatically across harnesses.** Raft, Multica, Lody and Conductor have
   a *human* pick runtime + model + effort per agent/role. OAR exposes the facts (installed, logged in, models,
   effort menus, account quota windows, failure class with `resetsAt`) and states outright that it embeds **no
   selection policy**. OpenClaw has the richest *within-provider* failover (profile rotation, then a fallback
   chain, with sticky rate-limit fallback). Cursor, OpenRouter and Not Diamond route per request, but only
   among models behind one billing surface.
2. **Quota is readable for the four harnesses that matter most for subscriptions** [V]: Claude (`get_usage`
   control request, `rate_limit_event` in stream-json, statusline `rate_limits`), Codex
   (`account/rateLimits/read` and the `account/rateLimits/updated` notification), Grok (ACP extension) and Kimi
   (HTTP `/usages`). There is no structured read for pi, Cursor, OpenCode or Antigravity (OAR
   `docs/spec/account-usage.md:3-5`), and I found none for Gemini CLI.
3. **Learned routing is not worth it for a personal system.** LLMRouterBench (Jan 2026: 400K instances,
   33 models) found that most routers, OpenRouter's commercial one included, "fail to reliably outperform the
   simple Best Single baseline", and that careful curation beats bigger pools. A personal system also has far
   too few outcomes to train on. A **curated capability table + hard constraints + quota-aware scoring +
   main-AI judgment over the top few + a light feedback prior** is the right shape.
4. **Proposal:** a deterministic `fw_candidates(task)` tool in the control plane filters and ranks the
   (harness × model × effort × machine × account) options and returns the top 3 with reasons. The main AI
   picks one, usually the first; it may override by giving a reason. User pins beat both. Every decision is
   logged as an event with its input snapshot, so it can be explained, replayed and learned from. When a
   quota runs out mid-task, the default is to **park and wait for the reset** if it comes soon. Otherwise the
   window fails over to the next candidate, rebuilt from the FW thread in the Log plus a rolling checkpoint.
   The exhausted model is never asked to write its own handoff.

---

## 1. How existing systems choose

| System | Who picks harness/model | Mechanism | Evidence |
|---|---|---|---|
| **OAR** (botiverse) | Host / calling model | Exposes facts only. `orient()` returns per-runtime `Probe`s for installation, auth, providers, `accountUsage`, `models`: *"Facts, including missing evidence, without an embedded selection policy."* `usability()` derives `usable/because` (`not_installed · version_unsupported · logged_out · rate_limited · auth_unknown · probe_failed`). Subagent `spawn({runtime, task, model?, effort?, serviceTier?, resume?})` takes an explicit runtime chosen by the caller; spec: "The library is mechanism; the host chooses the policy." | [V] `oar/packages/oar/src/contracts/orientation.ts:9-16,35-57`; `src/observe/usability.ts:45,59`; `src/agents/types.ts:25-38`; `docs/spec/subagents.md:136` |
| OAR `listModels` | — | A "usable-now list, not a static catalog": it depends on login, plan, provider config and CLI version, "so callers must re-query rather than cache". `ModelEntry{id, resolvedId?, effortLevels?, defaultEffort?, serviceTiers?, disabled?, default?, provider?}`. A separate `ModelCatalogFacade` (wrapping pi's registry) gives `contextWindow, maxTokens, reasoning, input[]`. | [V] `contracts/list-models.ts:13-54`; `contracts/model-catalog.ts:18-30` |
| OAR failures | — | `FailureClass` = `auth · quota · rate_limited · billing · model_unavailable · input_too_large · …`; a `quota` failure carries `resetsAt` when the runtime reports it. `failureAdvice`: quota → `retry:"later"`, rate_limited/overloaded → `retry:"now"`, model_unavailable/billing/auth → `userAction:true`. | [V] `contracts/failure.ts:25-73`; `observe/failure-advice.ts:25-38` |
| **Raft** | Human | Create Agent: Computer → Runtime ("only runtimes detected on that Computer") → Model ("populated from the runtime's reported models") → Reasoning Effort. "Agents can't change their own runtime or computer." Changing the runtime prompts "migrate session or restart". | [V] `raft-source/manual/agent-knowledge/agent.md:43-52,92` |
| **Multica** | Human, assigning issues to agents | The daemon detects CLIs and registers one runtime each; the model comes from per-runtime env overrides (`MULTICA_CLAUDE_MODEL`, `MULTICA_CODEX_MODEL`, …). For Copilot, "model routed by your GitHub entitlement". | [V] `multica/CLI_AND_DAEMON.md:280,317,387-409` |
| **Lody** | Human | A Role has several *machine targets*, each with its own Agent Config, model, mode and run options. "Target order is authoring order, not preference; there is no fallback between targets." The UI shows remaining subscription quota per Provider (5h/7d windows), gated on a provider `rateLimits` capability, but it is only displayed and never drives routing. | [V] `lodyai-lody/specs/agent-role-machine-targets.md:17-23`; `specs/provider-quota-overview.md` |
| **DimAgent** | Human/agent | Subagent metadata records `selectedProviderId/ModelId`. I found no routing logic. | [V] `dim-ext/docs/HANDOFF.md:32` |
| **OpenClaw** | Config + runtime failover | Order: (1) rotate auth profiles within the provider, (2) fall back to `agents.defaults.model.fallbacks`. A user-selected non-default model is "strict" (no fallback). Fallback applies to the current turn, but "eligible rate-limit fallbacks can stay first for later turns" (session stickiness). TPM exhaustion allows ≤2 same-model retries in 15 s before advancing. Model **roles**: primary / `utilityModel` (titles, summaries) / `decisionModel` (typed classification, scoring, routing). Subagents: "set a cheaper model for sub-agents … via `agents.defaults.subagents.model`". External harnesses run via ACP. | [V] `openclaw/docs/concepts/model-failover.md:13-17,57-65,126-142`; `docs/concepts/decision-models.md`; `docs/tools/subagents.md:24-29`; `docs/tools/acp-agents.md:15-37` |
| **Claude Code subagents** | Calling model + config | `model`: `sonnet·opus·haiku·fable`, full ID, or `inherit`. Resolution: per-invocation `model` param (alias only) → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → main model (`…_FORCE=1` pins). `effort` frontmatter / per-invocation param, with `CLAUDE_CODE_EFFORT_LEVEL` on top. `--fallback-model a,b` covers "overloaded or not available", **not** quota. | [D] code.claude.com/docs/en/sub-agents; [V] `claude --help`; binary strings (`CLAUDE_CODE_SUBAGENT_MODEL`, `opusplan`, built-ins `model:"inherit"`) |
| **Codex profiles** | User config | `[profiles.<name>]`: `model, model_provider, model_reasoning_effort, plan_mode_reasoning_effort, service_tier, sandbox_mode, approval_policy, model_catalog_json, …`, selected with `--profile`. `turn/start` takes a per-turn `model` and `effort`. Server-side reroute is visible as `model/rerouted{fromModel,toModel,reason}`, where reason today is only `highRiskCyberActivity`. | [V] `codex/codex-rs/config/src/profile_toml.rs:24-43`; schema `exp/codexschema/v2/ModelReroutedNotification.json` |
| **pi** | User / extension | `enabledModels` patterns (`provider/model[:thinking]`) scope startup and Ctrl-P cycling; `set_model` over RPC; `ctx.scopedModels` for pickers. Switching is in-session and cheap. | [V] `pi-mono/packages/coding-agent/docs/settings.md:18`, `docs/extensions.md:1216-1220` |
| **Cursor Auto / Router** | Vendor classifier | Since 2026-07-22, Auto "classifies each request by task type and complexity" and routes per request. "Optimize for" Cost / Balance / Intelligence. The routed model is **hidden by default**. Forum users call it a black box and report near-100% routing to Composer. | [I] startdebugging.net/2026/07/cursor-router-…; forum.cursor.com threads; cursor.com/blog/router (not fetched) |
| **OpenRouter auto** | Vendor | `openrouter/auto` (Not Diamond) is deprecated in favour of `auto-beta`, which uses "task type rankings" from community usage. `cost_quality_tradeoff` runs 0–10. It **pins model+provider per conversation** for cache/continuity and degrades to a default set. | [I] openrouter.ai/docs/guides/routing/routers |
| **Conductor** | Human | Picks Claude Code or Codex per workspace. | [I] product knowledge, not re-verified |

**Pattern.** Every multi-harness product leaves harness/model choice to the human and shows quota at most.
Automatic choice exists only *within* a billing surface (Cursor, OpenRouter, OpenClaw fallbacks). Even
there, routers **pin per conversation** (OpenRouter) or make fallbacks **sticky** (OpenClaw), because
switching mid-conversation wastes the cache. That matches Ducter principle 4/8: continuity is an input to
the choice, not an afterthought.

---

## 2. Reading subscription quota

### 2.1 Claude Code [V]
- **Pull:** spawn `claude -p --input-format stream-json --output-format stream-json --verbose
  --no-session-persistence --safe-mode`, send `control_request{subtype:"initialize"}` (account email), then
  `{subtype:"get_usage", skip_behaviors:true}`. The reply has `rate_limits_available`, `subscription_type`,
  `rate_limits.{five_hour, seven_day, seven_day_oauth_apps, seven_day_opus, seven_day_sonnet | model_scoped[],
  extra_usage}`, each with `{utilization (0-100), resets_at}`. No prompt, no credential read, no HTTP.
  (`oar/packages/oar/src/runtimes/claude/account-usage.ts:36-89,137-207`). `--safe-mode` keeps the probe
  from running the user's hooks and MCP servers.
- **Push, in-session:** a stream-json `rate_limit_event{rate_limit_info{status: allowed|allowed_warning|rejected,
  resetsAt, rateLimitType: five_hour|seven_day|seven_day_opus|seven_day_sonnet|overage, utilization 0-1,
  overageStatus, overageResetsAt, overageDisabledReason}}`. It is emitted whenever the limit state changes,
  *before* the error frame of a refused request (`sdkpy/src/claude_agent_sdk/types.py:1757-1800`;
  `oar/.../claude/failure.ts:50-74`). `allowed_warning` is the cue to checkpoint (§6.6).
- **Statusline JSON:** `rate_limits.five_hour|seven_day.{used_percentage, resets_at}` and gateway
  `spend_limit.*`. It is present only for Pro/Max/Ultra (or a spend-limited gateway) and only after the first
  API response. The same payload carries `prompt_cache.{warm, ttl, expires_at, hit_ratio, misses}`, a free
  warmth signal for §6.2 [D code.claude.com/docs/en/statusline; V binary strings
  `rate_limits.five_hour.used_percentage`].

### 2.2 Codex [V schema, `exp/codexschema/`]
- `account/rateLimits/read` → `{rateLimits, rateLimitsByLimitId{<limitId>: RateLimitSnapshot},
  rateLimitResetCredits}`. `RateLimitSnapshot{limitId, limitName, normalModelSlug, planType, primary,
  secondary, credits{hasCredits, unlimited, balance}, rateLimitReachedType, spendControlReached,
  individualLimit}`; `RateLimitWindow{usedPercent, windowDurationMins, resetsAt}`. Per-model buckets exist
  (e.g. a Spark-model bucket with its own 5h/7d windows, `codex/account-usage.ts:77-112`), so **quota is per
  (account, model-bucket), not per harness**.
- Push: the `account/rateLimits/updated` notification; `thread/tokenUsage/updated` carries per-turn cache.
- `account/rateLimitResetCredit/consume` spends a reset. OAR never calls it on its own
  (`contracts/account-usage.ts:146-149`), and Ducter must not either: spending one is a user decision.
- Also `account/usage/read`, `model/list` (with `supportedReasoningEfforts`, `defaultReasoningEffort`,
  `serviceTiers`, `modelSpecialty`, `upgrade`), and `modelProvider/capabilities/read`.

### 2.3 Others
- **Grok:** an ACP extension returns included-usage percent, prepaid balance and on-demand cap
  [V `oar/.../grok/account-usage.ts:85-100`].
- **Kimi:** OAR GETs `${baseUrl}/usages` with the CLI's stored bearer token **from the host process**
  [V `kimi/account-usage.ts:211-224`]. That reads a credential, which conflicts with principle 10's "never
  read credentials". Ducter should disable this reader, or accept it only as a read of the user's own account
  on their own machine [I].
- **pi, Cursor, OpenCode, Antigravity:** no structured read [V `docs/spec/account-usage.md:3-5`].
  `cursor-agent models` returned "No models available for this account" locally, i.e. not logged in [V].
- **Gemini CLI:** I found no structured quota read in this pass. `/stats` shows session usage only [I].
- **API-key providers:** no quota windows. Use spend budgets that Ducter meters from token usage × price.
- **Fallback for opaque harnesses:** Ducter keeps its own ledger of FW-hours and tokens per account and
  learns each account's empirical capacity from past `quota` failures (time-to-exhaust). The ledger is
  labelled "estimated" in the UI [I].

**Design consequence:** model quota as `QuotaState{accountKey, bucketId, usedRatio, resetsAt, durationMs,
source: pull|push|ledger, observedAt}`, keyed per account **and bucket**. OAR's spec also warns that a
snapshot "belongs to the account resolved by this read" (`docs/spec/account-usage.md:26-30`), so key by
(machine, runtime, config home), not by runtime.

---

## 3. Model-routing research: what actually works

- **RouteLLM** (LMSYS, 2024, arXiv 2406.18665): binary strong/weak routers trained on Arena preference data.
  The authors claim large cost cuts at ~95% of the strong model's quality on MT-Bench [I, recalled, not
  re-fetched]. Binary routing on single prompts, not agentic sessions.
- **RouterBench** (2024, arXiv 2403.12031): offline benchmark with pre-generated responses. It established the
  "oracle vs best-single" framing.
- **LLMRouterBench** (Li et al., arXiv 2601.07206, Jan 2026): 400K+ instances, 21 datasets, 33 models, 10
  routers (RouteLLM, RouterDC, GraphRouter, Avengers(-Pro), FrugalGPT, OpenRouter…). Findings [V abstract]:
  many routers perform alike; several, commercial routers included, **fail to reliably beat Best Single**;
  a large oracle gap remains, driven by "model-recall failures"; embedding backbone matters little; larger
  pools give diminishing returns versus careful curation.
- **Generalisable routers** (EACL 2026 SRW, aclanthology 2026.eacl-srw.22): a retrieval-based kNN router
  matches other generalisable routers across SPROUT, RouterBench, LiveBench and others. Cheap
  nearest-neighbour routing is about as good as complex learned routing [I, abstract-level].
- **Arch-Router** (Katanemo, arXiv 2506.16655): a 1.5B model maps queries to *user-defined policies*
  (domain/action → preferred model); reported 93% policy-match accuracy. Its useful point is that the user's
  preference taxonomy, not a benchmark, defines "correct" [I paper claims].
- **Personalized routing:** PersonalizedRouter (TMLR 2025, graph of user/task/query/LLM), GMTRouter
  (arXiv 2511.08590, multi-turn), MetaRouter (arXiv 2606.06178, contextual bandit from pairwise feedback).
  All are evaluated on simulated users or benchmarks [I].
- **Practice:** Cursor's router claims to be trained on live coding traffic but is opaque; users complain. Not
  Diamond is being replaced at OpenRouter by usage-ranking ("what developers actually use per task").

**Assessment for Ducter [I].** (a) Routing research optimises *single-prompt answer quality vs price*.
Ducter's choices are long-horizon agentic sessions, where the harness matters as much as the model, and where
the constraint is subscription *quota windows*, not per-token price. (b) A single user produces perhaps
tens of FWs a week, nowhere near enough labels to train a router. (c) The evidence says curation ≈ learned
routing. So: **a curated table of task kind → ordinal tiers**, refreshed from public evals; LLM judgment
for the ambiguous middle; a small Bayesian prior from the user's own outcomes. The policy-taxonomy idea from
Arch-Router maps directly onto user rules ("research → Gemini"; "anything touching repo X → Codex").

---

## 4. Task → model fit (late 2026, stated cautiously)

The public numbers are noisy. Aggregators disagree on leaders for the same benchmark; vendor-reported scores
run far above standardized-scaffold scores (e.g. SWE-bench Pro: vendor ~90% for the current Claude flagship
vs Scale's common-scaffold leaderboard ~60% in October); and METR says its time-horizon suite is unreliable
above ~16 h, which the frontier has reached [I: benchlm.ai, llm-stats.com, vals.ai, snorkel.ai,
Wikipedia/METR summaries]. So Ducter should **not hard-code winners**. Coarse, defensible priors [I]:

| Task kind | What matters | Prior (as of 2026-11, revisit) | Evals to track |
|---|---|---|---|
| Coding in a repo (bounded) | harness tool loop + model | Claude Code + Opus/Sonnet-class and Codex + GPT-5.x/6-class are both top tier; pick by quota and repo continuity | SWE-bench Pro (Scale, standardized scaffold), Terminal-Bench (tbench.ai, harness+model pairs) |
| Long-horizon agentic (hours) | reliability over many steps, compaction | flagship models at high effort; effort matters more than brand | METR time horizons, Terminal-Bench hard tiers, vendor long-run reports |
| Research / browsing | search tool quality, citation discipline | harness with native web search + strong reader; Gemini and GPT-class models are strong on recall | BrowseComp(-Plus), HLE w/ tools, GAIA-style |
| Writing / persona voice | taste, instruction following | user preference dominates; let overrides learn it | LMArena creative/style-controlled, user's own accept rate |
| Cheap judging / classification / waits (P9) | cost, latency, calibration | smallest capable model: Haiku/Flash/mini-class, or a local classifier | none needed; validate against the user's own labelled samples |
| GUI / computer use | harness capability, not model | gated by machine + harness feature | OSWorld-Verified |

Track **harness+model pairs** wherever an eval reports them (Terminal-Bench does): the same model scores
differently across harnesses. Prefer evals that publish a standardized-scaffold number.

**Keeping it fresh:** `capability-cards/` is versioned data, not code. A weekly background job, run by a
cheap model, fetches the tracked leaderboards and proposes a diff to the ordinal tiers. A human, or the main
AI with evidence links, approves it as a release. Cards store tiers (A/B/C) per task kind, plus source URLs
and `observedAt`, never raw scores. A model newly appearing in `listModels`/`model/list` (Codex's `upgrade`
field hints at successors) gets a provisional tier, inherited from its family, until evidence arrives.

---

## 5. Personalization from overrides and outcomes

- **Prior art:** nobody in the products surveyed learns harness or model choice from a user's
  accept/reject history. Raft, Lody and Multica store the human's choice and stop there. The research
  routers above learn from preference data, but on simulated users. Cursor learns from fleet-wide traffic,
  not from you [I].
- **Signals Ducter already has (in the Log):** user override at dispatch ("use Codex for this"), mid-task
  re-dispatch to another body, outcome of `done` claims (accepted / reworked / reverted / PR merged / user
  said "wrong"), FW failures by class, wall time, quota burned per unit of work, number of `needs-you`
  interruptions.
- **What to do with them [I]:**
  1. **Explicit rules first.** Repeated overrides turn into a *proposed* rule. After N=3 consistent
     overrides in one task kind/project, ask: "make Codex the default for repo X?". Rules are data the user
     can see and edit, Arch-Router-style.
  2. **A small prior second.** Keep a Beta(accept, reject) per (task kind, harness+model, effort). It can only
     **reorder within a tier**, by a bounded amount, so a run of noisy outcomes cannot lift a C-tier model
     over an A-tier one.
  3. **Exploration only on spare quota.** Unused subscription quota expires at each window reset. When an
     account will reset with lots of headroom left, Ducter can spend it on low-stakes exploration (a second
     opinion, a duplicate attempt on a cheap task, a judge pass). That gathers comparison data at zero real
     cost and never on the critical path.

---

## 6. First-principles proposal for Ducter

### 6.1 The decision unit
A **Body** = (harness, model, effort, machine, account). A choice is valid only if the harness is installed
and logged in on that machine, the account has quota or budget, and the subscription is used by the
official binary (an adapter flag: pi's Anthropic-OAuth "stealth" path is **excluded**, per research/03 §6).
Subscriptions never leave the user's machines (principle 10).

### 6.2 Inputs
| Input | Source | Kind |
|---|---|---|
| **Task traits**: kind (code / long-agentic / research / writing / judge / chat / gui), est. horizon, needs (repo path, browser, GUI, OS, secrets, network), interactivity (will the user talk inside?), risk/privacy class, urgency | main AI fills a `TaskSpec` at dispatch, a small typed schema | judgment → data |
| **Capability cards** per harness: adapter capabilities (P8: cache scope, steer, fork, system-prompt override, MCP), native web search, GUI support, subscription vs API | adapter declarations + OAR `refusedSessionOptions` | static |
| **Model cards**: tiers per task kind, context window, effort menu, modalities, price for API | curated `capability-cards/` + OAR `listModels`/catalog (live) | curated + live |
| **Quota state** per (account, bucket): usedRatio, resetsAt, pace = usedRatio ÷ elapsed fraction of window | OAR `accountUsage` poll (every ~10 min per machine) + push events (`rate_limit_event`, `account/rateLimits/updated`) + ledger | live |
| **Machine availability**: online / wakeable (wake latency), harnesses+logins (OAR `orient` posted at connect, research/04 §4), repo present, load | runner registry | live |
| **Continuity / cache warmth**: is there an existing FW or session on this thread or repo? warm until `expires_at`? | adapter usage telemetry (`prompt_cache.*`, `cachedInputTokens`) | live |
| **User preferences**: pins ("always Opus for writing"), bans, "prefer subscription over API", quota reserves ("keep 20% of Claude weekly for the main AI"), privacy rules | persona settings (Nowledge Mem L1) | user data |
| **Outcome prior** | Log-derived Beta stats (§5) | learned, bounded |

### 6.3 Who decides: deterministic shortlist, AI pick, user veto
1. **Filter (code, deterministic):** drop bodies that violate hard constraints: needs unmet, not installed or
   logged in, machine unreachable within the urgency budget, bucket `rateLimited` or projected to exhaust
   before the estimated horizon, banned by the user, privacy class not allowed for that provider, quota
   reserve breached.
2. **Score (code, deterministic):** `tier_fit(kind) + continuity_bonus (warm session ≫ same harness+repo >
   none) + quota_headroom (penalize pace > 1, reward use-it-or-lose-it near reset) − machine_wake_cost −
   API_spend + bounded_outcome_prior`. The weights are config, and they are visible.
3. **Pick (main AI):** the tool `fw_candidates(TaskSpec)` returns the top 3 with a one-line reason each and the
   binding constraints. The main AI usually takes #1. It may take #2/#3 or name a body outside the list
   (e.g. "the user just asked for Kimi"), but must record a `reason`. This keeps the deterministic part
   testable and replayable (P2) and leaves taste to the LLM, without burning tokens on arithmetic.
4. **User override:** an explicit user choice is final and *strict* (OpenClaw's rule: no silent fallback
   away from a user-picked model). Failover then asks the user instead of switching.

Effort follows the same pattern: the card supplies a default per (kind, horizon), and the main AI bumps it up
for hard or long tasks or down for chores. Judge and wait predicates (P9) skip the tool and use a configured
`decisionModel` role, as OpenClaw does.

### 6.4 Logging and explanation
- Write a `body_selected` event to the FW thread: chosen body, top-3, scores, binding constraints, quota
  snapshot ids, and whether the main AI or the user overrode the ranking. It costs one event, replays
  deterministically, and feeds §5.
- **Card subtitle** (one line, always visible): `Codex · gpt-… high · linux-box — coding; Claude weekly 82%,
  resets Thu`. Expanding it shows the top-3 and why. Unlike Cursor's default, the routed model is **never
  hidden**.
- The main AI mentions the choice in chat only when it departs from the user's expectation (a pinned
  default unavailable, a paid API used, a wait instead of a switch), per principle 6: silence by default.

### 6.5 Quota running out mid-task
Triggers: `rate_limit_event.status=rejected`, OAR `FailedTurn{failure:"quota", resetsAt?}`, Codex
`rateLimitReachedType`, or a pace projection that crosses 1.0 before the task's estimated end.

1. **Is the user pinned to this body?** If so, park the FW and ask the user. Do not switch.
2. **Park if the reset is soon.** If `resetsAt − now` < park threshold (default ~45 min, scaled by urgency),
   set the state to `blocked(quota, resetsAt)` and register a `wait_until(resetsAt)` waiter (P9, costs no
   tokens), then resume *the same warm-or-cold session*. On subscription Claude the cache TTL is 1 h
   (research/03), so a short park may even stay warm. Never auto-spend Codex reset credits; offer them to the
   user as a choice.
3. **Otherwise fail over.** Re-run `fw_candidates` with the exhausted (account, bucket) excluded and
   `continuity` set to "handoff". Prefer, in order: same harness on another bucket or model (e.g.
   Opus → Sonnet within Claude Code: same session, `set_model` or resume with `--model`, no handoff needed),
   then another account on the same harness if the user has one, then another harness.
4. **Cross-harness handoff never relies on the exhausted model.** The new session is a projection built
   from: the FW thread in the Log (task, reports, asks), the **rolling checkpoint** (below), the environment
   state (worktree diff/branch, browser URL), and a pointer to the old transcript. Following principle 4's
   "seamless" rule, it arrives as background blocks + "continue", not as a "you were reset" briefing (Raft's
   13/13 rebuild-turn finding).
5. **Rolling checkpoints.** Every `report_to_main` already carries state + summary + artifacts (P7). On
   `allowed_warning` (Claude) or pace > 0.9, the adapter steers the FW to write a short checkpoint
   (plan, done, next, open questions) while it still has quota. When no warning was seen, a cheap model
   writes the checkpoint from the transcript tail, off the critical path.
6. **Tell the user only if it matters:** "Paused until 14:10 (Claude 5-hour limit), or continue now on Codex?"
   escalates as a badge, not a push, unless the task is marked urgent.

### 6.6 Main-AI reserve and global pacing
The main AI's own body draws on the same subscriptions. Keep a configurable reserve per account (e.g. 15%
of weekly) that FWs may not spend. Spread FWs across accounts by headroom-weighted pace, so that the weekly
window of no single subscription hits 100% while another sits idle. This is the same "even-burn line"
OAR's `durationMs` + `resetsAt` were designed for (`docs/spec/account-usage.md:39-44`).

### 6.7 What to build first
1. `QuotaState` collector on each runner (OAR `accountUsage` + push events), Kimi reader off by default.
2. A static `capability-cards/` (6 task kinds × the installed harness/model pairs, ordinal tiers, sources).
3. `fw_candidates` = filter + score, returning top-3 + reasons; the `body_selected` event; the card subtitle.
4. Quota failover: park/wait first, same-harness model switch second, cross-harness handoff from the Log
   third.
5. Override-to-rule proposals; the Beta prior; spare-quota exploration, in that order, only after the logs
   exist.

---

## 7. Open questions
- Does `get_usage` count usage made by *other* Claude clients (claude.ai web, desktop) on the same account?
  It presumably does, since the windows are account-wide [I]. Then Ducter's ledger can't be the source of
  truth, and polling is required.
- Can a running Claude Code session switch model mid-session over stream-json (`set_model` control
  subtype, research/03 §2.3) without breaking the cache? Prefix caching is per model, so a switch is a cold
  write [I]. The scorer should count a model switch as losing continuity.
- Gemini CLI and Cursor quota: is there any structured source, or only the ledger?
- Would a per-user kNN router over `TaskSpec` embeddings (the EACL 2026 approach) beat the tier table plus
  the Beta prior after ~200 FWs? Measure it offline from logged `body_selected` + outcomes before building it.

## Sources
- OAR: `oar/packages/oar/src/contracts/{account-usage,list-models,model-catalog,orientation,failure,placement}.ts`;
  `src/runtimes/{claude,codex,grok,kimi}/account-usage.ts`; `src/runtimes/claude/failure.ts`;
  `src/observe/{usability,failure-advice}.ts`; `src/agents/types.ts`; `docs/spec/{account-usage,subagents}.md`
- Codex app-server schema (local, codex-cli 0.167.0): `scratchpad/exp/codexschema/v2/{AccountRateLimitsUpdatedNotification,GetAccountRateLimitsResponse,ModelListResponse,ModelReroutedNotification}.json`; `codex/codex-rs/config/src/profile_toml.rs`
- Claude Agent SDK (py): `sdkpy/src/claude_agent_sdk/types.py:1757-1800`; Claude Code 2.1.319 `--help` and binary strings
- https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/statusline
- Raft `raft-source/manual/agent-knowledge/agent.md`; Multica `multica/CLI_AND_DAEMON.md`; Lody `lodyai-lody/specs/{agent-role-machine-targets,provider-quota-overview}.md`; OpenClaw `openclaw/docs/concepts/{model-failover,decision-models}.md`, `docs/tools/{subagents,acp-agents}.md`; pi `pi-mono/packages/coding-agent/docs/{settings,extensions}.md`
- LLMRouterBench https://arxiv.org/abs/2601.07206 · RouterBench https://arxiv.org/abs/2403.12031 · RouteLLM https://arxiv.org/abs/2406.18665 · Arch-Router https://arxiv.org/abs/2506.16655 · EACL 2026 SRW https://aclanthology.org/2026.eacl-srw.22 · PersonalizedRouter https://arxiv.org/abs/2511.16883 · GMTRouter https://arxiv.org/abs/2511.08590 · MetaRouter https://www.alphaxiv.org/abs/2606.06178
- Cursor Router https://startdebugging.net/2026/07/cursor-router-makes-auto-a-per-request-model-decision/ · https://forum.cursor.com/t/cursor-auto-mode-in-2026-aug/167118
- OpenRouter routers https://openrouter.ai/docs/guides/routing/routers
- Leaderboards (noisy, cross-check): https://benchlm.ai/benchmarks/swe-bench-pro · https://www.vals.ai/benchmarks/terminal-bench-4 · https://snorkel.ai/leaderboard/ · METR summary https://en.wikipedia.org/wiki/METR
