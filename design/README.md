# Ducter design

This folder is for people who build Ducter. Ducter's design is written down before its code:
start with the principles, then read the design note for the area you care about. Words used
in the product are defined in the glossary in [`product-model.md`](product-model.md).

The guide for people who *use* Ducter is in [`../docs/`](../docs/README.md); the website
renders it at `/docs`.

## Start here

- [`../motivation.md`](../motivation.md): why Ducter exists.
- [`principles.md`](principles.md): the architecture and product principles, as conclusions.
- [`product-model.md`](product-model.md): the objects, who owns what, the
  glossary, and the scenario catalog.
- [`build-and-run.md`](build-and-run.md): building the Mac app and the bundles, every
  command and option, and running Ducter on a Linux server.
- [`roadmap.md`](roadmap.md): what is built, what is next, and what we'd love help with.

## Design notes

| Note | What it covers |
|---|---|
| [`context.md`](context.md) | The Log, how each model call is projected from it, resume, the working set |
| [`memory.md`](memory.md) | The partner's memory: digest, recent window, recall |
| [`conversation.md`](conversation.md) | The conversation surface: jobs and the living message |
| [`focus-window.md`](focus-window.md) | Tasks: brief, report, checkpoint, where they run |
| [`focus-window-states.md`](focus-window-states.md) | The task state machine |
| [`system.md`](system.md) | Harness adapter, identity and Mem, safety and trust, storage, server mode, workers |
| [`onboarding.md`](onboarding.md) | The first five minutes, on a Mac and on a server |
| [`ui.md`](ui.md) | Themes, tokens, zoom levels, the visual language |
| [`glossary-review-2026-11-09.md`](glossary-review-2026-11-09.md) | Why each shown word is worded the way it is (D66) |
| [`scenarios.md`](scenarios.md) | Which scenarios are designed and built, and how they were checked |
| [`flows/`](flows/) | Step-by-step flows by area (setup, kinds of work, decisions, steering, safety, results) and the open questions |

"Focus Window" is the design-time name of what the product calls a **task**.

## Records

- [`decisions.md`](decisions.md): the append-only decision log (`D1`, `D2`, …). Decisions are
  superseded, never deleted.
- [`todo.md`](todo.md): deferred work, each item with what will trigger it.
- [`plan/`](plan/): build plans and test-run write-ups.
- [`release/`](release/README.md): how a release is cut (the `v*` tag pipeline, signing,
  notarization, secrets) and the iPhone app's TestFlight setup ([`release/ios.md`](release/ios.md)).
- [`art/`](art/): the clay character and device art, with the prompts that made them.
- Screenshots and before/after pairs are work evidence, not source: tools write them to `.shots/` (gitignored), and reviews are published as galleries (D75).
- [`../research/`](../research/README.md): the numbered research reports behind the decisions.
  Every claim is tagged as verified, documented or inferred, with its source.
