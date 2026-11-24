// D276: 聊天软件 / Chat apps. The partner in the person's own Telegram bot and their own Slack app,
// as more windows on the one conversation (design/channels.md). The home holds the tokens and the
// sockets; the apps only connect, pair, see who is linked and unlink.
// D301: WeChat through WeChat's own ClawBot (research/105): the person scans a QR with their own
// WeChat, and that scan is the pairing; it answers inside 24 hours of their words, with no buttons.

/** The chat apps a conversation can also be reached from. */
export type ChannelKind = "telegram" | "slack" | "wechat";
export const CHANNEL_KINDS: readonly ChannelKind[] = ["telegram", "slack", "wechat"];

/**
 * One chat app as Settings shows it.
 *  - off: no token yet;
 *  - scan (WeChat): a QR is up for the person to scan with their own WeChat (scan says how far);
 *  - starting: the token is being checked / the socket is opening;
 *  - unlinked: the bot is up, nobody is linked (show the link or the code);
 *  - linked: one account talks to the partner there;
 *  - cant_connect: the token was refused, revoked, or the bot was blocked (reason says which).
 */
export interface ChannelView {
  kind: ChannelKind;
  state: "off" | "scan" | "starting" | "unlinked" | "linked" | "cant_connect";
  /** The partner's own bot there: its name and its @handle (Telegram) or workspace (Slack). */
  bot?: { name: string; handle?: string; team?: string };
  /** The one account linked to the partner there. */
  linked?: { name: string; at: string };
  /**
   * cant_connect: token = the service refused the token; blocked = the person blocked the bot or
   * left; conflict = another program reads this bot's messages; network = the service can't be reached.
   * D301, WeChat back at off after a scan: expired = the QR ran out with no scan confirmed;
   * unavailable = WeChat stopped this scan (too many wrong numbers).
   */
  reason?: "token" | "blocked" | "conflict" | "network" | "expired" | "unavailable";
  /** Someone other than the linked account wrote to the bot (at most once a day; nothing is kept of it). */
  strangerAt?: string;
  /**
   * D301, WeChat while state is scan: the QR as rows of "1"/"0" (the app draws it), the same text
   * as a link (to open on the phone that has WeChat), how far it got, and when this QR runs out.
   *  wait: not scanned yet; scanned: waiting for Confirm on the phone; verify: WeChat shows a
   *  number to type here (channel_connect with verifyCode).
   */
  scan?: { qr: string[]; link: string; step: "wait" | "scanned" | "verify"; expiresAt: string };
  /**
   * D301, WeChat once linked: until when it may still write on its own (24 hours after the
   * person's last words there, while its few messages last). Absent: it hasn't heard from them yet.
   */
  openUntil?: string;
  /**
   * D527, Slack: the app was made before chat:write.customize, so each partner can't show its own
   * name and face there; Settings offers the new manifest and says to reinstall.
   */
  reinstall?: boolean;
}

export type ChannelClientFrame =
  // Answered with a channels frame; the socket stays subscribed (a fresh frame on every change).
  | { t: "channels" }
  // Paste the token(s) once: Telegram's from BotFather; Slack's bot token (xoxb-) and app-level token (xapp-).
  // WeChat (D301): no token; it puts up a QR (a channels frame with scan), or answers WeChat's number (verifyCode).
  | { t: "channel_connect"; kind: ChannelKind; token?: string; botToken?: string; appToken?: string; verifyCode?: string }
  // A one-time code (10 minutes, one use): Telegram as a t.me deep link, Slack as words to DM
  // (D527: with a link that opens the app's messages in Slack).
  | { t: "channel_code"; kind: ChannelKind }
  // 解除连接 / Unlink: the linked account is forgotten; the bot stays.
  | { t: "channel_unlink"; kind: ChannelKind }
  // 断开 / Disconnect: the tokens are forgotten too.
  | { t: "channel_forget"; kind: ChannelKind };

/** D323: a Mac carrying iMessage for the home, as the home last heard from its app. */
export interface IMessageCarrier {
  computer: string;
  state: "on" | "needs_permission" | "not_signed_in" | "error";
  here?: boolean;
}

export type ChannelServerFrame =
  // slackManifest: the app manifest the person pastes into api.slack.com (Create app › From a manifest).
  // imessage (D323): the Macs whose Ducter carries iMessage now (a bridge that isn't off), by
  // computer name; here: the socket this frame goes to. Absent: no Mac carries it.
  | { t: "channels"; channels: ChannelView[]; slackManifest: string; imessage?: IMessageCarrier[] }
  | { t: "channel_result"; kind: ChannelKind; op: "connect" | "code" | "unlink" | "forget"; ok: boolean; reason?: "token" | "network" | "busy" | "not_connected" | "expired" | "unavailable"; code?: string; link?: string; expiresAt?: string };
