# 224: Which native commands reach each agent through OAR (D534)

The question: when a person types `/something` in a task's composer, which agent commands and
skills actually reach the agent through OAR 0.124, and where can Ducter read the list of them?
Read only, plus token-free reads of OAR's own inventories in a scratch home
(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HOME` all pointing at an empty scratch folder; the person's
config untouched) and a scratch project holding one Claude skill, one Claude command, one Codex
repo skill (`.agents/skills`) and one pi prompt template. No model was called: with the person's
own sign-ins off limits, no live turn could run, so invocation is VERIFIED only where earlier
research ran it (research/92 §4, research/108 B2).

## 1. What OAR offers

- **VERIFIED (code read, OAR 0.124.0 `dist/contracts/inventory.d.ts`)**: every runtime has
  `skills`, `commands`, `mcpServers` and `tools` readers taking an installation and a `cwd`,
  returning `ok` (with `view`, `items`, `partial`), `unsupported` or `unavailable`.
  `CommandEntry` is `{name, description?, source?, argumentHint?, aliases?}`; `SkillEntry` adds
  `scope`, `plugin`, `enabled`, `disableModelInvocation` and `userInvocable`.
- **VERIFIED (code read)**: input to every session is text plus images; Codex's
  `input-delivery.js` sends `[{type:"text"}, {type:"localImage"}]` only, never a `skill` or
  `mention` item, though the Codex binary knows both item types.

## 2. Per agent (token-free reads, 2026-11-24)

| Agent | Command catalog through OAR | Skills through OAR | A typed `/name` reaches it as |
|---|---|---|---|
| Claude Code 2.1.331 | **VERIFIED** `ok`, 50 items: the project's skill and command, and its built-ins with descriptions (`compact`, `clear`, `context`, `model`, `effort`, `code-review`, `simplify`, `init`, `security-review`, `deep-research`, …) | **VERIFIED** `ok`, 15 | the command, run headless (**VERIFIED** research/92 §4: a command, a skill, `/review`, `/compact`, `/context`, `/cost`, `/clear`, `/model`) |
| Codex 0.172.0 | **VERIFIED** `unsupported` (`transport_unavailable`): the app-server has no command catalog | **VERIFIED** `ok`, 7: the repo skill and Codex's system skills (`imagegen`, `openai-docs`, `skill-creator`, …) | text only: its slash commands are the TUI's and never reach it (**DOCUMENTED** research/92 §4); a bare `/compact` is OAR's manual compaction (D288, **VERIFIED** research/108); a skill named `$name` in the words reaches its model beside its skill listing (**INFERRED**: Codex's docs name `$name` as the explicit mention; through the app-server only the text arrives) |
| pi (OAR's pi, subprocess RPC) | **VERIFIED** `ok`: the project's prompt template (source `prompt`) | **VERIFIED** `ok`: the project's skill and the person's skills | its RPC `prompt` expands `/template` and `/skill:name` as its interactive mode does (**DOCUMENTED** pi `docs/rpc.md`); `/compact` is OAR's `compact()` |
| DeepSeek Harness | `unsupported` (`transport_unavailable`) | `installation_unsupported` here (not installed on this Mac) | `/compact` through OAR's manual compaction (declared `supported`); no verified way to run a skill by name |
| Antigravity 1.5.16 | `unsupported` (`transport_unavailable`) | `unavailable` (`not_authenticated` in the scratch home) | OAR declares its `/compact` unverified (`manualCompaction: unsupported`); nothing else |

Ducter's own `/model` and `/effort` are run by Ducter on every agent (D282), so the card stays true.

## 3. Gaps in OAR (drafts, not sent)

1. Codex: no command catalog and no structured skill input; a `{type:"skill", name, path}`
   input item from `deliver` would make `$name` exact instead of a hint to the model.
2. DeepSeek Harness and Antigravity: no command catalog; Antigravity's `/compact` has no
   verified completion contract.
3. pi in-process: inventories refuse a different environment (`scope_unavailable`); Ducter
   runs pi as a subprocess for tasks, where they work.

## Implications for Ducter

- The registry (`harness-facts.ts` `nativeCommands`) says per agent where the list comes from
  (`commands`, `skills`), how a skill is written (`$name`, `/skill:name`), what is always offered
  (`model`, `effort`, `compact` where it reaches the agent) and what is hidden (Claude Code's
  pickers and screens that need its terminal).
- A task's `/` list is read at runtime in the task's own folder, so a project's commands and
  skills come up there and nowhere else.
- Nothing that can't reach the agent is listed: Codex's TUI commands, Antigravity's `/compact`,
  DeepSeek Harness's skills. The live checks owed are in `design/todo.md`.

**Summary.** Claude Code: everything typed goes as typed, and OAR lists it (VERIFIED). Codex: only
`/compact` (Ducter's, through OAR) and its skills as `$name` (listing VERIFIED, invocation
INFERRED). pi: templates and `/skill:name` (listing VERIFIED, expansion DOCUMENTED). DeepSeek
Harness and Antigravity: Ducter's `/model` and `/effort`, plus `/compact` on DeepSeek Harness.
