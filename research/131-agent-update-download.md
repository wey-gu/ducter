# 130: why updating Codex from npm sits silent, and a watched path that keeps npm (D362)

*2026-11-18. The author on the Mac app 0.0.77, Settings › 更新和关于 › 正在全部更新: "MacBook Pro M3
上的 Codex 0.169.1 → 0.170.0 正在更新到 0.170.0…" sat a long time while the same step on Hetzner
finished quickly; it did end. On that Mac Codex is a Homebrew-node npm global
(`/opt/homebrew/bin/codex → ../lib/node_modules/@openai/codex/bin/codex.js`). Number taken as the
next free one; a branch in flight may hold it: may need renumbering at merge.*

All runs below went into scratch prefixes and scratch caches in the session's scratchpad
(`npm install -g --prefix <scratch> --cache <scratch>`); nothing under `/opt/homebrew`, `~/.npm`,
`~/.codex` or `~/.ducter` was touched. npm 11.20.0, node from Homebrew, macOS arm64, the same
network as the author's Mac (Asia, +08).

## 1. What runs

VERIFIED (code, `packages/core/src/agents.ts` before D362). For `how: "npm"` the worker runs
`/opt/homebrew/bin/npm --prefix /opt/homebrew install -g @openai/codex@0.170.0` through
`realSys.run`, which buffers stdout and stderr to the end, with a 10 min kill. The row says
`agentv.phase.updating` (**正在更新到 0.170.0…**) from the start of that run to its end; no
other frame is sent.

## 2. What npm fetches

VERIFIED (`npm view`, registry headers, the cache after a run):

| What | Size | Note |
|---|---|---|
| `@openai/codex@0.170.0` | 13.6 KB unpacked | a launcher; the binary is an optional dependency |
| `optionalDependencies` | `@openai/codex-darwin-arm64: npm:@openai/codex@0.170.0-darwin-arm64` (and five other platforms) | an alias to a version of the same package |
| `codex-0.170.0-darwin-arm64.tgz` | **154,915,137 bytes** (380 MB unpacked; 0.169.1: 377 MB) | sha512 `sQyOGJab…`, the registry's `dist.integrity` |
| the packument npm reads | **19.5 MB** (`accept: application/json`, the full document; the abbreviated one is 5.7 MB) | cached with `max-age=300` |

Each version is a new 155 MB tarball: npm's cache holds the old version's, which never helps the
next. GitHub's release has the same binary as `codex-aarch64-apple-darwin.tar.gz` (114.5 MB) and
`.zst` (81.8 MB); using it would mean installing Codex some other way than the person did.

## 3. Timings

VERIFIED, cold cache, `npm install -g --prefix p1 --cache c1 @openai/codex@0.170.0`:
**747 s (12.5 min), user 6 s**: almost all of it waiting on the network (~200 KB/s here; a 5 MB
range read of the tarball alone ran at 137 KB/s while npm ran beside it). Watching the cache: the
packument landed first, then `_cacache/tmp` grew by ~3 MB every 10 s; extraction streams with the
download.

VERIFIED, the same install again from a warm cache: `--prefer-offline` **12.5 s**, without it
**14.3 s** ("changed 2 packages"). So the install proper is seconds; the minutes are bytes.

A 10 min limit would have killed this run at 600 s with nothing said but `unchanged` (the version
read back would still be 0.169.1). INFERRED: the author's line was faster (it finished), and
Hetzner's datacenter link fetches 175 MB in seconds, hence the contrast.

## 4. A path that keeps npm, and can be watched

VERIFIED, three steps into a fresh scratch cache `c5` and prefix `p5`:

1. the tarball (here copied from `c1`; in Ducter, downloaded with a byte count) → `npm cache add
   <file>.tgz --cache c5`: **2.9 s**;
2. `npm cache add @openai/codex@0.170.0 --cache c5` (the packument and the 13 KB launcher):
   **21.4 s** here;
3. `npm install -g --prefix p5 --cache c5 --offline --no-audit --no-fund @openai/codex@0.170.0`:
   **3.1 s**, "added 2 packages"; `p5/bin/codex --version` → `codex-cli 0.170.0`.

`--offline` proves npm took the platform tarball from the cache: cacache keeps content by its
sha512, which is what the install asks for (the packument's `integrity`), whatever URL or file it
came in from. The same held for esbuild 0.24.0 and `@esbuild/darwin-arm64` (a separate package,
not an alias; `--offline` worked but took 39 s, INFERRED a missing packument retried).

So Ducter can: download the tarball itself, from the registry npm uses (`npm config get registry`:
a mirror in `.npmrc` stays in use) with `got` / `size` and a stall limit, cache it with `npm cache
add`, cache the package's metadata beside it, then run the same `npm install -g` with
`--prefer-offline` (not `--offline`: anything missing still comes from the network). npm still
installs Codex, into the same prefix; nothing about the person's install changes.

Not faster in bytes: there is no smaller payload that npm accepts. What changes is what the person
sees, that the long part happens before anything is held or touched (the agent keeps working, a
stop is clean), and that a slow line is said instead of guessed at.

Not covered: an `.npmrc` with a registry token or a proxy only npm knows (`proxy=`, `https-proxy=`):
Ducter's own fetch would fail or be refused and the update falls back to npm's own download
(unseen, the elapsed time shown). Bun's fetch honours `HTTPS_PROXY` from the environment.

## Implications for Ducter

- Where harness-facts names the binary's tarball (`channels.npmBlob`, Codex today), fetch it first
  with progress, then install from npm's cache; the hold covers only the install.
- Never a fixed 10 min for an updater that downloads by itself; 25 min, and say the time.
- Say **slower than usual** against what this agent took last time on that computer, not a guess.
- A stall (no bytes for 2 min) and a whole limit (30 min) fail into one plain reason (`timeout`).

## Summary

The "stuck" row was npm downloading a 19.5 MB packument and a 155 MB platform tarball for every
Codex version, silently, with Ducter's runner buffering everything to the end (12.5 min measured
here). The install itself takes 3–14 s from a warm cache. Downloading the tarball ourselves into
npm's own cache (`npm cache add <file>`), then `npm install -g --prefer-offline`, keeps npm as the
installer, makes the download visible in MB and stoppable without touching the installed copy.
