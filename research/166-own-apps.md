# 166 · Your own small apps: what others do, what the author already does, and what this codebase allows

Date: 2026-11-20, on main at `22951b22` (0.0.96). Feeds D405 (`design/apps.md`). Closes the research
half of research/162 gap #5 ("Nothing he makes with it stays as his own small app").

Tags: **VERIFIED** = read in Ducter's code at this commit, in hel's Log (read only), or run here;
**DOCUMENTED** = an outside product's own public docs; **REPORTED** = third-party or user reports;
**INFERRED** = judgment. Outside products are named only in `research/private/166-refs.md`
(gitignored); here they are "a chat assistant's artifacts", "a chatbot's apps platform", "an open
protocol for UI in tool results", "a consumer canvas", "a dev-studio builder", "a Q&A aggregator's
canvas apps".

## 1. The promise and the gap

`motivation.md`: "You can make your own apps: small GUI apps built from code or generative UI, with
agentic AI inside when they need it, as if by magic." Before D405 the closest things were D303's rich
blocks (a table, chart, checklist or choices in a reply), D381's pins (one kept current at the top) and
D383's Made for you (found again). None is an app: no input of the person's own, no state but a
checklist's ticks, no way for the thing to ask the partner. (VERIFIED, `packages/protocol/src/{rich,pins,made}.ts`.)

## 2. What the author already does (hel, read only)

Method: `ssh hel "python3 -I -"` with `sqlite3.connect('file:/root/.ducter/ducter.db?mode=ro', uri=True)`;
`ls` of `/root/.ducter`; key names only of its JSON files. 29,407 events from 2026-11-09 18:07Z to
2026-11-19 15:37Z: 86 of his messages, 177 partner messages, 418 task reports, 32 tasks. (VERIFIED)

- **He never asked for an app, a page, a dashboard or a tracker in words** (0 of 86 messages). The
  closest words: "复盘信息的 url", "服务器 file path 有么", "在同一个 md report 上更新". (VERIFIED)
- **A dashboard re-made as prose:** one standing review routine (`swj3zc4w`, brief "每 45 分钟查看一轮")
  wrote 309 reports in four days (78, 96, 91, 44 a day), each the same shape: pending PRs, each one's
  state, CI passing/running, conflicts ("7 项正式审查请求和 8 项提及，共 10 个待跟进 PR"). He followed up
  four times on 11-19. (VERIFIED counts; "a board he'd keep open" is INFERRED)
- **A living document:** seven asks over two days to write findings into "the same .md report" for the
  developers, updated in place (19 reports mention a `.md`). (VERIFIED)
- **The trip:** on 11-18, nine messages and four tasks for Beijing, including "给我一个 cost 总结哈"; the
  task never produced the total and he booked it himself. (VERIFIED) A small trip-cost sheet he could
  fill and reopen is the clearest consumer-shaped app in his week. (INFERRED)
- **"What's on":** five asks on five days ("我最近有什么重要的事儿在邮件里么", "我今天都有什么安排？"…). (VERIFIED)
- **Rich blocks were never used on hel:** 0 `ui` blocks in 177 partner messages, including the 68
  after D303 reached hel (≥ 0.0.74); comparisons that fit a table went out as prose. **No pins**
  (`pins.json` absent; D381 reached hel only at 11-19 01:07). **No HTML, CSV or PDF made for him**; the
  only `.html` files are CI pages a task downloaded for itself. (VERIFIED)
- **Clients:** 43 messages from the Mac app, 41 from the web/phone, 2 through iMessage. (VERIFIED by
  clientId prefix)

Reading: the need is real but unspoken: he re-asks for the same shapes (a PR board, a trip sheet, a
living report) and gets prose each time. A first app must start from one sentence, look finished at
once, and be found again without a new place to learn. (INFERRED)

## 3. What reference products do (public docs only)

Full notes with names and URLs in `research/private/166-refs.md`.

| Question | What they do | Tag |
|---|---|---|
| The object | HTML (or React) in a sandboxed iframe on a separate origin; born in a chat, then given a home of its own (a gallery or sidebar list, a stable link, versions) | DOCUMENTED |
| Network | denied by default; code CDNs allowlisted; data fetches forbidden or declared domain by domain and reviewed. The open protocol's default policy: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; object-src 'none'; connect-src 'none'` | DOCUMENTED |
| The bridge | a chat assistant's artifacts: first `complete(prompt) → string` (no history, no images; fragile JSON), later a Messages-style call routed through the host; the chatbot platform: `callTool`, `sendFollowUpMessage`, `setWidgetState`, `openExternal`; the open protocol: JSON-RPC over postMessage (`ui/message`, `ui/update-model-context`, `tools/call`, `sampling/createMessage` "SHOULD rate-limit, control cost, get user approval"); a global injected object was considered and rejected there in favour of JSON-RPC | DOCUMENTED |
| Actions | a destructive tool gets the host's explicit approval; tools that need per-action approval are simply not available to artifacts; "hints don't enforce authorization" | DOCUMENTED |
| Storage | per-user and shared stores (shared confirmed on first write); 100 MB / 25,000 records in one; none at all in the Q&A aggregator (builders write their own server); "not localStorage" in the chatbot platform | DOCUMENTED |
| Editing | talking plus pointing everywhere ("select a region, then ask"); each change a version you can revert; one canvas's model is trained for targeted edits when something is selected and rewrites otherwise | DOCUMENTED |
| Blocked in the frame | alert, confirm, prompt, the clipboard, nested frames, localStorage, modals, service workers | DOCUMENTED |
| Cost | the viewer pays, with first-use consent; owner-pays sharing (the dev-studio builder) produced surprise quota errors | DOCUMENTED, REPORTED |
| Mobile, offline | the weakest point everywhere: shared canvas apps open on desktop web only; persistent storage web and desktop only; nobody documents offline | DOCUMENTED |
| Pitfalls | a string-only bridge; "anyone with the link can edit the data"; a hidden model key breaking apps when models retired; public share links indexed by search engines | DOCUMENTED, REPORTED |

## 4. What this codebase allows (VERIFIED, read and run here)

- **The web page's own policy forbids a `srcdoc` app.** `packages/core/src/web.ts` serves `/app` with
  `script-src 'self'`; a `srcdoc` iframe inherits it, so every inline script in the app is blocked
  (run in headless Chrome against a demo core: the app drew its CSS and no script ran). A frame from the
  home itself under its own header policy works: `GET /app-frame/<token>` with
  `Content-Security-Policy: <the app's policy>; sandbox allow-scripts allow-forms`, and the page's
  `frame-src 'self'`. The `sandbox` directive gives the frame an opaque origin even though its URL is
  the home's own: no cookies, no storage, no reading the page.
- **The Mac app has a web view.** MyGo 0.10 (`WebView`, `PageOptions.Untrusted`, `Protocol.Handle`):
  an untrusted page calls no Go method, opens no window, downloads nothing, navigates to no other
  origin, and reaches custom schemes only through handlers that know which page asked. Ducter's Mac app
  used no web view before this; an app window is a page on `ducter-app://<id>/` served from Go.
- **The phone apps load the web client** (the iPhone and Android shells), so the web's frame is the
  phone's too.
- **Pebble's tokens** (`apps/web/static/app.css`) can be handed to an app as `--d-*` variables for
  light and dark, so a generated app looks like Ducter without the model learning a design system.
- **A partner tool costs every turn:** the tool list sits in every session's cached prefix
  (`tool-budget.test.ts`, research/48 G2); D381 avoided a tool for that reason. An app's file can't
  ride in a message (a 5–30K file in history every turn) the way a D303 block does.
- **Made for you indexes the Log** (`packages/core/src/made.ts`): an `ai_msg` that carries an app card
  can be indexed as one more kind with no new store.

## 5. Naming: LLM proxy raters (haiku, one candidate per call)

`claude -p --model haiku --no-session-persistence` from a scratch folder (the one `~/.claude/projects`
folder it still made was deleted). Stimulus: in a personal AI app the person said "make me a little
thing to track my Beijing business trip expenses"; a card appeared with the candidate word, the name
"北京出差花销 / Beijing trip expenses" and 打开 / Open. Three personas (the heavy developer, the
consumer, the fresh user), two runs each, n = 6 per word. Asked: what opens; would it still be there
next week with your numbers; where you'd look for it next week; would it go online or send things by
itself; is it installed from a store; could you ask the AI from inside it; clarity 1–5; one false
implication. LLM raters only: how a careful naive reader parses a label, not how people feel.

Round 1 (the word alone):

| Word | Kept next week | Online by itself | Store | Ask the AI inside | Clarity | False implication raised |
|---|---|---|---|---|---|---|
| 小应用 | 0 | 0 | 0 | 2 | 3.00 | an installed app that syncs bills by itself |
| 小工具 | 5 | 0 | 0 | 5 | 3.33 | it syncs or fetches records by itself |
| 小程序 | 0 | 0 | 0 | 4 | 3.00 | downloaded from a store (WeChat's sense) |
| 应用 | 0 | 0 | 0 | 5 | 3.33 | installed from a store |
| 页面 | 2 | 0 | 0 | 3 | 3.17 | a web link to share, or a static page |
| 空间 | 4 | 0 | 0 | 5 | 3.00 | a shared team space |
| 小组件 | 1 | 0 | 0 | 3 | 3.00 | a home-screen widget |
| App | 0 | 0 | 0 | 0 | 2.50 | a standalone installed program |
| Mini app | 0 | 0 | 0 | 1 | 2.17 | throwaway |
| Tool | 0 | 0 | 0 | 0 | 2.33 | a generic utility |
| Page | 0 | 0 | 0 | 0 | 2.17 | static text, not a tracker |
| Space | 4 | 0 | 0 | 3 | 2.33 | shared with others |
| Widget | 0 | 0 | 0 | 0 | 2.33 | a home-screen gadget |
| Little app | 0 | 0 | 0 | 0 | 2.33 | standalone, or throwaway |

Every word alone sent raters back to the chat history to find it next week (3–6 of 6 named the
conversation; 0 named Made for you).

Round 2 (the card with its one line under the name: **小柚给你做的，放在「给你做的」里，随时再打开。 /
Made for you by Pebble. It stays in Made for you; open it any time.**):

| Word | Kept next week | Where next week: Made for you | Clarity | False implication raised |
|---|---|---|---|---|
| 小工具 | 5 | 6 | 3.00 | a standalone installed app (3) |
| 小应用 | 3 | 6 | 3.17 | from a store (2); reads or sends spending by itself (1) |
| 空间 | 4 | 6 | 3.00 | a shared or team space (6) |
| App | 4 | 6 | 3.00 | installed from a store (6) |
| Little app | 2 | 6 | 3.00 | disposable, or installed |
| Tool | 1 | 6 | 3.00 | a catalogue utility |
| Space | 2 | 6 | 2.83 | shared with other people (6) |

With the line every rater (42 of 42) said they'd look in Made for you, and none read any word as acting
or going online by itself. The words differ little in clarity (2.83–3.17, n = 6 each: noise-level);
空间 / Space carries a strong false "shared" in every rating. **小工具** read as kept best in Chinese
(5/6), but its pair **Tool** read worst in English (1/6), and the two don't translate as one thing;
**小应用 / App** is a clean pair, the word the motivation and every chat app already use, and its one
false implication (installed from a store) is answered by the card itself (it opens in place, made for
you). Chosen: **小应用 / App**, always with the line. Evidence is thin; a human test is owed.

## 6. Implications for Ducter

1. **An app is one HTML file the partner writes itself** with one new tool (`app`), now, in the
   turn; never a task (a task is minutes and a harness; an app should be seconds). A larger app made
   by a coding task is a later step.
2. **The file lives on the home, not in a message;** the message carries a card (name, version, what
   changed) and Made for you lists it as one more kind (D71: a lens, not a place). The home keeps the
   last ten versions: 改回去 / Undo the change.
3. **The sandbox is the policy plus an opaque origin:** nothing loads from outside the file, no
   network, no storage of its own, no popups, no top navigation, no modals. On the web and the phone:
   a frame from `/app-frame/<token>` (a one-app capability, 30 minutes). On the Mac: an untrusted web
   view on the app's own scheme. The partner is told, and its file is linted, so an app doesn't break
   silently (CDN scripts, fetch, localStorage, alert).
4. **Storage is the home's,** per app, through `ducter.get/set`: the same numbers on the Mac, the web
   and the phone, and the partner can read and fill it.
5. **The bridge is narrow:** `ducter.ask(text) → Promise<string>` puts the app's words in the
   conversation as the person's message *from that app* (they tapped in it), fenced as data for the
   partner; its answer comes back into the app. One at a time, 20 an hour. An app's ask can fill an
   app but never rewrite one, and anything outward still waits for the person's own Go card. No
   `tools/call` from an app, no model call of its own, no network.
6. **Editing is talking:** in the conversation ("加个合计") or in the line under the app; targeted edits
   (find/replace) or a whole new file. Pointing at a region (as every reference does) is later.
7. **Cost:** the person's own partner session answers; nothing is shared yet, so owner-pays and
   viewer-pays don't arise. Sharing is a later decision with its own consent.

**Summary.** The author re-asks for the same shapes (a PR board, a trip sheet, a living report) and gets
prose; rich blocks and pins went unused on hel. References agree on HTML in a sandboxed frame with no
network, a narrow bridge, versioned edits by talking, and a home outside the chat; they are weakest on
mobile. In this codebase the web page's policy rules out `srcdoc`, so the home serves the frame under
its own policy; the Mac gets an untrusted web view. Raters found every name alone sends people back to
the chat; with one literal line under it, all find it in Made for you. Name: 小应用 / App.
