# Ducter TODO

## Storage: adopt HawDB (after Bun/Node binding)

v1 stores the Log on SQLite behind an append-log port (principle 17). The port is shaped like
HawDB `strict_append`: partition, gapless commit sequence, cursor reads. Once the items below
land in HawDB, the self-hosted control plane moves to HawDB. Cloudflare keeps Durable Object
SQLite until HawDB has persistent WASM. See `research/09-hawdb-evaluation.md`.

- [ ] HawDB Bun/Node binding (blocking; owned by our team)
- [ ] Declarative FTS index on SQL / append tables
- [ ] Multi-key reads on append tables (per-window and per-persona-since-cursor without a dual write)
- [ ] Public, resumable change-feed subscription (client sync)
- [ ] Later: persistent WASM storage or `hawdb serve`; 1.0 format stability

## Runtime: no JS runtime at all (later)

The runner ships today as a compiled single binary (Node SEA). A runner with no JS runtime
at all means porting OAR's drivers to Go behind `HarnessPort`: Claude + Codex + shared core
is ~10–12k LOC, about 6–10 engineer-weeks. Do it Codex first, once OAR is near 1.0. See
`research/17`.

- [ ] Spike: run `@botiverse/oar/observe` (no `node:` imports) inside the MyGo client on
      moejs, with a `randomUUID` shim, for client-side read models
- [ ] Evaluate moejs as the client plugin host (cf. MyGo Music / mygo-plugin)

## Art assets: production export

Done: `docs/art/assets/alpha/` holds true-alpha cutouts of all 22 assets, made locally with
macOS Vision foreground segmentation (`docs/art/assets/tools/cut.swift`). Cream objects cut
cleanly. `ab_web` needed its enclosed window interior refilled from the raw image.
- [ ] Export WebP at 1×/2×/3× per the size each asset is used at in the native client
- [ ] Re-cut any regenerated asset with the same tool, and check it on a dark tile
