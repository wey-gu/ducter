# 59: The workbench beside a coding agent

Asked (2026-11-12): what a developer keeps open next to a working agent's chat (changes and
diffs, files, a terminal, a website preview) in the tools they already use, how it is toggled,
laid out and kept out of the way, how it works on a phone, how it is built, and two narrow
questions: how a dev server on **another computer** is previewed, and how the agent hears that
**the user edited a file**. Research/58 read Lorca's agent page as a conversation (D210); this
note reads the panels around such a page. It ends with what a Ducter workbench should take from
each and what each gets wrong.

Tags: VERIFIED (read in source), DOCUMENTED (its own docs, site or changelog), INFERRED. Read
only; nothing was built, installed or run.

Snapshots:
- `pingdotgg/t3code` `d2c25950` (2026-11-11), shallow clone. A large monorepo: `apps/web`
  (React, also the Electron renderer), `apps/desktop` (Electron), `apps/server` (the
  "environment server" on each machine), `apps/mobile` (React Native).
- `egoist/lorca` `bf1ab709` (2026-10-28), the tree research/40 and research/58 read.
- Conductor (conductor.build): closed source; its docs and changelog to 0.92.0 (2026-10).
  The changelog index on the site lags; release bodies were read from its pages and the
  releases.sh mirror.
- OpenAI's Codex app, now documented as "the ChatGPT desktop app" on learn.chatgpt.com
  (Codex features marked "Codex only").
- Claude Code desktop (code.claude.com/docs/en/desktop).
- Zed's agent panel (zed.dev/docs), plus two files from `zed-industries/zed` `cd4902bf`
  (2026-11-11) read through the GitHub API (`crates/action_log/src/action_log.rs`,
  `crates/agent/src/tools/edit_session.rs`).
- Not covered: Cursor's agent view (left out to keep the note short; three other products
  already answer each question).

## 1. t3code

**What is beside the chat.** One right panel holds tabs ("surfaces") of nine kinds: `diff`,
`files` (a tree), `file` (one file, opened at a line), `preview` (a browser tab), `device` (an
iOS or Android simulator stream), `terminal`, `pull-request`, `pull-requests`, `side-chat`
(VERIFIED `apps/web/src/rightPanelStore.ts` `RIGHT_PANEL_KINDS`, `RightPanelSurface`). The
state is kept **per thread** (`byThreadKey`: `isOpen`, `activeSurfaceId`, `surfaces`,
`maximized`), persisted in local storage (`t3code:right-panel-state:v2`, version 14) (VERIFIED,
ibid.). A terminal can also sit in a bottom drawer with a drag height
(`ThreadTerminalDrawer.tsx`, `clampDrawerHeight`, VERIFIED).

**Default and "proactive" opening.** The panel opens **by itself** in two cases: a pull request
gets linked to the thread, or a turn completes with a diff; it then shows the diff scoped to the
branch (VERIFIED `hooks/useProactivePanels.ts`, `selectGitScope(threadRef, "branch")`). Every
user choice bumps a revision (`markUserAction`), and `openProactive(..., expectedUserActionRevision)`
is **refused if the user opened or closed a panel since the revision was read** (VERIFIED
`rightPanelStore.ts` comment "Refused if the user chose a panel after
expectedUserActionRevision was read"). It is a setting (`enabled: proactivePanelsEnabledSetting`,
VERIFIED). The rule is "something new to look at may open the panel; a person's own choice
always wins".

**Diff.** Scopes: `branch` (against a base ref, the default), `unstaged`, a `commit`, a `turn`
(one agent turn's checkpoint), and a single `tool-call` (VERIFIED `diffPanelStore.ts`
`DiffPanelSelection`). Renderer: `@pierre/diffs` 1.7.0-beta.3 with its worker pool
(`@pierre/diffs/worker`, `DiffWorkerPoolProvider.tsx`) and `@pierre/trees` for the changed-files
tree (VERIFIED `apps/web/package.json`, `pnpm-workspace.yaml` catalog). Highlighting uses
Pierre's "highlights" WASM lexers rather than Shiki: "tokenize large files 10-40x faster than
Shiki and never backtrack like Shiki's JS regex engine" (VERIFIED `lib/syntaxHighlighting.ts`
`PREFERRED_HIGHLIGHTER`). A selection of lines becomes a **review comment** carried into the
composer as a chip with the file, range and diff text (VERIFIED `reviewCommentContext.ts`;
DOCUMENTED `docs/user/composer.md` "Context in your message"). **No per-file revert or discard**
was found in the diff panel's source (VERIFIED by search); undo is by checkpoint: "Edit from
here" on an earlier message, with **Revert and keep changes** or **Revert files too**, which
"also undoes edits you made yourself" (DOCUMENTED `composer.md`).

**Files.** A tree (`FileExplorerPane`), and a file view that previews Markdown, Mermaid,
notebooks, images, fonts, PDFs, office files and large text in workers (VERIFIED
`components/files/`). Editing uses Pierre's own code view (`@pierre/diffs/edit`), not Monaco or
CodeMirror (VERIFIED imports of `FilePreviewPanel.tsx`), saved by a debounced
`FileSaveCoordinator` that writes the newest draft and refuses to overwrite "when another editor
has newer unsaved contents" (VERIFIED `files/fileSaveCoordinator.ts`).

**Terminal.** Not xterm.js: the official `libghostty-vt` C ABI compiled to WebAssembly, drawn
into a Canvas 2D frame, the same core as the Android app; "React stays out of terminal frames"
(VERIFIED `apps/web/src/terminal/ghostty/README.md`; DOCUMENTED
`docs/internals/terminal-runtime.md`). The **server owns the PTYs** and keeps 5,000 lines /
8 MiB per terminal, so any client reattaches; replayed history is stripped of terminal queries so
old device queries don't provoke replies at the prompt (DOCUMENTED ibid.). A terminal excerpt
can be attached to the composer as a chip (DOCUMENTED `composer.md`).

**Preview, local.** The desktop app shows its own machine's tabs in an Electron `<webview>`
(VERIFIED `apps/desktop/src/window/DesktopWindow.ts` `webviewTag: true`). Agents drive the same
tabs (open, click, type, snapshot, console, network; VERIFIED `PreviewAutomation*` types in
`apps/server/src/preview/ServerBrowser.ts`), with a drawn agent cursor
(`AgentBrowserCursor.tsx`, VERIFIED); a person "takes control" before typing into an agent's
tab and releases it after; read-only connections can only watch (DOCUMENTED
`docs/user/remote-access.md`). Preview annotations (a picked element, a note, also by voice) go
into the composer as chips (DOCUMENTED `composer.md`, VERIFIED `PreviewAnnotationSpeech.tsx`).

**Port detection.** The server lists ports **held by processes its terminals and agents
started**: `lsof -F pcn` for loopback or wildcard listeners, a bounded `/proc` walk when lsof is
missing, `netstat.exe` on Windows; it registers terminal process ids and counts running agents
(`registerTerminalProcesses`, `trackAgent`) (VERIFIED `apps/server/src/preview/PortScanner.ts`).
"T3 Code reads which process holds each port and never connects to it", so a listed port opens as
`http://localhost:<port>`; a project script can declare a **Preview URL** for HTTPS or a path;
`T3CODE_PORT_DISCOVERY=0` turns listing off (DOCUMENTED `remote-access.md` "Local servers").
It can also stop a listed server's process group, "never this server, an agent CLI, or a shell"
(VERIFIED `PortScanner.ts` `stopServer`).

**Preview, another computer.** Browser tabs **belong to the environment** (the machine), "so you
and your agents see the same tabs from any device … `localhost` addresses reach servers on the
host" (DOCUMENTED `remote-access.md`). The host runs a headless Chrome it downloads once
(~120 MB) through Playwright; every other client gets a **CDP screencast**:
`Page.startScreencast` JPEG frames (quality 70 by default, 50 while in motion, sized to the
viewer's `maxWidth`/`maxHeight`, rendered at 2× for sharpness), acked by the viewer and paced at
100 ms ("caps viewers near 30 fps"), a still sent when motion settles because "Chromium may drop
the final frame during a burst", over a WebSocket at `/api/preview-stream`, authenticated with
the server's read / preview-operate scopes; input goes back as `Input.dispatchMouseEvent` /
`Input.dispatchKeyEvent` (VERIFIED `ServerBrowser.ts` `attachViewer`, constants at lines 92–102;
`ServerBrowserStream.ts`). A stalled viewer's queue drops frames but keeps its latest `control`
and `viewport` state, "without its latest size and control the viewer cannot map input at all"
(VERIFIED). Clipboard, file pickers and downloads are bridged to the viewer's device; audio is not
(DOCUMENTED). No port forwarding, no proxy of the site's HTTP, no subdomain: the pixels travel,
the page never leaves the host.

**Keyboard** (defaults, `mod` = ⌘ / Ctrl; VERIFIED `packages/shared/src/keybindings.ts`):
`mod+d` diff toggle (`!terminalFocus`; in a terminal `mod+d` splits it), `mod+j` terminal toggle,
`mod+shift+j` preview toggle, `mod+alt+b` right panel toggle, `mod+b` sidebar, `mod+t` new
right-panel tab (when open), `mod+w` closes the right-panel tab or the focused terminal (never the
window), `mod+shift+t` reopens the last closed tab of any kind, `f6` / `shift+f6` move focus
between regions, `mod+p` file picker, `mod+shift+f` project search; inside a preview `mod+r`
reload, `mod+l` address, `mod+=`/`mod+-`/`mod+0` zoom, `mod+f` find. Bindings carry `when`
clauses (`terminalFocus`, `previewFocus`, `rightPanelOpen`, …) and are user-editable
(DOCUMENTED `docs/user/keybindings.md`). Terminal scrollback: Shift+PageUp/PageDown,
mod+Shift+Home/End (DOCUMENTED `docs/user/terminal.md`).

**Narrow and phone.** At ≤ 980 px the panel stops being a column and becomes a sheet from the
right, `min(42vw, 28rem)`, `min(88vw, 24rem)` below 760 px (VERIFIED `rightPanelLayout.ts`,
`RightPanelSheet.tsx`). The phone app is native: an inspector column where it fits, a sheet where
it doesn't, decided by the shell, never by a screen (DOCUMENTED `docs/internals/mobile-layout.md`);
it has a native terminal surface, a native diff surface, and the preview as the same screencast in
a WebView, floating, with picture-in-picture "to keep watching … over other apps" (VERIFIED
`apps/mobile/src/features/{terminal,diffs,browser}`; DOCUMENTED `remote-access.md`).

**How the agent hears your edits.** Nothing found: no notice is sent when the user saves a file
(VERIFIED by search for such wording in `apps/` and `packages/`). The one "keep the agent
informed" path is for MCP apps: "T3 Code sends the latest note from each app with your next
message" (DOCUMENTED `docs/user/html-renders.md`).

## 2. Lorca (side panels only)

- **An inspector, not a workbench.** The pane beside a chat lists the bots, project context,
  Waiting for review, Outputs, **Coding** (the chat's agents with state and pull request), Tasks
  (VERIFIED `desktop/inspector.go` header comment; DOCUMENTED `docs/architecture/desktop-app.md`).
  Toggle **⌘⇧B** ("Toggle Inspector"), sidebar **⌘B** (VERIFIED `desktop/mainwindow.go`); width
  268–320 DIPs, dragged and saved in preferences (DOCUMENTED desktop-app.md "Title bar").
- **No diff, file tree, editor or terminal view** for the user. Changes are counts on each edit
  and "+12 −3 in 4 files" at the foot against the start commit (research/58 §1). Review happens
  on the pull request.
- **Terminals are the agent's**: each `bash` call gets a PTY of its own (`openpty`, 80×24,
  pagers off), drained to 200 KB; what a card stores is sanitized text (DOCUMENTED
  `docs/architecture/terminal-sessions.md`).
- **Browser**: per-bot profiles on the Runner, headed Playwright Chromium in a **window on the
  Runner's screen**; Take Over / Return to Bot gate the bot's calls; from another device you
  can't see it ("the user signs in at the Runner") (DOCUMENTED `browser-sessions.md`). No remote
  preview of any kind.
- **Phone**: two panes from 700 pt, else stacked (DOCUMENTED `phone-layout.md`); no workbench.

## 3. Conductor

All DOCUMENTED (conductor.build docs and changelog, version in brackets).

- **Layout.** Workspaces (a branch each, local or cloud) in the left sidebar; the chat; a right
  side panel with a **git panel** (Changes tab: uncommitted and committed sections, path filter
  [0.33.4, 0.87.0]), a **Checks** tab (git status, PR, CI, deployments, GitHub review threads,
  todos; merge discouraged while todos or failing checks remain [0.31.1, docs/reference/checks]),
  a **Run** tab, and a terminal panel with tabs and "Big Terminal Mode" (full height) [0.22.4,
  0.48.0]. Zen mode `⌘.` hides the rest [0.22.0].
- **Diff.** Per-turn diffs from each message [0.22.0], unified view, commit filter, incremental
  expansion [0.22.5], **mark file as viewed** (`⌃V`, works with the chat focused [0.31.3]), line
  comments sent to the agent [docs/reference/diff-viewer], and since 0.84.0 "Changed files now
  open and edit directly in diffs by default". GitHub suggested changes render as diffs [0.87.0].
  No per-file revert is documented. Failing checks can be forwarded to the agent [0.12.0].
- **Files.** `⌘P` file opener [0.20.0], file tree that reveals the open file [0.85.0], content
  search `⌘⇧F` [0.87.0], `⌘⇧C` copy path [0.21.0].
- **Terminal and agent.** "Claude can now read your terminal" [0.29.5], `@terminal` in the
  composer [0.46.0], terminal context into chat [0.7.2].
- **Run and preview.** A repo's **run script** (one or several [0.70.0]) behind a Run button /
  `⌘R` [0.9.0], stdin from /dev/null "to discourage interactive behaviors" [0.32.0]. A localhost
  URL is detected and opened with **Open / ⌘⇧O** in your browser [0.9.1]; an experimental
  **in-app browser** renders it inside Conductor with **⌘⇧B**, with Agentation annotations
  attached to the composer [0.62.0]. A bug fix says previews had opened "an unused port instead
  of the running development server" [0.87.0].
- **Remote (cloud) preview = port forwarding to your Mac.** Cloud workspaces forward detected
  ports, from a ports popover in the top bar, using "the same local port as the sandbox when that
  port is available" [0.82.0, 0.83.0]; since 0.84.0 forwarding is **off by default per
  workspace, on with ⌘Y** (or Start forwarding in the Run panel), which then "shows clickable
  localhost badges once ports are ready" [0.86.0]; Settings → Ports picks a forwarding strategy
  and local port range, and "Exclusive" turns it off in other workspaces [0.85.0, 0.86.0];
  teammates' ports no longer auto-forward [0.83.3]; links to cloud apps can be shared [0.84.1].
- **Shortcuts for the panel**: `⌘⌥U` / `⌥U` toggles uncommitted changes in the git panel
  [0.33.3, 0.84.0]; `⇧⌥C` view uncommitted changes (older entry); `⌘⌥←/→` cycle visible tabs
  [0.82.0]; `⌘⌥/` the shortcut reference [0.84.0]; `⌘⌥L` next workspace needing attention
  [0.83.0]. No documented single key toggles the whole right panel.
- **Phone.** Conductor for iOS [0.90.0]: chat with agents and merge PRs, cloud workspaces;
  Remote control of the Mac's local workspaces (browse, create, read, send, pick models, stop)
  [0.91.2, 0.92.0]. No diff, terminal or preview on the phone is documented.
- **Your edits:** not documented.

## 4. Codex app (ChatGPT desktop app)

All DOCUMENTED (learn.chatgpt.com: code-review, integrated-terminal, browser, reference/commands).

- **Review pane**: scopes **Unstaged** (default), Staged, Commit, Branch, **Last turn**; **Stage
  all / Revert all**, and stage, unstage or **revert per file and per hunk**; line comments with
  "+" that "Codex treats … as review guidance", sent with your next message; a file name opens
  your editor, ⌘-click a line opens that line. No editing in the pane. It "reflects the Git
  repository's state, including changes you made yourself".
- **Terminal**: one per chat, "scoped to its current project or worktree"; "ChatGPT can read the
  current terminal output".
- **Browser**: a tabbed in-app browser "you and ChatGPT" share, in split view or full view; a
  separate profile (sign in when a task needs it); Annotate mode for element or area comments;
  the agent opens, clicks, types, screenshots; `@Browser`. Localhost by clicking a URL; no port
  detection or remote preview documented.
- **Shortcuts (macOS)**: `⌘J` toggle bottom panel, ``⌃` `` toggle terminal, `⌃⇧G` open review tab,
  `⌘⇧E` toggle file tree, `⌘P` search files, `⌘T` browser tab, `⌘⇧.` browse/comment mode,
  `⌘⇧B` cycle layout (full view, split view, hidden tabs), `⌘⌥B` switch between chat and tabs,
  `⌘B` sidebar, `⌘⌥S` side chat. Older pages and third-party sheets give `⌘⌥B` as "Toggle diff
  panel" and `⌘J` as "Toggle terminal": the names moved as the panel became tabs.
- **Phone**: a "Codex on mobile" page exists; the review pane on mobile isn't documented.

## 5. Claude Code desktop

All DOCUMENTED (code.claude.com/docs/en/desktop).

- **Panes you arrange**: chat, diff, browser, terminal, file, plan, tasks, subagent, iOS
  Simulator; "Drag a pane by its header to reposition it, or drag a pane edge to resize it";
  panes pop out into their own window and dock back; terminal and browser have tabs; buttons that
  don't fit a narrow window move into ⋮. A **session details rail** of cards (where it runs,
  Changes, what it's running, context) shows "while the chat is wide enough". Plan and Background
  tasks appear "once the session has something to show".
- **Diff**: opened from the Changes card's `+12 -1` or the title bar; line comments by "+",
  submitted together with ⌘↩; "Claude reads your comments and makes the requested changes, which
  appear as a new diff". No per-file revert documented.
- **File pane**: click a path in the chat; edits **save on their own** (Auto save can be off);
  if the file changed on disk, **Override** or **Discard**; view-only in cloud, SSH and WSL
  sessions.
- **Browser pane and dev servers**: Claude detects the dev server setup and stores it in
  `.claude/launch.json` (`runtimeExecutable`, `runtimeArgs`, `port`, `autoPort`), starts it after
  editing, and with `autoVerify` (on by default) "takes screenshots, checks for errors, and
  confirms changes work before completing its response"; a Dev servers menu in the pane's header;
  a clean profile, Keep cookies optional. **Over SSH the Browser pane has no tools**: "you forward
  the remote port to your computer to view the app yourself".
- **Shortcuts**: `⌘⇧D` diff pane, `⌘⇧B` Browser pane, ``⌃` `` terminal, `⌘\` close the focused
  pane, `⌘⇧S` select an element in the Browser, `⌘/` all shortcuts.
- **Phone**: cloud and Remote Control sessions show in the Claude app and claude.ai/code; the
  panes are not described there.
- **Your edits**: the desktop page doesn't say. The Claude Code harness itself tells the model when
  a file it read has changed since (a "modified, either by the user or by a linter" note with the
  new content beside the next turn) (INFERRED from transcripts of this harness; not in the
  desktop page).

## 6. Zed's agent panel

- **Review**: "Review Changes" (`ctrl-shift-r`) "opens a special multi-buffer tab with all
  changes"; **keep or reject each hunk or the whole set**; optionally inline in each file
  (`agent.single_file_review`); "Follow the agent" jumps the editor to each file it touches
  (DOCUMENTED zed.dev/docs/ai/agent-panel).
- **Your edits, in source**: the action log records the buffer version the agent last read;
  `stale_buffers` are those "changed since last read or edited by the model" (VERIFIED
  `crates/action_log/src/action_log.rs` `stale_buffers`). When an edit's search fails on such a
  file, the tool's error adds "The file has changed on disk since you last read it." (VERIFIED
  `crates/agent/src/tools/edit_session.rs`). Hunk acceptance survives user edits that overlap the
  agent's (a test `test_overlapping_user_edits`, VERIFIED to exist; behaviour INFERRED).

## 7. Side by side

| | Diff and undo | Files | Terminal | Preview | Remote preview | Your edits reach the agent |
|---|---|---|---|---|---|---|
| t3code | branch/unstaged/commit/turn/tool-call; comment chips; undo by checkpoint | tree, rich previews, Pierre editor, debounced save | ghostty-vt WASM, server-owned PTY | Electron webview; agents drive it | **CDP screencast** of a headless Chrome on the host | no |
| Lorca | counts only | none | agent's PTYs only | Runner's own window | none | — |
| Conductor | per turn, viewed, comments, edit in diff | ⌘P, tree, ⌘⇧F | tabs, big mode, agent reads it | Run tab, in-app browser ⌘⇧B | **port forwarding** to the Mac's localhost, ⌘Y | not documented |
| Codex | 5 scopes; stage/revert per file and hunk; comments | tree ⌘⇧E | per chat, agent reads it | shared tabbed browser, annotate | none documented | via git state, implicitly |
| Claude Code desktop | from Changes card; comments ⌘↩ | autosave, Override/Discard | ⌃` | launch.json, auto start, autoVerify | **none**: forward the port yourself | harness note on next read (INFERRED) |
| Zed | keep/reject per hunk, multibuffer | the editor | the editor's | — | — | **stale-since-read**, said on the edit |

## Implications for Ducter

Handling and technique only; Ducter keeps Pebble's look. Ducter's case differs from all of
them in one way that decides most of this: a task often runs on **another computer** (a worker,
the home server), and the person is often on a **phone** (D157, D178).

What to take:
- **From t3code: the panel's rules and the remote preview.** Panel state per task, tabs of a few
  kinds, a proactive open only when something new is there to see, and **refused if the person
  opened or closed anything since** (a user-action revision checked at open time). For a site on
  another computer, **stream the page, don't forward the port**: a browser on the machine that
  runs the dev server, CDP `Page.startScreencast` JPEG frames acked and paced (~30 fps cap, lower
  quality in motion, a still when it settles), input back as CDP input events, over the home's
  existing authenticated socket with separate watch and operate rights, and a viewer queue that
  never drops the latest size and control. It needs no open port, no tunnel and no DNS, works
  through Ducter's relay to a phone, and the agent and the person look at the **same tab**. The
  cost is a ~120 MB headless browser per machine and JPEG latency; it is the right default for
  Ducter, with "open in my browser" for when the person's own machine runs the server.
  **Port detection from the processes the task started** (lsof / /proc / netstat, never
  connecting) so only the task's own servers are offered; a declared Preview URL wins.
- **From Codex: the diff's verbs.** Scopes that include **this turn** and the whole task, and
  revert per file and per hunk, with the header's "revert all". A fresh user needs only one of
  them ("undo this change"); the developer expects all.
- **From Claude Code desktop: dev servers known, started and checked by the agent**, stored per
  project (its `launch.json`: command, args, port, auto port), and **verify before reporting**
  (a screenshot and the console checked before the agent says done). In Ducter that is evidence
  in the agent's report, shown as a picture in the outcome (D206). Also: a file pane that
  autosaves with **Override / Discard** on conflict, read-only where it can't write safely.
- **From Zed: tell the agent the person edited a file.** Keep, per task, the version of each file
  the agent last read (Ducter's Log already sees the edit tool's input and reads); when the person
  saves a file in the workbench, put one line beside the next message to the agent ("you edited
  `x.ts` lines 12–30 since it last read it"), and on the agent's failed edit, say the file
  changed. None of the GUI products documents this; Zed and the Claude Code harness do it in the
  model's channel.
- **From Conductor and Codex: comments as context.** Line comments on a diff, an annotation on the
  preview, a terminal excerpt: each becomes a chip in the composer with its file and range, sent
  with the person's next words, never as a message of its own.
- **From t3code: the terminal belongs to the machine, not the client** (server-owned PTY with a
  bounded tail, any client reattaches, replay stripped of terminal queries), which is the only
  shape that works for a phone and a worker. A renderer built on libghostty-vt is a good option
  for the Mac app; the web can start with xterm.js.
- **Keys** (Ducter's Esc already goes up a level, D210): one key per kind and one for the
  panel. The field has converged on `⌘J` / ``⌃` `` for the terminal and a `⌘⇧`/`⌘⌥` chord for
  diff and browser, but disagrees on which (`⌘D` t3code, `⌘⇧D` Claude Code, `⌃⇧G` Codex for
  the diff; `⌘⇧J` t3code, `⌘⇧B` Claude Code and Conductor for the browser; `⌘⌥B` t3code for the
  panel, `⌘⇧B` Lorca for its inspector). Defaults worth proposing: `⌘⌥B` the panel (macOS's
  "toggle inspector"-style chord, free of `⌘⇧B`'s browser meaning), `⌘J` the terminal, `⌘⇧D`
  changes, `⌘⇧B` the website, `⌘W` closes the active tab and never the window, `⌘⇧T` reopens.
- **Narrow**: the panel becomes a sheet below a width, decided once by the shell (t3code's
  ≤ 980 px; its mobile app's "the shell decides, a screen never asks"). On a phone the workbench
  is a sheet with one thing at a time; the website preview can float.

What each gets wrong:
- **t3code** shows everything a developer could want and so much more (nine panel kinds, a
  hundred shortcuts, PR pages, devices); a fresh user meets a cockpit. Undo is only by checkpoint,
  which also undoes the person's own edits. It never tells the agent the person edited a file.
- **Lorca** has no workbench: no diff, files, terminal or remote preview; its browser can only be
  seen on the Runner's own screen.
- **Conductor** previews a remote site by forwarding ports to the Mac's localhost: it needs the
  Mac awake and in reach, collides on ports (hence "exclusive", ranges, "wrong port" fixes), and
  can't reach a phone. Its phone app has no workbench.
- **Codex** has the best diff verbs but no in-pane editing and no remote preview; its shortcut
  names changed under its users as panels became tabs.
- **Claude Code desktop** loses the browser entirely over SSH ("forward the remote port …
  yourself"), and its free-form pane arrangement is a layout for the person to manage.
- **Zed** tells the agent about edits but has no preview, and its review lives in an editor a
  fresh user doesn't have.

## Summary

Beside a coding agent, the field shows changes (scoped to the turn or the branch, with comments
that go to the agent as context), files, a terminal the agent can read, and a website preview,
in a right panel or pane set that is hidden until asked for or until there is something new.
For a site on another computer there are three answers: Conductor forwards ports to the person's
localhost, Claude Code desktop leaves it to the person over SSH, and t3code runs a headless
Chrome on the machine and streams it as CDP screencast frames over its own authenticated socket,
the same tab for the agent and every device; that last one fits Ducter's workers and phone.
Only Zed (and the Claude Code harness) tell the agent when the person edited a file it read.
Ducter should take t3code's panel rules and screencast, Codex's diff verbs, Claude Code's known
dev servers and verify-before-report, Zed's stale-since-read notice, and the comment-as-chip
pattern, and keep the workbench small enough that a fresh user sees only "what changed" and "the
website".
