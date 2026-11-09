# Roadmap

> Living document. Scope changes go through the change loop (`AGENTS.md`) and `design/decisions.md`.
> *Built* notes below say what exists after the overnight build of 2026-11-09; what was verified
> and how is in `design/plan/v1-tonight.md` and `design/scenarios.md`.

## V1: heavy developer + powerful personal AI (D33)

**Who:**
- Heavy multi-agent developers (the author first): v1 must replace conductor.
- People who use consumer personal AIs (Grok bot, Muse): Ducter gives them the same powers,
  but lets any strong harness or model be the main AI (D44).

Onboarding and defaults meet the ordinary-person bar.

**Topology (D34)**
- The **main process** runs on a VPS or a Mac: control plane, main AI loop, Log store
  (SQLite), waiters, push.
- **Workers** are VPS and Mac runners: the single-binary OAR runner, which dials out only.
  *Built (D54, D83):* `ducter worker <address> --code <code>` with the same one-time code a
  phone uses, presence, and task placement by `Place.device`, with
  offline/resume (`design/system.md` Workers).
- **Clients:**
  - Desktop: MyGo native UI. *Built:* the three zoom levels, Connect to your Ducter, and
    **Ducter.app** (a DMG, Developer ID signed and notarized (D55); the app runs its own Ducter; D56: closing the
    window keeps it running, built as a per-user LaunchAgent, `design/onboarding.md` "Lifetime").
  - Mobile: **web** (served by the main process, reachable from anywhere through a tunnel).
    *Built (2026-11-09):* `apps/web`, a Preact phone client served at `/app` (conversation,
    decisions, On hand, opened task), pairing from the `ducter pair` link or QR, and Web Push.
    Verified in a headless browser at 390×844, not yet on a real phone. Preact, amending D20
    for the web (D58).
  - iPhone: a native **SwiftUI shell** (`apps/ios`, D131) around the same phone client, with
    APNs and Go / Hold / Reply on a decision's notification. *Built:* TestFlight through CI,
    internal testers only; public "coming soon" (`design/release/ios.md`).
- **Remote access (research/21):** a small **Ducter Edge** on the user's own free
  `workers.dev` subdomain. It is one Worker plus one relay Durable Object, about 300–600 LOC.
  - It serves the web client. The phone and the main process both dial into it, which gives
    a stable HTTPS URL with no domain, behind NAT, at about $0.
  - Alternatives: Tailscale `serve` (maximum privacy), or a named tunnel / direct HTTPS for
    users with a domain.
  - Supports both `workers.dev` (zero setup) and a **custom domain** on Cloudflare (D46).
    `workers.dev` is likely blocked in mainland China; there, use a custom domain or a
    company network.
  - *Not built yet.* Today a phone or another Mac reaches a server through Caddy on the
    user's own domain or an SSH tunnel (server mode below).
- **Pairing:** a QR code with a one-time code (the dsh model), then a WebCrypto device key
  plus a passkey; every device can be revoked individually.
  *Built (D54):* the code half: `ducter pair` (code, link, terminal QR), `POST /pair` → a
  hashed, revocable device token, `ducter devices`; the desktop's "Connect to your Ducter".
  The phone web client pairs with the same code (the link opens `/pair#c=…`); the device key +
  passkey are still to come.
- **Server mode (D54, research/29):** `ducter service install` runs the main process as a
  systemd user service bound to 127.0.0.1. Reach it through Caddy on the user's own domain
  (`scripts/caddy-setup.sh`; the default for CN users, Q18) or an SSH tunnel. The Edge stays
  the no-domain path for phone and web.
- **Push:** Web Push sent from the main process (iOS Safari needs 16.4+ and a Home Screen
  install), and APNs for the iPhone app (D131). *Built:* VAPID + RFC 8291 and APNs in
  `packages/core/src/push.ts`; an unread decision pushes after 30 s, coalesced per 15 min;
  done results only on request; quiet hours 23:00–08:00 hold everything; Android gets Go /
  Hold actions (D59), the iPhone app Go / Hold / Reply.
- **A full CF Worker / Durable Object deploy target is not in v1**; it moves to v1.x. Reasons:
  two storage backends, no custom FTS5 tokenizer or vectors in Durable Objects, and +2–4
  weeks. The Edge is its seed.

**In scope**
- The main AI with expire-aware projection and memory (digest, window, recall).
  *Built:* the long-term memory slice on Nowledge Mem (`memory_search`, `memory_add`, the
  记下了 / Noted line), measured with a fake Mem only. *Built (D123):* the conversation's own
  memory: segment digests with the mechanical audit, the obligation ledger, epoch roll-up, the
  [digests][ledger][window] projection, a re-cut past 120K, CJK search with rank fusion, and
  gated pre-turn recall (off by default); measured with fakes in `bun test` and once with real
  models. Folds are not built yet.
- Tasks on Claude Code and Codex (pi if cheap), with places, projects, worktrees, recipes, and
  ports.
- On hand with the attention forecast, the living message, and decisions.
- Waiters, `until` loops, and routines.
- The Pebble theme, with token themes and i18n (zh + en).
- The onboarding cartoon and first-run flow (D37).
- One persona in daily use. Multi-persona works, but its UI can be minimal.

- **Browser use (D42)** and **computer use on trycua/cua (D41)** as task places. The exact
  stack follows `research/23`. *Built:* browser places on the host Mac through cua-driver
  (persistent per-persona profile, sign-in by the user, token diet); sandboxes and computer
  use are not built. D126, D130: a task uses the harness's own browser in the user's Chrome
  (Claude in Chrome, Codex Computer Use) by default when it is set up, cua-driver otherwise;
  the live checks are in `todo.md`.
- **Game-like capability setup (D43):** enabling a capability shows where it lives and what it
  does. *Built:* the Devices view (Isles) on the Mac; the phone has no devices view yet.
- **Accounts it can read (D96, D122):** the oo one tap, or an address and key through
  OpenConnector or another MCP server (`docs/accounts.md`). *Built;* a live check against real
  accounts before each release is still open.

- **Nowledge Bridge (D105–D111, `design/bridge.md`):** receive, ask, reply, outbound through a
  card, the outgoing ledger and follow-through. *Built:* in `main` behind `DUCTER_BRIDGE=1`,
  proven with real models over a fake Bridge; the live trial against Mem is pending
  (`bun run bridge:live -- --real`).
- **Tasks push and open PRs themselves (D132):** not gated; what went out is recorded where
  Ducter sees it (Sent out).

**Not in v1:** adopting already-running harness sessions (D45), voice, phone, calls.

**Planned next (decided, not built)**
- **Quota management (D133):** the partner's 10% reserve (D89), ranking tasks by the limit
  left, and a fallback order when an account runs low. The ranking code reads a limit, but no
  harness reports one yet, so none of it takes effect; the UI and docs don't claim it.
- **Mac dark mode through the Midnight theme (D134):** Pebble stays light; the Mac app gets
  dark as Midnight, a theme from the original set, with a choice in Settings › Look. Web and
  iPhone follow the system's dark mode today.
- **Release:** the first tagged release end to end (notarized DMG, Linux tarballs, TestFlight;
  `design/release/`, `todo.md`), then the iPhone app public beyond internal testers (D131).

## Later

| Item | Notes |
|---|---|
| Phone calls (tuwa.ai-like) | Phased (`research/22`): hosted provider (Vapi / Twilio) → self-hosted SIP takeover (LiveKit). Every call is an intent. Defaults: disclose AI in the first sentence, announce before recording, no cloned voice without opt-in. Opened task gets a Call tab: Listen · Whisper · Say · Take over · Hang up |
| Phone use | **Start with DIYgod/pinky** for Android and iPhone (`research/22` addendum). It is one Go binary (Apache-2.0) exposing 14 `phone_*` MCP tools over stdio or local HTTP, with built-in takeover and its own approvals for risky taps. Caveats: pre-alpha, so pin a release; turn telemetry off (`DO_NOT_TRACK=1`) and auto-update off; approvals currently happen only in Pinky's window, so remote approval from Ducter needs upstream work. Fallback: android-use. iPhone-use only if iOS < 27 matters |
| Voice front-end | Allow-listed realtime talker (`design/conversation.md`) |
| HawDB storage | After the Bun/Node binding (`todo.md`) |
| Go runner (no JS runtime) | Once OAR is near 1.0 (`todo.md`) |
| User-made apps (GenUI / spaces) | `motivation.md` |
| Cursor, Gemini, Kimi harnesses | As OAR support and quota telemetry allow |

## Community contributions wanted

### Tailscale remote access (D46)

**Goal:** an alternative to the Ducter Edge relay. The main process becomes reachable through
`tailscale serve` (tailnet-only, most private) or `tailscale funnel` (public).

**What to implement:** a **remote-access adapter** with the same contract as the Edge:
1. Expose the main process's web client and WebSocket on a **stable HTTPS origin**. PWA
   install, Web Push, and passkeys are bound to the origin, so it must never change.
2. Report that origin to the main process, so pairing QR codes and push subscriptions use it.
3. Keep Ducter's own device auth: one-time pairing code, then per-device key and passkey, each
   revocable. Tailnet identity may add to this but never replace it.
4. Provide a status probe (`up / degraded / down` with a reason) for the Devices page.

**Done when:** the onboarding remote-access step offers Tailscale when the tailscale CLI is
detected; phone web pairing, push, and reconnect all work. Tests cover the origin staying
stable across restarts.

**Read first:** `research/21-v1-topology-remote-access.md` and `design/system.md`.
