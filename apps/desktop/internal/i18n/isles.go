package i18n

// The Isles stage of Devices (D81): words of the scene and of the device
// card beside it. Its own table, folded into zh and en by init, so it
// doesn't collide with other passes on i18n.go and ia.go.

var zhIsles = Table{
	// A computer that does tasks for Ducter (research/33 §7b): what kind
	// of thing it is, then its role; the state replaces the role when
	// there is one to say.
	"device.worker.line":        "另一台电脑 · 替 %s 做事",
	"device.worker.working":     "另一台电脑 · 在做 %d 件事",
	"device.worker.working.one": "另一台电脑 · 在做 1 件事",
	// A phone or an app window that reaches Ducter from elsewhere.
	"device.client.line": "在哪儿都能找到 %s",
	"device.client.seen": "在哪儿都能找到 %s · %s",
	// What the chosen device can do now, in one line.
	"devices.can": "%s 会：%s",
	// Under an island: a task running there.
	"isles.working":     "在做 %d 件事",
	"isles.working.one": "在做 1 件事",
	// An AI account on more than one device: its limit is shared.
	"token.shared": "%d 台设备共用",
	// The accounts in the device card.
	"devices.accounts.none": "%s 上还没有登录的 AI 账号。",
	// The scene's own accessible names.
	"isles.label":    "你的设备",
	"isles.new":      "新设备会在这儿出现",
	"isles.accounts": "%s 登录在：%s",
}

var enIsles = Table{
	"device.worker.line":        "Another computer · does tasks for %s",
	"device.worker.working":     "Another computer · working on %d tasks",
	"device.worker.working.one": "Another computer · working on 1 task",
	"device.client.line":        "Reaches %s from anywhere",
	"device.client.seen":        "Reaches %s from anywhere · %s",
	"devices.can":               "%s can: %s",
	"isles.working":             "Working on %d tasks",
	"isles.working.one":         "Working on 1 task",
	"token.shared":              "shared by %d devices",
	"devices.accounts.none":     "No AI account is signed in on %s yet.",
	"isles.label":               "Your devices",
	"isles.new":                 "A new device will appear here",
	"isles.accounts":            "%s is signed in on: %s",
}

func init() {
	for k, v := range zhIsles {
		zh[k] = v
	}
	for k, v := range enIsles {
		en[k] = v
	}
}
