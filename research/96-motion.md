# 96 · Moving between views: native navigation motion, and a motion vocabulary for Ducter (D290)

*2026-11-16. Asked by the author: "我认为桌面和手机 app 切换各个视图的时候也应该有特别优雅顺滑的动画哈。
现在会不会太楞了？native mac app / mobile app 应该是什么样的？我们还是特别有性格的、有情绪价值的".
Sources: MyGo v0.8.3 as Ducter pins it (`apps/desktop/go.mod`; its `docs/ui/transitions.md`,
`motion.md`, `navigation.md`, `drawing.md`, `testing.md`, `ui/transition.go`, `ui/match.go`, read
in the module cache), MyGo's current `examples/` (cloned depth 1 into the session scratchpad, read
only) and its docs page `mygo.run/docs/ui/drawing#animation` (fetched 2026-11-16); the platforms'
navigation conventions as recalled (not re-read this session, tagged so); the build's own frame
sequences and timings (`.shots/d290/`).*

## What Ducter did before

| Client | Moving between views | Tag |
|---|---|---|
| Mac | every page change: the page fades in from 6 pt below in 220 ms (`routeEnter`); the page left vanishes at once; one task to the next replays the whole page, bar and rail included | VERIFIED, `chrome.go` before this change |
| Mac | the places control: the knob jumps from one slot to the next | VERIFIED |
| Mac | the rail and the workbench slide their widths (260 ms) | VERIFIED, `onhandrail.go` |
| Web phone | conversation ↔ On hand ↔ task: an instant swap, scroll to top | VERIFIED, `app.ts applyRoute` |
| Web wide | beside ↔ whole screen: a 320 ms view transition (`level`, `conv`, D184) | VERIFIED |
| Web | sheets rise on the spring (360 ms) and vanish at once on close; no drag to close; Settings' pages push in, the list comes back with the same push | VERIFIED |

The author's "楞" is accurate: a page that appears without a source or a direction tells you
nothing about where you went, and a page that vanishes reads as a cut.

## How native navigation moves (recalled conventions, INFERRED unless marked)

- **iOS push / pop.** The new screen slides in from the trailing edge over the old one, which
  moves a third of the way back and dims; the navigation bar stays, its title cross-fading. About
  350 ms on a decelerating curve; back is the reverse with the old screen on top. The edge swipe
  drives the same motion interactively, finishing past about a third of the width or on a flick.
  (INFERRED from long use; UIKit's exact curve is private.)
- **iOS sheets** spring up from the bottom and follow a downward drag from their grabber or a
  scrolled-to-top content, closing past a threshold or on velocity, otherwise springing home.
- **iOS zoom / matched transitions** (iOS 18's zoom navigation, SwiftUI's
  `matchedGeometryEffect`): the tapped cell grows into the destination and shrinks back into its
  place on the way back. This is the strongest "where did I go" signal there is.
- **Android (Material motion).** Forward is a shared-axis X (the new screen in from the trailing
  side by about 30 dp with a fade, the old out the other way with a fade) or a container
  transform (a card grows into the screen). Durations about 300 ms in, a little less out; the
  system's predictive back previews the destination under a shrinking current screen.
- **macOS.** Toned down: pages mostly cross-fade, or slide a short way in a split view's detail
  column; the toolbar stays put and its items cross-fade; sheets drop in quickly. Long slides
  read as "mobile on a desktop". Reduce Motion turns movement into cross-fades (Apple's
  guidelines; MyGo follows them, below: DOCUMENTED, `transitions.md` "When nothing moves").
- **Durations.** Every platform keeps navigation at about 250–400 ms; past 400 the person waits
  for the animation; under 200 it reads as a jump. The page left should go faster than the page
  coming, or stay opaque under it: two half-transparent pages read as a wash.

## What MyGo v0.8.3 offers (VERIFIED, docs and source in the module cache)

- `Element.Transition(ui.ElementTransition{...})`: `Enter` / `Exit` motions (X, Y, percent,
  `Opacity`, `Scale`, `Rotate`, `Blur`, `Collapse`), `Duration`/`Ease` or a spring `Animation`,
  `ExitDuration`/`ExitEase`, `AfterExits`, and which properties animate (`Position`, `Size`,
  `Colors`, `Shadows`). An `Enter` plays only in a parent the frame before showed; an `Exit` plays
  on a copy of the element as the last frame showed it, under its siblings.
- `ChildExit(ui.Motion)`: the exit decided as the element goes (a step forward vs. back).
- **Shared elements:** `Match` (an identity of your own type) moves an element appearing from
  where one with the same identity was the frame before, even from another parent; `Fly` draws it
  over the window on the way and cross-fades it with the one it came from (MyGo's gallery example
  "Magic Move": `tileFlight = ui.ElementTransition{Animation: &tileSpring, Fly: true}`). One
  element holds a Match at a time.
- `AnimatePose(ui.Pose, ui.Animation)`: translate, scale, rotate, fade **at paint only**, no view
  rebuild; a pose starts where first posed, so an entrance poses off in one build and at rest in
  the next (`c.Invalidate()`).
- Springs by perceived `Duration` and `Bounce` (`ui.Smooth`, `Snappy` 0.15, `Bouncy` 0.3), solved
  exactly, keeping velocity when retargeted; `Animation.Delay` for staggering.
- `Draggable` with velocity-aware settling; `Router.Transition` (`TransitionMatch`) for routed
  pages (Ducter has its own routes, so not used).
- Painter animation: `p.AnimationFrame()`, `p.AnimationFrameRate(fps)`, `p.After(d)`; frames are
  drawn only while something moves; `Animate`/`AnimateWith` jump under reduced motion, custom
  motion must check `Preferences().ReduceMotion` itself (DOCUMENTED, mygo.run drawing page).
- Testing: `ui.NewTester`, `tt.Advance(d)` runs the frames due, `tt.Image()` snapshots.

Two findings from building on it (VERIFIED by frames):
1. A spring from rest starts slowly, so a page's **opacity** on a spring is still mostly
   transparent after 50–100 ms; with the page left fading too, the window washes out. Fix: the
   fade on a quick ease-out curve (`EnterDur`), the movement on the spring (a pose), and the page
   left kept opaque under the new one while it recedes.
2. A click is handled and the next page built **in the same frame**, so a `Match` set only on
   the clicked row never existed in a painted frame. The row must hold its Match while hovered or
   focused, the frame before the click.

## The web side (VERIFIED in headless Chrome; DOCUMENTED where marked)

- `document.startViewTransition` snapshots the old and new DOM; `view-transition-name` pairs
  elements across the change (the hero, the bar); `::view-transition-old/new(name)` take any
  keyframes, transform and opacity only, composited. Names must be unique at capture, or the
  transition is skipped (DOCUMENTED, the spec); so a name is given only when exactly one element
  matches.
- WebKit holds frames inside the update callback (D209, already handled in `app.ts morph`).
- `PopStateEvent.hasUAVisualTransition` says the browser already drew its own back animation
  (Safari's edge swipe, Chrome's predictive back): play nothing then (DOCUMENTED, MDN).
- Safari in a tab owns the left-edge swipe; an installed page and the app's web view do not, so
  Ducter's own edge swipe runs only there (and in any non-iOS browser that lets the touch through).

## Personality without slowing anyone down (INFERRED, checked against D36 and D77)

- **Overshoot sparingly:** only on things that are objects (the knob, the card growing into the
  head, the face), never on a page of text: a page that bounces makes its words wobble.
- **The character reacts, the chrome doesn't:** the partner glancing round as you come back is
  emotional value; status never animates (D77 holds).
- **Stagger only the first paint**, a few rows, 22 ms apart: the list feels assembled for you,
  but a live update never replays it.
- **Never wait on motion:** every move is interruptible (springs retarget; the page is in place
  for input from the first frame, only painted moving), and under reduced motion it is a fade or
  nothing.

## Candidates for "opening a task" (the metaphor bar, short form; no raters)

| Candidate | Maps | False implication | Legible without labels | Fit |
|---|---|---|---|---|
| No metaphor: cross-fade | a new page | none, and no "where" | medium | calm, empty |
| Push (slide from the trailing edge) | a level deeper | a stack you must pop through (true: Esc/back go up one) | high on phones | native, neutral |
| **The card grows into the page (hero)** | this card *is* that task, opened | the row is gone (no: it is back on return) | highest | warm, "the thing itself" |
| Zoom from the centre | deeper | a different object than the card tapped | medium | generic |
| Unfold / flip | the card's back side | a card has two faces, details hidden behind | low | playful, wrong |

Chosen: the hero on top of a quiet push (phone) or short slide (Mac, the pane): what you touched
becomes the page; the push gives the direction where the card isn't on screen (opened from a
notification, ⌘⇧], a chip).

## Implications for Ducter

1. One vocabulary, two clients, the same numbers (tokens): **push** (deeper / back), **across**
   (a place beside, one task to the next, a settings page), **hero** (card ↔ head), **leave**,
   **stagger**, **look** (the partner). Mac `theme.Nav`; web `--t-push`, `--t-across`, `--t-hero`,
   `--t-leave`, `--t-stagger`, `--t-look`, `--ease-push`, `--spring-soft`, `--nav-*`.
2. **Mac (toned down):** pages slide 28 pt (deeper) / 10 pt (recede) with a quick fade, the bar
   held still against the page's pose, the knob sliding, the hero flying, rows staggering, the
   face glancing round; under Reduce Motion fades only (MyGo's own rule).
3. **Phone web (native):** a full push with the old page receding a third, the bar held, the hero
   flying, sheets that close back down and follow the finger, an edge swipe where the browser has
   none, the browser's own back left alone (`hasUAVisualTransition`).
4. **Wide web:** only the pane's page moves, as on the Mac.
5. Measured, test renderer at 1400×900 (CPU raster, the machine shared with other runs): in-flight
   frames mean 6–11.5 ms (still baseline 4.5–7.5 ms), p95 13–25 ms (baseline 9–23 ms); headless
   Chrome phone and wide: every move's rAF intervals p95 16.7 ms, at most one frame over 20 ms per
   move. Real-device checks (iPhone app, Safari 18, a Pixel) are in `design/todo.md`.

**Summary.** Native navigation says *where you went*: a push with a direction, a card that grows
into its page, a bar that stays, a sheet that goes back down the way it came. Ducter had a 6-pt
fade for everything. MyGo 0.8.3 has what a native feel needs (transitions with exits decided as
they go, shared elements that fly, paint-only poses, exact springs); the web has view transitions.
D290 builds one small vocabulary on both, tuned from frame sequences: quick fades with springy
movement, the page left opaque under the new one, overshoot only on objects, and the partner's
glance as the one bit of character.
