package protocol

// D276, 聊天软件 / Chat apps: the partner in the person's own Telegram bot
// and Slack app, more windows on the one conversation. The same frames as
// packages/protocol/src/channels.ts.

// ChannelView is one chat app as Settings shows it. State: off | starting |
// unlinked | linked | cant_connect (Reason: token | blocked | conflict | network).
type ChannelView struct {
	Kind       string         `json:"kind"` // telegram | slack
	State      string         `json:"state"`
	Bot        *ChannelBot    `json:"bot,omitempty"`
	Linked     *ChannelLinked `json:"linked,omitempty"`
	Reason     string         `json:"reason,omitempty"`
	StrangerAt string         `json:"strangerAt,omitempty"`
}

// ChannelBot is the partner's own bot there.
type ChannelBot struct {
	Name   string `json:"name"`
	Handle string `json:"handle,omitempty"`
	Team   string `json:"team,omitempty"`
}

// ChannelLinked is the one account linked to the partner there.
type ChannelLinked struct {
	Name string `json:"name"`
	At   string `json:"at"`
}

// ChannelsReq asks for the chat apps (T "channels"); the socket stays subscribed.
type ChannelsReq struct {
	T string `json:"t"`
}

// ChannelConnectReq pastes the token(s) once (T "channel_connect"): Telegram's
// Token from BotFather; Slack's BotToken (xoxb-) and AppToken (xapp-).
type ChannelConnectReq struct {
	T        string `json:"t"`
	Kind     string `json:"kind"`
	Token    string `json:"token,omitempty"`
	BotToken string `json:"botToken,omitempty"`
	AppToken string `json:"appToken,omitempty"`
}

// ChannelOpReq is channel_code (a one-time code), channel_unlink (解除连接 /
// Unlink) or channel_forget (断开 / Disconnect: the tokens go too).
type ChannelOpReq struct {
	T    string `json:"t"`
	Kind string `json:"kind"`
}
