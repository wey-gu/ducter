# Ducter: Agent Guide

Ducter is an open-source, self-deployed personal AI. One named partner (the main AI) is all
the user talks to; its work runs as tasks on off-the-shelf harnesses (Claude Code, Codex,
pi via OAR). Read `motivation.md` for why it exists.

**Status: design phase.** There is no product code yet. Implementation starts only when the
"Ready to build" checklist at the end of this file is met.

## Working with the user

- **Chat in Chinese (中文).** Everything in the repo (docs, code, comments) is in English.
- **Lead with a recommendation**, not a survey of options: give the recommendation, its main
  tradeoff, and one alternative.
- **Batch the decisions.** Ask only what is genuinely the user's call. Each question carries
  a proposed default so the user can answer "按建议" (take the suggestions).
- **Think from first principles and challenge prior art.** The user wants the best design,
  not the most common one. Say plainly when evidence is thin.
- **Be honest about status:** verified vs. inferred, done vs. drafted. Never present a draft
  as settled.

## User first, always

Before designing any mechanism, screen, or flow, answer these in writing:
1. **Who** is in this moment? One of three:
   - a heavy multi-agent developer like the author;
   - a consumer personal-AI user (Grok bot, Muse) who wants the same powers with stronger
     models;
   - a fresh user who has never heard of a subagent.
2. **What they feel** before and after, and what emotional value Ducter gives them in it.
3. **How it starts:** the first time they meet this feature, with zero setup and zero
   concepts to learn.

**North star (D36):** 好用 easy · 顺滑 smooth · 赏心悦目 delightful to look at · 放心
trustworthy · 惊喜 pleasantly surprising. Check every scenario against all five.

**The original intent** (`motivation.md`): a reliable partner that reports to you and needs
your attention only when it truly matters, with full control whenever you want it. That
must hold for both kinds of user. Onboarding is a first-class scenario, not an afterthought.

## Where things live (single sources of truth)

| Layer | File | Answers | Rules |
|---|---|---|---|
| Why | `docs/principles.md` | Architecture and product principles | Conclusions only, each principle 3–5 lines, ≤ ~130 lines total, evidence cited as `[n]` |
| What | `docs/design/product-model.md` | Objects, ownership, names (glossary), scenarios | **The glossary is authoritative** for every user-facing word |
| How | `docs/design/*.md` | Mechanics (below) | One topic per file; may hold numbers, schemas, tables |
| Decided | `docs/decisions.md` | Append-only log `Dn` | Supersede, never delete |
| Later | `docs/todo.md` | Deferred work with its trigger | |
| Evidence | `research/NN-*.md`, index in `research/README.md` | Facts behind decisions | Every claim tagged VERIFIED / DOCUMENTED / INFERRED, with a source |
| Look | Prototype canvases (listed in `docs/design/ui.md`) | What it looks and moves like | They reflect the docs and never decide anything on their own |
| Coverage | `docs/design/scenarios.md` | Which scenarios have flow, copy, motion, prototype | Status per scenario |

Design notes:
- `context.md`: Log, projection, resume, working set.
- `memory.md`: digest, window, recall.
- `conversation.md`: jobs, living message.
- `focus-window.md`: brief, report, checkpoint, body selection.
- `focus-window-states.md`: the state machine.
- `system.md`: adapter, identity/Mem, safety, storage, runtime.
- `ui.md`: themes, tokens, zoom levels, canvases.
- `product-model.md`: see above.

## The change loop (run it for every new question or discovered problem)

1. **Locate.** Search `docs/decisions.md`, `docs/principles.md`, and
   `docs/design/product-model.md` first. For history, run a Nowledge Mem search:
   `nmem --json m search "<topic>" -n 5`.
2. **Gather evidence if facts are missing.** Write a numbered research report in `research/`
   (rules below) and add a line to `research/README.md`.
3. **Reason.** Start from the scenario and the user's attention, then check the principles.
   If a principle is wrong, say so; don't route around it.
4. **Propose to the user** in Chinese, as a recommendation with defaults (see above).
5. **Record.** Add a `Dn` entry to `docs/decisions.md`. Mark anything it replaces as
   `superseded by Dn` in the Superseded section.
6. **Propagate top-down** in one pass, in this order:
   1. principles, only if the change is principle-level; keep the length limits;
   2. product-model (objects, names, ownership);
   3. the relevant design note;
   4. scenarios status;
   5. prototypes;
   6. todo.

   Never leave superseded text in place as live content. Move it to the decisions log.
7. **Check consistency** before declaring done:
   - Grep for retired vocabulary (`奏章`, `准`, `驳`, `朱批`, `seal`) and for stale terms
     outside `docs/decisions.md` and `research/`.
   - Check that principle numbers cited in design notes still match.
   - Check that every user-facing word appears in the glossary.
8. **Remember.** Save each durable decision to Nowledge Mem:
   `nmem m add "<decision + why>" -t "<title>" -i 0.8`.

## Research rules

- **Number and name reports** `research/NN-topic.md`. End each with "Implications for
  Ducter" and a short summary.
- **Repos you read:** clone fresh (`git clone --depth 1`) into the session scratchpad and
  read only. Never run third-party code unless the user authorized it for that task.
- **Experiments are small and cheap.** Use the cheapest models and a scratch working
  directory. Never modify the user's config or existing sessions. Afterwards, delete only the
  `~/.claude/projects/*` folders your experiment created. Never paste secrets, emails, or
  env dumps into reports.
- **Closed-source sources** (e.g. `nowledge-co/mem`) go to `research/private/`, which is
  gitignored. Describe concepts and interfaces only, never source code.
- **Watch for stale snapshots** (e.g. `raft-source` is older than current Raft). Say so in
  the report.

## Product and design rules (summary; details in the docs)

- **Vocabulary:** partners, not hierarchy. Every word translates cleanly between zh and en,
  with no concept to learn first. i18n keys from day one, and zh + en designed together.
- **UX shape:** three zoom levels: the conversation (default), 手头 / On hand (overview and
  decisions), and an opened task (conductor depth). Silence means success. Decisions carry
  defaults.
- **Concepts are shown, not explained:** enabling a capability is game-like and visual. You see
  *where* it lives (which device or place) and *what* it does (D43).
- **Metaphors and concept visuals are held to a world-class bar.** Never derive one by loosely
  extending the visual theme. Every metaphor goes through:
  1. a candidate set of at least 5 genuinely different options, including "no metaphor"
     (beautifully literal);
  2. a full mapping table per candidate, listing every *false implication*;
  3. an explicit rubric covering legibility without labels, mapping fidelity, scale, state
     expressiveness, emotional fit, distinctiveness, and feasibility;
  4. a comprehension test with naive raters (LLM proxies first, humans later).

  Only then is it decided and prototyped. Labels always state the literal thing.
- **Theme:** Pebble by default; other themes are token sets. Components never hard-code
  colors, fonts, radii, shadows, or motion.
- **Personas:** attention aggregates per person; conversations stay separate and isolated.

## Prototype rules

- **Canvases:** each canvas covers one area; its URL is listed in `docs/design/ui.md`.
  Artboards are named by scenario or zoom level.
- **Copy** comes from the glossary. When a name changes, update every canvas in the same
  change loop.
- **Data:** prototypes use realistic content from the user's actual work, never lorem ipsum
  or invented statistics.
- **No silent decisions:** a prototype that would need a new object, state, or name goes
  back through the change loop first.

## Ready to build (all must hold before implementation starts)

- [ ] Principles reviewed end to end by the user.
- [ ] Product model has no open questions that block the first slice.
- [ ] Each scenario in the first slice has its flow, states, zh/en copy keys, and motion
      reviewed (`docs/design/scenarios.md`).
- [ ] Prototypes of the first slice reviewed.
- [ ] The client protocol (control plane ↔ desktop/mobile) is drafted.
- [ ] The first slice and its test strategy are written down: prompt snapshots, fake
      runtimes, fake clock, and a digest eval suite.
