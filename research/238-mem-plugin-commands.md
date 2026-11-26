# 238 · Nowledge Mem plugins: the exact commands per agent, and what an update task cost (2026-11-26)

The author, 2026-11-26 15:45 (a screenshot of 「为 haswell 上的 Claude Code 更新 Nowledge Mem」):
「我们的 nowledge mem 更新竟然是 agentic 的，太浪费了，应该把命令研究好直接执行命令，出问题了再 agent 接管吧？」
D466 had chosen a task over each host's own update command because Mem's guide named none per host
(`todo.md`, "A host's own plugin update command instead of a task"). This report finds the commands,
says how each was checked, and counts what the tasks cost on hel.

Sources: `--help` of the CLIs on the author's Mac (Claude Code 2.1.332, Codex 0.172.0, pi 1.6.x,
nmem 0.10.124), read-only runs of `nmem --json plugins inspect`, `nmem --json plugins check`,
`nmem --json doctor`, `nmem --json connect --detect-only`, `claude plugin list --json`,
`claude plugin marketplace list --json` and `codex plugin list --json` there; Mem's setup guide
https://mem.nowledge.co/SKILL.md (its "Last updated" 2026-11-04, read 2026-11-26); the
nowledge-co/community repository cloned fresh at 788484c (2026-11-25), read only; hel's Log read
with sqlite `?mode=ro`. No install or update command ran anywhere; nothing ran on haswell but one
`ls` of the worker's data folder.

Tags: VERIFIED (a command's help or a read-only run here), DOCUMENTED (Mem's guide or the plugin's
own README), INFERRED.

## 1. The commands

| Agent (Mem host id) | Installed version | Update | Install | Version read back |
|---|---|---|---|---|
| Claude Code (`claude-code`) | `nmem --json plugins inspect --host claude-code` → `installed_version` (VERIFIED); also `claude plugin list --json` → `{id: "nowledge-mem@nowledge-community", version, scope, enabled}` (VERIFIED, 2.1.332) | `claude plugin marketplace update nowledge-community` then `claude plugin update nowledge-mem@nowledge-community` (DOCUMENTED: the plugin README's "Update"; VERIFIED: both in `--help`; "restart required to apply") | `nmem connect --tool claude-code` (Ducter's D375 path), which runs `claude plugin marketplace add nowledge-co/community && claude plugin install nowledge-mem@nowledge-community` (VERIFIED: `connect --detect-only`'s `manualCommands`; DOCUMENTED: SKILL.md Step 3.A) | inspect again |
| Codex (`codex-cli`) | inspect (VERIFIED; with two marketplace copies it reports `installed_version: null` and each copy under `installations[]`); `codex plugin list --json` lists it too but took over 120 s here (it reads remote marketplaces), so not a fit for a quick read | `codex plugin marketplace upgrade nowledge-community`, `codex plugin add nowledge-mem@nowledge-community`, then the newest copy's `scripts/install_hooks.py` once (DOCUMENTED: the Codex plugin README's "Update": "Current Codex builds may refresh the marketplace checkout without reinstalling the already-installed package cache", so `plugin add` again, then refresh the hooks; VERIFIED: `marketplace upgrade [NAME]` in `--help`). The README's own route removes and re-adds the marketplace with a sparse checkout (old full clones time out after 30 s): left to the task that takes over. After it, Codex asks to trust the changed hooks in `/hooks` (DOCUMENTED): a person's step either way | `nmem connect --tool codex-cli` (D375), which runs `codex plugin marketplace add nowledge-co/community --sparse .agents --sparse nowledge-mem-codex-plugin && codex plugin add nowledge-mem@nowledge-community`, then `[features] plugins = true, hooks = true` and `install_hooks.py` (VERIFIED: `manualCommands`; DOCUMENTED: SKILL.md) | inspect again |
| pi (`pi`) | inspect (VERIFIED); `pi list` names `npm:nowledge-mem-pi` and its folder, no version (VERIFIED) | `pi update npm:nowledge-mem-pi` (VERIFIED: `pi update --help`: "`pi update <source>` Update one package"). The package README says bare `pi update`, which on this pi updates pi itself only (`--self` is the default): stale | `pi install npm:nowledge-mem-pi` (DOCUMENTED: SKILL.md) | inspect again |
| DeepSeek Harness (`deepseek-harness`) | inspect (D466) | none documented | `dsh plugin --profile web add github:nowledge-co/nowledge-mem-deepseek-harness` (DOCUMENTED: SKILL.md) | inspect again |
| OpenCode (not one of Ducter's agents) | – | `opencode plugin update opencode-nowledge-mem` on 2.x (DOCUMENTED) | `opencode plugin add opencode-nowledge-mem` (2.x) | – |
| Antigravity | skipped (D594) | – | – | – |

What is out: Mem's own `nmem --json plugins check` (read-only, VERIFIED) now lists Codex
(`available_version: 0.1.55`) besides Claude Code (`0.7.39`); D466's note that it lists Claude Code
only is stale for Codex. pi's newest is still read from npm (D576).

## 2. Mem's connection: does an update need it?

- **An update needs no Mem credential.** The commands above fetch from GitHub (the marketplace) or
  npm, and edit only the agent's own plugin folder (VERIFIED by what they are; nothing reads
  `~/.nowledge-mem/config.json`). So no `nmem doctor` gate belongs in front of one.
- **An install by `nmem connect --tool` needs Mem signed in on that computer** (D375): "With no link and
  Mem already signed in, the same command only connects the agents" (worker-mem.ts). Signing in is
  `nmem connect <link>` or `nmem connect --url <URL> --api-key <KEY>` (VERIFIED: `--help`), which
  writes `~/.nowledge-mem/config.json` (DOCUMENTED).
- **Could Ducter set it from what it has?** Technically yes: the home reads its own credential
  (`readMemCredential`, D393) and could run `nmem connect --url … --api-key …` on a worker. That copies a
  long-lived key to another computer, which D539 puts behind the person's Go. Not needed for updates,
  so not done here; the existing Settings › Memory sign-in for a computer (D366) stays the way in.
  Ducter's own tasks on a worker never needed it: D393's relay carries Mem to every task.

## 3. `nmem doctor`: which lines are about which agent

VERIFIED (`nmem --json doctor`, 0.10.124): `{checks: [...], failed}`; three checks have `tool: null`
(`credential home`, `server reachable`, `api key`), then one row per installed AI tool with `tool` set
(`claude-code`, `codex-cli`, `cursor`, `gemini-cli`, `opencode`). DOCUMENTED (SKILL.md): "`[FAIL]` on any
line exits non-zero"; Step 1 only needs the first three to pass; a tool row that fails because it
"points at a different server" is fixed with `nmem config mcp show --host <host>` in that tool's config.

So `nmem doctor` exiting 1 says nothing about Claude Code when only Codex's row fails. Worse inside a
Ducter task: the task's nmem reaches Mem through Ducter's relay (`NMEM_API_URL=<home>/mem`, mem-relay.ts),
so Codex's MCP config (Mem Cloud's address) reads as "a different server" from there even when it is
the same Mem (INFERRED from the code and the task's own words; see the "One Mem everywhere" rule).

## 4. What the tasks cost (hel's Log, read only)

Tasks whose title installs, updates, tidies or connects Nowledge Mem, since the first on 2026-11-09
(the D470 mailbox tasks not counted). Tokens from each turn end's usage (D588's way); "input"
includes cached input.

| When (UTC) | On | Agent's plugin | Ran on | End | Input | Cached | Output |
|---|---|---|---|---|---|---|---|
| 11-09 18:07 | hel | Codex (connect) | Codex | done | 794,323 | 754,176 | 3,654 |
| 11-10 11:50 | a MacBook | pi (install) | pi | done | 2,319,850 | 2,242,688 | 21,388 |
| 11-11 10:07 | a MacBook | Codex (install) | Codex | done | 397,365 | 357,760 | 967 |
| 11-21 02:07 | a MacBook | DeepSeek Harness (install) | DSH | done | 1,480,459 | 1,464,832 | 24,298 |
| 11-21 02:12 | haswell | Codex (install) | Codex | done | 699,038 | 668,928 | 3,273 |
| 11-24 16:04 | hel | Claude Code (update) ×3 | Claude Code | failed at start | 0 | 0 | 0 |
| 11-24 16:05 | hel | Claude Code (update) | Codex | done (0.7.37 → 0.7.38) | 480,386 | 428,928 | 2,376 |
| 11-25 11:26 | haswell | Claude Code (update) | Codex | needs input 19 min, then done (0.7.37 → 0.7.38) | 765,664 | 719,744 | 2,407 |
| 11-26 07:43 | hel | Claude Code (update) | Claude Code | done (0.7.38 → 0.7.39), 58 s | 404,585 | 354,897 | 2,466 |
| 11-26 07:43 | haswell | Claude Code (update) | Codex | 4 asks, a failure, then done (0.7.38 → 0.7.39), 5.5 min | 1,409,890 | 1,335,424 | 4,819 |
| **12 tasks** | | | | | **8,751,560** | **8,327,377** | **65,648** |

The seven update tasks alone (three failed at their start): 3,060,525 input (2,838,993 cached, so about 221,500 fresh) and 10,068 output,
for what is two commands and a version read each. haswell's two updates both stopped for the person:
on 11-25 because the brief allowed only the guide's steps and the guide named no update command for
Claude Code ("该命令未列在本次指定的指南里"); on 11-26 because `nmem doctor` exited 1 over Codex's MCP
address and the brief said "if `nmem doctor` fails, stop and ask the user for a connect link". The
person then pasted Mem's connect prompt; the one-time token (not a key) was written into hel's Log in 6
events (2 `decision_resolved`, 4 `task_event`), the first redeem answered 403, the retry succeeded and
the update ran: haswell's Claude Code reported 0.7.39 at 07:49 UTC (15:49 +08). The token is single-use
and was redeemed, so it is spent.

## Implications for Ducter

1. **Run the commands, read the version back, hand over only on failure (D597).** Claude Code, Codex and
   pi have documented commands; DeepSeek Harness doesn't and keeps the task. Success is inspect's
   version, never an exit code.
2. **No doctor in front of an update.** It needs no credential, and another agent's row is not this
   agent's. A task that does read the doctor reads only the three shared lines and its agent's row, and
   knows the relay's address is the same Mem.
3. **Never ask for a link or key in a reply box.** Ducter supplies its own Mem connection; the briefs say
   so, and a Mem link, token or key typed into a reply is hidden before it is kept.
4. **The commands live in the harness facts** (`memUpdate`, with this evidence), beside `memPlugin`.
5. Codex's update ends in a `/hooks` trust prompt the person answers in Codex; the done line already says
   to restart the agent. Stale: pi's README (`pi update`), D466's "check lists Claude Code only".

Summary: the update is two commands for Claude Code (`claude plugin marketplace update
nowledge-community`, `claude plugin update nowledge-mem@nowledge-community`), three for Codex, one for pi,
none known for DeepSeek Harness; inspect reads the version back. hel's twelve Mem setup tasks used 8.75M
input tokens (8.33M cached) and 66K output; haswell's update twice stopped on the person, once asking
for a connect link because another agent's doctor line failed.
