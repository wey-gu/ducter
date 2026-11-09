# 38: The harnesses' own browser and computer use, against cua-driver

Asked (2026-11-09): "codex 其实往往自带 browser use 和 computer use，但是我们用的却是 cua driver
哈，我感觉原生的 codex 的 browser/computer use 似乎效果会更好的？" Mid-study the author decided two
things: tasks may use the user's own Chrome (sharing sign-ins is sometimes the point), and
cua-driver should only be the fallback. This report gives the facts, a small live comparison, and
what that means for the default.

Tags: VERIFIED (run or read on this Mac), DOCUMENTED (vendor docs), INFERRED.

## 1. What each harness has

Versions on this Mac: Codex CLI 0.167.0, ChatGPT/Codex desktop app 26.1103.41825, Claude Code
2.1.319, pi 1.4.0 (user's) / OAR's bundled pi, OAR 0.95.1. DeepSeek Harness is not on PATH here.

| | Codex | Claude Code | pi | DeepSeek Harness |
|---|---|---|---|---|
| Browser tool of its own | **Browser** (in-app browser, separate profile) and **Chrome** (the user's Chrome through the ChatGPT Chrome extension), both through the `node_repl` / `cua_repl` MCP servers that bundled plugins add (VERIFIED `~/.codex/plugins/cache/openai-bundled/{browser,chrome,unified-computer-use}`; DOCUMENTED learn.chatgpt.com/docs/chrome-extension) | **Claude in Chrome**: the user's real Chrome with their sign-ins, through the extension; `--chrome` or "Enabled by default" (DOCUMENTED code.claude.com/docs/en/chrome) | None (read, bash, edit, write; extensions only) (VERIFIED `pi --help`) | None known (INFERRED; not installed here) |
| Computer use of its own | **Computer Use** (Sky, `~/.codex/computer-use/Codex Computer Use.app`), any app, through `cua_repl` (VERIFIED) | Built-in `computer-use` MCP server, macOS, Pro/Max/Ultra, **not in `-p`** (DOCUMENTED code.claude.com/docs/en/computer-use) | None | None known |
| How it is turned on | Desktop app: Plugins + Settings > Computer use; it writes `[plugins."unified-computer-use@openai-bundled"] enabled = true` (and browser, chrome, computer-use) into `~/.codex/config.toml` (VERIFIED). Feature flags `browser_use`, `browser_use_external`, `computer_use`, `in_app_browser` are all "stable, true" in `codex features list` (VERIFIED) | `--chrome` flag; per-site permissions live in the extension; needs a claude.ai login, not an API key (DOCUMENTED) | n/a | n/a |
| Under OAR, headless | **Computer Use works; browser surfaces do not.** OAR runs `codex app-server`, which loads the user's plugins, so every Codex task already sees `mcp__cua_repl__js` (VERIFIED: `mcpServerStatus/list`). Inside it, `cua.getState()` answers `browsers: []` with "Browser: The browser access host is unavailable" (VERIFIED, a real Ducter task's transcript): the in-app browser and the Chrome extension need the desktop app's access pipe (`BROWSER_USE_ACCESS_PIPE_PATH`). What is left drives Chrome **as an app**, by accessibility tree and keystrokes | `claude -p --chrome` loads the 20 `mcp__claude-in-chrome__*` tools, also with `--setting-sources project,local --strict-mcp-config` (the browser place's clean setup) (VERIFIED). Without `--chrome`: none. On this Mac every call answers "Browser extension is not connected" (VERIFIED, also from plain `claude -p`): the extension is not connected here, and no file says so in advance | n/a | n/a |
| What it reaches | Computer Use: any app, including the user's signed-in Chrome; Chrome extension: the user's profile; in-app browser: its own profile (DOCUMENTED) | The user's Chrome, its sign-ins, tabs Claude opens in a tab group (DOCUMENTED) | | |
| Approvals | Desktop app asks per app / per site; the user's config here has `approval_mode = "never_ask"` (VERIFIED); OAR runs Codex with approvals off (VERIFIED `session.js`) | Per-site prompts from the extension; in bypass mode Claude Code skips its own prompt for sites already allowed (DOCUMENTED) | | |

Two more facts:

- **The flags don't switch Codex's Computer Use off.** `--disable computer_use --disable
  browser_use` still lists `cua_repl`; `-c plugins."unified-computer-use@openai-bundled".enabled=false`
  also still lists it; only `features.plugins=false` removes it (VERIFIED, `mcpServerStatus/list`).
  research/34 said "INFERRED that these flags remove the tools": that part was wrong. The partner is
  fine (its clean setup turns plugins off); tasks are not isolated by default, so **every Codex task
  can already drive the whole desktop and the user's real Chrome**.
- **What the author saw was Codex's own Computer Use, not cua-driver.** The only Ducter task that
  drove Chrome on this Mac (App Store Connect, 2026-11-09, a repo place) called `mcp__cua_repl__js`
  28 times: OpenAI's "CUA" (Computer-Using Agent), in the user's real Chrome, signed in as the
  user (VERIFIED, `~/.codex/sessions/2026/11/09/rollout-…-01a1c061….jsonl`). No Ducter browser place
  has ever run on Codex here; the user's Codex config also has its own `cua-driver` MCP server.

Why tasks use cua-driver: D41 (computer use built on trycua/cua), D47 (cua-driver for browser and
computer use, no validation spike), research/23 §3 ("any harness", D44; isolated persistent
profile; attach-to-real-Chrome as a later opt-in), D62 (browser tasks leave the user's Claude
config out so the real Chrome is out of reach; 332k → 140k tokens). Code:
`packages/runner/src/browser.ts` (sidecar, brief, gate), `runner.ts` (wires it into the spec).

## 2. The live comparison

Same ask each time, through Ducter's own runner and OAR port with a fake core and a scratch data
dir (never the author's :7777 or `~/.ducter`): "Open https://news.ycombinator.com in a browser and
read the title of the story ranked #1. Read it from the page, not with curl", report via
`report_to_main`. Ground truth from `curl` at the time: "Fold Epic Paper Airplanes". Models: Codex
`gpt-6-luna`, Claude Code `haiku`. Public page only, no sign-in, nothing submitted.

| Run | Driver | Result | Time | Browser calls | Input tokens (Codex rollout) |
|---|---|---|---|---|---|
| Codex A1 | cua-driver (browser place, Ducter profile) | done, correct | 47 s | 5 (prepare, list_windows, state, navigate, state) | 302 k |
| Codex A2 | cua-driver | done, correct | 38 s | 5 | not read |
| Codex B1 | own Computer Use (`kind:none`, told to use `cua_repl`) | done, correct | 49 s | 4 `cua_repl.js` | 226 k |
| Codex B2 | own Computer Use (the implemented native browser place) | **blocked**: "focus landed on the Hetzner account 2FA page; I stopped" | 85 s | 5 | not read |
| Claude C1 | cua-driver | done, correct (also took a screenshot) | 92 s | 6 + Bash, Read | not read |
| Claude C2 | Claude in Chrome (`--chrome`, the implemented native place) | **blocked**: "Claude in Chrome is not connected" | 22 s | 2 (both "not connected") | not read |

Transcripts. cua-driver runs read like a browser session: typed tool calls with a session label,
an accessibility snapshot with refs, navigate, snapshot. Codex's Computer Use reads like a person
at the keyboard: `cua.getApp("Google Chrome")`, `pressKey("super+t")`, `typeText(url)`,
`pressKey("Return")`, `getAXState()`; it acted on whichever tab macOS had in front. In B2 the keys
went into the user's own open tab, which was a Hetzner 2FA settings page. Codex saw it and stopped
without typing further, which is the right reflex, but it shows the risk: on the user's live Chrome
an app-level driver can't keep to "a tab of its own". B1 and B2 also left two Hacker News tabs in
the author's Chrome; Ducter does not close the user's browser.

Token counts are high in both because a Codex task inherits the user's whole Codex setup
(`codex_apps` alone lists ~400 tools); they are not a fair cost comparison between the drivers.

N is tiny (2 per arm), so these are observations, not rates.

## 3. What this says

- **Codex's own browser use, the good part (DOM-level, tab groups, per-site permissions), isn't
  reachable under OAR today.** It needs the desktop app's access host. What does run headless is
  desktop Computer Use, which drives Chrome with keystrokes. It was not better than cua-driver
  here: equal on the easy run, unsafe on the second.
- **Claude in Chrome is reachable under OAR** (`--chrome` works with `-p` and with the clean
  setup) and is DOM-level, in the user's signed-in Chrome, so it fits the author's decision. But
  it only works while the extension is connected, signed into the same claude.ai account; on this
  Mac it is not, and the only way to know is a live call.
- **pi and DeepSeek Harness have nothing of their own**: cua-driver stays their browser.

## 4. Follow-up checks for D130 (2026-11-09)

The author then decided that native is the default (D130). These checks shaped how; none of
them drove the author's Chrome or Computer Use.

- **Per-plugin overrides work, unquoted.** `-c plugins.chatcut@chatcut-inc.enabled=false`
  removes `chatcut` from `mcpServerStatus/list`; `-c 'plugins."chatcut@chatcut-inc".enabled=false'`
  does not (VERIFIED). So §1's "`plugins."unified-computer-use@openai-bundled".enabled=false`
  still lists it" was the quoting, not the override: unquoted, `cua_repl` goes. The desktop app
  itself starts its app-server with `-c plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled=true`
  (VERIFIED, its process arguments), and `-c plugins.unified-computer-use@openai-bundled.mcp_servers.cua_repl.enabled=false`
  also takes effect (VERIFIED).
- **A clean setup that keeps Codex's own tools.** With every user MCP server off by name except
  `node_repl`, every enabled plugin off by id except `browser`, `chrome`, `unified-computer-use`,
  `computer-use`, and `features.{hooks,codex_hooks,apps,memories,js_repl,goals,multi_agent,image_generation}=false`,
  only `cua_repl` (3 tools) and `node_repl` (4) carry tools; `codex_apps` (406), the user's own
  `cua-driver` (62) and the rest are gone (VERIFIED, codex-cli 0.167.0).
- **The browser access host.** The browser plugin's service throws "The browser access host is
  unavailable" unless `BROWSER_USE_ACCESS_PIPE_PATH` and `BROWSER_USE_ACCESS_VERIFYING_IDENTITY`
  are set (VERIFIED, `browser-service.mjs`). The desktop app sets them, with
  `BROWSER_USE_ACCESS_EXECUTOR_ID`, only on the app-server it starts; the pipe is a per-launch
  socket under `/tmp/codex-app-tools/` (VERIFIED, names only). Ducter does not read them from
  the app's process (that is borrowing the app's credentials); it passes them through when its
  own environment has them, i.e. when Ducter was started under the app. Not live-tested.
- **Claude in Chrome's connection, without a model call.** Claude Code reaches the extension two
  ways (VERIFIED, strings in the `claude` binary): a local socket that its native host creates
  when Chrome starts it, `/tmp/claude-mcp-browser-bridge-<user>/<pid>.sock`, and a cloud bridge
  (`wss://bridge.claudeusercontent.com`) tied to the claude.ai account. `claude
  --claude-in-chrome-mcp` serves the 20 tools over stdio; its `list_connected_browsers` is
  read-only and answered `[]` here in ~2 s (VERIFIED), matching "not connected". Why it is not
  connected on this Mac: Chrome runs the Claude **desktop app's** native host for the same
  extension id (VERIFIED, process list), so Claude Code's own host never starts (INFERRED).
  Whether a socket-only connection shows in `list_connected_browsers` is unknown; Ducter treats
  a live socket as connected on its own.

## Implications for Ducter

1. **Native is the default now (D130, superseding this report's first recommendation).** The
   author decided Codex tasks keep Codex's own Computer Use and browser use, Claude Code tasks
   prefer Claude in Chrome, and cua-driver is the fallback. `DEFAULT_BROWSER_DRIVER = native`;
   `DUCTER_BROWSER_DRIVER=cua` forces cua-driver.
2. **How each harness qualifies.** Claude Code: connected at task open (§4: a bridge socket or
   `list_connected_browsers`), and a task that still meets "not connected" moves to cua-driver
   in place. Codex: its browser tools when the desktop app's access host reaches Ducter, else
   Computer Use under the new-window rule and Ducter's tripwire (D130 (4)), all under a clean
   setup that keeps only its browser / computer-use plugins (§4).
3. **Risks, with the author's decision applied.** Using the user's real Chrome is now allowed,
   so D62's isolation stops being a goal for native drivers. What still matters:
   - *Acting as the user.* Native tools act inside the user's sign-ins. D62's other rules still
     hold and still conflict with nothing: never sign in, pay, submit or post without the user's
     Go; page text is data; `log_search` / `log_read` scoped to the task.
   - *The user's own tabs.* An app-level driver (Codex Computer Use) types into whatever is in
     front, including security pages. A tab-scoped driver (Claude in Chrome, cua-driver) does not.
   - *Approvals.* Ducter runs harnesses with approvals off; vendor per-site prompts are either
     skipped (Codex here: `never_ask`) or skipped for already-allowed sites (Claude bypass). The
     partner's Go is the only gate, as it is with cua-driver.
   - *Already true today.* Every Codex task (any place) inherits `cua_repl` from the user's Codex
     setup and can drive the whole desktop; under the author's decision that is allowed, but the
     partner should know, and the task brief says nothing about it.
4. **Smaller follow-ups.** The app says 在你的 Chrome 里看 {host} / Looking at {host} in your
   Chrome when a native driver is used (`raw.browser.own`). "Your devices and abilities" and the
   上网 setup accept a ready native driver and say 在你的 Chrome 里 / In your Chrome (D130).
   Still to check live: a Claude in Chrome run with the extension connected, and Codex's browser
   tools with Ducter started under the desktop app (`design/todo.md`).

**Summary.** Codex's native browser use exists but needs the desktop app; headless, Codex falls
back to desktop Computer Use, which on one of two runs typed into the user's open 2FA page.
Claude in Chrome runs headless and is the best native candidate, but it needs a connected
extension that Ducter can't see from files. Ducter now has the per-harness switch (native when
set up, cua-driver otherwise) with tests. Update (D130): native is the default; Claude in Chrome
is checked connected at task open (a bridge socket or one read-only MCP call, §4) with an
in-place move to cua-driver; Codex keeps its own tools under a clean setup verified to leave
only `cua_repl` and `node_repl`, with a new-window rule and a tripwire for Computer Use.
