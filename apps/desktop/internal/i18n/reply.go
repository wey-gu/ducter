package i18n

// D236: 回复 / Reply to one message. The same keys and words as the web
// client (apps/web/src/i18n.ts, reply.*).

var zhReply = Table{
	"reply.action": "回复",
	"reply.part":   "回复这段",
	"reply.cancel": "不回复了",
	"reply.you":    "你",
	"reply.copy":   "拷贝",
	"reply.copied": "已拷贝",
	"reply.pics":   "%d 张图片",
	"reply.to":     "回复 %s",
	"reply.jump":   "回到 %s 的这条",
	"reply.gone":   "那条在更早的对话里，这里翻不到了。",
}

var enReply = Table{
	"reply.action": "Reply",
	"reply.part":   "Reply to this part",
	"reply.cancel": "Cancel reply",
	"reply.you":    "You",
	"reply.copy":   "Copy",
	"reply.copied": "Copied",
	"reply.pics":   "%d picture(s)",
	"reply.to":     "Reply to %s",
	"reply.jump":   "Back to this message from %s",
	"reply.gone":   "That message is further back than this screen goes.",
}

func init() {
	for k, v := range zhReply {
		zh[k] = v
	}
	for k, v := range enReply {
		en[k] = v
	}
}
