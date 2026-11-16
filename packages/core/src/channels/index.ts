// D276: 聊天软件 / Chat apps (design/channels.md).
export { cardPolicy, createChannels, type ChannelDeps, type Channels } from "./hub.ts";
export { createTelegram, isTelegramToken, TELEGRAM_MAX_TEXT } from "./telegram.ts";
export { createSlack, isSlackAppToken, isSlackBotToken, slackManifest, SLACK_MAX_TEXT } from "./slack.ts";
export { ChannelError, RetryAfter, type Channel, type ChannelCaps } from "./port.ts";
