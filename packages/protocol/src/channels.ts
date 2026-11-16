// D276: 聊天软件 / Chat apps. The partner in the person's own Telegram bot and their own Slack app,
// as more windows on the one conversation (design/channels.md). The home holds the tokens and the
// sockets; the apps only connect, pair, see who is linked and unlink.

/** The chat apps a conversation can also be reached from. */
export type ChannelKind = "telegram" | "slack";
export const CHANNEL_KINDS: readonly ChannelKind[] = ["telegram", "slack"];

/**
 * One chat app as Settings shows it.
 *  - off: no token yet;
 *  - starting: the token is being checked / the socket is opening;
 *  - unlinked: the bot is up, nobody is linked (show the link or the code);
 *  - linked: one account talks to the partner there;
 *  - cant_connect: the token was refused, revoked, or the bot was blocked (reason says which).
 */
export interface ChannelView {
  kind: ChannelKind;
  state: "off" | "starting" | "unlinked" | "linked" | "cant_connect";
  /** The partner's own bot there: its name and its @handle (Telegram) or workspace (Slack). */
  bot?: { name: string; handle?: string; team?: string };
  /** The one account linked to the partner there. */
  linked?: { name: string; at: string };
  /**
   * cant_connect: token = the service refused the token; blocked = the person blocked the bot or
   * left; conflict = another program reads this bot's messages; network = the service can't be reached.
   */
  reason?: "token" | "blocked" | "conflict" | "network";
  /** Someone other than the linked account wrote to the bot (at most once a day; nothing is kept of it). */
  strangerAt?: string;
}

export type ChannelClientFrame =
  // Answered with a channels frame; the socket stays subscribed (a fresh frame on every change).
  | { t: "channels" }
  // Paste the token(s) once: Telegram's from BotFather; Slack's bot token (xoxb-) and app-level token (xapp-).
  | { t: "channel_connect"; kind: ChannelKind; token?: string; botToken?: string; appToken?: string }
  // A one-time code (10 minutes, one use): Telegram as a t.me deep link, Slack as words to DM.
  | { t: "channel_code"; kind: ChannelKind }
  // 解除连接 / Unlink: the linked account is forgotten; the bot stays.
  | { t: "channel_unlink"; kind: ChannelKind }
  // 断开 / Disconnect: the tokens are forgotten too.
  | { t: "channel_forget"; kind: ChannelKind };

export type ChannelServerFrame =
  // slackManifest: the app manifest the person pastes into api.slack.com (Create app › From a manifest).
  | { t: "channels"; channels: ChannelView[]; slackManifest: string }
  | { t: "channel_result"; kind: ChannelKind; op: "connect" | "code" | "unlink" | "forget"; ok: boolean; reason?: "token" | "network" | "busy" | "not_connected"; code?: string; link?: string; expiresAt?: string };
