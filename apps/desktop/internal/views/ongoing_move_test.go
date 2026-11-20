package views

// D429: the keeper's card about a loop whose computer sleeps keeps its Go
// whole (换到醒着的电脑上跑 / Run it on an awake computer), never Go / 好.

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

func TestLoopMoveGoIsWhole(t *testing.T) {
	app, _ := pastApp(t, i18n.EN)
	d := &store.DecisionState{Decision: protocol.Decision{GoLabel: "Run it on an awake computer", Loop: &protocol.LoopAsk{TaskID: "fare", Move: "local"}}}
	if got := app.goLabel(d); got != "Run it on an awake computer" {
		t.Errorf("go label %q", got)
	}
}
