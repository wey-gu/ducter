package i18n

// D277: the Mac app's iMessage bridge, in Settings › 聊天软件 / Chat apps since D283.
// The words the partner itself says in iMessage live with the bridge
// (internal/imessage/words.go). Glossary: design/product-model.md, "iMessage".

var zhIMessage = Table{
	"imessage.title":             "iMessage",
	"imessage.note":              "在手机的「信息」里和%s说话，经过这台 Mac。",
	"imessage.who":               "这台 Mac 的「信息」登录的是",
	"imessage.who.note":          "%s用这台 Mac 的「信息」收发，这台 Mac 要开着。",
	"imessage.mode.partner":      "%s自己的 Apple ID（推荐）",
	"imessage.mode.self":         "给自己发信息",
	"imessage.mode.partner.note": "给%s单独注册一个 Apple ID，登录在这台 Mac 的「信息」里。你像给朋友发消息一样给它发，它用自己的名字回你。",
	"imessage.mode.self.note":    "这台 Mac 的「信息」登录的是你自己的 Apple ID：在你和自己的对话里说话。%s的每句话都以它的名字开头，它不会给任何别人发消息。",
	"imessage.connect":           "连上",
	"imessage.code.partner":      "用你的手机给%s的 iMessage 发这串数字：",
	"imessage.code.self":         "用你的手机给自己发这串数字：",
	"imessage.code.left":         "%d 分钟内有效，只能用一次。",
	"imessage.code.new":          "换一个",
	"imessage.perm.disk":         "完全磁盘访问权限",
	"imessage.perm.disk.note":    "让 Ducter 读到发给%s的 iMessage。它只看连上以后的新消息，不看以前的，也不看别人的对话。点「允许」会打开系统设置：在列表里打开 Ducter；列表里没有的话，点 + 选「应用程序」里的 Ducter。",
	"imessage.perm.auto":         "自动化 › 信息",
	"imessage.perm.auto.note":    "让 Ducter 用「信息」回你。它只回给连上的那个号码，不给任何别人发。",
	"imessage.perm.on":           "已允许",
	"imessage.perm.off":          "还没允许",
	"imessage.perm.ask":          "允许",
	"imessage.perm.open":         "打开系统设置",
	"imessage.state":             "现在",
	"imessage.on":                "开着，连着 %s",
	"imessage.on.self":           "开着，在你和自己的对话里；%s的话以它的名字开头",
	"imessage.needs":             "还差一个权限，给了就好。",
	"imessage.signin":            "这台 Mac 的「信息」还没登录 iMessage。",
	"imessage.nomessages":        "这台 Mac 还没用过「信息」。打开「信息」登录以后再来。",
	"imessage.own":               "这台 Mac 的「信息」好像登录的是你自己的 Apple ID。%s不会用你的身份说话；要继续，就改成「给自己发信息」。",
	"imessage.own.switch":        "改成给自己发信息",
	"imessage.error":             "iMessage 暂时连不上，它会自己再试。",
	"imessage.stranger":          "有人在 iMessage 找过%s。它没有回，也没有留下那些消息。",
	"imessage.where":             "你在 iMessage 里说的也会出现在 Ducter 的对话里，别的都留在「信息」里。",
	"imessage.disconnect":        "断开",
	"imessage.disconnect.ask":    "断开以后，iMessage 里就找不到它了；你们的对话还在这里。",
	"imessage.state.pairing":     "还差一步：从手机发一串数字",
	"imessage.state.on":          "在 %s 等你",
	"imessage.state.self":        "在你和自己的对话里等你",
	"imessage.state.needs":       "还差一个权限",
	"imessage.state.problem":     "暂时用不了",
	"imessage.linked.self":       "在你和自己的对话里",
	"imessage.linked.self.note":  "%s的每句话都以它的名字开头。你在 iMessage 里说的也会出现在 Ducter 的对话里。",
	"imessage.via":               "经过这台 Mac 收发，这台 Mac 要开着。",
}

var enIMessage = Table{
	"imessage.title":             "iMessage",
	"imessage.note":              "Talk to %s from Messages on your phone, through this Mac.",
	"imessage.who":               "This Mac's Messages is signed in to",
	"imessage.who.note":          "%s sends and receives in this Mac's Messages, so this Mac stays on.",
	"imessage.mode.partner":      "%s's own Apple ID (recommended)",
	"imessage.mode.self":         "Message yourself",
	"imessage.mode.partner.note": "Make %s an Apple ID of its own and sign this Mac's Messages in to it. You text it like a friend, and it answers under its own name.",
	"imessage.mode.self.note":    "This Mac's Messages is your own Apple ID: talk in the thread you have with yourself. Everything %s says there starts with its name, and it never writes to anyone else.",
	"imessage.connect":           "Connect",
	"imessage.code.partner":      "From your phone, text these digits to %s's iMessage:",
	"imessage.code.self":         "From your phone, text these digits to yourself:",
	"imessage.code.left":         "Works for %d min, once.",
	"imessage.code.new":          "New code",
	"imessage.perm.disk":         "Full Disk Access",
	"imessage.perm.disk.note":    "Lets Ducter read the iMessages sent to %s. It reads only what arrives after you connect, never older messages or anyone else's conversations. Allow opens System Settings: turn Ducter on in the list; if it isn't there, click + and choose Ducter in Applications.",
	"imessage.perm.auto":         "Automation › Messages",
	"imessage.perm.auto.note":    "Lets Ducter answer you in Messages. It only ever writes to the number you connected.",
	"imessage.perm.on":           "Allowed",
	"imessage.perm.off":          "Not allowed yet",
	"imessage.perm.ask":          "Allow",
	"imessage.perm.open":         "Open System Settings",
	"imessage.state":             "Now",
	"imessage.on":                "On, connected to %s",
	"imessage.on.self":           "On, in your thread with yourself; %s's words start with its name",
	"imessage.needs":             "One permission to go; give it and it's on.",
	"imessage.signin":            "This Mac's Messages isn't signed in to iMessage.",
	"imessage.nomessages":        "Messages hasn't been used on this Mac. Open Messages, sign in, then come back.",
	"imessage.own":               "This Mac's Messages looks like your own Apple ID. %s won't speak as you; to go on, switch to Message yourself.",
	"imessage.own.switch":        "Switch to Message yourself",
	"imessage.error":             "Can't reach iMessage right now. It keeps trying.",
	"imessage.stranger":          "Someone else wrote to %s in iMessage. It didn't answer, and kept nothing of theirs.",
	"imessage.where":             "What you say in iMessage also shows in your Ducter conversation; nothing else leaves Messages.",
	"imessage.disconnect":        "Disconnect",
	"imessage.disconnect.ask":    "Once disconnected, it can't be reached in iMessage; your conversation stays here.",
	"imessage.state.pairing":     "One more step: text a code from your phone",
	"imessage.state.on":          "Waiting for you at %s",
	"imessage.state.self":        "Waiting for you in your thread with yourself",
	"imessage.state.needs":       "One permission to go",
	"imessage.state.problem":     "Not working right now",
	"imessage.linked.self":       "In your thread with yourself",
	"imessage.linked.self.note":  "Everything %s says starts with its name. What you say in iMessage also shows in your Ducter conversation.",
	"imessage.via":               "It goes through this Mac, so this Mac stays on.",
}

func init() {
	for k, v := range zhIMessage {
		zh[k] = v
	}
	for k, v := range enIMessage {
		en[k] = v
	}
}
