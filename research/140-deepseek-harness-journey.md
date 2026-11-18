# 139: DeepSeek Harness from install to a running task (D371)

The trigger: the author installed **DeepSeek Harness.app** (0.2.2-rc.3, Electron) on his MacBook and
signed in, and Ducter's Devices page didn't show it. 47a2e4aa added the app's own command folder to
the PATH Ducter looks in; this note walks the whole journey after that, for the three users, and records
what DeepSeek Harness actually ships. Read-only on the author's Mac (2026-11-18): the app bundle (its
`app.asar` read by a small reader written for this, no code run from it), the shape of `~/.dsh` (names
and value lengths only, never a value), DeepSeek's public download feed, npm and GitHub. One scratch npm
install and four tiny live turns, described in §5. Nothing in `~/.dsh` or the app was changed.

## 1. How it is installed

- **F1 (VERIFIED).** The app keeps its CLI at `Contents/Resources/runtime/cli/bin/dsh`, a 583-byte POSIX
  launcher that follows its own symlinks, then runs `ELECTRON_RUN_AS_NODE=1 "<app>/Contents/MacOS/DeepSeek
  Harness" --expose-internals <app.asar>/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js "$@"`.
  `dsh --version` answers `0.2.2-rc.3` in 0.1 s. Nothing is put on PATH by default.
- **F2 (VERIFIED).** The app can put the command on PATH itself: its `runtime/cli/command-manager.js`
  installs `/usr/local/bin/dsh` as a symlink to that launcher (macOS; elevated, after the person asks).
  Its real path is inside the app, so a copy found there is the app's too.
- **F3 (VERIFIED).** The app updates itself (electron-updater, `Resources/app-update.yml`: a generic
  feed at `download.deepseek.com/dsh-desk/feeds/mac-arm64/`, channel `nightly`; `stable-mac.yml` and
  `nightly-mac.yml` both said 0.2.2-rc.5 on 2026-11-18, mac-x64 too). No Linux feed answers (404):
  the desktop app is Mac (and Windows) only.
- **F4 (VERIFIED).** The CLI on npm: `@deepseek-ai/dsh`, `bin: dsh`, `engines.node >= 24.9.0`;
  dist-tags `latest` 0.2.2-rc.1, `next` 0.2.2-rc.5, `alpha` 0.2.2-alpha.3. The repository
  (github.com/deepseek-ai/deepseek-harness, MIT) documents only `npx @deepseek-ai/dsh web` and a source
  build: no Homebrew formula or cask, no install script.
- **F5 (VERIFIED).** `npm install -g --prefix <scratch> @deepseek-ai/dsh@0.2.2-rc.3` (npm 11.20, Node
  26): 210 s, **1.3 GB** (about 200 packages; `@deepseek-ai/libreoffice-kit-*` alone ~300 MB). npm 11
  skips install scripts unless allowed (`dsh-subprocess-local`, `koffi`, `node-pty`, `@google/genai`,
  `protobufjs`); the only one that matters, `ensure-spawn-helper` (node-pty's helper's execute bit),
  was already satisfied by the tarball, and the shell tool ran (§5). Node 24.22.3 (Ducter's own,
  D363) ships npm 11.19.1 and meets the engines floor.

## 2. Found by Ducter

- **F6 (VERIFIED).** 47a2e4aa's folder entries (`/Applications`, `~/Applications`) make `whichNow("dsh")`
  find the app's copy on the widened PATH; OAR's own lookup reads the session env's PATH, so the
  runner resolves the same launcher with no `OAR_DSH_BIN` (§5).
- **F7 (VERIFIED, code).** A worker re-widens its PATH every 5 s before its fingerprint, so an app
  installed after start shows within seconds. The home widened only at start and when a card opened
  (`look`), and its fingerprint loop didn't exist: an agent appearing while no card was open stayed
  unseen by the partner and New task until a restart. The fingerprint also didn't include DSH's
  credential file, so signing in inside the app never triggered a probe.
- **F8 (VERIFIED, code).** `agentHow` had no app mark for DeepSeek Harness, so the app's copy read as
  `unknown` (the card said "Ducter can't tell how it was installed").

## 3. Signed in

- **F9 (VERIFIED).** The app and the CLI share one home, `$DSH_HOME` or `~/.dsh` (`DSH_HOME_DIR_NAME`
  in the app's main.js), and one credential file, `.credentials.yaml` (`dsh-credentials-local`; the
  stored file wins over the launch env, a project `.env` and `$DSH_HOME/.env`).
- **F10 (VERIFIED).** The app's first screen offers two ways in: **登录 / Sign in** (the DeepSeek
  account, an OAuth flow against platform.deepseek.com) and **添加 API Key / Add API Key**. The key goes to
  `refs: DEEPSEEK_API_KEY`; the account to a record `deepseek-account-platform/default` (`kind`,
  `payload.version`, `payload.token`, `payload.issuer`), beside a device record.
- **F11 (VERIFIED, the package READMEs inside the app).** They are two model routes:
  `deepseek-official/<model>` (`dsh-llm-deepseek-api-key`, the key) and `deepseek-account/<model>`
  (`dsh-llm-deepseek-account`, the account's token in `x-dsh-auth-token`; "the route never falls back to
  an API key"). Both are in `dsh-base`, so in every profile, `acp` (OAR's) included. The account's
  catalog comes from its own `/models` listing, the same ids (`deepseek-flash`, `deepseek-v4-pro`).
- **F12 (VERIFIED, code).** Ducter counted only the key: a person who chose the app's **登录** read as
  not signed in, and every DeepSeek Harness session asked for `deepseek-official/...` (or a bare name
  became that), which fails without a key. The card's 登录 for DeepSeek Harness ran nothing (`failed` at
  once): its sign-in has no headless command.
- **F13 (VERIFIED, README).** The credential store takes `path` in its row
  (`- id: credentials, config: { path }`), so a home of Ducter's can read the person's own file where it
  is, without a copy.

## 4. Models and the partner

- **F14 (VERIFIED, §5).** With only the account, OAR's `listModels` answers
  `deepseek-account/deepseek-flash` and `deepseek-account/deepseek-v4-pro`; with a key, the
  `deepseek-official/...` pair. A turn on either reports a 1,048,576-token window.
- **F15 (INFERRED).** The partner's model rows and the composer's chips read the listed ids through the
  tier table (`candidates.ts`): the account's ids need rows there and in harness-facts (the window), or
  they show as raw ids and as models Ducter doesn't know.

## 5. Live (the author's Mac, 2026-11-18, scratch data folder and scratch DSH home; Flash)

A script drove `createOarHarnessPort` with the widened PATH, a scratch `DUCTER_DATA_DIR` and
`DSH_HOME` (removed afterwards). The key came from the person's own file the way the runner reads it
(never printed). For the account route, a scratch copy of the credential file without its key line
(0600, removed with the scratch folder).

| Run | dsh | Route | Setup | Result |
|---|---|---|---|---|
| A | the app's | key | home of Ducter's, read-only (the partner's) | installed, signed in; "pong", 1,329 in / 3 out, 3.3 s |
| B | the app's | account | home of Ducter's, its `credentials` row pointing at the scratch file | listing `deepseek-account/*`; "pong" |
| C | the app's | key | a task on the (scratch) person's setup | `bash` ran, `hello.txt` = "hi", 5.2 s |
| D | npm's (scratch prefix, rc.3) | key | as C | `bash` ran, `hello.txt` = "hi", 14.9 s |

OAR's floor (`DSH_MIN` 0.2.1-rc.5) accepts 0.2.2-rc.3. Not run: the npm install through Ducter's own
Node on a bare Linux VM (the same command D363 runs for the other three), and the app's account sign-in
from scratch (the author was already signed in).

## Implications for Ducter

1. Read the account sign-in as signed in, and run the account route when there is no key (the same
   model ids); a home of Ducter's points DSH's credential row at the person's own file.
2. Mark the app's copy `app` ("updates with the DeepSeek Harness app"), never npm-update it.
3. The home looks again every few seconds like a worker, and every fingerprint includes DSH's file.
4. Ducter can install the CLI everywhere with D363's npm path (one tap, no sudo), and should say it's
   big (1.3 GB) before the tap; the lend sheet offers it unchecked.
5. 登录 on its row: open the app on that Mac when it is there (the account is the easy way for a
   consumer), and take a pasted DeepSeek key anywhere, checked by DeepSeek's balance read (D298), kept
   in that computer's `keys.env`; the row turns ready by itself either way.
6. Bump the verified range to 0.2.2-rc.3 (A–D).

**Summary.** DeepSeek Harness ships as a Mac app carrying its own `dsh` and as an npm CLI (1.3 GB);
both share `~/.dsh`, where a person is signed in with a key or with a DeepSeek account, two different
model routes. Ducter saw only the key and only the PATH. Live on the author's Mac, the app's own dsh ran
the partner's read-only setup on both routes and a task's shell tool through Ducter's runner.
