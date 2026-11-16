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
	device, cid, phase string
	code, url, err     string
	token              string
	copied             bool
	focus              bool
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
				ui.Text(c, a.L.T("newtask.add")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
				if named {
					ui.Text(c, a.L.T("newtask.find.on", d.Name)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
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
				ui.Text(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
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
// the quiet action at the start and the main one at the end, with room
// under and beside the raised button so the list's edge never cuts its
// lip (D272: 克隆 was clipped at the popover's bottom edge).
func (a *App) panelFoot(c *ui.Context, key string, start, end func()) {
	t := a.T
	ui.Box(c.Key(key+"-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
	ui.Row(c.Key(key)).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S2, t.S2, t.S1).Children(func() {
		if start != nil {
			start()
		}
		ui.Box(c).Grow(1)
		if end != nil {
			end()
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
	ui.Text(c.Key("nt-new-where"), a.L.T("newtask.new.where", where)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
	if k.err != "" {
		ui.Text(c.Key("nt-new-err"), k.err).FontSize(t.XS).TextColor(t.Failed.Ink).Padding(t.S1, t.S3)
	}
	a.panelFoot(c, "nt-new-foot", func() {
		if !busy && a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
			a.nt.newf = nil
			a.nt.add = &ntAdd{device: k.device}
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
// in flight moves on with it.
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
	g := nt.login
	if g == nil || g.cid == "" || r.ClientID != g.cid {
		return
	}
	name := a.computerName(g.device)
	switch r.State {
	case "code":
		g.phase, g.code, g.url, g.err = "code", r.Code, firstNonEmpty(r.URL, "https://github.com/login/device"), ""
	case "signed_in":
		nt.login = nil
		nt.ghDone = a.L.T("newtask.gh.done", name, r.Account)
		// A clone that failed for access goes again, now that it can.
		if k := nt.clone; k != nil && k.cid == "" && k.access {
			k.access = false
			a.startClone()
		}
	case "cancelled":
		nt.login = nil
	case "no_gh":
		nt.login = nil
	case "signed_out":
		if g.phase != "token" {
			nt.login = nil
		}
	default:
		// A refused token stays in the token field; anything else says why, with 再试一次.
		if g.phase != "token" {
			g.phase = "failed"
		}
		g.cid, g.token = "", ""
		switch {
		case r.State == "offline":
			g.err = a.L.T("newtask.find.offline", name)
		case r.State == "old":
			g.err = a.L.T("newtask.old", name)
		case r.Reason == "expired" || r.Reason == "denied":
			g.err = a.L.T("newtask.gh.err." + r.Reason)
		case r.Reason == "bad_token":
			g.err = a.L.T("newtask.gh.err.bad_key", strings.TrimRight(r.Message, ". 。"))
		default:
			g.err = a.L.T("newtask.gh.err.failed", strings.TrimRight(firstNonEmpty(r.Message, r.Reason), ". 。"))
		}
	}
}

// startGitLogin asks that computer to sign in to GitHub (device flow).
func (a *App) startGitLogin(device string) {
	a.nextClient++
	cid := fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	a.nt.login = &ntLogin{device: device, cid: cid, phase: "starting"}
	a.nt.ghDone = ""
	a.send(protocol.GitLogin{T: "git_login", Action: "start", Device: a.deviceArg(device), ClientID: cid})
}

// sendGitToken signs in with the pasted token; the field is emptied at once.
func (a *App) sendGitToken() {
	g := a.nt.login
	if g == nil || strings.TrimSpace(g.token) == "" {
		return
	}
	a.nextClient++
	g.cid = fmt.Sprintf("g%d-%d", a.Now().UnixMilli(), a.nextClient)
	tok := strings.TrimSpace(g.token)
	g.token, g.err = "", ""
	a.send(protocol.GitLogin{T: "git_login", Action: "token", Token: tok, Device: a.deviceArg(g.device), ClientID: g.cid})
}

// cancelGitLogin stops the sign-in in flight and goes back to the clone field.
func (a *App) cancelGitLogin() {
	g := a.nt.login
	if g == nil {
		return
	}
	if g.phase == "code" || g.phase == "starting" {
		a.send(protocol.GitLogin{T: "git_login", Action: "cancel", Device: a.deviceArg(g.device)})
	}
	a.nt.login = nil
}

// resendGitLogin: a socket that came back asks again (start answers the
// sign-in already in flight with the same code).
func (a *App) resendGitLogin() {
	if g := a.nt.login; g != nil && g.cid != "" && (g.phase == "code" || g.phase == "starting") {
		a.send(protocol.GitLogin{T: "git_login", Action: "start", Device: a.deviceArg(g.device), ClientID: g.cid})
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
		ui.Text(c.Key("nt-gh-done"), a.nt.ghDone).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
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
		ui.Text(c.Key("nt-gh-as"), a.L.T("newtask.gh.as", name, s.Account)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
	case "signed_out":
		if k.err != "" && k.access {
			return // the error line says it, with the button
		}
		ui.Text(c.Key("nt-gh-out"), a.L.T("newtask.gh.out", name)).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
		a.signInButton(c, k.device)
	case "no_gh":
		ui.Text(c.Key("nt-gh-nogh"), a.L.T("newtask.gh.nogh", name)).FontSize(t.XS).TextColor(t.InkSoft).Padding(t.S1, t.S3)
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

// loginPanel is the place list while a computer signs in to GitHub.
func (a *App) loginPanel(c *ui.Context) {
	t := a.T
	g := a.nt.login
	line := func(key, s string, col ui.Color) {
		ui.Text(c.Key(key), s).FontSize(t.XS).TextColor(col).Padding(t.S1, t.S3)
	}
	switch g.phase {
	case "starting":
		ui.Row(c.Key("nt-gh-starting")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S2, t.S3).Children(func() {
			ui.Spinner(c).Size(12, 12)
			ui.Text(c, a.L.T("newtask.gh.starting")).FontSize(t.XS).TextColor(t.InkMuted)
		})
	case "code":
		ui.Text(c.Key("nt-gh-s1"), "1  "+a.L.T("newtask.gh.step1")).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S2, t.S3, 0, t.S3)
		ui.Row(c.Key("nt-gh-url")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S2, t.S1, t.S3).Children(func() {
			ui.Text(c, strings.TrimPrefix(g.url, "https://")).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
			if a.buttonFor(c, a.L.T("newtask.gh.open"), g.url, btnSecondary, t.ControlSM, t.Surface) {
				c.OpenURL(g.url)
			}
		})
		ui.Text(c.Key("nt-gh-s2"), "2  "+a.L.T("newtask.gh.step2")).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S2, t.S3, 0, t.S3)
		ui.Row(c.Key("nt-gh-code")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S2, t.S1, t.S3).Children(func() {
			ui.Text(c, g.code).Font(t.Mono).FontSize(t.XL).FontWeight(700).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0).Label(g.code)
			label := a.L.T("newtask.gh.copy")
			if g.copied {
				label = a.L.T("newtask.gh.copied")
			}
			if a.buttonFor(c, label, a.L.T("newtask.gh.copy")+" "+g.code, btnSecondary, t.ControlSM, t.Surface) {
				c.WriteClipboard(g.code)
				g.copied = true
			}
		})
		ui.Row(c.Key("nt-gh-wait")).Gap(t.S2).AlignItems(ui.Start).Padding(t.S2, t.S3, t.S1, t.S3).Children(func() {
			ui.Spinner(c).Size(12, 12)
			ui.Text(c, a.L.T("newtask.gh.waiting")).FontSize(t.XS).TextColor(t.InkMuted).Grow(1).MinWidth(0)
		})
	case "token":
		in := ui.TextInput(c.Key("nt-gh-token"), &g.token).Placeholder("ghp_… / github_pat_…").Label(a.L.T("newtask.gh.key")).
			Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
			Font(t.Mono).FontSize(t.MonoSM).ReadOnly(g.cid != "").Margin(t.S1, t.S2, 0, t.S2).OnSubmit(func() { a.sendGitToken() })
		in.Password()
		if g.focus {
			in.Focus()
			g.focus = false
		}
		line("nt-gh-token-line", a.L.T("newtask.gh.key.line", a.computerName(g.device)), t.InkMuted)
		if g.err != "" {
			line("nt-gh-err", g.err, t.Failed.Ink)
		}
	case "failed":
		line("nt-gh-err", g.err, t.Failed.Ink)
	}
	a.panelFoot(c, "nt-gh-foot", func() {
		switch g.phase {
		case "code", "starting":
			if a.button(c, a.L.T("newtask.gh.key"), btnText, t.ControlSM, t.Surface) {
				a.send(protocol.GitLogin{T: "git_login", Action: "cancel", Device: a.deviceArg(g.device)})
				g.phase, g.cid, g.focus, g.err = "token", "", true, ""
			}
		default:
			if g.cid == "" && a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
				a.nt.login = nil
			}
		}
	}, func() {
		switch g.phase {
		case "code", "starting":
			if a.button(c, a.L.T("newtask.gh.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				a.cancelGitLogin()
			}
		case "token":
			if g.cid != "" {
				ui.Spinner(c).Size(12, 12)
			} else if a.button(c, a.L.T("newtask.gh.key.go"), btnPrimary, t.ControlSM, t.Surface) {
				a.sendGitToken()
			}
		case "failed":
			if a.button(c, a.L.T("newtask.gh.again"), btnPrimary, t.ControlSM, t.Surface) {
				a.startGitLogin(g.device)
			}
		}
	})
}
