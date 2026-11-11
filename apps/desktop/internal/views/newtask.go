package views

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 开一件事 / New task (D128, redone by D185, design/new-task.md): the user
// starts a task with their own words. The words come first (focused), then
// one row of pills: where (a folder, recent first; 加一个文件夹… makes a
// project, D186), its branch, the computer when the choice is real (D157),
// who does it, and when it starts (现在 / Now by default; a time, a
// schedule, when something happens, or keep going until). ⌘↩ starts and
// opens it; ⇧⌘↩ starts it and keeps the card for the next one.

// newTaskState is the card's own state.
type newTaskState struct {
	open bool
	// words are what the user typed; kept when the card closes without
	// starting, so a slip of Esc loses nothing.
	words string
	// placeKey is the chosen place ("" = the first offered, noneKey = no
	// particular place); prefill is a place to offer even when the server
	// doesn't list it (a task's own, ⌘N inside it).
	placeKey  string
	prefill   *protocol.Place
	placeOpen bool
	// branch is the picked base branch ("" = the repo's default);
	// branchOpen shows the branch list.
	branch     string
	branchOpen bool
	// pick is the agent the user chose (ntKey); "" = the top candidate.
	// It is remembered for the next card (D185).
	pick    string
	whoOpen bool
	// D202: the model and effort picked for the chosen agent ("" = the
	// remembered one, else the suggestion and the model's own default;
	// effort "default" = the model's own over a remembered level);
	// pending is an agent on another computer waiting for a folder there,
	// placeOnly that computer's id (the folder list shows only its places).
	model, effort      string
	pending, placeOnly string
	// computer is the computer the user chose (a device id; "" = the
	// suggested one), and computerOpen shows the list (D157).
	computer     string
	computerOpen bool
	// D185: when it starts. when is "" (now), "at", "every", "when" or
	// "until"; atDay 0 today, 1 tomorrow, 2 the day after; every 0 every
	// day, 1 weekdays, 2 weekly (on weekday), 3 every few hours (hours,
	// an index of everyHours); condition is what it waits for or keeps
	// going until.
	when      string
	whenOpen  bool
	atDay     int
	atTime    string
	every     int
	weekday   int
	hours     int
	condition string
	focusCond bool
	// again: the start in flight keeps the card (⇧⌘↩); started is the line
	// that says what just started, startedTask the task to open from it.
	again       bool
	started     string
	startedTask string
	// adding is the clientId of a project_add in flight (D186).
	adding string
	// D203: browse is 找一个文件夹… looking through a computer (the place
	// list shows it instead of the places); wantBranch the branch to keep
	// once the copy picked on another computer says its branches.
	browse     *ntBrowse
	wantBranch string
	// D204: clone is 从 Git 地址加… taking an address (the place list
	// shows its field instead of the places); a clone in flight outlives
	// the list closing, and its place is picked when it lands.
	clone *ntClone
	// sending is the clientId of the task_new in flight; err the line under
	// Start when it didn't open.
	sending string
	err     string
	// errEmpty: err is the empty-words line (it goes once there are words).
	errEmpty bool
	focus    bool
	seq      int
}

// everyHours are the "every few hours" a card offers.
var everyHours = []int{1, 2, 4, 8}

// returnTo is where Esc goes from a task the user just opened (New task,
// or `ducter open`): where they were.
type returnTo struct {
	task  string // the task opened
	route Route
	from  string // the task they were in, if any
}

const noneKey = "none"

func placeKey(p protocol.Place) string {
	d := p.Device
	if d == "" {
		d = "local"
	}
	switch p.Kind {
	case "repo":
		return d + " " + strings.TrimRight(p.RepoPath, "/")
	case "folder":
		return d + " " + strings.TrimRight(p.Path, "/")
	}
	return noneKey
}

// placePath is a folder place's path, "" for no folder.
func placePath(p protocol.Place) string {
	switch p.Kind {
	case "repo":
		return p.RepoPath
	case "folder":
		return p.Path
	}
	return ""
}

// OpenNewTask opens the New task card; at, when set, is the place it
// starts at (a group's "+", ⌘N inside a task).
func (a *App) OpenNewTask(at *protocol.Place) {
	nt := &a.nt
	if nt.open && at == nil {
		nt.focus = true
		return
	}
	words := nt.words
	*nt = newTaskState{open: true, words: words, focus: true, seq: nt.seq, atDay: 1, atTime: "9:00", weekday: 1, hours: 1}
	nt.pick = asAgentKey(a.Local.NewTaskWho())
	var ask *protocol.Place
	if at != nil && at.Kind == "none" {
		nt.placeKey = noneKey
	}
	if at != nil && (at.Kind == "repo" || at.Kind == "folder") {
		p := protocol.Place{Kind: at.Kind, Device: at.Device, RepoPath: at.RepoPath, Path: at.Path}
		nt.prefill, nt.placeKey, ask = &p, placeKey(p), &p
		if at.BaseBranch != "" {
			nt.branch = at.BaseBranch
		}
	}
	a.send(protocol.TaskNewOptions{T: "task_new_options", Place: ask})
}

// NewTaskShortcut is ⌘N: inside an opened task, the card starts at that
// task's place; anywhere else, at the most recent one.
func (a *App) NewTaskShortcut() {
	if !a.S.Welcomed {
		return
	}
	if a.Route == RouteTask {
		if task := a.S.Task(a.TaskID); task != nil {
			p := task.Place()
			a.OpenNewTask(&p)
			return
		}
	}
	a.OpenNewTask(nil)
}

// newTaskPlaces are the places the card offers: the server's, with a
// prefilled place first when it isn't among them.
func (a *App) newTaskPlaces() []protocol.PlaceChoice {
	nt := &a.nt
	var places []protocol.PlaceChoice
	if o := a.S.NewTaskOptions; o != nil {
		places = o.Places
	}
	if nt.prefill != nil {
		k := placeKey(*nt.prefill)
		found := false
		for _, p := range places {
			if placeKey(p.Place) == k {
				found = true
			}
		}
		if !found {
			places = append([]protocol.PlaceChoice{{Place: *nt.prefill, Name: lastPath(placePath(*nt.prefill))}}, places...)
		}
	}
	if len(places) == 0 || places[len(places)-1].Place.Kind != "none" {
		places = append(places, protocol.PlaceChoice{Place: protocol.Place{Kind: "none"}})
	}
	return places
}

// chosenPlace is the place the card starts the task at.
func (a *App) chosenPlace(places []protocol.PlaceChoice) protocol.PlaceChoice {
	if a.nt.placeKey != "" {
		for _, p := range places {
			if placeKey(p.Place) == a.nt.placeKey {
				return p
			}
		}
	}
	return places[0]
}

// placeName is a place as the card says it: the folder's name, or 不用文件夹.
func (a *App) placeName(p protocol.PlaceChoice) string {
	if p.Place.Kind != "repo" && p.Place.Kind != "folder" {
		return a.L.T("newtask.nowhere")
	}
	return firstNonEmpty(p.Name, lastPath(placePath(p.Place)))
}

// topCandidate is the best fit that can take it, or nil.
func topCandidate(cands []protocol.Candidate) *protocol.Candidate {
	for i := range cands {
		if cands[i].Blocked == "" {
			return &cands[i]
		}
	}
	return nil
}

// ntKey is an agent's key on the card (with its computer when there are
// two); D202: one row per agent, its model picked under it.
func ntKey(cd protocol.Candidate) string {
	if cd.Device != "" {
		return cd.Device + "|" + cd.Harness
	}
	return cd.Harness
}

// ntCands is who the card offers, one row per agent: with two or more
// computers, the agents on the chosen one, then those that can only on
// another (D157, D202).
func (a *App) ntCands(cands []protocol.Candidate) (rows []protocol.Candidate, elsewhere map[string]bool) {
	if !whereRows(cands) {
		return firstPerAgent(cands), nil
	}
	return ntWho(cands, a.ntComputer(cands))
}

// chosenCandidate is who does it: the user's pick, else the top one.
func (a *App) chosenCandidate(cands []protocol.Candidate) (cd *protocol.Candidate, picked bool) {
	cands, _ = a.ntCands(cands)
	top := topCandidate(cands)
	if a.nt.pick != "" {
		for i := range cands {
			if ntKey(cands[i]) == a.nt.pick && cands[i].Blocked == "" {
				return &cands[i], top == nil || ntKey(*top) != a.nt.pick
			}
		}
	}
	return top, false
}

// clockRe is a time as people type it: 9, 9:00, 21:30, 9.30, 9：30.
var clockRe = regexp.MustCompile(`^\s*(\d{1,2})(?:\s*[:.：]\s*(\d{2}))?\s*$`)

// parseClock is a typed time as "HH:MM", or "" when it isn't one.
func parseClock(s string) string {
	m := clockRe.FindStringSubmatch(s)
	if m == nil {
		return ""
	}
	h, _ := strconv.Atoi(m[1])
	mm := 0
	if m[2] != "" {
		mm, _ = strconv.Atoi(m[2])
	}
	if h > 23 || mm > 59 {
		return ""
	}
	return fmt.Sprintf("%02d:%02d", h, mm)
}

// ntWhen is the card's when as the frame says it (nil: now), or a line
// saying what is missing.
func (a *App) ntWhen() (*protocol.NewTaskWhen, string) {
	nt := &a.nt
	switch nt.when {
	case "at", "every":
		at := parseClock(nt.atTime)
		if at == "" {
			return nil, a.L.T("newtask.err.time")
		}
		if nt.when == "at" {
			day := a.Now().AddDate(0, 0, nt.atDay)
			return &protocol.NewTaskWhen{Kind: "at", Date: day.Format("2006-01-02"), Time: at, TZ: localZone()}, ""
		}
		w := &protocol.NewTaskWhen{Kind: "every", Every: [...]string{"day", "weekday", "week", "hours"}[nt.every], Time: at, TZ: localZone()}
		if nt.every == 2 {
			w.Days = []int{nt.weekday}
		}
		if nt.every == 3 {
			// Every few hours, round the clock: counted from midnight.
			w.Hours, w.Time = everyHours[nt.hours], "00:00"
		}
		return w, ""
	case "when", "until":
		cond := strings.TrimSpace(nt.condition)
		if cond == "" {
			return nil, a.L.T("newtask.err.no_condition")
		}
		return &protocol.NewTaskWhen{Kind: nt.when, Condition: cond}, ""
	}
	return nil, ""
}

// StartNewTask sends what the card holds; again keeps the card open for
// the next one (⇧⌘↩). It reports whether it went.
func (a *App) StartNewTask(again ...bool) bool {
	nt := &a.nt
	if nt.sending != "" {
		return false
	}
	words := strings.TrimSpace(nt.words)
	if words == "" {
		nt.err, nt.errEmpty = a.L.T("newtask.err.empty"), true
		nt.focus = true
		return false
	}
	if !a.S.Welcomed || a.Status != client.Connected {
		nt.err = a.L.T("newtask.err.conn")
		return false
	}
	when, bad := a.ntWhen()
	if bad != "" {
		nt.err, nt.errEmpty = bad, false
		return false
	}
	f := protocol.TaskNew{T: "task_new", Words: words, When: when}
	// D206: the pictures on the card go with the words, once they're all up.
	if atts := a.med().trays["nt"]; len(atts) > 0 {
		if anyFailed(atts) {
			nt.err, nt.errEmpty = a.L.T("media.failed"), false
			return false
		}
		if !allReady(atts) {
			nt.err, nt.errEmpty = a.L.T("media.sending"), false
			return false
		}
		f.Media = idsOf(atts)
	}
	place := a.chosenPlace(a.newTaskPlaces())
	switch place.Place.Kind {
	case "repo":
		p := protocol.Place{Kind: "repo", Device: place.Place.Device, RepoPath: place.Place.RepoPath}
		if nt.branch != "" && nt.branch != place.DefaultBranch {
			p.BaseBranch = nt.branch
		}
		f.Place = &p
	case "folder":
		p := protocol.Place{Kind: "folder", Device: firstNonEmpty(place.Place.Device, "local"), Path: place.Place.Path}
		f.Place = &p
	}
	var cands []protocol.Candidate
	if o := a.S.NewTaskOptions; o != nil {
		cands = o.Candidates
	}
	// An agent picked on another computer is the user's pick even when it is that computer's best.
	// D202: the model and effort go only when they differ from the suggestion and the model's default.
	if cd, picked := a.chosenCandidate(cands); cd != nil {
		model, effort, listed := a.ntSendTune(cd)
		if picked || (nt.pick != "" && nt.computer != "") || model != "" || effort != "" {
			f.Harness, f.Model, f.Effort = cd.Harness, model, effort
			if !listed {
				f.Model = cd.Model
			}
		}
	}
	// D157: No folder with two or more computers: the computer chosen (or suggested) goes with it.
	if place.Place.Kind == "none" && whereRows(cands) {
		f.Place = &protocol.Place{Kind: "none", Device: a.ntDevice(a.ntComputer(cands))}
	}
	a.nextClient++
	nt.sending = fmt.Sprintf("n%d-%d", a.Now().UnixMilli(), a.nextClient)
	f.ClientID = nt.sending
	nt.again = len(again) > 0 && again[0]
	nt.err, nt.errEmpty, nt.started, nt.startedTask = "", false, "", ""
	nt.placeOpen, nt.branchOpen, nt.whoOpen, nt.whenOpen, nt.computerOpen = false, false, false, false, false
	a.send(f)
	return true
}

// drainNewTask takes the server's answers: an opened task closes the card
// and shows that task (or, started with ⇧⌘↩, stays for the next one); a
// schedule closes it on On hand; a refusal stays on the card, in one line.
// A folder added as a project (D186) becomes the chosen place.
func (a *App) drainNewTask() {
	nt := &a.nt
	a.drainBrowse()
	// D203: the copy picked on another computer says its branches now: keep the branch it has.
	if nt.wantBranch != "" {
		if ch := a.chosenPlace(a.newTaskPlaces()); ch.Branches != nil {
			if hasString(ch.Branches, nt.wantBranch) && nt.wantBranch != ch.DefaultBranch {
				nt.branch = nt.wantBranch
			}
			nt.wantBranch = ""
		}
	}
	res := a.S.NewTaskResults
	a.S.NewTaskResults = nil
	for _, r := range res {
		if r.T == "project_clone_result" {
			a.cloneDone(r)
			continue
		}
		if r.T == "project_add_result" {
			if r.ClientID == "" || r.ClientID != nt.adding {
				continue
			}
			nt.adding = ""
			if r.OK && r.Place != nil {
				// D203: a folder found on the computer an agent waits on picks that agent.
				if nt.pending != "" && a.placeComputer(r.Place.Place) == nt.placeOnly {
					nt.pick = nt.pending
					a.Local.SetNewTaskWho(nt.pick)
				}
				if nt.browse != nil {
					nt.browse, nt.placeOpen, nt.pending, nt.placeOnly = nil, false, "", ""
				}
				nt.placeKey, nt.branch, nt.prefill, nt.wantBranch = placeKey(r.Place.Place), "", nil, ""
				pl := r.Place.Place
				a.send(protocol.TaskNewOptions{T: "task_new_options", Place: &pl})
				continue
			}
			if r.Reason == "old" {
				dev := ""
				if nt.browse != nil {
					dev = nt.browse.device
				}
				nt.err, nt.errEmpty = a.L.T("newtask.old", a.computerName(firstNonEmpty(dev, nt.placeOnly))), false
				continue
			}
			nt.err, nt.errEmpty = a.newTaskError(r.Reason, r.Message), false
			continue
		}
		if r.ClientID != nt.sending || nt.sending == "" {
			continue
		}
		nt.sending = ""
		if r.OK && (r.TaskID != "" || r.RoutineID != "") {
			a.takeTray("nt") // they went with it
			title := ""
			if r.Card != nil {
				title = r.Card.Title
			}
			if r.Routine != nil {
				title = r.Routine.Name
			}
			if nt.again {
				nt.words, nt.condition, nt.err = "", "", ""
				nt.seq++
				nt.focus = true
				if r.Routine != nil {
					nt.started = a.L.T("newtask.scheduled", r.Routine.TriggerWords, title)
				} else {
					nt.started, nt.startedTask = a.L.T("newtask.opened", title), r.TaskID
				}
				continue
			}
			nt.open, nt.words, nt.err = false, "", ""
			nt.seq++
			if r.TaskID != "" {
				a.openFromElsewhere(r.TaskID)
			} else {
				// A start later or on a schedule lives on On hand (its routine card).
				a.Route = RouteOnHand
			}
			continue
		}
		nt.err, nt.errEmpty = a.newTaskError(r.Reason, r.Message), false
	}
	for _, id := range a.S.OpenRequests {
		a.openFromElsewhere(id)
		if a.Desktop != nil {
			a.Desktop.Focus()
		}
	}
	a.S.OpenRequests = nil
}

// openFromElsewhere opens a task the user didn't tap on this screen (the
// one they just started, or `ducter open`), remembering where they were.
func (a *App) openFromElsewhere(id string) {
	back := &returnTo{task: id, route: a.Route}
	if a.Route == RouteTask {
		back.from = a.TaskID
	}
	if a.Route == RouteTask && a.TaskID == id {
		back = a.back
	}
	a.OpenTask(id)
	a.back = back
}

func (a *App) newTaskError(reason, message string) string {
	switch reason {
	case "empty", "no_agent", "not_repo", "offline", "past", "no_condition", "not_found":
		return a.L.T("newtask.err." + reason)
	}
	if message == "" {
		return a.L.T("newtask.err.unknown")
	}
	return a.L.T("newtask.err.failed", strings.TrimRight(message, ". "))
}

// folderAdd says how 加一个文件夹… works from this window (D186, D197):
// "here": the Ducter this window talks to runs on this Mac, so its paths
// are ours; "worker": it runs elsewhere and this Mac does tasks for it, so
// the folder picked is this Mac's and the home reads it through this Mac's
// worker (device, its id there); "off": it runs elsewhere and this Mac
// doesn't do tasks for it yet (the row shows greyed, with the one step);
// "": no folder picker here.
func (a *App) folderAdd() (mode, device string) {
	if a.PickFolder == nil {
		return "", ""
	}
	if a.onThisMachine() {
		return "here", ""
	}
	if a.MacWorker == nil {
		return "", ""
	}
	if on, id := a.workOn(); on && id != "" {
		return "worker", id
	}
	return "off", ""
}

// canAddFolder: a folder can be picked here and made a project.
func (a *App) canAddFolder() bool {
	m, _ := a.folderAdd()
	return m == "here" || m == "worker"
}

// addFolder asks macOS for a folder and adds it as a project; the card
// then starts there.
func (a *App) addFolder() {
	nt := &a.nt
	nt.placeOpen = false
	mode, device := a.folderAdd()
	if mode != "here" && mode != "worker" {
		return
	}
	done := func(path string, err error) {
		if err != nil || strings.TrimSpace(path) == "" {
			return
		}
		a.nextClient++
		nt.adding = fmt.Sprintf("p%d-%d", a.Now().UnixMilli(), a.nextClient)
		nt.err, nt.errEmpty = "", false
		// D197: a folder on this Mac for a home elsewhere goes with this Mac's worker id.
		a.send(protocol.ProjectAdd{T: "project_add", Path: path, Device: device, ClientID: nt.adding})
	}
	if a.Win == nil { // tests: inline
		done(a.PickFolder(a.L.T("newtask.addfolder.title"), a.L.T("newtask.addfolder.button")))
		return
	}
	go func() {
		path, err := a.PickFolder(a.L.T("newtask.addfolder.title"), a.L.T("newtask.addfolder.button"))
		a.Win.Update(func() { done(path, err) })
	}()
}

// newTaskCard is the card over the page, while open.
func (a *App) newTaskCard(c *ui.Context) {
	nt := &a.nt
	a.drainNewTask()
	if !nt.open {
		return
	}
	// "Say what it should do first" holds only while there are no words.
	if nt.errEmpty && strings.TrimSpace(nt.words) != "" {
		nt.err, nt.errEmpty = "", false
	}
	switch {
	case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyEnter):
		a.StartNewTask(true)
	case c.Shortcut(ui.Cmd, ui.KeyEnter):
		a.StartNewTask()
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	width := min(w-2*t.S6, 680)
	ui.DialogBase(c, &nt.open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(width).MaxHeight(h-2*t.S6).Padding(t.S5+4, t.S6, t.S5, t.S6).Gap(t.S4).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("newtask.title"))
		a.enter(c, panel)
		a.heading(c, a.L.T("newtask.title"), t.XL)
		a.wordsField(c)
		a.newTaskPills(c)
		if nt.when != "" {
			a.whenDetail(c)
		}
		a.newTaskFoot(c)
	})
	if !nt.open {
		nt.placeOpen, nt.branchOpen, nt.whoOpen, nt.whenOpen, nt.computerOpen = false, false, false, false, false
	}
}

// shut closes every list but the one named (one list open at a time).
func (nt *newTaskState) shut(keep string) {
	nt.placeOpen = keep == "place" && !nt.placeOpen
	nt.branchOpen = keep == "branch" && !nt.branchOpen
	nt.whoOpen = keep == "who" && !nt.whoOpen
	nt.whenOpen = keep == "when" && !nt.whenOpen
	nt.computerOpen = keep == "computer" && !nt.computerOpen
}

// newTaskPills is the one row under the words: where, its branch, the
// computer (only when the choice is real), who, and when.
func (a *App) newTaskPills(c *ui.Context) {
	t := a.T
	places := a.newTaskPlaces()
	place := a.chosenPlace(places)
	ui.Row(c.Key("nt-pills")).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		a.placePill(c, places, place)
		if place.Place.Kind == "repo" {
			a.branchPill(c, place)
		}
		a.computerPill(c, place)
		a.whoPill(c)
		a.whenPill(c)
	})
}

// placePill is 在哪儿做 / Where: the chosen folder; its list is the
// folders tasks used and the projects added, most recent first, then 不用
// 文件夹 / No folder, then 加一个文件夹… / Add a folder… (D186).
func (a *App) placePill(c *ui.Context, places []protocol.PlaceChoice, chosen protocol.PlaceChoice) {
	t := a.T
	nt := &a.nt
	name := a.placeName(chosen)
	e, click := a.pill(c, "nt-place", a.L.T("newtask.where")+" · "+name, nt.placeOpen, func() {
		a.glyph(c, 16, drawFolder(t.InkMuted))
		ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().MaxWidth(200).AccessHidden(true)
		if nt.adding != "" {
			ui.Spinner(c).Size(12, 12)
		}
	})
	if line := placeLine(chosen); line != "" {
		e.Tooltip(line)
	}
	dropIdle := func() {
		nt.pending, nt.placeOnly, nt.browse = "", "", nil
		if nt.clone != nil && nt.clone.cid == "" {
			nt.clone = nil
		}
	}
	if click {
		nt.shut("place")
		dropIdle()
	}
	if !nt.placeOpen {
		dropIdle()
		return
	}
	ck := placeKey(chosen.Place)
	// D202: an agent on another computer waits for a folder there: only that computer's places.
	only := nt.placeOnly
	title := a.L.T("newtask.where")
	onlyName := ""
	if only != "" {
		if d := a.computerOf(only); d != nil {
			onlyName = d.Name
		}
		title = a.L.T("newtask.agent.needsfolder", onlyName)
	}
	if nt.browse != nil {
		title = a.L.T("newtask.find.title", a.browseName())
	}
	if nt.clone != nil {
		title = a.L.T("newtask.clone.title", a.computerName(nt.clone.device))
	}
	// D203: the repos computers reported fill the list after the used and
	// added ones, up to 12 rows (all of one computer's while an agent
	// waits there); 找一个文件夹… finds any other.
	room, shownN := 12, 0
	for _, p := range places {
		if !p.Found && p.Place.Kind != "none" {
			room--
		}
	}
	a.listPanel(c, e, &nt.placeOpen, title, 360, func() {
		if nt.clone != nil {
			a.cloneField(c)
			return
		}
		if nt.browse != nil {
			a.folderBrowser(c)
			return
		}
		for _, p := range places {
			if p.Place.Kind == "none" {
				continue // last, after the ways to get a folder
			}
			if only == "" && p.Found && placeKey(p.Place) != ck {
				if room <= 0 {
					continue
				}
				room--
			}
			p := p
			if only != "" && a.placeComputer(p.Place) != only {
				continue
			}
			k := placeKey(p.Place)
			name := a.placeName(p)
			if a.menuRow(c, "nt-place:"+k, name, k == ck, false, func() {
				a.glyph(c, 16, drawFolder(t.InkMuted))
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
					if line := placeLine(p); line != "" {
						ui.Text(c, line).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine()
					}
				})
			}) {
				a.pickPlace(p) // the chosen one again just closes the list
			}
			shownN++
		}
		if shownN == 0 {
			// D203, D204: nothing there yet (a first run): say so, and offer the ways
			// to get one (this Mac's picker, Find a folder…, Add from a Git address…),
			// never a bare No folder.
			empty := a.L.T("newtask.empty")
			if only != "" {
				empty = a.L.T("newtask.find.empty", onlyName)
			}
			ui.Text(c.Key("nt-place-empty"), empty).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
		}
		mode, dev := a.folderAdd()
		// Adding a folder there: only where the folder picked would be on that computer.
		if only != "" && !((mode == "worker" && dev == only) || (mode == "here" && a.computerOf(only) != nil && a.computerOf(only).Home)) {
			mode = ""
		}
		ui.Box(c.Key("nt-add-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
		if mode == "here" || mode == "worker" {
			if a.menuRow(c, "nt-add-folder", a.L.T("newtask.addfolder"), false, false, func() {
				a.glyph(c, 16, drawPlus(t.InkSoft))
				ui.Text(c, a.L.T("newtask.addfolder")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
			}) {
				a.addFolder()
			}
		}
		named := a.findRows(c, only)
		a.cloneRows(c, only, named || len(a.reachable(only, false)) > 1)
		a.oldRows(c, only)
		if only != "" {
			// No folder on that computer works for the agent too.
			if a.menuRow(c, "nt-place:none-on", a.L.T("newtask.nowhere")+" · "+onlyName, false, false, func() {
				a.glyph(c, 16, drawFolder(t.Faint))
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Text(c, a.L.T("newtask.nowhere")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
					ui.Text(c, a.L.T("newtask.agent.elsewhere", onlyName)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			}) {
				a.pickPlace(protocol.PlaceChoice{Place: protocol.Place{Kind: "none"}})
			}
		} else {
			none := protocol.PlaceChoice{Place: protocol.Place{Kind: "none"}}
			k := placeKey(none.Place)
			if a.menuRow(c, "nt-place:"+k, a.placeName(none), k == ck, false, func() {
				a.glyph(c, 16, drawFolder(t.Faint))
				ui.Text(c, a.placeName(none)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
			}) {
				a.pickPlace(none)
			}
		}
		switch mode {
		case "off":
			// D197: the home is elsewhere and this Mac doesn't do tasks for it, so the
			// folders here aren't reachable from it yet. Greyed, with the one step.
			why := a.L.T("newtask.addfolder.off", a.workHome())
			ui.Box(c.Key("nt-off-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
			a.menuRow(c, "nt-add-folder", a.L.T("newtask.addfolder")+" · "+why, false, true, func() {
				a.glyph(c, 16, drawPlus(t.InkSoft))
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Text(c, a.L.T("newtask.addfolder")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
					ui.Text(c, why).FontSize(t.XS).TextColor(t.InkMuted)
				})
			})
		}
	})
}

// pickPlace makes p the card's place and asks who could do it there.
// D202: an agent that waited for a folder on its computer is picked with it.
func (a *App) pickPlace(p protocol.PlaceChoice) {
	nt := &a.nt
	nt.placeOpen, nt.browse, nt.wantBranch = false, nil, ""
	if nt.pending != "" {
		if p.Place.Kind == "none" && nt.placeOnly != "" {
			nt.computer = nt.placeOnly
		}
		if p.Place.Kind == "none" || a.placeComputer(p.Place) == nt.placeOnly {
			nt.pick = nt.pending
			a.Local.SetNewTaskWho(nt.pick)
		}
	}
	nt.pending, nt.placeOnly = "", ""
	if placeKey(p.Place) == placeKey(a.chosenPlace(a.newTaskPlaces()).Place) {
		return
	}
	nt.placeKey, nt.branch, nt.branchOpen = placeKey(p.Place), "", false
	pl := p.Place
	var ask *protocol.Place
	if pl.Kind == "repo" || pl.Kind == "folder" {
		ask = &pl
	}
	a.send(protocol.TaskNewOptions{T: "task_new_options", Place: ask})
}

// branchPill is what a repo task starts from: the repo's default branch
// unless picked; its list is the 30 most recently committed.
func (a *App) branchPill(c *ui.Context, p protocol.PlaceChoice) {
	t := a.T
	nt := &a.nt
	branch := firstNonEmpty(nt.branch, p.DefaultBranch)
	if branch == "" {
		return
	}
	e, click := a.pill(c, "nt-branch", a.L.T("newtask.branch.title")+" · "+branch, nt.branchOpen, func() {
		a.glyph(c, 14, drawBranch(t.InkMuted))
		ui.Text(c, branch).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).SingleLine().MaxWidth(180).AccessHidden(true)
	})
	if click && len(p.Branches) > 0 {
		nt.shut("branch")
	}
	if !nt.branchOpen {
		return
	}
	a.listPanel(c, e, &nt.branchOpen, a.L.T("newtask.branch.title"), 320, func() {
		for _, b := range p.Branches {
			b := b
			if a.menuRow(c, "nt-branch:"+b, b, b == branch, false, func() {
				ui.Text(c, b).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
				if b == p.DefaultBranch {
					ui.Text(c, a.L.T("newtask.branch.default")).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
				}
			}) {
				nt.branch, nt.branchOpen = b, false
				if b == p.DefaultBranch {
					nt.branch = ""
				}
			}
		}
	})
}

// computerPill is the computer, only when the choice is real (D157): No
// folder with two or more computers that run tasks.
func (a *App) computerPill(c *ui.Context, place protocol.PlaceChoice) {
	t := a.T
	nt := &a.nt
	var cands []protocol.Candidate
	if o := a.S.NewTaskOptions; o != nil {
		cands = o.Candidates
	}
	if place.Place.Kind != "none" || !a.manyComputers() || !whereRows(cands) {
		return
	}
	d := a.computerOf(a.ntComputer(cands))
	if d == nil {
		return
	}
	e, click := a.pill(c, "nt-comp", a.L.T("newtask.computer")+" · "+d.Name, nt.computerOpen, func() {
		a.glyph(c, 14, drawScreen(t.InkMuted))
		ui.Text(c.Key("nt-comp-part"), d.Name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().AccessHidden(true)
	})
	if click {
		nt.shut("computer")
	}
	if nt.computerOpen {
		a.computerList(c, e, cands, nil)
	}
}

// whoPill is 谁来做 / Who does it: the chosen agent's coin, its name, model
// and effort, the best fit tagged 推荐 / Suggested (why on hover); its list
// has every agent, one row each, best first: those at that place, then
// those on another computer (在 {computer} 上, D202), then those that can't,
// greyed with why. Under the chosen one, its Model and Effort rows.
func (a *App) whoPill(c *ui.Context) {
	t := a.T
	nt := &a.nt
	o := a.S.NewTaskOptions
	if o == nil {
		ui.Row(c.Key("nt-who-wait")).Height(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("newtask.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		})
		return
	}
	chosen, picked := a.chosenCandidate(o.Candidates)
	cands, elsewhere := a.ntCands(o.Candidates)
	if chosen == nil && len(elsewhere) == 0 {
		ui.Row(c.Key("nt-who-none")).Height(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("newtask.nobody")).FontSize(t.SM).TextColor(t.InkSoft)
		})
		return
	}
	top := topCandidate(cands)
	name := a.L.T("newtask.pickwho")
	if chosen != nil {
		name = a.whoLabel(*chosen)
	}
	e, click := a.pill(c, "nt-who", a.L.T("newtask.who")+" · "+name, nt.whoOpen, func() {
		if chosen != nil {
			if bmp := theme.Clay(coinArt(chosen.Harness, false)); bmp != nil {
				ui.Image(c, bmp).Size(22, 22).Shrink(0).AccessHidden(true)
			}
		}
		ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().AccessHidden(true)
		if chosen != nil && !picked && a.tuneIsDefault(*chosen) {
			a.suggestedTag(c)
		}
	})
	if chosen != nil && picked {
		e.Tooltip(a.L.T("newtask.picked", name))
	} else if chosen != nil {
		if why := a.candReason(*chosen); why != "" {
			e.Tooltip(why)
		}
	}
	if click {
		nt.shut("who")
	}
	if !nt.whoOpen {
		return
	}
	place := a.chosenPlace(a.newTaskPlaces())
	a.listPanel(c, e, &nt.whoOpen, a.L.T("newtask.who"), 440, func() {
		for i := range cands {
			cd := cands[i]
			k := ntKey(cd)
			away := elsewhere[k] // D157, D202: it can only on another computer
			off := cd.Blocked != "" && !away
			best := top != nil && k == ntKey(*top)
			on := !off && chosen != nil && k == ntKey(*chosen)
			cname := harnessName(cd.Harness)
			why := a.candReason(cd)
			if away {
				why = a.awayLine(cd, place)
			}
			if a.menuRow(c, "nt-cand:"+k, cname, on, off, func() {
				if bmp := theme.Clay(coinArt(cd.Harness, off)); bmp != nil {
					img := ui.Image(c, bmp).Size(28, 28).Shrink(0)
					if off && !coinKnown(cd.Harness) {
						img.Grayscale()
					}
				}
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						ui.Text(c, cname).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
						if away {
							ui.Text(c, a.L.T("newtask.agent.elsewhere", cd.DeviceName)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
						}
						if best {
							a.suggestedTag(c)
						}
					})
					if why != "" {
						ui.Text(c, why).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
					}
					// D206: the card holds pictures and this one can't see them.
					if cd.NoImages && len(a.med().trays["nt"]) > 0 {
						ui.Text(c, a.L.T("media.noImages")).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft)
					}
				})
			}) {
				a.pickAgent(cd, top, away)
			}
			if on {
				a.tuneRows(c, cd)
			}
		}
	})
}

// awayLine is the helper line of an agent on another computer (D202): for
// No folder, its own reason; for a folder, the copy it switches to there,
// or that the folder must be on that computer.
func (a *App) awayLine(cd protocol.Candidate, place protocol.PlaceChoice) string {
	if place.Place.Kind == "none" {
		cd.Blocked = ""
		return a.candReason(cd)
	}
	if cp := a.ntCopyOn(cd.Device, place); cp != nil {
		return a.L.T("newtask.agent.copy", cd.DeviceName, a.placeName(*cp))
	}
	return a.L.T("newtask.agent.needsfolder", cd.DeviceName)
}

// suggestedTag is 推荐 / Suggested on the best fit.
func (a *App) suggestedTag(c *ui.Context) {
	t := a.T
	ui.Row(c.Key("nt-suggested")).Padding(2, t.S1+3).Radius(6).Background(t.Highlight).Shrink(0).AccessHidden(true).Children(func() {
		ui.Text(c, a.L.T("newtask.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.HighlightInk).SingleLine()
	})
}

// whenKinds are the ways it can start, in the list's order.
var whenKinds = []string{"", "at", "every", "when", "until"}

// whenLabel is the when pill's words: 现在 / Now, 明天 9:00, 工作日 9:00,
// 等：PR #1592 的 CI 通过, 直到：测试都过.
func (a *App) whenLabel() string {
	nt := &a.nt
	clock := parseClock(nt.atTime)
	if clock == "" {
		clock = strings.TrimSpace(nt.atTime)
	}
	clock = strings.TrimPrefix(clock, "0")
	switch nt.when {
	case "at":
		return a.L.T("newtask.day."+strconv.Itoa(nt.atDay)) + " " + clock
	case "every":
		switch nt.every {
		case 1:
			return a.L.T("newtask.pill.weekdays", clock)
		case 2:
			return a.L.T("newtask.pill.weekly", a.L.T("newtask.weekday."+strconv.Itoa(nt.weekday)), clock)
		case 3:
			return a.L.T("newtask.pill.hours", everyHours[nt.hours])
		}
		return a.L.T("newtask.pill.daily", clock)
	case "when", "until":
		// The condition is in its own field right under the pills.
		return a.L.T("newtask.when." + nt.when)
	}
	return a.L.T("newtask.when.now")
}

// whenPill is 什么时候开始 / When it starts (D185): 现在 / Now unless set.
func (a *App) whenPill(c *ui.Context) {
	t := a.T
	nt := &a.nt
	label := a.whenLabel()
	e, click := a.pill(c, "nt-when", a.L.T("newtask.when")+" · "+label, nt.whenOpen, func() {
		a.glyph(c, 14, drawClock(t.InkMuted))
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().MaxWidth(220).AccessHidden(true)
	})
	if click {
		nt.shut("when")
	}
	if !nt.whenOpen {
		return
	}
	a.listPanel(c, e, &nt.whenOpen, a.L.T("newtask.when"), 340, func() {
		for _, k := range whenKinds {
			k := k
			key := firstNonEmpty(k, "now")
			if a.menuRow(c, "nt-when:"+key, a.L.T("newtask.when."+key), nt.when == k, false, func() {
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Text(c, a.L.T("newtask.when."+key)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
					ui.Text(c, a.L.T("newtask.when."+key+".help")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			}) {
				nt.when, nt.whenOpen = k, false
				nt.err, nt.errEmpty = "", false
				nt.focusCond = k == "when" || k == "until"
			}
		}
	})
}

// whenDetail is the one line under the pills that says the time or the
// condition, only when it doesn't start now.
func (a *App) whenDetail(c *ui.Context) {
	t := a.T
	nt := &a.nt
	timeField := func() {
		in := ui.TextInput(c.Key(fmt.Sprintf("nt-time:%d", nt.seq)), &nt.atTime).Placeholder("9:00").Label(a.L.T("newtask.at")).
			Height(t.ControlMD).Width(96).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
			FontSize(t.MD).FontFeatures("tnum").TextAlign(ui.Center)
		if in.Changed() {
			nt.err = ""
		}
	}
	ui.Row(c.Key("nt-when-detail")).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		switch nt.when {
		case "at":
			if i := a.choices(c, "nt-day", a.L.T("newtask.when.at"), []string{a.L.T("newtask.day.0"), a.L.T("newtask.day.1"), a.L.T("newtask.day.2")}, nt.atDay); i >= 0 {
				nt.atDay = i
			}
			timeField()
		case "every":
			if i := a.choices(c, "nt-every", a.L.T("newtask.when.every"), []string{a.L.T("newtask.every.day"), a.L.T("newtask.every.weekday"), a.L.T("newtask.every.week"), a.L.T("newtask.every.hours")}, nt.every); i >= 0 {
				nt.every = i
			}
			switch nt.every {
			case 2:
				var days []string
				for _, d := range []int{1, 2, 3, 4, 5, 6, 0} {
					days = append(days, a.L.T("newtask.weekday.short."+strconv.Itoa(d)))
				}
				sel := (nt.weekday + 6) % 7
				if i := a.choices(c, "nt-weekday", a.L.T("newtask.every.week"), days, sel); i >= 0 {
					nt.weekday = (i + 1) % 7
				}
			case 3:
				var hs []string
				for _, h := range everyHours {
					hs = append(hs, a.L.T("newtask.hours", h))
				}
				if i := a.choices(c, "nt-hours", a.L.T("newtask.every.hours"), hs, nt.hours); i >= 0 {
					nt.hours = i
				}
			}
			if nt.every != 3 {
				timeField()
			}
		case "when", "until":
			ui.Text(c, a.L.T("newtask.cond.label."+nt.when)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
			in := ui.TextInput(c.Key(fmt.Sprintf("nt-cond:%s:%d", nt.when, nt.seq)), &nt.condition).Placeholder(a.L.T("newtask.cond."+nt.when)).
				Label(a.L.T("newtask.cond.label."+nt.when)).Height(t.ControlMD).Grow(1).Basis(0).MinWidth(220).Padding(0, t.S4).Radius(t.RadiusMD).
				Background(t.Bg).Border(1, t.LineSoft).FontSize(t.MD).OnSubmit(func() { a.StartNewTask() })
			if in.Changed() {
				nt.err = ""
			}
			if nt.focusCond {
				in.Focus()
				nt.focusCond = false
			}
		}
	})
}

// wordsField is 做什么 / What: the user's words, given to the task as
// they are. Return breaks the line; ⌘Return starts; ⇧⌘Return starts and
// keeps the card for the next one.
func (a *App) wordsField(c *ui.Context) {
	t := a.T
	nt := &a.nt
	what := ui.Column(c.Key("nt-what")).Gap(t.S2)
	over := a.takeDrops(what, "nt") // D206: a picture dropped on the What row goes with the words
	what.Children(func() {
		if over {
			a.dropHint(c)
		}
		ta := ui.TextArea(c.Key(fmt.Sprintf("nt-words:%d", nt.seq)), &nt.words).Lines(4, 10).MinHeight(0).
			Placeholder(a.L.T("newtask.placeholder")).Label(a.L.T("newtask.what")).
			Background(t.Bg).Border(1, t.LineSoft).Radius(t.RadiusMD).Padding(t.S3, t.S4).FontSize(t.Bubble).LineHeight(a.leading(1.5)).
			OnTextKey(func(k ui.TextKey) bool {
				if a.pictureKeys("nt", k) {
					return true
				}
				if k.Key == ui.KeyEnter && k.Mods&ui.Cmd != 0 {
					nt.words = k.Text()
					a.StartNewTask(k.Mods&ui.Shift != 0)
					return true
				}
				return false
			})
		if ta.Changed() {
			nt.err, nt.errEmpty = "", false
			nt.started, nt.startedTask = "", ""
		}
		if nt.focus {
			ta.Focus()
			nt.focus = false
		}
		a.picTray(c, "nt")
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("newtask.verbatim")).FontSize(t.XS).TextColor(t.InkMuted).Grow(1)
			a.addPicturesButton(c, "nt")
		})
	})
}

// newTaskFoot is one line on the left (what didn't work, what just
// started, or the keys), then Cancel and Start.
func (a *App) newTaskFoot(c *ui.Context) {
	t := a.T
	nt := &a.nt
	start := a.L.T("newtask.start")
	if nt.when == "at" || nt.when == "every" {
		start = a.L.T("newtask.schedule")
	}
	ui.Row(c.Key("nt-foot")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, 0, 0, 0).Children(func() {
		ui.Row(c.Key("nt-foot-line")).Grow(1).MinWidth(0).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			switch {
			case nt.err != "":
				ui.Text(c.Key("nt-err"), nt.err).FontSize(t.SM).LineHeight(1.45).TextColor(t.Failed.Ink).Shrink(1).MinWidth(0).MaxLines(2).Role(ui.RoleStatus)
			case nt.started != "":
				a.glyph(c, 14, drawCheck(t.Done.Ink))
				ui.Text(c.Key("nt-started"), nt.started).FontSize(t.SM).FontWeight(600).TextColor(t.Done.Ink).Shrink(1).MinWidth(0).SingleLine().Role(ui.RoleStatus)
				if nt.startedTask != "" && a.quietLink(c, "nt-open-started", a.L.T("newtask.open"), a.L.T("newtask.open")+" · "+nt.started) {
					id := nt.startedTask
					nt.open, nt.started, nt.startedTask = false, "", ""
					a.openFromElsewhere(id)
				}
			default:
				ui.Text(c, a.L.T("newtask.keys", start)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
			}
		})
		if nt.sending != "" {
			ui.Spinner(c).Size(16, 16)
			ui.Text(c, a.L.T("newtask.starting")).FontSize(t.MD).FontWeight(700).TextColor(t.InkMuted).Shrink(0)
			return
		}
		if a.button(c, a.L.T("newtask.cancel"), btnText, t.ControlMD, t.Surface) {
			nt.open, nt.err, nt.errEmpty, nt.started, nt.startedTask = false, "", false, "", ""
		}
		if a.buttonFor(c, start, a.L.T("newtask.title"), btnPrimary, t.ControlMD, t.Surface) {
			a.StartNewTask()
		}
	})
}

// tildePath shows a home path as ~/…: shorter, and no user name on screen.
// D197: ~ is the home folder of the computer the path is on, read from the
// path itself (/Users/<name> on a Mac, /home/<name> on Linux), never from
// this Mac's own home: a place may be on the server or another Mac. The
// web sheet uses the same rule.
func tildePath(p string) string {
	for _, root := range []string{"/Users/", "/home/"} {
		if !strings.HasPrefix(p, root) {
			continue
		}
		rest := p[len(root):]
		if j := strings.Index(rest, "/"); j > 0 {
			return "~" + rest[j:]
		}
		if rest != "" {
			return "~"
		}
	}
	return p
}

// placeLine is a place's second line in the card's list: its path, and
// the computer it is on when the places span more than one (D197).
func placeLine(p protocol.PlaceChoice) string {
	path := placePath(p.Place)
	if path == "" {
		return ""
	}
	if p.Computer != "" {
		return tildePath(path) + " · " + p.Computer
	}
	return tildePath(path)
}

// drawCaret is a small down caret: the chip opens a list.
func drawCaret(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		w := r.W
		cx, cy := r.X+w/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-w*0.38, cy-w*0.16)
		m.LineTo(cx, cy+w*0.22)
		m.LineTo(cx+w*0.38, cy-w*0.16)
		p.StrokePath(&m, 1.6, col)
	}
}

// drawFolder is a folder: where a task works.
func drawFolder(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		x, y := r.X, r.Y
		var m ui.Path
		m.MoveTo(x+2*s, y+4*s)
		m.LineTo(x+6*s, y+4*s)
		m.LineTo(x+7.5*s, y+5.5*s)
		m.LineTo(x+14*s, y+5.5*s)
		m.LineTo(x+14*s, y+12.5*s)
		m.LineTo(x+2*s, y+12.5*s)
		m.Close()
		p.StrokePath(&m, 1.5, col)
	}
}

// drawBranch is a branch: two commits, one forking off.
func drawBranch(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 14
		x, y := r.X, r.Y
		var m ui.Path
		m.MoveTo(x+4*s, y+2*s)
		m.LineTo(x+4*s, y+12*s)
		m.MoveTo(x+10*s, y+4.5*s)
		m.LineTo(x+10*s, y+6*s)
		m.LineTo(x+4*s, y+9.5*s)
		p.StrokePath(&m, 1.5, col)
		var dots ui.Path
		dots.Circle(x+10*s, y+3.2*s, 1.8*s)
		dots.Circle(x+4*s, y+12*s, 1.8*s)
		p.FillPath(&dots, col)
	}
}
