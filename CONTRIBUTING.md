# Contributing to Ducter

Thanks for looking. Ducter is an early preview with a small team, so focused contributions
that start from an issue work best.

## How Ducter is made

Ducter writes its design down before its code, and every change goes through the same loop:
find the relevant decision and principle, gather evidence if facts are missing, propose,
record the decision, then update the docs from the top down. [`AGENTS.md`](AGENTS.md)
describes the loop and where everything lives; it is written for AI agents and humans alike.

A few rules that matter for almost any change:

- **Start from the person.** Who is in this moment (a heavy multi-agent developer, a
  personal-AI user, or someone who has never heard of a subagent), what they feel before and
  after, and how they first meet the feature.
- **Words come from the glossary** in
  [`design/product-model.md`](design/product-model.md). A new user-facing word or
  object needs a decision first.
- **Copy is bilingual.** User-facing text is written in English and Chinese together, behind
  i18n keys (`packages/cli/src/i18n.ts`, `apps/desktop/internal/i18n`).
- **Themes are tokens.** Components never hard-code colors, fonts, radii, shadows or motion.

## Before you start

- For anything larger than a small fix, open an issue (or comment on one) describing the
  change before writing the patch.
- Wanted now: a **Tailscale remote-access adapter**, so you can reach your Ducter through
  `tailscale serve` or `tailscale funnel`. The spec, including what "done" means, is in
  [`design/roadmap.md`](design/roadmap.md#tailscale-remote-access-d46).

## Working on the code

You need [Bun](https://bun.sh) and, for the desktop app, [Go](https://go.dev).

```sh
bun install
bun test                        # all packages
bun run typecheck               # both TypeScript configs
bun packages/cli/src/main.ts up --port 7783 --data-dir /tmp/ducter-dev
sh packages/cli/build.sh        # the single `ducter` binary

cd apps/desktop
go build ./... && go vet ./... && go test ./...
DUCTER_SHOTS=1 go test ./internal/views -run Welcome   # re-render screenshots into apps/desktop/docs
```

Layout: `packages/core` (the main process, the Log, the server), `packages/partner` (the
partner's loop, prompts and its eval), `packages/runner` (tasks over OAR), `packages/cli`
(`ducter`), `packages/protocol` (the client protocol), `apps/desktop` (the MyGo desktop
app) and `apps/web` (the phone client).

Docs live in two places: [`design/`](design/README.md) is for people who build Ducter
(principles, decisions, design notes, release runbooks), and [`docs/`](docs/README.md) is the
user guide the website renders at `/docs`. If a change alters what a user sees or does, update
the page in `docs/` too, in plain words and without decision numbers. `bun scripts/check-links.ts`
checks that every relative link resolves.

Tests never make real model calls: use fake runtimes, a fake clock and fake machines (see
`packages/cli/test/doctor.test.ts`). The partner eval (`bun run eval:partner`) does call a
real model and is run by hand.

## Pull requests

- Keep each PR to one change, with tests.
- Fill in the template: what it's for, any design change, and how you checked it.
- Screenshots and eval results use demo content (`~/dev/foo`, example.com). Please don't
  commit your own paths, hostnames or repo names.

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), and you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
