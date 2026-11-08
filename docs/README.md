# Ducter docs

Ducter's design is written down before its code. Start with the principles, then read the
design note for the area you care about. Words used in the product are defined in the glossary
in `design/product-model.md`.

## Start here

- [`../motivation.md`](../motivation.md): why Ducter exists.
- [`principles.md`](principles.md): the architecture and product principles, as conclusions.
- [`design/product-model.md`](design/product-model.md): the objects, who owns what, the
  glossary, and the scenario catalog.
- [`install.md`](install.md): building, installing and running Ducter on a Mac or a server.
- [`roadmap.md`](roadmap.md): what is built, what is next, and what we'd love help with.

## Design notes (`design/`)

| Note | What it covers |
|---|---|
| [`context.md`](design/context.md) | The Log, how each model call is projected from it, resume, the working set |
| [`memory.md`](design/memory.md) | The partner's memory: digest, recent window, recall |
| [`conversation.md`](design/conversation.md) | The conversation surface: jobs and the living message |
| [`focus-window.md`](design/focus-window.md) | Tasks: brief, report, checkpoint, where they run |
| [`focus-window-states.md`](design/focus-window-states.md) | The task state machine |
| [`system.md`](design/system.md) | Harness adapter, identity and Mem, safety and trust, storage, server mode, workers |
| [`onboarding.md`](design/onboarding.md) | The first five minutes, on a Mac and on a server |
| [`ui.md`](design/ui.md) | Themes, tokens, zoom levels, the visual language |
| [`scenarios.md`](design/scenarios.md) | Which scenarios are designed and built, and how they were checked |
| [`flows/`](design/flows/) | Step-by-step flows by area (setup, kinds of work, decisions, steering, safety, results) and the open questions |

"Focus Window" is the design-time name of what the product calls a **task**.

## Records

- [`decisions.md`](decisions.md): the append-only decision log (`D1`, `D2`, …). Decisions are
  superseded, never deleted.
- [`todo.md`](todo.md): deferred work, each item with what will trigger it.
- [`plan/`](plan/): build plans and test-run write-ups.
- [`../research/`](../research/README.md): the numbered research reports behind the decisions.
  Every claim is tagged as verified, documented or inferred, with its source.
