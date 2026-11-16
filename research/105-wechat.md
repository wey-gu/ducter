# 105 · WeChat as a window on the one conversation: the routes there are today

Date: 2026-11-17. Question (`research/100` item 7): people in mainland China can't reach Telegram,
and D276's chat apps are Telegram and Slack. What official routes let a personal assistant talk
with **its own owner** in WeChat, what does each take from a normal person, what does each risk,
and which one should Ducter build?

Builds on `research/79` §2 (2026-11-13, which named Tencent's ClawBot over iLink as the one safe
personal route) and `research/88` (the chat-app hub). This report re-reads the source and checks
what changed since.

Sources read (read only; nothing installed or run):
- Tencent's package `@tencent-weixin/openclaw-weixin` **2.4.10** (npm, `npm pack --ignore-scripts`,
  unpacked into the scratchpad): `LICENSE`, `package.json`, `src/api/api.ts`, `src/api/types.ts`,
  `src/api/session-guard.ts`, `src/auth/login-qr.ts`, `src/messaging/send.ts`, `src/cdn/*.ts`,
  `src/monitor/monitor.ts`, `CHANGELOG.md`. npm metadata: maintainers on `@tencent.com` addresses,
  last modified 2026-11-09, still 2.4.10 (no newer release since `research/79`).
- Its protocol document `docs/protocol_zh_CN.md` on GitHub `Tencent/openclaw-weixin` (main).
- WeCom's own AI-bot SDK `@wecom/aibot-node-sdk` 1.0.7 (npm metadata only) and write-ups of WeCom's
  long-connection bot (Aliyun DataWorks help).
- Press and developer write-ups on ClawBot (cited per claim). Tencent's terms page
  《微信ClawBot功能使用条款》 is quoted by several of them but **I could not open it**.

Tags: VERIFIED (read in the source or the primary document itself), DOCUMENTED (a vendor page or a
maintainer says so, not checked further; "-secondhand" when only press/blogs say it), INFERRED (my
reasoning).

---

## 1. The routes, side by side

| Route | Where the person talks | What a normal person does | Their WeChat account at risk? | Fits "partner answers its owner"? |
|---|---|---|---|---|
| **ClawBot over iLink** (WeChat's own, personal, since 2026-03) | In WeChat, a contact WeChat itself adds ("ClawBot"), one-to-one | Scan one QR code with their WeChat, confirm on the phone | No login of their account by anyone; WeChat binds the ClawBot to them (§2.5) | Yes, with a 24 h reply window and no buttons |
| 企业微信 (WeCom) self-built app, callback | In WeCom (or WeChat via 微信插件 for an org) | Register an org, make an app, a public HTTPS callback on an ICP-filed domain, fixed trusted IPs | No | No: a home has no public filed domain (`research/79` §2.2) |
| WeCom 智能机器人, long connection | **In WeCom**, not WeChat | Create the bot in the WeCom client, paste a bot id and secret | No | Works, but most personal users don't live in WeCom |
| 服务号 / 公众号 (Official Account) | In WeChat, as a followed account | Register an account (a service account needs a business), a public HTTPS callback | No | No: a business entity and a public address; 48 h customer-service window |
| Unofficial protocols (iPad/Mac/web impersonation, PC hooks) | In WeChat, **as the person** | Log in their own account through a third party | **Yes**: limits and bans; it is their whole social life and WeChat Pay | **Never** |

## 2. ClawBot over iLink in detail

### 2.1 What it is
- A WeChat feature: WeChat adds a one-to-one contact for the person's own agent. Only private chat;
  groups not supported; nobody else can add your ClawBot; one agent per ClawBot.
  (DOCUMENTED-secondhand: woshipm, chihao.li, technews.tw; consistent with `research/79`.)
- WeChat **8.0.70+**, in a gradual rollout (逐步放量). One write-up says iOS only; others don't
  say. (DOCUMENTED-secondhand, chihao.li, ai-bot.cn.) Ducter cannot tell in advance whether a given
  person has it; the scan will fail if not (INFERRED).
- Tencent's own client is an OpenClaw channel plugin, MIT, `Copyright (C) 2026 Tencent`
  (VERIFIED `LICENSE`, `package.json` `"license": "MIT"`). Its runtime dependencies are
  `qrcode-terminal` and `zod`, and it needs the OpenClaw host as a peer. (VERIFIED `package.json`.)
  Ducter needs none of it: the protocol is plain JSON over HTTPS, written down by Tencent.

### 2.2 The protocol (VERIFIED in source unless marked)
- Base `https://ilinkai.weixin.qq.com` (QR always), then the `baseurl` the login returns.
  Every POST carries `Content-Type: application/json`, `AuthorizationType: ilink_bot_token`,
  `Authorization: Bearer <bot_token>`, `X-WECHAT-UIN` (a random uint32 as decimal, base64),
  `iLink-App-Id` (the package's `ilink_appid`, `"bot"`), `iLink-App-ClientVersion`
  (`major<<16|minor<<8|patch`), and a body `base_info: { channel_version, bot_agent }`.
- `bot_agent` is a self-declared `Name/Version` user agent, "for observability only (logging,
  monitoring aggregation); not used for authentication or routing" (VERIFIED `types.ts`). The
  protocol document allows other hosts: "其他宿主有自己的版本号时，前三段必须是 openclaw-weixin 的版本，
  自己的版本放在后缀里" (VERIFIED, protocol doc). So a client that is not OpenClaw is foreseen, and is
  asked to say who it is. Ducter sends `bot_agent: "Ducter/<version>"` and a
  `channel_version` of `2.4.10-ducter` (INFERRED from that rule).
- **Login by QR:** `POST ilink/bot/get_bot_qrcode?bot_type=3` with `{ local_token_list: [] }` →
  `{ qrcode, qrcode_img_content }` (the second is the text to draw as a QR). Then long-poll
  `GET ilink/bot/get_qrcode_status?qrcode=…` (35 s client timeout) → `status`: `wait`,
  `scaned`, `confirmed`, `expired`, `scaned_but_redirect` (+ `redirect_host`),
  `need_verifycode` (send again with `&verify_code=`), `verify_code_blocked`, `binded_redirect`
  (already bound to this client). `confirmed` carries `bot_token`, `ilink_bot_id`, `baseurl`,
  and **`ilink_user_id`, "the user ID of the person who scanned the QR code"**. A login is fresh
  for 5 minutes; the plugin refreshes an expired QR at most 3 times.
- **Real name:** "只有他人绑定需要实名。本人绑定不调用实名 CGI" (DOCUMENTED, protocol doc): binding
  your own WeChat needs no WeChat Pay real-name step. (This corrects `research/79`, which read the
  real-name line as applying to every scan.)
- **Receive:** `POST ilink/bot/getupdates` with `{ get_updates_buf }` (a cursor: send `""` the
  first time, keep what comes back), held up to `longpolling_timeout_ms` (35 000). Messages:
  `from_user_id`, `to_user_id`, `message_id` (uint64, parsed losslessly), `message_type` (1 user,
  2 bot), `group_id`, `context_token`, `item_list` of `text_item`, `image_item`, `voice_item`
  (with `text`, WeChat's own transcript), `file_item` (`file_name`, `len`), `video_item`, and
  `ref_msg` (a quote). No push address is needed: the home connects out.
- **Send:** `POST ilink/bot/sendmessage` with `{ msg: { to_user_id, client_id, message_type: 2,
  message_state: 2, item_list: [one item], context_token } }` → `{ ret, message_id }`. A non-zero
  `ret` is a failure. One item per request.
- **context_token:** a reply should carry the inbound message's `context_token`; sending without
  one "不能证明服务端一定接受该请求" (DOCUMENTED, protocol doc). Its lifetime is not documented.
- **Typing:** `POST ilink/bot/getconfig { ilink_user_id, context_token }` → `typing_ticket`, then
  `POST ilink/bot/sendtyping { ilink_user_id, typing_ticket, status: 1 | 2 }`.
- **Pictures and files:** `POST ilink/bot/getuploadurl` (`media_type` 1 image, 2 video, 3 file;
  `rawsize`, `rawfilemd5`, `filesize` = AES-128-ECB padded size, `aeskey` hex,
  `no_need_thumb: true`) → `upload_full_url` (or `upload_param`); POST the AES-128-ECB ciphertext
  there; the CDN answers the download param in the `x-encrypted-param` header; then send an
  `image_item` / `file_item` / `video_item` with `media: { encrypt_query_param, aes_key:
  base64(hex key), encrypt_type: 1 }`. Inbound media come with `media.full_url` or
  `encrypt_query_param` on `https://novac2c.cdn.weixin.qq.com/c2c/download`, decrypted with the
  item's key (`image_item.aeskey` hex, else `media.aes_key`: base64 of 16 raw bytes, or of 32 hex
  characters). No voice upload flow exists.
- **Errors:** `-14` in `ret` or `errcode` from `getupdates` = a stale bot token; the plugin pauses
  that account for an hour (VERIFIED `session-guard.ts`, `monitor.ts`). Other failures: retry in
  2 s, 30 s after 3 in a row.

### 2.3 Limits (none in Tencent's text I could read)
- No proactive push: the bot answers after the person writes; messages are accepted within about
  **24 h** of the person's last message (DOCUMENTED-secondhand, bytenote, csdn, several write-ups).
- About **10 bot messages per window**, then `sendmessage` answers `ret=-2`, reported by one
  open-source integration's notes (DOCUMENTED-secondhand; not confirmed by Tencent).
- Files up to about 100 MB (DOCUMENTED-secondhand, ai-bot.cn). No published rate limit; write-ups
  advise at least a second between sends.
- Tencent may limit or end the service at any time (DOCUMENTED-secondhand, quoting the terms).
  Their terms say the feature "仅提供消息收发，不存储用户输入/输出内容，不提供 AI 服务"
  (DOCUMENTED-secondhand, quoted in search results; the page itself not opened).
- No buttons, no edits, no slash commands. The contact's name and face are WeChat's, not the
  partner's (DOCUMENTED-secondhand; INFERRED that a client can't set them).

### 2.4 Setup for a normal person
1. Have WeChat 8.0.70 or later (it must be their turn in the rollout).
2. In Ducter, press Connect: a QR appears.
3. Scan it with their own WeChat, confirm on the phone. Done: the ClawBot contact appears in WeChat.
4. Say something to it, so it can answer (the 24 h window opens with their words).

Three motions, nothing to paste, no developer console (INFERRED, from the protocol).

### 2.5 Ban risk, honestly
- Nobody logs in **as the person**. The scan authorizes WeChat's ClawBot for one agent; the bot
  token belongs to that ClawBot, not to their account. The worst plausible case is that WeChat
  stops serving this ClawBot (a refused or stale token), not that their account is limited
  (INFERRED from the protocol: the token can only move ClawBot messages).
- One developer write-up claims "官方明确禁止第三方使用" iLink without citing anything (csdn); the
  protocol document's own rule for other hosts' version numbers says the opposite. I found no
  Tencent statement either way about non-OpenClaw clients (INFERRED: the honest stance is to
  identify as Ducter in `bot_agent`, send at the person's pace, and stop at the first refusal).
- What would put their account at risk is everything in §1's last row; Ducter never does it.

### 2.6 License
- `@tencent-weixin/openclaw-weixin` is MIT. Ducter **does not depend on it and copies no code**:
  it calls the documented HTTP protocol with its own client. The protocol facts above are interface
  facts, not code. (VERIFIED license text.)
- `@wecom/aibot-node-sdk` 1.0.7 is MIT (npm metadata), for the later WeCom path.

## 3. The WeCom bot as the alternative

WeCom's AI bot (智能机器人) can open a WebSocket out to `wss://openws.work.weixin.qq.com` with a bot id
and secret, so it needs no public address, and it can send on its own (`sendMessage(chatid, …)`)
and update template cards (DOCUMENTED-secondhand, SDK pages, Aliyun DataWorks help). It is the
right second window for people who work in WeCom, and a safer fallback if ClawBot closes. It is not
WeChat: a consumer in China rarely opens WeCom for their own life (INFERRED). Not built now.

## 4. What this means for Ducter (INFERRED)

1. **Build ClawBot over iLink.** It is WeChat's own feature for exactly this (a person's own agent
   in one-to-one chat), it needs no public address, and nobody signs in as the person.
2. **The scan is the pairing.** `confirmed` names the scanner (`ilink_user_id`) and nobody else can
   add the ClawBot; Ducter links that id and ignores any other sender. No code to type.
3. **Honest about the window.** Ducter only writes inside the 24 h after the person's last words,
   at most about 9 messages in that window (one short of the reported 10), and anything it starts
   itself goes to the app's push otherwise. Settings says so plainly.
4. **No buttons:** a reversible question asks for a typed 好 / 先等等 (the hub already reads them);
   everything else is "Open in Ducter", with the link written out when the home has one.
5. **One status message is not worth a message of the window:** no "still on it" line in WeChat.
6. **Pictures and files both ways** through the CDN flow; voice comes in as WeChat's transcript.
7. **A stale token (-14) shows as Can't connect: scan again.** Never retried in a loop.
8. Say in Settings and the docs that this is **WeChat's ClawBot preview**, that it may not be
   available on their WeChat yet, and that WeChat may change or stop it.

## Summary

The only route that puts the partner in a Chinese person's own WeChat without risking their account
is WeChat's ClawBot over iLink: a QR scan binds a ClawBot contact to the scanner, the home long-polls
for their words and answers with each message's `context_token`, pictures and files go through an
AES-encrypted CDN, and no public address or real-name step is needed for one's own binding. It
answers rather than pushes (about 24 h, about 10 messages, both secondhand) and has no buttons.
Tencent's MIT plugin documents the protocol and allows other hosts to identify themselves; Ducter
writes its own client and copies nothing. WeCom's long-connection bot is the later alternative for
people who live in WeCom; Official Accounts and self-built WeCom apps need a business and a public
domain; unofficial protocols are never an option.

Sources: [Tencent/openclaw-weixin protocol doc](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol_zh_CN.md),
[npm @tencent-weixin/openclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin),
[chihao.li iLink notes](https://www.chihao.li/blog/zh/wechat-clawbot-ilink-protocol),
[bytenote iLink article](https://www.bytenote.net/article/wechat-ilink-bot-api),
[CSDN risk write-up](https://blog.csdn.net/aidoudoulong/article/details/159430136),
[woshipm on ClawBot](https://www.woshipm.com/ai/6361760.html),
[ai-bot.cn ClawBot](https://ai-bot.cn/clawbot/),
[technews.tw launch](https://technews.tw/2026/03/23/tencent-enables-openclaw-integration-in-weixin/),
[Aliyun DataClaw and WeCom](https://help.aliyun.com/zh/dataworks/user-guide/dataclaw-integrates-enterprise-wechat),
[npm @wecom/aibot-node-sdk](https://www.npmjs.com/package/@wecom/aibot-node-sdk).
