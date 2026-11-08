# Onboarding: First Run (scenarios A1, A2)

> Draft 0 · 2026-11-08 · D33 (v1 = heavy developer + personal AI), D36 (north star), D37 (cartoon).
> The remote-access steps wait on `research/21`.

## Scenario card

**Who**
- *Primary (v1):* a heavy multi-agent developer moving off conductor or herdr. Claude Code
  and/or Codex are already logged in, and dozens of repos sit under `~/dev`.
- *Secondary:* a curious person who has one AI subscription and has never heard the words
  "subagent" or "worktree".

**Feelings**

| Before | After the first 5 minutes |
|---|---|
| Heavy user: tired of babysitting 8 terminals, a little skeptical ("another tool to configure") | "It already knows my machine and my work, and it took something off my plate." (放心, 惊喜) |
| New user: curious, slightly intimidated | "I get it: I talk, it handles things, it only bothers me when it matters." (好用, 赏心悦目) |

**The bar**
- From launch to the first useful result: **under 3 minutes**, and **zero concepts to learn
  before talking**.
- Every setup step is **auto-detected first**. The user confirms rather than fills in.
- Nothing is asked before it is needed: no projects, rules, or extra devices.

## The cartoon (≈ 25 s, skippable, replayable from Settings)

Pebble style: cream paper, chunky shapes, press shadows, bouncy motion. No brand logos. No
text walls, just one short line per scene (zh + en).

| # | Picture | Line (zh / en) | Concept taught |
|---|---|---|---|
| 1 | A pebble pops out of the paper, blinks twice, waves | 你好，我是 Ducter。 / Hi, I'm Ducter. | Your partner has a name and a face |
| 2 | A speech bubble from off-screen; Ducter listens, nods | 你只管说。 / Just tell me. | The conversation is the whole interface |
| 3 | Ducter flicks small pebbles onto a laptop and a little server box, which light up | 我把事情分出去做。 / I hand things out. | Tasks run on your devices |
| 4 | *(to redo once the metaphor is chosen; `research/24`: a battery reads as device power and must not be used. Likely an AI-plan block with cords to each device)* | 用的是你自己的 AI。 / Powered by your own AI plan. | Subscriptions stay yours |
| 5 | The pebbles work quietly. One turns orange, raises a tiny hand, and Ducter carries it to you | 只有需要你时，我才来找你。 / I only come to you when it matters. | Attention; silence means success |
| 6 | You tap **好 / Go**. The pebble bounces, turns mint green, and returns holding a tiny receipt | 做完了，会带证据给你。 / Done, with proof. | Decisions with defaults; done = evidence |
| 7 | All the pebbles roll into a tray labelled **手头 / On hand** | 想看全部，随时打开。 / See everything, anytime. | The overview exists, optionally |
| 8 | The tray slides aside and a checklist assembles from the pebbles | 开始前只需要三样。 / Three things and we're ready. | *Becomes the real setup screen* |

**The signature moment:** scene 8's last frame *is* the live setup screen, the **Isles** map (`ui.md`). The cartoon doesn't
end; it turns into the product. Pebbles settle into the three checklist rows, and each
row's detection result animates in.

## First-run flow

1. **Install**
   - *Mac:* the desktop app holds the main process and a local worker. One download, one
     launch.
   - *VPS:* a one-line installer starts the main process and prints a QR code / link that
     opens the client and pairs it. The details depend on `research/21`.
2. **Cartoon**, then the **live checklist**, auto-detected:
   1. **This device**: ✓ ("MacBook Pro · 14 repos found under ~/dev").
   2. **Your AI**: lists the logged-in harnesses (Claude Code ✓, Codex ✓/✗). A missing one
      gets a **Connect** button that runs its official login in a sheet. At least one is
      required. An API key is the fallback path.
   3. **Your memory (optional)**: Nowledge Mem detected → "connect" / "skip for now".
3. **Name and look (optional, 10 s):** "Ducter" is prefilled, with 4 face colors. Skipping
   is fine.
4. **First words from the partner.** It must deliver value immediately:
   - *Mem connected:* it opens with context. "I see you're in the middle of HawDB CI
     concurrency. Want me to look at #1592 first?"
   - *No Mem:* it offers three concrete starters drawn from what it detected. Example:
     "I found 14 repos. The most active this week is hawdb. Want me to get familiar with it
     and tell you what's open?"
5. **The first task runs.** When it lands as a card, the chip animates into the On hand
   button once, with the line "I keep things here."
6. **Later, only when needed:**
   - pairing another device (when a task needs it, or the user says "I also have a VPS");
   - the phone web link ("find me on your phone" QR);
   - rules, created from conversation;
   - routines;
   - the browser, the first time a task needs the web (below).

## The browser, first time (live on the author's Mac, 2026-11-09)

These are the setup moments a browser task hits on a Mac. They should become one checklist row
("Browser: ✓ ready / Set up"), shown only when the first web task needs it. Design pending.
Setup: cua-driver 0.44.0, Chrome 157, macOS 15, partner and task on Sonnet.

**Before the first web task**

1. **cua-driver must be new enough.** The typed browser tools (`browser_prepare`,
   `get_browser_state`) arrived in cua-driver-rs 2026-07. 0.6.8 has only the legacy `page`
   tool. The fix is `cua-driver update --apply`; it installs into `/Applications`, so the user
   approves it. *Verified:* with 0.6.8, Ducter refuses the task and the partner explains the
   fix in plain words, instead of opening a task that cannot work.
2. **macOS privacy grants belong to CuaDriver**, not to Ducter or the terminal: Accessibility
   and Screen Recording for `com.trycua.driver`. For a fresh user, `cua-driver permissions
   grant` opens the dialog and they click Allow for both in System Settings → Privacy &
   Security. *Verified:* the 0.6.8 → 0.44.0 update kept both grants (same team ID), and the
   browser tasks raised no prompt. *Not seen:* the first-time prompt sequence, because the
   grants already existed.
3. **A vendor-signed Google Chrome (or Edge) in `/Applications` is required.** *Inferred*
   from cua-driver docs; the author has Chrome, so nothing appeared.

**While a browser task runs (what the user sees)**

4. **A second Chrome window appears.** It is a separate Chrome on Ducter's own profile
   (`<dataDir>/browser-profiles/<persona>`), not the user's Chrome. *Verified* from the
   process args and the window list.
   - It opens at 1200×900 top left, then Ducter parks it bottom-right at about 60% size
     (907×661 on a 1512×982 display), behind the user's work. *Verified* on a desktop
     capture.
   - Ducter sets the clay avatar as its Dock tile; Chrome accepted the call. *Not seen*: the
     Dock was hidden on the author's Mac. Without this, it is an identical second Chrome
     icon.
5. **Focus.** Left alone, the new Chrome makes itself the frontmost app for the whole task,
   so the user's typing goes into Ducter's browser (*verified*: about 29 s in front). Ducter
   now hands focus back within half a second (*verified*).
6. **The window goes away on its own** when the task reports done, 20–40 s after it
   appeared. *Verified.*
7. **Sign-ins persist across tasks.** *Verified* with a cookie: one task set it, the next
   task saw it. This depends on Ducter quitting the browser cleanly; cua-driver's own
   `end_session` kills Chrome and lost a cookie set seconds earlier (*verified*).
8. **Signing in for a task** (*verified* on the-internet.herokuapp.com with its public demo
   login):
   1. The task opens the login page and asks: "Please type the username and password
      yourself in the Ducter browser window on this Mac and click Login, then tap Go."
   2. The user types in that window; the model never sees the password.
   3. After Go, the task reads the signed-in page and reports.

   Two traps came up and are fixed in the brief:
   - Go means "take the default". When the default was "skip this step", Go skipped the
     sign-in, and the partner still told the user the task was reading the page. Now the
     default is "check that you are signed in and carry on".
   - The driver closes an idle browser after 300 s (*verified*: the window vanished at 5:00
     while the task waited). A sign-in finished well before that was kept on disk. A slow
     sign-in (2FA, a long form) can lose the window. This is open in `todo.md`.
9. **"CuaDriver was prevented from modifying apps on your Mac"** (a macOS Privacy & Security
   notification) appeared during the session. *Cause not identified*; browser tasks worked
   regardless. It needs a look before onboarding copy is written.

**Latency and cost (one sample each):**
- Lookup tasks took 25–50 s from task start to report.
- The partner's first line took 5–31 s; the 31 s case was a cold start.
- An HN lookup used 332k input tokens before the token diet and 140k after (mostly cache
  reads).

## Ideas to decide (heavy-user delight)

- ~~Adopt running sessions~~: not in v1 (D45). Users start fresh and grow into it.
- **Conductor import:** read its workspaces/worktrees, if any are left on disk.

## Open

- Remote-access step: Ducter Edge on `workers.dev` (`research/21`). It is about 3 steps, 4 on iOS (Home Screen install for push). CN users need a different path (pending).
- Whether the cartoon is pre-rendered (Lottie/Rive) or native MyGo animation. Native keeps
  the "cartoon becomes the UI" transition seamless.
