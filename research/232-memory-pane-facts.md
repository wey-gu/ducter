# 232: Memory pane facts: the missing Update, Mem's asks judged by the partner, stale preferences (D569)

Date: 2026-11-25. Sources: the code on `main` at 0.1.68, and read-only `nmem 0.10.123` on the author's Mac
(`feed --type flag_contradiction`, `feed reviews -n 1`, `rules list`, `m list`, `m search`). Nothing was
written to Mem. One small judge experiment on `claude -p --model haiku` in a scratch folder (its
`~/.claude/projects` entry deleted afterwards). hel and haswell were not touched.

## 1. Why haswell's row had no Update

- **VERIFIED (code).** Both clients drew the update button only when the row's own agent was signed in on
  that computer and the computer was awake (Mac `memplugin.go` `can := action != "" && h.LoggedIn && dv.State ==
  awake`; web `mem-plugin.tsx` the same), and the Overview's need fell back to 去更新 (go to the pane) in exactly
  that case (`settings_home.go`, `settings-home.tsx`).
- **VERIFIED (code).** The home runs an update with *any* AI signed in on that computer: `mem-plugins.ts`
  `openSetup` picks the row's agent when signed in, else the first signed-in one; it refuses only an away
  computer (`offline`) or one with no signed-in AI (`no_agent`).
- **INFERRED.** On haswell the Codex row (Macbook Pro M3) had its button and Claude Code's didn't; the only gate
  that hides it on an awake computer is `h.loggedIn` false for haswell's Claude Code. Not confirmed on hel
  (read-only check owed, `todo.md`). Either cause is covered by the fix.

## 2. Mem's asks, and whether a model can judge them

- **VERIFIED.** The feed carries what a judge needs: each contradiction's `metadata.content_snippets` (both
  memories' words, about 200 characters), `memory_pairs` (title, date, source), `reason`, `confidence`,
  `new_memory_id`, and `review.recommended_action`. On the author's Mem: 5 pending contradictions, all with
  Mem's suggestion `keep_both_linked`; one draft rule (Feishu deploys through GitHub Actions, 2026-09-04);
  1051 reviews in all.
- **VERIFIED (4 runs, haiku, zh and en).** With the facts labelled earlier and later, haiku chose "the later
  holds" for D524 → D527 (a correction) 4 of 4, and "the earlier holds" for D529 (final number) vs D527 4 of
  4, overruling Mem's "both" each time; Mem's both-hold pairs stayed "both" in 6 of 8 (the two splits are low
  stakes). A first prompt that gave the pair as a bare list mixed up which was earlier (zh "newer", en
  "older" on the same pair); labelling them fixed it. Reasons were plain, about the content; English ones
  sometimes ran to 20 words (clipped at 120 characters).
- Implication: Mem's suggestion is a cautious default; the partner's judgement over the words is better, and
  the facts are already in the read Ducter makes.

## 3. 你喜欢的做法 showing 62-day-old rows

- **VERIFIED.** Ducter reads `m list --unit-type preference -n 16` and keeps Mem's order; Mem answers newest
  first by `created_at`. Total preferences: 59; the newest is 2026-09-24.
- **VERIFIED.** Among the 2000 newest memories (back to 2026-09-20): 7 preferences, all 2026-09-20 to 09-24, all
  from `thread_distillation`; no `thread_distillation` memory at all after 2026-09-25. October and November:
  1280 `context`, 210 `plan`, a handful of others, no `preference`.
- **VERIFIED.** Preferences exist that the page can't show because of their type: the partner's own saves
  (`source: ducter`) are all `context`, e.g. 「GitHub 评审不想逐次确认」 (11-20), 「构建验证优先选高配置机器」
  (11-19), 「生活相关的事不用 Claude Code」 (11-18): `memory_add` passed no `--unit-type`, and Mem typed them
  context. Other agents' explicit preferences are `context` too ("Owner preference: do not trigger Bugbot
  reviews", Codex, 10-11).
- So: partly Ducter (untyped saves), partly Mem (distillation silent since 09-25; explicit preferences typed
  context).

**A note for Mem (drafted, not sent):** "Since 2026-09-25 thread distillation has produced no memories on
this account (none among the 2000 newest), and memories that state an owner preference without
`--unit-type` (e.g. 'Owner preference: do not trigger Bugbot reviews', 2026-10-11) are typed `context`, so
`m list --unit-type preference` has nothing newer than 2026-09-24."

## Implications for Ducter

- Offer an update wherever the home can run it (awake, any AI signed in), and say why where it can't; never a
  去更新 to a row with nothing to press.
- Mem's asks are bookkeeping: never a need; one quiet row; the partner's suggestion, judged by the model from
  Mem's facts, with Take the suggestions.
- `memory_add` says its kind (preference, decision, fact) so the partner's saves land where the page reads.

**Summary:** the button was gated on the row's own agent being signed in, stricter than the home; Mem's feed
already holds the words a cheap model needs to suggest better than Mem's default; the stale preferences are
Mem's silent distillation plus Ducter's untyped saves.
