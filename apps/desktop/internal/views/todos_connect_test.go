package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D345, 待办来源 › 连上 GitHub on the Mac: the GitHub row is there with no gh
// on the home; 连上 opens New task's own sign-in in place; with no gh it
// offers to put it there (how and where), shows the download, then the code
// large with Copy and Open, and once signed in the source says the account.

// noGitHubFrame is the fixture's home before GitHub: no gh, nothing added
// but the vault.
func noGitHubFrame() protocol.ServerFrame {
	return protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{
		Sources: []protocol.SourceView{{ID: "src_life", Kind: "obsidian", Name: "Life", State: "ok", Path: "/Users/lin/Documents/Life", WhenNew: "quiet", WhenDone: "tick", Open: 5, CheckedAt: "2026-11-17T08:00:00Z"}},
		Found:   protocol.SourcesFound{GitHub: &protocol.SourcesFoundGitHub{State: "no_tool", Computer: "Lin's MacBook Pro"}},
	}}}
}

func ghFrame(cid, state string, f func(*protocol.ServerFrame)) protocol.ServerFrame {
	r := protocol.ServerFrame{T: "git_login_state", GitHost: "github.com", ClientID: cid, State: state}
	if f != nil {
		f(&r)
	}
	return r
}

var releasePlan = &protocol.GhInstallPlan{How: "release", Where: "/Users/lin/.ducter/tools/bin"}

// connectedFrame is the sources once GitHub is added (open known).
func connectedFrame() protocol.ServerFrame {
	f := noGitHubFrame()
	v := f.Sources.View
	v.Sources = append([]protocol.SourceView{{ID: "src_gh", Kind: "github", Name: "lin-dev", State: "ok", WhenNew: "tell", WhenDone: "ask", Open: 4, CheckedAt: "2026-11-17T08:00:00Z"}}, v.Sources...)
	v.Found.GitHub = &protocol.SourcesFoundGitHub{State: "ok", Login: "lin-dev", Computer: "Lin's MacBook Pro"}
	return f
}

func TestTodosConnectGitHub(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1600)
	app.Receive(noGitHubFrame())
	app.openTab(TabTodos)
	todoFrames(tt, 4)
	for _, want := range []string{"GitHub", "分给你的 GitHub issue", "连上", app.L.T("todos.add.path")} {
		if !hasText(tt, want) {
			t.Fatalf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("连上，GitHub"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	f, ok := lastSent[protocol.GitLogin](*sent)
	if !ok || f.Action != "start" || f.For != "todos" || f.Device != "" {
		t.Fatalf("连上 sends %+v", f)
	}
	cid := f.ClientID
	// No gh on the home: the offer, with how and where.
	app.Receive(ghFrame(cid, "no_gh", func(r *protocol.ServerFrame) { r.GhInstall = releasePlan }))
	todoFrames(tt, 2)
	offer := app.L.T("newtask.gh.install.release", "Lin's MacBook Pro", "~/.ducter/tools/bin")
	if !hasText(tt, offer) || !hasText(tt, "安装 gh") {
		t.Fatalf("no install offer: %q", tt.Texts())
	}
	if err := tt.Click("安装 gh，GitHub"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	f, _ = lastSent[protocol.GitLogin](*sent)
	if f.Action != "install" || f.For != "todos" {
		t.Fatalf("安装 gh sends %+v", f)
	}
	cid = f.ClientID
	p := 41.0
	app.Receive(ghFrame(cid, "installing", func(r *protocol.ServerFrame) { r.GhInstall, r.GhProgress = releasePlan, &p }))
	todoFrames(tt, 2)
	if !hasText(tt, "正在下载 gh… 41%") {
		t.Fatalf("no progress: %q", tt.Texts())
	}
	if hasText(tt, "取消") {
		t.Error("an install offers a Cancel it can't keep")
	}
	app.Receive(ghFrame(cid, "code", func(r *protocol.ServerFrame) { r.Code, r.URL = "AB12-CD34", "https://github.com/login/device" }))
	todoFrames(tt, 2)
	for _, want := range []string{"AB12-CD34", "github.com/login/device", "复制", "打开", app.L.T("newtask.gh.waiting")} {
		if !hasText(tt, want) {
			t.Fatalf("no %q in %q", want, tt.Texts())
		}
	}
	app.Receive(ghFrame(cid, "signed_in", func(r *protocol.ServerFrame) { r.Account = "lin-dev" }))
	app.Receive(connectedFrame())
	todoFrames(tt, 2)
	if app.todos.login != nil || !hasText(tt, "已用 lin-dev 连上 GitHub。") || !hasText(tt, "4 个没做完") {
		t.Fatalf("connected isn't said with the count: %q", tt.Texts())
	}
	if strings.Count(strings.Join(tt.Texts(), "\n"), "分给你的 GitHub issue") != 0 {
		t.Error("GitHub is still offered once added")
	}
}

// Each failure says why with one next step; the token way links to a token
// made with its permissions filled in.
func TestTodosConnectFailures(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.EN, 1280, 1600)
	app.Receive(noGitHubFrame())
	app.openTab(TabTodos)
	todoFrames(tt, 3)
	if err := tt.Click("Connect, GitHub"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	g := app.todos.login
	app.Receive(ghFrame(g.cid, "no_gh", func(r *protocol.ServerFrame) { r.GhInstall = releasePlan }))
	todoFrames(tt, 2)
	if err := tt.Click("Install gh, GitHub"); err != nil {
		t.Fatal(err)
	}
	cid := app.todos.login.cid
	app.Receive(ghFrame(cid, "failed", func(r *protocol.ServerFrame) { r.Reason = "network" }))
	todoFrames(tt, 2)
	if !hasText(tt, "Lin's MacBook Pro can't reach GitHub. Check its network, then try again.") || !hasText(tt, "Try again") {
		t.Fatalf("no network line: %q", tt.Texts())
	}
	if err := tt.Click("Try again"); err != nil {
		t.Fatal(err)
	}
	if f, _ := lastSent[protocol.GitLogin](*sent); f.Action != "install" {
		t.Fatalf("Try again after a failed install sends %+v", f)
	}
	app.Receive(ghFrame(app.todos.login.cid, "code", func(r *protocol.ServerFrame) { r.Code = "AB12-CD34" }))
	app.Receive(ghFrame(app.todos.login.cid, "failed", func(r *protocol.ServerFrame) { r.Reason = "expired" }))
	todoFrames(tt, 2)
	if !hasText(tt, app.L.T("newtask.gh.err.expired")) {
		t.Fatalf("no expired line: %q", tt.Texts())
	}
	if err := tt.Click("Try again"); err != nil {
		t.Fatal(err)
	}
	if f, _ := lastSent[protocol.GitLogin](*sent); f.Action != "start" {
		t.Fatalf("Try again after an expired code sends %+v", f)
	}
	app.Receive(ghFrame(app.todos.login.cid, "failed", func(r *protocol.ServerFrame) { r.Reason = "denied" }))
	todoFrames(tt, 2)
	if err := tt.Click(app.L.T("newtask.gh.key")); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 2)
	if !hasText(tt, "Make one on GitHub") {
		t.Fatalf("no token link: %q", tt.Texts())
	}
	if !strings.Contains(protocol.TokenNewURL, "issues=write") {
		t.Error("the token link doesn't fill in its permissions")
	}
}

// Shots of each step to DUCTER_TODOS_GH_SHOTS (zh and en, light and dark).
func TestTodosConnectShots(t *testing.T) {
	dir := os.Getenv("DUCTER_TODOS_GH_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_TODOS_GH_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := 58.0
	steps := []struct {
		name string
		set  func(app *App)
	}{
		{"1-not-connected", func(app *App) {}},
		{"2-install-offer", func(app *App) {
			app.startTodoLogin()
			app.Receive(ghFrame(app.todos.login.cid, "no_gh", func(r *protocol.ServerFrame) { r.GhInstall = releasePlan }))
		}},
		{"3-installing", func(app *App) {
			app.startTodoLogin()
			app.Receive(ghFrame(app.todos.login.cid, "installing", func(r *protocol.ServerFrame) { r.GhInstall, r.GhProgress = releasePlan, &p }))
		}},
		{"4-code", func(app *App) {
			app.startTodoLogin()
			app.Receive(ghFrame(app.todos.login.cid, "code", func(r *protocol.ServerFrame) { r.Code, r.URL = "AB12-CD34", "https://github.com/login/device" }))
		}},
		{"5-connected", func(app *App) {
			app.startTodoLogin()
			app.Receive(ghFrame(app.todos.login.cid, "signed_in", func(r *protocol.ServerFrame) { r.Account = "lin-dev" }))
			app.Receive(connectedFrame())
		}},
		{"6-network", func(app *App) {
			app.startTodoLogin()
			app.Receive(ghFrame(app.todos.login.cid, "failed", func(r *protocol.ServerFrame) { r.Reason = "network" }))
		}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, st := range steps {
				app, _, tt := todoApp(t, lang, 1280, 1500)
				app.Receive(noGitHubFrame())
				app.openTab(TabTodos)
				st.set(app)
				tt.SetDark(dark)
				todoFrames(tt, 12)
				paper := "light"
				if dark {
					paper = "dark"
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", st.name, paper, lang)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
