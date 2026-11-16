package i18n

// D293: how each device is connected, and the home's addresses (Devices).
// Glossary: design/product-model.md "how a device is connected". The same
// words as the web (apps/web/src/i18n.ts reach.*).
var zhReach = Table{
	"reach.how":             "怎么连着",
	"reach.via.local":       "就在这台电脑上",
	"reach.via.lan":         "同一个网络",
	"reach.via.tailnet":     "经由你的 Tailscale 网络",
	"reach.via.domain":      "经由你的域名",
	"reach.via.tunnel":      "经由你的 Cloudflare 通道",
	"reach.private":         "全程加密，中间谁也看不到",
	"reach.private.local":   "不经过网络",
	"reach.open.cloudflare": "加密到 Cloudflare 为止，Cloudflare 能看到内容",
	"reach.open.plain":      "没有加密，同一个网络里的人能看到",
	"reach.ways":            "能连到 %s 的地址",
	"reach.kind.lan":        "同一个网络",
	"reach.kind.tailnet":    "Tailscale 网络",
	"reach.kind.domain":     "你的域名",
	"reach.kind.tunnel":     "Cloudflare 通道",
	"reach.state.up":        "连得上",
	"reach.state.down":      "连不上",
	"reach.state.unknown":   "还没查过",
	"reach.state.here":      "在用",
	"reach.note.tunnel":     "经过 Cloudflare 通道的内容，Cloudflare 能看到。其他地址全程加密。",
}

var enReach = Table{
	"reach.how":             "How it's connected",
	"reach.via.local":       "On this same computer",
	"reach.via.lan":         "Same network",
	"reach.via.tailnet":     "Through your tailnet",
	"reach.via.domain":      "Through your domain",
	"reach.via.tunnel":      "Through your Cloudflare tunnel",
	"reach.private":         "Encrypted all the way; nobody in between can read it",
	"reach.private.local":   "Never leaves this computer",
	"reach.open.cloudflare": "Encrypted as far as Cloudflare, which can read it",
	"reach.open.plain":      "Not encrypted; others on the network can read it",
	"reach.ways":            "Addresses that reach %s",
	"reach.kind.lan":        "Same network",
	"reach.kind.tailnet":    "Tailscale network",
	"reach.kind.domain":     "Your domain",
	"reach.kind.tunnel":     "Cloudflare tunnel",
	"reach.state.up":        "Reachable",
	"reach.state.down":      "Can't reach",
	"reach.state.unknown":   "Not checked yet",
	"reach.state.here":      "In use",
	"reach.note.tunnel":     "Cloudflare can read what goes through its tunnel. The other addresses are encrypted all the way.",
}

func init() {
	for k, v := range zhReach {
		zh[k] = v
	}
	for k, v := range enReach {
		en[k] = v
	}
}
