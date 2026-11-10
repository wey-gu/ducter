// Preloaded by every `bun test` run (bunfig.toml). bunfig's own `[test] timeout` is not applied by
// the Bun versions we use (tests still stopped at 5 s, 2026-11-11), so the default is set here.
// Many tests spawn real processes, sockets and fake clocks stepped with real awaits; on a loaded
// machine 5 s flakes. 20 s still catches a real hang.
import { setDefaultTimeout } from "bun:test";

setDefaultTimeout(20_000);
