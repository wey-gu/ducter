# The website (ducter.ai)

The site is `apps/site` (Astro, static, deployed on Vercel): the landing page, `/download`, and the
user docs rendered from `docs/` at `/docs`. What it says was audited in
[site-audit-2026-11.md](site-audit-2026-11.md); this note is how it is built and what is still owed.

## Pages

- **`/`** (D326, D408) answers a visitor's questions in their order, each section with a real screen
  of the app where it shows the product: the hero (D408's line, which carries both halves of
  [positioning.md](positioning.md), its paragraph as the lede, **Get started**, the trust line, the
  real morning note and a finished errand), **For your days: a partner that looks out for you**
  (looks out for you, does the work, runs errands), **For your work: a whole team, and you only
  hear what matters** (On hand on a Mac with 18 tasks, `many`), **It only asks when it matters**
  (On hand on a phone), **On your computers, with the AI you already pay for** (the Isles, still
  drawn), **Reach it from anywhere** (Mac, iPhone and iPad, Android, a server; iMessage, WeChat,
  Telegram, Slack), **It remembers you** (Memory), **Nothing goes out without your OK** (Done for
  you, and what it never does), **Open source, and yours** with a Get started card, then the film.
  How it's built is not on the page: it's the README's "Under the hood", linked from the footer as
  **How it's built**.
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
- **`/changelog`** (D344), **What's new**: the repo's `CHANGELOG.md` read at build time
  (`src/lib/changelog.ts`; no copy, no GitHub call). Each `## X.Y.Z - YYYY-MM-DD` heading gives the
  version and its date. The latest three releases are open cards: the version (a self-link), the
  date, the whats-new block's English lines as the headline (the same lines the update cards show),
  then the sections as written. Older ones fold by month in native `<details>` (readable without
  JavaScript; the browser's find opens a fold). Every release has the anchor `#<version>`, which the
  apps' **See what changed** opens; `changelog.ts` opens and lands on a fold a link points at. Linked
  from the footer (**What's new**, in place of GitHub's Releases), `/download`'s release line and
  release notes, and the docs index. `test/changelog.test.ts` fails on decision numbers, source
  paths or unrendered code in what a visitor reads, so a CHANGELOG section stays in user words.
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
Chrome at 1440 and 390 (iPhone user agent), light and dark, of `/`, `/start`, `/download`, `/docs`,
`/changelog` and a docs page (`.shots/d319/`, `.shots/d326/`, `.shots/changelog/`). Emulate reduced
motion for an anchored shot: the page scrolls smoothly, and a headless Chrome never finishes it.

## Pictures

`public/shots/<name>-{light,dark}.webp`, shown by `components/Shot.astro` (the dark one follows the
system). They are real screens of the web client: headless Chrome against a demo core on port 7960,
`localStorage["ducter.notify.asked"]="1"` before load so the notification ask stays out of frame,
and loaded once more so the conversation is read (no New messages line) and starts at the top; the
clock is set with a time zone override so the note says a morning time.
`many` (D408: On hand full width, `#onhand/full` at 1440 × 1000 and 2×, cropped to 1440 × 750 and saved at 1920 wide, from `DEMO_LANG=en bun apps/web/demo-onhand.ts`), `hero` (720 × 900 at 1.5×) and `onhand-phone` (390 × 844 at 2×, `#onhand`) come from
`DEMO_LANG=en bun apps/web/demo-site.ts`; `memory` (`#settings=memory`, the sheet clipped) and
`done-for-you` (Done for you opened from On hand, clipped) from `DEMO_LANG=en DEMO_MEM=ready
DEMO_DID=1 bun apps/web/demo.ts`. Resized to WebP (quality 82); each is under 70 KB. Retake them
when the screens they show change, then redraw the share image (below).

## Owed

- **README screenshots.** `devices.webp` was retaken for D319 (test renderer against the demo core,
  `scripts/readme-shots/demo.ts`). Still owed: `hero.webp` (needs the iOS Simulator's decision
  sheet), `on-hand.webp` (the D287 layout; the renderer's capture shows a hover tooltip over the
  decision card, and the demo seeds both a "HawDB" and a "hawdb" project), `task.webp` (the
  capture shows the fixture's folder name and "Worked for 1s"; run with
  `DEMO_WORKTREE_AS="~/.ducter/worktrees/t_flaky"`), `partner.webp` (`compose.py`'s crop no longer
  matches Settings). Raw captures: `.shots/d319/readme/`.
- **Chinese.** The site and the docs are English only (kept by D326). The zh line and paragraph are
  designed ([positioning.md](positioning.md), D408); a 中文 home and Get started come when the site
  goes bilingual, with `/download`'s mainland-China note (D78's type is already in the CSS).
- **A mirror for mainland China.** Releases come only from GitHub; `install.sh` has no mirror. If
  one is set up, `install.sh` and `/download` say so together.
- **The share image with D408's line** was redrawn (`og.png?v=4`, layout A) but not re-rated:
  the line is longer (five lines at 74 px), so the thumbnail test of 2026-11-18 should be run again.
- **Docs search.** Twenty-odd pages, no search; Pagefind at build time is the cheap option.
- **From the real Mac app** (D326): the hero in the Mac window, and a Devices picture to replace the
  drawn Isles if the real view reads as well. The web client's Devices sheet is a list.
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
- **The tagline** (research/113; superseded by D408, [positioning.md](positioning.md)): **Your own
  personal AI. It does the work, and asks only when it matters.** / **你自己的私人 AI：替你把事办完，只在要紧时找你。** Ten candidates scored on a rubric
  and by five naive LLM raters; it is the only one none rated below 3. The subhead says where you
  talk to it and that anything spending money or reaching people waits for your OK; "your own Mac
  or server", "open source" and the agents' names are the small print.
- **The hero picture** is the real morning note above a finished errand (raters 21/25 for the note above a
  finished job; the job became a dinner booked in 2026-11-18, see the share image), with a caption.
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
Page titles say the page, then the site, with an en dash (D346: **Install – Ducter docs**), and the
test reads them too. Shots: `.shots/site-copy/`.

| Where | Before | After | Why |
|---|---|---|---|
| `/` film | "The launch film · 56 s · also in Chinese and square" | nothing | a caption about the file, not the visitor; the site is English (D326), so no zh toggle |
| `/` film | aria/alt "The launch film, 56 seconds" | "A one-minute film about Ducter" | says what it is, not its runtime |
| `/` hero small print | "… Latest: v0.0.72 · November 17, 2026." | dropped | a version number is no reason to start; `/download` says it |
| `/` stickers | "Tasks in a Mac's apps" / "Its own Android phone, on a Mac" / "Through Tuwa or your own number" | "Works in your Mac's apps" / "A phone of its own, on your Mac" / "It phones for you once you say Call" | plainer; Tuwa means nothing before you need it (the docs name it) |
| `/` Isles | "Asleep · carries on when it wakes"; toast "Codex · Signed in · shared by 2 devices"; labels "Browse the web · added" | "Asleep, picks up when it wakes"; "Codex is signed in on Mac mini"; "Browse the web, added to this Mac" | D291 |
| `/` Mac card | "for Apple silicon" | "for a Mac with Apple silicon (M1 or later)" | Apple's own term, as About This Mac shows it (D346) |
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
| `/start` Mac | "Apple silicon"; "a key from"; "Signed and notarized by Apple … checks it against the release's checksum" | "a Mac with Apple silicon (M1 or later)" (D346); "an API key from"; "Apple has checked it, so it opens like any other app … makes sure nothing was damaged on the way" | people's words |
| `/start` server | "x64 or arm64"; "install Ducter as a service"; "Either one sets up HTTPS" | "an Intel, AMD or ARM processor"; "so it starts by itself and keeps running"; "Then give your phone and Mac a way in" | jargon to plain |
| `/start` ends | "The full walk-through · Every download" | "Want more detail? Read the full walk-through, or see every download." | D291 |
| `/download` meta | "… with its size, checksum and what it needs" | "… and what each one needs" | |
| `/download` release line | "Ducter 0.0.72 · released November 17, 2026" | "The latest is version 0.0.72, from November 17, 2026." | D291 |
| `/download` top card | "69 MB · Apple silicon · macOS 12 or later"; "Android 8 or later"; "signed and notarized" | "For a Mac with Apple silicon (M1 or later), on macOS 12 or later." (D346); "For Android 8 or later."; "checked and signed by Apple" | D291; size isn't needed to decide |
| `/download` buttons | "Download .dmg 69 MB", "Download .apk 3 MB" | "Download for Mac", "Download for Android" | say what it's for, not its format |
| `/download` Linux | "x64 bundle", "arm64 bundle"; "64-bit Linux on x64 or arm64 … HTTPS is set up"; "Unpack the bundle for your server's CPU" | "For Intel or AMD", "For ARM"; "64-bit Linux with systemd (Ubuntu, Debian and most others), on an Intel, AMD or ARM processor … the secure address is set up"; "Download the file for your server's processor above" | the picker says it in people's words |
| `/download` AI agent line | "needs an AI agent, Claude Code, …, installed and signed in" | "Ducter does the work through an AI agent on that computer (…), signed in with the plan you already have" | reads as a sentence |
| `/download` iPhone and Android | "On an iPad held across, On hand stands beside …"; "Beta builds expire after 90 days"; "straight from each release, signed"; "On hand meet at the fold" | "On an iPad turned sideways, what needs you sits beside …"; "Each beta version lasts 90 days, and TestFlight brings you the next one"; "Download the app here"; "what needs you sit on either side of the fold" | translated English; On hand isn't introduced on the site |
| `/download` browser | "From outside on a Mac" | "Reach from outside on your Mac" | the glossary's ability name |
| `/download` command line | "puts `ducter` in `~/.local/bin`: with the app on a Mac, as the bundle on Linux"; "Every command · Build it from the source" | "also gives you the `ducter` command, on a Mac or on Linux"; "See every command, or build it from the source." | jargon; D291 |
| `/download` agent card | "with the deploy skill. Ask it:" | "following Ducter's setup guide. Paste this:" | "skill" is the agent's word |
| `/download` files | "The files in Ducter 0.0.72: Ducter-0.0.72-arm64.dmg … SHA256SUMS.txt" | "Every file in version 0.0.72: Mac with Apple silicon (D346), Linux server (Intel or AMD), Linux server (ARM), Android, Checksums" | the one place a person picks a file, in people's words |
| `/download` notes | "checks each file against its checksum … check them against SHA256SUMS.txt"; "checked against the release's checksums first" | "never installs a broken download … compare with the checksums above"; "checked before it installs" | the visitor needs the promise, not the mechanism |

Also gone: `main.ts`'s four dead scenes (the drawn hero, board, phone and ledger; nothing on the
page had their elements), which still held joined strings.

## The share image (D346)

`public/og.png` (1200 × 630, also twitter:image, linked as `og.png?v=4` (D408's line) so X and Slack fetch it
again) is what WeChat, X, Slack and iMessage show when someone shares ducter.ai: for many people the
first thing they ever see of Ducter. `apps/site/scripts/og.mjs` (`bun run og` in `apps/site`) draws
it from an HTML template in headless Chrome, with the site's Bricolage, palette and clay art and the
real hero shot (`public/shots/hero-light.webp`), and squeezes it to a palette PNG under 400 KB (70 KB
now). It reads the tagline from the home page's `<h1>`; `test/copy.test.ts` fails if the alt in
`Head.astro` doesn't carry that line, so a new line means running it again. Retaken shots mean the
same. `--layout b|c --out <file>` draws the two that lost.

**Three layouts, rated** (`.shots/og/cand-{a,b,c}.png`, the 300-px thumbnails beside them; the winner
`.shots/og/winner-a.png`). Five naive LLM raters (Haiku), the same five as research/113: a developer
from a forum (en), a consumer who uses a chat assistant for life admin (en), a teacher sent the link
on her phone (en), an office worker in Shanghai sent it on WeChat (zh), an indie developer from
GitHub (zh). Each saw the three as thumbnails first and then full size, under neutral letters in a
different order, and said what it thinks the product is, would it tap (1–5), and whether the words
read at thumbnail size. One run each; LLM proxies, not people.

| Layout | What it is | Dev en | Consumer en | Fresh en | Consumer zh | Dev zh | Σ /25 | Would tap |
|---|---|---|---|---|---|---|---|---|
| **A** | the line left; the whole screen right, running off the bottom; the character beside it | 4 | 3 | 4 | 3 | 4 | **18** | 3 of 5 |
| B | two real cards (the note's first item, the finished job) large; the line across the bottom | 3 | 3 | 3 | 2 | 3 | 14 | 0 |
| C | the character big, holding up the morning note; the line right | 3 | 3 | 4 | 3 | 3 | 16 | 2 (both consumers) |

- **A won** on proof: the developers tapped it because the screen shows a real job finished ("nothing
  is pushed", Merge into main); the teacher because the chat reads as something she can message.
- **Every rater read the headline at 300 px and nothing else.** The line carries the card; the
  screen says "a real app", not its words.
- **What lost A points:** the finished job was a developer's (HawDB, a branch, Merge into main),
  which told both consumers "not for me"; they chose C, which shows only the morning note.
- **Redrawn with an errand (2026-11-18).** The hero shot's finished job is now a dinner booked (a
  table for four on Saturday, no stairs for Mom; "Booked … free to cancel until Friday noon";
  `apps/web/demo-site.ts`), the same shot as the home page's hero and `onhand-phone`'s Done today, so
  all three were retaken. The same five raters, old (the code job) against new, under neutral
  letters in alternating order, one run each (`.shots/polish-0075/og-raters.json`):

  | og.png | Dev en | Consumer en | Fresh en | Consumer zh | Dev zh | Σ tap /25 | Picked |
  |---|---|---|---|---|---|---|---|
  | Old: a flaky test fixed | 4 | 2 | 2 | 2 | 4 | 14 | 2 (both developers) |
  | **New: a table booked** | 2 | 4 | 4 | 4 | 3 | **17** | 3 (both consumers, the teacher) |

  The trade flipped as expected: the developers now read "everyday errands" and tapped less, and
  everyone else read it as theirs ("made for someone like me" 1 → 4–5). The new one stays: the
  developer's case is said on the page itself (since D408, the For your work section and its
  On hand screen) once they tap, and the card is the first thing most people see. Every rater still read
  only the headline at thumbnail size.
- Three raters found the clay character childlike for a tool and two liked it; it stays (it is the
  partner), at the size of one supporting element.

**No square variant.** X, Slack, iMessage and LinkedIn take the 1.91:1 og:image. WeChat, shared
from its browser without the official-account JS-SDK, picks its own thumbnail and crops it square;
which image it picks is not documented (community reports only), so a square og.png would change
nothing there. Revisit if Ducter gets an official account with the JS-SDK.


## 2026-11-20: both halves on the first screen (D408)

The author: the site and the GitHub description "没有真的抓住我们的精髓": a local, elegant personal agent
on your own servers and computers, and at the same time the strongest platform for running many
work agents, with the attention problem solved. The words and why are in
[positioning.md](positioning.md) and [research/167](../research/167-two-halves.md). On the page:
the hero's line, lede and trust line; the first section renamed **For your days**, its middle card's
example no longer code (the work half has its own section now); a new **For your work** section
with `many` (On hand on a Mac) and three points; the bands re-alternated (what deep, many plain,
asks deep, devices plain, where deep, memory plain, trust ink, open deep). The hero's `<h1>` is a
step smaller (`clamp(40px, 4.9vw, 68px)`) so Get started stays in the first screen at 1440 × 900
with the longer line. Shots: `.shots/positioning/` (hero at 1440 and 390, light and dark, en and a
zh rendering of the designed words; the For your work section at 1440 and 390; full pages).
