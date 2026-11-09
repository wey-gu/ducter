# 42: How each AI agent is installed, versioned and updated

Asked (2026-11-10): on a server and on every computer, Ducter should know which version of each
AI agent it uses (Codex, Claude Code, pi, DeepSeek Harness) and update them gracefully and
automatically. Before designing that, what does each harness offer: install channels, how the
installed version is read, where "latest" comes from, the harness's own update command, and
whether a version can be pinned (so a bad update can be rolled back)?

Tags: VERIFIED (run or read on this Mac, read-only), DOCUMENTED (vendor docs, a package's own
help or source), INFERRED. Nothing was installed or updated: every command below was a
`--version`, `--help`, `doctor` or a registry read. Sources read 2026-11-10:

- this Mac: Claude Code 2.1.321 (native installer), codex-cli 0.167.0 (npm global under
  Homebrew's node), pi 1.4.0 (npm global), no `dsh`.
- OAR 0.95.1 (`@botiverse/oar`, Ducter's dependency): `runtimes/{claude,codex}/update.js`
  (`checkUpdate` and `upgrade`), `runtimes/*/install.js`, `shared/update.js`.
- `@earendil-works/pi-coding-agent` 1.4.0 as installed: `dist/config.js`,
  `dist/package-manager-cli.js`, `dist/utils/version-check.js`.
- Codex's standalone installer `https://chatgpt.com/codex/install.sh` (downloaded to the
  scratchpad, read, deleted; never run).
- npm registry dist-tags; `formulae.brew.sh/api/cask/<token>.json`;
  `downloads.claude.ai/claude-code-releases/{stable,latest}`; `pi.dev/api/latest-version`.

Snapshot caveat: versions move weekly. The numbers below are the 2026-11-10 answers.

## 1. Claude Code (`claude`)

| | |
|---|---|
| Version | `claude --version` → `2.1.321 (Claude Code)` (VERIFIED). |
| Channels | **Native installer** (`curl -fsSL https://claude.ai/install.sh \| bash`): `~/.local/bin/claude` links into `~/.local/share/claude/versions/<v>`; older versions stay beside it (here 2.1.318, 2.1.319, 2.1.321) (VERIFIED). **npm** `@anthropic-ai/claude-code` (path contains `/node_modules/@anthropic-ai/claude-code/`). **Homebrew cask** `claude-code` (binary `/opt/homebrew/bin/claude`, real path under `/Caskroom/`) (VERIFIED `brew info --cask`). **Claude desktop app** keeps its own copy under `~/Library/Application Support/Claude/claude-code/<v>` (VERIFIED: 2.1.281, 2.1.284 present). OAR's `claudeInstallMethod` tells them apart by real path the same way, and falls back to `installMethod` in `~/.claude.json` (here `native`) (VERIFIED, OAR source and file). |
| Latest | Native: `https://downloads.claude.ai/claude-code-releases/latest` (or `/stable` when settings `autoUpdatesChannel` is `stable`) answers a bare version: today `2.1.321` / `2.1.311` (VERIFIED). npm: `registry.npmjs.org/@anthropic-ai/claude-code/latest` (dist-tags `latest 2.1.321`, `stable 2.1.311`) (VERIFIED). Cask: `formulae.brew.sh/api/cask/claude-code.json` → `2.1.311` (the cask follows stable) (VERIFIED). |
| Update | `claude update` ("Check for updates and install if available; package-manager installs update through the package manager") (VERIFIED `--help`). Native copies also update themselves in the background unless `DISABLE_AUTOUPDATER` / `autoUpdates: false` (DOCUMENTED, Anthropic setup docs; OAR reads `DISABLE_UPDATES`). |
| Pin / roll back | **Yes, native:** `claude install <version>` ("Use [target] to specify version (stable, latest, or specific version)") (VERIFIED `--help`). npm: `npm i -g @anthropic-ai/claude-code@<v>` (DOCUMENTED, npm). Cask: **no** (Homebrew installs a cask's current version only). |

## 2. Codex (`codex`)

| | |
|---|---|
| Version | `codex --version` → `codex-cli 0.167.0` (VERIFIED). |
| Channels | **npm** `@openai/codex` (here, under Homebrew's node prefix: `/opt/homebrew/lib/node_modules/@openai/codex`) (VERIFIED). **Homebrew cask** `codex` (real path under `/Caskroom/codex/`) (VERIFIED `brew info --cask`). **Standalone installer** (`curl -fsSL https://chatgpt.com/codex/install.sh \| sh`): unpacks into `$CODEX_HOME/packages/standalone/releases/<v>`, `current` points at it, `~/.local/bin/codex` links there (DOCUMENTED, install.sh and OAR `codex/install.js`). **The Codex desktop app** carries its own codex inside the app bundle (INFERRED from OAR's note "a copy `codex update` cannot update (a copied binary, an app bundle)"; no Codex.app on this Mac). |
| Ask Codex itself | `codex doctor --json` → `checks["updates.status"].details`: `latest version 0.167.0`, `latest version status: current version is not older`, `update action: npm install -g @openai/codex`; `checks.installation.details["install context"]: npm (…)` (VERIFIED here). For a copy it can't update, `update action` is `manual or unknown` (DOCUMENTED, OAR `codex/update.js`). doctor exits 1 when any row fails, so read the JSON, not the exit code. |
| Latest | npm: `registry.npmjs.org/@openai/codex/latest` → `0.167.0`; the dist-tags also carry `alpha` (0.169.0-alpha.7) and per-platform tags (VERIFIED). Cask: `formulae.brew.sh/api/cask/codex.json` → `0.167.0` (VERIFIED). |
| Update | `codex update` ("Update Codex to the latest version") (VERIFIED `--help`); OAR notes it "never checks and reports success even when its download failed", so the version must be read back (DOCUMENTED, OAR). npm: `npm install -g @openai/codex@<v>`. Cask: `brew upgrade --cask codex`. |
| Pin / roll back | npm: **yes** (`@openai/codex@<v>`). Standalone: **yes**, `install.sh --release <v>` / `CODEX_RELEASE` (DOCUMENTED, install.sh usage text) with `CODEX_NON_INTERACTIVE=1`. Cask: **no**. App bundle: **never touched** (updates with the app). |

## 3. pi (`pi`, `@earendil-works/pi-coding-agent`)

| | |
|---|---|
| Which pi Ducter runs | From a checkout: OAR's bundled pi (1.5.0) under `node`, so it updates **with Ducter** (its lockfile). In the single binary there is no `node_modules` on disk, so Ducter runs the user's own `pi` on PATH (VERIFIED, `runner/src/oar.ts` `piCommand`, research/34). |
| Version | `pi --version` → `1.4.0` (VERIFIED). |
| Channels | npm / pnpm / yarn / bun global, a Bun-compiled binary, or the pi.dev **managed install** (`managed-install.json` marker, layout `releases-v1`) (DOCUMENTED, `config.js detectInstallMethod`, `package-manager-cli.js`). |
| Latest | `https://pi.dev/api/latest-version` → `{"version":"1.5.0","packageName":"@earendil-works/pi-coding-agent"}` (VERIFIED). The package name itself can change (pi moved scopes once; `packageName` says the current one). npm `latest` 1.5.0 (VERIFIED). |
| Update | `pi update --self` (VERIFIED `--help`); for npm it runs `npm [--prefix <p>] install -g --ignore-scripts --min-release-age=0 <pkg>@<v>`, uninstalling the old name first when the package was renamed (DOCUMENTED, `config.js`). A Bun binary can't self-update. |
| Pin / roll back | npm: **yes** (`npm install -g @earendil-works/pi-coding-agent@<v>`). Managed install: **no** from Ducter (its installer owns the layout; pi refuses `--force` there). |

## 4. DeepSeek Harness (`dsh`, `@deepseek-ai/dsh`)

| | |
|---|---|
| Version | `dsh --version` (DOCUMENTED, OAR `dsh/installation.js`; research/34). OAR's floor is `0.2.1-rc.5`. |
| Channels | npm `@deepseek-ai/dsh`, Node ≥ 24.9 (DOCUMENTED, OAR `dsh/install.js`; VERIFIED in research/34 with a scratch prefix). No other channel known. |
| Latest | `registry.npmjs.org/@deepseek-ai/dsh/latest` → **`0.2.2-rc.1`** (VERIFIED): npm's `latest` tag points at a pre-release, so "latest" must be compared with pre-release ordering (0.2.1-rc.5 < 0.2.1 < 0.2.2-rc.1). |
| Update | `npm install -g @deepseek-ai/dsh@<v>`. No self-update command known (INFERRED: none documented). |
| Pin / roll back | **Yes** (npm). |

## 5. What holds for all four

- **"Latest" is per channel, not per harness.** A cask can lag npm by weeks (claude-code: cask
  2.1.311, npm 2.1.321). Showing npm's latest to a Homebrew user would offer an update their
  updater can't install. Ducter asks the channel the copy came from.
- **The real path decides the channel.** All four can be told apart by where the binary really
  lives (`/node_modules/<pkg>/`, `/Caskroom/`, `/claude/versions/`, `$CODEX_HOME/packages/standalone/`,
  `*.app/Contents/`, `Application Support/Claude/claude-code/`). Anything else is unknown, and
  unknown is never updated.
- **npm global:** update the same copy. Run npm with `--prefix <the prefix the package lives
  under>` so a second node on PATH doesn't install a second copy (pi's own updater does this).
- **Updaters lie about success.** Judge an update by the version the same binary reports
  afterwards (OAR's rule), then by the login still answering (`claude auth status`,
  `codex login status`).
- **Rollback is only real where pinning is:** Claude Code native and npm, Codex npm and
  standalone, pi npm, DeepSeek Harness. Homebrew casks and pi's managed install can't go back from
  Ducter; app bundles are never touched.
- **Claude Code native auto-updates itself** in the background by default; Ducter's update is
  mostly for npm and server copies, and for Codex, whose CLI only nags.

## Implications for Ducter

1. Each device's AI agent row carries `version`, `how` (npm · brew · installer · app · ducter ·
   unknown), `latest` from that channel, and whether the installed and the latest version are
   inside harness-facts' verified range. The home reads "latest" (one fetch per channel, cached
   6 h, silent offline, never in tests); workers report version and `how` only.
2. One table maps (harness, how) to the update command, whether it can pin, and the rollback
   command. App bundles and `ducter` (pi inside Ducter) show where the update comes from instead
   of a button; unknown says plainly it can't.
3. After an update: re-read the version and the login; a version that doesn't answer is rolled
   back where pinning exists, otherwise the card says what happened in plain words.
4. Night auto-update goes only to versions inside the verified range; where the channel can pin,
   it may go to the newest verified version even when the channel's latest is past it.
5. `scripts/probe-harnesses.ts` records the latest per channel next to the verified range, so
   widening the range starts from what users will get.

**Summary.** Claude Code: native/npm/cask/desktop app; `claude update`, pins with
`claude install <v>`. Codex: npm/cask/standalone/app; `codex update` (no success check), pins on
npm and with `install.sh --release`. pi: inside Ducter from a checkout, else the user's own
(npm or managed); `pi update --self`, pins on npm. DeepSeek Harness: npm only, `latest` is a
pre-release, pins on npm. Casks and managed installs can't roll back; app bundles are never
touched.
