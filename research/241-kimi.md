# Kimi Code CLI as a Ducter work agent

Read-only research, 2026-11-26. No Kimi CLI was run, installed, or signed in to.
**VERIFIED** = read in installed code; **DOCUMENTED** = read in a doc/URL; **INFERRED** = reasoned.
`OAR` = `node_modules/@botiverse/oar/dist/runtimes/kimi/` (`@botiverse/oar@0.124.0`). The package
ships no `docs/`, so `OD` = https://github.com/botiverse/oar/blob/v0.124.0/docs/runtimes/kimi.md.
`KCG` = https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html.

## Verdict first

**Tasks only, person-asked only.** OAR refuses the three things a partner or clean session needs:
replacing/appending the system prompt, denying tools, and leaving the person's setup out
(`OAR/options.js:6,10-12`). So Kimi cannot be the partner or hold a read-only session; a task also
keeps the person's hooks, plugins, MCP servers and instructions. Recommend `directOnly: true` and
`noWebTasks: true`, while still allowing it as an ordinary task agent when the person has it.

Tradeoff: `directOnly` rules out waits, timers, routines and Keeps on Kimi (D594's mechanism),
stricter than a single person-asked task needs. Alternative: if Moonshot confirms in writing that
one user-initiated Ducter task is "interactive", drop `directOnly` but still forbid batch fan-out,
routines and Keeps. Third-party use is **not** Antigravity's case: Kimi supports mainstream
third-party agent frameworks on a subscription (KCG, §3); the risk is the *unattended* pattern.

## 1. Proposed HARNESSES entry

Add `"kimi"` to `HARNESS_IDS` (`packages/protocol/src/harnesses.ts:6`) and this to `HARNESSES`
(`harnesses.ts:108`):

```ts
kimi: {
  id: "kimi",
  name: "Kimi Code CLI",              // DOCUMENTED: Kimi docs title; OAR brand "Kimi Code" (index.d.ts:16-23)
  badge: "km",                        // INFERRED: follows cc/cx/ds/ag
  command: "kimi",                    // VERIFIED: OAR/installation.js:20
  partner: false,                     // INFERRED: no clean setup, no read-only (OAR/options.js:6,10-12)
  task: true,                         // VERIFIED: OAR/index.js:11-40 opens real sessions
  images: true,                       // DOCUMENTED: OD "Prompt"; VERIFIED path: shared/acp/session.js:73 reads initialize
  steer: false,                       // VERIFIED: OAR/index.js:14; OD "Steer (not available on this transport)"
  isolation: "none",                  // VERIFIED: userConfiguration refused (OAR/options.js:6); custom home unsafe (OD §User configuration)
  systemPrompt: "none",               // VERIFIED: systemPrompt refused (OAR/options.js:11)
  taskInstructions: "first-turn",     // VERIFIED: append refused (OAR/options.js:12); runner/oar.ts:800-801 moves it to the preamble
  mcp: "http",                        // VERIFIED: OAR/index.js:16 (>=2.1.1); DOCUMENTED: OD §Session creation, "mcpCapabilities http"
  login: "account",                   // VERIFIED: OAuth device login (OAR/login.js:45; auth-config.js:10-13)
  billing: "plan",                    // DOCUMENTED: Kimi Code subscription; OAR signs in the managed plan only
  cheapModel: "kimi-code/kimi-for-coding", // DOCUMENTED: Kimi `kimi` reference uses this id; INFERRED cheapest suitable
  modelForm: "a model id from its own list (e.g. kimi-code/k3.1-pro, kimi-code/kimi-for-coding)", // VERIFIED: OAR/list-models.js:24-33; DOCUMENTED: Kimi models page
  install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash", // VERIFIED: OAR/install.js:18
  signIn: "kimi login (device code; --region global outside mainland China)", // VERIFIED: OAR/login.js:45; DOCUMENTED: OD §Runtime login
  signOut: true,                      // VERIFIED: OAR/logout.js:5-20 (ACP logout)
  directOnly: true,                  // INFERRED from KCG's "interactive use only" / no non-interactive automation
  noWebTasks: true,                  // INFERRED: no isolation and no tool denial (OAR/options.js:6,10); D416's reason
}
```

Omitted: `draws`, `pickOnly`. `HARNESS_KEYS.kimi = []` (OAuth, not an env key: `OAR/auth-config.js:82-90`); not in `PARTNER_FALLBACK` or `MEM_BRIDGE_HARNESSES`.

## 2. How OAR launches and drives it

**Launch.** One `kimi acp` subprocess per session in the task's `cwd`, with the caller's env overlay
(`OAR/session.js:25-26`; `shared/acp/session.js`). ACP `clientInfo` is `oar`; OAR declares `fs`
read/write `false`, `terminal: true` (OD §Session creation). No `--model`, no `--yolo`: model is
`session/set_model`, effort is `session/set_config_option` on `thinking`, yolo is `session/set_mode`
when advertised (`OAR/session.js:14-24,51-55`). `launchArgs` go after `acp`, but Kimi reads only
`--login`/`--region` there, so Ducter has no useful launch argument; `--skills-dir`, `--agent-file`
and `--agent` are TUI flags and are not forwarded (OD §Launch arguments). No Kimi-specific env is
set for ACP; OAR honours `KIMI_CODE_HOME` in readers, `OAR_KIMI_BIN` is the install probe,
`KIMI_INSTALL_DIR` is install detection (`OAR/auth-config.js:82`, `installation.js:10-20`). The
`kimi web` sidecars set `KIMI_CODE_MODEL_CATALOG_REFRESH_ON_START=0` and `..._INTERVAL_MS=0`
(`OAR/web-startup.js:122`). Open deadline is 630 s because 2.2.0 awaits SessionStart hooks
(`OAR/session.js:34-36`); resume only in the session's own folder (`session.js:47-49`) and
`additionalDirectories` is refused on resume (`session.js:40-42`). **VERIFIED/DOCUMENTED**

**Sign-in.** `kimi login` (OAR adds `--region mainland-cn|global` when given), 16-minute bound; URL
and device code are read from stderr (`Opening browser for Kimi device login: …`, `… enter code: …`);
success needs `Logged in to …`, then an ACP `authenticate` re-check (`OAR/login.js:11,38-56,89-92`).
Auth status is `kimi acp` + `initialize` + `authenticate {methodId:"login"}`; `-32000` = logged out,
timeout/other = unknown; 20 s default (`OAR/auth-status.js:5-22`). Credentials are OAuth JSON under
`$KIMI_CODE_HOME/credentials/kimi-code.json`; OAR only reads the token for usage and never
refreshes or rewrites it (`OAR/auth-config.js:82-90`, `oauth-token.js:18-28`). Logout calls ACP
`logout` and re-reads status (`OAR/logout.js:12-19`). Login floor is 2.3.3 (`OAR/login.js:11`).
The managed Kimi Code service uses OAuth, not a static key (Kimi providers page); a `kimi`-type
provider with `KIMI_API_KEY` in `config.toml` is a separate pay-per-token route that OAR's login
does not drive. **VERIFIED/DOCUMENTED**

**Models.** Kimi has no model-list method: OAR opens a temporary ACP session, reads the
`configOptions` entry `model`, closes it, and marks the current model `default`
(`OAR/list-models.js:24-33,93-118`). Effort is `thought_level` (id `thinking`), only on the current
model; `off` is dropped. Current documented ids are `k3.1-pro`, `k3.1-pro-highspeed`, `k3`,
`k3-256k`, `kimi-for-coding`, `kimi-for-coding-highspeed`; windows 1,048,576 (262,144 for 256K);
effort `low/high/max` (default `high`, or `max` on K2.8). The CLI's own example uses the provider
prefix, `kimi-code/kimi-for-coding`; use the ids `listModels` returns, never display names.
**VERIFIED/DOCUMENTED**

**Controls.** Steering is **no** (`sessionCapabilities().steer` false, `OAR/index.js:14`; ACP has
no steer method), so `steerOrQueue()`/`deliver()` queue in host memory until the turn ends (OD
§Prompt). Ducter must hold the words and say so in the composer. Images are **yes**: `initialize`
advertises `promptCapabilities.image`; OAR sends ACP `image` blocks before text
(`shared/acp/session.js:73`, `shared/acp/prompt.js:9-12`); live, a green PNG answered "green" (OD).
MCP **HTTP works**: `mcpTransports: ["stdio","http"]` for executables >= 2.1.1 (`OAR/index.js:15-16`);
OAR passes `mcpServers` to `session/new`; Kimi maps `http → transport: http` and supports static
`headers` (Kimi `kimi acp` reference; Kimi MCP page). No stdio bridge needed. `mcpToolsListChanged`
is `"none"` (`OAR/index.js:39`): a running session keeps its tool list. **VERIFIED/DOCUMENTED**

**Instructions and skills.** Replaced **no**, appended **no**: both `systemPrompt` and
`appendSystemPrompt` are refused before launch (`OAR/options.js:11-12`), and `kimi acp` forwards
neither `--agent-file` nor `--agent` (OD §Models). Ducter's brief becomes the first message
(`runner/oar.ts:800-801`). The person's `AGENTS.md`, enabled plugins' `systemPrompt`, hooks and MCP
servers still apply because the session cannot be isolated. Skills **yes, catalog only**: OAR starts
`kimi web --no-open --host 127.0.0.1 --port 0`, registers/reads
`/api/v1/workspaces/{id}/skills`, and removes only its own registration (`OAR/skills.js:24-61`);
sources map builtin/user/project/extra and `disableModelInvocation` is preserved (`skills.js:8-14`).
Invoke as `/skill:<name>`, plugin skills as `/skill:<plugin-id>:<name>` (Kimi slash-commands page).
OAR's independent commands, MCP and tools inventories are unsupported for Kimi (OD; README).
Composer fixed commands should be **`compact` and `model`**, not `effort`: Kimi has `/compact` and
`/model`, but no `/effort`, and unknown `/...` input is sent as prose (Kimi slash-commands page).
**VERIFIED/DOCUMENTED**

**Context, resume, failure.** `contextUsage` is `{tokens:true, contextWindow:true}`; Kimi pushes
`usage_update` after the prompt answer and OAR holds the answer at most 500 ms (`OAR/index.js:14`,
`session.js:44-46`; OD §Context). Resume is `session/resume` by id in the same `cwd`, no history
replay; no `fork`, `goals`, `name`, `serviceTier`, `outputSchema`, `disallowedTools` or
`endTurnProcessesOnAbort` (`OAR/options.js`). Native ACP maps most provider failures to `end_turn`
with no message, so OAR records a completed turn; missing auth (`-32000`) is the exception. Treat an
empty completed turn on Kimi as suspicious. **VERIFIED/DOCUMENTED**

## 3. Terms / usage policy for a third-party orchestrator

Kimi Code Community Guidelines, fetched 2026-11-26 (KCG):

> "Kimi Code subscriptions are for interactive use only. We're compatible with mainstream coding
> tools and agent frameworks (Kimi CLI, VS Code, Claude Code, OpenCode, OpenClaw, etc.), so you can
> call Kimi Code's AI capabilities from the tools you already use."
> "Don't use Kimi Code for non-interactive automation. Kimi Code subscriptions are for personal
> interactive use only. Using it for non-interactive purposes — such as scripted batch execution or
> data annotation pipelines — goes beyond normal use."
> "Don't spoof or alter client identity information." … "Don't resell your account or API access."

URL: https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html (Chinese:
https://www.kimi.com/code/docs/kimi-code/community-guidelines.html).

Reading, with the risk flagged:

- **Third-party harnesses are explicitly allowed**, including a personal subscription and OAuth
  from a non-Kimi client. This is not Antigravity's "personal Google OAuth in a third-party harness
  is forbidden" situation. The FAQ even says switching among Kimi CLI, VS Code and Claude Code is
  normal. **DOCUMENTED**
- **Unattended automation is the risk.** Ducter's waits, timers, routines and Keeps run the agent
  with no person in the loop; a batch of tasks is "scripted batch execution" in the clause's sense.
  Enforcement named there is concurrency limiting (`You've reached your concurrent request limit`),
  and resale/unapproved channels can lead to suspension. So `directOnly: true`, no
  routine/Keep/timer on Kimi, no fan-out of many Kimi tasks, one person per account, never resell
  or share the account. **DOCUMENTED + INFERRED**
- OAR sends `clientInfo: {name:"oar"}`; truthful identification, not spoofing. Do not change it to
  imitate the official CLI. The subscription clauses do not govern a pay-per-token `KIMI_API_KEY`;
  the platform API terms would. OAR's login is OAuth only, so v1 is on the subscription clauses.
  **DOCUMENTED + INFERRED**
- Re-check the page before shipping: community guidelines are product policy, not a contract with
  a stable version number. **INFERRED**

## 4. What Ducter must add beyond the HARNESSES entry

**Protocol / runner.** `HARNESS_IDS` + `HARNESSES` + `HARNESS_KEYS.kimi` (above). `HARNESS_FACTS.kimi`
is **required** by `adaptSpec` and every candidate: `version` (`kimi --version`, pattern
`/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/`), `verified 2.3.3–2.6.3`, `models: {}` (use OAR's live
list), `windowKnob`/`compactAtKnob`: none, `defaultCompactAt`: native, `preCompactHook: false`,
`compactionEvents: {started:false,ended:false}`, `contextReport`: `usage_update`, `toolSearch`: MCP
in `session/new` with no list-changed, `resume`: same-cwd `session/resume`, `browser`: its own
WebSearch/WebFetch plus any browser plugin the person installed, `background: ownTurn "unknown"`
(ACP carries only `main`), `nativeCommands`: discover `["skills"]`, `skillForm: "/skill:{name}"`,
fixed `["compact","model"]`, `noTools: {args:[]}`, `readOnly`: not possible, `noWeb`: not offered,
`webLook: {supported:false}`, `effort`: `low/high/max`, per-model, `toolSchema: ["openai"]`,
`root: "runs"` (INFERRED — no root check found; verify on a root server), `channels`: installer mark
`/.kimi-code/`, update `["kimi","upgrade","-y"]`, latest `https://code.kimi.com/kimi-code/latest`.
**VERIFIED/DOCUMENTED/INFERRED**

Add `MCP_CALL_WAIT.kimi` (`harness-facts.ts:1093`): Kimi documents a configurable `toolTimeoutMs`
but no default, so 25 s is the conservative INFERRED value. Add `HARNESS_CONFIG` regex
(`packages/runner/src/child-env.ts:40`): `/^(?:KIMI_|OAR_KIMI_BIN$)/`, so `KIMI_CODE_HOME` and
Kimi's own non-secret switches survive D102's allowlist. Add `case "kimi"` to
`packages/runner/src/oar.ts:462` importing `@botiverse/oar/runtimes/kimi` and `kimiRuntime`; no
per-harness adapter branch is needed because the refused map already moves both prompts to the
first message and Kimi needs no bridge. Probe `kimi` on PATH, `$KIMI_INSTALL_DIR/bin/kimi`,
`~/.kimi-code/bin/kimi` and legacy `kimi-code` (`OAR/installation.js:7-20`); read
`kimi --version`. Do not add Kimi to `PARTNER_FALLBACK`, `MEM_BRIDGE_HARNESSES`, `MEM_HOSTS` or
`memUpdate` in this change. **VERIFIED/INFERRED**

**Install.** macOS/Linux: `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`; Windows
PowerShell: `irm https://code.kimi.com/kimi-code/install.ps1 | iex` (`OAR/install.js:16-25`). OAR's
verified platforms are **linux and darwin only** (`OAR/index.d.ts:24`); do not offer Windows yet.
Ducter's `INSTALLABLE`/`agentPin` is npm-only (`packages/core/src/agent-setup.ts:61-70`); Kimi needs
a native `installKimi` (like `installAgy`) or, safer for v1, **show the line and let the person run
it** — the vendor script is remote code with no hash Ducter can check. **VERIFIED/INFERRED**

**Sign-in.** Add a `kimi` branch in `agent-setup.ts` (`runLogin`) that parses the two stderr lines
above, emits the URL and device code, and stops on `Logged in to …`. No paste-back box: this is a
device code entered on the page, not Claude's code. `loginSteps()` in
`apps/web/src/agent-setup.tsx:126` maps only codex/agy/claude; add `kimi`, and the same keys to
`apps/desktop/internal/i18n/agentsetup.go`. The installer writes `mainland-cn` (`OAR/install.js:6-14`);
outside mainland China the person must sign in with `--region global` (OD §Install/§Runtime login).
Best: a two-choice "中国大陆 / 其他地区" on the card, defaulting from the home's time zone; fall
back to plain `kimi login` if `--region` is rejected. **VERIFIED/DOCUMENTED/INFERRED**

**Sign-in card copy (plain zh / en).** Next to the existing `ag.login.*` block:

```text
zh:
  ag.login.kimi.1 = "在任意设备上打开这个链接，用 Kimi 账号登录："
  ag.login.kimi.2 = "在页面上输入这个码："
  ag.kimi.terms   = "Kimi Code 订阅只限个人交互使用：Ducter 只在你发话时用它做事，不会自己定时醒来，也不会把它排进定时任务或看守。把它包装成服务卖给别人、或多人共用一个账号，都违反 Kimi 的社区倡议。"
  ag.kimi.where   = "装的是 Kimi 自己的命令行，放在 ~/.kimi-code，不用管理员密码。中国大陆默认连国内服务；其他地区登录时选「其他地区」。"

en:
  ag.login.kimi.1 = "Open this link on any device and sign in with your Kimi account:"
  ag.login.kimi.2 = "Enter this code on the page:"
  ag.kimi.terms   = "Kimi Code subscriptions are for personal interactive use: Ducter runs it only when you ask, never wakes it on a timer, and never puts it in routines or Keeps. Reselling it as a service or sharing one account breaks Kimi's guidelines."
  ag.kimi.where   = "This installs Kimi's own command line in ~/.kimi-code; no administrator password. Mainland China is the default service; choose Elsewhere when signing in from another region."
```

**Product behaviour.** `DIRECT_ONLY_WHY` currently names **Google's** terms
(`packages/protocol/src/harnesses.ts:235-238`); adding Kimi with it would say something false. Make
it per-harness (antigravity: Google; kimi: Kimi's interactive-only guidelines) or add a second pair.
Account usage: OAR can read Kimi quota (`accountUsage`; on macOS/Linux through `kimi web`
`/oauth/usage`, `OAR/native-usage.js:58-89`), but it starts a process that may refresh OAuth and
reads the credential file's revoked marker. `directOnly` says Ducter never reads the account's
quota; keep this reader **off** in v1. Composer: offer skills as `/skill:<name>` and fixed
`/model`/`/compact`, not `/effort`; the steer copy must say words wait for the turn to end. Mem:
`nmem plugins inspect` knows a `kimi-code` host (research/203:18), but Kimi plugins are per-user,
`/plugins disable` is global, `kimi acp` forwards no plugin flag, and OAR refuses
`userConfiguration` (`OAR/options.js:6`). `MemPluginFact.off` has no value that fits: **do not add
`memPlugin`, do not add Kimi to `MEM_HOSTS`, and do not claim Mem is off for a Kimi task.** If the
person installed Mem's Kimi plugin it loads in every Kimi task and its context/thread save runs
beside Ducter's. `memSteps` (D417) is not verified for Kimi. Add Kimi to supported-agents docs and
fake-runtime tests for `steer:false`, `images:true`, `mcp:"http"`, the first-message preamble,
refused prompts and `noWeb`; one live task: open → MCP tool → resume → logout. **VERIFIED/DOCUMENTED/INFERRED**

**Known gaps.** (1) No steer, prompt replace/append, tool denial, clean setup or partner; no manual
compaction (`/compact` is fire-and-forget). (2) 2.6.x resume can advertise stale MCP tools (#5036);
provider errors often end the turn empty. (3) `--region` is version-sensitive; listing a model opens a
session; account usage may refresh OAuth (keep off). (4) Mem cannot be turned off per Kimi session.
(5) Only linux/darwin are verified; hooks can hold an open 630 s. (6) `kimi acp` ignores
`--agent-file`/`--skills-dir`; the vendor install script is unchecked remote code.

## Implications for Ducter

Kimi Code CLI is worth adding as a **task-only** agent, not a partner: it has images, HTTP MCP,
skills, OAuth subscription login and a working ACP transport, but no steering, prompt channel, tool
denial or isolation. The guard is `directOnly` + `noWebTasks`, driven by Kimi's own "interactive use
only" policy — not a third-party-client ban. First slice: protocol entry + facts + runner loader +
probe, sign-in card (device code + region), `directOnly` wording, tests; leave auto-install, account
usage and Mem support out until their gaps close.
