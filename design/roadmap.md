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
- A Mac app (Apple silicon, signed and notarized) that follows your Mac's light or dark (D302), a phone web client, and an
  [iPhone app in public beta](https://testflight.apple.com/join/Z4GvWt7t) with Go / Hold / Reply
  on notifications.
- Server mode on Linux: a systemd service, reached through Tailscale (private to your devices,
  no public ports: `ducter tailscale`, D265) or HTTPS on your own domain, and other computers
  that do tasks for your Ducter.
- Read your mail, calendar and other accounts with one tap through OOMOL's `oo`, or any
  OpenConnector / MCP server. Reads are logged; anything that sends or changes waits for Go.
- One-line install: `curl -fsSL https://ducter.ai/install.sh | sh`, and
  [skills](../skills/) so your own AI agent can deploy and run Ducter for you.

## Next

- **An Android app, from the release** (0.0.10, built; D178–D182): the APK on the GitHub
  Release, updating itself from there with a checksum and a same-key check, laid out at a
  foldable's fold. Owed before it ships: the release key and its secrets, Android developer
  verification, a real phone and a Chinese ROM. Notifications in the app come after
  (UnifiedPush, `todo.md`).
- **Move your Ducter between computers.** Start on a Mac, move to a server later (and back):
  one command moves the conversation, settings, routines and accounts; the old machine keeps
  doing tasks for its local repos. Designed (D504, `move.md`); the first slice, `ducter move
  --plan`, is built (read-only); receive, bundle, import, handover, cut-over and rollback are next.
- **Browse and use apps on your Mac from a server-hosted Ducter.** When your Ducter lives on a
  server, tasks that need your own Chrome, sign-ins or Mac apps run on your Mac (as a helper
  computer), with the same safety rules. Built with fakes: one tap in the Mac app makes the Mac a
  worker of the server (D155, kept running by a LaunchAgent); tasks browse there in your Chrome or
  Ducter's browser and use its apps (D157, D235); a task that needs your sign-in starts there, and
  one on the server that meets a sign-in page moves there instead of asking you to sign in on the
  server, your cookies staying on the Mac (D505). Owed: the live run (`ducter check run
  worker-browser`), and waiting for a sleeping Mac by default mid-task.
- **Real-world checks.** A long-conversation replay on real models, live runs of folder undo
  and native browser use. The Nowledge Bridge live trial passed on 2026-11-25 (below).
  The owed checks of D425–D459 are one command each since D463 (`ducter check list`, then
  `run <name>`; `design/build-and-run.md` "Live checks"); none has run for real yet.
- **Nowledge Bridge live trial** (your terminal agents reaching your partner, against Mem Cloud):
  - **2026-11-25 (D557, research/226 §4): passed, every check.** On the author's Mac with Mem's command line
    0.10.123, haiku both sides: handing work over (S1) 6 of 6, asking an agent (S2) 5 of 5 with the answer
    linked to the question, following up on silence (S3) 3 of 3, an agent asking for your call (X1) 3 of 3,
    and Mem marking an original as one. So Bridge is on by default: wherever Nowledge Mem is ready on your own
    home and you use agents of your own, your partner connects by itself (one switch in Settings turns it off;
    `DUCTER_BRIDGE=0` turns it off for the whole home). Step 3 below is done; steps 1, 2 and 4 are still
    owed on hel.
  - 2026-11-25 (D555, research/226): Mem's command line 0.10.123 adds read receipts; Mem's Antigravity
    plugin can now pass messages (it has its own row in Settings), pi's can't yet; Ducter's tasks no
    longer open a mailbox of their own. Ready to run, in this order, on the computer that receives
    your partner's messages (hel), after it runs a build with D555:
    1. Read only, any time: `nmem --version` (0.10.123 or later), then `ducter check run mem-shapes`.
       Its `receipts` step reads your partner's outbox and its `inbox-spaces` step says whether a
       Space still reports `cloud_mailbox_own_source_unreconciled` (nothing opened or sent).
    2. Read only, after any task: `nmem --json bridge connections list --space-id <Only me> --agent-id
       ducter` lists no new `codex` / `claude-code` connection made by a task.
    3. Done 2026-11-25 (above, on the Mac): `bun run bridge:live -- --real` (S1, S2, S3, X1 as the trial's
       own throwaway identity; about 7 minutes, removed after).
    4. Writes to Mem, your Go: in Antigravity on the Mac, `/nmem-bridge-chat` to send your partner one
       short test (its plugin may ask to enable its mailbox once in a Space; "Only me" is the one your
       partner reads); the Antigravity row then says it hands work over, and step 1's `receipts` shows
       whether the reply was opened.
  - Last full run (2026-11-16): handing work over (S1) 5 of 6 checks, asking an agent (S2) 4 of 5,
    following up on silence (S3) 3 of 3, an agent asking for your call (X1) 3 of 3. The misses: a card
    once named you in the third person (model wording), and an answer that Mem didn't yet link to the
    question it answers.
  - 2026-11-18, the live run on 0.10.120: S1 6 of 6, X1 3 of 3, Mem marks an original as one, but S2
    2 of 5 and S3 2 of 3. Mem's inbox lists 20 messages a page, oldest first, and the terminal side read
    only the first page of older mail, so it never saw the question; Ducter read only one page too. Now
    Ducter reads every page and the trial's terminal side touches only its own run's mail (D367,
    research/137); the rerun is ready.
  - 2026-11-18: Mem's command line 0.10.120 is the first to ask for linked answers and named senders,
    so the live rerun is ready to run; Ducter no longer mistakes a new message for the answer it waits
    on, and Settings › Talk with your other agents offers Mem's update where it is older.
  - 2026-11-17: Mem Cloud now links answers and names senders, but the newest Mem command line
    (0.10.119) predates that, so the live rerun waits on Mem's next release. The trial now runs as its
    own throwaway identity, made for the run and removed after it, so it never touches your partner's
    real mailbox and can run whatever else is connected (D324).
  - One home answers a partner's mailbox: a second computer never connects beside it on its own, and
    Settings says where it answers now, with one tap to move it or to keep only one (D324; fakes only).
  - Ducter is ready for Mem's new fields, never offers an agent Mem can't deliver to, and retries
    Mem's "can't right now" briefly without ever sending twice.
  - Mem running on your own computer (the app or a Vault): waits on Mem's local fixes.
- **The AI tools you use elsewhere reach you through Ducter** (draft): a terminal Claude Code or Codex sends
  its questions for you to your partner and gets your answer back; work from your own agents can
  start without asking once you say so; a team's agents can reach your partner when you let them.
- **Quota awareness.** Keep a reserve for your partner, prefer the account with the most limit
  left, and fall back gracefully when one runs low.
- **Remote access without a domain.** Built for a server: your own Cloudflare tunnel
  (`ducter anywhere`, D228) and Tailscale (`ducter tailscale`, D265). Still to do: a live
  tailnet check of pairing, push and reconnect from a phone, and a status probe per address
  (up / degraded / down, with a reason) on the Devices page.
- **Device keys and passkeys** on top of today's one-time pairing codes.

## Later

| | |
|---|---|
| **Phone calls** | Your partner places a call for you, with disclosure up front and you able to listen in or take over |
| **Phone use** | Tasks that operate an Android or iPhone app |
| **Voice** | Talk to your partner hands-free, as a call (the first step, hold to talk and read aloud, is built: D305) |
| **More AI agents** | Cursor, Gemini, Kimi and others as their command-line agents mature |
| **Your own small apps** | Pages and tools your partner builds for you to keep (the first steps are built: tables, charts, lists and choices in a reply, D303; a table, chart or list pinned at the top of the conversation and kept current by your partner, D381) |
| **Leaner runtime** | A Go runner with no JavaScript runtime, and an embedded database option |

## Not planned for now

- Taking over an AI agent session while it is still running in your terminal. A finished one can
  be carried on from Past tasks (D299).
- A hosted Ducter: it stays self-hosted, on your own machines. The one piece Nowledge runs is
  the notification relay for the iPhone app (D159): it forwards Apple notifications, encrypted
  end to end, and nothing else.

## Help wanted

**Other private networks.** `ducter tailscale` covers Tailscale (research/86). Headscale, ZeroTier,
NetBird or plain WireGuard work today by saving the address you set up in `~/.ducter/public-url`;
a one-command path for one of them, shaped like `ducter tailscale` (the address checked, then a
code), is welcome. Start with [`research/86`](../research/86-tailscale-reach.md) and
[`system.md`](system.md) ("Reaching it").
