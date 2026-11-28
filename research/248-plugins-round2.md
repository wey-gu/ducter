# 248: Plugins, round 2 — every extension point, UI and layout included, and an agent that writes them

The author asked (2026-11-28): 「plugin 设计要优雅，允许用户灵活扩展各种东西包括视觉 ui
layout 的能做到么？参考 magpie？还要有极致优雅的 agent experience（参考文档和 skill）」.

Round 1 (`research/246-plugins.md`, D651, D655, D668) answered a narrower question: bring another
app's history in, through one data format and a sandboxed reader, and never let a plugin draw.
This round has to answer the widest one: **every extension point Ducter has or should have**,
including the visual UI and layout, with one manifest, one install and one agent experience.

It covers: what magpie's window plugins actually do (Part 1); four mature extension systems that
extend UI safely and how their authors are helped (Part 2); Ducter's extension points as plugin
kinds, ranked (Part 3); one manifest and one index (Part 4); UI plugins in detail, including the
native Mac app (Part 5); the shipped skill, `new` / `check` / `dev`, docs and `llms.txt` (Part 6);
where this can hurt (Part 7); and a phased plan with phase 1's brief (Part 8).

**Method.** Everything here was read only. No third-party code was run, nothing was installed,
nothing was written outside this worktree, and no home, port or config was touched. Clones are
`--depth 1` in the session scratchpad:

- `yetone/magpie` @ `23b1d6ae` (2026-11-28 15:43 +0800);
- `obsidianmd/obsidian-developer-docs` and `obsidianmd/obsidian-help` (read for the security and
  community-plugin pages).

External documentation was read at the URLs in **Sources**. Ducter was read on branch
`dsh-plugdesign` (`549b21f7`, after D668).

Tags:

- **VERIFIED**: read in code (Ducter's or magpie's);
- **DOCUMENTED**: the project's own docs or a vendor's docs say so;
- **INFERRED**: my reading.

## Summary

- **The line 246 drew — "UI: never" — moves, but only inside a frame.** A UI plugin is static
  HTML/CSS/JS in an isolated web view, drawn only with Ducter's tokens and kit, reading only a
  small declared read API, with no network, no server code and no way to touch the shell. It gets
  three surfaces, not the app: **a page of its own** (a layer, reached by ⌘K and Settings ›
  插件), **a section at the foot of Tasks**, and **a panel in an opened task's workbench**.
  (Part 3, Part 5)
- **Four kinds, one manifest.** `theme` (a token set, data only), `importer` (D668's reader,
  unchanged in authority), `ui` (the frame above), `connector` (a bundle around an MCP server).
  Chat channels and harness adapters stay out: channels speak as the partner, and a harness is
  already OAR's job. A to-do source is a later, read-only-first kind; it writes outward and holds
  a token, so it is not in v1. (3.2–3.4)
- **Ranked by value against risk:** `theme` (4 / 1), `importer` (3 / 1.5), `ui` (5 / 4),
  `connector` (4 / 3.5), `source` (2.5 / 4, later), channels and harnesses never. UI carries the
  most value and the most risk; it is third only because of the ratio, and it gets the most
  design in this report. (3.3)
- **One `ducter-plugin/2` manifest** with a `kind` and only that kind's object, permissions as a
  closed vocabulary the host turns into literal consent lines, and D668's `ducter-plugin/1`
  still read forever. Install stays pinned git or a folder, with a content hash checked before
  every open; the curated `ducter-plugins` repo carries `index.json` and `withdrawn`, and a
  person can add their own index repository. Never auto-updated. (Part 4)
- **The frame is the product, not the plugin.** Ducter already has the pieces: the small-app
  sandbox and kit (D405/D410), the Mac's `Untrusted` web view on its own scheme, the web's
  per-open `/app-frame/<token>`, and D668's pin/hash/consent/curation. A UI plugin reuses all of
  them with a different capability set and a narrower surface. (5.1, 5.7)
- **The UI bar is enforced by a tool, not a promise.** `ducter plugin check` renders the page at
  390 and 1180, light and dark, zh and en, plus 320 and 1400, runs the a11y and layout checks,
  refuses hard-coded colours and system controls, and writes the shots; `ducter plugin dev`
  live-reloads against the running home. (5.6, 6.2)
- **The agent experience is the differentiator.** magpie has one long documentation page and an
  `llms.txt` link; it has no scaffolder, no checker, no dev server. Ducter ships
  `skills/ducter-plugin/SKILL.md` (already how `ducter-deploy` reaches agents), four working
  examples, `new` / `check` / `dev`, a JSON check result, `/docs/plugins`, a manifest JSON
  Schema, and the same file published at `/skills/ducter-plugin/SKILL.md`. A person's own agent
  goes from one sentence to a passing, installed plugin in one conversation, and the person's
  tap is still the install. (Part 6)
- **Ducter's own partner does it through a task, not a new tool.** An app is seconds and one
  document; a plugin is files on the home, checked and installed. The partner hands it to a task
  with the skill, and its report carries one card: the check's summary, two shots, **装上**.
  (6.4)
- **A decision is owed on the word.** D651 ruled "never 'plugin' on screen". UI plugins change
  that: a person consenting to code that draws their screens must be told it is someone else's
  plugin. Recommendation: **插件 / Plugins** is said only where a person adds or manages code
  (the Settings pane, the consent card, the check), and never in a flow that just delivers an
  outcome (import offers, apps, themes chosen from a list). (4.6)

## Part 1: magpie's window plugins, in depth

`research/246` covered magpie's provider plugins and its two trust levels. This part reads only
the window side: how a plugin changes what a person sees, and what confines it.

### 1.1 The package: what the window reads, and what starts

A community plugin is an npm package, a git repo or a folder (DOCUMENTED,
`site/public/docs/plugins.html`). Its server side is OpenCode's plugin shape; its window side is
a `magpie` object in `package.json`, read by `internal/plugin/page.go` (VERIFIED):

| Key | Shape | Limit |
|---|---|---|
| `magpie.page` | `{title, titles, file, icon, replaces, service, keepAlive}` | one page |
| `magpie.panels` | `[{slot, file, title, titles}]` | 8; slots `agents`, `usage`, `settings`, `provider` |
| `magpie.actions` | `[{id, menu, title, titles}]` | 8; menus `provider`, `agent`; only with a page |
| `magpie.permissions` | `["usage:summary" \| "usage:day" \| "providers:list"]` | 3 reads, none secret |
| `magpie.icon`, `magpie.name`, `magpie.summary` | a picture, a name, a line | its own words, marked unreviewed |

A plugin that is **only** a page never starts the plugin host at all (VERIFIED, `page.go`:
`Window(...)` returns `only`, and `SetPageOptions` keeps the host off). That is the single most
useful fact in this part: magpie's safest UI plugin is static files, with no process. A page can
also ship a **local HTTP service** (`magpie.page.service`, a port on 127.0.0.1) and `keepAlive`;
both are the exception, and both widen what a page can do.

### 1.2 A page

- Once the plugin is on, its page is a tab in the sidebar's **Plugins** group, after magpie's own
  pages; `replaces` (`sessions`, `library`, `routing`, `usage`) takes a built-in's place instead
  (DOCUMENTED).
- The page's files are served under `/_magpie/plugin/<token>/`, a token made fresh each run of
  magpie; the page's folder is the root, a path out of it is not served, and a symlink out is
  resolved and refused (VERIFIED, `pluginpage.go`, `inside`).
- The frame is `sandbox="allow-scripts"`, in an origin of its own, with a CSP of
  `default-src 'none'`, its own files for scripts/styles/images/fonts, `connect-src 'none'`,
  no frames, no workers, no objects, no forms, no base, and `frame-ancestors 'self'` (VERIFIED,
  `pagePolicy`). Inline styles and `data:` pictures are allowed; scripts must be files.
- magpie's own `/api` refuses any request a frame can make (`Origin: null`, a framed request, a
  cross-site non-document), so the page is shut out twice (VERIFIED, `apiFramed`).
- A page that doesn't answer `magpie.ready` within 10 s is shown as not answering; one left for
  10 minutes is let go and loads again when next opened, unless `keepAlive` (DOCUMENTED).

### 1.3 Panels

A panel is a small page of its own in the same sandbox, bridge, reads, options and theme, placed
in one of four slots: the end of the Agents page, the end of Usage's Overview, a **Plugins tab in
Settings**, or a provider's editor (told `{provider: {id, name}}`) (VERIFIED `plugin.PanelSlots`;
DOCUMENTED). It sits in a card under a heading with its title, is as tall as its `<html>` (up to
2400 px), and a panel that throws or doesn't answer in 10 s is replaced in place by
"stopped working" with Try again while the page and the panels beside it go on (DOCUMENTED).

### 1.4 Actions

A plugin with a page can add up to 8 items to two menus: a provider row's and an agent row's.
Picking one opens the plugin's page and tells it the action's id and the row's `{id, name}`,
nothing else (VERIFIED `ActionSpec`; DOCUMENTED). An item with no title takes the page's.

### 1.5 The bridge

`pagebridge.js` is served beside every page (`_magpie/bridge.js`) and is the only way out
(VERIFIED, its own header comment):

- `await magpie.ready` → `{dark, lang, tokens}`; `magpie.theme`, `magpie.onTheme(fn)`;
- `magpie.options.get()`, `.set(o)` (at most once a second; the plugin's own options in
  `plugins.json`, never another's);
- `magpie.read(name, params)` → only the reads its package declared; `usage:summary` (calls,
  errors, tokens, cost, top 20 models), `usage:day`, `providers:list` (ids and names). No read
  gives keys, accounts, sign-ins or request bodies (DOCUMENTED, and the docs say "treat what a
  page can read as public");
- `magpie.openPlugin(name)` → the sheet of an npm package, with Install for the reader to press;
  installs nothing, one each 1.5 s, only while the page is seen;
- `magpie.context` (a panel's provider), `magpie.service` (a page's local service through
  `magpie web`), `magpie.visible` / `onVisibility(fn)`, `magpie.onAction(fn)`;
- a PNG to the clipboard or to Downloads (`image.copy`, `image.save`).

A page can still send itself to another site, which then holds its frame; that is why the reads
carry nothing secret (DOCUMENTED). The bridge also injects a **no-weight** stylesheet
(`:where()`) for the font, colours, headings, buttons, fields and tables, and sets
`--magpie-*` variables from the theme; any rule of the page's own wins (DOCUMENTED).

### 1.6 The look

magpie's window is one design system (`app.css`, `i18n.js`, menus through `openProtoMenu`), and
a plugin page is expected to blend in, but **nothing enforces it**:

- the kit (`magpie.ui`) offers `el`, `button`, `toggle`, `menu`, `row` and
  `form(schema, values, onChange)`; it is a convenience, not a mandate (VERIFIED,
  `kernel.js`'s documented surface, `docs/subsystems/plugin-runtime.md`);
- the page may bring its own CSS, fonts, colours and layout, and nothing stops one; there is no
  lint, no screenshot check and no a11y check in the plugin path (INFERRED from the docs and the
  repo's test list: the tests are Go/JS unit tests, not visual ones);
- a page can replace a built-in page, and it is the first plugin in the list that wins when two
  ask for the same one (DOCUMENTED);
- settings forms are drawn by magpie from a Go struct's JSON Schema (built-in plugins) or by the
  page itself (community pages) — two different answers to "a settings page".

### 1.7 Failure and lifecycle

- A hook that throws, or whose promise fails, is caught per page: the page is replaced by a card
  saying "This page stopped working", the error's message and Try again; further hooks of that
  page do nothing; the other pages go on (DOCUMENTED, `plugin-runtime.md`; VERIFIED in
  `kernel.js`'s design).
- Turning a plugin off takes its page, its panels, its actions and its tab with it; turning it on
  loads them. A page-only plugin starts no host; a plugin with a server side restarts the host on
  add/remove/update/on/off, after a streaming reply finishes (DOCUMENTED).
- A page's error is visible only in the window's console as "Script error." (DOCUMENTED), so the
  author's feedback loop is the browser devtools, not a tool.

### 1.8 Install, discovery, versions

`research/246` §1.3 has the detail; the parts that matter for UI:

- npm, `github:owner/repo#ref`, `git+https://…` or a folder; npm installs with install scripts
  **not run**; a folder loads where it is (DOCUMENTED);
- pinned versions stay pinned; `@magpie-community/*` updates itself hourly; others show a dot and
  an Update (DOCUMENTED);
- the curated list is `magpie-community/plugins`' `registry.json`, with a built-in copy
  (`internal/plugin/market.json`, VERIFIED) and `MAGPIE_PLUGIN_MARKET` to move it; a GitHub repo
  tagged `magpie-plugin` appears under Discover › Unofficial, marked as reviewed by no one; a
  `withdrawn` list refuses one for new installs (VERIFIED, `withdrawn.go`);
- the Plugins page shows a page and **what it may read** before it is turned on (DOCUMENTED);
- the same permission is written twice: the manifest asks, the window checks, and magpie checks
  again on the server (DOCUMENTED). That two-place check is worth copying.

### 1.9 The developer docs and the agent's path

- One page, `site/public/docs/plugins.html` (about 87 KB of text as extracted), covering the
  provider hooks, the package, the host protocol, pages, panels, actions, pi packages, testing,
  publishing and an FAQ. It has a five-minute worked example, run against v0.1.676, and a
  "Try it in a sandbox. A plugin you are writing should never touch your real magpie. Run magpie
  with a HOME of its own" (DOCUMENTED).
- The loop is: `magpie plugin add ./folder`; in the app, turn the plugin off and on to load
  edits; a terminal `magpie` command loads the folder as it is (DOCUMENTED). There is **no**
  `new`, no `check`, no `dev`, no screenshot, no a11y, and no schema validation: `Window()`
  recognises the keys it knows and ignores the rest, and no JSON result reaches an agent
  (VERIFIED: `internal/cli` has no such subcommand; `page.go`'s `Window`).
- Agent-facing material: `llms.txt` has one line, "Writing plugins" → the docs page, and the
  page is in `llms-full.txt` (DOCUMENTED, `site/public/llms.txt` line 163). There is no
  plugin-authoring skill (the repo's only `SKILL.md` files are test fixtures for other agents'
  skill formats) and no manifest schema. A person's agent has to read a long HTML page and then
  guess whether its page looks right.
- The development docs are candid about the risk: "What does a plugin see of the user's work?
  Everything in the requests it makes" (DOCUMENTED, FAQ). The window side is safer than the
  server side, but only because of the frame.

### 1.10 What to take, what to reject

Take:

- **a page-only plugin starts no process** — the best safety property in the whole system;
- **the per-run token, the folder as the root, `sandbox="allow-scripts"`, `connect-src 'none'`,
  and `/api` refusing framed requests** — four independent locks, each cheap;
- **the bridge as the only way out**, with reads declared per package and checked twice;
- **the token bridge and the no-weight stylesheet** — a page's unstyled parts already look like
  the host, and its own CSS can still win;
- **the error boundary per page and per panel**, and "Try again" in place;
- **panels in the host's own pages**, each a small frame with its own context;
- **the Plugins page showing what a page may read before it is on**;
- **a curated list with "its own words" and a withdrawn list**;
- **the idea of a schema-drawn options form**, which Ducter should make the only way a plugin is
  configured (magpie itself draws one for a built-in's Go struct, not for a community page).

Reject:

- **free HTML with no kit mandate and no check.** magpie's pages can look nothing like magpie,
  and nothing catches it. Ducter's one style is the product; a plugin gets tokens and a kit, and
  `check` refuses anything else.
- **a local HTTP service on a page.** It is a network hole behind a bridge that otherwise has
  `connect-src 'none'`; Ducter's UI plugins have no process at all.
- **panels in Settings.** Settings is where trust is configured; a third-party frame must never
  draw there. A plugin's options are a form Ducter draws.
- **auto-update, hourly, for anyone.** 246 already rejected it; a UI plugin that redraws the app
  is a worse place to accept it.
- **the unsandboxed Bun host for the same package.** A page and a provider in one package means
  the safe half inherits the unsafe half's trust. Ducter's kinds are separate by design.

## Part 2: four other systems that extend UI

Read from their own documentation (DOCUMENTED); no code installed or run.

### 2.1 The table

| System | What a plugin can change in the UI | How it is confined | How authors (and their agents) are helped |
|---|---|---|---|
| **VS Code** | Contribution points in `package.json`: `views` and `viewsContainers` (sidebar/panel), `menus`, `commands`, `keybindings`, `colors` and `themes`, `walkthroughs`, `chatSkills`/`chatInstructions`/`chatPromptFiles`; a webview can render any HTML in an editor tab, a custom editor, or a sidebar view | The extension host is a **separate Node process but not OS-sandboxed**; Workspace Trust restricts what a workspace's code may do; a webview is an iframe with a CSP, `asWebviewUri` for its own files, `postMessage` only, and no DOM access to the workbench; theme colours come from `ThemeColor` | A typed API, a manifest reference, UX guidelines, `vsce` packaging/publishing, an integration test harness, a Marketplace with publishing and verification; docs are plain-Markdown pages an agent can read; an extension can itself ship Agent Skills |
| **Raycast** | Fixed host components only: `List`, `Grid`, `Detail`, `Form`, `ActionPanel` with actions and shortcuts; a menu-bar command; preferences; AI tools and skills | One child Node process, each extension in its own V8 isolate with limited heap; **not further sandboxed for file, network or process** (DOCUMENTED); extensions are open source and reviewed into a store; auto-updated | `npx ray build / develop / lint / publish`; `develop` hot-reloads, shows stack traces and logs, and puts the command at the top of root search; a manifest with commands, preferences, tools, `ai.skills` and MCP; a design system instead of free CSS |
| **Obsidian** | Anything: plugins get the `Plugin` lifecycle, `addRibbonIcon`, commands, settings tabs, views, modals, and can inject CSS; themes and CSS snippets restyle the whole app | **Restricted Mode is on by default**, so no third-party code runs until the person turns community plugins on; after that, "Obsidian cannot reliably restrict plugins to specific permissions or access levels … plugins inherit Obsidian's access levels" (DOCUMENTED) — files, network, installing programs. Automated scans and a safety scorecard per version; manual review for popular/flagged plugins; no auto-update | A sample plugin, a dev-vault tutorial, `npm run dev`, a community Hot-Reload plugin; no component kit, no visual check; the docs are Markdown on GitHub |
| **Figma** | A plugin's **main thread** gets the document scene (nodes, pages) but no browser APIs; a UI, if any, is an `iframe` with full HTML/CSS/JS; `manifest.menu` submenus, `relaunchButtons`, `parameters`; CSS variables for theming | The main thread is a **sandboxed JS environment with no DOM, no `fetch`, no timers**, and talks to the iframe by `postMessage`; `networkAccess.allowedDomains` (with `reasoning` shown on the Community page) is enforced and `["none"]` is the safe default; `permissions` for current/active/file users, payments, team library; publishing review | A typed API, a manifest reference, a UI guide, `figma.showUI`, CSS variables and theming docs, a Community publish flow |

### 2.2 What each teaches

- **VS Code: the manifest is the contract, and the host is the warning.** Contribution points
  are a closed vocabulary of *where* a plugin may appear; a plugin can't invent a new place.
  That is the right shape for Ducter's slots. But its extension host has the user's full
  privileges, and its own docs say webviews are resource-heavy and "a poorly designed webview can
  easily feel out of place" — exactly the failure Ducter's kit must prevent.
- **VS Code's newest move is the one to copy:** an extension can contribute `chatSkills` (a
  `SKILL.md`), instructions and prompt files, so the agent experience ships *inside* the
  extension. Ducter should go one step further: the skill is not an add-on, it is the primary
  authoring interface.
- **Raycast: host-drawn UI is the strongest consistency guarantee and the least layout freedom.**
  Its components mean an extension can't break the look, but it also can't make a board with
  columns or a chart. Ducter needs both: a page's layout freedom, and Raycast's "the host draws
  the chrome and the controls". Its `ray develop/lint/publish` loop is the author experience to
  beat — and it is not on the web; it is a local CLI with hot reload.
- **Raycast's confinement is the cautionary half:** a V8 isolate is isolation between
  extensions, not from the person's files or network, and it is documented as such. Ducter's UI
  plugins must not need that disclaimer because they never get a process.
- **Obsidian: the honest failure mode.** "Cannot reliably restrict plugins to specific
  permissions" is what a plugin system looks like when the plugin runs in the app's own renderer.
  Ducter should be able to say the opposite sentence: a UI plugin can read only what its card
  listed, and can't reach the network. Its theme model (CSS snippets and themes that restyle
  everything) is also a warning: a theme is data, and data can still break contrast and identity.
- **Figma: the split Ducter needs, and the consent text it needs.** Figma's main thread has the
  document and no browser; its iframe has the browser and no document; the two talk by message.
  Ducter's host has the Log and the tokens; the frame has HTML and no data except declared reads.
  Figma also shows `networkAccess.reasoning` on the public page and requires it for `["*"]` or
  localhost: a permission is explained where a person can see it. Ducter's connector consent
  should read the same way.

## Part 3: Ducter's extension points as plugin kinds

### 3.1 What exists now

D668 built the first kind: a `ducter-plugin/1` manifest with `kind: "importer"`, literal `reads`,
`starts`, `network: false`, `emits: "ducter-import/1"`, a pinned git commit or folder content
hash, a generated Seatbelt/bubblewrap profile, one consent card in Settings › 导入, a curated
`plugins.json`, and "nobody has checked it" for anything else (VERIFIED, `packages/core/src/
imports/plugins.ts`, `sandbox.ts`, `packages/cli/src/plugin-cmd.ts`). The manifest loader refuses
any kind but `importer` (`only an importer plugin is read now`, VERIFIED).

Ducter also has, in code, the two things a UI plugin needs and does not have to invent:

- a **sandboxed UI with a kit and a bridge**: small apps (D405/D410) are one HTML file in a
  `connect-src 'none'` frame with `APP_KIT_CSS`, `APP_TOKENS`, a `postMessage` bridge on the web
  and a `ducter-app://<id>/` scheme with `POST /bridge` on the Mac (VERIFIED,
  `packages/protocol/src/apps.ts`; `apps/desktop/appwindow.go` `PageOptions{Untrusted: true}`);
- a **per-open capability token** on the web (`/app-frame/<token>`, 30 minutes), an app frame
  with `connect-src 'none'` and an opaque origin (`allow-scripts allow-forms`, no
  `allow-same-origin`), and the client's same-origin guard on the home's writes (VERIFIED,
  `packages/protocol/src/apps.ts`, `packages/core/src/web.ts`).

So the missing piece is not a runtime. It is a **frame host with a narrower capability set**, a
**kit that is mandatory rather than convenient**, and a **check that can see the result**.

**Why an app is not already this.** An app is the partner's one document: it opens in its own
window or sheet, keeps its own data, and can ask the partner; it cannot read Tasks, cannot draw
inside Ducter, and is never installed from a repository (D405/D410). An app is made *for* the
person; a plugin is added *by* the person. They share the frame, the kit and the tokens, not the
trust or the surface. That is why the UI kind is not "apps, again": it is the only way a third
party's view can sit inside Ducter, and the only reason it needs a read API, a pin and a consent
card.

### 3.2 The kinds

| Kind | What it can change | What it can never touch | Boundary | Reviewed / consented | Builds on |
|---|---|---|---|---|---|
| **`theme`** | The token set: colour, type, shape, depth, motion personality, density, light and dark. A figure/art set is a later minor, hand-reviewed. | How a page is arranged, the components themselves, the words, the data. No code, no CSS selectors, no network, no reads. | Pure data (`theme.json`), validated against the full token schema; every pair contrast-checked; applied by both clients from one file. | One card: it changes the look, reads nothing, can't change layout; **换回 Pebble / Back to Pebble** always. Curated versions say Ducter checked them. | `ui.md`'s token sets (Pebble, Volt, Paper, Signal, Midnight), D161, D53, the Mac's `theme.Tokens` and the web's CSS variables |
| **`importer`** | What appears in Past tasks: read-only conversations copied in. | The Log (only the import service writes it), the network, credentials, the UI. | D668's OS sandbox, declared paths, `ducter-import/1` on stdout, one consent card. | D668's card; widening asks again; curated `plugins.json`; **没有人替你检查过** otherwise. | D651/D655/D668 |
| **`ui`** | A page of its own, a section at the foot of Tasks, a panel in an opened task's workbench; its own layout, cards, charts, empty/error states; its own options and a small store. | The shell (bar, rail, traffic lights, composer), the conversation, decision cards, other plugins' frames, Ducter's settings, the Log, the network, files, credentials, the clipboard except through the bridge, opening windows, top navigation. | Static HTML/CSS/JS in an isolated frame: own origin, no Go method bridge on the Mac, `connect-src 'none'`, `frame-ancestors` none, `sandbox="allow-scripts"`; tokens + kit only; a closed read API; no server code, no background. | The card names every slot and every read in literal words, shows a live preview and the check's shots; widening asks again; curated review for the list. | D405/D410's frame, kit and bridge; D161; the Mac's `Untrusted` view; the web's `/app-frame` token; D668's pin/hash/consent |
| **`connector`** | What the partner and tasks can call: an MCP server's tools, through Ducter's one broker. | Consent (the Go gate stays core's), the plugin's own credentials beyond its declared account, the Log, the UI. | The MCP server runs as a process or is reached at a URL; the manifest declares `stdio` command or `http` URL and the hosts it reaches; every outward call still goes through the one gate. | A card: it runs a program / reaches these hosts, its tools use the account you connected, anything outward still asks you. No auto-approve. | `design/connectors.md`, D96, principle 17; the broker's staged write (D659) |
| **`source`** (later) | A to-do source: list, read, and (through core) write back a comment, a close or a tick. | Consent, the Log, the projection, the task lifecycle, the UI. | A plugin would hold a token and write outward; both are what 246 and D668 kept out. Only worth it when a second outside tracker is asked for, and then read-only first. | A card that names every write and when it happens; the Go gate still core's. | `design/task-sources.md`'s `SourceAdapter`, D341 |
| **`channel`** | Nothing. | Everything. | Never. | — | `design/channels.md`'s `Channel` port stays in tree |
| **`harness`** | Nothing. | Everything. | Never. A new agent is an **OAR runtime**, not a Ducter plugin; Ducter only lists it (`HARNESS_IDS` has 10 today). | — | OAR, D637; `packages/protocol/src/{harnesses,harness-facts}.ts`; principle 15 |

Three notes on the table:

1. **`theme` is the only kind with no consent beyond "change the look"**, because it is the only
   kind that cannot read, run or write anything. It is also the only kind whose failure is
   visible immediately and reversible in one tap. That is why it is phase 1.
2. **`ui` has no `network` at all, not even a declared allow-list.** Figma allows declared
   domains; Ducter should not, because a UI plugin's job is to show Ducter's own things, and a
   read API with no network is a closed pipe. A page that needs to fetch a URL is an app, or a
   task, not a UI plugin. This is stricter than magpie and simpler to explain.
3. **`connector` is not "MCP as a plugin".** MCP already is the plugin system for tools
   (principle 17); the `connector` kind is a convenience bundle (manifest + icon + a one-tap
   install + a consent card) around a server that exists anyway. If it disappeared, nothing
   would be impossible; a person would paste a URL in Settings › 账号.

### 3.3 Ranked by value against risk

Value and risk are 1–5, my judgment (INFERRED from the code, the docs and the product's
principles); rank is value ÷ risk, with "never" as its own class. The point of the ratio is not
to bury UI; it is to sequence it behind the two kinds that prove the machinery, while giving it
the most design.

| Rank | Kind | Value | Risk | Why |
|---|---|---|---|---|
| 1 | `theme` | 4 | 1 | Everyone sees it, it is data, it proves install/consent/index/check with no execution. Its worst case is an ugly or low-contrast look, reverted in one tap. |
| 2 | `importer` | 3 | 1.5 | Already built and proven; high value to the person leaving an app, contained by the OS sandbox. Its only open risk is the sandbox's durability (246 §3.14). |
| 3 | `ui` | 5 | 4 | The author's ask and the biggest surface: a custom view of the person's own tasks, in Ducter's style. Risk is style damage, a confusing place, and a read API that grows too far; all contained by the frame, the kit, the three slots and the check. |
| 4 | `connector` | 4 | 3.5 | Huge leverage (any MCP server), but it is a process with network and a credential. The broker's gate is the guard; the plugin adds no authority, only install convenience. |
| 5 | `source` | 2.5 | 4 | Writes outward and holds a token. Only when someone outside asks, and read-only first. |
| — | `channel` | 2 | 5 | Speaks as the partner; a bad one damages the partner itself. Never. |
| — | `harness` | 1 | 5 | Already an OAR runtime; a Ducter plugin would re-implement the adapter layer and run third-party code with the person's agents. Never. |

The sequencing that follows: theme (phase 1) → the web UI host (phase 2) → the Mac host (phase 3)
→ the two other UI slots (phase 4) → the agent experience (phase 5) → connectors and sources on
their triggers.

### 3.4 What is never a plugin

Unchanged from 246 §3.12, plus the new ones this round makes explicit:

- the Log, the projection, the digest and recall;
- the partner, its persona, its tools and the conversation;
- tasks, the runner, body selection and OAR;
- attention, decisions, the Go gate and intents;
- consent and the import validator;
- credentials and the key shelf;
- Mem identity;
- `ducter move`;
- the clients' shell and shared controls;
- anything that writes outward on the person's behalf;
- **a UI plugin's ability to ask the partner, notify, badge, count, or run when closed.**

A plugin may add a surface. It may never become a second voice.

## Part 4: one manifest, one install, one index

### 4.1 The manifest

`ducter-plugin.json` at the repo or folder root, `ducter-plugin/2`. D668's `ducter-plugin/1` is
read forever and mapped in memory (one `kind: importer`); new plugins write v2. A v2 manifest
has exactly one kind object, and only that kind's object is allowed.

```json
{
  "format": "ducter-plugin/2",
  "id": "acme-week-board",
  "kind": "ui",
  "version": "0.3.1",
  "name": { "en": "Week board", "zh": "本周看板" },
  "summary": {
    "en": "Your tasks in columns, one week at a time.",
    "zh": "一周一周地看你的任务。"
  },
  "icon": "icon.svg",
  "author": { "name": "Acme", "url": "https://acme.example" },
  "license": "MIT",
  "repo": "https://github.com/acme/ducter-week-board",
  "ducter": "^0.2",
  "ui": {
    "file": "ui/index.html",
    "slots": ["page", "tasks.section"],
    "reads": ["tasks.list", "projects.list"],
    "languages": ["en", "zh"],
    "options": "options.json"
  },
  "permissions": {
    "files": { "read": [] },
    "exec": [],
    "network": []
  }
}
```

The rules:

- `id` is `^[a-z0-9][a-z0-9-]{1,63}$`, unique across kinds; `version` is semver; `ducter` is a
  caret range of the host; `name`, `summary`, `license`, `author`, `repo` and `icon` are what the
  card, the pane and the docs show. `summary` is one line, ≤ 140 characters, both languages
  required for the curated list (a person's own may have one).
- the kind object sits at the top level and is named for the kind (`theme.file`, `ui.file`,
  `importer.{run,emits,starts,detect}`, `connector.{transport,url|command}`). A file path is
  inside the folder, no symlink out, no absolute path. A kind object that doesn't match `kind`
  is refused (a `theme` field on a `ui` plugin is a manifest error, not an ignored extra).
- `permissions` is **closed**: `files.read` (paths and globs, `~` for the home, importer only),
  `exec` (programs a reader may start), `network` (hosts; only `connector` may have any). A
  `ui` or `theme` plugin with a non-empty `files`, `exec` or `network` is a manifest error, not a
  warning.
- `ui.slots` is a subset of `["page", "tasks.section", "task.panel"]`; `ui.reads` a subset of
  the read vocabulary (`tasks.list`, `projects.list`, `tasks.prs`, `task.facts`); at most one
  `page`.
- `ui.languages` lists the languages the page's own copy has (omitted: `["en"]`); the curated
  list requires `en` and `zh`, and a person's own may have one.
- `ui.options` is a JSON Schema subset (boolean, string, enum, number with min/max, at most 12
  properties) that Ducter draws as shared controls in the plugin's row. A plugin never draws its
  own settings page.
- Unknown keys are refused, not ignored: a typo in `reads` must not silently become no read or
  every read. (D668's loader already drops unknown *fields* in the import format; a manifest is
  different: it is the contract.)

### 4.2 The four kinds' entries

| Kind | Kind object | Permissions it may carry | Files it may ship |
|---|---|---|---|
| `theme` | `"theme": {"file": "theme.json", "art": "art/figure.json"}` (`art` optional) | none | `theme.json`, images/fonts it declares, an optional figure set |
| `ui` | `"ui": {"file": "ui/index.html", "slots": […], "reads": […], "languages": […], "options": "options.json"}` | none | HTML, CSS, JS, images, fonts, the options schema |
| `importer` | `"importer": {"run": ["bun","main.ts"], "emits": "ducter-import/1", "starts": [], "detect": […]}`; `app` names the app it reads (defaults to `name`) | `files.read`, `exec`; `network: []` | the reader's own code and data |
| `connector` | `"connector": {"transport": "http", "url": "https://…"}` or `{"transport":"stdio","command":["bun","server.ts"]}` | `network` (http: the host; stdio: the hosts it may reach); `files.read` for stdio | the server's code, if stdio |

A theme's `theme.json`:

```json
{
  "format": "ducter-theme/1",
  "name": { "en": "Midnight", "zh": "午夜" },
  "tokens": {
    "light": { "bg": "#FFF6EA", "surface": "#FFFFFF", "ink": "#2B2118", "accent": "#FF8A3D", "…": "…" },
    "dark":  { "bg": "#17120E", "surface": "#231C16", "ink": "#F6EBDD", "accent": "#FF8A3D", "…": "…" }
  },
  "motion": { "personality": "calm", "press": 70, "enter": 220 },
  "density": "comfortable"
}
```

Every token in `ui.md`'s schema must be present in both modes; a missing one is an error, not a
fallback (a fallback is how a theme ends up half-Pebble). Contrast is checked on the pairs the
clients actually use (`ink`/`bg`, `ink`/`surface`, `on-accent`/`accent`, `decide` inks, `ok`,
`fail`, `muted`/`bg` at the sizes they are used at); a failure is a `check` failure, not a
warning. `personality` is one of `bouncy | snappy | calm | stepped`, and the durations are
clamped to D290's vocabulary (a theme may not make a press 400 ms). Fonts are files in the
plugin or families the system already has; never a URL.

**Clay art is optional and later.** The brief's "token sets + clay art" is the right long-term
shape (D565's six figures and their poses are an identity), but the art pipeline is hand-curated
and a bad figure is worse than Pebble's. v1 ships tokens only; a `theme.art` set (the six poses,
idle and dark, with the figure's optical size) is a later minor: the check validates sizes,
transparency and the pose names, and a person reviews the renders, exactly as D565's cast was
cast. A theme without `art` keeps the current figure.

### 4.3 Permissions are literal consent lines

The host owns the words; the manifest only picks from a closed vocabulary. The plugin's own
`summary` is shown once, labelled **它自己的说法 / Its own words**, and is never the consent.

| Manifest | The line the person reads |
|---|---|
| `kind: theme` | **它会换掉 Ducter 的颜色、字体、圆角和手感。 / It changes Ducter's colours, type, corners and feel.** |
| | **它不会改每一页怎么排，也不会读你的任何东西。 / It doesn't change how a page is arranged, or read anything of yours.** |
| `ui.slots: ["page"]` | **它会在 Ducter 里加一页「{name}」。 / It adds a page, "{name}", in Ducter.** |
| `ui.slots: ["tasks.section"]` | **它会在「任务」页的末尾加一块。 / It adds a section at the end of Tasks.** |
| `ui.slots: ["task.panel"]` | **它会在打开的任务右边加一块。 / It adds a panel beside an opened task.** |
| `ui.reads: ["tasks.list"]` | **它会读你的任务标题、项目、状态和更新时间，只读。 / It reads your tasks' titles, projects, states and update times, read only.** |
| `ui.reads: ["projects.list"]` | **它会读你的项目名字，只读。 / It reads your project names, read only.** |
| `ui.reads: ["tasks.prs"]` | **它会读你的任务开着的 PR 和 CI 状态，只读。 / It reads the open PR and CI state of your tasks, read only.** |
| `ui.reads: ["task.facts"]` | **它会读打开的那个任务的项目、分支、PR、CI 和改了哪些文件，只读。 / It reads the opened task's project, branch, PR, CI and changed file names, read only.** |
| `ui` (always) | **它不能上网，也不能改你的任务、设置或对话。 / It can't go online or change your tasks, settings or conversation.** |
| `ui` (always) | **它会记着自己的设置，存在 {home} 上。 / It keeps its own settings on {home}.** |
| `importer.files.read` | **它会读：** then each path literally, one line each (D668's card) |
| `importer` (always) | **它不能上网，也不能改那些文件。 / It can't go online or change those files.** |
| `connector` (http) | **它会连到 {host}，把它提供的工具交给{name}。要用你的账号时，会用你连过的那个。 / It reaches {host} and offers its tools to {name}; when it needs your account, it uses the one you connected.** |
| `connector` (stdio) | **它会运行 {program}。 / It runs {program}.** |
| `connector` (always) | **要往外做的事，照旧先问你。 / Anything outward still asks you first.** |
| all | **{author} 做的，不是 Ducter。 / Made by {author}, not Ducter.** |
| all | the check line: **Ducter 查过这个版本 / Ducter checked this version** or **没有人替你检查过 / Nobody has checked it for you** |

Two rules about the card:

1. **A line is one fact, its own element** (D291). A card that says "it may read your tasks and
   projects" is a sentence; two lines are facts. The person can point at the one that worries
   them.
2. **A widening asks again; a narrowing doesn't.** The consented set is stored per plugin; a run
   or an open needs the current set covered by it. An update that adds a slot, a read, a host or
   a path puts the card back before anything new happens. D668's `needsConsent` is the same
   mechanism, extended to slots and reads.

### 4.4 Install, sources, curation

- **Install:** `ducter plugin add <id | git-url[#ref] | ./folder>`; a folder loads where the
  author keeps it and is never deleted by Ducter; a git install is copied to
  `<dataDir>/plugins/<id>` and pinned to a commit; every file's path and bytes are hashed, and
  the hash is checked before every open or run. Nothing is executed at install time. The one
  ledger becomes `plugins.json`, with `import-plugins.json` read once at startup and copied into
  it (the old file is left untouched, so a downgrade still finds its readers).
- **Ducter's list:** `github.com/wey-gu/ducter-plugins` with:
  - `index.json`: `{format: "ducter-plugins/1", updated, plugins: [{id, kind, repo, commit,
    version, name, summary, author, check: {at, host, ducter, sha256}}], withdrawn: [{id, why,
    at}]}`;
  - one PR per entry, with the author's check output and shots attached to the PR (not the
    index — D75 keeps binaries out of git);
  - a built-in copy of the last index in the binary, so the list works offline (magpie's
    `market.json` pattern).
- **A person's own index:** `ducter plugin source add <url>` where the URL returns the same
  `ducter-plugins/1` shape; `source list/remove`. Entries from it are marked **{source} 的列表 /
  From {source}'s list** and never **Ducter 查过这个版本**, unless the official index carries the
  same `id` at the same `commit` and hash. A source is a convenience, not a trust upgrade.
- **Discovery:** `ducter plugin search <words>` across the installed indexes, and the pane's
  **浏览 / Browse** by kind (外观, 页面, 导入, 连接). `ducter://plugin?id=…` opens a plugin's sheet
  and installs nothing (magpie's rule, kept).
- **No npm in v2.** Git and folders are enough for four kinds, and npm adds install scripts and
  a second registry's trust. A theme can be a git repo with one JSON file. (If the ecosystem
  asks, npm can be a later minor with install scripts never run.)
- **No signing.** The trust chain is the pinned commit, the content hash, the curated list and
  the frame/sandbox. That is honest for a self-hosted personal AI; a signature would add a key
  management problem without a revocation story.

### 4.5 Updates and removal

- **Update:** the row says **有新版本 / Update**; one tap; the same pin/hash rules. A widened
  read/slot/host set puts the consent card back. A git plugin compares its pinned commit with
  the ref's head at most hourly, and only while the pane is open or a run starts (D668's rule).
- **Removal:** a theme reverts to Pebble; a UI plugin's page, section and panel go, and its
  store is deleted after saying so; a connector is disconnected (the account stays in the
  broker until the person disconnects it there); an importer hides what it brought in (D655).
  Removing a source deletes its folder and ledger; an author's folder is left where it is.
- **Off means off:** a switched-off plugin isn't loaded, isn't read, isn't counted, and doesn't
  appear in ⌘K. A UI plugin's store and consent stay until removal, so switching it back on
  doesn't ask again for the same permissions.

### 4.6 The word

D651's rule — "never 'plugin' on screen; the word lives only in the CLI and developer docs" —
was right for imports: the person is bringing their history in, and the mechanism is irrelevant.
It is wrong for a person consenting to code that draws their screens. Two different moments:

- **A result is delivered** (an import offer, an app the partner made, a theme chosen from a
  list): never say plugin. The words are **带进来**, **做好了**, **用它**.
- **Code is added** (a URL, a folder, a consent card, an update, a removal): say **插件 /
  Plugins**, and say whose it is. The Settings pane, the card and `ducter plugin` are the only
  places. The pane's lede: **插件给 Ducter 添上别人做的东西：一套外观、一个页面、一个来源。它们只能在你允许的范围内做事。 /
  Plugins add things other people made to Ducter: a look, a page, a source. They can only do what you allow.**
  The pane lists what adds something to the app (**外观**, **页面**, **连接**); an importer keeps
  its row in **导入**, where it acts, and both read the same ledger. One mechanism, two doors,
  each by the job.

This supersedes D651's absolute sentence (not its import flow) and owes a glossary entry and a
`product-model.md` row. The alternative — call the pane **外观和页面 / Look and pages** and never
say plugin — hides the one fact a person needs at consent time: someone else wrote this. I would
not take it.

## Part 5: UI plugins in detail

### 5.1 The surfaces and slots

Three slots, closed. No fourth in v1.

| Slot | Where it is | The frame around it | Its size | What it can draw |
|---|---|---|---|---|
| `page` | A layer over the current place, with its own title and a back; reached by ⌘K, the Settings row, and `#plugin=<id>` on the web (the Mac's ⌘K and the pane) | Ducter's bar (title, back, ⋯), the paper, the edges | the content area, 320–1400; the plugin chooses its own measure (a 720 reading column or a 1200 board) | anything inside: its own grid, cards, charts, lists, empty/error/first states |
| `tasks.section` | The foot of 任务 / Tasks, under a hairline and its own section head, after Ducter's groups | Ducter's section head (`secHead`), a collapse, the paper | full width, 220–420 tall, collapsible; scrolls inside | a band: a week's columns, a small board, a chart, a list of what it thinks matters |
| `task.panel` | The opened task's workbench, as one more panel beside Changes / Files / Preview (D214) | the workbench's panel chrome, its tab, its width | the panel's width (320–420), full height | a PR's checks, a review checklist, a diff summary, a domain view of the task |

Why these three, and not the others the brief lists:

- **A card renderer in the conversation: no.** The conversation is the partner's voice; a
  plugin's card there would be a second voice and would compete with decision cards. A plugin
  that wants to show something in the conversation can open a task, or the partner can make an
  app.
- **A Settings page: no.** Settings is where the person configures trust; a third-party frame
  there can imitate Ducter's own controls. A plugin's options are a schema-drawn form in its
  row, with the shared controls.
- **A home tile: no, not in v1.** A tile is presence; it competes with On hand and with 你的小应用,
  and it turns "installed" into "always in front of me". ⌘K plus the pane is enough for a page
  used daily; a `tasks.section` is where the job lives if it is about tasks.
- **A place on the bar: no.** The five places are the product's information architecture (对话,
  任务, 设备, 伙伴, 设置). A plugin gets a surface, not a place. On the web, `#plugin=<id>` is a
  layer, not a route that changes the bars.
- **Replacing a core surface: never.** Unlike magpie's `replaces` (a plugin can take Sessions,
  Library, Routing or Usage), a Ducter plugin cannot replace Tasks, the conversation, an opened
  task, Settings or any of the five places. A surface is added beside or inside; the core screens
  are the product.

### 5.2 A page's anatomy

The plugin ships one HTML file and whatever CSS/JS/images/fonts it needs, all inside its folder:

```html
<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="board.css">
  <script src="bridge.js" defer></script>
  <script src="board.js" defer></script>
</head>
<body class="dk-app">
  <div class="dk-sum">
    <div class="dk-sum-label">本周</div>
    <div class="dk-sum-value">12 件事</div>
    <div class="dk-sum-sub">3 件在等你</div>
  </div>
  <div class="dk-board" id="board"></div>
</body>
</html>
```

- `bridge.js` is the host's, served under the frame's token, never vendored by the plugin; it
  sets `--d-*` from the active theme, `data-theme`, `lang`, `data-reduced-motion` and
  `data-text-scale`, and exposes `ducter.ready`, `ducter.tasks()`, `ducter.projects()`,
  `ducter.task()`, `ducter.options()`, `ducter.setOption()`, `ducter.store.get/set`,
  `ducter.openTask(id)`, `ducter.resize()` (panels), `ducter.onChange(fn)`.
- The document has no inline `<script>` (the CSP allows files only), no `on*=` handlers, no
  `fetch`, no `<form>`, no `<select>`, no `type="number"`, no `window.open`, no `localStorage`.
  What it wants, it asks the bridge.
- The host draws the bar: the plugin's icon and name, the back, the ⋯ (its options, remove). The
  page never draws a title bar, a traffic light, a Ducter wordmark or a fake settings page.
- The page's first paint says something even with no data: the kit's `dk-sum` with a
  `dk-none` word, `dk-empty` with one calm line, or a skeleton in the kit's clay. A blank frame
  is a failure of the check (`first-paint`).

### 5.3 The bridge

| Call | What it gives | What it refuses |
|---|---|---|
| `await ducter.ready` | `{dark, lang, reducedMotion, textScale, tokens}`, and `ducter.surface` (`page` / `tasks.section` / `task.panel`) so one document can serve all three | — |
| `ducter.tasks()` | `[{id, title, project, projectKey, state, updatedAt}]`, only with `tasks.list`; `projectKey` is opaque (group by it, show `project`) | the transcript, the report, the place, the harness, the person |
| `ducter.projects()` | `[{key, name}]`, only with `projects.list` | members, repositories, paths |
| `ducter.prs()` | `[{taskId, repo, number, state, ci}]`, only with `tasks.prs` | diffs, comments, checks' logs |
| `ducter.task()` | the opened task's `{id, title, project, repo, branch, pr, ci, files}`, only with `task.facts` | file contents, the brief, the transcript |
| `ducter.options()` / `setOption(k, v)` | its own options, validated by its schema, one write a second | another plugin's options, anything outside the schema |
| `ducter.store.get/set(k, v)` | its own namespaced store on the home, 256 KB, JSON | the Log, another plugin's store, the person's files |
| `ducter.openTask(id)` | opens that task in Ducter (the person's own view) | anything else; no navigation, no write, no ask |
| `ducter.resize()` | tells a panel its height (≤ 2400) | — |
| `ducter.onChange(fn)` | data changed while the page is open | a push while it is closed |

There is no `ask`, no `send`, no `open(url)`, no `copy`. If a plugin needs those, it is an app
or a task. A URL in the page is text, not a link the frame can open; the host may offer
`openExternal` later, with the URL shown first, as its own consent.

The reads are served by the home from a **versioned DTO**, not `TaskCard`:

```json
{ "v": 1, "tasks": [
  { "id": "t_8f2a", "title": "Fix the flaky WAL test", "project": "hawdb",
    "projectKey": "github.com/acme/hawdb", "state": "waiting",
    "updatedAt": "2026-11-28T03:11:00Z" }
] }
```

The PR read is its own shape:

```json
{ "v": 1, "prs": [
  { "taskId": "t_8f2a", "repo": "acme/hawdb", "number": 41,
    "state": "open", "ci": "passing" }
] }
```

A `v` bump is a new shape; an old plugin that asked for `v1` keeps getting it while the host can
build it. That is the same promise D651 made for `ducter-import/1`: a plugin never tracks
Ducter's internals.

### 5.4 The kit and the shared controls

Ducter's rule is **only shared controls** (D161): a view never styles a button, switch, chip or
row of its own. A plugin runs in another engine and cannot import `controls.tsx` or `views/
components.go`, so the kit is a **faithful copy, generated and tested**, not a second design:

- `dk-btn` (primary, secondary, accent, text), `dk-switch`, `dk-field`, `dk-num`, `dk-select`,
  `dk-seg`, `dk-chip`, `dk-tag`, `dk-card`, `dk-row`, `dk-sum`, `dk-list`, `dk-menu`, `dk-fold`,
  `dk-empty`, `dk-facts`, `dk-bar`, `dk-chevr`.
- Each maps 1:1 to a D161 row; sizes, radii, ledges, shadows and motion come from the same token
  table, and a test holds the kit's values to the clients' (the way `TestTintBasesAreAppCSS`
  holds the Mac's tints to `app.css`).
- The kit is served by the host, versioned (`kit: "1"`), and cached; a fix reaches every plugin.
  A plugin may not vendor it (the check refuses a second copy) and may not restyle it.
- A plugin's own CSS is **layout only**: grid, flex, widths, order, spacing in `S1…S7` tokens,
  breakpoints. The check refuses a colour, font-family, font-size, radius, shadow or duration
  outside `var(--d-*)` and the type scale. Charts may use `var(--d-*)` and `color-mix` of them.
- The result: an unstyled plugin already looks like Ducter (the kit's defaults), and a styled one
  looks like Ducter with a different arrangement. The freedom is in the arrangement, not in a new
  visual language; that is the trade the UI bar demands. Free HTML with no kit (magpie's way) is
  more expressive and is rejected because a second style inside Ducter is a product bug, not a
  feature.

### 5.5 Layout freedom against the UI bar

The sentence to hold: **the frame owns the chrome; the plugin owns the arrangement.**

| The frame owns | The plugin owns |
|---|---|
| the bar, title, back, ⋯, the traffic lights, the window's edges, the pane's chrome | its page's columns, cards, charts, lists, folds, reading measure, scroll |
| the theme (tokens, dark/light, reduced motion, text scale) | how its content reflows at 320, 390, 768, 1180, 1400 |
| the language (`lang`, `dir`), the fonts' URLs | its zh/en copy, its own numbers and words |
| the data it may read | the empty, first, error and loading states of what it shows |
| the motion vocabulary's tokens | where and when it moves (press, enter), never a new duration |
| focus order into and out of the frame | focus order inside it, every control reachable |

The UI bar applies, and `check` is how it is walked:

- **both themes**: 8 shots (390 and 1180 × light/dark × zh/en) plus 320 and 1400; every colour
  from a token, so a theme pack restyles the plugin for free;
- **zh/en at real lengths**: no clipping (`scrollWidth <= clientWidth` for text), no CJK one
  character per line, no Latin-only string in a zh page (the plugin declares both languages; a
  missing one is a check failure for the curated list, a warning for a person's own);
- **320–1400**: no horizontal scroll at 320; the page's measure at 1400; a `tasks.section` never
  taller than 420; a `task.panel` never wider than the workbench;
- **motion**: no movement under reduced motion (the host sets `data-reduced-motion` and
  `prefers-reduced-motion`), durations only from tokens, no looping animation while idle (a
  status may breathe, a page may not);
- **a11y**: axe-core's rules (contrast, names, roles, labels, focus), a visible focus ring on
  every control, Tab order, 44-px targets at 390, 200 % text with no clipping, one `h1`, a
  `lang`, a title;
- **the kit**: every interactive control is a `dk-*`; no `<select>`, `type=number`, `alert`,
  `confirm`, `prompt`, `window.open`, `localStorage`, `fetch`, `XMLHttpRequest`, `WebSocket`,
  `eval`, `new Function`, inline script, inline handler, password field, or external URL in
  `src`/`url()`/`@import`;
- **the first and worst states**: with no data, the page says what will be there; with a failed
  read, it says so in one line and keeps its shape (the check injects both).

The bar's judgment (does it feel like Ducter? is the arrangement good?) stays with the curator
for the list and with the person for their own; the check only removes the mechanical failures.
That is the same split as the rest of the product: code guards invariants, the model/person
judges meaning (principle 21).

### 5.6 `ducter plugin check` for UI

```
$ ducter plugin check ./week-board
ducter-plugin/2  acme-week-board 0.3.1  ui
  manifest      ok   2 slots, 2 reads, 0 errors
  files         ok   18 files, 240 KB, no symlinks
  frame         ok   no network, no inline script, no password, no top navigation
  kit           ok   9 controls, no system control
  tokens        ok   0 colours, 0 fonts, 3 durations, all var(--d-*)
  layout        390 / 1180 / 320 / 1400   ok
  themes        light / dark                ok
  languages     zh / en                     ok
  a11y          14 rules, 0 violations       ok
  first/error   ok
  shots         .shots/plugin-acme-week-board/{390,1180}-{light,dark}-{zh,en}.png
  0 things to fix
```

- It serves the plugin's folder under a frame token, injects the kit and the active Pebble
  tokens, and drives the page with a fixture home (12 tasks, 3 projects, one waiting, one with a
  PR) — never the person's real data, unless they pass `--with-data` and a home.
- It renders in headless Chrome on every platform (the browser Ducter already finds for its own
  browsing; with none, it says so and the manifest/frame checks still run), and on macOS also in a
  WKWebView harness (the Mac's engine), because a plugin that passes Chrome can still break
  WebKit. The Mac harness is a small Go program beside the view tests; the curated list's review
  needs a Mac shot until it exists.
- `--json` prints `{ok, plugin:{id, kind, version}, checks:[{id, ok, detail, file?, line?, shot?}],
  shots:[…], summary}`; the agent reads it, the person reads the lines.
- Exit codes: 0 all pass; 1 a failure; 2 a manifest/folder error (nothing rendered).
- `--shots <dir>` moves the shots (default `.shots/plugin-<id>/`, gitignored); `--strict` turns
  warnings into failures (the curated list uses it).

The check is the same code the host runs on load (manifest, files, frame policy, read set), so a
green check is not a separate opinion: it is the host's own gate, plus the visual and a11y
checks.

### 5.7 The Mac app and the web

The Mac app is native (MyGo); a plugin cannot be a native view without a Go plugin ABI, which
would bind plugins to Ducter's internals and give them the app's own process. So the Mac hosts
the same HTML in a `WKWebView`:

| | Web and phone | Mac |
|---|---|---|
| Frame | `<iframe sandbox="allow-scripts" src="/plugin-frame/<token>">` on the web's own origin path, with the small-app CSP (D405/D410) | a `WKWebView` with MyGo's `Untrusted` page options (no Go methods, no other origin, no window, no download) on `ducter-plugin://<id>/` |
| Files | served by the home at `/plugin-frame/<token>/…`, token per open (30 min), one plugin per token | served by Go from the plugin's folder on the plugin's own scheme; no home token in the URL |
| Bridge | `postMessage` to the parent, answered by the web client, which asks the home over its socket | `POST /bridge` and `GET /events` on the plugin's scheme, carried by the app's socket to the home (the apps' pattern, D405) |
| Chrome | the web client's bar and back | native: the same bar as a task page, the traffic lights untouched, the web view below; a `tasks.section` is a web-view band inside the native Tasks page, a `task.panel` one inside the workbench |
| Theme | `--d-*` CSS variables from `app.css`, `data-theme`, cross-fade 360 ms | `theme.Tokens` from Go, injected as `--d-*`, a theme message on change |
| Fonts | the web's own font files served to the frame under its token | the app's bundled fonts served on the plugin's scheme, or the system fallback |
| Reads | the web client asks the home's `plugin_read` over the socket | the same, from Go, then handed to the frame |
| Failure | the frame is replaced by the boundary card | the same, drawn natively around the web view |

What this buys: **one document, three hosts** (web, phone, Mac), no second implementation, and
the Mac's plugin page is still Ducter's window — ⌘W, Esc, the window's place and the traffic
lights are the app's, not the page's. The app's own theme switch reaches the frame as a message,
so a dark-mode switch cross-fades the plugin with the app (D302).

What it costs: the Mac check must run WebKit (5.6), the fonts must be served on the scheme, and
the app's `Untrusted` view must be proven to refuse a plugin's attempt to reach another plugin's
scheme or the app's own (the apps' tests already do this for `ducter-app://`; the plugin scheme
gets the same tests).

### 5.8 Failure, attention, and what a UI plugin never does

- **Failure is local.** A page that throws, misses `ducter.ready` in 10 s, or fails a read is
  replaced in place by **这个页面停下来了 / This page stopped working** with **再试一次 / Try
  again**; the rest of Ducter is untouched. A `tasks.section` that fails collapses to its head
  with the same line; a `task.panel` says it in the panel. The plugin's console goes to the
  window's console and to `check` / `dev`, never to the conversation.
- **Attention:** no notification, no badge, no count, no needs-you, no card, no conversation
  line, no auto-open, no sound, no menu-bar item, no Dock icon, no background. A plugin is only
  there when the person opens it or looks at the surface it was installed on. It cannot wake the
  partner or a task.
- **It never draws:** a Go/No card, a decision, a message bubble, a task card's own row, a
  settings row, a menu of Ducter's, a system dialog, a title bar, a toast. It draws inside its
  frame, with the kit.
- **It never asks for a credential.** A password field is a check failure and a curated-list
  rejection; the frame has no form action and no network, so a credential typed there would go
  nowhere — which is exactly why a fake one is a phishing attempt.
- **It never becomes a second voice.** No `ask`, no `send`, no partner text. If its job needs
  the partner, it opens a task (`openTask`), and the person sees the task as any other.

## Part 6: the agent experience

### 6.1 The shipped skill

`skills/ducter-plugin/SKILL.md` at the repo root, published by `apps/site/scripts/skills.mjs`
(which already copies every `skills/<name>/` with a `SKILL.md`) at
[https://ducter.ai/skills/ducter-plugin/SKILL.md](https://ducter.ai/skills/ducter-plugin/SKILL.md), listed in `docs/for-agents.md` and `llms.txt`.
The skill is short enough to load every time and complete enough to finish:

```
---
name: ducter-plugin
description: Build, check and install a Ducter plugin: a look (theme), a page or panel in
  Ducter's own UI, a reader that brings another app's history in, or a connector for an MCP
  server. Use when the user asks for a plugin, a custom view or layout in Ducter, a theme, or
  to bring another app's data in.
---

# Ducter plugin

A plugin adds one thing to Ducter and may change only what its kind allows.
`ducter plugin add` stages it; never turn one on without the person's yes. Never add a network, a read or a file they didn't ask for.

## 1. Pick the kind (one table)
| They said | Kind | It gets |
| "a look / colours / a theme" | theme | a token set; no code, no reads |
| "a page / a board / show my tasks like this" | ui | page, Tasks section, or task panel; tokens + kit; reads tasks/projects, no network |
| "bring my X history in" | importer | read-only past tasks; OS sandbox |
| "use this MCP server" | connector | tools through Ducter's gate |

## 2. Make it
ducter plugin new ui ./week-board
# edit ducter-plugin.json and ui/index.html, ui/board.css, ui/board.js
# draw only with the kit (dk-*) and tokens (var(--d-*)); both languages; 320–1400

## 3. Check it (the bar, mechanically)
ducter plugin check ./week-board --json
# fix every "ok": false; read the shot paths; repeat until 0 things to fix

## 4. See it live
ducter plugin dev ./week-board
# it reloads the open page in the running Ducter; errors print here

## 5. Install it (the person's tap, not yours)
ducter plugin add ./week-board
# then tell them: 在 Ducter 的「设置 › 插件」里点「装上」。
# Never pass --yes. Never install because they said "sounds good" about something else.

## 6. Per kind
- theme: theme.json, every token, both modes, contrast
- ui: slots, reads, the kit, the three sizes, first/error states
- importer: print ducter-import/1; reads/starts; no network
- connector: the server's URL or command; the hosts it needs

## 7. If a check cannot pass
Say which check and why, and stop. Do not ship around it, do not add a colour, do not widen a read.
```

Alongside it: `examples/theme/midnight/`, `examples/ui/week-board/`, `examples/importer/acme/`,
`examples/connector/acme-mcp/` — the exact output of `new`, so the skill can point at a file that
passes. A worked example per kind:

| Example | What it is | The one thing to copy |
|---|---|---|
| `theme/midnight` | a `theme.json` with all tokens, both modes, no code | every token filled; contrast checked; no colour in the wrong mode |
| `ui/week-board` | a `tasks.section` page: columns by project, a filter, a task opens | `dk-*` + `var(--d-*)`, both languages, an empty state, 320–1400 |
| `importer/acme` | a 40-line reader that prints `ducter-import/1` from a fake store | `source` once, `thread`/`msg`, `end` with counts; no network |
| `connector/acme-mcp` | a manifest for an HTTP MCP server, one tool | the URL, the hosts, and that a write waits for the person's Go |

The skill's last section is a list of what Ducter will refuse, so the agent doesn't learn it by
failing: no network in UI, no colours, no system controls, no reading the Log, no writing
outward, no second voice, no background.

### 6.2 `new` / `check` / `dev`

- **`ducter plugin new <theme|ui|importer|connector> <dir>`** writes a complete, passing plugin:
  the manifest, the entry, an icon, a `README.md`, and for UI a page that uses `dk-sum`,
  `dk-card`, `dk-row`, a filter, both languages and an empty state. CI runs `new` + `check` for
  theme, UI and importer; if a scaffold doesn't pass, the build fails. That is the "golden path"
  guarantee. The connector scaffold is a manifest and a README (its handshake needs a server).
- **`ducter plugin check [dir] [--json] [--strict] [--shots <dir>]`** is 5.6 (UI), plus:
  - theme: token completeness, contrast pairs, motion bounds, a render of the actual clients
    with the theme applied (the web at 390/1180, the Mac's test renderer), and a diff of the
    default Pebble render to catch a token that changes nothing;
  - importer: manifest, the sandbox profile's text, a dry run with a fixture (or `--with-data`),
    `ducter-import/1` validation, and the denials (an undeclared read, a socket, a write outside
    tmp) on macOS and Linux; where the sandbox can't run, it fails closed, as D668 does;
  - connector: the manifest, the declared hosts and the command/URL; with `--connect`, a
    `tools/list` handshake in the OS sandbox with no credentials, a 10 s timeout, each tool's
    schema validated and a write marked as needing the Go gate. A scaffold's check is the
    manifest alone, because a handshake needs the author's server.
- **`ducter plugin dev [dir]`** registers the folder as a transient dev plugin against the
  running home (never persisted, never counted, never in the Log), watches files, re-runs the
  manifest/frame checks, hot-reloads the open page or panel (a page reload; a theme applies
  live), and prints the frame's console errors, failed reads and the check's last result. It
  refuses importers and connectors (they need the OS sandbox / a process; use `check` and
  `ducter import --check`). A dev plugin is on only while the command runs; `Ctrl-C` removes it.

The three commands are the whole author loop, and each is also an agent loop: `new` gives a
passing baseline, `check` gives a machine-readable verdict, `dev` gives a live page.

### 6.3 One conversation, start to installed

The person (a heavy developer, or a consumer who has learned the word) says:

> 「在任务页加一个按周分的看板，按项目分栏，点一个任务就打开它。中文英文都要。」

Their agent (Claude Code, Codex, or another) has the skill from
[https://ducter.ai/skills/ducter-plugin/SKILL.md](https://ducter.ai/skills/ducter-plugin/SKILL.md) (or a copy in `~/.claude/skills/`). It:

1. picks `ui` + `tasks.section`, and says so in one line;
2. runs `ducter plugin new ui ./week-board`;
3. writes the board with `dk-*` and `var(--d-*)`, both languages, a 320 layout;
4. runs `ducter plugin check ./week-board --json`; the first run fails three checks: a
   hard-coded `#fff`, a 320 overflow, a missing zh string. It fixes each and runs again: 0;
5. runs `ducter plugin dev ./week-board` against the running home, opens the page, sees the
   console clean, and shows the person a shot;
6. asks: **「装上了就能在任务页看到。要我现在装吗？」** The person says **装**;
7. runs `ducter plugin add ./week-board`. The home stages it (the files are copied; nothing is
   turned on); the person's Ducter shows the card
   (the slot, the reads, the author, the check line) with **装上 / Install** and **先不 / Not
   now**. They tap **装上**; the section is there, and ⌘K finds the page.
8. The agent says one line and stops. It never passes `--yes`, never installs on its own, never
   widens a read.

The whole loop is one conversation, and the person's tap is still the only consent. If the
person says "just install it" before seeing the card, the agent still stops at the card: the
install is theirs.

### 6.4 Ducter's own partner

The partner already makes apps in the turn with the `app` tool (D405/D410): one HTML document,
seconds, a card. A plugin is different: files on the home, a manifest, a check, a pin, a
consent. The recommendation:

- **No new partner tool in v1.** A `plugin` tool would put a plugin's code in the partner's turn
  with no folder to keep it in, no `check`, and no pin. The app tool's one-document shape does
  not fit it.
- **The partner hands it to a task.** When the person asks for a view of Ducter's own things
  ("a board of my tasks by week", "my PRs beside the task"), the partner says one line: **这个做成
  插件更合适：装在 Ducter 里，和任务放一起。我让一个任务去做，做好了你点一下装上。 / This fits a plugin
  better: it lives in Ducter, beside your tasks. I'll have a task make it; you install it with one
  tap.** It opens a task whose brief carries the skill file (written into the task's folder) and
  the person's words. The task writes the plugin, runs `check`, and its report carries the card:
  the plugin's name, the check summary, two shots, **装上 / Install** and **先不 / Not now**.
  The person's tap installs it. No `plugin` tool and no new permission. (The one persona line
  below does owe the D175 eval.)
- **It runs on the home.** A plugin lives on the home and draws every client; a task on a worker
  would leave its files there. The partner says so in one line if the home is asleep, and the
  install copies the folder into the home's plugin folder rather than loading a task's working
  copy (which `ducter worktrees` may tidy, D514).
- **The rule for "app or plugin":** a thing the person keeps and writes into (expenses, feeds,
  a trip) is an **app**; a different view of something Ducter already has (tasks, a task's PRs,
  projects) is a **plugin page/panel**. The partner says which and why in one line, and defaults
  to the app when it is unclear, because apps are safer and already work.
- **The persona owes one line** for that rule, and the D175 eval that goes with any persona or
  tool-text change. It can land with phase 5, after the UI host is real.

The alternative — a `plugin` tool that writes a plugin in the turn, like `app` — is tempting for
speed but wrong for trust: a plugin is installed code, and the person should meet a check and a
card, not a fait accompli. Apps are documents; plugins are additions.

### 6.5 Docs, `llms.txt`, and the reference

- **`docs/plugins.md`** (people, `title: Plugins`, `order:` after Import): what a plugin is, the
  four kinds, how to add one (an id, a URL, a folder), the consent card, what it can read, how
  to update and remove it, what it can never do, and one section **「让我的 agent 给我做一个」 /
  "Have my agent make one"** with the one sentence and the skill URL. No decision numbers, no
  internal names; a kind that isn't built says **coming soon** in the docs' own way.
- **`docs/for-agents.md`** gains a row for `ducter-plugin` beside deploy/operate/troubleshoot,
  and a sentence: "A plugin is the only Ducter extension that draws UI; ask the person before
  installing one."
- **`llms.txt`**: one line under the docs groups, and a new short section:
  `## Make a plugin` → `- [ducter-plugin skill](https://ducter.ai/skills/ducter-plugin/SKILL.md):
  build, check and install a theme, a page/panel, a reader or a connector.` Plus:
  `- [Manifest schema](https://ducter.ai/plugins/manifest.schema.json)` and
  `- [Ducter's plugin list](https://ducter.ai/plugins/index.json)`.
- **Machine-readable:** `/plugins/manifest.schema.json` generated from the TypeScript types at
  build time (never hand-written twice), `/plugins/index.json` a mirror of the curated index,
  and `/plugins/check.schema.json` for `check --json`. An agent can fetch the schema, validate
  its manifest before running anything, and read the same index the app reads.
- **The agent-facing reference is the skill, not a second docs site.** The skill links to the
  schema and to `docs/plugins.md`; the docs link to the skill. One source each, no drift.

## Part 7: against the principles

Three ways this could hurt, before the table:

- **Security.** The new code is the frame host and the read API. A UI plugin is static, has no
  network and no process, and reads only what its card listed, so the blast radius is what it can
  display — but a lock bug in the host is the whole risk, and the Mac's WebKit is a second
  implementation of that lock. The importer and the connector are the riskier kinds and stay
  behind D668's sandbox and the broker's gate; UI must not become the way those get a process.
- **The one consistent style.** A plugin page is the first place someone else's layout sits
  inside Ducter. The kit and the tokens are the guard; the frame keeps it off the core screens;
  the check is the mechanical bar; the curated review is the taste. A bad plugin page looks bad
  only when the person opens it, never in the conversation, Tasks' rows or Settings.
- **Attention.** Every plugin would like a badge, a notification, a home tile, a line in the
  conversation. None is allowed. The cost is real: a plugin that would be more useful with a
  nudge cannot have one. That is the price of one partner's voice and a quiet surface.

### 7.1 The table

| Principle | How this holds it |
|---|---|
| 1 The Log is the truth | A plugin never writes the Log. An importer's records go through the one service (D651); a UI plugin reads a DTO derived from the projection; a connector's effects are events by core. Removing a plugin leaves the Log whole. |
| 2 Projection layered by change | The plugin API is a small versioned read DTO, never the Log's bodies. A UI plugin sees `tasks.list` / `tasks.prs` / `task.facts`, not the transcript, the brief or the persona. |
| 7 Attention is scarce | A plugin never pushes, badges, counts, notifies, auto-opens or speaks in the conversation. It is there when the person looks. An install is the person's tap; an offer is never made by a plugin. |
| 15 Thin adapters, declared capabilities | The manifest declares slots, reads, files, exec and hosts; the host enforces each. A missing capability costs a plugin its feature, never the app's correctness. |
| 17 Identity is user data; provenance | A UI plugin can't touch Mem, the persona or the partner's words. A connector uses the person's own account through the broker, with provenance. The partner never signs a plugin's words as its own. |
| 18 Scope the credentials, gate the effects, honest isolation | No credential reaches a plugin. A UI plugin has no network and no process; an importer runs in an OS sandbox or not at all; a connector's writes still wait for the Go gate. The pane says which isolation a computer can give. |
| 19 The control plane holds state | The home holds the plugin ledger, the index cache, the read DTO and the frame capability (a per-open token on the web, a scheme on the Mac); a client only draws. A phone opens the same page from the same home. |
| 20 Simple surface, full depth | Three slots, one pane, one word; a plugin is opened where its job lives. No new place on the bar, no new object in the model. |
| 21 The model judges, code guards | The check guards invariants (tokens, contrast, dimensions, reads, frame policy); the curator and the person judge taste and usefulness. The install is a person's Go, never code's inference. |

### 7.2 The rules that keep it safe

1. **No process for UI.** A UI plugin is static files; a page-only plugin never starts anything.
   This is the single largest safety property, and it is worth losing features for.
2. **No network, ever, for UI and themes.** Not a declared allow-list. A page that needs the
   internet is an app or a task.
3. **A closed read vocabulary, served by the host.** No Log, no transcript, no files, no
   credentials, no other plugin's data. A new read is a new consent line and a new review.
4. **Only the person installs.** The CLI stages; the card asks; the tap installs. An agent can
   run every command except the person's yes.
5. **Pinned and hashed, never auto-updated.** A changed folder doesn't open. A widened read asks
   again. A withdrawn plugin is refused for new installs.
6. **The kit is mandatory and generated.** No second design system; no hard-coded colour, font
   or control. A theme changes tokens, not CSS.
7. **The frame owns the chrome.** A plugin never draws a title bar, a settings row, a decision, a
   message, a menu of Ducter's, or a credential field.
8. **Failure is local and honest.** One page, one panel, one section; "stopped working" with Try
   again; the console for the author, never the conversation for the person.
9. **The curated list is a person's review, not a scanner.** The check is mechanical; the list's
   "Ducter checked this version" means a person looked at the shots and the code. Everything else
   says **没有人替你检查过**.
10. **Every new slot is a UI bar liability.** A slot is added only with a check, a consent line,
    both clients, and a real plugin that needs it. Three is enough.

### 7.3 Where the evidence is thin

- **Demand for UI plugins.** One author's ask and one issue (#261) for importers. No count of
  people who want a custom view. (INFERRED from the product's own use; the author is a heavy
  developer who already asked for apps and PR views.)
- **Whether a third-party ecosystem will exist.** magpie's grew because OpenCode plugins already
  ran unchanged; Ducter has no such base. The four kinds and the skill are a bet that agents
  lower the cost of writing one to a conversation.
- **The Mac's WebKit vs Chrome.** A page can pass `check` in Chrome and break in WKWebView. The
  plan adds a WKWebView harness, but its coverage (fonts, scheme, CSP, `postMessage`) is not
  proven here.
- **The kit's fidelity.** A generated copy can drift from the real controls. The test that holds
  it to the token table and to both clients is the guard; it does not exist yet.
- **Sandbox durability** (246 §3.14) still applies to importers; UI plugins don't depend on it,
  which is another reason they are the safer kind to grow.
- **The word.** "插件" on screen is a change to D651's rule; the alternatives (外观和页面, 扩展)
  are untested with people. A comprehension test with the three people is owed before the pane
  ships.

## Part 8: the plan

Each phase is 1–2 days with fakes. No phase needs a real third-party plugin; each ships with a
fixture and a demo.

### 8.1 Phases

| Phase | Branch | What | Depends |
|---|---|---|---|
| 1 | `r248-plugin-format` | `ducter-plugin/2` (v1 read forever); the four kinds' schema and refusals; permissions → consent lines; one ledger for all kinds; `ducter-plugins/index.json` + `withdrawn` + a built-in copy; `ducter plugin source add/list/remove`; `ducter plugin add <id\|url\|dir>` staging; `new theme`; `check theme` (tokens, contrast, both modes, a real-client render); **one token file both clients read** (Pebble as the first pack); `applyTheme` on web and Mac; Settings › 插件 with a theme row, a live preview and **换回 Pebble**; D668's importer rows unchanged | D668 |
| 2 | `r248-plugin-ui-web` | The `page` slot on the web and the phone: the isolated frame, the per-open token, the bridge (theme/lang/surface/reads/options/store/openTask), the kit v1, the error boundary; `#plugin=<id>` and ⌘K; `new ui`; `check ui` (8 shots, 320/1400, a11y, token-only, no network, first/error); `dev` for pages; the pane's UI row and consent card with a live preview; a fixture board | 1 |
| 3 | `r248-plugin-ui-mac` | The `page` slot on the Mac: `ducter-plugin://<id>/` with `Untrusted`, the native chrome, the bridge over the scheme, theme injection from Go, the app's fonts on the scheme, the theme-change message, the dark-mode cross-fade; the WKWebView harness in `check ui`; Mac shots | 2 |
| 4 | `r248-plugin-slots` | `tasks.section` and `task.panel` on both clients; the read DTOs (`tasks.list`, `projects.list`, `tasks.prs`, `task.facts`); the workbench panel; the collapse/height rules; the curated list + a third-party index + withdrawal; update/removal with a widened-set re-ask; the pane's slots/reads facts; a second fixture (a task panel) | 3 |
| 5 | `r248-plugin-agent` | `skills/ducter-plugin/SKILL.md` + 4 examples; `new` for the other three kinds with CI passing `check`; `check --json` + `check.schema.json`; `dev` refresh; `/docs/plugins`, `docs/for-agents.md`, `llms.txt`, `/plugins/manifest.schema.json`, `/plugins/index.json`; the partner's one-line rule and the task-made plugin card; the D175 eval if the persona changes | 4 |
| 6 | (triggered) | `connector` kind (an MCP bundle with the broker's gate); a read-only `source` kind when a second tracker is asked for; no channel, no harness. Trigger: someone outside asks, or a second MCP-backed service is wanted | 1 |

### 8.2 Brief, phase 1: "One manifest for every kind, and a look you can install"

- **Who:** the heavy developer who wants their own look without forking (today a theme is a PR to
  Ducter's Go and CSS), and the consumer who wants the theme a friend made.
  - Before: for a look, Pebble is the only one shipped; a second theme is a code change in two
    clients; there is no way to install one, consent to one, or try one safely and go back.
  - After: `ducter plugin add https://github.com/acme/midnight` shows one row in Settings ›
    插件; the card says **它会换掉 Ducter 的颜色、字体、圆角和手感。它不会改每一页怎么排，也不会读你的任何东西。
    {author} 做的，不是 Ducter。**; one tap and the whole app is Midnight, both clients, both
    modes; **换回 Pebble** is one tap. 放心: nothing was read, and nothing is permanent.
- **Rules:**
  - `ducter-plugin/2`, exactly as 4.1; `ducter-plugin/1` still installs and maps to
    `kind: importer`; unknown keys are refused; a kind object that doesn't match `kind` is
    refused; a theme with any `files.read`, `exec` or `network` is refused (shipping an image or a font
    is not a permission).
  - one token file (`packages/protocol/src/theme.ts` + `packages/protocol/themes/pebble.json`) that both clients
    read; every token in the schema in both modes; no fallback for a missing token.
  - contrast pairs checked on the pairs the clients use; a failure is a `check` failure; a
    theme may not change a duration beyond D290's bounds or a radius outside the scale.
  - install is staged and inert: nothing is read or applied until the card's **装上**; the ledger
    records the pin, the hash and the consented token set; `换回 Pebble` keeps the plugin
    installed and off.
  - the index: `index.json` + `withdrawn`, a built-in copy for offline, `source add/list/remove`;
    a curated entry says **Ducter 查过这个版本**, anything else **没有人替你检查过**; no
    auto-update; at most hourly while the pane is open.
  - the pane: one row per theme/UI/connector (mark, name, one line, state, switch, ⋯ (**看看它改什么** / **看看它读什么** / **删掉这个插件**)), **添加插件** by URL or folder, **浏览** by kind; importers keep their row in 导入; the lede of 4.6; no word "plugin"
    anywhere else.
  - the word: **插件 / Plugins** in the pane and the card; the import flow keeps D651's words.
- **Files:**
  - new: `packages/protocol/src/plugins.ts` (manifest types, kinds, schema, `consentLines`),
    `packages/protocol/src/theme.ts`, `packages/protocol/themes/pebble.json`;
    `packages/core/src/plugins/{manifest,index,install,consent,ledger}.ts` (the v2 loader and
    index; D668's `imports/plugins.ts` becomes the importer kind's runtime);
    `packages/cli/src/plugin-new.ts`, `plugin-check.ts`; web `apps/web/src/{plugins.tsx,
    theme.ts,i18n-plugins.ts}`; Mac `views/plugins.go`, `theme/theme_json.go`; docs
    `docs/plugins.md`;
  - changed: `packages/cli/src/{plugin-cmd,args,main,i18n}.ts`; `packages/core/src/{core,ws}.ts`
    (a `plugin_*` frame family); both clients' theme application; `design/{ui,settings,
    product-model,decisions}.md`; `docs/README.md`;
  - the site waits for phase 5: the skill, `llms.txt.ts`, `docs/plugins.md` and
    `/plugins/manifest.schema.json` are the agent phase's, not this one's.
- **Tests:**
  - the manifest matrix: each kind, a missing/extra key, a wrong kind object, a v1 manifest, a
    host range miss, a path out of the folder, a symlink, a theme with a read, an id collision;
  - the theme matrix: every token, both modes, a 2.9:1 pair, a missing token, a 400 ms press, a
    non-token colour in `theme.json`;
  - the index: a curated pin/hash, a moved commit (unreviewed), a withdrawn id (refused), a
    third-party source, an offline built-in copy;
  - the install: staged, no read before consent, a widened set asks again, a narrowed one
    doesn't, removal reverts, a folder edit changes the hash and refuses;
  - the clients: Pebble → Midnight → Pebble on the web at 390 and 1180 and the Mac at 1150,
    zh/en, light/dark; the pane's row and card at both; the shots in `.shots/r248/`;
  - `new theme` + `check` passes in CI; `check` fails a deliberately bad fixture.
- **Done:** typecheck and the touched suites are green with the fail count read; `bun
  scripts/check-links.ts` passes; the shots pass the ducter-ui checklist; a theme installed from
  a folder and from a URL, applied, reverted and removed on both clients; no plugin code ran.

### 8.3 Decisions owed

1. **The word:** 插件 / Plugins on screen, in the pane and the card, superseding D651's absolute
   sentence (its import flow unchanged).
2. **The kinds:** `theme`, `importer`, `ui`, `connector`; `source` later; channels and harnesses
   never.
3. **The manifest:** `ducter-plugin/2`, v1 read forever, one kind object, closed permissions.
4. **The UI surfaces:** `page`, `tasks.section`, `task.panel`; no home tile, no Settings frame,
   no conversation card, no bar place.
5. **The UI boundary:** no network, no process, tokens + kit only, a closed read set, own store.
6. **The index:** `wey-gu/ducter-plugins` with `index.json` + `withdrawn`, a built-in copy,
   third-party sources marked as such, no auto-update.
7. **The partner:** a plugin is made by a task with the skill, not a new tool; the persona's one
   line and the D175 eval land in phase 5.

## Implications for Ducter

1. **UI plugins are safe only as static files in a frame with a closed read pipe.** The moment a
   UI plugin gets a process, a network or a raw data handle, it becomes magpie's Bun host with a
   nicer stylesheet. The three "no"s (no process, no network, no Log) are the design.
2. **The kit is the product's style applied to someone else's layout.** A mandatory, generated
   kit plus token-only CSS is what lets a plugin have layout freedom without a second design
   system. Without it, a plugin page is an app that happens to open inside Ducter.
3. **One manifest, four kinds, one index is less code than four mechanisms and much easier to
   explain.** The kinds differ in entry and permissions, not in install, consent, pin, update or
   removal. D668's importer is the proof the machinery works.
4. **The agent experience is a tool, not a document.** `new` + `check --json` + `dev` + a skill
   is what makes "make me a plugin" a conversation instead of a pull request. magpie has the
   docs and no tools; Ducter can have both.
5. **The biggest risk is not code execution; it is the second style and the second voice.** The
   frame, the kit, the three slots and the no-attention rule are aimed at those two, and the
   check makes the first mechanical.
6. **Sequence theme → UI host → slots → agent → connectors.** The theme phase proves install,
   consent, index and check with zero execution; the UI host is the real new code; the slots and
   the agent experience are where the value compounds.

## Short summary

magpie's window plugins can add a page, up to 8 panels in four slots, and up to 8 menu items,
drawn from a per-run token under `sandbox="allow-scripts"` with `connect-src 'none'`, a
three-read bridge, and a no-weight stylesheet; a page-only plugin starts no process, but nothing
enforces the look, checks the result, or helps the author beyond one long docs page. VS Code,
Raycast, Obsidian and Figma each teach one thing: a closed manifest vocabulary of places
(VS Code), host-drawn controls versus layout freedom (Raycast), the honest failure of an
unsandboxed renderer (Obsidian), and the declared-data/declared-network split with the UI in a
message-passing iframe (Figma). Ducter's proposal: four kinds under one `ducter-plugin/2`
manifest — a data-only `theme`, D668's sandboxed `importer`, a static `ui` in a token-and-kit
frame with three slots and no network, and a `connector` around MCP — installed pinned, one
index (`ducter-plugins/index.json`, plus a person's own sources), consented in literal lines,
never auto-updated. The UI plugin is a page of its own, a section at the foot of Tasks, or a
panel in an opened task; the Mac hosts the same HTML in an `Untrusted` WKWebView on its own
scheme, the web in a per-open `/plugin-frame` token. `ducter plugin new/check/dev` and a shipped
`ducter-plugin` skill make one conversation enough, and the person's tap is still the install.
Phase 1 is a theme pack and the v2 manifest, with the check and the pane; the UI host is phase 2.

## Sources

| What | Where | Tag |
|---|---|---|
| magpie's window plugin spec (page, panels, actions, reads, limits) | `internal/plugin/page.go`; `docs/subsystems/plugin-runtime.md`; `site/public/docs/plugins.html` ("Pages in the window", "Panels in magpie's own pages", "Items in magpie's menus") | VERIFIED / DOCUMENTED |
| magpie's page frame, policy, token, bridge, per-run files | `internal/gui/pluginpage.go` (`pagePolicy`, `apiFramed`, `pluginPageRoutes`), `internal/gui/pagebridge.js` | VERIFIED |
| magpie's curated list, withdrawn, built-in copy | `internal/plugin/{market.go,market.json,withdrawn.go}`; `magpie-community/plugins`' `registry.json` | VERIFIED / DOCUMENTED |
| magpie's install/update rules and the 5-minute example | `site/public/docs/plugins.html` ("How magpie runs plugins", "A plugin in five minutes", "Testing") | DOCUMENTED |
| magpie's developer path (no scaffolder/checker/dev) | `internal/cli` (no such subcommand); the docs' "turn the plugin off and on" | VERIFIED / DOCUMENTED |
| magpie's agent material | `site/public/llms.txt` (line 163), `site/public/llms-full.txt` | VERIFIED |
| magpie's page-only plugin starts no host | `internal/plugin/page.go` (`Window`, `SetPageOptions`) | VERIFIED |
| VS Code contribution points (views, menus, colors, chatSkills, …) | [https://code.visualstudio.com/api/references/contribution-points](https://code.visualstudio.com/api/references/contribution-points) | DOCUMENTED |
| VS Code webviews (iframe, CSP, message passing, "resource heavy", "feel out of place") | [https://code.visualstudio.com/api/extension-guides/webview](https://code.visualstudio.com/api/extension-guides/webview) | DOCUMENTED |
| VS Code extension host and Workspace Trust | [https://code.visualstudio.com/api/advanced-topics/extension-host](https://code.visualstudio.com/api/advanced-topics/extension-host), [https://code.visualstudio.com/api/extension-guides/workspace-trust](https://code.visualstudio.com/api/extension-guides/workspace-trust) | DOCUMENTED |
| Raycast UI components and rendering | [https://developers.raycast.com/api-reference/user-interface](https://developers.raycast.com/api-reference/user-interface) | DOCUMENTED |
| Raycast confinement and review | [https://developers.raycast.com/information/security](https://developers.raycast.com/information/security) | DOCUMENTED |
| Raycast CLI (`ray build/develop/lint/publish`) | [https://developers.raycast.com/information/developer-tools/cli](https://developers.raycast.com/information/developer-tools/cli) | DOCUMENTED |
| Raycast manifest (commands, preferences, tools, ai.skills, MCP) | [https://developers.raycast.com/information/manifest](https://developers.raycast.com/information/manifest) | DOCUMENTED |
| Obsidian plugin security and Restricted Mode | [https://obsidian.md/help/Extending+Obsidian/Plugin+security](https://obsidian.md/help/Extending+Obsidian/Plugin+security) (`obsidianmd/obsidian-help`, `en/Extending Obsidian/Plugin security.md`) | DOCUMENTED |
| Obsidian community plugins (browse, install, update, uninstall) | [https://obsidian.md/help/Extending+Obsidian/Community+plugins](https://obsidian.md/help/Extending+Obsidian/Community+plugins) | DOCUMENTED |
| Obsidian plugin development (sample, dev vault, hot reload) | [https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin); [https://docs.obsidian.md/Plugins/Getting+started/Development+workflow](https://docs.obsidian.md/Plugins/Getting+started/Development+workflow) | DOCUMENTED |
| Figma's sandbox and iframe split | [https://developers.figma.com/docs/plugins/how-plugins-run/](https://developers.figma.com/docs/plugins/how-plugins-run/) | DOCUMENTED |
| Figma's manifest (`networkAccess`, `permissions`, `menu`, `relaunchButtons`) | [https://developers.figma.com/docs/plugins/manifest/](https://developers.figma.com/docs/plugins/manifest/) | DOCUMENTED |
| Figma's UI and theming | [https://developers.figma.com/docs/plugins/creating-ui/](https://developers.figma.com/docs/plugins/creating-ui/); [https://developers.figma.com/docs/plugins/css-variables/](https://developers.figma.com/docs/plugins/css-variables/) | DOCUMENTED |
| Ducter's manifest, pin, hash, sandbox, consent, curated list | `packages/core/src/imports/{plugins.ts,sandbox.ts,plugins.json}`, `packages/cli/src/plugin-cmd.ts` | VERIFIED |
| Ducter's small-app frame, kit, tokens, bridge, CSP | `packages/protocol/src/apps.ts` (`APP_KIT_CSS`, `APP_TOKENS`, `appCsp`, `appDocument`); `apps/desktop/appwindow.go` (`Untrusted`); `packages/core/src/core.ts` (`/app-frame/<token>`) | VERIFIED |
| Ducter's skills shipping and agent docs | `skills/ducter-{deploy,operate,troubleshoot}/SKILL.md`; `apps/site/scripts/skills.mjs`; `docs/for-agents.md`; `apps/site/src/pages/llms.txt.ts` | VERIFIED |
| Ducter's UI rules (tokens, D161 shared controls, D421 menus, D53 art, D290 motion) | `design/ui.md`; `.claude/skills/ducter-ui/SKILL.md` | VERIFIED |
| Ducter's small apps (the frame, the kit, the bridge, the flows) | `design/apps.md`; D405, D410, D422, D431, D603 | VERIFIED |
| Ducter's channels, task sources, harnesses, connectors | `design/channels.md`, `design/task-sources.md`, `design/harnesses.md`, `design/connectors.md`; `packages/protocol/src/{harnesses,harness-facts}.ts` | VERIFIED |
| Ducter's principles | `design/principles.md` | VERIFIED |
| D651, D655, D668 (the importer, the pane, the host) | `design/decisions.md` | VERIFIED |
