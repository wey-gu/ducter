# 140: Who does which kind of work: errands off the smartest model, and rules that say "never"

Date: 2026-11-18. Feeds D370. Question from the author: "我们的设计里有优雅完备提供类似于'订酒店，看机票'这类工作别用 claude code 这种规则的么？" Read-only on the code at `3ef02bb2`, on the harness facts registry, and on the author's home Log (hel, read by the coordinator, read-only). No live task was run for this report.

## 1. What the design said, and what the code did

| Claim | Tag | Source |
|---|---|---|
| D89 designed rules said in the conversation, a shipped tier table "per task kind", and ranking by the most limit left | DOCUMENTED | `design/decisions.md` D89; `design/focus-window.md` "Choosing a body" ("tier fit for the task kind") |
| D133 took the limit-based part off the table until a harness reports limits | DOCUMENTED | `design/decisions.md` D133 |
| The code had no kind of work at all: every row scored smart 100, fast 50, plan before pay-per-use (-30), then the limit left; the top row for every task was the smartest (Claude Code · Opus where signed in) | VERIFIED | `packages/core/src/candidates.ts` `rank()` at `3ef02bb2` |
| A rule matched only its own words, literally, in the title or brief (`ruleFor`) | VERIFIED | `packages/core/src/rules.ts` at `3ef02bb2` |
| A rule could only say "use X"; there was no way to say "not X" | VERIFIED | `RuleView` in `packages/protocol/src/loadout.ts`; `rule_save`'s schema |
| The persona had no line about saving such a rule: the partner was told to offer a rule only after two switches the same way | VERIFIED | `packages/partner/src/persona.ts`; `packages/core/src/loadout.ts` (the `_rule_hint` note) |
| A task waiting on the person (needs_you) that was switched to another agent did not start again until a message came | VERIFIED | `packages/runner/src/runner.ts` `switchBody`, and its test "switching a waiting task" |

## 2. What happened on the author's home (hel, 2026-11-18)

All VERIFIED in the Log as read by the coordinator (task ids kept, nothing else copied):

1. 14:19 UTC, task `b2m7yz6m` "比携程酒店差价和北京往返机票", a browser place on the author's MacBook: `body_selected` Claude Code · Opus. The person switched it to Codex by hand.
2. 14:29 the person said 「对了，请你记住，订酒店等生活相关的工作别用 claude code 哈」. The partner answered 「好，以后查机票、订酒店这类生活上的事都不用 Claude Code。」 and called no `rule_save`. The reply promised something the system didn't keep.
3. 14:52 task `3e8g6tet` "算北京往返和朗丽兹总价并准备确认页" again went to Claude Code · Opus. The partner had written the preference into the brief text instead of passing `harness`, so the task itself refused and asked to be moved. The switch to Codex at 14:52:44 left it idle (the person asked at 15:00 「刚才订看机票酒店的被打断了么？」).
4. 14:53 a rule was saved as "查机票和酒店 → Codex" with match words [机票, 酒店, 携程, 航班, flights, hotels, ctrip]: "别用 Claude Code" became "use Codex", and the exclusion was lost.

## 3. Which models are a fast tier, by evidence

| Agent | Smartest | Fast tier | Tag | Source |
|---|---|---|---|---|
| Claude Code | `opus` | `sonnet` (`haiku` exists too) | VERIFIED (aliases and ids) | `packages/protocol/src/harness-facts.ts` claude-code `models` |
| Codex | its own default | none known: the listed models (sol, terra, luna, astra) carry no tier in any source Ducter reads | VERIFIED (no tier field) | `harness-facts.ts` codex `models`; `codex debug models` as recorded there |
| DeepSeek (DeepSeek Harness, pi) | V4 Pro | Flash | DOCUMENTED (DeepSeek's two official models) | D177, `candidates.ts` TIERS |
| pi, other providers | unknown | unknown | INFERRED | pi's models depend on its provider |

The partner eval already shows a small, cheaper model doing the partner's own tool work: Claude Code + haiku 8/10, Codex gpt-6-luna 9/10, DeepSeek flash 9/10 on the smoke set (VERIFIED in research/34). That a fast tier books and compares as well as the smartest is INFERRED, not measured: no errand was run on Sonnet for this report. Hence the safety net in D370 (one retry on the smartest).

Opus costs more of a subscription's limit than Sonnet for the same work (INFERRED from the plans' published per-model weighting; not re-read for this report). Ducter still reads no limit from Claude Code or Codex for ranking (D133), so "keep the smartest's limit for code" is a default by kind, not a measurement.

## 4. First principles for the kinds

- **The person's word, in their words.** "订酒店这类别用 Claude Code" is about a kind of work and an exclusion. Keeping it as "use Codex" changes its meaning (a third agent signed in later would be excluded too). So a rule needs both a kind and a "never".
- **Meaning, not words.** "京都住哪儿" is a hotel search with no word "酒店" in it. Only the one who understood the ask (the partner, at `task_open`) can name the kind, once. Ducter can read a kind from what the task needs when the partner says none: web pages, a phone app → errand; a repo → code.
- **A small set the three users would say themselves.** 写代码 / Code, 跑腿 / Errands, 写东西 / Writing, 查资料 / Research, 其他 / Other. 跑腿 / Errand and 写东西 / Write already name pictures in Past tasks (D285), so the words are not new to the product.
- **Only errands move off the smartest.** Code, writing (the person's own voice) and research (many sources to one answer) are where the strongest model shows; an errand is many small steps on public pages. The router literature (LLMRouterBench, research/07) found learned routers rarely beat the best single model: a fixed rule for one clear kind, with a retry, is safer than a learned one.
- **Plan before pay-per-use stays first among equals.** A pay-per-use fast tier (DeepSeek Flash on a key) never wins over a plan's smartest for an errand: the tier for errands is 100 (a fast tier the table knows) vs 75 (smartest), and pay-per-use costs 30.

## Implications for Ducter

1. `task_open` gains `kind`; the task keeps it (`task_open.workKind`), read from needs and place when the partner says none.
2. Rules gain `kinds` and `never`; a word rule is more specific than a kind rule; a never-rule is a hard filter that a pin in the moment may pass.
3. The ranking scores the tier by kind: errands to a fast tier the table knows (Claude Code · Sonnet, DeepSeek Flash), every other kind as before. Codex has no fast tier until one is evidenced.
4. The first errand routed this way is said once, by Ducter's own words in the conversation; the task's who line says why.
5. An errand on a fast tier that fails or stalls carries on on the smartest, once, by itself.
6. The partner saves "别用 X 做这类" as a never-rule in the same turn, and passes `harness` for a preference it knows but no rule holds; a task waiting on the person carries on when it is moved.

## Summary

The design had a tier table by kind (D89) that was never built; the code sent every task to the smartest and matched rules by literal words, with no "never". On hel this sent hotel and flight work to Claude Code · Opus twice, a spoken preference was promised but not saved, and the rule saved later lost its exclusion. D370 adds a kind of work decided once at `task_open`, rules by kind with "never", a built-in errand tier, a one-time line, and a one-retry safety net. Whether Sonnet does errands as well as Opus is not measured yet.
