package protocol

// D276, 聊天软件 / Chat apps: the partner in the person's own Telegram bot
// and Slack app, more windows on the one conversation. The same frames as
// packages/protocol/src/channels.ts.

// ChannelView is one chat app as Settings shows it. State: off | scan |
// starting | unlinked | linked | cant_connect (Reason: token | blocked |
// conflict | network; WeChat back at off: expired | unavailable).
type ChannelView struct {
	Kind       string         `json:"kind"` // telegram | slack | wechat
	State      string         `json:"state"`
	Bot        *ChannelBot    `json:"bot,omitempty"`
	Linked     *ChannelLinked `json:"linked,omitempty"`
	Reason     string         `json:"reason,omitempty"`
	StrangerAt string         `json:"strangerAt,omitempty"`
	// D301, WeChat while State is scan: the QR to scan with WeChat.
	Scan *ChannelScan `json:"scan,omitempty"`
	// D301, WeChat once linked: until when it may still write on its own.
	OpenUntil string `json:"openUntil,omitempty"`
	// D531, Slack: the app was made before the current manifest (its own
	// name and face, @-mentions): Settings asks for a reinstall.
	Reinstall bool `json:"reinstall,omitempty"`
}

// ChannelScan is WeChat's QR (D301): rows of "1"/"0", the same text as a
// link, how far it got (Step: wait | scanned | verify) and when it runs out.
type ChannelScan struct {
	QR        []string `json:"qr"`
	Link      string   `json:"link"`
	Step      string   `json:"step"`
	ExpiresAt string   `json:"expiresAt"`
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
	// D301: WeChat takes no token; VerifyCode answers the number WeChat shows.
	VerifyCode string `json:"verifyCode,omitempty"`
}

// ChannelOpReq is channel_code (a one-time code), channel_unlink (解除连接 /
// Unlink) or channel_forget (断开 / Disconnect: the tokens go too).
type ChannelOpReq struct {
	T    string `json:"t"`
	Kind string `json:"kind"`
}
