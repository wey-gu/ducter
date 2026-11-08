# 18 — Runner as one binary: OAR under `bun --compile` vs Node SEA (spike)

Date: 2026-11-08. Time-boxed spike that follows `research/17` §4. Everything below was **executed** on macOS arm64
(Darwin 24.6) unless marked [I].

Code: `<scratch>`
(`runner.ts`, `build.sh`, `sea-config.json`, `out/`). OAR is `@botiverse/oar@0.95.1` from npm, imported from the
**root entry** (all 11 default runtimes, pi SDK, ACP SDK), which is the hardest case to bundle.

## What the runner does
- `runner discover`:
  - Fixes up the env: sets `SHELL`/`USER` if missing.
  - Calls `userShellEnvironment({ command: process.execPath, args: ["shell-env-capture"] })` to recover the user's
    login-shell PATH.
  - For every runtime in `defaultRuntimes`, runs `installation({env})`. For claude and codex (and pi with
    `RUNNER_DEEP=pi`) it also runs `authStatus` and `listModels`.
- `runner live`: discovery, then one Claude Code session (`model: "haiku"`, temp cwd) with the prompt
  "Reply with exactly: OK". It prints the normalized `session.events()` stream, then `dispose()`s. Afterwards it
  deletes only that temp cwd's `~/.claude/projects/<slug>` folder. Codex was not started live, because its
  threads persist under `~/.codex/sessions` and the spike must not modify `~/.codex`.
- `runner shell-env-capture <marker>`: the host subcommand that OAR needs from a compiled host. It calls
  `writeShellEnvironmentCapture(marker)` and lets stdout drain; it must not call `process.exit()`.

## Commands
```sh
# a. Bun (1.4.4 pulled locally via `npm i bun@1.4.4`; the global bun 1.3.1 fails, see issue 1)
bun build --compile runner.ts --outfile out/runner-bun144
bun build --compile --target=bun-linux-x64 runner.ts --outfile out/runner-bun144-linux-x64
# b. Node SEA (Node 26 one-step --build-sea; official nodejs.org binary, see issue 3)
npx esbuild runner.ts --bundle --platform=node --format=esm --target=node24 --outfile=out/runner.mjs \
  --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"
node-official --build-sea sea-config.json   # {"main":"out/runner.mjs","mainFormat":"module","output":"out/runner-sea",...}
codesign --sign - --force out/runner-sea
# test (from another dir, no node/bun on PATH, no SHELL/USER)
cd ../elsewhere && env -i PATH=/usr/bin:/bin HOME=$HOME ../spike-runner/out/<bin> discover|live
```

## Results
| | bun 1.3.1 `--compile` | **bun 1.4.4 `--compile`** | **Node 26.12.1 SEA** |
|---|---|---|---|
| Build time (warm) | 0.5 s | 0.5-0.9 s | esbuild 5-7 s + `--build-sea` 3.6 s + codesign 0.2 s |
| Binary size (raw / gzip) | 76 MB | **103 MB / 44 MB** | **165 MB / 48 MB** (the official `node` alone is 147 MB) |
| Cross-target build | n/a | linux-x64 in 16 s (downloads the runtime once); 123 MB ELF | needs the target's official node binary + `--build-sea` per target [I, not run] |
| Cold start (`shell-env-capture`) | n/a | ~0.2 s | ~0.3 s |
| Starts | **no**: `SyntaxError: Export named 'getSystemErrorMap' not found in module 'node:util'` | yes | yes (only after codesign; unsigned = SIGKILL, rc 137) |
| Shell-env capture via own subcommand | n/a | ok (`changed=PATH`) | ok (`changed=PATH`) |
| Discovery under `env -i` | n/a | claude 2.1.319, codex 0.167.0, grok, kimi, opencode, pi (bundled) found; claude+codex `logged_in`; models 13 / 8 | identical |
| Pi in-process `listModels` (SDK loaded inside the binary) | n/a | works (46 models with full env) | works (46 models) |
| Live Claude session, haiku, "OK" | n/a | **ok**: `turn_started … model claude-haiku-5-5 … text_delta "OK" … turn_ended completed … exited`; ~12 s turn | **ok**, same event sequence; ~9 s turn |
| Cleanup | | `~/.claude/projects/-private-tmp-ducter-spike-*` removed; 0 left | same |

Baseline: `node runner.ts` (Node 26 strips TS natively) produced the same discovery and live output, which confirms
the binaries add no behavior change.

## Incompatibilities and minimal fixes
1. **Bun < 1.4 cannot load OAR's root entry.** `runtimes/kimi/oauth-token.js` imports `getSystemErrorMap` from
   `node:util`, and Bun 1.3.1 lacks it. **Fix:** pin Bun ≥ 1.4.4 in CI (`npm i -D bun@1.4.4` works, so it needs no
   global install). The alternative is to import only `@botiverse/oar/runtimes/{claude,codex}`; that is untested
   here, and `userShellEnvironment` is exported only from the root entry. OAR has no Bun CI, so expect more of
   these.
2. **The compiled host must supply the shell-env capture subcommand.** Otherwise OAR throws `no_node_runtime`.
   **Fix:** route `argv[2] === "shell-env-capture"` to `writeShellEnvironmentCapture(argv.at(-1))` before any
   other init, and do not call `process.exit` (let stdout drain). User args start at `argv[2]` on both hosts:
   Bun gives `[bun, /$bunfs/root/x, …]` and SEA gives `[exe, exe, …]`.
3. **Homebrew's node has SEA disabled** ("Single executable application is disabled"). **Fix:** build with the
   official nodejs.org binary (shasum-verified tarball), pinned in CI per target OS/arch.
4. **macOS SEA must be re-signed** after injection, or the kernel kills it (rc 137). **Fix:**
   `codesign --sign - --force`. For distribution, sign with a Developer ID and notarize; that applies to Bun too [I].
5. **Bun's `os.userInfo()` reads `$SHELL`/`$USER`** and returns `"unknown"` when they are unset (Node uses getpwuid).
   Under launchd or `env -i`, OAR then gets `SHELL` unset and capture fails (`shell_unavailable`). **Fix:** if
   `SHELL` is missing or not absolute, fall back to `/bin/zsh` (darwin) or `/bin/sh` (linux); a real daemon should
   read `dscl`/`getent` [I].
6. **Claude reports `logged_out` without `USER`.** The keychain lookup needs it. This happens on both hosts and
   with plain node, so it comes from the env, not the binary. **Fix:** set `USER`/`LOGNAME` from
   `userInfo().username` or `/usr/bin/id -un` before probing. Launchd LaunchAgents normally set USER [I].
7. **In-process Pi reads the host `process.env`, not the `env` overlay.** Under `env -i` it saw only 1 provider
   model; with the shell env applied it saw 46. **Fix:** for in-process Pi, merge the captured shell env into
   `process.env` at runner start, or use Pi `execution: "subprocess", command: <pi binary>` (research/17). Pi RPC's
   default `process.execPath + rpc-entry` would re-enter the runner binary [I, from source; not run].
8. **SEA needs a pre-bundled single ESM file.** esbuild handled everything: 17.3 MB, no external modules, and the
   `createRequire` banner covers CJS deps' `require("node:*")`. The four `import.meta.resolve(...)` sites (pi
   rpc-entry, cursor SDK) stay in the bundle; they are fine for the runtimes we use, but cursor stays out (native
   companion).
9. **Flake seen once (Node bundle, not reproduced):** one `node out/runner.mjs discover` run timed out every child
   spawn (shell capture, `claude --version`, `codex app-server --help`) at 15 s. Three later runs, and all binary
   runs, were clean. I suspect host load from parallel builds [I]. Keep the 15 s probe timeouts and surface them
   as `unknown`, not as fatal.
10. **Security note:** the capture subcommand prints the full environment, including secrets, to stdout by design.
    Never expose it as a user-facing command, and never log the child's output.

Not tested: Linux runtime behavior of either binary, Windows (OAR's `userShellEnvironment` refuses win32), Codex
live session, MCP `serveMcpTools` HTTP server inside the binary, and OAR's sea-trial/aimock suites against the
binaries.

## Recommendation for the sprint
**Ship tonight with `bun build --compile` (Bun pinned to 1.4.4).** Keep a Node SEA job as the fallback and
canary, and do not delete it.
- Both binaries passed the same end-to-end bar: discovery plus a live Claude turn from a foreign cwd with no
  node/bun on PATH. Neither is blocked.
- Bun wins on sprint ergonomics:
  - one command;
  - sub-second builds;
  - native cross-compile to linux-x64/arm64 from one Mac (the runner must run on Linux boxes);
  - ~40% smaller raw binary (103 vs 165 MB; similar gzipped, 44 vs 48 MB);
  - no codesign dance for local dev.
- SEA's advantage is the engine match with OAR's CI (`engines: node >=24`). Issue 1 shows that this is a real
  risk on Bun. Mitigate it with a CI step that runs `runner discover` plus a scripted-runtime session
  (`@botiverse/oar/testing`) on **both** binaries per OAR pin bump. Switch to SEA as soon as Bun shows a semantic
  difference that cannot be fixed in a line.
- Required runner code for either host: the issue 2 subcommand, the issue 5/6 env fix-ups, and issue 7 (merge the
  shell env into `process.env`, or Pi as a subprocess). Exclude cursor.
