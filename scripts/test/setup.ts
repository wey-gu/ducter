// Preloaded by every `bun test` run (bunfig.toml).
//
// The 20 s per-test timeout comes from the command line: `bun run test` is `bun test --timeout
// 20000`, and CI runs that. Neither bunfig's `[test] timeout` nor a setDefaultTimeout here reaches
// every file: Bun (1.3.1 and 1.4.4, checked 2026-11-19) applies a preload's setDefaultTimeout to
// the first test file it runs and gives every later file its 5 s default again, so under load the
// files that ran later timed out at 5 s (31 of 39 failures in one loaded full run). Many tests
// spawn real processes and sockets, or step fake clocks with real awaits; 20 s still catches a real
// hang. The call below keeps a single file run with plain `bun test <file>` at 20 s too.
// scripts/test-timeout.test.ts keeps the flag where it must be.
import { setDefaultTimeout } from "bun:test";

setDefaultTimeout(20_000);
