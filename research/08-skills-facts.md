# 08 · Skills, plugins, extensions: facts

> Research input for principle 15 ("how skills, plugins, and harness config reach windows is open").
> This file contains facts only. Design is left to the lead. Gathered 2026-11-08.
> Tags: **[V]** VERIFIED (read locally, run read-only, or observed in source/tests) ·
> **[D]** DOCUMENTED (official or primary docs; secondary sources are flagged "2nd") ·
> **[I]** INFERRED (my reading; not checked).
> OAR = `botiverse/oar` @ `2e235c8` (2026-11-07), cloned fresh into the scratchpad. Paths below are repo-relative.

---

## 1. The Agent Skills standard (SKILL.md)

**Origin and governance.** Anthropic shipped Skills for Claude on 2025-10-16 and published the format as an
open standard at agentskills.io on 2025-12-18 [D, 2nd: unite.ai, techradar]. The spec repo is
`github.com/agentskills/agentskills`. The home page says "originally developed by Anthropic… open to
contributions" [D: agentskills.io]. The spec page shows **no version number or changelog** [D]. Versioning
appears only as per-vendor extensions and Claude Code version gates (§2).

**Format** [D: agentskills.io/specification]:
- A skill is a directory with a `SKILL.md` file. The optional subdirectories are `scripts/` (executable),
  `references/` (docs read on demand) and `assets/` (templates/data). Any other files are allowed.
- Required frontmatter:
  - `name`: 1–64 characters, `[a-z0-9-]`, no leading, trailing or double hyphen, and **must match the parent
    directory name**.
  - `description`: 1–1024 characters, covering both what the skill does and when to use it.
- Optional frontmatter: `license`; `compatibility` (≤500 characters; environment requirements); `metadata`
  (a string→string map, where vendors put things like `version`); `allowed-tools` (space-separated
  pre-approved tools, marked **Experimental**, and "support may vary").
- The body is free Markdown. "The agent will load this entire file once it's decided to activate a skill."
- **Progressive disclosure, three tiers:**
  1. Metadata (about 100 tokens per skill) loads at startup for all skills.
  2. The body (<5,000 tokens recommended; keep `SKILL.md` <500 lines) loads on activation.
  3. Resources load only when needed.
  File references should be relative and at most one level deep.
- Validator: `skills-ref validate ./my-skill` checks frontmatter and naming.
- **No integrity field.** The spec has no hash, signature or provenance field (§6).

**Vendor extensions beyond the spec** (these are not portable):
- Claude Code adds `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`,
  `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`, and
  `` !`cmd` `` dynamic injection [D: code.claude.com/docs/en/skills]. Outside Claude Code (claude.ai uploads,
  the Skills API), "only name, description, license, compatibility, metadata, allowed-tools are allowed.
  Other keys cause a hard error" [D].
- Codex adds the sidecar `agents/openai.yaml`, which holds `interface.*`, `policy.allow_implicit_invocation`
  and `dependencies.tools` (for example MCP servers) [D: learn.chatgpt.com/docs/build-skills].
- pi adds `disable-model-invocation` [D].
- OpenCode adds `metadata.opencode/autoinvoke` and `disable-model-invocation` [D].
- Cursor adds `paths` and still accepts the legacy `globs` [D].

**Adopters** (only those I confirmed on a per-harness docs page, §2): Claude Code / Agent SDK / claude.ai,
Codex + ChatGPT, pi, Gemini CLI (now Antigravity CLI for unpaid tiers since 2026-06-18), OpenCode, Cursor,
Kimi CLI / Kimi Code, Grok (OAR probes `_x.ai/skills/list`), Hermes Agent, Letta.
- The agentskills.io client showcase is rendered by JavaScript, so I could not count it. Secondary sources say
  "40+" adopters [D, 2nd].
- `nmem skills hosts` knows 58 host targets and their skill directories (§4) [V].
- The vercel `skills` CLI claims 75–91 agent targets [D, 2nd].

**Convergence on `~/.agents/skills`** [D]. This shared directory is read by:
- Codex: it is the *only* documented user path.
- pi, Gemini CLI (as an alias), OpenCode (compat), Cursor, Kimi Code.
- Claude Code does **not** list it. Its user path is `~/.claude/skills`.

---

## 2. Per-harness discovery, loading, catalog, injection, exclusion

### Claude Code (CLI + Agent SDK)

**Discovery paths** [D: /docs/en/skills]:
- enterprise (managed dir) `.claude/skills`
- `~/.claude/skills`
- project `.claude/skills`, from the start directory up to the repo root
- nested `<subdir>/.claude/skills`, loaded lazily when files there are touched
- `--add-dir` dirs (name clashes get a prefix like `/cli:verify` from 2.1.309)
- plugin `skills/`, namespaced `plugin:skill`, so they never collide
- claude.ai-synced skills in `~/.claude/skills/synced/`; the `anthropic-skills` namespace is reserved for them

**Precedence:** enterprise > personal > project. A skill replaces a same-named `.claude/commands` file.

**Catalog** [D]:
- Names and descriptions are always in context.
- `description` and `when_to_use` are combined and **truncated at 1,536 characters** (setting
  `skillListingMaxDescChars`).
- The whole listing has a budget of **1% of the model's context window** (setting `skillListingBudgetFraction`
  or env `SLASH_COMMAND_TOOL_CHAR_BUDGET`). On overflow, "the listing always contains every skill name" but
  descriptions are dropped, **least-invoked first**.
- `/doctor` and `/skill-doctor` report the listing's cost, and `/context` shows its size after the budget.
- **Observed [V]:** this research session's own context has about 215 listed skills, and dozens appear
  name-only (for example `blog-google`, `careful`, `cso`, `ship`). This matches the overflow behaviour.
- **Where the listing sits:** the Skills overview attachment arrives as a `<system-reminder>` block in a
  conversation message, not in the system prompt [V, observed in this session's context]. The prompt-caching
  doc says "skill loading… append[s] their instructions as conversation messages, so the cached prefix stays
  intact," and "Claude Code never invalidates the cache for a plugin's skills, commands, agents, hooks…
  It appends their content after the existing conversation" [D: /docs/en/prompt-caching].
- Tool definitions, including MCP tools, *are* in the system-prompt layer. Adding or removing them
  invalidates the cache unless tool search defers them, which is the default on supported models [D].
- After compaction, skill descriptions are rebuilt from the current skills (≥2.1.304). Invoked bodies are
  re-attached at ≤5K tokens per skill and ≤25K tokens total [D: /docs/en/context-window].

**Body loading:** on `/name` or a model call to the `Skill` tool. The content then stays in the conversation and
is not re-read [D].

**Live reload:** `~/.claude/skills`, project and add-dir skill dirs are watched (not in bare mode). New top-level
dirs need `/reload-skills`; plugin hooks/MCP/agents need `/reload-plugins` [D].

**Disabling skills** [D]:
- `disableBundledSkills`
- deny `Skill` or `Skill(name *)` in permissions
- `skillOverrides: {name: "on"|"name-only"|"user-invocable-only"|"off"}`
- `disableSkillShellExecution`
- `syncClaudeAiSkills: false`

**Host controls (CLI)** [D: /docs/en/cli-reference]:
- `--bare` skips auto-discovery of hooks, skills, commands, subagents, plugins, MCP, auto memory and CLAUDE.md.
  "Skills in a directory you pass with `--add-dir` still load."
- `--disable-slash-commands` disables all skills and commands.
- `--setting-sources user,project,local` chooses which sources load.
- `--plugin-dir <dir|zip|folder-of-plugins>` loads plugins for this session only.
- `--strict-mcp-config` with `--mcp-config` uses only the given MCP servers.
- `--settings` is an inline or file JSON overlay (≤2 MiB).
- `--agents` takes a JSON definition of subagents.

**Host controls (Agent SDK)** [D: /docs/en/agent-sdk/skills]:
- Skills are filesystem-only: "The SDK doesn't provide a programmatic API for registering them."
- They are discovered through `settingSources`; `[]` means no skills.
- The `plugins` option takes a local path (it maps to `--plugin-dir`).
- `skills: [names] | "all" | []` is an allowlist. Unlisted skills are hidden from the model and rejected by the
  Skill tool, but their files stay readable and `/name` dispatch still works.
- The `system/init` message lists the loaded `skills` and `slash_commands`.

**Implication [I]:** per-session programmatic injection on Claude means writing a temporary plugin dir and passing
`--plugin-dir`, or a temporary `--add-dir`, plus optional `skills` or `skillOverrides`.

### Codex

[D: learn.chatgpt.com/docs/build-skills]

**Paths:**
- REPO: `$CWD/.agents/skills` and each parent up to the repo root
- USER: `$HOME/.agents/skills`
- ADMIN: `/etc/codex/skills`
- SYSTEM: bundled `skill-creator` and `skill-installer`
- Symlinks are followed. Same-name skills **are not merged; both appear**. The page states no precedence.

**Catalog:**
- Each entry has a name, description and **file path**.
- Budget is **≤2% of the context window** (8,000 characters if the window is unknown), raisable via
  `skills.max_context_tokens` up to 10,000 tokens.
- On overflow, descriptions are shortened first, then skills may be omitted with a warning.
- The full `SKILL.md` loads only when the skill is selected. Explicit invocation uses `$skill` or `/skills`.

**Disabling:**
- `[[skills.config]]` entries with `path` or `name` and `enabled=false` in `~/.codex/config.toml`; the last match
  wins.
- `[skills.bundled] enabled=false` in a trusted project `.codex/config.toml`.
- A restart is required.

**Prompt placement** [V, OAR `docs/runtimes/codex.md:595-602`, `:819-820`]: raw `thread/start` frames show each turn
opening with "developer skills/plugin instructions." The catalog sits around `baseInstructions`, not inside it.
Codex's cache is a thread cache (principle 13).

**Programmatic surface** [V, OAR `docs/runtimes/inventory.md:31-41`]:
- The app-server `skills/list {cwds}` returns metadata, path, scope, enabled and plugin identity.
- One probe returned 25 skills: 23 enabled, 19 user, 6 system.

**Exclusion** [V]: OAR refuses `userConfiguration: "exclude"` for Codex. The reason given is that "codex isolated
homes can persist temporary history paths in the shared index, breaking resume after cleanup"
(`packages/oar/src/runtimes/codex/options.ts:4`). The remaining levers are config overrides on
`thread/start`, `[[skills.config]]` and `CODEX_HOME` [I].

### pi

[D: pi-mono `packages/coding-agent/docs/skills.md`; V: OAR `docs/runtimes/pi.md:811-824`]

**Paths:**
- `~/.agents/skills` and project `.agents/skills` from cwd up to the repo root
- the agent dir's skills (`~/.pi/agent/skills`)
- settings resources and Pi packages
- Discovery is recursive for `SKILL.md`.
- On a collision **the first discovered skill wins**, with a warning.

**Catalog:**
- Name, description and path go **into the system prompt**: `<available_skills>` after the project context and
  before the cwd line [V OAR]. It is present only when the `read` tool is available.
- The model reads `SKILL.md` itself, or the user forces it with `/skill:name`.
- `/reload` picks up edits.
- Invalid fields warn; a skill missing its description is not loaded.

**Exclusion:** the resource loader's `noSkills` drops *all* skills, project ones included. OAR declines to use it.
OAR refuses `userConfiguration: "exclude"` for pi: "no verified per-session exclusion… while retaining its native
login" (`runtimes/pi/open.ts:106`).

**Injection** [V OAR spec]: pi takes session MCP servers through an extension that OAR registers. `skills()` comes
from the SDK resource loader. In subprocess mode the RPC path `get_commands` splits out `source:"skill"`.

### Gemini CLI (Antigravity CLI)

[D: geminicli.com/docs/cli/skills]

**Tiers**, lowest to highest precedence:
1. built-in
2. extension skills
3. user `~/.gemini/skills` or the `~/.agents/skills` alias
4. workspace `.gemini/skills` or `.agents/skills`

Within a tier, `.agents/` beats `.gemini/`.

**Catalog:** name and description go into the **system prompt** at session start.

**Activation:** through the `activate_skill` tool, behind a **user consent prompt** that shows the directory the
skill will access. On approval the body and folder tree are added to history and the directory is added to the
allowed paths.

**Commands:** `/skills enable|disable|reload|link`.

### OpenCode

[D: opencode.ai/docs/skills]

**Paths:**
- `~/.config/opencode/skills`, plus the compat paths `~/.claude/skills` and `~/.agents/skills`
- project `.opencode/skills`, `.claude/skills` and `.agents/skills`
- a `skills` array in `opencode.json`, which also accepts **http(s) catalogs**

**Precedence**, lowest to highest: built-in < `.claude` < `.agents` < global opencode < project `.opencode` <
explicit config.

**Catalog:** the IDs, names and descriptions are listed "at each model step." Loading goes through the `skill` tool
with `{id}`.

**Permissions:** per-skill `allow` / `ask` / `deny`, with wildcards; the last match wins. `deny` hides the skill
and rejects it on load.

### Cursor

[D: cursor.com/docs/context/skills]

**Paths:** `.agents/skills`, `.cursor/skills`, `~/.agents/skills` and `~/.cursor/skills`, plus the compat paths
`.claude/skills`, `.codex/skills`, `~/.claude/skills` and `~/.codex/skills`. Discovery is recursive.

**Behaviour:** `paths` scopes a skill to matching files, and `disable-model-invocation` makes it explicit-only.
GitHub installs must arrive as a plugin from a marketplace.

**Cloud agents** do not copy `~/.agents/skills`.

**OAR:** OAR's `userConfiguration:"exclude"` for Cursor maps to `local.settingSources: []`
(`runtimes/cursor/model.ts:144`) [V].

### Kimi

[D, 2nd-hand reconciliation: moonshotai.github.io/kimi-cli, kimi.com/code docs]

- The older kimi-cli used `~/.kimi/skills`, then `~/.claude/skills`, then `~/.codex/skills` (priority
  kimi > claude > codex), plus `~/.config/agents/skills` or `~/.agents/skills`. It also accepted `--skills-dir`
  and `extra_skill_dirs`.
- The newer Kimi Code uses `~/.kimi-code/skills` (or `$KIMI_CODE_HOME`) and `~/.agents/skills`, with project
  `.kimi-code/skills` and `.agents/skills`. Priority is Project > User > Extra > Built-in.
- OAR found no skill inventory on the ACP surface (`docs/runtimes/kimi.md:14`) [V]. It refuses exclusion because
  of a workspace-index link race (`runtimes/kimi/options.ts:8`) [V].

### Grok

[V: OAR]

- `inspect --json` returned 29 skills; `_x.ai/skills/list {cwd}` returned 28, with paths, scope and invocation
  restrictions (`docs/runtimes/inventory.md:76-77`).
- The per-process flag `--plugin-dir <DIR>` (manifest `<DIR>/.grok-plugin/plugin.json` plus `.mcp.json`) attached
  servers in a probe. A host can pass it via `launchArgs` (`docs/runtimes/grok.md:765-768`, `:922`).
- OAR refuses exclusion.

### OAR's cross-harness contract

[V]

**`userConfiguration`** (`packages/oar/src/contracts/session-options.ts:166-178`):
- `"exclude"` "skips user plugins, skills, commands, agents, MCP servers, hooks, memory and settings while
  retaining the native login, native session history and host-provided session options." It "does not…
  sandbox tools," and project configuration stays runtime-specific.
- **Claude and Cursor are the only runtimes that implement it.** Every other runtime refuses it with
  `UnsupportedOptionError`: codex, pi, pi-durable, kimi, grok, opencode, qwen, qoder, codebuddy, antigravity,
  dsh and morph.

**Claude exclusion** (`runtimes/claude/user-configuration.ts:66-79`, `docs/runtimes/claude.md:1685-1730`):
- It sets `--setting-sources project,local --strict-mcp-config`.
- It sets `claudeMdExcludes` for `~/.claude/**`, `$CLAUDE_CONFIG_DIR/**`, `~/CLAUDE.md` and `~/CLAUDE.local.md`,
  because "the project ancestor walk can load home memory as project memory."
- It sets the env vars `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
- **Project skills and memory remain enabled.**
- It refuses an aliased-path cwd (`/var` vs `/private/var`), because Claude 2.1.309 then classified *user* skills
  as *project* skills.
- A native regression test (`sea-trial/vendor/claude-user-configuration.vendor.test.ts:23`) asserts that
  `user-skill`, `user-command`, `user-agent`, `plugin-skill` and the user MCP tool are absent under exclusion and
  present under inclusion.

**Mapping notes for Claude** (`docs/runtimes/claude.md:1664-1679`):
- SDK `plugins` → `launchArgs: ["--plugin-dir", path]`
- `settingSources` → `launchArgs`
- `--agents` → `launchArgs`

  There is **no first-class OAR skills or plugins option**. Session-scoped extension is done through
  `mcpServers` (every runtime except Cursor) plus raw `launchArgs`.

**`SessionOptions.mcpServers`** (`session-options.ts:204-230`):
- These servers are added *on top of* the user's, which are dropped only under exclude.
- They are not remembered, so they must be passed again on resume.
- Name clashes resolve per runtime: Codex merges field by field; pi fails the open; elsewhere the session's
  server replaces the user's.
- `serveMcpTools()` serves host tools over HTTP. This is how "one Ducter tool server goes into every harness."

**Inventories** (`docs/spec/inventory.md`):
- `runtime.skills|commands|mcpServers|tools(installation,{cwd})` are queries independent of any session.
  "No Session inventory methods."
- Each result has a `view`: `discovered` / `context` / `registered` / `mcp-only`, plus a `partial` flag.
- Supported for skills: Codex (`skills/list`), Claude (`get_context_usage` skill frontmatter, which gives "token
  counts" per skill), Grok (`inspect`) and pi (SDK loader). The rest are `unsupported`.
- A warning: inventory "can load and run that workspace's code (pi's project extensions, a configured stdio MCP
  server)."

---

## 3. Plugins and extensions

**Claude Code plugins** [D: /docs/en/plugins-reference]:
- **Layout:** optional `.claude-plugin/plugin.json`; `skills/`, `commands/`, `agents/`, `hooks/hooks.json`,
  `.mcp.json` (also `.mcpb`/`.dxt` bundles, including **remote https bundle URLs**), `.lsp.json`,
  `output-styles/`, `workflows/`, `themes/`, `monitors/`, `bin/` (added to the Bash `PATH`) and `settings.json`
  (only `agent` and `subagentStatusLine` take effect).
- **Namespacing:** every component is `plugin:name`.
- **Manifest fields:** `version` pins; `dependencies` lists other plugins; `defaultEnabled`; `userConfig`, where
  `sensitive` values go to the OS keychain.
- **Variables:** `${CLAUDE_PLUGIN_ROOT}` changes on update. `${CLAUDE_PLUGIN_DATA}` points to
  `~/.claude/plugins/data/<id>/` and persists.
- **Marketplace:** `marketplace.json` entries have a `strict` mode. Installed plugins are cached under
  `~/.claude/plugins/cache`. `enabledPlugins` lives in settings.
- **Validation:** `claude plugin validate` checks path containment (`..`), MCP URL and credential warnings, and
  reserved names that look like Anthropic's ("claude-*", "official").
- **The docs show no signature or provenance field** [D]. Version pinning is by `version` string or git source.
- **Cache:** enabling a plugin's skills, commands or hooks is cache-safe (appended). Its MCP servers follow the
  MCP rules [D: prompt-caching].
- **Evals:** `claude plugin eval` with a `tool_used: Skill` grader measures trigger rate [D].

**Codex plugins** [D, 2nd: developers.openai.com/codex/plugins/build plus secondary blogs]:
- The manifest is `.codex-plugin/plugin.json`, with `skills/`, `hooks/`, `.mcp.json`, `.app.json` and assets at
  the root.
- Marketplaces live in repo `.agents/plugins/marketplace.json` or `~/.agents/plugins/marketplace.json`, managed
  with `codex plugin marketplace add|list|upgrade|remove`.
- The cache is `~/.codex/plugins/cache/<mkt>/<plugin>/<ver>/` [2nd].
- Plugin skills work across ChatGPT, the Codex app and the Codex CLI [D].

**Grok:** `.grok-plugin/plugin.json` via `--plugin-dir` [V OAR].
**Gemini CLI:** "extensions" bundle skills (tier 2 above) [D].
**pi:** extensions are in-process TypeScript, and "Pi packages" add skills [D]. OAR uses an extension to register
session MCP [V].

**MCP vs skills cost, Claude** [D]:
- MCP tool defs sit in the system-prompt layer, so they are cache-sensitive. Tool search keeps "the tool list from
  the conversation's first request for the whole conversation," so late servers arrive as deferred definitions.
- Skills sit in the message layer.
- [V OAR `docs/runtimes/claude.md:930`]: since 2.1.304 a custom `ANTHROPIC_BASE_URL` also enables tool search by
  default.
- [V Claude Code 2.1.319 binary strings, 2026-11-09]: a server opts out of deferral per server (`alwaysLoad: true`
  in its MCP config entry) or per tool (`_meta: {"anthropic/alwaysLoad": true}` in `tools/list`). Unless the server's
  entry says `alwaysLoad: false`, a tool loads up front when its server says `alwaysLoad: true` or its own `_meta` does.
  OAR 0.95.1's `--mcp-config` writer passes only `type/url/headers` (http) or `type/command/args/env` (stdio), so
  the per-server key can't be set through OAR; the per-tool `_meta` can, from Ducter's own server. Ducter sets it on
  every tool (fresh-user QA: a haiku task called a deferred `checkpoint` with `{}`).

---

## 4. Cross-tool registries and managers

**Nowledge Mem managed skills** (`nmem` 0.10.116, read-only commands only) [V]:

*The model.* Each skill is an entity in Mem with these fields:
- `id`, `name`, `kind` (only `capability` observed), `stage`
- `source` (`imported` | `learned`), `scope` (`workspace` | `space`), `version` (an integer)
- `content_hash`, `body_hash`, `bundle_hash`, `code_surface_digest`
- `verification.state` (observed: `unproven`), `triggers`, `tools`
- `evidence_count`, `source_memory_count`, `use_count`, `success_rate`, `has_scripts`, `enabled`

*Lifecycle.*
- Stages: `candidate` → `promotable` → `draft` → `active` → `stale` → `archived`.
- Authoring commands: `create` (optionally from your work), `import` (GitHub, gist), `enroll` (hand-written skills
  in tool dirs).
- `activate` and `deactivate` control which skills are materialized.

*Evolution loop.*
- `outcome <id> --version N --outcome completed|completed_with_deviation|failed|abandoned` with optional
  `--deviations`, `--missing` and `--failure` "feeds the eval loop."
- `eval [--run] [--strict]` runs a benchmark; `--strict` is a "with/without comparison."
- `sharpen` runs an optimize loop (1–8 rounds) that "stage[s] a proven-better version." `refine`, `apply` and
  `replace-body` stage edits.
- `check-upstream` fetches "a complete immutable upstream bundle as a pending review."
- `copy-preview` and `copy-confirm` create forks; the latter is idempotent.

*Distribution.* `connect <host>` / `disconnect` / `sync` project the active skills into a host's skills dir. The
mode is `client_projection` into `~/.nowledge-mem/skill-projections/<hash>/skills-active`, then linked.

*Scripts gate.* `allow-scripts <id> --bundle-hash` lets a teammate's script-bearing skill reach this device "for
exactly one version (its bundle hash)."

*MCP tools.*
- `find_skills(query, limit=5)`: "Find active user skills; read via mem_fs."
- `report_skill_outcome(skill_id, skill_version, outcome, deviations?, missing?, failure?, thread_id?)`.
- These mirror `skills match` and `skills outcome`.

*Local state.*
- 82 skills: 78 active, 3 candidate, 1 archived.
- 79 imported, 3 learned; **all 82 `unproven`**; 6 have `use_count > 0`; none has scripts; all at version 1.
- `skills hosts` lists 58 host targets, **none connected** (state `absent` everywhere).
- `skills match` returned `404: skill not found` for a test query. So in this install, Mem-managed skills are not
  what any harness currently loads.

**skills.sh / vercel `skills` CLI** [D, 2nd]:
- `npx skills add <owner/repo>` and `npx skills find`.
- It installs into many agents' dirs (claims of 40, 75 or 91 targets, depending on date).
- The skills.sh leaderboard ranks skills by **anonymous CLI install telemetry**; one snapshot shows `find-skills`
  at about 3.3M installs.
- Locally, `~/.agents/.skill-lock.json` (format v3) records per skill `source`, `sourceUrl`, `skillPath` and
  `skillFolderHash` [V]. This is a lockfile with a content hash, **not a signature**.

**Marketplaces:**
- Claude plugin marketplaces (`known_marketplaces.json`) [V]; Codex `.agents/plugins/marketplace.json` [D].
- Cursor requires marketplace plugins for GitHub installs [D].
- Third-party directories mentioned in papers: ClawHub (OpenClaw), skillsmp.com, skills.rest.

**Learned and auto-generated skills, with evidence:**
- **SkillsBench** (arXiv 2602.12670, Feb 2026; NeurIPS 2026 poster) [D, 2nd summaries]:
  - Curated skills: **+16.2 pp** average pass rate across 7 agent-model configurations. The range runs from
    +4.5 pp (software engineering) to +51.9 pp (healthcare), and 16 of 84 tasks got worse.
  - **Self-generated skills: −1.3 pp** ("models cannot author the procedural knowledge they benefit from
    consuming").
  - Smaller model + skills ≥ larger model without them.
- **Letta skill learning** (vendor blog, unreplicated) [D]: skills are generated from trajectories plus verifier
  logs. Terminal-Bench 2.0 improved by **+15.7 pp absolute / 36.8% relative** in one post and **+9 pp / 21.1%**
  (Sonnet 4.5, 89 tasks) in another. Context-Bench Skills (2025-11-07) found that **selecting the right skill from
  a library is harder than using an identified one**.
- **Hermes Agent** (Nous, MIT) [D, 2nd]: creates skills autonomously after complex tasks (secondary sources claim
  "≥5 steps"), "self-improving during use," `/learn`, agentskills.io-compatible. I found no benchmark.
- **Voyager** (Wang et al. 2023) is the original agent skill library. It stored executable code skills with
  embedding retrieval, and its ablation showed the library was necessary in Minecraft [I: from memory, not
  re-fetched].
- **Claude Code skill-creator** [D: /docs/en/skills tail] has an eval loop: with-skill vs without-skill benchmark,
  blind A/B between versions, and description tuning (should-trigger and should-not-trigger hit rate).
- The local `skillify` skill (gstack) "codif[ies] the most recent successful /scrape flow into a permanent
  browser-skill" [V, frontmatter only].
- **Net evidence:** human-curated skills reliably help on average, with variance by domain. Unrefined
  self-generated skills do not. Learned skills help when grounded in **verifier feedback** (Letta) or
  with/without evals (skill-creator, `nmem sharpen`). Only vendor evidence exists for the last point.

---

## 5. Measured costs

**Skill catalog token cost.**
- Spec estimate: about 100 tokens per skill for metadata [D].
- Harness budgets: Claude Code 1% of the window; Codex 2% of the window (≤10K tokens); pi, Gemini and OpenCode
  publish no budget [D].
- Local measurement [V, frontmatter `name`+`description` characters ÷ 4]:
  - `~/.claude/skills`: 149 skills, 41.7K characters ≈ **10.4K tokens** before budget (279 characters per skill
    on average).
  - `~/.agents/skills`: 104 skills ≈ 6.9K tokens.
  - These exceed both Claude's 1% budget (for windows under about 1M) and Codex's 2% budget. That explains the
    name-only entries observed in §2.

**Tool definitions** [D: anthropic.com/engineering/advanced-tool-use, 2025-11-24]:
- Cost: 58 tools across 5 MCP servers ≈ 55K tokens (GitHub alone: 35 tools ≈ 26K). Anthropic has seen 134K
  tokens of tool defs before optimization.
- **Tool Search with `defer_loading`:**
  - About 8.7K tokens vs about 77K, which is −85%.
  - MCP-eval accuracy: **Opus 4 49%→74%; Opus 4.5 79.5%→88.1%.**
  - "doesn't break prompt caching because deferred tools are excluded from the initial prompt."
  - Recommended when there are >10 tools or >10K tokens of definitions; keep the 3–5 most-used tools loaded.
- Programmatic tool calling: −37% tokens (43.6K→27.3K).

**Selection degradation as the count grows:**
- **RAG-MCP** (arXiv 2505.03275) [D, 2nd summaries]:
  - MCP stress test: baseline selection accuracy fell from about 85% with 5 tools to about 45% with 20.
  - With retrieval, accuracy stayed ≥80% up to about 50 tools.
  - On MCPBench: 43.13% vs 13.62% accuracy, with about half the prompt tokens.
- **Microsoft Research "Tool-space interference"** (2025-09) [D]:
  - Survey of 1,470 MCP servers. The largest exposes 256 tools; 10 more expose >100 each; GitHub MCP has 91.
  - Some tools return >128K tokens.
  - It cites the OpenAI API's 128-tool max and its guidance of "well below 20."
- **OpenAI function-calling guide** [D, 2nd copies]: "Aim for fewer than 20 functions at any one time… soft
  suggestion."
- **Letta Context-Bench Skills:** skill *selection* is the harder subproblem (above).

**Cache interaction** [D: Claude prompt-caching]:
- Skill bodies, listings and plugin skills are appended, so they are cache-safe.
- Upfront tool-definition changes invalidate the whole prefix.
- A skill with a `model:` field that differs from the session's is a **model switch**, which means a full uncached
  re-read for that turn.

---

## 6. Security and supply chain

- **"Agent Skills in the Wild"** (arXiv 2601.10338, Jan 2026) [D, 2nd summaries]:
  - Scope: 42,447 skills collected and 31,132 analyzed (skills.rest, skillsmp.com) with SkillScan.
  - **26.1% have ≥1 vulnerability**, across 14 patterns in 4 classes: prompt injection, data exfiltration,
    privilege escalation, supply chain.
  - **Skills that bundle scripts are 2.12× more likely to be vulnerable** (OR, p<0.001).
  - More than 100 skills were removed after disclosure.
- **Snyk "ToxicSkills"** (Feb 2026, ClawHub) [D, 2nd]:
  - 3,984 skills audited; 36.82% have ≥1 flaw; 13.4% critical; **76 confirmed malicious payloads**.
  - The typical payload is malicious *natural-language instruction in the body*, not code.
- **ClawHavoc** (Jan 2026): a reported campaign of 1,184 malicious skills across 12 compromised publisher accounts
  [D, 2nd, OWASP Agentic Skills Top 10 case studies; flagged as less reliable].
- **CSA research note:** "SKILL.md agent context poisoning" [D, 2nd].
- **Attack surfaces in the formats themselves** [D, from §2–3]:
  - Claude `` !`cmd` `` runs **before the model sees the skill**; "Injected commands are checked against permission
    rules and don't prompt."
  - Claude `hooks:` in skill frontmatter stay active until the session ends.
  - Plugin `bin/` goes on the `PATH`, and plugin MCP can download remote `.mcpb` bundles.
  - `allowed-tools` pre-approves tools.
  - Skill files stay readable via Read/Bash even when allowlisted out (SDK).
- **Provenance mechanisms that exist:**
  - (a) **NVIDIA**: detached OpenSSF Model Signing (OMS, Sigstore-style) over the skill *directory tree*, as
    `skill.oms.sig`, verified with `model-signing`. Strict mode fails if unsigned files are added. It "does not
    prove a skill is safe" [D: docs.nvidia.com/skills/signing-agent-skills].
  - (b) Content hashes: the vercel lock `skillFolderHash` [V]; Nowledge `bundle_hash` plus per-bundle-hash
    `allow-scripts` and immutable upstream bundles held for review [V].
  - (c) Claude plugin `version` pinning, `claude plugin validate` and the reserved-name check (no signatures) [D].
  - (d) Gemini's per-activation consent prompt and OpenCode's `ask` permission [D].
- **No cross-vendor signing standard** exists, and the agentskills spec has no integrity field [D].
- **Agent-level mitigations** [D]: Claude `disableSkillShellExecution` (managed), `Skill(...)` deny rules and
  `skillOverrides: off`; OpenCode `deny`; Codex `[[skills.config]] enabled=false`.

---

## 7. The user's local situation (read-only counts, no contents copied)

| Location | SKILL.md (recursive) | Top-level skills | Notes |
|---|---|---|---|
| `~/.claude/skills` | 779 | 149 with direct SKILL.md (151 entries) | 51 symlinks → `~/.agents/skills`; 59 names overlap with it; 66 SKILL.md files >20KB; largest about 126KB; 4.56M characters total |
| `~/.claude/plugins` | 1,290 | 2 installed plugins (`typescript-lsp`, `nowledge-mem`) | 1,350 SKILL.md files sit in `marketplaces/`, which has 27 dirs, **24 of them stale `temp_*` clones**; `cache/nowledge-mem` holds 26 SKILL.md; `synced/` holds 2 |
| `~/.agents/skills` | 104 | 104 | vercel lockfile v3; ≈6.9K tokens of catalog; read by Codex, pi, Cursor, OpenCode, Gemini and Kimi |
| `~/.codex/skills` | 11 | 7 entries (6 parsed) | Not a documented Codex user path in current docs; Codex documents `~/.agents/skills` [I: legacy] |
| `~/.pi/agent/skills` | 12 | 12 | pi also reads `~/.agents/skills`, giving about 116 in its catalog [I] |
| `~/.grok/skills` | 5 | 5 | |
| `~/.cursor/skills` / `~/.gemini/skills` / `~/.config/opencode/skills` | 4 / 4 / 2 | | |
| Nowledge Mem | | 82 records (78 active) | Projected to 0 of 58 hosts |

**Codex** `~/.codex/config.toml` defines 4 MCP servers (`context7`, `nowledge-mem` with a per-tool section, `vx-link`,
`node_repl`) and no `[[skills.config]]` entries [V, section headers only].

**Effective catalog in this Claude subagent session** [V]: about 215 listed entries, including bundled, plugin
(`nowledge-mem:*`), `anthropic-skills:*` and gstack. Many are name-only after the budget, so the catalog is
already over budget and description matching is degraded for the least-used skills.

---

## Open facts not established

- Exact per-harness precedence for Codex (the docs are silent) and Grok's skill paths (not documented here).
- Whether Claude's listing *deltas* (a skill added mid-session) append or rebuild. The docs say "append" for
  plugins; the listing itself was observed only as a message attachment.
- The SkillsBench, RAG-MCP and Snyk numbers come from secondary summaries; primary PDFs were not read.
- The Codex plugin manifest fields come from secondary sources.
