# 83 · The conversation as a messaging app: copy, keeping your place, and the rest

2026-11-13. The author: "发现聊天界面 手机和 app 都不够好：用户不能 copy 消息，不能发现有新消息顺滑到最新，等等。
这里只是我的一般感受，不全面，你能第一性原理拉满这里体验么". Feeds D254.

Surfaces: the Mac app (`apps/desktop`, Go on MyGo 0.8.3: `views/conversation.go`, `bubbles.go`,
`reply.go`), and the web client (`apps/web`), which is also the iPhone app (WKWebView,
`apps/ios/Ducter/WebShell.swift`), the Android app (WebView) and any browser, narrow or wide.

Tags: **VERIFIED** read in the code at `0b03d748` or seen in a screenshot (`.shots/conversation-ux/`);
**DOCUMENTED** from the apps' public behaviour; **INFERRED** reasoning, not measured.

## 1. First principles

A conversation with one partner is the one place the person *reads* Ducter. Three jobs follow,
in order of how often they happen:

1. **Know where you are.** The newest thing is where your eye goes; anything that arrives is
   noticed without being chased; anything you are reading stays still under your eye. Every
   messaging app converges on the same four mechanics: follow the end while you are at it, stay put
   when you scroll up, tell you (with a count) that something came, and take you back in one tap.
2. **Take words out.** A partner that writes commands, numbers, addresses and links is only useful
   if those words can leave the conversation: the whole message, a code block, a link, a part.
3. **Never lose your own words.** A draft survives the app being closed; a message that didn't
   go says so with a way to retry.

Everything else (search, edit, reactions, read ticks) is weighed against *one partner, not a group*:
group features that fix "who said what among many" have no job here.

## 2. Best practice (DOCUMENTED, from the apps as shipped in 2026)

| | iMessage | Telegram | Slack | ChatGPT / Claude apps | Adopt for Ducter? |
|---|---|---|---|---|---|
| Follow the end, stay put when up | yes | yes | yes | yes (streaming) | **Yes** (both surfaces) |
| "New messages" affordance | none (jumps) | round ↓ with unread count | "N new messages" bar | round ↓ | **Yes**: a round pebble ↓, growing to "3 条新消息" |
| Lands on first unread when opening | no | yes (scrolls to "Unread messages") | yes (red "New" line) | n/a | **Yes**, only when what is new is taller than the screen |
| Unread divider | no | "Unread messages" bar | red "New" line | no | **Yes**: a quiet accent line "新消息 / New messages" |
| Jump to latest after sending | yes | yes | yes | yes | **Yes** |
| Copy a message | long press → Copy | long press → Copy | hover menu → Copy | Copy button under each answer | **Yes**: long press / right click → 拷贝 |
| Copy a code block | n/a | tap code to copy | copy button | copy button per block | **Yes**: a quiet 拷贝 on each block |
| Copy a link | long press link | long press link | right click | long press | **Yes** (phone menu gets 拷贝链接) |
| Select part on phone | iOS 17+: "Select" | "Select text" | long press then select | "Select Text" sheet | **Yes**: 选择文字 sheet |
| Timestamps on demand | swipe left | tap/hover | hover | none | **Yes, cheaply**: the long-press/right-click menu's first line |
| Reply / quote | swipe right | swipe left | thread | none | Exists (D236); its menu and swipe stay |
| Edit last with ↑ | 15 min edit | edit | ↑ edits | edit-and-branch | **No**: the partner already acted on it; the Log is append-only (principles). Say a correction instead. |
| Read ticks | Delivered/Read | ✓✓ | none | none | **No**: one partner reads at once; its Presence says it is working (D104). |
| Search in the conversation | yes | yes | yes | yes (history) | **Later** (todo): Mem already recalls; a find bar is a real gap on long conversations. |
| Drafts kept | yes | yes (synced) | yes (synced) | yes | **Yes** (per device) |
| Haptics | yes | yes | light | yes | Yes (light tap on the menu, the pebble, a copy) |
| Reduced motion | yes | yes | yes | yes | Yes (no glide, no settle) |

## 3. The audit (before D254)

| # | What a person expects | Mac app | Phone web (iOS/Android apps) | Wide web | Evidence |
|---|---|---|---|---|---|
| A1 | Copy a whole message | User bubble: right click → 复制 ✓. Partner's Markdown bubble: only MyGo's own menu (Copy needs a selection, plus English "Copy as Markdown"); **no Reply, no whole-message Copy** | Long press → 回复 · 复制, but `navigator.clipboard?.writeText` **does nothing over plain http** (the home on a LAN, `http://192.168…`) and said nothing: **Copy silently failed** | Same menu; same silent failure over http | VERIFIED `reply.tsx` (before), `bubbles.go`, MyGo `markdown/view.go:263` |
| A2 | What Copy copies | the raw text ✓ | `textContent` of the rendered bubble: **paragraphs run together**, list items joined without breaks | same | VERIFIED `reply.tsx textOf` |
| A3 | Copy a code block | Ducter's 拷贝 (D242) ✓ | **none** | none | VERIFIED `markdown.ts`, `fileview.go codeBlock` |
| A4 | Copy a link | right click on the link (MyGo link menu) ✓ | **none**: links were excluded from the long press; WKWebView's own callout is off (`allowsLinkPreview = false`) | the browser's menu ✓ | VERIFIED `WebShell.swift:44`, `reply.tsx` |
| A5 | Select part of a message | ✓ (selectable text) | **fragile**: iOS's text selection and Ducter's 480 ms long press race; whichever wins | ✓ browser selection; 回复这段 (D236) | INFERRED from the two handlers; no `user-select` rule in the bubbles |
| A6 | Stay pinned at the end | ✓ MyGo `FollowEnd` + `FollowAnimation: Smooth` (growth and new rows) | **partly**: pinned only on a re-render; a picture that loads, a card that grows, the keyboard opening **leave the end behind** | same | VERIFIED `conversation.go:130`, `views.tsx useLayoutEffect` (before) |
| A7 | Something new while scrolled up | **nothing**: the list stays, no sign | **nothing** | nothing | VERIFIED: no affordance in either |
| A8 | Back to the latest | scroll by hand; no shortcut | scroll by hand | scroll by hand | VERIFIED (the opened task has 回到最新, D210; the conversation didn't) |
| A9 | Opening after being away | lands at the end; long news is entered from its bottom | same | same | VERIFIED |
| A10 | Unread divider | "你不在的时候 · 10:40" for the living message only (D104) | same | same | VERIFIED `quiet.go:426`, `views.tsx` |
| A11 | Jump to latest after sending | ✓ `Send → ScrollToEnd` | **no**: a reader scrolled up who sends stays up | no | VERIFIED `app.go:620`, `app.ts sendMessage` |
| A12 | Place kept across panes | ✓ (`ListState` lives on `App`) | **no**: the phone shows one pane; back from a task the conversation remounts at the end | ✓ (both panes mounted) | VERIFIED |
| A13 | What counts as read | after 2.5 s in front, **even scrolled up** with the news off screen | same | same | VERIFIED `readWhenSeen`, `scheduleRead` |
| A14 | Draft kept | in memory ✓ (the app runs on) | **lost** when iOS lets the web view go in the background | lost on reload | VERIFIED `app.ts draft = ""` |
| A15 | Failed send | pictures: 没发出去 · 重试 (D206) ✓; text waits greyed and goes again on reconnect (deduped by clientId) ✓ | same ✓ | same ✓ | VERIFIED |
| A16 | Timestamps on demand | 15-minute time lines only | same | same | VERIFIED |
| A17 | Reply discoverable | swipe/hover/long press/right click (D236) ✓; partner Markdown bubbles had **no** right-click Reply | ✓ | ✓ hover | VERIFIED |
| A18 | Keyboard | ⌘K to the composer; no ⌘↓ | n/a | no End / ⌘↓ | VERIFIED `app.go` shortcuts |
| A19 | Accessibility | rows are MyGo text (VoiceOver reads); round buttons labelled | the scroller is a plain `<main>` (no `role="log"`); the menu items are labelled; font sizes in px (Dynamic Type not followed) | same | VERIFIED; Dynamic Type INFERRED from px sizes |
| A20 | Search in the conversation | none | none | none | VERIFIED |
| A21 | The stylesheet | n/a | **every rule after line 7990 of `app.css` was dead**: D248's merge dropped one `}` (`.screens-both .both-row`), nesting D248's own styles and everything later inside it | same | VERIFIED (brace count 2135/2134; D254's own styles didn't apply until fixed) |

## 4. Ranked gaps

1. **Copy that works and copies the right thing** (A1–A4): the author's first complaint, and on the
   phone over http it was a silent failure. Highest value, smallest change.
2. **The way back with a count** (A7, A8, A11): news while you read history is invisible today.
3. **Pinned means pinned** (A6): pictures and cards nudging the end away read as jank.
4. **Open where the news starts** (A9, A10) and **read means seen** (A13).
5. **Place across panes on the phone** (A12), **drafts kept** (A14).
6. Later: search (A20), Dynamic Type (A19), time on hover on the Mac (A16).

## 5. Motion and look (the clay bar)

The way back is a **pebble**, not a pill: the Surface clay of the secondary button (inset highlight,
rim, seam, the 3 pt ledge) with the floating shadow, a slightly uneven radius, the arrow drawn in the
accent. Round (40 pt) with no news; with news it widens to "↓ 3 条新消息" in the ink. It settles in
on the spring (rises 14 pt from 0.86 scale, overshoots once), a new count eases up 3 pt. Reduced
motion: it is simply there. The divider is the time lines' voice (12 pt, centred) in the accent with
hairlines either side: noticed, never loud. Shots: `chromium-{light,dark}-{zh,en}-*.png` (390 px,
iPhone UA) and `mac-{zh,en}-*.png` in `.shots/conversation-ux/`.

## Implications for Ducter

- Build the four mechanics on both surfaces with one set of rules (`apps/web/src/follow.ts`,
  `apps/desktop/internal/views/follow.go`), tested as pure functions.
- Copy goes through a fallback that works without a secure context, copies the message's *source*
  (styling marks out, code and links kept), and says when it fails; code blocks carry their own Copy.
- On a touch screen, Ducter's long press owns the gesture (the bubbles opt out of the system's
  selection) and **选择文字 / Select text** restores picking a part.
- Do not adopt edit-last, read ticks, or reactions. Search waits (todo) with a trigger.

## Summary

The conversation had none of the "where am I" mechanics outside the Mac's own follow-the-end, and Copy on the
phone failed silently over http, copied paragraphs run together, and had no code or link copy. D254
builds: Copy that works (with a fallback and a failure line), code-block Copy, Copy link, Select text,
the pebble way back with a count, robust pinning, the New messages divider and the landing on it,
jump-to-latest after sending and ⌘↓, read-when-seen, the place kept across panes, and drafts kept. It
also fixes a stylesheet brace that had silently disabled every web style after D248's.
