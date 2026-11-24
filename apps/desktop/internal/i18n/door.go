package i18n

// D535: every needs-you count is a door. The same keys and words as the web
// client's (apps/web/src/i18n-onhand.ts).

var zhDoor = Table{
	"door.line":       "有 %d 件等你定",
	"door.line.about": "一件件带你去看",
	"door.pebble":     "%s 有 %d 件等你，一件件带你去看",
}

var enDoor = Table{
	"door.line":       "%d waiting on you",
	"door.line.about": "one at a time",
	"door.pebble":     "%s: %d waiting on you, one at a time",
}

func init() {
	for k, v := range zhDoor {
		zh[k] = v
	}
	for k, v := range enDoor {
		en[k] = v
	}
}
