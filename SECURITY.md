# Security

Ducter runs AI agents on your own machines with your own accounts, so we take security
reports seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Instead, use GitHub's private
vulnerability reporting: open the repository's **Security** tab and choose **Report a
vulnerability**. Include what you found, how to reproduce it, and what an attacker could do
with it. We aim to acknowledge reports within a few days.

Ducter is an early preview with a single maintainer, so there is no bug bounty and no formal
support window. Fixes land on `main`.

## The trust model, in short

The full model is in [`design/system.md`](design/system.md) (sections *Safety*,
*Who counts as local*, and *Server mode and remote access*). The parts most relevant to a
report:

- **Tasks run with your account's full power.** A task is a Claude Code or Codex session on
  your machine, in its own git worktree, with harness approvals turned off. Ducter gates and
  records high-stakes effects it mediates, such as pushes and PRs, but it does not sandbox
  your Mac. Running tasks on a
  separate machine or VM is the way to get real isolation.
- **Local means loopback.** The main process binds `127.0.0.1` by default. A request is local
  when the TCP peer and the `Host` are loopback and no proxy header is present; local callers
  need no token. On a machine shared with other people, set `DUCTER_LOCAL_TRUST=off` so every
  caller must present a device token.
- **Remote devices pair.** A phone or another machine gets in only after pairing with a
  one-time code from `ducter pair`, and each device can be disconnected on its own
  (`ducter devices disconnect <id>`). Reach a server through HTTPS (Caddy on your domain) or
  an SSH tunnel; do not expose the port directly.
- **Your data stays in your data folder** (`~/.ducter` by default), with the folder at 0700
  and its secret files at 0600.

Reports that break any of these promises (for example, a remote caller treated as local, a
paired device's token outliving its revocation, or a secret reaching a model's context) are
exactly what we want to hear about.
