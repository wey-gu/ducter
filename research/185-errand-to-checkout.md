# 185 · One errand to the checkout: what exists, what broke, what the fixture shows

Date: 2026-11-21, on main at `b054bae8`. Feeds D436 (`design/errand.md`). Follows research/184 #1
and research/162 #2. Read: `design/{computer-use,autofill,did,where,system}.md`, the browser code
(`packages/core/src/browser/`, `packages/core/src/saved/fill.ts`, `packages/runner/src/browser.ts`),
research/162's evidence from hel (read then, not again), and the private notes on the reference app
(research/162 private). Run: a fixture shop on 127.0.0.1 driven through the real core's browser tools
in a headless Chrome for Testing (`packages/core/test/errand-chrome.test.ts`). No real shop was
visited, no real sign-in or card was used.

Tags: **VERIFIED** = read in Ducter's code or tests at this commit, or run here; **DOCUMENTED** = an
outside product's own docs; **INFERRED** = judgment.

## 1. What broke on 11-18 (VERIFIED, research/162 §1, hel's Log)

The author asked, from the phone: "可以帮我订好机票和酒店，我可以自己接着做付款的步骤". Four tasks for one
trip. The booking task ran in his own Chrome on the MacBook through the browser extension; the
extension's connection dropped ("浏览器连接不可用"), the task fell back to a Chromium not signed in,
the partner asked him four times for screenshots of the Ctrip page, and he booked it himself
("FYI 我自己定了"). None reached a pay page.

Three separate failures: (a) **the window was not Ducter's to keep**: an extension bridge into the
person's Chrome can drop at any moment and nothing on the home can re-attach it; (b) **no one place
for the whole errand**: each break became a new task; (c) **no stop**: nothing in the design said
"this is where it stops, and this is what you tap".

## 2. What already exists (VERIFIED in code)

| Piece | Where | What it gives the errand |
|---|---|---|
| Ducter's own browser on any computer, the home's or a worker's | `browser/host.ts`, `browser/remote.ts` (D151, D157) | a window Ducter holds over CDP: nothing to disconnect; a worker's Chrome is driven over the worker's own socket |
| Sign-in card and the live view, the person's turn | `browser_ask_sign_in`, `browser/live.ts` (D151, D190) | the same tab, live, on the phone, the web and the Mac; the task is blind while it is the person's turn and is told when it's handed back |
| Fill by reference | `saved/fill.ts` (D191) | name, phone, passport, address into the form without the model seeing them |
| The Pay card | `browser_ask_to_pay` (D191) | Ducter pays with a saved card after Go + the security code; nothing else may pay |
| Signed-in sites per computer, ranked | `candidates.ts` `fit` (D157) | the computer whose Ducter browser is already signed in to the site wins |
| Done for you | `did.ts` (D300) | paid items read from decisions |

What does **not** exist: a stop at the checkout that leaves the paying to the person; a hand-over
for a step that isn't a sign-in (a CAPTCHA, a code by text, a slider); and, the one gap in the floor,
**no code stops a task from pressing a pay button**. The brief says "never pay, except a payment the
user said Go to"; `browser_click` clicks whatever it's given (VERIFIED: `tools.ts` before this
change, and the D191 test clicks "Pay ¥38,400" after the Go, with nothing checking that the Go
exists). A task that ignores its brief could pay with a card the site already remembers.

## 3. The reference (DOCUMENTED, research/162 private notes)

An open agent app hands a step to the owner in the window the agent drives: on the computer, a bar
over the page's field; on the phone, "open remote desktop", a single-window live picture. The value
never passes the model; it is generic, with no per-site adaptation. Ducter's live view is already
the phone half of this, for its own browser. What the app does not have, as far as its docs say: a
stop at the pay page as a first-class card, or a record of what was bought.

## 4. The fixture run (VERIFIED, here)

A small shop served by `Bun.serve` (search, a product, a cart of three, a checkout with the
person's details and a **Pay** button that records any press), driven by the task's own browser
tools in a real headless Chrome for Testing:

- search → product → add to cart, three times (a cable, coffee beans, notebooks) → cart (¥154.70)
  → 去结算; each read showed the page's own text only.
- the shop's "请先完成安全验证" page went to the person as a step (`browser_ask_sign_in` with `step`):
  the same tab, live; the task was blind meanwhile (its read refused); the person's own click in the
  view passed it; **好了** answered the card and the tab was on the checkout.
- name and phone filled by handle; neither value reached anything the task was told.
- `browser_click` on **立即支付 ¥154.70** was refused by code (no Pay Go open), as were Enter on the
  focused pay button and `browser_type … submit` from a field of the form whose only submit pays;
  the shop saw no press. D191's own test (pay with a saved card after Go) still clicks its Pay
  button: the gate lets a press through only while that Go is open on that site.
- `browser_at_checkout` put one card: the page's host read by code, the total and currency, the
  three items, a JPEG of the page; no default, not reversible, the task on 等你 / Needs you.
- the live view opened the same tab in the person's turn; their own click reached the shop with the
  buyer's details; **付好了** answered the card; the task's read showed the order number; Done for
  you listed **付款 · checkout** to 127.0.0.1, CNY 154.70, go **你自己付的**.


Not run: a real site, a worker Mac's Ducter browser over a real socket (the remote host is covered
by its own tests with a fake link), a real phone's live view.

## Implications for Ducter

1. An errand that buys or books runs in **Ducter's own browser** on the computer it picks, never the
   person's Chrome through an extension: the window must be one the home holds, can hand over, and
   can gate (fixes 1a).
2. **One task for the whole errand**, its window kept; a mid-way need is a card on that task that
   opens that same window live, and the task carries on after (fixes 1b).
3. **The stop is a card, 去付款 / Go to checkout**: what, how much, where, a picture of the page; its
   button opens the page live for the person's own tap. Ducter never presses pay (fixes 1c).
4. **The floor in code**: a press that pays or places an order is refused unless a D191 Pay Go is
   open for that task on that site. The brief alone was not enough.
5. The live proof on one real site, read-only up to the pay page, is owed (`design/todo.md`).

**Summary.** The 11-18 trip failed on a window Ducter didn't hold, on a split errand and on a
missing stop. Every piece except the stop and the pay gate already existed. D436 adds one card
(去付款 / Go to checkout), a hand-over for any step that's the person's, a code gate on pay buttons, a
`buy` need that puts the errand on Ducter's own browser, and a Done for you line for what the person
paid themselves. Checked on a fixture shop in a real headless Chrome; the real site is owed.
