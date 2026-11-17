# 126 · Task sources: GitHub Issues, Obsidian Tasks, Jira

> 2026-11-17. Public. Feeds D341: a Ducter task bound to one outside item (a GitHub issue or PR, an
> Obsidian Tasks line in a vault file; later Jira and company trackers). The outside system owns *what*
> the item is and its state; Ducter owns *how* it gets done. Outside items never start work by
> themselves, and every write back (a comment, a close, a tick) is outward and goes through consent.
>
> Tags: **VERIFIED** checked by me this session (a docs page read now, `gh --help` output, a read-only
> `gh` call against a public repo, or a scratch-folder experiment) · **DOCUMENTED** stated in public docs,
> linked · **INFERRED** my reasoning. Nothing was written to GitHub, Jira or any vault. `gh` 2.103.2
> (2026-10-23) on this Mac. Sign-in facts are in research/87 and not repeated.

## 1. GitHub Issues

### 1.1 Listing "mine"

| Need | REST | `gh` |
|---|---|---|
| Every open item assigned to me, all repos | `GET /issues?filter=assigned&state=open` (filter also `created`, `mentioned`, `subscribed`, `repos`, `all`; `labels=a,b`; `sort=created\|updated\|comments`; `since=<ISO 8601>`) | `gh api '/issues?filter=assigned&state=open'` |
| Same, by search | `GET /search/issues?q=assignee:@me+is:open+is:issue` | `gh search issues --assignee=@me --state=open --json …` (`--include-prs` to add PRs; `--owner`, `--label`, `--updated`, `--sort updated`) |
| One repo | `GET /repos/{o}/{r}/issues?assignee=<login>` (`none`, `*` also accepted; `labels=`) | `gh issue list -R o/r --assignee @me --json …` (`--label`, `--state open\|closed\|all`, `--search`) |
| One item | `GET /repos/{o}/{r}/issues/{n}` | `gh issue view n -R o/r --json …` |

- `/issues` returns pull requests too; a PR is the one with a `pull_request` key. DOCUMENTED
  ([REST issues](https://docs.github.com/en/rest/issues/issues)); VERIFIED: of my first five assigned
  items, one carried `pull_request`. Ducter must keep the key: a PR source and an issue source behave
  differently (a PR has a branch and review state). INFERRED.
- `GET /issues` with `filter=all|repos` is "all issues you can see, regardless of participation".
  DOCUMENTED (same page).
- `gh search issues` excludes PRs unless `--include-prs`; its JSON has `isPullRequest` and
  `repository.nameWithOwner`. VERIFIED (`--help`, one read-only call).
- `/search/issues`: 30 requests/minute authenticated, up to 1,000 results per search; for a GitHub App
  using a user token a query without `is:issue` or `is:pull-request` gets 422, so issues and PRs need
  separate queries. DOCUMENTED ([REST search](https://docs.github.com/en/rest/search/search)).
  Search is an index, so it can lag a fresh assignment; the list endpoints are authoritative. INFERRED.

### 1.2 Fields

- REST (snake_case): `number`, `title`, `body`, `state` (`open`/`closed`), `state_reason`,
  `assignees`, `labels`, `comments` (a count), `updated_at`, `html_url`, `pull_request` (PRs only),
  `repository` (on `/issues`). DOCUMENTED; VERIFIED in a read-only call.
- `gh issue list --json` (camelCase): `assignees, author, blockedBy, blocking, body, closed, closedAt,
  closedByPullRequestsReferences, comments, createdAt, id, isPinned, issueType, labels, milestone,
  number, parent, projectCards, projectItems, reactionGroups, state, stateReason, subIssues,
  subIssuesSummary, title, updatedAt, url`. VERIFIED (`gh issue list --help`). Note `state` comes back
  upper-case (`OPEN`) and an open item's `stateReason` is `""`. VERIFIED.
- `gh search issues --json`: `assignees, author, authorAssociation, body, closedAt, commentsCount,
  createdAt, id, isLocked, isPullRequest, labels, number, repository, state, title, updatedAt, url`.
  VERIFIED.
- **`--json` field names are the interface to depend on:** gh lists them in each command's help and
  leaves the human text free to change; this is a convention, not a written guarantee. INFERRED (the
  formatting help, `gh help formatting`, describes `--json/--jq/--template` but makes no stability
  promise; VERIFIED).

### 1.3 Polling, ETag and rate limits

- Primary limit: 5,000 requests/hour per authenticated user (PAT or OAuth); 60/hour unauthenticated;
  GitHub App installations at least 5,000. DOCUMENTED
  ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
  `/rate_limit` on this account: core 5,000, search 30, graphql 5,000, code_search 10. VERIFIED.
- Secondary limits: at most 100 concurrent requests; 900 points/minute for REST (GET 1 point,
  POST/PATCH/PUT/DELETE 5); generally at most 80 content-creating requests/minute and 500/hour.
  DOCUMENTED (same page). Make requests serially; wait at least 1 s between mutating requests; back
  off exponentially after a secondary-limit failure. DOCUMENTED
  ([best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)).
- **Conditional requests:** "Making a conditional request does not count against your primary rate
  limit if a 304 response is returned" (must be authorized). DOCUMENTED (best practices).
  VERIFIED on `GET /repos/cli/cli/issues?per_page=1`: 200 with `Etag: W/"…"` and
  `X-Ratelimit-Used: 62`; the same request with `If-None-Match: <etag>` gave **304 with Used still 62**;
  a plain request afterwards gave 200 and Used 63. The 200 also carries
  `Cache-Control: private, max-age=60`, so data under a minute old is not refreshed sooner. VERIFIED.
  `GET /issues?filter=assigned` also returns an `Etag`. VERIFIED.
- `gh` exposes this only through `gh api -i -H 'If-None-Match: …'`; `gh issue list`/`gh search` give no
  ETag (they use GraphQL/search). `gh api --cache` is a local cache, not a conditional request.
  VERIFIED (`gh api --help`); that `gh issue list` is GraphQL underneath is INFERRED (from gh's design;
  GraphQL has no 304 path that I found).
- **Notifications API** (`GET /notifications`): optimized for polling with `Last-Modified` →
  `If-Modified-Since`; `X-Poll-Interval` says how often you may poll and may rise under load; a 304
  leaves the rate limit untouched; `reason` includes `assign`, `mention`, `review_requested`. Only a
  **classic** PAT (scope `notifications` or `repo`) works; fine-grained tokens are not supported.
  DOCUMENTED ([notifications](https://docs.github.com/en/rest/activity/notifications)). VERIFIED:
  `X-Poll-Interval: 60`, `Last-Modified` and `Cache-Control: max-age=60` on this account.
- **Webhooks** need a publicly reachable HTTPS receiver. A home on a Mac or a VPS without a public URL
  has none, so: poll, or take events through a relay the home dials out to. GitHub's own advice is
  "subscribe to webhook events instead of polling", and when polling, use conditional requests.
  DOCUMENTED (best practices). INFERRED for the home case.
- **Budget:** one ETag'd `/issues?filter=assigned` per minute costs at most 60 points/hour and ~0 when
  nothing changed; even per-bound-item checks every 5 minutes for 50 items stay under 600/hour of 5,000.
  INFERRED (arithmetic on the documented limits).

### 1.4 Writing back (consent-gated)

- Comment: `POST /repos/{o}/{r}/issues/{n}/comments` `{body}`; `gh issue comment n -R o/r --body-file -`
  (stdin), also `--edit-last` to update one's own last comment instead of adding another. DOCUMENTED,
  VERIFIED (`--help`).
- Close: `PATCH /repos/{o}/{r}/issues/{n}` `{state:"closed", state_reason:"completed"|"not_planned"|
  "duplicate"}` (`reopened`/`null` also accepted; `state_reason` is ignored unless `state` changes);
  issue owners and users with push or Triage access may edit. DOCUMENTED (REST issues).
  `gh issue close n --reason "completed"|"not planned"|"duplicate" [--comment …] [--duplicate-of …]`.
  VERIFIED (`--help`; note the space in `not planned`).
- Close by merge: a PR whose description says `close[sd]|fix(es|ed)|resolve[sd] #n` (or
  `owner/repo#n` across repos) links the issue, and merging that PR **into the default branch** closes
  it; keywords on PRs to any other branch are ignored. DOCUMENTED
  ([linking a PR](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).
  So when a task's work lands as a PR, the honest write-back is `Fixes #n` in the PR body: the close
  happens at the person's own merge, with no separate consent. INFERRED.

### 1.5 Auth and scopes

- **The person's existing `gh` login** (research/87): `gh auth token` or the keyring. Zero setup for the
  developer; the token is usually a classic OAuth token with `repo` (+ `read:org`), which covers list,
  comment, close and notifications. Too broad for a third program to hold, but it is already on the
  machine and tasks use it anyway. INFERRED; the minimum-scope fact is from research/87.
- **Fine-grained PAT:** repository permission **Issues: read** for `GET /repos/{o}/{r}/issues`;
  **Issues: write** (or Pull requests: write) for `PATCH …/issues/{n}` and `POST …/comments`.
  DOCUMENTED ([fine-grained permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)).
  `GET /issues` is not in that table and `/notifications` is classic-only, so a fine-grained token must
  list per repo (or via search). DOCUMENTED for notifications; INFERRED for `/issues`.
- **A GitHub App or OAuth connector** (e.g. through an account service): per-repo install, webhooks
  for free on the app's side, but a hosted receiver; a self-hosted home would still poll. INFERRED.
- The classic token's scopes come back in each response's `X-OAuth-Scopes` header, so Ducter can tell
  whether a write is possible before offering it. VERIFIED (header present).

## 2. Obsidian Tasks

### 2.1 The line

- A task is a Markdown checklist line, `- [ ] …` or `- [x] …`; any other character in the brackets is a
  custom status (`[/]`, `[-]`, `[?]`, `[X]` …). Each status has a type: TODO, IN_PROGRESS, ON_HOLD, DONE,
  CANCELLED, NON_TASK, and a "next status symbol" used when toggled. "Not done" = TODO, IN_PROGRESS,
  ON_HOLD; "done" = DONE, CANCELLED, NON_TASK. DOCUMENTED
  ([Statuses](https://publish.obsidian.md/tasks/Getting+Started/Statuses)).
- Emoji signifiers after the description: ➕ created · ⏳ scheduled · 🛫 start · 📅 due · ✅ done ·
  ❌ cancelled (each with a `YYYY-MM-DD` date) · priorities 🔺 highest, ⏫ high, 🔼 medium, (none)
  normal, 🔽 low, ⏬ lowest · 🔁 recurrence (`every day when done`) · 🏁 on completion `keep`/`delete`
  · 🆔 id (`dcf64c`) · ⛔ depends on (`dcf64c,0h17ye`). Tasks "does not understand unicode Variation
  Selectors" (a hand-typed ⏫ with U+FE0F may not parse). DOCUMENTED
  ([Emoji format](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format)).
- Dataview format alternative: `[due:: 2026-11-20]` or `(due:: …)` with keys `created, scheduled,
  start, due, completion, cancelled, priority` (`lowest…highest`), `repeat, onCompletion, id,
  dependsOn`; when Tasks rewrites a line it always uses square brackets. DOCUMENTED
  ([Dataview format](https://publish.obsidian.md/tasks/Reference/Task+Formats/Dataview+Format)).
  A vault uses one format, set in the plugin's settings; Ducter must read both. INFERRED.
- **Global filter:** optional, empty by default (every checklist item is a task); set to e.g. `#task`,
  only lines containing it are tasks. DOCUMENTED
  ([Global Filter](https://publish.obsidian.md/tasks/Getting+Started/Global+Filter)). The setting lives
  in the vault's `.obsidian/plugins/obsidian-tasks-plugin/data.json`. INFERRED (the plugin's usual
  layout; not opened here).
- **Query blocks are not tasks:** a fenced code block with language `tasks` is a query that renders
  matching tasks (e.g. `due today` / `not done`). DOCUMENTED
  ([About Queries](https://publish.obsidian.md/tasks/Queries/About+Queries)). Any checklist-looking text
  inside any fenced code block (or front matter, or an HTML comment) must be skipped by Ducter's parser.
  INFERRED.

### 2.2 What completing writes

- Turning a task DONE appends `✅ YYYY-MM-DD` (on unless "done dates" is turned off); leaving DONE
  removes it. Cancelling appends `❌ YYYY-MM-DD` likewise. ➕ is added only when "Set created date on
  every added task" is on. DOCUMENTED (Statuses;
  [Dates](https://publish.obsidian.md/tasks/Getting+Started/Dates)).
- **Recurring:** completing a 🔁 task marks it done with the done date and inserts the next occurrence
  **one line above** the original by default; the "Order of the new task" setting can put it below.
  `when done` counts from the completion date. DOCUMENTED
  ([Recurring Tasks](https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks)).
- These are the plugin's effects when the plugin toggles. A program editing the file directly gets
  none of them: ticking `[ ]`→`[x]` from outside adds no ✅ and creates no next occurrence unless the
  writer does it. INFERRED (the docs describe only toggling inside Obsidian). So Ducter must write what
  the plugin would: the ✅ date, and for 🔁 the next line, or refuse recurring tasks and leave them to
  the person.

### 2.3 Where vaults live and how they sync

- **iCloud:** Obsidian's iCloud vaults live in the Obsidian folder of iCloud Drive (the folder with the
  Obsidian icon); on a Mac that is `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>`.
  DOCUMENTED ([Sync your notes](https://obsidian.md/help/sync-notes)) for the folder; the path VERIFIED
  as existing on this Mac (macOS 15.7.9). Offloaded files are unreachable to Obsidian; on macOS 15+ the
  advice is "Keep Downloaded" on the folder. DOCUMENTED (same page).
- Since macOS 14, iCloud Drive runs on File Provider and evicted files are *dataless* (`SF_DATALESS`
  in `st_flags`; reading one triggers a download) rather than the older `.name.icloud` stubs; reports
  conflict on whether stubs still appear in some folders. DOCUMENTED
  ([Eclectic Light](https://eclecticlight.co/2023/10/25/macos-sonoma-has-changed-icloud-drive-radically/),
  [mjtsai](https://mjtsai.com/blog/2023/10/27/icloud-drive-switches-to-dataless-files/)). On this Mac
  no `*.icloud` files were found under Mobile Documents (depth 4), and `find -flags dataless` is
  accepted. VERIFIED. iCloud conflicts surface as a second copy with a number in the name ("note 2.md").
  INFERRED (common iCloud behaviour; not reproduced).
- **Obsidian Sync:** Markdown conflicts are merged with Google's diff-match-patch; other files are
  last-modified-wins; since 1.9.7 a per-device setting can create a conflict file instead. DOCUMENTED
  ([Sync troubleshoot](https://obsidian.md/help/sync/troubleshoot)).
- **git** (the community obsidian-git plugin): scheduled commit-and-sync, pull on startup, in-editor
  conflict resolution; mobile "very unstable". DOCUMENTED
  ([obsidian-git](https://github.com/Vinzent03/obsidian-git)). A Ducter write on the home becomes an
  uncommitted change that the plugin commits on its schedule, or a conflict if another device edited
  the same line. INFERRED.
- **Syncthing:** conflicts become `<name>.sync-conflict-<date>-<time>-<modifiedBy>.<ext>`, the older
  mtime losing; Syncthing itself writes a temp file and renames it into place. DOCUMENTED
  ([Syncthing](https://docs.syncthing.net/users/syncing.html)). Ducter's scanner must ignore
  `.sync-conflict-` files and conflict copies, or it will see every task twice. INFERRED.

### 2.4 Writing safely as a third program

- **Obsidian with the file open:** when a file changes on disk while open, Obsidian reloads it; if the
  editor has unsaved typing (its save window is about 2 s) it shows "modified externally, merging
  changes automatically" and merges, and users report that merge occasionally losing or misplacing
  text. DOCUMENTED (forum, not official docs:
  [toggle request](https://forum.obsidian.md/t/editor-add-a-toggle-to-disable-automatic-merging-of-changes-non-obsidian-sync/14874),
  [merge reports](https://forum.obsidian.md/t/has-been-modified-externally-merging-changes-automatically/111594)).
  No official setting turns it off. DOCUMENTED (same threads).
- **In-place vs rename:** a scratch experiment rewrote one line both ways: an in-place
  `seek(0)/write/truncate` kept the inode; writing a temp file and `rename`-ing it over gave a new inode.
  CRLF endings and a missing final newline survived a byte-level edit of just that line. VERIFIED.
  A rename is atomic (no reader sees half a file) but replaces the file's identity: iCloud/File
  Provider and Obsidian's watcher see a new file, extended attributes and Finder tags are lost unless
  copied, and a dataless original must be downloaded first anyway. An in-place write keeps identity but
  can be seen half-written. For a one-line change to a small note, the window is tiny and identity
  matters more. INFERRED.

**Recommended write procedure (one line, nothing else):** INFERRED, from the above.
1. Never write while the file is dataless or a conflict copy exists beside it; ask the person instead.
2. Read the file as bytes; record `mtime`, size, inode. Detect the line ending per line (keep `\r\n`)
   and whether the file ends in a newline.
3. Find the bound line by its stored *exact text* (and its 🆔 if present), not by line number; skip
   code blocks, `tasks` blocks and front matter. Zero or two matches → don't write; tell the person
   the line moved or changed.
4. Build the new line from the old: change only the status character and append ` ✅ YYYY-MM-DD`
   (the vault's format: emoji or `[completion:: …]`); for 🔁, either insert the next occurrence where
   the plugin's setting says, or refuse.
5. Compare-and-swap: re-stat and re-read just before writing; if `mtime`/size/the line changed, start
   over (at most twice), then give up and ask.
6. Write in place (same inode), splicing only that line's bytes; never re-serialise the file; keep
   encoding, BOM, endings and the final newline. Then re-read and confirm the line.
7. Prefer not to write while Obsidian has the file open with recent edits (mtime within the last few
   seconds): wait and retry, since Obsidian's own merge is the riskiest path.

## 3. Jira (a later adapter)

- **Auth:** Basic with `email:api_token` base64-encoded (passwords deprecated) for scripts; OAuth 2.0
  (3LO) recommended for apps, and "apps that collect customers' API tokens" don't meet Atlassian's
  security requirements. DOCUMENTED
  ([basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)). For a
  self-hosted, single-person Ducter the person's own token is their own use, not an app collecting
  others'. INFERRED.
- **Search:** "The legacy endpoint `/rest/api/3/search` is deprecated and has been fully removed from
  Jira Cloud"; use `/rest/api/3/search/jql`, paginated with `nextPageToken` (no `startAt`). DOCUMENTED
  ([KB](https://confluence.atlassian.com/jirakb/run-jql-search-query-using-jira-cloud-rest-api-1289424308.html);
  announced Oct 2024 as changelog CHANGE-2046, removal date not found). The new endpoint gives no total
  and returns few fields unless `fields=` is set. DOCUMENTED (community threads) / INFERRED. Mine:
  `jql=assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`. INFERRED (standard JQL).
- **Fields:** `key`, `fields.summary`, `fields.description` (ADF), `fields.status{name,
  statusCategory.key}`, `fields.assignee`, `fields.labels`, `fields.updated`, the browse URL
  `https://<site>/browse/<key>`. INFERRED (standard v3 shape; not called).
- **Comments** are Atlassian Document Format in v3:
  `{"version":1,"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"}]}]}`.
  DOCUMENTED ([ADF](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)).
  v2 takes a plain/wiki string. INFERRED (not confirmed on the page read).
- **Closing is a transition, not a field:** `GET /rest/api/3/issue/{key}/transitions` lists the moves
  allowed from the current status (`expand=transitions.fields` for required fields, e.g. resolution);
  `POST` the same path with `{"transition":{"id":"…"}}`, optionally setting fields and adding a comment.
  Needs Browse projects + Transition issues. DOCUMENTED
  ([issues API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)). Each
  workflow differs, so "done" means: pick the transition whose target status category is `done`, and
  ask when there are several or a screen requires fields. INFERRED.
- **Webhooks:** admin UI, or dynamic `POST /rest/api/3/webhook` for OAuth/Connect apps (OAuth: 5 per
  user per tenant, expire after 30 days unless extended); HTTPS only with a publicly trusted
  certificate and Atlassian's IPs allow-listed; up to 5 retries 5–15 min apart. DOCUMENTED
  ([webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/)). A home without a public
  URL polls. INFERRED.
- **Rate limits:** points-based hourly quotas for OAuth/Forge/Connect apps from 2 March 2026 (global
  pool 65,000 points/hour; API-token traffic not affected by the new model); burst ~100 GET/s per
  endpoint; per-issue writes 20 per 2 s and 100 per 30 s; 429 with `Retry-After` and `RateLimit-Reason`.
  DOCUMENTED ([rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)).
- **Data Center / Server:** `/rest/api/2` (+ `/latest`), wiki-markup text instead of ADF, Personal
  Access Tokens (Bearer) instead of email+API token, the old `/search` with `startAt` still present,
  no Cloud rate-limit model; often reachable only inside a company network. INFERRED (from general
  knowledge; not checked this session). The adapter must run on a computer inside that network: a
  worker, not necessarily the home. INFERRED.

## 4. Company-internal trackers (INFERRED)

A generic adapter needs five verbs and one identity:
- `listMine(since?) → Item[]` (cheap to call often; supports "not modified");
- `get(ref) → Item` (title, body as Markdown, state as open/done/other, url, updatedAt, labels);
- `comment(ref, markdown)`; `setDone(ref, reason?)` (or "transitions available" + `transition`);
- `url(ref)` for "open in the tracker";
- a stable `ref` (`github:owner/repo#12`, `obsidian:<vault>/<path>#<line text hash or 🆔>`,
  `jira:<site>/PROJ-123`) and a `capabilities` record (`canComment`, `canClose`, `needsNetwork: <where>`).
Most internal trackers are reachable as a CLI the person already has, an MCP server, or REST behind
SSO; the CLI route (like `gh`) reuses the person's login and needs no secrets in Ducter.

## 5. How comparable agent-task products structure tasks (patterns only)

- **The issue is the product's own object, and the agent run is a child of it.** One product keeps a
  full issue tracker (statuses backlog → todo → in progress → in review → blocked → done/cancelled,
  custom per workspace) and makes each agent run a separate queued row pointing at the issue; one issue
  has many runs. Another keeps tasks inside chat channels with a smaller status set and an append-only
  event log, and requires every task to name the message that asked for it.
- **None of the three open products imports or syncs outside issues.** Trackers like Linear or Jira
  appear only as tools an agent can call. GitHub enters one-way: one product mirrors PRs from a GitHub
  App webhook and links them to its own issue by an identifier in the branch or title, or a closing
  keyword in the body; when every linked PR merges, *its own* issue moves to a status the workspace
  chooses. Another polls PR state for each session's branch (GraphQL, 20 s for the session you're
  looking at, 5 min otherwise, 20 min to discover new PRs, a per-credential token bucket, frozen below
  10% of the rate limit). The outside system is always the source of truth for the PR; none writes back
  automatically. Writes happen only when the person presses a button (comment, merge, ready for review).
- **Attention:** one product has an inbox with severities (action required / attention / info), snooze
  and archive, and approval cards whose arguments the person can edit before approving; another shows
  the agent's own permission/question options in place of the composer with one suggested answer, and
  marks "waiting on you since". One product disables the agent's built-in "ask the user" tool because
  its headless runner can't show it, and routes questions to issue comments instead.
- **Drafts:** composer drafts kept client-side (split into "manual" and "agent-written" slots in one
  product). A closed product seen in a screenshot shows a count of drafts as its own list.
- **Modes and templates:** the closed product's New task composer picks machine, project, harness and
  permission level, a profile, and one of three modes, **Run / Analyze / Wait for Go**, with quick chips
  ("Review PRs"). The open products have plan mode (one), "agent vs manual" creation and scheduled
  runs that either create an issue or just run (another), and saved prompt shortcuts or quick
  actions (assignee + prompt).
- **Where it came from:** each run records its trigger (an assignment, a comment, a schedule, a chat
  message) and the UI quotes the source message or says "no recorded source". The closed product names
  the item in the task's title ("Review pull request owner/repo#93 again") and filters by project.
- **Going on:** the closed product lists running tasks under "Going on {n}", needs-you questions in a
  separate list with recommended options, and has an "Away" switch.

## 6. Naming the Settings page (VERIFIED, LLM raters only)

- **Method:** `claude -p --model haiku --no-session-persistence --tools ""` from a scratch folder, 8 at a
  time; the one `~/.claude/projects` folder the runs made was deleted afterwards. Stimulus: Ducter's real
  Settings list (伙伴, 记忆, 和你的其他 agent 通信, the candidate, 通知, 账号, 聊天软件, 密码和银行卡, 你的设备) in the
  rater's language, the candidate fourth. Three personas (the developer with GitHub issues, the consumer
  with Obsidian and no terminal, the fresh user). Asked: what the row is for, clarity 1-5, would you open
  it, one thing the name might make you wrongly believe.
- **Round 1** (7 candidates x zh/en x 3 personas x name alone or with its list line x 2 runs = 168, with a
  five-way multiple choice): every candidate was read right 75-100% (the choice was too easy, as in
  research/120), and the false readings echoed the choice's "a to-do app built into Ducter". Clarity,
  name alone: 任务来源 / Task sources 3.50 / 3.17; 待办清单 / To-do lists 3.0 / 3.0; 外面的待办 / To-dos from
  elsewhere 3.17 / 2.83; 你的待办 / Your to-dos 3.0 / 3.0; 从哪儿接事 / Where work comes from 2.67 / 3.0; GitHub
  和 Obsidian (the products) 3.33 / 3.33; 你别处的待办 / Your to-dos in other apps 3.17 / 4.0. 你的待办 and 待办清单
  were read as Ducter's own list (8% and 12% picked the built-in app).
- **Round 2** (4 candidates x zh/en x 3 personas x 2 runs = 48, no multiple choice, so nothing primed):
  任务来源 / Task sources 3.33 / 3.17 (several read it as "the task list itself"); 你在别的软件里的待办 / Your
  to-dos in other apps 3.83 / 3.67; 别的软件里的待办 / To-dos in other apps 3.67 / 3.5; **待办来源 / To-do sources
  3.83 / 3.5**, read by all six zh raters as "where my to-dos come from, connected here"; every rater
  would open each. The long literal name won narrowly in English but is twice the length on a rail where
  other names are four characters; 待办来源 / To-do sources ties it in Chinese, avoids 任务 (Ducter shows a task
  as 事) and "your" (read as Ducter's own list).
- **Not tested:** humans; the words on the task's chip (the app's own mark and its number need no word).

## Implications for Ducter

1. **GitHub listing:** `GET /issues?filter=assigned&state=open` through `gh api` with `If-None-Match`,
   once a minute while the home is up (honour `Cache-Control: max-age=60`); 304s are free, so the cost is
   near zero. Keep `pull_request` to tell PRs apart. Fall back to per-repo `/repos/{o}/{r}/issues?
   assignee=` when the token is fine-grained.
2. **A bound item:** re-check it with its own ETag'd `GET /repos/{o}/{r}/issues/{n}` every 5 minutes
   while its task is live, and when the task finishes; this catches "closed elsewhere" and new comments.
   With a classic token, `/notifications` with `If-Modified-Since` at `X-Poll-Interval` (60 s) is the
   cheaper "something happened" signal. No webhooks: the home has no public URL. Revisit only if a
   relay already exists.
3. **No new sign-in for developers:** reuse the person's `gh` login (research/87), read `X-OAuth-Scopes`
   to know whether comment and close are possible, and offer them only then.
4. **Write-back is outward and goes behind Go:** comment (`gh issue comment --body-file -`) and close
   (`gh issue close --reason completed|"not planned"`), each recorded in Done for you, serially and at
   least 1 s apart. When the work is a PR, put `Fixes owner/repo#n` in the PR body and let the person's
   merge close it: no extra Go.
5. **Obsidian:** parse both formats, honour the vault's global filter, skip code/`tasks` blocks and
   conflict copies. Bind by exact line text (+ 🆔). The tick is the seven-step procedure in §2.4:
   compare-and-swap on bytes and mtime, one line spliced in place, endings kept, `✅ date` appended as the
   plugin would; refuse (and ask) for recurring tasks, dataless files, a conflict copy, or a file edited
   in the last few seconds. Watch the vault with the file watcher plus a slow rescan; no polling cost.
6. **Jira later:** `/rest/api/3/search/jql` with `assignee = currentUser() AND statusCategory != Done`,
   polled every few minutes; comments in ADF; "done" is a chosen transition into the `done` category,
   asking when the workflow offers several or needs fields. Data Center runs on a worker inside the
   company network.
7. **One adapter shape for all:** `listMine`, `get`, `comment`, `setDone`, `url`, a stable `ref` and
   `capabilities`; the partner offers items, never starts them; the source's state wins on conflicts
   (closed outside → the partner says so and asks whether to stop the task).
8. **From comparable products:** show where a task came from on the task itself (the item's ref in its
   title line), keep the outside item as the source of truth, never write back without the person, and
   keep "needs you" as one list across all tasks.
9. **The page's name:** 待办来源 / To-do sources (§6), with a list line that names GitHub and Obsidian.

**Summary.** GitHub: list mine with `/issues?filter=assigned` (includes PRs), poll once a minute with
ETag (a 304 costs nothing, verified), 5,000/h core and 30/min search, write back with `gh issue
comment`/`close --reason` behind Go, or close by `Fixes #n` at merge. Obsidian: `- [ ]` lines with emoji
or Dataview fields; the plugin adds `✅ date` and a new recurring line above; from outside, splice one
line in place after a compare-and-swap, keep endings, skip query blocks and conflict copies, and refuse
when Obsidian or sync might be mid-change. Jira: `/search/jql` (old `/search` removed), ADF comments,
closing is a workflow transition. No open comparable product syncs outside issues; they link PRs one
way and write only on a button press.
