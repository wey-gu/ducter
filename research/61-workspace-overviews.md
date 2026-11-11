# 61. Workspace overviews: T3 Code, Conductor and Lorca at the level of many tasks

*2026-11-12. Read for D216 (On hand as a workspace). Scope: the screen that lists many concurrent
agent sessions and what a person does from it, not the inside of one session (research/40 and
research/58 cover Lorca's agent page; D210 the opened task).*

## Sources

- **T3 Code** (`pingdotgg/t3code`), cloned `--depth 1` at `fb7e5589` (2026-11-11). Source read,
  never run: `apps/web/src/components/Sidebar.tsx`, `Sidebar.logic.ts`,
  `sidebar/SidebarThreadRow.tsx`, `packages/shared/src/keybindings.ts`,
  `ThreadNotificationCoordinator.logic.ts`, and the user docs `docs/user/thread-sidebar.md`,
  `keybindings.md`, `project-settings.md`, `source-control.md`. Fresh: the docs match the source.
- **Conductor** (conductor.build): closed source, Mac only. Docs at conductor.build/docs
  (workspaces-and-branches, workflow, parallel-agents, checks, scripts, keyboard-shortcuts,
  issue-to-pr, review-and-merge, faq, llms.txt) and changelogs 0.28 to 0.93 (the current
  release is 0.94). That it is closed is DOCUMENTED by third parties (AlternativeTo); not checked
  on GitHub. The sidebar is barely described in the docs; most of what follows comes from
  changelogs, and nothing about its UI is VERIFIED.
- **Lorca** (`egoist/lorca`, a personal-AI chat app built on MyGo, not zserge/lorca), cloned at
  `bf1ab709` (2026-10-28): `desktop/sidebar.go`, `attention.go`, `codingagents.go`,
  `runningtasks.go`, `commands.go`, `docs/architecture/*.md`. Read only.

## Findings

### Grouping and order

- **T3 Code** has five sections: pinned, active, working, snoozed, settled
  (`Sidebar.logic.ts:184`). VERIFIED.
  - The active list keeps a manual, server-saved order, and activity never reorders it.
  - With "fold working threads" on (beta, on by default), running work folds into one
    **Working** group. A thread "returns to the top of the active list when it finishes, fails,
    or needs an approval or answer", so the list is ordered by *when each thread last came back
    to you*. DOCUMENTED.
  - Grouping by project is an opt-in Labs mode: one folder per project, with a count and a dot
    for the most urgent hidden state (`resolveSidebarFolderDot`). VERIFIED.
- **Conductor** grouped workspaces by status: backlog, in progress, in review, done (0.35). It
  later added user sections and a Pinned section. Default order is by activity, and manual
  order came in 0.92. DOCUMENTED.
- **Lorca** orders its chats as pinned, then user sections, then ungrouped, then hidden, newest
  activity first within each group. VERIFIED.
  - What needs the user is a separate **Attention** flyout. The coordinator's latest brief comes
    first, then items, urgent first. A click opens the decision itself, not the transcript.
    DOCUMENTED and VERIFIED.

### What a row shows

- **T3 Code**: a fixed 4.875 rem card in three lines (VERIFIED, `SidebarThreadRow.tsx`):
  1. Project, then one status slot holding either a status word or a relative time.
  2. The title.
  3. Worktree mark, branch (truncated in the middle), PR badge with its state, `+N −M` in mono
     and the add/delete colours, the remote machine, and a stack of model logos.

  The status comes from a priority order: approval > input > waiting > working (with an elapsed
  timer) > failed > done, and "done" shows only while unread. Working and already-read rows
  **recede** to 70% opacity; rows that need input never do. The time is compacted ("5m"). The
  row says nothing about what the agent is doing now: only its title and status.
- **Conductor**: the name is the PR title once a PR exists, otherwise the branch. Since 0.44 the
  sidebar shows GitHub status (merged, failing CI, conflicts), a marker when permission is
  needed, and a hover card. Diff stats on rows are not documented.
- **Lorca**:
  - A chat row has an avatar cluster, a title, a time and a one-line preview that **never shows
    a tool call**. The preview reads like "Messaged X: …"; a working chat says "Working…".
    VERIFIED (`Store.Preview`).
  - The coding-agents flyout row has a status word, the title, bot · chat · runner, then
    "Ready for review · #7 · branch · ~/folder". PR state wins over idle or stopped. VERIFIED.

### Keys

- **T3 Code** (VERIFIED, `keybindings.ts`):
  - `mod+k` opens the palette. It searches title, branch, PR, project and message text, ranks
    by frecency, and a leading `>` limits it to actions.
  - `mod+1…9` jumps to the first nine rows (desktop only). Holding mod for 200 ms shows the
    hints.
  - `mod+shift+[` / `]` go to the previous / next thread; `mod+n` starts a new thread;
    `mod+shift+s` settles; `mod+z` undoes the last sidebar action.
  - Every binding is user-editable, with `when` clauses.
- **Conductor** (DOCUMENTED): `⌘K` palette, `⌘1–9`, `⌘N`, `⌘⇧N` (from a branch, PR or issue),
  `⌘⇧P` create PR, `⌘⇧A` archive, `⌘/` lists the shortcuts.
- **Lorca** (VERIFIED):
  - `⌘K` opens the palette; its sidebar search field only opens the palette.
  - `⌘1–9` jumps, with hints after a 250 ms hold.
  - In lists: arrows, Home/End, Enter, and type-select by first letters.

### Starting, bulk actions, archive, PRs

- **Creating.** Conductor: one workspace is one worktree and one branch, from a new branch, an
  existing branch, a PR, a GitHub or a Linear issue; a setup script runs and each workspace gets
  ports. T3 Code: worktree, local or a previous worktree, a base branch, one prompt fanned out
  to several models, and threads with no project in a scratch folder that can later become a
  project. DOCUMENTED.
- **Bulk.** T3 Code: mod-click and shift-click select; the menu applies Settle, Snooze, Unpin,
  Mark unread or Delete to n threads; a "sweep" drags one row's button across others. VERIFIED.
  Conductor and Lorca: none documented.
- **Parking.** T3 Code settles a thread automatically after 7 idle days or when its PR merges.
  Snooze wakes a thread early for a question or a failure ("Woke"). Every parking action has a
  5-second Undo. Worktree cleanup policies run hourly, protect uncommitted work, and keep the
  branch. Conductor archives with git state and can restore from History. DOCUMENTED.
- **PR and CI.**
  - T3 Code finds each thread's PR from its branch, even while the app is closed, and shows its
    state on the row. CI lives in a PR panel. Watching a PR wakes the agent on a failed check
    or a comment. Merging happens on a Pull requests page.
  - Conductor has a Checks tab per workspace, merge blockers, and the agent fixing CI.
  - Lorca only displays the PR. DOCUMENTED.

### Notifications and calm

- **Notifications.**
  - T3 Code alerts for "input" and "completion", never on first sighting or for quiet runs. A
    completion waits a 5 s grace before alerting, each request alerts once, and the dock badge
    is zeroed while the app is focused. VERIFIED.
  - Lorca waits a 3 s read grace before any push, and sends nothing if any device has the chat
    on screen. DOCUMENTED.
- **Calm with many.** T3 Code keeps a list calm by receding rows, folding Working, showing
  "Done" only while unread, and turning a closed folder into a count and a dot. Lorca keeps
  attention items apart from the list.

### Performance with many

- **T3 Code** (VERIFIED):
  - The sidebar is **not virtualized** (only the palette and chat are).
  - Rows are `memo`'d, and the providers' data is trimmed to the fields a row draws.
  - A row subscribes to live git and PR status only while it is within 160 px of the viewport
    (IntersectionObserver).
  - Clocks tick per label.
- **Lorca**: an immediate-mode keyed `ui.List` (MyGo's virtual list).
- **Conductor**: not public.

## What doesn't fit Ducter

- **All three assume every session is code in a repo.** A Ducter task can be an errand with no
  folder, a phone call, booking a hotel in a browser, or a folder of receipts. Branch, diff and
  PR must appear only on a repo task and never be the row's frame.
- **Their status is a word or a dot the developer decodes.** Ducter's principle is that the lane
  is the state (silence means success), and dots are an AI-slop tell in our visual rules (D73).
  T3's status slot fits Ducter only as words, and only where the grouping doesn't already say
  the state (by project).
- **A palette of actions (`>`)** is a developer's tool. A fresh user has one errand.
- **⌘K.** Ducter's ⌘K already means "talk to the partner" (the Mac, the iPad menu). Talking is
  Ducter's primary act, so the switcher gets another key (⌘O, macOS's "Open…").
- **⌘1–9** are already the levels in Ducter (⌘1 conversation, ⌘2 On hand, …).
- **Settle and snooze** are a second lifecycle on top of tasks. Ducter's finished tasks already
  leave On hand after a day and are archived by the runner (product-model "Archive and disk").
  A user verb for that is deferred until someone asks for it.
- **T3's preview line is empty.** Its row says nothing about what the agent is doing. Lorca's
  preview proves that a row can say what happened in plain words. Ducter already has those words
  from D210's step model, which is the strongest thing it can add.

## Implications for Ducter

1. **One list in every room.** The phone, the side pane, the whole screen, and a rail beside a
   task opened at the whole screen all draw the same rows. Only the room changes. This replaces
   the four lanes side by side at the whole screen (D184 (3)), whose wide card columns break
   down past about 15 tasks and can't be walked with keys.
2. **The row's second line says what the task is on now.** For a working task that is its
   latest step in D210's words, with that step's mark (e.g. "运行 bun test"). Otherwise: its
   question (needs you), what it waits for, or the first line of its result. The card carries
   the latest step (`TaskCard.latest`), so the line is right before the client has any task
   events (after D209's glance, or on a fresh device).
3. **Repo facts only on repo tasks:** the branch in mono, `+a −d`, and **草稿 PR / 已合并**
   (Draft PR / Merged) from what the user did in Ducter (`TaskCard.integrated`). Their CI state
   needs a PR watcher (todo).
4. **Calm from T3:** what needs you is answered in place at the top. Finished rows recede a step
   (ink-soft, 600). Hover offers the one next step (Merge, a draft PR, Pause) in the time's place.
5. **Keys from all three, on Ducter's map:**
   - j/k (or the arrows) walk the list, Enter opens, `/` finds, `x` selects, Esc lets go.
   - In the rail, j/k open the next or the previous task.
   - ⌘O opens 打开一件事 / Open a task. Words with no match start a new task with those words.
6. **Many at once (T3's selection)** on the whole screen only: ⌘-click, ⇧-click or x, then one
   raised bar with Merge n, Open n draft PRs, Pause n and Cancel n (Cancel asks once).
7. **Density grows with use.**
   - Find shows from 10 tasks; By project from 2 projects.
   - Keys, hover actions and selection appear only where a keyboard and a pointer are.
   - A fresh user with one errand sees one row and nothing else.
8. **Hundreds stay smooth:**
   - Rows are memoized by what they draw.
   - Rows off screen skip layout and paint (`content-visibility`), the T3 lesson that a few
     hundred rows need no virtual list.
   - The latest step is parsed once per event.
   - On the Mac, MyGo's immediate mode draws the same rows.

## Summary

T3 Code is the most complete of the three:
- its rows: status slot, branch, PR, ±, receding;
- its keys: palette, jumps, next and previous;
- its bulk actions and its calm: fold Working, done only while unread.

Conductor adds workspace-from-issue and PR checks. Lorca adds the plain-words preview and
attention kept apart from the list. None of them handles errands, calls or browser work, and
none says on the row what the agent is doing now. Ducter takes the structure (one list, keys,
switcher, bulk, PR on the row, the rail beside an opened task) and adds its own: the latest step
in words on every row, repo facts only where there is a repo, answers in place, and density that
grows with use.
