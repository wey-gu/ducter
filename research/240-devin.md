# Devin CLI as a Ducter work agent

Researched 2026-11-26 from the installed OAR **0.124.0** runtime (`node_modules/@botiverse/oar/dist/runtimes/devin/*.js`) and OAR's runtime page on GitHub `main`, plus Devin's docs and Cognition's terms. No `devin` process was started, nothing was installed or signed in. OAR's page includes a measurement on OAR 0.125.0; where 0.124.0 and the page disagree I say so. Tags: **VERIFIED** (read in code), **DOCUMENTED** (read in docs/URL), **INFERRED**.

OAR paths below are relative to `node_modules/@botiverse/oar/dist/`; "OAR doc" means https://github.com/botiverse/oar/blob/main/docs/runtimes/devin.md.

## 1. Proposed HARNESSES entry

Add `"devin"` to `HARNESS_IDS` (`packages/protocol/src/harnesses.ts:6`) and this entry to `HARNESSES` (`harnesses.ts:108`). Every field is named, including the optional ones left out and why.

```ts
devin: {
  id: "devin",                       // VERIFIED runtimes/devin/index.js:10 (id)
  name: "Devin CLI",                 // DOCUMENTED docs.devin.ai/cli ("Devin CLI")
  badge: "dv",                       // INFERRED, two letters like cc/cx/ag
  command: "devin",                  // VERIFIED runtimes/devin/installation.js:18 (binary `devin`)
  partner: false,                    // VERIFIED runtimes/devin/options.js:6,12: disallowedTools and systemPrompt both refused, so no read-only partner
  task: true,                        // VERIFIED runtimes/devin/index.js:17-29 + session.js:53 (a full ACP session, process per session)
  images: false,                     // INFERRED: the interactive CLI pastes images (docs essential-commands), but ACP image prompts are unverified and index.js:11 does not declare images; flip after a live prompt probe
  steer: false,                      // VERIFIED runtimes/devin/index.js:11; OAR doc "No steering"
  isolation: "none",                 // VERIFIED runtimes/devin/options.js:13: userConfiguration refused; the person's rules/skills/plugins/MCP load
  systemPrompt: "none",              // VERIFIED runtimes/devin/options.js:5,12: no replacement or append channel
  taskInstructions: "first-turn",    // VERIFIED packages/runner/src/oar.ts:800-801: a refused systemPrompt/appendSystemPrompt becomes an <instructions> preamble on the first message
  mcp: "stdio-bridge",               // DOCUMENTED OAR doc "Session MCP servers": credential-free entries only; the bridge carries URL+token in a 0600 file
  login: "account",                  // VERIFIED runtimes/devin/auth.js:12-19: `via Devin` maps to account (an API key is the alternative)
  billing: "plan",                   // INFERRED: Devin accounts are plan/ACU-based (docs /usage, /upgrade); no page read states how CLI usage is billed
  cheapModel: "swe-1-6-fast",        // DOCUMENTED docs.devin.ai/cli/models (config example); INFERRED that it is the cheap family
  modelForm: "a model id from its own list (e.g. swe-1-6-fast)", // DOCUMENTED docs.devin.ai/cli/models
  install: "curl -fsSL https://cli.devin.ai/install.sh | bash",  // VERIFIED runtimes/devin/install.js:11
  signIn: "devin auth login (a browser sign-in; or WINDSURF_API_KEY)", // VERIFIED auth.js:42 + DOCUMENTED docs.devin.ai/cli/reference/commands#devin-auth
  noWebTasks: true,                  // INFERRED: options.js:6 refuses tool denial, and Devin has its own web search (docs team-settings "Enable Web Search"), so browsing work cannot be held to D378
  // draws:        absent. No image-generation tool is documented (INFERRED).
  // pickOnly:     absent. No vendor ban like Antigravity's was found; it may be chosen for an ordinary task (INFERRED).
  // directOnly:   absent. That flag and DIRECT_ONLY_WHY are written for Google's personal sign-in (harnesses.ts:91-98, 235-238), not Devin.
  // signOut:      absent. OAR has no Devin logout; `devin auth logout` is terminal-only (OAR doc "No login or logout").
}
```

Two more declarations the entry alone needs: `HARNESS_KEYS.devin = ["WINDSURF_API_KEY"]` (`harnesses.ts:274-281`; VERIFIED `auth.js:96` and docs commands: it is the only environment credential Devin reads, `DEVIN_API_KEY` is ignored). Leave `MEM_BRIDGE_HARNESSES` unchanged (`harnesses.ts:18`): Devin's Mem plugin has a Bridge hook, but it must be merged by hand (plugin README), not carried by the plugin.

## 2. How OAR launches it, signs in, lists models, and what it can do

### Launch

- **Command and args.** OAR spawns the resolved `devin` with `["acp"]` (`runtimes/devin/session.js:22`), then appends `SessionOptions.launchArgs` after them (`shared/acp/launch-args.js:5`). `devin acp` is "intended to be invoked by an ACP-aware editor or IDE ... as a subprocess" (DOCUMENTED docs.devin.ai/cli/reference/commands#devin-acp); it speaks JSON-RPC over stdio. Execution is `"process"` (`index.js:29`), one process per session.
- **Where the binary is found.** `OAR_DEVIN_BIN`, else `devin` on PATH, else `~/.local/bin/devin` (`installation.js:10-18`; VERIFIED). The official installer puts the payload in `$XDG_DATA_HOME/devin` and links `~/.local/bin/devin` (`install.js:8-17`; VERIFIED).
- **Environment.** `sessionEnvironment(SessionOptions.env)` (`session.js:34,41`) — Ducter's allowlisted child env plus its granted keys. For Devin that is `WINDSURF_API_KEY` only (VERIFIED `auth.js:96`, docs commands). ACP reads that key before stored credentials (DOCUMENTED docs commands#devin-acp).
- **Model and effort.** `modelViaConfigOption: true` (`session.js:44`); OAR opens a session and switches model/effort with `session/set_config_option` (OAR README:207-211, `list-models.js:22-50`; VERIFIED code path).
- **Permission mode.** If the handshake advertises `bypass` (as a mode id or a `mode` config option), OAR sends `session/set_mode {modeId:"bypass"}` (`session.js:24-34,47-50`; VERIFIED). If it is not advertised, OAR sends no mode, but its ACP client still answers every permission request with the broadest `allow_always`/`allow_once` on offer (`shared/acp/client-app.js:3-13,66`; VERIFIED), so D16 holds at the cost of one permission round trip per call.
- **Resume.** `session/load` (or `resume` if advertised), with the saved directory enforced through `session/list`; a different cwd is refused, and `-32016` + `cognition.ai/errorKind=session_not_found` means missing (`session.js:37-38`; VERIFIED).
- **No steer, no stopTask.** `sessionCapabilities: {steer:false, stopTask:false}` (`index.js:11`; VERIFIED), so Ducter holds words until the turn ends and cannot stop one background job.

### Sign-in

| | Fact |
|---|---|
| Login command | `devin auth login` (browser); `--force-manual-token-flow` for remote/SSH (DOCUMENTED docs commands#devin-auth). |
| Status check | `devin auth status` (`auth.js:104`; VERIFIED). OAR parses `Logged in (via Devin)` / `(via API key)`, then `Email:` under `User:` and `Plan:` under `Account:` (`auth.js:4-19,37-89`). |
| Not logged in | OAR maps the text and suggests `devin auth login` or `WINDSURF_API_KEY` (`auth.js:42`; VERIFIED). |
| API key vs account | `WINDSURF_API_KEY` (API key) or stored browser credentials (Devin account). `devin auth status` **never sees the env key** and exits 0 in every state (DOCUMENTED OAR doc "Authentication"; VERIFIED `auth.js:96-102`: with the key set OAR returns `unknown` with `configured:["environment: WINDSURF_API_KEY"]`). |
| OAR login/logout | **None.** OAR exposes only `authStatus` (`index.js:27`); no `login`, no `logout` (OAR README:206-209; OAR doc "No login or logout": the native routes need a terminal, `/dev/tty`, or a browser Devin opens itself). |
| ACP authenticate | Not usable by OAR: Devin's `authenticate` calls `/usr/bin/open` and never sends the URL (DOCUMENTED OAR doc "No login or logout"). |
| Consequence for Ducter | The card can only say "run it in a terminal there", like pi; a key can be put in `keys.env` but cannot be validated by `auth status` (INFERRED from the two rows above). |

### Models

OAR does not use `devin models list --format json` (which exists, DOCUMENTED docs commands#devin-models). It opens a throwaway native session, reads the `session/new` reply's config options id `model` and `thought_level`, marks the current model `default`, and attaches effort levels only to that current model (`list-models.js:22-50`; VERIFIED). It then deletes or closes the session (`list-models.js:66-73`). OAR's page records 169 models listed on a Devin Pro account, a session that opened on `swe-2-high` (the opening model events and `Session.model()`), and one completed turn on it (DOCUMENTED OAR doc "Authentication"). That page does not say `swe-2-high` is the account default (INFERRED if we call it one). Model **windows are not reported** by this projection (VERIFIED: no window field in `projectDevinModels`), so Ducter gets ids but no window.

### Capabilities

| Capability | Answer | Source |
|---|---|---|
| Steering mid-turn | **No.** `initialize` advertises `cognition.ai/midTurnPrompts`, but OAR never verified a second prompt mid-turn, so `Session.steer` is absent. | VERIFIED `index.js:11`; DOCUMENTED OAR doc "No steering" |
| Images | Interactive CLI: yes, paste with Ctrl+V (`[Image #1]`). ACP: **unverified** — OAR reads `promptCapabilities.image` at open and the runtime does not declare `images`. | DOCUMENTED docs essential-commands; VERIFIED `shared/acp/prompt.js:6-8`, absent in `index.js:11` |
| MCP servers | Yes: stdio and HTTP entries in `session/new`. OAR's page (0.125+) accepts only **credential-free** entries and refuses `env`/`headers`; 0.124.0's `options.js` does not yet declare `mcpServerCredentials` (VERIFIED absence), so a header entry would be sent. | DOCUMENTED OAR doc "Session MCP servers"; VERIFIED `options.js:2-15` |
| System instructions | **No replacement and no append.** Both refused. Devin does read `AGENTS.md`, `CLAUDE.md`, `.devin/rules/*`, and plugins' rules, but Ducter cannot isolate those, so its prompt rides on the first message. | VERIFIED `options.js:5,12`; DOCUMENTED docs rules |
| Task instructions | First-turn `<instructions>` block. | VERIFIED `oar.ts:800,1061-1064` |
| Skills | Yes. `devin skills list --json` returns name, description, provider, path, and `user`/`model` triggers; OAR projects them (`skills.js:26-48`; VERIFIED). A user skill is typed `/<name>`, a plugin skill `/<plugin>:<skill>`; the agent can also invoke model-triggered skills itself. | VERIFIED `skills.js:33`; DOCUMENTED docs skills overview + plugins overview |
| Native commands | OAR has **no command inventory** for Devin (README:616 says Devin inventory is unsupported), only `skills`. `/model` is the one useful fixed command; `/compact` exists but has no structured completion. | VERIFIED README:616, `index.js:25`; DOCUMENTED docs commands |
| Manual compaction | **Unsupported**: `/compact` exists but no structured completion/attribution contract was verified. | VERIFIED `index.js:12` |
| Compaction events | None mapped by OAR. | INFERRED from `index.js` (no compaction profile) |
| Background work | The CLI has subagents; OAR declares no task mapping, so `ownTurn` is unknown. | DOCUMENTED docs subagents; INFERRED from `index.js` |
| Read-only / no-tools / web look | **Impossible**: all three need `disallowedTools` or a launch allowlist, both refused. The partner, the judge/digest one-shots, and the quick web look cannot run on Devin. | VERIFIED `options.js:6`; `oar.ts:802` clears denials |
| Account quota | None: OAR has no Devin `accountUsage` reader. | DOCUMENTED OAR doc "No account usage, limit resets or provider settings" |
| Update | Check only (manifest + `distribution` marker); no `upgrade`, because `devin update` asks for confirmation and has no `--yes`. | VERIFIED `update.js:5-12,32-57`; DOCUMENTED OAR doc "Process ownership, installation, and update checks" |

## 3. Terms of service / usage policy

Fetched 2026-11-26. **No Antigravity-style clause was found** forbidding a third-party harness from driving Devin (INFERRED: absence across the two Cognition documents and the CLI pages read).

- **Platform Terms of Service**, last updated 2026-11-16, https://cognition.com/legal/platform-terms-of-service. The only relevant restriction is §2.3(iv): *"make the Services or Documentation available to anyone other than Authorized Users"* (part of the "Use Restrictions"). §2.8 "Customer Integrations" expressly contemplates interfacing with third-party *"IDEs, IDE Plugins not provided by Licensor, GitHub, Web Search, MCP Servers, APIs..."* — that licenses Devin connecting out, not an express permission for an inbound orchestrator (INFERRED). **DOCUMENTED**. Reading: one person driving their own signed-in account is not "making the Services available to anyone other than Authorized Users" (INFERRED; not a legal opinion).
- **Acceptable Use Policy**, last updated 2026-06-30, https://cognition.com/legal/acceptable-use-policy. *"You may not provide any other user access to your account or account credentials, attempt to circumvent our security measures or otherwise interfere with the Services."* And under "Agentic Use": *"You are responsible for all actions taken by the Services on your behalf or at your direction..."*; *"You must not direct or configure the Services to take irreversible actions in production environments without implementing appropriate human oversight, review, and confirmation mechanisms."* And under "Services Usage Limits": *"Users must adhere to any usage limits specified in their subscription or licensing agreement."* **DOCUMENTED**.
- **Vendor support for third-party ACP clients.** `devin acp` is *"intended to be invoked by an ACP-aware editor or IDE (such as Windsurf or Zed) as a subprocess"* (https://docs.devin.ai/cli/reference/commands#devin-acp), and Cognition documents Zed, JetBrains and Xcode integrations (https://docs.devin.ai/cli/acp/zed). **DOCUMENTED**. This is the opposite of Antigravity's "Using third party software, tools, or services to access the Service ... is a breach of this Agreement" (https://antigravity.google/terms; DOCUMENTED via research/236-antigravity-terms.md).
- **Risk flag (INFERRED): medium-low.** The documented client class is an *editor/IDE panel*, not an orchestrator that opens tasks, wakes on timers and runs routines; the terms do not name that case. The AUP's human-oversight sentence cuts against fully unattended loops and irreversible actions, and enterprise admins can deny CLI access, disable plugins, MCP or web search (DOCUMENTED docs enterprise/devin-auth, team-settings). Do not: share the account or key with other users, read or copy its stored sign-in, proxy the account, or resell access. Those are the actual red lines; a local Ducter using the person's own login is not one of them on the pages read (INFERRED).

## 4. What Ducter must add beyond the HARNESSES entry

**Code and registry** (everything here is a proposed change — INFERRED design — except where a line cites a VERIFIED/OAR fact)

- `HARNESS_FACTS.devin` (required by `Record<HarnessId, HarnessFacts>`) — proposed values and their source:
  - `version` `["devin","--version"]`, pattern `(\d+\.\d+\.\d+)`; `verified` `{from:"3000.12.57", to:"3000.14.30821"}` — VERIFIED probe shape (`installation.js:5-18`), DOCUMENTED measured builds (OAR doc).
  - `models: {}` (the live listing carries ids but no windows; VERIFIED `list-models.js:22-50`), `windowKnob`/`compactAtKnob` `none`, `defaultCompactAt` "Devin's own" — INFERRED.
  - `preCompactHook` `{supported:false}` — DOCUMENTED (Devin's hook event list has `PostCompaction`, no `PreCompact`); `compactionEvents` `{started:false,ended:false}`, `contextReport` "not reported by OAR", `toolSearch` "loaded directly" — INFERRED from `index.js` (no compaction/context profile).
  - `resume` supported in the saved directory — VERIFIED `session.js:37-38`; `browser` "none mapped, its own web search is a tool" — DOCUMENTED team-settings + INFERRED from the runtime.
  - `nativeCommands` `{discover:["skills"], skillForm:"/{name}", fixed:["model"], hidden:[]}` — VERIFIED `skills.js:26-48` and README:616 (no command inventory); DOCUMENTED skill syntax.
  - `channels.installer` `{mark:"file:distribution", update:["devin","update","--force"], latest:"https://static.devin.ai/cli/current/manifest.json"}` — VERIFIED `update.js:5-12`, DOCUMENTED `devin update --force`; the non-interactive run is unprobed (gap 7).
  - `noTools` `{args:[]}` (unusable, gap 3), `readOnly` refused, `noWeb` no channel, `webLook` unsupported — VERIFIED `options.js:6` + `oar.ts:802`.
  - `toolSchema` `["anthropic","openai","gemini"]` — INFERRED (Devin routes all three families); `root` `{as:"runs"}` — INFERRED (no root check documented); `background` `{ownTurn:"unknown"}` — INFERRED from `index.js`.
  - Optional `effort`/`account` are left out until a live read: `thought_level` values and the config/session layout are unverified.
- `packages/runner/src/oar.ts`: a `case "devin"` in `defaultLoader` importing `@botiverse/oar/runtimes/devin` (`oar.ts:462-496`), and an `adaptSpec` branch that clears `disallowedTools`, sends MCP through `bridged()` (`oar.ts:830-837`), and lets the refused `systemPrompt` fall into the preamble (`oar.ts:800`). Without this branch OAR rejects the open with `UnsupportedOptionError`.
- `packages/runner/src/oar.ts:891-924` `available()`: with only `WINDSURF_API_KEY` set, OAR's `authStatus` is `unknown`, so `loggedIn` must also accept "key present" for Devin (today it would read 未登录). The reader cannot validate the key — show 已配置 / configured, not 可以用了.
- `packages/core/src/harness-probe.ts`: a `devin` probe and a `probes` entry (`:333-340`), finding `~/.local/bin/devin` even off PATH and treating `loggedIn` as `authStatus logged_in || WINDSURF_API_KEY present`. `detectAgent` (`:127-140`) then classifies the copy from `channels`, but its `which("devin")` lookup needs the same off-PATH candidate. `signedInNow` (`:368`) then works generically.
- `packages/core/src/agent-setup.ts`: `INSTALLABLE` (`:61`), a `installDevin()` beside `installAgy()` (`:334`), `state().installable` (`:667`), and `login("devin")` returning `{state:"terminal", command:"devin auth login"}` like pi (`:599-602`). `agentPin` is npm-only, so Devin needs its own branch; the official script refuses to overwrite a regular non-symlink `~/.local/bin/devin` (VERIFIED `install.js:30-38`) and without a terminal its trailing `devin setup` exits 1, so judge by `devin --version` afterwards (DOCUMENTED OAR doc).
- Tests: `packages/core/test/harness-probe.test.ts:31` expected rows, a `devin.test.ts` like `antigravity.test.ts`, `scripts/probe-harnesses.ts`, and `design/harnesses.md` (a Devin section + the verified range table).

**Install line and card copy**

The `install` string is the vendor script above. Because it writes `~/.local/bin/devin` and `$XDG_DATA_HOME/devin`, not Ducter's folder, the card's "装在 Ducter 自己的文件夹里" line is false for Devin; add a Devin line like agy's `ag.agy.size`. New i18n keys (mirror `apps/desktop/internal/i18n/agentsetup.go` and `packages/cli/src/i18n.ts`):

```jsonc
// apps/web/src/i18n-agentsetup.ts — zh
"ag.devin.size": "装的是它的命令行 devin，官方安装脚本放在 ~/.local/bin，不用管理员密码。",
"ag.login.devin": "Devin 的登录要在 %s 的终端里做：运行 devin auth login，在浏览器里登录；也可以在那里放一个 WINDSURF_API_KEY。",
"ag.devin.terms": "Devin 的条款里没查到禁止 Ducter 这样用的条款，但官方只写了编辑器和 IDE 通过 ACP 使用；别把账号或密钥借给别人。"
```

```jsonc
// apps/web/src/i18n-agentsetup.ts — en
"ag.devin.size": "Installs its command line, devin, where the vendor's script puts it (~/.local/bin). No administrator password.",
"ag.login.devin": "Devin signs in from a terminal on %s: run devin auth login and finish in the browser, or put a WINDSURF_API_KEY there.",
"ag.devin.terms": "I found no clause in Devin's terms against Ducter driving it, but its docs name editors and IDEs as ACP clients; never share the account or key."
```

The CLI's own check line (`packages/cli/src/i18n.ts`) also needs a Devin case, since `devin auth status` is the only check:

```jsonc
// zh
"check.devin.loggedOut": "装好了，还没登录。在终端里运行 devin auth login，或在 keys.env 里放 WINDSURF_API_KEY。"
// en
"check.devin.loggedOut": "Installed, not signed in. Run devin auth login in a terminal, or put WINDSURF_API_KEY in keys.env."
```

**Mem plugin**

- There **is** a Devin plugin: `devin plugins install nowledge-co/community#nowledge-mem-devin-plugin` — MCP, memory skills, lifecycle capture after turns/compaction/session end; native plugins are a Devin closed beta (DOCUMENTED plugin README, community README row).
- Add `memUpdate.value = [["devin","plugins","update","nowledge-mem"]]` with DOCUMENTED evidence (plugin README), so Ducter can update the person's plugin (D597).
- Do **not** add Devin to `MEM_BRIDGE_HARNESSES`: its Bridge is a `SessionStart` hook the user merges by hand (`hooks/bridge-local.json`) plus env vars, not something the plugin carries by default (DOCUMENTED plugin README "Bridge through Devin CLI").
- No `memPlugin` fact: `devin plugins` has install/list/info/update/remove/prune, but **no per-session disable** (DOCUMENTED docs plugins overview), and an enterprise admin can only disable CLI plugins entirely. So D168's "memory off in this task" cannot be honored for a person who installed the Mem plugin — the task will load and capture to Mem anyway. Either skip Devin for memory-off tasks, or accept and document it.
- `memSteps` is not safe yet: `nmem t sync --from devin` / `--source devin` are documented, but `nmem context --source-app devin` and the `nmem plugins inspect` host name are unverified. Live check owed.

**Known gaps** (each INFERRED unless the line cites a source)

1. No OAR login/logout → terminal-only card, no `signOut`; key presence is unvalidated.
2. No prompt isolation → the person's `AGENTS.md`, global rules, skills, plugins and MCP servers load into every Devin task, including the Mem plugin.
3. No tool denial and no `userConfiguration` exclusion → no partner, no read-only, no no-tools one-shot (judge/digest), no quick web look, and browsing tasks are blocked (`noWebTasks`).
4. No manual compaction, no compaction events, no window knobs, no windows in the model list → Ducter cannot bound or show Devin's context; long tasks rely on Devin's own compaction.
5. Permission mode: OAR sets `bypass` only if advertised; otherwise it relies on its ACP client auto-approving each request (`shared/acp/client-app.js:3-13,66`), which works but costs a round trip per tool call and may not match Devin's own `dangerous` mode. `--permission-mode dangerous` is a documented CLI flag OAR does not pass; probe it before pinning.
6. Workspace trust: the docs warn non-interactive `--print` fails in an untrusted directory (`--respect-workspace-trust false` skips it); whether `devin acp` has the same gate is unverified, and Ducter's fresh worktrees are untrusted (INFERRED). Probe before shipping.
7. Update check only; `devin update --force` may still prompt, and OAR has no `upgrade`.
8. No account usage/quota reader → no limit wait; no `account` fact → a second account's folder and session store are unverified.
9. Images, effort (`thought_level` values), and `cognition.ai/midTurnPrompts` steering are unprobed.
10. OAR 0.124.0 vs the page: `mcpServerCredentials` refusal is not in the installed `options.js`; do not pass headers until the OAR version Ducter pins declares it. 0.124.0 also lists no `images` declaration.
11. Enterprise admins can disable plugins, MCP or web search; Ducter's MCP would then fail at open.

**Recommendation (INFERRED):** ship Devin as a task-only agent first (`partner:false`, `task:true`, `pickOnly` optional), with the stdio bridge and first-turn instructions. Do not put it in `PARTNER_FALLBACK` or the judge/digest paths until a live probe answers images, `thought_level`, whether the ACP session advertises `bypass`, and whether OAR's per-call permission answer is enough for Devin's tool policy. If a policy line is wanted while those are open, `pickOnly:true` is the conservative choice; unlike Antigravity it is not forced by the vendor's terms. If Cognition's AUP is read more strictly later, `directOnly` would need its own one-line reason — `DIRECT_ONLY_WHY` today says Google (harnesses.ts:235-238).
