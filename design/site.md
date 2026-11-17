# The website (ducter.ai)

The site is `apps/site` (Astro, static, deployed on Vercel): the landing page, `/download`, and the
user docs rendered from `docs/` at `/docs`. What it says was audited in
[site-audit-2026-11.md](site-audit-2026-11.md); this note is how it is built and what is still owed.

## Pages

- **`/`** (D326) answers a visitor's questions in their order, each section with a real screen of
  the app where it shows the product: the hero (the tagline, one subhead, **Get started**, the real
  morning note and a finished job), **What it does for you in a day** (looks out for you, does the
  work, runs errands), **It only asks when it matters** (On hand on a phone), **On your computers,
  with the AI you already pay for** (the Isles, still drawn), **Reach it from anywhere** (Mac,
  iPhone and iPad, Android, a server; iMessage, WeChat, Telegram, Slack), **It remembers you**
  (Memory), **Nothing goes out without your OK** (Done for you, and what it never does), **Open
  source, and yours** with a Get started card, then the film. How it's built is not on the page:
  it's the README's "Under the hood", linked from the footer as **How it's built**.
- **`/start`** (D326), **Get started**: the nav's and the home page's main action. One question,
  **Where should Ducter live?** (This Mac / A server I have / Not sure), as radio cards; the chosen
  path alone shows below (CSS `:has`, so it works without JavaScript; without `:has` all three show
  in turn; `start.ts` only picks the default for the device and follows `#path-…`). Each path puts
  **Let your AI agent do it** (one sentence to paste into Claude Code or Codex, pointing at
  `https://ducter.ai/skills/ducter-deploy/SKILL.md`, which works whether or not the repository is
  public) beside doing it yourself: on a Mac the download leads and the agent is beside it, on a
  server the agent leads. Each path ends with **What happens next** (the app opens, the partner's
  name, its first words; or sign in, `ducter pair`, connect the Mac) and how the phone comes in.
  **Not sure** helps pick, says plainly there's no Windows app, and on a phone offers to email or
  copy the link.
- **`/download`** (D319) lists every way to get Ducter, chosen by where you are: **1. Where Ducter
  lives** (Mac, Linux server), **2. Where you reach it** (iPhone and iPad, Android, any phone's
  browser), **Other ways** (the command line, your AI agent), then the files with sizes and
  SHA-256, and notes (mainland China, updates, Windows). The top card is the visitor's own
  device (`src/lib/platform.ts`; an iPad that asks for desktop pages is told by its touch screen);
  its card in the lists leads its group with **This device**; nothing is hidden. Without
  JavaScript it reads Mac first. It opens with "New to Ducter? Get started"; the files close it as one
  quiet line (each file and its size, SHA256SUMS.txt, the release notes): D326 took out the
  checksum table and its command, since the installer checks every file itself.
- **`/docs`** renders `docs/*.md` with an `order`. The sidebar's groups are `docs/README.md`'s own
  `##` sections, in its order (`groupDocs` in `src/lib/docs.ts`); Previous and Next follow it. A
  page with three or more `##` sections gets **On this page**: a rail at 1240 px and wider, a fold
  under the lede otherwise. Every code block has **Copy**.

## Release facts

`src/lib/github.ts` reads the latest release at build time: the tag, its date, its page, and the
assets by the names `.github/workflows/release.yml` gives them (`Ducter-<v>-arm64.dmg`,
`ducter-<v>-linux-{x64,arm64}.tar.gz`, `Ducter-<v>-android.apk`, `SHA256SUMS.txt`), with each
file's checksum from `SHA256SUMS.txt` (`test/download.test.ts` holds the names to release.yml).
`/download` also asks GitHub's API once in the visitor's browser (no key) and moves its links,
sizes and version to a newer release when the release has its `.dmg` and `SHA256SUMS.txt`; any
failure keeps the build's links. The nav's button and the home page's main action are **Get
started** (`/start`, D326); every **Download** link (the nav, the footer) goes to `/download`.

## Look

Pebble, the same tokens as the clients (`src/styles/site.css`), with **Pebble dark** following the
system (the web client's dark values, D319). Code and terminals stay dark in both modes; a drawn
phone keeps its light lock screen; the Isles keep their daylight water. JetBrains Mono's ligatures
are off, so `Ducter-<version>-arm64.dmg` reads as typed. The site is English only.

## Checking it

`bun test apps/site`, `bun run build` in `apps/site`, `bun scripts/check-links.ts`, and headless
Chrome at 1440 and 390 (iPhone user agent), light and dark, of `/`, `/start`, `/download`, `/docs`
and a docs page (`.shots/d319/`, `.shots/d326/`).

## Pictures

`public/shots/<name>-{light,dark}.webp`, shown by `components/Shot.astro` (the dark one follows the
system). They are real screens of the web client: headless Chrome against a demo core on port 7960,
`localStorage["ducter.notify.asked"]="1"` before load so the notification ask stays out of frame.
`hero` (720 wide at 2×) and `onhand-phone` (390 at 3×, `#onhand`) come from
`DEMO_LANG=en bun apps/web/demo-site.ts`; `memory` (`#settings=memory`, the sheet clipped) and
`done-for-you` (Done for you opened from On hand, clipped) from `DEMO_LANG=en DEMO_MEM=ready
DEMO_DID=1 bun apps/web/demo.ts`. Resized to WebP (quality 82); each is under 70 KB. Retake them
when the screens they show change.

## Owed

- **README screenshots.** `devices.webp` was retaken for D319 (test renderer against the demo core,
  `scripts/readme-shots/demo.ts`). Still owed: `hero.webp` (needs the iOS Simulator's decision
  sheet), `on-hand.webp` (the D287 layout; the renderer's capture shows a hover tooltip over the
  decision card, and the demo seeds both a "HawDB" and a "hawdb" project), `task.webp` (the
  capture shows the fixture's folder name and "Worked for 1s"; run with
  `DEMO_WORKTREE_AS="~/.ducter/worktrees/t_flaky"`), `partner.webp` (`compose.py`'s crop no longer
  matches Settings). Raw captures: `.shots/d319/readme/`.
- **Chinese.** The site and the docs are English only (kept by D326). The zh tagline is designed
  (「你自己的私人 AI：替你把事办完，只在要紧时找你。」); a 中文 home and Get started come when the site
  goes bilingual, with `/download`'s mainland-China note (D78's type is already in the CSS).
- **A mirror for mainland China.** Releases come only from GitHub; `install.sh` has no mirror. If
  one is set up, `install.sh` and `/download` say so together.
- **Docs search.** Twenty-odd pages, no search; Pagefind at build time is the cheap option.
- **From the real Mac app** (D326): the hero in the Mac window, and a Devices picture to replace the
  drawn Isles if the real view reads as well. The web client's Devices sheet is a list.
- **The share image.** `og.png` and its alt still carry the old line; redraw it with the D326
  tagline and the morning note.
- **Dead CSS.** The drawn hero chat, board, phone, ledger and task window are gone from `/`, and their
  rules in `site.css` can go (`main.ts`'s scenes went in the 2026-11-18 copy pass).
- **An accessibility pass with a checker** (axe) on all three page kinds; done by hand so far
  (skip link, focus rings, `aria-current`, the dark tokens' contrast from the clients).

## 2026-11-17: the landing page from the visitor's side (D326)

The author: "网站里的内容比如 'Small windows on purpose' 这个用户根本不应该需要知道也不关心 … 'Say it
once. Hear back when it's done.' 都不足够表达我们的特点", and then "首页的 call action 是不是应该是 get
started? get started 足够优雅顺滑无障碍么？"

- **Who, and what they feel.** The developer from a forum or GitHub wants proof in five seconds; the
  consumer wants to know it helps their life and won't pester them or touch their money; the fresh
  visitor, often on a phone from a friend's link, wants plain words and to know whether it's for
  them. Before: eleven sections mixing builder internals (small windows, the facts registry,
  budgets as tests, OAR) into the story, errands and trust saying the same thing twice, and a
  terminal block as the way in. After: one line that says what it is and how it treats your
  attention, a real screen, seven sections that each answer one question, and one calm path to
  install.
- **The tagline** (research/113): **Your own personal AI. It does the work, and asks only when it
  matters.** / **你自己的私人 AI：替你把事办完，只在要紧时找你。** Ten candidates scored on a rubric
  and by five naive LLM raters; it is the only one none rated below 3. The subhead says where you
  talk to it and that anything spending money or reaching people waits for your OK; "your own Mac
  or server", "open source" and the agents' names are the small print.
- **The hero picture** is the real morning note above a finished job (raters 21/25), with a caption.
- **Get started** replaces Download as the main action (above).
- **Bilingual:** not now. The site stays English; the zh tagline is designed with the en one and is
  the line for the app, a zh README or film. A 中文 site is a todo with its trigger (a mainland
  China mirror, or the first zh launch).

## Copy pass, 2026-11-18

The author: "网站视频下边的文字很奇怪，我觉得需要删掉 … 很奇怪的不面向用户的表达要仔细打磨". Every visible string on
`/`, `/start`, `/download`, `404`, the nav, the footer, the meta and the docs index's chrome was read as
a fresh visitor would. `test/copy.test.ts` now fails on a joined fact strip (D291) or a builder's
word (OAR, harness, eval, worker, tarball, binary, arm64/x64, SHA256, a decision number, a bare
`.dmg`/`.apk`) in what a visitor reads, in the sources always and in the built pages after a build.
Page titles keep their separator (out of D291's scope, as in `check-joins`). Shots: `.shots/site-copy/`.

| Where | Before | After | Why |
|---|---|---|---|
| `/` film | "The launch film · 56 s · also in Chinese and square" | nothing | a caption about the file, not the visitor; the site is English (D326), so no zh toggle |
| `/` film | aria/alt "The launch film, 56 seconds" | "A one-minute film about Ducter" | says what it is, not its runtime |
| `/` hero small print | "… Latest: v0.0.72 · November 17, 2026." | dropped | a version number is no reason to start; `/download` says it |
| `/` stickers | "Tasks in a Mac's apps" / "Its own Android phone, on a Mac" / "Through Tuwa or your own number" | "Works in your Mac's apps" / "A phone of its own, on your Mac" / "It phones for you once you say Call" | plainer; Tuwa means nothing before you need it (the docs name it) |
| `/` Isles | "Asleep · carries on when it wakes"; toast "Codex · Signed in · shared by 2 devices"; labels "Browse the web · added" | "Asleep, picks up when it wakes"; "Codex is signed in on Mac mini"; "Browse the web, added to this Mac" | D291 |
| `/` Mac card | "for Apple silicon" | "for a Mac with an Apple chip" | people's words |
| `/` Android card | "straight from GitHub; it updates itself" | "Download the app here; it keeps itself up to date" | where it comes from is our business |
| `/` chat apps | "… or Slack, It's the same conversation" | "… or Slack. It's …" | typo |
| `/` errands | "fills in forms …, books, and even makes a phone call" | "makes bookings, and can even phone a restaurant" | "books," dangled |
| `/` trust | "Privacy and safety, in full." | "The whole story is in Privacy and safety." | a fragment |
| `/` open | "Apache 2.0. Every line …" | "Under the Apache 2.0 license. …" | a bare licence name isn't a sentence |
| footer | "Apache 2.0 · © 2026 the Ducter authors"; "Releases" | "© 2026 the Ducter authors. Free under the Apache 2.0 license."; "What's new" | D291; say what the link gives you |
| og:image:alt | "… It runs on Claude Code, Codex, pi or DeepSeek Harness." | "Ducter's clay character sitting on a laptop, beside the words: Say it once. …" | describes the picture; the redraw is still owed |
| 404 | "Back to the start" | "Go to the home page" | "start" now means Get started |
| docs index fallback | "install steps are on the home page" (`/#install`) | "Get started walks you through setting Ducter up" (`/start`) | the home page has no install steps since D326 |
| docs README glossary | "Go · Hold · Reply…", "Partner · Settings", "Stop Ducter · Wake" | "Go, Hold and Reply…", "Partner and Settings", "Stop Ducter and Wake" | D291, shown on the docs index |
| `/start` Mac | "Apple silicon"; "a key from"; "Signed and notarized by Apple … checks it against the release's checksum" | "an Apple chip"; "an API key from"; "Apple has checked it, so it opens like any other app … makes sure nothing was damaged on the way" | people's words |
| `/start` server | "x64 or arm64"; "install Ducter as a service"; "Either one sets up HTTPS" | "an Intel, AMD or ARM processor"; "so it starts by itself and keeps running"; "Then give your phone and Mac a way in" | jargon to plain |
| `/start` ends | "The full walk-through · Every download" | "Want more detail? Read the full walk-through, or see every download." | D291 |
| `/download` meta | "… with its size, checksum and what it needs" | "… and what each one needs" | |
| `/download` release line | "Ducter 0.0.72 · released November 17, 2026" | "The latest is version 0.0.72, from November 17, 2026." | D291 |
| `/download` top card | "69 MB · Apple silicon · macOS 12 or later"; "Android 8 or later"; "signed and notarized" | "For a Mac with an Apple chip, on macOS 12 or later."; "For Android 8 or later."; "checked and signed by Apple" | D291; size isn't needed to decide |
| `/download` buttons | "Download .dmg 69 MB", "Download .apk 3 MB" | "Download for Mac", "Download for Android" | say what it's for, not its format |
| `/download` Linux | "x64 bundle", "arm64 bundle"; "64-bit Linux on x64 or arm64 … HTTPS is set up"; "Unpack the bundle for your server's CPU" | "For Intel or AMD", "For ARM"; "64-bit Linux with systemd (Ubuntu, Debian and most others), on an Intel, AMD or ARM processor … the secure address is set up"; "Download the file for your server's processor above" | the picker says it in people's words |
| `/download` AI agent line | "needs an AI agent, Claude Code, …, installed and signed in" | "Ducter does the work through an AI agent on that computer (…), signed in with the plan you already have" | reads as a sentence |
| `/download` iPhone and Android | "On an iPad held across, On hand stands beside …"; "Beta builds expire after 90 days"; "straight from each release, signed"; "On hand meet at the fold" | "On an iPad turned sideways, what needs you sits beside …"; "Each beta version lasts 90 days, and TestFlight brings you the next one"; "Download the app here"; "what needs you sit on either side of the fold" | translated English; On hand isn't introduced on the site |
| `/download` browser | "From outside on a Mac" | "Reach from outside on your Mac" | the glossary's ability name |
| `/download` command line | "puts `ducter` in `~/.local/bin`: with the app on a Mac, as the bundle on Linux"; "Every command · Build it from the source" | "also gives you the `ducter` command, on a Mac or on Linux"; "See every command, or build it from the source." | jargon; D291 |
| `/download` agent card | "with the deploy skill. Ask it:" | "following Ducter's setup guide. Paste this:" | "skill" is the agent's word |
| `/download` files | "The files in Ducter 0.0.72: Ducter-0.0.72-arm64.dmg … SHA256SUMS.txt" | "Every file in version 0.0.72: Mac with Apple chip, Linux server (Intel or AMD), Linux server (ARM), Android, Checksums" | the one place a person picks a file, in people's words |
| `/download` notes | "checks each file against its checksum … check them against SHA256SUMS.txt"; "checked against the release's checksums first" | "never installs a broken download … compare with the checksums above"; "checked before it installs" | the visitor needs the promise, not the mechanism |

Also gone: `main.ts`'s four dead scenes (the drawn hero, board, phone and ledger; nothing on the
page had their elements), which still held joined strings.
