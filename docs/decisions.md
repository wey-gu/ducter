# Decision Log

Append-only. Each entry records the date, the decision, its source (**U** = the user,
**R**n = `research/n`, **L** = lead agent proposal accepted by the user), and where it is
reflected. If a later decision supersedes an entry, mark the old one `superseded by Dn` and
never delete it.

## 2026-11-08: Design session 1

| # | Decision | Source | Reflected in |
|---|---|---|---|
| D1 | Ducter is open source and self-deployed. No Ducter-level multi-tenancy in v1; collaboration goes through Nowledge Mem Team | U | principles 17, 19 |
| D2 | The Log is the truth and harness sessions are caches. Projections are deterministic and layered L0–L4 | L, R3 | principles 1, 2 |
| D3 | A thread *is* a Focus Window. The main AI reads first (cost ladder) and asks only for judgment | U, L | principle 8 |
| D4 | Only the main AI is sessionless. Windows are ordinary harness sessions | U | principle 9 |
| D5 | Context window is a quality budget, 128K–256K by default | U | Physics |
| D6 | Window threads are mirrored into the Log as normalized events, with large outputs as deduplicated blobs (option B) | U | principle 1, `design/context.md` |
| D7 | Memory = structured digest + bold verbatim window + gated recall (S3 design) | R14, R15, U | principle 3, `design/memory.md` |
| D8 | Expire-aware resume by expected cost. Tail is a working set: cap at ingress, read-fold in a cache-sharing side context, late fold by truncate+append, never edit in place | R11–R13, U | principles 4, 5 |
| D9 | One conversation shape: ack (names action, never outcome) → job → result. Executors (in turn / fork / window) look identical. No separate talker model for text; voice gets an allow-listed realtime front-end | U, R16 | principle 6, `design/conversation.md` |
| D10 | Unread is mutable: one living message, revised in place until read, rendered from typed reports | U, R16 | principle 7 |
| D11 | Attention and residency are separate axes. Every transition has one owner (C/M/W/U/T) | U, L | principle 10, `design/focus-window-states.md` |
| D12 | Handoff = curated brief (quotes, not summaries) + progressive pull tools. A long job never forks the whole channel | U | principle 11 |
| D13 | Body selection: deterministic candidates + main AI judgment. Zero config by default; steer in conversation (pin, plain-language rules); optional rules file; pin > rule > default; never silent fallback | U, R7 | principle 14 |
| D14 | Runner is TypeScript on the **latest** OAR, behind our own port. Raft is source-available and our snapshot is stale | U, R5 | principle 15, `design/system.md` |
| D15 | Runner ships as a single binary via `bun build --compile` (Bun pinned to 1.4.4); Node SEA as CI fallback. A Go port happens later, once OAR is near 1.0 | U, R17, R18 | `design/system.md`, `todo.md` |
| D16 | No per-call approvals. Scope credentials, gate external effects as intents | U | principle 18 |
| D17 | Skills, plugins, and harness config are user-owned and inherited by windows. Ducter has no skill registry (Mem as skill source of truth rejected: too invasive) | U | principle 17 |
| D18 | Persona = one Mem AI Identity, and windows share it. Mem writes record provenance (`agent_id`, `source_app=ducter`, window + Log pointer) | U, R10 | principle 17, `design/system.md` |
| D19 | Storage behind an append-log port: SQLite in v1; HawDB once the Bun/Node binding exists | U, R9 | principle 19, `todo.md` |
| D20 | Desktop + web UI in MyGo native UI (no webview); mobile in Expo | U | `design/system.md` |
| D21 | Default theme Pebble; Volt, Paper, Signal, Midnight kept as token themes | U | `design/ui.md` |
| D22 | **No court/hierarchy vocabulary** (奏章, 准/驳, seals). Decision actions are Go / Hold / Reply | U | `design/product-model.md` §1, `design/ui.md` |
| D23 | User-facing names (working, to validate in prototype): Task/事, On hand/手头, Routine/例行, Devices/设备, Results/成果; personas shown by name | U, L | `design/product-model.md` §1 |
| D24 | Multiple personas: attention aggregates per person; conversations separate; isolated unless linked; distinct face/color/theme; light creation | U, L | principle 17, `design/product-model.md` §5 |
| D25 | Every task has an editable **Place** and **Project** label (conductor-like, smooth for everyone) | U | `design/product-model.md` §3 |
| D26 | Repos/worktrees per `research/19` defaults: worktree at start for writers; branch pushed as `ducter/*` at checkpoints (personal auto, org ask once); clone with device's own login (ask once per repo); recipes stored in Ducter; draft PRs, auto-archive on merge, never merge without rule; auto-reclaim archived worktrees only; read-only tasks see uncommitted changes; multi-repo writable repos at start | U ("按建议"), R19 | `design/product-model.md` §3 |
| D27 | Non-git folders: writes go to a draft copy, applied with one Go, unless the folder is trusted | U ("按建议") | `design/product-model.md` §3 |
| D28 | Work over time = waiter + Routine + `until` property (not one unified object) | R20 | `design/product-model.md` §4 |
| D29 | Routine defaults per `research/20`: name 例行/Routine; creation always confirmed by a proposal card; time zone personal-follows / world-pinned; cloud fallback off by default; per-run cap 2× first run + monthly cap; 30-day review, auto-pause after 3 failures or 3 unread reports; condition in words, code visible when opened | U ("按建议"), R20 | `design/product-model.md` §4 |
| D30 | Rule precedence: task pin > project > persona > user > default | L | `design/product-model.md` §2 |
| D31 | Projects and devices are user-level, shared by personas. Tasks and routines belong to a persona | L | `design/product-model.md` §2 |
| D32 | Chat with the user in Chinese; repo docs in English | U | `AGENTS.md` |
| D33 | **V1 target: a heavy-developer tool plus a powerful personal AI** (a conductor replacement for the author first). Onboarding and defaults are still designed to the ordinary-person bar | U | `docs/roadmap.md`, `AGENTS.md` |
| D34 | V1 topology: the main process (control plane + main AI) runs on a **VPS or a Mac**; VPS and Macs act as workers. Mobile in v1 is **web**. Whether a CF Worker deploy is in v1 depends on `research/21` | U | `docs/roadmap.md` |
| D35 | Later on the roadmap: phone calls (tuwa.ai-like), phone use (android-use, iPhone-use), native mobile app | U | `docs/roadmap.md` |
| D36 | Experience north star: **好用 easy · 顺滑 smooth · 赏心悦目 delightful to look at · 放心 trustworthy · 惊喜 pleasantly surprising** | U | `AGENTS.md` |
| D37 | Onboarding opens with a short, very cute cartoon in the Pebble style that explains the core concepts in seconds and shows what to set up | U | `docs/design/onboarding.md` |
| D38 | The lead agent decides the scenario design order (A → B → D first) | U | `docs/design/scenarios.md` |
| D39 | No full CF Worker/DO deploy target in v1 (moves to v1.x); v1 remote access via a "Ducter Edge" relay on the user's `workers.dev` (proposed; CN reachability pending) | R21 | `docs/roadmap.md` |
| D40 | Device pairing follows the dsh model: one-time QR code, then a per-device key and passkey, each device revocable | R21 | `docs/roadmap.md` |
| D41 | **Computer use is built on trycua/cua** and is in scope; integration details pending `research/23` | U | `docs/roadmap.md` |
| D42 | **Browser use is in v1**; choose the most elegant solution per `research/23` | U | `docs/roadmap.md` |
| D43 | **Enabling and deploying capabilities is a game-like, visual experience**: the user sees *where* a capability lives (which device or place) and *what* it does. All concept explanations follow this style | U | `design/ui.md`, `AGENTS.md` |
| D44 | Target users also include **consumer personal-AI users (Grok bot, Muse)**: same capabilities, but any strong harness/model can be the main AI | U | `AGENTS.md`, `docs/roadmap.md` |
| D45 | **No "adopt running sessions" in v1**; users start fresh and grow into it | U | `design/onboarding.md` |
| D46 | Remote access in v1 supports **both `workers.dev` and a custom domain**. Tailscale goes on the roadmap as a community contribution | U | `docs/roadmap.md` |
| D47 | Use **cua-driver** for browser and computer use. FSL-licensed parts are accepted for the open-source, self-deployed project; buy a license from cua if Ducter is ever commercialized. No heavy validation spike: integrate directly | U | `design/system.md` |
| D48 | No real-Chrome attach. Instead, Ducter **maintains credentials and persistent logged-in profiles** (Muse-like) so it can do sustained work for the user, such as running social accounts | U | `design/system.md`, `research/25` |
| D49 | **Build the first version tonight (~8 h)**: straighten the essentials → quick UI-flow prototype polish → parallel implementation with Claude Code agents. This supersedes AGENTS.md's "Ready to build" gate for this first slice | U | `docs/plan/v1-tonight.md` |
| D50 | Capability map is **2D, not 3D**. Draw inspiration from 2D game design to express the metaphors and relationships (the three.js prototype is retired as a direction) | U | `design/ui.md`, `research/28` |
| D51 | Glossary batch from flow design: 接手/交还 · 画面 · 第 n 轮 · 复查 · 可以碰 · 存档 · 醒着/睡着了/连不上 · 额度 · 叫醒 · 远程打开 (Reach from anywhere) · 换到 X 接着做 · 先停 · 准备方法 · 草稿副本 · 按默认做了 · 停下了/撤销/再试一次 · 都按默认 · 安静时段 · 核对没过 | U ("按建议") | `design/product-model.md` §1 |
| D52 | Flow semantics 1–18 as recommended in `design/flows/OPEN-QUESTIONS.md`. Highlights: device sleep → tasks 在等 after 2 min (amends states invariant 1); same-harness model switch happens at a cut inside the task; pause is a wait reason; drop has a 10 s undo; draft PR auto-opens on personal repos, waits for Go on org repos; results live in 成果; quiet hours are unbreakable unless the user sets a deadline "even at night"; 2-min typing grace; breaker after 3 errors, stall after 20 min; a second partner may exist without Mem; CN users default to their own domain | U ("按建议") | `design/flows/*`, `design/focus-window-states.md` |
| D53 | Art direction: **puffy matte clay 3D** illustrations (pre-rendered assets in a 2D UI); character = round-2 clay Ducter; capability screen = round-2 board v2 (cozy layout: device cards, hero device and slots, ability grid, AI-account tokens); equip = sticker peel-and-stick motion; lighting restraint rules apply | U ("按建议") | `design/ui.md`, `docs/art/concepts/README.md` |

## 2026-11-09: Server mode (overnight build)

| # | Decision | Source | Reflected in |
|---|---|---|---|
| D54 | **Remote access, first slice: server mode + code pairing.** (1) The main process runs on a Linux VPS as a systemd *user* service (`ducter service install`: `Restart=on-failure`, journald, linger, data in `~/.ducter`), bound to 127.0.0.1 unless `--host` says otherwise. (2) Off-machine clients pair once: `ducter pair` shows a one-time 8-character code (10 min, single use, unambiguous alphabet) with the address, a pasteable link and a QR; `POST /pair` trades it for a long-lived **device token**. Codes and tokens are stored only as SHA-256 hashes; wrong codes are rate limited; each device is revocable (`ducter devices disconnect`). (3) A request is *local* only if the peer and the Host are loopback and no proxy header is present; local clients stay token-free, everything else needs the token on `/ws`, and on `/mcp` beside the role token. (4) TLS is never hand-rolled: Caddy with automatic HTTPS on the user's own domain (Q18, `scripts/caddy-setup.sh`); an SSH tunnel is the zero-domain fallback. (5) The desktop gets **连接到你的 Ducter / Connect to your Ducter** (address + 配对码), token in a 0600 file. (6) Workers dial out to `/worker`; the main places tasks on them by `Place.device` (state stays on the main; the worker holds the place and runs the harness), and a worker that drops mid-task makes its tasks 在等 · <device> 连不上 after 2 min and resumes them by session id. Refines D40 (this is its code half; the WebCrypto device key + passkey and the Edge relay of D39/D46 remain the phone/web target). *Proposed overnight from the user's ask; pending review* | U (ask) + L, R29 | `design/system.md`, `roadmap.md`, `design/onboarding.md`, `design/product-model.md` §1, `design/scenarios.md` |
| D55 | **Ducter.app is signed with the Nowledge Labs Developer ID and notarized**, the way con and Nowledge Mem ship. Bundle id `co.nowledge.ducter` (helper `co.nowledge.ducter.cli`), following `co.nowledge.con` and `co.nowledge.mem.desktop` (reverse DNS of nowledge.co); replaces the ad-hoc id `dev.ducter.app`. Hardened runtime on the app and helper; the helper's only entitlement is `com.apple.security.cs.allow-jit` (Bun's JIT dies without it, tested). App and DMG are both notarized and stapled; credentials use con/Mem's names (Apple ID + app-specific password, an API key, or a `notarytool` keychain profile). Ad-hoc signing stays the fallback without an identity | U (ask) | `scripts/make-app.sh`, README, `design/onboarding.md` |

## Superseded

- **"Main AI asks windows instead of unfolding"** (first principle-3 draft). Superseded by D3:
  read first, ask only for judgment.
- **"Never compact a warm session" and "unknown warmth → resume"** (first principle-4 draft).
  Superseded by D8: decide by expected cost.
- **"One Routine object with three trigger kinds"**. Superseded by D28.
- **"Worktree created lazily on first write"**. Superseded by D26: at start for writers.
- **"Main AI proposes new skills from repeated successes"**. Dropped: self-generated skills
  measured at −1.3pt (R8); skills are user-maintained (D17).
- **Overview named 奏章台; 准/驳 seal buttons**. Superseded by D22/D23.
- **Projects as containers of repos (first product-model draft)**. Superseded by D25: a
  project is a label that remembers places.
