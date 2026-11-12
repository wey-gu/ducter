# Ducter: Agent Guide

Ducter is an open-source, self-deployed personal AI. One named partner (the main AI) is all
the user talks to; its work runs as tasks on off-the-shelf harnesses (Claude Code, Codex,
pi via OAR). Read `motivation.md` for why it exists.

**Status: early preview.** The v1 slice is built (2026-11-09): the partner, tasks over OAR,
the Log, the CLI, the macOS desktop app, the phone web client, server mode and workers. What
runs, and how it was checked, is in `design/scenarios.md` and `design/roadmap.md`. Design
still leads code: every change goes through the change loop below, and the "Build state"
checklist at the end of this file says what is still open.

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

Two trees, two readers. **`design/` is for people who build Ducter** (principles, decisions,
design notes, flows, art, plans, release runbooks). **`docs/` is for people who use it**: plain
pages the website renders at `/docs`, written from the user's side in glossary words, with no
decision numbers, internal names or unbuilt features. Never put builder material in `docs/`.

| Layer | File | Answers | Rules |
|---|---|---|---|
| Why | `design/principles.md` | Architecture and product principles | Conclusions only, each principle 3–5 lines, ≤ ~130 lines total, evidence cited as `[n]` |
| What | `design/product-model.md` | Objects, ownership, names (glossary), scenarios | **The glossary is authoritative** for every user-facing word |
| How | `design/*.md` | Mechanics (below) | One topic per file; may hold numbers, schemas, tables |
| Decided | `design/decisions.md` | Append-only log `Dn` | Supersede, never delete |
| Later | `design/todo.md` | Deferred work with its trigger | |
| Evidence | `research/NN-*.md`, index in `research/README.md` | Facts behind decisions | Every claim tagged VERIFIED / DOCUMENTED / INFERRED, with a source |
| Look | Prototype canvases (listed in `design/ui.md`) | What it looks and moves like | They reflect the docs and never decide anything on their own |
| Coverage | `design/scenarios.md` | Which scenarios have flow, copy, motion, prototype | Status per scenario |
| Ship | `design/release/`, `design/build-and-run.md` | Building, releasing, the full command reference | Maintainer runbooks |
| Use | `docs/*.md` (index `docs/README.md`) | How to install and use Ducter | User words only; says "coming soon" for anything not built; front matter `title`, `description`, `order` |

Design notes:
- `context.md`: Log, projection, resume, working set.
- `memory.md`: digest, window, recall.
- `conversation.md`: jobs, living message.
- `focus-window.md`: brief, report, checkpoint, body selection.
- `focus-window-states.md`: the state machine.
- `system.md`: adapter, identity/Mem, safety, storage, runtime.
- `ui.md`: themes, tokens, zoom levels, canvases.
- `bridge.md`: Nowledge Bridge, agents Ducter didn't start (draft).
- `where.md`: which computer a task runs on, said and changed with who (D157).
- `workbench.md`: the opened task's workbench: changes, files, preview, screens (D214).
- `media.md`: pictures and files both ways, the viewer, drawing (D206).
- `autofill.md`: saved sign-ins, cards and details, filled by reference; the Pay card (D191).
- `calendar.md`: every calendar account as one day; the day card, change cards behind Go (D222).
- `android.md`: the Android app, its self-update and foldable layout (D178–D182).
- `phone-use.md`: 用手机 / Use a phone, Ducter's own Android phone on a Mac (D217).
- `product-model.md`: see above.

## The change loop (run it for every new question or discovered problem)

1. **Locate.** Search `design/decisions.md`, `design/principles.md`, and
   `design/product-model.md` first. For history, run a Nowledge Mem search:
   `nmem --json m search "<topic>" -n 5`.
2. **Gather evidence if facts are missing.** Write a numbered research report in `research/`
   (rules below) and add a line to `research/README.md`.
3. **Reason.** Start from the scenario and the user's attention, then check the principles.
   If a principle is wrong, say so; don't route around it.
4. **Propose to the user** in Chinese, as a recommendation with defaults (see above).
5. **Record.** Add a `Dn` entry to `design/decisions.md`. Mark anything it replaces as
   `superseded by Dn` in the Superseded section.
6. **Propagate top-down** in one pass, in this order:
   1. principles, only if the change is principle-level; keep the length limits;
   2. product-model (objects, names, ownership);
   3. the relevant design note;
   4. scenarios status;
   5. prototypes;
   6. user docs (`docs/`), if what a user sees or does changed;
   7. todo.

   Never leave superseded text in place as live content. Move it to the decisions log.
7. **Check consistency** before declaring done:
   - Grep for retired vocabulary (`奏章`, `准`, `驳`, `朱批`, `seal`) and for stale terms
     outside `design/decisions.md` and `research/`.
   - Check that principle numbers cited in design notes still match.
   - Check that every user-facing word appears in the glossary.
   - Run `bun scripts/check-links.ts`: every relative Markdown link resolves.
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
- **UX shape:** three zoom levels: the conversation (default), 手头的事 / On hand (overview and
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

## Engineering discipline

- **Git holds source, not evidence (D75).** Commit a binary only if an app loads it or a build
  derives from it (≤ 2 MB). Screenshots, before/after pairs, recordings, raw generations and
  build output go to `.shots/` (gitignored; `DUCTER_SHOTS_DIR` overrides) and are shown as a
  published gallery; Markdown cites them by file name. `bun scripts/check-binaries.ts` runs in CI.
- Stage explicit paths; never `git add -A`. Check the fail count, not only the totals, before
  committing.
- **A persona or partner-tool change carries a fresh eval result (D175).** Changing
  `packages/partner/src/persona.ts` or any partner tool's name or description means running
  `bun run eval:partner --model haiku` (about $1) and committing its results file and
  `packages/partner/eval/results/LATEST.json` in the same change. `tool-budget.test.ts` fails
  until you do. Add a scenario when the change adds behaviour the eval doesn't cover.

## Prototype rules

- **Canvases:** each canvas covers one area; its URL is listed in `design/ui.md`.
  Artboards are named by scenario or zoom level.
- **Copy** comes from the glossary. When a name changes, update every canvas in the same
  change loop.
- **Data:** prototypes use realistic content from the user's actual work, never lorem ipsum
  or invented statistics.
- **No silent decisions:** a prototype that would need a new object, state, or name goes
  back through the change loop first.

## Build state

The v1 slice was built before every design item below was reviewed. Close these before
calling v1 done; new work must not widen the gap.

- [x] The client protocol (control plane ↔ desktop/mobile) is written (`packages/protocol`).
- [x] The first slice and its test strategy exist: fake runtimes, a fake clock, fake
      machines, and the partner eval with a real model (`packages/partner/eval`).
- [ ] Principles reviewed end to end by the user.
- [ ] Product model has no open questions that block the first slice
      (`design/flows/OPEN-QUESTIONS.md`).
- [ ] Each scenario in the first slice has its flow, states, zh/en copy keys, and motion
      reviewed (`design/scenarios.md`).
- [ ] Prototypes of the first slice reviewed.
- [x] The memory digest (`design/memory.md`) is built, with its eval suite (`research/15`)
      (D123, draft for review; the eval corpus is small, a real-channel replay is in `todo.md`).
- [ ] Connectors (accounts through oo or OpenConnector): live checks per `design/roadmap.md`.
- [ ] Nowledge Bridge: the live trial against Mem (`design/bridge.md`, `design/roadmap.md`).
- [ ] Devices: the Isles view on the phone, and the native browser's live checks (`design/roadmap.md`).
- [ ] Release: the first tagged release end to end, and the iPhone app public
      (`design/release/`, `design/roadmap.md`).
