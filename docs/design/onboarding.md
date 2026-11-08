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

## The browser, first time (observed while building W5, 2026-11-09)

These are the setup moments a browser task hits on a Mac. They should become one checklist row
("Browser: ✓ ready / Set up"), shown only when the first web task needs it. Design pending.

1. **cua-driver must be new enough.** Typed browser tools (`browser_prepare`,
   `get_browser_state`) landed in cua-driver-rs 2026-07. The author's Mac had 0.6.8, which
   only has the legacy `page` tool; the latest was 0.44.0. The fix is
   `cua-driver update --apply`, which installs into `/Applications`, so the user must approve
   it. *Verified:* Ducter detects this and the partner explains it in plain words instead of
   opening a broken task.
2. **macOS privacy grants for CuaDriver** (not for Ducter or the terminal): Accessibility and
   Screen Recording, attributed to `com.trycua.driver`. `cua-driver permissions grant` opens
   the dialog; the user clicks Allow for both in System Settings → Privacy & Security.
   *Verified:* already granted on the author's Mac, so no prompt appeared. *Not verified:*
   the first-time prompt sequence, and whether an update (same team ID) keeps the grants.
3. **A vendor-signed Google Chrome (or Edge) is required.** The driver launches a separate
   Chrome with Ducter's own profile, so a second Chrome window and Dock icon appear. The
   user's own Chrome and its sign-ins are never touched (D48). *Inferred from cua-driver
   docs.*
4. **First sign-in to a site** happens in that window: the task stops and asks ("Please sign
   in to example.com in the Ducter browser window, then tap Go"). Later tasks reuse the
   session. *Not verified live yet.*

## Ideas to decide (heavy-user delight)

- ~~Adopt running sessions~~: not in v1 (D45). Users start fresh and grow into it.
- **Conductor import:** read its workspaces/worktrees, if any are left on disk.

## Open

- Remote-access step: Ducter Edge on `workers.dev` (`research/21`). It is about 3 steps, 4 on iOS (Home Screen install for push). CN users need a different path (pending).
- Whether the cartoon is pre-rendered (Lottie/Rive) or native MyGo animation. Native keeps
  the "cartoon becomes the UI" transition seamless.
