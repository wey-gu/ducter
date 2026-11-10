# Roadmap

Ducter is an early preview. This page says what works today, what comes next, and what is
further out. Scope changes go through the change loop in [`AGENTS.md`](../AGENTS.md) and are
recorded in [`decisions.md`](decisions.md); release notes are in [`CHANGELOG.md`](../CHANGELOG.md).

**Who it's for first:** people who run several AI agents at once and want one partner to
coordinate them, and people who use a personal AI (like Muse or Grok Bot) and want the same help
with the AI agents and models of their choice. Everything has to work for someone who has never
heard of a subagent.

## Works today

**Your partner**
- One conversation with a named partner, in a calm, messaging-style thread. It answers at once,
  starts the work in parallel, and comes back with the result in plain words.
- Runs on Claude Code or Codex, signed in as you, on small (200K) context windows. It can only
  read and start tasks; it never changes files itself.
- Long conversations stay coherent through segment digests, an open-items ledger and recall;
  memory across days and tools through [Nowledge Mem](https://mem.nowledge.co), kept under the
  partner's own identity.

**Tasks**
- Tasks run on Claude Code, Codex, pi or DeepSeek Harness, each in its own copy of your repo
  (git) or, for an ordinary folder, with a copy kept first so every change can be undone.
- **On hand** shows every task at a glance; questions come with a default and a timer, and
  nothing that can't be undone happens without your Go. A task's "done" is checked against its
  evidence.
- Open a task yourself (⌘N, or `ducter task`), group On hand by project, merge with one tap.
- Keep going until a goal is met, wait for something to happen, or run a routine on a schedule.
- AI agents use their own browser and computer use first, in a window of their own; Ducter's
  browser is the fallback.

**Your devices and accounts**
- A Mac app (Apple silicon, signed and notarized), a phone web client, and an
  [iPhone app in public beta](https://testflight.apple.com/join/Z4GvWt7t) with Go / Hold / Reply
  on notifications.
- Server mode on Linux: a systemd service, HTTPS on your own domain, and other computers that do
  tasks for your Ducter.
- Read your mail, calendar and other accounts with one tap through OOMOL's `oo`, or any
  OpenConnector / MCP server. Reads are logged; anything that sends or changes waits for Go.
- One-line install: `curl -fsSL https://ducter.ai/install.sh | sh`, and
  [skills](../skills/) so your own AI agent can deploy and run Ducter for you.

## Next

- **Move your Ducter between computers.** Start on a Mac, move to a server later (and back):
  one command moves the conversation, settings, routines and accounts; the old machine keeps
  doing tasks for its local repos.
- **Browse and use apps on your Mac from a server-hosted Ducter.** When your Ducter lives on a
  server, tasks that need your own Chrome, sign-ins or Mac apps run on your Mac (as a helper
  computer), with the same safety rules. Research first. The first half exists (D155): one tap
  in the Mac app makes the Mac a worker of the server (its AI agents and repos), kept running by
  a LaunchAgent; browser and computer use on that worker are still the home's only.
- **Real-world checks.** A long-conversation replay on real models, live runs of folder undo
  and native browser use, and the Nowledge Bridge live trial (today behind a flag; Mem's side
  answers since 2026-11-10, and the trial waits on the persona's context and a second identity).
- **Your other AI tools reach you through Ducter** (draft): a terminal Claude Code or Codex sends
  its questions for you to your partner and gets your answer back; work from your own agents can
  start without asking once you say so; a team's agents can reach your partner when you let them.
- **Mac dark mode** through the Midnight theme. Web and iPhone already follow the system.
- **Quota awareness.** Keep a reserve for your partner, prefer the account with the most limit
  left, and fall back gracefully when one runs low.
- **Remote access without a domain.** A small relay on your own Cloudflare account, or
  Tailscale, so a phone reaches a home Mac behind NAT with a stable HTTPS address.
- **Device keys and passkeys** on top of today's one-time pairing codes.

## Later

| | |
|---|---|
| **Phone calls** | Your partner places a call for you, with disclosure up front and you able to listen in or take over |
| **Phone use** | Tasks that operate an Android or iPhone app |
| **Voice** | Talk to your partner hands-free |
| **More AI agents** | Cursor, Gemini, Kimi and others as their command-line agents mature |
| **Your own small apps** | Pages and tools your partner builds for you to keep |
| **Leaner runtime** | A Go runner with no JavaScript runtime, and an embedded database option |

## Not planned for now

- Taking over AI agent sessions you started yourself outside Ducter.
- A hosted Ducter: it stays self-hosted, on your own machines. The one piece Nowledge runs is
  the notification relay for the iPhone app (D159): it forwards Apple notifications, encrypted
  end to end, and nothing else.

## Help wanted

**Tailscale remote access.** Make Ducter reachable through `tailscale serve` (private to your
tailnet) or `tailscale funnel` (public), as an alternative to a domain:
1. A stable HTTPS origin for the web client and WebSocket (installs, push and passkeys are tied
   to it).
2. That origin reported to Ducter, so pairing codes and push use it.
3. Ducter's own device auth kept: a one-time code, then a revocable per-device key; tailnet
   identity may add to it, never replace it.
4. A status probe (up / degraded / down, with a reason) for the Devices page.

Done when onboarding offers Tailscale when the CLI is present, and phone pairing, push and
reconnect all work. Start with [`research/21`](../research/21-v1-topology-remote-access.md) and
[`system.md`](system.md).
