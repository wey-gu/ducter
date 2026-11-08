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
