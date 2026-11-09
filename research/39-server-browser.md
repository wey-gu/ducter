# 39: A browser for the server-hosted Ducter (headless Linux, Codex only)

Asked (2026-11-10, for v0.0.4): the server-hosted Ducter (Hetzner Ubuntu, headless, Codex only)
should browse the web for tasks, with a Muse-like way to sign in. Builds on `23` (browser and
computer use), `25` (Muse's credential model), `29` (logins on a VPS) and `38` (the harnesses'
own browsers).

Tags: VERIFIED (run or read here), DOCUMENTED (vendor docs or repo pages), INFERRED.

## 1. Which browser, and how it runs headless

| Option | What it is | For a server | Evidence |
|---|---|---|---|
| **Chrome for Testing (CfT)** | Google's versioned Chrome builds for automation, one zip per platform, with a JSON index | `last-known-good-versions-with-downloads.json` lists `chrome`, `chrome-headless-shell`, `chromedriver` for `linux64`, **`linux-arm64`**, `mac-arm64`, `mac-x64`, `win32`, `win64`; Stable was 157.0.8103.38 on 2026-11-10. No root needed to unpack; the zip carries `deb.deps` (the Debian packages it needs: libnss3, libgbm1, libatk-bridge2.0-0, libcups2, libxkbcommon0, libasound2 …, 30 lines) | VERIFIED (fetched the index; listed the linux64 zip by HTTP range) |
| Chromium via apt | Ubuntu ships Chromium as a snap only since 20.04 | snapd on a server, confinement around the profile path, no pinned version | DOCUMENTED (Ubuntu), INFERRED fit |
| Playwright's bundled Chromium | `npx playwright install chromium` (+ `install-deps` as root) | Works, but needs Node and npm at install time and Playwright's own revision scheme | DOCUMENTED; VERIFIED present on this Mac (`~/Library/Caches/ms-playwright/chromium-1243`, not used) |
| Google Chrome .deb | `google-chrome-stable` from Google's apt repo | amd64 only; adds a repo and auto-updates under the user | DOCUMENTED |

**Headless mode.** Since Chrome 112 `--headless=new` is the real browser without a window
(same rendering, extensions, profile format), and `chrome-headless-shell` is the old,
lighter one (DOCUMENTED developer.chrome.com/docs/chromium/headless). A live view and real
sign-ins need the real browser, so `chrome --headless=new`. Xvfb plus a headed Chrome is the
fallback when a site refuses headless (INFERRED; not built).

**What a launch needs** (VERIFIED on this Mac with CfT 157, the same flags the Linux build
takes): `--user-data-dir=<profile>` (persists cookies, local storage, IndexedDB), and
`--remote-debugging-port=0`, after which Chrome writes the port and browser endpoint path to
`<profile>/DevToolsActivePort`; bound to 127.0.0.1 only. `--password-store=basic` keeps Chrome
off a desktop keyring (a server has none; cookies are then encrypted with a fixed key, so the
profile must be treated as secret, `research/25` §2). As root Chrome refuses to start without
`--no-sandbox` (DOCUMENTED, well known); running Ducter as a normal user keeps the sandbox.

**Headless tells.** New headless sends `HeadlessChrome/<v>` in its user agent (DOCUMENTED).
Some sign-in pages refuse that outright (INFERRED from common reports; Google's "This browser
or app may not be secure" also fires on automation-controlled browsers). Ducter sends the same
Chrome user agent without the word "Headless"; it doesn't otherwise hide that it is automated.
A datacenter IP still draws CAPTCHAs (`23`), which the user solves in the live view.

## 2. Which browser tool a task gets on Linux

| Candidate | License | Headless on Linux | Fit |
|---|---|---|---|
| Codex's own browser / Computer Use | n/a | **No**: its DOM-level tools need the ChatGPT desktop app's access host; Computer Use is a macOS app (`38`) | Not on a server |
| Claude in Chrome | n/a | **No**: needs Chrome with the extension and a person's session (`38`) | Not on a server |
| Ducter's cua-driver path | MIT | cua-driver drives a desktop session; Ducter's launcher is LaunchServices on macOS, and a headless server has no desktop to drive (VERIFIED `browser.ts`) | Not on a server |
| **Playwright MCP** (`microsoft/playwright-mcp`) | Apache-2.0 | `--headless`, `--cdp-endpoint`, `--user-data-dir`; ~25 core tools (`browser_snapshot`, `browser_click`, `browser_type`, `browser_tabs` …); "is **not** a security boundary"; Node 18+ | DOCUMENTED (repo page) |
| **chrome-devtools-mcp** (`ChromeDevTools/chrome-devtools-mcp`) | Apache-2.0 | `--headless`, connects to a running Chrome, `--isolated`; only Chrome / CfT supported; Node LTS | DOCUMENTED (repo page) |
| **Ducter's own small CDP tools** on Ducter's MCP | Ducter's | Same browser over CDP | Built here |

Why Ducter's own and not Playwright MCP, though Playwright MCP is good and well maintained:

1. **The blind guarantee has to live in code.** While the user signs in, no tool may read the
   page. A third-party server would need a proxy in front of every tool; Ducter's own tools sit
   behind one check in the process that also runs the live view.
2. **No secrets reach the model by construction.** The read tool never returns a password
   field's value; the type tool refuses password and one-time-code fields. Playwright MCP's
   snapshot and `browser_evaluate` can return anything on the page.
3. **The sign-in ask is a tool.** `browser_ask_sign_in` makes the card itself; a third-party
   server can't reach Ducter's decisions.
4. **Nothing to install at task time.** No Node or npm on the server; the tools are served
   by the Ducter process every task already talks to (its `/mcp`).

The cost: Ducter maintains ~9 tools (open, read, click, type, press, scroll, back, tabs,
screenshot, ask sign-in) and its own page reader. If they fall short, Playwright MCP over
`--cdp-endpoint` to the same browser is the drop-in (INFERRED).

## 3. The live view

CDP gives what a remote view needs (DOCUMENTED chromedevtools.github.io/devtools-protocol):
`Page.startScreencast {format: "jpeg", quality, maxWidth, maxHeight}` pushes
`Page.screencastFrame` events, each acknowledged with `Page.screencastFrameAck` (Chrome stops
sending when acks stop: built-in flow control); `Input.dispatchMouseEvent` (press, release,
move, `mouseWheel`), `Input.dispatchKeyEvent` and `Input.insertText` (text from an IME or a
phone keyboard, in one call). Frames go over Ducter's existing authenticated WebSocket, so
they ride the domain and HTTPS `ducter domain` set up (D143), with the same device token.
VERIFIED here (CfT 157 on this Mac, Ducter's relay): frames come only when the page paints, so
a sign-in page sends a handful, not a stream; a 1052×592 page at 2× and quality 60 is ~37 KB;
a tap through the phone web client's live view focused the page's field and typed text landed
in it. Ducter sends the next frame only after the client acks the last, which caps the rate at
what the link carries (frame rate on a real phone link: not measured).

One more fact found on the way (VERIFIED): Bun 1.3.1's WebSocket client offers
permessage-deflate, Chrome accepts, and Bun then failed inflating some frames ("Invalid
compressed data", close 1002) mid-task; its `perMessageDeflate: false` option is ignored in
1.3.1. Ducter talks CDP over its own small client without extensions.

## 4. Muse's credential model, applied (`25`)

- **The user signs in themselves in a live view** (Muse takeover; ChatGPT agent and Manus do
  the same). The password and the 2FA code go from the user's keyboard to the browser and
  nowhere else. Ducter keeps no vault in this slice (`25` §3.1 path 1 only).
- **The agent is blind while the user is in it** (Muse pauses the agent during takeover and
  fills). Here: while a live view is open on a profile, every browser tool answers "the user
  is in the browser" and reads nothing; the task is waiting on its sign-in card anyway.
- **Sessions persist per profile** (Muse, Manus, Browserbase Contexts): one Ducter profile per
  persona on the server; cookies stay after the browser quits cleanly.
- **A "signed-in sites" list with per-site sign out and clear all** (Manus, ChatGPT agent): from
  CDP's cookie store, grouped by site, without showing cookie values.
- **Sensitive steps hand back to the user**: D62's Go rule stays; signing in is always the
  user's, paying and posting always wait for Go.

## Implications for Ducter

1. On Linux, 上网 / Browse the web runs **Ducter's own browser**: Chrome for Testing (`chrome`,
   `--headless=new`), installed by Ducter into its data folder on one tap; as root it also
   installs the packages from `deb.deps` (t64 names on Ubuntu 24.04), as a normal user it
   prints the one `sudo apt-get` line when any are missing.
2. Tasks drive it through **Ducter's own browser tools on Ducter's MCP**, for every harness
   (Codex first on a server). D130's native-first stays for macOS.
3. Sign-in is a **card that opens a live view** (CDP screencast over the authenticated
   WebSocket, input forwarded), with the agent blind while it is open, and **a Sites list**
   with sign-out.
4. Real-server checks still owed: a Hetzner run of the install as root and as a user, a real
   sign-in over the domain from the phone, and how often datacenter IPs meet CAPTCHAs.

**Summary.** Neither harness brings a browser to a headless server, and cua-driver needs a
desktop. Chrome for Testing has `linux64` and `linux-arm64` builds with their apt deps listed
in the zip; new headless keeps the real browser and its profile. Ducter serves its own small
CDP tools on its MCP (Playwright MCP and chrome-devtools-mcp are Apache-2.0 and headless, but
can't enforce the blind-during-sign-in rule or keep password fields out of reads), and streams
a CDP screencast to the user's app for sign-ins, as Muse's takeover does.
