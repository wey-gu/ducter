package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// helCant is hel's task on 2026-11-22, as its Log had it: an Antigravity
// task in /root/dev/mem on Hetzner Server, which has no such folder. The on
// hand snapshot after it carries the same cant on its card.
func helCant(t *testing.T, lang i18n.Lang, k protocol.CantStart) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake},
		{ID: "dev_mac", Name: "Macbook Pro M3", Kind: "laptop", State: protocol.DeviceAwake},
	}})
	now := time.Now()
	at := func(ago time.Duration) string { return now.Add(-ago).UTC().Format(time.RFC3339Nano) }
	id, ts := "smx2jjb3", protocol.TaskStream("smx2jjb3")
	title := "在 hel 用 Gemini 审改 Mem 长文案并开 PR"
	place := protocol.Place{Kind: "folder", Device: "local", Path: "/root/dev/mem"}
	raw, _ := json.Marshal(map[string]any{"cant": k})
	line := app.cantLine(&k)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, at(time.Minute), "default", ts, protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "antigravity", Place: place, Brief: "Review and edit Mem's long copy with Gemini, then open a PR."}),
		protocol.NewEvent(2, at(50*time.Second), "default", ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", From: "runner", Text: "failed to start: folder does not exist: /root/dev/mem", Raw: raw}),
		protocol.NewEvent(3, at(50*time.Second), "default", ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Failed, Residency: "archived", Reason: line, Cant: &k}),
	}})
	// The snapshot that came after (on_hand): before D472 it rebuilt the
	// state without its cant, and the page fell back to 没成 / 再试一次.
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
		{TaskID: id, Title: title, Place: place, Harness: "antigravity", Attention: protocol.Failed, Residency: "archived", Reason: line, Cant: &k, OpenedAt: at(time.Minute), UpdatedAt: at(50 * time.Second)},
	}}})
	tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask(id)
	tt.Frame()
	tt.Frame()
	return app, sent, tt
}

func d472Shot(t *testing.T, app *App, name string) {
	dir := os.Getenv("DUCTER_D472_SHOTS")
	if dir == "" {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	st := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	st.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	st.Frame()
	st.Frame()
	st.Advance(time.Second)
	if f, err := os.Create(filepath.Join(dir, name+".png")); err == nil {
		_ = png.Encode(f, st.Image())
		f.Close()
	}
}

// D472 (hel, 2026-11-22): the page said 没成 with 再试一次 / 告诉它怎么做…
// and each attempt only "没能开始"; the folder that wasn't there was nowhere.
// Now the page, after a snapshot too, says the real reason with the real
// fix first (clone mem onto that computer, or choose a folder on it), each
// attempt in its steps says the same, and a folder chosen starts it there.
func TestD472NoFolderSaysWhyAndTheRealFix(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		k := protocol.CantStart{Why: "no_folder", Computer: "Hetzner Server", What: "mem", Path: "/root/dev/mem", Device: "local", Harness: "antigravity", CloneHere: true, PickHere: true}
		app, sent, tt := helCant(t, lang, k)
		L := app.L
		all := texts(tt)
		want := map[i18n.Lang]string{i18n.ZH: "没能开始：Hetzner Server 上没有 mem 这个文件夹", i18n.EN: "Couldn't start: Hetzner Server has no folder mem"}[lang]
		if strings.Count(all, want) < 2 {
			t.Fatalf("%s: the reason isn't on the page and in its step (%q): %q", lang, want, all)
		}
		for _, label := range []string{L.T("cant.clone_to", "Hetzner Server"), L.T("cant.pick", "Hetzner Server")} {
			if !hasText(tt, label) {
				t.Errorf("%s: no %q: %q", lang, label, all)
			}
		}
		if hasText(tt, L.T("task.action.retry")) || hasText(tt, L.T("task.action.tell")) || strings.Contains(all, L.T("note.error_start")+"\n") {
			t.Errorf("%s: the generic failure is still shown: %q", lang, all)
		}
		d472Shot(t, app, fmt.Sprintf("after-mac-no-folder-%s", lang))
		click(t, tt, L.T("cant.pick", "Hetzner Server"))
		if !app.addf.open || app.addf.device != "local" || app.addf.forTask != "smx2jjb3" {
			t.Fatalf("%s: D455's sheet opens on Hetzner Server for this task: %+v", lang, app.addf)
		}
		if !hasText(tt, L.T("cant.pick.title")) {
			t.Errorf("%s: the sheet says what it is for: %q", lang, texts(tt))
		}
		app.afPlaced(protocol.PlaceChoice{Name: "nowledge-mem", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/code/nowledge-mem"}})
		got, ok := lastFrame[protocol.TaskAction](sent)
		if !ok || got.Action != "start_in" || got.TaskID != "smx2jjb3" || got.Place == nil || got.Place.RepoPath != "/root/code/nowledge-mem" {
			t.Fatalf("%s: the folder chosen starts it there: %+v", lang, got)
		}
		// One tap is one start: a second right after sends nothing more.
		n := len(*sent)
		app.CantAction("smx2jjb3", "reopen", "")
		if len(*sent) != n {
			t.Errorf("%s: a second tap within a moment was sent again", lang)
		}
	}
}

// D472: a reason nobody knows yet says what is known (the agent, the
// computer, the first line), with 看看为什么 for a few lines more; an agent
// not signed in there has 登录 as its fix.
func TestD472OtherAndSignedOut(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		k := protocol.CantStart{Why: "other", Computer: "Macbook Pro M3", What: "Antigravity", Device: "dev_mac", Harness: "antigravity", Detail: "git worktree add failed: fatal: invalid reference: release/0.9", More: "git worktree add failed: fatal: invalid reference: release/0.9\nhint: the branch is on hel only"}
		app, sent, tt := helCant(t, lang, k)
		L := app.L
		if !hasText(tt, app.cantLine(&k)) || !hasText(tt, k.Detail) {
			t.Fatalf("%s: what is known isn't said: %q", lang, texts(tt))
		}
		if !hasText(tt, L.T("task.action.retry")) || !hasText(tt, L.T("cant.why")) {
			t.Fatalf("%s: 再试一次 and 看看为什么: %q", lang, texts(tt))
		}
		if strings.Contains(texts(tt), "hint: the branch is on hel only") {
			t.Errorf("%s: the rest is behind 看看为什么", lang)
		}
		d472Shot(t, app, fmt.Sprintf("after-mac-other-%s", lang))
		click(t, tt, L.T("cant.why"))
		if !strings.Contains(texts(tt), "hint: the branch is on hel only") {
			t.Errorf("%s: 看看为什么 shows what the start said: %q", lang, texts(tt))
		}

		so := protocol.CantStart{Why: "signed_out", Computer: "Macbook Pro M3", What: "Antigravity", Device: "dev_mac", Harness: "antigravity"}
		app2, sent2, tt2 := helCant(t, lang, so)
		_ = sent
		label := app2.L.T("cant.login", "Antigravity", "Macbook Pro M3")
		if !hasText(tt2, app2.cantLine(&so)) || !hasText(tt2, label) {
			t.Fatalf("%s: signed out: %q", lang, texts(tt2))
		}
		click(t, tt2, label)
		var login *protocol.AgentSetupReq
		for _, f := range *sent2 {
			if r, ok := f.(protocol.AgentSetupReq); ok && r.Action == "login" {
				login = &r
			}
		}
		if login == nil || login.Device != "dev_mac" || login.Harness != "antigravity" {
			t.Errorf("%s: 登录 asks that computer to sign it in: %+v", lang, login)
		}
	}
}
