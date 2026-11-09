# The AI agents' coins: whose mark may go on them

Each AI agent Ducter works with has its own clay coin (`tools/art/coins.py`). The author's
brief: print the agent's official logo on the coin, unchanged, where its owner's terms allow
that use (showing which product Ducter is working through); where they don't, print the
product's name plainly instead. This file records what each owner says, read on 2026-11-10.
Re-read it before changing a coin, and before any new agent gets one.

What the coins do either way: the logo is only scaled and placed, flat, with its own clear
space and more; no recolouring, no effects, no lighting over it. An unavailable coin is a
grey body with the print unchanged and a separate pale layer laid over the whole coin. Every
coin sits next to the product's name as text, and nothing on it says or implies that the
owner endorses or partners with Ducter.

| Agent | On the coin | Why |
|---|---|---|
| Claude Code (Anthropic) | the name, "Claude Code" | logos only with Anthropic's prior approval |
| Codex (OpenAI) | the name, "Codex" | no Codex logo file is published; OpenAI's brand page could not be read |
| pi (Earendil) | pi's logo, `design/art/logos/pi.svg` | the press kit offers the vector logo; no restrictions stated |
| DeepSeek Harness (DeepSeek) | the name, "DeepSeek Harness" | DeepSeek's terms forbid its marks and logo without permission |

## Anthropic: Claude Code

- DOCUMENTED, Anthropic Trademark Guidelines (effective Aug 1, 2024),
  <https://www.anthropic.com/legal/trademark-guidelines>: the marks may be used only "as
  specifically permitted by us and only in materials we approve beforehand"; "No alterations
  of our trademarks (changes to color, font, proportion, or otherwise) are permitted"; keep a
  readable background and "a reasonable space" on each side; no ™ symbol; no use that implies
  "sponsorship or endorsement, or a relationship or affiliation". Anthropic supplies the
  artwork itself; requests go to marketing@anthropic.com (for those with a business
  relationship).
- DOCUMENTED, Agent SDK "Branding guidelines",
  <https://code.claude.com/docs/en/agent-sdk/overview>: written for products built on the
  Agent SDK (Ducter instead runs the person's own Claude Code): such products may not call
  themselves "Claude Code" or use "Claude Code-branded ASCII art or visual elements that
  mimic Claude Code", and "should maintain [their] own branding".
- **Result:** no Anthropic or Claude logo on the coin without written approval. The coin
  carries the name set in Ducter's own face (Bricolage Grotesque), which refers to the
  product and imitates none of its artwork. To use the logo: ask marketing@anthropic.com,
  then add the SVG they supply to `design/art/logos/` and switch the coin's print in
  `tools/art/coins.py`.

## OpenAI: Codex

- `https://openai.com/brand/` (OpenAI's design guidelines, with the logo downloads) answered
  HTTP 403 to every automated read on 2026-11-10, so its text is not quoted here. What
  secondary summaries say it holds (INFERRED until read first-hand): the logo may be used
  only where it relates directly to OpenAI's services and only within the guidelines; do not
  alter it, add fill patterns, make your own lockups, or pair the logo mark with product or
  model names; prefer the black or white version; do not imply partnership; questions to
  partnercomms@openai.com.
- DOCUMENTED, `openai/codex` on GitHub (<https://github.com/openai/codex>): the repository
  ships no Codex logo file (its only images are a CLI splash and skill icons). The OpenAI
  "Blossom" is OpenAI's mark, not Codex's, and pairing it with a product name is what the
  guidelines are reported to forbid.
- **Result:** the name "Codex" on a near-black coin. To use a logo: read the brand page in
  a browser, download the official file, and confirm the "integration" use with
  partnercomms@openai.com if the page doesn't settle it.

## Earendil: pi

- DOCUMENTED, pi press kit, <https://pi.dev/press-kit>: "Primary logo: Vector logo for
  light/dark usage and editorial placements", downloadable at <https://pi.dev/logo.svg>
  (identical to <https://pi.dev/logo-auto.svg>, the logo in the repo's README). No usage
  rules, colours or clear-space rules are stated; contact rfc@earendil.com. The site's
  footer: "Earendil Inc. & Contributors", MIT License (the code licence; it says nothing
  about the logo).
- **Result:** the logo, from `https://pi.dev/logo.svg` as published (SHA-256
  `abd66e78…cb4d6b`, kept as `design/art/logos/pi.svg`), rasterised at size by
  `rsvg-convert` with its own viewBox margin, centred on a cream body so all three of its
  colours read. Nothing is drawn over it except the unavailable coin's separate veil.

## DeepSeek: DeepSeek Harness

- DOCUMENTED, DeepSeek Terms of Use §5.2,
  <https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html> (the copy served on
  2026-11-10 was dated 2025-01-20): without DeepSeek's permission, users may not use "any
  trademarks, service marks, trade names, domain names, website names, company logos (LOGO),
  URLs, or other prominent brand features related to the Services (including but not limited
  to 'DeepSeek')", alone or combined, nor imply the right to use them.
- DOCUMENTED: DeepSeek publishes no brand kit; its GitHub repositories carry a logo
  (`deepseek-ai/DeepSeek-LLM/images/logo.svg`) with no grant to use it.
- **Result:** no DeepSeek logo. The coin carries the product's name in plain text, in
  DeepSeek's blue family. Read literally, §5.2 reaches even the name; Ducter already names
  the product in text everywhere (it has to, to say which one runs a task), and the coin is
  that same nominative reference. If the author wants zero risk here, set the print to
  `None` in `tools/art/coins.py` and the coin is the blue body alone.

## Summary

Only pi's logo is on a coin; Claude Code, Codex and DeepSeek Harness carry their names until
their owners approve (Anthropic, DeepSeek) or the brand page is read first-hand (OpenAI).
The art pipeline takes an owner's SVG as a drop-in, so switching a coin to its logo is a
one-line change plus a re-render.
