# The AI agents' coins: each agent's own mark, in clay

Each AI agent Ducter works with has its own coin: the agent's real mark, sculpted as a small
puffy clay object in Ducter's clay style (D183). The author's call (2026-11-10): "给 codex、
deepseek 和 claude code 也画粘土，不用在乎商标。我们只是小项目". The coin says which product
does a task, in the same way the product's name beside it does; nothing on it says or implies
that the owner endorses or partners with Ducter.

| Agent | The mark the coin is sculpted from | Reference used (downloaded, never committed) |
|---|---|---|
| Claude Code | Anthropic's Claude starburst, terracotta `#D97757` | Wikimedia Commons, `Claude_AI_symbol.svg` |
| Codex | OpenAI's mark, the six-band woven knot (Codex is OpenAI's agent; the author chose it over the Codex cloud), in charcoal clay | LobeHub icons (`@lobehub/icons-static-png@1.75.0`, `light/openai.png`) |
| DeepSeek Harness | DeepSeek's whale, `#4D6BFE` | LobeHub icons, `deepseek-color.svg` (the same whale as `deepseek-ai`'s GitHub avatar) |
| pi | pi's four-block logo (salmon, teal, butter) | pi's press kit, <https://pi.dev/logo.svg> |

## What the earlier rule was, and what changed

Until D183 the coins followed each owner's terms, read 2026-11-10 (D146): Anthropic's
trademark guidelines allow its marks only with prior approval; DeepSeek's Terms of Use §5.2
forbid its marks and logo without permission; OpenAI publishes no Codex logo file and its brand
page could not be read; pi's press kit offers its logo. So only pi's coin carried a logo, flat
and unaltered, and the other three carried their names. The author weighed that and chose the
marks: a small open-source project, the marks used only to say which agent is which, next to
its name. The terms are unchanged; if an owner objects, its coin goes back to the plain clay
token (`token_ink`) with the name beside it, a one-line change in each client's coin table.

## How to make or remake a coin

1. Put the owner's mark, rendered flat on white at 512 px, in `design/art/assets/marks/`
   (gitignored) as `claude.png`, `codex.png`, `deepseek.png`, `pi.png`.
2. Generate from `design/art/assets/batch_coins.json` (style `prompts/_style_coins.md`, one
   prompt per coin, the mark as the first reference, the clay token and the clay character for
   the style); keep the raw renders in `.shots/` and pick by putting them side by side at 20–96
   px on Pebble light and dark.
3. Cut out with `swift design/art/assets/tools/cut.swift <in> <out>` (Vision keeps only one
   piece: for a mark in separate pieces, like pi's, run it again with the found piece painted
   out and add the second piece).
4. `python3 tools/art/coins.py master <id> <cut.png> [#tone]` makes the master in
   `design/art/assets/alpha/coin_<id>.png` (background un-mixed from the edge, trimmed,
   squared; `#tone` moves a render that came out off the mark's colour back to it), then
   `python3 tools/art/coins.py` writes every size the apps load, and
   `node apps/site/scripts/art.mjs` (in `apps/site`) the site's.

## Products' own marks in the tile column (D314)

Where a row is about another company's product, it shows that product's own mark, the way the
coins show the agents': to say which product it is, next to its name, never to imply the owner
endorses Ducter. The marks are the owners' own paths, unaltered (no redrawing, recolouring,
stretching or effects), at 24 on the small white clay tile, so each keeps the clear space its
guidelines ask for. Ink parts are `currentColor`: the theme's ink, near-black on light and bone on
dark, as the owners' own light and dark marks (GitHub, OOMOL, Tuwa's t, Cursor, Cline, Windsurf).

| Mark | Source of the paths | Colours |
|---|---|---|
| Telegram | Simple Icons 13.21.0 (CC0), split into the circle and the plane | Telegram's blue gradient `#2AABEE` → `#229ED9`, the plane white |
| Slack | Simple Icons, its eight pieces | the four Slack colours (slack.com media kit) |
| Messages (iMessage) | Simple Icons, split into the square and the bubble | Apple's system green `#34C759`, the bubble white |
| WeChat | Simple Icons | WeChat green `#07C160` |
| Gmail | Google's 2020 Gmail icon (five paths) | its five colours |
| Google Calendar | Simple Icons, on a white page | Google blue `#4285F4` |
| GitHub | Simple Icons | ink |
| Obsidian (D340, To-do sources) | Simple Icons 13.21.0 (CC0) | Obsidian purple `#7C3AED` (obsidian.md) |
| Jira (D340, coming soon on To-do sources) | Simple Icons 13.21.0 (CC0) | Atlassian blue `#0052CC` (atlassian.design/foundations/logos) |
| Discord | Simple Icons | Blurple `#5865F2` |
| OOMOL | oomol.com/img/brand/oomol-mark.svg | ink |
| Tuwa | tuwa.ai/favicon.svg (the t and its green dot; the clip at x = 84 cut into the path) | `#30D158`, the t in ink |
| Cursor, Cline, Windsurf | LobeHub icons 1.75.0 | ink |
| Gemini | LobeHub icons 1.75.0 (`gemini-color`) | its own gradients |
| Zed, Raycast | Simple Icons | `#084CCF`, `#FF6363` |
| Nowledge Mem | its macOS app icon (`/Applications/Nowledge Mem.app`), cropped to the icon, 128 px for the Mac, 120 px WebP for the web | as shipped |

The SVGs live in `apps/web/src/brand/` (the one source; each file names where its paths came
from) and are copied byte for byte to `apps/desktop/internal/theme/art/brand/`
(`brand_test.go` fails when they differ). Guidelines read: Slack's media kit asks for the mark
unaltered in its colours; Telegram, WeChat, Discord and GitHub publish marks for linking to their
products; Apple restricts its app icons to approved uses, so Messages is shown by the Simple Icons
rendering of the bubble, not Apple's icon file. The same rule as the coins applies: if an owner
objects, its tile goes back to the drawn stand-in (Accounts) or the letter, a one-line change in
`brandOf` / `toolBrand` on each client.
