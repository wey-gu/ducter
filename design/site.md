# The website (ducter.ai)

The site is `apps/site` (Astro, static, deployed on Vercel): the landing page, `/download`, and the
user docs rendered from `docs/` at `/docs`. What it says was audited in
[site-audit-2026-11.md](site-audit-2026-11.md); this note is how it is built and what is still owed.

## Pages

- **`/`** tells the story with live, drawn scenes (the conversation, On hand, the Isles, the
  phone, the ledger, an opened task), not screenshots, so it never goes stale with a pixel. Its
  sections: hero, silence means success, your computers (Isles), one thumb (phone), wherever you
  are (`#where`, D318's), it doesn't start from zero, it looks out for you, errands, trust, open
  anything, yours to read and run (with the install tabs), the film.
- **`/download`** (D319) lists every way to get Ducter, chosen by where you are: **1. Where Ducter
  lives** (Mac, Linux server), **2. Where you reach it** (iPhone and iPad, Android, any phone's
  browser), **Other ways** (the command line, your AI agent), then the files with sizes and
  SHA-256, and notes (mainland China, updates, Windows). The top card is the visitor's own
  device (`src/lib/platform.ts`; an iPad that asks for desktop pages is told by its touch screen);
  its card in the lists leads its group with **This device**; nothing is hidden. Without
  JavaScript it reads Mac first.
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
failure keeps the build's links. Every **Download** on the site (the nav, the hero, the footer, the
docs' header) goes to `/download`.

## Look

Pebble, the same tokens as the clients (`src/styles/site.css`), with **Pebble dark** following the
system (the web client's dark values, D319). Code and terminals stay dark in both modes; a drawn
phone keeps its light lock screen; the Isles keep their daylight water. JetBrains Mono's ligatures
are off, so `Ducter-<version>-arm64.dmg` reads as typed. The site is English only.

## Checking it

`bun test apps/site`, `bun run build` in `apps/site`, `bun scripts/check-links.ts`, and headless
Chrome at 1440 and 390 (iPhone user agent), light and dark, of `/`, `/download`, `/docs` and a docs
page (`.shots/d319/`).

## Owed

- **README screenshots.** `devices.webp` was retaken for D319 (test renderer against the demo core,
  `scripts/readme-shots/demo.ts`). Still owed: `hero.webp` (needs the iOS Simulator's decision
  sheet), `on-hand.webp` (the D287 layout; the renderer's capture shows a hover tooltip over the
  decision card, and the demo seeds both a "HawDB" and a "hawdb" project), `task.webp` (the
  capture shows the fixture's folder name and "Worked for 1s"; run with
  `DEMO_WORKTREE_AS="~/.ducter/worktrees/t_flaky"`), `partner.webp` (`compose.py`'s crop no longer
  matches Settings). Raw captures: `.shots/d319/readme/`.
- **The landing page's On hand board** is drawn in the pre-D287 shape (a waiting card above rows).
  Redraw it as D287's sections with the sentence and the strip; it is a prototype change, so it
  goes through the change loop with the canvases.
- **Chinese.** The site and the docs are English only; at least `/download`'s mainland-China note
  and the hero belong in 中文 too (D78's type is already in the CSS).
- **A mirror for mainland China.** Releases come only from GitHub; `install.sh` has no mirror. If
  one is set up, `install.sh` and `/download` say so together.
- **Docs search.** Twenty-odd pages, no search; Pagefind at build time is the cheap option.
- **The landing page's length.** Eleven sections; errands and trust say neighbouring things and
  could become one.
- **An accessibility pass with a checker** (axe) on all three page kinds; done by hand so far
  (skip link, focus rings, `aria-current`, the dark tokens' contrast from the clients).
