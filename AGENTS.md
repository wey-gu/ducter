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
- `offline.md`: the web and phone client through a drop: the last screen readable, an outbox on the device, the app shell, a socket that proves itself, what waits and what asks again (D543).
- `ui.md`: themes, tokens, zoom levels, canvases.
- `bridge.md`: Nowledge Bridge, agents Ducter didn't start (draft).
- `where.md`: which computer a task runs on, said and changed with who (D157).
- `workbench.md`: the opened task's workbench: changes, files, preview, screens (D214).
- `media.md`: pictures and files both ways, the viewer, drawing (D206).
- `device-signin.md`: 登录 {service} / Sign in with a one-time code: a task's sign-in page and code on a card with Open and Copy, seen through by the CLI's own check; every ask's links and codes real (D599).
- `autofill.md`: saved sign-ins, cards and details, filled by reference; the Pay card (D191).
- `errand.md`: 跑腿到付款 / an errand to the checkout: one task in Ducter's own window, a step handed over live, 去付款 / Go to checkout, the person's own tap pays (D436).
- `calendar.md`: every calendar account as one day; the day card, change cards behind Go (D222).
- `android.md`: the Android app, its self-update and foldable layout (D178–D182).
- `phone-use.md`: 用手机 / Use a phone, Ducter's own Android phone on a Mac (D217; a worker Mac's, D234).
- `use-this-phone.md`: 用这台手机 / Use this phone, a task borrows the person's own Android phone (D238).
- `computer-use.md`: 用电脑 / Use the computer, tasks in the person's Mac apps (D235).
- `on-hand.md`: 任务 / Tasks, the conductor surface: projects as a lens, the strip, the folds (D261).
- `past.md`: 做过的事 / Past tasks and 一直在跑的 / Ongoing: finding, marking, continuing, pausing (D285).
- `mentions.md`: @ and / in the composers: referring to a task, file, partner or PR; Ducter's actions, the person's skills and each agent's own commands that really reach it (D534).
- `sessions.md`: every task open: ⌘K 找什么都行 / Find anything, where a task stopped, its steps, a new task from any step, and the partner's task_find / task_fork (D391).
- `imessage.md`: the partner in iMessage through the Mac app: chat.db, AppleScript, identity, pairing (D277).
- `task-sources.md`: 待办来源 / To-do sources, the person's GitHub issues and Obsidian Tasks bound to tasks: who owns which field, offered never started, writing back behind a Go (D341).
- `settings.md`: Settings pane by pane: who is in each, the flows walked, the shared pieces and the partner's word after a change (D296).
- `voice.md`: hold to talk and read aloud, each platform's own speech, the app bridge (D305).
- `channels.md`: 聊天软件 / Chat apps, the partner in the person's own Telegram bot, Slack app and WeChat ClawBot as more windows on the one conversation (D276, D301).
- `personas.md`: 伙伴们 / Your partners, a second partner: what is shared and what is its own, one needs-you count, the switch, its stone (D309, preview).
- `did.md`: 替你做过的 / Done for you, every outward action on the person's behalf, day by day (D300).
- `made.md`: 给你做的 / Made for you, what Ducter made found again: asked for, or browsed in Past tasks (D383).
- `apps.md`: 小应用 / Apps, small apps the partner makes from one sentence: kept on the home, sandboxed, changed by talking, asking the partner from inside (D405); their place 你的小应用 / Your apps, the kit, apps that open already filled (D410).
- `documents.md`: 拿去就能发 / Ready to send, a document the person will send held to a bar, checked page by page, an Office file read as its pages (D439).
- `standing-work.md`: 看守中 / Looking after, one object for work Ducter keeps on: helpers, routines, loops and babysits as a Keep with wakes, a judged goal, held items, rounds, asks, rules; its sheet on On hand and its own page (D511, built: phases 1–3).
- `move.md`: moving Ducter to another computer with nothing lost: what goes, what is redone and why, what follows the new address, work under way, the Mem/Bridge handover, cut-over and the way back; `ducter move --plan` first (D504).
- `tidy.md`: 整理工作副本 / tidying the working copies Ducter made: the keep-rules, the windows (finished 3 days, dropped 7) from hel's Log, `git worktree remove` only, the quiet line, `ducter worktrees` (D514).
- `self-repair.md`: what fails (task starts, mid-run, finish, the partner, state), the ladder Ducter climbs by itself within budgets, the partner as the judgment rung, the person once; `ducter repairs` (D473).
- `handover.md`: handing over several to-dos: one sheet with a note and a shape, a group on Go, plan first for a subject, review together (D385, built).
- `positioning.md`: what Ducter is in one line and one paragraph, zh and en: a personal AI for builders, on your own computers or servers; the GitHub description (D414).
- `site.md`: the website (ducter.ai): the landing page, `/download`, the docs' rendering, and what's owed (D319).
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
- **UX shape:** three zoom levels: the conversation (default), 任务 / Tasks (overview and
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

## The UI bar (every change a person can see)

Ducter's look is one strong, consistent style: clay, warm, game-like smooth, full of
情绪价值. Iterating fast has let screens ship that were not up to it: an ad-hoc send button, a
rail running under the traffic lights, a system tooltip, a sidebar that blinks out on a switch.
Speed never excuses that. Every change a person can see clears this bar before it merges:

1. **Load `.claude/skills/ducter-ui/SKILL.md` before touching a view.** It holds the reading
   list, the checklist and the review protocol below in full.
2. **Read the sources first:** `design/ui.md` (tokens, scales, Depth, Buttons, Shared controls
   D161, One menu D421, motion D290, Art direction D53) and the approved style artifacts. Copy
   an existing screen's patterns, never invent a new look for one view.
3. **Only shared controls.** A button, field, composer, chip, row, menu, tooltip or chevron
   comes from the D161 set (Mac `views/components.go` and friends, web `controls.tsx`). A
   missing one is added to the set and to ui.md's table first. The guards are deny-by-default.
4. **Walk the checklist** in the skill on every surface you touch: window chrome and edges,
   alignment and rhythm, every state, motion, both themes, both languages at real lengths,
   every width from 320 to 1400, keyboard and reduced motion.
5. **Self-critique, then show.** Shots go to `.shots/<topic>/`: before and after, 2x crops of
   corners and edges, the states and the transitions as frames. Critique them yourself with the
   design skills (`impeccable` critique and polish, `kill-ai-slop`, `design-review`;
   `ios-design-review` for the phone) and fix what they find before you report.
6. **The lead reviews every shot before a merge** and rejects anything below the bar, however
   small. "CI is green" is never "done" for a visible change.

## Engineering discipline

- **Git holds source, not evidence (D75).** Commit a binary only if an app loads it or a build
  derives from it (≤ 2 MB). Screenshots, before/after pairs, recordings, raw generations and
  build output go to `.shots/` (gitignored; `DUCTER_SHOTS_DIR` overrides) and are shown as a
  published gallery; Markdown cites them by file name. `bun scripts/check-binaries.ts` runs in CI.
- Stage explicit paths; never `git add -A`. Check the fail count, not only the totals, before
  committing.
- **A persona or partner-tool change carries a fresh eval result (D175).** Changing
  `packages/partner/src/persona.ts` or any partner tool's name or description means running
  `bun run eval:partner --model haiku --against latest` (about $1; D574: code counts lines and
  sentences, and scenarios that disagree with the last run are run twice more before they count)
  and committing its results file and `packages/partner/eval/results/LATEST.json` in the same
  change; LATEST.json's `file` must name a results file that exists. `tool-budget.test.ts` fails
  until you do. Read the result's Regressions, not the total: a single run's total moves by ten
  or more on the same code. Add a scenario when the change adds behaviour the eval doesn't cover.

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
