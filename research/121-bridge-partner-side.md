# 121 · Bridge from the partner's side: its own tools only, 查看来信, and which Ducter gets the mail

**Date:** 2026-11-17. **For:** D333. **Builds:** Ducter at `efd2a24d` (0.0.67 + D328/D330), codex-cli
0.169.0 and nmem 0.10.119 on the author's Mac (read-only: `--help`, `codex mcp list --json`), OAR
0.95.1's Codex runtime source (read). Nothing was written to the author's Mem, hel or `~/.ducter`.

## 1. What happened on hel (as read by the coordinator, 2026-11-17 07:35 UTC)

| Finding | Tag |
|---|---|
| The author said "用 Bridge 查看来信，回复 Mem 协作 Codex 的联络测试。" The partner (on Codex) answered that Bridge was blocked by the current permissions and asked for the call permission to be opened. | REPORTED (the coordinator read the conversation) |
| Its Codex session listed the Nowledge Mem MCP server's own tools (`mcp__nowledge_mem__bridge_connect`, `bridge_im`, `bridge_contacts`, `bridge_send`, …), called `list_spaces`, then `bridge_im {action: "contacts"}` in four Spaces; each failed: "MCP tool call requires approval, but approval policy is never". | REPORTED |
| The home's own reader (`nmem --agent-context <ctx> bridge inbox`, identity `ducter`, Space "Only me") lists 15 handles, all logged or skipped; the author's Codex said it had delivered a message to "the Ducter under your name", unread. That message never reached the mailbox the home reads. | REPORTED |

So two things went wrong, independently: (a) a partner session that should carry none of the
person's MCP servers (D85: `isolateUserConfig`) still had Mem's, and the read-only sandbox's refusal
read to the model as a permissions problem to report; (b) the sender's `ducter` card led it to a
mailbox in another Space (or the Mac's leftover connection, D324), which no Ducter reads.

## 2. Why a clean Codex partner could still list Mem's server

| Finding | Tag |
|---|---|
| `codexCleanArgs` disables every `[mcp_servers.<name>]` in `$CODEX_HOME/config.toml` by name and turns off `features.plugins`, `apps`, `hooks`, …. On the author's Mac `codex <those args> mcp list --json` shows all twelve configured servers `enabled: false` and the three plugin-provided ones gone. | VERIFIED (codex-cli 0.169.0, 2026-11-17) |
| `codex mcp list --json` is Codex's own effective view: every layer (config.toml, profiles, plugins) merged, each server with `name` and `enabled`. It takes ~1.6 s and makes no network call to the servers. | VERIFIED (same) |
| Where hel's leftover came from is not known: a server outside config.toml (a profile, a managed layer), a config.toml Bun's TOML parser refuses (`readCodexConfig` then returns nothing to disable), or a plugin a build loads past `features.plugins`. | INFERRED (not read on hel, by the rule) |
| OAR's Codex tool denial (`disallowedTools`) needs a server name of word characters that is in the effective config, and the exact tool names; otherwise it throws at session start. `nowledge-mem` (a hyphen) can't be denied that way, and a home without the server would fail to start. | VERIFIED (OAR 0.95.1 `runtimes/codex/tool-denials.js`) |

So per-tool denial is the wrong layer for Codex. The robust one is to ask Codex itself which
servers the clean args leave on, and turn those off too (D333 (1)).

## 3. What Mem offers to say where a partner reads

| Finding | Tag |
|---|---|
| `nmem agents set <ID> --description <text>`: "Public profile description; does not change the Agent's identity"; "Only supplied fields change". `agents show <ID>` reads it. | DOCUMENTED (nmem 0.10.119 `--help`) |
| `agents card list/show`: "bounded public Agent Cards in one exact Space". `bridge contacts --all-spaces`: "every card names its Space". | DOCUMENTED (same) |
| A contact card carries the Agent's `description` (research/66 §2, 0.10.118 shapes); that a description set with `agents set` appears on the identity's cards in every Space is likely but not seen. | INFERRED |
| No verb disables or hides an identity's mailbox in one Space. `bridge connections revoke` ends "one own connection"; D324 already offers it for another home's connection. | DOCUMENTED (help) |
| nmem 0.10.120 is on PyPI (`pip index versions nmem-cli`). Its help was not read: it isn't installed here, and fetching and running it was not authorized for this task. | VERIFIED (the listing only) |

So the one lever Ducter has without the person is the card's words: Ducter enrolled `ducter` with
its own description (mem-identity.ts), so it may keep that description current, saying which Space
and which home read it. A stray mailbox in another Space can only be avoided by the sender reading
the card, or ended by the person in Mem (steps in `design/todo.md`).

## 4. Whether a task should keep the plugin's Bridge tools

| Finding | Tag |
|---|---|
| A task that keeps the person's setup keeps their Mem plugin, as the partner's identity (`NMEM_AGENT_ID`), with `NMEM_NO_MAILBOX_NOTICE=1` (D168). | VERIFIED (runner.ts) |
| The plugin's Bridge tools in a session connect *that session* (a native-session mailbox, "Bridge agent" on cards, research/66 §2); reading the partner's own mailbox takes the partner's agent context, which only the home's core holds. | INFERRED |
| Per-tool denial in a task has the same Codex limits as §2, and a task's Claude Code plugin tools are named by the plugin's own server name. | VERIFIED (OAR source) / INFERRED |

## Implications for Ducter

1. The partner's clean Codex session runs `codex <args> mcp list --json` once per setup and turns
   off any server still enabled other than Ducter's own; the other harnesses already load none of
   the person's servers (Claude Code `--strict-mcp-config`, pi `--no-extensions`, DeepSeek Harness a
   home of Ducter's).
2. The partner gets `bridge_check`: the home reads its mailbox now and the partner answers in the
   same turn; the persona names its four Bridge tools as its only way to other agents.
3. Ducter keeps the identity's Mem card saying where it reads, only over its own words.
4. Tasks keep the plugin as is: its Bridge tools speak as that session, not the partner's mailbox
   (inferred; a live check is owed).

**Summary.** hel's partner tried Mem's own Bridge tools because its "clean" Codex session still had
Mem's server, and called the sandbox's refusal a permission problem; the sender's card meanwhile led
it to a mailbox nobody reads. Codex's own server list closes the first, a check tool and one persona
paragraph the second, the card's words (and the author's steps in Mem) the third.
