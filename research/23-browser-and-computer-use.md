# 23: Browser use and computer use as task places

Researched 2026-11-08 for D41 (computer use built on trycua/cua) and D42 (browser use in v1,
"the most elegant solution") in `design/roadmap.md`. The place model is in
`design/product-model.md` §3. The seams this has to fit are in `design/system.md`,
"Hooks v1 must leave open for phone and call": an environment port, a typed place union with an
`isolation` field, per-task MCP sidecars, a media relay, and a takeover state. Principles 15
(one thin adapter) and 18 (scope credentials, gate effects, honest isolation) apply.

**Sources.**
- Shallow clones, read-only and never executed, under
  `<scratch>/repos/`
  (written `R/` below):
  - `cua` @ `da8e73b` (2026-11-08);
  - `playwright-mcp` @ `404be8e`;
  - `chrome-devtools-mcp` @ `0b37364`;
  - `browser-use` @ `b49a68e`;
  - `stagehand` @ `3109575`;
  - `agent-browser` @ `4b0e9f0`.
- GitHub API star counts and licenses, plus vendor and news pages fetched 2026-11-08.

**Labels.**
- **V**: verified in source (path:line) or on a page I fetched.
- **V-s**: from search snippets or secondary coverage only.
- **I**: my inference.

---

## 1. trycua/cua in depth

### 1.1 What cua is now (it changed a lot in 2026)

The repo has been reorganised. The Python `cua-agent` / `cua-computer` / `computer-server`
stack that most write-ups still describe is **deprecated**. **Cua Cloud (Fleets) ended on
2026-10-18** (V `R/cua/README.md:226-242`, `docs/content/docs/cua-sdk/guides/cua-cloud-ended.mdx:8-12`).
`cuabot` is flagged "do not run it: known security issues" (V `README.md:232`). The current
pieces:

| Component | What it is | License | Evidence |
|---|---|---|---|
| **Cua Driver** (`cua-driver`, v0.44.0) | Rust driver for native apps **and Chromium page content** on macOS, Windows and Linux. MCP over stdio (`cua-driver mcp`), a CLI (`cua-driver call`), plus Python and TS SDKs. It delivers input in the background without taking focus where the platform allows | MIT | V `libs/cua-driver/README.md:3,42-56`, `rust/Cargo.toml:23` |
| **cua SDK + `cua` CLI + `cua daemon`** (v0.15.1) | Sandboxes: a Linux/Windows container or VM, a macOS VM, a microVM. Exec, files, screenshots, input, checkpoints and forks. **No agent layer**: "drive sandboxes from your own harness" | MIT | V `README.md:137-175`, `libs/cua/README.md:23-34`, `libs/cua/VERSION` |
| **cua-spacesd** | The in-sandbox daemon on :3211. It serves gRPC (`cua.env.v1`), `/mcp` (streamable-HTTP MCP over the cua-driver tool registry), `/files`, `/tunnel`, and `/media` with H.264 video and Opus audio. Input goes through the linked cua-driver | **FSL-1.1-MIT** | V `libs/cua-spacesd/README.md:1-27`, `legal/LICENSING.md:34` |
| **Lume** | macOS and Linux VMs on Apple Silicon (Virtualization.framework) | MIT | V `README.md:123-133`, `docs/.../lume/index.mdx:23-28` |
| **Cua Spaces app** | Menu-bar app with Teleport (moves a signed-in app into a Space via the Keyvault), multiplayer cursors, and "step in … hand the desktop back". Free for individuals; Pro $18/mo | FSL-1.1-MIT | V `README.md:67-87` |
| HTML5 viewer (`cua-spacesd-html5`), media client and codecs | WebCodecs viewer at `/viewer/` on :3211, or standalone `cua viewer` | FSL-1.1-MIT | V `docs/.../cua-sdk/guides/spacesd.mdx` "Viewer architecture"; `LICENSING.md:47,53` |
| CUA-S1 | Small "System 1" models for form decisions (research release) | MIT code, weights per card | V `README.md:179-189` |
| Lumier, xfce/kasm/qemu images | Deprecated; replaced by `ghcr.io/trycua/linux`, `windows` and `macos` | n/a | V `README.md:241-242` |

**FSL means:** you may self-host and build on it for anything except a "Competing Use", meaning
offering it or something substantially similar as a commercial product or service. Each release
becomes MIT two years later (V `legal/LICENSING.md:84-90`). Ducter is self-deployed and does not
resell Spaces, so it is fine. A future hosted Ducter would need a review (I).

**Maturity.** 31,987 stars, MIT at the repo root, created 2025-01, last pushed today (V GitHub
API). Release cadence is high and so is churn: three product lines were retired within 2026 (V
above). Pin versions the same way Ducter pins OAR (I).

### 1.2 Host requirements and isolation

| Backend | Host | Isolation | Notes |
|---|---|---|---|
| Linux container (`ghcr.io/trycua/linux:24.04`: Ubuntu 24.04, XFCE on Xvfb, AT-SPI, PipeWire, spacesd) | Docker or Podman. `gvisor` if installed, else `runc` | gVisor: strong; runc: medium | V `libs/images/README.md:7`, `local-runtimes.mdx` "This machine". Firefox does not start under gVisor on amd64, so use Chromium, as cua-driver's browser tools already do (V `images/README.md:89`) |
| Linux / Windows VM | QEMU: KVM, HVF or WHPX | VM | Windows amd64 runs under slow TCG on Apple Silicon (V `local-runtimes.mdx` warn callout) |
| macOS VM | Lume, Apple Silicon only, macOS 13+, 50 GB free per guest, **at most 2 macOS guests at once** (Apple's limit) | VM | V `lume/index.mdx:25-28`. `macos:26-slim` ships spacesd plus Google Chrome (V `images/README.md:27,39`) |
| microVM | Firecracker on Linux+KVM; `vz` / `containerization` on a Mac | VM | V `local-runtimes.mdx` table |
| **Host driver** (cua-driver on the user's own Mac/PC) | macOS needs Accessibility + Screen Recording granted to `CuaDriver.app`. Windows needs an interactive session, not Session 0 | **none** (it is the user's session) | V `cua-driver/README.md:213-224`, `vms-and-remote.mdx` |
| Your own cloud | `on="aws"/"gcp"/"hetzner"/"modal"`; contrib E2B, Daytona | provider VM | V `local-runtimes.mdx` table |

**Snapshots.** `CheckpointSandbox` / `ForkSandbox` saves memory and disk on microVMs and QEMU, and
the filesystem on containers. QEMU forks share RAM pages copy-on-write. Checkpoints can be
pinned (V `libs/cua/proto/cua/daemon/v1/checkpoints.proto:1-33`). For Lume, `lume clone` works on
a stopped VM, and TCC grants survive a clone only while the release-signed `CuaDriver.app` stays
the same (V `vms-and-remote.mdx` "Save a reusable copy").

### 1.3 How a harness drives it

- **MCP is the agent boundary.** `claude mcp add --transport stdio cua-driver -- cua-driver mcp`
  (V `cua-driver/README.md:199-211`).
  - It supports MCP `2026-07-28` and legacy `2025-06-18` over stdio.
  - It embeds an 11-file skill pack served as MCP resources.
  - Codex 0.154.0 and Claude Code 2.1.268 were verified against it (V
    `docs/mcp-protocol-and-skills.md:5-8,97-100`).
  - The loopback HTTP endpoint is still legacy MCP only (V same file, "HTTP limitation").
- **CLI** (`cua-driver call <tool> '<json>'`) serves shell-first harnesses. That is the route
  for **pi**, which has no MCP (I, from pi's design).
- **A sandbox's driver** is reached through spacesd `/mcp`. You can also run `cua-driver mcp`
  inside the guest over `ssh -T … cua-driver mcp`, registered as a stdio server (V `spacesd`
  README:12, `vms-and-remote.mdx`). `sb.mcp_config(service)` returns the URL and headers for any
  MCP client (V `libs/cua/README.md:63-65`).
- **Models.** Any model. cua ships no agent and no model loop; the harness's own model decides.
  The agent SDK that wrapped Anthropic, OpenAI CUA and UI-TARS loops is deprecated (V
  `README.md:63,235`). CUA-S1-forms is optional.

### 1.4 Observation, performance, takeover, streaming

- **Accessibility tree first, pixels last.**
  - Native reads come from the accessibility tree: AX (macOS), UIA (Windows), AT-SPI (Linux).
    Actions use snapshot-bound `element_token`s. Pixel clicks are used only for surfaces missing
    from the tree.
  - A targeted `get_window_state(query)` returns about **2K chars, versus about 42K for a full
    snapshot**. `run_steps` batches actions and returns a diff (V `rust/Skills/cua-driver/SKILL.md:36-44`).
  - Optional OmniParser perception is AGPL. Do not ship it (V `cua-driver/README.md:8-26`).
- **Browser rung (new in 2026).** The driver has typed browser tools: `get_browser_state`,
  `browser_prepare`, `browser_navigate/click/type/pointer/dialog/set_input_files/download`.
  - `semantic_v2` composes the page accessibility tree, the pierced DOM, layout and viewport into
    a compact outline with action refs.
  - Screenshots are opt-in because "authenticated pages may contain sensitive information" (V
    `BROWSER.md:19-31,288-330`).
  - Browser chrome, permission prompts, downloads and file pickers stay native windows driven by
    the same driver (V `BROWSER.md:1-6`). **One driver covers the page and the OS around it.**
  - The semantics are "exact or refuse": structured refusals with `next_call` (V
    `browser-tool-implementation-plan.md:53-66`).
- **Profiles.**
  - `browser_prepare {profile:{mode:"isolated_new"}}` gives a temporary profile.
  - `isolated_named` gives a **persistent driver-owned profile** (`profile_persists_after_session`
    is true only for that mode). The driver launches a separate vendor-signed Chrome or Edge, never
    a user dir.
  - Attaching to the user's **real** profile needs a trusted launch grant
    (`cua-driver mcp --grant existing-profile`) or `DriverAuthorizationHost`. On macOS Chrome
    brings itself forward and shows "Allow remote debugging?" for every new connection. Approved
    connections are shared across sessions for up to 8 h.
  - The driver's own warning: "CDP exposes broad authority over the profile's live pages, cookies,
    storage … loopback is not authentication against other processes running as the same OS
    user" (V `BROWSER.md:121-240`).
- **Support matrix** (V `BROWSER.md:532-545`).
  - Chrome/Edge on Windows, macOS and Linux X11: exact binding, refs, navigate, type, DOM click.
    Trusted standalone pointer refuses on macOS and X11.
  - Wayland: only with proven compositor identity.
  - Safari and Firefox: native window state only.
- **Live view and takeover.**
  - spacesd streams **H.264 + Opus over `/media` WebSocket or QUIC :3212** (media wire v2). Its
    tickets are scoped to one session, last 60 s by default and 10 min at most, and are "safe in a
    URL". You get a keyframe on attach and latest-frame flow control (V
    `libs/cua/proto/MEDIA.md:1-60`).
  - Presence gives a separate human cursor and agent cursors (Spaces "multiplayer … step in …
    hand back", V `README.md:74`; `spacesd/README.md:140-160`).
  - The embedded viewer is at `:3211/viewer/` (FSL). Lume VMs also expose VNC (`--display vnc`, V
    `lume/guides/manage-vms.mdx:28`).
  - A glass-to-glass and input-to-photon benchmark exists (`libs/cua/bench/streaming`). I found no
    published numbers.
- **Relay.** `cua-spacesd join --relay wss://…` publishes a machine over one outbound WebSocket
  (V `spacesd.mdx` "Relay"). That is the same shape as Ducter's runner. Ducter should carry the
  media itself rather than use the cua.ai relay (I).
- **Costs.**
  - Self-hosted cua is $0: MIT and FSL, on local or own-cloud machines.
  - Cua Cloud no longer exists.
  - Resources: one Linux desktop container needs ~1.2–1.5 GB unpacked image (V
    `images/README.md:297`) plus roughly 1–2 GB RAM with Chromium (I). A macOS VM needs 50 GB disk
    and is capped at 2 per Mac.

---

## 2. Browser-use landscape, November 2026

| Option | Shape | Real browser / profile / cloud | DOM vs vision | Takeover | Open / self-host | Any harness | Safety hooks |
|---|---|---|---|---|---|---|---|
| **cua-driver browser tools** | MCP + CLI, Rust | `isolated_new`, **`isolated_named` persistent**, or explicit existing-profile grant | A11y+DOM `semantic_v2` refs; opt-in screenshot; native fallback | Through spacesd stream + presence in a sandbox; on host, the user's own screen | MIT driver, FSL streamer | Yes (MCP or CLI) | Permission modes `standard/bounded/unrestricted`, capability manifest, "content cannot authorize actions" (V `cua-driver/README.md:73-97`, `SKILL.md:80`) |
| **agent-browser** (Vercel Labs) | Rust CLI + daemon + skills; `agent-browser mcp` | Chrome for Testing; `--profile <dir>` persistent; copy of a real profile (read-only snapshot); `--cdp`/`--auto-connect`; providers Browserbase/Browser Use/Kernel/… | A11y refs `@e1`; screenshot/diff | WebSocket stream of frames **plus input** for "pair browsing" (JPEG, ~25–54 KB/frame at 720p) | Apache-2.0, 47.3k★, created 2026-01 | Yes | Auth vault (LLM never sees passwords), `--allowed-domains` (blocks navigation, subresources, WS, beacons, WebRTC), `--action-policy`/`--confirm-actions`, `--content-boundaries` nonce markers, `--max-output` (V `README.md:13-54`, `docs/.../security.mdx:20-40`, `streaming.mdx:6-57`, `sessions.mdx:88`) |
| **Playwright MCP** (Microsoft) | MCP (they now recommend `playwright-cli` + skills for coding agents) | Persistent user-data-dir default, `--isolated`, `--storage-state`, `--extension` to attach to running Chrome/Edge | A11y snapshot; `--caps vision` adds coordinates | None built in | Apache-2.0, 39.3k★ | Yes | "Not a security boundary"; `--allowed-origins` "does not serve as a security boundary"; `secrets` redaction is "convenience" (V `README.md:5-17,410-489,695-707,853`) |
| **Chrome DevTools MCP** (Google) | MCP + CLI, puppeteer | Launches own profile, `--isolated`, or `--autoConnect` to the user's Chrome 144+ via `chrome://inspect/#remote-debugging` with a permission dialog | A11y snapshot + DevTools (network, console, perf traces) | None | Apache-2.0, 55.0k★ | Yes | Disclaimer: exposes all browser data to the client (V `README.md:24-40`, `docs/advanced-usage.md:55-95`) |
| **browser-use** | Python agent library (own loop + BU2 model), CLI/skill, `browser-harness` ("use your real Chrome, logged in as you", MIT, 19k★), Cloud | Local, real Chrome, or cloud ($0.02/browser-h, stealth, CAPTCHA, proxies, live-view URL) | DOM + vision | Cloud live view | MIT, 120k★ | Lib: no (it *is* an agent); CLI: yes | Cloud-side (V `README.md` body; GitHub API) |
| **Stagehand** (Browserbase) | TS/Py SDK: `act/observe/extract` + agent | `userDataDir` persistent locally, or Browserbase cloud ($20/mo for 100 h, then $0.10–0.12/h, V-s) | Hybrid DOM/vision, self-healing | Browserbase live view | MIT, 26k★ | Code-level, not harness-native | Keeps credentials out of the model via `observe()` selectors (V `stagehand/README.md`) |
| **Steel / Kernel / Hyperbrowser / Notte** | Cloud browser APIs (CDP) | Cloud profiles | n/a (infra) | Live view (Kernel, Steel) | Steel Apache-2.0 self-host via Docker; Kernel images Apache-2.0; Hyperbrowser agent AGPL (V-s) | Through CDP / agent-browser providers | Vendor-held cookies. ~$0.05–0.10/browser-h (V-s, vendor-authored comparisons) |
| **Claude in Chrome** (Anthropic) | Extension + native messaging; Claude Code `--chrome` | **User's real Chrome** with its logins; tab group per session | Screenshot + DOM read | Visible window; "pauses and asks you to handle login or CAPTCHA" | Closed; needs a claude.ai plan and `/login` (not API key); not Bedrock/Vertex | **Claude Code only** | Site permissions; GA 2026-08; Anthropic reports ~0–0.3% attack success with classifier on 2026 models (vendor-run) (V `code.claude.com/docs/en/chrome`; V-s claude.com GA post) |
| **OpenAI Atlas / Operator** | Atlas retired **2026-08-09**; agent moved into the ChatGPT desktop app's built-in browser plus a Chrome extension | Logged-in or logged-out modes | Vision | Watch mode on sensitive sites | Closed | No | (V-s: 9to5mac 2026-08-04, BGR, TNW) |
| **Perplexity Comet** | Consumer AI browser, free; agentic tabs | Real browser | Vision+DOM | User is the browser | Closed | No | Amazon sued over cart automation (V-s) |
| **Dia** (Atlassian) | Chat-with-page browser, beta, macOS only | Real browser | n/a | n/a | Closed | No | Weak agentic actions (V-s) |

**Takeaways along the axes.**
- **(a) Which browser.**
  - Consumer AI browsers (Atlas, Comet, Dia) and Claude in Chrome bind the agent to *one vendor's
    harness* and to the user's real logins. Ducter's rule is "any harness" (D44), so these are
    out as the core.
  - The tools that serve developers best all converge on a **separate persistent profile by
    default, with attach-to-real-Chrome as an explicit and scary opt-in**: cua `isolated_named`,
    agent-browser `--profile`, Playwright's user-data-dir, DevTools `--isolated`.
- **(b) Observation.** The accessibility tree plus DOM refs is the consensus for reliability and
  cost. Vision is a fallback for canvas and unlabeled UI. Every serious tool here does this.
- **(c) Cost.**
  - Local is $0 apart from the machine. Cloud browsers cost $0.02–0.12/h plus proxies.
  - Tokens dominate. Cut them with bounded snapshots and diffs (cua `since:"latest"`, Playwright
    `browser_find`, agent-browser `snapshot -i`).
- **(d) Takeover.**
  - Only cua (stream + presence, a separate human cursor) and agent-browser (WS frames + input)
    give a *programmatic* takeover surface Ducter can relay.
  - The others assume the human sits at the machine.
- **(e) Open source.** cua (MIT+FSL), agent-browser, Playwright, DevTools MCP, browser-use,
  Stagehand and Steel are all open.
- **(f) Harness.** Every option except the vendor browsers works through MCP or CLI.
- **(g) Safety.**
  - Every vendor says its own filters are "not a security boundary".
  - Real containment comes from **where the browser runs** (sandbox, separate profile) and from
    **gating effects outside the model** (principle 18). Page text is untrusted, always.

---

## 3. Recommendation for Ducter v1

### 3.1 One environment family: "screens", built on cua

Make **browser a specialisation of computer, not a second stack.** A browser place is a
Ducter-owned Chromium profile running *inside a cua computer*. One driver (`cua-driver`) handles
both the page (typed CDP tools) and the OS around it (file pickers, downloads, permission
prompts, native apps). In a pure-CDP stack those surfaces are where the agent gets stuck.

That gives exactly one of each:
- one MCP sidecar;
- one media stream;
- one takeover model;
- one isolation story;
- one vendor to pin.

The cua driver's "exact or refuse" contract fits Ducter's honesty principle (I). It is the most
elegant option because it removes a seam: the *Where* chip changes (`Browser` vs `Computer`), the
machinery underneath does not.

**Runner-up, kept behind the same port: agent-browser.**
- It has the best pure-web developer experience and the richest built-in safety: vault, domain
  allowlist, confirm-actions, content boundaries.
- It runs headless and cheaply on a VPS, and its WS stream supports input.

If the v1 spike shows cua-driver's browser rung unreliable on Linux/gVisor, swap the browser
backend to agent-browser + Chrome for Testing inside the same cua Linux sandbox. The place,
stream and UI stay unchanged (I).

**Not chosen as the core.**
- Playwright MCP and DevTools MCP: good, but neither has a takeover surface. DevTools is
  debugging-first.
- browser-use library: its own agent loop competes with the harness.
- Cloud browsers: they hold the persona's cookies; acceptable later as an opt-in backend for
  stealth or CAPTCHA.
- Claude in Chrome: Claude-only, real profile. Allow it only as a harness-native extra the user
  turns on for Claude tasks, never the default.

### 3.2 Default profile model

- **Default: one persistent Ducter profile per persona per device** (`ducter-<persona>`).
  - It lives in a long-lived cua Linux sandbox, the "browser box": gVisor on a VPS, Docker or
    Lume Linux on a Mac.
  - The profile persists as cua-driver `isolated_named` inside a sandbox that is never deleted,
    and is checkpointed after each login (I; volume/bind-mount persistence needs the spike).
- **Logins happen by takeover, not by credentials.** The agent hits a login, 2FA or CAPTCHA and
  raises `needs-you: Log in to <site>`. The user opens the task, taps **Take over**, signs in in
  the live view, and hands back. Cookies stay in the persona's profile. No password ever enters
  model context (principle 18).
  - Later: a vault filler such as agent-browser's `auth login` or Stagehand's `observe()`
    pattern.
- **The profile is an exclusive resource.** One task drives a persona's profile at a time; a
  second browser task **waits** ("在等 · 被占用"), like the port leases in §3 of the product
  model. Parallel throwaway work gets `isolated_new` (I).
- **Attach to the user's real Chrome: off in v1.**
  - It is the weakest isolation: CDP grants cookies and storage of the entire profile.
  - On macOS it steals focus and prompts on every connection.
  - It needs a trusted grant.
  - Offer it in v1.x as a per-task capability with a red isolation chip ("your real Chrome · no
    isolation"), granted through `DriverAuthorizationHost` from the Ducter UI.
- **Mac host mode (optional): a Ducter profile in a separate Chrome window on the user's Mac,
  driven by host cua-driver.**
  - Gains: the residential IP and the user's location, so fewer CAPTCHAs.
  - Costs: isolation is `profile` only, and it needs TCC grants.
  - Offer it per device in capability setup (D43).

### 3.3 The place in the UI

- **Card and header chip:** `Browser · Ana · Linux box`, or `Computer · macOS VM · MacBook`. The
  isolation badge reads `sandbox`, `VM`, `profile only` or `your Mac`.
- **The opened task gets a Screen tab** (siblings: the future Call tab, `research/22`):
  - a live view, streamed only while the view is open;
  - a status line: "Agent driving" / "You're driving" / "Paused";
  - buttons: **Take over · Hand back · Pause · Snapshot**;
  - an activity strip of driver actions taken from the sidecar log.

  The card thumbnail is the last keyframe at low resolution.
- **Takeover semantics.**
  - Take over sets the task's takeover state. The gate (§3.4) then answers agent tool calls
    with `human_in_control`, and the human cursor gets input.
  - Hand back clears the state, and the agent's next read invalidates old refs. That matches
    cua's own rule: re-bind after reconnect (V `BROWSER.md:547-570`).
- **Phone:** the same Screen tab in the mobile web client. Takeover on a phone is tap and type
  on the stream, good enough for login and 2FA (I).

### 3.4 Minimal v1 integration with the runner's environment port

```ts
type Place =
  | { kind: "browser"; device: DeviceId; profile: { persona: PersonaId } | "ephemeral";
      backend: "sandbox" | "host"; isolation: "sandbox" | "vm" | "profile" }
  | { kind: "computer"; device: DeviceId; backend: "linux" | "lume-macos" | "qemu" | "host";
      image?: string; isolation: "sandbox" | "vm" | "none" }
  | /* folder | repos | phone | call */ ...;

interface EnvironmentPort {             // beside HarnessPort (system.md)
  prepare(place, task): Promise<EnvHandle>;  // idempotent; takes the profile lease
  release(handle, { keep: boolean }): Promise<void>;
}
interface EnvHandle {
  mcp: McpServerSpec[];      // attached to this task's harness only
  cli?: { bin: string; skill: string };   // for pi
  media?: { open(target): Promise<MediaTicket> };
  takeover: { begin(by): void; end(): void; state(): "agent" | "human" | "paused" };
  isolation: Isolation;
  checkpoint?(name): Promise<void>;
}
```

1. **Runtime setup.** It is part of game-like capability setup (D43).
   - The runner bundles pinned `cua` and `cua-driver`, and runs `cua runtime doctor` (read-only)
     to show what the device can host: Docker+gVisor, Lume, QEMU.
   - Setup is one approved `cua runtime setup` (V `local-runtimes.mdx`).
2. **prepare(browser).**
   - Ensure the persona's sandbox exists (`ghcr.io/trycua/linux:24.04`, pinned digest) and is
     running.
   - Fetch spacesd's env token **into the runner only**.
   - Build the sidecar.
3. **The sidecar is a Ducter gate, not raw cua.** `ducter env-gate` is a stdio MCP proxy inside
   the runner binary. It fronts spacesd `/mcp` (or `cua-driver mcp` over stdio on host mode).
   - **Curated tool list.** About 12 tools: `get_browser_state`, `browser_*`, `get_window_state`,
     `click`/`type_text`, `run_steps`, `verify_state`. The tool-count cliff in [8] makes this
     matter.
   - **Untrusted-content framing.** Page and AX text comes back wrapped in nonce'd boundary
     markers with "data, not instructions" framing (the agent-browser idea).
   - **Domain policy** per task.
   - **Effect gating.** When a click or type targets a ref whose role/name or URL matches
     submit, pay, buy, send, delete or account settings, or a checkout or payment origin, the
     gate turns the call into an **intent** with `human_reply`. **Payments always need a human**,
     who completes them through takeover. Everything else follows the user's mostly-auto policy
     (`system.md` Safety).
   - **Log mirroring.** Every action is mirrored to the Log as a typed event. Screenshots are
     *not* stored by default.
   - **Takeover.** While a human holds the place, the gate refuses with `human_in_control`.
   - The cua-driver permission mode is `bounded` with a Ducter-generated capability manifest
     where available (V `cua-driver/README.md:73-84`).
4. **Media relay.**
   - The runner calls `StreamService.OpenMedia(target = the Chrome window or the desktop)`, then
     pipes `/media` (H.264 Annex B, keyframe on attach) over its single outbound WebSocket to the
     main process / Edge, and on to the client.
   - The web client decodes with WebCodecs.
   - The v1 shortcut is to iframe spacesd's own `/viewer/` through the relay with a viewer
     ticket. That is FSL, but fine self-hosted.
   - MyGo desktop gets the same relayed stream, or a low-fps JPEG fallback (I). Tickets are
     short-lived, scoped to one session, and never the root token (V `MEDIA.md` §2).
5. **Computer places** reuse steps 2–4 with `lume-macos` (`macos:26-slim`, at most 2 per Mac) or
   `linux`. **Host mode** uses the user's own session: isolation `none`, and Ducter says so
   (principle 18).
6. **Handoff and archive.**
   - Archive leaves the persona sandbox running, or stops it on a disk budget.
   - It checkpoints after the first login.
   - A device move is a handoff: profiles do not migrate in v1 (I).

**Spike before committing (about 1 week, I).**
- cua-driver `get_browser_state` and `browser_*` on Chromium in the Linux image under gVisor
  (amd64 + arm64) and runc.
- `isolated_named` survives a sandbox restart.
- spacesd `/mcp` reached from Claude Code, Codex, and pi via the CLI.
- Relay latency through the Edge.
- Human input during takeover.
- Fallback A/B against agent-browser on the same 20 tasks.

### 3.5 Risks

- **cua churn.** Cloud, the agent SDK and computer-server were all retired in 2026, and the
  browser tools date from 2026-07. Pin exact versions, keep the gate as Ducter's only contract,
  and keep agent-browser as a drop-in backend.
- **FSL parts:** spacesd, the viewer and the media crates. They are fine for self-deployed
  Ducter. They block a future *hosted* Ducter that offers screens to others. The MIT parts (the
  driver, Lume, the SDK) never depend on them (V `README.md:274-279`).
- **Datacenter IPs** on a VPS draw CAPTCHAs and bot walls. Mac-hosted boxes, takeover, or a later
  opt-in cloud browser with proxies mitigate this.
- **Prompt injection is not solved.** Vendors report low attack-success rates on their own evals
  (V-s). Ducter's defence is structural: a sandbox or separate profile, no credentials in
  context, gated effects, and a domain policy. Never "the model will notice".
- **macOS specifics.** TCC grants per signed app, a cap of 2 macOS VMs, 50 GB each, and real-Chrome
  attach that steals focus and prompts on every connection (V).
- **Resource cost.** About 1–2 GB RAM per live browser box, and H.264 encoding CPU while the view
  is open (I). Stream only on demand.
- **Profile lease contention.** One persona can drive one browser at a time. That is acceptable
  for one daily persona (roadmap) (I).
