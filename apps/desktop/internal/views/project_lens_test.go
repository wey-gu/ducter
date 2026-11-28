package views

// D654 (research/245 §3.2): a project is its repository, derived once in core. The Mac reads
// the card's key and name, draws one row per repository with its machines as an attribute, splits
// 其他 into 不在项目里 and 电脑上的事, and keeps the person's rename/merge/hide/pin/order on the home.
import (
	"os"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func projectApp(t *testing.T) *App {
	t.Helper()
	app, _ := iaApp(t, i18n.EN)
	at := "2026-11-27T15:00:00Z"
	repo := func(device, path string) protocol.Place {
		return protocol.Place{Kind: "repo", Device: device, RepoPath: path}
	}
	cards := []protocol.TaskCard{
		{TaskID: "m1", Title: "Fix the 403", ProjectKey: "github.com/nowledge-co/mem", ProjectName: "mem", Place: repo("local", "/home/w/ducter/projects/mem"), Harness: "claude-code", Attention: protocol.Working, OpenedAt: at, UpdatedAt: at},
		{TaskID: "m2", Title: "Review the PR", ProjectKey: "github.com/nowledge-co/mem", ProjectName: "mem", Place: repo("haswell", "/home/w/dev/mem-identity"), Harness: "claude-code", Attention: protocol.Blocked, OpenedAt: at, UpdatedAt: at},
		{TaskID: "b1", Title: "Backbone migration", ProjectKey: "github.com/nowledge-co/mem-backbone", ProjectName: "mem-backbone", Place: repo("haswell", "/home/w/ducter/projects/mem-backbone"), Harness: "claude-code", Attention: protocol.Working, OpenedAt: at, UpdatedAt: at},
		{TaskID: "n1", Title: "Read the research", ProjectGroup: "none", Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: protocol.Done, OpenedAt: at, UpdatedAt: at},
		{TaskID: "c1", Title: "Prow MCP on hel", ProjectGroup: "computer", Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: protocol.Failed, OpenedAt: at, UpdatedAt: at},
		{TaskID: "h1", Title: "Website copy", ProjectKey: "github.com/nowledge-co/nowledge-labs-website", ProjectName: "nowledge-labs-website", Place: repo("mac", "/Users/weyl/dev/nowledge-mem/nowledge-labs-website"), Harness: "claude-code", Attention: protocol.Working, OpenedAt: at, UpdatedAt: at},
	}
	order := 0
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks:  cards,
		Counts: protocol.Counts{Working: 4, Waiting: 1, DoneToday: 1},
		ProjectList: []protocol.ProjectLens{
			{Key: "github.com/nowledge-co/mem", Name: "mem", Devices: []string{"hel", "haswell"}, Pinned: true, Order: &order},
			{Key: "github.com/nowledge-co/mem-backbone", Name: "mem-backbone", Devices: []string{"haswell"}},
			{Key: "github.com/nowledge-co/nowledge-labs-website", Name: "nowledge-labs-website", Hidden: true, Added: true},
		},
	}})
	app.Route = RouteOnHand
	return app
}

func TestProjectLensReadsCore(t *testing.T) {
	app := projectApp(t)
	if got := lensOf(app.S.Task("m1")); got != "github.com/nowledge-co/mem" {
		t.Fatalf("the card's key is not the lens: %q", got)
	}
	groups := app.lensGroups(app.S.Board())
	var names []string
	for _, g := range groups {
		names = append(names, g.name)
	}
	want := []string{"mem", "mem-backbone", string(app.L.T("onhand.other")), string(app.L.T("onhand.computers"))}
	if strings.Join(names, "|") != strings.Join(want, "|") {
		t.Fatalf("the project column: %v, want %v", names, want)
	}
	mem := groupOf(groups, "github.com/nowledge-co/mem")
	if mem == nil || len(mem.tasks) != 2 || !mem.pinned {
		t.Fatalf("one repository on two computers is one row: %+v", mem)
	}
	if len(mem.where) != 2 {
		t.Errorf("the project's computers are attributes: %v", mem.where)
	}
	// A hidden project is out of the column; it shows again when something there needs the person.
	if groupOf(groups, "github.com/nowledge-co/nowledge-labs-website") != nil {
		t.Fatal("a hidden project is a row")
	}
	app.S.Task("h1").Card.Attention = protocol.NeedsYou
	app.S.Task("h1").State = &protocol.TaskState{TaskID: "h1", Attention: protocol.NeedsYou}
	if groupOf(app.lensGroups(app.S.Board()), "github.com/nowledge-co/nowledge-labs-website") == nil {
		t.Fatal("a hidden project with something needing the person stays hidden")
	}
}

func TestProjectMenuSendsOneChange(t *testing.T) {
	app := projectApp(t)
	_, sent := iaApp(t, i18n.EN)
	app.Send = func(f any) error { *sent = append(*sent, f); return nil }
	app.projectChange(protocol.ProjectChange{Act: "rename", Key: "github.com/nowledge-co/mem", Name: "Mem"})
	app.projectChange(protocol.ProjectChange{Act: "merge", Key: "github.com/nowledge-co/mem-backbone", Into: "github.com/nowledge-co/mem"})
	app.projectChange(protocol.ProjectChange{Act: "hide", Key: "github.com/nowledge-co/mem-backbone", Hidden: true})
	app.projectChange(protocol.ProjectChange{Act: "pin", Key: "github.com/nowledge-co/mem", Pinned: true})
	app.projectChange(protocol.ProjectChange{Act: "order", Keys: []string{"github.com/nowledge-co/mem"}})
	if len(*sent) != 5 {
		t.Fatalf("the project menu sends %d changes, want 5", len(*sent))
	}
	last := (*sent)[0].(protocol.ClientFrame)
	if last.T != "project_change" || last.Change == nil || last.Change.Act != "rename" || last.Change.Name != "Mem" {
		t.Fatalf("the frame: %+v", last)
	}
}

func TestProjectLensHasNoClientDerivation(t *testing.T) {
	b, err := os.ReadFile("byproject.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	for _, bad := range []string{"lastPath(placePath", "basename(placePath", `strings.Split(placePath`} {
		if strings.Contains(src, bad) {
			t.Errorf("the Mac derives a project from the folder again: %q", bad)
		}
	}
	tab, err := os.ReadFile("onhandboard.go")
	if err != nil {
		t.Fatal(err)
	}
	i := strings.Index(string(tab), "func (a *App) lensTabs")
	j := strings.Index(string(tab)[i:], "// ---------- the top of the board")
	body := string(tab)[i : i+j]
	if strings.Contains(body, ".Wrap()") {
		t.Error("the tab row wraps again")
	}
	if !strings.Contains(body, "onhand.more") || !strings.Contains(body, "folded") {
		t.Error("the overflow is not one 更多 / More menu")
	}
	if !strings.Contains(string(tab), "middleEllipsis") || !strings.Contains(string(tab), "fitWhere") || strings.Contains(string(tab), "MaxLines(2)") {
		t.Error("a project name or its computers can still wrap or be cut")
	}
}

func TestProjectLensOrderAndFitting(t *testing.T) {
	app := projectApp(t)
	// Core's order is the column's order: pinned, then the person's drag order, else needs and
	// recent activity. The Mac does not sort by name or by the tasks' lane order.
	list := app.S.OnHand.ProjectList
	app.S.OnHand.ProjectList = []protocol.ProjectLens{list[1], list[0], list[2]}
	var names []string
	for _, g := range app.lensGroups(app.S.Board()) {
		names = append(names, g.name)
	}
	want := []string{"mem-backbone", "mem", string(app.L.T("onhand.other")), string(app.L.T("onhand.computers"))}
	if strings.Join(names, "|") != strings.Join(want, "|") {
		t.Fatalf("the column follows core's order: %v, want %v", names, want)
	}
	// A project's computers stay on one line: as many as fit, then +N (the rest in its tooltip).
	shown, rest := fitWhere([]string{"hel", "mac", "haswell"}, 80, func(s string) float32 { return float32(len(s)) * 6.4 })
	if strings.Join(shown, ",") != "hel,mac" || rest != 1 {
		t.Fatalf("what fits on one line: %v +%d", shown, rest)
	}
	if shown, rest := fitWhere([]string{"hel", "mac"}, 200, func(s string) float32 { return float32(len(s)) * 6.4 }); len(shown) != 2 || rest != 0 {
		t.Fatalf("all of them fit: %v +%d", shown, rest)
	}
}
