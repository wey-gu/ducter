# 187 · The partner beside your work: a mini window on the Mac

Date: 2026-11-21, on main at `14878b82` (D435 merged). Follows research/184 #9 ("the partner beside
the workbench"). Read: `motivation.md` ("someone who wants more of a workbench can keep the partner
in a floating window"), `design/ui.md` (the waiting line, the menu bar extra), `design/workbench.md`,
`design/quiet-conversation.md`, `design/voice.md`, D306, D425, D305; the Mac app's windows
(`apps/desktop/main.go`, `appwindow.go`) and MyGo v0.10.0's window, panel and global-shortcut code.
Decision: **D438**.

Tags: **VERIFIED** = read in code at this commit, or run here; **DOCUMENTED** = a vendor's own docs;
**INFERRED** = judgment.

## 1. The question

The heavy developer works in their editor, a browser and a task's workbench. Today talking to the
partner means switching to Ducter's window (⌘Tab, the Dock) or opening the menu bar extra, which
answers decisions but cannot say something or show what the partner is doing (D306, VERIFIED:
`trayMenu.refresh`). The motivation names a floating window for exactly this person, as an optional
mode most people won't use.

## 2. Who, what they feel, how it starts (INFERRED)

| Who | Before | After | First time |
|---|---|---|---|
| Heavy developer | Leaves the editor to ask "CI 为什么又挂了？", comes back, forgets to look again; the menu bar mark says "at work" but not on what | The partner sits small at the top right, above the editor, on every Space. One line says what it is doing or what it just said; a count says what needs them; they type or hold to talk without leaving the editor, which keeps the keyboard until they click the field | The first time they open a task's folder in an editor or a terminal from Ducter (D198, D201), the mini window comes by itself, once, without taking the keyboard, and its line says the key: **我在这儿陪着你。按 ⌃⌥⌘空格可以收起我，再按一次我就回来。** |
| Consumer | Never needs it | Unchanged; they may find **小窗 / Mini Window** in the menu bar's menu or View | Zero setup: one menu item |
| Fresh user | Never meets it | Nothing new to learn | Nothing shows unless asked for |

North star: **好用** one key, anywhere, and the field is the conversation's own; **顺滑** never takes
the keyboard or brings Ducter forward, fits its height to what it shows, remembers where it was put;
**赏心悦目** the clay partner and its alive line at 44 pt on the paper, one accent (the count) only
when something needs them; **放心** the same conversation, the same draft, the same waiting line, the
menu bar mark unchanged; **惊喜** it shows up once, at the moment the person leaves to work beside it,
and says how to put it away.

## 3. A new visual idea? The metaphor pass (INFERRED)

The window shows existing things only (the clay partner, the alive line, the count, the field). The
question is the frame. Candidates, with their false implications:

| Candidate | Reads as | False implications |
|---|---|---|
| **A. No metaphor: a small window** (chosen) | A window of the app, small | None new; "window" is the literal thing |
| B. A desktop pet walking the screen's edge | A companion | It acts on its own; it is decoration; it moves when nothing happens (breaks D77's "status never animates") |
| C. A sticky note | A note to self | It holds text the person wrote; it doesn't answer |
| D. A bubble hanging off the menu bar extra (a popover) | The menu, opened | It closes when you click elsewhere: the opposite of staying beside the work |
| E. A sidecar docked to the screen edge, pushing windows aside | A second app column | It owns screen space and resizes other apps' windows |
| F. Picture-in-picture | A video playing | It plays something; it can't be typed into |

Rubric (legibility without labels, mapping fidelity, scale, state expressiveness, emotional fit,
distinctiveness, feasibility): A scores top on fidelity and feasibility and carries state through the
partner's own faces (D77, D425) instead of a new mark; B scores on emotional fit and fails fidelity
and D77; D fails the core requirement (staying open). No comprehension test was run because no new
mark or metaphor was introduced; the name is the literal **小窗 / Mini window** (小窗 is the word
Chinese apps use for a small floating window; INFERRED).

## 4. How the Mac does it (VERIFIED in MyGo v0.10.0 and here)

- `WindowOptions.Panel`: floats above all apps' windows on whichever Space, over full-screen apps,
  out of the Dock and the app switcher; "showing or focusing it gives it the keyboard without
  activating the app". `Window.ShowInactive` shows without focusing. Run here against the mock
  server: `visible=true focused=false panel=true bounds=1524,37 380x164` (`.shots/float/mac-float.txt`).
- `GlobalShortcut.Register` uses Carbon's `RegisterEventHotKey`, "which needs no accessibility
  permission" (`internal/darwin/hotkey.go`): no change to `scripts/macos/ducter-app.entitlements`.
- `StateKey` remembers position across launches; `Frameless` + `CornerRadius` give the rounded panel.

## 5. The key (INFERRED; macOS defaults from memory, not re-checked this session)

⌥Space is the default of common launchers and other assistants the heavy developer runs; ⌃Space and
⌃⌥Space switch input sources (every minute of a Chinese typist's day); ⌘Space is Spotlight, ⌥⌘Space
Finder's search, ⌃⌘Space the character viewer; ⇧⌘Space is a popular editor's parameter hints; ⌃⌥ with
a letter collides with window managers' thirds. **⌃⌥⌘Space** collides with none of these. If another
app holds it, registration fails quietly and the menus still work; making it changeable is in
`todo.md`.

## 6. Relation to the menu bar extra (D306)

The menu bar stays the still mark: three states, no number, unchanged when the mini window shows.
The mark is the glance for everyone; the mini window is the heavy developer's choice to keep the
partner in sight. Both sit at the top right, so the mini window opens under the mark by default. The
extra's menu gains **小窗 / Mini Window** (a check, with the key shown). Quiet when nothing needs the
person: no count, the partner's idle face breathing (D77), On hand's one sentence muted; still after
90 s without the keyboard, like the waiting line (D425).

## Implications for Ducter

- Build it on the Mac only: a panel whose line is, in order, the waiting line (D425), the first
  time's key, the partner's newest words for 30 minutes, the oldest question that needs the person,
  else On hand's one sentence; the count to tap opens On hand on what needs you; the field is the
  conversation's draft with hold to talk (D305).
- No web equivalent: a browser tab cannot float beside other apps; a compact web mode would be a
  different feature (INFERRED).
- Later (todo): a changeable key, pictures in the field, a reply quoted in place, answering a
  question's Go from the window, a live check of its behaviour over full-screen apps and Stage
  Manager.

**Summary.** A literal small window, not a metaphor: the clay partner, one live line, a count and a
field, floating beside the person's work without taking the keyboard; summoned by ⌃⌥⌘Space or the
menus, offered once when they first leave Ducter for their editor; the menu bar mark stays still.
