package views

// D672 (polish103): the Tasks head line names a failure as failed, never stopped. Shots of
// the board with two failures (the truth) and with a stop plus a failure, Mac 1000 and 1400,
// zh and en, light and dark.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/polish103/mac \
//	  go test ./internal/views -run OnHandFailedShots
import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func TestOnHandFailedShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	now := time.Now().UTC()
	iso := func(ago time.Duration) string { return now.Add(ago).UTC().Format(time.RFC3339) }
	card := func(id, title string, a protocol.Attention, ago time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Place: protocol.Place{Kind: "none"}, Harness: "codex", Attention: a, OpenedAt: iso(ago - time.Hour), UpdatedAt: iso(ago)}
	}
	failedCards := []protocol.TaskCard{
		card("t_a", "Android 构建在 CI 上挂了", protocol.Failed, -2*time.Hour),
		card("t_b", "把 11 月的报销单整理成表", protocol.Failed, -3*time.Hour),
	}
	failedTruth := &protocol.OnHandTruth{
		Failed: []protocol.TruthItem{
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthFailed}, TaskID: "t_a"},
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthFailed}, TaskID: "t_b"},
		},
	}
	mixCards := []protocol.TaskCard{
		card("t_phone", "用手机把 Ducter 官网录一段屏发到 X", protocol.Blocked, -8*24*time.Hour),
		card("t_a", "Android 构建在 CI 上挂了", protocol.Failed, -2*time.Hour),
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{1000, 1400} {
				// Two failures (the truth): the head says failed, never stopped.
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				if dark {
					app.T = theme.PebbleDark()
				}
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: failedCards, Truth: failedTruth}})
				app.Route = RouteOnHand
				tt := ui.NewTesterWith(app.View, width, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(120 * time.Millisecond)
					}
				}
				settle()
				shotTester(t, tt, fmt.Sprintf("head-failed-%s-%s-%d", lang, mode, width))

				// A stop plus a failure (no truth): the head says both.
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: mixCards}})
				settle()
				shotTester(t, tt, fmt.Sprintf("head-mix-%s-%s-%d", lang, mode, width))
			}
		}
	}
}
