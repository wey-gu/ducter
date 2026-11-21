# 203: Nowledge Mem plugin updates: inspect, check, and the way to update (D466)

Date: 2026-11-22. Machine: the author's Mac, nmem 0.10.122. Everything below was read-only:
`nmem --json plugins inspect`, `nmem --json plugins check`, `nmem plugins check` (plain),
`nmem plugins --help`, `nmem connect --help`, `claude plugin --help`, and Mem's setup guide at
https://mem.nowledge.co/SKILL.md (fetched, "Last updated 2026-11-04"). No `nmem connect`, no
plugin install or update, no write to any agent's config or to Mem. The fixtures committed with
D466 are this machine's answers: `packages/protocol/fixtures/mem-check/mac-2026-11-22.json` (whole)
and `packages/protocol/fixtures/mem-inspect/mac-2026-11-22.json` (trimmed to six hosts; no paths
are in inspect's answer).

## 1. Two checks, two questions

| | `plugins inspect` | `plugins check` |
|---|---|---|
| Asks | what is registered in each agent here | is a newer plugin out |
| Network | none (`local_only: true`) | yes, Mem's published plugin list |
| Hosts | 14 (codex-cli, claude-code, pi, kimi-code, opencode, openclaw, copilot-cli, gemini-cli, cursor, droid, hermes, grok, alma, deepseek-harness) | 7 (claude-code, gemini-cli, cursor, droid, openclaw, alma, bub) |
| Says | `installation`, `enabled`, `installed_version`, `installations[]` with each copy's version, `recommended_action`, `warnings` | `installed`, `installed_version`, `available_version`, `update_available` (true / false / null), `updates_available` |

VERIFIED (both commands, this Mac):

- **inspect never knows a newer version exists.** Its `recommended_action` here is `none`, `review`
  or `install`; alma is 0.7.9 with 0.7.12 out, and inspect says `review` (for an activation reason),
  never `update`. Ducter's D169 parser already maps an `update` or `upgrade` action to the update
  line, but nothing on this Mac ever says it.
- **check is the only word on "newer".** Today: alma 0.7.9 → 0.7.12, `update_available: true`;
  claude-code 0.7.37 = 0.7.37, false. Plain output marks the update with its own arrow glyph and
  "update available"; it prints no command to run.
- **check does not need the person's Mem.** With `--api-url http://127.0.0.1:9` (nothing listening)
  it answered the same JSON in 0.5 s, exit 0. So it reads a published list, not the Mem server, and
  needs no sign-in. INFERRED: the list is the same for every computer, so one answer on the home is
  enough for every worker's inspect.
- **check and inspect disagree on what is installed.**
  - OpenClaw: inspect `installed`, `installed_version` 0.8.31, enabled; check `installed: false`,
    `available_version` 0.8.43, `update_available: false` (it looks in another place).
  - Cursor: check `installed: true`, `installed_version: null`, `update_available: null` ("installed;
    update status unknown; check with host"); inspect `unknown`, `review`.
  - So inspect stays the authority on what is installed and which version; check is read only for
    `available_version`, and "update" is inspect's version below it.
- **check does not list Codex, pi, OpenCode, Hermes or DeepSeek Harness** (Ducter's agents with a
  Mem plugin are Claude Code, Codex, pi and DeepSeek Harness). For three of Ducter's four agents no
  update can be known today; only Claude Code's can. INFERRED: Mem will add hosts to check; Ducter
  matches by the host id inspect uses (`codex-cli`) and by its own id (`codex`), so a new host is
  picked up without a change.

## 2. The author's Codex: two registrations

VERIFIED (inspect, `host: codex-cli`): `installation: installed`, `enabled: null`,
`installed_version: null`, `recommended_action: review`, `installations` = two `user` /
`marketplace` copies, versions 0.1.10 and 0.1.53, both `enabled: true`; warning "Multiple
registrations or cached versions exist; no effective version or enablement is inferred."

How Ducter showed it before D466: the coin line "Nowledge Mem 装了不止一份，需要检查 / is installed
more than once; worth a look", button 检查 / Sort it out, whose ask said "要在 … 上为 Codex **安装**
Nowledge Mem 吗？" and whose task brief said "Set up … The user tapped Install". Calm, but not
specific (which copies?), and the ask and the task said the wrong thing. `present()` already counts a
review as the plugin there (D174 (6)), so Ducter's own recall stays out of Codex tasks; unchanged.

## 3. The official way to update, per host

DOCUMENTED (SKILL.md): the guide is "a machine-readable install SOP", reached by the prompt "follow
the instructions to install **or update** Nowledge Mem for the AI tool I am using"; its rule 1 is
"one source of truth for install". Per host, for updates:

| Host | What the guide says |
|---|---|
| Claude Code | install command only (`claude plugin marketplace add …` then `claude plugin install nowledge-mem@nowledge-community`); no update line |
| Codex | install command, then `scripts/install_hooks.py` once, `[features]` in `~/.codex/config.toml`, restart, trust hooks; no update line |
| pi | `pi install npm:nowledge-mem-pi`; no update line |
| OpenCode | 2.x: `opencode plugin update opencode-nowledge-mem` |
| Step Code | `step update npm:nowledge-mem-step-code` |
| Dim | `git -C community pull` and `dima plugin reload nowledge-mem` |
| Hermes | rerun the setup script; it prints the version |
| WorkBuddy | the plugin card's Update, not marketplace removal |
| DeepSeek Harness | install command only |

VERIFIED (help): `claude plugin` has `enable`, `disable`, `details`, `configure` and more; an update
verb is not something Mem's guide names for Claude Code. `nmem connect --tool` registers only
claude-code, codex-cli, cursor, gemini-cli and opencode, and its registration "is additive and
removes nothing" (its own help): it is an install path, not an update or a de-duplication.

So the official route for an update is the guide itself, followed for that host: exactly what D169's
setup task already does for an install. Ducter does not run a host's plugin command directly for an
update: the guide doesn't name one for Ducter's agents, and Codex needs more than one command.

Duplicates (two Codex copies): the guide has no step for them. The one hint is WorkBuddy's "use the
plugin card's Update, not marketplace removal". A task told to leave one copy must use only the host's
own commands, never delete files by hand, and stop and report the copies when there is no command.

## 4. The nmem CLI itself

VERIFIED in code: D229's `nmem status`.update (`core/src/bridge-link.ts`, `update_available`,
`latest`) still drives D329's Update all item and the Memory pane's update row; nothing to rebuild.

## Implications for Ducter

1. Run `plugins check` on the home, at most once a day beside the daily inspect, with a 15 s cap;
   keep the last good answer (in `mem-plugins.json`) and say nothing when it fails.
2. Read only `available_version`; "update" = inspect's version below it, on every computer.
3. Say the versions: "0.7.34, 0.7.37 is out" and "in twice: 0.1.10 and 0.1.53".
4. The tap is the same setup task with a brief that says which: update from → to, keep one copy
   (host commands only), or sort out; the ask in place says the same.
5. Show the ones worth a tap (update, several copies) as rows in Settings › Memory's Nowledge Mem
   group, beside the coin line; never a card, never by itself, never in Update all (that one runs at
   night by itself and a plugin update is a task that edits the agent's own setup, D17).
6. Owed: an update seen live end to end (no agent here is behind today; alma is, but Ducter has no
   alma agent), and Mem adding Codex and pi to `check`.

**Summary.** `plugins inspect` (local) knows what is installed but never that a newer plugin is out;
`plugins check` (a published list, no Mem server needed, under a second) knows the newest version but
disagrees with inspect about what is installed and lists only seven hosts, of Ducter's four agents
only Claude Code. Ducter reads check's `available_version` alone and lays it over inspect's version
on every computer. Mem's guide is its own update route ("install or update"), so the tap is the same
setup task, its brief and ask saying update, keep one or sort out. The author's Codex has two
marketplace copies, 0.1.10 and 0.1.53, now said by version with 理成一份 / Keep one.
