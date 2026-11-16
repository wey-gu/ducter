# 87. Signing a headless computer in to GitHub through `gh`, with no terminal

**Question.** A home on a Linux server (the author's "Hetzner Server") failed to clone a private
GitHub repository: it had no git sign-in, and Ducter could only say "sign in to git on Hetzner
Server". Can the home (or a worker) sign itself in to GitHub from the app, without the person
opening a terminal there? Specifically: does `gh auth login --web`, run by Ducter as a child with no
TTY, print the one-time device code and link so the app can show them? And how does plain git,
and every task, then use that login?

**Sources.** The GitHub CLI's source, `cli/cli` at `3d5a9e3` (2026-11-12), cloned read-only into
the session scratchpad: `pkg/cmd/auth/login/login.go`, `pkg/cmd/auth/shared/login_flow.go`,
`internal/authflow/flow.go`, `pkg/cmd/auth/status/status.go`, `pkg/cmd/auth/setupgit/setupgit.go`.
`gh` 2.103.2 is on this Mac; no sign-in was run (the rules forbid touching this Mac's real login).

## 1. What `gh auth login --web` does without a terminal

- `login.go`: `opts.Interactive` is true only when `IO.CanPrompt()` and no token was given. With
  stdin/stdout not a TTY (or `GH_PROMPT_DISABLED` set) it is false. `--web` with `--hostname`
  needs no prompt: the hostname is given, and `--git-protocol https` answers the protocol question
  that would otherwise be asked. VERIFIED (source).
- `login_flow.go`: `opts.Web` forces the browser (device) flow (`authMode = 0`); the
  "Paste an authentication token" choice is only offered interactively. VERIFIED.
- `internal/authflow/flow.go` `AuthFlow`: writes to `IO.ErrOut` (stderr):
  `! First copy your one-time code: XXXX-XXXX` (or, when gh's clipboard setting is on,
  `! One-time code (XXXX-XXXX) copied to clipboard`), and, because `isInteractive` is false,
  `Open this URL to continue in your web browser: https://github.com/login/device` instead of
  "Press Enter to open … in your browser". It then polls GitHub until the code is approved,
  denied or expired. VERIFIED (source); the exact wording is what Ducter parses
  (`parseDeviceCode`, tolerant of both forms). On older gh releases the same non-interactive
  branch exists (INFERRED from the code's shape; not checked release by release).
- Colour: none when stderr isn't a TTY; Ducter also sets `NO_COLOR=1`. The "expiring tokens" nudge
  is printed only when stderr is a TTY. VERIFIED.
- Storage: the token goes to the system keyring when there is one, else gh's `hosts.yml` in
  plain text with a warning (`Authentication credentials saved in plain text`). On a headless
  Linux server that is the usual case: the same place `gh auth login` in a terminal would use.
  DOCUMENTED (source comments).
- A `GH_TOKEN`/`GITHUB_TOKEN` in the environment makes the login refuse ("The value of the GH_TOKEN
  environment variable is being used for authentication"). Ducter's sign-in leaves both out of
  gh's environment; its status check keeps them (a person who set one is already signed in).
  VERIFIED (source: `AuthTokenWriteable`).

## 2. Git uses it only after `gh auth setup-git`

- In the interactive flow gh offers to configure git (`CredentialFlow.Prompt`) only when
  `opts.Interactive && gitProtocol == "https"`. Non-interactively it is skipped. VERIFIED.
- `gh auth setup-git --hostname github.com` writes `credential.https://github.com.helper` =
  `!<gh> auth git-credential` into the person's global git config, so plain `git clone`/`push`
  over https asks gh for the password. VERIFIED (source). Ducter runs it after every successful
  sign-in.

## 3. Who it is, afterwards

- `gh auth status --json hosts` (recent gh) gives `{hosts: {"github.com": [{state, active, login,
  …}]}}`; the token itself is included only with `--show-token`, which Ducter never passes.
  VERIFIED. Older gh has no `--json` there ("unknown flag"); its text says
  `Logged in to github.com account <login>` (newer) or `… as <login>` (older). Ducter tries JSON,
  then the text.

## 4. The fallback: a pasted key

`gh auth login --hostname github.com --git-protocol https --with-token` reads the token from stdin,
checks the minimum scopes (`repo`, `read:org`) and the login, and stores it. VERIFIED. Ducter
passes the key on stdin only (never argv, never the environment) and never echoes it.

## 5. What was not done

- No real sign-in: no `gh auth login` was run on this Mac or a server, and no device flow was
  completed. The flow is exercised with a fake `gh` that prints what the source prints.
- Not tested: GitHub Enterprise hosts (only github.com is offered), gh releases before ~2.40.

## Implications for Ducter

- The home and each worker can sign themselves in to GitHub with no terminal: run
  `gh auth login --hostname github.com --git-protocol https --web` as a child, read the code and the
  link from stderr, show them in the app (any device can open the link), wait for the child to
  exit, then `gh auth setup-git --hostname github.com` and read the account back. One in flight per
  computer; a second ask answers the same code.
- The pasted-key fallback is `--with-token` on stdin. Implementing the OAuth device flow ourselves
  with gh's client id is not needed (and not acceptable).
- Tasks need nothing new to use it: they run as the person, git reads the global config from
  `$HOME`, and gh reads its login from its config folder or the keyring. The task environment must
  keep that route (HOME, `GH_CONFIG_DIR`, `XDG_CONFIG_HOME`, `GIT_CONFIG_GLOBAL`, the ssh agent) and
  nothing else of the person's: `GH_CONFIG_DIR` was being dropped by the allowlist.
- A future sandbox has no person's `$HOME`: it gets a scoped token passed explicitly and the
  helper set through `GIT_CONFIG_*`, never the whole environment.

**Summary.** `gh auth login --web` without a TTY prints the one-time code and
`https://github.com/login/device` on stderr and waits; git uses the login after
`gh auth setup-git`. That makes "Sign in to GitHub on {computer}" possible from any client, with
`--with-token` as the fallback. Feeds D272.
