package i18n

// D329: the Noted line's 撤销 / Undo, what it replaced and whether it waits
// for Nowledge Mem (the Mem app closed is in memory.go, Mem in Update all in
// updateall.go). The web uses the same keys and words.

var zhMemD329 = Table{
	"memory.undone":      "不记了「%s」",
	"memory.replaced":    "换掉了之前那条「%s」",
	"memory.waiting":     "等 Nowledge Mem 回来就存进去",
	"memory.undo":        "别记这个",
	"memory.undo.failed": "Nowledge Mem 没回应，还记着",
}

var enMemD329 = Table{
	"memory.undone":      "Not kept “%s”",
	"memory.replaced":    "In place of “%s”",
	"memory.waiting":     "Goes into Nowledge Mem once it's back",
	"memory.undo":        "Don't keep this",
	"memory.undo.failed": "Nowledge Mem didn't answer; still noted",
}

func init() {
	for k, v := range zhMemD329 {
		zh[k] = v
	}
	for k, v := range enMemD329 {
		en[k] = v
	}
}
