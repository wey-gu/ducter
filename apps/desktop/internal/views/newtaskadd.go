package views

// D272: a project is any folder on the computer that does the work; git
// is optional. 加一个文件夹… / Add a folder… is one row per computer that
// can take one (the home, each reachable worker, this Mac when it is one
// of them), and opens, in place of the list, three ways in this order:
// 在 {computer} 上新建一个文件夹 / New folder on {computer} (a name; made in
// that computer's ~/ducter/projects), 选 {computer} 上已有的文件夹 /
// Choose a folder on {computer} (macOS's own picker only for this Mac;
// any other computer is looked through from its home folder, D203), and
// 从 Git 地址克隆 / Clone from a Git address (D204). The clone field says
// where that computer stands with GitHub and offers 在 {computer} 上登录
// GitHub / Sign in to GitHub on {computer}: GitHub's one-time code and
// link, shown here, entered on any device; a pasted token as the fallback.

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ntAdd is the add panel open for one computer (a device id).
type ntAdd struct{ device string }

// ntNew is the new-folder field: the computer, the name typed, the
// clientId of the make in flight, and why it didn't happen.
type ntNew struct {
	device, name, cid, err string
	focus                  bool
}

// ntLogin is a GitHub sign-in on one computer: phase starting (asked,
// no code yet), code (waiting for it to be entered), token (the pasted
// token fallback), failed (err says why); cid the ask in flight.
type ntLogin struct {
	device, cid, phase string // phase: starting | offer | installing | code | token | failed
	code, url, err     string
	token              string
	copied             bool
	focus              bool
	// D345: todos: 待办来源's 连上 GitHub (the home; signed in, GitHub becomes
	// a source). install: how the home would put gh there; installing and
	// progress (0-100, -1 unknown) while it does; reason: why the last try
	// failed; via: what it last asked (再试一次 asks it again); nogh: gh
	// can't be put there (再看看).
	todos      bool
	install    *protocol.GhInstallPlan
	installing bool
	progress   float64
	reason     string
	via        string
	nogh       bool
}

// devKey is a computer's key in the GitHub states ("local" for the home).
func (a *App) devKey(device string) string {
	if d := a.deviceArg(device); d != "" {
		return d
	}
	return "local"
}

// pickerHere: that computer is this Mac (the home here, or this Mac's worker), so macOS's picker reaches its folders.
func (a *App) pickerHere(d protocol.DeviceView) bool {
	mode, dev := a.folderAdd()
	return (mode == "here" && d.Home) || (mode == "worker" && d.ID == dev)
}

// projectsPath is where a new folder or a clone goes on that computer, as ~/….
func (a *App) projectsPath(device string) string {
	if f := a.ntFolder(device); f != nil && f.Path != "" {
		return tildePath(strings.TrimRight(f.Path, "/") + "/projects")
	}
	return "~/ducter/projects"
}

// addRows are 加一个文件夹… rows, one per computer that can take a
// folder (named when there are two or more); they say whether they named.
func (a *App) addRows(c *ui.Context, only string) bool {
	t := a.T
	cs := a.reachable(only, false)
	named := len(cs) > 1 || only != "" || a.manyComputers()
	for _, d := range cs {
		d := d
		label := a.L.T("newtask.add")
		if named {
			label = spoken(a.L, label, a.L.T("newtask.find.on", d.Name))
		}
		if a.menuRow(c, "nt-add:"+d.ID, label, false, false, func() {
			a.glyph(c, 16, drawPlus(t.InkSoft))
			ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
				uiText(c, a.L.T("newtask.add")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
				if named {
					uiText(c, a.L.T("newtask.find.on", d.Name)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
			})
		}) {
			a.nt.add = &ntAdd{device: d.ID}
			a.nt.err, a.nt.errEmpty = "", false
		}
	}
	return named
}

// addPanel is the place list while it offers the three ways to add a
// folder on one computer.
func (a *App) addPanel(c *ui.Context) {
	t := a.T
	nt := &a.nt
	dev := nt.add.device
	name := a.computerName(dev)
	d := a.computerOf(dev)
	if d == nil && dev == "local" { // Devices not heard yet: the home itself
		d = &protocol.DeviceView{ID: "local", Home: true}
	}
	mac := d != nil && a.pickerHere(*d)
	row := func(key, title, line string, glyph func(p *ui.Painter, r ui.Rect)) bool {
		return a.menuRow(c, key, title, false, false, func() {
			a.glyph(c, 16, glyph)
			ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
				uiText(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
				uiText(c, line).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			})
		})
	}
	if row("nt-add-new", a.L.T("newtask.new", name), a.L.T("newtask.new.line", a.projectsPath(dev)), drawPlus(t.InkSoft)) {
		nt.add = nil
		nt.newf = &ntNew{device: dev, focus: true}
	}
	chooseLine := a.L.T("newtask.choose.line")
	if mac {
		chooseLine = a.L.T("newtask.choose.finder")
	}
	if row("nt-add-choose", a.L.T("newtask.choose", name), chooseLine, drawFolder(t.InkSoft)) {
		nt.add = nil
		if mac {
			a.addFolder()
		} else {
			a.startBrowse(dev, "")
		}
	}
	if row("nt-add-clone", a.L.T("newtask.clone"), a.L.T("newtask.clone.line", name), drawBranch(t.InkSoft)) {
		nt.add = nil
		addr := ""
		if nt.clone != nil {
			addr = nt.clone.address
		}
		a.openClone(dev, addr)
	}
	a.panelFoot(c, "nt-add-foot", func() {
		if a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
			nt.add = nil
		}
	}, nil)
}

// panelFoot is the foot of a panel in the place list: a hairline, then
// the main action first and the quiet ones after it (D543), with room
// under and beside the raised button so the list's edge never cuts its
// lip (D272: 克隆 was clipped at the popover's bottom edge).
func (a *App) panelFoot(c *ui.Context, key string, start, end func()) {
	t := a.T
	ui.Box(c.Key(key+"-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
	ui.Row(c.Key(key)).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S2, t.S2, t.S1).Children(func() {
		// D543: read from the left edge: the clay (and its Cancel) first, the quiet asides after.
		if end != nil {
			end()
		}
		if start != nil {
			start()
		}
	})
}

// openClone opens the clone field for that computer and asks where it
// stands with GitHub.
func (a *App) openClone(device, address string) {
	nt := &a.nt
	nt.clone = &ntClone{device: device, address: address, focus: true}
	nt.browse, nt.add, nt.newf = nil, nil, nil
	nt.err, nt.errEmpty = "", false
	a.askGitHub(device)
}

// askGitHub asks where that computer stands with GitHub (the answer is
// kept per computer).
func (a *App) askGitHub(device string) {
	a.nextClient++
	a.send(protocol.GitLogin{T: "git_login", Action: "status", Device: a.deviceArg(device), ClientID: fmt.Sprintf("s%d-%d", a.Now().UnixMilli(), a.nextClient)})
}

// startNewFolder sends the name to that computer.
func (a *App) startNewFolder() {
	k := a.nt.newf
	if k == nil || k.cid != "" || strings.TrimSpace(k.name) == "" {
		return
	}
	a.nextClient++
	k.cid = fmt.Sprintf("n%d-%d", a.Now().UnixMilli(), a.nextClient)
	k.err = ""
	a.send(protocol.ProjectNew{T: "project_new", Name: strings.TrimSpace(k.name), Device: a.deviceArg(k.device), ClientID: k.cid})
}

// newFolderDone takes the answer to the make in flight.
func (a *App) newFolderDone(r protocol.ServerFrame) {
	nt := &a.nt
	k := nt.newf
	if k == nil || k.cid == "" || r.ClientID != k.cid {
		return
	}
	k.cid = ""
	if !r.OK || r.Place == nil {
		name := a.computerName(k.device)
		switch r.Reason {
		case "invalid":
			k.err = a.L.T("newtask.new.err.invalid")
		case "offline":
			k.err = a.L.T("newtask.find.offline", name)
		case "old":
			k.err = a.L.T("newtask.old", name)
		default:
			k.err = a.L.T("newtask.new.err.failed", strings.TrimRight(r.Message, ". 。"))
		}
		return
	}
	nt.newf = nil
	a.pickPlace(*r.Place)
	pl := r.Place.Place
	nt.prefill = &pl
	a.afPlaced(*r.Place) // D455
}

// newFolderField is the place list while it takes a new folder's name.
func (a *App) newFolderField(c *ui.Context) {
	t := a.T
	k := a.nt.newf
	busy := k.cid != ""
	in := ui.TextInput(c.Key("nt-new-in"), &k.name).Placeholder(a.L.T("newtask.new.placeholder")).Label(a.L.T("newtask.new.title", a.computerName(k.device))).
		Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
		FontSize(t.SM).ReadOnly(busy).Margin(t.S1, t.S2, 0, t.S2).OnSubmit(func() { a.startNewFolder() })
	if in.Changed() {
		k.err = ""
	}
	if k.focus {
		in.Focus()
		k.focus = false
	}
	where := a.projectsPath(k.device)
	if n := strings.TrimSpace(k.name); n != "" {
		where += "/" + n
	}
	uiText(c.Key("nt-new-where"), a.L.T("newtask.new.where", where)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
	if k.err != "" {
		uiText(c.Key("nt-new-err"), k.err).FontSize(t.XS).TextColor(t.Failed.Ink).Padding(t.S1, t.S3)
	}
	a.panelFoot(c, "nt-new-foot", func() {
		if !busy {
			a.panelBack(c, k.device, func() { a.nt.newf = nil })
		}
	}, func() {
		label := a.L.T("newtask.new.go")
		if busy {
			label = a.L.T("newtask.new.going")
		}
		if a.buttonFor(c, label, a.L.T("newtask.new.title", a.computerName(k.device)), btnPrimary, t.ControlSM, t.Surface) && !busy {
			a.startNewFolder()
		}
	})
}

var ghOwnerRepo = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]+$`)

// githubish: the address is empty or on GitHub (github.com, or owner/repo).
func githubish(address string) bool {
	s := strings.TrimSpace(address)
	return s == "" || strings.Contains(strings.ToLower(s), "github.com") || ghOwnerRepo.MatchString(s)
}

// ghState is the last word on that computer's GitHub sign-in (nil: not heard).
func (a *App) ghState(device string) *protocol.ServerFrame {
	if f, ok := a.nt.gh[a.devKey(device)]; ok {
		return &f
	}
	return nil
}

// gitLoginState takes a git_login_state: kept per computer; the sign-in
// in flight (New task's, or D345's 连上 GitHub in 待办来源) moves on with it.
func (a *App) gitLoginState(r protocol.ServerFrame) {
	nt := &a.nt
	if nt.gh == nil {
		nt.gh = map[string]protocol.ServerFrame{}
	}
	key := firstNonEmpty(r.Device, "local")
	switch r.State {
	case "signed_in", "signed_out", "no_gh":
		nt.gh[key] = r
	}
	g := a.loginOf(r.ClientID)
	if g == nil {
		return
	}
	name := a.computerName(g.device)
	if g.todos {
		name = a.todoHome()
	}
	if r.State != "installing" {
		g.installing = false
	}
	switch r.State {
	case "installing":
		g.phase, g.installing, g.err = "installing", true, ""
		if r.GhInstall != nil {
			g.install = r.GhInstall
		}
		g.progress = -1
		if r.GhProgress != nil {
			g.progress = *r.GhProgress
		}
	case "code":
		g.phase, g.code, g.url, g.err = "code", r.Code, firstNonEmpty(r.URL, "https://github.com/login/device"), ""
	case "signed_in":
		if g.todos {
			// D345: GitHub is a source now (the home added it); its group says so with the count.
			a.todos.login = nil
			a.todos.connected = r.Account
			return
		}
		nt.login = nil
		nt.ghDone = a.L.T("newtask.gh.done", name, r.Account)
		// A clone that failed for access goes again, now that it can.
		if k := nt.clone; k != nil && k.cid == "" && k.access {
			k.access = false
			a.startClone()
		}
	case "cancelled":
		a.dropLogin(g)
	case "no_gh":
		// D345: no gh on the home, and Ducter can put it there: the offer, in the panel.
		switch {
		case r.GhInstall != nil:
			g.phase, g.install, g.err, g.cid = "offer", r.GhInstall, "", ""
		case g.todos:
			g.phase, g.err, g.cid, g.nogh = "failed", a.L.T("newtask.gh.nogh", name), "", true
		default:
			nt.login = nil
		}
	case "signed_out":
		if g.phase != "token" && !g.todos {
			nt.login = nil
		}
	default:
		// A refused token stays in the token field; anything else says why, with 再试一次.
		if g.phase != "token" {
			g.phase = "failed"
		}
		g.cid, g.token, g.reason = "", "", r.Reason
		g.nogh = r.Reason == "unsupported"
		switch {
		case r.State == "offline":
			g.err = a.L.T("newtask.find.offline", name)
		case r.State == "old":
			g.err = a.L.T("newtask.old", name)
		case r.Reason == "expired" || r.Reason == "denied":
			g.err = a.L.T("newtask.gh.err." + r.Reason)
		case r.Reason == "network" || r.Reason == "unsupported":
			g.err = a.L.T("newtask.gh.err."+r.Reason, name)
		case r.Reason == "install":
			g.err = a.L.T("newtask.gh.err.install", strings.TrimRight(r.Message, ". 。"))
		case r.Reason == "bad_token":
			g.err = a.L.T("newtask.gh.err.bad_key", strings.TrimRight(r.Message, ". 。"))
		default:
			g.err = a.L.T("newtask.gh.err.failed", strings.TrimRight(firstNonEmpty(r.Message, r.Reason), ". 。"))
		}
	}
}

// loginOf is the sign-in in flight that a clientId answers (nil: none).
func (a *App) loginOf(cid string) *ntLogin {
	if cid == "" {
		return nil
	}
	if g := a.todos.login; g != nil && g.cid == cid {
		return g
	}
	if g := a.nt.login; g != nil && g.cid == cid {
		return g
	}
	return nil
}

// dropLogin closes that sign-in panel.
func (a *App) dropLogin(g *ntLogin) {
	if g.todos {
		a.todos.login = nil
	} else {
		a.nt.login = nil
	}
}

// sendLogin asks the computer one step of that sign-in.
func (a *App) sendLogin(g *ntLogin, action, token string) {
	f := protocol.GitLogin{T: "git_login", Action: action, Device: a.deviceArg(g.device), Token: token, ClientID: g.cid}
	if g.todos {
		f.Device, f.For = "", "todos"
	}
	a.send(f)
}

// startGitLogin asks that computer to sign in to GitHub (device flow).
func (a *App) startGitLogin(device string) {
	a.nextClient++
	cid := fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	a.nt.login = &ntLogin{device: device, cid: cid, phase: "starting"}
	a.nt.ghDone = ""
	a.sendLogin(a.nt.login, "start", "")
}

// startTodoLogin is 待办来源's 连上 GitHub (D345): the home signs in (and
// puts gh there first when it isn't); signed in, GitHub becomes a source.
func (a *App) startTodoLogin() {
	a.nextClient++
	a.todos.login = &ntLogin{device: "local", cid: fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient), phase: "starting", todos: true}
	a.todos.connected = ""
	a.sendLogin(a.todos.login, "start", "")
}

// installGh is 装上 gh (D345): the home puts gh there, then the sign-in
// goes on by itself.
func (a *App) installGh(g *ntLogin) {
	a.nextClient++
	g.cid = fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	g.phase, g.installing, g.progress, g.err, g.via = "installing", true, 0, "", "install"
	a.sendLogin(g, "install", "")
}

// retryLogin is 再试一次: what failed, again (the install while gh isn't
// there, else the sign-in).
func (a *App) retryLogin(g *ntLogin) {
	if g.via == "install" && g.reason != "expired" && g.reason != "denied" && g.reason != "bad_token" {
		a.installGh(g)
		return
	}
	a.nextClient++
	g.cid = fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	g.phase, g.err, g.via = "starting", "", "start"
	a.sendLogin(g, "start", "")
}

// sendGitToken signs in with the pasted token; the field is emptied at once.
func (a *App) sendGitToken(g *ntLogin) {
	if g == nil || strings.TrimSpace(g.token) == "" {
		return
	}
	a.nextClient++
	g.cid = fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	tok := strings.TrimSpace(g.token)
	g.token, g.err = "", ""
	a.sendLogin(g, "token", tok)
}

// cancelGitLogin stops the sign-in in flight and closes its panel.
func (a *App) cancelGitLogin(g *ntLogin) {
	if g == nil {
		return
	}
	if g.phase == "code" || g.phase == "starting" {
		a.sendLogin(g, "cancel", "")
	}
	a.dropLogin(g)
}

// resendGitLogin: a socket that came back asks again (start answers the
// sign-in already in flight with the same code; install joins the one
// running).
func (a *App) resendGitLogin() {
	for _, g := range []*ntLogin{a.nt.login, a.todos.login} {
		if g == nil || g.cid == "" {
			continue
		}
		switch g.phase {
		case "code", "starting":
			a.sendLogin(g, "start", "")
		case "installing":
			a.sendLogin(g, "install", "")
		}
	}
	if k := a.nt.clone; k != nil {
		a.askGitHub(k.device)
	}
}

// githubLine is the clone field's word on GitHub: signed in as whom, or
// not signed in (with the button), or no gh there (what to run).
func (a *App) githubLine(c *ui.Context, k *ntClone) {
	t := a.T
	name := a.computerName(k.device)
	if a.nt.ghDone != "" {
		uiText(c.Key("nt-gh-done"), a.nt.ghDone).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
		return
	}
	if !githubish(k.address) {
		return
	}
	s := a.ghState(k.device)
	if s == nil {
		return
	}
	switch s.State {
	case "signed_in":
		uiText(c.Key("nt-gh-as"), a.L.T("newtask.gh.as", name, s.Account)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
	case "signed_out":
		if k.err != "" && k.access {
			return // the error line says it, with the button
		}
		uiText(c.Key("nt-gh-out"), a.L.T("newtask.gh.out", name)).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
		a.signInButton(c, k.device)
	case "no_gh":
		if s.GhInstall != nil {
			// D345: the home can put gh there itself: the sign-in offers it.
			uiText(c.Key("nt-gh-out"), a.L.T("newtask.gh.out", name)).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
			a.signInButton(c, k.device)
			return
		}
		uiText(c.Key("nt-gh-nogh"), a.L.T("newtask.gh.nogh", name)).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
		ui.Row(c.Key("nt-gh-recheck")).Padding(0, t.S2).Children(func() {
			if a.button(c, a.L.T("newtask.gh.recheck"), btnSecondary, t.ControlSM, t.Surface) {
				a.askGitHub(k.device)
			}
		})
	}
}

// signInButton is 在 {computer} 上登录 GitHub.
func (a *App) signInButton(c *ui.Context, device string) {
	t := a.T
	ui.Row(c.Key("nt-gh-signin")).Padding(0, t.S2, t.S1, t.S2).Children(func() {
		if a.button(c, a.L.T("newtask.gh.signin", a.computerName(device)), btnSecondary, t.ControlSM, t.Surface) {
			a.startGitLogin(device)
		}
	})
}

// loginPanel is a computer signing in to GitHub: in New task's place list,
// or (D345) in place under 待办来源's GitHub row. One panel, one set of
// words: no gh on the home (how it would be put there, 装上 gh), gh being
// put there (its progress), the link and the code (large, Copy), the wait,
// the token fallback (a link makes one with its permissions filled in), and
// every failure in one sentence with one next step.
func (a *App) loginPanel(c *ui.Context, g *ntLogin, key string) {
	t := a.T
	name := a.computerName(g.device)
	if g.todos {
		name = a.todoHome()
	}
	line := func(k, s string, col ui.Color) {
		uiText(c.Key(key+k), s).FontSize(t.XS).TextColor(col).LineHeight(a.leading(1.5)).Padding(t.S1, t.S3)
	}
	codeSize := t.XL
	if g.todos {
		codeSize = t.XXL
	}
	switch g.phase {
	case "starting":
		ui.Row(c.Key(key+"-starting")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S2, t.S3).Children(func() {
			ui.Spinner(c).Size(12, 12)
			uiText(c, a.L.T("newtask.gh.starting")).FontSize(t.XS).TextColor(t.InkMuted)
		})
	case "offer":
		if g.install != nil && g.install.How == "brew" {
			line("-offer", a.L.T("newtask.gh.install.brew", name), t.InkSoft)
		} else if g.install != nil {
			line("-offer", a.L.T("newtask.gh.install.release", name, tildePath(g.install.Where)), t.InkSoft)
		}
	case "installing":
		ui.Column(c.Key(key+"-installing")).Gap(t.S2).Padding(t.S2, t.S3).Children(func() {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ui.Spinner(c).Size(12, 12)
				s := a.L.T("newtask.gh.installing.brew")
				if g.install == nil || g.install.How != "brew" {
					s = a.L.T("newtask.gh.installing", int(max(0, g.progress)))
				}
				uiText(c, s).FontSize(t.XS).TextColor(t.InkMuted).Role(ui.RoleStatus)
			})
			if g.install == nil || g.install.How != "brew" {
				a.progressBar(c, max(0.04, g.progress/100))
			}
		})
	case "code":
		uiText(c.Key(key+"-s1"), "1  "+a.L.T("newtask.gh.step1")).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S2, t.S3, 0, t.S3)
		ui.Row(c.Key(key+"-url")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S2, t.S1, t.S3).Children(func() {
			uiText(c, strings.TrimPrefix(g.url, "https://")).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
			if a.buttonFor(c, a.L.T("newtask.gh.open"), g.url, btnSecondary, t.ControlSM, t.Surface) {
				c.OpenURL(g.url)
			}
		})
		uiText(c.Key(key+"-s2"), "2  "+a.L.T("newtask.gh.step2")).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S2, t.S3, 0, t.S3)
		ui.Row(c.Key(key+"-code")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S2, t.S1, t.S3).Children(func() {
			uiText(c, g.code).Font(t.Mono).FontSize(codeSize).FontWeight(700).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0).Label(g.code)
			label := a.L.T("newtask.gh.copy")
			if g.copied {
				label = a.L.T("newtask.gh.copied")
			}
			if a.buttonFor(c, label, a.L.T("newtask.gh.copy")+" "+g.code, btnSecondary, t.ControlSM, t.Surface) {
				c.WriteClipboard(g.code)
				g.copied = true
			}
		})
		ui.Row(c.Key(key+"-wait")).Gap(t.S2).AlignItems(ui.Start).Padding(t.S2, t.S3, t.S1, t.S3).Children(func() {
			ui.Spinner(c).Size(12, 12)
			uiText(c, a.L.T("newtask.gh.waiting")).FontSize(t.XS).TextColor(t.InkMuted).Grow(1).MinWidth(0)
		})
	case "token":
		ui.Row(c.Key(key+"-make")).Padding(t.S1, t.S2, 0, t.S2).Children(func() {
			if a.buttonFor(c, a.L.T("newtask.gh.key.make"), protocol.TokenNewURL, btnText, t.ControlSM, t.Surface) {
				c.OpenURL(protocol.TokenNewURL)
			}
		})
		in := ui.TextInput(c.Key(key+"-token"), &g.token).Placeholder("github_pat_… / ghp_…").Label(a.L.T("newtask.gh.key")).
			Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
			Font(t.Mono).FontSize(t.MonoSM).ReadOnly(g.cid != "").Margin(t.S1, t.S2, 0, t.S2).OnSubmit(func() { a.sendGitToken(g) })
		in.Password()
		if g.focus {
			in.Focus()
			g.focus = false
		}
		line("-token-line", a.L.T("newtask.gh.key.line", name), t.InkMuted)
		if g.err != "" {
			line("-err", g.err, t.Failed.Ink)
		}
	case "failed":
		col := t.Failed.Ink
		if g.nogh {
			col = t.InkSoft
		}
		line("-err", g.err, col)
	}
	if g.phase == "installing" {
		return // nothing to stop or choose while gh is being put there
	}
	a.panelFoot(c, key+"-foot", func() {
		switch g.phase {
		case "code", "starting":
			if a.button(c, a.L.T("newtask.gh.key"), btnText, t.ControlSM, t.Surface) {
				a.sendLogin(g, "cancel", "")
				g.phase, g.cid, g.focus, g.err = "token", "", true, ""
			}
		case "offer", "failed":
			if a.button(c, a.L.T("newtask.gh.key"), btnText, t.ControlSM, t.Surface) {
				g.phase, g.cid, g.focus, g.err = "token", "", true, ""
			}
		default:
			if g.cid == "" && a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
				a.dropLogin(g)
			}
		}
	}, func() {
		// Primary first, on the left; Cancel after it.
		defer func() {
			switch g.phase {
			case "code", "starting", "offer", "failed":
				if a.button(c, a.L.T("newtask.gh.cancel"), btnText, t.ControlSM, t.Surface) {
					a.cancelGitLogin(g)
				}
			}
		}()
		switch g.phase {
		case "offer":
			if a.buttonFor(c, a.L.T("newtask.gh.install.go"), "GitHub", btnPrimary, t.ControlSM, t.Surface) {
				a.installGh(g)
			}
		case "token":
			if g.cid != "" {
				ui.Spinner(c).Size(12, 12)
			} else if a.button(c, a.L.T("newtask.gh.key.go"), btnPrimary, t.ControlSM, t.Surface) {
				a.sendGitToken(g)
			}
		case "failed":
			label := a.L.T("newtask.gh.again")
			if g.nogh {
				label = a.L.T("newtask.gh.recheck")
			}
			if a.button(c, label, btnPrimary, t.ControlSM, t.Surface) {
				a.retryLogin(g)
			}
		}
	})
}
