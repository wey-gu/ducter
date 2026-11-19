# 155. Mem carried to every task: one connection at the home, nothing per computer

**Question (the author, 2026-11-19):** "为什么我们在一个 computer 里装了 mem 在别的 computer 里还要单独做一遍？
未来我们支持那些 sandbox 模型环境又要怎么做？" and, after a first look: "关键是要维护在其他机器上的 plugin
配置那些哈 看看怎么优雅做到 远不止 mcp 的". The person's memory lives in one place, their Mem. A
computer is only where a task happens to run. So Mem should reach every task from the one
connection at the home, with nothing set up per computer, and it must work where nothing can be
installed or kept: a container, a fresh VM per task, a harness's own cloud sandbox, with outbound
network only, possibly only to Ducter. And not a thinner substitute: Mem's whole plugin (its hooks,
skills, commands, Bridge, the agent's own identity and Space).

Sources: Ducter's code at a8fe3347 (`runner/src/runner.ts` specFor and memoryMode,
`partner/src/partner.ts` task memory, `core/src/mcp.ts`, `runner/src/worker-host.ts`,
`core/src/worker-mem.ts`); Mem's Claude Code plugin 0.7.37 as installed on the author's Mac (read
only: `hooks/hooks.json`, `scripts/*`, `skills/*/SKILL.md`, README); `nmem 0.10.121 --help` and
its subcommands' help (read only); `claude --help` (2.1.x on this Mac); research/21, 47, 69, 136,
141, 144. A live check with the real nmem and the real plugin hooks against a fake Mem (below).
Nothing touched the person's real Mem.

## 1. Audit: what a task gets today, by path

"plugin" = the person's own Mem plugin installed for that agent on that computer (D168 (1));
"ducter" = Ducter's stand-in where it isn't (D168 (4)); "carried" = this note's design.

| What | plugin (today) | ducter (today) | carried (D393) | Evidence |
|---|---|---|---|---|
| Recall at start: Context Bundle (owner, agent, Space, rules) | yes, SessionStart hook `nmem context --agent-id` | no | yes: the same plugin, its nmem pointed at the home | VERIFIED `nmem-hook-context.py` |
| Working Memory at start | yes (bundle preview, `wm read` fallback) | no | yes (plugin); Ducter path: 3 focus lines in `<what_i_know>` | VERIFIED; built |
| A few memories matching the brief | no (bundle is general) | yes, `<what_i_know>` ≤ 4 | yes where no plugin goes | built (D168) |
| Search mid-task | yes, plugin skill + UserPromptSubmit nudge | yes, `memory_search` ≤ 6 reads | both, unchanged | VERIFIED hooks.json |
| Past conversations (thread search) | yes, skill | no | plugin: yes; Ducter path: no (todo) | VERIFIED skills |
| Saving a memory | yes in practice (distill skill); D168's brief told it not to | no (proposes `remember`) | yes both: plugin's own, or `memory_save` (≤ 2, the partner's guards) | built |
| The task's thread to Mem when it ends | yes, Stop/SessionEnd `nmem t save --from <agent> --session-id` | **no** | plugin: its own; Ducter path: the home imports it from the Log (`nmem t import --id ducter-task-<id> --agent-id`) | VERIFIED save script; built |
| Distill a thread into memories | yes, skill (`t distill`) | no | plugin: yes; Ducter path: Mem's own (if it distills imports by itself, unknown) | INFERRED |
| Bridge (mailbox, session identity) | plugin hooks; Ducter sets `NMEM_NO_MAILBOX_NOTICE=1` (D168 (2)) | no | same as plugin; a per-task identity needs Mem (§5) | DOCUMENTED |
| Identity and Space (D141, D312) | `NMEM_AGENT_ID`, `NMEM_SPACE` in the env | the partner's client names them | unchanged: env for the plugin, `--agent-id` for the home's imports | built |
| Works with nothing of Mem's on that computer | no | yes (all from the home) | yes | built, tested |
| Works in a throwaway sandbox | no (sign-in per computer, link one-time 15 min) | MCP only | yes: env + plugin by URL + per-task key | tested with fakes; live hooks below |

**Cost per computer today, on a worker** (D366, D370, D375, D386): tap 装上 (uv and nmem into
Ducter's folder, ~10 s and 57 MB on a bare Ubuntu, VERIFIED research/136); walk to Mem's app,
Settings › Connectors › Any AI agent, generate a connect prompt; paste it within 15 minutes; 登录
(Mem's `connect` signs in and registers its plugin for Claude Code and Codex); restart the agents.
About 3 taps, 1 pasted link, 1 trip to another app, per computer, again after a key rotation or
expiry (D375 signed_out). On the home: Mem connected once (Settings › 记忆). For a sandbox the
per-computer route cannot work at all: the link is single-use, the sign-in would be redone every
task, and a stored key would land in an image or a disk nobody cleans.

## 2. Can a computer's nmem talk to the home instead of Mem? Yes.

- nmem (Rust, 0.10.121) and Mem's plugin take the address and key from `NMEM_API_URL` and
  `NMEM_API_KEY` over the credential home (`~/.nowledge-mem/config.json`, or
  `NMEM_CLI_CONFIG_DIR`) (DOCUMENTED: plugin README "environment variables (`NMEM_API_URL`,
  `NMEM_API_KEY`) for temporary overrides"; research/69).
- Mem's remote API takes `Authorization: Bearer <key>` or `X-NMEM-API-Key` (DOCUMENTED,
  research/21). So a relay that checks a key of its own and swaps in the real one is invisible to
  nmem and to everything built on it.
- The home's credential is readable without asking nmem for it: the credential home holds exactly
  `{apiUrl, apiKey}` (VERIFIED: key names only, values never printed). `nmem config client show`
  says only `apiKeyConfigured` (VERIFIED). Ducter reads the file on each request and never writes it.
- A local Mem (`http://127.0.0.1:14242`) answers loopback without a key unless the person asked
  otherwise (DOCUMENTED, research/21): the relay then forwards with no key.

**Live check (VERIFIED, 2026-11-19, `.shots/mem-carried/live-hooks-through-relay.{ts,json}`):**
a scratch HOME with nothing of Mem's, the env holding only `NMEM_API_URL=<relay>/mem`,
`NMEM_API_KEY=dmr.…` (the task key) and `NMEM_AGENT_ID`; the plugin unpacked from the zip the
relay served; the real `nmem` 0.10.121; the real plugin 0.7.37 hook scripts run as Claude Code
runs them; a fake Mem behind the relay.
- SessionStart (`nmem-hook-read.sh --hook`) reached Mem through the relay: `GET /health/details`,
  `GET /capabilities`, `GET /agent/feed/events…`, and answered Claude Code's hook JSON. The Context
  Bundle call itself was not reached: with `NMEM_AGENT_ID` set the script first resolves the
  identity's lane and the fake Mem's generic answers didn't satisfy it (INFERRED to work against a
  real Mem; the relay forwards every path the same way).
- Stop (`nmem-hook-save.py --event stop`): nmem read the session's transcript there and sent
  `GET /threads/claude-code-<sid>` then `POST /threads` with the messages. Saved through the relay.
- Every request reached Mem with the home's key (`allHomeKey: true`); the home's key was nowhere on
  the sandbox's disk, and neither was the task key (nmem keeps an env key in memory only).

## 3. Carrying the plugin itself

- Claude Code takes `--plugin-url <url>` ("Fetch a plugin .zip from a URL for this session only",
  repeatable) and `--plugin-dir <dir|zip>` (VERIFIED `claude --help`). So the home serves its own
  copy of Mem's plugin (the newest version in its Claude Code plugin cache, read only), zipped, at
  `<home>/mem/kit/<task key>/claude-code.zip`, and a task elsewhere starts with `--plugin-url`:
  hooks, skills and commands load for that session; nothing is installed, nothing is left.
  NOT VERIFIED live: that `--plugin-url` accepts plain `http://` (a worker on a LAN) and the zip's
  layout (manifest at the root). Fallback if it doesn't: the worker fetches the zip over its own
  connection and passes `--plugin-dir <file.zip>`.
- The hooks need `python3` and an nmem on that computer. nmem: Ducter's own copy (D366, D386:
  `<data>/tools`, first on the agents' PATH). Python: present on macOS and every mainstream image;
  where it isn't, the hooks print a fallback and do nothing (VERIFIED in hooks.json), and Ducter's
  own memory is what the task has. The home knows from the worker's Mem look whether an nmem is
  there; without one the plugin isn't carried (the MCP floor is).
- Codex: Mem connects Codex through its own `connect --tool codex-cli` (D375), and Codex has no
  per-session plugin URL (INFERRED: none in its `-c` keys Ducter uses). A per-task `CODEX_HOME` overlay holding Mem's
  Codex plugin is the way (the person's own Codex config untouched); not built (todo). pi, DeepSeek
  Harness: Mem has no plugin for them; the MCP floor and the home's thread save are their memory.
- **The person's own plugin already there:** reused, never doubled: no `--plugin-url`, and its nmem
  is pointed at the relay too (the env wins), so the same identity and one connection hold.

## 4. The key a task carries

- `dmr.<payload>.<mac>`: HMAC with the home's secret over `{task, expiry}` (30 days; a restart or a
  resume mints a new one). Valid only while the task lives (not archived, not dropped), memory is on
  and the home has Mem. It opens only `/mem/*` on the home: never `/ws`, `/mcp` or a device route.
- The relay drops the caller's auth, cookies, forwarding and device headers, adds the home's key,
  refuses every DELETE and Mem's administration paths (keys, Access Anywhere, licence, settings,
  export, restore: INFERRED names; Mem's REST paths aren't documented), and never logs a request or
  an answer, only that a task used it (one line on its stream).
- **Reachability:** a worker reaches the home already; the worker rewrites the loopback relay and
  plugin addresses to the home's (as for MCP), without adding its device token (a sandbox there
  must not hold that). A sandbox needs only outbound HTTPS to the home. Through Access Anywhere
  (D228, D293) the same holds for a cloud sandbox.
- What a task could still do with its key: read and write the person's Mem as the persona, for
  its lifetime. That is what the plugin does anyway; scoping it tighter needs Mem (§5).

## 5. What Ducter needs from Mem (asks for Weizhen)

1. **Scoped, delegated keys:** mint a key from the person's key, bound to one AI identity (and
   Space), with an expiry and revocable on its own, and without admin rights. Then the relay's
   path list and the 30-day cap become Mem's own enforcement, and a cloud sandbox could even talk
   to Mem directly. (`nmem keys` "Agent credentials delegated by your membership" exists; whether it
   mints such keys for a personal Mem is not documented to us.)
2. **Identity pinned by the key:** a request through a task key acts as the persona's identity
   whatever `NMEM_AGENT_ID` the task's env says (today the env decides).
3. **A thread API by agent identity:** `t create`/`t append` have no `--agent-id`; `t import` does
   (VERIFIED help). Confirm `t import --id <same> --expected-message-count N` appends a suffix
   idempotently, and that imported threads are distilled like captured ones (or say how to ask).
4. **Plugin as a downloadable artifact:** a versioned zip per host (Claude Code, Codex) at a stable
   URL with a checksum, so the home needn't depend on its own Claude Code's cache, and a version
   the home can match its nmem to.
5. **Documented REST paths for admin vs data**, so a relay or proxy can allow data and refuse admin
   without guessing.
6. **Bridge for a task:** a sub-identity (persona/task) the home can mint so a task can be addressed
   without becoming the persona's mailbox; today D168 (2) keeps Bridge out of tasks.

## 6. Options considered

- **A. MCP tools only** (search, save, Working Memory on Ducter's task MCP). Works anywhere, but
  loses the plugin: no Context Bundle, no skills or commands, no Bridge, a thinner experience than
  the person's own sessions. Kept as the floor for agents Mem has no plugin for.
- **B. A key per computer handed over by the home** (the home writes `config.json` there). One
  secret per computer at rest, the person's full key in places Ducter can't clean (a sandbox image),
  revocation all-or-nothing (research/21: one key per server). Rejected while A+C work; it is the
  fallback if a relay is ever impossible (a sandbox with no route to the home), and then only with
  Mem's scoped keys (ask 1).
- **C. Relay + carried plugin (chosen).** Zero setup per computer, nothing secret leaves the home,
  the full plugin, ends with the task. Costs: every Mem call from elsewhere goes through the home
  (latency of one more hop; a home asleep means no Mem, the same as no Ducter), and the relay must
  track Mem's API (it forwards blindly, so only the admin list needs care).

## Implications for Ducter

1. Mem is connected once, at the home. Every task, on any computer or in a sandbox there, gets it
   through the home: the relay for its nmem, Mem's plugin by URL for Claude Code, Ducter's own
   memory (recall, search, `memory_save`, Working Memory focus, the thread saved at the end) where
   no plugin goes.
2. The per-computer sign-in (D366, D370) is re-scoped to the person's own sessions there (outside
   Ducter): the card says **这里的任务也记得你** and offers 装上 or 登录 quietly; never required for tasks.
3. A task may save what the user stated as lasting (≤ 2), as the plugin lets any agent; the rest is
   proposed with `remember` (D168 (5) narrowed).
4. Sandboxes: the env (two variables) and one `--plugin-url` are the whole kit; Ducter's nmem and
   python come with the image or the worker; nothing is written there.
5. Ask Mem for scoped keys, identity pinned by key, a thread API by identity, a plugin artifact, and
   documented admin paths.

**Summary:** nmem and Mem's plugin already take their address and key from two variables, and Mem
takes a bearer key, so the home can serve as "Mem" to every task: a per-task key that dies with the
task opens a relay that adds the home's real key. Claude Code loads a plugin from a URL for one
session, so Mem's plugin goes with the task too. Checked live with the real nmem and plugin hooks
against a fake Mem: start and end hooks reached Mem through the relay with the home's key, and no
secret landed on the sandbox's disk. Codex's plugin overlay, Mem's scoped keys and a live run
against a real Mem remain.
