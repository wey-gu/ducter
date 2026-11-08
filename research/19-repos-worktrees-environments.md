# 19: Repos, worktrees and environments

Researched 2026-11-08. This report checks the stances in `design/product-model.md`
("Repos: yes, inside projects", "Worktrees: automatic, invisible") against real products.
Read `02` first: it already covers how Conductor, Lody, Multica, Raft and herdr drive
harnesses. This report covers only how they model repos and environments.

**Sources.**
- Shallow clones, read-only and never executed, under
  `<scratch>/repos/`
  (written `R/` below).
- Official docs, fetched 2026-11-08.

**Labels.**
- **V**: verified in source (path:line) or on an official docs page I fetched.
- **V-s**: from an official-domain search snippet only.
- **2nd**: from a third-party page or forum.
- **I**: my inference.

**Renames since mid-2025.**
- Codex: docs moved to learn.chatgpt.com; the old cloud environments page is now "Legacy".
- Copilot: "coding agent" is now "Copilot cloud agent".
- Cursor: environments are now "Builds".
- Devin: environments are now "blueprints".
- Factory: docs moved to docs.factory.com, which adds "Environments" and "Droid Computers".
- Conductor: the cloud product shuts down 2026-11-20 (see `02`).

---

## 1. How each product models repos and environments

### 1.1 Conductor (closed Mac app)

Sources: conductor.build/docs/{concepts/git-worktrees, concepts/workspaces-and-branches,
reference/scripts, reference/checkpoints, faq} and `/.well-known/agent-skills/conductor/SKILL.md`.
All V unless marked.

**Repos and workspaces**
- **Repo is first-class.** One project is one repo. You add one by:
  - "Open project": a local folder.
  - "Open GitHub project": uses `gh auth status`.
  - "Quick start": creates a new repo.
- **Workspace = a worktree.**
  - Lives at `~/conductor/workspaces/<repo>/<city-name>`, for example `warsaw-v2`.
  - Each workspace gets a new branch from the configured base. Conductor fetches origin
    first and does not move the root checkout.
  - The first chat tells the agent to rename the branch to match the task.
  - "A branch can only be checked out in one workspace at a time."
  - A workspace can start from a branch, a PR, a GitHub issue or a Linear issue.
  - A `.context/` folder holds notes outside git.
  - Conductor says isolation is "development isolation, not a security boundary".
- **Multi-repo.**
  - 2nd: `/add-dir` links in other workspaces.
  - V: in a monorepo, a workspace hides unselected directories with sparse checkout.

**Settings and scripts**
- **Settings precedence**, highest first:
  1. `~/.conductor/settings.managed.toml`
  2. `<repo>/.conductor/settings.local.toml`
  3. `<repo>/.conductor/settings.toml`, which is read from the **remote default branch**,
     so it must be merged before it takes effect
  4. `~/.conductor/settings.toml`
  5. defaults

  The legacy `conductor.json` is ignored once `settings.toml` exists.
- **Scripts.**
  - `setup` runs after checkout.
  - Run actions are defined as `scripts.run.<id>` with `{command, args, cwd, default, icon,
    hide, available_in}`.
  - `archive` runs before archiving, to clean up resources outside the workspace.
  - Shells are non-interactive. Stopping sends SIGTERM to the process group, then SIGKILL
    after 5 s.
  - `scripts.run_mode = concurrent | nonconcurrent`. "Nonconcurrent" stops other
    workspaces' run actions, for projects with a fixed port, DB or Docker stack.
- **Env and ports.**
  - Env vars: `CONDUCTOR_WORKSPACE_{NAME,ID,PATH}`, `CONDUCTOR_ROOT_PATH`,
    `CONDUCTOR_DEFAULT_BRANCH`, `CONDUCTOR_IS_LOCAL`.
  - `CONDUCTOR_PORT` starts a block of **10 ports** per workspace (local only).
  - Files to copy are resolved in this order: `.worktreeinclude` → `file_include_globs` →
    the default `.env*`.

**Checkpoints, PRs and archive**
- **Checkpoints.** Before each agent response, Conductor stores the branch state in a
  private git ref.
  - Revert *deletes* the messages from that turn on and reverts the code, so the agent
    forgets them.
  - Conductor warns to use it with care when several chats share a workspace.
- **PRs.** A "Create PR" action sends a customizable prompt to the agent.
- **Archive and restore** (2nd, changelog).
  - 0.33.5 saves git state, including uncommitted files.
  - 0.46.0 made archive instant and added restore from History.

**Lesson.** Conductor's whole value is this thin workspace layer, and it is cheap to rebuild.
The weak points:
- revert deletes conversation history;
- the repo config is read from the remote, so it lags behind local changes;
- there is no story for more than one machine.

### 1.2 Lody (open source; the closest analogue to Ducter)

Sources: `R/lodyai-lody/specs/session-worktree-lifecycle.md` (SWL),
`specs/multi-repo-projects.md` (MRP) and `specs/workspace-branch-state.md` (WBS). All V.

**Layout and creation**
- **Layout.**
  - Worktrees: `<data>/repos/<repo>/worktrees/<session>`.
  - GitHub repos are cloned into a **bare cache** `<data>/repos/<repo>/bare.git`.
  - Local repos use the original repo's `.git`.
  - Sessions with no project get a chat workdir at `<data>/chats/<session>` (SWL:88-89,
    MRP:146-148).
- **Creation timing.** A worktree is created when the first turn is dispatched, "never while
  the user is still writing a draft". Speculative worktrees caused leaks (SWL:25-31).
- **Setup.** A setup script and a cleanup script, each with a 10-minute timeout
  (`packages/shared/src/project.ts:17-18`). A failure kills the whole process group
  (`worktree-setup-runner.ts:54-57`).

**Branch naming**
- The temporary branch is `session/<id8>` for GitHub repos and `lody/<id12>` for local ones
  (`apps/cli/src/session/worktree/branch-name-allocation.ts:90-96`).
- A collision gets a `-N` suffix. The collision check also catches namespace clashes:
  `a` against `a/b` (`branch-name-allocation.ts:47-60`).
- On the first task, the prompt asks the agent to rename the *verified* old ref to a short
  task name and to pick another name if that one is taken. It is "agent guidance, not a
  guarantee" (WBS:43-57).

**Archive and restore: state reconciliation, not commands (SWL:83-125)**
- Only the daemon that owns a machine touches that machine's disk.
- On archive:
  1. The cleanup script runs once.
  2. Uncommitted, non-ignored changes become a **backup commit** on the session branch.
  3. The directory is removed. The **branch is never deleted** by archive, restore or
     delete.
- If the backup commit fails, the directory is not removed. The daemon retries with backoff.
- Unknown directories are left alone. The daemon acts only after it has complete metadata.
- Archive works even while the owning machine sleeps: the machine reconciles when it wakes.
- Restore recreates the worktree from the branch and reruns setup.
- An earlier design used per-machine command queues. It lost acknowledgements and was
  dropped (SWL:164-172).
- PR auto-archive fires on merged or closed, but only once *all* of the session's PRs are
  terminal (SWL:158-162, MRP:277).

**Multi-repo "Project" (MRP)**
- A project is made of **Members**: a GitHub repo, a local git repo, or a non-git folder.
- Members are deduplicated by repo identity: the GitHub numeric ID, or
  `(machineId, localProjectId)` for a repo with no remote (MRP:27-31).
- A **repository Member** can run on any machine. A **machine-bound Member**, i.e. a folder
  picked on one machine, pins the whole Project to that machine (MRP:32-40).
- If a machine has a local clone whose remote matches, Lody uses it. Otherwise a managed
  deployment clones from GitHub, while the open-source desktop "never clones" and shows the
  Project as unavailable on that machine, with the reason (MRP:243-252).
- **Flat layout.** The main directory `worktrees/<session>/` holds `web/`, `api/` and
  `api/proto` (a submodule). The main directory is not itself a git repo (MRP:133-149).
- **Access.**
  - Every git Member gets a worktree.
  - A non-git folder is passed as `additionalDirectories`, or as a symlink. It is **not
    isolated**, and the UI says so (MRP:161-173).
  - Paths come only from the machine registry, never from the agent.
- **Submodules.** The task branch starts at the gitlink commit. Create PR opens the child PR
  first, then the parent PR, and links them (MRP:186-211).
- **One PR per Member.** "Create PR" opens the PRs together and links them in their bodies.
  "Current PR" is tracked per repo (MRP:262-277).
- **Project instructions.** These say what each repo is and how the repos relate. They are
  frozen into each conversation's snapshot (MRP:213-227).
- **Paths.** No absolute host paths leave the machine. Files are addressed as
  `(rootId, relativePath)` (MRP:351-375).

### 1.3 Multica (open source)

Sources under `R/multica/server/`. All V.

- **Repos.** A workspace keeps a repo **registry of URLs** (`cmd/multica/cmd_repo.go:20-45`).
  The daemon keeps bare clone caches (`internal/daemon/repocache/cache.go:1-3`).
- **Checkout is lazy and pulled by the agent.** `multica repo checkout <url>` is "used by
  agents to check out repos on demand" (`cmd_repo.go:50-57`). Running it again never discards
  work: a dirty or unpushed checkout is kept and only fetched. `--fresh` discards it.
  - I: this is the most natural model for multi-repo work. The task names a set of repos,
    and the agent adds more as it finds it needs them.
- **Branches.** `agent/<agent-name>/<task-id>` (`repocache/cache.go:893-894`). Stale
  `agent/*` branches are garbage-collected (`cache.go:1402`).
- **Local directory resources** (`internal/daemon/local_directory.go:24-28, 80-140`).
  - Mode `in_place` or `worktree`.
  - An `in_place` task takes a **per-path mutex** against "two long coding runs
    interleaving". A chat turn is exempt: "is it a second heavyweight writer?" If the lock
    were not exempt, chat would queue behind a 20-minute build (#7344).
  - An unknown mode **fails** the task rather than falling back to `in_place`: "ignoring a
    request to not touch someone's files is a broken promise".
- **Auto-commit.** If the agent makes no commit, everything not gitignored is committed for
  it at the end of the run (`prompt.go:214-217`).
- **GC** (`internal/daemon/config.go:73-100`).
  - Runs every 2 h.
  - Regenerable artifacts (`node_modules`, `.next`, `.turbo`) are removed 12 h after the
    task completes. `dist`, `build` and `.venv` are deliberately left alone.
  - Orphans: 72 h. Bare caches: evicted after 30 days unused.
  - Completed environments: 14 days on cloud. Self-host keeps them until the issue closes.
  - `diskusage.go` reports bytes per task and the ratio that GC could reclaim.

### 1.4 Raft, herdr, dsh-superagent

- **Raft** (V, `R/raft-source/manual/agent-knowledge/agent.md:95-135`, `computer.md`).
  - No repo object. Each agent gets one **workspace directory** on its Computer and clones
    whatever it needs.
  - "Move to another computer" copies the whole workspace and skips `node_modules`, `.venv`,
    `.cache`, `dist` and `target`. A `.raftmigrateignore` file lists what else to skip.
    Migration refuses more than 2,000,000 files. The old workspace is kept for 30 days.
  - Admins can scan and delete workspaces per machine.
- **herdr** (V, `R/herdr/src/worktree.rs:21-32, 171-215`; `config/model.rs:1193`).
  - Worktrees at `~/.herdr/worktrees/<repo>/<branch-slug>`.
  - Generated branch names follow the pattern `<prefix>/brave-river-1a2b`.
  - Refuses to remove a dirty worktree.
- **dsh-superagent** (from `02`). One directory per ticket, prepared by a user `prepare`
  command with a 10-minute cap.

### 1.5 Claude Code (CLI and desktop)

Source: https://code.claude.com/docs/en/worktrees.md, plus desktop.md and
settings-reference.md. All V.

**Creating worktrees**
- `claude -w <name>` creates `.claude/worktrees/<name>/` on branch `worktree-<name>`. With no
  name, it generates one such as `bright-running-fox`.
- `-w "#1234"` or a PR URL fetches `pull/N/head` into a branch `pr-<N>`.
- `worktree.baseRef` is `fresh` (`origin/<default>`, fetched if older than 24 h) or `head`.

**Subagents and cleanup**
- A subagent with `isolation: worktree` gets a temporary worktree from the default branch,
  not from the parent's HEAD. It is removed automatically if unchanged.
- A periodic sweep removes worktrees older than `cleanupPeriodDays`. It keeps any worktree
  that holds work, and any worktree it did not create.
- Claude holds a `git worktree lock` while an agent runs.
- `-p` runs never clean up after themselves.

**Isolation enforcement**
- Claude blocks Edit/Write into the main checkout, and Bash cwd in the main checkout.
- It blocks git redirects (`-C`, `GIT_DIR`) and refuses unverifiable git commands.
- It does **not** catch `cp` or shell redirects into the main checkout.

**Hooks and settings**
- `WorktreeCreate` and `WorktreeRemove` hooks replace git entirely, for SVN, Perforce or hg.
  When a `WorktreeCreate` hook is set, `.worktreeinclude` is not processed.
- `.worktreeinclude` (gitignore syntax) copies files that are both ignored and matched.
- `worktree.symlinkDirectories` and `worktree.sparsePaths` are available settings.

**LFS and repo config**
- Since 2.1.247, Claude skips filter drivers defined in the repo's own config, because an
  agent could plant one. As a result, LFS files arrive as pointer files and need `git lfs
  pull`.
- Creation is refused when the repo config contains `includeIf` or a custom LFS transfer.

**Desktop app**
- A Worktree toggle per session, plus a branch-prefix setting.
- "Auto-archive after PR merge or close".
- Archived worktrees that hold changes are deleted about 30 days after archive.
- `.claude/launch.json` with `autoPort: true` picks a free port. The dev server must read
  `PORT`.

### 1.6 Codex (app and cloud)

Sources: learn.chatgpt.com/docs/environments/{git-worktrees, cloud-environments.md,
cloud-environment} and docs/cloud/internet-access.

**App worktree mode (V)**
- The composer offers Local (foreground) or Worktree (background).
- Worktrees live in `$CODEX_HOME/worktrees`. Each starts from the selected branch's HEAD
  **plus its uncommitted changes**, in detached HEAD. "Create branch here" names a branch.
- Codex **keeps the 15 most recent** worktrees and deletes older ones, except those tied to
  pinned or in-progress chats. It **snapshots before deleting**, and the worktree is restored
  when you reopen the chat.
- It reads `.worktreeinclude` and copies `AGENTS.override.md` automatically.
- If a branch is already checked out elsewhere, the user sees git's error: `'feature/a' is
  already used by worktree at …`.

**Cloud (new model, V)**
- An environment is a set of GitHub repos.
- **Codex itself inspects the repos, installs dependencies and tests the workflow.** You
  review the setup report and click **Publish**. The setup is recorded as an install script
  plus a "start skill" for services and readiness checks.
- Publishing captures the prepared filesystem. Background refreshes keep dependency caches
  current.
- A task's VM state is kept for 7 days.
- **HTTP secrets**: programs see only a placeholder. A proxy substitutes the real value on
  HTTPS for the domains you allow. Internet access has a toggle, a package-manager preset and
  an allowlist.

**Cloud (legacy model, V)**
- A setup script, plus a maintenance script that runs when a cached container resumes.
- Containers are cached for 12 h.
- Secrets are available to setup only and are removed before the agent phase.
- Internet is off by default during the agent phase.

### 1.7 Other cloud agents

All V unless marked.
- **Cursor cloud agents** (cursor.com/docs/cloud-agent/{setup, builds, security-network}).
  - Multiple repos per environment, a "repo group", each cloned onto the machine.
  - `.cursor/environment.json` defines `build` (a Dockerfile), `install`, `start`,
    `terminals` (shared tmux) and `snapshot`.
  - A **Build** is a bootable disk snapshot, recorded with each repo's SHA. Builds go stale
    after 24 h, and then the agent pulls at start.
  - Agent-led setup takes "<10 min".
  - Secrets come in three kinds: env vars, which the agent sees; runtime secrets, shown as
    `[REDACTED]` in transcripts; and build secrets.
  - The agent opens PRs and auto-fixes CI.
  - The branch prefix `cursor/` is reported on the forum only (2nd).
  - Local Cursor: `.cursor/worktrees.json` (`setup-worktree[-unix|-windows]`) and
    `cursor.worktreeMaxCount` (default 25 per machine).
- **Jules** (jules.google/docs/environment).
  - One repo per task.
  - A per-repo "Initial Setup" script, then "Run and Snapshot", which is reused for future
    tasks in that repo.
  - "Publish branch" or "Publish PR".
- **Devin** (docs.devin.ai/onboard-devin/environment, blueprint-reference).
  - Repos are cloned under `~/repos/<name>`, up to 10 in parallel, onto one machine.
  - **Blueprints** come in enterprise → org → repo tiers, which add to each other:
    - `initialize`: baked into the snapshot.
    - `maintenance`: runs at build. At session start it is shown to the agent, not
      auto-run.
    - `knowledge`: commands that are never executed.
  - A health check runs before each snapshot. Rebuilds happen about every 24 h, plus on
    change.
  - Build-only secrets are scrubbed before sessions.
  - The default flow is to ask "Set up your environment for this repo".
- **Factory** (docs.factory.com/docs/environments).
  - Up to 200 repos per environment.
  - Build order: a global setup script, then per-repo setup scripts, then a snapshot.
  - Each instance is fresh and does not share working-tree changes.
  - **Droid Computers** are persistent VMs built from a snapshot. They auto-pause when idle
    and are not updated by later rebuilds.
- **GitHub Copilot cloud agent** (docs.github.com/…/customize-the-agent-environment,
  risks-and-mitigations).
  - Setup is a `copilot-setup-steps` Actions job, read from the default branch, capped at
    59 minutes.
  - The firewall is on by default, with an allowlist.
  - It can push **only to one `copilot/*` branch**. Its PR is a **draft that a human must
    merge**.
  - Actions mode covers one repo. The new "cloud sandbox" mode spans repos in one org, but
    has no custom setup.
- **OpenHands** (docs.openhands.dev/…/customization/repository).
  - `.openhands/setup.sh` runs every time it starts work on the repo.
  - Stop hooks in `.openhands/hooks.json` gate completion.
  - One container per conversation, started lazily, stopped after 1200 s idle.
  - The local workspace is a bind mount.

### 1.8 Summary matrix

| | Repo object | Add | Multi-repo | Machine binding | Env unit | Cleanup |
|---|---|---|---|---|---|---|
| Conductor | project = 1 repo | folder / GitHub / new | sparse; `/add-dir` (2nd) | one Mac | worktree + 10 ports | archive script; restore |
| Lody | Project of Members | folder / GitHub / multi | yes: flat dir, linked PRs | machine-bound vs portable | main dir of worktrees | reconcile, backup commit, keep branch |
| Multica | registry of URLs | URL | agent `repo checkout` on demand | bare cache per daemon | task dir | TTL GC with artifact patterns |
| Raft | none | agent clones | ad hoc | agent tied to one computer | per-agent workspace | manual; migrate |
| Claude Code | the cwd repo | n/a | no | local | `.claude/worktrees/*` | sweep, `cleanupPeriodDays` |
| Codex app | the cwd repo | n/a | no | local | `$CODEX_HOME/worktrees` | keep 15, snapshot first |
| Codex cloud / Cursor / Devin / Factory | env → repos | GitHub app | yes | cloud VM | snapshot / Build | ephemeral, 7-day state (Codex) |
| Copilot | repo | GitHub | sandbox mode only | Actions runner | runner | ephemeral; draft PR |

---

## 2. Git worktree mechanics and pitfalls

Sources: git-scm.com/docs/{git-worktree, gitrepository-layout, githooks}. V unless marked.

**What a worktree shares**
- Worktrees share `objects`, `refs`, `config`, **`hooks`**, `info` and `packed-refs`. Each
  worktree has its own `HEAD`, `index` and `config.worktree`.
- I: because hooks are shared, an agent that writes to `.git/hooks` in any worktree runs code
  in all of them. HN #49111625 says it plainly: worktrees isolate *changes*, not *behavior*.

**Branch rules**
- A branch can be checked out in only one worktree at a time.
- This is the natural **write lease**: one writer per branch, enforced by git itself.

**Removal**
- A directory deleted by hand leaves admin entries behind. `git worktree prune` clears them.
- `remove` refuses dirty worktrees, and worktrees with submodules, unless given `--force`.
- `lock` blocks prune. A locked worktree needs `--force` twice to remove.
- A worktree moved by hand needs `git worktree repair`.

**Submodules and LFS**
- git's own docs: submodule support is "incomplete". They do not recommend multiple
  checkouts of a superproject.
- Lody handles this with `submodule update --init --recursive` after creating the worktree,
  plus a branch at the gitlink commit (§1.2).
- LFS objects are shared through the common dir (2nd). A Claude-created worktree gets LFS
  pointer files only (§1.5).

**Disk usage.** Every worktree rebuilds its gitignored artifacts.
- cargo #16804 (V): 26 worktrees accumulated 105 GB of `target/`; 457 disk-full events.
- claude-code #63087 (V): ~80 GB from 27 orphaned agent worktrees.
- Cursor forum /t/146189 (V): 9.8 GB in 20 minutes from a 2 GB repo.

**Mitigations that work**
- **pnpm:** the content-addressed store hardlinks into each `node_modules`.
- **bun:** installs with `clonefile` on macOS and hardlinks on Linux. Its global virtual store
  explicitly cites worktrees (2nd).
- **uv:** hardlinks only work when the cache and the venv are on the same filesystem.
  Otherwise uv silently copies (2nd).
- **APFS:** `cp -c` / `clonefile(2)` copies `node_modules` copy-on-write, which is worth
  doing only when the lockfiles match. Linux needs btrfs or XFS reflinks; ext4 cannot do it
  (2nd).
- **Rust:** keep a `target/` per worktree, and use **sccache with `SCCACHE_BASEDIRS`**, which
  strips the worktree path from cache keys. Do **not** share `CARGO_TARGET_DIR`: cargo's
  build-dir lock serializes parallel builds (V, #16804). workmux says "don't symlink
  target/".
- **Reclaim after completion:** delete regenerable directories after a task is done, as
  Multica does at 12 h.

**Mitigations that bite**
- Symlinking `node_modules` creates shared mutable state. It breaks when dependencies differ
  between branches (V, workmux; Claude's `symlinkDirectories` is off by default).

**Ports**
- Worktrees do not isolate ports, databases or Docker stacks.
- Known fixes:
  - a port block per workspace (Conductor);
  - a port hashed from the branch, in 10000-19999 (worktrunk `hash_port`, V);
  - `PORT` plus `autoPort` (Claude desktop);
  - `docker compose -p <ws>` per worktree;
  - an exclusive "nonconcurrent" mode for fixed resources (Conductor).

**Env files**
- `.worktreeinclude` is now a de facto convention across tools. It is read by Claude Code,
  Codex app, Conductor and worktrunk (V).
- Cursor uses `cp $ROOT_WORKTREE_PATH/.env .env` in `worktrees.json`.

---

## 3. What users complain about

- **Cleanup that never happens, or happens wrongly.**
  - claude-code #26725 (V, open since 2026-02): stale worktrees are never cleaned up. Users
    report 113 worktrees / 3 GB, and 13 worktrees / 13.8 GB. Stale locks need `--force
    --force`.
  - The opposite failure: #88255 and #79899 report auto-cleanup deleting live worktrees or
    unpushed commits (mirror).
  - vibe-kanban #3329 (V): workspaces vanish from their cards after cleanup.
  - Codex #14575 (2nd): stale worktrees block branch operations.
- **Edits leaking into the main checkout.**
  - claude-code #29083 (V): subagent paths resolve to the main tree, so edits land there
    silently.
  - About a dozen mirrored duplicates exist (#44220 … #76197).
  - Claude now enforces four isolation checks, but `cp` and shell redirects still get
    through.
- **Disk usage.** See §2. The Cursor forum asks for a way to *disable* automatic worktrees
  (/t/146189).
- **Setup flakiness.**
  - Cursor: `worktrees.json` not detected (/t/149227), the agent not waiting for setup
    (/t/140187), and "Failed to create Git worktree" (/t/140278).
  - vibe-kanban #2975: `copy_files` fails silently.
  - Codex #12346: `invalid reference: main` on repos whose default branch is master.
  - vibe-kanban #2984: "Branch not found: master".
- **Untracked files missing in the new worktree.** Conductor's Show HN #44628409 (V): "they
  don't include things that are not tracked by git". `.worktreeinclude` exists to fix this.
- **Paths are part of identity.**
  - vibe-kanban #2993 (V): renaming a workspace breaks Claude resume, because the session
    key lives under `~/.claude/projects/<path>`.
  - Claude: "belongs to a different repository" after copying or moving a project.
- **Location.** Users want worktrees somewhere else: Codex #10599, Cursor /t/149222, and
  claude-code #70324 ("incredibly frustrating").
- **Skepticism about the whole layer** (HN #44628409): it "adds an unnecessary layer", and
  human review, not parallelism, is the real bottleneck.

---

## 4. Answers to the brief's questions

**Q1. Is the repo first-class? How is it added? Multi-repo?**
- Every product has a repo object except Raft.
- Ways to add one: a local folder (Conductor, Lody), a GitHub app or connector (all cloud
  products), or a URL registry with lazy clone (Multica).
- Multi-repo is standard in the cloud products (Cursor, Devin, Factory, Codex), but each of
  them clones *everything* into one VM.
- Only Lody has a thorough local design: Members, a flat directory, one worktree per Member,
  one PR per Member, linked bodies, and submodule-first ordering.
- Multica's on-demand `repo checkout` is the lighter alternative.

**Q2. The same repo on several machines.**
- Only Lody models this. Repo identity is the remote. Each machine publishes which of its
  folders map to which repo. A repository Member runs wherever a copy exists. A folder Member
  pins the work to its machine.
- Clone-on-demand happens only in "managed" mode. The open-source desktop shows "unavailable
  on this machine".
- Raft moves a workspace by copying it.
- No product moves *uncommitted* work between machines, except through a branch.

**Q3. Worktree lifecycle.**
- **Creation:** at the first dispatch, never at draft time (Lody).
- **Naming:** a temporary prefixed id, then the agent renames it to a slug (Lody,
  Conductor).
- **Setup:** a script with a 10-minute timeout, plus `.worktreeinclude`.
- **Caches:** pnpm, bun, uv and sccache, as in §2.
- **Ports:** a block per workspace.
- **Archive:** a backup commit, then remove the directory and keep the branch. Done by
  reconciliation (Lody).
- **Caps:** a count cap (Codex 15, Cursor 25) or TTL GC (Multica).
- **Conflicts:** one branch per worktree, plus a per-path mutex for in-place work that
  exempts readers (Multica).

**Q4. Non-repo work.**
- Lody gives a no-project session a chat workdir. On archive the workdir is removed only if
  empty. On delete it is removed entirely.
- Raft gives each agent a workspace directory.
- Nobody has a first-class "browser" or "phone" environment, apart from preview tunnels
  (Lody quick-tunnel) and launch configs (Claude desktop).
- Artifacts:
  - Conductor: `.context/`.
  - Cursor: attaches artifacts to PRs.
  - Multica: GCs artifacts by pattern.

**Q5. PR and merge UX.**
- **Diff review:** in-app diff plus comments (Conductor DiffComment, Lody Code Collab).
- **Checkpoints:** private refs per turn (Conductor).
- **Create PR:** an agent prompt (Conductor), linked PRs across repos (Lody), or a
  draft-only PR with human merge (Copilot).
- **After review:** CI autofix (Cursor), and auto-archive on merge (Claude desktop, Lody).
- Nobody makes rebase or conflict resolution a first-class decision. It is left to the agent
  or the user (I).

**Q6. Complaints.** See §3: cleanup in both directions, leaks into the main checkout, disk,
untracked files, setup detection, and path-keyed identity.

---

## 5. Recommendation for Ducter

The stances in product-model.md mostly survive. This section amends them and makes them
concrete.

### 5.1 Object model

```
Project (optional, user-facing)  name, instructions ("web is Next.js; api is Go; change proto first"),
   │                             rules (default body, setup), 0..n repos, 0..n folders, docs
   ├─ Repo        identity = remote (GitHub numeric id when known) | (machine, path) if no remote
   │    └─ Checkout   (repo × machine): path, default branch, last seen, dirty?  — discovered, not configured
   ├─ Folder      a non-git directory on one machine (never isolated; UI says so)
   └─ Recipe      setup / run / cleanup commands, .worktreeinclude, port needs, exclusive resources
Window ─ Environment (one per window, frozen at creation, like Lody's snapshot)
           kind: none | scratch | repo(s) | browser | phone | machine
           machine, members[]: {repo, base_ref, branch, worktree_path, mode: worktree|in_place|read}
           ports: block of 10, leases: [branch, path globs, exclusive resources]
Artifact  promoted out of the environment into the control plane's blob store (principle 19)
```

**Rationale**
- **Repo vs Checkout.** Lody's split between repository and machine-bound Members is the only
  design that handles a Mac plus a Linux box.
- **Checkout is discovered.** The runner scans for checkouts and publishes repo identity,
  never paths, to the control plane. Lody's MRP:309-313 does this, and it matches principle
  19.
- **Recipe is separate from Repo.** A recipe can come from the repo (`.ducter/recipe.toml`
  or another tool's `.conductor`, `.cursor` or `.codex` file) or from Ducter's own store.
- **Environment, not Workspace.** "Workspace" already names the conductor-depth UI zoom
  level.
- **No user-facing word for any of this.** The user sees "the HawDB project" and the window.
  Zoomed in, they see "Branch `ducter/fix-login` on Mac mini".

### 5.2 Default behaviors

1. **Picking the environment kind.** Ducter infers it from the brief's `scope.write_set`:
   - no repo in the brief → `none` / `scratch`;
   - reads a repo → `read`;
   - writes a repo → a `worktree` per written repo.

   **Amend "on first write" to "at spawn when the brief declares a write set".** There are
   two reasons:
   - A harness starts writing in its first turn, so a lazy switch would need the harness to
     change cwd mid-session, which is fragile.
   - Lody found speculative creation leaks. So create the worktree at *dispatch*, not at
     draft time.

   If a reader window discovers it needs to write, that is a handoff to a new writer window
   on a new worktree (principle 13).
2. **Readers.**
   - Read-only windows read the main checkout, with writes denied by harness permissions.
   - Mark the evidence "as of `<sha>` plus uncommitted changes".
   - Readers never take the path lease (Multica's chat exemption).
3. **Multi-repo.**
   - The brief names the repos a window needs. Each gets a worktree under a flat main
     directory `~/.ducter/env/<fw>/{web,api}`, following Lody.
   - A window can call `ducter.repo_checkout(name)` to add a repo mid-task, following
     Multica. It has to be the window's own tool, because the window cannot move its cwd.
   - Submodules follow Lody's rules.
   - PRs are one per repo, linked to each other, and created as **one intent**.
4. **Location.**
   - `~/.ducter/worktrees/<repo-id>/<fw-id>` on every machine: outside the repo, so it never
     dirties `git status` and never trips Claude's in-repo `.claude/worktrees` rules.
   - Ducter creates the worktree itself and launches the harness with `cwd` set to it. It
     does **not** use `claude -w` or the Codex worktree mode, so the lifecycle stays in one
     owner.
   - Keep the path stable for the life of the window. Harness session keys depend on it
     (vibe-kanban #2993).
5. **Source.**
   - Use the machine's existing checkout's `.git` when one exists. That gives shared
     objects, and the user's own credentials.
   - Otherwise, and only on machines where the user allowed cloning, clone into a bare cache
     `~/.ducter/repos/<repo-id>.git`, as Lody and Multica do.
   - Always fetch the base ref first and never touch the user's checkout (Conductor).
6. **Branch.**
   - Create `ducter/<fw-id8>` from `origin/<default>`, or from the base the brief names.
   - In the first turn, ask the agent to rename it to `ducter/<slug>`, using the collision
     rule from Lody's `branch-name-allocation.ts:47-60`.
   - git itself enforces one writer per branch. Add an advisory **path-glob lease** in the
     control plane for windows writing the same repo on different branches. Overlap → refuse
     the spawn, or reuse the existing writer (research/06 §3.5).
7. **Recipe.** Its first use is a visible one-off job, following Codex's new flow, Devin's
   "Set up your environment" and Cursor's agent-led setup.
   1. A setup window inspects the repo.
   2. It writes `setup`, `run` (with port needs) and `cleanup` commands, plus a
      `.worktreeinclude`.
   3. It proves the commands on a fresh worktree.
   4. It posts **one decision**: "Use this setup for HawDB? Go / Hold".

   After that:
   - Import any existing `.conductor/settings.toml`, `.cursor/worktrees.json`,
     `.cursor/environment.json`, `.codex/environments`, `.openhands/setup.sh` or
     `copilot-setup-steps.yml` as a starting point.
   - Setup has a 10-minute cap and kills the whole process group.
   - If setup fails, the window becomes `needs-you` with a default ("Continue without
     setup"), and never fails silently.
8. **Caches** (applied by the runner, not the recipe).
   - Set the pnpm store, bun cache and uv cache on the same filesystem as the worktrees.
   - Set `SCCACHE_BASEDIRS=~/.ducter/worktrees` for Rust, and keep `target/` per worktree.
   - On APFS, `clonefile` `node_modules` from the source checkout when the lockfile hash
     matches.
9. **Ports and services.**
   - Each window gets `DUCTER_PORT..+9` and `DUCTER_ENV_{ID,PATH,ROOT}` (Conductor's
     scheme).
   - Fixed resources, such as port 5432, a Docker stack or the iOS simulator, are declared
     in the recipe as **exclusive leases**. A second window queues as `waiting` on that
     lease, never as a crash.
   - Dev servers run under the runner, are reported as preview URLs, and are tunnelled to
     the phone (Lody quick-tunnel).
10. **Checkpoints = private refs** `refs/ducter/<fw>/<n>`, written before each turn
    (Conductor).
    - They are also the rolling checkpoints of principle 13.
    - **Revert differs from Conductor's.** The Log is append-only. Revert restores the code
      and appends a "rewound to checkpoint n" event, then reseeds the window from the brief
      plus checkpoint n. It never deletes history.
11. **Archive = Lody's reconciliation.** This matches principle 10's "park aggressively,
    archive lazily".
    1. The cleanup script runs.
    2. A backup commit is made on the window's branch.
    3. The directory is removed. The branch is kept.
    4. The window's private refs are kept until the branch is merged or deleted.

    The control plane only *marks* windows archived. The owning runner reconciles when it
    wakes, which handles sleeping Macs for free.

    Triggers:
    - acknowledged done (research/06: parked > 14 days with no open asks);
    - all PRs merged or closed;
    - a disk-budget breach.
12. **Disk budget.** This is the part users complain about most.
    - The runner reports per-window bytes and the reclaimable ratio (Multica `diskusage.go`).
    - Regenerable directories are deleted 12 h after done.
    - A soft cap on live worktrees per machine archives the oldest parked ones first, never
      dirty ones without a backup commit.
    - Devices view: "HawDB uses 14 GB on Mac mini; 9 GB can be freed. Free it? Go".
13. **Merge flow. A PR is an intent** (principle 18). The default is a draft PR, as with
    Copilot. Then:
    - Ducter watches CI and review with waiters (principle 16).
    - **Rebase and conflicts are decisions with defaults.** For example: "main moved 14
      commits; rebase and re-run tests? Go". The default is reversible because the
      pre-rebase checkpoint ref stays.
    - Merge is another intent under the user's policy.
    - Linked multi-repo PRs merge in dependency order.
14. **Non-repo environments.**
    - `scratch` is a directory `~/.ducter/scratch/<fw>`. On archive it is removed only if
      empty (Lody). Anything worth keeping is first promoted to an **Artifact** in the
      control plane, so it stays readable while the machine sleeps.
    - `browser` is a persistent profile per persona per site, with the login held by the
      user.
    - `phone` / `call` has no disk. Its artifacts are the transcript and recordings.
    - `machine` is a whole box for ops tasks, using the in-place, mutex rule.
15. **Honesty.** Label every environment with its real isolation:
    - "separate copy on your Mac (shares git hooks and network)";
    - "edits the original folder";
    - "sandbox VM".

    A worktree is not a security boundary (Conductor, HN #49111625). Have the runner verify
    after each turn that the main checkout's `git status` did not change. That catches the
    `cp`-into-main leak that Claude Code's own checks miss.

### 5.3 Several machines

- A window is pinned to the machine where its environment lives. Handoff (principle 13)
  normally reuses the same environment, so the window stays on that machine.
- Moving a window to another machine (the Mac sleeps, the Linux box is awake):
  1. The source runner makes a backup commit.
  2. It pushes `ducter/*` to a **backup remote**.
  3. The target recreates the worktree from that branch and reruns setup.

  The push has to happen *while the source is awake*. So for windows marked
  "may move", push the branch after every checkpoint.
- The project picker shows which machines can run what, like Lody: "api isn't on Linux box;
  clone it there? Go".

### 5.4 Decisions for the user

1. **Branch backup off the machine.** Push `ducter/*` branches automatically? There are
   three choices: to `origin` (visible to collaborators), to a private mirror or bundle in the
   control plane's blob store, or not at all. Without a backup, a window can't move off a
   sleeping Mac.
2. **Clone on demand.** May Ducter clone repos onto the Linux box or a sandbox, and with
   whose credentials? A GitHub app or the user's `gh` login on that box.
3. **Config file in the repo.** Commit `.ducter/recipe.toml` so it is shareable and
   versioned, but visible to the team? Or keep the recipe in Ducter's own store? Or support
   both, with the repo file winning?
4. **Defaults for PRs.**
   - Draft vs ready-for-review by default.
   - Auto-archive on merge.
   - Whether Ducter may merge under a policy, or a human always merges, as with Copilot.
5. **Disk budget per machine**, and whether reclaiming may happen without asking. Suggested:
   free regenerable directories silently; ask before removing anything dirty.
6. **Readers on a dirty main checkout.** Is seeing the user's uncommitted changes desired?
   That is Codex's default: a worktree includes the uncommitted changes. Or should readers
   see `HEAD` only?
7. **Multi-repo materialization.** Lody checks out every Member eagerly. Multica checks out on
   demand. The recommendation is to check out the brief's repos up front and add more on
   demand.
8. **Location.** `~/.ducter/worktrees` (recommended) or a user-chosen path. Several products
   get complaints because users cannot choose.

### 5.5 What not to build

- Speculative or draft worktrees.
- Durable per-machine command queues for cleanup. Lody replaced its queues with
  reconciliation.
- A shared `CARGO_TARGET_DIR` or a symlinked `node_modules` as the default.
- Revert that deletes conversation history.
- Silently falling back from worktree mode to in-place (Multica: "a broken promise").
- Reading repo config only from the remote default branch (Conductor's lag).
- The word "worktree" anywhere above the workspace zoom level.

**Not verified.**
- Conductor's `/add-dir` multi-repo mechanics.
- The default value of `cleanupPeriodDays`.
- Branch prefixes for Devin and Cursor cloud.
- Internet policy for Jules, Devin and OpenHands.
- The Claude Code issue numbers taken from the mirror (claudeissues.com).
