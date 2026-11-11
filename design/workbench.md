# The workbench (工作台 / Workbench)

> Design note for D214 · Evidence: `research/59` · Code: `apps/web/src/workbench.tsx`,
> `apps/desktop/internal/views/workbench.go`, `packages/runner/src/workbench.ts`,
> `packages/core/src/{preview,workbench}.ts`, `packages/protocol/src/workbench.ts`.

The opened task's control surface beside its conversation: what a developer looks at and works
with while an agent works, hidden until asked for.

## Who, what they feel, how it starts

- **The heavy developer** opens a coding task and wants what Conductor, Codex or t3code give
  beside the agent: the diff, the files, the page it is building. Before, the task showed counts
  and an inline diff per edit (D210) but not the whole change, nothing to open or fix by hand, and
  no way to see the site the agent runs, least of all when it runs on a server abroad. After, one
  key (⌥⌘B) or one button puts the work beside the conversation; they fix a line themselves, the
  page reloads, and the agent is told. They feel in control without leaving Ducter.
- **The consumer user** never meets it unless they look for it: the button is a small drawn
  panel mark in the task's header, and it appears only when the task has something to show (a
  folder or repo it changed, a page it serves, Ducter's browser it uses). Opening it shows one
  plain list of what changed, in their words.
- **The fresh user** sees nothing new. No setup, no ports, no concepts: Preview finds the page
  the task serves by itself.

## Shape

- **Wide** (the D184 whole screen): a column at the right, 42% of the window by default
  (380–760 px), resizable from its left edge (kept on the device), the task's column keeps its
  measure. From the two panes, opening it takes the task to the whole screen and closing it gives
  the screen back. Its header lines up with the crumbs.
- **Phone, iPad in a narrow size, foldables folded**: a sheet over the task. A compact strip of
  pages at the top (tap or swipe; the strip follows the page in view), a close button. Pages next
  to the one shown are drawn, the rest wait.
- **Mac (MyGo)**: the same column, 520 pt, the same pages, MyGo's own code editor and diff view.
- **Open or closed, and the page shown**, are this device's own (localStorage), never synced: a
  workbench open on the Mac doesn't open on the phone.

## Pages (each only when it has something)

| Page | Shows | Acts |
|---|---|---|
| 改动 / Changes | Files changed, against the base branch (repo) or the copy kept before it wrote (folder, D142): status, +adds −dels; a file opens its diff (both line numbers, colour per side) | 改回去 / Undo one file, asked first (repo: back to the merge base, a new file removed; folder: D142's per-file undo); 看整个文件 / See the whole file. Not while it works |
| 文件 / Files | The working copy as a tree, listed a folder at a time, windowed (thousands of rows draw only what is in view), changed files in their status ink, dependency folders muted and listed only when opened | A file opens with its colours; 改 / Edit, 存 / Save (⌘S). Pictures show; binary and files over 1 MB say so |
| 预览 / Preview | The page the task serves: its title, its computer and port, the page itself in a frame; 手机 / 平板 / 铺满 widths (wide only) | 刷新 / Reload, 在浏览器里打开 / Open in browser; when this device can't reach the page directly, 用 Ducter 的浏览器看 / View in Ducter's browser |
| 浏览器 / Browser | Ducter's own browser while the task uses it: the D190 live view, inside the workbench | 换我来 / My turn, 还给它 / Hand it back, as in D190 |
| 手机 / Phone | The phone the task uses (the phone-use view registers itself, `workbench-screens.ts`) | Its own turns |
| 成果 / Results | Pictures it showed (D206) and the links of its result | Open them; a file opens in Files |

Browser, Phone and later Computer share one frame (**Screen**): a chip that says who is driving
(**它在用 / It's driving** in the working tint, **你在用 / You're driving** in the waiting tint,
a clay bead before the words), then the screen on a raised surface. No metaphor: the screen is
shown as it is (D190's rule).

Considered and left out of this pass: a terminal (the transcript already shows every command
and its output, D210; a server-owned terminal is a phase of its own, todo), the plan/todo (no
harness reports one Ducter can show faithfully yet), comments on diff lines sent as context
(todo).

## Editing and the agent

- A save names the version the file was opened at (a content hash). If the agent (or anyone)
  wrote the file since, the save is refused and the workbench says **你打开以后，它又改了这个
  文件。 / It changed this file after you opened it.** with **看它的版本 / See its version** and
  **用我的覆盖 / Keep mine** (which reads again and writes over what is there now). While the
  task works, editing shows **它正在做，改之前想一想：它可能也在改这个文件。** once.
- Writes are atomic (a temporary file renamed over), keep the file's mode, and are capped at
  1 MB of text.
- **The agent hears it with its next turn**: the runner keeps, per task, the files the user
  edited or put back, and puts one line before the next thing said to the agent ("Since your last
  turn the user edited a.ts, b.css themselves, in Ducter. Read those files again before you
  change them; keep their changes unless they ask otherwise."). Said once, never logged as the
  user's words; the Log keeps the edit itself as a system event that draws nothing (D207). A task
  that is idle is not woken for it (proactive restraint): the note waits for the next turn.

## Where it is read, and what is allowed

- Every op runs on the computer that holds the working copy: the home itself, or a worker
  through its socket (`wb`, `wbFetch` worker ops); an older worker says it can't.
- **Confinement**: a path is resolved with its links and refused when it lands outside the task's
  working copy (its worktree, its folder, or its own scratch folder), or in Ducter's data folder
  (D207). A folder task over the home folder never lists `~/.ducter`. `.git` is never listed.
- Caps: a folder lists at most 2000 entries, a read 1 MB (pictures 2 MB), a diff 400 KB, a
  changes list 1000 files, a worker's page answer 16 MB.

## Preview, and why an address of its own

- **Finding the page**: listening TCP ports whose process works inside the task's working copy
  (lsof on macOS and Linux, `/proc` where there's no lsof), and local addresses the task's own
  output named (`http://localhost:5173/`), each checked to answer as a web page on that computer
  (its `<title>` read once). Ducter's own ports are never offered. Looked for once when the task
  opens (to know whether Preview exists) and every 7 s while the workbench is open and in sight
  (20 s for a finished task).
- **Showing it**: a dev server expects to be the whole origin (absolute paths like
  `/@vite/client`, its own storage, its hot-reload socket), and it must never share Ducter's
  origin (its scripts would read the device token). So each previewed page gets **a port of the
  home's own**, on the interface the home listens on: an origin of its own, absolute paths and
  hot reload kept. The home forwards to the page where it runs (this machine's loopback; a
  worker's through its socket, HTTP only for now: no hot reload there yet). Nothing is public:
  the client gets the preview's token only over its authenticated socket; the first request
  trades it for an HttpOnly cookie named for that port; anything without it is refused; the
  cookie never reaches the page. Ducter's page lets only its own host's ports be framed and
  pinged (CSP `frame-src`), and frames the page sandboxed (scripts, forms, popups; its own
  origin). Previews close after 30 minutes unused.
- **When the device can't reach that port** (a home behind one HTTPS address, an SSH tunnel of
  one port): the client checks first (a ping with a 2.5 s limit; an https page never tries) and
  offers **用 Ducter 的浏览器看 / View in Ducter's browser**: Ducter's browser on the task's
  computer opens `http://localhost:<port>/` and the live view (D190) streams it, the screencast
  approach t3code takes (research/59). Fidelity is a screencast's, but it reaches anywhere.

## Performance

- Nothing is asked for while the workbench is closed, except the one look for pages when a task
  opens (so the toggle knows whether to show Preview). Closed, the task opens exactly as fast as
  before (D209).
- Lists are windowed; diffs draw 600 lines and the rest on request; highlighting is one pass per
  line (`apps/web/src/hl.ts`, plain past 300 KB); the editor is a textarea over its coloured copy
  (no editor library; the Mac uses MyGo's editor).
- Measured on a scratch home, Bun dev server on the same Mac: a save to the page reloading in
  the preview 42 ms (Bun's hot reload through the preview's socket).

## Keys

⌥⌘B (Ctrl+Alt+B elsewhere) shows or hides it: the right panel's key in VS Code, Zed, Codex and
t3code (research/59). ⌘S saves in the editor. Esc in the editor doesn't leave the task.
