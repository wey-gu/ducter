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
