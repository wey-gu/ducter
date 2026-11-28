# 246: Plugins, and bringing in another agent app's history (#261)

The author asked (2026-11-28): 「261 issue 需求也做一下？我在想要不要引入 plugin 机制把非 intree 功能放在外部，你参考一下
magpie 项目（yetone）的 plugin 机制？」 Issue #261 comes from a user moving to Ducter from a
desktop coding-agent GUI (called **G** below; its name and exact paths are in
`private/246-notes.md`) and from Lody. They ask for a one-way import of their past threads as
read-only past tasks: message text, role, timestamps and project folder, searchable and
citable by the partner. Live sessions are out of scope. The issue suggests that an importer
could produce "the same validated shape" that `ducter move --receive` checks.

> **Historical in part (D670).** The recommendation that Lody stay in tree (§3.3 rule 3,
> §4.2, §4.8) was changed by the author on 2026-11-28: Lody is now the official plugin, and a
> manifest may declare an online command through `uses`. The report's format, mapping, sandbox and
> consent findings still stand; read §3.3 rule 3 and §4.2 as the evidence at the time.
>

This report covers five things: how magpie does plugins (Part 1); which of Ducter's existing
extension points already act as plugin interfaces (Part 2); a plugin mechanism for Ducter
designed from the user side (Part 3); #261 as its first case (Part 4); and a phased plan with a
phase-1 brief (Part 5).

**Method.** Everything here was read only. Nothing was built or run, and no third-party code
was executed. Clones are `--depth 1`, in the session scratchpad:

- `yetone/magpie` @ `ee3fe2a6` (2026-11-28);
- G's public repository @ `4bc38b1c` (2026-11-27);
- `LodyAI/Lody` @ `7ae04272` (2026-11-27).

Ducter was read on branch `dsh-truthful` @ `4528ce0f` (0.1.100). Each claim is tagged:

- **VERIFIED**: read in code;
- **DOCUMENTED**: the project's own docs say so;
- **INFERRED**: my reading.

**How magpie was identified.** `https://github.com/yetone/magpie` resolves. Its README links
`usemagpie.ai`, `yetone/magpie-releases` and `magpie-community/plugins`. Its Go module path is
`github.com/yetone/magpie` (`go.mod`, VERIFIED). It is yetone's "all your plans, one pool, any
agent" app: a local gateway that serves the person's model subscriptions to every coding agent.

## Summary

- **magpie has two plugin systems, and only one of them is a real boundary.**
  - *Built-in plugins* are in-tree Go packages that the person can switch off. They register a
    manifest from `init`, and a test enforces that core never imports a plugin.
  - *Community plugins* are npm/git/folder packages in OpenCode's plugin shape, run in **one
    shared Bun process with no sandbox**. The only exceptions are pages (an `allow-scripts`
    iframe with `connect-src 'none'` and three declared, secret-free reads) and middleware or
    agent modules (moejs, with no Node APIs).
  - magpie moved features out of tree for **legal** reasons (vendor terms), not for
    architecture.
- **Ducter already has six internal ports:**
  - the outside-sessions reader (`LocalAgents`);
  - harnesses over OAR;
  - connections (MCP, OpenConnector);
  - task sources (`SourceAdapter`);
  - chat channels (`Channel` port);
  - apps (D405).

  Each is a closed union compiled into the tree, so none of them is a plugin interface yet. Two
  of them are shaped well enough to become one: task sources and the outside reader.
- **A premise to correct:** `ducter move --receive` doesn't validate Log events. It checks the
  bundle's integrity: each file's SHA-256, the event count and the last event's hash
  (`packages/cli/src/move-bundle.ts`). Log bodies are TypeScript types with no runtime check
  (`LogStore.append`). So "the same validated shape" doesn't exist yet. Phase 1 builds it.
- **Recommendation: a data contract first, code later.** Ducter takes one small, versioned
  import format, `ducter-import/1` (JSON lines: a source, threads, messages). One validator in
  core turns it into Log events. Nobody outside core ever writes the Log or depends on its
  schema. The plugin mechanism comes after that, and narrowly: a program that prints that format,
  run in a platform sandbox with a declared read list, no network, and one consent card.
- **#261:** build the format, the validator and `ducter import` in tree (phase 1), then the
  Lody importer in tree (phase 2). G's importer goes out of tree, because the naming rule forbids
  G's name and paths in any file that goes into git. It runs as a standalone reader that the
  person pipes into `ducter import -` until the sandboxed host (phase 3) runs it as Ducter's first
  plugin. That makes the rule's cost into the plugin system's first real test.

## Part 1: magpie's plugin mechanism

### 1.1 Two kinds, with different trust

| | Built-in plugins | Community plugins |
|---|---|---|
| What | parts of magpie that not everyone needs (Sessions, Library, Routing, Usage, OTel, masking, web search, budgets…) | providers (sign-in, models, requests), gateway middleware, request hooks, tools, agents, pages, panels, menu actions, local masking models |
| Where the code lives | `plugins/<id>` in magpie's own tree (VERIFIED) | npm package, git repo or folder (DOCUMENTED, `site/public/docs/plugins.html`) |
| Declared by | `pluginrt.Register(Manifest)` from `init` (VERIFIED, `docs/subsystems/plugin-runtime.md`, `internal/pluginrt`) | OpenCode's v1 plugin function plus a `magpie` object in `package.json` (DOCUMENTED) |
| Runs | in magpie's process | one Bun "plugin host" over stdin/stdout JSON lines; moejs for middleware and agent modules; an iframe for pages (DOCUMENTED, VERIFIED `internal/plugin/host.go`, `page.go`) |
| Sandbox | none needed (it is magpie) | **none for the Bun host**; moejs has no Node APIs and imports only from inside the plugin; pages have `sandbox allow-scripts`, their own folder and `connect-src 'none'` (DOCUMENTED) |

### 1.2 Built-in plugins: an in-tree module system (VERIFIED, `plugin-runtime.md`, `internal/pluginrt/`)

- **The manifest:**
  - `ID`;
  - `API`, a caret range of the host API (`"^1"`; the host is `"1.0"`);
  - `Requires` / `Provides` (services);
  - `Essential`;
  - `InUse`;
  - `Apply(ctx)`;
  - `Parts` (the window slots it fills);
  - `Settings`, a Go struct that becomes a JSON Schema and a form at `Register`;
  - `Client`, its JS, i18n and CSS files.
- **The lifecycle:** `Reconcile(on, config)` turns plugins off newest first, then applies each
  wanted plugin whose required services exist, repeating until nothing changes. A plugin that
  fails (an error, a panic or an API mismatch) is undone and never stops the others.
  `ctx.OnDispose` undoes what it registered.
- **The boundary is a test.** `TestPluginsImportOnlyCore` checks that nothing outside `plugins/`
  imports a plugin, that a plugin never imports another, and that only `main.go` imports
  `plugins/all`. Plugins reach each other only through named services.
- **Choosing what is on:** layered composition: defaults, then a preset (`essentials` | `all`),
  then the person's rows in `plugins.yml`. A plugin whose `InUse` is above 0 stays on whatever
  the file says, because "off its things would go on working with nowhere to see them". A new
  install starts at `all`.
- **The window side:**
  - a kernel (`magpie.plugin(id, setup)`, slots, `magpie.ui` kit, `magpie.strings` i18n);
  - an **error boundary**: a page that throws is replaced by "This page stopped working" with Try
    again, and the other pages carry on;
  - a test that holds the script load order.
- **Moving a page out** takes one commit for the whole page (code, styles, words). An i18n test
  fails if anything outside the plugin's folder uses one of its words.

### 1.3 Community plugins

- **Package (DOCUMENTED):** OpenCode's provider-plugin shape, so a plugin for OpenCode works
  unchanged, plus pi packages that register a provider. magpie's own keys sit under `magpie` in
  `package.json`:
  - `icon`;
  - `name` and `summary` ("Its own words", shown as unreviewed);
  - `hooks`, `agent`, `page`, `panels`, `actions`;
  - `permissions` (page reads only);
  - `privacyModels`.
- **Install (DOCUMENTED, VERIFIED `dist.go`):**
  - `magpie plugin add <npm | github:owner/repo#ref | ./folder>`;
  - npm packages through `bun add` **with install scripts not run**, from the registry the
    person already uses;
  - a folder is loaded where it is;
  - `magpie://plugin?name=` opens the package's sheet and installs nothing; the person presses
    Install.
- **Versions and updates (DOCUMENTED):**
  - the community's own `@magpie-community/*` packages **update themselves hourly**;
  - other packages show a dot and "1 update", and the person updates them;
  - a pinned `name@1.2.3` stays pinned;
  - a git repo shows an update when its ref moved (checked through the GitHub API or `git
    ls-remote`).
  - A community tarball fetched from the `dist` branch is installed only when its sha512
    matches `index.json` (VERIFIED, `dist.go`).
- **Distribution and trust (DOCUMENTED):**
  - a curated `registry.json` in `magpie-community/plugins`, added to by pull request, listed in
    Discover with a community badge;
  - any GitHub repo tagged `magpie-plugin` shows under "Discover › Unofficial", **marked as
    reviewed by no one**;
  - a `withdrawn` list refuses one package for new installs (VERIFIED, `withdrawn.go`).
  - There is no code signing beyond npm's own provenance and the dist sha512. (INFERRED from
    what the docs and code describe.)
- **Host API (DOCUMENTED):** a subset of OpenCode's `PluginInput`:
  - `client.auth.set/remove`, `client.app.log`, `client.config.get`;
  - `directory` = magpie's config folder;
  - Bun's `$` shell;
  - `magpie.option(s)`.

  The hooks magpie calls are `config`, `auth` (methods, loader, `usage`, `refresh`, `checkin`),
  `provider.models` and `chat.headers`. The FAQ is candid: a plugin "sees everything in the
  requests it makes", and it may run the vendor's CLI through `$` or `child_process`.
- **Failure:** hooks fail open (an error or a timeout leaves the request as it was). Each hook
  has a time budget (middleware 20–250 ms; request hooks 1 s, clamped to 100 ms–30 s; tools
  55 s). A page's error replaces only that page. (DOCUMENTED)
- **UI:**
  - Plugins › Discover (sections by kind, search over npm keywords) and Installed (updates on
    top, a row per plugin saying which menus it adds to);
  - Plugins › Built-in, with a switch and a schema form per built-in;
  - a plugin's page as a sidebar tab under a "Plugins" group. (DOCUMENTED)

### 1.4 In-tree vs out-of-tree in magpie

- **What moved out, and why.** Twelve built-in subscriptions (Cursor, Zed, Kiro, Grok, …) were
  retired into `@magpie-community/opencode-*-auth` plugins: "Reaching them can break their
  vendors' terms, so they moved out of magpie … which keeps magpie itself from being banned"
  (VERIFIED, magpie `AGENTS.md`).
  - A mover carries the person's accounts over, with a minimum plugin version.
  - A new user never sees the built-in.
- **What stays in:** routing, protocol conversion, quotas, the gateway, the host, the window.
  Everything the person meets on the first day is an in-tree built-in plugin.
- **The real split is risk and audience:**
  - core and "most people" stay in tree, as switchable modules;
  - legally risky or long-tail integrations go out of tree, where the community owns them.

  (INFERRED)

### 1.5 What Ducter should take and what it should reject

Take:

- the in-tree module boundary enforced by a test;
- "off still means off";
- the API caret range;
- install scripts never run;
- a link that only opens a sheet;
- "reviewed by no one" said on the card;
- a withdrawn list;
- the error boundary;
- fail-open hooks with budgets;
- a folder loaded where it is, for authors.

Reject:

- **an unsandboxed shared host for third-party code.** One Bun process holds every plugin and
  the person's sign-ins. For Ducter, whose plugins would read the person's private stores, a
  plugin's capabilities must be what the OS lets it do, not what its README says.
- **hourly auto-update of code.** Even for "our own" packages it is a supply-chain path into
  private data.
- **pages and panels from plugins.** They would break Ducter's UI bar (D161 shared controls
  only) and its "concepts shown, not explained" rule.
- **plugin-id telemetry.** magpie sends which listed plugins are installed (README, Privacy).

## Part 2: Ducter today, its extension points (VERIFIED in code)

| Point | Where | Shape | Open to outside code? |
|---|---|---|---|
| Outside sessions (D299, D327, D376, D377) | `packages/core/src/local-agents/{agents,read,index}.ts`, `outside.ts` | `LocalAgents` interface: `roots/sessions/projects/summary/history/forget/active/latest`. Agents are a closed union `"claude-code" \| "codex" \| "pi"` (`OUTSIDE_AGENTS`, `protocol/src/past.ts:124`), each with a hard-coded path and record parser. Read lazily, head and tail only, `redact()` at the reader, never copied into the Log | No. The cleanest reader seam, but it **reads in place and never copies**, which is the wrong model when the other app is being left |
| Harnesses | `protocol/src/harnesses.ts` (`HARNESS_IDS`, 10 ids), `runner/src/oar.ts` (the only module that imports OAR) | Capability table plus OAR runtimes; OAR 0.138 has a "community runtime" (D637) | Effectively a plugin interface **one level down**: a new agent is an OAR runtime, and Ducter only lists it. Keep it so (principle 15) |
| Connections | `core/src/connections.ts` (D96) | Any MCP server or OpenConnector, through one broker; reads run, writes wait for a Go | **Already the plugin system for tools and data the partner calls**: anyone can write an MCP server. No new mechanism is needed for "the partner can use X" |
| The person's MCP and skills in tasks | principle 17, D17 | Inherited from the person's own harness config; "Ducter has no skill registry" | Yes, and owned by the person, not Ducter |
| Task sources (D341) | `core/src/task-sources/adapter.ts` (`SourceAdapter`: `status/list/total/browse/all/diff/checks/get/ops/write`), `github.ts`, `obsidian.ts` | The gate, the Log and the bindings stay in the service; "a new app never decides consent by itself" | Shaped like a plugin, but `SourceKind` is closed and `write` is an outward effect |
| Chat channels (D276) | `core/src/channels/port.ts` (`ChannelCaps`, `InMessage`, `OutPart`), `telegram/slack/feishu/wechat.ts`, `hub.ts` | The adapter "only moves words"; pairing, decisions and quiet hours live in the hub | Shaped like a plugin, but it holds a bot token and speaks for the person |
| Apps (D405) | `core/src/apps.ts`, `design/apps.md` "The sandbox" | The partner's HTML in a `connect-src 'none'` frame with a bridge | A sandbox for **the partner's** code, not third parties'. It is precedent for "the sandbox is the default, not a setting" |

**Candidates to move out (INFERRED), judged by who needs them:**

- Per-product importers: G (forced out by the naming rule), later Cursor, Windsurf, ChatGPT
  export and so on. These are long tail, read-only and local, which makes them the safest kind.
- Per-product outside readers beyond the three agents: the same seam, read lazily.
- A specific task source (Jira, Linear, a company's own tracker; `task-sources.md` §8) or a
  specific chat app (Feishu, WeChat). These stay **in tree** until someone outside asks, because
  they write outward and hold credentials (Part 3.12).
- Nothing else. The partner, tasks, the Log, attention, Mem and the UI are the product.

## Part 3: a plugin mechanism for Ducter

### 3.1 User first

- **The fresh user** never meets a plugin. Their first contact is a sentence ("我以前在 Lody 里聊过
  这个") or the person opening Past tasks on a computer where Ducter sees another app's history.
  The partner or the place offers once: **把 {app} 里的 {n} 段对话带进「做过的事」？只读，不会改 {app}。
  / Bring your {n} conversations from {app} into Past tasks? Read only; {app} isn't changed.**
  They tap **带进来 / Bring them in** and the history is there.
  - Felt before: "everything I did there is stuck there".
  - After: 放心 (nothing lost, nothing changed there) and 惊喜 (the partner says "你 10 月在 Lody
    里问过这个……").
- **The consumer migrating** from a personal-AI app gets the same flow with their app's name. In
  their eyes an importer that Ducter ships and one somebody added look the same, except for one
  plain line saying who made it.
- **The heavy developer** wants their own tool's history in without forking. Day one: write a
  40-line script that prints `ducter-import/1` and run `my-reader | ducter import -`. Later:
  `ducter plugin add <git url>` makes it a row in Settings that re-runs by itself, sandboxed.
  - Felt before: "the only way is a PR to Ducter".
  - After: 顺滑. The contract is a file format they can test with `ducter import --check`.

### 3.2 From first principles: data before code

Prior art (magpie, VS Code, OpenCode) makes a plugin a module loaded into the host's runtime
and given a host API. For Ducter's first need that is the wrong primitive:

1. An importer's whole job is to produce **data**. A data contract can be checked completely by
   the host. A code contract cannot.
2. The Log's bodies change almost every week (`Bodies` in `protocol/src/index.ts` grows with
   each Dn). An API over Log events would force every plugin to track Ducter's internals. A
   small interchange format, versioned on its own, keeps plugins stable while the Log evolves.
3. A program that prints JSON can be written in any language. It can be run by the person
   (their own trust, zero host machinery) or later by Ducter in a sandbox. The same output works
   in both cases, so phase 1 needs no runtime at all.
4. Consent and provenance stay in one place. The host stamps every imported event with the
   source and the run. A plugin can't claim to be the person, the partner or a task.

So a **Ducter plugin is a reader that speaks a declared format over stdout, run with declared
reads.** It isn't a module with a host API. It never gets a UI, a Log handle, a network or a
credential.

### 3.3 The headline rules

1. **One format per kind, owned by core.** `ducter-import/1` first (3.8). A future `reader`
   kind (live, read in place like D299) gets its own format when it is needed.
2. **Nothing outside core writes the Log.** The importer service validates every record, maps it
   to Log events itself and appends them. A plugin never sees `Bodies` and never depends on it.
3. **Read-only, local, no network.** A plugin may read only the paths it declares (globs under
   the home folder), write only a temporary folder Ducter gives it, and start only the programs
   it declares. Network is denied by the OS. A plugin that needs a vendor's CLI with network (as
   Lody does) stays in tree until 3.7's evidence improves.
4. **Sandboxed or not run.** On macOS, Seatbelt (`sandbox-exec` with a profile generated from
   the manifest). On Linux, bubblewrap (`--unshare-net`, `--ro-bind` per declared path, a tmpfs).
   Where neither is available (some containers, Windows), the plugin is refused with a plain
   reason and is never run unconfined (principle 18: honest about isolation).
5. **One consent card, in literal words.** It names what the plugin will read (each path, in
   words), that it can't go online, what it brings in (conversations, as read-only past tasks)
   and who made it. Widening the read list asks again. Narrowing it doesn't.
6. **Pinned, never auto-updated.** A plugin is installed at a commit or version with a content
   hash. An update is offered on its row and applied on one tap. Ducter's own curated list says
   "Ducter checked this version". Anything else says **没有人替你检查过 / Nobody has checked it for
   you** (magpie's honesty, kept).
7. **No new concept on screen.** The person sees *imports* (导入 / Import), never "plugins". A
   plugin's row is just an import source whose detail shows **你加的 / Added by you** and its
   repository, each its own element (D291). The word "plugin" exists only in the CLI and in
   developer docs.
8. **Removing is total and safe.** Removing a source deletes the plugin's folder and offers
   **也把它带进来的对话删掉 / Also remove what it brought in** (3.11). Past tasks never keeps
   records whose source is gone without saying so.
9. **Fail closed, quietly.** A plugin that crashes, times out (a per-run budget, default 5 min)
   or prints a bad record imports nothing from that record onward, says one line on its row, and
   never reaches the conversation unless the person ran it from there.
10. **Off means off.** A switched-off source isn't run, isn't offered and isn't counted. What it
    brought in stays until the person removes it (it is their history now).

### 3.4 What a plugin can be

| Kind | Now? | Why |
|---|---|---|
| `importer`: reads another app's local store, prints `ducter-import/1` | **Phase 3** | Read-only, local and a one-way copy. The safest possible kind, and #261 needs it |
| `reader`: lists another agent's sessions in Past tasks in place, as D299 does, and continues them | Later (trigger: a second request for an agent that isn't one of the three) | Needs a resume path through OAR. Continue is an action, not data |
| Task source | Not before someone outside asks | It writes outward (comment, close) behind a Go. The write stays core's, but a plugin would still hold the person's token |
| Chat channel | Not planned | It holds a bot token and speaks as the person's partner. A bad one damages trust in the partner itself |
| Tools for the partner or tasks | Never as a Ducter plugin | MCP already is that system (connections, principle 17) |
| Harness | Never as a Ducter plugin | OAR runtimes are that system (principle 15) |
| UI (pages, panels, menu items) | Never | The UI bar (shared controls, one style). Apps (D405) cover "a small surface the person wants" |

### 3.5 The manifest (`ducter-plugin.json` at the repo root)

```json
{
  "format": "ducter-plugin/1",
  "id": "acme-notes",
  "kind": "importer",
  "version": "0.2.0",
  "name": { "en": "Acme Notes", "zh": "Acme 笔记" },
  "app": { "name": "Acme Notes", "icon": "icon.svg" },
  "emits": "ducter-import/1",
  "run": ["bun", "main.ts"],
  "reads": ["~/Library/Application Support/AcmeNotes/**/*.sqlite*", "~/.acme/config.json"],
  "starts": [],
  "network": false,
  "detect": ["~/Library/Application Support/AcmeNotes/store.sqlite"],
  "ducter": "^0.2"
}
```

- `run` executes with **Ducter's own Bun** (the binary Ducter ships) or a declared program. There
  is no `bun install` and no dependencies outside the repo in phase 3. Dependencies come with
  install scripts never run, as magpie does, when someone needs them.
- `detect` is checked by file existence and modification time only, the D327 and D377 rule
  ("which agents wrote there and when"). That is what lets the place offer an import without
  reading anything.
- `ducter` is the caret range of the host. `emits` is the format version (3.9).

### 3.6 Found and installed

- `ducter plugin add <git url[#ref] | ./folder>`. A folder is loaded where it is, for authors.
  npm comes later; git is enough and maps to the GitHub reading Ducter already does.
- Ducter's curated list is a `plugins.json` in the Ducter repo (reviewed by pull request), shown
  in Settings › Import as importable apps. A link `ducter://import?plugin=<id>` opens that row's
  sheet and installs nothing.
- **Signing:** none in phase 3. The trust chain is the pinned commit and content hash, the
  curated list and the sandbox. The sandbox is what makes an unreviewed plugin safe to try: it
  can read only what the card listed and can't send it anywhere. (INFERRED; evidence thin, 3.14)
- **Where it runs:** on the computer that holds the store. On the home by default. When the
  store is on a worker, the worker runs the plugin and sends records up (the D377 pattern), after
  a yes on that worker's card.

### 3.7 Where it runs: the sandbox

- **macOS:** a generated Seatbelt profile:
  - `(deny default)`;
  - `(allow file-read*)` for the plugin folder, Ducter's Bun and system libraries, and each
    declared path;
  - `(allow file-write*)` for its temporary folder only;
  - `(deny network*)`;
  - `(allow process-exec)` only for `run[0]` and `starts`.

  Codex CLI and Claude Code sandbox commands on macOS with Seatbelt (DOCUMENTED in their public
  docs; not re-read for this report). `sandbox-exec` is marked deprecated by Apple but still
  ships (INFERRED from common use; verify on macOS 27 in phase 3).
- **Linux:** `bwrap --unshare-net --ro-bind <each path> --tmpfs /tmp --die-with-parent`.
  bubblewrap needs unprivileged user namespaces. Some containers lack them, and there it is
  refused (rule 4).
- **Bun has no permission flags** of the kind Deno has (`--allow-read=`). (INFERRED; Deno would
  give a second line of defence but adds a runtime.) So the OS sandbox is the only line. Ducter
  does no sandboxing of its own today (`grep sandbox-exec|bwrap` over `packages/` finds nothing,
  VERIFIED). This is new code with real risk, which is why it is phase 3 and not phase 1.

### 3.8 The host API is a format: `ducter-import/1`

JSON lines on stdout. Every line has a `t` field. The validator in core
(`packages/core/src/imports/format.ts`) checks types, lengths and order, and refuses unknown
`t` values. Unknown fields are kept out, never stored.

```jsonl
{"t":"source","format":"ducter-import/1","app":"Lody","account":"workspace:my-team","reader":"lody-cli","readerVersion":"1"}
{"t":"thread","id":"S-8f2a","title":"Fix the flaky WAL test","folder":"/Users/me/src/hawdb","repo":"github.com/acme/hawdb","branch":"fix-wal","agent":"codex","model":"gpt-5.5","createdAt":"2026-10-02T03:11:00Z","updatedAt":"2026-10-02T05:40:12Z","archived":false}
{"t":"msg","thread":"S-8f2a","id":"m1","role":"user","text":"The WAL test fails one run in five…","at":"2026-10-02T03:11:00Z"}
{"t":"msg","thread":"S-8f2a","id":"m2","role":"assistant","text":"It races the checkpoint…","at":"2026-10-02T03:14:31Z"}
{"t":"skipped","thread":"S-8f2a","what":"attachment","n":2}
{"t":"end","threads":1,"messages":2}
```

- **Roles:** `user` | `assistant` only. System prompts, tool calls, tool output and thinking are
  not part of the format.
- **Limits:**
  - text ≤ 256 KB per message (longer goes to a blob, principle 1);
  - title ≤ 200 characters;
  - at most 20,000 messages per thread per run;
  - times must be valid ISO and not in the future.
- **`repo`** is optional. When it is absent, core derives it from `folder` with the folder-info
  remote read it already has. The plugin never decides the project (principle 21: a fact read
  from git, never a name match).
- **`skipped`** records count what wasn't brought, so the person can be told ("2 张图片没有带过来").
- **`end`** is required. A stream with no `end` (a crash) is imported up to the last full
  thread, and the row says it stopped partway.
- Every text passes through Ducter's one secret detector (`redact()`, D175 F7) **at the
  validator**, before anything is stored. That is the D327 rule: keys hidden before a title
  exists.

### 3.9 Versioning

- **Three independent versions:**
  - the plugin's own `version`;
  - the format (`ducter-import/1`);
  - the host range (`ducter: "^0.2"`).
- Core accepts every format major it has ever shipped, because a format is cheap to keep: an old
  reader's output still converts. A new major is added only for a breaking need. Minor
  additions are optional fields.
- A plugin whose host range doesn't match is listed as **需要更新的 Ducter / Needs a newer Ducter**
  and isn't run (magpie's `failed` with a reason, kept).
- The Log side is versioned by core alone. When `task_open` or `task_event` change, the
  import mapping changes in the same commit, and no plugin notices.

### 3.10 What the person sees

- **Settings › 导入 / Import** (a new pane in `settings.md`, glossary entry owed). Lede: **把你在别的
  app 里做过的事带进「做过的事」。只读，那边什么都不改。/ Bring what you did in other apps into Past
  tasks. Read only; nothing changes there.**
  - One row per source, built-in and added alike: the app's picture and name; its state
    (**{n} 段对话 / {n} conversations**, **{day} 带进来的 / Brought in {day}**, **有新的 {k} 段 /
    {k} new**); and buttons **再带一次 / Bring in again** and the ⋯ menu (**删掉这个来源 / Remove
    this source**, **看看它读什么 / What it reads**).
  - Added rows carry **你加的 / Added by you** and its repo as their own elements. A row whose
    version isn't on the curated list carries **没有人替你检查过 / Nobody has checked it for you**.
- **The consent card** (once per source, again if the read list widens), all literal:
  - 它会读：{each path in words, e.g. "Lody 里你的对话（通过你电脑上的 lody 命令）"} / It will read: …
  - 它不能上网，也不能改那些文件。/ It can't go online or change those files. (For an in-tree
    reader that does go online through the person's own CLI, such as Lody, it says so instead:
    它会用你电脑上已经登录的 lody 命令读你的对话。)
  - 带进来的会出现在「做过的事」里，只读。/ What it brings in shows in Past tasks, read only.
  - Who made it.
  - Buttons: **带进来 / Bring them in** and **先不 / Not now**.
- **The offer** (D453: costs a glance, fades): in Past tasks' "Also on this computer" section, or
  as one partner line when the person mentions the app. Never a push and never a decision. It is
  offered once per source per computer. After **先不** it doesn't come back until the person
  mentions the app again.
- **When the run is over:** one quiet line in the place that started it. **带进来了 {n} 段对话，最早的是
  {date}。/ Brought in {n} conversations, the oldest from {date}.** If anything was skipped:
  **{k} 张图片和附件没有带过来。**

### 3.11 Updates and removal

- **Update:** a curated plugin's new version shows **有新版本 / Update** on its row. One tap
  installs it. A widened read list puts the consent card back first. A git plugin compares its
  pinned commit with the ref's head, at most hourly, and only while Settings › Import is open or a
  run starts.
- **Removing a source** deletes its folder and its ledger. It offers **也把它带进来的 {n} 段对话删掉 /
  Also remove the {n} conversations it brought in**. That uses the Log's one exception
  (`LogStore.forgetIn`, D327) to blank the bodies, plus an `import_removed` event that hides
  those tasks from Past tasks and search.
  - **A decision is owed here:** `forgetIn` says "never used for the person's words or the
    partner's". Imported user words are the person's words, but said in another app and read
    from outside. I recommend extending the exception explicitly to imported content.
    Otherwise removal could only hide the records, never forget them.

### 3.12 What is never a plugin

- the Log, the projection, the digest and recall;
- the partner and its tools;
- tasks, the runner, body selection and OAR;
- attention, decisions, the Go gate and intents;
- consent and the import validator itself;
- credentials and the key shelf;
- Mem identity;
- `ducter move`;
- the clients and their shared controls;
- anything that writes outward on the person's behalf (comments, messages, payments).

A plugin may bring in only what the person already had elsewhere.

### 3.13 Against the principles

| Principle | How the design holds it |
|---|---|
| 1 Log is the truth | Imports are copied into the Log, so they survive the other app's removal and move with `ducter move`. The other app's store is never the truth for Ducter |
| 2 Projection layered by change | Imported tasks never enter L0–L3. They reach the partner only as `task_find` results at L4, in a turn the person asked |
| 3 Recall | Imported text joins FTS search (`LogStore.search`) and Past's index, so "last month's" questions work across apps |
| 7 Attention | An import never pushes and never makes a decision card; its offer fades |
| 15 Thin adapters, declared capabilities | The plugin manifest declares reads, starts and network, the way an adapter declares its capabilities |
| 17 Identity is user data; provenance | Each imported event carries `imported: {source, run}`; the partner names the app when it cites one |
| 18 Scope the credentials, gate the effects, honest isolation | No credential, no network, an OS sandbox or nothing |
| 19 The control plane holds state | Readers run where the store is and send records up (D377) |
| 20 Simple surface | No new place: Past tasks, ⌘K and one Settings pane |
| 21 The model judges, code guards | The project comes from git's remote (a fact), never from folder-name matching. The validator enforces only invariants |

### 3.14 Where evidence is thin

- **Demand:** one issue (#261) and the author's question. No count of people migrating.
  (INFERRED: Ducter's own heavy users came from Conductor and other GUIs, `motivation.md`.)
- **Sandbox durability:** `sandbox-exec`'s future on macOS, and bubblewrap's availability in
  the containers people run Ducter servers in. Both are unverified here.
- **Whether third parties will write Ducter importers at all.** magpie's ecosystem grew because
  OpenCode plugins already existed and ran unchanged. Ducter has no such existing base, so the
  format must be small enough that writing one is an afternoon's work.
- **`VACUUM INTO` on a read-only connection** as the way to snapshot a WAL database that is in
  use (4.1): believed to work from SQLite's docs, not tested here.

## Part 4: #261, the first case

### 4.1 G's store (VERIFIED from its source @ `4bc38b1c`; paths in private notes)

- **One SQLite file per data directory**, `statev2.sqlite`, in WAL mode (`Sqlite.ts`:
  `PRAGMA journal_mode = WAL`). The server writes it while it runs. A V1 `state.sqlite` is copied
  to `statev2.sqlite` once, on the first V2 launch, and the two are independent afterwards
  (`docs/user/thread-migration.md`, DOCUMENTED).
- **The tables an importer needs** (`persistence/Migrations/005_Projections.ts`,
  `055_OrchestrationV2.ts`, `081`, `116`, `Foundation.ts`):
  - `projection_projects(project_id, title, workspace_root, …, deleted_at)`;
  - `orchestration_v2_projection_threads(thread_id, project_id, title, default_provider,
    runtime_mode, interaction_mode, created_at, updated_at, archived_at, deleted_at,
    payload_json, provider_instance_id, fork_run_ids_json)`;
  - `orchestration_v2_projection_messages(message_id, thread_id, run_id, node_id, role,
    streaming, created_at, updated_at, payload_json, search_text)`.

  The fixtures guide says clients read projects from `projection_projects` and everything else
  from `orchestration_v2_projection_*`, and that the older `projection_thread*` tables hold V1
  history (its SQLite-fixtures skill reference; path in private notes, DOCUMENTED).
- **Payloads** decode against `packages/contracts/src/orchestrationV2.ts`:
  - a thread (`OrchestrationV2AppThread`) has `projectId`, `title`, `branch`, `worktreePath`,
    `modelSelection`, `providerInstanceId`, `linkedPullRequest`, `forkedFrom`, …;
  - a message (`OrchestrationV2ConversationMessage`) has `role` (`user` | `assistant` |
    `system`), `text`, `attachments`, `streaming`, `createdAt` and `updatedAt`.
  - Provider threads carry a `nativeThreadRef` (`OrchestrationV2ProviderThread`). That is
    probably the Claude Code or Codex session id underneath (INFERRED). It matters for 4.7.
- **The store changes fast:** 148 migration files, with V2 beginning at 055 (VERIFIED count). The
  reader must therefore use **columns where they exist and only a few payload fields**:
  - thread: `title`, `branch`, `worktreePath`, model;
  - message: `role`, `text`, `createdAt`.

  It must count anything it can't decode as skipped and never fail the run on one row.
- **Reading safely:** never open the live file for writing. Take a snapshot with `VACUUM INTO` a
  temp file from a read-only connection (or copy `statev2.sqlite`, `-wal` and `-shm` together
  and open the copy), then read the copy. (INFERRED; 3.14.) G's own recovery doc uses `sqlite3
  -readonly` (DOCUMENTED).
- **The V1 fallback:** when only `state.sqlite` exists, read `projection_threads` and
  `projection_thread_messages(role, text, created_at)` (`thread-migration.md`'s own queries,
  DOCUMENTED).

### 4.2 Lody (DOCUMENTED, `site-docs/content/docs/en/(reference)/(settings-and-cli)/cli.mdx`; VERIFIED shapes in `packages/shared`)

- **History is not in a local file.** Sessions live in a Lody workspace on Lody's service,
  optionally end-to-end encrypted ("Lody's servers relay and store the data", `encrypted-
  workspaces.mdx`). The README says Lody is "still moving toward full local-first support". So a
  Lody importer is **the person's own `lody` CLI, already signed in**, run by Ducter:
  - `lody session list --workspace <w> --all --json` (`items`, `hasMore`, `nextCursor`);
  - `lody session history <id> --all --jsonl`, the visible transcript, which "intentionally hides
    internal reasoning, tool calls, and other non-user-facing items";
  - `lody session show <id> --json` for machine, workspace binding and repository.
- **An entry** is `{id, role, timestamp, items: [{type: "text", text}], userTurnId?, endedAt?}`
  (`SessionHistoryInput`, `packages/shared/src/schema.ts`, VERIFIED in tests).
- **Projects:** Lody sessions bind to a GitHub repository (`--repo owner/repo`), which maps
  straight onto research/245 §3.2's project key.
- **Encrypted workspaces:** the CLI refuses on a device that isn't authorized ("Update the owner
  machine to access encrypted Roost history.", `command-runtime.ts`, VERIFIED). The row then
  says, in plain words, that Lody needs this computer authorized first.
- This reader goes online through Lody's CLI. Rule 3 keeps that kind of reader in tree, where
  Ducter's own code decides what it runs, the way it runs `gh` today.

### 4.3 Mapping a thread to a read-only past task

- **One thread becomes one task stream** `task:<id>`, with a deterministic id `imp_<first 16 hex
  of sha256(app | account | threadId)>`. Its events:
  - `task_open` with a new field `imported: {app, account, threadId, runId, createdAt,
    agent?, model?}`. The brief is empty. `place` is `{kind: "folder", path}` (or repo, from
    `repo`), and the harness is `agent` when Ducter knows it, otherwise none;
  - one `task_event` per message (`role`, `text`) with two new fields: `at` (the source's
    time; Past, ⌘K and time words use it in place of the Log's `ts`) and `importedId` (the
    source's message id);
  - a closing `task_state` that leaves it ended. A new end word, **带进来的 / Brought in**, sits
    beside Done, Didn't work and Cancelled, so the ended chips don't lie about how it ended.
- **Origin:** a new `Origin` value, `"import"`. It is never `user`, never `partner`. The
  subscribers that wake the partner or count attention ignore it.
- **What the person sees:**
  - Past tasks lists them with the other app's picture and **从 {app} 带进来的 / From {app}** as
    its own pill;
  - the "Where it stopped" preview shows the last words;
  - Steps show the person's messages;
  - its foot offers **打开 / Open** and **带着它开新任务 / New task from this**, but not Continue
    (out of scope, per the issue).
- **The partner:**
  - `task_find` returns imported items with `imported: {app, day}`;
  - persona rule 2d gains one clause: name the app when citing ("你 10 月在 Lody 里……");
  - the short list doesn't list imported tasks but counts them in "N earlier tasks that
    task_find finds".
  - A change to `task_find`'s output fields or description owes the D175 eval.

### 4.4 Dedupe and importing again

- The dedupe key is `(app, account, threadId)` mapped to that deterministic task id. A thread that
  is already there isn't opened again.
- For a thread that grew, only messages whose `importedId` isn't in the task's stream are
  appended, in source time order. The set comes from the session index (`session-index.ts`
  already indexes a task's stream on first ask).
- A message edited in the source isn't updated, and the run's `skipped` says how many differed
  (one-way, read-only; the issue asks for no more).
- Threads deleted in the source stay in Ducter. Threads marked deleted (`deleted_at`) at the
  first import are never brought in. Archived ones are, carrying their archived state.
- The run ledger lives in the Log: `import_run {runId, app, account, phase: started | done |
  stopped, threads, messages, skipped}` on the `system` stream. No side file, because principle
  1 holds and `ducter move` carries it.

### 4.5 Project mapping (research/245 §3.2)

- `repo` is used when the record has it (Lody's binding).
- Otherwise core reads the folder's `origin` remote with the existing `folder-info` read, if the
  folder still exists on that computer.
- G's `worktreePath` beats the project's `workspace_root` for the folder, but the project key
  is the repository either way. A worktree is never a project.
- A folder that no longer exists, with no remote known: the task's project is the folder's
  last path part, marked **文件夹不在了 / Folder gone** (as D299 says).
- An imported task never creates a row in `projects.json`. Projects stay inferred, and phase 3 of
  research/245 owns the key.

### 4.6 What is never imported

- tool calls and their output, thinking, plans, approvals and runtime requests;
- checkpoints and diffs;
- provider sessions;
- system messages;
- streaming (unfinished) messages;
- attachments' bytes (counted as skipped; a later minor version may carry pictures);
- G's auth tables (`auth_pairing_links`, `auth_sessions`) and settings;
- secret-provider data;
- anything another account on the computer owns;
- threads under Ducter's own folders (they are Ducter's tasks already).

### 4.7 Later, not in #261

- **Continue an imported thread** where the agent's own native session is still on disk. G's
  `nativeThreadRef` probably names a Claude Code or Codex session that D299 already reads. The
  two could be linked so Continue resumes it (INFERRED; trigger: someone asks).
- **Pictures**, as `ducter-import/1.1` with media refs into the media store (D206).

### 4.8 In tree first, or plugin first?

**Recommendation: the format and the importer service in tree first. Lody in tree. G out of tree
from day one.**

- In tree first, because the hard part is the mapping (4.3–4.5) and the place in Past tasks,
  not loading code. The sandboxed host is new, risky code (3.7) that #261 doesn't need in order
  to deliver value, since a person can pipe a reader's output into `ducter import -`.
- G out of tree, because the naming rule (no G name or path in git, until the history scrub)
  makes an in-tree G reader impossible to write honestly. A standalone reader in its own
  repository (not Ducter's git) that prints `ducter-import/1` gives the issue's author (a heavy
  developer) a one-command import now. With phase 3 it becomes the first sandboxed plugin with a
  real read list.
- **The tradeoff:** until phase 3, G's users run one command instead of tapping a row, and Ducter
  can't offer G's import by itself (the offer needs `detect`, which needs the plugin).
- **The alternative:** plugin first, with all of #261 waiting on the sandbox (phase 3). That
  gives a cleaner story but a later, riskier first delivery. I'd choose it only if a second
  outside importer is already promised.

## Part 5: the plan

Each branch can be built with fakes in 1–2 days.

| Phase | Branch | What | Depends |
|---|---|---|---|
| 1 | `r246-import-core` | The `ducter-import/1` validator; the import service (dedupe, project by repo, `redact`, `Origin "import"`, `task_open.imported`, `task_event.at/importedId`, `import_run`); Past, ⌘K and `task_find` reading `at` and the "From {app}" pill; `ducter import <file\|-> [--check]`; `docs/import.md` (the format, for people writing a reader) | none |
| 2 | `r246-import-lody` | The Lody reader in tree through the person's `lody` CLI (a fake `lody` binary in tests); Settings › Import with its consent card and rows; the offer in Past tasks when a source is detected; removal (hide, plus the `forgetIn` extension if decided) | 1 |
| 2b | (outside Ducter's git) | G's reader: a standalone script printing `ducter-import/1` from a snapshot of `statev2.sqlite` (and V1), tested against fixtures made from G's own migrations | 1 |
| 3 | `r246-plugin-host` | `ducter-plugin.json`; `ducter plugin add/list/remove/update`; the Seatbelt and bubblewrap runner with generated profiles; consent on a widened read list; pinned commit and hash; the curated `plugins.json`; Added by you / Nobody has checked it rows. Tests: a fixture plugin, plus sandbox-denial tests (a read outside the list fails, a socket fails, a write outside tmp fails) on macOS and Linux | 1, 2 |
| 4 | (triggered) | the `reader` kind (in place, with Continue); a worker running a plugin where its store is (D377) | 3 |

Before phase 1 can merge, the author owes three decisions (D-numbers at merge): the new
`Origin "import"` and end word **带进来的 / Brought in**; the `forgetIn` extension to imported
content; and the glossary words **导入 / Import** (the Settings pane), **带进来 / Bring them in**,
**从 {app} 带进来的 / From {app}** and **没有人替你检查过 / Nobody has checked it for you**.

### Brief, phase 1: "Bring past conversations in: one format, checked once, read-only past tasks"

- **Who:** the heavy developer leaving another agent GUI (#261's author) and, through phase 2,
  the consumer leaving Lody.
  - Before: their months of threads are stuck in an app they're leaving.
  - After: `reader | ducter import -` (or a tap, in phase 2) and every thread is in Past tasks,
    found by ⌘K and by the partner, read only, with its own day and project. 放心: nothing there
    changes, and nothing is pushed at them.
- **Rules:**
  - the format of 3.8, exactly; validate everything and store nothing unknown; `redact()` at
    the validator;
  - nothing outside `packages/core/src/imports/` appends imported events;
  - deterministic task ids; dedupe by `(app, account, threadId)` and `importedId`;
  - `Origin "import"` never wakes the partner, never makes a card, never counts in On hand or
    needs-you;
  - time words and sort use `task_event.at`;
  - the project comes from `repo`, else the folder's remote, else the folder name with Folder gone;
  - imported tasks are Open and New task from this only, never Continue;
  - one `import_run` per run.
- **Files:**
  - new: `packages/core/src/imports/{format,service}.ts`;
  - `packages/protocol/src/index.ts` (`Origin`, `task_open.imported`, `task_event.at`,
    `task_event.importedId`, `import_run`), `protocol/src/past.ts` (an `imported` facet and end
    word);
  - `packages/core/src/{past,outside,registry}.ts` (time from `at`, the pill, excluded from the
    partner's short list);
  - `packages/partner/src/partner.ts` (`task_find` result fields; persona rule 2d clause, so the
    D175 eval is owed);
  - `packages/cli/src/import.ts` (`ducter import`);
  - web `past.tsx` and the Mac `views/past.go` (the pill, Brought in);
  - i18n in both clients;
  - `docs/import.md`;
  - `design/past.md`, `product-model.md` glossary, `scenarios.md`.
- **Tests:**
  - the validator: every record kind, each limit, an unknown `t`, a stream with no `end`, a
    future time, a secret in a message hidden;
  - the service: an import, then importing again (no duplicates; a grown thread appends only the
    new messages), project by repo vs folder vs gone, `task_find` finding an imported thread by
    words and by "上个月" through `at`, and no partner wake and no attention event;
  - the CLI: `--check` prints counts and writes nothing;
  - fixtures with real lengths: 300 threads, one with 4,000 messages, CJK and English (memory:
    real counts in shots);
  - a second, unlike shape: a reader with no folders at all, such as a chat-only app.
- **Done:** typecheck and the touched suites are green, with the fail count read, not just the
  totals; the D175 eval has run with its results committed; shots of Past tasks with imported
  cards on the Mac at 1000 and 1400 and on the web at 390, zh and en, light and dark, are in
  `.shots/r246/` and pass the ducter-ui checklist; `bun scripts/check-links.ts` passes.

## Implications for Ducter

1. Treat "plugin" as a **data contract with a sandboxed reader**, not as loaded code with a host
   API. It is cheaper to build, checks completely and keeps the Log's schema private.
2. Most of Ducter's integrations should stay in tree as modules behind ports (magpie's
   built-in pattern with a boundary test). Out of tree is for the long tail and for what the
   naming rule or a vendor's terms keep out.
3. #261 can ship value in two small branches without any plugin runtime. G's importer is the
   natural first plugin precisely because it can't live in tree.
4. The sandbox runner (phase 3) is the one piece of real new risk. Build it only after phase 1–2
   show the format works, and test its denials on both platforms.
5. Correct the issue's premise publicly when replying: `move --receive` checks integrity, not
   event shapes. The import validator is new, and it is what makes an outside reader safe to
   accept.

## Short summary

magpie splits plugins into in-tree built-ins (switchable modules behind a test-enforced
boundary) and community npm/git packages run unsandboxed in one Bun host. Only pages and
middleware are confined, and features moved out mainly to keep magpie clear of vendor terms.
Ducter has six internal ports (the outside reader, OAR harnesses, MCP connections, task sources,
chat channels, apps). Each is a closed union, and MCP and OAR already serve as plugin systems
one layer away. The proposal: a versioned import format `ducter-import/1`, validated once in
core, which alone writes the Log. Later, out-of-tree importers run as OS-sandboxed readers with
declared reads, no network, one literal consent card, pinned versions and no UI of their own.
The person sees "导入 / Import", never "plugins". For #261: format and service in tree (phase 1),
Lody through its CLI in tree (phase 2), G's reader out of tree because of the naming rule, and
G's reader becomes the first sandboxed plugin when the host lands (phase 3).
