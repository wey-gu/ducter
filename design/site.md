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
- **Dead CSS.** The drawn hero chat, board, phone, ledger and task window are gone from `/`; their
  rules in `site.css` (and `main.ts`'s scenes, which guard on their elements) can go.
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
