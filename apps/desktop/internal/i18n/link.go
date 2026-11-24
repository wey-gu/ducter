package i18n

// D520: the window's link to its home. A loss is said quietly first, plainly
// after a while, and the connect card comes back only when the home itself
// said this Mac is disconnected. Glossary: design/product-model.md "the
// link to the home".
var zhLink = Table{
	"conn.reconnecting":     "正在重新连上 %s…",
	"conn.offline":          "连不上 %s，正在重试",
	"conn.lost.title":       "连不上 %s 上的 Ducter",
	"conn.lost.body":        "%s 开着吗？网络通吗？这里会一直自己重试，一连上就接着来，什么都不会丢。",
	"conn.lost.title.local": "这台 Mac 上的 Ducter 没有回应",
	"conn.lost.body.local":  "这里会一直自己重试，一连上就接着来，什么都不会丢。",
	"conn.lost.again":       "再连一次",
	"conn.reaching":         "正在连上 %s 上的 Ducter",
	"conn.reaching.body":    "你的对话和任务都在那边，一连上就会出现在这里。",
	"connect.revoked":       "%s 上的 Ducter 已经断开了这台 Mac。要回来，就再连一次。",
	"connect.unknown":       "%s 上的 Ducter 认不出这台 Mac 了，可能是它的设备记录被重置过。要回来，就再连一次。",
}

var enLink = Table{
	"conn.reconnecting":     "Reconnecting to %s…",
	"conn.offline":          "Can't reach %s, retrying",
	"conn.lost.title":       "Can't reach your Ducter on %s",
	"conn.lost.body":        "Is %s on, and is the network up? This keeps trying by itself and carries on the moment it's back. Nothing is lost.",
	"conn.lost.title.local": "Ducter on this Mac isn't answering",
	"conn.lost.body.local":  "This keeps trying by itself and carries on the moment it's back. Nothing is lost.",
	"conn.lost.again":       "Connect it again",
	"conn.reaching":         "Reaching your Ducter on %s",
	"conn.reaching.body":    "Your conversation and tasks are there; they show up here as soon as it answers.",
	"connect.revoked":       "Your Ducter on %s disconnected this Mac. Connect it again to come back.",
	"connect.unknown":       "Your Ducter on %s doesn't know this Mac anymore; its list of devices may have been reset. Connect it again to come back.",
}

func init() {
	for k, v := range zhLink {
		zh[k] = v
	}
	for k, v := range enLink {
		en[k] = v
	}
}
