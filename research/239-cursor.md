# Cursor CLI → Ducter work agent

**Verdict first.** Add Cursor as a **task-only** agent, not a partner. The OAR runtime is **not the CLI**: it embeds Cursor's official `@cursor/sdk` 1.4.1 in the host process (or a Node child). The HARNESSES entry below is ready, but **do not ship it through OAR 0.124.0's default in-process mode**: in-process Cursor refuses `SessionOptions.env`, and Ducter always passes a nonempty env overlay, so the session fails at open; passing no env would inherit Ducter's whole `process.env`, breaking D102. OAR's subprocess mode cannot run inside Ducter's `bun build --compile` binary. The alternative (Cursor CLI over ACP) avoids that but needs a new runtime and loses per-session HTTP MCP.

`OAR:` below = `node_modules/@botiverse/oar/dist/runtimes/cursor/`. `runner/oar.ts` = `packages/runner/src/oar.ts`. Evidence tags: **VERIFIED** = read in code; **DOCUMENTED** = read in a doc/URL; **INFERRED** = reasoning, not verified.

## 1. Proposed HARNESSES entry

| Field | Value | Source |
|---|---|---|
| `id` | `"cursor"` | Proposed id; no existing `HarnessId`. |
| `name` | `"Cursor"` | Cursor's own product name. DOCUMENTED <https://cursor.com/docs/cli/installation> |
| `badge` | `"cu"` | INFERRED (two-letter mark, matches the table's style). |
| `command` | `"agent"` | DOCUMENTED: the CLI binary is `agent` (<https://cursor.com/docs/cli/installation>). **OAR never runs it**; this is only the person's CLI. VERIFIED `OAR:index.js:37-58` (SDK, no command). |
| `partner` | `false` | VERIFIED `OAR:model.js:56-57`: `systemPrompt` and `appendSystemPrompt` are both refused, so the partner's native prompt cannot be installed. |
| `task` | `true` | VERIFIED `OAR:index.js:37-58`: a full session runtime exists (prompt, steer, queue, resume). |
| `images` | `true` | VERIFIED `OAR:index.js:46`, `OAR:session.js:79-84`; OAR doc: a plain red PNG was answered "Red". DOCUMENTED <https://github.com/botiverse/oar/blob/main/docs/runtimes/cursor.md> |
| `steer` | `true` | VERIFIED `OAR:index.js:46`, `OAR:run.js:97-138`. Text only; images are rejected. |
| `draws` | omitted | No Cursor image-generation tool is mapped by OAR; Cursor's "Imagine" is a product feature, not a session tool. INFERRED. |
| `isolation` | `"native"` | VERIFIED `OAR:model.js:160`: `userConfiguration:"exclude"` becomes `settingSources: []`; partial subsets are refused (`model.js:48-49`). Ducter's runner currently passes this only for Claude Code (`runner/oar.ts:823`) — gap §4.3. |
| `systemPrompt` | `"none"` | VERIFIED `OAR:model.js:44-61`; OAR doc "Instructions (unsupported)". |
| `taskInstructions` | `"first-turn"` | VERIFIED consequence: because append is refused, Ducter must use its `<instructions>` preamble (`runner/oar.ts:800-801, 1062`). |
| `mcp` | `"http"` | VERIFIED `OAR:model.js:129-142`: stdio **and** HTTP with headers, passed on create and resume. |
| `login` | `"account"` | VERIFIED `OAR:login.js:8-30` (browser/PKCE login) and `OAR:auth-status.js:32-39` (account email + expiry). |
| `billing` | `"plan"` | VERIFIED `OAR:auth-status.js:32-39` (`credential:"api_key", metering:"plan"`); DOCUMENTED "User API keys bill to that user's plan" <https://cursor.com/docs/sdk/typescript>. |
| `cheapModel` | `"composer-2.5"` | DOCUMENTED: Composer 2.5 is Cursor's own model included in the plan pool (<https://cursor.com/docs/models-and-pricing>); OAR probes `composer-2.5` (cursor.md). |
| `modelForm` | `"a Cursor catalog id or alias (e.g. composer-2.5, gpt-5.6-sol); \"default\" is Auto"` | VERIFIED `OAR:model.js:14-18, 82-104`; `OAR:list-models.js:11-24`; catalogue DOCUMENTED. |
| `install` | `"curl https://cursor.com/install -fsS \| bash"` | DOCUMENTED <https://cursor.com/docs/cli/installation> (macOS/Linux/WSL). **This installs the CLI, not what Ducter's OAR path needs** — see §4.2. |
| `signIn` | `"a cursor.com sign-in link (open it anywhere; it completes on its own), or CURSOR_API_KEY"` | VERIFIED `OAR:login.js:33, 91-110`; key precedence `OAR:access.js:44-46`; DOCUMENTED <https://cursor.com/docs/cli/reference/authentication>. |
| `signOut` | `true` | VERIFIED `OAR:logout.js:40-70`: `Cursor.auth.logout()`. **Local only**: the minted key stays valid until expiry or dashboard revocation (`logout.js:8-20`). |
| `pickOnly` | omitted (`false`) | Cursor can be ranked normally for tasks; no `no_web`/no-prompt reason to demote it. |
| `directOnly` | omitted (`false`) | Nothing here needs the Antigravity restriction. |
| `noWebTasks` | `true` (temporary) | INFERRED: Cursor's own web tools are not named/denied in OAR, so a web-reading task cannot yet be held to Ducter's rules. Flip after a live denial test. |

```ts
cursor: {
  id: "cursor",
  name: "Cursor",
  badge: "cu",
  command: "agent",
  partner: false,
  task: true,
  images: true,
  steer: true,
  isolation: "native",
  systemPrompt: "none",
  taskInstructions: "first-turn",
  mcp: "http",
  login: "account",
  billing: "plan",
  cheapModel: "composer-2.5",
  modelForm: "a Cursor catalog id or alias (e.g. composer-2.5, gpt-5.6-sol); \"default\" is Auto",
  install: "curl https://cursor.com/install -fsS | bash",
  signIn: "a cursor.com sign-in link (open it anywhere; it completes on its own), or CURSOR_API_KEY",
  signOut: true,
  noWebTasks: true,
},
```

Also add `"cursor"` to `HARNESS_IDS` and `HARNESS_KEYS.cursor = ["CURSOR_API_KEY"]` (`packages/protocol/src/harnesses.ts:6, 274`). Do **not** add it to `PARTNER_FALLBACK` or `MEM_BRIDGE_HARNESSES`.

## 2. How OAR runs it

### 2.1 Launch: SDK, not the CLI

- `createCursorRuntime({ sdk: () => import("@cursor/sdk") })` is the default **in-process** mode; `{ execution: "subprocess", sdkModule }` runs the SDK in a Node child. Cursor is deliberately **not** in `defaultRuntimes`; the host installs the optional peer `@cursor/sdk@1.4.1` and hands it over. **VERIFIED** `OAR:index.js:12-42`, `OAR:sdk-version.js:2`, `OAR:installation.js:2-17`.
- **No command and no args.** `launchArgs` is refused in both modes; there is no Cursor command line to add to. **VERIFIED** `OAR:model.js:59`, `OAR:index.js:23-30`.
- Subprocess mode spawns `process.execPath -e <inline script> <spec>` with `stdio: ["ignore","pipe","pipe","ipc"]`, `serialization:"advanced"`, detached on every platform. **VERIFIED** `OAR:subprocess/channel.js:38-42`, `node_modules/@botiverse/oar/dist/shared/executable/node-script.js:11-42`.
- **Production blocker:** Ducter ships `bun build --compile` (`packages/cli/build.sh:1-24`). In that host `nodeEvalExecutable()` returns `null` and `spawnNodeScript` throws "compiled single executable … cannot run a Node script child". So subprocess mode is refused in the shipped binary; only in-process works. **VERIFIED** `.../shared/executable/node-eval.js:10-17`, `node-script.js:30-36`.
- Environment: in-process **inherits Ducter's whole `process.env`** and refuses `SessionOptions.env`; subprocess takes `env` over `inherit` or `clean`, removes `CURSOR_API_KEY` from the child and passes it to the SDK as `apiKey` over IPC, and adds `CURSOR_TREE_SITTER_VENDOR_DIR`, `CURSOR_RIPGREP_PATH`, `OAR_CURSOR_CHILD_<id>`, `ELECTRON_RUN_AS_NODE`. **VERIFIED** `OAR:model.js:58`, `OAR:access.js:35-49`; DOCUMENTED cursor.md "Child environment". The refusal is enforced, not advisory: `refuseSessionOptions` treats any nonempty `env` as given and throws at open (`OAR:session-process.js:10-12`; `node_modules/@botiverse/oar/dist/shared/session-options.js`).
- Open: `Agent.create` / `Agent.resume` with the model selection, `disallowedTools`, `mcpServers`, and `local { cwd, dirs, settingSources, sandboxOptions: { enabled: false } }`. A resumed first send passes `local.force`. **VERIFIED** `OAR:model.js:150-175`, `OAR:session.js:44, 101`; DOCUMENTED cursor.md "Session creation and resume".

### 2.2 Sign-in

- `login` is `Cursor.auth.login()`: PKCE, `onLoginUrl` fires at once, `openBrowser:false`; OAR relays the URL as one `auth_url` event with "Open this URL on any device and sign in to Cursor; the login completes on its own." It polls; OAR's deadline is 15 minutes; then it mints a **user API key** and saves it to `~/.cursor/sdk/auth.json` (0600). No code is pasted back. The mint/store flow is **VERIFIED** `OAR:login.js:8-34, 91-110, 145-174`; the 90-day expiry is **DOCUMENTED** cursor.md "Login".
- `authStatus` is `Cursor.auth.status()`: a **local** read of `auth.json` only; answers `logged-out`, or `logged-in` with `email` and `apiKeyExpiresAtMs`, never the key. If `CURSOR_API_KEY` is set it returns **`unknown`** with `configured: ["environment: CURSOR_API_KEY"]`, because status neither reads nor validates that key. **VERIFIED** `OAR:auth-status.js:14-20, 32-39, 69-71`.
- **API key vs subscription vs OAuth.** The SDK accepts a user API key or the key minted by the browser login; both are billed to the user's Cursor plan. **VERIFIED** `OAR:auth-status.js:35-36`; DOCUMENTED "User API keys bill to that user's plan" and "For interactive hosts … `Cursor.auth.login()` mints and stores one through a browser login" (<https://cursor.com/docs/sdk/typescript>). Cursor OAuth applications exist, but **"Sign in to the Cursor CLI and SDK" is one of the five scopes explicitly not available** to OAuth apps, so there is **no third-party OAuth path** to sign a user in. **DOCUMENTED** <https://cursor.com/docs/security/oauth-applications>.
- `logout` removes the local `auth.json` and makes no request; the minted key is **not revoked** and remains valid until expiry. **VERIFIED** `OAR:logout.js:8-20, 40-70`.
- The SDK credential is **separate from the Cursor CLI's login and the editor's**; `agent login` does not sign Ducter's Cursor in. **DOCUMENTED** cursor.md "Native concepts".

### 2.3 Models

- Listed with `Cursor.models.list()`, in the SDK's order; `default` is the catalogue's Auto model. Each model carries its own reasoning parameter — `effort` (Claude 5, Grok 4.6), `reasoning` (GPT), `reasoning_effort` (Grok 4.7, Gemini 3.8, Claude Sonnet 5.5) — plus a `thinking` on/off switch on some Claude models; `defaultEffort` is the default variant's value. **VERIFIED** `OAR:list-models.js:5-24`, `OAR:model.js:14-18`.
- A requested effort is validated against that model's menu; an unknown model rejects the open. **VERIFIED** `OAR:model.js:82-104`; DOCUMENTED cursor.md "Models, instructions, and context".
- Ducter maps to `{id, label, efforts, defaultEffort}` (`runner/oar.ts:1035-1045`). No account usage: the SDK's usage call returned `feature_unavailable`; OAR has no `accountUsage` for Cursor. **VERIFIED** `OAR:index.js:32-35`; DOCUMENTED cursor.md "Installation and account usage".

### 2.4 Steering, images, MCP, instructions, skills

- **Steering:** `run.steer(text)`; `complete_delivered` = accepted, `{outcome:"queued"}` (SDK 1.4.0) = accepted but Cursor owns the follow-up, `revert_to_followup` = refused; a run that ends first is refused. **VERIFIED** `OAR:run.js:97-138`; `OAR:session.js:213-229`.
- **Images:** prompt images travel as `{data, mimeType}`; an image-only prompt sends `{text:"", images}`. A **steer with images is rejected** ("cursor steers with text only"). **VERIFIED** `OAR:session.js:79-84, 195, 222-224`.
- **MCP:** stdio `{command,args,env}` and HTTP `{url,headers}` are both accepted, on create and again on resume (the SDK keeps none). An individual `mcp__server__tool` selector is **not** supported; `mcp` denies the whole MCP family. **VERIFIED** `OAR:model.js:129-142`; DOCUMENTED cursor.md "Session MCP servers", "Disallowed tools".
- **System instructions:** `systemPrompt` and `appendSystemPrompt` are **both refused**; a local run fails with "unknown option '--system-prompt'". Ducter's only channel is the `<instructions>` preamble on the first message. **VERIFIED** `OAR:model.js:44-61`; `runner/oar.ts:800-801, 1062`.
- **Isolation:** `userConfiguration: "exclude"` → `settingSources: []`; omitted/`"include"` → `["project","user"]`; a partial subset is refused. The SDK also gets `sandboxOptions: { enabled: false }`, so a `~/.cursor/sandbox.json` cannot turn a sandbox on. **VERIFIED** `OAR:model.js:48-49, 160-161`.
- **Skills:** `skills()` discovers `.cursor/skills`, `.claude/skills`, `.codex/skills`, `.grok/skills`, `.agents/skills` under cwd and home, plus `SKILL.md` under `.cursor/rules`; git workspaces also scan nested paths with Cursor's ripgrep companion. Plugin/managed sources are excluded. Commands, MCP-server and tool inventories are `unsupported`. **VERIFIED** `OAR:skills.js:16-17, 40, 61-74`; `OAR:skill-files.js:7, 75-100`; DOCUMENTED cursor.md "Skill discovery".
- Capabilities Ducter sees: `steer:true`, `images:true`, `contextUsage:{tokens:true, contextWindow:false}`, `mcpTransports:["stdio","http"]`, `stopTask:false`; queue is adapter-held (`durable:false`), attribution is `attributed`, and `compact` exists only when the opened agent exposes `summarize`. **VERIFIED** `OAR:index.js:46`, `OAR:session.js:187-195`.

## 3. Terms of service / usage policy

Cursor's official SDK is an explicitly supported way to drive the same agent from other software, including orchestrators, which makes this materially safer than Antigravity's personal-OAuth case. The caveats are the broad AUP wording, resale/hosting, and team policy.

- **Supported orchestration (favorable):** "Good starting points for CI auto-fix bots, bug triage workers, code-review passes, embedded in-product agents, and orchestrators." — <https://cursor.com/docs/sdk/typescript>. **DOCUMENTED.**
- **Subscription billing (favorable):** "User API keys bill to that user's plan." — same SDK page. **DOCUMENTED.**
- **ToS 1.5(iii), no resale:** "rent, lease, lend, or sell the Service"; and 1.5(xi) "knowingly permit any third party to do any of the foregoing." — <https://cursor.com/terms-of-service>. **DOCUMENTED.** Personal, self-hosted use is not reselling; a hosted Ducter where one account drives many people's work would be.
- **AUP, automated access:** "Accessing the Service through automated or non-human means, whether through a bot, script, or otherwise" is listed as non-compliance — <https://cursor.com/acceptable-use-policy>. **DOCUMENTED; interpretation not verified.** Read literally it covers any scripted use; Cursor's own headless and SDK docs authorize automation, so the intended target is probably unauthorized access. Get this clarified before a public launch.
- **AUP, metering:** "Manipulating, circumventing, or interfering with Anysphere's subscription, billing, or usage-metering systems, including through direct or automated means." — same AUP. Ducter must not pool one account, fake seats, or route around usage limits. **DOCUMENTED.**
- **OAuth is not the route:** Cursor's OAuth docs say five scopes are not available, including **"Sign in to the Cursor CLI and SDK"** — <https://cursor.com/docs/security/oauth-applications>. Do **not** build a Cursor OAuth app to sign users in. **DOCUMENTED.**
- **Team policy:** headless mode can be disabled by a team admin, and Cursor notes the setting "doesn't cover other ways to run agents without a UI, such as the Cursor SDK" — <https://cursor.com/docs/cli/headless>. Ducter must not be a way around a team's headless/approval policy. **DOCUMENTED.**
- **Community answer (not authoritative):** "you can't resell Cursor itself as a standalone service, meaning you can't give third parties access to Cursor or usage under your account." — <https://forum.cursor.com/t/inquiry-regarding-official-api-or-commercial-license-for-using-cursors-engine-as-a-backend-component/165063/6>. **DOCUMENTED, informal.**

**Risk verdict:** low-to-medium, lower than Antigravity. Conditions: one person, own account/key, personal or self-hosted Ducter; no OAuth app; no shared accounts; no hosted multi-tenant resale; honor team headless/approval policy. The unresolved item is the AUP's "automated or non-human means" sentence — mark it **not verified** and get legal/support sign-off before promoting Cursor widely.

## 4. What Ducter must add beyond the HARNESSES entry

### 4.1 Process isolation (the blocker)

In-process Cursor runs the SDK in Ducter's own process: `SessionOptions.env` is refused and every tool inherits Ducter's full `process.env` — including keys D102 never granted that harness. **VERIFIED** `OAR:model.js:58`, `OAR:access.js:14-25`. This is worse than a leak: Ducter always builds a nonempty env overlay (`runner/oar.ts:819`), and `refuseSessionOptions` throws `UnsupportedOptionError: env` before the first turn (`OAR:session-process.js:10-12`; `shared/session-options.js`). The same in-process refusal fires earlier in `installation` (`OAR:installation.js:20-22`), so `start()` fails at the install probe (`runner/oar.ts:867`), and `authStatus`/`listModels` reject it too (`OAR:auth-status.js:63-65`, `OAR:list-models.js:38-40`); `available()` would report Cursor not installed, signed out, with no models. OAR's subprocess mode is the right shape, but in the `bun build --compile` binary `nodeEvalExecutable()` returns `null`, so every session fails before it starts. **VERIFIED** `node-eval.js:10-17`, `node-script.js:30-36`, `packages/cli/build.sh`. So in-process is not merely a D102 weakness; it fails closed. Options, in preference order:

1. **Node sidecar / upstream OAR `childProcess`.** OAR `main`'s cursor docs describe `childProcess: { command, args? }` and `runCursorChild`, but the installed 0.124.0 typings have only `sdkModule`/`envBase` (`OAR:index.d.ts:18-38`). Either wait for that OAR release and spawn Ducter's pinned Node (`<data>/tools/node`), or ship a small Node host that owns the SDK session; do **not** run Cursor in-process in production.
2. **A Cursor CLI ACP runtime** (`agent acp`, `cursor_login`) as a separate process. It avoids env leakage, but ACP reads MCP only from `.cursor/mcp.json` (project/user), not per-session HTTP entries, so Ducter's remote MCP endpoint would need a written config file — worse for D102 and for task folders. **DOCUMENTED** <https://cursor.com/docs/cli/acp>.
3. In-process only for a local dev/test path, explicitly excluded from release.

### 4.2 Install line and runtime wiring

- Add `@cursor/sdk@1.4.1` to `packages/runner` and import it lazily: `createCursorRuntime({ sdk: () => import("@cursor/sdk") })`; add `case "cursor"` to `defaultLoader` (`runner/oar.ts:462-496`). Pin the exact version, as OAR does (`sdk-version.js:2`); the SDK is ~38 MB plus a native companion and exists only for darwin arm64/x64, linux arm64/x64, win32 x64 (`OAR:installation.js:2-17`).
- If the CLI is offered to the person at all, its install line is `curl https://cursor.com/install -fsS | bash` (Windows: `irm 'https://cursor.com/install?win32=true' | iex`). This is **not** the line that makes Ducter's Cursor work — the SDK ships inside Ducter. Do not put the CLI installer in `HARNESS_FACTS.cursor.channels` as if Ducter needed it.
- Call `cursorNativeEnvironment()` at startup in in-process mode so `CURSOR_TREE_SITTER_VENDOR_DIR` and `CURSOR_RIPGREP_PATH` are set; OAR exports it for exactly this (`OAR:index.js:59`, `native-environment.js`).
- `HARNESS_FACTS.cursor` is compile-forced and must be written in full. The awkward part is `version`: the CLI's `agent --version` is not the SDK Ducter bundles. Add a bundled branch like pi's `ducter` channel and report the pinned SDK version, not the CLI's; do not offer an update path Ducter cannot verify.

### 4.3 Runner and probe changes

- `adaptSpec`: pass `userConfiguration: "exclude"` for a clean Cursor session (today the ternary is Claude Code only, `runner/oar.ts:823`); never pass `launchArgs` or `env` in in-process mode; leave MCP as HTTP; route the refused system prompt through the existing preamble path (`runner/oar.ts:800-801`).
- `HARNESS_CONFIG` in `packages/runner/src/child-env.ts:40-49` needs a `cursor: /^CURSOR_/` row, and `HARNESS_KEYS.cursor = ["CURSOR_API_KEY"]`.
- `available()` / `models()`: when `authStatus` is `unknown` because `CURSOR_API_KEY` is set, the current code reports `loggedIn:false` (`runner/oar.ts:914-917`), even though sessions would work. Treat `unknown` + `configured:["environment: CURSOR_API_KEY"]` as signed in, or fall back to a successful `listModels`.
- `accountUsage` is unsupported (SDK `feature_unavailable`); the row should say nothing rather than "unavailable". `logout` is local-only, so the UI must not claim the key was revoked.
- `noWeb`, `noTools` and `readOnly` need Cursor tool names verified against the live SDK; today only `disallowedTools` is known to work (`shell` excludes shell + shell-stdin, `mcp` excludes the MCP family). Keep `noWebTasks: true` until that is tested.
- `nativeCommands`: `discover: ["skills"]` only — OAR's command, MCP-server and tool inventories return `unsupported` for Cursor; no skill invocation form is verified, so do not invent a `/skill:` prefix.

### 4.4 Sign-in card text (plain zh / en)

- Title — zh: `登录 Cursor` · en: `Sign in to Cursor`
- Body — zh: `点“登录”会给你一个 cursor.com 链接。在任何设备上打开并确认，Ducter 这边会自己完成，不用把密码或验证码交给它。也可以改用 Cursor API key。` · en: `Sign in gives you a cursor.com link. Open it on any device and confirm — Ducter finishes on its own and never sees your password or a code. A Cursor API key works too.`
- Waiting — zh: `在浏览器里确认后，这里会自己变成已登录。` · en: `Once you confirm in the browser, this turns signed in by itself.`
- Done — zh: `已登录（{email}）。密钥 90 天后过期，到时再登录一次。` · en: `Signed in ({email}). The key expires in 90 days; sign in again then.`
- Sign-out — zh: `这台电脑上的 Cursor 登录已清除；Cursor 那边的密钥仍然有效，直到到期或在 Cursor 后台撤销。` · en: `Cursor's sign-in on this computer is cleared. The key itself stays valid until it expires or you revoke it in Cursor's dashboard.`
- The current `agent-setup.ts` `login()` only knows Codex, Claude Code, pi, DeepSeek Harness and Antigravity (`packages/core/src/agent-setup.ts:596-608`). Cursor needs a new branch that calls OAR's `login` and relays the `auth_url` — **not** `agent login`, which writes a different credential store.

### 4.5 Mem plugin

- Mem does ship a Cursor plugin: `~/.cursor/plugins/local/nowledge-mem-cursor`, with a `sessionStart` context hook, a `stop` transcript hook, MCP wiring and four skills. **DOCUMENTED** <https://mem.nowledge.co/docs/integrations/cursor>.
- OAR's SDK session does **not** load plugin sources: `skills()` scans `.cursor/skills` etc. and OAR's user configuration selects only `project`/`user`; the plugin's own `hooks/hooks.json` is not `.cursor/hooks.json`. So the Mem plugin will **not** run inside a Ducter Cursor task. **VERIFIED** `OAR:skills.js:16-17, 40`; DOCUMENTED cursor.md "User configuration" ("does not opt into … `plugins` sources").
- Use Ducter's D417 fallback instead of a `memPlugin` fact: `memSteps: { contextApp: "cursor", threadFrom: "cursor", plugin: "nowledge-mem-cursor" }`. Mem reads Cursor's local `~/.cursor/projects/**/agent-transcripts` (DOCUMENTED Mem Cursor page), which is the same store OAR's local agents use (DOCUMENTED cursor.md "Native concepts"). The exact `contextApp`/`threadFrom` source id is **INFERRED** from Mem's `nmem t sync --from cursor`; verify it against `nmem t save --help` before coding.
- Do not claim Bridge: Mem's Cursor page documents the context/save hooks, not a Bridge `bridge` skill; verify before adding Cursor to `MEM_BRIDGE_HARNESSES`.

### 4.6 Known gaps

- **No partner:** no system-prompt replacement or append; only a first-turn preamble. Cursor tasks are fine; the partner cannot live here.
- **No account usage:** `accountUsage` absent; quota must be inferred from failures, not read.
- **No `stopTask`, no per-turn process tree:** `endTurnProcessesOnAbort` refused; `stopTask:false`; a background job is not Ducter-stoppable.
- **Local-only logout:** the minted key remains valid; the only real revoke is Cursor's dashboard.
- **Skills only:** commands/MCP/tool inventories unsupported; Cursor's own `/` commands are not available through OAR.
- **No plugin loading:** the person's Mem/other Cursor plugins do not load; Ducter's Mem steps are the substitute.
- **CLI ≠ SDK:** separate credential stores; `agent login` does not sign Ducter's runtime in; the CLI installer does not install what OAR needs.
- **Docs are ahead of the package:** the online cursor.md documents `childProcess`/`runCursorChild`, but 0.124.0 has no such option — check the installed typings, not the web doc, when implementing the sidecar.
- **MCP/team policy:** the SDK opens with sandbox off and no approval prompts (Ducter's D16), which can diverge from a Cursor team's `permissions.deny`/headless policy; a task that must honor a team's rules should not use this agent until that is tested.

## Sources read

OAR 0.124.0 cursor runtime `.js`/`.d.ts` (all files above), `packages/protocol/src/harnesses.ts`, `packages/protocol/src/harness-facts.ts`, `packages/runner/src/oar.ts`, `packages/runner/src/child-env.ts`, `packages/core/src/agent-setup.ts`, `packages/core/src/harness-probe.ts`, `packages/cli/build.sh`, `packages/runner/package.json`. Docs: OAR `docs/runtimes/cursor.md` on `main` (not shipped in the package), Cursor CLI Installation/Authentication/Headless/ACP, Cursor SDK TypeScript, Cursor OAuth Applications, Cursor Models & Pricing, Cursor ToS, Cursor AUP, Mem Cursor integration.
