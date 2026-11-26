// D276: the Channel port. A chat app (Telegram, Slack, Feishu / Lark D622, WeChat D301) is a
// window on the one conversation, so an adapter only moves words: inbound messages and taps up,
// outbound parts down. What goes where, pairing, decisions and quiet hours live in hub.ts, once for
// every chat app.
import type { ChannelKind } from "@ducter/protocol";

/** What a chat app can do; the hub shapes what it sends by these, never by the app's name. */
export interface ChannelCaps {
  /** Native buttons under a message (Telegram inline keyboard, Slack Block Kit actions). */
  buttons: boolean;
  /** A sent message can be edited (status lines, a card's end state). */
  edit: boolean;
  /** A typing indicator a bot may show. */
  typing: boolean;
  /** Pictures and files both ways. */
  files: boolean;
  /** The longest text one message may carry (UTF-16 units of the formatted words). */
  maxText: number;
  /** The largest file the bot may fetch from the app / send to it, in bytes. */
  maxDownload: number;
  maxUpload: number;
  /** A message may be sent without a sound (Telegram's disable_notification). */
  silent: boolean;
  /**
   * D301: the app only lets the bot answer: it may write for this long after the person's last
   * words there (WeChat's ClawBot, about 24 hours), and at most windowSends messages in that time.
   * Absent: it may write any time.
   */
  replyWindowMs?: number;
  windowSends?: number;
  /**
   * D531: each message may carry its own sender name and picture (Slack's username and icon_url
   * with chat:write.customize), so each partner speaks under its own name and face there.
   */
  as?: boolean;
}

export type OutButton = { label: string; data: string; style?: "primary" | "danger" } | { label: string; url: string };

/** One part of what the partner says. text is the partner's own (light Markdown) words. */
export interface OutPart {
  text: string;
  buttons?: OutButton[];
  /** The service's id of a message this part answers (shown as a reply there). */
  replyTo?: string;
  silent?: boolean;
  /** D531: the partner this part is from, its name and its face's public address (caps.as). */
  as?: { name: string; icon: string };
}

export interface InFile {
  name?: string;
  bytes?: number;
  fetch(): Promise<Uint8Array>;
}

export interface InMessage {
  /** The service's own message id (Telegram message_id, Slack ts). */
  id: string;
  /**
   * Where to answer: the private chat (Telegram), the DM channel (Slack), or the person's open_id
   * (Feishu, whose send API takes a person's open_id).
   */
  chat: string;
  from: { id: string; name: string };
  /** A one-to-one chat with the bot (groups and channels are never the person's window). */
  direct: boolean;
  /**
   * D531, Slack: the bot was @-mentioned in a shared channel it was added to. Only the linked
   * person's mention is taken; its answer goes in a thread under it, never in the DM.
   */
  mention?: boolean;
  text: string;
  /**
   * The service's id of the message this one replies to. D571, Slack: in a channel (not direct, no
   * mention), the thread it was written in; the hub takes it only in a thread the partner answers in.
   */
  replyTo?: string;
  /** Forwarded or shared from someone else: outside data. */
  forwarded?: { from?: string };
  files?: InFile[];
}

export interface InTap {
  id: string;
  chat: string;
  /** The service's id of the message the button was under. */
  message: string;
  from: { id: string };
  data: string;
}

export interface BotInfo {
  id: string;
  name: string;
  handle?: string;
  team?: string;
  /** D531, Slack: the workspace's id and the app's id, for the link that opens the app's messages. */
  teamId?: string;
  appId?: string;
  /** D531, Slack: false when the app lacks chat:write.customize (made before it; reinstall to add it). */
  customize?: boolean;
  /** D531, Slack: the app lacks a scope the current manifest has (made before it): Settings asks for a reinstall. */
  reinstall?: boolean;
}

export type Trouble = "token" | "blocked" | "conflict" | "network" | "setup";

export interface ChannelEvents {
  message(m: InMessage): Promise<void>;
  tap(t: InTap): Promise<void>;
  /** The adapter can't go on (a refused token, another reader), or is back (undefined). */
  trouble(t: Trouble | undefined): void;
  /** D531: what the adapter knows of the bot changed (Slack: it can't post as each partner). */
  changed?(): void;
}

export interface Channel {
  kind: ChannelKind;
  caps: ChannelCaps;
  /** Checks the token(s) and starts reading. Throws ChannelError when the token is refused. */
  start(on: ChannelEvents): Promise<BotInfo>;
  stop(): void;
  /** One part, already short enough (caps.maxText). Returns the service's id of the message. */
  send(chat: string, part: OutPart): Promise<string>;
  edit(chat: string, id: string, part: OutPart): Promise<void>;
  typing(chat: string): Promise<void>;
  /** Telegram's small toast for a tap; Slack has none. */
  answerTap(t: InTap, text?: string): Promise<void>;
  sendFile(chat: string, f: { path: string; name: string; type: string; caption?: string }): Promise<string>;
  /**
   * D580, Slack: a channel thread's messages before `before` (and from `after` on, inclusive, when
   * given), oldest first: the thread's first message, then at most `max - 1` of the newest others
   * (`more` counts the rest left out). unread: it can't be read (the app lacks the scope, or the
   * service didn't answer). Absent: the chat app has no threads to read.
   */
  thread?(chat: string, ts: string, o: { before: string; after?: string; max: number }): Promise<{ said: ThreadSaid[]; more: number } | { unread: "scope" | "failed" }>;
}

/** D580: one message of a thread, as the service has it (Slack's own markup made plain). */
export interface ThreadSaid {
  ts: string;
  from: { id: string; name: string };
  /** Posted by this bot (any partner of it), or by another app. */
  mine?: boolean;
  bot?: boolean;
  text: string;
}

/** The service asked to wait (Telegram's retry_after, Slack's Retry-After). */
export class RetryAfter extends Error {
  constructor(public ms: number) {
    super(`rate limited for ${ms} ms`);
  }
}

/**
 * Something the service said that sending again won't fix (permanent), or that the network did
 * (not). Messages never carry a token or a URL holding one.
 */
export class ChannelError extends Error {
  constructor(
    public trouble: Trouble | "refused",
    message: string,
  ) {
    super(message);
  }
  get permanent() {
    return this.trouble !== "network";
  }
}
