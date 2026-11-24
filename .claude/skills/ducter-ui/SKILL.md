---
name: ducter-ui
description: Load before changing anything a person sees in Ducter (Mac app views, the web/phone client, the site). Holds the reading list, the shared-controls rule, the full visual and UX checklist, and the self-review protocol every visible change must clear before it is reported or merged.
---

# Ducter UI: the bar and how to clear it

Ducter's look is one strong, consistent style: clay (soft solid shapes standing on ledges),
warm paper and ink, the persona's stone, game-like smooth motion, and 情绪价值 in every moment.
A screen that works but looks improvised is a bug. This skill exists because fast iteration let
such screens ship (an ad-hoc 「说」 button, a rail running under the traffic lights, a dark system
tooltip, a sidebar that blinked out on a partner switch, a label clipped by its tile).

## 1. Read before you draw

- `design/ui.md`, at least:
  - **Components and tokens**: the scales for type, space, radius, controls, touch, chips and motion;
  - **Depth: one clay (D76)**; **Buttons**; **Faded (D374)**;
  - **Shared controls (D161)** and its table; **One menu (D421)**;
  - the D290 motion vocabulary; **Art direction (D53)**; **Persona face**.
- The design note for the area you touch (AGENTS.md lists them) and its shots in `.shots/`.
- An existing screen that already does what you need. Match its patterns exactly before
  considering anything new.
- `AGENTS.md` "Product and design rules": the metaphor process for any new concept visual.

## 2. Build only from shared pieces

- Every button, field, composer (text plus send), chip, row, card, section header, time column,
  menu, tooltip, chevron, badge and empty state comes from the D161 set:
  - Mac: `apps/desktop/internal/views/components.go`, `quiet.go`, `facts.go`, `menu.go`;
  - web: `apps/web/src/controls.tsx`, `menu.tsx`.
- Missing one? Add it to the set, to ui.md's table, and to both clients first, then use it.
- Values only from tokens and scales. A new value needs a token first.
- Never a system tooltip, a system menu, a browser default control, an emoji, " · " joins, or a
  colored left-border callout.

## 3. The checklist: walk it on every surface you touched

**Window chrome and edges (Mac)**
- The traffic lights sit in a designed titlebar zone. Nothing runs under them or touches them,
  windowed or full screen, at any width.
- Dividers meet: a column's rule and the header's rule join cleanly. No hairline stops short or
  overshoots.
- Content keeps the standard insets from window edges and corners.

**Alignment and rhythm**
- One left edge per column. Text, chips and controls in a row share a baseline.
- Spacing only from `S1…S7`, with groups spaced more than their members.
- Labels never touch or clip their container. Measure the longest real string in zh and en.
- Titles cut at a word end (`cutAtWordEnd`), never mid-word. Wrap where a wrap reads better.

**States**
- Each control has its default, hover, focus (keyboard), pressed, disabled, loading or sending,
  and success state.
- Each list has its empty, one, many, very long and error state.
- Something waiting always moves (a breath, a progress, a spinner from the set) and says what
  it waits for. A wait over a few seconds says so in words. Nothing sits frozen.

**Motion (D290)**
- Use the vocabulary: press 70 ms, `Snappy` hover/lift, enter 220 ms (6pt rise plus fade),
  `Bouncy` for living things.
- A switch between views moves only what changes. Persistent chrome (rails, headers, the
  composer) stays perfectly still and never re-lays out or flashes.
- Selection moves with a spring and never jumps.
- Reduced motion: no movement, colors still change.

**Themes and languages**
- Light and dark from the same tokens, with contrast checked on both.
- zh and en designed together at real lengths. A zh string never breaks one character per line.

**Widths and input**
- Mac at 1000, 1150 (the common laptop window) and 1400. Web at 320, 390, 1000 and 1400.
- Touch targets 44 tall. Text size scaling on the web (D452).
- Keyboard: Tab order and visible focus, Escape closes, shortcuts work.

**Voice and content**
- Words from the glossary, one voice: 我 is the partner and 你 is the person (D501).
- No internal plumbing shown (task-to-Ducter instructions, ids, file paths) unless the place is
  for it.
- Real data and counts, never lorem or invented numbers.

## 4. Self-review protocol

1. **Shoot.** Use `.shots/<topic>/` and cover:
   - before and after;
   - each state above that applies;
   - every width;
   - light and dark, zh and en;
   - **2x crops** of every corner, edge and junction you touched;
   - transitions as 4–6 frames.
2. **Critique your own shots** against section 3, then with the design skills:
   - `impeccable` (critique, then polish);
   - `kill-ai-slop` (audit);
   - `design-review`;
   - `ios-design-review` for phone screens on the iOS Simulator.

   Fix everything they find that is real.
3. **Report** what you checked, what you fixed and what you knowingly left, with the shot paths.
   The lead looks at the shots before anything merges.

## 5. Guards

- The D161 shared-controls tests are deny-by-default across all views. Don't weaken them. If a
  view legitimately defines a control, it joins the shared set.
- Geometry tests: 1000 and 1400 on the Mac, 320 and 390 on the web for any new layout.
- `TestLongSessionWindowed` stays within budget for anything in the conversation or On hand.
