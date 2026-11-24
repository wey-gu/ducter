// D276: 聊天软件 / Chat apps (design/channels.md); D301: WeChat through WeChat's own ClawBot.
export { cardPolicy, createChannels, type ChannelDeps, type Channels } from "./hub.ts";
export { createTelegram, isTelegramToken, TELEGRAM_MAX_TEXT } from "./telegram.ts";
export { createSlack, faceUrl, isSlackAppToken, isSlackBotToken, slackAppLink, slackManifest, SLACK_MAX_TEXT } from "./slack.ts";
export { createWechat, wechatLogin, WECHAT_WINDOW_MS, WECHAT_WINDOW_SENDS, type WechatLogin } from "./wechat.ts";
export { ChannelError, RetryAfter, type Channel, type ChannelCaps } from "./port.ts";
