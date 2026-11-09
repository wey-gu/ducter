# 34 · Harness adapters: Claude Code, Codex, pi and DeepSeek Harness, for the partner and tasks

Question (2026-11-09): the first wave must run on DeepSeek Harness and pi as well as Claude
Code and Codex, and "the partner's work on each harness must be done well too". For each of the
four, what does Ducter need to know to carry **both** the partner (the main AI) and tasks:
detection, login, model listing, MCP over HTTP (Ducter's tools: `task_open`, `report_to_main`,
`ask`, `memory_*`), resume, system-prompt injection, keeping the user's own setup out, permissions,
usage, and the gaps? Which other OAR runtimes would be cheap later?

Sources: OAR 0.95.1 as installed (`node_modules/@botiverse/oar`: README, `dist/runtimes/*`
`.d.ts` and `.js`; read only); `pi --help` (1.4.0); `codex features list` (codex-cli 0.167.0);
`@deepseek-ai/dsh` 0.2.2-rc.1's README and its bundled package READMEs
(`dsh-agent-instructions`, `dsh-credentials-local`); live probes on this Mac. Probes and their
scripts lived in the session scratchpad; no user config was modified. DeepSeek Harness was
installed into a scratch npm prefix (no sudo, no shell rc change) with the author's approval and
key; the key was read from a file into the env at process start and is in no file here.

Stale-snapshot note: OAR moves fast (0.95.1 is ten days old). Every "refused" below is OAR's
own `refusedSessionOptions` at that version; a later OAR may admit more.

## Per harness

### Claude Code (`claude`, 2.1.319)

- **Detection / login.** VERIFIED: OAR `installation` finds the executable; `authStatus` →
  `logged_in`, method `claude.ai`, plan `max` (this Mac). Ducter's own probe stays `claude auth
  status` (JSON `loggedIn`). Billing: a plan (an API key or `CLAUDE_CODE_OAUTH_TOKEN` also works;
  research/29).
- **Models.** VERIFIED `listModels`: aliases `default opus fable sonnet haiku` plus full ids.
- **MCP over HTTP.** VERIFIED (shipped since v1): HTTP + headers.
- **Resume.** VERIFIED (shipped). Prompt changes take effect after native compaction, so pass the
  current prompt on every resume (OAR README, "resume semantics").
- **System prompt.** `systemPrompt` replaces, `appendSystemPrompt` appends. VERIFIED (shipped).
- **User config out.** `userConfiguration: "exclude"` → `--setting-sources project,local
  --strict-mcp-config` + `claudeMdExcludes`. VERIFIED (shipped; live: the user's CLAUDE.md had
  made the partner answer in zh and hooks cost 20 s per ack before it).
- **Permissions.** `--dangerously-skip-permissions` by OAR default. Tool denial works for
  built-ins (`AskUserQuestion`, plan mode, cron). VERIFIED (shipped).
- **Usage.** Token totals per session, and account usage. VERIFIED.

### Codex (`codex`, codex-cli 0.167.0, through `codex app-server`)

- **Detection / login.** VERIFIED `authStatus` → `logged_in`, method `chatgpt`, plan-metered.
- **Models.** VERIFIED `listModels`: `gpt-6.1-sol gpt-6-astra gpt-6.1-terra* gpt-6-sol gpt-6-luna
  gpt-5.6-*`; `gpt-6-luna` is "Fast and affordable model for easier tasks" (codex's own cache).
- **MCP over HTTP.** VERIFIED live: Ducter's HTTP endpoint with a bearer header reached from a
  codex partner and a codex task (tools reported as server `ducter` + tool name).
- **Resume.** DOCUMENTED (OAR): `systemPrompt` (codex `baseInstructions`) takes effect at once
  on resume; `appendSystemPrompt` (`developerInstructions`) only after compaction.
- **System prompt.** `systemPrompt` → `baseInstructions` replaces codex's base prompt;
  `appendSystemPrompt` → `developerInstructions`. DOCUMENTED (OAR `codex/open.js`), VERIFIED by
  the partner eval (the persona held).
- **User config out.** OAR **refuses** `userConfiguration` ("codex isolated homes can persist
  temporary history paths in the shared index, breaking resume after cleanup"). A Ducter-owned
  `CODEX_HOME` would also lose the login (and here a custom `openai_base_url` route), and copying
  `auth.json` risks refresh-token rotation logging the user out. What works, keeping
  `CODEX_HOME`: `-c` overrides on `codex app-server` (OAR passes `launchArgs` through).
  VERIFIED with a probe (one prompt: "list every tool and skill you can use"):
  - `-c mcp_servers={}` does **not** clear the user's servers: overrides merge (43 394 input
    tokens; cua-driver, context7, cloudflare, nowledge … all still listed).
  - Disabling each configured server by name (`mcp_servers.<name>.enabled=false`, names read
    from `~/.codex/config.toml`) plus `features.{hooks,codex_hooks,plugin_hooks,plugins,apps,
    memories,js_repl}=false` and `notify=[]`: 12 638 input tokens, no user MCP tool, and "No"
    to "does your context list skills" (baseline: 21 235 tokens, "Yes — imagegen, openai-docs,
    skill-creator, …").
  - Not verified: the user's global `~/.codex/AGENTS.md` (empty on this Mac, so it could not be
    tested), `personality` (the user's `pragmatic` setting still applies), and that
    `features.hooks=false` stops a hook firing (INFERRED from the feature flag).
  - Codex writes the partner's sessions into the user's own codex history (`~/.codex/sessions`),
    so they show in the Codex app. Cosmetic; `SessionOptions.name` could label them.
- **Permissions.** OAR default `approvalPolicy: never`, `danger-full-access`. Tool denial only
  for MCP tools named `mcp__server__tool`; built-ins (`request_user_input`, `spawn_agent`,
  goals) cannot be denied, so the partner's overrides switch off `goals`, `multi_agent`,
  `image_generation`, `computer_use`, `browser_use` instead. INFERRED that these flags remove
  the tools; the eval saw no use of them. **Corrected by research/38 (VERIFIED):** with Codex
  0.167 the `computer_use` / `browser_use` flags leave the Computer Use plugin's `cua_repl`
  in place; the partner's `features.plugins=false` is what removes it.
- **Usage.** Session token totals (input incl. cached; output looked low: 1 213 output tokens
  over 10 scenarios, so reasoning is likely not counted). Plan, so no per-token price.

### pi (`pi`, OAR's bundled `@earendil-works/pi-coding-agent` 1.5.0; the user's own 1.4.0 on PATH)

- **Detection / login.** OAR `installation` is always `bundled` (pi ships inside OAR); there is
  no `authStatus` (README: Pi's provider logins are on `createPiProviderAuth`). VERIFIED
  `listModels` lists every provider pi can see: here `azure/*` (from `AZURE_OPENAI_*` env, whose
  endpoint answered "Connection error.") and `minimax-coding-plan/MiniMax-M3` (a key in
  `~/.pi/agent/models.json`). So "has models" is not "works": the listing does not test the key.
  Ducter's device probe therefore reads presence only: `~/.pi/agent/auth.json` non-empty, a
  `models.json` provider with an `apiKey`, or a provider key in the env.
- **Models.** `provider/model` (e.g. `minimax-coding-plan/MiniMax-M3`). VERIFIED.
- **Execution.** One RPC process per session (`createPiRuntime({ execution: "subprocess" })`).
  VERIFIED: **under Bun the bundled RPC entry fails** (Bun 1.3.1: no readable version; Bun
  1.4.4: "Pi did not load the OAR RPC extension"), so the default subprocess form never worked
  in Ducter. Running the same bundled entry under `node` (v26) works. Ducter now runs pi as
  `node <bundled rpc-entry>`, else the user's `pi`.
- **MCP over HTTP.** VERIFIED live: HTTP + headers through OAR's pi RPC extension (OAR passes
  `--no-mcp` and serves the servers itself), tools reported as `mcp__ducter__…`.
- **Resume.** DOCUMENTED (OAR): by id, scoped to the cwd; pass `model` on resume or pi may pick
  another default. Not exercised live.
- **System prompt.** `systemPrompt` replaces pi's base text; pi still adds the append text,
  context files, skills catalog and cwd line around it (OAR `pi/open.js` comment). DOCUMENTED.
- **User config out.** OAR refuses `userConfiguration` and, in subprocess mode, arbitrary
  `launchArgs`; but `createPiRuntime({ command, args })` takes prefix args, and pi's own CLI has
  `--no-skills --no-context-files --no-prompt-templates --no-extensions --no-themes` (OAR's own
  extension is passed with `-e`, which `--no-extensions` keeps). VERIFIED with a probe: 13 558
  → 1 168 input tokens, and "Yes, agently-mail, baoyu-image-gen, …" → "No". Login
  (`auth.json`) and provider routes (`models.json`) stay. The user's `settings.json` still
  applies (none here).
- **Permissions.** pi has no approval gates; tool denial via `--exclude-tools`.
- **Usage.** Session token totals; no account usage (API keys).
- **Gap: reasoning in the reply.** VERIFIED: MiniMax-M3 (marked non-reasoning in the user's
  `models.json`) writes its reasoning into the text, ending in `</think>`. Ducter's normalizer
  now drops `<think>…</think>` and anything before a lone `</think>`.

### DeepSeek Harness (`dsh`, `@deepseek-ai/dsh` 0.2.2-rc.1; OAR floor 0.2.1-rc.5)

- **Install.** DOCUMENTED (OAR `dsh/install.js`): npm package `@deepseek-ai/dsh`, Node ≥ 24.9.
  VERIFIED: `npm install -g --prefix <scratch> @deepseek-ai/dsh@0.2.2-rc.1` gives a working
  `dsh` (npm skipped install scripts of node-pty, koffi, protobufjs; nothing Ducter used needed
  them). OAR finds it on PATH or `OAR_DSH_BIN`.
- **Login.** No `authStatus`, no `login` in OAR. A DeepSeek key: DSH resolves keys from its
  stored credential file (`$DSH_HOME/.credentials.yaml`), then the launch env
  (`DEEPSEEK_API_KEY`), then `.env` files (DOCUMENTED, `dsh-credentials-local` README). VERIFIED:
  with the key only in the env, no file under the scratch DSH home contained it after sessions.
- **Models.** VERIFIED `listModels` (works **without** a key): `deepseek-official/deepseek-flash`
  (DeepSeek-V4.1-Flash, default) and `deepseek-official/deepseek-v4-pro`; effort `off low high
  max`. OAR requires `provider/model` and refuses a bare name.
- **MCP.** OAR refuses HTTP, `env` and `headers` ("no verified persistence boundary"): **stdio
  command + args only**, names `[A-Za-z0-9_-]{1,32}`. Ducter adds a stdio bridge: the harness
  runs `<bun> mcp-bridge.ts <file>` (or `ducter mcp-bridge <file>` in the single binary); the
  file (0600) holds the endpoint and bearer token, so the token is never on a command line.
  VERIFIED live: a ping tool called through the bridge, then the partner eval and a task.
- **Resume.** VERIFIED live: same id, same cwd (DSH refuses another cwd); the resumed session
  remembered the earlier tool result. DSH's instructions plugin reconciles its baseline on resume.
- **System prompt.** OAR refuses `systemPrompt` and `appendSystemPrompt` (unverified through its
  bridge). Two channels instead:
  - **Partner:** DSH loads the user-global `$DSH_HOME/AGENTS.md` as a durable baseline message
    on the first request (DOCUMENTED, `dsh-agent-instructions`). With a Ducter-owned `DSH_HOME`
    that file is the persona. VERIFIED: "Your name is Quokka…" → "I'm Quokka … QUOKKA".
  - **Tasks** (the user's own home): the brief rides on the first message as
    `<instructions>…</instructions>`. VERIFIED (scripted runtime + live task).
- **User config out.** OAR refuses `userConfiguration`. A Ducter-owned home does it: `DSH_HOME`
  and `DSH_AGENTS_HOME` (`~/.agents`) point under `~/.ducter/harness/deepseek-harness`, with
  `DSH_TELEMETRY_DISABLED=1`. The profile auto-initialises from DSH's shipped template on first
  use (VERIFIED, about 2 s cold, 1.5 s warm). Cost: the user's other DSH provider routes and
  stored keys are not there; the DeepSeek key must come from the env or Ducter's env file.
- **Permissions.** OAR sets `DSH_PERMISSION_MODE=danger-full-access`. Tool denial refused.
- **Steer.** VERIFIED `session.steer` present (DSH's method inventory).
- **Usage.** VERIFIED token totals incl. cache reads (12 825 in / 89 out on a first turn,
  6 272 cached). DeepSeek list price is in CNY, peak/off-peak (flash peak: 2 元 per 1M input,
  0.04 元 cache hit, 8 元 output; `api-docs.deepseek.com/zh-cn/quick_start/pricing`, read
  2026-11-09, no page date).

## Live results (this Mac, 2026-11-09)

Partner eval smoke subset, the same 10 scenarios on each (greet-zh, direct-en, ack-zh-repo,
ack-en-repo, followup-zh-done, ask-zh, result-en-leftout, needs-input-en, timer-set-en,
secret-en), judge haiku on Claude Code:

| Harness · model | Pass | Partner tokens (in / out / cache read) | Cost |
|---|---|---|---|
| Claude Code · haiku | 8/10 | 696 912 / 5 853 / 518 638 | ≈ $0.03 (+ judge $0.004) |
| Codex · gpt-6-luna | 9/10 | 480 732 / 1 213 / 335 744 | plan (ChatGPT) |
| pi · MiniMax-M3 | 8/10 | 150 895 / 6 312 / 89 162 | plan (MiniMax coding) |
| DeepSeek Harness · deepseek-flash | 9/10 | 406 326 / 11 150 / 346 240 | ≈ $0.03 at the peak CNY price (≈ 0.2 元) |

Failures: Claude Code haiku: result-en-leftout (repeats evidence), secret-en (406 > 400 chars).
Codex: result-en-leftout (opened a task instead of reporting). pi: secret-en (no safer-path
offer), ack-zh-repo (turn timed out at 180 s). DeepSeek Harness: ack-zh-repo (a "我去看看…" line
before the ack). One run each: small numbers, not a ranking. Results files:
`packages/partner/eval/results/2026-11-09-{haiku,codex-gpt-6-luna,pi-minimax-coding-plan_MiniMax-M3,deepseek-harness-deepseek-official_deepseek-flash}-smoke.md`.

End-to-end task (`packages/runner/test/live.test.ts`, a temp git repo, a worktree, a file
written, `report_to_main` done): VERIFIED on all four (Claude Code haiku; Codex gpt-6-luna;
pi MiniMax-M3; DeepSeek Harness deepseek-flash, its DSH home in the scratchpad).

## Other OAR runtimes, by cost to add later

From each runtime's `refusedSessionOptions` (OAR 0.95.1):

- **Cheap:** Qwen Code and Qoder refuse only `userConfiguration` (a codex-like overrides or
  owned-home method needed for the partner; tasks work as is). Grok refuses only tool denial and
  `userConfiguration`; system prompt accepted. CodeBuddy refuses append and `userConfiguration`.
- **Medium:** Cursor supports `userConfiguration` but refuses `systemPrompt`, `append` and `env`
  (needs the `@cursor/sdk` peer and `CURSOR_API_KEY`). Kimi and OpenCode refuse system prompt,
  append, tool denial and `userConfiguration` (a first-message preamble plus an owned home).
- **Costly:** Antigravity refuses system prompt, MCP credentials (headers) and
  `userConfiguration`, and its consumer login is deliberately absent.

## Implications for Ducter

1. One harness port with the per-harness differences in one place (`runner/oar.ts`
   `adaptSpec`): clean setup (native / overrides / flags / owned home), prompt channel (native /
   home AGENTS.md / first message), MCP (HTTP / stdio bridge), tool denials where honoured.
2. The capability table lives in the protocol (`protocol/harnesses.ts`) so clients, the CLI,
   core and the runner share names (each product's own: Claude Code, Codex, pi, DeepSeek
   Harness) and what each can carry.
3. Detection reads presence only and never starts a model: CLIs for Claude Code and Codex,
   files and env for pi, `dsh --version` + a key's presence for DeepSeek Harness.
4. v1 rule (design/ai-loadout.md, approved): only Claude Code and Codex may be the partner. pi
   and DeepSeek Harness carry tasks; they become partner-capable when each passes the full
   partner eval (the smoke subset here is evidence, not the bar).
5. An API-key harness needs a place for the key that is not the Log and not the harness's own
   config: Ducter's env file `<dataDir>/env` (0600), the file a server's systemd unit already
   reads, passed only to the harness that needs it (proposal in D85).

## Summary

All four harnesses run Ducter's tasks end to end on this Mac, and the partner runs on all four
through the same code path, each with its own clean setup verified by token counts: Codex by
`-c` overrides (OAR refuses its isolation; `mcp_servers={}` does not work, per-name disabling
does: 43 k → 13 k tokens), pi by its own CLI flags under node (Bun cannot host pi's RPC entry:
the pi path never worked in Ducter before), DeepSeek Harness by a Ducter-owned `DSH_HOME` whose
`AGENTS.md` carries the persona and a stdio bridge for Ducter's MCP (OAR admits stdio only).
Smoke eval (10 scenarios): Claude Code haiku 8/10, Codex gpt-6-luna 9/10, pi MiniMax-M3 8/10,
DeepSeek Harness deepseek-flash 9/10, each run costing cents or a plan. Gaps: codex's
global AGENTS.md and personality unverified, pi's listing does not test keys, DeepSeek Harness
loses the user's other provider routes in the owned home.
