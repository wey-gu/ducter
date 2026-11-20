# 172: Nowledge Mem for an Antigravity task

> 2026-11-20 · For D417. The author: "别忘了 agy 的 mem plugin 相关的工作"; earlier, for D393: Mem
> carried to every computer, never installed per machine, "远不止 mcp", and "不要把 mem 搞的过于复杂".
> Sources: Mem's public plugin repositories, cloned `--depth 1` into the session scratchpad and
> read only (`nowledge-co/nowledge-mem-google-antigravity` at 46022fe, 2026-11-01, plugin 0.1.3;
> `nowledge-co/nowledge-mem-gemini-cli`; `nowledge-co/community`); `nmem` 0.10.121 on this Mac (its
> `--help`, `plugins inspect`, and the strings of its binary, read only); OAR 0.124.0 as installed
> (`dist/runtimes/antigravity/{options,skill-files,state-directory}.js`); research/159 (D393) and
> research/171 (D416); this Mac's `~/.gemini` listing (names only). **No agy ran**: it is not
> installed here. Nothing touched the person's Mem, `~/.gemini`, `~/.claude` or `~/.ducter`.

## 1. What Mem has for Antigravity

- **A plugin of its own** (DOCUMENTED, README and `plugin.json`): `nowledge-mem-google-antigravity`
  0.1.3, "for Google Antigravity 2.0". It is hybrid:
  - `hooks.json` (top key `nowledge-mem-hooks`): **PreInvocation** `session-start` (on the first
    invocation reads the Context Bundle, `nmem context --source-app google-antigravity` or
    `GET /context?source_app=google-antigravity`, Working Memory as fallback, and injects it as an
    `ephemeralMessage` wrapped in `<nowledge_context_bundle>`); **PostInvocation** (drains an offline
    queue); **PreToolUse** gate (allow reads, `force_ask` deletes); **PostToolUse**; **Stop**
    `session-end` (reads agy's `transcript.jsonl` and saves the thread, reconciling the tail).
  - `mcp_config.json`: Mem's own MCP at `http://127.0.0.1:14242/mcp/` with an `APP` header.
  - `rules/nowledge-mem.md` (how to route recall) and ten `skills/` (search, distill, thread save,
    handoff, working memory, status, skill load/manage/propose, FS explore).
- **Install** (DOCUMENTED, README): a folder (or symlink, or clone) in the workspace's
  `.agents/plugins/` or in `~/.gemini/config/plugins/`; "Restart Google Antigravity". No per-session
  route is documented.
- **What its start hook writes** (VERIFIED, reading `hooks/nmem_shared.py`, `session-start.py`):
  - `sync_mcp_config_file`: rewrites the plugin folder's own `mcp_config.json` with the effective
    Mem address **and `Authorization: Bearer <key>` / `X-NMEM-API-Key`** (from env or
    `~/.nowledge-mem/config.json`), on every start;
  - `sync_host_skills_async`: `nmem skills connect antigravity` and `nmem skills sync` in the
    background (Mem's skills linked into the agent's skill folders);
  - an offline queue at `~/.nowledge-mem/plugins/antigravity/unsynced.json`, session state in
    `<session dir>/.nmem/`.
- **Mem's own CLI reads agy's sessions** (VERIFIED, `nmem t save --help` 0.10.121): `--from
  antigravity` "reads its documented persistent hook transcript, with trajectory-extractor JSON as
  fallback"; `--session-id`, `-p <project>`, `--space`, `--agent-id` (falls back to
  `NMEM_AGENT_ID`). The binary's own messages (strings, VERIFIED) name the layout: "For current
  Antigravity CLI/2.0 sessions, keep the official `brain/<conversationId>/.system_generated/logs/
  transcript.jsonl` files in place", under `.gemini/antigravity-cli`, and it reads
  `conversation_summaries.db` beside it for a conversation's parent.
- **`nmem context`** (VERIFIED, `--help`): the session-start Context Bundle, `--source-app`,
  `--agent-id`, `--space`, `--no-working-memory`.
- **Mem's own check doesn't know it yet** (VERIFIED, `nmem --json plugins inspect` 0.10.121): hosts
  listed include `claude-code`, `codex-cli`, `gemini-cli`, `deepseek-harness`, …; no
  `google-antigravity`. So Ducter can't learn from Mem whether the person's own agy plugin is on a
  computer.
- **Gemini CLI's extension** (`nowledge-mem-gemini-cli`, DOCUMENTED): a `gemini-extension.json`
  extension for Google's other CLI (`gemini`), with its own hooks and commands. agy is a different
  program; nothing says agy loads Gemini CLI extensions (OAR's discovery below reads none).

## 2. What agy can load, and how

From OAR 0.124 (DOCUMENTED by its shipped source, a reading of agy's own discovery):

- **Plugins and skills only from disk**: workspace `.agents` / `.agent` / `_agents` / `_agent`
  folders (`skills/`, `plugins/`, `skills.json`, `plugins.json`) from the folder up to its
  repository's root, then `~/.gemini/antigravity-cli`, `~/.gemini/config`, `~/.gemini`
  (`skills/`, `plugins/`), and `~/.gemini/config/{skills,plugins}.json` manifests; a plugin is
  `plugin.json` (or `.antigravity-plugin/`, `.gemini-plugin/`), switched off by
  `~/.gemini/config/config.json` `plugins.<id>.enabled: false` (`skill-files.js`).
- **No per-session plugin, extension or settings flag**: OAR refuses `userConfiguration`
  ("no verified separation of user configuration from its native login") and exposes no
  launch-args channel for agy (`options.js`). `--gemini-dir` (GEMINI_HOME) moves agy's whole state,
  its sign-in with it (`state-directory.js`), so an overlay home would be a second login.
- **MCP per session**: credential-free stdio and HTTP entries; any entry with `env` or `headers` is
  refused, because agy writes them in plain text into
  `<gemini dir>/antigravity-cli/conversations/<id>.db` (`options.js`). That id is the session's id
  (INFERRED from OAR's comment naming the database by the session).
- **Hooks**: Mem's plugin documents PreInvocation/PostInvocation/PreToolUse/PostToolUse/Stop with
  `injectSteps` replies (DOCUMENTED by Mem's plugin); OAR says nothing of a hook channel Ducter can
  pass per session (harness-facts `preCompactHook: false`).
- **Context files / rules**: only through the same folders (a workspace `.agents/` rule, the
  person's own); Ducter's instructions go by `appendSystemPrompt` (D416).

So **agy cannot load Mem's plugin for one session.** Every way in writes into the person's
repository (`.agents/plugins`) or their `~/.gemini` config, and once loaded, the plugin's start
hook writes the Mem key (for a task: the relay key) into its `mcp_config.json`, from where agy
loads it as an MCP entry with headers: exactly what D416 keeps off agy's disk.

## 3. Options

| Option | Context at start | Thread at end | Search during | Writes | Verdict |
|---|---|---|---|---|---|
| A. Mem's plugin linked into `~/.gemini/config/plugins` | its hook | its hook | its MCP + skills | the person's config; the key into `mcp_config.json`, then agy's DB | rejected (installs per machine; key on disk) |
| B. The plugin in the task's worktree `.agents/plugins` | its hook | its hook | its MCP + skills | the person's repository; the key on disk, as A | rejected |
| C. A GEMINI_HOME overlay with the plugin | its hook | its hook | as A | a second agy state, its own sign-in; the key as A | rejected (a second login; the Codex overlay of research/159 loaded nothing) |
| D. Mem's MCP through Ducter's stdio bridge | no | no | Mem's tools | a 0600 bridge file | partial; adds a second search surface beside `memory_search` |
| **E. Ducter runs the plugin's two steps with Mem's own nmem, on that computer, in the session's env** | `nmem context` in front of the first message | `nmem t save --from antigravity` after each turn | Ducter's `memory_search` (D168) | nothing | **chosen** |

E is the plugin's two lifecycle hooks done from outside, with Mem's own commands (so Mem's own
transcript reader, Space and identity rules), on the computer where agy runs and wrote its
transcript, with the same env the session has: elsewhere the relay's address and the task's key
(D393), on the home the person's own nmem setup. The key never lands on disk (nmem keeps an env
key in memory, research/159 §2) and is never in argv. Search stays the one `memory_search` tool
the task already has; D was cut (two search tools for one memory; nothing the person feels).

## 4. The ablation

| Part | Kept? | Why |
|---|---|---|
| The Context Bundle in front of the first message (new sessions only) | kept | the plugin's start hook; who the person is and what's current |
| The thread saved after each turn by `nmem t save` | kept | the plugin's Stop hook; the task's thread in Mem like the person's own sessions |
| `memory_search` and recall (D168) | kept, unchanged | existed |
| Skipping both when the person's own Mem plugin for agy is there | kept | never both (their plugin does both) |
| Mem's MCP over the bridge | cut | a second search surface; no felt loss |
| Mem's skills (distill, handoff) | cut | not loadable per session; `remember` through the partner as before |
| A save at close, an offline queue, a learning-proposal sync | cut | each turn's end saves it all again (Mem reconciles); a failure is tried once more |
| A line on the task's stream per step | cut | silence means success (D388's restraint); the relay already logs its use |

## 5. Owed live (no agy here)

1. That agy CLI writes `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`
   with no hook configured, and that the OAR session id is that `<id>` (INFERRED; nmem's message
   says the files are "official").
2. `nmem t save --from antigravity --session-id <id> -p <cwd>` saving it through the relay on hel.
3. The bundle reaching agy's first turn and its size there.
4. `sqlite3` over agy's conversation DB: no `dmr.` key (only the env holds it).

## Implications for Ducter

1. A per-harness fact `memSteps` (Antigravity): Mem's source app for the bundle, the `--from` host
   for the thread, and the plugin's manifest name to see the person's own.
2. The adapter (`runner/src/oar.ts`, `mem-steps.ts`) runs the two steps where the agent runs, home
   or worker, with the session's env; the runner asks for them when memory is on and the place
   isn't a browser.
3. Nothing installed, nothing written in `~/.gemini`, no key on disk; memory off means no step.
4. Gaps: memory off can't turn off the person's own agy plugin (no per-session switch); Mem's check
   can't see that plugin yet (no `google-antigravity` host in `plugins inspect`).

**Summary.** Mem has a real Antigravity plugin (hooks for the Context Bundle and the thread, an MCP,
rules, skills), but agy loads plugins only from folders in the person's repository or `~/.gemini`,
with no per-session flag, and the plugin writes the Mem key into its MCP config, which agy then
keeps on disk. So Ducter loads no plugin: it runs the plugin's two hooks itself with Mem's own
`nmem` (`context` before the first turn, `t save --from antigravity` after each turn) on the
computer where agy runs, in the session's env, and keeps `memory_search` for search. Live checks
of agy's transcript and the save on hel are owed.
