# 165 · The fourth Settings pass: the flows, and the phone (D404)

**Date:** 2026-11-20. **Build:** main at `22951b22` (0.0.96) plus this branch. **Brief (the author):**
"每一个设置页面的打磨和 flow/视觉设计，我们要让人爱不释手，充满情绪价值，无比好用顺滑优雅". The third pass
(D399, research/163) fixed every pane's static layout at the author's real counts. No pass had walked what
happens *after a tap*, or the phone. This one walks each pane's flows end to end and the phone's targets.

## How it was walked

- **Web** (VERIFIED): headless Chrome driven over CDP, one step at a time, against
  `apps/web/demo-settings-real.ts` (the author's real shape on fakes), `demo-bridge.ts` (Nowledge Bridge,
  the `ready` state: another computer receives, 改由这台收 moves it) and `demo-memory.ts` (Mem `sign_in`).
  After every tap the visible words were read at +80 ms, +600 ms and +2.5 s, so a dead moment (nothing
  changes), a silent change, or a state that flickers back shows up as text. Desktop at 1400×813, the
  phone at 390×844 (iPhone UA, touch, `pointer: coarse`).
- **iOS** (VERIFIED for rendering, INFERRED for the keyboard): the iPhone 17 Simulator's Mobile Safari
  on the same demo core (`.shots/settings-pass4/ios`). The simulator can't be tapped from the shell, so
  the keyboard over a sheet was not seen; the fix follows iOS's documented behaviour (no
  `interactive-widget`, the keyboard overlays the layout viewport and `visualViewport` shrinks).
- **Mac** (VERIFIED, test renderer): the same changes are on the Mac; `TestSettingsRealShapeFits` and the
  view tests replay the real shape. The Mac app itself was not driven in this pass.
- **Tap targets:** every control in each Settings page at 390 under `pointer: coarse`, measured with its
  invisible hit margin (`::before`/`::after`), against 44 pt.
- Shots and recordings: `.shots/settings-pass4/{before,after}` (three flows, each a GIF and its stills:
  `web1400-zh-chat-disconnect-reconnect`, `web390-zh-card-add`, `web1400-zh-partner-rename`),
  `.shots/settings-pass4/pages` (every page, 1400 and 390, zh and en, light and dark, with `.geo.txt`),
  `.shots/settings-pass4/reshoot` (Memory and Agent messaging re-shot), `.shots/settings-pass4/walk`
  (the walk's own stills).

## The flows

| # | Pane, flow | Step | What the person met | D36 | Fix |
|---|---|---|---|---|---|
| 1 | Passwords & cards, add a card (phone) | type the expiry | The phone's number pad has no "/" (`inputmode=numeric` on iOS): **0130** turns the field red and **保存** stays grey, with no words. A dead end on the phone | 好用 | **0829**, **829**, **08 29** read as 08/29; four digits shape themselves to **01/30** as typed; the field is red only when four or more characters can't be a date (web `parseExp`/`shapeExp`, Mac `parseExp`) |
| 2 | Passwords & cards, add (web) | tap 添加银行卡 / 添加登录信息 / 添加密钥 | The form opens with nothing focused: one more tap before typing | 顺滑 | The first field takes focus (on the phone the keyboard rises with the form) |
| 3 | Chat apps, disconnect | confirm 断开 Telegram | The card drops back to **还没连上** in silence: did it work, and is our conversation gone? | 放心 | **好，Telegram 断开了。你们的对话还在这里。** under the card (the partner's word, D296) |
| 4 | Chat apps, link | the person sends `/start CODE` | The state line changes from **还差一步** to **在 @bot 等你**, nothing else: the first moment the partner lives in their chat app passes unmarked | 惊喜 | **连上了。以后在 Telegram 里找我也行。** with the pebble's pop (D296's `Said`), once, on the change, never on opening the page; reduced motion: it appears without moving |
| 5 | Chat apps, set up again | step 1 | **/newbot** for someone who made @weys_ducter_bot last week | 好用 | **已经有机器人了？给 BotFather 发 /mybots，选它，再点 API Token，就能拿回它的密钥。** under step 1 |
| 6 | Chat apps, link (no deep link) | the code | **或者在 Telegram 里给它发：** with no first option beside it | 好用 | **在 Telegram 里给它发：** when there is no **在 Telegram 里打开** |
| 7 | Accounts, stop a source | confirm 停用 OOMOL | Seven accounts and 发现了就说 vanish with no word | 放心 | **好，OOMOL 停了：它连着的账号我都不看了。想再用，重新连上就好。** where the source was |
| 8 | Agent messaging, move here / connect | 改由这台收 | **没连上：Mem answered with another identity or place**: the home's English, raw, in the Chinese page | 放心 | The home's two own sentences are said in the person's language (**Nowledge Mem 回的是另一个身份或地方，没连上。再试一次；…**, **nmem 没能启动，没连上。再试一次。**); Mem's own words still show after **没连上：** |
| 9 | Memory, install on a home without pipx | 再试一次 | **正在装…** for half a second, then the same paragraph again: did the retry run? | 顺滑 | **刚又试了一次，还是缺这个小工具。** under the step after a retry that met the same lack |
| 10 | Partner, rename | tap 改名字 | The field holds the old name with the caret at its end: typing makes **DucterX** | 顺滑 | The name is selected; typing replaces it (the Mac's field was already empty with the name as its placeholder) |
| 11 | Partner, rename | Enter | The header changes; that's all. Naming your partner is the most personal act in Settings | 惊喜 | **好，以后我就叫小满。** under the name |
| 12 | Every pane (phone) | any tap | Under 44 pt: Codex's model chips (30), every segmented choice (40: 发现了就说, 新的来了, 浅色和深色, $5…), a quiet **移除**/**断开** (32), a count link (38), the reply-language pop-up (36), **怎么装** (39 wide) | 好用 | On `pointer: coarse` the choices and the pop-up are 44; chips, quiet removes and count links reach 44 through an invisible margin; the drawn size stays |
| 13 | Any sheet with a field (iPhone) | focus a field | iOS lays the keyboard over the page (no `interactive-widget` there): a bottom sheet's lower field sits under it | 好用 | `keyboard.ts`: the keyboard's height as `--kb`; the phone's sheet stands on it and the field scrolls into view (Android, already resized, gets 0) |
| 14 | Accounts (demo) | open | Four of seven rows **读不了**: the real-shape demo's fake OpenConnector had no calendar or Slack read, so the walk saw a state hel doesn't have | — | The fake answers `googlecalendar.list_events` and `slack.list_direct_messages` |
| 15 | Agent messaging (demo) | 改由这台收 | The `demo-bridge` fake answered with the old label `ducter` while the home asks with its own (D324), so every connect "failed" | — | The fake echoes `--context`, as Mem does |

### Walked, and kept

| Pane, flow | What happens |
|---|---|
| Notifications, quiet hours | **好，22:30 到 08:00 我不吵你，结束时一起告诉你。** under the group for 4 s |
| Partner, model switch | **好，从你的下一句话开始，我用 Codex 的 GPT-6.2-Astra 想事情。** at once |
| Accounts, a service's watch switch | the row's word and the partner's line at once |
| To-do sources, remove and add back | 移除 asks in place; the vault returns under **还能加上** (the undo is the add row) and comes back with **3 件没做完** in under 80 ms |
| Chat apps, WeChat | **连上** → **正在连…** → the QR with **等你用微信扫码** in under 600 ms; **不连了** backs out |
| Memory, sign in with a wrong paste | **这里面没找到 Nowledge Mem 的连接链接。…** at once, the field kept |
| Agent messaging, move here | asks in place (**改由这台收？另一台电脑上就不再收了…**), then **等它第一次找来…** with two things to say |
| This computer, language | the whole page changes language in place |
| Devices, add a computer for tasks | **外面还连不到 Hetzner Server…先打开「从外面连」** (the demo listens on loopback): right, and one button |
| Memory and Agent messaging, the overlaps flagged in pass 3 | Re-shot at 1400 and 390, zh and en, with 怎么装 closed and open: no finding. The pass-3 flag paired an empty text with **再试一次** and **登录你的 Nowledge Mem**: the closed fold's `<small>` (its text not rendered, its box still measured). A checker false positive |

## Left

- The add-a-computer page's back label and title are the same words (**‹ 加一台做事的电脑** over
  **加一台做事的电脑**): two steps share one title.
- At 390, **再试一次** sits close above step 2's mark.
- A watch switch's line names the account alone when two of a kind exist (**好，w@nowledge-labs.ai 你问起来我再看。**).
- The iPhone keyboard over a sheet seen on a device or a tapped simulator; the Mac app driven through the
  same flows (cua-driver) rather than the test renderer.

## Implications for Ducter

- A pane is not done when it looks right; it is done when every tap has an answer the person can see:
  a change of state they can read, or the partner's one line where the consequence isn't shown.
- The first time something connects (a chat app, a name) is the moment that earns warmth; everywhere
  else stays quiet.
- A field on the phone is typed with the phone's keyboard: what that keyboard can't type, the field must
  not require.
- A demo fixture that fails where the real thing works hides the real flow; the fakes answer like the
  real services.

**Summary:** walking Settings' flows (not pages) at the real shape found thirteen frictions: a card expiry
the iPhone's number pad can't type, silent disconnects and stops, an unmarked first link, raw English
from the home, a retry that looked like nothing, a rename that appended, sub-44 targets on every pane and
the iOS keyboard over the sheet. All are fixed on the web and the Mac where both have them; a flow test
drives the chat-app hub, a source and the saved store through connect, connected and disconnect.
