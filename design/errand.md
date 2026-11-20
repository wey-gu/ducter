# 跑腿到付款 / An errand to the checkout (D436)

"帮我订下周五去杭州的高铁", "帮我把购物车里那三样买了": one task does the legwork on the computer where
the person is signed in, in one window Ducter keeps, and stops at the checkout with one card,
**去付款 / Go to checkout**. The person pays with their own tap. Decided in D436; evidence in
[research/185](../research/185-errand-to-checkout.md) (and research/162 #2, research/184 #1). It
reuses Ducter's own browser ([system.md](system.md) "On a server: Ducter's own browser"), the live
view and turns (D151, D190), fill by reference and the Pay card ([autofill.md](autofill.md), D191),
where a task runs ([where.md](where.md), D157) and Done for you ([did.md](did.md), D300). Apps on
the Mac are [computer-use.md](computer-use.md); this note is web errands only.

## 1. Who, what they feel, how it starts

| | The consumer | The heavy developer | The fresh user |
|---|---|---|---|
| **Moment** | evening, on the phone: "帮我订下周五去杭州的高铁，早上的，二等座" | between two reviews: "把购物车里那三样买了" | the first time they ask it to buy anything |
| **Before** | "it can find a train, then I do the booking myself anyway" (on 11-18 the author booked the trip himself after four tasks and four requests for screenshots) | "will it pay on its own? did it lose the browser again?" | "I'd never let an AI near my card" |
| **After** | one card: the train, the seat, ¥73, on 12306's checkout, a picture of the page; one tap opens it and they pay | the cart checked out to the last page, his card never touched by it; a line in Done for you | it did everything except the one thing they'd want to do themselves |
| **First time** | the ack says where it will stop: "我去订，到付款那步停下给你。" | the same; a site not signed in yet: one sign-in card, once | the same; the card says in its first line that Ducter never presses pay |

North star: **好用** one ask, one card, one tap to pay; **顺滑** the same window from search to pay, a
sign-in or a code handed over in place and carried on after; **赏心悦目** a receipt-like card with the
page's own picture; **放心** Ducter can't press pay (code, not a promise), the merchant is read from the
page, every order is in Done for you; **惊喜** the seat and the time already as they like them.

## 2. The flow

1. **The ask.** The partner opens **one** browser task with `needs.buy` (and `signedIn` + `site` when
   it is their cart or their account), kind errand. The brief carries the person's words, what it
   knows of their preferences (rules, Mem: "二等座靠窗", "顺丰", a budget), the saved handles it may
   fill (D191), and the stop. The ack is one line that says where it stops; never that it will pay.
2. **Where.** `needs.buy` puts the task on **Ducter's own browser** on the computer D157 picks: the one
   whose Ducter browser is signed in to the site, else the best other with **需要你登录一下** once. Never
   the person's own Chrome through an extension: that window is not Ducter's to keep (it dropped on
   11-18), to hand over, or to gate. A worker Mac's Ducter browser is driven over its socket (D157).
3. **The legwork.** Search, compare, pick by the brief's preferences; fill the details by handle. A
   choice the preferences don't settle (two trains equally good, a size) is **one** question with
   the choices and its pick as the default (reversible: nothing is bought until the person pays).
4. **A step that's theirs, mid-way.** A sign-in: the sign-in card (D151). A CAPTCHA, a slider, a
   code by text message, a page asking them to confirm it's them: **{site} 这一步要你来 / Your step
   on {site}** with the step in its words, **去处理 / Do it** opening the same tab live in the
   person's turn, **好了 / Done** handing it back. The task is blind meanwhile and is told when it's
   theirs again (D190).
5. **The stop.** On the checkout page, with the total shown, the task calls `browser_at_checkout`
   and ends its turn. One card (§3). The task never presses pay: code refuses it (§4).
6. **The person pays.** **去付款 / Go to checkout** opens the same tab live, the person's turn, on
   the device they tapped from (phone, web, Mac). They pay as they would themselves: their card, a
   wallet, a QR code, 3-D Secure. **付好了 / I've paid** answers the card; **还没付 / Not yet** closes the
   view and leaves the card open.
7. **After.** The task reads the page and reports done with what the site confirmed (the order
   number, when, the total). Done for you lists it (§5). **先不买 / Not now** on the card: the task
   reports in one line that it stopped at the checkout and the cart is kept, and is done.

With a saved card **and** the person's words to pay with it ("用我的招行卡付"), D191's Pay card stays
the way: Ducter fills the card after the person's Go and code. Everything else stops at 去付款.

## 3. The card

Receipt-like, in the conversation, On hand and a push (it needs the person; no default, ever):

- title **到 {site} 的付款这一步了 / Ready to pay on {site}**
- rows **买什么 / What** (the task's few words: "G7311 上海虹桥→杭州东 11-28 08:05 二等座") with the items
  under it when the task listed them (at most 5, then **还有 {n} 样 / {n} more**), **一共 / Total**
  (`CNY 73.00`, as the page shows it), **在哪 / Where** (the site, read by code). Which computer is on
  the task, as for any browser task (D157); the card doesn't repeat it.
- the page's picture, taken by code when it stopped (filled fields drawn as dots); a tap opens the
  page live, as 去付款 does
- the line **Ducter 不会替你点付款，付款这一下是你自己的。/ Ducter never presses pay. That tap is yours.**
- **先不买 / Not now** · **去付款 / Go to checkout**
- answered **你付好了 / You paid** · **先不买了 / Not buying now**

The live view for it is the sign-in's (the page's host on top, **它现在看不见这个浏览器**), named for
assistive tech **在 {site} 付款 / Paying on {site}**, with the band **轮到你付款了。它看不见这个页面，也不会
替你点。/ Your turn to pay. It can't see this page and won't press anything.** and the buttons **还没付 /
Not yet** (closes the view, the card stays open) and **付好了 / I've paid**.


## 4. The floor, in code

- Every browser tool on Ducter's browser refuses a press that pays or places an order: a click on a
  button or link whose words say so (**支付, 付款, 立即支付, 确认支付, 提交订单, 确认下单, 立即购买, 去支付**,
  "pay", "place order", "complete purchase", "buy now", "confirm and pay", "submit order"), Enter or
  Space while one is focused, and a `submit` into a form whose submit button says so. Allowed only
  while a D191 Pay Go is open for that task on that page's site.
- The answer tells the task to call `browser_at_checkout`. "去结算 / Checkout" and "加入购物车 / Add to
  cart" are not pays; they open the next page.
- `browser_at_checkout` needs a secure page (https, or this machine's own for tests); the merchant is
  the page's host, never the task's word.
- 付好了 is the person's word, not something the task saw: the task reads the page before it says
  the order went through, and says plainly when the page shows it didn't.

## 5. Done for you

**付款 / Paid**, sub checkout: **在 {to} 下了单 / Ordered on {to}**, the amount as the checkout showed
it when it stopped, the card's **买什么** as its line, the go **你自己付的 {time} / You paid yourself
at {time}**, where (Ducter's browser on {device}), the task. Recorded from the card's **付好了**; a
card answered **先不买** records nothing.

## 6. What's built (2026-11-21)

Built on core, the runner's brief, the partner (needs.buy, rule 9), the web client and the Mac app;
checked with a fixture shop in a real headless Chrome for Testing
(`packages/core/test/errand-chrome.test.ts`), unit tests with fakes, the partner eval and shots
(`.shots/errand-checkout/`). Owed (`todo.md`): one real site end to end, read-only to the pay page; a
worker Mac's Ducter browser over a real socket; a real phone paying in the live view; the
Codex-in-Chrome and Claude-in-Chrome paths for a person who wants their own Chrome (not offered).
