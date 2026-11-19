# 159. Mem carried to every task: one connection at the home, nothing per computer

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

| What | plugin (today) | ducter (today) | carried (D393, after the ablation §7) | Evidence |
|---|---|---|---|---|
| Recall at start: Context Bundle, Working Memory | yes, SessionStart hook | no | Claude Code: yes, the plugin goes with the task; others: as ducter | VERIFIED live §3 |
| A few memories matching the brief | no | yes, `<what_i_know>` | unchanged | built (D168) |
| Search mid-task | yes, skill + nudge | yes, `memory_search` | unchanged, both | VERIFIED hooks.json |
| Past conversations, distill, save a memory | yes, skills | no (proposes `remember`) | Claude Code: the plugin's; others: `remember` as before | VERIFIED skills |
| The task's thread to Mem when it ends | yes, Stop hook `nmem t save` | no | Claude Code: the plugin's, through the relay; others: no (as before; the Log keeps it) | VERIFIED live §3 |
| Bridge | plugin hooks; notices off in tasks (D168 (2)) | no | as plugin | DOCUMENTED |
| Identity and Space (D141, D312) | env | the partner's client | unchanged (env) | built |
| Nothing of Mem's on that computer | no | yes | yes | built, tested |
| A throwaway sandbox | no (sign-in per computer, link one-time) | MCP only | yes: two variables + one URL, per task | tested; live §3 |

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

- Claude Code takes `--plugin-url <url>` ("Fetch a plugin .zip from a URL for this session only")
  (`claude --help`). The home serves its own copy of Mem's plugin (the newest version in its Claude
  Code plugin cache, read only), as a stored zip, at `<home>/mem/kit/<task key>/claude-code.zip`.
- **Live (VERIFIED, 2026-11-19, `.shots/mem-carried/claude-plugin-url-live.json`, script beside
  it):** a real `claude -p --model haiku --plugin-url http://<this Mac's LAN address>:<port>/mem/kit/…`
  against the relay with a fake Mem behind; the person's own Mem plugin off for that run by
  `--settings enabledPlugins`, `NMEM_CLI_CONFIG_DIR` a scratch folder. Claude Code fetched the zip
  once over plain http, listed `nowledge-mem@inline` 0.7.37 among its plugins with all its skills
  and commands (`nowledge-mem:search`, `:save-thread`, `:distill-memory`, `:bridge`, …), ran
  SessionStart (`/health/details`, `/capabilities`, `/agent/feed/events` through the relay) and the
  Stop hook saved the thread (`GET /threads/claude-code-<sid>`, `POST /threads`), every call with
  the home's key; answer "ok", exit 0; no key on the scratch disk. Its SessionEnd hook failed with
  "Plugin directory does not exist": Claude Code removes a URL plugin's temp folder before
  SessionEnd runs (a Claude Code quirk; Stop had already saved the thread). The run's
  `~/.claude/projects` folder was deleted after.
- The hooks need `python3` and an nmem there: Ducter's own copy (D386); without an nmem the plugin
  isn't carried (the floor is). The person's own plugin there is reused, never doubled.
- **Codex (deferred):** Codex has no per-session plugin URL. A `CODEX_HOME` overlay (every entry of
  the person's Codex home linked, Mem's Codex plugin 0.1.53 added under a cache folder of Ducter's,
  switched on by `-c plugins."nowledge-mem@ducter-carried".enabled=true` and the plugin and hook
  features) ran a real `codex exec` (codex-cli 0.170.0, exit 0, "ok") but loaded no plugin: no call
  reached the fake Mem (VERIFIED). It needs a local marketplace of Ducter's (`-c marketplaces.<name>`,
  a `marketplace.json`) and its hooks trusted: not as small as Claude Code's one flag, so cut (§7).

## 4. The key a task carries (security pass)

- `dmr.<payload>.<mac>`: HMAC with the home's secret over `{task, expiry}` (30 days; a restart or
  resume mints a new one), compared with `timingSafeEqual`. Checked on **every** request: the task
  archived or dropped, memory off, or no Mem on the home closes it at once (no cache).
- The `/mem` route sits before the device gate, so the key is its own authentication; it opens only
  `/mem/*` (tested: `/mcp`, `/ws`, device routes answer 401 to it from off the machine).
- **Only Mem's data paths:** an allowlist by first path part, taken from the paths in nmem 0.10.121's
  own binary and those seen live (health, capabilities, memories, threads, context, agent, agents,
  spaces, rules, feed, fs, resources, search, artifacts, skills, entities, labels, communities,
  graph, wiki, ask, mailbox, bridge, collaboration, working-memory; a leading `/api` is the same).
  Refused: Mem's settings, keys and agent keys, Access Anywhere, licence, models, team, export and
  import, plugins, the `/agent/{trigger,tools,skill-builder,ontology-builder,ai-now}` job routes,
  every DELETE. An unknown path is refused.
- **Rate:** a burst of 60, then 10 a second, per task (the plugin makes about five calls at start).
- **Never logged:** requests, answers and keys; one line on the task's stream that it reached Mem
  through the home. The key is in the session's env and launch flags only, never in the Log, the
  brief or a report (tested). The caller's auth, cookies, forwarding and device headers are dropped;
  `set-cookie` is never passed back.
- A worker rewrites the loopback relay and plugin addresses to the home's without adding its device
  token. A sandbox needs only outbound HTTPS to the home.
- What a task can still do with its key: read and write the person's Mem as the persona for its
  life, which is what the plugin does anyway.

## 5. What Ducter needs from Mem

Nothing now (§7). The relay already gives per-task keys that die with the task; every identity is
the person's own account and Ducter launches the agent; the home's cached plugin works; the
allowlist comes from nmem's own paths. Worth telling Mem, not asking: Claude Code drops a URL
plugin's folder before SessionEnd (§3), so the plugin's SessionEnd save never runs there; its Stop
save does.

## 6. Options considered

- **A. MCP tools only.** Works anywhere, but loses the plugin: no Context Bundle, no skills or
  commands, no Bridge, a thinner experience than the person's own sessions. D168's search stays as
  the floor for agents without a carried plugin.
- **B. A key per computer handed over by the home** (the home writes `config.json` there). One
  secret per computer at rest, the person's full key in places Ducter can't clean (a sandbox image),
  revocation all-or-nothing (research/21: one key per server). Rejected while A+C work; it is the
  fallback if a relay is ever impossible (a sandbox with no route to the home).
- **C. Relay + carried plugin (chosen).** Zero setup per computer, nothing secret leaves the home,
  the full plugin, ends with the task. Costs: every Mem call from elsewhere goes through the home
  (latency of one more hop; a home asleep means no Mem, the same as no Ducter), and the relay must
  track Mem's API (its data-path allowlist, §4).

## 7. The ablation (the author: "不要把 mem 搞的过于复杂")

Every part was kept only if removing it loses something the person feels.

| Part | Kept? | Why |
|---|---|---|
| The relay with per-task keys | kept | without it, a sign-in on every computer and no sandbox |
| Mem's plugin by `--plugin-url` (Claude Code) | kept | one flag; the person's own plugin experience in the task |
| `memory_search` and recall (D168) as the floor | kept, unchanged | existed; agents without a carried plugin |
| A task-side `memory_save` tool | cut | the plugin saves; elsewhere `remember` through the partner as before |
| The home saving a thread for tasks without the plugin | cut | the Log keeps it; before D393 no such thread reached Mem either |
| Working Memory lines in the first turn | cut | the plugin's SessionStart gives the bundle |
| A Codex `CODEX_HOME` overlay | cut (deferred) | loaded nothing live; needs a marketplace of Ducter's and trusted hooks |
| Six asks of Mem | cut | none needed (§5) |
| The card's quiet line for the person's own sessions | kept | one line with a secondary button |

Before → after the ablation: production files touched 14 → 11 (new: `mem-relay.ts` only; the
Codex overlay file and the partner's task-memory additions removed); task tools 8 → 7 (no
`memory_save`; the task tool budget back to 9.2K); concepts the code knows: relay, task key, carried
plugin, floor (was also: task save, thread import, WM focus, Codex overlay); asks of Mem 6 → 0;
settings the person sees: none, before and after; what the person loses: nothing they had before
D393.

## Implications for Ducter

1. Mem is connected once, at the home. A task elsewhere gets two variables (the relay and a task key)
   and, for Claude Code, Mem's own plugin by URL; nothing else.
2. The per-computer sign-in (D366, D370) is for the person's own sessions there; the card says
   **这里的任务也记得你**.
3. D168's floor and writing rules stand for agents without a carried plugin.
4. Codex's plugin waits for a small enough way in (a marketplace of Ducter's).

**Summary:** nmem and Mem's plugin take their address and key from two variables and Mem takes a
bearer key, so the home serves as "Mem" for every task through a relay: a per-task key, data paths
only, rate-limited, dead with the task, the home's own key put on at the home. Claude Code loads Mem's
plugin from a URL for one session; verified live with a real Claude Code over LAN http: the plugin
loaded with its skills, and its start and end hooks reached Mem through the relay with the home's key,
nothing secret on that disk. After the ablation that is all D393 is; Codex's plugin and a run against
a real Mem remain.
