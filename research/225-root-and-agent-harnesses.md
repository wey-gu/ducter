# 225: Ducter as root, and what each agent does under root (D549)

The question: hel runs Ducter as `root` (`/root/.ducter`, a user unit for root). On 2026-11-24 the
author tapped Update for the Claude Code Mem plugin. Ducter opened a task on Claude Code, and the
agent exited at once. The card said 「没能开始：Claude Code 没能在 Hetzner Server 上启动」, with
`delivery failed: TypeError: undefined is not an object (evaluating 't.session.send')` in the
task's record. The mend's rethink opened the same work on Claude Code three more times
(kwhtu5a7, 8dqqpdjd, fwvw9h5y), and the fourth try went to Codex and worked. Should Ducter refuse
to run as root, and what does each agent do as root? The hel facts above are from the
coordinator's read-only look at hel's Log and journal. This report did not touch hel.

Method: three throwaway environments on the author's Mac, none with a person's sign-in.
(1) A Debian 12 container (Apple `container`, `node:22`) as root, with Claude Code, Codex and pi
from npm, run with no prompt or a one-word prompt and no sign-in. (2) The same container, with
this branch's runner and OAR 0.124 run for real against the real `claude` binary as root. (3) A
throwaway Lima VM (Debian 12, systemd as PID 1) for the install flow. Vendor documentation was
read on 2026-11-24.

## 1. Claude Code under root

- **VERIFIED (container, Claude Code 2.1.331, root)**: `claude --dangerously-skip-permissions -p hi
  --output-format stream-json --verbose` prints
  `--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`
  on stderr and exits 1, before any stream-json frame. `--permission-mode bypassPermissions` and
  `--allow-dangerously-skip-permissions` refuse the same way. `claude -p hi` without bypass starts
  and says it isn't signed in. OAR starts every Claude Code session with bypass (D16), so every
  Ducter task as root fails.
- **VERIFIED (container, the same user made with `useradd`)**: as an ordinary user, the same
  command starts and says it isn't signed in. `SUDO_USER=x` in the environment changes nothing:
  the check is the uid, not sudo.
- **VERIFIED (the bundle's own code, read in the container)**: the check is
  `process.getuid() === 0 && process.env.IS_SANDBOX !== "1" && !CLAUDE_CODE_BUBBLEWRAP`.
  With `IS_SANDBOX=1` the root session starts (its init frame came, then "Not logged in").
- **DOCUMENTED** ([Choose a sandbox environment](https://code.claude.com/docs/en/sandbox-environments)):
  "On Linux and macOS, Claude Code refuses to start with this flag when running as root, so run
  the container, VM, or sandbox runtime as a non-root user."
- **DOCUMENTED, by absence**: `IS_SANDBOX` is not in Claude Code's
  [environment variables](https://code.claude.com/docs/en/env-vars) reference (read in full,
  2026-11-24). Third-party write-ups name it and say it is undocumented and may change. The
  official opt-in for running as root does not exist. The documented way is a non-root user.
  Ducter does not set `IS_SANDBOX`.

## 2. The other agents under root

| Agent | As root, approvals off | Evidence |
|---|---|---|
| Codex 0.172.0 | Runs. `codex exec --dangerously-bypass-approvals-and-sandbox` and `codex app-server` (OAR's way in) both start, with a warning that bubblewrap isn't on PATH | VERIFIED, container |
| pi 0.73.1 | Runs. `pi -p` starts and asks for a model key | VERIFIED, container |
| DeepSeek Harness | No root check in OAR's `dsh` runtime, and none reported. Not run as root here (no public build to install in a container) | INFERRED |
| Antigravity (agy 1.5.x) | Ran tasks on hel as root (D524 read hel's Log: vd8hamrb and others), and OAR's agy runtime has no root check | DOCUMENTED (D524) |
| OAR 0.124 itself | No root handling in any runtime: it neither refuses nor sets an override | VERIFIED, code read (`grep getuid\|IS_SANDBOX` in `dist/`) |

These are now in the registry as `HARNESS_FACTS[h].root` (`packages/protocol/src/harness-facts.ts`).

## 3. Why the card said a TypeError (VERIFIED, real OAR and real claude, container)

OAR 0.124 reports the exit well. Its stream-json session adds the stderr tail to the exit's
reason when no native frame came. The first event was
`harness exited (code 1): stderr (tail):\n--dangerously-skip-permissions cannot be used…`.
Ducter dropped those words in two ways:

1. **The hel order.** The process exited between `startSession` and the first `send`. The pump
   saw the stream end and set `t.session = undefined`, then `deliver` called
   `t.session!.send(...)`: a TypeError. `startProblem` read "session" in the message as `agent`,
   so the card said 没能启动 with the TypeError as its detail.
2. **The container order.** The send got in first, then the process exited. The pump parked the
   task. The card never failed: it stayed 在做, parked, with nothing to show.

Either way the agent's own words were in the Log and never reached the card.

## 4. Why the mend tried Claude Code three more times (VERIFIED, code read)

`mend.ts` counts rethinks per task. Each time the partner opened the work again with `replaces`,
the new task had a fresh budget, and the partner chose Claude Code again: the [devices] line said
Claude Code was signed in on hel (it was; it just won't run as root). Nothing in the hand-over
said the cause holds. `blockOf` blocked only "not installed" and "signed out". The fourth try
reached Codex only because the partner happened to choose it.

## 5. The install flow as root (VERIFIED, Lima VM, Debian 12, systemd)

The bundle's `install.sh --service` run as root, with no `SUDO_USER`:

- made the user `ducter` (`useradd --create-home`) and turned linger on;
- installed `~/.local/bin/ducter` for `ducter`;
- wrote `/home/ducter/.config/systemd/user/ducter.service` and started it as `ducter`;
- `/health` answered, the process ran as `ducter`, `/home/ducter/.ducter` was 0700 `ducter`, and
  `/root/.ducter` was never made. `ducter doctor` said `Runs as: ducter, an ordinary user`.

The same run with `sudo` from the VM's own user installed for that user. With `--as-root`,
everything went to root as before, and `ducter doctor` said
`Runs as: root: Claude Code won't run here…`. The site script's worker line run as root, with
`DUCTER_USER=wkr`, against the VM's home (a local release mirror, `DUCTER_DOWNLOAD_BASE`), made
`wkr`, installed there, joined the home, and left `wkr`'s worker unit active with linger on. The
home listed the worker. A Claude Code task was not run end to end: that needs a sign-in, and no
person's sign-in may be used. Claude Code's own start as an ordinary user is VERIFIED in §1.

## 6. Every way in, as root, before and after

| Entry point | As root before | As root after D549 |
|---|---|---|
| `curl ducter.ai/install.sh \| sh -s -- --service` (site script, then the bundle's `install.sh`) | Installed in `/root/.local`, ran root's user unit | Makes or picks an ordinary user, turns on linger, runs the bundle's install and `ducter service install` as that user; `--as-root` keeps the old way |
| The bundle's `install.sh` copied by hand (`scp`, the release tarball) | Same as above | Same handover (it is the same script) |
| `curl … \| sh -s -- worker <address> --code …` (lend a computer) | Root's system unit (`/etc/systemd/system`, D347) | Installed and joined as the ordinary user, its user unit with linger; `--as-root` keeps the system unit |
| `ducter service install` run as root by hand | Root's user unit, silently | The same unit, with one plain line: Claude Code won't take tasks here, and the way to an ordinary user |
| `ducter service install --worker` as root | System unit | The same, with the same line |
| `ducter up --headless` as root (journald) | Nothing said | The same line once, at start |
| D524's unit refresh | Rewrites Ducter's own settings in its own unit | Unchanged: it only touches a file Ducter wrote, as whoever runs it |
| `ducter doctor` | No word about root | A **Runs as** row; Claude Code reads "won't run as root" |
| `ducter move` (D504) | Plan only, no root case | Unchanged. The author moves hel by hand (the coordinator's call) |
| Docker or other packaging | None in the repo (`find -name 'Dockerfile*'`: none) | None |
| The docs (`docs/install.md`, `add-a-computer.md`, `troubleshooting.md`) | Root is fine, data in `/root/.ducter` | "Signed in as root": what happens and why, `sudo -iu ducter`, `DUCTER_USER`, `--as-root` |

## Implications for Ducter

- **Don't hard-refuse root.** Hetzner and most cloud images log you in as root, so a refusal
  breaks the first run. Root works for Codex, pi, DeepSeek Harness and Antigravity.
- **Install as an ordinary user by default.** It is the only documented way for Claude Code. It
  also keeps a task (D16: approvals off) from owning the whole server. That belongs in the
  install line, which is where a root login is met first.
- **While root: don't offer an agent that refuses root, and say why.** Claude Code's row reads
  **Won't run as root**, the chooser blocks it (`refuses_root`), the partner's [devices] line
  says it can't run there, and Ducter's OAR port doesn't start it at all. Never set
  `IS_SANDBOX`: it is undocumented.
- **A start the agent ends at once is a start failure with the agent's own words**, whichever
  comes first, the send or the exit.
- **A cause that is a fact of the computer is never retried by the same agent there.** That
  holds across the tasks that replace one another, and the partner hears it.

**Summary.** Claude Code 2.1.331 refuses to start as root whenever approvals are off. That is
how Ducter runs every agent, so on hel every Claude Code task failed. Its words reached the Log
but not the card (a TypeError, or a task left parked), and the mend reopened the same work on
the same agent. Codex and pi run as root; DeepSeek Harness and Antigravity show no root check.
The fix (D549): install as an ordinary user from a root login, say plainly when Ducter still
runs as root, show the agent's own reason on the card, and stop the same agent from being tried
again for the same cause.
