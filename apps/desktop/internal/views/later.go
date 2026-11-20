package views

// D382: 晚点再问我 / Ask me later on an ask, as on the phone (apps/web/src/
// later.tsx): a quiet text action opens the times (今晚 20:00 · 明早 8:00 ·
// 下周一 8:00 · 选个时间…), each with its own time, and one line that nothing
// happens before then. Put off, the card says when it asks again, with 现在就定
// / Decide now; back at its time, it says so once above its buttons. The
// times are laterChoices, a port of packages/protocol/src/later.ts, checked
// on the same cases (packages/protocol/fixtures/later.json).

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	laterMax       = 30 * 24 * time.Hour
	laterMin       = 5 * time.Minute
	tonightHour    = 20
	morningDefault = "08:00"
)

type laterChoice struct {
	Key   string // tonight | morning | monday
	At    time.Time
	Today bool // morning: it is still this morning
}

type laterPick struct {
	day   int
	clock string
}

func hm(s string) (int, int) {
	m := regexp.MustCompile(`^(\d{1,2}):(\d{2})$`).FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 8, 0
	}
	h, _ := strconv.Atoi(m[1])
	mi, _ := strconv.Atoi(m[2])
	return min(23, h), min(59, mi)
}

// laterChoices: 今晚 20:00 while it is before 19:00; the next morning (the end
// of quiet hours, else 08:00), at least half an hour off; next Monday's
// morning unless that is the next morning already.
func laterChoices(now time.Time, morning string) []laterChoice {
	var out []laterChoice
	mh, mm := hm(morning)
	day := func(t time.Time, add, h, m int) time.Time {
		return time.Date(t.Year(), t.Month(), t.Day()+add, h, m, 0, 0, t.Location())
	}
	if now.Hour() < tonightHour-1 {
		out = append(out, laterChoice{Key: "tonight", At: day(now, 0, tonightHour, 0)})
	}
	m := day(now, 0, mh, mm)
	today := m.Sub(now) >= 30*time.Minute
	if !today {
		m = day(now, 1, mh, mm)
	}
	out = append(out, laterChoice{Key: "morning", At: m, Today: today})
	ahead := (8 - int(now.Weekday())) % 7
	if ahead == 0 {
		ahead = 7
	}
	if mon := day(now, ahead, mh, mm); !mon.Equal(m) {
		out = append(out, laterChoice{Key: "monday", At: mon})
	}
	return out
}

// pickedTime is a picked day (0 today, 1 tomorrow, 2 the day after) and a
// clock ("9:00", "21:30", "9"), or false when the clock doesn't read.
func pickedTime(now time.Time, day int, clock string) (time.Time, bool) {
	m := regexp.MustCompile(`^\s*(\d{1,2})(?:[:：.](\d{2}))?\s*$`).FindStringSubmatch(clock)
	if m == nil {
		return time.Time{}, false
	}
	h, _ := strconv.Atoi(m[1])
	mi := 0
	if m[2] != "" {
		mi, _ = strconv.Atoi(m[2])
	}
	if h > 23 || mi > 59 {
		return time.Time{}, false
	}
	return time.Date(now.Year(), now.Month(), now.Day()+max(0, min(2, day)), h, mi, 0, 0, now.Location()), true
}

// laterRefusal: "" when the time can be used, else past | far.
func laterRefusal(until, now time.Time) string {
	switch {
	case until.Sub(now) < laterMin:
		return "past"
	case until.Sub(now) > laterMax:
		return "far"
	}
	return ""
}

// laterable: not where the moment itself is the point (a live turn on a
// phone, a computer or a site, a key, a call, a computer to wait for), nor a
// find's step, a one-off "keep as a rule?" or a stranger's first message.
func laterable(d *store.DecisionState) bool {
	return d.FindID == "" && d.Key == nil && d.SignIn == nil && d.Pay == nil && d.Fill == nil && d.Phone == nil &&
		d.Computer == nil && d.Handset == nil && d.Where == nil && d.Closing == nil && d.Call == nil && d.Saying == nil && d.Sender == nil
}

func (a *App) laterOffered(d *store.DecisionState) bool {
	return d != nil && d.Later == "" && laterable(d)
}

// Later puts an ask off to a time, or brings it back now (nil).
func (a *App) Later(id string, until *time.Time) {
	if d := a.S.Decisions[id]; d != nil {
		if until != nil {
			d.Later, d.BackAt = until.UTC().Format(time.RFC3339), ""
		} else {
			d.Later = ""
		}
	}
	if a.laterOpen != nil {
		delete(a.laterOpen, id)
	}
	a.replyOpen[id] = false
	a.markRead()
	var u *string
	if until != nil {
		s := until.UTC().Format(time.RFC3339)
		u = &s
	}
	a.send(protocol.Later{T: "later", DecisionID: id, Until: u})
}

func (a *App) laterMorning() string {
	if s := a.S.Settings; s != nil && s.Quiet != nil && s.Quiet.End != "" {
		return s.Quiet.End
	}
	return morningDefault
}

func (a *App) laterWords(ch laterChoice) string {
	at := i18n.Clock(ch.At)
	switch ch.Key {
	case "tonight":
		return a.L.T("later.tonight", at)
	case "morning":
		if ch.Today {
			return a.L.T("later.morning.today", at)
		}
		return a.L.T("later.morning", at)
	}
	return a.L.T("later.monday", at)
}

// laterToggle is the quiet text action that opens the times.
func (a *App) laterToggle(c *ui.Context, d *store.DecisionState, about string, height float32, bg ui.Color) {
	if !a.laterOffered(d) {
		return
	}
	if a.laterOpen == nil {
		a.laterOpen = map[string]bool{}
	}
	if a.buttonFor(c, a.L.T("later.ask"), about, btnText, height, bg) {
		a.laterOpen[d.DecisionID] = !a.laterOpen[d.DecisionID]
		a.replyOpen[d.DecisionID] = false
	}
}

// laterTimes shows the times while the action is open.
func (a *App) laterTimes(c *ui.Context, d *store.DecisionState, bg ui.Color) {
	if !a.laterOffered(d) || !a.laterOpen[d.DecisionID] {
		return
	}
	if a.laterPick == nil {
		a.laterPick = map[string]*laterPick{}
	}
	t := a.T
	now := a.Now()
	about := a.decisionAbout(d)
	pick := a.laterPick[d.DecisionID]
	bad := ""
	var at time.Time
	ok := false
	if pick != nil && strings.TrimSpace(pick.clock) != "" {
		if at, ok = pickedTime(now, pick.day, pick.clock); !ok {
			bad = "past"
		} else {
			bad = laterRefusal(at, now)
		}
	}
	ui.Column(c.Key("later:" + d.DecisionID)).Gap(t.S2).Children(func() {
		ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
			for _, ch := range laterChoices(now, a.laterMorning()) {
				if a.buttonFor(c, a.laterWords(ch), about, btnSecondary, t.ControlSM, bg) {
					at := ch.At
					a.Later(d.DecisionID, &at)
				}
			}
			if pick == nil && a.buttonFor(c, a.L.T("later.pick"), about, btnText, t.ControlSM, bg) {
				day := 0
				if now.Hour() >= tonightHour {
					day = 1
				}
				a.laterPick[d.DecisionID] = &laterPick{day: day}
			}
		})
		if pick != nil {
			ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
				if i := a.choices(c, "later-day:"+d.DecisionID, a.L.T("later.pick"), []string{a.L.T("newtask.day.0"), a.L.T("newtask.day.1"), a.L.T("newtask.day.2")}, pick.day); i >= 0 {
					pick.day = i
				}
				ui.TextInput(c.Key("later-clock:"+d.DecisionID), &pick.clock).Placeholder("9:00").Label(a.L.T("newtask.at")).
					Height(t.ControlSM).Width(84).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
					FontSize(t.MD).FontFeatures("tnum").TextAlign(ui.Center)
				if a.buttonFor(c, a.L.T("later.then"), about, btnSecondary, t.ControlSM, bg) && ok && bad == "" {
					a.Later(d.DecisionID, &at)
				}
			})
		}
		note := a.L.T("later.note")
		switch bad {
		case "past":
			note = a.L.T("later.bad.past")
		case "far":
			note = a.L.T("later.bad.far")
		}
		uiText(c, note).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.45)
	})
}

// laterAway is a put-off ask: when it asks again, and Decide now.
func (a *App) laterAway(c *ui.Context, d *store.DecisionState, bg ui.Color) bool {
	if d == nil || d.Later == "" {
		return false
	}
	t := a.T
	at, err := time.Parse(time.RFC3339, d.Later)
	when := d.Later
	if err == nil {
		when = a.when(at.Local())
	}
	ui.Row(c.Key("later-away:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Role(ui.RoleStatus).Children(func() {
		uiText(c, a.tp("later.away", when)).FontSize(t.SM).TextColor(t.InkMuted)
		if a.buttonFor(c, a.L.T("later.now"), a.decisionAbout(d), btnText, t.ControlSM, bg) {
			a.Later(d.DecisionID, nil)
		}
	})
	return true
}

// laterBack says once, above its buttons, that an ask is back at its time.
func (a *App) laterBack(c *ui.Context, d *store.DecisionState) {
	if d == nil || d.BackAt == "" || d.Later != "" {
		return
	}
	t := a.T
	uiText(c, a.L.T("later.back")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink)
}

// laterRow is a put-off ask's line on On hand: when it asks again, and what.
func (a *App) laterRow(task *store.Task) (string, bool) {
	d := a.S.PendingDecision(task.ID)
	if d == nil || d.Later == "" {
		return "", false
	}
	at, err := time.Parse(time.RFC3339, d.Later)
	if err != nil {
		return "", false
	}
	return a.L.T("later.row", a.soon(at.Local()), a.questionOf(d)), true
}
