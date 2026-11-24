# 223. Why Antigravity may not sign in through Ducter (D523)

**Trigger (2026-11-24).** A colleague of the author reports that Antigravity (Google's `agy`)
can't sign in in Ducter. The author never hit it. No access to that machine: this report reads
Ducter's code (on 0.1.41), OAR 0.124.0's Antigravity runtime (read only, `dist/runtimes/antigravity`),
and the agy 1.5.16 binary already on the author's Mac (its strings, read only; one copy run in a
scratch HOME). The person's own agy, Gemini and Ducter folders were not touched; the Keychain was
not read.

## 1. How Ducter probes agy, and how it signs it in

| Step | Home (core) | Worker | Notes |
|---|---|---|---|
| Find agy | `agyPaths`: `OAR_ANTIGRAVITY_BIN` alone, else `agy` on PATH (as it is now, `whichNow`), then `~/.local/bin/agy` | same | OAR's order (`installation.js`) |
| Installed | the first copy whose `--version` is a bare release ≥ 1.5.0 (OAR's floor) | same | a copy that answers otherwise is "broken" and passed over |
| Signed in | `agy models` exits 0; "Please sign in" = out; anything else: the token file `~/.gemini/antigravity-cli/antigravity-oauth-token` decides | same, but read **stdout only** before D523 | OAR's `authStatus` is the same call, and says "unknown" for anything else |
| Sign-in | `agy acp --login` (resolved path), env `toolEnv` (basics only) | env = the task env (`childEnvironment`) | prints a Google link; the person pastes the code or the landing URL |
| Browser | a do-nothing `xdg-open` first on PATH on Linux; **nothing on a Mac** | same | OAR suppresses both `xdg-open` and `open` |
| Confirm (D518) | `probeHarnesses(only agy)` → `agy models`, boolean | same | |

Run by bare name without env (the D518 class): **no** for agy. Every agy run takes a resolved path
and an env. The bare-name bugs left were elsewhere (§5).

## 2. What agy 1.5.16 does (VERIFIED on this Mac unless marked)

- `agy acp --login` with a scratch HOME and a logging `open` first on PATH: it **called `open`
  from PATH with the Google URL** (VERIFIED), then printed `Open this link in a browser to log in
  with Google:`, the URL, and `Then paste the authorization code, or the full URL of the page you
  land on, and press Enter:`. The redirect is `https://antigravity.google/oauth-callback` (a page
  that shows the code), not a localhost callback, so a phone can finish it. No credential was read
  first: it starts a fresh sign-in.
- A made-up code: `couldn't log in: token exchange failed: oauth2: "invalid_grant" "Malformed auth
  code."`, **exit 1** (VERIFIED; the exchange reached Google from here).
- Where it keeps the sign-in (DOCUMENTED, agy's own release notes and symbols in the binary):
  the macOS **login Keychain** (go-keyring), the Linux **Secret Service over D-Bus** when a session
  bus is there, else the file above ("the CLI now bypasses the keyring when no D-Bus session bus is
  present"). On this Mac `~/.gemini/antigravity-cli/` holds no token file (VERIFIED, names only),
  consistent with the Keychain.
- 1.5.9's notes (DOCUMENTED): "a session no longer fails with 'Authentication required' after `agy
  acp --login` when `settings.json` names an auth method that has no credential (such as
  `gemini-api-key` without `GEMINI_API_KEY`)", and "Fixed the macOS 'Keychain Not Found' dialog
  reappearing about once an hour: after a keychain write fails, the CLI now saves your sign-in
  token to its file-based storage". Older copies (1.5.0–1.5.8) are inside Ducter's floor.
- agy 1.5.9 still "ignores GEMINI_HOME itself; only its ACP command accepts `--gemini-dir`"
  (OAR `state-directory.js`, DOCUMENTED); OAR passes `--gemini-dir` to sessions when it is set.
- The Antigravity **desktop app** (older builds) puts `~/.antigravity/antigravity/bin/agy`, a link
  to its editor's launcher, and prepends that folder to PATH in `~/.zshrc` (VERIFIED on this Mac:
  the link and the line are there; the link is dead here since the app moved to a new layout).
  Where it is alive, `which agy` is the editor launcher, ahead of the real `~/.local/bin/agy`.

## 3. Causes, ranked by evidence

1. **The sign-in ran the wrong `agy` on a Mac with the desktop app** (Ducter-side; code path
   VERIFIED, the colleague's machine INFERRED). The probe skips a copy whose `--version` isn't a
   bare release, so the card read the real agy correctly; but `login` took `agyPaths(...)[0]`, the
   first one on PATH: the editor launcher. That opens the editor (or nothing) and exits 0 at once,
   printing no link: before D518 the card said 登录好了 beside 未登录; with D518, "said the sign-in
   finished, but its own check still says signed out". `detectAgent` had the same mistake.
2. **The confirm can't reach Google, read as "signed out"** (Ducter-side reading; network INFERRED).
   `agy models` is a remote call. A home started by the Mac app has no shell `https_proxy`, and Go
   reads only proxy env vars, so a computer that needs a proxy for Google gets no answer; on a Mac
   there is no token file to fall back on, so any such sign-in ended as 未登录. Ducter could not
   tell "can't check" from "signed out".
3. **An agy older than 1.5.9** (agy-side, Ducter allowed it): the "Authentication required" after a
   sign-in with a Gemini CLI `settings.json`, and a Mac sign-in whose Keychain write failed kept
   nowhere. DOCUMENTED; whether the colleague's copy is that old is unknown.
4. **Linux desktop: the sign-in ran without the D-Bus session bus** (Ducter-side, home only;
   INFERRED from agy's notes): the home's sign-in env lacked `DBUS_SESSION_BUS_ADDRESS`, so agy
   wrote the token file, while the probe and every task (which have the bus) look in the Secret
   Service. Whether agy then falls back to the file is not known.
5. **A wrong code read as a generic failure** (Ducter-side, VERIFIED with the fake): agy exits 1
   right after "invalid_grant"; the exit saw "waiting" and said 没登录上 instead of the wrong-code line.
6. **GEMINI_HOME set** (Ducter-side, rare): the sign-in wrote `~/.gemini`, sessions read
   `$GEMINI_HOME`.
7. **On a Mac, agy opened a browser on that Mac by itself** (Ducter-side, VERIFIED): noise when the
   person is there (two tabs), a surprise on a Mac they are not at. Not a failure on its own.
8. Not Ducter's: the account (a Workspace or ineligible tier), Google's terms, no network at all.
   The colleague's facts tell these apart (§6).

## 4. What changed (D523)

- `pickAgy` (harness-probe): the copy OAR runs; the card, the sign-in, `detectAgent` and its update
  all take it. A sign-in with no copy that answers fails at once and logs where it looked.
- `agyAuth`: in / out / unknown from `agy models` (both streams; the worker now passes stderr).
  `signedInNow` returns `"unknown"` for agy's can't-tell; the sign-in then ends `failed` with
  reason `offline`, shown as **{agent} 登录完了，但它连不上自己的服务来确认，多半是网络或代理。看看那台电脑的网络，再试一次。**
- The sign-in floor 1.5.9: an older copy runs its own `agy update` first.
- The home's sign-in env keeps `DBUS_SESSION_BUS_ADDRESS`, `DISPLAY`, `WAYLAND_DISPLAY`;
  `--gemini-dir` when `GEMINI_HOME` is set; a do-nothing `open` on a Mac as on Linux.
- A wrong code that ends the process says the wrong-code line.
- `[sign-in] <agent>: …` lines in the computer's log at each step (never the link or the code).
- Tests: `packages/core/test/signin-agy.test.ts` (a fake agy run for real: the editor link first on
  PATH, Mac and Linux launchers, an old copy updated, a wrong code, can't-reach, signed-out-after,
  GEMINI_HOME, no copy at all).

## 5. The other bare-name spawns (D518's todo)

`spawnNow` / `resolveArgv` (protocol `which.ts`) resolve a bare program on PATH as it is now and
pass the env as it is now. Moved onto it: `doc-check.ts` (poppler, LibreOffice), `computer/driver.ts`
(cua-driver), `phone-own/audio.ts` (`pactl`), `devices.ts`, `update.ts`, the agent setup's run and
spawn, the doctor's host run, `git-login.ts` (`gh`). Every `Bun.which` now passes the PATH
(`whichNow`): `native-browser.ts` looked `claude` up on the start PATH. `spawn-guard.test.ts` fails
on a `Bun.spawn(["<a tool Ducter installs>", …` and on a `Bun.which` without `PATH`.

## 6. What to ask the colleague

OS; how agy got there and `which -a agy`; `agy --version`; what the card showed at each step; the
`[sign-in]` lines (on 0.1.42+) or the home's log around the time. The draft is in
`research/private/223-agy-colleague-questions.md` (not sent).

## Implications for Ducter

Everything that runs an agent picks the same copy the probe trusts, and a check that can't reach
the agent's service says so instead of "signed out". The registry (`ANTIGRAVITY`) now carries the
sign-in floor and the launchers.

**Summary.** The most likely Ducter cause on a Mac is the desktop app's `agy` link ahead of the
real agy on PATH: the probe skipped it, the sign-in ran it. Next: a Google check that can't be
reached read as signed out. Both are fixed, with an update-first floor, a consistent sign-in env,
log lines, and a guard against bare-name spawns.
