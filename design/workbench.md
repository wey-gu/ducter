# The workbench (工作台 / Workbench)

> Design note for D214 and D220 · Evidence: `research/59`, `research/64` · Code: `apps/web/src/workbench.tsx`,
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
- **Mac (MyGo)**: the same column, 520 pt by default and dragged from 380 to 760 (kept on this Mac), the same pages, MyGo's own code editor and diff view. With On hand's rail (D244) it stands at the window's right: all three from 1560 pt; narrower, it takes the rail's place (task | workbench), and the rail comes back when it closes. Both slide their width in and out (260 ms; snap under reduced motion).
- **Its edge (D244)** paints nothing at rest: the workbench's deeper ground (`bg-deep`) is the edge. Hovered, a 4 × 40 grip in `line-2`; dragged or focused, `ink-muted`. The arrows move it with a keyboard.
- **Nothing to show (D244):** when the workbench is open and its pages go (the preview stopped, the browser or the phone was put down), it does not close by itself or go blank: it shows a launcher, **这里会出现什么 / What shows up here**, the pages it can hold as clay tiles with their drawn marks and when each appears (**它在文件夹里做事时 / When it works in a folder**, **它开了网页时 / When it serves a page**, **它用 Ducter 的浏览器时 / When it uses Ducter's browser**, **它用手机或模拟器时 / When it uses a phone or simulator**, **它做出图片、文件或链接时 / When it makes pictures, files or links**). A page that has something is raised and opens; the rest are dashed outlines.
- **Open or closed, and the page shown**, are this device's own (localStorage), never synced: a
  workbench open on the Mac doesn't open on the phone.

## Pages (each only when it has something)

| Page | Shows | Acts |
|---|---|---|
| 改动 / Changes | Files changed, against the base branch (repo) or the copy kept before it wrote (folder, D142): status, +adds −dels; a file opens its diff (both line numbers, colour per side) | 还原 / Undo one file, asked first (repo: back to the merge base, a new file removed; folder: D142's per-file undo); 查看完整文件 / See the whole file. Not while it works |
| 文件 / Files | The working copy as a tree, listed a folder at a time, windowed (thousands of rows draw only what is in view), changed files in their status ink, dependency folders muted and listed only when opened | A file opens with its colours; 编辑 / Edit, 保存 / Save (⌘S). Pictures show; binary and files over 1 MB say so |
| 预览 / Preview | The page the task serves: its title, its computer and port, the page itself in a frame; 手机 / 平板 / 全宽 widths (wide only) | 刷新 / Reload, 在浏览器中打开 / Open in browser; when this device can't reach the page directly, 在 Ducter 的浏览器中查看 / View in Ducter's browser |
| 浏览器 / Browser | Ducter's own browser while the task uses it: the D190 live view, inside the workbench | 接手 / My turn, 还给它 / Hand it back, as in D190 |
| 手机 / Phone | Ducter's phone while the task uses it (the live view, D217, registered through `workbench-screens.ts`); an iOS Simulator booted on its computer when that is the task's business (D220, below); a choice of screens when there are two, and **并排 / Side by side** (D244: both screens in one row, each in its own frame with its own label and driver line; kept on the device) | Ducter's phone: its own turns. The simulator: Home, dark/light, text size, open a link, a screenshot into the composer; view only |
| 成果 / Results | Pictures and files it showed (D206) and the links of its result | Open them: a picture in the picture viewer, a file it showed read inside Ducter (D239, `media.md`), a link to its working copy in Files |

Browser, Phone and later Computer share one frame (**Screen**): a chip that says who is driving
(**它在用 / It's driving** in the working tint, **你在用 / You're driving** in the waiting tint,
a clay bead before the words), then the screen on a raised surface. No metaphor: the screen is
shown as it is (D190's rule).

D248 ([research/82](../research/82-computer-use-presence.md)): opening the page never wakes a screen
(asleep, Ducter's phone dozes under its blanket with **叫醒 / Wake**, and the chip is idle); a page
shown again starts on the last frame and fades the stream in; the chip follows the turn (the web's
Phone page had it fixed to 它在用); **接手** mid-step reads **这一步做完就轮到你**; under the screen,
**它做了什么 / What it did**.

### The simulator on the Phone page (D220)

- **When:** a booted iPhone or iPad simulator on the task's computer, and the task touched one
  (its output names `simctl`, `xcodebuild … Simulator`, "iOS Simulator"; the home reads its Log)
  or its working copy holds an iOS app (an `.xcodeproj` / `.xcworkspace` or `ios/` at its top or
  one level down, or under `apps/*` / `packages/*`). Looked for once when the task opens and every
  7 s while the workbench is open; off a Mac or without Xcode the answer is "none", at once.
- **The screen:** `simctl io <udid> screenshot --type=jpeg -`, made small by `sips -Z <edge>`
  (the edge the client asks for, 480–1600 px), one frame asked after another lands, 90 ms apart,
  only while the page is shown and in sight: ≈250 ms and 35–70 KB a frame (research/64). Shown at
  its own shape with an iPhone's corners in proportion, on a hairline ring; no drawn device.
- **The rail** (beside the screen, under it on a phone), drawn marks named on hover and to screen
  readers: Home (`simctl launch <udid> com.apple.springboard`), dark/light (`simctl ui
  appearance`), text size in four steps (`simctl ui content_size`), open a link (`simctl
  openurl`, `file:` refused), Screenshot (the full PNG into the task's composer, D206). The
  settings read back after each act, so the rail shows what the simulator has.
- **View only**, said under the screen. Taps need Xcode's private frameworks (todo); rotation has
  no reliable route.
- **Where:** `wb` ops `sims`, `sim_frame`, `sim_act` on the computer holding the working copy
  (`packages/runner/src/sim.ts`); a worker serves its own simulator through its socket.

## 工作副本 / Working copy at the task's top (D220)

A button in the task's header shows the branch (repo) or the folder's name (folder) with a drawn
mark (only the mark on a phone). It opens a popover (a sheet on a phone) of rows, each only when it
has something: the computer; the folder (`~/…`, selectable, Copy path; on the Mac, Open in the
editor used last, D198); the branch and the base it came off; the changes against the base
(opening the workbench's Changes; the workbench's live list when loaded, else the card's count);
Open draft PR / Merge into {base} under the result card's rule, or what became of them; and who
has worked on it when that changed (each body, D89). No task-to-task lineage: Ducter has none yet.

Considered and left out of this pass: a terminal (the transcript already shows every command
and its output, D210; a server-owned terminal is a phase of its own, todo), the plan/todo (no
harness reports one Ducter can show faithfully yet), comments on diff lines sent as context
(todo).

## Editing and the agent

- A save names the version the file was opened at (a content hash). If the agent (or anyone)
  wrote the file since, the save is refused and the workbench says **你打开以后，它又改了这个
  文件。 / It changed this file after you opened it.** with **查看它的版本 / See its version** and
  **用我的版本覆盖 / Keep mine** (which reads again and writes over what is there now). While the
  task works, editing shows **它还在做，可能也在改这个文件。** once.
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
