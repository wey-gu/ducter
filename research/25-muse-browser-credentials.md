# 25: Muse-style browser credentials for persistent profiles

Researched 2026-11-08 for D48 ("Ducter maintains credentials and persistent logged-in profiles,
Muse-like, so it can do sustained work such as running social accounts"). Builds on `23` (cua-driver,
one `isolated_named` Chromium profile per persona per device in a sandbox, logins by takeover, env-gate
MCP proxy) and `01` §4 (Muse overview). Principle 18 applies: scope credentials, gate effects.

**Labels.** **V**: verified on a page or in source I read. **S**: secondary (third-party blog,
search snippet, or a leaked-prompt claim). **I**: my inference.

---

## 1. How Meta Muse's browser and credentials work

### 1.1 Where it runs
- Muse runs on "its own dedicated computer in the cloud", "a dedicated secure computer with its own
  browser"; the VM holds both the agent and the person's data (V
  [about.fb.com/news/2026/09/introducing-muse](https://about.fb.com/news/2026/09/introducing-muse)).
- The browser is "a real up-to-date Chromium based browser running behind a virtualization layer";
  the user can watch it and take over at any time. A separate broker owns the CDP connection; the
  browser subagent gets "an accessibility tree snapshot of the page — not the raw DOM", cannot run
  page JavaScript, has no exec verbs, and DevTools are disabled (V
  [research.meta.ai … our-approach-with-muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)).
- Cookies persist: a leaked Muse prompt describes "a real Chromium that keeps the person's cookies
  and tabs between tasks", and says the VM "is replaced about hourly while the home directory
  persists" (S, single unverified copy, [arXiv 2610.08699](https://arxiv.org/html/2610.08699v1)).
  So the profile lives in the persistent home, not in the disposable VM image (I).
- Planned "Muse Confidential VM" encrypts the whole VM with a user-held key; not shipped. Today
  isolation from Meta staff is operational policy, not crypto (V about.fb.com; S
  [vellum.ai](https://www.vellum.ai/blog/official-muse-breakdown)).

### 1.2 Credential capture and use
- Two paths, both keeping the password from the model:
  1. **Typed by the user in takeover.** Muse "cannot see passwords a person types into the browser
     themselves" (V about.fb.com). The session cookie that results stays in the profile.
  2. **Shared into secure storage.** A client-side UI captures username and password and routes them
     "directly to `authd`" outside the runtime cell; they are "injected into the browser window at
     the point of need" (V research.meta.ai). **While secure storage fills a form, or while the user
     holds takeover, the agent is paused and cannot act** (V research.meta.ai).
- `authd` enforces per-caller access over Unix sockets with peer credentials; workers are tied to a
  cgroup and an explicit credential allowlist (S
  [contextosai.com](https://contextosai.com/blog/meta-muse-harness-architecture-security-review),
  citing Meta's security report).
- **API credentials** use surrogates: code in the cell sees a surrogate token minted by `authd`;
  after Sentinel authorizes the request, the real credential is swapped in at the network boundary.
  "The agent never sees real tokens" (V research.meta.ai).
- **OTP and reset links:** the email connector filters "one-time tokens, password reset links, and
  login magic links" with deterministic filters plus a classifier (V research.meta.ai). Nothing
  public on TOTP, SMS codes, or **passkeys** (not covered by any source I found).
- **1Password:** "coming soon … so Muse can use logins a person already has" (V about.fb.com).
- **Payments:** single-use card from Stripe Link per merchant/amount/time window, approved with the
  exact details each time (V research.meta.ai).

### 1.3 Sentinel and grants
- A separate host-side agent, "kept apart from Muse at the system level"; "Nothing Muse does reaches
  the internet unless the Sentinel approves it" (V about.fb.com). Sole authority for connector
  actions and network egress; inspects L4/L7 (host, resolved and final IP, method, path, decoded
  body); SSRF guard (V research.meta.ai).
- Approvals appear in client UI, not in chat, and go straight to Sentinel. They are "strict
  capabilities, not conversational suggestions": one-time, session, task, time-bounded or
  perpetual, matched exactly on later calls (V research.meta.ai).
- **Taint:** each tool process starts clean and is tainted once it reads user data; tainted
  processes lose auto-allow (V research.meta.ai). Browser classifiers flag PII egress, DOM/image
  injection, downloads and high-risk form submits (V same).

### 1.4 Ongoing work and what users report
- Muse "keeps working after people close the app" and returns "when something changes or when it
  needs approval" (V about.fb.com); cron jobs run in the VM (V research.meta.ai). Users get "a
  complete log of everything it has done and plans to do" (S
  [eesel.ai](https://www.eesel.ai/blog/meta-muse-agent-review)).
- **Social posting:** no Meta page describes Muse running social accounts (S
  [postfa.st](https://postfa.st/blog/meta-muse-ai-social-media-managers)). One hands-on: a Facebook
  Page post went out through the connector; a Group post needed the tester to take over and sign in
  "once, for this step"; Muse rescheduled to respect Facebook's 10-minute lead time (S
  [aiagentslibrary.com](https://www.aiagentslibrary.com/blog/meta-muse-facebook-test/)). Nothing on
  session lifetime, 2FA, checkpoints or bans.
- **Amazon blocked Muse** (~2026-09-20): it did not identify as automated and "appears to capture and
  store customer credentials"; Meta says Muse "operates without direct access to users' passwords"
  (S [campaignlive](https://www.campaignlive.com/article/amazon-blocks-metas-muse-shopping-its-platform/1970733),
  [insumermodel](https://insumermodel.substack.com/p/why-amazon-blocked-metas-muse-ai)). Lesson: a
  vault keeps the password from the model, not from the site's bot policy (I).
- No HN thread or YouTube teardown of the credential system turned up; the only deep material is
  Meta's own security post plus blogs that paraphrase it.

## 2. Comparable designs

| System | Where the browser runs | Login capture | Persistence | 2FA / passkeys | Evidence |
|---|---|---|---|---|---|
| **ChatGPT agent / Work sign-in** (2026-08) | OpenAI cloud browser | Secure form shown to the user; "the model can't see your username or password", not stored, password managers OK | "Session may stay signed in for future tasks"; clear per site in Settings > Cloud browser | User types "a security code" | S [decrypt.co](https://decrypt.co/376757/openai-agentic-chatgpt-work-signs-in-without-you) |
| **OpenAI Agents API hosted browser** (2026-09) | OpenAI | `browser_authentication` event; values "stay outside the agent's model input"; **only the main agent may request it, subagents cannot**; requests expire in 5 min | Durable sessions; "cookies can expire, and recycling the environment clears browser state" | Email, password, codes; **no passkeys or QR sign-in**. Origin approval "is per site, not per click" | S [developersdigest](https://www.developersdigest.tech/blog/openai-agents-api-computer-use) |
| **Operator** (2025, folded into agent) | OpenAI cloud | Takeover; "does not collect or screenshot information entered by the user" | Per session | Takeover | S [openai.com/blog/introducing-operator](https://openai.com/blog/introducing-operator) |
| **Manus Cloud Browser** | Manus cloud sandbox | User logs in manually; Manus asks "whether to save the login status for this website"; "doesn't store your passwords" | Encrypted session state loaded into each new sandbox; Settings → Cloud Browser → Logged-in Accounts, per-site logout or clear all | SMS/CAPTCHA/MFA → "Take Over" | V [manus.im/help/cloud-browser](https://manus.im/help/cloud-browser), [help.manus.im](https://help.manus.im/en/articles/11711226-how-can-i-manage-the-login-information-that-manus-stores) |
| **Manus Browser Operator** | User's local browser (extension) | Uses existing sessions | n/a | User | S [manus.im/docs](https://manus.im/docs/integrations/manus-browser-operator) |
| **Perplexity Comet** | User's local browser | Built-in + 1Password extension | Real profile | User | S; Zenity: a calendar invite hijacked Comet and reached 1Password ([the-decoder](https://the-decoder.com/a-calendar-invite-is-all-it-took-to-hijack-perplexitys-comet-browser-and-steal-1password-credentials/)) |
| **Browserbase Contexts** | Browserbase cloud | Any | Persists the user-data dir (cookies, localStorage, IndexedDB, Web Data), "encrypted at rest", saved only with `persist:true`; avoid concurrent sessions on one Context; "check for logged-out states" | n/a | V [docs.browserbase.com/features/contexts](https://docs.browserbase.com/features/contexts) |
| **1Password Secure Agentic Autofill** (2025-10) | Browserbase only, early access | Extension injects credentials "only when required and always authorized by a person"; never enters LLM context; Noise-encrypted channel; audit log of use | n/a | n/a | S [1password blog](https://1password.com/blog/closing-the-credential-risk-gap-for-browser-use-ai-agents), V [1password.dev/agentic-autofill](https://www.1password.dev/agentic-autofill) |
| **browser-use** | Local or cloud | `sensitive_data` placeholders, domain-scoped (`https://*.work.com`); `use_vision=False` on sensitive pages | `storage_state` merged and saved periodically; cloud profiles | TOTP: store the seed under a `*bu_2fa_code` key, tool generates codes; email/SMS via custom tools | V [docs.browser-use.com](https://docs.browser-use.com/customize/browser/authentication) |
| **agent-browser** (Ducter fallback) | Local | `auth save/login`: vault never in LLM context, fills by origin check, fails if field is swapped; credential-provider plugins out of process; `--confirm-actions plugin:vault:credential.read` | AES-256-GCM vault and state files, `chmod 600` | n/a | V `R/agent-browser/docs/content/docs/security.mdx:24,69-96,141-169` |

**Constraints that shape the design.**
- **Passkeys:** WebAuthn needs a user gesture and an authenticator; agents cannot complete the
  ceremony. Current practice is to sign in once by hand and reuse the cookie (S
  [mojoauth](https://mojoauth.com/blog/can-an-ai-agent-complete-a-passkey-ceremony),
  [notte](https://www.notte.cc/glossary/browser-identity/what-are-passkeys-for-ai-agents)). Phone
  hybrid (QR + Bluetooth proximity) cannot reach a VPS sandbox (I).
- **DBSC:** Chrome 146+ binds Google session cookies to TPM/Secure Enclave keys on Windows, macOS next
  (S [blog.google](https://blog.google/security/protecting-cookies-with-device-bound-session-credentials/)).
  A Linux sandbox has no TPM, so sessions are unbound there; copying a profile between devices can
  break bound sessions. Per-device profiles avoid both problems (I).
- **Linux Chromium cookie encryption** without a keyring uses a fixed key, so the profile directory is
  effectively plaintext; encrypt at the volume level (I, well-known Chromium behaviour).
- **Platform rules:** X's automation rules warn that scripting the website (non-API automation) "may
  result in permanent suspension" (S, help.x.com/articles/76915 snippet; page 403 to fetch). Real
  case: a Grok Bot ran approved, scheduled browser posts on X; after repeated media-upload 403s it
  retried, and the account was frozen read-only the same evening. The user wanted a ToS warning up
  front, a suggestion to use the API or drafts, and a stop on repeated 403s (V
  [forum.cursor.com/t/…/172989](https://forum.cursor.com/t/grok-bots-x-assistant-ran-browser-automated-posting-and-replies-without-warning-about-xs-automation-rules-and-the-account-was-frozen/172989)).

**Convergence.** Everyone separates (a) the **session** (cookies in a persistent profile, cleared per
site from a "logged-in accounts" view) from (b) the **secret** (typed by the human or injected by a
vault while the agent is paused, never in model input). The differences are where the browser runs
and whether the vault fills automatically. Muse adds two things nobody else publishes: an egress
gate with capability-style grants, and agent pause during fills (V/S above).

## 3. Recommendation for Ducter

All of this lives in the env-gate (runner side) plus a small `credd` component next to it. cua-driver
stays unchanged; the gate calls its tools (`browser_type`, `browser_click`, `browser_state`,
`browser_navigate`) itself (V tool names, `R/cua/libs/cua-driver/rust/crates/cua-driver-core/src/browser/tools.rs`).

### 3.1 Storage: two stores per persona per device
- **Session store = the Chromium profile.** Point `CUA_DRIVER_BROWSER_PROFILE_ROOT` (V
  `browser/prepare.rs:369-372`) at an encrypted volume in the browser box (gocryptfs/LUKS on Linux,
  an encrypted APFS sparse image under Lume). The key is held by the runner, sealed in the macOS
  Keychain or, on a VPS, in a 0600 key file with an optional unlock passphrase (I). Checkpoints taken
  after login contain cookies: encrypt them with the same key and keep only the last N (I).
  Disable Chromium's own password manager and autofill (`PasswordManagerEnabled=false`,
  `AutofillAddressEnabled=false` policies) so secrets live in one place (I).
- **Secret store = `credd` vault.** One encrypted file per persona per device (AES-256-GCM, same
  pattern as agent-browser). Item = `{id, origin (https + exact host or eTLD+1), username, password,
  totp_seed?, notes}`. Providers behind one interface: local vault (default), 1Password (`op` CLI or
  SDK with a service account scoped to a "Ducter" vault), Bitwarden (`bw`/`bws`). Secrets are fetched
  at fill time only (I). 1Password's Agentic Autofill is Browserbase-only today, so it is not usable
  here (I from the sources above).
- Capture paths: (1) **takeover login**, the default: the session lands in the profile and nothing
  else is stored; (2) **"Save login for Ducter"** sheet in the Ducter client that posts straight to
  `credd`, never through the chat or the runner's model session (Muse's authd pattern); (3) import
  from 1Password/Bitwarden by item link.

### 3.2 What the model may never see
- Passwords, TOTP seeds, OTP codes, magic links, reset links, cookies, storage values, the vault
  file path or key. The model sees only: site, account label, status, and whether a vault item exists.
- The gate exposes `site_login(site_id)` with no secret arguments. On call it: checks the page origin
  matches the item origin (rechecked before each fill, as agent-browser does); sets the place's
  takeover state to `filling` so every other agent tool returns `paused_filling` (Muse's pause);
  types via `browser_type` into the field refs it resolved itself; submits; clears the state; and
  returns `{result: signed_in | needs_2fa | failed}`.
- Output scrubbing: the gate drops screenshots taken while `filling`, and exact-match redacts any
  vault string from all tool output before it reaches the model (belt and braces; I).
- Untrusted page text cannot trigger a fill: `site_login` is allowed only on origins in the persona's
  site list, and the first fill for a new item needs a user approval (I).
- Email/messaging connectors filter OTP codes, magic and reset links out of model-visible text, as
  Muse does (V pattern). `credd` may read them for its own fill only if the user enabled "auto-read
  codes from this inbox" for that site (I).

### 3.3 2FA, passkeys, CAPTCHAs
- Default 2FA: `needs-you: Confirm sign-in to <site>` as a Web Push to the phone, with two buttons:
  **Take over** (opens the Screen tab to type a code or solve a CAPTCHA) and **I approved it on my
  phone** (for push-approval apps; the gate then rechecks login state). Timeout 10 min, then the task
  waits; it never loops (I).
- Opt-in TOTP: the user stores the seed in `credd`; the gate generates and types the code
  (browser-use pattern). Recommend it only for low-risk accounts, since it collapses two factors into
  one device (I).
- Passkeys: the agent never does them. The user picks "try another way" or signs in by hand in
  takeover on the Mac host mode, and Ducter keeps the cookie (I).

### 3.4 Session health and re-login
- Each site entry has a **probe**: a URL and a logged-in signal (an a11y role or name such as the
  account menu, or the absence of a redirect to a login-URL pattern). The gate runs the probe at task
  start, mid-task when a navigation hits a login pattern, and on a daily Routine (`20`) for each site
  used in the last 30 days (I).
- Status: `signed_in` → `expiring` (cookie expiry within 7 days, from CDP cookie metadata the gate
  reads but never passes on) → `signed_out` → `challenge` (checkpoint, captcha, "unusual activity")
  → `blocked` (I).
- Re-login: if a vault item exists and the site policy allows `auto_relogin`, the gate tries one fill;
  if that fails, or there is no item, it raises a `needs-you` card. A `challenge` never auto-retries
  (I).

### 3.5 Per-site policy (the anti-ban layer)
```ts
type SitePolicy = {
  site: Origin; account: string; mode: "read" | "draft" | "act";
  actions: Record<"post"|"reply"|"dm"|"follow"|"like"|"purchase"|"settings", "deny"|"ask"|"allow">;
  limits: { perHour: number; perDay: number; minGapSec: number; jitterSec: number; quietHours?: string };
  breaker: { consecutiveWriteErrors: 2; onChallenge: "pause_site" };
  preferApi?: ConnectorId;   // use the official API connector when present
  tosWarning?: string;       // shown at setup, e.g. X non-API automation risk
  autoRelogin: boolean; credential?: VaultItemRef;
};
```
- The gate classifies a submit into an action kind (from the a11y role, label and URL; I), checks
  the policy, and applies limits with jitter. Social defaults: `mode:"draft"`, posts `ask`, 3/day,
  ≥2 h apart, DMs and follows `deny`, likes ≤20/day (I; conservative, not platform-published).
- **Circuit breaker:** two consecutive write failures (4xx, "action blocked", media upload refused)
  or any challenge page → pause the site, mark it `blocked`, notify. This is the X freeze lesson (V
  case above).
- Setup shows the platform's automation warning and offers the API connector or drafts first.
  Ducter acts as the user, from the user's IP when the browser box is on the home Mac (`23`); it does
  not hide automation from a site that asks (I, Amazon lesson).

### 3.6 Audit log
- Append-only per persona, part of the task log: `credential_used{item, origin, task, approval}`,
  `login{method: takeover|vault|totp}`, `probe{status}`, `policy_block`, `consequential_action{kind,
  site, summary, screenshot_hash}`, `site_signed_out`, `profile_wiped`. No secrets, no cookie values
  (I). This matches 1Password's audit-of-use and Muse's activity log.

### 3.7 UI: "Logged-in sites" per profile
- Place settings → **Browser profile `ducter-<persona>` on `<device>`** → table: favicon and site,
  account, status chip (signed in, expiring, signed out, needs you, blocked), last used, last probe,
  credential (none, Ducter vault, 1Password, Bitwarden), 2FA mode, policy summary ("drafts · 3
  posts/day").
- Row actions: **Open** (Screen tab, takeover), **Re-login**, **Edit policy**, **Activity**,
  **Sign out here** (gate clears that origin's cookies and storage, then reminds the user to also
  revoke the session on the site's security page, since checkpoints held a copy).
- Profile actions: **Add site** (opens takeover on the login URL; saved on hand back once the probe
  passes), **Save a login**, **Wipe profile** (deletes the profile and checkpoints, keeps the vault
  unless also chosen).
- The isolation chip from `23` stays on the Screen tab; a site in `blocked` shows a red chip on any
  task that targets it.

### 3.8 Build order
1. Encrypted profile root + takeover-only logins + site list with probe and status (v1 minimum).
2. Site policy, rate limits, breaker, audit events.
3. `credd` local vault + `site_login` fill with pause and scrubbing; push-based 2FA cards.
4. 1Password/Bitwarden providers, opt-in TOTP, inbox code reading.

**Open questions.** Can cua-driver's `browser_type` be told not to echo typed text in its result?
(Check before step 3.) Does the gVisor box keep the encrypted volume mounted across sandbox restarts?
Is sharing one profile across personas ever wanted (Muse has one person per VM, so it does not say)?
