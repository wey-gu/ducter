# OpenCode as a Ducter work agent

**Verdict first.** Add OpenCode as a **task-only, picked-when-named, direct-only** agent. It has a real prompt channel (replace + append), images, HTTP MCP, skills, steering and resume, so it is a better task citizen than Antigravity (INFERRED). It must not be the partner or a one-shot: OAR refuses `disallowedTools` and `userConfiguration`, so Ducter cannot enforce read-only or leave the person's own setup out. Treat it as a capable coding task agent behind an explicit Go, with a terms gate on consumer OAuth.

`OAR:` = `node_modules/@botiverse/oar/dist/runtimes/opencode/`. `runner` = `packages/runner/src/oar.ts`. OAR is **0.124.0**; its npm package ships no `docs/` folder, so `OAR docs` below is the GitHub **main** page: <https://github.com/botiverse/oar/blob/main/docs/runtimes/opencode.md> (newer than 0.124.0; differences are called out). Tags: **VERIFIED** = read in code; **DOCUMENTED** = read in a doc/URL; **INFERRED** = reasoned, not verified.

## 1. Proposed HARNESSES entry

| Field | Value | Source |
|---|---|---|
| `id` | `"opencode"` | Proposed; add to `HARNESS_IDS`. VERIFIED `packages/protocol/src/harnesses.ts:6`. |
| `name` | `"OpenCode"` | The product's own name. DOCUMENTED <https://opencode.ai/docs/cli/>. |
| `badge` | `"oc"` | INFERRED (two-letter mark, matches the table's style). |
| `command` | `"opencode"` | VERIFIED `OAR:installation.js:9-14`: PATH or `~/.opencode/bin/opencode`; `OAR_OPENCODE_BIN` overrides. |
| `partner` | `false` | VERIFIED `OAR:options.js:9-18`: `disallowedTools` and `userConfiguration` are refused, so no read-only partner. |
| `task` | `true` | VERIFIED `OAR:index.js:11-37`, `OAR:session.js:109-166`: a full ACP session. |
| `images` | `true` | VERIFIED `shared/acp/session.js:73` (auto `images` from the ACP answer) + `shared/acp/prompt.js:6-14`; ACP advertises `promptCapabilities.image`. DOCUMENTED <https://opencode.ai/docs/cli/acp/>. |
| `steer` | `true` | VERIFIED v1: `OAR:session.js:33-38`; v2 only from 2.2.7 when `initialize` advertises `_session/steering` (`OAR:steering.js:9-22`). |
| `draws` | `false` | INFERRED: OAR maps no image artifact; OpenCode 2.2.2+ has experimental `image_generate`, not surfaced. DOCUMENTED <https://opencode.ai/changelog/v2.2.2.md>. |
| `isolation` | `"none"` | VERIFIED `OAR:options.js:12`: "opencode has no verified separation of user configuration from its native login". |
| `systemPrompt` | `"replace"` | VERIFIED `OAR:prompt-config.js:104-118` (v1 `agent.<name>.prompt`), `OAR:prompt-config-v2.js:45-67` (v2 `agents.<id>.system`, 2.2.0+). |
| `taskInstructions` | `"append"` | VERIFIED `OAR:prompt-config.js:79-103`: a session-owned `instructions` file, after AGENTS.md. v2 needs 2.0.30+. |
| `mcp` | `"http"` | VERIFIED `OAR:options.js:35-55` (`mcpTransports: ["stdio","http"]`) and `shared/acp/mcp-servers.js:23-46`. DOCUMENTED ACP `mcpCapabilities.http: true`. |
| `login` | `"provider-keys"` | DOCUMENTED <https://opencode.ai/docs/cli/providers/>: sign-in is per provider (OAuth or API key), not one harness account. |
| `billing` | `"usage"` | INFERRED default (API-key routes); subscription routes exist (ChatGPT Plus/Pro, Claude Agent, OpenCode Go), so the device probe should override with `plan`. |
| `cheapModel` | `"opencode/big-pickle"` | DOCUMENTED: OAR's free no-login baseline model (`OAR docs` "First-prompt snapshot cost"). Paid alternative: `opencode-go/claude-haiku-5-5`. |
| `modelForm` | `"provider/model, with #variant for effort (e.g. anthropic/claude-sonnet-5-5#high)"` | VERIFIED `OAR:list-models.js:25-56`; DOCUMENTED <https://opencode.ai/docs/models/>. |
| `install` | `"curl -fsSL https://opencode.ai/v2/install \| bash"` | VERIFIED `OAR:install.js:6-15,31-46`. v1 line is `https://opencode.ai/install`. The two lines replace each other; never install over an existing copy. |
| `signIn` | `"opencode auth login (pick a provider: OAuth or API key)"` | DOCUMENTED <https://opencode.ai/docs/cli/commands/#auth>; v2 also through `createOpencodeProviderAuth` (`OAR:provider-auth.js:15-37`). |
| `pickOnly` | `true` | INFERRED: no partner/task eval and no isolation, so the ranking should prefer Claude Code/Codex/pi; the person (or a rule) can still name it. |
| `directOnly` | `true` (provisional) | INFERRED: one route is a provider's consumer subscription OAuth and Ducter cannot tell which provider is signed in; remove when only API key / OpenCode Go is allowed. Needs its own `DIRECT_ONLY_WHY` line (the current one says Google). |
| `noWebTasks` | `true` | INFERRED from `isolation: "none"` and D416/D241: a web-reading task cannot be held to Ducter's rules when the person's AGENTS.md, plugins and MCP load. |
| `signOut` | omitted | v1 has no sign-out; v2's provider facade has `logout(id)`, but OAR's runtime has no `logout`, so a facade-backed branch would have to be added to `HarnessPort.logout` (`node_modules/@botiverse/oar/README.md:520-521`). |

```ts
opencode: {
  id: "opencode", name: "OpenCode", badge: "oc", command: "opencode",
  partner: false, task: true, images: true, steer: true, draws: false,
  isolation: "none", systemPrompt: "replace", taskInstructions: "append",
  mcp: "http", login: "provider-keys", billing: "usage",
  cheapModel: "opencode/big-pickle",
  modelForm: "provider/model, with #variant for effort (e.g. anthropic/claude-sonnet-5-5#high)",
  install: "curl -fsSL https://opencode.ai/v2/install | bash",
  signIn: "opencode auth login (pick a provider: OAuth or API key)",
  pickOnly: true, directOnly: true, noWebTasks: true,
},
```

Also add `"opencode"` to `HARNESS_KEYS` as **`["OPENCODE_API_KEY"]` only**. Do not pass `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` to it: OpenCode plugins run in-process and can read the whole child environment, and provider keys belong in OpenCode's own credential store (D102). This is a recommendation, INFERRED from the plugin model. Do not add it to `PARTNER_FALLBACK` or `MEM_BRIDGE_HARNESSES`.

## 2. How OAR drives it

### 2.1 Launch

- **Command/args:** `opencode acp`; `SessionOptions.launchArgs` are appended after `acp` and are not added to OAR's helper queries. VERIFIED `OAR:session.js:16-18`, `shared/acp/launch-args.js:1-9`.
- **Process:** one isolated ACP subprocess per session; `opencode acp` starts its own private server, not the shared background service, and opens no port for ACP. VERIFIED `OAR:session.js:16-44`, `OAR:index.js:31-37`, `OAR:shared-session.js:1-10`; DOCUMENTED <https://opencode.ai/docs/cli/acp/>.
- **Startup gate:** ACP starts are serialized in-process per resolved OpenCode data dir (`XDG_DATA_HOME/opencode`), 60 s budget; concurrent first starts over a fresh SQLite DB can fail natively (`table account_state already exists`). VERIFIED `OAR:startup-gate.js:48-86`; DOCUMENTED OAR docs "Startup and compatibility".
- **Env:** the child gets Ducter's filtered overlay (`harnessEnv`/`childEnvOverlay`) plus, only when a prompt option is set, `OPENCODE_CONFIG_CONTENT` with the agent prompt / instructions file. OAR refuses if that variable is already set; 0.124.0 does **not** merge a host overlay. VERIFIED `OAR:prompt-config.js:16-17,109-118`. Do not set `OPENCODE_PASSWORD` or `BROWSER` for ACP; those belong to `opencode serve` in provider auth (`OAR:provider-auth-server.js:24-40`).
- **Prompt path:** with `systemPrompt`, OAR first runs `opencode debug config` (v1) or `opencode debug agents --standalone` / `opencode export` (v2), then opens ACP and verifies the opened mode matches. VERIFIED `OAR:prompt-config.js:24-77,119-129`, `OAR:prompt-config-v2.js:25-44,69-74`.
- **No `authenticate`:** ACP's `opencode-login` method answers `{}`; credentials come from `opencode auth login`, provider env vars, or free models. VERIFIED `OAR:session.js:27-30`.

### 2.2 Sign-in

| Route | What happens | Source |
|---|---|---|
| v1 (`opencode-ai` 1.x) | `opencode auth login` in a terminal only; OAR's provider facade refuses v1 with `version_unsupported`. | VERIFIED `OAR:provider-auth.js:23-25`; DOCUMENTED CLI auth. |
| v2 (`@opencode/cli` 2.x) | `opencode auth login` (interactive picker) or OAR's `createOpencodeProviderAuth`: one `opencode serve`, `/api/integration`, OAuth or API-key methods, `credential.remove` for logout. | VERIFIED `OAR:provider-auth.js:15-37`, `OAR:provider-auth-facade.js:86-150`; DOCUMENTED <https://opencode.ai/docs/cli/providers/>. |
| Auth status | `opencode auth list --format json` (v2); facade `listProviders()` lists **stored** credentials only, so env-only keys need the CLI read too. | DOCUMENTED <https://opencode.ai/docs/cli/commands/#auth>; VERIFIED `OAR:provider-auth-facade.js:86-92`. |
| API key vs OAuth/subscription | Each is a provider method: `key`, `oauth`, `env`, `command`, `external`. OAuth emits `auth_url` / `device_code` and can ask for a pasted code. | VERIFIED `OAR:provider-auth-oauth.js:154-187`, `OAR:provider-auth-registry.js:96-134`; DOCUMENTED providers page. |
| Claude Agent / Bedrock / Vertex | These are `external`/`command` methods and are **omitted** by the facade's `loginProviders()`; use `opencode auth login` in a terminal. | DOCUMENTED OAR docs "Provider authentication" table; VERIFIED `OAR:provider-auth-registry.js:89-111`. |
| Remote host | OAuth methods with a loopback `redirect_uri` cannot finish from another machine; pass `loopback: "refuse"` so OAR rejects them before showing a URL (`loopback_required`). Device-code and paste-code methods still work. | VERIFIED `OAR:provider-auth-oauth.js:29-42,169-172`; DOCUMENTED OAR docs "Signing in from another machine". |

There is **no `opencodeRuntime.authStatus`/`login`** (node_modules/@botiverse/oar/README.md:520-521). Ducter's current `available()` fallback (`loggedIn = models.length > 0`, `runner:917`) is not an auth check for OpenCode: the v1 line lists free `opencode/*` models with no login (OAR baselined `opencode/big-pickle`), and on v2 the signed-out catalog differs (DOCUMENTED models page says the `opencode` provider is absent signed out). Add a real check.

### 2.3 Models

- v1: `opencode models --verbose`, parsed as `provider/model` plus an indented JSON body; `variants` keys become `effortLevels`, `provider.id` is set. No default and no context window. VERIFIED `OAR:list-models.js:25-56,61-78`.
- v2 in 0.124.0: `opencode models --standalone`, plain `provider/model` lines only; an empty answer is `unsupported` (cold-catalog bug). No effort, no window. VERIFIED `OAR:list-models.js:69-86`. Newer OAR main reads the model API with names/providers/variants (DOCUMENTED), so upgrading OAR is the fix.
- ACP `session/new` returns `model`, `effort` (`thought_level`, variants) and `mode` config options; `session/set_config_option` sets them. `set_model` is not used. VERIFIED `OAR:session.js:31-33`; DOCUMENTED ACP "Config options".
- Context: OpenCode's own `usage_update` carries `used`/`size` (OAR `contextUsage`); v1 automatic compaction may not move it. VERIFIED `OAR:options.js:42,50`; DOCUMENTED OAR docs "Root prompt token usage".

### 2.4 Capabilities

| Capability | Answer | Evidence |
|---|---|---|
| Steering | v1: a prompt sent while a turn runs is admitted as a user message and read at the next step (live: sent 2.5 s into a shell call, changed that turn's reply). v2: only 2.2.7+ with `_meta.steering.supported`; otherwise a concurrent prompt is refused. | VERIFIED `OAR:session.js:33-38`, `OAR:steering.js:9-22`; DOCUMENTED ACP. |
| Images | Yes, ACP image blocks with `data` + `uri`; image-only prompts work. The selected model must declare image input or OpenCode answers "Cannot read". | VERIFIED `shared/acp/prompt.js:6-14`; DOCUMENTED OAR docs "Image-only input". |
| MCP | HTTP and stdio on `session/new`/`load`/`resume`; HTTP headers pass through, no OAuth for these servers. A client server with the same name replaces the configured one **for that directory until the process exits**. | VERIFIED `shared/acp/mcp-servers.js:23-46`; DOCUMENTED ACP "MCP servers". OAR's per-session process limits the blast radius. |
| System prompt | `systemPrompt` replaces the provider/agent base prompt (v1 selected agent; v2 every visible primary agent, 2.2.0+). Project instructions, skills and MCP guidance are still added. | VERIFIED `OAR:prompt-config.js:104-118`, `OAR:prompt-config-v2.js:45-67`; DOCUMENTED <https://opencode.ai/docs/agents/#system>. |
| Appended instructions | One session-owned file in `instructions`, after AGENTS.md/CLAUDE.md; survives compaction. v2 2.0.30+; on resume OpenCode retracts the old file and adds the new one. | VERIFIED `OAR:prompt-config.js:79-103`; DOCUMENTED OAR docs "V2 prompt options". |
| Skills | Native catalog: v1 `opencode debug skill`; v2 private `opencode serve` + `/api/skill` (2.2.7+). Invoke with `@skill-id`; skills are not slash commands. | VERIFIED `OAR:skills.js:63-97`, `OAR:skills-v1.js:9-16`; DOCUMENTED <https://opencode.ai/docs/skills/>. |
| Commands | ACP advertises `available_commands_update`; OAR 0.124 exposes no commands inventory. `/compact` is v2 manual compaction; v1 has no `compact()` and no auto-compaction events. | VERIFIED `OAR:compaction.js:20-33,34-47`, `OAR:options.js:40-52`; DOCUMENTED OAR docs "Manual compaction". |
| Resume | Same cwd only (`resumeKeepsSessionCwd`); v2 fork copies the whole session, `fork.through` refused. | VERIFIED `OAR:session.js:39-43`, `OAR:options.js:19-23`; DOCUMENTED ACP. |
| Background | 2.3.0 subagents run in the background and arrive on `opencode/session/child_update`, mapped to OAR tasks; whether a child's end starts a parent turn is not established. | VERIFIED `OAR:attribution.js:18-65`, `OAR:version.js:49-52`; DOCUMENTED OAR docs "Background children". |

## 3. Terms of service / usage policy

### 3.1 OpenCode's own terms

- **Local open source is MIT.** <https://github.com/anomalyco/opencode/blob/dev/LICENSE> — "MIT License … without restriction". DOCUMENTED.
- **The hosted Services are separate.** The Terms say: "our open source software that is not provided to you on a hosted basis is subject to the open source license and terms set forth on the applicable repository … and such license and terms will exclusively govern your use of such open source software." DOCUMENTED <https://opencode.ai/legal/terms-of-service>.
- **Two clauses matter if Ducter is the orchestrator.** "You will only use the Services for your own internal use, and not on behalf of or for the benefit of any third party, and only in a manner that complies with all laws that apply to you." The restriction clause reads: "…resells, sublicenses, or otherwise makes the Services, or any account, API key, credentials, or Credits, available to any third party, except as expressly approved by OpenCode in writing." DOCUMENTED same URL.
- **OpenCode Go explicitly allows other coding agents.** "OpenCode Go is designed for OpenCode and other coding agents that produce similar types of requests"; its docs list validated non-OpenCode clients and ask for a client user-agent and `x-opencode-session`. DOCUMENTED <https://opencode.ai/docs/console/go/>.

**Reading (INFERRED):** Ducter is third-party software relative to OpenCode, but it acts for the same person on that person's machine, so "own internal use" is not automatically breached. It *is* breached if one person's OpenCode sign-in or Go key runs another person's task (the lend/worker case), or if Ducter exposes OpenCode as a service to others. Do not copy or export OpenCode's credential DB.

### 3.2 Provider subscriptions / OAuth

- **Anthropic (the Antigravity-like risk).** Claude Code's own legal page says: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users." It also says this does "not prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". DOCUMENTED <https://code.claude.com/docs/en/legal-and-compliance>. The Consumer Terms add the general hook: do not access the Services "through automated or non-human means, whether through a bot, script, or otherwise" except via an Anthropic API key or where Anthropic explicitly permits it. DOCUMENTED <https://www.anthropic.com/legal/consumer-terms>.
- **OpenCode's least-risky Claude route is "Claude Agent"**: OpenCode runs the user's installed **unmodified Claude Code binary**, which matches Anthropic's permitted end-user case. DOCUMENTED <https://opencode.ai/docs/claude-agent/>. Any direct Anthropic OAuth in OpenCode (built-in or a plugin), or a plugin that imports Claude Code OAuth tokens into OpenCode, is the forbidden "route requests through plan credentials" case. The specific Anthropic enforcement statement is **not verified** here; the Claude Code legal page above is the authoritative text.
- **OpenAI / ChatGPT Plus/Pro.** OpenCode documents "Use a ChatGPT Plus or Pro plan instead of an OpenAI API key … Sign in with ChatGPT", and OpenAI's ToS (read in part) has no clause that explicitly bans a third-party client; its "cannot do" list bans "automatically or programmatically extract data or Output", not ordinary use. DOCUMENTED <https://opencode.ai/docs/providers/#chatgpt>, <https://openai.com/policies/terms-of-use/>. Risk is **medium-low**, not zero: OpenAI's account-sharing line still applies.
- **GitHub Copilot OAuth**: OpenCode supports it, but Copilot's terms were not read here — **not verified**. Leave it to the person, or prefer API keys.

**Risk table (INFERRED):**

| Sign-in Ducter drives | Risk | Rule |
|---|---|---|
| OpenCode Go key / Console API key | Low | Allowed; it is OpenCode's documented third-party route. |
| OpenAI ChatGPT Plus/Pro OAuth | Medium-low | Allowed, but no cross-person use; watch "ordinary use". |
| Claude via OpenCode **Claude Agent** | Low-medium | Prefer; it runs unmodified Claude Code, the closest to the permitted case. Never read its tokens. |
| Claude Pro/Max direct OAuth in OpenCode or a plugin | **High, Antigravity-like** | Do not support. It routes plan credentials through a third-party app. |
| Free `opencode/*` models | Low | Fine; no account. |

Because Ducter cannot see which provider/method is signed in from a boolean, the provisional `directOnly: true` is the safe entry. If Ducter restricts OpenCode to API key / OpenCode Go, `directOnly` can be false.

## 4. What Ducter must add beyond the entry

### 4.1 Protocol and runner

- `HARNESS_IDS` + `HARNESS_FACTS.opencode`; TypeScript's `Record<HarnessId, …>` forces every map. `HARNESS_KEYS.opencode = ["OPENCODE_API_KEY"]` (D102; do not hand it provider keys).
- `defaultLoader` case: `(await import("@botiverse/oar/runtimes/opencode")).opencodeRuntime` (`runner:462-495`).
- `INSTALLABLE` + `agentPin`: OAR's official OpenCode install is a vendor script, not npm; Ducter's `agentPin` only knows npm (`packages/core/src/agent-setup.ts:61-68`). Either add an installer-channel path, or pin `npm install -g @opencode/cli@<verified>` (docs' CI route). Do **not** install over an existing v1/v2 copy: the scripts overwrite `~/.opencode/bin/opencode` in both directions.
- `agent-setup.ts`: a v2 sign-in via `createOpencodeProviderAuth` (needs a runner op; core cannot import OAR), and a v1 `terminal` state like pi (`packages/core/src/agent-setup.ts:599-601`). `logout` only v2.
- `available()`: replace the `models.length > 0` fallback for OpenCode with `opencode auth list --format json` (or the facade) — free models are listed signed out (`runner:917`).
- Probe: `opencode --version` accepts `1.x` / `opencode v2.x` (`OAR:version.js:24-31`); add to `scripts/probe-harnesses.ts` and `packages/core/src/harness-probe.ts`.

### 4.2 HARNESS_FACTS sketch

| Fact | Proposed value | Source |
|---|---|---|
| `version` | `["opencode","--version"]`, pattern `/(?:opencode\s+)?v?([12]\.\d+\.\d+)/` | VERIFIED `OAR:version.js:24-31`. |
| `verified` | `{from:"2.2.7", to:"2.3.0"}` (v2); v1 1.18.30–1.19.5 separately | DOCUMENTED OAR docs; OAR main states `>=1.18.30 <2.0.0` / `>=2.0.27 <3.0.0`, newer than 0.124.0. |
| `models` | `{}`; windows from the model's own catalog / `usage_update.size` | VERIFIED `OAR:list-models.js`; DOCUMENTED ACP usage. |
| `windowKnob` / `compactAtKnob` | `{via:"none"}` / `{via:"none"}` | VERIFIED `OAR` has no per-session window or compaction option; config `compaction.buffer` is not per-session. |
| `defaultCompactAt` | window minus max(15%, 16K free); ~85% on a 200K+ window; keep 15K | DOCUMENTED <https://opencode.ai/docs/compaction/>. |
| `compactionEvents` | `{started:true, ended:true}` v2; false on v1 | VERIFIED `OAR:compaction.js:20-33`; DOCUMENTED OAR docs "Automatic compaction". |
| `contextReport` | `usage_update.used` / `size` (OAR `contextUsage`) | VERIFIED `OAR:options.js:42,50`; DOCUMENTED ACP "Usage". |
| `resume` | `{supported:true, how:"ACP session/resume by id; same cwd only"}` | VERIFIED `OAR:session.js:39-43`. |
| `effort` | `{levels:["minimal","low","medium","high","xhigh","max"], perModel:true, defaultListed:false}` | VERIFIED variants are the levels (`OAR:session.js:31-33`); INFERRED union names; 0.124 v2 listing gives none. |
| `nativeCommands` | `discover:["skills"]`, `skillForm:"@{name}"`, `fixed:["compact","model","effort"]`, `hidden:[]` | VERIFIED `OAR:skills.js`; DOCUMENTED skills page; v1 has no `/compact`. |
| `channels` | `npm:"@opencode/cli"`, installer mark `/.opencode/bin/`, update `["opencode","upgrade"]`, `https://registry.npmjs.org/@opencode/cli/latest` | VERIFIED `OAR:install.js`, `OAR:upgrade.js:4-20` (v2 only). |
| `memSteps` | `{contextApp:"opencode", threadFrom:"opencode", plugin:"opencode-nowledge-mem"}` | VERIFIED `nmem t save --help` lists `opencode`; INFERRED for `contextApp`; DOCUMENTED research/238 for the plugin id. |
| `noTools` / `readOnly` / `webLook` | `args:[]` / impossible / `supported:false` | VERIFIED `OAR:options.js:9-18`: tool denial and user-config exclusion refused. Guard `noTools` in the runner. |
| `root` | `{as:"runs"}` | INFERRED: OAR's OpenCode runtime has no root check (unlike Claude Code). |
| `toolSchema` | `["anthropic","openai","gemini"]` | INFERRED: OpenCode passes tools through whichever provider package is selected. |

### 4.3 Install line

Use the v2 line: `curl -fsSL https://opencode.ai/v2/install | bash`. The v1 line (`https://opencode.ai/install`) is a different product line, not a fallback to run after it. On Windows OAR documents `npm install -g @opencode/cli`; Ducter's own installer should pin the npm package to `verified.to` and leave an existing vendor copy alone.

### 4.4 Sign-in card text (plain zh / en)

- zh: “登录 OpenCode：点「登录」，选一个模型服务商（OpenAI、Anthropic、OpenCode Go 等），按提示在浏览器里登录；也可以直接贴 API 密钥。登录只留在这台电脑上，Ducter 不会看到你的密码或令牌。”
- en: “Sign in to OpenCode: tap Sign in, pick a model provider (OpenAI, Anthropic, OpenCode Go, and more), then sign in in the browser or paste an API key. The sign-in stays on this computer; Ducter never sees your password or token.”
- v1 terminal line — zh: “OpenCode 1 只能在终端登录：在这台电脑上运行 `opencode auth login`。” en: “OpenCode 1 signs in from a terminal only: run `opencode auth login` on this computer.”
- Terms line (small, under the card) — zh: “OpenCode 会用你已有的模型登录。用订阅（OAuth）登录时，请确认那个服务商允许第三方工具这样用；不确定就用 API 密钥。” en: “OpenCode uses the model sign-ins already on this computer. With a subscription (OAuth) sign-in, check that provider allows third-party tools to use it; if unsure, use an API key.”

### 4.5 Mem plugin

`MemPluginFact.off` has no `none` value, so a `memPlugin` entry would claim a per-session off method that OAR does not have; leave it out until OAR exposes one. (VERIFIED `packages/protocol/src/harness-facts.ts:182-187`.)

- `nmem --json plugins inspect` on this Mac reports host `opencode`, installed 0.3.3, enabled (VERIFIED, 2026-11-26). Install: `opencode plugin add opencode-nowledge-mem`; update: `opencode plugin update opencode-nowledge-mem` (2.x). DOCUMENTED research/238, Mem SKILL.md.
- OpenCode can disable a plugin per session with `plugins:["-opencode-nowledge-mem"]` in its config, but OAR 0.124.0 owns `OPENCODE_CONFIG_CONTENT` and refuses a pre-set one (`OAR:prompt-config.js:16-17`), so Ducter cannot turn Mem off for one task. That is a real gap for memory-off tasks.
- `memSteps` is a partial fallback (`nmem context --source-app opencode`, `nmem t save --from opencode`), but `theirMemPlugin()` only knows agy's folders (`packages/runner/src/mem-steps.ts:61-80`), so Ducter would double-save when the person's OpenCode plugin is present. Generalize it or add an OAR per-session plugin-off option.

### 4.6 Known gaps

These restate findings tagged in §2/§4.2; item 8 is INFERRED.

1. **No partner, no one-shot, no read-only, no web-look**: OAR refuses `disallowedTools`, `userConfiguration`, and there is no allowlist; a tool-less session would still have OpenCode's tools.
2. **No isolation**: the person's global/project AGENTS.md and CLAUDE.md, `.opencode`/`.claude` skills, plugins and MCP servers load. `OPENCODE_DISABLE_PROJECT_CONFIG`/`OPENCODE_DISABLE_CLAUDE_CODE` exist (DOCUMENTED instructions page) but OAR does not use them for a clean session. This is why `noWebTasks` is true.
3. **Mem off is impossible per session** (4.5).
4. **No window/compaction control**: Ducter's D135 small-window plan cannot be enforced; `windowKnobs` is `unbounded`. v1 emits no compaction events and has no `/compact`.
5. **OAR 0.124.0 v2 `listModels` returns IDs only**, so no per-model effort menu or window; v1's verbose listing has variants. OAR main fixes this with the model API; upgrade or read the ACP `effort` config option.
6. **No OAR `authStatus` / `login` / `logout`**: v1 is terminal-only; v2 needs Ducter's own facade wiring. The facade omits `external`/`command` methods, so Claude Agent/Bedrock must be set up in a terminal.
7. **Install is a line choice, not a version pin**: both scripts write the same path and replace each other; OAR has `checkUpdate` on neither line (v2 `upgrade` only). Ducter's npm pin is the workaround.
8. **`directOnly` copy**: `DIRECT_ONLY_WHY` currently says Google's terms; an OpenCode line is needed or the UI will lie.
9. **Resume is cwd-bound**: a task whose worktree moves cannot resume; `fork.through` is refused; v1 `additionalDirectories` is refused.
10. **Images are model-gated**: a text-only model answers "Cannot read" rather than failing at open; Ducter should check the model's input modality or accept late failure.
11. **Steering is version-gated on v2**: `2.2.6` and earlier queue instead; a static `steer: true` in `HARNESSES` overstates older installs.
12. **Startup/DB and MCP scope**: concurrent first starts over a fresh DB can fail; ACP client MCP servers are registered per directory for the life of the process and a same-name entry replaces the person's. OAR's per-session process contains this, but a long-lived process/upgrade should be watched.
13. **Signed-out ≠ unusable**: the v1 line runs free `opencode/*` models with no account (v2's signed-out catalog differs), so any "logged in" test based on model count is wrong (4.1).
14. **`OPENCODE_CONFIG_CONTENT` is single-owner in 0.124.0**: Ducter cannot add its own overlay (plugin off, permissions, compaction) when it also sets a prompt.
