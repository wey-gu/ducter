# What we say about Ducter: audit, 2026-11-10 (v0.0.8)

The author asked whether the README, the site (`apps/site`, ducter.ai) and the launch video
(`apps/promo`, v2 renders in `.shots/promo/v2/`) carry what Ducter is for and what it is good
at. This page lists the values from the sources (`motivation.md`, `design/principles.md`,
`design/roadmap.md`, `CHANGELOG.md` 0.0.1–0.0.8, `design/ui.md`, `design/decisions.md`
D157/D165/D168/D173), checks each against the three, and says what changed in this pass.

**Status words:** *present* (said, and true today) · *weak* (there, but buried or vague) ·
*missing* · *outdated* (said, but no longer true or no longer the whole truth).

## The values, checked

| Value | README (before) | Site (before) | Video v2 | Done in this pass |
|---|---|---|---|---|
| **One partner you talk to**, the conductor for all your AI agents | present (hero, "What it feels like") | present (hero, demo) | present (Say it once, Handoff) | README hero says "one partner for all your AI agents" in its first lines |
| **Silence means success; decisions carry defaults** | present | present (#how, board, phone) | present (Quiet, Decide) | kept |
| **Your Mac or your own server**, phone and the iPhone app | present | present; phone section says "needs a server with your own domain" (true, but read as a wall) | present (Title, World) | site phone note reworded: the address requirement stays, said as "for now" with the docs link |
| **Moving your Ducter between computers** | missing (correctly: not built) | missing | missing | *Not built* (`todo.md`, roadmap "Next"): only tasks move between computers (0.0.7) and "I'm closing my laptop" moves what can move. Said as such; moving the home itself is "coming soon" in the README |
| **Workers**: other computers do tasks for your Ducter; a Mac does tasks for your server | weak (one line) | weak (isles only) | present (islands with "Does tasks for Ducter") | README and site name it with the where-a-task-runs line |
| **Where a task runs (D157)**: one pick over computer × agent, said in one line, asks only when access or "now vs wait" is at stake | missing | missing | weak (islands only) | README "Why it's different", site devices section, video handSub |
| **Your own AI agents and subscriptions** (Claude Code, Codex, pi, DeepSeek Harness), your sign-ins, no lock-in | present | present (but the "No lock-in" card shows two coins) | weak: "with your own sign-ins", no word on plans | site card shows all four coins; video says "on the plans you already pay for" |
| **Works out of the box**: one-line install, oo one-tap accounts, zero-setup first screen | present (install), weak (first screen) | present | present (End card) | README and site say the first screen greets you by name and starts from your accounts and folders |
| **The harness adapter** (one adapter for four harnesses, small windows, per-harness facts registry + probe, clean task sessions, native browser first, keys hidden at the home, prompt and tool budgets as tests, a near-real E2E rig) | missing (only "How it works" diagram) | missing | missing | README "Under the hood"; site "Built on the agents you have" block in #open. For builders, kept literal; no invented numbers |
| **Restrained proactive help (D165/D173)**: a morning note of at most 3, nothing on a quiet day, never says what it read | **outdated**: "Ask, and your partner reads your Gmail…" (pre-0.0.8, ask-only) | **outdated**: same | missing | README, site (new "It looks out for you, quietly" section with the morning note), video (new HeadsUp scene) |
| **Nowledge Mem**, optional deep memory, never required, free to download, now inside tasks too (D168) | present, but not "optional / free" | present ("Without Mem, it remembers your conversation") | missing | README says optional, free to download, and used inside tasks under your partner's identity |
| **Safety**: nothing irreversible without your Go; undo for folders | present | present (#trust) | present ("Nothing merges until you say so") | site trust lede adds the one-tap undo for a folder that isn't a repo |
| **Open source, self-hosted, Apache-2.0** | present | present | present (End card) | kept |
| **The clay / Pebble look and the five feelings** (好用 · 顺滑 · 赏心悦目 · 放心 · 惊喜) | the screenshots carry it | the site is the look | the video is the look | no copy claims a feeling; the art does it (D36: shown, not explained) |
| **Your other AI agents reach you through your partner** (D163/D170, Bridge) | present as "early, coming soon" | same | missing | kept as early: X1/X2 are built but the live trial hasn't run (D171) |

## Outdated or unbuilt claims found

- **Accounts were described as ask-only.** Since 0.0.8 the partner keeps an eye on accounts
  after you say yes once (D165, D173). Fixed in the README and on the site.
- **"Some of that it can use today. The rest is on the way"** (site, connected section): Mem and
  accounts both work; only Bridge is early. Reworded.
- **The README's devices screenshot** (`.github/readme/devices.webp`) predates 0.0.8's character
  cards (D161). Not regenerated here: the README shots come from the maintainer's evidence archive
  (`readme_shots_test.go`). Left for the author (the caption is generic enough to stay true).
- **"Your Mac or server, and moves between them"** was in the brief for this pass; moving the
  home is not built. Only said as coming soon.
- **The site has no dark mode** (one light Pebble design; D53's Midnight is the Mac app's, and not
  built yet). Screenshots with `prefers-color-scheme: dark` confirm the page stays coherent (it
  ignores the preference). Not a claim anywhere; noted for `todo.md` only if the author wants it.

## The video

v2 (eleven stills in `.shots/promo/v2/stills/Launch-storyboard.png`) covered the core loop well
(say it once → hand-off → quiet → a decision with a default → done with proof → open anything →
the world). Missing or outdated against the list above:

1. **Restrained heads-ups** (D165/D173): missing. **v3 adds a scene, "It looks out for you,
   quietly."**: the morning note at 08:00, "Morning.", then two finds from
   `design/connectors.md` §6's own example (a domain about to lapse, a night with no place to
   stay), each with its Go, Hold and How I know; the sub says "At most three things in the
   morning. On a quiet day, nothing at all." The window's status line is the plain state,
   *Keeping an eye out* (D173 (4)).
2. **Your own subscriptions**: the hand-off sub said "with your own sign-ins"; v3 says "on the
   plans you already pay for" (zh 用你本来就在付的订阅).
3. **The known flaw**: half a line of the conversation behind the phone's sheet was clipped at
   the frame's top in both Decide shots. v3 fades that conversation out as the camera moves in.
4. **Where a task runs / server + Mac**: the islands already show a Mac mini and a server doing
   tasks for this Mac's Ducter; no change.

v3 renders: `.shots/promo/v3/ducter-launch-{16x9,1x1,16x9-zh}.mp4`, stills in
`.shots/promo/v3/stills/`.

**v4 (the author on v3: slow zooms pushed content past the frame's edges).** Every camera move
is gone: the title's drift and lean-in, the cut into the conversation (the title no longer scales
up while the paper circle opens), the hand-off's open-out from 1.28×, the world's drift back, the
phone's 1.5× (1.85× square) push-in, the real shots' 7% push-in, the hook's 5% and the end card's
sky. The phone is framed whole instead and leans in by 3% around its card; the title's logo drops
28 px instead of 90. Motion stays inside the frame (coins, parcels, the sheet, the tap, Ducter).
A check guards it: `node scripts/audit.ts` renders every 2nd frame of each cut with the `audit`
input prop, collects the boxes of every element marked `data-safe` (headline, window, phone,
tags, coins, devices, Ducter, logo, end card) and fails if one leaves the frame minus 24 px,
except while it enters in its scene's first 32 frames (Ducter's drop, the island and the phone
rising). It catches the old 1.5× phone push (288 px out). Renders: `.shots/promo/v4/`.

## Putting the video on the site (D75)

Recommendation: **a poster image plus a link to the full video as a GitHub release asset.** The
site already plays the same moments live (the hero conversation, the board, the phone), so a
muted loop would repeat them at lower quality; the 16:9 film is ~11 MB, far over D75's 2 MB.
Built: the film's release and file name live in `apps/site/src/lib/film.json`; the asset is
attached to that GitHub release. GitHub serves release assets as downloads
(`application/octet-stream`, `content-disposition: attachment`), which Safari and iOS refuse to
play inline, so `apps/site/scripts/film.mjs` copies the asset into `public/film/<release>/`
(gitignored) at build time and the page plays it from ducter.ai, served as `video/mp4` with range
requests (`vercel.json`). If the copy fails the build still succeeds and the page shows the
poster linking to the release. To ship a new cut: attach it to a release, change `film.json`
and the poster, deploy.

The v5 cut (56 s, attached to v0.0.27; v0.0.8 keeps v4) brings the film up to 0.0.27: On hand as one
list (D216) and the opened task's workbench with its agent, model and effort (D202, D214) replace
v4's README crops; new scenes show pictures both ways and the viewer (D206), Ducter's own phone
(D217) and a call from the owner's own number (D189, D218), following the morning heads-up's
Tokyo trip. Stills and renders are in `.shots/promo/v5` (D75).
The alternative, a ≤ 2 MB muted 6–8 s loop of the Decide scene committed under
`apps/site/public/`, is cheap to add later if the poster link underperforms.
