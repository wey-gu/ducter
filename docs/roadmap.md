# Roadmap

> Living document. Scope changes go through the change loop (`AGENTS.md`) and `docs/decisions.md`.

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
- **Clients:**
  - Desktop: MyGo native UI.
  - Mobile: **web** (served by the main process, reachable from anywhere through a tunnel).
- **Remote access (research/21):** a small **Ducter Edge** on the user's own free
  `workers.dev` subdomain. It is one Worker plus one relay Durable Object, about 300–600 LOC.
  - It serves the web client. The phone and the main process both dial into it, which gives
    a stable HTTPS URL with no domain, behind NAT, at about $0.
  - Alternatives: Tailscale `serve` (maximum privacy), or a named tunnel / direct HTTPS for
    users with a domain.
  - Supports both `workers.dev` (zero setup) and a **custom domain** on Cloudflare (D46).
    `workers.dev` is likely blocked in mainland China; there, use a custom domain or a
    company network.
- **Pairing:** a QR code with a one-time code (the dsh model), then a WebCrypto device key
  plus a passkey; every device can be revoked individually.
- **Push:** Web Push sent from the main process. iOS needs 16.4+ and a Home Screen install.
- **A full CF Worker / Durable Object deploy target is not in v1**; it moves to v1.x. Reasons:
  two storage backends, no custom FTS5 tokenizer or vectors in Durable Objects, and +2–4
  weeks. The Edge is its seed.

**In scope**
- The main AI with expire-aware projection and memory (digest, window, recall).
- Tasks on Claude Code and Codex (pi if cheap), with places, projects, worktrees, recipes, and
  ports.
- On hand with the attention forecast, the living message, and decisions.
- Waiters, `until` loops, and routines.
- The Pebble theme, with token themes and i18n (zh + en).
- The onboarding cartoon and first-run flow (D37).
- One persona in daily use. Multi-persona works, but its UI can be minimal.

- **Browser use (D42)** and **computer use on trycua/cua (D41)** as task places. The exact
  stack follows `research/23`.
- **Game-like capability setup (D43):** enabling a capability shows where it lives and what it
  does.

**Not in v1:** adopting already-running harness sessions (D45), voice, phone, calls.

## Later

| Item | Notes |
|---|---|
| Phone calls (tuwa.ai-like) | Phased (`research/22`): hosted provider (Vapi / Twilio) → self-hosted SIP takeover (LiveKit). Every call is an intent. Defaults: disclose AI in the first sentence, announce before recording, no cloned voice without opt-in. Opened task gets a Call tab: Listen · Whisper · Say · Take over · Hang up |
| Phone use | **Start with DIYgod/pinky** for Android and iPhone (`research/22` addendum). It is one Go binary (Apache-2.0) exposing 14 `phone_*` MCP tools over stdio or local HTTP, with built-in takeover and its own approvals for risky taps. Caveats: pre-alpha, so pin a release; turn telemetry off (`DO_NOT_TRACK=1`) and auto-update off; approvals currently happen only in Pinky's window, so remote approval from Ducter needs upstream work. Fallback: android-use. iPhone-use only if iOS < 27 matters |
| Native mobile app (Expo) | After the mobile web client proves the flows |
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

**Read first:** `research/21-v1-topology-remote-access.md` and `docs/design/system.md`.
