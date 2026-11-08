# Contributing to Ducter

Thanks for looking. Ducter is in an early, private preview, so the best contributions right now
are focused ones that someone has asked for.

## Wanted: Tailscale remote access

The first open community item is a **Tailscale remote-access adapter**: reach your Ducter
through `tailscale serve` (tailnet only) or `tailscale funnel` (public), as an alternative to
the Ducter Edge relay. The full spec, including what "done" means, is in
[`docs/roadmap.md` → Community contributions wanted](docs/roadmap.md#tailscale-remote-access-d46).
Read `research/21-v1-topology-remote-access.md` and `docs/design/system.md` first.

## Before you start

- Read [`AGENTS.md`](AGENTS.md): it explains where decisions, principles, and designs live, and
  the change loop every change goes through.
- Product words come from the glossary in
  [`docs/design/product-model.md`](docs/design/product-model.md). User-facing copy is written
  in English and Chinese together, behind i18n keys.
- Open an issue describing the change before writing a large patch.

## Working on the code

```sh
bun install
bun test                        # all packages
bun run typecheck
bun packages/cli/src/main.ts up --port 7783 --data-dir /tmp/ducter-dev
sh packages/cli/build.sh        # the single `ducter` binary (Bun 1.4.4, fetched with npx if needed)
```

Tests never make real model calls: use fake runtimes, a fake clock, and fake machines (see
`packages/cli/test/doctor.test.ts`).
