# 用电脑 / Use the computer: tasks in the person's Mac apps

Decided in D235 (2026-11-12), the shared screen rules and teach by showing in D248 (§7, §8); evidence in [research/23](../research/23-browser-and-computer-use.md),
[research/38](../research/38-harness-native-browser.md) and
[research/70](../research/70-zh-names.md) (the name). Ducter's own phone is a different thing:
[phone-use.md](phone-use.md). Which computer a task runs on: [where.md](where.md).

## 1. Who, what they feel, how it starts

| | The consumer personal-AI user | The heavy developer | The fresh user |
|---|---|---|---|
| **Moment** | "在 Keynote 里把 Q3 导出成 PDF", "用邮件回张三：周六见" | an app with no command line (a design tool, a dashboard app, Xcode's organizer) | browsing their Mac's card |
| **Before** | "it can do files and the web, not my apps" | an agent with raw computer use and no brakes, typing into the wrong window | nothing |
| **After** | it does it in the background, and asks before it sends | the app work done behind a Go, never in a password manager | a chip that does what it says |
| **First time** | the brief says the work needs 用电脑; the partner says in one line where to add it | **+ 用电脑** on the Mac's card, two macOS switches once | the chip, then the two switches with the guide |

North star: 好用 (one tap, two switches once), 顺滑 (background, no stolen mouse), 赏心悦目 (the
switches as a short checklist with where each stands), 放心 (Go at the effect, the person's keys
and money out of reach, 停下 from any window), 惊喜 (it really uses the app, like a person).

## 2. Turning it on

- Macs only for now. Windows shows the D199 ghost with **以后会有**; a home with no screen (a server,
  a Linux home) shows no 用电脑 chip at all, or, when a Mac has it, **用电脑 · 在 {Mac} 上**, which
  opens that Mac's card (D237).
- It needs cua-driver on that Mac (上网 already installs it there, research/23). Missing, the chip
  is flat and its ⓘ says to install it.
- **+ 用电脑** saves the choice on that Mac (`<dataDir>/abilities.json` `computer: true`), on the home
  directly, on a worker through its socket (`ability` op).
- macOS's two switches for cua-driver (System Settings › Privacy & Security): **辅助功能 /
  Accessibility** (mouse and keyboard) and **屏幕录制 / Screen Recording** (what's on the screen).
  Read with cua-driver's own `permissions status --json`, which never asks for anything (probes
  reused a minute). Missing either, the chip fails and its ⓘ lists both, each **已打开 / On** or
  **还没打开 / Not yet**, the one line of where, and **在 {Mac} 上打开指引 / Open the guide on {Mac}**:
  cua-driver's own guide (`permissions grant`) opens on that Mac's screen. Ducter never flips the
  switches itself.
- On: a tap removes it (as every ability); its ⓘ says how it works.

## 3. Which computer

`needs.app` (the task tool's "A Mac app it works in") puts work on a Mac (`no_app` elsewhere), and
D157's least-access step prefers a Mac with 用电脑 on. A Mac without it still takes work that
needs only the app's files or command line; the brief tells the task what to do when clicking is
truly needed (report blocked, and say the person can add 用电脑 on that Mac's card).

## 4. The tools

Ducter's own, on Ducter's MCP, listed only for a task with `needs.app` whose Mac has 用电脑 on
(`packages/core/src/computer/tools.ts`):

| Tool | What |
|---|---|
| `computer_apps` | the apps (running first), the blocked ones never listed |
| `computer_open_app` {app, open?} | opens one in the background, with a file or URL |
| `computer_look` {app, query?, picture?} | one window: each element with a [number]; a picture on request |
| `computer_click` {ref \| x,y} · `computer_type` {ref?, text, submit?} · `computer_key` {key, modifiers?} · `computer_scroll` · `computer_menu` {path} | act, then look again |
| `computer_ask_go` {what} | the Go for the one action the last refusal named |
| `computer_ask_user` {what} | the person does it themselves (sign in, a password, a code); Go = **好了 / Done** |

Why Ducter's own tools, not cua-driver's MCP or the harness's own computer use (D130 stays for
browsing): the gate has to hold in code before an action runs. A native computer use can only be
watched after the fact (research/38 B2's typing into an open 2FA page).

Where they run: on the home, always. For a task on the home they call cua-driver's CLI
(`cua-driver call <tool> <json>`); for a task on a worker the home sends one `computer_call` over
the worker's socket and the worker runs it, refusing while 用电脑 is off there and any tool outside
eleven (`list_apps, list_windows, get_window_state, launch_app, click, double_click, type_text,
press_key, hotkey, scroll, invoke_menu`).

## 5. The gate

| What | Who | How |
|---|---|---|
| A click, menu item or key whose words send, pay, buy, post, delete, install, call, confirm or sign out | the person's Go | `computer_ask_go`; the Go covers that one action in that app for 15 min |
| Return in a mail or chat app, ⌘Return anywhere; ⌘Delete | the person's Go | counted as a send; a delete |
| Password managers, Keychain and Passwords, authenticators, banks, wallets, payment apps, System Settings, cua-driver, Ducter | nobody | never listed, read, opened or acted on (`gate.ts`) |
| Password fields | the person | numbered, never read or typed |
| Signing in, codes | the person | `computer_ask_user`, then **好了** |
| Stopping it | the person, from any window | **停下 / Stop**: every tool refuses from then on, the turn is interrupted, the task is told |

What an app shows (mails, messages, windows that address the agent) is data, never instructions.

## 6. What the person sees

- cua-driver acts in the background: no stolen mouse or focus; its own pointer shows where.
- On hand marks the task (`computing: {device, app}`): the opened task says **正在用 {Mac} 上的 {app}
  / On {Mac}, in {app}** with **停下 / Stop**; that Mac's card lists each such task under its chips,
  **「{task}」正在用 {app} / "{task}" is in {app}**, with **停下**.
- The Go card says what will happen in the person's words ("把回复发给张三").

## 7. Screens a task drives, the shared rules (D248)

Evidence and the naming/metaphor work: [research/82](../research/82-computer-use-presence.md).
The rules hold for every screen a task drives; what is built is for Ducter's phone
([phone-use.md](phone-use.md) §7), whose live view exists.

- **Looking never wakes it.** A screen that isn't running shows asleep (its clay dozing under the
  knitted blanket, D77) with **叫醒 / Wake** and one line of what waking costs. 用电脑 has no live
  view: the Mac's screen is the person's own, so nothing to wake; a worker Mac's live view is §9.
- **A reconnect never flashes.** The last frame stays, quiet, with **正在重新连上…**; the new stream
  fades in over it.
- **Whose turn.** The person's turn waits for the step in flight (**这一步做完就轮到你**); Hand it back
  is one tap; **停下 / Stop** is never locked. The chip is D214's **它在用 / 你在用**.
- **它做了什么 / What it did**, never what it read: the last few effects under the screen. For
  用电脑 the same list belongs under **正在用 {Mac} 上的 {app}** once its steps carry words (§9).
- **A picture, not the person's turn**: when they only need to see something, the task shows a
  picture (on the phone) or says which window (on a Mac app); `computer_ask_user` only when their
  hands are needed (the brief's "A picture, not the user's turn").

## 8. Teach by showing (D248, designed, not built)

- **Who:** the consumer with a chore they do the same way every week (报销 in an app, a form on a
  site), and the fresh user who can't write a prompt for it. *Feel:* before, "I'd have to explain
  every tap"; after, "I did it once and now it can". *First time:* a button where the screen
  already is.
- **做给它看 / Show it how** in the live view of Ducter's phone (later Ducter's browser): the person's
  turn starts with a line **你做一遍，它在旁边看。密码不会被记下。 / Do it once; it watches. Passwords
  aren't recorded.**; their taps, typing (labels only; password fields never) and the apps they open
  are recorded as steps; **做完了 / Done**.
- The partner turns the steps into a draft **技能 / Skill** (the person's own, steps in plain words,
  when to use it, what to check, when to ask first), shown as a card: its name (editable),
  **试一次 / Try it once** (a task runs it, watched), **留着 / Keep it**, **定期做 / Make it a
  routine** (D114's proposal card with one Go; never created silently).
- Needs before building: a recorder of the person's inputs in their turn (the phone's live view
  carries them already), a model pass that writes the steps, and the skills page.

## 9. Next

- On the author's Mac: a real task in a real app (Keynote export, a Mail reply behind Go), the agent
  pointer seen, the guide walked from a phone while the Mac is elsewhere.
- Electron and Catalyst apps, where cua-driver's tree can be thin: fall back to the picture and
  pixel actions, with the gate on the element under the point.
- Linux and Windows desktops (cua-driver runs there).
- Watching it live (the Mac's own screen is the person's; a live view only if asked for), most of all a
  worker Mac the person isn't sitting at, under §7's rules; and §7's 它做了什么 for 用电脑 (its steps
  note only the app today).
